"use client";

import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import type {
  ScenarioAnalyticsGranularity,
  ScenarioSelectionMode,
} from "@/lib/scenario-analytics";

export type PeriodAnalysisWidgetKind =
  | "summary"
  | "timeline"
  | "comparison"
  | "ranking"
  | "heatmap"
  | "cumulative"
  | "trend"
  | "hour_profile"
  | "hourly_occupancy"
  | "peak_days"
  | "rose"
  | "totals_table";

export type PeriodAnalysisBaseline =
  | "previous_period"
  | "previous_month"
  | "last_year";

export type PeriodAnalysisWidget = {
  baseline: PeriodAnalysisBaseline;
  createdAt: string;
  entryScenarioIds: string[];
  exitScenarioIds: string[];
  granularity: ScenarioAnalyticsGranularity;
  id: string;
  kind: PeriodAnalysisWidgetKind;
  scenarioIds: string[];
  selectionMode: ScenarioSelectionMode;
  startHour: number;
  title: string;
  updatedAt: string;
};

export type PeriodAnalysisWidgetInput = Omit<
  PeriodAnalysisWidget,
  "createdAt" | "id" | "updatedAt"
> & {
  id?: string;
};

export type PeriodAnalysisSettings = {
  from: string;
  mode: "day" | "range";
  to: string;
};

export const PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT =
  "ipxdata:period-analysis-widgets-updated";

const WIDGETS_STORAGE_KEY = "ipxdata.period-analysis-widgets.v1";
const WIDGETS_SCHEMA_VERSION_KEY = "ipxdata.period-analysis-widgets.schema.v2";
const SETTINGS_STORAGE_KEY = "ipxdata.period-analysis-settings.v1";

const defaultWidgetDefinitions: Array<
  Pick<PeriodAnalysisWidget, "id" | "kind" | "title" | "granularity" | "baseline">
> = [
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_summary",
    kind: "summary",
    title: "Resumo do período",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_timeline",
    kind: "timeline",
    title: "Fluxo por período",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_comparison",
    kind: "comparison",
    title: "Comparativo de cenários",
  },
  {
    baseline: "previous_period",
    granularity: "hour",
    id: "analysis_heatmap",
    kind: "heatmap",
    title: "Mapa de calor dia x hora",
  },
  {
    baseline: "previous_period",
    granularity: "hour",
    id: "analysis_hourly_occupancy",
    kind: "hourly_occupancy",
    title: "Ocupação hora a hora",
  },
  {
    baseline: "previous_month",
    granularity: "day",
    id: "analysis_cumulative",
    kind: "cumulative",
    title: "Acumulado diário x base",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_trend",
    kind: "trend",
    title: "Tendência 7 x 30 dias",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_ranking",
    kind: "ranking",
    title: "Ranking de cenários",
  },
  {
    baseline: "previous_period",
    granularity: "hour",
    id: "analysis_hour_profile",
    kind: "hour_profile",
    title: "Perfil horário",
  },
];

export function createDefaultPeriodAnalysisWidgets() {
  const now = new Date().toISOString();
  return defaultWidgetDefinitions.map<PeriodAnalysisWidget>((widget) => ({
    ...widget,
    createdAt: now,
    entryScenarioIds: [],
    exitScenarioIds: [],
    scenarioIds: [],
    selectionMode: "all",
    startHour: 0,
    updatedAt: now,
  }));
}

export function createDefaultPeriodAnalysisSettings(
  now = new Date(),
): PeriodAnalysisSettings {
  const date = formatDateInput(now);

  return { from: date, mode: "day", to: date };
}

export function loadPeriodAnalysisWidgets(
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window === "undefined") return createDefaultPeriodAnalysisWidgets();

  try {
    const stored = window.localStorage.getItem(
      scopedKey(WIDGETS_STORAGE_KEY, companyId, userId),
    );
    if (stored === null) {
      return migratePeriodAnalysisWidgets(
        createDefaultPeriodAnalysisWidgets(),
        companyId,
        userId,
      );
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return createDefaultPeriodAnalysisWidgets();
    const normalized = parsed
      .map(normalizeWidget)
      .filter((widget): widget is PeriodAnalysisWidget => Boolean(widget));
    return migratePeriodAnalysisWidgets(normalized, companyId, userId);
  } catch {
    return createDefaultPeriodAnalysisWidgets();
  }
}

export function savePeriodAnalysisWidgets(
  widgets: PeriodAnalysisWidget[],
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window === "undefined") return widgets;
  const normalized = widgets
    .map(normalizeWidget)
    .filter((widget): widget is PeriodAnalysisWidget => Boolean(widget));
  window.localStorage.setItem(
    scopedKey(WIDGETS_STORAGE_KEY, companyId, userId),
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent(PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT, {
      detail: { companyId, userId },
    }),
  );
  return normalized;
}

export function upsertPeriodAnalysisWidget(
  input: PeriodAnalysisWidgetInput,
  companyId?: string | null,
  userId?: string | null,
) {
  const widgets = loadPeriodAnalysisWidgets(companyId, userId);
  const current = input.id
    ? widgets.find((widget) => widget.id === input.id)
    : undefined;
  const now = new Date().toISOString();
  const widget: PeriodAnalysisWidget = {
    baseline: input.baseline,
    createdAt: current?.createdAt ?? now,
    entryScenarioIds: normalizeIds(input.entryScenarioIds),
    exitScenarioIds: normalizeIds(input.exitScenarioIds).filter(
      (scenarioId) => !input.entryScenarioIds.includes(scenarioId),
    ),
    granularity: input.granularity,
    id: input.id || createWidgetId(),
    kind: input.kind,
    scenarioIds: input.scenarioIds,
    selectionMode: input.selectionMode,
    startHour: normalizeHour(input.startHour),
    title: input.title.trim() || widgetKindLabel(input.kind),
    updatedAt: now,
  };
  const next = current
    ? widgets.map((stored) => (stored.id === widget.id ? widget : stored))
    : [...widgets, widget];

  return savePeriodAnalysisWidgets(next, companyId, userId);
}

export function deletePeriodAnalysisWidget(
  widgetId: string,
  companyId?: string | null,
  userId?: string | null,
) {
  return savePeriodAnalysisWidgets(
    loadPeriodAnalysisWidgets(companyId, userId).filter(
      (widget) => widget.id !== widgetId,
    ),
    companyId,
    userId,
  );
}

export function loadPeriodAnalysisSettings(
  companyId?: string | null,
  userId?: string | null,
) {
  const defaults = createDefaultPeriodAnalysisSettings();
  if (typeof window === "undefined") return defaults;

  try {
    const stored = window.localStorage.getItem(
      scopedKey(SETTINGS_STORAGE_KEY, companyId, userId),
    );
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<PeriodAnalysisSettings>;
    const from = isDateInput(parsed.from) ? parsed.from : defaults.from;
    const to = isDateInput(parsed.to) ? parsed.to : defaults.to;
    const storedMode =
      parsed.mode === "day" || parsed.mode === "range"
        ? parsed.mode
        : from === to
          ? "day"
          : "range";
    const mode = storedMode === "range" && from === to ? "day" : storedMode;
    return mode === "day" ? { from, mode, to: from } : { from, mode, to };
  } catch {
    return defaults;
  }
}

export function savePeriodAnalysisSettings(
  settings: PeriodAnalysisSettings,
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      scopedKey(SETTINGS_STORAGE_KEY, companyId, userId),
      JSON.stringify(settings),
    );
  }
  return settings;
}

export function widgetKindLabel(kind: PeriodAnalysisWidgetKind) {
  return (
    {
      comparison: "Comparativo de cenários",
      cumulative: "Acumulado diário x base",
      heatmap: "Mapa de calor dia x hora",
      hour_profile: "Perfil horário",
      hourly_occupancy: "Ocupação hora a hora",
      peak_days: "Top 5 dias de pico",
      ranking: "Ranking de cenários",
      rose: "Composição por cenário",
      summary: "Resumo do período",
      timeline: "Fluxo por período",
      totals_table: "Totais por cenário",
      trend: "Tendência 7 x 30 dias",
    } satisfies Record<PeriodAnalysisWidgetKind, string>
  )[kind];
}

function normalizeWidget(value: unknown): PeriodAnalysisWidget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !isWidgetKind(record.kind) ||
    typeof record.title !== "string"
  ) {
    return null;
  }

  return {
    baseline: isBaseline(record.baseline)
      ? record.baseline
      : "previous_period",
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date().toISOString(),
    entryScenarioIds: normalizeIds(record.entryScenarioIds),
    exitScenarioIds: normalizeIds(record.exitScenarioIds).filter(
      (scenarioId) => !normalizeIds(record.entryScenarioIds).includes(scenarioId),
    ),
    granularity: record.granularity === "hour" ? "hour" : "day",
    id: record.id,
    kind: record.kind,
    scenarioIds: normalizeIds(record.scenarioIds),
    selectionMode: record.selectionMode === "custom" ? "custom" : "all",
    startHour: normalizeHour(record.startHour),
    title: record.title,
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : new Date().toISOString(),
  };
}

function isWidgetKind(value: unknown): value is PeriodAnalysisWidgetKind {
  return [
    "summary",
    "timeline",
    "comparison",
    "ranking",
    "heatmap",
    "cumulative",
    "trend",
    "hour_profile",
    "hourly_occupancy",
    "peak_days",
    "rose",
    "totals_table",
  ].includes(String(value));
}

function migratePeriodAnalysisWidgets(
  widgets: PeriodAnalysisWidget[],
  companyId?: string | null,
  userId?: string | null,
) {
  const versionKey = scopedKey(
    WIDGETS_SCHEMA_VERSION_KEY,
    companyId,
    userId,
  );
  if (window.localStorage.getItem(versionKey) === "2") return widgets;

  const occupancyDefault = createDefaultPeriodAnalysisWidgets().find(
    (widget) => widget.kind === "hourly_occupancy",
  );
  const migrated =
    occupancyDefault &&
    !widgets.some((widget) => widget.kind === "hourly_occupancy")
      ? [...widgets, occupancyDefault]
      : widgets;

  window.localStorage.setItem(
    scopedKey(WIDGETS_STORAGE_KEY, companyId, userId),
    JSON.stringify(migrated),
  );
  window.localStorage.setItem(versionKey, "2");
  return migrated;
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (scenarioId): scenarioId is string =>
              typeof scenarioId === "string" && Boolean(scenarioId.trim()),
          ),
        ),
      )
    : [];
}

function normalizeHour(value: unknown) {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0;
}

function isBaseline(value: unknown): value is PeriodAnalysisBaseline {
  return ["previous_period", "previous_month", "last_year"].includes(
    String(value),
  );
}

function isDateInput(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scopedKey(
  baseKey: string,
  companyId?: string | null,
  userId?: string | null,
) {
  return getUserViewScopedStorageKey(baseKey, companyId, userId);
}

function createWidgetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `analysis-widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
