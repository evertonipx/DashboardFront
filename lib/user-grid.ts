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
const SYNC_INTERVAL_MS = 800;
const SAVE_DEBOUNCE_MS = 600;
const RETRY_DELAY_MS = 5_000;

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
      activeDocument = parsed.document;
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

    if (!parsed.nativeDocument && localSnapshot.size) {
      await persistActiveDocument(currentGeneration).catch(() => undefined);
    }

    return true;
  } catch {
    if (currentGeneration !== generation) return false;
    activeDocument = createEmptyDocument(collectManagedEntries(cleanUserId));
    localSnapshot = new Map(Object.entries(activeDocument.entries));
    hydrated = true;
    emitHydrated();
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

  const interval = window.setInterval(scan, SYNC_INTERVAL_MS);
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

  const remoteKeys = new Set(Object.keys(entries));
  const localKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isManagedGridKey(key, userId)) localKeys.push(key);
  }

  localKeys.forEach((key) => {
    if (!remoteKeys.has(key)) window.localStorage.removeItem(key);
  });
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
  if (!key.startsWith("ipxdata.")) return false;
  if (
    key.startsWith("ipxdata.camera-groups.") ||
    key.startsWith("ipxdata.camera-worker-assignments.") ||
    key.startsWith("ipxdata.worker-location-assignments.") ||
    key.startsWith("ipxdata.user-grid.")
  ) {
    return false;
  }

  const userMarker = ".user.";
  if (!key.includes(userMarker)) return true;
  const scopedUserMarker = `${userMarker}${encodeStorageSegment(userId)}`;
  return key.endsWith(scopedUserMarker) || key.includes(`${scopedUserMarker}.`);
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
