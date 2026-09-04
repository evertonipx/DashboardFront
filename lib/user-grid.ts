"use client";

import { apiFetch } from "@/lib/api";
import {
  acknowledgeUserGridLocalMutation,
  clearUserGridKnownDeletion,
  markUserGridKnownDeletion,
  removeUserGridPreference,
  readUserGridLocalMutations,
  USER_GRID_LOCAL_CHANGE_EVENT,
  type UserGridLocalChangeDetail,
  writeUserGridPreference,
} from "@/lib/user-grid-local";

export { removeUserGridPreference, writeUserGridPreference };

type UserGridResponse = {
  grid: unknown;
  updated_at?: string | null;
};

type UserGridHydrationOptions = {
  expectedAccessToken?: string;
  shouldApply?: () => boolean;
};

type UserGridValueEntry = {
  updatedAt: string;
  value: string;
};

type UserGridTombstone = {
  deleted: true;
  updatedAt: string;
};

type UserGridEntry = UserGridValueEntry | UserGridTombstone;

type UserGridDocument = Record<string, unknown> & {
  entries: Record<string, unknown>;
  format: "ipxdata-user-grid";
  legacyGrid?: unknown;
  updatedAt: string;
  version: 2;
};

type NormalizedGrid = {
  document: UserGridDocument;
  needsUpgrade: boolean;
  supported: boolean;
};

type PendingChange = {
  entry: UserGridEntry;
  localMutationUpdatedAt?: string;
  revision: number;
};

type AppliedStorageChange = {
  key: string;
  newValue: string | null;
  oldValue: string | null;
};

export type UserGridSyncStatus =
  "idle" | "loading" | "ready" | "saving" | "saved" | "error";

export type UserGridSyncStatusDetail = {
  status: UserGridSyncStatus;
  userId: string | null;
};

export const USER_GRID_HYDRATED_EVENT = "ipxdata:user-grid-hydrated";
export const USER_GRID_SYNC_STATUS_EVENT = "ipxdata:user-grid-sync-status";

const GRID_FORMAT = "ipxdata-user-grid";
const GRID_VERSION = 2;
// Managed writers dispatch USER_GRID_LOCAL_CHANGE_EVENT immediately. This
// slow scan is only a compatibility net for legacy direct localStorage writes;
// remote reconciliation is event-driven (focus, visibility and online) so an
// idle dashboard does not poll the preferences endpoint forever.
const LOCAL_SCAN_INTERVAL_MS = 60_000;
const SAVE_DEBOUNCE_MS = 600;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const SAVE_RETRY_DELAY_MS = 5_000;

// Only explicitly personal namespaces may originate in this browser. Unknown
// server entries remain opaque during a read/merge/write cycle, but they are
// never applied to localStorage. Credentials, JWTs, permissions and tenant
// operational state therefore cannot enter the preference synchronization.
const MANAGED_GRID_BASE_KEYS = new Set([
  "ipxdata.card-views.v1",
  "ipxdata.counting-report-period.v1",
  "ipxdata.counting-report-view-settings.v1",
  "ipxdata.dashboard-focus.v1",
  "ipxdata.dashboard-module.v1",
  "ipxdata.demographics-range.v1",
  "ipxdata.legacy-dashboard-default-migration.v1.live",
  "ipxdata.legacy-dashboard-default-migration.v2",
  "ipxdata.live-dashboard-settings.v1",
  "ipxdata.live-operational-settings.v1",
  "ipxdata.occupancy-analysis-range.v1",
  "ipxdata.occupancy-custom-widgets.v1",
  "ipxdata.occupancy-dashboard-settings.v1",
  "ipxdata.occupancy-widget-settings.v1",
  "ipxdata.period-analysis-settings.v1",
  "ipxdata.period-analysis-widgets.schema.v5",
  "ipxdata.period-analysis-widgets.v1",
  "ipxdata.realtime-custom-widgets.v1",
  "ipxdata.report-custom-widgets.v1",
  "ipxdata.saved-live-views.v1",
  "ipxdata.sidebar-collapsed.v1",
  "ipxdata-theme",
  "ipxdata.view-link-references.v1",
  "ipxdata.video-walls.v1",
]);

const MANAGED_GRID_BASE_PATTERNS = [
  /^ipxdata\.widget-view-presets\.v1\.(?:analysis|demographics|live|occupancy(?:-(?:analysis|live|reports))?|reports)$/,
  /^ipxdata\.widget-view-preset-applied\.v1\.(?:analysis|demographics|live|occupancy(?:-(?:analysis|live|reports))?|reports)$/,
  /^ipxdata\.live-custom-.+\.scenario-comparison\.v1$/,
  /^ipxdata\.reports(?:-custom-.+)?\.scenario-comparison\.v1$/,
];

let activeUserId = "";
let activeDocument: UserGridDocument | null = null;
let activeHydrationOptions: UserGridHydrationOptions = {};
let hasSafeRead = false;
let hydrated = false;
let needsRemoteRepair = false;
let generation = 0;
let localRevision = 0;
let lastEntryTimestamp = 0;
let retryAttempt = 0;
let saveTimer: number | null = null;
let retryTimer: number | null = null;
let flushPromise: Promise<boolean> | null = null;
let reconciliationPromise: Promise<boolean> | null = null;
let activeListenerCleanup: (() => void) | null = null;
let localSnapshot = new Map<string, string>();
const pendingChanges = new Map<string, PendingChange>();

export async function hydrateUserGridFromServer(
  userId: string,
  options: UserGridHydrationOptions = {},
) {
  const cleanUserId = userId.trim();
  if (!cleanUserId || typeof window === "undefined") return false;
  if (!canApply(options)) return false;

  const sameLineage =
    activeUserId === cleanUserId &&
    activeHydrationOptions.expectedAccessToken === options.expectedAccessToken;
  if (hydrated && sameLineage) {
    activeHydrationOptions = options;
    void reconcileRemote();
    if (pendingChanges.size) scheduleFlush();
    return true;
  }

  const currentGeneration = ++generation;
  if (!sameLineage) {
    clearSaveTimer();
    clearRetryTimer();
    activeDocument = null;
    hasSafeRead = false;
    hydrated = false;
    needsRemoteRepair = false;
    pendingChanges.clear();
    lastEntryTimestamp = 0;
    localSnapshot = new Map(Object.entries(collectManagedEntries(cleanUserId)));
    retryAttempt = 0;
  }
  activeUserId = cleanUserId;
  activeHydrationOptions = options;
  captureDurableLocalChanges(cleanUserId);
  emitStatus("loading");

  try {
    const response = await readRemoteGrid(
      currentGeneration,
      cleanUserId,
      options,
    );
    if (!response) return false;
    const parsed = normalizeGridDocument(response.grid);
    if (!parsed.supported) {
      // A document created by a newer client cannot be safely rewritten by
      // this version. Keep local preferences usable without issuing a PUT.
      activeDocument = null;
      hasSafeRead = false;
      hydrated = false;
      emitStatus("error");
      return false;
    }

    hasSafeRead = true;
    retryAttempt = 0;
    clearRetryTimer();
    const localEntries = collectManagedEntries(cleanUserId);
    captureSnapshotDelta(localEntries, cleanUserId);
    captureDurableLocalChanges(cleanUserId);
    const prepared = prepareHydratedDocument(
      parsed.document,
      localEntries,
      cleanUserId,
    );
    activeDocument = applyPendingToDocument(prepared.document);
    needsRemoteRepair = parsed.needsUpgrade || prepared.changed;
    const appliedChanges = applyRemoteEntries(
      activeDocument.entries,
      cleanUserId,
      pendingChanges,
    );
    localSnapshot = new Map(Object.entries(collectManagedEntries(cleanUserId)));
    emitSyntheticStorageEvents(appliedChanges);
    hydrated = true;
    emitHydrated();
    emitStatus("ready");

    if (needsRemoteRepair || pendingChanges.size) {
      await flushPendingChanges({ forceWrite: true }).catch(() => false);
    }
    return isCurrentContext(currentGeneration, cleanUserId, options);
  } catch {
    if (!isCurrentContext(currentGeneration, cleanUserId, options)) {
      return false;
    }
    hasSafeRead = false;
    hydrated = false;
    activeDocument = null;
    emitStatus("error");
    scheduleHydrationRetry();
    return false;
  }
}

export function startUserGridSync(userId: string) {
  if (typeof window === "undefined") return () => undefined;
  const cleanUserId = userId.trim();
  if (!cleanUserId) return () => undefined;

  activeListenerCleanup?.();
  if (!activeUserId) {
    activeUserId = cleanUserId;
    localSnapshot = new Map(Object.entries(collectManagedEntries(cleanUserId)));
  }

  const scan = () => captureLocalChanges(cleanUserId);
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || isManagedGridKey(event.key, cleanUserId)) scan();
  };
  const handleLocalChange = (event: Event) => {
    const key = (event as CustomEvent<UserGridLocalChangeDetail>).detail?.key;
    if (key && isManagedGridKey(key, cleanUserId)) scan();
  };
  const handleVisibility = () => {
    scan();
    if (document.visibilityState === "hidden") {
      scheduleFlush(0);
      return;
    }
    if (document.visibilityState === "visible") {
      void retryHydrationOrReconcile();
    }
  };
  const handleFocus = () => {
    scan();
    void retryHydrationOrReconcile();
  };
  const handleOnline = () => {
    scan();
    void retryHydrationOrReconcile();
  };

  const interval = window.setInterval(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }
    scan();
  }, LOCAL_SCAN_INTERVAL_MS);
  window.addEventListener("storage", handleStorage);
  window.addEventListener(USER_GRID_LOCAL_CHANGE_EVENT, handleLocalChange);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("online", handleOnline);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibility);
  }
  scan();

  const cleanup = () => {
    window.clearInterval(interval);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(USER_GRID_LOCAL_CHANGE_EVENT, handleLocalChange);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("online", handleOnline);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibility);
    }
    if (activeListenerCleanup === cleanup) activeListenerCleanup = null;
  };
  activeListenerCleanup = cleanup;
  return cleanup;
}

export function clearUserGridSync() {
  generation += 1;
  activeListenerCleanup?.();
  clearSaveTimer();
  clearRetryTimer();
  activeUserId = "";
  activeDocument = null;
  activeHydrationOptions = {};
  hasSafeRead = false;
  hydrated = false;
  needsRemoteRepair = false;
  retryAttempt = 0;
  flushPromise = null;
  reconciliationPromise = null;
  lastEntryTimestamp = 0;
  localSnapshot = new Map();
  pendingChanges.clear();
  emitStatus("idle");
}

export function requestUserGridSync() {
  if (!activeUserId || !canApply(activeHydrationOptions)) return;
  captureLocalChanges(activeUserId);
  if (!hydrated) scheduleHydrationRetry(0);
}

export async function flushUserGridSync() {
  if (!activeUserId || !canApply(activeHydrationOptions)) return false;
  captureLocalChanges(activeUserId);
  clearSaveTimer();
  if (!hasSafeRead || !hydrated) {
    scheduleHydrationRetry(0);
    return false;
  }
  if (flushPromise) await flushPromise;
  if (pendingChanges.size || needsRemoteRepair) await flushPendingChanges();
  return pendingChanges.size === 0 && !needsRemoteRepair;
}

function captureLocalChanges(userId: string) {
  if (activeUserId !== userId || !canApply(activeHydrationOptions)) return;
  captureSnapshotDelta(collectManagedEntries(userId), userId);
  captureDurableLocalChanges(userId);
  if (pendingChanges.size) {
    if (hydrated && hasSafeRead) scheduleFlush();
    else scheduleHydrationRetry();
  }
}

function captureDurableLocalChanges(userId: string) {
  if (typeof window === "undefined" || activeUserId !== userId) return;
  const localEntries = collectManagedEntries(userId);
  readUserGridLocalMutations().forEach((mutation) => {
    if (!isManagedGridKey(mutation.key, userId)) return;
    const current = pendingChanges.get(mutation.key);
    if (current?.localMutationUpdatedAt === mutation.updatedAt) return;
    const value = localEntries[mutation.key];
    const deleted = mutation.deleted || value === undefined;
    pendingChanges.set(mutation.key, {
      entry: deleted
        ? { deleted: true, updatedAt: mutation.updatedAt }
        : { updatedAt: mutation.updatedAt, value },
      localMutationUpdatedAt: mutation.updatedAt,
      revision: ++localRevision,
    });
  });
}

function captureSnapshotDelta(
  currentEntries: Record<string, string>,
  userId: string,
) {
  if (activeUserId !== userId) return;
  const current = new Map(Object.entries(currentEntries));
  const keys = new Set([...localSnapshot.keys(), ...current.keys()]);
  keys.forEach((key) => {
    const previousValue = localSnapshot.get(key);
    const currentValue = current.get(key);
    if (previousValue === currentValue || !isManagedGridKey(key, userId))
      return;
    pendingChanges.set(key, {
      entry: createEntry(currentValue ?? null),
      revision: ++localRevision,
    });
  });
  localSnapshot = current;
}

function scheduleFlush(delay = SAVE_DEBOUNCE_MS) {
  if (
    typeof window === "undefined" ||
    !hydrated ||
    !hasSafeRead ||
    (!pendingChanges.size && !needsRemoteRepair) ||
    !canApply(activeHydrationOptions)
  ) {
    return;
  }
  clearSaveTimer();
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void flushPendingChanges();
  }, delay);
}

async function flushPendingChanges(options: { forceWrite?: boolean } = {}) {
  if (
    !activeUserId ||
    !hydrated ||
    !hasSafeRead ||
    !canApply(activeHydrationOptions) ||
    (!pendingChanges.size && !needsRemoteRepair && !options.forceWrite)
  ) {
    return false;
  }
  if (reconciliationPromise) {
    await reconciliationPromise;
    if (
      !activeUserId ||
      !hydrated ||
      !hasSafeRead ||
      !canApply(activeHydrationOptions)
    ) {
      return false;
    }
  }
  if (flushPromise) return flushPromise;

  const currentGeneration = generation;
  const userId = activeUserId;
  const hydrationOptions = activeHydrationOptions;
  const capturedChanges = new Map(pendingChanges);
  const operation = persistWithFreshBase(
    currentGeneration,
    userId,
    hydrationOptions,
    capturedChanges,
  )
    .then((persisted) => {
      if (!persisted) return false;
      capturedChanges.forEach((change, key) => {
        if (pendingChanges.get(key)?.revision === change.revision) {
          const acknowledged = change.localMutationUpdatedAt
            ? acknowledgeUserGridLocalMutation(
                key,
                change.localMutationUpdatedAt,
              )
            : true;
          if (acknowledged) pendingChanges.delete(key);
        }
      });
      emitStatus("saved");
      return true;
    })
    .catch(() => {
      if (isCurrentContext(currentGeneration, userId, hydrationOptions)) {
        emitStatus("error");
        scheduleFlush(SAVE_RETRY_DELAY_MS);
      }
      return false;
    })
    .finally(() => {
      if (flushPromise === operation) flushPromise = null;
      if (
        (pendingChanges.size || needsRemoteRepair) &&
        isCurrentContext(currentGeneration, userId, hydrationOptions)
      ) {
        scheduleFlush();
      }
    });
  flushPromise = operation;
  return operation;
}

async function persistWithFreshBase(
  currentGeneration: number,
  userId: string,
  hydrationOptions: UserGridHydrationOptions,
  changes: Map<string, PendingChange>,
) {
  if (!isCurrentContext(currentGeneration, userId, hydrationOptions)) {
    return false;
  }
  emitStatus("saving");

  // The endpoint replaces one opaque JSON document. A fresh GET immediately
  // before every PUT is therefore the only safe merge base available without
  // ETags/PATCH support.
  const response = await readRemoteGrid(
    currentGeneration,
    userId,
    hydrationOptions,
  );
  if (!response) return false;
  const remote = normalizeGridDocument(response.grid);
  if (!remote.supported) throw new Error("unsupported user-grid version");

  const preparedRemote = prepareHydratedDocument(
    remote.document,
    collectManagedEntries(userId),
    userId,
  ).document;
  let merged = mergeDocuments(preparedRemote, activeDocument);
  rebasePendingChanges(changes, merged);
  merged = applyChangesToDocument(merged, changes);
  merged.updatedAt = nextTimestamp();

  if (!isCurrentContext(currentGeneration, userId, hydrationOptions)) {
    return false;
  }
  await apiFetch<UserGridResponse>("/users/me/grid", {
    method: "PUT",
    body: { grid: cloneDocument(merged) },
    expectedAccessToken: hydrationOptions.expectedAccessToken,
  });
  if (!isCurrentContext(currentGeneration, userId, hydrationOptions)) {
    return false;
  }

  // Confirm what the server actually retained. This detects a competing
  // whole-document write that landed around our PUT and schedules convergence.
  const confirmationResponse = await readRemoteGrid(
    currentGeneration,
    userId,
    hydrationOptions,
  );
  if (!confirmationResponse) return false;
  const confirmation = normalizeGridDocument(confirmationResponse.grid);
  if (!confirmation.supported) {
    throw new Error("unsupported user-grid version after PUT");
  }
  const preparedConfirmation = prepareHydratedDocument(
    confirmation.document,
    collectManagedEntries(userId),
    userId,
  );
  const savedDocument = mergeDocuments(preparedConfirmation.document, merged);
  const capturedChangesConfirmed = Array.from(changes).every(([key, change]) =>
    entriesEquivalent(preparedConfirmation.document.entries[key], change.entry),
  );
  needsRemoteRepair = Boolean(
    confirmation.needsUpgrade ||
    preparedConfirmation.changed ||
    !documentEntriesEqual(savedDocument, preparedConfirmation.document),
  );
  activeDocument = savedDocument;
  const appliedChanges = applyRemoteEntries(
    savedDocument.entries,
    userId,
    pendingChanges,
  );
  localSnapshot = new Map(Object.entries(collectManagedEntries(userId)));
  emitSyntheticStorageEvents(appliedChanges);
  return capturedChangesConfirmed;
}

async function retryHydrationOrReconcile() {
  if (!activeUserId || !canApply(activeHydrationOptions)) return false;
  clearRetryTimer();
  if (!hydrated || !hasSafeRead) {
    return hydrateUserGridFromServer(activeUserId, activeHydrationOptions);
  }
  return reconcileRemote();
}

async function reconcileRemote() {
  if (
    !activeUserId ||
    !hydrated ||
    !hasSafeRead ||
    !canApply(activeHydrationOptions)
  ) {
    return false;
  }
  if (reconciliationPromise) return reconciliationPromise;
  if (flushPromise) {
    await flushPromise;
    if (
      !activeUserId ||
      !hydrated ||
      !hasSafeRead ||
      !canApply(activeHydrationOptions)
    ) {
      return false;
    }
  }

  const currentGeneration = generation;
  const userId = activeUserId;
  const hydrationOptions = activeHydrationOptions;
  const operation = (async () => {
    try {
      captureLocalChanges(userId);
      const response = await readRemoteGrid(
        currentGeneration,
        userId,
        hydrationOptions,
      );
      if (!response) return false;
      const remote = normalizeGridDocument(response.grid);
      if (!remote.supported) return false;
      const prepared = prepareHydratedDocument(
        remote.document,
        collectManagedEntries(userId),
        userId,
      );
      const mergedDocument = mergeDocuments(prepared.document, activeDocument);
      needsRemoteRepair = Boolean(
        needsRemoteRepair ||
        remote.needsUpgrade ||
        prepared.changed ||
        !documentEntriesEqual(mergedDocument, prepared.document),
      );
      const reconciledDocument = applyPendingToDocument(mergedDocument);
      activeDocument = reconciledDocument;
      const appliedChanges = applyRemoteEntries(
        reconciledDocument.entries,
        userId,
        pendingChanges,
      );
      localSnapshot = new Map(Object.entries(collectManagedEntries(userId)));
      emitSyntheticStorageEvents(appliedChanges);
      emitHydrated();
      emitStatus("ready");
      if (pendingChanges.size || needsRemoteRepair) scheduleFlush();
      return true;
    } catch {
      if (isCurrentContext(currentGeneration, userId, hydrationOptions)) {
        emitStatus("error");
      }
      return false;
    }
  })().finally(() => {
    if (reconciliationPromise === operation) reconciliationPromise = null;
  });
  reconciliationPromise = operation;
  return operation;
}

function scheduleHydrationRetry(delay?: number) {
  if (
    typeof window === "undefined" ||
    !activeUserId ||
    hydrated ||
    !canApply(activeHydrationOptions)
  ) {
    return;
  }
  clearRetryTimer();
  const retryDelay =
    delay ??
    Math.min(INITIAL_RETRY_DELAY_MS * 2 ** retryAttempt, MAX_RETRY_DELAY_MS);
  retryAttempt += 1;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void hydrateUserGridFromServer(activeUserId, activeHydrationOptions);
  }, retryDelay);
}

async function readRemoteGrid(
  currentGeneration: number,
  userId: string,
  options: UserGridHydrationOptions,
) {
  const response = await apiFetch<UserGridResponse>("/users/me/grid", {
    expectedAccessToken: options.expectedAccessToken,
  });
  return isCurrentContext(currentGeneration, userId, options) ? response : null;
}

function prepareHydratedDocument(
  document: UserGridDocument,
  localManagedEntries: Record<string, string>,
  userId: string,
): { changed: boolean; document: UserGridDocument } {
  let changed = false;
  const migratedEntries = { ...document.entries };
  const quarantinedEntries = isRecord(document.quarantinedEntries)
    ? { ...document.quarantinedEntries }
    : {};

  Object.entries(document.entries).forEach(([key, storedEntry]) => {
    if (!isManagedGridKey(key, userId) || asUserGridEntry(storedEntry)) return;
    quarantinedEntries[key] = cloneUnknown(storedEntry);
    const localValue = localManagedEntries[key];
    migratedEntries[key] = createEntry(
      localValue ?? (typeof storedEntry === "string" ? storedEntry : null),
    );
    changed = true;
  });

  Object.entries(document.entries).forEach(([key, storedEntry]) => {
    const legacyScope = legacyManagedGridScope(key);
    if (!legacyScope) return;
    const migratedKey = [
      legacyScope.baseKey,
      `company.${encodeStorageSegment(legacyScope.companyId)}`,
      `user.${encodeStorageSegment(userId)}`,
    ].join(".");
    if (
      Object.prototype.hasOwnProperty.call(migratedEntries, migratedKey) ||
      Object.prototype.hasOwnProperty.call(localManagedEntries, migratedKey)
    ) {
      return;
    }
    const normalizedLegacyEntry = asUserGridEntry(storedEntry);
    migratedEntries[migratedKey] = normalizedLegacyEntry
      ? cloneUnknown(normalizedLegacyEntry)
      : createEntry(typeof storedEntry === "string" ? storedEntry : null);
    changed = true;
  });

  Object.entries(localManagedEntries).forEach(([key, value]) => {
    if (Object.prototype.hasOwnProperty.call(migratedEntries, key)) return;
    migratedEntries[key] = createEntry(value);
    changed = true;
  });
  return {
    changed,
    document: {
      ...document,
      ...(Object.keys(quarantinedEntries).length
        ? { quarantinedEntries: sortEntries(quarantinedEntries) }
        : {}),
      entries: sortEntries(migratedEntries),
    },
  };
}

function applyPendingToDocument(document: UserGridDocument) {
  return applyChangesToDocument(document, pendingChanges);
}

function applyChangesToDocument(
  document: UserGridDocument,
  changes: Map<string, PendingChange>,
): UserGridDocument {
  const entries = { ...document.entries };
  changes.forEach(({ entry }, key) => {
    entries[key] = cloneUnknown(entry);
  });
  return {
    ...document,
    entries: sortEntries(entries),
    format: GRID_FORMAT,
    updatedAt: changes.size ? nextTimestamp() : document.updatedAt,
    version: GRID_VERSION,
  };
}

function rebasePendingChanges(
  changes: Map<string, PendingChange>,
  base: UserGridDocument,
) {
  changes.forEach((change, key) => {
    const baseEntry = asUserGridEntry(base.entries[key]);
    if (
      !baseEntry ||
      compareTimestamp(change.entry.updatedAt, baseEntry.updatedAt) > 0
    ) {
      return;
    }
    const entry = withEntryTimestamp(
      change.entry,
      nextTimestampAfter(baseEntry.updatedAt),
    );
    const rebased = { ...change, entry };
    changes.set(key, rebased);
    if (pendingChanges.get(key)?.revision === change.revision) {
      pendingChanges.set(key, rebased);
    }
  });
}

function withEntryTimestamp(entry: UserGridEntry, updatedAt: string) {
  return isTombstone(entry)
    ? ({ deleted: true, updatedAt } satisfies UserGridTombstone)
    : ({ updatedAt, value: entry.value } satisfies UserGridValueEntry);
}

function mergeDocuments(
  remote: UserGridDocument,
  previous: UserGridDocument | null,
): UserGridDocument {
  if (!previous) return cloneDocument(remote);
  const entries: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(previous.entries),
    ...Object.keys(remote.entries),
  ]);
  keys.forEach((key) => {
    const hasRemote = Object.prototype.hasOwnProperty.call(remote.entries, key);
    const hasPrevious = Object.prototype.hasOwnProperty.call(
      previous.entries,
      key,
    );
    if (!hasRemote) {
      entries[key] = cloneUnknown(previous.entries[key]);
      return;
    }
    if (!hasPrevious) {
      entries[key] = cloneUnknown(remote.entries[key]);
      return;
    }
    entries[key] = cloneUnknown(
      chooseNewerEntry(remote.entries[key], previous.entries[key]),
    );
  });
  return {
    ...previous,
    ...remote,
    entries: sortEntries(entries),
    format: GRID_FORMAT,
    updatedAt: laterTimestamp(remote.updatedAt, previous.updatedAt),
    version: GRID_VERSION,
  };
}

function chooseNewerEntry(remote: unknown, previous: unknown) {
  const remoteEntry = asUserGridEntry(remote);
  const previousEntry = asUserGridEntry(previous);
  if (!remoteEntry || !previousEntry) return remote;
  const comparison = compareTimestamp(
    remoteEntry.updatedAt,
    previousEntry.updatedAt,
  );
  if (comparison > 0) return remote;
  if (comparison < 0) return previous;
  // A tombstone wins a timestamp tie, preventing an equally old value from
  // resurrecting a deletion while still allowing a newer explicit write.
  if (isTombstone(remoteEntry) !== isTombstone(previousEntry)) {
    return isTombstone(remoteEntry) ? remote : previous;
  }
  // Equal timestamps must converge identically regardless of which document
  // happens to be called "remote" on a device.
  return stableSerialize(remote) >= stableSerialize(previous)
    ? remote
    : previous;
}

function documentEntriesEqual(left: UserGridDocument, right: UserGridDocument) {
  const leftKeys = Object.keys(left.entries);
  const rightKeys = Object.keys(right.entries);
  return Boolean(
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      entriesEquivalent(left.entries[key], right.entries[key]),
    ),
  );
}

function entriesEquivalent(left: unknown, right: unknown) {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function applyRemoteEntries(
  entries: Record<string, unknown>,
  userId: string,
  pending: Map<string, PendingChange>,
) {
  const appliedChanges: AppliedStorageChange[] = [];
  if (typeof window === "undefined") return appliedChanges;
  Object.entries(entries).forEach(([key, storedEntry]) => {
    if (!isManagedGridKey(key, userId)) return;
    if (pending.has(key)) return;
    const entry = asUserGridEntry(storedEntry);
    if (!entry) return;
    const newValue = isTombstone(entry) ? null : entry.value;
    try {
      const oldValue = window.localStorage.getItem(key);
      if (newValue === null) {
        markUserGridKnownDeletion(key);
        if (oldValue !== null) window.localStorage.removeItem(key);
      } else {
        clearUserGridKnownDeletion(key);
        if (oldValue !== newValue) window.localStorage.setItem(key, newValue);
      }
      if (oldValue !== newValue) {
        appliedChanges.push({ key, newValue, oldValue });
      }
    } catch {
      // A blocked browser cache must not abort hydration of the other entries.
    }
  });
  return appliedChanges;
}

function emitSyntheticStorageEvents(changes: AppliedStorageChange[]) {
  if (typeof window === "undefined" || typeof StorageEvent !== "function") {
    return;
  }
  changes.forEach(({ key, newValue, oldValue }) => {
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue,
          oldValue,
          storageArea: window.localStorage,
          url: window.location?.href ?? "",
        }),
      );
    } catch {
      // USER_GRID_HYDRATED_EVENT remains the compatibility fallback.
    }
  });
}

function collectManagedEntries(userId: string) {
  const entries: Record<string, string> = {};
  if (typeof window === "undefined") return entries;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !isManagedGridKey(key, userId)) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  } catch {
    // The server document remains usable even when browser storage is blocked.
  }
  return Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function isManagedGridKey(key: string, userId: string) {
  const baseKey = managedGridBaseKey(key, userId);
  return Boolean(baseKey && isManagedGridBaseKey(baseKey));
}

function managedGridBaseKey(key: string, userId: string) {
  const encodedUserId = encodeStorageSegment(userId);
  if (!encodedUserId) return null;
  const userMarker = `.user.${encodedUserId}`;
  const markerIndex = key.indexOf(userMarker);
  if (markerIndex <= 0) return null;
  const trailingScope = key.slice(markerIndex + userMarker.length);
  if (trailingScope && !/^\.view\.[^.]+$/.test(trailingScope)) return null;

  const leadingScope = key.slice(0, markerIndex);
  const companyMarker = ".company.";
  const companyIndex = leadingScope.lastIndexOf(companyMarker);
  if (companyIndex < 0) return leadingScope;
  const encodedCompanyId = leadingScope.slice(
    companyIndex + companyMarker.length,
  );
  return encodedCompanyId && !encodedCompanyId.includes(".")
    ? leadingScope.slice(0, companyIndex)
    : null;
}

function legacyManagedGridScope(key: string) {
  if (key.includes(".user.") || key.includes(".view.")) return null;
  const companyMarker = ".company.";
  const companyMarkerIndex = key.lastIndexOf(companyMarker);
  if (companyMarkerIndex > 0) {
    const baseKey = key.slice(0, companyMarkerIndex);
    const encodedCompanyId = key.slice(
      companyMarkerIndex + companyMarker.length,
    );
    if (
      isManagedGridBaseKey(baseKey) &&
      encodedCompanyId &&
      !encodedCompanyId.includes(".")
    ) {
      const companyId = decodeStorageSegment(encodedCompanyId);
      return companyId ? { baseKey, companyId } : null;
    }
  }
  for (let separatorIndex = key.lastIndexOf("."); separatorIndex > 0;) {
    const baseKey = key.slice(0, separatorIndex);
    const companyId = key.slice(separatorIndex + 1);
    if (companyId && isManagedGridBaseKey(baseKey))
      return { baseKey, companyId };
    separatorIndex = key.lastIndexOf(".", separatorIndex - 1);
  }
  return null;
}

function isManagedGridBaseKey(baseKey: string) {
  return (
    MANAGED_GRID_BASE_KEYS.has(baseKey) ||
    MANAGED_GRID_BASE_PATTERNS.some((pattern) => pattern.test(baseKey))
  );
}

function normalizeGridDocument(value: unknown): NormalizedGrid {
  const decoded = decodePotentialByteArray(value);
  if (decoded !== value) return normalizeGridDocument(decoded);
  if (typeof value === "string") {
    try {
      return normalizeGridDocument(JSON.parse(value) as unknown);
    } catch {
      return {
        document: { ...createEmptyDocument(), legacyGrid: value },
        needsUpgrade: true,
        supported: true,
      };
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (
      record.format === GRID_FORMAT &&
      numericVersion(record.version) > GRID_VERSION
    ) {
      return {
        document: createEmptyDocument(),
        needsUpgrade: false,
        supported: false,
      };
    }
    if (
      record.format === GRID_FORMAT &&
      record.version === GRID_VERSION &&
      isRecord(record.entries)
    ) {
      return {
        document: {
          ...record,
          entries: sortEntries(record.entries),
          format: GRID_FORMAT,
          updatedAt: validTimestamp(record.updatedAt) ?? nextTimestamp(),
          version: GRID_VERSION,
        },
        needsUpgrade: false,
        supported: true,
      };
    }
    if (
      record.format === GRID_FORMAT &&
      record.version === 1 &&
      isRecord(record.entries)
    ) {
      const migratedAt = validTimestamp(record.updatedAt) ?? nextTimestamp();
      const entries = Object.fromEntries(
        Object.entries(record.entries).map(([key, entryValue]) => [
          key,
          typeof entryValue === "string"
            ? { updatedAt: migratedAt, value: entryValue }
            : cloneUnknown(entryValue),
        ]),
      );
      return {
        document: {
          ...record,
          entries: sortEntries(entries),
          format: GRID_FORMAT,
          updatedAt: migratedAt,
          version: GRID_VERSION,
        },
        needsUpgrade: true,
        supported: true,
      };
    }
  }

  return {
    document: {
      ...createEmptyDocument(),
      ...(value === null || value === undefined ? {} : { legacyGrid: value }),
    },
    needsUpgrade: true,
    supported: true,
  };
}

function decodePotentialByteArray(value: unknown) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    !value.every(
      (item) =>
        Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255,
    )
  ) {
    return value;
  }
  try {
    return JSON.parse(
      new TextDecoder().decode(Uint8Array.from(value as number[])),
    ) as unknown;
  } catch {
    return value;
  }
}

function createEmptyDocument(): UserGridDocument {
  return {
    entries: {},
    format: GRID_FORMAT,
    updatedAt: nextTimestamp(),
    version: GRID_VERSION,
  };
}

function createEntry(value: string | null): UserGridEntry {
  const updatedAt = nextTimestamp();
  return value === null ? { deleted: true, updatedAt } : { updatedAt, value };
}

function asUserGridEntry(value: unknown): UserGridEntry | null {
  if (!isRecord(value)) return null;
  const updatedAt = validTimestamp(value.updatedAt);
  if (!updatedAt) return null;
  if (value.deleted === true) return { deleted: true, updatedAt };
  return typeof value.value === "string"
    ? { updatedAt, value: value.value }
    : null;
}

function isTombstone(entry: UserGridEntry): entry is UserGridTombstone {
  return "deleted" in entry && entry.deleted === true;
}

function sortEntries(entries: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, cloneUnknown(value)]),
  );
}

function cloneDocument(document: UserGridDocument): UserGridDocument {
  return cloneUnknown(document) as UserGridDocument;
}

function cloneUnknown<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numericVersion(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function validTimestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return null;
  return value;
}

function compareTimestamp(left: string, right: string) {
  return Date.parse(left) - Date.parse(right);
}

function laterTimestamp(left: string, right: string) {
  return compareTimestamp(left, right) >= 0 ? left : right;
}

function nextTimestamp() {
  const next = Math.max(Date.now(), lastEntryTimestamp + 1);
  lastEntryTimestamp = next;
  return new Date(next).toISOString();
}

function nextTimestampAfter(timestamp: string) {
  const next = Math.max(
    Date.now(),
    lastEntryTimestamp + 1,
    Date.parse(timestamp) + 1,
  );
  lastEntryTimestamp = next;
  return new Date(next).toISOString();
}

function canApply(options: UserGridHydrationOptions) {
  return options.shouldApply?.() !== false;
}

function isCurrentContext(
  currentGeneration: number,
  userId: string,
  options: UserGridHydrationOptions,
) {
  return Boolean(
    currentGeneration === generation &&
    activeUserId === userId &&
    activeHydrationOptions.expectedAccessToken ===
      options.expectedAccessToken &&
    canApply(options) &&
    canApply(activeHydrationOptions),
  );
}

function emitHydrated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(USER_GRID_HYDRATED_EVENT, {
      detail: { userId: activeUserId },
    }),
  );
}

function emitStatus(status: UserGridSyncStatus) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(USER_GRID_SYNC_STATUS_EVENT, {
      detail: { status, userId: activeUserId || null },
    }),
  );
}

function encodeStorageSegment(value: string) {
  return encodeURIComponent(value.trim()).replace(/\./g, "%2E");
}

function decodeStorageSegment(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function clearSaveTimer() {
  if (typeof window !== "undefined" && saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = null;
}

function clearRetryTimer() {
  if (typeof window !== "undefined" && retryTimer !== null) {
    window.clearTimeout(retryTimer);
  }
  retryTimer = null;
}
