"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Clock3,
  DoorOpen,
  Grid3X3,
  Layers3,
  Plus,
  Settings2,
  Sigma,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { AiAnalysisAction } from "@/components/app/deferred-ai-analysis-action";
import { AnalysisDateRangePicker } from "@/components/app/occupancy-date-range-picker";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import {
  COMPACT_METRIC_LAYOUT_DEFAULTS,
  CompactMetricCard,
} from "@/components/app/compact-metric-card";
import { EChart } from "@/components/app/deferred-echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { applyChartTypePreference } from "@/lib/chart-type-preference";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import { useTheme } from "@/components/app/theme-provider";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { WidgetCardActions } from "@/components/app/widget-card-actions";
import { WidgetTitleText } from "@/components/app/widget-appearance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { hasVisualAdminAccess } from "@/lib/access";
import {
  aggregateBucketInRange,
  endOfAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  clearHourlyAggregateCache,
  fetchBoundedHourlyAggregateRanges,
  type HourlyAggregateCache,
} from "@/lib/aggregate-hour-query";
import { fetchCompleteAggregateRange } from "@/lib/aggregate-range-query";
import {
  reconcileAggregateRows,
  rollupAggregateRows,
} from "@/lib/aggregate-reconciliation";
import { apiFetch } from "@/lib/api";
import { readCameraGroups } from "@/lib/camera-groups";
import { companyDateKey } from "@/lib/company-time-zone";
import {
  normalizeOccupancyAnalysisDateRangeInput,
  shiftOccupancyAnalysisDateInput,
} from "@/lib/occupancy-analysis-window";
import {
  filterScopedApiRows,
  usesMasterCrossCompanyScope,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import { requireCertifiedCountingRuntimeTimeZone } from "@/lib/counting-time-zone";
import { canReadInfrastructureCatalogs } from "@/lib/permissions";
import {
  buildCountingAnalysisRangePlan,
  countingAnalysisHourlyDetailRange,
} from "@/lib/counting-analysis-range-plan";
import {
  requireCameraRows,
  requireInfrastructureRelations,
  requireLocationRows,
  requireSubLocationRows,
} from "@/lib/metadata-validation";
import { buildLiveAnalysisImport } from "@/lib/live-analysis-import";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import {
  buildPeriodAnalysisWidgetModel,
  formatPeriodAnalysisRange,
  isSingleDayAnalysisPeriod,
  periodAnalysisBaselineDataRange,
  periodAnalysisBaselineLabel,
  periodAnalysisBaselineRange,
  periodAnalysisEffectiveGranularity,
  periodAnalysisOperationalRange,
  resolvePeriodAnalysisRange,
  type PeriodAnalysisData,
  type PeriodAnalysisDataset,
  type PeriodAnalysisRange,
  type PeriodAnalysisWidgetModel,
} from "@/lib/period-analysis-model";
import {
  buildPeriodAnalysisScopeOptions,
  periodAnalysisScopeModeLabel,
  periodAnalysisScopeModePluralLabel,
  type PeriodAnalysisScopeMode,
  type PeriodAnalysisScopeOption,
} from "@/lib/period-analysis-scope";
import {
  abortRequest,
  isAbortError,
} from "@/lib/request-cancellation";
import {
  PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT,
  createDefaultPeriodAnalysisSettings,
  deletePeriodAnalysisWidget,
  loadPeriodAnalysisWidgets,
  savePeriodAnalysisSettings,
  savePeriodAnalysisWidgets,
  upsertPeriodAnalysisWidget,
  widgetKindLabel,
  type PeriodAnalysisBaseline,
  type PeriodAnalysisSettings,
  type PeriodAnalysisWidget,
  type PeriodAnalysisWidgetInput,
  type PeriodAnalysisWidgetKind,
} from "@/lib/period-analysis-widgets";
import type { ReportPayload } from "@/lib/report-export";
import {
  buildCombinedScenarioPoints,
  formatOccupancyStartHour,
  scenarioSelectionSummary,
  type ScenarioAnalyticsGranularity,
} from "@/lib/scenario-analytics";
import { inferOccupancyScenarios } from "@/lib/scenario-direction";
import { requireScenarioRows } from "@/lib/scenario-validation";
import type { AggregateGranularity, Location, Scenario } from "@/lib/types";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { cn, formatNumber, formatTime } from "@/lib/utils";
import {
  orderByCardPreferences,
  saveCardPreferences,
  type CardChartType,
} from "@/lib/view-preferences";
import type { WidgetViewPreset } from "@/lib/widget-view-presets";
import { resolveWidgetBentoPreviewKindFromDataKind } from "@/lib/widget-bento-preview-content";

type PeriodAnalysisDashboardProps = {
  manager?: boolean;
};

const MINUTE_MS = 60_000;
const MAX_AI_DAILY_ROWS = 2_000;
const MAX_ANALYSIS_MINUTE_BUCKETS = 20_000;
const MAX_ANALYSIS_DAY_CACHE_ENTRIES = 64;
const DEFAULT_METRIC_TYPE = "count";
const OCCUPANCY_START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const ANALYSIS_READABLE_BADGE_CLASS_NAME =
  "h-auto max-w-full flex-wrap whitespace-normal text-left leading-4 [overflow-wrap:anywhere]";

type AnalysisDayCacheEntry = Readonly<{
  dataset: PeriodAnalysisDataset;
  revision: string;
}>;

type AnalysisDayCache = Map<string, AnalysisDayCacheEntry>;
type PendingAnalysisDayRequest = Readonly<{
  promise: Promise<PeriodAnalysisDataset>;
  revision: string;
  signal?: AbortSignal;
}>;

const pendingAnalysisDayRequests = new WeakMap<
  AnalysisDayCache,
  Map<string, PendingAnalysisDayRequest>
>();
const pendingAnalysisDatasetsBySignal = new WeakMap<
  AbortSignal,
  Map<string, Promise<PeriodAnalysisDataset>>
>();

const widgetKindOptions: Array<{
  description: string;
  group: "indicator" | "period" | "scenario" | "context";
  label: string;
  value: PeriodAnalysisWidgetKind;
}> = [
  {
    description: "Total exclusivo da data ou intervalo consultado.",
    group: "indicator",
    label: "Total do dia",
    value: "day_total",
  },
  {
    description: "Atingimento do dia contra a média diária da base.",
    group: "indicator",
    label: "Dia x média-base",
    value: "target_progress",
  },
  {
    description: "Indicador compacto do acumulado contra a base escolhida.",
    group: "indicator",
    label: "Acumulado x base",
    value: "cumulative_metric",
  },
  {
    description: "Indicadores consolidados da data ou intervalo selecionado.",
    group: "period",
    label: "Resumo do período",
    value: "summary",
  },
  {
    description: "Série combinada por hora ou por dia.",
    group: "period",
    label: "Fluxo por período",
    value: "timeline",
  },
  {
    description: "Uma série por cenário para comparação direta.",
    group: "period",
    label: "Comparativo de cenários",
    value: "comparison",
  },
  {
    description: "Perfil médio das 24 horas do período.",
    group: "period",
    label: "Perfil horário",
    value: "hour_profile",
  },
  {
    description: "Entradas menos saídas, acumuladas a partir da hora definida.",
    group: "period",
    label: "Ocupação hora a hora",
    value: "hourly_occupancy",
  },
  {
    description: "Ordem de volume e participação no período selecionado.",
    group: "scenario",
    label: "Ranking de cenários",
    value: "ranking",
  },
  {
    description: "Barras com o acumulado individual de cada cenário.",
    group: "scenario",
    label: "Acumulado por cenário",
    value: "scenario_cumulative",
  },
  {
    description:
      "Barras verticais com o total de cenários, locais ou sublocais.",
    group: "scenario",
    label: "Totais por visão",
    value: "scope_totals",
  },
  {
    description: "Totais individuais e combinado em formato tabular.",
    group: "scenario",
    label: "Tabela acumulada por cenário",
    value: "totals_table",
  },
  {
    description: "Participação proporcional em rosa ou treemap.",
    group: "scenario",
    label: "Composição por cenário",
    value: "rose",
  },
  {
    description: "Intensidade de fluxo por dia e faixa horária.",
    group: "context",
    label: "Mapa de calor dia x hora",
    value: "heatmap",
  },
  {
    description: "Valores diários lado a lado contra a base escolhida.",
    group: "context",
    label: "Dias x meses",
    value: "daily_comparison",
  },
  {
    description: "Curva acumulada comparada a uma base histórica.",
    group: "context",
    label: "Acumulado diário x base",
    value: "cumulative",
  },
  {
    description: "Médias móveis para direção de curto e longo prazo.",
    group: "context",
    label: "Tendência 7 x 30 dias",
    value: "trend",
  },
  {
    description: "Cinco dias de maior volume no contexto consultado.",
    group: "context",
    label: "Top 5 dias de pico",
    value: "peak_days",
  },
  {
    description: "Valores mensais do ano da data consultada.",
    group: "context",
    label: "Comparativo mensal por ano",
    value: "year_monthly",
  },
  {
    description: "Soma progressiva dos meses do ano consultado.",
    group: "context",
    label: "Comparativo acumulado por ano",
    value: "year_accumulated",
  },
];

const widgetKindGroups = [
  { label: "Indicadores compactos", value: "indicator" },
  { label: "Período selecionado", value: "period" },
  { label: "Cenários", value: "scenario" },
  { label: "Contexto e tendência", value: "context" },
] as const;

function isCompactAnalysisWidget(kind: PeriodAnalysisWidgetKind) {
  return (
    kind === "day_total" ||
    kind === "target_progress" ||
    kind === "cumulative_metric"
  );
}

function isFullWidthAnalysisWidget(kind: PeriodAnalysisWidgetKind) {
  return [
    "cumulative",
    "daily_comparison",
    "heatmap",
    "hourly_occupancy",
    "scenario_cumulative",
    "summary",
    "totals_table",
  ].includes(kind);
}

function isTallAnalysisWidget(kind: PeriodAnalysisWidgetKind) {
  return [
    "cumulative",
    "daily_comparison",
    "heatmap",
    "scenario_cumulative",
    "totals_table",
  ].includes(kind);
}

function analysisWidgetSupportsChartType(kind: PeriodAnalysisWidgetKind) {
  return [
    "comparison",
    "cumulative",
    "daily_comparison",
    "hour_profile",
    "hourly_occupancy",
    "scope_totals",
    "timeline",
    "trend",
    "year_accumulated",
    "year_monthly",
  ].includes(kind);
}

function analysisGranularityLabel(
  granularity: ScenarioAnalyticsGranularity,
) {
  return (
    {
      day: "Dia a dia",
      hour: "Hora a hora",
      minute: "Minuto a minuto",
      month: "Mês a mês",
      week: "Semana a semana",
    } satisfies Record<ScenarioAnalyticsGranularity, string>
  )[granularity];
}

const baselineOptions: Array<{
  label: string;
  value: PeriodAnalysisBaseline;
}> = [
  { label: "Período anterior equivalente", value: "previous_period" },
  { label: "Mês anterior", value: "previous_month" },
  { label: "Mesmo período do ano anterior", value: "last_year" },
];

const widgetIcons: Record<
  PeriodAnalysisWidgetKind,
  React.ComponentType<{ className?: string }>
> = {
  cumulative_metric: Activity,
  daily_comparison: CalendarDays,
  day_total: Clock3,
  comparison: BarChart3,
  cumulative: TrendingUp,
  heatmap: Grid3X3,
  hour_profile: BarChart3,
  hourly_occupancy: DoorOpen,
  peak_days: BarChart3,
  ranking: BarChart3,
  rose: Grid3X3,
  scenario_cumulative: Sigma,
  scope_totals: BarChart3,
  summary: CalendarRange,
  timeline: BarChart3,
  totals_table: Layers3,
  target_progress: Target,
  trend: TrendingUp,
  year_accumulated: TrendingUp,
  year_monthly: BarChart3,
};

const scenarioOnlyWidgetKinds = new Set<PeriodAnalysisWidgetKind>([
  "comparison",
  "heatmap",
  "hourly_occupancy",
  "peak_days",
  "ranking",
  "rose",
  "scenario_cumulative",
  "totals_table",
]);

function widgetSupportsScopeMode(kind: PeriodAnalysisWidgetKind) {
  return !scenarioOnlyWidgetKinds.has(kind);
}

export function PeriodAnalysisDashboard({
  manager = false,
}: PeriodAnalysisDashboardProps) {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(
    user,
    companyScopeId,
  );
  const rawCompanyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  // Storage/user-grid hydration can publish an equivalent resolution object
  // more than once. Keep its identity stable so those visual synchronizations
  // never restart an already completed analysis request.
  const companyTimeZoneResolution = React.useMemo(
    () => ({
      fallback: rawCompanyTimeZoneResolution.fallback,
      source: rawCompanyTimeZoneResolution.fallback
        ? ("fallback" as const)
        : ("deployment-default" as const),
      timeZone: rawCompanyTimeZoneResolution.timeZone,
    }),
    [
      rawCompanyTimeZoneResolution.fallback,
      rawCompanyTimeZoneResolution.timeZone,
    ],
  );
  const companyTimeZone = companyTimeZoneResolution.timeZone;
  const canEditVisual = hasVisualAdminAccess(user);
  const infrastructureCatalogsAllowed = canReadInfrastructureCatalogs(user);
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [scopeOptions, setScopeOptions] = React.useState<
    PeriodAnalysisScopeOption[]
  >([]);
  const [widgets, setWidgets] = React.useState<PeriodAnalysisWidget[]>([]);
  const [appliedSettings, setAppliedSettings] =
    React.useState<PeriodAnalysisSettings>(() =>
      createDefaultPeriodAnalysisSettings(),
    );
  const [data, setData] = React.useState<PeriodAnalysisData>(() => emptyData());
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [dataLoadError, setDataLoadError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [analysisRequested, setAnalysisRequested] = React.useState(false);
  const [queryVersion, setQueryVersion] = React.useState(0);
  const [configurationReadyKey, setConfigurationReadyKey] = React.useState("");
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [widgetDialogOpen, setWidgetDialogOpen] = React.useState(false);
  const [widgetForm, setWidgetForm] =
    React.useState<PeriodAnalysisWidgetInput>(() => emptyWidgetForm());
  const requestRef = React.useRef<AbortController | null>(null);
  const requestKeyRef = React.useRef("");
  const completedRequestKeyRef = React.useRef("");
  const requestAbortTimerRef = React.useRef<number | null>(null);
  const metadataRequestRef = React.useRef<AbortController | null>(null);
  const metadataRequestKeyRef = React.useRef("");
  const metadataLoadedKeyRef = React.useRef("");
  const metadataAbortTimerRef = React.useRef<number | null>(null);
  const hasLoadedDataRef = React.useRef(false);
  const hourlyAggregateCacheRef = React.useRef<HourlyAggregateCache>(new Map());
  const dailyAggregateCacheRef = React.useRef<AnalysisDayCache>(new Map());
  const period = React.useMemo(
    () =>
      resolvePeriodAnalysisRange(appliedSettings.from, appliedSettings.to) ??
      resolvePeriodAnalysisRange(
        createDefaultPeriodAnalysisSettings().from,
        createDefaultPeriodAnalysisSettings().to,
      )!,
    [appliedSettings],
  );
  const configurationScopeKey = [
    companyScopeId ?? "",
    user?.id ?? "",
    companyTimeZoneResolution.timeZone,
    companyTimeZoneResolution.fallback ? "fallback" : "certified",
  ].join("|");
  const singleDayAnalysis = appliedSettings.mode === "day";
  const operationalPeriod = React.useMemo(
    () => periodAnalysisOperationalRange(period),
    [period],
  );
  const analysisRangePlan = React.useMemo(
    () => buildCountingAnalysisRangePlan(operationalPeriod),
    [operationalPeriod],
  );
  const hourlyDetailRange = React.useMemo(
    () => countingAnalysisHourlyDetailRange(operationalPeriod),
    [operationalPeriod],
  );
  const widgetIds = React.useMemo(
    () => widgets.map((widget) => widget.id),
    [widgets],
  );
  const preferences = useCardPreferences(
    "analysis",
    widgetIds,
    companyScopeId,
    { userId: user?.id },
  );
  const widgetColorById = React.useMemo(
    () =>
      new Map(
        preferences.flatMap((preference) =>
          preference.color ? [[preference.id, preference.color] as const] : [],
        ),
      ),
    [preferences],
  );
  const widgetChartTypeById = React.useMemo(
    () =>
      new Map(
        preferences.flatMap((preference) =>
          preference.chartType
            ? [[preference.id, preference.chartType] as const]
            : [],
        ),
      ),
    [preferences],
  );
  const widgetTitleById = React.useMemo(
    () =>
      new Map(
        preferences.flatMap((preference) =>
          preference.title
            ? [[preference.id, preference.title] as const]
            : [],
        ),
      ),
    [preferences],
  );
  const queryWidgets = React.useMemo(
    () => orderByCardPreferences(widgets, preferences),
    [preferences, widgets],
  );
  const hasQueryWidgets = queryWidgets.length > 0;
  const scenarioCatalogSize = scenarios.length;
  const hasScenarios = scenarioCatalogSize > 0;
  const dataRequirementsKey = React.useMemo(
    () => {
      const effectiveWidgetGranularities = (
        widget: PeriodAnalysisWidget,
      ) => {
        // The response contains every source series before the widget applies
        // its composition. Request only the one resolution that is safe for
        // the actual payload and that the current widget will render.
        return [
          periodAnalysisEffectiveGranularity(
            widget,
            period,
            Math.max(1, scenarioCatalogSize),
          ),
        ];
      };
      const usesSelectedPeriodDataset = new Set<PeriodAnalysisWidgetKind>([
        "day_total",
        "scenario_cumulative",
        "scope_totals",
        "summary",
      ]);
      const needsDay = queryWidgets.some((widget) => {
        if (widget.kind === "heatmap" || widget.kind === "hour_profile") {
          return false;
        }
        if (widget.kind === "hourly_occupancy") return false;
        if (widget.kind === "timeline" || widget.kind === "comparison") {
          return effectiveWidgetGranularities(widget).some(
            (granularity) =>
              granularity !== "hour" && granularity !== "minute",
          );
        }
        if (
          widget.kind === "year_monthly" ||
          widget.kind === "year_accumulated"
        ) {
          return false;
        }
        if (usesSelectedPeriodDataset.has(widget.kind)) {
          return !singleDayAnalysis;
        }
        if (widget.kind === "target_progress") return !singleDayAnalysis;
        // Accumulated, calendar and ranking widgets consume the consolidated
        // daily source even for a single selected date. Annual widgets use
        // the dedicated January-to-cutoff monthly source instead.
        return true;
      });
      const needsHour = queryWidgets.some((widget) => {
        if (widget.kind === "hour_profile") return true;
        if (widget.kind === "timeline" || widget.kind === "comparison") {
          return effectiveWidgetGranularities(widget).includes("hour");
        }
        return (
          singleDayAnalysis &&
          (usesSelectedPeriodDataset.has(widget.kind) ||
            widget.kind === "target_progress" ||
            widget.kind === "totals_table")
        );
      });
      const needsContextHour = queryWidgets.some(
        (widget) =>
          widget.kind === "heatmap" || widget.kind === "hourly_occupancy",
      );
      const baselineKinds = new Set<PeriodAnalysisWidgetKind>([
        "cumulative",
        "cumulative_metric",
        "daily_comparison",
        "target_progress",
      ]);

      return JSON.stringify({
        baseline: Array.from(
          new Set(
            queryWidgets
              .filter((widget) => baselineKinds.has(widget.kind))
              .map((widget) => widget.baseline),
          ),
        ).sort(),
        contextHour: needsContextHour,
        day: needsDay,
        hour: needsHour,
        minute: queryWidgets.some(
          (widget) =>
            (widget.kind === "timeline" || widget.kind === "comparison") &&
            effectiveWidgetGranularities(widget).includes("minute"),
        ),
        month: queryWidgets.some(
          (widget) =>
            widget.kind === "year_monthly" ||
            widget.kind === "year_accumulated",
        ),
        trendHistory: queryWidgets.some((widget) => widget.kind === "trend"),
      });
    },
    [period, queryWidgets, scenarioCatalogSize, singleDayAnalysis],
  );
  const hourlyDetailRequested = React.useMemo(() => {
    const requirements = JSON.parse(dataRequirementsKey) as {
      contextHour: boolean;
      hour: boolean;
    };
    return requirements.contextHour || requirements.hour;
  }, [dataRequirementsKey]);
  const dayDatasetRequested = React.useMemo(
    () =>
      (JSON.parse(dataRequirementsKey) as { day: boolean }).day,
    [dataRequirementsKey],
  );
  const hourlyDetailDayCount = React.useMemo(
    () => buildCountingAnalysisRangePlan(hourlyDetailRange).spanDays,
    [hourlyDetailRange],
  );

  React.useEffect(() => {
    if (metadataAbortTimerRef.current !== null) {
      window.clearTimeout(metadataAbortTimerRef.current);
      metadataAbortTimerRef.current = null;
    }
    if (requestAbortTimerRef.current !== null) {
      window.clearTimeout(requestAbortTimerRef.current);
      requestAbortTimerRef.current = null;
    }
    if (metadataRequestRef.current) {
      abortRequest(
        metadataRequestRef.current,
        "A empresa da análise foi alterada.",
      );
      metadataRequestRef.current = null;
      metadataRequestKeyRef.current = "";
    }
    if (requestRef.current) {
      abortRequest(requestRef.current, "A empresa da análise foi alterada.");
      requestRef.current = null;
      requestKeyRef.current = "";
    }
    completedRequestKeyRef.current = "";
    const companyTodayInput = companyDateKey(new Date(), companyTimeZone);
    const previousDayInput = shiftOccupancyAnalysisDateInput(
      companyTodayInput,
      -1,
    );
    const defaultSettings: PeriodAnalysisSettings = {
      from: previousDayInput,
      mode: "day",
      to: previousDayInput,
    };
    const normalizedRange = normalizeOccupancyAnalysisDateRangeInput(
      defaultSettings.from,
      defaultSettings.to,
      companyTodayInput,
    );
    const settings: PeriodAnalysisSettings = {
      from: normalizedRange.startInput,
      mode:
        normalizedRange.startInput === normalizedRange.endInput ? "day" : "range",
      to: normalizedRange.endInput,
    };
    hasLoadedDataRef.current = false;
    clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
    clearAnalysisDayCache(dailyAggregateCacheRef.current);
    metadataLoadedKeyRef.current = "";
    setMetadataError("");
    setDataLoadError("");
    setScenarios([]);
    setScopeOptions([]);
    setData(emptyData());
    setLastUpdated(null);
    setAnalysisRequested(true);
    setAppliedSettings(settings);
    setWidgets(loadPeriodAnalysisWidgets(companyScopeId, user?.id));
    setConfigurationReadyKey(configurationScopeKey);
  }, [
    companyScopeId,
    companyTimeZone,
    configurationScopeKey,
    user?.id,
  ]);

  React.useEffect(() => {
    function syncWidgets() {
      setWidgets(loadPeriodAnalysisWidgets(companyScopeId, user?.id));
    }

    window.addEventListener(PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT, syncWidgets);
    window.addEventListener("storage", syncWidgets);
    return () => {
      window.removeEventListener(
        PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT,
        syncWidgets,
      );
      window.removeEventListener("storage", syncWidgets);
    };
  }, [companyScopeId, user?.id]);

  React.useEffect(() => {
    if (metadataAbortTimerRef.current !== null) {
      window.clearTimeout(metadataAbortTimerRef.current);
      metadataAbortTimerRef.current = null;
    }
    if (configurationReadyKey !== configurationScopeKey) return;

    const metadataRequestKey = JSON.stringify([
      companyScopeId ?? "",
      infrastructureCatalogsAllowed,
      manager,
      masterCrossCompanyScope,
    ]);
    const scheduleAbort = (activeController: AbortController) => {
      metadataAbortTimerRef.current = window.setTimeout(() => {
        metadataAbortTimerRef.current = null;
        if (
          metadataRequestRef.current !== activeController ||
          metadataRequestKeyRef.current !== metadataRequestKey
        ) {
          return;
        }
        abortRequest(
          activeController,
          "O carregamento dos filtros foi encerrado.",
        );
        metadataRequestRef.current = null;
        metadataRequestKeyRef.current = "";
      }, 0);
    };
    if (metadataLoadedKeyRef.current === metadataRequestKey) return;
    const existingController = metadataRequestRef.current;
    if (
      existingController &&
      !existingController.signal.aborted &&
      metadataRequestKeyRef.current === metadataRequestKey
    ) {
      return () => scheduleAbort(existingController);
    }

    const controller = new AbortController();
    if (metadataRequestRef.current) {
      abortRequest(
        metadataRequestRef.current,
        "Os filtros da análise foram alterados.",
      );
    }
    metadataRequestRef.current = controller;
    metadataRequestKeyRef.current = metadataRequestKey;
    const requestCompanyScopeId = companyScopeId?.trim() || undefined;
    setLoadingScenarios(true);
    setMetadataError("");
    setScenarios([]);
    setScopeOptions([]);
    Promise.all([
      apiFetch<unknown>("/scenarios", {
        companyScopeId: requestCompanyScopeId,
        signal: controller.signal,
      }),
      infrastructureCatalogsAllowed
        ? apiFetch<unknown>("/cameras", {
            companyScopeId: requestCompanyScopeId,
            signal: controller.signal,
          })
        : Promise.resolve([]),
      infrastructureCatalogsAllowed
        ? apiFetch<unknown>("/locations", {
            companyScopeId: requestCompanyScopeId,
            signal: controller.signal,
          })
        : Promise.resolve([]),
    ])
      .then(async ([scenarioRows, cameraRows, locationRows]) => {
        if (
          controller.signal.aborted ||
          metadataRequestRef.current !== controller
        ) {
          return;
        }
        const scenarioPayload = masterCrossCompanyScope
          ? selectExplicitCompanyScopedRows(
              scenarioRows,
              requestCompanyScopeId!,
              { label: "cenários de Contagem" },
            ).rows
          : scenarioRows;
        const cameraPayload = masterCrossCompanyScope
          ? selectExplicitCompanyScopedRows(
              cameraRows,
              requestCompanyScopeId!,
              { label: "câmeras" },
            ).rows
          : cameraRows;
        const locationPayload = masterCrossCompanyScope
          ? selectExplicitCompanyScopedRows(
              locationRows,
              requestCompanyScopeId!,
              { label: "locais" },
            ).rows
          : locationRows;
        const scopedScenarios = filterScopedApiRows(
          requireScenarioRows(scenarioPayload, requestCompanyScopeId),
          companyScopeId,
        );
        const scopedCameras = filterScopedApiRows(
          requireCameraRows(cameraPayload, requestCompanyScopeId),
          companyScopeId,
        );
        const scopedLocations = filterScopedApiRows(
          requireLocationRows(locationPayload, requestCompanyScopeId),
          companyScopeId,
        );
        const subLocations = await fetchAnalysisSubLocations(
          scopedLocations,
          requestCompanyScopeId,
          controller.signal,
          masterCrossCompanyScope,
        );
        requireInfrastructureRelations({
          cameras: scopedCameras,
          locations: scopedLocations,
          subLocations,
        });
        if (
          controller.signal.aborted ||
          metadataRequestRef.current !== controller
        ) {
          return;
        }
        const visibleScenarios = manager
          ? scopedScenarios
          : scopedScenarios.filter((scenario) => scenario.active);
        setMetadataError("");
        setScenarios(visibleScenarios);
        setScopeOptions(
          buildPeriodAnalysisScopeOptions({
            cameras: scopedCameras,
            groups: readCameraGroups(companyScopeId),
            locations: scopedLocations,
            manager,
            scenarios: visibleScenarios,
            subLocations,
          }),
        );
        metadataLoadedKeyRef.current = metadataRequestKey;
      })
      .catch((error) => {
        if (isAbortError(error, controller.signal)) return;
        if (
          controller.signal.aborted ||
          metadataRequestRef.current !== controller
        ) {
          return;
        }
        const message = analysisErrorMessage(
          error,
          "Não foi possível carregar os cenários.",
        );
        setMetadataError(message);
        setScenarios([]);
        setScopeOptions([]);
        toast.error(message);
      })
      .finally(() => {
        if (metadataRequestRef.current === controller) {
          metadataRequestRef.current = null;
          metadataRequestKeyRef.current = "";
          setLoadingScenarios(false);
        }
      });

    return () => scheduleAbort(controller);
  }, [
    companyScopeId,
    configurationReadyKey,
    configurationScopeKey,
    infrastructureCatalogsAllowed,
    manager,
    masterCrossCompanyScope,
  ]);

  React.useEffect(() => {
    if (requestAbortTimerRef.current !== null) {
      window.clearTimeout(requestAbortTimerRef.current);
      requestAbortTimerRef.current = null;
    }
    // Each visit starts from the latest fully closed day. Subsequent picker
    // edits still start only when the user applies them.
    if (!analysisRequested) {
      setLoadingData(false);
      return;
    }
    // The initial render still contains fallback settings and no catalog. A
    // request here would be immediately aborted and repeated after hydration.
    // Wait for the persisted configuration and the selected company's
    // scenarios, then execute one semantic analysis request.
    if (
      configurationReadyKey !== configurationScopeKey ||
      loadingScenarios
    ) {
      return;
    }
    if (metadataError || !hasScenarios || !hasQueryWidgets) {
      if (requestRef.current) abortRequest(requestRef.current);
      requestRef.current = null;
      requestKeyRef.current = "";
      completedRequestKeyRef.current = "";
      hasLoadedDataRef.current = false;
      setData(emptyData());
      setLastUpdated(null);
      setLoadingData(false);
      return;
    }

    const requirements = JSON.parse(dataRequirementsKey) as {
      baseline: PeriodAnalysisBaseline[];
      contextHour: boolean;
      day: boolean;
      hour: boolean;
      minute: boolean;
      month: boolean;
      trendHistory: boolean;
    };
    try {
      requireCertifiedCountingRuntimeTimeZone(companyTimeZoneResolution);
    } catch (error) {
      if (requestRef.current) abortRequest(requestRef.current);
      requestRef.current = null;
      requestKeyRef.current = "";
      completedRequestKeyRef.current = "";
      hasLoadedDataRef.current = false;
      const message = analysisErrorMessage(
        error,
        "Fuso da empresa não disponível.",
      );
      setData(emptyData());
      setDataLoadError(message);
      setLastUpdated(null);
      setLoadingData(false);
      return;
    }
    const requestKey = JSON.stringify([
      companyScopeId ?? "",
      companyTimeZone,
      period.from.toISOString(),
      period.to.toISOString(),
      dataRequirementsKey,
      queryVersion,
    ]);
    // Storage/user-grid and timezone hydration may publish the same semantic
    // state more than once. A completed analysis stays valid until its data
    // key changes or the user explicitly increments queryVersion.
    if (completedRequestKeyRef.current === requestKey) return;
    const scheduleAbort = (activeController: AbortController) => {
      requestAbortTimerRef.current = window.setTimeout(() => {
        requestAbortTimerRef.current = null;
        if (
          requestRef.current !== activeController ||
          requestKeyRef.current !== requestKey
        ) {
          return;
        }
        abortRequest(activeController, "A consulta da análise foi encerrada.");
        requestRef.current = null;
        requestKeyRef.current = "";
      }, 0);
    };
    const existingController = requestRef.current;
    if (
      existingController &&
      !existingController.signal.aborted &&
      requestKeyRef.current === requestKey
    ) {
      return () => scheduleAbort(existingController);
    }
    completedRequestKeyRef.current = "";
    const controller = new AbortController();
    if (requestRef.current) abortRequest(requestRef.current);
    requestRef.current = controller;
    requestKeyRef.current = requestKey;
    const announceErrors = !hasLoadedDataRef.current;
    if (announceErrors) setLoadingData(true);
    const now = new Date();
    const dayCacheOptions = {
      cache: dailyAggregateCacheRef.current,
      cacheScope: `analysis:${companyScopeId ?? "jwt-company"}:${companyTimeZone}`,
      revision: companyDateKey(now, companyTimeZone),
    };

    const referenceDate = new Date(period.to.getTime() - 1);
    const periodCoverageTo =
      now >= period.from && now < period.to
        ? addMinutes(startOfMinute(now), 1)
        : period.to;
    const dayRange = {
      from: requirements.trendHistory
        ? addDays(operationalPeriod.from, -29)
        : operationalPeriod.from,
      to: periodCoverageTo,
    };
    const monthRange = {
      from: new Date(referenceDate.getFullYear(), 0, 1),
      to: periodCoverageTo,
    };
    const baselineRanges = requirements.baseline.map((baseline) => [
      baseline,
      periodAnalysisBaselineDataRange(period, baseline),
    ] as const);
    const baselineComparableRanges = new Map(
      requirements.baseline.map((baseline) => [
        baseline,
        periodAnalysisBaselineRange(
          {
            from: operationalPeriod.from,
            to: periodCoverageTo,
          },
          baseline,
        ),
      ]),
    );
    const boundedHourlyRange = {
      from: hourlyDetailRange.from,
      to: new Date(
        Math.min(hourlyDetailRange.to.getTime(), periodCoverageTo.getTime()),
      ),
    };
    const requiredHourRanges =
      (requirements.contextHour || requirements.hour) &&
      boundedHourlyRange.from < boundedHourlyRange.to
        ? [boundedHourlyRange]
        : [];
    const canonicalHourPromise = requiredHourRanges.length
      ? fetchAnalysisHourlyDatasets(
          requiredHourRanges,
          hourlyAggregateCacheRef.current,
          `analysis:${companyScopeId ?? "jwt-company"}:${companyTimeZone}`,
          now,
          companyScopeId,
          controller.signal,
        )
      : Promise.resolve(emptyDataset("hour"));
    const contextHourPromise = requirements.contextHour
      ? canonicalHourPromise
      : Promise.resolve(emptyDataset("hour"));
    const hourPromise = requirements.hour
      ? canonicalHourPromise
      : Promise.resolve(emptyDataset("hour"));
    const minuteRangeWithinLimit =
      estimatedMinuteBucketCount(period) <= MAX_ANALYSIS_MINUTE_BUCKETS;
    const minutePromise = requirements.minute
      ? !minuteRangeWithinLimit
        ? Promise.resolve({
            error:
              "O período minuto a minuto excede 20.000 pontos. Reduza o intervalo para evitar uma série incompleta.",
            granularity: "minute" as const,
            rows: [],
          })
        : fetchAnalysisDataset(
            "minute",
            period,
            companyScopeId,
            controller.signal,
          )
      : Promise.resolve(emptyDataset("minute"));
    const requestedConsolidatedDayRanges = [
      ...(requirements.day ? [dayRange] : []),
      ...(requirements.month ? [monthRange] : []),
      ...baselineRanges.flatMap(([baseline, baselineRange]) => {
        const comparableRange =
          baselineComparableRanges.get(baseline) ?? baselineRange;
        return sameAnalysisRange(baselineRange, comparableRange)
          ? [baselineRange]
          : [baselineRange, comparableRange];
      }),
    ];
    const consolidatedDayDatasetsPromise =
      fetchAnalysisConsolidatedDayDatasets(
        requestedConsolidatedDayRanges,
        companyScopeId,
        controller.signal,
        dayCacheOptions,
      );
    const currentMinuteRange = analysisCurrentMinuteRange(
      requiredHourRanges,
      now,
    );
    const reconciliationMinutePromise = currentMinuteRange
      ? requirements.minute
        ? minutePromise
        : fetchAnalysisDataset(
            "minute",
            currentMinuteRange,
            companyScopeId,
            controller.signal,
          )
      : Promise.resolve(emptyDataset("minute"));

    Promise.all([
      hourPromise,
      contextHourPromise,
      minutePromise,
      reconciliationMinutePromise,
      consolidatedDayDatasetsPromise,
    ])
      .then(
        ([
          hour,
          rawContextHour,
          minute,
          reconciliationMinute,
          consolidatedDayDatasets,
        ]) => {
          if (controller.signal.aborted) return;
          const rawDay = requirements.day
            ? consolidatedDayDatasets.get(analysisRangeKey(dayRange)) ??
              emptyDataset("day")
            : emptyDataset("day");
          const rawMonthDays = requirements.month
            ? consolidatedDayDatasets.get(analysisRangeKey(monthRange)) ??
              emptyDataset("day")
            : emptyDataset("day");
          const rawBaselineEntries = baselineRanges.map(
            ([baseline, baselineRange]) => {
              const comparableRange =
                baselineComparableRanges.get(baseline) ?? baselineRange;
              return [
                baseline,
                baselineRange,
                consolidatedDayDatasets.get(
                  analysisRangeKey(baselineRange),
                ) ?? emptyDataset("day"),
                comparableRange,
                consolidatedDayDatasets.get(
                  analysisRangeKey(comparableRange),
                ) ?? emptyDataset("day"),
              ] as const;
            },
          );
          const exactHour = reconcileAnalysisHourlyDataset(
            requirements.contextHour ? rawContextHour : hour,
            reconciliationMinute,
            boundedHourlyRange,
            currentMinuteRange,
          );
          const contextHour = requirements.contextHour
            ? exactHour
            : emptyDataset("hour");
          const reconciledHour = requirements.hour ? exactHour : hour;
          const reconciledMinute = requirements.minute
            ? reconcileAnalysisMinuteDataset(
                minute,
                reconciliationMinute,
                currentMinuteRange,
              )
            : minute;
          const day = requiredHourRanges.length
            ? mergeExactHoursIntoDays(
                rawDay,
                exactHour,
                boundedHourlyRange,
              )
            : rawDay;
          const monthDays = requiredHourRanges.length
            ? mergeExactHoursIntoDays(
                rawMonthDays,
                exactHour,
                boundedHourlyRange,
              )
            : rawMonthDays;
          const month = requirements.month
            ? rollupAnalysisDataset(monthDays, "month", monthRange)
            : emptyDataset("month");
          const baselineEntries = rawBaselineEntries.map(
            ([baseline, , dataset]) => [baseline, dataset] as const,
          );
          const baselineComparableEntries = rawBaselineEntries.map(
            ([baseline, , , , dataset]) => [baseline, dataset] as const,
          );
          setData({
            baseline: Object.fromEntries(baselineEntries),
            baselineComparable: Object.fromEntries(
              baselineComparableEntries,
            ),
            contextHour,
            day,
            hour: reconciledHour,
            minute: reconciledMinute,
            month,
          });
          setDataLoadError("");
          hasLoadedDataRef.current = true;
          completedRequestKeyRef.current = requestKey;
          setLastUpdated(new Date());
          if (
            announceErrors &&
            (day.error ||
              hour.error ||
              contextHour.error ||
              reconciledMinute.error ||
              month.error ||
              baselineEntries.some(([, dataset]) => dataset.error) ||
              baselineComparableEntries.some(([, dataset]) => dataset.error))
          ) {
            toast.error("Alguns dados da análise não puderam ser carregados.");
          }
        },
      )
      .catch((error) => {
        if (isAbortError(error, controller.signal)) return;
        if (requestRef.current !== controller) return;
        const message = analysisErrorMessage(
          error,
          "Não foi possível carregar a análise.",
        );
        setData(emptyData());
        setDataLoadError(message);
        hasLoadedDataRef.current = false;
        toast.error(message);
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          requestKeyRef.current = "";
          setLoadingData(false);
        }
      });

    return () => scheduleAbort(controller);
  }, [
    analysisRequested,
    companyScopeId,
    companyTimeZone,
    companyTimeZoneResolution,
    configurationReadyKey,
    configurationScopeKey,
    dataRequirementsKey,
    hasQueryWidgets,
    hasScenarios,
    hourlyDetailRange,
    loadingScenarios,
    metadataError,
    operationalPeriod,
    period,
    queryVersion,
    singleDayAnalysis,
  ]);

  const analysisCertificationError =
    metadataError ||
    dataLoadError ||
    [
      data.contextHour,
      data.day,
      data.hour,
      data.minute,
      data.month,
      ...Object.values(data.baseline),
      ...Object.values(data.baselineComparable ?? {}),
    ].find((dataset) => dataset?.error)?.error;
  const layoutCards = widgets.map((widget) => {
    const compact = isCompactAnalysisWidget(widget.kind);
    const fullWidth = isFullWidthAnalysisWidget(widget.kind);
    const short = compact || widget.kind === "summary";
    const tall = isTallAnalysisWidget(widget.kind);

    return {
      chartTypes:
        widget.kind === "rose" ? (["rose", "treemap"] as const) : undefined,
      chartTypeEnabled: analysisWidgetSupportsChartType(widget.kind),
      className: compact
        ? undefined
        : fullWidth
          ? "sm:col-span-2 xl:col-span-4"
          : "sm:col-span-2 xl:col-span-2",
      colorEditable: ![
        "cumulative_metric",
        "day_total",
        "summary",
        "target_progress",
        "totals_table",
      ].includes(widget.kind),
      colorPreview: widget.kind === "heatmap" ? ("gradient" as const) : undefined,
      ...(compact ? COMPACT_METRIC_LAYOUT_DEFAULTS : {}),
      defaultHeight:
        widget.kind === "summary"
          ? ("standard" as const)
          : short
            ? ("short" as const)
            : tall
              ? ("tall" as const)
              : ("standard" as const),
      ...(widget.kind === "hourly_occupancy"
        ? { defaultHeightLevel: 4 as const }
        : {}),
      defaultSize: compact
        ? ("compact" as const)
        : fullWidth
          ? ("full" as const)
          : ("wide" as const),
      id: widget.id,
      label: widget.title,
      previewKind: resolveWidgetBentoPreviewKindFromDataKind(widget.kind),
      titleEditable: true,
      // CardLayout only invokes function nodes near the viewport. Keeping the
      // model inside a child component also lets React memoize it across
      // unrelated dashboard renders instead of materializing every widget at
      // once when a large response is published.
      node: () => (
        <PeriodAnalysisCardRuntime
          analysisRequested={analysisRequested}
          canConfigure={canEditVisual}
          chartType={widgetChartTypeById.get(widget.id)}
          color={widgetColorById.get(widget.id)}
          companyTimeZone={companyTimeZone}
          data={data}
          loading={loadingData || loadingScenarios}
          monitorMode={monitorMode}
          onEdit={() => openEditWidget(widget)}
          onRemove={() => removeWidget(widget.id)}
          period={period}
          scenarios={scenarios}
          scopeOptions={scopeOptions}
          sourceSeriesCount={Math.max(1, scenarioCatalogSize)}
          widget={widget}
        />
      ),
      zoomEnabled:
        widget.kind !== "summary" &&
        widget.kind !== "totals_table" &&
        !compact,
    };
  });
  function buildPeriodAnalysisReportPayload(): ReportPayload {
    return composePeriodAnalysisReport({
      models: queryWidgets.flatMap((widget) => {
        const model = buildPeriodAnalysisWidgetModel({
          chartType: widgetChartTypeById.get(widget.id),
          color: widgetColorById.get(widget.id),
          companyTimeZone,
          data,
          period,
          scenarios,
          scopeOptions,
          sourceSeriesCount: Math.max(1, scenarioCatalogSize),
          widget,
        });
        return [
          {
            chartType: widgetChartTypeById.get(widget.id),
            defaultTitle: widget.title,
            model,
            scenarioSummary: periodAnalysisScenarioSummary(
              widget,
              scenarios,
              scopeOptions,
            ),
            title: widgetTitleById.get(widget.id) ?? widget.title,
          },
        ];
      }),
      period,
      timeZone: companyTimeZone,
    });
  }

  async function buildAiPeriodAnalysisPayload(
    signal?: AbortSignal,
  ): Promise<ReportPayload> {
    signal?.throwIfAborted();
    const now = new Date();
    const sourceTo =
      now >= period.from && now < period.to
        ? new Date(
            Math.min(
              period.to.getTime(),
              addMinutes(startOfMinute(now), 1).getTime(),
            ),
          )
        : period.to;
    const dailySourceRange = { from: period.from, to: sourceTo };
    let aiDayDataset = data.day;
    if (!dayDatasetRequested || aiDayDataset.error) {
      const datasets = await fetchAnalysisConsolidatedDayDatasets(
        [dailySourceRange],
        companyScopeId,
        signal,
        {
          cache: dailyAggregateCacheRef.current,
          cacheScope: `analysis:${companyScopeId ?? "jwt-company"}:${companyTimeZone}`,
          revision: companyDateKey(now, companyTimeZone),
        },
      );
      signal?.throwIfAborted();
      aiDayDataset =
        datasets.get(analysisRangeKey(dailySourceRange)) ?? emptyDataset("day");
    }
    if (aiDayDataset.error) {
      throw new Error(
        `A série diária completa não está disponível: ${aiDayDataset.error}`,
      );
    }

    const dataCompleteUntil = periodAnalysisDataCompleteUntil(
      period,
      now,
    );
    const dailyTo = new Date(
      Math.min(
        period.to.getTime(),
        addDays(startOfDay(dataCompleteUntil), 1).getTime(),
      ),
    );
    const dayCount = requireAiDailyRangeWithinLimit(period.from, dailyTo);
    const dailyPoints = buildCombinedScenarioPoints({
      from: period.from,
      granularity: "day",
      includeOverlappingSourceBuckets:
        aiDayDataset.partialBoundariesReconciled === true,
      rows: aiDayDataset.rows,
      scenarios,
      sourceGranularity: aiDayDataset.granularity,
      to: dailyTo,
    });

    if (dailyPoints.length !== dayCount) {
      throw new Error(
        "A série diária completa não pôde ser reconciliada para a análise de IA.",
      );
    }

    const reportPayload = buildPeriodAnalysisReportPayload();
    const dailyPeriod = formatPeriodAnalysisRange({
      from: period.from,
      to: dailyTo,
    });
    return {
      ...reportPayload,
      context: [
        `Período analisado: ${dailyPeriod}`,
        ...(reportPayload.context ?? []),
      ],
      tables: [
        ...(reportPayload.tables ?? []),
        {
          columns: [
            { key: "date", label: "Data", width: 24 },
            {
              key: "total",
              label: "Fluxo total atual",
              numeric: true,
              width: 22,
            },
          ],
          description: `Detalhamento diário de todos os cenários em ${dailyPeriod}; dias sem registros permanecem com total zero. Os gráficos, indicadores e tabelas acima preservam a composição individual de cada widget.`,
          rows: dailyPoints.map((point, index) => ({
            date: formatFileDate(addDays(startOfDay(period.from), index)),
            total: point.total,
          })),
          title: "Detalhamento diário da Contagem",
        },
      ],
    };
  }

  function commitAnalysisSettings(nextSettings: PeriodAnalysisSettings) {
    const requestedFrom =
      nextSettings.mode === "day"
        ? nextSettings.from || nextSettings.to
        : nextSettings.from;
    const requestedTo =
      nextSettings.mode === "day" ? requestedFrom : nextSettings.to;
    const normalizedRange = normalizeOccupancyAnalysisDateRangeInput(
      requestedFrom,
      requestedTo,
      companyDateKey(new Date(), companyTimeZone),
    );
    const normalizedSettings: PeriodAnalysisSettings = {
      from: normalizedRange.startInput,
      mode:
        normalizedRange.startInput === normalizedRange.endInput ? "day" : "range",
      to: normalizedRange.endInput,
    };
    const nextPeriod = resolvePeriodAnalysisRange(
      normalizedSettings.from,
      normalizedSettings.to,
    );
    if (!nextPeriod) {
      toast.error("Informe um período válido, com a data inicial antes da final.");
      return;
    }

    try {
      savePeriodAnalysisSettings(normalizedSettings, companyScopeId, user?.id);
    } catch {
      toast.error(
        "O período será aplicado, mas não pôde ser salvo agora.",
      );
    }
    if (requestRef.current) abortRequest(requestRef.current);
    requestRef.current = null;
    hasLoadedDataRef.current = false;
    setDataLoadError("");
    setData(emptyData());
    setLoadingData(true);
    setAnalysisRequested(true);
    setAppliedSettings(normalizedSettings);
    setQueryVersion((value) => value + 1);
  }

  function applyAnalysisRange({
    endInput,
    startInput,
  }: {
    endInput: string;
    startInput: string;
  }) {
    commitAnalysisSettings({
      from: startInput,
      mode: startInput === endInput ? "day" : "range",
      to: endInput,
    });
  }

  function openAddWidget() {
    setWidgetForm(emptyWidgetForm());
    setWidgetDialogOpen(true);
  }

  function openEditWidget(widget: PeriodAnalysisWidget) {
    setWidgetForm({
      baseline: widget.baseline,
      entryScenarioIds: widget.entryScenarioIds,
      exitScenarioIds: widget.exitScenarioIds,
      granularity: widget.granularity,
      id: widget.id,
      kind: widget.kind,
      scenarioIds: widget.scenarioIds,
      selectionMode: widget.selectionMode,
      scopeMode: widgetSupportsScopeMode(widget.kind)
        ? widget.scopeMode
        : "scenario",
      startHour: widget.startHour,
      title: widget.title,
    });
    setWidgetDialogOpen(true);
  }

  function updateWidgetKind(kind: PeriodAnalysisWidgetKind) {
    setWidgetForm((current) => {
      const currentDefaultTitle = widgetKindLabel(current.kind);
      return {
        ...current,
        granularity:
          kind === "heatmap" ||
          kind === "hour_profile" ||
          kind === "hourly_occupancy"
            ? "hour"
            : kind === "year_monthly" || kind === "year_accumulated"
              ? "month"
            : kind === "timeline" || kind === "comparison"
              ? current.granularity
              : "day",
        kind,
        scopeMode: widgetSupportsScopeMode(kind)
          ? current.scopeMode
          : "scenario",
        title:
          !current.title.trim() || current.title === currentDefaultTitle
            ? widgetKindLabel(kind)
            : current.title,
      };
    });
  }

  function saveWidget() {
    if (
      widgetForm.kind === "hourly_occupancy" &&
      widgetForm.selectionMode === "custom" &&
      (!widgetForm.entryScenarioIds.length ||
        !widgetForm.exitScenarioIds.length)
    ) {
      toast.error("Selecione ao menos uma entrada e uma saída para o widget.");
      return;
    }

    if (
      widgetForm.kind !== "hourly_occupancy" &&
      widgetForm.selectionMode === "custom" &&
      !widgetForm.scenarioIds.length
    ) {
      toast.error(
        `Selecione ao menos um ${periodAnalysisScopeModeLabel(
          widgetForm.scopeMode,
        ).toLowerCase()} para o widget.`,
      );
      return;
    }

    const next = upsertPeriodAnalysisWidget(
      widgetForm,
      companyScopeId,
      user?.id,
    );
    setWidgets(next);
    setWidgetDialogOpen(false);
    toast.success(widgetForm.id ? "Widget atualizado." : "Widget adicionado.");
  }

  function removeWidget(widgetId: string) {
    setWidgets(
      deletePeriodAnalysisWidget(widgetId, companyScopeId, user?.id),
    );
    toast.success("Widget removido.");
  }

  function applySavedLiveView(preset: WidgetViewPreset) {
    if (preset.snapshot.menuKey !== "live") return false;
    const imported = buildLiveAnalysisImport({
      scenarios,
      scopeOptions,
      snapshot: preset.snapshot,
    });
    if (!imported.widgets.length) {
      toast.error("A visão escolhida não possui widgets compatíveis com Análises.");
      return false;
    }

    savePeriodAnalysisWidgets(imported.widgets, companyScopeId, user?.id);
    saveCardPreferences(
      "analysis",
      imported.preferences,
      imported.widgets.map((widget) => widget.id),
      companyScopeId,
      user?.id,
    );
    setWidgets(imported.widgets);
    const notes = [
      imported.sourceResolution === "scenario_name" ||
      imported.sourceResolution === "scope_name"
        ? "a visão foi reconciliada pelo nome"
        : imported.sourceResolution === "all_scenarios"
          ? "a seleção original não era um cenário disponível; esses widgets usam todos os cenários desta empresa"
          : "",
      imported.unsupportedCount
        ? `${imported.unsupportedCount} item(ns) sem equivalente foram ignorados`
        : "",
    ].filter(Boolean);
    toast.success(
      `Visão “${preset.name}” carregada em Análises com ${imported.widgets.length} widget(s)${
        notes.length ? `; ${notes.join("; ")}` : ""
      }.`,
    );
    return true;
  }

  return (
    <section
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {analysisCertificationError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive [overflow-wrap:anywhere]">
          Não foi possível carregar a análise: {analysisCertificationError}
        </div>
      ) : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0 flex-[1_1_16rem]">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              {singleDayAnalysis ? "Análise do dia" : "Análise consolidada"}
            </div>
            <div className="break-words text-lg font-semibold leading-tight [overflow-wrap:anywhere]">
              {formatPeriodAnalysisRange(period)}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {analysisRangePlan.mode === "consolidated" ? (
              <Badge
                variant="secondary"
                className={cn(ANALYSIS_READABLE_BADGE_CLASS_NAME, "bg-card")}
              >
                Consolidação automática ativa
              </Badge>
            ) : null}
            {analysisRangePlan.mode === "consolidated" &&
            hourlyDetailRequested ? (
              <Badge
                variant="outline"
                className={cn(ANALYSIS_READABLE_BADGE_CLASS_NAME, "bg-card")}
              >
                Detalhe horário · últimos {hourlyDetailDayCount} dias
              </Badge>
            ) : null}
            {lastUpdated ? (
              <Badge
                variant="outline"
                className={cn(
                  ANALYSIS_READABLE_BADGE_CLASS_NAME,
                  "gap-1 bg-card",
                )}
              >
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="@container rounded-md border bg-card px-3 py-2 shadow-soft">
          <div
            aria-label="Controles da análise de Contagem"
            className="grid min-w-0 grid-cols-[32px_minmax(32px,1fr)_176px] items-center gap-2 @sm:grid-cols-[160px_minmax(32px,1fr)_176px] @lg:grid-cols-[220px_minmax(32px,1fr)_176px] @2xl:grid-cols-[300px_minmax(32px,1fr)_176px]"
            role="group"
          >
            <div className="col-start-1 row-start-1 min-w-0">
              <AnalysisDateRangePicker
                key={`${companyScopeId ?? ""}|${user?.id ?? ""}`}
                contextLabel="análise de Contagem"
                maximumInput={companyDateKey(new Date(), companyTimeZone)}
                onApply={applyAnalysisRange}
                value={{
                  endInput: appliedSettings.to,
                  startInput: appliedSettings.from,
                }}
              />
            </div>

            <div
              className="col-start-2 row-start-1 flex min-w-0 flex-nowrap items-center justify-end gap-1 overflow-hidden"
              aria-label="Informações da análise de Contagem"
            >
              {analysisRangePlan.mode === "consolidated" ? (
                <Badge
                  variant="secondary"
                  className="hidden h-8 min-w-0 max-w-full overflow-hidden whitespace-nowrap @xl:inline-flex"
                  title="A resolução visual é ajustada automaticamente; os totais continuam usando todo o intervalo."
                >
                  <span className="truncate @4xl:hidden">Consolidada</span>
                  <span className="hidden truncate @4xl:inline">
                    Consolidação automática ativa
                  </span>
                </Badge>
              ) : null}
              {analysisRangePlan.mode === "consolidated" &&
              hourlyDetailRequested ? (
                <Badge
                  variant="outline"
                  className="hidden h-8 min-w-0 max-w-full overflow-hidden whitespace-nowrap @4xl:inline-flex"
                  title="Somente widgets estritamente horários usam esta janela; consolidados usam todo o intervalo."
                >
                  <span className="truncate">
                    Detalhe horário · {hourlyDetailDayCount} dias
                  </span>
                </Badge>
              ) : null}
              {lastUpdated ? (
                <span
                  aria-label={`Última atualização às ${formatTime(lastUpdated)}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-0 text-xs tabular-nums text-muted-foreground @md:w-auto @md:justify-start @md:px-1.5"
                  title={`Última atualização às ${formatTime(lastUpdated)}`}
                >
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only @md:not-sr-only">
                    {formatTime(lastUpdated)}
                  </span>
                </span>
              ) : null}
            </div>

            <div
              aria-label="Ações da análise de Contagem"
              className="col-start-3 row-start-1 flex w-[176px] min-w-0 flex-nowrap items-center justify-end gap-1 justify-self-end"
              role="group"
            >
              {canEditVisual ? (
                <>
                  <ReorderModeButton
                    className="h-8 w-8 shrink-0"
                    enabled={layoutReorderMode}
                    onChange={setLayoutReorderMode}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setLayoutOrganizerOpen(true)}
                    aria-label="Configurar widgets"
                    title="Configurar widgets"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              <ReportExportActions
                compact
                disabled={
                  !analysisRequested ||
                  loadingData ||
                  loadingScenarios ||
                  !widgets.length ||
                  Boolean(analysisCertificationError)
                }
                getPayload={buildPeriodAnalysisReportPayload}
              />
              <AiAnalysisAction
                disabled={
                  !analysisRequested ||
                  loadingData ||
                  loadingScenarios ||
                  !widgets.length ||
                  Boolean(analysisCertificationError)
                }
                manager={manager}
                getPayload={buildAiPeriodAnalysisPayload}
                source={{ module: "counting", surface: "analysis" }}
              />
              <MonitorModeButton
                compact
                disabled={!widgets.length}
                onClick={enterMonitorMode}
              />
            </div>
          </div>
        </div>
      )}

      {loadingScenarios && !scopeOptions.length ? (
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
          <Skeleton className="aspect-[4/3] h-full min-h-0 w-full flex-1 self-stretch sm:aspect-video" />
          <Skeleton className="aspect-[4/3] h-full min-h-0 w-full flex-1 self-stretch sm:aspect-video" />
        </div>
      ) : scopeOptions.length ? (
        <CardLayout
          cards={layoutCards}
          editActions={
            <Button type="button" size="sm" onClick={openAddWidget}>
              <Plus className="h-4 w-4" />
              Adicionar widget
            </Button>
          }
          menuKey="analysis"
          monitorMode={monitorMode}
          onApplySavedViewSource={applySavedLiveView}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          reorderMode={layoutReorderMode}
          savedViewSourceMenus={["live"]}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
        />
      ) : (
        <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum cenário disponível para gerar análises.
        </div>
      )}

      <WidgetDialog
        form={widgetForm}
        onFormChange={setWidgetForm}
        onKindChange={updateWidgetKind}
        onOpenChange={setWidgetDialogOpen}
        onSave={saveWidget}
        open={widgetDialogOpen}
        scenarios={scenarios}
        scopeOptions={scopeOptions}
      />
    </section>
  );
}

function PeriodAnalysisCardRuntime({
  analysisRequested,
  canConfigure,
  chartType,
  color,
  companyTimeZone,
  data,
  loading,
  monitorMode,
  onEdit,
  onRemove,
  period,
  scenarios,
  scopeOptions,
  sourceSeriesCount,
  widget,
}: {
  analysisRequested: boolean;
  canConfigure: boolean;
  chartType?: CardChartType;
  color?: string;
  companyTimeZone: string;
  data: PeriodAnalysisData;
  loading: boolean;
  monitorMode: boolean;
  onEdit: () => void;
  onRemove: () => void;
  period: PeriodAnalysisRange;
  scenarios: Scenario[];
  scopeOptions: PeriodAnalysisScopeOption[];
  sourceSeriesCount: number;
  widget: PeriodAnalysisWidget;
}) {
  const { effectiveTheme } = useTheme();
  const model = React.useMemo(
    () =>
      !analysisRequested || loading
        ? deferredAnalysisWidgetModel(widget)
        : buildPeriodAnalysisWidgetModel({
            chartType,
            color,
            companyTimeZone,
            data,
            period,
            scenarios,
            scopeOptions,
            sourceSeriesCount,
            theme: effectiveTheme,
            widget,
          }),
    [
      analysisRequested,
      chartType,
      color,
      companyTimeZone,
      data,
      effectiveTheme,
      loading,
      period,
      scenarios,
      scopeOptions,
      sourceSeriesCount,
      widget,
    ],
  );
  const scenarioSummary = React.useMemo(
    () => periodAnalysisScenarioSummary(widget, scenarios, scopeOptions),
    [scenarios, scopeOptions, widget],
  );

  return (
    <PeriodAnalysisCard
      canConfigure={canConfigure}
      effectiveGranularity={
        model.appliedGranularity ??
        periodAnalysisEffectiveGranularity(
          widget,
          period,
          sourceSeriesCount,
        )
      }
      loading={loading}
      model={model}
      monitorMode={monitorMode}
      onEdit={onEdit}
      onRemove={onRemove}
      scenarioSummary={scenarioSummary}
      widget={widget}
    />
  );
}

function PeriodAnalysisCard({
  canConfigure,
  effectiveGranularity,
  loading,
  model,
  monitorMode,
  onEdit,
  onRemove,
  scenarioSummary,
  widget,
}: {
  canConfigure: boolean;
  effectiveGranularity: ScenarioAnalyticsGranularity;
  loading: boolean;
  model: PeriodAnalysisWidgetModel;
  monitorMode: boolean;
  onEdit: () => void;
  onRemove: () => void;
  scenarioSummary: string;
  widget: PeriodAnalysisWidget;
}) {
  const Icon = widgetIcons[widget.kind];
  const compactSummary = widget.kind === "summary";
  const compactWidget = isCompactAnalysisWidget(widget.kind);
  const compactContent = compactSummary || compactWidget;
  const widgetAction =
    canConfigure && !monitorMode ? (
      <WidgetCardActions label={`Ações do widget ${widget.title}`}>
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            aria-label={`Configurar ${widget.title}`}
            title="Configurar widget"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remover ${widget.title}`}
            title="Remover widget"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      </WidgetCardActions>
    ) : null;

  if (compactWidget) {
    const metric = model.metrics?.[0];
    const metricValue =
      typeof metric?.value === "number"
        ? formatNumber(metric.value)
        : metric?.value ?? "-";
    const toneColor =
      widget.kind === "target_progress"
        ? "#4F46E5"
        : widget.kind === "cumulative_metric"
          ? "#0369A1"
          : "#1267C4";
    const compactLabel =
      (widget.kind === "day_total" && widget.title === "Total do dia") ||
      (widget.kind === "target_progress" &&
        widget.title === "Dia x média-base")
        ? metric?.label ?? widget.title
        : widget.title;

    return (
      <CompactMetricCard
        action={widgetAction}
        description={model.error ?? metric?.description ?? model.description}
        descriptionTitle={model.error ?? metric?.description ?? model.description}
        icon={Icon}
        label={compactLabel}
        loading={loading}
        toneColor={toneColor}
        value={model.error ? "Indisponível" : metricValue}
        valueClassName={model.error ? "text-sm text-destructive" : undefined}
        valueTitle={model.error ?? String(metricValue)}
      />
    );
  }

  return (
    <Card
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-period-analysis-card={widget.kind}
    >
      <CardHeader className={cn("pb-2", compactContent && "p-3 pb-1.5")}>
        <div
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1"
          data-analysis-card-header
        >
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words leading-5 [overflow-wrap:anywhere]">
                <WidgetTitleText fallback={widget.title} />
              </span>
            </CardTitle>
            <CardDescription
              className={cn(
                "whitespace-normal break-words [overflow-wrap:anywhere]",
                compactSummary && "!line-clamp-2",
                compactWidget && "!line-clamp-1",
                compactContent ? "mt-0.5 text-xs leading-4" : "mt-1",
              )}
              title={model.description}
            >
              {model.description}
            </CardDescription>
          </div>
          {widgetAction}
          {!compactWidget ? (
            <div className="col-span-full min-w-0 pt-1">
              <div
                className="flex min-w-0 flex-wrap items-center gap-1.5"
                data-analysis-card-badges
              >
                <Badge
                  variant="outline"
                  className={ANALYSIS_READABLE_BADGE_CLASS_NAME}
                  title={scenarioSummary}
                >
                  {scenarioSummary}
                </Badge>
                {(widget.kind === "timeline" ||
                  widget.kind === "comparison" ||
                  widget.kind === "hourly_occupancy") && (
                  <Badge
                    variant="outline"
                    className={ANALYSIS_READABLE_BADGE_CLASS_NAME}
                  >
                    {analysisGranularityLabel(effectiveGranularity)}
                  </Badge>
                )}
                {widget.kind === "hourly_occupancy" ? (
                  <Badge
                    variant="outline"
                    className={ANALYSIS_READABLE_BADGE_CLASS_NAME}
                  >
                    Início {formatOccupancyStartHour(widget.startHour)}
                  </Badge>
                ) : null}
                {(widget.kind === "cumulative" ||
                  widget.kind === "cumulative_metric" ||
                  widget.kind === "daily_comparison" ||
                  widget.kind === "target_progress") ? (
                  <Badge
                    variant="outline"
                    className={ANALYSIS_READABLE_BADGE_CLASS_NAME}
                  >
                    {periodAnalysisBaselineLabel(widget.baseline)}
                  </Badge>
                ) : null}
                {model.insights?.map((insight) => (
                  <Badge
                    key={`${insight.label}-${insight.value}`}
                    variant={
                      insight.tone === "primary" ? "secondary" : "outline"
                    }
                    className={cn(
                      ANALYSIS_READABLE_BADGE_CLASS_NAME,
                      "gap-x-1 gap-y-0 tabular-nums",
                      insight.tone === "primary" &&
                        "bg-primary/10 text-primary",
                      insight.tone === "muted" && "text-muted-foreground",
                      insight.tone === "positive" &&
                        "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      insight.tone === "negative" &&
                        "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
                    )}
                    title={`${insight.label}: ${insight.value}`}
                  >
                    <span className="min-w-0 font-normal opacity-75 [overflow-wrap:anywhere]">
                      {insight.label}
                    </span>
                    <span className="min-w-0 max-w-full font-semibold [overflow-wrap:anywhere]">
                      {insight.value}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "flex min-h-0 min-w-0 flex-col flex-1 !overflow-hidden",
          compactContent && "px-3 pb-3",
        )}
      >
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full flex-1 self-stretch" />
        ) : model.error ? (
          <EmptyState text={model.error} />
        ) : model.displayTable && (model.displayTableData || model.table) ? (
          <AnalysisTable table={model.displayTableData ?? model.table!} />
        ) : model.metrics ? (
          <MetricGrid compact={compactContent} metrics={model.metrics} />
        ) : model.hasData && model.option ? (
          <div className="h-full min-h-0 w-full flex-1 overflow-hidden">
            <EChart className="h-full min-h-0 w-full flex-1" option={model.option} />
          </div>
        ) : (
          <EmptyState text={model.emptyText} />
        )}
      </CardContent>
    </Card>
  );
}

function MetricGrid({
  compact = false,
  metrics,
}: {
  compact?: boolean;
  metrics: NonNullable<PeriodAnalysisWidgetModel["metrics"]>;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 w-full min-w-0 self-stretch overflow-hidden rounded-md border bg-border",
        metrics.length === 1
          ? "grid-cols-1"
          : "grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-px",
      )}
      data-analysis-metric-grid
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden bg-card",
            compact ? "p-2.5" : "p-3.5",
          )}
        >
          <div
            className={cn(
              "break-words font-semibold uppercase tracking-[0.025em] text-muted-foreground [overflow-wrap:anywhere]",
              compact ? "text-[11px] leading-4" : "text-xs leading-4",
            )}
          >
            {metric.label}
          </div>
          <div
            className={cn(
              "max-w-full break-words font-semibold leading-tight tabular-nums [font-size:clamp(1rem,6cqi,1.5rem)] [overflow-wrap:anywhere]",
              compact ? "mt-1.5" : "mt-2",
            )}
            data-analysis-metric-value
          >
            {typeof metric.value === "number"
              ? formatNumber(metric.value)
              : metric.value}
          </div>
          {metric.description ? (
            <div
              className={cn(
                "mt-auto line-clamp-2 break-words pt-1 text-muted-foreground [overflow-wrap:anywhere]",
                compact ? "text-[11px] leading-4" : "text-xs leading-4",
              )}
              title={metric.description}
            >
              {metric.description}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AnalysisTable({
  table,
}: {
  table: NonNullable<PeriodAnalysisWidgetModel["table"]>;
}) {
  return (
    <div
      className="enterprise-horizontal-scroll h-full min-h-0 min-w-0 overflow-auto rounded-md border"
      data-analysis-table
      role="region"
      aria-label={table.title}
      tabIndex={0}
    >
      <table
        className="w-full table-auto border-collapse text-sm"
        style={{ minWidth: `${Math.max(32, table.columns.length * 9)}rem` }}
      >
        <colgroup>
          {table.columns.map((column) => (
            <col
              key={column.key}
              style={column.width ? { width: `${column.width}%` } : undefined}
            />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground [overflow-wrap:anywhere]",
                  column.numeric && "whitespace-nowrap text-right",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={`${String(row[table.columns[0]?.key] ?? rowIndex)}-${rowIndex}`}
              className={cn(rowIndex === 0 ? "bg-primary/5 font-semibold" : "odd:bg-muted/25")}
            >
              {table.columns.map((column) => {
                const value = row[column.key];
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "border-b px-3 py-2 align-top whitespace-normal [overflow-wrap:anywhere] last:border-b-0",
                      column.numeric && "whitespace-nowrap text-right tabular-nums",
                    )}
                    title={String(value ?? "-")}
                  >
                    {column.numeric && typeof value === "number"
                      ? formatNumber(value)
                      : String(value ?? "-")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WidgetDialog({
  form,
  onFormChange,
  onKindChange,
  onOpenChange,
  onSave,
  open,
  scenarios,
  scopeOptions,
}: {
  form: PeriodAnalysisWidgetInput;
  onFormChange: React.Dispatch<React.SetStateAction<PeriodAnalysisWidgetInput>>;
  onKindChange: (kind: PeriodAnalysisWidgetKind) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
  scenarios: Scenario[];
  scopeOptions: PeriodAnalysisScopeOption[];
}) {
  const widgetKindInputId = React.useId();
  const widgetTitleInputId = React.useId();
  const widgetScopeModeInputId = React.useId();
  const widgetGranularityInputId = React.useId();
  const widgetBaselineInputId = React.useId();
  const widgetStartHourInputId = React.useId();
  const configurableGranularity =
    form.kind === "timeline" || form.kind === "comparison";
  const hourlyOccupancy = form.kind === "hourly_occupancy";
  const scopeModeConfigurable = widgetSupportsScopeMode(form.kind);
  const availableScopeModes = React.useMemo(
    () =>
      (["scenario", "location", "sub_location"] as const).filter((mode) =>
        scopeOptions.some((option) => option.mode === mode),
      ),
    [scopeOptions],
  );
  const selectableScopes = React.useMemo(
    () => scopeOptions.filter((option) => option.mode === form.scopeMode),
    [form.scopeMode, scopeOptions],
  );
  const selectableItems = React.useMemo(
    () =>
      form.scopeMode === "scenario"
        ? scenarios
        : selectableScopes.map<Scenario>((scope) => ({
            active: true,
            company_id: "",
            description: scope.description,
            id: scope.id,
            lines: [],
            name: scope.name,
          })),
    [form.scopeMode, scenarios, selectableScopes],
  );
  const invalidCustomSelection =
    form.selectionMode === "custom" &&
    (hourlyOccupancy
      ? !form.entryScenarioIds.length || !form.exitScenarioIds.length
      : !form.scenarioIds.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Configurar widget" : "Adicionar widget"}
          </DialogTitle>
          <DialogDescription>
            Configuração individual do widget.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor={widgetKindInputId} label="Tipo de análise">
            <Select
              value={form.kind}
              onValueChange={(value) =>
                onKindChange(value as PeriodAnalysisWidgetKind)
              }
            >
              <SelectTrigger id={widgetKindInputId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {widgetKindGroups.map((group, groupIndex) => (
                  <React.Fragment key={group.value}>
                    {groupIndex ? <SelectSeparator /> : null}
                    <SelectGroup>
                      <SelectLabel>{group.label}</SelectLabel>
                      {widgetKindOptions
                        .filter((option) => option.group === group.value)
                        .map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-4 text-muted-foreground">
              {
                widgetKindOptions.find((option) => option.value === form.kind)
                  ?.description
              }
            </p>
          </Field>

          <Field htmlFor={widgetTitleInputId} label="Título">
            <Input
              id={widgetTitleInputId}
              value={form.title}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder={widgetKindLabel(form.kind)}
            />
          </Field>

          {scopeModeConfigurable && availableScopeModes.length > 1 ? (
            <Field htmlFor={widgetScopeModeInputId} label="Tipo de visão">
              <Select
                value={form.scopeMode}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    scenarioIds: [],
                    selectionMode: "all",
                    scopeMode: value as PeriodAnalysisScopeMode,
                  }))
                }
              >
                <SelectTrigger id={widgetScopeModeInputId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableScopeModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {periodAnalysisScopeModeLabel(mode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {configurableGranularity ? (
            <Field htmlFor={widgetGranularityInputId} label="Agrupamento">
              <Select
                value={form.granularity}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    granularity: value as ScenarioAnalyticsGranularity,
                  }))
                }
              >
                <SelectTrigger id={widgetGranularityInputId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">Minuto a minuto</SelectItem>
                  <SelectItem value="hour">Hora a hora</SelectItem>
                  <SelectItem value="day">Dia a dia</SelectItem>
                  <SelectItem value="week">Semana a semana</SelectItem>
                  <SelectItem value="month">Mês a mês</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {form.kind === "cumulative" ||
          form.kind === "cumulative_metric" ||
          form.kind === "daily_comparison" ||
          form.kind === "target_progress" ? (
            <Field htmlFor={widgetBaselineInputId} label="Base de comparação">
              <Select
                value={form.baseline}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    baseline: value as PeriodAnalysisBaseline,
                  }))
                }
              >
                <SelectTrigger id={widgetBaselineInputId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baselineOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {hourlyOccupancy ? (
            <div className="space-y-3 sm:col-span-2">
              <div className="max-w-[220px] space-y-2">
                <Label htmlFor={widgetStartHourInputId}>
                  Início da contagem diária
                </Label>
                <Select
                  value={String(form.startHour)}
                  onValueChange={(value) =>
                    onFormChange((current) => ({
                      ...current,
                      startHour: Number(value),
                    }))
                  }
                >
                  <SelectTrigger id={widgetStartHourInputId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPANCY_START_HOURS.map((hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {formatOccupancyStartHour(hour)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Cenários de ocupação
                    </div>
                    <div className="text-sm font-semibold">
                      {form.selectionMode === "all"
                        ? "Detecção automática por nome e direção"
                        : "Entradas e saídas escolhidas manualmente"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-[260px]">
                    <Button
                      type="button"
                      size="sm"
                      variant={form.selectionMode === "all" ? "default" : "outline"}
                      onClick={() =>
                        onFormChange((current) => ({
                          ...current,
                          selectionMode: "all",
                        }))
                      }
                    >
                      Automático
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.selectionMode === "custom" ? "default" : "outline"}
                      onClick={() =>
                        onFormChange((current) => ({
                          ...current,
                          selectionMode: "custom",
                        }))
                      }
                    >
                      Escolher
                    </Button>
                  </div>
                </div>
              </div>

              {form.selectionMode === "custom" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <ScenarioPicker
                    allowAll={false}
                    label="Cenários de entrada"
                    mode="custom"
                    onModeChange={() => undefined}
                    onSelectedIdsChange={(entryScenarioIds) =>
                      onFormChange((current) => ({
                        ...current,
                        entryScenarioIds,
                        exitScenarioIds: current.exitScenarioIds.filter(
                          (scenarioId) => !entryScenarioIds.includes(scenarioId),
                        ),
                      }))
                    }
                    scenarios={scenarios.filter(
                      (scenario) =>
                        !form.exitScenarioIds.includes(scenario.id) ||
                        form.entryScenarioIds.includes(scenario.id),
                    )}
                    selectedIds={form.entryScenarioIds}
                  />
                  <ScenarioPicker
                    allowAll={false}
                    label="Cenários de saída"
                    mode="custom"
                    onModeChange={() => undefined}
                    onSelectedIdsChange={(exitScenarioIds) =>
                      onFormChange((current) => ({
                        ...current,
                        entryScenarioIds: current.entryScenarioIds.filter(
                          (scenarioId) => !exitScenarioIds.includes(scenarioId),
                        ),
                        exitScenarioIds,
                      }))
                    }
                    scenarios={scenarios.filter(
                      (scenario) =>
                        !form.entryScenarioIds.includes(scenario.id) ||
                        form.exitScenarioIds.includes(scenario.id),
                    )}
                    selectedIds={form.exitScenarioIds}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <ScenarioPicker
              className="sm:col-span-2"
              label={periodAnalysisScopeModePluralLabel(form.scopeMode)}
              mode={form.selectionMode}
              nounPlural={periodAnalysisScopeModePluralLabel(
                form.scopeMode,
              ).toLowerCase()}
              nounSingular={periodAnalysisScopeModeLabel(
                form.scopeMode,
              ).toLowerCase()}
              onModeChange={(selectionMode) =>
                onFormChange((current) => ({ ...current, selectionMode }))
              }
              onSelectedIdsChange={(scenarioIds) =>
                onFormChange((current) => ({ ...current, scenarioIds }))
              }
              scenarios={selectableItems}
              selectedIds={form.scenarioIds}
              summaryForItem={
                form.scopeMode === "scenario"
                  ? undefined
                  : (item) => item.description || "Visão de câmeras"
              }
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={invalidCustomSelection}
          >
            {form.id ? "Salvar alterações" : "Adicionar widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 self-stretch items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground [overflow-wrap:anywhere]">
      {text}
    </div>
  );
}

function emptyWidgetForm(): PeriodAnalysisWidgetInput {
  return {
    baseline: "previous_period",
    entryScenarioIds: [],
    exitScenarioIds: [],
    granularity: "hour",
    kind: "timeline",
    scenarioIds: [],
    selectionMode: "all",
    scopeMode: "scenario",
    startHour: 0,
    title: "Fluxo por período",
  };
}

function periodAnalysisScenarioSummary(
  widget: PeriodAnalysisWidget,
  scenarios: Scenario[],
  scopeOptions: PeriodAnalysisScopeOption[],
) {
  if (widget.kind !== "hourly_occupancy") {
    if (widget.scopeMode !== "scenario") {
      const available = scopeOptions.filter(
        (scope) => scope.mode === widget.scopeMode,
      );
      const selectedIds = new Set(widget.scenarioIds);
      const count =
        widget.selectionMode === "all"
          ? available.length
          : available.filter((scope) => selectedIds.has(scope.id)).length;
      const label = periodAnalysisScopeModePluralLabel(
        widget.scopeMode,
      ).toLowerCase();
      return widget.selectionMode === "all"
        ? `Todos os ${label} (${formatNumber(count)})`
        : `${formatNumber(count)} ${label} selecionado(s)`;
    }
    return scenarioSelectionSummary(
      scenarios,
      widget.selectionMode,
      widget.scenarioIds,
    );
  }

  if (widget.selectionMode === "all") {
    const automatic = inferOccupancyScenarios(scenarios);
    return `Automático · ${formatNumber(automatic.entries.length)} entradas · ${formatNumber(automatic.exits.length)} saídas`;
  }

  const availableIds = new Set(scenarios.map((scenario) => scenario.id));
  const entries = widget.entryScenarioIds.filter((scenarioId) =>
    availableIds.has(scenarioId),
  ).length;
  const exits = widget.exitScenarioIds.filter((scenarioId) =>
    availableIds.has(scenarioId),
  ).length;
  return `${formatNumber(entries)} entradas · ${formatNumber(exits)} saídas`;
}

function composePeriodAnalysisReport({
  models,
  period,
  timeZone,
}: {
  models: Array<{
    chartType?: CardChartType;
    defaultTitle: string;
    model: PeriodAnalysisWidgetModel;
    scenarioSummary: string;
    title: string;
  }>;
  period: PeriodAnalysisRange;
  timeZone: string;
}): ReportPayload {
  const singleDay = isSingleDayAnalysisPeriod(period);
  const generatedAt = new Date();
  const dataCompleteUntil = periodAnalysisDataCompleteUntil(
    period,
    generatedAt,
  );
  return {
    charts: models.flatMap(({ chartType, defaultTitle, model, title }) =>
      model.hasData && model.option && model.table
        ? [
            {
              description: model.description,
              option: applyChartTypePreference(model.option, chartType),
              table: {
                ...model.table,
                title:
                  title === defaultTitle
                    ? model.table.title
                    : `Dados - ${title}`,
              },
              title,
            },
          ]
        : [],
    ),
    context: [
      singleDay ? "Análise histórica diária" : "Período consolidado",
      formatPeriodAnalysisRange(period),
      ...Array.from(
        new Set(
          models.map(
            ({ scenarioSummary, title }) =>
              `Composição de “${title}”: ${scenarioSummary}`,
          ),
        ),
      ),
    ],
    dataCompleteUntil,
    filename: `ipxdata-analises-${formatFileDate(period.from)}-${formatFileDate(
      dataCompleteUntil,
    )}`,
    generatedAt,
    metrics: models.flatMap(({ defaultTitle, model, title }) => {
      const metrics = model.metrics ?? [];
      if (title === defaultTitle) return metrics;
      return metrics.map((metric) => ({
        ...metric,
        label:
          metrics.length === 1 ? title : `${title} · ${metric.label}`,
      }));
    }),
    subtitle: formatPeriodAnalysisRange(period),
    tables: models.flatMap(({ defaultTitle, model, title }) =>
      model.option || !model.table
        ? []
        : [
            {
              ...model.table,
              title: title === defaultTitle ? model.table.title : title,
            },
          ],
    ),
    timeZone,
    title: singleDay ? "Análise do dia" : "Análises por período",
  };
}

function periodAnalysisDataCompleteUntil(
  period: PeriodAnalysisRange,
  now: Date,
) {
  const inclusiveEnd = new Date(period.to.getTime() - 1);
  return now >= period.from && now < period.to
    ? new Date(Math.min(now.getTime(), inclusiveEnd.getTime()))
    : inclusiveEnd;
}

async function fetchAnalysisSubLocations(
  locations: Location[],
  companyScopeId?: string | null,
  signal?: AbortSignal,
  requireExplicitCompanyId = false,
) {
  const expectedCompanyId = companyScopeId?.trim() || undefined;
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<unknown>(
        `/locations/${location.id}/sub-locations`,
        {
          companyScopeId: expectedCompanyId,
          signal,
        },
      ).then((value) =>
        requireSubLocationRows(
          requireExplicitCompanyId
            ? selectExplicitCompanyScopedRows(value, expectedCompanyId!, {
                label: "sublocais",
              }).rows
            : value,
          expectedCompanyId,
        ),
      ),
    ),
  );

  return filterScopedApiRows(
    requireSubLocationRows(rows.flat(), expectedCompanyId),
    companyScopeId,
  );
}

function fetchAnalysisDataset(
  granularity: AggregateGranularity,
  range: PeriodAnalysisRange,
  companyScopeId?: string | null,
  signal?: AbortSignal,
): Promise<PeriodAnalysisDataset> {
  const execute = async (): Promise<PeriodAnalysisDataset> => {
    try {
      return {
        granularity,
        rows: await fetchCompleteAggregateRange({
          companyScopeId: companyScopeId?.trim() || undefined,
          from: range.from,
          granularity,
          metricType: DEFAULT_METRIC_TYPE,
          signal,
          to: range.to,
        }),
      };
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      return {
        error: analysisErrorMessage(
          error,
          "Não foi possível carregar os dados.",
        ),
        granularity,
        rows: [],
      };
    }
  };

  if (!signal) return execute();
  const key = JSON.stringify([
    companyScopeId?.trim() ?? "",
    granularity,
    range.from.toISOString(),
    range.to.toISOString(),
  ]);
  let pending = pendingAnalysisDatasetsBySignal.get(signal);
  if (!pending) {
    pending = new Map();
    pendingAnalysisDatasetsBySignal.set(signal, pending);
  }
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = execute();
  pending.set(key, promise);
  const release = () => {
    if (pending?.get(key) === promise) pending.delete(key);
  };
  void promise.then(release, release);
  return promise;
}

async function fetchAnalysisConsolidatedDayDatasets(
  ranges: PeriodAnalysisRange[],
  companyScopeId?: string | null,
  signal?: AbortSignal,
  cacheOptions?: {
    cache: AnalysisDayCache;
    cacheScope: string;
    revision: string;
  },
): Promise<Map<string, PeriodAnalysisDataset>> {
  const uniqueRanges = new Map(
    ranges
      .filter((range) => range.from < range.to)
      .map((range) => [analysisRangeKey(range), range] as const),
  );
  const rangeParts = new Map(
    Array.from(uniqueRanges, ([key, range]) => [
      key,
      splitAnalysisRangeAtDayBoundaries(range),
    ]),
  );
  const mergedFullDayRanges = mergeAnalysisRanges(
    Array.from(rangeParts.values()).flatMap(({ fullDays }) =>
      fullDays ? [fullDays] : [],
    ),
  );
  const uniquePartialDayRanges = new Map(
    Array.from(rangeParts.values())
      .flatMap(({ partialDays }) => partialDays)
      .map((range) => [analysisRangeKey(range), range] as const),
  );
  const [fullDayDatasets, partialDayDatasets] = await Promise.all([
    Promise.all(
      mergedFullDayRanges.map(async (range) => ({
        dataset: await fetchCachedAnalysisDayDataset(
          range,
          companyScopeId,
          signal,
          cacheOptions,
        ),
        range,
      })),
    ),
    Promise.all(
      Array.from(uniquePartialDayRanges, async ([key, range]) => ({
        dataset: rollupAnalysisDataset(
          await fetchAnalysisExactHourlyDataset(
            range,
            companyScopeId,
            signal,
          ),
          "day",
          range,
        ),
        key,
      })),
    ),
  ]);
  const partialByKey = new Map(
    partialDayDatasets.map(({ dataset, key }) => [key, dataset]),
  );

  return new Map(
    Array.from(uniqueRanges, ([key]) => {
      const { fullDays, partialDays } = rangeParts.get(key)!;
      const relevantFullDatasets = fullDays
        ? fullDayDatasets.filter(
            ({ range: sourceRange }) =>
              sourceRange.from < fullDays.to && sourceRange.to > fullDays.from,
          )
        : [];
      const relevantPartialDatasets = partialDays.map(
        (partialRange) =>
          partialByKey.get(analysisRangeKey(partialRange)) ??
          emptyDataset("day"),
      );
      const error =
        relevantFullDatasets.find(({ dataset }) => dataset.error)?.dataset
          .error ??
        relevantPartialDatasets.find((dataset) => dataset.error)?.error;
      const fullRows = fullDays
        ? relevantFullDatasets.flatMap(({ dataset }) =>
            dataset.rows.filter((row) =>
              aggregateBucketInRange(
                row.bucket,
                "day",
                fullDays.from,
                fullDays.to,
              ),
            ),
          )
        : [];

      return [
        key,
        {
          ...(error ? { error } : {}),
          granularity: "day" as const,
          partialBoundariesReconciled: partialDays.length > 0,
          rows: error
            ? []
            : [
                ...fullRows,
                ...relevantPartialDatasets.flatMap((dataset) => dataset.rows),
              ],
        },
      ] as const;
    }),
  );
}

function mergeAnalysisRanges(ranges: PeriodAnalysisRange[]) {
  const ordered = ranges
    .map((range) => ({ from: new Date(range.from), to: new Date(range.to) }))
    .sort((left, right) => left.from.getTime() - right.from.getTime());
  const merged: PeriodAnalysisRange[] = [];

  ordered.forEach((range) => {
    const current = merged.at(-1);
    if (!current || range.from > current.to) {
      merged.push(range);
      return;
    }
    if (range.to > current.to) current.to = new Date(range.to);
  });

  return merged;
}

function analysisRangeKey(range: PeriodAnalysisRange) {
  return `${range.from.toISOString()}|${range.to.toISOString()}`;
}

async function fetchCachedAnalysisDayDataset(
  range: PeriodAnalysisRange,
  companyScopeId?: string | null,
  signal?: AbortSignal,
  cacheOptions?: {
    cache: AnalysisDayCache;
    cacheScope: string;
    revision: string;
  },
) {
  const key = cacheOptions
    ? JSON.stringify([
        cacheOptions.cacheScope,
        range.from.toISOString(),
        range.to.toISOString(),
      ])
    : "";
  const cached = key ? cacheOptions?.cache.get(key) : undefined;
  if (cached && cacheOptions && cached.revision === cacheOptions.revision) {
    // Refresh insertion order so the bounded Map behaves as an LRU cache.
    cacheOptions.cache.delete(key);
    cacheOptions.cache.set(key, cached);
    return cached.dataset;
  }

  const pendingRequests = cacheOptions
    ? pendingAnalysisDayRequestsForCache(cacheOptions.cache)
    : undefined;
  const pending = key ? pendingRequests?.get(key) : undefined;
  if (
    pending &&
    cacheOptions &&
    pending.revision === cacheOptions.revision &&
    pending.signal === signal
  ) {
    return pending.promise;
  }

  const promise = fetchAnalysisDataset(
    "day",
    range,
    companyScopeId,
    signal,
  );
  if (key && cacheOptions) {
    pendingRequests?.set(key, {
      promise,
      revision: cacheOptions.revision,
      signal,
    });
  }

  try {
    const dataset = await promise;
    signal?.throwIfAborted();
    if (key && cacheOptions && !dataset.error) {
      setAnalysisDayCacheEntry(cacheOptions.cache, key, {
        dataset,
        revision: cacheOptions.revision,
      });
    }
    return dataset;
  } finally {
    if (key && pendingRequests?.get(key)?.promise === promise) {
      pendingRequests.delete(key);
    }
  }
}

function pendingAnalysisDayRequestsForCache(cache: AnalysisDayCache) {
  const existing = pendingAnalysisDayRequests.get(cache);
  if (existing) return existing;

  const requests = new Map<string, PendingAnalysisDayRequest>();
  pendingAnalysisDayRequests.set(cache, requests);
  return requests;
}

function clearAnalysisDayCache(cache: AnalysisDayCache) {
  cache.clear();
  pendingAnalysisDayRequests.get(cache)?.clear();
}

function setAnalysisDayCacheEntry(
  cache: AnalysisDayCache,
  key: string,
  entry: AnalysisDayCacheEntry,
) {
  cache.delete(key);
  cache.set(key, entry);

  while (cache.size > MAX_ANALYSIS_DAY_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

async function fetchAnalysisExactHourlyDataset(
  range: PeriodAnalysisRange,
  companyScopeId?: string | null,
  signal?: AbortSignal,
): Promise<PeriodAnalysisDataset> {
  const fullHours = alignedAnalysisHourRange(range);
  const hourlyPromise = fullHours
    ? fetchAnalysisDataset("hour", fullHours, companyScopeId, signal)
    : Promise.resolve(emptyDataset("hour"));
  const boundaryPromise = Promise.all(
    analysisPartialHourRanges(range).map(async (partialRange) => ({
      dataset: await fetchAnalysisDataset(
        "minute",
        partialRange,
        companyScopeId,
        signal,
      ),
      range: partialRange,
    })),
  );

  const [hourly, boundaries] = await Promise.all([
    hourlyPromise,
    boundaryPromise,
  ]);
  return reconcileAnalysisHourlyBoundaries(hourly, boundaries);
}

function splitAnalysisRangeAtDayBoundaries(range: PeriodAnalysisRange) {
  const fromDay = startOfAggregateBucket(range.from, "day");
  const toDay = startOfAggregateBucket(range.to, "day");
  const fullFrom =
    fromDay.getTime() === range.from.getTime()
      ? range.from
      : addDays(fromDay, 1);
  const fullTo = toDay;

  if (fullFrom >= fullTo) {
    return {
      fullDays: null,
      partialDays: [{ from: range.from, to: range.to }],
    };
  }

  const partialDays: PeriodAnalysisRange[] = [];
  if (range.from < fullFrom) {
    partialDays.push({ from: range.from, to: fullFrom });
  }
  if (fullTo < range.to) {
    partialDays.push({ from: fullTo, to: range.to });
  }

  return {
    fullDays: { from: fullFrom, to: fullTo },
    partialDays,
  };
}

function alignedAnalysisHourRange(
  range: PeriodAnalysisRange,
): PeriodAnalysisRange | null {
  const fromHour = startOfHour(range.from);
  const from =
    fromHour.getTime() === range.from.getTime()
      ? range.from
      : endOfAggregateBucket(fromHour, "hour");
  const to = startOfHour(range.to);
  return from < to ? { from, to } : null;
}

function sameAnalysisRange(
  left: PeriodAnalysisRange,
  right: PeriodAnalysisRange,
) {
  return (
    left.from.getTime() === right.from.getTime() &&
    left.to.getTime() === right.to.getTime()
  );
}

async function fetchAnalysisHourlyDatasets(
  ranges: PeriodAnalysisRange[],
  cache: HourlyAggregateCache,
  cacheScope: string,
  now: Date,
  companyScopeId?: string | null,
  signal?: AbortSignal,
): Promise<PeriodAnalysisDataset> {
  try {
    return {
      granularity: "hour",
      rows: await fetchBoundedHourlyAggregateRanges({
        cache,
        cacheScope,
        companyScopeId: companyScopeId?.trim() || undefined,
        now,
        ranges,
        signal,
      }),
    };
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return {
      error: analysisErrorMessage(
        error,
        "Não foi possível carregar a base horária da análise.",
      ),
      granularity: "hour",
      rows: [],
    };
  }
}

function rollupAnalysisDataset(
  hourly: PeriodAnalysisDataset,
  targetGranularity: "day" | "month",
  range: PeriodAnalysisRange,
): PeriodAnalysisDataset {
  if (hourly.error) {
    return {
      error: hourly.error,
      granularity: targetGranularity,
      rows: [],
    };
  }

  return {
    granularity: targetGranularity,
    rows: rollupAggregateRows(
      hourly.rows,
      hourly.granularity,
      targetGranularity,
      range.from,
      range.to,
    ),
  };
}

function mergeExactHoursIntoDays(
  dayDataset: PeriodAnalysisDataset,
  exactHours: PeriodAnalysisDataset,
  range: PeriodAnalysisRange,
) {
  if (
    exactHours.error ||
    dayDataset.granularity !== "day" ||
    exactHours.granularity !== "hour"
  ) {
    return dayDataset;
  }

  return {
    ...dayDataset,
    error: undefined,
    rows: reconcileAggregateRows(
      dayDataset.rows,
      "day",
      exactHours.rows,
      exactHours.granularity,
      range.from,
      range.to,
    ),
  };
}

function reconcileAnalysisHourlyDataset(
  hourly: PeriodAnalysisDataset,
  minute: PeriodAnalysisDataset,
  queryRange: PeriodAnalysisRange,
  currentMinuteRange: PeriodAnalysisRange | null,
): PeriodAnalysisDataset {
  if (
    !currentMinuteRange ||
    queryRange.from >= currentMinuteRange.to ||
    queryRange.to <= currentMinuteRange.from
  ) {
    return hourly;
  }
  if (hourly.error) return hourly;
  if (minute.error) {
    return {
      error: minute.error,
      granularity: "hour",
      rows: [],
    };
  }
  if (hourly.granularity !== "hour" || minute.granularity !== "minute") {
    return {
      error: "Não foi possível combinar os dados horários recebidos.",
      granularity: "hour",
      rows: [],
    };
  }

  try {
    return {
      granularity: "hour",
      rows: reconcileAggregateRows(
        hourly.rows,
        hourly.granularity,
        minute.rows,
        minute.granularity,
        currentMinuteRange.from,
        currentMinuteRange.to,
      ),
    };
  } catch (error) {
    return {
      error: analysisErrorMessage(
        error,
        "Não foi possível consolidar a hora em andamento.",
      ),
      granularity: "hour",
      rows: [],
    };
  }
}

function reconcileAnalysisMinuteDataset(
  minute: PeriodAnalysisDataset,
  authoritativeMinute: PeriodAnalysisDataset,
  currentMinuteRange: PeriodAnalysisRange | null,
): PeriodAnalysisDataset {
  if (!currentMinuteRange || minute.error) return minute;
  if (authoritativeMinute.error) {
    return {
      error: authoritativeMinute.error,
      granularity: "minute",
      rows: [],
    };
  }
  if (
    minute.granularity !== "minute" ||
    authoritativeMinute.granularity !== "minute"
  ) {
    return {
      error:
        "Não foi possível combinar os dados por minuto recebidos.",
      granularity: "minute",
      rows: [],
    };
  }

  try {
    return {
      granularity: "minute",
      rows: reconcileAggregateRows(
        minute.rows,
        minute.granularity,
        authoritativeMinute.rows,
        authoritativeMinute.granularity,
        currentMinuteRange.from,
        currentMinuteRange.to,
      ),
    };
  } catch (error) {
    return {
      error: analysisErrorMessage(
        error,
        "Não foi possível consolidar os minutos em andamento.",
      ),
      granularity: "minute",
      rows: [],
    };
  }
}

function analysisPartialHourRanges(
  range: PeriodAnalysisRange,
): PeriodAnalysisRange[] {
  const ranges = new Map<string, PeriodAnalysisRange>();
  const fromHour = startOfHour(range.from);
  if (fromHour.getTime() !== range.from.getTime()) {
    const to = new Date(
      Math.min(
        range.to.getTime(),
        endOfAggregateBucket(fromHour, "hour").getTime(),
      ),
    );
    if (range.from < to) {
      ranges.set(`${range.from.toISOString()}|${to.toISOString()}`, {
        from: range.from,
        to,
      });
    }
  }

  if (startOfHour(range.to).getTime() !== range.to.getTime()) {
    const lastIncluded = new Date(range.to.getTime() - 1);
    const toHour = startOfHour(lastIncluded);
    const from = new Date(Math.max(range.from.getTime(), toHour.getTime()));
    if (from < range.to) {
      ranges.set(`${from.toISOString()}|${range.to.toISOString()}`, {
        from,
        to: range.to,
      });
    }
  }

  return Array.from(ranges.values());
}

function reconcileAnalysisHourlyBoundaries(
  hourly: PeriodAnalysisDataset,
  boundaries: Array<{
    dataset: PeriodAnalysisDataset;
    range: PeriodAnalysisRange;
  }>,
): PeriodAnalysisDataset {
  if (hourly.error || !boundaries.length) return hourly;
  if (hourly.granularity !== "hour") {
    return {
      error:
        "Não foi possível preparar a referência horária.",
      granularity: "hour",
      rows: [],
    };
  }

  try {
    let rows = hourly.rows;
    for (const { dataset, range } of boundaries) {
      if (dataset.error) {
        return {
          error: dataset.error,
          granularity: "hour",
          rows: [],
        };
      }
      if (dataset.granularity !== "minute") {
        return {
          error: "Não foi possível preparar o limite do período comparável.",
          granularity: "hour",
          rows: [],
        };
      }
      rows = reconcileAggregateRows(
        rows,
        "hour",
        dataset.rows,
        "minute",
        range.from,
        range.to,
      );
    }
    return {
      granularity: "hour",
      partialBoundariesReconciled: true,
      rows,
    };
  } catch (error) {
    return {
      error: analysisErrorMessage(
        error,
        "Não foi possível consolidar o limite horário da referência.",
      ),
      granularity: "hour",
      rows: [],
    };
  }
}

function analysisCurrentMinuteRange(
  ranges: PeriodAnalysisRange[],
  now: Date,
) {
  const from = startOfHour(now);
  const to = new Date(
    Math.min(
      endOfAggregateBucket(from, "hour").getTime(),
      addMinutes(startOfMinute(now), 1).getTime(),
    ),
  );
  return ranges.some((range) => range.from < to && range.to > from)
    ? { from, to }
    : null;
}

function estimatedMinuteBucketCount(range: PeriodAnalysisRange) {
  return Math.ceil(
    Math.max(0, range.to.getTime() - range.from.getTime()) / MINUTE_MS,
  );
}

function emptyData(): PeriodAnalysisData {
  return {
    baseline: {},
    contextHour: emptyDataset("hour"),
    day: emptyDataset("day"),
    hour: emptyDataset("hour"),
    minute: emptyDataset("minute"),
    month: emptyDataset("month"),
  };
}

function deferredAnalysisWidgetModel(
  widget: PeriodAnalysisWidget,
): PeriodAnalysisWidgetModel {
  return {
    description: "Aplique o período quando quiser consultar esta análise.",
    emptyText: "Aguardando a consulta do período.",
    hasData: false,
    height: widget.kind === "heatmap" ? 500 : 320,
  };
}

function emptyDataset(
  granularity: AggregateGranularity,
): PeriodAnalysisDataset {
  return { granularity, rows: [] };
}

function startOfMinute(date: Date) {
  return startOfAggregateBucket(date, "minute");
}

function startOfHour(date: Date) {
  return startOfAggregateBucket(date, "hour");
}

function startOfDay(date: Date) {
  return startOfAggregateBucket(date, "day");
}

function addMinutes(date: Date, amount: number) {
  return new Date(date.getTime() + amount * MINUTE_MS);
}

function addDays(date: Date, amount: number) {
  const civilBoundary = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const isDayBoundary = civilBoundary.getTime() === date.getTime();
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
    isDayBoundary ? 0 : date.getHours(),
    isDayBoundary ? 0 : date.getMinutes(),
    isDayBoundary ? 0 : date.getSeconds(),
    isDayBoundary ? 0 : date.getMilliseconds(),
  );
}

function requireAiDailyRangeWithinLimit(from: Date, to: Date) {
  let cursor = startOfDay(from);
  let dayCount = 0;

  while (cursor < to) {
    dayCount += 1;
    if (dayCount > MAX_AI_DAILY_ROWS) {
      throw new RangeError(
        `O período possui mais de ${formatNumber(MAX_AI_DAILY_ROWS)} dias. Reduza a consulta para gerar uma análise diária completa, sem amostragem.`,
      );
    }
    cursor = addDays(cursor, 1);
  }

  if (!dayCount) {
    throw new RangeError("O período diário da análise está vazio.");
  }
  return dayCount;
}

function formatFileDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function analysisErrorMessage(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}
