"use client";

import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import { requestUserGridSync } from "@/lib/user-grid";
import { writeUserGridPreference } from "@/lib/user-grid-local";
import {
  createViewLinkReference,
  ensureOpaqueViewPath,
} from "@/lib/view-link-reference";

export type SavedLiveView = {
  createdAt: string;
  id: string;
  name: string;
  path: string;
  updatedAt: string;
};

export type VideoWallOutputSource = "live_dashboard" | "saved_view";

export type VideoWallOutput = {
  id: string;
  linkReference: string;
  name: string;
  scenarioId: string;
  screenKey: string;
  source: VideoWallOutputSource;
  viewId: string;
};

export type VideoWallProfile = {
  createdAt: string;
  id: string;
  name: string;
  outputs: VideoWallOutput[];
  updatedAt: string;
};

export const VIDEO_WALL_UPDATED_EVENT = "ipxdata:video-wall-updated";

const SAVED_VIEWS_STORAGE_KEY = "ipxdata.saved-live-views.v1";
const VIDEO_WALLS_STORAGE_KEY = "ipxdata.video-walls.v1";

export function loadSavedLiveViews(
  companyId?: string | null,
  userId?: string | null,
) {
  const views = readScopedArray(
    SAVED_VIEWS_STORAGE_KEY,
    companyId,
    userId,
    normalizeSavedLiveView,
  );
  let migrated = false;
  const opaqueViews = views.map((view) => {
    const path = ensureOpaqueViewPath(view.path, userId);
    if (!path || path === view.path) return view;
    migrated = true;
    return { ...view, path };
  });
  if (migrated) writeSavedLiveViews(opaqueViews, companyId, userId);
  return opaqueViews.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function saveLiveViewPreset(
  input: { name: string; url: string },
  companyId?: string | null,
  userId?: string | null,
) {
  const path = normalizeInternalViewPath(input.url);
  if (!path) return null;

  const current = loadSavedLiveViews(companyId, userId);
  const existing = current.find((view) => view.path === path);
  const now = new Date().toISOString();
  const view: SavedLiveView = {
    createdAt: existing?.createdAt ?? now,
    id: existing?.id ?? createId("live-view"),
    name: input.name.trim() || existing?.name || "Visão Ao Vivo",
    path,
    updatedAt: now,
  };
  const next = existing
    ? current.map((item) => (item.id === existing.id ? view : item))
    : [view, ...current];

  writeSavedLiveViews(next, companyId, userId);
  return view;
}

export function deleteSavedLiveView(
  viewId: string,
  companyId?: string | null,
  userId?: string | null,
) {
  const next = loadSavedLiveViews(companyId, userId).filter(
    (view) => view.id !== viewId,
  );
  writeSavedLiveViews(next, companyId, userId);
  return next;
}

export function deleteSavedLiveViews(
  viewIds: Iterable<string>,
  companyId?: string | null,
  userId?: string | null,
) {
  const selectedIds = new Set(
    [...viewIds].map((viewId) => viewId.trim()).filter(Boolean),
  );
  if (!selectedIds.size) return loadSavedLiveViews(companyId, userId);

  const next = loadSavedLiveViews(companyId, userId).filter(
    (view) => !selectedIds.has(view.id),
  );
  writeSavedLiveViews(next, companyId, userId);
  return next;
}

export function loadVideoWallProfiles(
  companyId?: string | null,
  userId?: string | null,
) {
  return readScopedArray(
    VIDEO_WALLS_STORAGE_KEY,
    companyId,
    userId,
    normalizeVideoWallProfile,
  ).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function saveVideoWallProfiles(
  profiles: VideoWallProfile[],
  companyId?: string | null,
  userId?: string | null,
) {
  const normalized = profiles
    .map(normalizeVideoWallProfile)
    .filter((profile): profile is VideoWallProfile => Boolean(profile));
  if (typeof window !== "undefined") {
    writeUserGridPreference(
      getUserViewScopedStorageKey(
        VIDEO_WALLS_STORAGE_KEY,
        companyId,
        userId,
      ),
      JSON.stringify(normalized),
    );
    dispatchUpdate(companyId, userId);
    requestUserGridSync();
  }
  return normalized;
}

export function createVideoWallProfile(
  name = "Video wall principal",
  viewId = "",
): VideoWallProfile {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    id: createId("video-wall"),
    name,
    outputs: [createVideoWallOutput(1, viewId)],
    updatedAt: now,
  };
}

export function createVideoWallOutput(
  position: number,
  viewId = "",
): VideoWallOutput {
  return {
    id: createId("wall-output"),
    linkReference: createViewLinkReference(),
    name: `Monitor ${position}`,
    scenarioId: "",
    screenKey: "auto",
    source: viewId ? "saved_view" : "live_dashboard",
    viewId,
  };
}

export function resolveSavedLiveViewUrl(
  view: SavedLiveView,
  origin: string,
  userId?: string | null,
) {
  return new URL(ensureOpaqueViewPath(view.path, userId) || view.path, origin).toString();
}

function writeSavedLiveViews(
  views: SavedLiveView[],
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window === "undefined") return;
  writeUserGridPreference(
    getUserViewScopedStorageKey(
      SAVED_VIEWS_STORAGE_KEY,
      companyId,
      userId,
    ),
    JSON.stringify(views),
  );
  dispatchUpdate(companyId, userId);
  requestUserGridSync();
}

function dispatchUpdate(
  companyId?: string | null,
  userId?: string | null,
) {
  window.dispatchEvent(
    new CustomEvent(VIDEO_WALL_UPDATED_EVENT, {
      detail: { companyId: companyId ?? null, userId: userId ?? null },
    }),
  );
}

function readScopedArray<T>(
  baseKey: string,
  companyId: string | null | undefined,
  userId: string | null | undefined,
  normalize: (value: unknown) => T | null,
) {
  if (typeof window === "undefined") return [] as T[];

  try {
    const stored = readUserViewScopedStorageEntry(
      baseKey,
      companyId,
      userId,
    );
    if (!stored?.value) return [] as T[];
    const parsed = JSON.parse(stored.value) as unknown;
    if (!Array.isArray(parsed)) return [] as T[];
    const normalized = parsed
      .map(normalize)
      .filter((value): value is T => Boolean(value));
    const currentKey = getUserViewScopedStorageKey(
      baseKey,
      companyId,
      userId,
    );

    // Materialize a valid legacy company-scoped value in the personal
    // namespace. This makes the recovered configuration visible immediately
    // and eligible for the regular /users/me/grid synchronization.
    if (stored.key !== currentKey) {
      writeUserGridPreference(currentKey, JSON.stringify(normalized));
      requestUserGridSync();
    }

    return normalized;
  } catch {
    return [] as T[];
  }
}

function normalizeSavedLiveView(value: unknown): SavedLiveView | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const path = normalizeInternalViewPath(record.path);
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    !path
  ) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    id: record.id,
    name: record.name.trim() || "Visão Ao Vivo",
    path,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
  };
}

function normalizeVideoWallProfile(value: unknown): VideoWallProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }

  const storedOutputs = Array.isArray(record.outputs)
    ? record.outputs
        .map(normalizeVideoWallOutput)
        .filter((output): output is VideoWallOutput => Boolean(output))
    : [];
  const outputs = storedOutputs.length
    ? storedOutputs
    : [createVideoWallOutput(1)];
  const now = new Date().toISOString();
  return {
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    id: record.id,
    name: record.name.trim() || "Video wall",
    outputs,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
  };
}

function normalizeVideoWallOutput(value: unknown): VideoWallOutput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }

  return {
    id: record.id,
    linkReference:
      typeof record.linkReference === "string" && record.linkReference.trim()
        ? record.linkReference.trim()
        : createViewLinkReference(),
    name: record.name.trim() || "Monitor",
    scenarioId: typeof record.scenarioId === "string" ? record.scenarioId : "",
    screenKey: typeof record.screenKey === "string" ? record.screenKey : "auto",
    source: record.source === "saved_view" ? "saved_view" : "live_dashboard",
    viewId: typeof record.viewId === "string" ? record.viewId : "",
  };
}

function normalizeInternalViewPath(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(value, origin);
    if (url.origin !== origin) return "";
    if (!url.pathname.startsWith("/views/")) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
