"use client";

import { normalizeCardLayoutLevel } from "@/lib/card-layout-sizing";
import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import { requestUserGridSync } from "@/lib/user-grid";
import {
  CARD_ZOOM_LEVELS,
  loadSavedScopedCardPreferences,
  loadScopedCardPreferences,
  saveCardPreferences,
  type CardMenuKey,
  type CardPreference,
} from "@/lib/view-preferences";

export type WidgetViewScope = {
  id: string;
  name: string;
};

export type WidgetViewPresetNamespace =
  | CardMenuKey
  | "occupancy-analysis"
  | "occupancy-live"
  | "occupancy-reports";

export type WidgetViewSnapshot = {
  cardIds: string[];
  capturedAt: string;
  menuKey: CardMenuKey;
  preferences: CardPreference[];
  sourceScope: WidgetViewScope | null;
  storage: WidgetViewStorageEntry[];
  version: 1;
};

export type WidgetViewPreset = {
  createdAt: string;
  id: string;
  isDefault: boolean;
  name: string;
  snapshot: WidgetViewSnapshot;
  updatedAt: string;
};

export type WidgetViewStorageEntry = {
  baseKey: string;
  value: string;
};

type CaptureWidgetViewSnapshotInput = {
  cardIds: string[];
  companyId?: string | null;
  menuKey: CardMenuKey;
  preferences?: CardPreference[];
  sourceScope?: WidgetViewScope | null;
  userId?: string | null;
};

type ApplyWidgetViewPresetInput = {
  companyId?: string | null;
  presetNamespace?: WidgetViewPresetNamespace;
  targetScope?: WidgetViewScope | null;
  userId?: string | null;
};

export const WIDGET_VIEW_PRESETS_UPDATED_EVENT =
  "ipxdata:widget-view-presets-updated";

const PRESETS_STORAGE_KEY = "ipxdata.widget-view-presets.v1";
const APPLIED_PRESET_STORAGE_KEY = "ipxdata.widget-view-preset-applied.v1";

const menuStorageMatchers: Record<CardMenuKey, RegExp[]> = {
  analysis: [
    /^ipxdata\.period-analysis-widgets\.v1$/,
    /^ipxdata\.period-analysis-settings\.v1$/,
  ],
  live: [
    /^ipxdata\.realtime-custom-widgets\.v1$/,
    /^ipxdata\.live-dashboard-settings\.v1$/,
    /^ipxdata\.live-operational-settings\.v1$/,
    /^ipxdata\.live-custom-.+\.scenario-comparison\.v1$/,
  ],
  occupancy: [
    /^ipxdata\.occupancy-custom-widgets\.v1$/,
    /^ipxdata\.occupancy-dashboard-settings\.v1$/,
    /^ipxdata\.occupancy-widget-settings\.v1$/,
    /^ipxdata\.occupancy\.metric-visibility\.v1$/,
  ],
  reports: [
    /^ipxdata\.report-custom-widgets\.v1$/,
    /^ipxdata\.live-dashboard-settings\.v1$/,
    /^ipxdata\.counting-report-view-settings\.v1$/,
    /^ipxdata\.counting-report-period\.v1$/,
    /^ipxdata\.reports(?:-custom-.+)?\.scenario-comparison\.v1$/,
  ],
};

export function loadWidgetViewPresets(
  menuKey: CardMenuKey,
  companyId?: string | null,
  userId?: string | null,
  presetNamespace: WidgetViewPresetNamespace = menuKey,
) {
  if (typeof window === "undefined") return [];

  try {
    const namespace = resolvePresetNamespace(menuKey, presetNamespace);
    const storageKey = presetsStorageKey(namespace, companyId, userId);
    const storedEntry = readUserViewScopedStorageEntry(
      presetStorageBaseKey(namespace),
      companyId,
      userId,
    );
    const stored = storedEntry
      ? storedEntry.value
      : migrateLegacyOccupancyPresets({
        companyId,
        menuKey,
        namespace,
        storageKey,
        userId,
      });
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .map((value) => normalizePreset(value, menuKey))
      .filter((preset): preset is WidgetViewPreset => Boolean(preset));
    const result = enforceSingleDefault(normalized);
    if (storedEntry && storedEntry.key !== storageKey) {
      window.localStorage.setItem(storageKey, JSON.stringify(result));
      requestUserGridSync();
    }
    return result;
  } catch {
    return [];
  }
}

export function saveWidgetViewPresets(
  menuKey: CardMenuKey,
  presets: WidgetViewPreset[],
  companyId?: string | null,
  userId?: string | null,
  presetNamespace: WidgetViewPresetNamespace = menuKey,
) {
  const normalized = enforceSingleDefault(
    presets
      .map((value) => normalizePreset(value, menuKey))
      .filter((preset): preset is WidgetViewPreset => Boolean(preset)),
  );
  if (typeof window === "undefined") return normalized;

  window.localStorage.setItem(
    presetsStorageKey(
      resolvePresetNamespace(menuKey, presetNamespace),
      companyId,
      userId,
    ),
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent(WIDGET_VIEW_PRESETS_UPDATED_EVENT, {
      detail: { companyId, menuKey, presetNamespace, userId },
    }),
  );
  return normalized;
}

export function upsertWidgetViewPreset({
  companyId,
  id,
  menuKey,
  name,
  presetNamespace,
  snapshot,
  userId,
}: {
  companyId?: string | null;
  id?: string;
  menuKey: CardMenuKey;
  name: string;
  presetNamespace?: WidgetViewPresetNamespace;
  snapshot: WidgetViewSnapshot;
  userId?: string | null;
}) {
  const presets = loadWidgetViewPresets(
    menuKey,
    companyId,
    userId,
    presetNamespace,
  );
  const current = id ? presets.find((preset) => preset.id === id) : undefined;
  const now = new Date().toISOString();
  const preset: WidgetViewPreset = {
    createdAt: current?.createdAt ?? now,
    id: current?.id ?? createPresetId(),
    isDefault: current?.isDefault ?? false,
    name: name.trim(),
    snapshot,
    updatedAt: now,
  };
  const next = current
    ? presets.map((stored) => (stored.id === current.id ? preset : stored))
    : [...presets, preset];

  return saveWidgetViewPresets(
    menuKey,
    next,
    companyId,
    userId,
    presetNamespace,
  );
}

export function deleteWidgetViewPreset(
  menuKey: CardMenuKey,
  presetId: string,
  companyId?: string | null,
  userId?: string | null,
  presetNamespace: WidgetViewPresetNamespace = menuKey,
) {
  return saveWidgetViewPresets(
    menuKey,
    loadWidgetViewPresets(
      menuKey,
      companyId,
      userId,
      presetNamespace,
    ).filter(
      (preset) => preset.id !== presetId,
    ),
    companyId,
    userId,
    presetNamespace,
  );
}

export function setDefaultWidgetViewPreset(
  menuKey: CardMenuKey,
  presetId: string,
  companyId?: string | null,
  userId?: string | null,
  presetNamespace: WidgetViewPresetNamespace = menuKey,
) {
  return saveWidgetViewPresets(
    menuKey,
    loadWidgetViewPresets(
      menuKey,
      companyId,
      userId,
      presetNamespace,
    ).map((preset) => ({
      ...preset,
      isDefault: preset.id === presetId,
    })),
    companyId,
    userId,
    presetNamespace,
  );
}

export function captureWidgetViewSnapshot({
  cardIds,
  companyId,
  menuKey,
  preferences,
  sourceScope = null,
  userId,
}: CaptureWidgetViewSnapshotInput): WidgetViewSnapshot {
  const viewId = sourceScope?.id;

  return {
    cardIds: uniqueStrings(cardIds),
    capturedAt: new Date().toISOString(),
    menuKey,
    preferences:
      preferences ??
      loadScopedCardPreferences(
        menuKey,
        cardIds,
        companyId,
        userId,
        viewId,
      ),
    sourceScope,
    storage: captureMenuStorage(menuKey, companyId, userId, viewId),
    version: 1,
  };
}

export function applyWidgetViewPreset(
  preset: WidgetViewPreset,
  {
    companyId,
    presetNamespace = preset.snapshot.menuKey,
    targetScope = null,
    userId,
  }: ApplyWidgetViewPresetInput,
) {
  if (typeof window === "undefined") return false;
  const { snapshot } = preset;
  const targetViewId = targetScope?.id;

  clearMenuStorage(snapshot.menuKey, companyId, userId, targetViewId);
  snapshot.storage.forEach((entry) => {
    window.localStorage.setItem(
      scopedStorageKey(entry.baseKey, companyId, userId, targetViewId),
      remapSerializedValue(
        entry.value,
        snapshot.sourceScope,
        targetScope,
      ),
    );
  });
  saveCardPreferences(
    snapshot.menuKey,
    snapshot.preferences,
    snapshot.cardIds,
    companyId,
    userId,
    targetViewId,
  );
  window.localStorage.setItem(
    appliedPresetStorageKey(
      resolvePresetNamespace(snapshot.menuKey, presetNamespace),
      companyId,
      userId,
      targetViewId,
    ),
    JSON.stringify({ presetId: preset.id, updatedAt: preset.updatedAt }),
  );
  return true;
}

export function applyDefaultWidgetViewPresetIfEmpty({
  cardIds,
  companyId,
  menuKey,
  presetNamespace = menuKey,
  targetScope,
  userId,
}: {
  cardIds: string[];
  companyId?: string | null;
  menuKey: CardMenuKey;
  presetNamespace?: WidgetViewPresetNamespace;
  targetScope: WidgetViewScope;
  userId?: string | null;
}) {
  if (
    hasScopedWidgetViewState(
      menuKey,
      companyId,
      userId,
      targetScope.id,
      presetNamespace,
    )
  ) {
    return false;
  }

  const preset = loadWidgetViewPresets(
    menuKey,
    companyId,
    userId,
    presetNamespace,
  ).find((candidate) => candidate.isDefault);
  if (!preset) return false;

  return applyWidgetViewPreset(
    {
      ...preset,
      snapshot: {
        ...preset.snapshot,
        cardIds: preset.snapshot.cardIds.length
          ? preset.snapshot.cardIds
          : cardIds,
      },
    },
    { companyId, presetNamespace, targetScope, userId },
  );
}

function captureMenuStorage(
  menuKey: CardMenuKey,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") return [];
  const suffix = storageScopeSuffix(companyId, userId, viewId);
  const entries: WidgetViewStorageEntry[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const baseKey = scopedBaseKey(key, suffix);
    if (!baseKey || !matchesMenuStorage(menuKey, baseKey)) continue;
    const value = window.localStorage.getItem(key);
    if (value === null) continue;
    entries.push({ baseKey, value });
  }

  return entries.sort((left, right) => left.baseKey.localeCompare(right.baseKey));
}

function clearMenuStorage(
  menuKey: CardMenuKey,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") return;
  const suffix = storageScopeSuffix(companyId, userId, viewId);
  const keys: string[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const baseKey = scopedBaseKey(key, suffix);
    if (baseKey && matchesMenuStorage(menuKey, baseKey)) keys.push(key);
  }

  keys.forEach((key) => window.localStorage.removeItem(key));
}

function hasScopedWidgetViewState(
  menuKey: CardMenuKey,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
  presetNamespace: WidgetViewPresetNamespace = menuKey,
) {
  if (typeof window === "undefined") return true;

  if (
    window.localStorage.getItem(
      appliedPresetStorageKey(
        resolvePresetNamespace(menuKey, presetNamespace),
        companyId,
        userId,
        viewId,
      ),
    )
  ) {
    return true;
  }

  if (
    loadSavedScopedCardPreferences(
      menuKey,
      undefined,
      companyId,
      userId,
      viewId,
    ) !== null
  ) {
    return true;
  }

  return false;
}

function remapSerializedValue(
  value: string,
  sourceScope: WidgetViewScope | null,
  targetScope: WidgetViewScope | null,
) {
  if (!sourceScope || !targetScope || sourceScope.id === targetScope.id) {
    return value;
  }

  try {
    return JSON.stringify(
      remapValue(JSON.parse(value) as unknown, sourceScope, targetScope),
    );
  } catch {
    return value;
  }
}

function remapValue(
  value: unknown,
  sourceScope: WidgetViewScope,
  targetScope: WidgetViewScope,
  key?: string,
): unknown {
  if (typeof value === "string") {
    if (value === sourceScope.id) return targetScope.id;
    if (key === "scopeName" && value === sourceScope.name) {
      return targetScope.name;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      remapValue(item, sourceScope, targetScope),
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (key === "capacities") {
      const sourceEntry = entries.find(
        ([entryKey]) => entryKey === sourceScope.id,
      );
      const retainedEntries: Array<[string, unknown]> = entries
        .filter(([entryKey]) => entryKey !== sourceScope.id)
        .map(([entryKey, entryValue]) => [
          entryKey,
          remapValue(entryValue, sourceScope, targetScope, entryKey),
        ]);
      if (sourceEntry) {
        retainedEntries.push([
          targetScope.id,
          remapValue(
            sourceEntry[1],
            sourceScope,
            targetScope,
            targetScope.id,
          ),
        ]);
      }
      return Object.fromEntries(retainedEntries);
    }
    return Object.fromEntries(
      entries.map(([entryKey, entryValue]) => [
        entryKey,
        remapValue(entryValue, sourceScope, targetScope, entryKey),
      ]),
    );
  }
  return value;
}

function matchesMenuStorage(menuKey: CardMenuKey, baseKey: string) {
  return menuStorageMatchers[menuKey].some((matcher) => matcher.test(baseKey));
}

function scopedStorageKey(
  baseKey: string,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  return getUserViewScopedStorageKey(baseKey, companyId, userId, viewId);
}

function storageScopeSuffix(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const marker = "__ipxdata_widget_view_scope__";
  return getUserViewScopedStorageKey(
    marker,
    companyId,
    userId,
    viewId,
  ).slice(marker.length);
}

function scopedBaseKey(key: string, suffix: string) {
  if (!suffix) return key;
  return key.endsWith(suffix) ? key.slice(0, -suffix.length) : "";
}

function resolvePresetNamespace(
  menuKey: CardMenuKey,
  presetNamespace: WidgetViewPresetNamespace,
): WidgetViewPresetNamespace {
  if (menuKey !== "occupancy") return menuKey;
  return presetNamespace === "occupancy-analysis" ||
    presetNamespace === "occupancy-live" ||
    presetNamespace === "occupancy-reports"
    ? presetNamespace
    : menuKey;
}

function migrateLegacyOccupancyPresets({
  companyId,
  menuKey,
  namespace,
  storageKey,
  userId,
}: {
  companyId?: string | null;
  menuKey: CardMenuKey;
  namespace: WidgetViewPresetNamespace;
  storageKey: string;
  userId?: string | null;
}) {
  if (menuKey !== "occupancy" || namespace === "occupancy") return null;

  const legacyStored = readUserViewScopedStorageEntry(
    presetStorageBaseKey("occupancy"),
    companyId,
    userId,
  );
  if (!legacyStored?.value) return null;

  const parsed = JSON.parse(legacyStored.value) as unknown;
  if (!Array.isArray(parsed)) return null;
  const migrated = enforceSingleDefault(
    parsed
      .map((value) => normalizePreset(value, "occupancy"))
      .filter((preset): preset is WidgetViewPreset => Boolean(preset))
      .filter((preset) => occupancyPresetBelongsToNamespace(preset, namespace)),
  );
  const serialized = JSON.stringify(migrated);
  window.localStorage.setItem(storageKey, serialized);
  requestUserGridSync();
  return serialized;
}

function occupancyPresetBelongsToNamespace(
  preset: WidgetViewPreset,
  namespace: WidgetViewPresetNamespace,
) {
  const scopeId = preset.snapshot.sourceScope?.id ?? "";
  if (namespace === "occupancy-analysis") return scopeId.startsWith("analysis:");
  if (namespace === "occupancy-reports") return scopeId.startsWith("reports:");
  return (
    namespace === "occupancy-live" &&
    !scopeId.startsWith("analysis:") &&
    !scopeId.startsWith("reports:")
  );
}

function presetsStorageKey(
  presetNamespace: WidgetViewPresetNamespace,
  companyId?: string | null,
  userId?: string | null,
) {
  return getUserViewScopedStorageKey(
    presetStorageBaseKey(presetNamespace),
    companyId,
    userId,
  );
}

function presetStorageBaseKey(
  presetNamespace: WidgetViewPresetNamespace,
) {
  return `${PRESETS_STORAGE_KEY}.${presetNamespace}`;
}

function appliedPresetStorageKey(
  presetNamespace: WidgetViewPresetNamespace,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  return getUserViewScopedStorageKey(
    `${APPLIED_PRESET_STORAGE_KEY}.${presetNamespace}`,
    companyId,
    userId,
    viewId,
  );
}

function normalizePreset(
  value: unknown,
  menuKey: CardMenuKey,
): WidgetViewPreset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const snapshot = normalizeSnapshot(record.snapshot, menuKey);
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    !record.name.trim() ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !snapshot
  ) {
    return null;
  }

  return {
    createdAt: record.createdAt,
    id: record.id,
    isDefault: record.isDefault === true,
    name: record.name.trim(),
    snapshot,
    updatedAt: record.updatedAt,
  };
}

function normalizeSnapshot(
  value: unknown,
  menuKey: CardMenuKey,
): WidgetViewSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.menuKey !== menuKey) return null;

  const sourceRecord =
    record.sourceScope && typeof record.sourceScope === "object"
      ? (record.sourceScope as Record<string, unknown>)
      : null;
  const sourceScope =
    sourceRecord &&
    typeof sourceRecord.id === "string" &&
    typeof sourceRecord.name === "string"
      ? { id: sourceRecord.id, name: sourceRecord.name }
      : null;
  const storage = Array.isArray(record.storage)
    ? record.storage.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        return typeof item.baseKey === "string" &&
          typeof item.value === "string" &&
          matchesMenuStorage(menuKey, item.baseKey)
          ? [{ baseKey: item.baseKey, value: item.value }]
          : [];
      })
    : [];
  const preferences = Array.isArray(record.preferences)
    ? record.preferences.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        if (typeof item.id !== "string") return [];
        return [
          {
            chartType:
              item.chartType === "bar" ||
              item.chartType === "line" ||
              item.chartType === "rose" ||
              item.chartType === "treemap"
                ? item.chartType
                : undefined,
            color:
              typeof item.color === "string" ? item.color : undefined,
            height:
              item.height === "short" ||
              item.height === "standard" ||
              item.height === "tall"
                ? item.height
                : undefined,
            heightLevel: normalizeCardLayoutLevel(item.heightLevel),
            id: item.id,
            size:
              item.size === "compact" ||
              item.size === "wide" ||
              item.size === "large" ||
              item.size === "full"
                ? item.size
                : undefined,
            title:
              typeof item.title === "string" && item.title.trim()
                ? item.title.trim().slice(0, 120)
                : undefined,
            visible: item.visible !== false,
            widthLevel: normalizeCardLayoutLevel(item.widthLevel),
            zoom: CARD_ZOOM_LEVELS.find((level) => level === item.zoom),
          } satisfies CardPreference,
        ];
      })
    : [];

  return {
    cardIds: uniqueStrings(record.cardIds),
    capturedAt:
      typeof record.capturedAt === "string"
        ? record.capturedAt
        : new Date().toISOString(),
    menuKey,
    preferences,
    sourceScope,
    storage,
    version: 1,
  };
}

function enforceSingleDefault(presets: WidgetViewPreset[]) {
  let defaultFound = false;
  return presets.map((preset) => {
    if (!preset.isDefault) return preset;
    if (defaultFound) return { ...preset, isDefault: false };
    defaultFound = true;
    return preset;
  });
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      ),
    ),
  );
}

function createPresetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `widget-view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
