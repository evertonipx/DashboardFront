"use client";

import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import { writeUserGridPreference } from "@/lib/user-grid-local";
import type {
  ScenarioAnalyticsGranularity,
  ScenarioSelectionMode,
} from "@/lib/scenario-analytics";
import type { PeriodAnalysisScopeMode } from "@/lib/period-analysis-scope";

export type PeriodAnalysisWidgetKind =
  | "day_total"
  | "target_progress"
  | "cumulative_metric"
  | "daily_comparison"
  | "year_monthly"
  | "year_accumulated"
  | "summary"
  | "timeline"
  | "comparison"
  | "ranking"
  | "heatmap"
  | "cumulative"
  | "scenario_cumulative"
  | "trend"
  | "hour_profile"
  | "hourly_occupancy"
  | "peak_days"
  | "rose"
  | "scope_totals"
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
  scopeMode: PeriodAnalysisScopeMode;
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
const WIDGETS_SCHEMA_VERSION_KEY = "ipxdata.period-analysis-widgets.schema.v5";
const SETTINGS_STORAGE_KEY = "ipxdata.period-analysis-settings.v1";

const defaultWidgetDefinitions: Array<
  Pick<PeriodAnalysisWidget, "id" | "kind" | "title" | "granularity" | "baseline">
> = [
  {
    baseline: "previous_period",
    granularity: "hour",
    id: "analysis_day_total",
    kind: "day_total",
    title: "Total do dia",
  },
  {
    baseline: "previous_month",
    granularity: "day",
    id: "analysis_target_progress",
    kind: "target_progress",
    title: "Dia x média-base",
  },
  {
    baseline: "previous_month",
    granularity: "day",
    id: "analysis_month_previous_metric",
    kind: "cumulative_metric",
    title: "Acumulado x mês anterior",
  },
  {
    baseline: "last_year",
    granularity: "day",
    id: "analysis_month_year_metric",
    kind: "cumulative_metric",
    title: "Acumulado x ano anterior",
  },
  {
    baseline: "previous_period",
    granularity: "hour",
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
    id: "analysis_daily_comparison",
    kind: "daily_comparison",
    title: "Dias x meses",
  },
  {
    baseline: "previous_month",
    granularity: "month",
    id: "analysis_year_monthly",
    kind: "year_monthly",
    title: "Comparativo mensal por ano",
  },
  {
    baseline: "previous_month",
    granularity: "month",
    id: "analysis_year_accumulated",
    kind: "year_accumulated",
    title: "Comparativo acumulado por ano",
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
    granularity: "day",
    id: "analysis_peak_days",
    kind: "peak_days",
    title: "Top 5 dias de pico",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_rose",
    kind: "rose",
    title: "Composição por cenário",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_scenario_cumulative",
    kind: "scenario_cumulative",
    title: "Acumulado por cenário",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_scope_totals",
    kind: "scope_totals",
    title: "Totais por visão",
  },
  {
    baseline: "previous_period",
    granularity: "day",
    id: "analysis_totals_table",
    kind: "totals_table",
    title: "Tabela acumulada por cenário",
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
    scopeMode: "scenario",
    startHour: 0,
    updatedAt: now,
  }));
}

export function createDefaultPeriodAnalysisSettings(
  now = new Date(),
): PeriodAnalysisSettings {
  const previousDay = new Date(now);
  previousDay.setDate(previousDay.getDate() - 1);
  const date = formatDateInput(previousDay);

  return { from: date, mode: "day", to: date };
}

export function loadPeriodAnalysisWidgets(
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window === "undefined") return createDefaultPeriodAnalysisWidgets();

  try {
    const stored = readUserViewScopedStorageEntry(
      WIDGETS_STORAGE_KEY,
      companyId,
      userId,
    );
    if (!stored) {
      return migratePeriodAnalysisWidgets(
        createDefaultPeriodAnalysisWidgets(),
        companyId,
        userId,
      );
    }
    const parsed = JSON.parse(stored.value) as unknown;
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
  writeUserGridPreference(
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
    scenarioIds: normalizeIds(input.scenarioIds),
    selectionMode: input.selectionMode,
    scopeMode: isPeriodAnalysisScopeMode(input.scopeMode)
      ? input.scopeMode
      : "scenario",
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
  fallback = createDefaultPeriodAnalysisSettings(),
) {
  const defaults = fallback;
  if (typeof window === "undefined") return defaults;

  try {
    const stored = readUserViewScopedStorageEntry(
      SETTINGS_STORAGE_KEY,
      companyId,
      userId,
    );
    if (!stored?.value) return defaults;
    const parsed = JSON.parse(
      stored.value,
    ) as Partial<PeriodAnalysisSettings>;
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
    writeUserGridPreference(
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
      cumulative_metric: "Acumulado x base",
      daily_comparison: "Dias x meses",
      day_total: "Total do dia",
      heatmap: "Mapa de calor dia x hora",
      hour_profile: "Perfil horário",
      hourly_occupancy: "Ocupação hora a hora",
      peak_days: "Top 5 dias de pico",
      ranking: "Ranking de cenários",
      rose: "Composição por cenário",
      scenario_cumulative: "Acumulado por cenário",
      scope_totals: "Totais por visão",
      summary: "Resumo do período",
      timeline: "Fluxo por período",
      totals_table: "Totais por cenário",
      target_progress: "Dia x média-base",
      trend: "Tendência 7 x 30 dias",
      year_accumulated: "Comparativo acumulado por ano",
      year_monthly: "Comparativo mensal por ano",
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
    granularity: isScenarioAnalyticsGranularity(record.granularity)
      ? record.granularity
      : "day",
    id: record.id,
    kind: record.kind,
    scenarioIds: normalizeIds(record.scenarioIds),
    selectionMode: record.selectionMode === "custom" ? "custom" : "all",
    scopeMode: isPeriodAnalysisScopeMode(record.scopeMode)
      ? record.scopeMode
      : "scenario",
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
    "day_total",
    "target_progress",
    "cumulative_metric",
    "daily_comparison",
    "year_monthly",
    "year_accumulated",
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
    "scenario_cumulative",
    "scope_totals",
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
  if (window.localStorage.getItem(versionKey) === "5") return widgets;

  const corrected = widgets.map((widget) =>
    widget.kind === "totals_table" &&
    normalizeTitle(widget.title) === normalizeTitle("Acumulado por cenário")
      ? { ...widget, kind: "scenario_cumulative" as const }
      : widget,
  );
  const defaults = createDefaultPeriodAnalysisWidgets();
  const requiredDefaultIds = new Set([
    "analysis_day_total",
    "analysis_target_progress",
    "analysis_month_previous_metric",
    "analysis_month_year_metric",
    "analysis_daily_comparison",
    "analysis_year_monthly",
    "analysis_year_accumulated",
    "analysis_timeline",
    "analysis_comparison",
    "analysis_heatmap",
    "analysis_hourly_occupancy",
    "analysis_cumulative",
    "analysis_trend",
    "analysis_ranking",
    "analysis_peak_days",
    "analysis_rose",
    "analysis_scenario_cumulative",
    "analysis_scope_totals",
    "analysis_totals_table",
  ]);
  const migrated = defaults
    .filter((widget) => requiredDefaultIds.has(widget.id))
    .reduce(
      (current, defaultWidget) =>
        hasEquivalentWidget(current, defaultWidget)
          ? current
          : [...current, defaultWidget],
      corrected,
    );

  writeUserGridPreference(
    scopedKey(WIDGETS_STORAGE_KEY, companyId, userId),
    JSON.stringify(migrated),
  );
  writeUserGridPreference(versionKey, "5");
  return migrated;
}

function hasEquivalentWidget(
  widgets: PeriodAnalysisWidget[],
  candidate: PeriodAnalysisWidget,
) {
  return widgets.some((widget) => {
    if (widget.id === candidate.id) return true;
    if (widget.kind !== candidate.kind) return false;
    return candidate.kind === "cumulative_metric"
      ? widget.baseline === candidate.baseline
      : true;
  });
}

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
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

function isScenarioAnalyticsGranularity(
  value: unknown,
): value is ScenarioAnalyticsGranularity {
  return ["minute", "hour", "day", "week", "month"].includes(String(value));
}

function isPeriodAnalysisScopeMode(
  value: unknown,
): value is PeriodAnalysisScopeMode {
  return ["scenario", "location", "sub_location"].includes(String(value));
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
