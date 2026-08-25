"use client";

import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import {
  DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
  normalizeOccupancyColorPaletteId,
  type OccupancyColorPaletteId,
} from "@/lib/occupancy-color-palettes";
import type {
  OccupancyComparisonMetricKey,
} from "@/lib/occupancy-comparison";
import {
  normalizeOccupancyHexLayout,
  normalizeOccupancyLayoutPreset,
  OCCUPANCY_HEX_MAX_COLUMNS,
  OCCUPANCY_HEX_MIN_COLUMNS,
  type OccupancyHexLayout,
  type OccupancyLayoutPreset,
} from "@/lib/occupancy-hex-layout";

export type OccupancyHalfDonutMode = "status" | "actual";
export type OccupancyComparisonChartType =
  | "half_donut"
  | "bars"
  | "vertical_bars";
export type OccupancyHexDisplayMode = "actual" | "status";

export const OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION = 4 as const;

export type OccupancyStatusColorPreset =
  | "availability"
  | "productivity"
  | "neutral"
  | "custom";

export type OccupancyStatusColors = {
  occupied: string;
  preset: OccupancyStatusColorPreset;
  unoccupied: string;
};

export type OccupancyStatusColorPresetOption = {
  colors: Omit<OccupancyStatusColors, "preset">;
  description: string;
  id: Exclude<OccupancyStatusColorPreset, "custom">;
  label: string;
};

export const OCCUPANCY_STATUS_COLOR_PRESETS = [
  {
    colors: { occupied: "#C2410C", unoccupied: "#0F766E" },
    description: "Vagas, mesas ou recursos livres são o estado favorável.",
    id: "availability",
    label: "Disponibilidade",
  },
  {
    colors: { occupied: "#0F766E", unoccupied: "#B91C1C" },
    description: "Atendimento, filas ou equipes ocupadas são o estado favorável.",
    id: "productivity",
    label: "Produtividade",
  },
  {
    colors: { occupied: "#2563EB", unoccupied: "#64748B" },
    description: "Diferencia os estados sem indicar resultado positivo ou negativo.",
    id: "neutral",
    label: "Neutro",
  },
] as const satisfies readonly OccupancyStatusColorPresetOption[];

export const DEFAULT_OCCUPANCY_STATUS_COLORS: OccupancyStatusColors = {
  ...OCCUPANCY_STATUS_COLOR_PRESETS[2].colors,
  preset: "neutral",
};

export type OccupancyWidgetSettings = {
  capacities: Record<string, number>;
  colorPaletteId: OccupancyColorPaletteId;
  comparisonChartType: OccupancyComparisonChartType;
  comparisonMode: OccupancyHalfDonutMode;
  dayCount: 7 | 14 | 30;
  heatmapScenarioId: string;
  hexColorPaletteId: OccupancyColorPaletteId;
  hexColumns: number;
  hexDisplayMode: OccupancyHexDisplayMode;
  hexLayout: OccupancyHexLayout | null;
  hexPreset: OccupancyLayoutPreset;
  hexStatusColors: OccupancyStatusColors;
  metric: OccupancyComparisonMetricKey;
  scenarioHourHeatmapDateKey: string;
  scenarioIds: string[];
  schemaVersion: typeof OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION;
};

export const OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT =
  "ipxdata:occupancy-widget-settings-updated";
export const OCCUPANCY_WIDGET_SETTINGS_KEY =
  "ipxdata.occupancy-widget-settings.v1";

export const DEFAULT_OCCUPANCY_WIDGET_SETTINGS: OccupancyWidgetSettings = {
  capacities: {},
  colorPaletteId: DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
  comparisonChartType: "half_donut",
  comparisonMode: "status",
  dayCount: 7,
  heatmapScenarioId: "",
  hexColorPaletteId: DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
  hexColumns: 4,
  hexDisplayMode: "actual",
  hexLayout: null,
  hexPreset: "queue",
  hexStatusColors: { ...DEFAULT_OCCUPANCY_STATUS_COLORS },
  metric: "average",
  scenarioHourHeatmapDateKey: "",
  scenarioIds: [],
  schemaVersion: OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
};

export function normalizeOccupancyWidgetSettings(
  value: unknown,
): OccupancyWidgetSettings {
  const record = isRecord(value) ? value : {};
  return {
    capacities: normalizeCapacities(record.capacities),
    colorPaletteId: normalizeOccupancyColorPaletteId(record.colorPaletteId),
    comparisonChartType:
      record.comparisonChartType === "bars" ||
      record.comparisonChartType === "vertical_bars"
        ? record.comparisonChartType
        : "half_donut",
    comparisonMode: record.comparisonMode === "actual" ? "actual" : "status",
    dayCount:
      record.dayCount === 14 || record.dayCount === 30 ? record.dayCount : 7,
    heatmapScenarioId: normalizeId(record.heatmapScenarioId),
    hexColorPaletteId: normalizeOccupancyColorPaletteId(
      Object.prototype.hasOwnProperty.call(record, "hexColorPaletteId")
        ? record.hexColorPaletteId
        : record.colorPaletteId,
    ),
    hexColumns: normalizeHexColumns(record.hexColumns),
    hexDisplayMode: record.hexDisplayMode === "status" ? "status" : "actual",
    hexLayout: normalizeOccupancyHexLayout(record.hexLayout),
    hexPreset: normalizeHexPreset(record.hexPreset),
    hexStatusColors: normalizeOccupancyStatusColors(
      Object.prototype.hasOwnProperty.call(record, "hexStatusColors")
        ? record.hexStatusColors
        : record.comparisonStatusColors,
    ),
    metric: record.metric === "peak" ? "peak" : "average",
    scenarioHourHeatmapDateKey: normalizeDateKey(
      record.scenarioHourHeatmapDateKey,
    ),
    scenarioIds: normalizeIds(record.scenarioIds),
    schemaVersion: OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
  };
}

function normalizeDateKey(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : "";
}

export function occupancyStatusColorsForPreset(
  preset: Exclude<OccupancyStatusColorPreset, "custom">,
): OccupancyStatusColors {
  const option = OCCUPANCY_STATUS_COLOR_PRESETS.find(
    (candidate) => candidate.id === preset,
  );
  const resolved = option ?? OCCUPANCY_STATUS_COLOR_PRESETS[2];
  return { ...resolved.colors, preset: resolved.id };
}

export function normalizeOccupancyStatusColors(
  value: unknown,
): OccupancyStatusColors {
  if (!isRecord(value)) return { ...DEFAULT_OCCUPANCY_STATUS_COLORS };

  const requestedPreset = normalizeStatusColorPreset(value.preset);
  const presetColors =
    requestedPreset === "custom"
      ? DEFAULT_OCCUPANCY_STATUS_COLORS
      : occupancyStatusColorsForPreset(requestedPreset);
  const occupied = normalizeColor(value.occupied) ?? presetColors.occupied;
  const unoccupied = normalizeColor(value.unoccupied) ?? presetColors.unoccupied;

  if (!occupancyStatusColorsAreDistinct({ occupied, unoccupied })) {
    return { ...DEFAULT_OCCUPANCY_STATUS_COLORS };
  }

  const matchingPreset = OCCUPANCY_STATUS_COLOR_PRESETS.find(
    (option) =>
      option.colors.occupied === occupied &&
      option.colors.unoccupied === unoccupied,
  );
  return {
    occupied,
    preset: matchingPreset?.id ?? "custom",
    unoccupied,
  };
}

export function occupancyStatusColorsAreDistinct({
  occupied,
  unoccupied,
}: Pick<OccupancyStatusColors, "occupied" | "unoccupied">) {
  const occupiedRgb = parseHexColor(occupied);
  const unoccupiedRgb = parseHexColor(unoccupied);
  if (!occupiedRgb || !unoccupiedRgb) return false;
  const distanceSquared = occupiedRgb.reduce(
    (total, channel, index) =>
      total + Math.pow(channel - unoccupiedRgb[index], 2),
    0,
  );
  return distanceSquared >= 3_600;
}

export function loadOccupancyWidgetSettings(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") {
    return { ...DEFAULT_OCCUPANCY_WIDGET_SETTINGS };
  }
  try {
    const stored = readUserViewScopedStorageEntry(
      OCCUPANCY_WIDGET_SETTINGS_KEY,
      companyId,
      userId,
      viewId,
    );
    return stored?.value
      ? normalizeOccupancyWidgetSettings(
          JSON.parse(stored.value) as unknown,
        )
      : { ...DEFAULT_OCCUPANCY_WIDGET_SETTINGS };
  } catch {
    return { ...DEFAULT_OCCUPANCY_WIDGET_SETTINGS };
  }
}

export function saveOccupancyWidgetSettings(
  settings: OccupancyWidgetSettings,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const normalized = normalizeOccupancyWidgetSettings(settings);
  if (typeof window === "undefined") return normalized;
  window.localStorage.setItem(
    occupancyWidgetSettingsStorageKey(companyId, userId, viewId),
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent(OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT, {
      detail: { companyId, userId, viewId },
    }),
  );
  return normalized;
}

export function occupancyWidgetSettingsStorageKey(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  return getUserViewScopedStorageKey(
    OCCUPANCY_WIDGET_SETTINGS_KEY,
    companyId,
    userId,
    viewId,
  );
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(normalizeId).filter((id): id is string => Boolean(id))),
  );
}

function normalizeCapacities(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([scenarioId, capacity]) => {
      const id = normalizeId(scenarioId);
      return id &&
        typeof capacity === "number" &&
        Number.isSafeInteger(capacity) &&
        capacity > 0 &&
        capacity <= 1_000_000
        ? [[id, capacity]]
        : [];
    }),
  );
}

function normalizeId(value: unknown) {
  return typeof value === "string" && value.trim() === value && value
    ? value
    : "";
}

function normalizeStatusColorPreset(
  value: unknown,
): OccupancyStatusColorPreset {
  return value === "availability" ||
    value === "productivity" ||
    value === "neutral" ||
    value === "custom"
    ? value
    : "neutral";
}

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value)
    ? value.toUpperCase()
    : null;
}

function parseHexColor(value: string) {
  const normalized = normalizeColor(value);
  if (!normalized) return null;
  return [1, 3, 5].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );
}

function normalizeHexColumns(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= OCCUPANCY_HEX_MIN_COLUMNS &&
    value <= OCCUPANCY_HEX_MAX_COLUMNS
    ? value
    : 4;
}

function normalizeHexPreset(value: unknown): OccupancyLayoutPreset {
  return normalizeOccupancyLayoutPreset(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
