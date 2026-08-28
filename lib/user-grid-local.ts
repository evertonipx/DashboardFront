export const USER_GRID_LOCAL_CHANGE_EVENT =
  "ipxdata:user-grid-local-change";

const USER_GRID_OUTBOX_PREFIX = "ipxdata.user-grid-outbox.v1.";
const USER_GRID_DELETION_PREFIX = "ipxdata.user-grid-known-deletion.v1.";
const USER_GRID_LEGACY_OWNER_PREFIX = "ipxdata.user-grid-legacy-owner.v1.";

export type UserGridLocalMutation = {
  deleted: boolean;
  key: string;
  updatedAt: string;
};

export type UserGridLocalChangeDetail = {
  deleted: boolean;
  key: string;
  updatedAt: string;
};

/**
 * Updates the browser cache for a personal preference and notifies the active
 * user-grid synchronizer in the same tab. Server modules may safely import
 * this helper because all browser access remains guarded at call time.
 */
export function writeUserGridPreference(key: string, value: string) {
  if (typeof window === "undefined" || !key.trim()) return false;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return false;
  }
  clearUserGridKnownDeletion(key);
  const updatedAt = nextLocalMutationTimestamp();
  const journaled = writeMutation({ deleted: false, key, updatedAt });
  emitLocalChange({ deleted: false, key, updatedAt });
  return journaled;
}

/** Removes a cached personal preference and persists a tombstone on sync. */
export function removeUserGridPreference(key: string) {
  if (typeof window === "undefined" || !key.trim()) return false;
  try {
    window.localStorage.removeItem(key);
  } catch {
    return false;
  }
  markUserGridKnownDeletion(key);
  const updatedAt = nextLocalMutationTimestamp();
  const journaled = writeMutation({ deleted: true, key, updatedAt });
  emitLocalChange({ deleted: true, key, updatedAt });
  return journaled;
}

/**
 * Returns durable, browser-local mutations. They are synchronization metadata,
 * not user configuration, and are acknowledged only after the server confirms
 * the corresponding value/tombstone.
 */
export function readUserGridLocalMutations(): UserGridLocalMutation[] {
  if (typeof window === "undefined") return [];
  const mutations: UserGridLocalMutation[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey?.startsWith(USER_GRID_OUTBOX_PREFIX)) continue;
      const key = decodeMetadataSegment(
        storageKey.slice(USER_GRID_OUTBOX_PREFIX.length),
      );
      if (!key) continue;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Partial<UserGridLocalMutation>;
        if (
          typeof parsed.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(parsed.updatedAt)) ||
          typeof parsed.deleted !== "boolean"
        ) {
          continue;
        }
        mutations.push({
          deleted: parsed.deleted,
          key,
          updatedAt: parsed.updatedAt,
        });
      } catch {
        // One corrupt marker must not hide the remaining durable mutations.
      }
    }
  } catch {
    return mutations;
  }
  return mutations;
}

export function acknowledgeUserGridLocalMutation(
  key: string,
  updatedAt: string,
) {
  if (typeof window === "undefined") return false;
  const storageKey = mutationStorageKey(key);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as Partial<UserGridLocalMutation>;
    if (parsed.updatedAt !== updatedAt) return false;
    window.localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export function hasUserGridKnownDeletion(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(deletionStorageKey(key)) === "1";
  } catch {
    return false;
  }
}

export function markUserGridKnownDeletion(key: string) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(deletionStorageKey(key), "1");
    return true;
  } catch {
    return false;
  }
}

export function clearUserGridKnownDeletion(key: string) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(deletionStorageKey(key));
    return true;
  } catch {
    return false;
  }
}

/**
 * Claims one historical global preference for the first authenticated user
 * that migrates it. This prevents a shared browser from copying the previous
 * person's theme/sidebar/module into every later account.
 */
export function claimLegacyUserGridPreference(
  legacyKey: string,
  userId: string,
) {
  if (typeof window === "undefined" || !legacyKey.trim() || !userId.trim()) {
    return null;
  }
  try {
    const value = window.localStorage.getItem(legacyKey);
    if (value === null) return null;
    const ownerKey = legacyOwnerStorageKey(legacyKey);
    const owner = window.localStorage.getItem(ownerKey);
    if (owner && owner !== userId.trim()) return null;
    if (!owner) window.localStorage.setItem(ownerKey, userId.trim());
    return value;
  } catch {
    return null;
  }
}

function writeMutation(mutation: UserGridLocalMutation) {
  try {
    window.localStorage.setItem(
      mutationStorageKey(mutation.key),
      JSON.stringify({
        deleted: mutation.deleted,
        updatedAt: mutation.updatedAt,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function emitLocalChange(detail: UserGridLocalChangeDetail) {
  try {
    window.dispatchEvent(
      new CustomEvent<UserGridLocalChangeDetail>(
        USER_GRID_LOCAL_CHANGE_EVENT,
        { detail },
      ),
    );
  } catch {
    // The periodic scanner remains a fallback in restricted browser contexts.
  }
}

let lastLocalMutationTimestamp = 0;

function nextLocalMutationTimestamp() {
  const next = Math.max(Date.now(), lastLocalMutationTimestamp + 1);
  lastLocalMutationTimestamp = next;
  return new Date(next).toISOString();
}

function mutationStorageKey(key: string) {
  return `${USER_GRID_OUTBOX_PREFIX}${encodeMetadataSegment(key)}`;
}

function deletionStorageKey(key: string) {
  return `${USER_GRID_DELETION_PREFIX}${encodeMetadataSegment(key)}`;
}

function legacyOwnerStorageKey(key: string) {
  return `${USER_GRID_LEGACY_OWNER_PREFIX}${encodeMetadataSegment(key)}`;
}

function encodeMetadataSegment(value: string) {
  return encodeURIComponent(value).replace(/\./g, "%2E");
}

function decodeMetadataSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
