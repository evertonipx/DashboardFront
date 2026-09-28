"use client";

import { normalizeCardLayoutLevel } from "@/lib/card-layout-sizing";
import {
  DEMOGRAPHICS_PALETTES,
  demographicDimensionForCard,
  normalizeDemographicPresentation,
  type DemographicPaletteId,
} from "@/lib/demographics-presentation";
import {
  isDemographicTemporalWidgetId,
  normalizeDemographicTemporalSettings,
} from "@/lib/demographics-temporal-preferences";
import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import { OCCUPANCY_COLOR_PALETTES } from "@/lib/occupancy-color-palettes";
import { requestUserGridSync } from "@/lib/user-grid";
import {
  removeUserGridPreference,
  writeUserGridPreference,
} from "@/lib/user-grid-local";
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
  CardMenuKey | "occupancy-analysis" | "occupancy-live" | "occupancy-reports";

export type WidgetViewSnapshot = {
  cardIds: string[];
  capturedAt: string;
  dependentScopes?: Array<"occupancy-scenario" | "demographics-surface">;
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
  scope?: "occupancy-scenario" | "demographics-surface";
  value: string;
};

export type WidgetViewBackup = {
  companyId: string;
  exportedAt: string;
  format: "ipxdata-widget-view-backup";
  menuKey: CardMenuKey;
  presetNamespace: WidgetViewPresetNamespace;
  version: 1;
  view: {
    name: string;
    snapshot: WidgetViewSnapshot;
  };
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
const BACKUP_FORMAT = "ipxdata-widget-view-backup";
const BACKUP_MAX_LENGTH = 10_000_000;
const OCCUPANCY_SCENARIO_DEPENDENCY_KEYS = [
  "ipxdata.occupancy-custom-widgets.v1",
  "ipxdata.occupancy-widget-settings.v1",
] as const;
const DEMOGRAPHICS_SURFACE_DEPENDENCY_KEY = "ipxdata.demographics-range.v1";

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
  demographics: [/^ipxdata\.demographics-range\.v1$/],
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
      writeUserGridPreference(storageKey, JSON.stringify(result));
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

  writeUserGridPreference(
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
    loadWidgetViewPresets(menuKey, companyId, userId, presetNamespace).filter(
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
    loadWidgetViewPresets(menuKey, companyId, userId, presetNamespace).map(
      (preset) => ({
        ...preset,
        isDefault: preset.id === presetId,
      }),
    ),
    companyId,
    userId,
    presetNamespace,
  );
}

/** A portable backup contains one saved view, never the user's entire grid. */
export function serializeWidgetViewBackup(
  preset: WidgetViewPreset,
  {
    companyId,
    presetNamespace = preset.snapshot.menuKey,
  }: {
    companyId?: string | null;
    presetNamespace?: WidgetViewPresetNamespace;
  },
) {
  const cleanCompanyId = companyId?.trim();
  const menuKey = preset.snapshot.menuKey;
  const namespace = resolvePresetNamespace(menuKey, presetNamespace);
  const normalized = normalizePreset(preset, menuKey);
  if (!cleanCompanyId || namespace !== presetNamespace || !normalized) {
    throw new Error("Não foi possível exportar esta visão salva.");
  }
  assertCompleteCustomWidgetDependency(normalized.snapshot, namespace);
  assertBackupSnapshot(preset.snapshot, normalized.snapshot, menuKey, namespace);

  const backup: WidgetViewBackup = {
    companyId: cleanCompanyId,
    exportedAt: new Date().toISOString(),
    format: BACKUP_FORMAT,
    menuKey,
    presetNamespace: namespace,
    version: 1,
    view: { name: normalized.name, snapshot: normalized.snapshot },
  };
  const serialized = JSON.stringify(backup, null, 2);
  if (serialized.length > BACKUP_MAX_LENGTH) {
    throw new Error("O backup da visão excede o tamanho permitido.");
  }
  return serialized;
}

/** Validates tenant and surface before the caller may save or apply the view. */
export function parseWidgetViewBackup(
  raw: string,
  {
    companyId,
    menuKey,
    presetNamespace = menuKey,
  }: {
    companyId?: string | null;
    menuKey: CardMenuKey;
    presetNamespace?: WidgetViewPresetNamespace;
  },
): Pick<WidgetViewBackup["view"], "name" | "snapshot"> {
  if (typeof raw !== "string" || !raw.trim() || raw.length > BACKUP_MAX_LENGTH) {
    throw new Error("Arquivo de backup vazio ou grande demais.");
  }
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) {
    throw new Error("Selecione uma empresa antes de importar a visão.");
  }
  const namespace = resolvePresetNamespace(menuKey, presetNamespace);
  if (namespace !== presetNamespace) {
    throw new Error("Esta visão não pertence à tela atual.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("O arquivo não contém um backup JSON válido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Formato de backup inválido.");
  }
  const backup = parsed as Record<string, unknown>;
  if (backup.format !== BACKUP_FORMAT || backup.version !== 1) {
    throw new Error("Formato ou versão de backup não suportado.");
  }
  if (backup.companyId !== cleanCompanyId) {
    throw new Error("Este backup pertence a outra empresa.");
  }
  if (backup.menuKey !== menuKey || backup.presetNamespace !== namespace) {
    throw new Error("Este backup pertence a outra tela.");
  }
  const view = backup.view;
  if (!view || typeof view !== "object" || Array.isArray(view)) {
    throw new Error("A visão do backup é inválida.");
  }
  const record = view as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const snapshot = normalizeSnapshot(record.snapshot, menuKey);
  if (!name || !snapshot) {
    throw new Error("A visão do backup é inválida.");
  }
  assertCompleteCustomWidgetDependency(snapshot, namespace);
  assertBackupSnapshot(record.snapshot, snapshot, menuKey, namespace);
  return { name, snapshot };
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
  const occupancyScenarioId =
    menuKey === "occupancy" ? occupancyAnalysisScenarioId(viewId) : null;
  const demographicsSurfaceId =
    menuKey === "demographics" ? demographicSurfaceId(viewId) : null;
  const dependentScopes: WidgetViewSnapshot["dependentScopes"] = [
    ...(occupancyScenarioId ? ["occupancy-scenario" as const] : []),
    ...(demographicsSurfaceId ? ["demographics-surface" as const] : []),
  ];

  return {
    cardIds: uniqueStrings(cardIds),
    capturedAt: new Date().toISOString(),
    ...(dependentScopes.length ? { dependentScopes } : {}),
    menuKey,
    preferences:
      preferences ??
      loadScopedCardPreferences(menuKey, cardIds, companyId, userId, viewId),
    sourceScope,
    storage: [
      ...captureMenuStorage(menuKey, companyId, userId, viewId),
      ...(occupancyScenarioId
        ? captureOccupancyScenarioDependency(
            companyId,
            userId,
            occupancyScenarioId,
          )
        : []),
      ...(demographicsSurfaceId
        ? captureDemographicsSurfaceDependency(
            companyId,
            userId,
            demographicsSurfaceId,
          )
        : []),
    ],
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
  const hasOccupancyScenarioDependency = snapshot.dependentScopes?.includes(
    "occupancy-scenario",
  );
  const targetScenarioId = hasOccupancyScenarioDependency
    ? occupancyAnalysisScenarioId(targetViewId)
    : null;
  const hasDemographicsSurfaceDependency = snapshot.dependentScopes?.includes(
    "demographics-surface",
  );
  const targetDemographicsSurfaceId = hasDemographicsSurfaceDependency
    ? demographicSurfaceId(targetViewId)
    : null;
  if (
    (hasOccupancyScenarioDependency && !targetScenarioId) ||
    (hasDemographicsSurfaceDependency && !targetDemographicsSurfaceId) ||
    (snapshot.storage.some((entry) => entry.scope === "occupancy-scenario") &&
      !targetScenarioId) ||
    (snapshot.storage.some((entry) => entry.scope === "demographics-surface") &&
      !targetDemographicsSurfaceId)
  ) return false;

  clearMenuStorage(snapshot.menuKey, companyId, userId, targetViewId);
  if (targetScenarioId) {
    OCCUPANCY_SCENARIO_DEPENDENCY_KEYS.forEach((baseKey) => {
      removeUserGridPreference(
        scopedStorageKey(baseKey, companyId, userId, targetScenarioId),
      );
    });
  }
  if (targetDemographicsSurfaceId) {
    removeUserGridPreference(
      scopedStorageKey(
        DEMOGRAPHICS_SURFACE_DEPENDENCY_KEY,
        companyId,
        userId,
        targetDemographicsSurfaceId,
      ),
    );
  }
  snapshot.storage.forEach((entry) => {
    const entryViewId = entry.scope === "occupancy-scenario"
      ? targetScenarioId
      : entry.scope === "demographics-surface"
        ? targetDemographicsSurfaceId
        : targetViewId;
    const sourceRemapScope =
      entry.scope === "occupancy-scenario" && snapshot.sourceScope
        ? {
            id: occupancyAnalysisScenarioId(snapshot.sourceScope.id) ?? "",
            name: snapshot.sourceScope.name,
          }
        : snapshot.sourceScope;
    const targetRemapScope =
      entry.scope === "occupancy-scenario" && targetScenarioId
        ? { id: targetScenarioId, name: targetScope?.name ?? "" }
        : targetScope;
    writeUserGridPreference(
      scopedStorageKey(entry.baseKey, companyId, userId, entryViewId),
      remapSerializedValue(entry.value, sourceRemapScope, targetRemapScope),
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
  writeUserGridPreference(
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

  return entries.sort((left, right) =>
    left.baseKey.localeCompare(right.baseKey),
  );
}

function captureOccupancyScenarioDependency(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  scenarioId: string,
): WidgetViewStorageEntry[] {
  return OCCUPANCY_SCENARIO_DEPENDENCY_KEYS.flatMap((baseKey) => {
    const stored = readUserViewScopedStorageEntry(
      baseKey,
      companyId,
      userId,
      scenarioId,
    );
    return stored
      ? [{ baseKey, scope: "occupancy-scenario" as const, value: stored.value }]
      : [];
  });
}

function captureDemographicsSurfaceDependency(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  surfaceId: "analysis" | "reports",
): WidgetViewStorageEntry[] {
  const stored = readUserViewScopedStorageEntry(
    DEMOGRAPHICS_SURFACE_DEPENDENCY_KEY,
    companyId,
    userId,
    surfaceId,
  );
  return stored
    ? [{
        baseKey: DEMOGRAPHICS_SURFACE_DEPENDENCY_KEY,
        scope: "demographics-surface",
        value: stored.value,
      }]
    : [];
}

function occupancyAnalysisScenarioId(viewId?: string | null) {
  return viewId?.startsWith("analysis:") && viewId.length > "analysis:".length
    ? viewId.slice("analysis:".length)
    : null;
}

function demographicSurfaceId(viewId?: string | null) {
  if (viewId === "demographics-analysis") return "analysis";
  if (viewId === "demographics-reports") return "reports";
  return null;
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

  keys.forEach((key) => removeUserGridPreference(key));
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
    return value.map((item) => remapValue(item, sourceScope, targetScope));
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
          remapValue(sourceEntry[1], sourceScope, targetScope, targetScope.id),
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
  return (
    baseKey.length <= 200 &&
    /^ipxdata\.[a-zA-Z0-9._-]+$/.test(baseKey) &&
    !/\.(?:company|user|view)\./.test(baseKey) &&
    menuStorageMatchers[menuKey].some((matcher) => matcher.test(baseKey))
  );
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
  return getUserViewScopedStorageKey(marker, companyId, userId, viewId).slice(
    marker.length,
  );
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
  writeUserGridPreference(storageKey, serialized);
  requestUserGridSync();
  return serialized;
}

function occupancyPresetBelongsToNamespace(
  preset: WidgetViewPreset,
  namespace: WidgetViewPresetNamespace,
) {
  const scopeId = preset.snapshot.sourceScope?.id ?? "";
  if (namespace === "occupancy-analysis")
    return scopeId.startsWith("analysis:");
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

function presetStorageBaseKey(presetNamespace: WidgetViewPresetNamespace) {
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
  const requestedDependentScopes = Array.isArray(record.dependentScopes)
    ? record.dependentScopes
    : [];
  const dependentScopes: WidgetViewSnapshot["dependentScopes"] = [
    ...(menuKey === "occupancy" &&
    occupancyAnalysisScenarioId(sourceScope?.id) &&
    requestedDependentScopes.includes("occupancy-scenario")
      ? ["occupancy-scenario" as const]
      : []),
    ...(menuKey === "demographics" &&
    demographicSurfaceId(sourceScope?.id) &&
    requestedDependentScopes.includes("demographics-surface")
      ? ["demographics-surface" as const]
      : []),
  ];
  const storage = Array.isArray(record.storage)
    ? record.storage.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        const scope =
          item.scope === "occupancy-scenario" &&
          dependentScopes.includes("occupancy-scenario") &&
          OCCUPANCY_SCENARIO_DEPENDENCY_KEYS.includes(
            item.baseKey as (typeof OCCUPANCY_SCENARIO_DEPENDENCY_KEYS)[number],
          )
            ? "occupancy-scenario" as const
            : item.scope === "demographics-surface" &&
                dependentScopes.includes("demographics-surface") &&
                item.baseKey === DEMOGRAPHICS_SURFACE_DEPENDENCY_KEY
              ? "demographics-surface" as const
            : item.scope === undefined
              ? undefined
              : null;
        return typeof item.baseKey === "string" &&
          typeof item.value === "string" &&
          matchesMenuStorage(menuKey, item.baseKey) &&
          scope !== null
          ? [{ baseKey: item.baseKey, ...(scope ? { scope } : {}), value: item.value }]
          : [];
      })
    : [];
  const preferences = Array.isArray(record.preferences)
    ? record.preferences.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        if (typeof item.id !== "string") return [];
        const demographicDimension =
          menuKey === "demographics"
            ? demographicDimensionForCard(item.id)
            : undefined;
        const scenarioSelectionMode =
          item.scenarioSelectionMode === "all" ||
          item.scenarioSelectionMode === "custom"
            ? item.scenarioSelectionMode
            : undefined;
        const scenarioIds = uniqueStrings(item.scenarioIds);
        const scenarioOrder = uniqueStrings(item.scenarioOrder);
        return [
          {
            chartType:
              item.chartType === "bar" ||
              item.chartType === "line" ||
              item.chartType === "rose" ||
              item.chartType === "treemap"
                ? item.chartType
                : undefined,
            color: typeof item.color === "string" ? item.color : undefined,
            ...(demographicDimension && item.demographics !== undefined
              ? {
                  demographics: normalizeDemographicPresentation(
                    item.demographics,
                    demographicDimension,
                  ),
                }
              : {}),
            ...(menuKey === "demographics" &&
            isDemographicTemporalWidgetId(item.id) &&
            item.demographicsTemporal !== undefined
              ? {
                  demographicsTemporal: normalizeDemographicTemporalSettings(
                    item.demographicsTemporal,
                    item.id,
                  ),
                }
              : {}),
            height:
              item.height === "short" ||
              item.height === "standard" ||
              item.height === "tall"
                ? item.height
                : undefined,
            heightLevel: normalizeCardLayoutLevel(item.heightLevel),
            id: item.id,
            ...(scenarioSelectionMode === "custom" && scenarioIds.length
              ? { scenarioIds }
              : {}),
            ...(scenarioOrder.length ? { scenarioOrder } : {}),
            ...(scenarioSelectionMode ? { scenarioSelectionMode } : {}),
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
            ...(isAllowedViewPalette(menuKey, item.viewPaletteId)
              ? { viewPaletteId: item.viewPaletteId }
              : {}),
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
    ...(dependentScopes.length ? { dependentScopes } : {}),
    menuKey,
    preferences,
    sourceScope,
    storage,
    version: 1,
  };
}

function assertBackupSnapshot(
  raw: unknown,
  normalized: WidgetViewSnapshot,
  menuKey: CardMenuKey,
  namespace: WidgetViewPresetNamespace,
) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("A configuração da visão no backup é inválida.");
  }
  const record = raw as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.menuKey !== menuKey ||
    !Array.isArray(record.cardIds) ||
    record.cardIds.length !== normalized.cardIds.length ||
    !Array.isArray(record.preferences) ||
    record.preferences.length !== normalized.preferences.length ||
    !Array.isArray(record.storage) ||
    record.storage.length !== normalized.storage.length
  ) {
    throw new Error("A configuração da visão no backup é inválida.");
  }
  if (
    record.sourceScope !== null &&
    (!record.sourceScope ||
      typeof record.sourceScope !== "object" ||
      Array.isArray(record.sourceScope) ||
      !normalized.sourceScope)
  ) {
    throw new Error("A origem da visão no backup é inválida.");
  }
  for (let index = 0; index < record.preferences.length; index += 1) {
    const item = record.preferences[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rawPalette = (item as Record<string, unknown>).viewPaletteId;
    if (
      rawPalette !== undefined &&
      rawPalette !== normalized.preferences[index]?.viewPaletteId
    ) {
      throw new Error("A paleta da visão no backup é inválida.");
    }
  }

  const rawDependentScopes = record.dependentScopes;
  const hasScenarioDependency = normalized.dependentScopes?.includes(
    "occupancy-scenario",
  );
  const hasDemographicsSurfaceDependency = normalized.dependentScopes?.includes(
    "demographics-surface",
  );
  if (
    rawDependentScopes !== undefined &&
    (!Array.isArray(rawDependentScopes) ||
      rawDependentScopes.length !== normalized.dependentScopes?.length)
  ) {
    throw new Error("A dependência da visão no backup é inválida.");
  }
  if (
    hasScenarioDependency &&
    (menuKey !== "occupancy" ||
      namespace !== "occupancy-analysis" ||
      !occupancyAnalysisScenarioId(normalized.sourceScope?.id))
  ) {
    throw new Error("A dependência da visão não pertence a esta tela.");
  }
  if (
    hasDemographicsSurfaceDependency &&
    (menuKey !== "demographics" ||
      namespace !== "demographics" ||
      !demographicSurfaceId(normalized.sourceScope?.id))
  ) {
    throw new Error("A dependência da visão não pertence a esta tela.");
  }

  const seenStorageKeys = new Set<string>();
  for (const entry of normalized.storage) {
    const identity = `${entry.scope ?? "view"}:${entry.baseKey}`;
    if (seenStorageKeys.has(identity)) {
      throw new Error("O backup contém configurações duplicadas.");
    }
    seenStorageKeys.add(identity);
    if (entry.scope === "occupancy-scenario" && !hasScenarioDependency) {
      throw new Error("O backup contém uma dependência sem origem válida.");
    }
    if (
      entry.scope === "demographics-surface" &&
      !hasDemographicsSurfaceDependency
    ) {
      throw new Error("O backup contém uma dependência sem origem válida.");
    }
    try {
      JSON.parse(entry.value);
    } catch {
      throw new Error("O backup contém uma configuração de widget inválida.");
    }
  }
}

function assertCompleteCustomWidgetDependency(
  snapshot: WidgetViewSnapshot,
  namespace: WidgetViewPresetNamespace,
) {
  if (
    namespace === "occupancy-analysis" &&
    [...snapshot.cardIds, ...snapshot.preferences.map(({ id }) => id)].some(
      (id) => id.startsWith("occupancy_custom_"),
    ) &&
    !snapshot.dependentScopes?.includes("occupancy-scenario")
  ) {
    throw new Error(
      "Atualize esta visão salva antes de exportar os widgets personalizados.",
    );
  }
}

function isAllowedViewPalette(
  menuKey: CardMenuKey,
  value: unknown,
): value is DemographicPaletteId {
  const choices = menuKey === "demographics"
    ? DEMOGRAPHICS_PALETTES
    : OCCUPANCY_COLOR_PALETTES;
  return choices.some((palette) => palette.id === value);
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
