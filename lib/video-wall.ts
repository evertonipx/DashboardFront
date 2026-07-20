"use client";

import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

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
  return readArray(
    getUserViewScopedStorageKey(
      SAVED_VIEWS_STORAGE_KEY,
      companyId,
      userId,
    ),
    normalizeSavedLiveView,
  ).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

export function loadVideoWallProfiles(
  companyId?: string | null,
  userId?: string | null,
) {
  return readArray(
    getUserViewScopedStorageKey(
      VIDEO_WALLS_STORAGE_KEY,
      companyId,
      userId,
    ),
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
    window.localStorage.setItem(
      getUserViewScopedStorageKey(
        VIDEO_WALLS_STORAGE_KEY,
        companyId,
        userId,
      ),
      JSON.stringify(normalized),
    );
    dispatchUpdate(companyId, userId);
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
    name: `Monitor ${position}`,
    scenarioId: "",
    screenKey: "auto",
    source: viewId ? "saved_view" : "live_dashboard",
    viewId,
  };
}

export function resolveSavedLiveViewUrl(view: SavedLiveView, origin: string) {
  return new URL(view.path, origin).toString();
}

function writeSavedLiveViews(
  views: SavedLiveView[],
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getUserViewScopedStorageKey(
      SAVED_VIEWS_STORAGE_KEY,
      companyId,
      userId,
    ),
    JSON.stringify(views),
  );
  dispatchUpdate(companyId, userId);
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

function readArray<T>(
  storageKey: string,
  normalize: (value: unknown) => T | null,
) {
  if (typeof window === "undefined") return [] as T[];

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [] as T[];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [] as T[];
    return parsed.map(normalize).filter((value): value is T => Boolean(value));
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
