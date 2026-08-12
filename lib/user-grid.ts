"use client";

import { apiFetch } from "@/lib/api";

type UserGridResponse = {
  grid: unknown;
  updated_at?: string | null;
};

type UserGridDocument = {
  entries: Record<string, string>;
  format: "ipxdata-user-grid";
  legacyGrid?: unknown;
  updatedAt: string;
  version: 1;
};

export type UserGridSyncStatus =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "error";

export type UserGridSyncStatusDetail = {
  status: UserGridSyncStatus;
  userId: string | null;
};

export const USER_GRID_HYDRATED_EVENT = "ipxdata:user-grid-hydrated";
export const USER_GRID_SYNC_STATUS_EVENT = "ipxdata:user-grid-sync-status";

const GRID_FORMAT = "ipxdata-user-grid";
const GRID_VERSION = 1;
const SYNC_INTERVAL_MS = 5_000;
const SAVE_DEBOUNCE_MS = 600;
const RETRY_DELAY_MS = 5_000;

// Only preferences that are explicitly personal and already carry a user
// scope may be synchronized. Company-only/legacy keys remain available to the
// feature loaders for their own migrations, but the grid must never upload or
// delete them because the same browser may be used by more than one account.
const MANAGED_GRID_BASE_KEYS = new Set([
  "ipxdata.card-views.v1",
  "ipxdata.counting-report-period.v1",
  "ipxdata.counting-report-view-settings.v1",
  "ipxdata.legacy-dashboard-default-migration.v1.live",
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
  "ipxdata.video-walls.v1",
]);

const MANAGED_GRID_BASE_PATTERNS = [
  /^ipxdata\.widget-view-presets\.v1\.(?:analysis|live|occupancy(?:-(?:analysis|live|reports))?|reports)$/,
  /^ipxdata\.widget-view-preset-applied\.v1\.(?:analysis|live|occupancy(?:-(?:analysis|live|reports))?|reports)$/,
  /^ipxdata\.live-custom-.+\.scenario-comparison\.v1$/,
  /^ipxdata\.reports(?:-custom-.+)?\.scenario-comparison\.v1$/,
];

let activeUserId = "";
let activeDocument: UserGridDocument | null = null;
let hydrated = false;
let generation = 0;
let saveTimer: number | null = null;
let flushPromise: Promise<void> | null = null;
let activeListenerCleanup: (() => void) | null = null;
let localSnapshot = new Map<string, string>();
const pendingChanges = new Map<string, string | null>();

export async function hydrateUserGridFromServer(userId: string) {
  const cleanUserId = userId.trim();
  if (!cleanUserId || typeof window === "undefined") return false;
  if (hydrated && activeUserId === cleanUserId) return true;

  const currentGeneration = ++generation;
  activeUserId = cleanUserId;
  activeDocument = null;
  hydrated = false;
  pendingChanges.clear();
  clearSaveTimer();
  emitStatus("loading");

  try {
    const response = await apiFetch<UserGridResponse>("/users/me/grid");
    if (currentGeneration !== generation || activeUserId !== cleanUserId) {
      return false;
    }

    const parsed = normalizeGridDocument(response.grid);
    if (parsed.nativeDocument) {
      const localEntries = collectManagedEntries(cleanUserId);
      const mergedEntries = mergeDocumentEntries(
        parsed.document.entries,
        localEntries,
      );
      activeDocument = { ...parsed.document, entries: mergedEntries };
      applyRemoteEntries(parsed.document.entries, cleanUserId);
    } else {
      activeDocument = {
        ...parsed.document,
        entries: collectManagedEntries(cleanUserId),
      };
    }

    localSnapshot = new Map(
      Object.entries(collectManagedEntries(cleanUserId)),
    );
    hydrated = true;
    emitHydrated();
    emitStatus("ready");

    const nativeDocumentNeedsMerge =
      parsed.nativeDocument &&
      !entriesEqual(activeDocument.entries, parsed.document.entries);
    if (
      (!parsed.nativeDocument && localSnapshot.size) ||
      nativeDocumentNeedsMerge
    ) {
      await persistActiveDocument(currentGeneration).catch(() => undefined);
    }

    return true;
  } catch {
    if (currentGeneration !== generation) return false;
    // A failed read provides no safe merge base for the whole-document PUT.
    // Keep local preferences untouched, but do not create a writable document
    // or announce hydration. A later explicit hydration may retry the GET.
    activeDocument = null;
    localSnapshot = new Map();
    hydrated = false;
    pendingChanges.clear();
    emitStatus("error");
    return false;
  }
}

export function startUserGridSync(userId: string) {
  if (typeof window === "undefined") return () => undefined;
  const cleanUserId = userId.trim();
  if (!cleanUserId) return () => undefined;

  activeListenerCleanup?.();

  const scan = () => captureLocalChanges(cleanUserId);
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || isManagedGridKey(event.key, cleanUserId)) scan();
  };
  const handleVisibility = () => {
    scan();
    if (document.visibilityState === "hidden") scheduleFlush(0);
  };

  const interval = window.setInterval(() => {
    if (document.visibilityState === "visible") scan();
  }, SYNC_INTERVAL_MS);
  window.addEventListener("storage", handleStorage);
  document.addEventListener("visibilitychange", handleVisibility);
  scan();

  const cleanup = () => {
    window.clearInterval(interval);
    window.removeEventListener("storage", handleStorage);
    document.removeEventListener("visibilitychange", handleVisibility);
    if (activeListenerCleanup === cleanup) activeListenerCleanup = null;
  };
  activeListenerCleanup = cleanup;
  return cleanup;
}

export function clearUserGridSync() {
  generation += 1;
  activeListenerCleanup?.();
  clearSaveTimer();
  activeUserId = "";
  activeDocument = null;
  hydrated = false;
  localSnapshot = new Map();
  pendingChanges.clear();
  emitStatus("idle");
}

export function requestUserGridSync() {
  if (!activeUserId || !hydrated) return;
  captureLocalChanges(activeUserId);
}

export async function flushUserGridSync() {
  if (!activeUserId || !hydrated) return false;
  captureLocalChanges(activeUserId);
  clearSaveTimer();
  if (flushPromise) await flushPromise;
  if (pendingChanges.size) await flushPendingChanges();
  return pendingChanges.size === 0;
}

function captureLocalChanges(userId: string) {
  if (!hydrated || activeUserId !== userId) return;
  const current = new Map(Object.entries(collectManagedEntries(userId)));
  const keys = new Set([...localSnapshot.keys(), ...current.keys()]);

  keys.forEach((key) => {
    const previousValue = localSnapshot.get(key);
    const currentValue = current.get(key);
    if (previousValue === currentValue) return;
    pendingChanges.set(key, currentValue ?? null);
  });

  localSnapshot = current;
  if (pendingChanges.size) scheduleFlush();
}

function scheduleFlush(delay = SAVE_DEBOUNCE_MS) {
  if (typeof window === "undefined" || !hydrated || !pendingChanges.size) {
    return;
  }
  clearSaveTimer();
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void flushPendingChanges();
  }, delay);
}

async function flushPendingChanges() {
  if (!activeDocument || !activeUserId || !pendingChanges.size) return;
  if (flushPromise) {
    scheduleFlush();
    return;
  }

  const currentGeneration = generation;
  const changes = new Map(pendingChanges);
  changes.forEach((value, key) => {
    if (value === null) delete activeDocument?.entries[key];
    else if (activeDocument) activeDocument.entries[key] = value;
  });
  activeDocument.updatedAt = new Date().toISOString();

  flushPromise = persistActiveDocument(currentGeneration)
    .then(() => {
      changes.forEach((value, key) => {
        if (pendingChanges.get(key) === value) pendingChanges.delete(key);
      });
    })
    .catch(() => {
      if (currentGeneration === generation) scheduleFlush(RETRY_DELAY_MS);
    })
    .finally(() => {
      flushPromise = null;
      if (pendingChanges.size && currentGeneration === generation) {
        scheduleFlush();
      }
    });

  await flushPromise;
}

async function persistActiveDocument(currentGeneration: number) {
  if (!activeDocument || currentGeneration !== generation) return;
  emitStatus("saving");
  const documentToSave = cloneDocument(activeDocument);
  let response: UserGridResponse;
  try {
    response = await apiFetch<UserGridResponse>("/users/me/grid", {
      method: "PUT",
      body: { grid: documentToSave },
    });
  } catch (error) {
    if (currentGeneration === generation) emitStatus("error");
    throw error;
  }
  if (currentGeneration !== generation) return;

  const returned = normalizeGridDocument(response.grid);
  activeDocument = returned.nativeDocument
    ? returned.document
    : documentToSave;
  emitStatus("saved");
}

function applyRemoteEntries(entries: Record<string, string>, userId: string) {
  if (typeof window === "undefined") return;

  // Absence in the server document is not a deletion marker. Applying only
  // values that are present prevents an incomplete/legacy grid from erasing
  // another company or user's local preferences.
  Object.entries(entries).forEach(([key, value]) => {
    if (isManagedGridKey(key, userId)) {
      window.localStorage.setItem(key, value);
    }
  });
}

function collectManagedEntries(userId: string) {
  const entries: Record<string, string> = {};
  if (typeof window === "undefined") return entries;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isManagedGridKey(key, userId)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }

  return Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isManagedGridKey(key: string, userId: string) {
  const baseKey = managedGridBaseKey(key, userId);
  return Boolean(
    baseKey &&
      (MANAGED_GRID_BASE_KEYS.has(baseKey) ||
        MANAGED_GRID_BASE_PATTERNS.some((pattern) => pattern.test(baseKey))),
  );
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

function mergeDocumentEntries(
  remoteEntries: Record<string, string>,
  localManagedEntries: Record<string, string>,
) {
  // Unknown/legacy remote entries stay opaque and round-trip unchanged. Local
  // managed entries fill only missing keys; the server remains authoritative
  // when both sides have a value for the same preference.
  return Object.fromEntries(
    Object.entries({ ...localManagedEntries, ...remoteEntries }).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );
}

function entriesEqual(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

function normalizeGridDocument(value: unknown): {
  document: UserGridDocument;
  nativeDocument: boolean;
} {
  const decoded = decodePotentialByteArray(value);
  if (decoded !== value) return normalizeGridDocument(decoded);

  if (typeof value === "string") {
    try {
      return normalizeGridDocument(JSON.parse(value) as unknown);
    } catch {
      return {
        document: { ...createEmptyDocument(), legacyGrid: value },
        nativeDocument: false,
      };
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (
      record.format === GRID_FORMAT &&
      record.version === GRID_VERSION &&
      record.entries &&
      typeof record.entries === "object" &&
      !Array.isArray(record.entries)
    ) {
      const entries = Object.fromEntries(
        Object.entries(record.entries as Record<string, unknown>).flatMap(
          ([key, entryValue]) =>
            typeof entryValue === "string" ? [[key, entryValue]] : [],
        ),
      );
      return {
        document: {
          entries,
          format: GRID_FORMAT,
          legacyGrid: record.legacyGrid,
          updatedAt:
            typeof record.updatedAt === "string"
              ? record.updatedAt
              : new Date().toISOString(),
          version: GRID_VERSION,
        },
        nativeDocument: true,
      };
    }
  }

  return {
    document: {
      ...createEmptyDocument(),
      ...(value === null || value === undefined ? {} : { legacyGrid: value }),
    },
    nativeDocument: false,
  };
}

function decodePotentialByteArray(value: unknown) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    !value.every(
      (item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255,
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

function createEmptyDocument(
  entries: Record<string, string> = {},
): UserGridDocument {
  return {
    entries,
    format: GRID_FORMAT,
    updatedAt: new Date().toISOString(),
    version: GRID_VERSION,
  };
}

function cloneDocument(document: UserGridDocument): UserGridDocument {
  return JSON.parse(JSON.stringify(document)) as UserGridDocument;
}

function emitHydrated() {
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

function clearSaveTimer() {
  if (typeof window !== "undefined" && saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = null;
}
