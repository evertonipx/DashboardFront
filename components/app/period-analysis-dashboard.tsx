"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
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
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import { EChart, applyChartTypePreference } from "@/components/app/echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import { useCardPreferences } from "@/components/app/use-card-preferences";
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
  aggregateQueryIso,
  endOfAggregateBucket,
  requireAggregateGranularity,
  requireAggregateRowsInRange,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  clearHourlyAggregateCache,
  fetchHourlyAggregateRanges,
  type HourlyAggregateCache,
} from "@/lib/aggregate-hour-query";
import {
  reconcileAggregateRows,
  rollupAggregateRows,
} from "@/lib/aggregate-reconciliation";
import { apiFetch } from "@/lib/api";
import { readCameraGroups } from "@/lib/camera-groups";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  requireCameraRows,
  requireInfrastructureRelations,
  requireLocationRows,
  requireSubLocationRows,
} from "@/lib/metadata-validation";
import { buildLiveAnalysisImport } from "@/lib/live-analysis-import";
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
  PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT,
  createDefaultPeriodAnalysisSettings,
  deletePeriodAnalysisWidget,
  loadPeriodAnalysisSettings,
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
  formatOccupancyStartHour,
  scenarioSelectionSummary,
  type ScenarioAnalyticsGranularity,
} from "@/lib/scenario-analytics";
import { inferOccupancyScenarios } from "@/lib/scenario-direction";
import { requireScenarioRows } from "@/lib/scenario-validation";
import type {
  AggregateEventsResponse,
  AggregateGranularity,
  Location,
  Scenario,
} from "@/lib/types";
import { cn, formatNumber, formatTime } from "@/lib/utils";
import {
  saveCardPreferences,
  type CardChartType,
} from "@/lib/view-preferences";
import type { WidgetViewPreset } from "@/lib/widget-view-presets";

type PeriodAnalysisDashboardProps = {
  manager?: boolean;
};

const MINUTE_MS = 60_000;
const MAX_ANALYSIS_MINUTE_BUCKETS = 20_000;
const LIVE_ANALYSIS_REFRESH_MS = 5_000;
const DEFAULT_METRIC_TYPE = "count";
const OCCUPANCY_START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

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
  const canEditVisual = hasVisualAdminAccess(user);
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [scopeOptions, setScopeOptions] = React.useState<
    PeriodAnalysisScopeOption[]
  >([]);
  const [widgets, setWidgets] = React.useState<PeriodAnalysisWidget[]>([]);
  const [draftSettings, setDraftSettings] = React.useState<PeriodAnalysisSettings>(
    () => createDefaultPeriodAnalysisSettings(),
  );
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
  const [queryVersion, setQueryVersion] = React.useState(0);
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [widgetDialogOpen, setWidgetDialogOpen] = React.useState(false);
  const [widgetForm, setWidgetForm] =
    React.useState<PeriodAnalysisWidgetInput>(() => emptyWidgetForm());
  const requestRef = React.useRef<AbortController | null>(null);
  const hasLoadedDataRef = React.useRef(false);
  const hourlyAggregateCacheRef = React.useRef<HourlyAggregateCache>(
    new Map(),
  );
  const period = React.useMemo(
    () =>
      resolvePeriodAnalysisRange(appliedSettings.from, appliedSettings.to) ??
      resolvePeriodAnalysisRange(
        createDefaultPeriodAnalysisSettings().from,
        createDefaultPeriodAnalysisSettings().to,
      )!,
    [appliedSettings],
  );
  const singleDayAnalysis = appliedSettings.mode === "day";
  const operationalPeriod = React.useMemo(
    () => periodAnalysisOperationalRange(period),
    [period],
  );
  const autoRefreshEnabled =
    new Date() >= period.from && new Date() < period.to;
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
  const dataRequirementsKey = React.useMemo(
    () => {
      const needsExactHour =
        singleDayAnalysis ||
        widgets.some(
          (widget) =>
              widget.kind === "hour_profile" ||
              widget.kind === "hourly_occupancy" ||
              ((widget.kind === "timeline" || widget.kind === "comparison") &&
                widget.granularity === "hour"),
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
            widgets
              .filter((widget) => baselineKinds.has(widget.kind))
              .map((widget) => widget.baseline),
          ),
        ).sort(),
        // Daily totals always come from the same hourly source, regardless of
        // which visual widgets happen to be enabled.
        contextHour: true,
        hour: needsExactHour,
        minute: widgets.some(
          (widget) =>
            (widget.kind === "timeline" || widget.kind === "comparison") &&
            widget.granularity === "minute",
        ),
        month: widgets.some(
          (widget) =>
            widget.kind === "year_monthly" ||
            widget.kind === "year_accumulated",
        ),
      });
    },
    [singleDayAnalysis, widgets],
  );

  React.useEffect(() => {
    const settings = loadPeriodAnalysisSettings(companyScopeId, user?.id);
    hasLoadedDataRef.current = false;
    clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
    setMetadataError("");
    setDataLoadError("");
    setScenarios([]);
    setScopeOptions([]);
    setData(emptyData());
    setLastUpdated(null);
    setDraftSettings(settings);
    setAppliedSettings(settings);
    setWidgets(loadPeriodAnalysisWidgets(companyScopeId, user?.id));
  }, [companyScopeId, user?.id]);

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
    let cancelled = false;
    setLoadingScenarios(true);
    setMetadataError("");
    setScenarios([]);
    setScopeOptions([]);
    Promise.all([
      apiFetch<unknown>("/scenarios"),
      apiFetch<unknown>("/cameras"),
      apiFetch<unknown>("/locations"),
    ])
      .then(async ([scenarioRows, cameraRows, locationRows]) => {
        if (cancelled) return;
        const scopedScenarios = filterScopedApiRows(
          requireScenarioRows(scenarioRows),
          companyScopeId,
        );
        const scopedCameras = filterScopedApiRows(
          requireCameraRows(cameraRows),
          companyScopeId,
        );
        const scopedLocations = filterScopedApiRows(
          requireLocationRows(locationRows),
          companyScopeId,
        );
        const subLocations = await fetchAnalysisSubLocations(
          scopedLocations,
          companyScopeId,
        );
        requireInfrastructureRelations({
          cameras: scopedCameras,
          locations: scopedLocations,
          subLocations,
        });
        if (cancelled) return;
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
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os cenários.";
        setMetadataError(message);
        setScenarios([]);
        setScopeOptions([]);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingScenarios(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyScopeId, manager]);

  React.useEffect(() => {
    const requirements = JSON.parse(dataRequirementsKey) as {
      baseline: PeriodAnalysisBaseline[];
      contextHour: boolean;
      hour: boolean;
      minute: boolean;
      month: boolean;
    };
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const announceErrors = !hasLoadedDataRef.current;
    if (announceErrors) setLoadingData(true);
    const now = new Date();

    const dayRange = {
      from: addDays(operationalPeriod.from, -29),
      to: operationalPeriod.to,
    };
    const referenceDate = new Date(period.to.getTime() - 1);
    const periodCoverageTo =
      now >= period.from && now < period.to
        ? addMinutes(startOfMinute(now), 1)
        : period.to;
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
    const requiredHourRanges = [
      ...(requirements.contextHour ? [dayRange] : []),
      ...(requirements.month ? [monthRange] : []),
      ...baselineRanges.map(([, range]) => range),
      ...baselineComparableRanges.values(),
    ];
    const canonicalHourPromise = requiredHourRanges.length
      ? fetchAnalysisHourlyDatasets(
          requiredHourRanges,
          hourlyAggregateCacheRef.current,
          `analysis:${companyScopeId ?? "jwt-company"}`,
          now,
          controller.signal,
        )
      : Promise.resolve(emptyDataset("hour"));
    const contextHourPromise = requirements.contextHour
      ? canonicalHourPromise.then((dataset) =>
          sliceAnalysisHourlyDataset(dataset, dayRange),
        )
      : Promise.resolve(emptyDataset("hour"));
    const hourPromise = requirements.hour
      ? contextHourPromise
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
        : fetchAnalysisDataset("minute", period, controller.signal)
      : Promise.resolve(emptyDataset("minute"));
    const monthPromise = requirements.month
      ? canonicalHourPromise.then((dataset) =>
          sliceAnalysisHourlyDataset(dataset, monthRange),
        )
      : Promise.resolve(emptyDataset("hour"));
    const currentMinuteRange = analysisCurrentMinuteRange(
      requiredHourRanges,
      now,
    );
    const reconciliationMinutePromise = currentMinuteRange
      ? fetchAnalysisDataset(
          "minute",
          currentMinuteRange,
          controller.signal,
        )
      : Promise.resolve(emptyDataset("minute"));

    Promise.all([
      Promise.resolve(emptyDataset("day")),
      hourPromise,
      contextHourPromise,
      minutePromise,
      monthPromise,
      reconciliationMinutePromise,
      Promise.all(
        baselineRanges.map(async ([baseline, baselineRange]) => {
          const comparableRange =
            baselineComparableRanges.get(baseline) ?? baselineRange;
          const boundaryMinutePromise = Promise.all(
            analysisPartialHourRanges(comparableRange).map(
              async (range) => ({
                dataset: await fetchAnalysisDataset(
                  "minute",
                  range,
                  controller.signal,
                ),
                range,
              }),
            ),
          );
          const dataset = sliceAnalysisHourlyDataset(
            await canonicalHourPromise,
            baselineRange,
          );
          const comparableDataset = sliceAnalysisHourlyDataset(
            await canonicalHourPromise,
            comparableRange,
          );
          return [
            baseline,
            baselineRange,
            dataset,
            comparableRange,
            reconcileAnalysisHourlyBoundaries(
              comparableDataset,
              await boundaryMinutePromise,
            ),
          ] as const;
        }),
      ),
    ])
      .then(
        ([
          day,
          hour,
          rawContextHour,
          minute,
          rawMonthHours,
          reconciliationMinute,
          rawBaselineEntries,
        ]) => {
          if (controller.signal.aborted) return;
          const contextHour = reconcileAnalysisHourlyDataset(
            rawContextHour,
            reconciliationMinute,
            dayRange,
            currentMinuteRange,
          );
          const reconciledHour = requirements.hour
            ? contextHour
            : hour;
          const reconciledMinute = requirements.minute
            ? reconcileAnalysisMinuteDataset(
                minute,
                reconciliationMinute,
                currentMinuteRange,
              )
            : minute;
          const month = requirements.month
            ? rollupAnalysisDataset(
                reconcileAnalysisHourlyDataset(
                  rawMonthHours,
                  reconciliationMinute,
                  monthRange,
                  currentMinuteRange,
                ),
                "month",
                monthRange,
              )
            : emptyDataset("month");
          const baselineEntries = rawBaselineEntries.map(
            ([baseline, baselineRange, dataset]) =>
              [
                baseline,
                reconcileAnalysisHourlyDataset(
                  dataset,
                  reconciliationMinute,
                  baselineRange,
                  currentMinuteRange,
                ),
              ] as const,
          );
          const baselineComparableEntries = rawBaselineEntries.map(
            ([baseline, , , comparableRange, dataset]) =>
              [
                baseline,
                reconcileAnalysisHourlyDataset(
                  dataset,
                  reconciliationMinute,
                  comparableRange,
                  currentMinuteRange,
                ),
              ] as const,
          );
          const reconciledDay = requirements.contextHour
            ? contextHour.error
              ? { ...day, error: contextHour.error }
              : mergeExactHoursIntoDays(day, contextHour, dayRange)
            : singleDayAnalysis && requirements.hour
              ? mergeExactHoursIntoDays(day, reconciledHour, period)
              : day;
          setData({
            baseline: Object.fromEntries(baselineEntries),
            baselineComparable: Object.fromEntries(
              baselineComparableEntries,
            ),
            contextHour,
            day: reconciledDay,
            hour: reconciledHour,
            minute: reconciledMinute,
            month,
          });
          setDataLoadError("");
          hasLoadedDataRef.current = true;
          setLastUpdated(new Date());
          if (
            announceErrors &&
            (reconciledDay.error ||
              hour.error ||
              contextHour.error ||
              reconciledMinute.error ||
              month.error ||
              baselineEntries.some(([, dataset]) => dataset.error) ||
              baselineComparableEntries.some(
                ([, dataset]) => dataset.error,
              ))
          ) {
            toast.error(
              "Alguns dados da análise não puderam ser carregados.",
            );
          }
        },
      )
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a análise.";
        setData(emptyData());
        setDataLoadError(message);
        hasLoadedDataRef.current = false;
        toast.error(message);
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoadingData(false);
        }
      });

    return () => controller.abort();
  }, [
    companyScopeId,
    dataRequirementsKey,
    operationalPeriod,
    period,
    queryVersion,
    singleDayAnalysis,
  ]);

  React.useEffect(() => {
    if (!autoRefreshEnabled) return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        setQueryVersion((value) => value + 1);
      }
    };
    const interval = window.setInterval(refresh, LIVE_ANALYSIS_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [autoRefreshEnabled, period]);

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
  const modelByWidgetId = React.useMemo(
    () =>
      new Map(
        widgets.map((widget) => [
          widget.id,
          buildPeriodAnalysisWidgetModel({
            chartType: widgetChartTypeById.get(widget.id),
            color: widgetColorById.get(widget.id),
            data,
            period,
            scenarios,
            scopeOptions,
            widget,
          }),
        ]),
      ),
    [
      data,
      period,
      scenarios,
      scopeOptions,
      widgetChartTypeById,
      widgetColorById,
      widgets,
    ],
  );
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
      defaultHeight: short
        ? ("short" as const)
        : tall
          ? ("tall" as const)
          : ("standard" as const),
      defaultSize: compact
        ? ("compact" as const)
        : fullWidth
          ? ("full" as const)
          : ("wide" as const),
      id: widget.id,
      label: widget.title,
      minHeight: short ? ("short" as const) : undefined,
      node: (
        <PeriodAnalysisCard
          canConfigure={canEditVisual}
          effectiveGranularity={periodAnalysisEffectiveGranularity(widget)}
          loading={loadingData || loadingScenarios}
          model={modelByWidgetId.get(widget.id)!}
          monitorMode={monitorMode}
          onEdit={() => openEditWidget(widget)}
          onRemove={() => removeWidget(widget.id)}
          scenarioSummary={periodAnalysisScenarioSummary(
            widget,
            scenarios,
            scopeOptions,
          )}
          widget={widget}
        />
      ),
      shortHeightClassName:
        widget.kind === "summary"
          ? "row-span-2 sm:row-span-1"
          : compact
            ? "row-span-1"
            : undefined,
      zoomEnabled:
        widget.kind !== "summary" &&
        widget.kind !== "totals_table" &&
        !compact,
    };
  });
  const visibleWidgetIds = new Set(
    preferences
      .filter((preference) => preference.visible !== false)
      .map((preference) => preference.id),
  );
  const reportPayload = composePeriodAnalysisReport({
    models: widgets
      .filter(
        (widget) => !preferences.length || visibleWidgetIds.has(widget.id),
      )
      .map((widget) => ({
        chartType: widgetChartTypeById.get(widget.id),
        model: modelByWidgetId.get(widget.id)!,
        title: widget.title,
      })),
    period,
  });

  function commitAnalysisSettings(nextSettings: PeriodAnalysisSettings) {
    let normalizedSettings =
      nextSettings.mode === "day"
        ? {
            ...nextSettings,
            from: nextSettings.from || nextSettings.to,
            to: nextSettings.from || nextSettings.to,
          }
        : nextSettings;
    if (
      normalizedSettings.mode === "range" &&
      normalizedSettings.from === normalizedSettings.to
    ) {
      normalizedSettings = { ...normalizedSettings, mode: "day" };
    }
    const nextPeriod = resolvePeriodAnalysisRange(
      normalizedSettings.from,
      normalizedSettings.to,
    );
    if (!nextPeriod) {
      toast.error("Informe um período válido, com a data inicial antes da final.");
      return;
    }

    savePeriodAnalysisSettings(normalizedSettings, companyScopeId, user?.id);
    requestRef.current?.abort();
    requestRef.current = null;
    hasLoadedDataRef.current = false;
    setDataLoadError("");
    setData(emptyData());
    setDraftSettings(normalizedSettings);
    setLoadingData(true);
    setAppliedSettings(normalizedSettings);
    setQueryVersion((value) => value + 1);
  }

  function applyPeriod() {
    commitAnalysisSettings(draftSettings);
  }

  function updateAnalysisMode(mode: PeriodAnalysisSettings["mode"]) {
    if (mode === draftSettings.mode) return;

    const referenceDate =
      parseDateInputValue(draftSettings.to || draftSettings.from) ?? new Date();
    if (mode === "day") {
      const date = formatFileDate(referenceDate);
      commitAnalysisSettings({ from: date, mode, to: date });
      return;
    }

    commitAnalysisSettings({
      from: formatFileDate(addDays(referenceDate, -6)),
      mode,
      to: formatFileDate(referenceDate),
    });
  }

  function selectAnalysisDay(value: string) {
    if (!value) return;
    commitAnalysisSettings({ from: value, mode: "day", to: value });
  }

  function shiftAnalysisDay(amount: number) {
    const selectedDate = parseDateInputValue(appliedSettings.from);
    if (!selectedDate) return;
    selectAnalysisDay(formatFileDate(addDays(selectedDate, amount)));
  }

  function applyRangePreset(preset: "7d" | "30d" | "month") {
    const endDate = parseDateInputValue(draftSettings.to) ?? new Date();
    const startDate =
      preset === "month"
        ? new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        : addDays(endDate, preset === "7d" ? -6 : -29);
    commitAnalysisSettings({
      from: formatFileDate(startDate),
      mode: "range",
      to: formatFileDate(endDate),
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
          ? "o escopo original não era um cenário disponível; os widgets de escopo usam todos os cenários desta empresa"
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
          ? "fixed inset-0 z-[100] h-screen overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {analysisCertificationError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Dados não certificados: {analysisCertificationError} A exportação foi
          bloqueada para não publicar totais parciais ou incorretos.
        </div>
      ) : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              {singleDayAnalysis ? "Análise do dia" : "Análise consolidada"}
            </div>
            <div className="truncate text-lg font-semibold">
              {formatPeriodAnalysisRange(period)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {autoRefreshEnabled ? (
              <Badge variant="outline" className="bg-card">
                Atualização 5 s
              </Badge>
            ) : null}
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-card p-4 shadow-soft">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-end">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-md border bg-muted/30 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={singleDayAnalysis ? "secondary" : "ghost"}
                    className="h-8"
                    onClick={() => updateAnalysisMode("day")}
                  >
                    <CalendarDays className="h-4 w-4" />
                    Dia
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={singleDayAnalysis ? "ghost" : "secondary"}
                    className="h-8"
                    onClick={() => updateAnalysisMode("range")}
                  >
                    <Layers3 className="h-4 w-4" />
                    Período
                  </Button>
                </div>
                <div className="text-sm font-semibold">
                  {singleDayAnalysis ? "Dia analisado" : "Período consolidado"}
                </div>
              </div>

              {singleDayAnalysis ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => shiftAnalysisDay(-1)}
                    aria-label="Dia anterior"
                    title="Dia anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Field label="Data">
                    <Input
                      className="w-[180px]"
                      max={formatFileDate(new Date())}
                      type="date"
                      value={draftSettings.from}
                      onChange={(event) => selectAnalysisDay(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={
                      appliedSettings.from >= formatFileDate(new Date())
                    }
                    onClick={() => shiftAnalysisDay(1)}
                    aria-label="Próximo dia"
                    title="Próximo dia"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      appliedSettings.from === formatFileDate(new Date())
                    }
                    onClick={() => selectAnalysisDay(formatFileDate(new Date()))}
                  >
                    Hoje
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="De">
                    <Input
                      className="w-[180px]"
                      max={draftSettings.to || formatFileDate(new Date())}
                      type="date"
                      value={draftSettings.from}
                      onChange={(event) =>
                        setDraftSettings((current) => ({
                          ...current,
                          from: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Até">
                    <Input
                      className="w-[180px]"
                      max={formatFileDate(new Date())}
                      min={draftSettings.from}
                      type="date"
                      value={draftSettings.to}
                      onChange={(event) =>
                        setDraftSettings((current) => ({
                          ...current,
                          to: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Button type="button" onClick={applyPeriod} disabled={loadingData}>
                    <CalendarRange className="h-4 w-4" />
                    Consultar
                  </Button>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => applyRangePreset("7d")}
                    >
                      7 dias
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => applyRangePreset("30d")}
                    >
                      30 dias
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => applyRangePreset("month")}
                    >
                      Mês
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
              <Badge variant="outline" className="gap-1 bg-background">
                <Clock3 className="h-3.5 w-3.5" />
                {formatPeriodAnalysisRange(period)}
              </Badge>
              {autoRefreshEnabled ? (
                <Badge variant="outline" className="bg-background">
                  Atualização 5 s
                </Badge>
              ) : null}
              {lastUpdated ? (
                <Badge variant="outline" className="gap-1 bg-background">
                  {formatTime(lastUpdated)}
                </Badge>
              ) : null}
              {canEditVisual ? (
                <>
                  <ReorderModeButton
                    enabled={layoutReorderMode}
                    onChange={setLayoutReorderMode}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setLayoutOrganizerOpen(true)}
                    aria-label="Configurar widgets"
                    title="Configurar widgets"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              <ReportExportActions
                disabled={
                  loadingData ||
                  loadingScenarios ||
                  !widgets.length ||
                  Boolean(analysisCertificationError)
                }
                payload={reportPayload}
              />
              <MonitorModeButton
                disabled={!widgets.length}
                onClick={enterMonitorMode}
              />
            </div>
          </div>
        </div>
      )}

      {loadingScenarios && !scopeOptions.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[320px] w-full" />
          <Skeleton className="h-[320px] w-full" />
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

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className={cn("pb-2", compactContent && "p-3 pb-1.5")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words leading-5">
                {widget.title}
              </span>
            </CardTitle>
            <CardDescription
              className={cn(compactContent ? "mt-0.5 text-xs leading-4" : "mt-1")}
            >
              {model.description}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-0.5">
            {canConfigure && !monitorMode ? (
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
            ) : null}
          </div>
        </div>
        {!compactWidget ? <div className="min-w-0 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="max-w-full truncate"
              title={scenarioSummary}
            >
              {scenarioSummary}
            </Badge>
            {(widget.kind === "timeline" ||
              widget.kind === "comparison" ||
              widget.kind === "hourly_occupancy") && (
              <Badge variant="outline">
                {analysisGranularityLabel(effectiveGranularity)}
              </Badge>
            )}
            {widget.kind === "hourly_occupancy" ? (
              <Badge variant="outline">
                Início {formatOccupancyStartHour(widget.startHour)}
              </Badge>
            ) : null}
            {(widget.kind === "cumulative" ||
              widget.kind === "cumulative_metric" ||
              widget.kind === "daily_comparison" ||
              widget.kind === "target_progress") ? (
              <Badge variant="outline">
                {periodAnalysisBaselineLabel(widget.baseline)}
              </Badge>
            ) : null}
            {model.insights?.map((insight) => (
              <Badge
                key={`${insight.label}-${insight.value}`}
                variant={insight.tone === "primary" ? "secondary" : "outline"}
                className={cn(
                  "max-w-full gap-1 tabular-nums",
                  insight.tone === "primary" && "bg-primary/10 text-primary",
                  insight.tone === "muted" && "text-muted-foreground",
                  insight.tone === "positive" &&
                    "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  insight.tone === "negative" &&
                    "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
                )}
                title={`${insight.label}: ${insight.value}`}
              >
                <span className="font-normal opacity-75">{insight.label}</span>
                <span className="truncate font-semibold">{insight.value}</span>
              </Badge>
            ))}
          </div>
        </div> : null}
      </CardHeader>
      <CardContent
        className={cn(
          "min-h-0 min-w-0 flex-1",
          compactContent && "px-3 pb-3",
        )}
      >
        {loading ? (
          <Skeleton className="h-full min-h-[160px] w-full" />
        ) : model.error ? (
          <EmptyState text={model.error} />
        ) : model.displayTable && model.table ? (
          <AnalysisTable table={model.table} />
        ) : model.metrics ? (
          <MetricGrid compact={compactContent} metrics={model.metrics} />
        ) : model.hasData && model.option ? (
          <div className="h-full min-h-0 w-full">
            <EChart option={model.option} />
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
        "grid gap-px overflow-hidden rounded-md border bg-border",
        metrics.length === 1
          ? "grid-cols-1"
          : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={cn("min-w-0 bg-card", compact ? "p-2.5" : "p-4")}
        >
          <div
            className={cn(
              "font-medium uppercase text-muted-foreground",
              compact ? "text-[10px] leading-3" : "text-xs",
            )}
          >
            {metric.label}
          </div>
          <div
            className={cn(
              "truncate font-semibold tabular-nums",
              compact ? "mt-1 text-xl leading-6" : "mt-2 text-2xl",
            )}
          >
            {typeof metric.value === "number"
              ? formatNumber(metric.value)
              : metric.value}
          </div>
          {metric.description ? (
            <div
              className={cn(
                "truncate text-muted-foreground",
                compact ? "mt-0.5 text-[10px] leading-3" : "mt-1 text-xs",
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
    <div className="h-full min-h-0 overflow-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground",
                  column.numeric && "text-right",
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
                      "border-b px-3 py-2 last:border-b-0",
                      column.numeric && "text-right tabular-nums",
                    )}
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
          <Field label="Tipo de análise">
            <Select
              value={form.kind}
              onValueChange={(value) =>
                onKindChange(value as PeriodAnalysisWidgetKind)
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
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

          <Field label="Título">
            <Input
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
            <Field label="Tipo de visão">
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Field label="Granularidade">
              <Select
                value={form.granularity}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    granularity: value as ScenarioAnalyticsGranularity,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Field label="Base de comparação">
              <Select
                value={form.baseline}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    baseline: value as PeriodAnalysisBaseline,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>Início da contagem diária</Label>
                <Select
                  value={String(form.startHour)}
                  onValueChange={(value) =>
                    onFormChange((current) => ({
                      ...current,
                      startHour: Number(value),
                    }))
                  }
                >
                  <SelectTrigger>
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

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
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
}: {
  models: Array<{
    chartType?: CardChartType;
    model: PeriodAnalysisWidgetModel;
    title: string;
  }>;
  period: PeriodAnalysisRange;
}): ReportPayload {
  const singleDay = isSingleDayAnalysisPeriod(period);
  return {
    charts: models.flatMap(({ chartType, model, title }) =>
      model.hasData && model.option && model.table
        ? [
            {
              description: model.description,
              option: applyChartTypePreference(model.option, chartType),
              table: model.table,
              title,
            },
          ]
        : [],
    ),
    context: [
      singleDay ? "Análise histórica diária" : "Período consolidado",
      formatPeriodAnalysisRange(period),
    ],
    dataCompleteUntil: addDays(period.to, -1),
    filename: `ipxdata-analises-${formatFileDate(period.from)}-${formatFileDate(
      addDays(period.to, -1),
    )}`,
    generatedAt: new Date(),
    metrics: models.flatMap(({ model }) => model.metrics ?? []),
    subtitle: formatPeriodAnalysisRange(period),
    tables: models.flatMap(({ model }) =>
      model.option || !model.table ? [] : [model.table],
    ),
    title: singleDay ? "Análise do dia" : "Análises por período",
  };
}

async function fetchAnalysisSubLocations(
  locations: Location[],
  companyScopeId?: string | null,
) {
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<unknown>(
        `/locations/${location.id}/sub-locations`,
      ).then(requireSubLocationRows),
    ),
  );

  return filterScopedApiRows(
    requireSubLocationRows(rows.flat()),
    companyScopeId,
  );
}

async function fetchAnalysisDataset(
  granularity: AggregateGranularity,
  range: PeriodAnalysisRange,
  signal?: AbortSignal,
): Promise<PeriodAnalysisDataset> {
  try {
    const response = await fetchAnalysisAggregate(granularity, range, signal);
    const responseGranularity = requireAggregateGranularity(
      response.granularity,
      granularity,
    );

    return {
      granularity: responseGranularity,
      rows: requireAggregateRowsInRange(
        response.data,
        responseGranularity,
        range.from,
        range.to,
        DEFAULT_METRIC_TYPE,
      ),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os dados.",
      granularity,
      rows: [],
    };
  }
}

async function fetchAnalysisHourlyDatasets(
  ranges: PeriodAnalysisRange[],
  cache: HourlyAggregateCache,
  cacheScope: string,
  now: Date,
  signal?: AbortSignal,
): Promise<PeriodAnalysisDataset> {
  try {
    return {
      granularity: "hour",
      rows: await fetchHourlyAggregateRanges({
        cache,
        cacheScope,
        now,
        ranges,
        signal,
      }),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a base horária da análise.",
      granularity: "hour",
      rows: [],
    };
  }
}

function fetchAnalysisAggregate(
  granularity: AggregateGranularity,
  range: PeriodAnalysisRange,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(range.from, granularity),
    granularity,
    metric_type: DEFAULT_METRIC_TYPE,
    to: aggregateQueryIso(range.to, granularity),
  });

  return apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
    { signal },
  );
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

function sliceAnalysisHourlyDataset(
  dataset: PeriodAnalysisDataset,
  range: PeriodAnalysisRange,
): PeriodAnalysisDataset {
  if (dataset.error) {
    return {
      error: dataset.error,
      granularity: "hour",
      rows: [],
    };
  }
  if (dataset.granularity !== "hour") {
    return {
      error: "A fonte canônica da análise não possui granularidade horária.",
      granularity: "hour",
      rows: [],
    };
  }

  return {
    granularity: "hour",
    rows: dataset.rows.filter((row) =>
      aggregateBucketInRange(row.bucket, "hour", range.from, range.to),
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
      error: "As granularidades usadas na reconciliação da hora são inválidas.",
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
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reconciliar a hora ainda aberta.",
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
        "As granularidades usadas na reconciliação dos minutos são inválidas.",
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
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reconciliar os minutos ainda abertos.",
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
    const from = new Date(
      Math.max(range.from.getTime(), toHour.getTime()),
    );
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
        "A granularidade usada na reconciliação da base horária é inválida.",
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
          error:
            "A granularidade usada na borda comparável é inválida.",
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
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reconciliar a borda horária da base.",
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

function emptyDataset(
  granularity: AggregateGranularity,
): PeriodAnalysisDataset {
  return { granularity, rows: [] };
}

function startOfMinute(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function startOfHour(date: Date) {
  return startOfAggregateBucket(date, "hour");
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

function parseDateInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFileDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
