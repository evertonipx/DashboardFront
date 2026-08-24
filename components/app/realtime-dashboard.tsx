"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChartPie,
  Clock3,
  DoorOpen,
  Grid3X3,
  Pencil,
  Plus,
  Route,
  Settings2,
  Sigma,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import {
  EChart,
  applyChartTypePreference,
  type EnterpriseChartOption,
} from "@/components/app/echart";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { useResourceAutoRefresh } from "@/components/app/use-resource-auto-refresh";
import {
  WidgetTitleText,
  useWidgetChartType,
  useWidgetColor,
  useWidgetColorOverride,
} from "@/components/app/widget-appearance";
import { WidgetCardActions } from "@/components/app/widget-card-actions";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import {
  ScenarioComparisonCard,
  ScenarioComparisonConfigurator,
  buildScenarioComparisonDefinition,
  buildScenarioComparisonReportChart,
  createDefaultScenarioComparisonSettings,
  deleteScenarioComparisonSettings,
  fetchScenarioComparisonRows,
  loadScenarioComparisonSettings,
  saveScenarioComparisonSettings,
  type ScenarioComparisonHourlySource,
  type ScenarioComparisonSettings,
} from "@/components/app/scenario-comparison-card";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasMasterAccess, hasVisualAdminAccess } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import {
  aggregateBucketInRange,
  aggregateQueryIso,
  endOfAggregateBucket,
  parseAggregateBucket,
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
  clearMinuteDayAggregateCache,
  fetchMinuteDayAggregateBootstrap,
  refreshMinuteDayAggregateCache,
  type MinuteDayAggregateCache,
} from "@/lib/aggregate-minute-day-query";
import {
  reconcileAggregateRows,
  rollupAggregateRowsMany,
} from "@/lib/aggregate-reconciliation";
import {
  CAMERA_GROUPS_UPDATED_EVENT,
  type CameraGroup,
  type WorkerLocationAssignments,
  buildWorkerBackedLocationOptions,
  buildSubLocationCameraOptions,
  readCameraGroups,
  readWorkerLocationAssignments,
} from "@/lib/camera-groups";
import {
  certifyCompanyScopeTimeZoneOverride,
  filterScopedApiRows,
  getCurrentUserCompanyId,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import { requireCountingRuntimeTimeZone } from "@/lib/counting-time-zone";
import {
  requireCameraRows,
  requireInfrastructureRelations,
  requireLocationRows,
  requireSubLocationRows,
  requireWorkerRows,
} from "@/lib/metadata-validation";
import {
  loadLiveOperationalSettings,
  saveLiveOperationalSettings,
  type LiveOperationalSettings,
} from "@/lib/live-operational-settings";
import {
  deleteRealtimeCustomWidget,
  loadRealtimeCustomWidgets,
  REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertRealtimeCustomWidget,
  type RealtimeCustomWidget,
  type RealtimeCustomWidgetGranularity,
  type RealtimeCustomWidgetKind,
  type RealtimeCustomWidgetScopeMode,
  type RealtimeScenarioWidgetType,
  type RealtimeScenarioCustomWidget,
  type RealtimeScopeCustomWidget,
} from "@/lib/realtime-custom-widgets";
import { RESOURCE_METADATA_REFRESH_INTERVAL_MS } from "@/lib/resource-auto-refresh";
import {
  monochromeHeatmapPalette,
  pastelBarColor,
} from "@/lib/chart-palette";
import { buildScenarioCumulativeTotalsOption } from "@/lib/scenario-cumulative-chart";
import { buildScopeTotalsComparisonOption } from "@/lib/scope-totals-chart";
import {
  buildScenarioCompositionOption,
  normalizeScenarioCompositionChartType,
  scenarioCompositionDescription,
  type ScenarioCompositionChartType,
} from "@/lib/chart-composition";
import { buildHourlyOccupancyOption } from "@/lib/hourly-occupancy-chart";
import {
  buildFixedHourlyAxisValues,
  HOUR_OF_DAY_LABELS,
  latestHourlyPointHour,
} from "@/lib/hourly-axis";
import {
  buildFixedMinuteDayAxis,
  minuteDayHourAxisLabel,
  type MinuteDayAxisSlot,
} from "@/lib/minute-axis";
import {
  DAY_OF_MONTH_AXIS_LABELS,
  buildCalendarAxisLabel,
  buildCalendarMarkArea,
  buildCalendarMarkAreaForMonth,
  holidayCategoryIndexes,
  holidayCategoryIndexesForMonth,
  saturdayCategoryIndexesForMonth,
  sundayCategoryIndexesForMonth,
} from "@/lib/chart-calendar-axis";
import {
  buildAnnualAccumulatedComparisonChartOption,
  buildAnnualComparisonChartOption,
  buildCountingIntelligenceReportAssets,
  COUNTING_INTELLIGENCE_CARD_IDS,
  formatCountingIntelligencePeriod,
  type CountingIntelligenceModel,
} from "@/lib/counting-intelligence";
import {
  buildLiveAnnualComparisonModel,
  resolveLiveAnnualComparisonRanges,
  rollupLiveAnnualHistoryRows,
} from "@/lib/live-annual-comparison";
import type {
  ReportMetric,
  ReportPayload,
  ReportTable,
} from "@/lib/report-export";
import {
  buildScenarioCivilHourMagnitudePoints,
  buildScenarioCumulativeTotals,
  buildScenarioHourlyOccupancy,
  buildTopScenarioPeakDays,
  formatOccupancyStartHour,
  scenarioSelectionSummary,
  selectScenarios,
  type ScenarioCumulativeTotalPoint,
  type ScenarioHourlyOccupancyPoint,
  type ScenarioPeakDayPoint,
} from "@/lib/scenario-analytics";
import { inferOccupancyScenarios } from "@/lib/scenario-direction";
import { requireScenarioRows } from "@/lib/scenario-validation";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Camera,
  Location,
  Scenario,
  SubLocation,
  Worker,
} from "@/lib/types";
import { cn, formatNumber, formatTime } from "@/lib/utils";
import {
  collapseWorkerIdentityChains,
  partitionWorkersByCompanyScope,
  sortWorkersByActivity,
} from "@/lib/worker-scope";

type RealtimeDashboardProps = {
  companyId?: string;
  initialScopeId?: string;
  initialScopeMode?: "scenario" | "location" | "sub_location";
  manager?: boolean;
  presentationMode?: boolean;
};

type LoadOptions = {
  force?: boolean;
  silent?: boolean;
};

type RealtimeChartDefinition = {
  id: string;
  label: string;
  description: string;
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
};

type RealtimeChartState = {
  rows: AggregateEventRow[];
  granularity: AggregateGranularity;
  error?: string;
};

type OptionalWorkerMetadata = {
  rows: Worker[];
  warning: string;
};

type WorkerMetadataValidationOptions = {
  requireExplicitCompanyId: boolean;
};

type ChartPoint = {
  bucket: string;
  label: string;
  total: number;
};

type ScenarioComparisonPoint = {
  id: string;
  name: string;
  total: number;
};

type TodayComparisonPoint = ScenarioComparisonPoint;

type ScenarioTotalsTableRow = {
  id: string;
  month: number;
  name: string;
  share: number;
  today: number;
};

type OperationalMonthComparisonPoint = {
  baseline: number | null;
  current: number | null;
  day: number;
  isSaturday: boolean;
  isSunday: boolean;
};

type OperationalTrendPoint = ChartPoint & {
  average30: number | null;
  average7: number | null;
};

type OperationalHeatmapPoint = {
  bucket: string;
  day: number;
  hour: number;
  total: number;
};

type RealtimeScopeMode = "scenario" | "location" | "sub_location";

type RealtimeScopeOption = {
  cameraIds: string[];
  description: string;
  id: string;
  mode: RealtimeScopeMode;
  name: string;
  group?: CameraGroup;
  location?: Location;
  parentName?: string;
  scenario?: Scenario;
  subLocation?: SubLocation;
  worker?: Worker;
  workerId?: string;
};

type RealtimeCustomWidgetForm = {
  comparisonSettings: ScenarioComparisonSettings;
  granularity: RealtimeCustomWidgetGranularity;
  id?: string;
  kind: RealtimeCustomWidgetKind;
  scenarioIds: string[];
  scenarioSelectionMode: "all" | "custom";
  scenarioWidgetType: RealtimeScenarioWidgetType;
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  title: string;
};

type CustomScenarioWidgetPatch = Partial<
  Pick<RealtimeScenarioCustomWidget, "scenarioIds" | "selectionMode">
>;

const REFRESH_MS = 5_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_REALTIME_BUCKETS = 2_000;
const DEFAULT_METRIC_TYPE = "count";
const CURRENT_MONTH_DAYS_ID = "live_current_month_days";
const OPERATIONAL_COMPARISON_HOURS_ID = "live_operational_comparison_hours";
const OPERATIONAL_PREVIOUS_MONTH_ID = "live_operational_previous_month";
const OPERATIONAL_LAST_YEAR_MONTH_ID = "live_operational_last_year_month";
const OPERATIONAL_TREND_DAYS_ID = "live_operational_trend_days";
const OPERATIONAL_MONTH_HOURS_ID = "live_operational_month_hours";
const OPERATIONAL_CURRENT_HOUR_MINUTES_ID =
  "live_operational_current_hour_minutes";
const LIVE_DAY_MINUTES_ID = "live_chart_minute_day";
const LIVE_ANNUAL_RECENT_MONTHS_ID = "live_annual_recent_months";
const OCCUPANCY_HOURS_ID = "live_hourly_occupancy_data";
const CANONICAL_HOUR_DERIVED_TARGETS: ReadonlyArray<{
  granularity: "hour" | "day" | "week" | "month";
  id: string;
}> = [
  { id: "live_chart_hour", granularity: "hour" },
  { id: OCCUPANCY_HOURS_ID, granularity: "hour" },
  { id: OPERATIONAL_COMPARISON_HOURS_ID, granularity: "hour" },
  { id: OPERATIONAL_PREVIOUS_MONTH_ID, granularity: "hour" },
  { id: OPERATIONAL_LAST_YEAR_MONTH_ID, granularity: "hour" },
  { id: "live_chart_day", granularity: "day" },
  { id: CURRENT_MONTH_DAYS_ID, granularity: "day" },
  { id: OPERATIONAL_TREND_DAYS_ID, granularity: "day" },
  { id: "live_chart_week", granularity: "week" },
  { id: "live_chart_month", granularity: "month" },
  { id: LIVE_ANNUAL_RECENT_MONTHS_ID, granularity: "month" },
];
const CANONICAL_HOUR_DERIVED_IDS = new Set(
  CANONICAL_HOUR_DERIVED_TARGETS.map((target) => target.id),
);
const OCCUPANCY_START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_AXIS_LABELS = Array.from(
  { length: 24 },
  (_, hour) =>
    hour === 23 ? "23h–24h" : `${String(hour).padStart(2, "0")}h`,
);
const EMPTY_AGGREGATE_ROWS: AggregateEventRow[] = [];
const CUSTOM_WIDGET_GRANULARITY_OPTIONS: {
  label: string;
  value: RealtimeCustomWidgetGranularity;
}[] = [
  { label: "Minuto a minuto", value: "minute" },
  { label: "Hora a hora", value: "hour" },
  { label: "Dia a dia", value: "day" },
  { label: "Semana a semana", value: "week" },
  { label: "Mês a mês", value: "month" },
];
const SCENARIO_WIDGET_OPTIONS: Array<{
  description: string;
  label: string;
  value: RealtimeScenarioWidgetType;
}> = [
  {
    description: "Volume e representatividade mensal em ordem decrescente.",
    label: "Ranking dos acessos",
    value: "ranking",
  },
  {
    description: "Participação proporcional dos cenários no fluxo mensal.",
    label: "Composição por cenário",
    value: "rose",
  },
  {
    description: "Cinco dias de maior volume no mês atual.",
    label: "Top 5 dias de pico",
    value: "peak_days",
  },
  {
    description: "Intensidade de fluxo por dia e faixa horária.",
    label: "Mapa de calor dia x hora",
    value: "heatmap",
  },
  {
    description: "Total de hoje para cada cenário selecionado.",
    label: "Acumulado por cenário",
    value: "cumulative",
  },
  {
    description: "Totais de hoje e do mês em formato tabular.",
    label: "Tabela acumulada por cenário",
    value: "totals_table",
  },
];

function scenarioWidgetOption(widgetType: RealtimeScenarioWidgetType) {
  return (
    SCENARIO_WIDGET_OPTIONS.find((option) => option.value === widgetType) ??
    SCENARIO_WIDGET_OPTIONS[0]
  );
}

export function RealtimeDashboard({
  companyId: companyIdOverride,
  initialScopeId = "",
  initialScopeMode = "scenario",
  manager = false,
  presentationMode = false,
}: RealtimeDashboardProps) {
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode({
    initialMode: presentationMode,
    requestFullscreen: !presentationMode,
  });
  const storedCompanyScopeId = useEffectiveCompanyScopeId(user);
  const companyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const cleanCompanyIdOverride = companyIdOverride?.trim() ?? "";
  const overrideScopeCertification = cleanCompanyIdOverride
    ? certifyCompanyScopeTimeZoneOverride(user, cleanCompanyIdOverride)
    : null;
  const companyScopeId = cleanCompanyIdOverride || storedCompanyScopeId;
  const requireExplicitWorkerCompanyId =
    hasMasterAccess(user) &&
    Boolean(companyScopeId) &&
    getCurrentUserCompanyId(user) !== companyScopeId;
  const companyTimeZone =
    overrideScopeCertification?.timeZone ?? companyTimeZoneResolution.timeZone;
  const companyScopeCertificationError =
    overrideScopeCertification?.error ??
    (!cleanCompanyIdOverride && companyTimeZoneResolution.fallback
      ? "Fuso da empresa não certificado. Cadastre um timezone IANA válido antes de consultar dados civis."
      : "");
  const customGranularitySelectId = React.useId();
  const customKindSelectId = React.useId();
  const customModelSelectId = React.useId();
  const customScopeModeSelectId = React.useId();
  const customScopeSelectId = React.useId();
  const intradayComparisonSelectId = React.useId();
  const monthComparisonSelectId = React.useId();
  const canEditVisual = hasVisualAdminAccess(user);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [cameras, setCameras] = React.useState<Camera[]>([]);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [subLocations, setSubLocations] = React.useState<SubLocation[]>([]);
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [cameraGroups, setCameraGroups] = React.useState<CameraGroup[]>([]);
  const [workerLocationAssignments, setWorkerLocationAssignments] =
    React.useState<WorkerLocationAssignments>({});
  const [scopeMode, setScopeMode] =
    React.useState<RealtimeScopeMode>(initialScopeMode);
  const [selectedId, setSelectedId] = React.useState(initialScopeId);
  const [chartData, setChartData] = React.useState<
    Record<string, RealtimeChartState>
  >({});
  const [annualHistoryState, setAnnualHistoryState] =
    React.useState<RealtimeChartState | null>(null);
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
  const [loadingAnnualHistory, setLoadingAnnualHistory] =
    React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [workerMetadataWarning, setWorkerMetadataWarning] =
    React.useState("");
  const [chartLoadError, setChartLoadError] = React.useState("");
  const [hasLoadedCharts, setHasLoadedCharts] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());
  const [customWidgets, setCustomWidgets] = React.useState<
    RealtimeCustomWidget[]
  >([]);
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [operationalSettingsOpen, setOperationalSettingsOpen] =
    React.useState(false);
  const [operationalSettings, setOperationalSettings] =
    React.useState<LiveOperationalSettings>(() =>
      loadLiveOperationalSettings(companyScopeId, { userId: user?.id }),
    );
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<RealtimeCustomWidgetForm>({
      comparisonSettings: createDefaultScenarioComparisonSettings(),
      granularity: "hour",
      kind: "scope",
      scenarioIds: [],
      scenarioSelectionMode: "all",
      scenarioWidgetType: "ranking",
      scopeId: "",
      scopeMode: "scenario",
      title: "",
    });

  const requestRef = React.useRef<AbortController | null>(null);
  const annualHistoryRequestRef = React.useRef<AbortController | null>(null);
  const runningRef = React.useRef(false);
  const hasLoadedChartsRef = React.useRef(false);
  const annualHistoryRequestSequenceRef = React.useRef(0);
  const annualHistoryLoadedDayRef = React.useRef("");
  const annualHistoryAttemptMinuteRef = React.useRef("");
  const metadataRequestSequenceRef = React.useRef(0);
  const hourlyAggregateCacheRef = React.useRef<HourlyAggregateCache>(
    new Map(),
  );
  const minuteDayAggregateCacheRef = React.useRef<MinuteDayAggregateCache>(
    new Map(),
  );

  const chartDefinitions = React.useMemo(
    () => buildRealtimeChartDefinitions(clock),
    [clock],
  );
  const availableModes = React.useMemo(
    () =>
      buildRealtimeScopeModes({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        scenarios,
        subLocations,
        workerLocationAssignments,
        workers,
      }),
    [
      cameraGroups,
      cameras,
      locations,
      manager,
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    ],
  );
  const scopeOptions = React.useMemo(
    () =>
      buildRealtimeScopeOptions({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        mode: scopeMode,
        scenarios,
        subLocations,
        workerLocationAssignments,
        workers,
      }),
    [
      cameraGroups,
      cameras,
      locations,
      manager,
      scenarios,
      scopeMode,
      subLocations,
      workerLocationAssignments,
      workers,
    ],
  );
  const customWidgetScopeOptions = React.useMemo(
    () =>
      buildRealtimeScopeOptions({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        mode: customWidgetForm.scopeMode,
        scenarios,
        subLocations,
        workerLocationAssignments,
        workers,
      }),
    [
      cameraGroups,
      cameras,
      customWidgetForm.scopeMode,
      locations,
      manager,
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    ],
  );
  const selectedScope = React.useMemo(
    () => scopeOptions.find((option) => option.id === selectedId) ?? null,
    [scopeOptions, selectedId],
  );
  const preferenceScope = React.useMemo(
    () => ({ userId: user?.id, viewId: selectedScope?.id }),
    [selectedScope?.id, user?.id],
  );

  React.useEffect(() => {
    setOperationalSettings(
      loadLiveOperationalSettings(companyScopeId, preferenceScope),
    );
  }, [companyScopeId, preferenceScope]);
  const minuteDayState = chartData[LIVE_DAY_MINUTES_ID];
  const minuteDayRows = minuteDayState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const hourState = chartData.live_chart_hour;
  const hourRows = hourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const occupancyHourState = chartData[OCCUPANCY_HOURS_ID];
  const occupancyHourRows =
    occupancyHourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const annualRecentMonthState = chartData[LIVE_ANNUAL_RECENT_MONTHS_ID];
  const annualRecentMonthRows =
    annualRecentMonthState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const comparisonHourState = chartData[OPERATIONAL_COMPARISON_HOURS_ID];
  const comparisonHourRows =
    comparisonHourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const currentMonthDayState = chartData[CURRENT_MONTH_DAYS_ID];
  const currentMonthDayRows =
    currentMonthDayState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const previousMonthDayState = chartData[OPERATIONAL_PREVIOUS_MONTH_ID];
  const previousMonthDayRows =
    previousMonthDayState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const lastYearMonthDayState = chartData[OPERATIONAL_LAST_YEAR_MONTH_ID];
  const lastYearMonthDayRows =
    lastYearMonthDayState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const operationalTrendRows =
    chartData[OPERATIONAL_TREND_DAYS_ID]?.rows ?? EMPTY_AGGREGATE_ROWS;
  const operationalMonthHourState = chartData[OPERATIONAL_MONTH_HOURS_ID];
  const operationalMonthHourRows =
    operationalMonthHourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const liveComparisonHourlySource =
    React.useMemo<ScenarioComparisonHourlySource | undefined>(() => {
      if (
        operationalMonthHourState?.granularity !== "hour" ||
        operationalMonthHourState.error
      ) {
        return undefined;
      }

      const definition = buildOperationalMonthHoursDefinition(clock);
      return {
        companyScopeId,
        companyTimeZone,
        from: definition.from,
        rows: operationalMonthHourRows,
        to: definition.to,
      };
    }, [
      clock,
      companyScopeId,
      companyTimeZone,
      operationalMonthHourRows,
      operationalMonthHourState?.error,
      operationalMonthHourState?.granularity,
    ]);
  const baselineMonthDayRows =
    operationalSettings.monthComparison === "last_year"
      ? lastYearMonthDayRows
      : previousMonthDayRows;
  const baselineMonthDayGranularity =
    operationalSettings.monthComparison === "last_year"
      ? lastYearMonthDayState?.granularity ?? "hour"
      : previousMonthDayState?.granularity ?? "hour";
  const liveDataCertificationError =
    companyScopeCertificationError ||
    metadataError ||
    chartLoadError ||
    Object.entries(chartData).find(
      ([id, state]) => id !== LIVE_DAY_MINUTES_ID && state.error,
    )?.[1].error;
  const liveComparisonDisabledReason = liveDataCertificationError
    ? `Comparativo não certificado: ${liveDataCertificationError}`
    : !liveComparisonHourlySource
      ? loadingCharts
        ? "Comparativo aguardando a fonte horária canônica."
        : "Comparativo indisponível sem a fonte horária canônica certificada."
      : undefined;

  const loadScenarios = React.useCallback(async (
    { silent = false }: LoadOptions = {},
  ) => {
    const requestSequence = ++metadataRequestSequenceRef.current;
    if (companyScopeCertificationError) {
      setScenarios([]);
      setCameras([]);
      setLocations([]);
      setSubLocations([]);
      setWorkers([]);
      setSelectedId("");
      setChartData({});
      setMetadataError(companyScopeCertificationError);
      setWorkerMetadataWarning("");
      setLoadingScenarios(false);
      return;
    }
    if (!silent) {
      setLoadingScenarios(true);
      setMetadataError("");
      setWorkerMetadataWarning("");
    }
    try {
      const [scenarioResult, cameraResult, locationResult, workerResult] =
        await Promise.allSettled([
          apiFetch<unknown>("/scenarios", { companyScopeId }),
          apiFetch<unknown>("/cameras", { companyScopeId }),
          apiFetch<unknown>("/locations", { companyScopeId }),
          fetchRealtimeWorkers(companyScopeId, {
            requireExplicitCompanyId: requireExplicitWorkerCompanyId,
          }),
        ]);
      if (scenarioResult.status === "rejected") throw scenarioResult.reason;
      if (cameraResult.status === "rejected") throw cameraResult.reason;
      if (locationResult.status === "rejected") throw locationResult.reason;

      const workerMetadata =
        workerResult.status === "fulfilled"
          ? workerResult.value
          : unavailableWorkerMetadata(workerResult.reason);
      const scopedScenarios = filterScopedApiRows(
        requireScenarioRows(scenarioResult.value, companyScopeId),
        companyScopeId,
      );
      const scopedCameras = filterScopedApiRows(
        requireCameraRows(cameraResult.value, companyScopeId),
        companyScopeId,
      );
      const scopedLocations = filterScopedApiRows(
        requireLocationRows(locationResult.value, companyScopeId),
        companyScopeId,
      );
      const subLocationRows = await fetchSubLocations(
        scopedLocations,
        companyScopeId,
      );
      requireInfrastructureRelations({
        cameras: scopedCameras,
        locations: scopedLocations,
        subLocations: subLocationRows,
      });
      const visible = manager
        ? scopedScenarios
        : scopedScenarios.filter((scenario) => scenario.active);

      if (requestSequence !== metadataRequestSequenceRef.current) return;
      setMetadataError("");
      setWorkerMetadataWarning(workerMetadata.warning);
      setScenarios(visible);
      setCameras(scopedCameras);
      setLocations(scopedLocations);
      setSubLocations(subLocationRows);
      setWorkers(workerMetadata.rows);
      const modes = buildRealtimeScopeModes({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        scenarios: visible,
        subLocations: subLocationRows,
        workerLocationAssignments,
        workers: workerMetadata.rows,
      });
      const nextMode = modes.some((mode) => mode.value === scopeMode)
        ? scopeMode
        : modes[0]?.value ?? "scenario";
      const options = buildRealtimeScopeOptions({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        mode: nextMode,
        scenarios: visible,
        subLocations: subLocationRows,
        workerLocationAssignments,
        workers: workerMetadata.rows,
      });

      if (nextMode !== scopeMode) setScopeMode(nextMode);
      setSelectedId((current) => {
        if (current && options.some((option) => option.id === current)) {
          return current;
        }

        return options[0]?.id ?? "";
      });
    } catch (error) {
      if (requestSequence !== metadataRequestSequenceRef.current) return;
      if (silent) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as visões de contagem.";
      setScenarios([]);
      setCameras([]);
      setLocations([]);
      setSubLocations([]);
      setWorkers([]);
      setSelectedId("");
      setChartData({});
      setMetadataError(message);
      setWorkerMetadataWarning("");
      toast.error(message);
    } finally {
      if (!silent && requestSequence === metadataRequestSequenceRef.current) {
        setLoadingScenarios(false);
      }
    }
  }, [
    cameraGroups,
    companyScopeCertificationError,
    companyScopeId,
    manager,
    requireExplicitWorkerCompanyId,
    scopeMode,
    workerLocationAssignments,
  ]);

  const loadCharts = React.useCallback(
    async ({ force = false, silent = false }: LoadOptions = {}) => {
      if (companyScopeCertificationError) {
        requestRef.current?.abort();
        requestRef.current = null;
        annualHistoryRequestRef.current?.abort();
        annualHistoryRequestRef.current = null;
        runningRef.current = false;
        hasLoadedChartsRef.current = false;
        clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
        clearMinuteDayAggregateCache(minuteDayAggregateCacheRef.current);
        setChartData({});
        setAnnualHistoryState(null);
        setChartLoadError(companyScopeCertificationError);
        setHasLoadedCharts(false);
        setLastUpdated(null);
        setLoadingCharts(false);
        setLoadingAnnualHistory(false);
        return;
      }

      if (!companyScopeId) {
        hasLoadedChartsRef.current = false;
        setChartData({});
        setAnnualHistoryState(null);
        setChartLoadError("");
        setHasLoadedCharts(false);
        setLastUpdated(null);
        setLoadingCharts(false);
        return;
      }

      try {
        requireCountingRuntimeTimeZone(companyTimeZone);
      } catch (error) {
        requestRef.current?.abort();
        requestRef.current = null;
        annualHistoryRequestRef.current?.abort();
        annualHistoryRequestRef.current = null;
        runningRef.current = false;
        hasLoadedChartsRef.current = false;
        clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
        clearMinuteDayAggregateCache(minuteDayAggregateCacheRef.current);
        const message =
          error instanceof Error
            ? error.message
            : "Fuso da empresa não disponível.";
        setChartData({});
        setAnnualHistoryState(null);
        setChartLoadError(message);
        setHasLoadedCharts(false);
        setLastUpdated(null);
        setLoadingCharts(false);
        setLoadingAnnualHistory(false);
        if (!silent) toast.error(message);
        return;
      }

      if (runningRef.current) {
        if (!force) return;
        requestRef.current?.abort();
      }

      const controller = new AbortController();
      requestRef.current = controller;
      runningRef.current = true;

      const silentLoad = silent || hasLoadedChartsRef.current;
      if (!silentLoad) setLoadingCharts(true);

      const now = new Date();
      const definitions = buildRealtimeChartDefinitions(now);
      const minuteDayDefinition = buildMinuteDayDefinition(now);
      const minuteDayCacheScope = `live-minute-day:${companyScopeId}:${companyTimeZone}`;
      const supportDefinitions = [
        buildCurrentMonthDaysDefinition(now),
        buildOperationalComparisonHoursDefinition(
          now,
          operationalSettings.intradayComparison,
        ),
        buildOperationalBaselineMonthDefinition(now, "previous_month"),
        buildOperationalBaselineMonthDefinition(now, "last_year"),
        buildOperationalTrendDaysDefinition(now),
        buildOperationalMonthHoursDefinition(now),
        buildLiveAnnualRecentMonthsDefinition(now),
        buildOperationalCurrentHourMinutesDefinition(now),
        buildHourlyOccupancyDataDefinition(
          now,
          operationalSettings.occupancyStartHour,
        ),
      ];
      const allDefinitions = [...definitions, ...supportDefinitions];
      try {
        const entriesPromise = Promise.all(
          allDefinitions.map(async (definition) => {
            if (CANONICAL_HOUR_DERIVED_IDS.has(definition.id)) {
              return [
                definition.id,
                {
                  rows: [],
                  granularity: definition.granularity,
                } satisfies RealtimeChartState,
              ] as const;
            }

            try {
              if (definition.id === OPERATIONAL_MONTH_HOURS_ID) {
                const state: RealtimeChartState = {
                  granularity: "hour",
                  rows: await fetchHourlyAggregateRanges({
                    cache: hourlyAggregateCacheRef.current,
                    cacheScope: `live:${companyScopeId}:${companyTimeZone}`,
                    companyScopeId,
                    now,
                    ranges: [definition],
                    signal: controller.signal,
                  }),
                };
                return [definition.id, state] as const;
              }

              const response = await apiFetch<AggregateEventsResponse>(
                aggregatePath(definition),
                { companyScopeId, signal: controller.signal },
              );
              const responseGranularity = requireAggregateGranularity(
                response.granularity,
                definition.granularity,
              );
              const state: RealtimeChartState = {
                rows: requireAggregateRowsInRange(
                  response.data,
                  responseGranularity,
                  definition.from,
                  definition.to,
                  DEFAULT_METRIC_TYPE,
                ),
                granularity: responseGranularity,
              };

              return [definition.id, state] as const;
            } catch (error) {
              if (isAbortError(error)) throw error;
              const state: RealtimeChartState = {
                rows: [],
                granularity: definition.granularity,
                error:
                  error instanceof Error
                    ? error.message
                    : "Não foi possível carregar este gráfico.",
              };

              return [definition.id, state] as const;
            }
          }),
        );
        const minuteDayBootstrapPromise =
          fetchMinuteDayAggregateBootstrap({
            cache: minuteDayAggregateCacheRef.current,
            cacheScope: minuteDayCacheScope,
            companyScopeId,
            from: minuteDayDefinition.from,
            now,
            signal: controller.signal,
            to: minuteDayDefinition.to,
          })
            .then(
              (rows): RealtimeChartState => ({
                granularity: "minute",
                rows,
              }),
            )
            .catch((error): RealtimeChartState => {
              if (isAbortError(error)) throw error;
              return {
                error:
                  error instanceof Error
                    ? error.message
                    : "Não foi possível carregar os minutos do dia.",
                granularity: "minute",
                rows: [],
              };
            });
        const [entries, minuteDayBootstrapState] = await Promise.all([
          entriesPromise,
          minuteDayBootstrapPromise,
        ]);

        if (
          controller.signal.aborted ||
          requestRef.current !== controller
        ) {
          return;
        }

        const nextData = hydrateRealtimeOpenBuckets(
          Object.fromEntries(entries),
          allDefinitions,
          now,
        );
        const rollingMinuteDefinition = definitions.find(
          (definition) => definition.id === "live_chart_minute",
        );
        const rollingMinuteState = nextData.live_chart_minute;
        let minuteDayRows = minuteDayBootstrapState.rows;
        let minuteDayError = minuteDayBootstrapState.error;
        if (
          !minuteDayError &&
          rollingMinuteDefinition &&
          rollingMinuteState &&
          !rollingMinuteState.error &&
          rollingMinuteState.granularity === "minute"
        ) {
          try {
            minuteDayRows =
              (await refreshMinuteDayAggregateCache({
                cache: minuteDayAggregateCacheRef.current,
                cacheScope: minuteDayCacheScope,
                companyScopeId,
                from: minuteDayDefinition.from,
                now,
                signal: controller.signal,
                sourceFrom: new Date(
                  Math.max(
                    minuteDayDefinition.from.getTime(),
                    rollingMinuteDefinition.from.getTime(),
                  ),
                ),
                sourceRows: rollingMinuteState.rows,
                sourceTo: minuteDayDefinition.to,
              })) ?? minuteDayRows;
          } catch (error) {
            if (isAbortError(error)) throw error;
            minuteDayError =
              error instanceof Error
                ? error.message
                : "Não foi possível reconciliar os minutos do dia.";
          }
        }
        nextData[LIVE_DAY_MINUTES_ID] = {
          granularity: "minute",
          ...(minuteDayError ? { error: minuteDayError } : {}),
          rows: minuteDayRows,
        };
        const refreshedAt = new Date();

        setChartData(nextData);
        setChartLoadError("");
        setClock(now);
        setLastUpdated(refreshedAt);
        setHasLoadedCharts(true);
        hasLoadedChartsRef.current = true;

        if (
          (entries.some(([, state]) => state.error) ||
            minuteDayBootstrapState.error) &&
          !silentLoad
        ) {
          toast.error(
            "Alguns dados não puderam ser reconciliados; os valores afetados não estão certificados.",
          );
        }
      } catch (error) {
        if (!isAbortError(error)) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados ao vivo.";
          setChartLoadError(message);
          toast.error(message);
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          runningRef.current = false;
          setLoadingCharts(false);
        }
      }
    },
    [
      companyScopeCertificationError,
      companyScopeId,
      companyTimeZone,
      operationalSettings.intradayComparison,
      operationalSettings.occupancyStartHour,
    ],
  );

  const loadAnnualHistory = React.useCallback(async () => {
    const requestSequence = ++annualHistoryRequestSequenceRef.current;
    annualHistoryRequestRef.current?.abort();
    annualHistoryRequestRef.current = null;

    if (!companyScopeId || companyScopeCertificationError) {
      setAnnualHistoryState(null);
      setLoadingAnnualHistory(false);
      return;
    }

    try {
      requireCountingRuntimeTimeZone(companyTimeZone);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Fuso da empresa não disponível.";
      setAnnualHistoryState({
        error: message,
        granularity: "month",
        rows: [],
      });
      setLoadingAnnualHistory(false);
      return;
    }

    const controller = new AbortController();
    annualHistoryRequestRef.current = controller;
    setLoadingAnnualHistory(true);
    const now = new Date();
    annualHistoryAttemptMinuteRef.current = [
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
    ].join("-");
    const range = resolveLiveAnnualComparisonRanges(now);

    try {
      const hourlyRows = await fetchHourlyAggregateRanges({
        cache: hourlyAggregateCacheRef.current,
        cacheScope: `live:${companyScopeId}:${companyTimeZone}`,
        companyScopeId,
        now,
        ranges: [
          {
            from: range.historyFrom,
            to: range.historyTo,
          },
        ],
        signal: controller.signal,
      });
      if (requestSequence !== annualHistoryRequestSequenceRef.current) return;

      setAnnualHistoryState({
        granularity: "month",
        rows: rollupLiveAnnualHistoryRows(hourlyRows, now),
      });
      annualHistoryLoadedDayRef.current = [
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ].join("-");
    } catch (error) {
      if (isAbortError(error)) return;
      if (requestSequence !== annualHistoryRequestSequenceRef.current) return;

      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o histórico anual.";
      setAnnualHistoryState({
        error: message,
        granularity: "month",
        rows: [],
      });
      toast.error(message);
    } finally {
      if (
        requestSequence === annualHistoryRequestSequenceRef.current &&
        annualHistoryRequestRef.current === controller
      ) {
        annualHistoryRequestRef.current = null;
        setLoadingAnnualHistory(false);
      }
    }
  }, [companyScopeCertificationError, companyScopeId, companyTimeZone]);
  const annualHistoryDayKey = [
    clock.getFullYear(),
    clock.getMonth(),
    clock.getDate(),
  ].join("-");
  const annualHistoryMinuteKey = [
    annualHistoryDayKey,
    clock.getHours(),
    clock.getMinutes(),
  ].join("-");
  const annualHistoryRetryMinuteKey = annualHistoryState?.error
    ? annualHistoryMinuteKey
    : "";

  React.useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  useResourceAutoRefresh(
    () => loadScenarios({ silent: true }),
    {
      enabled:
        Boolean(companyScopeId) &&
        !companyScopeCertificationError &&
        !loadingScenarios,
      intervalMs: RESOURCE_METADATA_REFRESH_INTERVAL_MS,
    },
  );

  React.useEffect(() => {
    function syncCameraGroups() {
      if (!companyScopeId || companyScopeCertificationError) {
        setCameraGroups([]);
        setWorkerLocationAssignments({});
        return;
      }
      setCameraGroups(readCameraGroups(companyScopeId));
      setWorkerLocationAssignments(
        readWorkerLocationAssignments(companyScopeId),
      );
    }

    syncCameraGroups();
    window.addEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);

    return () => {
      window.removeEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);
    };
  }, [companyScopeCertificationError, companyScopeId]);

  React.useEffect(() => {
    function syncCustomWidgets() {
      setCustomWidgets(
        loadRealtimeCustomWidgets(companyScopeId, preferenceScope),
      );
    }

    syncCustomWidgets();
    window.addEventListener(
      REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT,
      syncCustomWidgets,
    );
    window.addEventListener("storage", syncCustomWidgets);
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCustomWidgets);

    return () => {
      window.removeEventListener(
        REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT,
        syncCustomWidgets,
      );
      window.removeEventListener("storage", syncCustomWidgets);
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCustomWidgets);
    };
  }, [companyScopeId, preferenceScope]);

  React.useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    runningRef.current = false;
    annualHistoryRequestRef.current?.abort();
    annualHistoryRequestRef.current = null;
    annualHistoryRequestSequenceRef.current += 1;
    annualHistoryLoadedDayRef.current = "";
    annualHistoryAttemptMinuteRef.current = "";
    clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
    clearMinuteDayAggregateCache(minuteDayAggregateCacheRef.current);
    setMetadataError("");
    setWorkerMetadataWarning("");
    setChartLoadError(companyScopeCertificationError);
    setAnnualHistoryState(null);
    setLoadingAnnualHistory(false);
    setScenarios([]);
    setCameras([]);
    setLocations([]);
    setSubLocations([]);
    setWorkers([]);
    setScopeMode(initialScopeMode);
    setSelectedId(initialScopeId);
    setChartData({});
    setHasLoadedCharts(false);
    hasLoadedChartsRef.current = false;
  }, [
    companyScopeCertificationError,
    companyScopeId,
    companyTimeZone,
    initialScopeId,
    initialScopeMode,
  ]);

  React.useEffect(() => {
    if (!hasLoadedCharts) return;
    if (annualHistoryState?.error) {
      if (
        annualHistoryAttemptMinuteRef.current ===
        annualHistoryRetryMinuteKey
      ) {
        return;
      }
    } else if (
      annualHistoryLoadedDayRef.current === annualHistoryDayKey
    ) {
      return;
    }

    void loadAnnualHistory();

    return () => {
      annualHistoryRequestRef.current?.abort();
    };
  }, [
    annualHistoryDayKey,
    annualHistoryRetryMinuteKey,
    annualHistoryState?.error,
    hasLoadedCharts,
    loadAnnualHistory,
  ]);

  React.useEffect(() => {
    setCustomWidgetForm((current) => {
      if (
        current.scopeId &&
        customWidgetScopeOptions.some((option) => option.id === current.scopeId)
      ) {
        return current;
      }

      const nextScope = customWidgetScopeOptions[0];
      return {
        ...current,
        scopeId: nextScope?.id ?? "",
        title:
          current.title ||
          (nextScope
            ? buildCustomWidgetDefaultTitle(nextScope, current.granularity)
            : ""),
      };
    });
  }, [customWidgetScopeOptions]);

  React.useEffect(() => {
    if (!availableModes.some((mode) => mode.value === scopeMode)) {
      setScopeMode(availableModes[0]?.value ?? "scenario");
    }
  }, [availableModes, scopeMode]);

  React.useEffect(() => {
    setSelectedId((current) =>
      current && scopeOptions.some((option) => option.id === current)
        ? current
        : scopeOptions[0]?.id ?? "",
    );
  }, [scopeOptions]);

  React.useEffect(() => {
    loadCharts({ force: true });

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadCharts({ silent: true });
      }
    }, REFRESH_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadCharts({ force: true, silent: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestRef.current?.abort();
    };
  }, [loadCharts]);

  const initialLoading = (loadingScenarios || loadingCharts) && !hasLoadedCharts;
  const todayTotal = selectedScope
    ? sumScopeRowsInRange(
        hourRows,
        selectedScope,
        startOfDay(clock),
        addDays(startOfDay(clock), 1),
        hourState?.granularity ?? "hour",
      )
    : 0;
  const comparisonDayStart = operationalComparisonDayStart(
    clock,
    operationalSettings.intradayComparison,
  );
  const completedHourCount = Math.max(
    0,
    Math.floor(
      (startOfHour(clock).getTime() - startOfDay(clock).getTime()) / HOUR_MS,
    ),
  );
  const todayComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        hourRows,
        selectedScope,
        startOfDay(clock),
        startOfHour(clock),
        hourState?.granularity ?? "hour",
      )
    : 0;
  const comparisonComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        comparisonHourRows,
        selectedScope,
        comparisonDayStart,
        addHours(comparisonDayStart, completedHourCount),
        comparisonHourState?.granularity ?? "hour",
      )
    : 0;
  const comparisonDelta = percentageDelta(
    todayComparableTotal,
    comparisonComparableTotal,
  );
  const currentHourPartialTotal = todayTotal - todayComparableTotal;
  const completedMonthDayCount = Math.max(0, clock.getDate() - 1);
  const currentMonthRealtimeTotal = selectedScope
    ? sumScopeRowsInRange(
        currentMonthDayRows,
        selectedScope,
        startOfMonth(clock),
        addDays(startOfDay(clock), 1),
        currentMonthDayState?.granularity ?? "day",
      )
    : 0;
  const currentMonthClosedTotal = selectedScope
    ? sumScopeRowsInRange(
        currentMonthDayRows,
        selectedScope,
        startOfMonth(clock),
        startOfDay(clock),
        currentMonthDayState?.granularity ?? "day",
      )
    : 0;
  const previousMonthStart = addMonths(startOfMonth(clock), -1);
  const lastYearMonthStart = new Date(
    clock.getFullYear() - 1,
    clock.getMonth(),
    1,
  );
  const previousMonthComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        previousMonthDayRows,
        selectedScope,
        previousMonthStart,
        comparableMonthEnd(previousMonthStart, completedMonthDayCount),
        previousMonthDayState?.granularity ?? "hour",
      )
    : 0;
  const lastYearMonthComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        lastYearMonthDayRows,
        selectedScope,
        lastYearMonthStart,
        comparableMonthEnd(lastYearMonthStart, completedMonthDayCount),
        lastYearMonthDayState?.granularity ?? "hour",
      )
    : 0;
  const previousMonthDelta = percentageDelta(
    currentMonthClosedTotal,
    previousMonthComparableTotal,
  );
  const lastYearMonthDelta = percentageDelta(
    currentMonthClosedTotal,
    lastYearMonthComparableTotal,
  );
  const monthComparisonPoints = React.useMemo(
    () =>
      selectedScope
        ? buildOperationalMonthComparisonPoints(
            currentMonthDayRows,
            baselineMonthDayRows,
            selectedScope,
            clock,
            operationalSettings.monthComparison,
            currentMonthDayState?.granularity ?? "day",
            baselineMonthDayGranularity,
          )
        : [],
    [
      baselineMonthDayRows,
      baselineMonthDayGranularity,
      clock,
      currentMonthDayRows,
      currentMonthDayState?.granularity,
      operationalSettings.monthComparison,
      selectedScope,
    ],
  );
  const baselineDailyAverage = React.useMemo(() => {
    const values = monthComparisonPoints.flatMap((point) =>
      point.baseline === null ? [] : [point.baseline],
    );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }, [monthComparisonPoints]);
  const operationalTrendPoints = React.useMemo(() => {
    if (!selectedScope) return [];
    const definition = buildOperationalTrendDaysDefinition(clock);
    const currentMonthStart = startOfMonth(clock);
    const trendPoints = buildScopePoints(
      definition,
      operationalTrendRows,
      selectedScope,
    );

    return buildOperationalTrendPoints(trendPoints).filter((point) => {
      const bucket = new Date(point.bucket);
      return bucket >= currentMonthStart;
    });
  }, [clock, operationalTrendRows, selectedScope]);
  const heatmapScenarios = React.useMemo(
    () =>
      selectScenarios(
        scenarios,
        operationalSettings.heatmapSelectionMode,
        operationalSettings.heatmapScenarioIds,
      ),
    [
      operationalSettings.heatmapScenarioIds,
      operationalSettings.heatmapSelectionMode,
      scenarios,
    ],
  );
  const rankingScenarios = React.useMemo(
    () =>
      selectScenarios(
        scenarios,
        operationalSettings.rankingSelectionMode,
        operationalSettings.rankingScenarioIds,
      ),
    [
      operationalSettings.rankingScenarioIds,
      operationalSettings.rankingSelectionMode,
      scenarios,
    ],
  );
  const roseScenarios = React.useMemo(
    () =>
      selectScenarios(
        scenarios,
        operationalSettings.roseSelectionMode,
        operationalSettings.roseScenarioIds,
      ),
    [
      operationalSettings.roseScenarioIds,
      operationalSettings.roseSelectionMode,
      scenarios,
    ],
  );
  const cumulativeScenarios = React.useMemo(
    () =>
      selectScenarios(
        scenarios,
        operationalSettings.cumulativeSelectionMode,
        operationalSettings.cumulativeScenarioIds,
      ),
    [
      operationalSettings.cumulativeScenarioIds,
      operationalSettings.cumulativeSelectionMode,
      scenarios,
    ],
  );
  const scenarioTableScenarios = React.useMemo(
    () =>
      selectScenarios(
        scenarios,
        operationalSettings.scenarioTableSelectionMode,
        operationalSettings.scenarioTableIds,
      ),
    [
      operationalSettings.scenarioTableIds,
      operationalSettings.scenarioTableSelectionMode,
      scenarios,
    ],
  );
  const peakDayScenarios = React.useMemo(
    () =>
      selectScenarios(
        scenarios,
        operationalSettings.peakDaySelectionMode,
        operationalSettings.peakDayScenarioIds,
      ),
    [
      operationalSettings.peakDayScenarioIds,
      operationalSettings.peakDaySelectionMode,
      scenarios,
    ],
  );
  const automaticOccupancyScenarios = React.useMemo(
    () => inferOccupancyScenarios(scenarios),
    [scenarios],
  );
  const occupancyEntryScenarios = React.useMemo(() => {
    if (operationalSettings.occupancySelectionMode === "auto") {
      return automaticOccupancyScenarios.entries;
    }

    return selectScenarios(
      scenarios,
      "custom",
      operationalSettings.occupancyEntryScenarioIds,
    );
  }, [
    automaticOccupancyScenarios.entries,
    operationalSettings.occupancyEntryScenarioIds,
    operationalSettings.occupancySelectionMode,
    scenarios,
  ]);
  const occupancyExitScenarios = React.useMemo(() => {
    if (operationalSettings.occupancySelectionMode === "auto") {
      return automaticOccupancyScenarios.exits;
    }

    const entryIds = new Set(occupancyEntryScenarios.map((scenario) => scenario.id));
    return selectScenarios(
      scenarios,
      "custom",
      operationalSettings.occupancyExitScenarioIds,
    ).filter((scenario) => !entryIds.has(scenario.id));
  }, [
    automaticOccupancyScenarios.exits,
    occupancyEntryScenarios,
    operationalSettings.occupancyExitScenarioIds,
    operationalSettings.occupancySelectionMode,
    scenarios,
  ]);
  const operationalHeatmapPoints = React.useMemo(
    () =>
      buildScenarioCivilHourMagnitudePoints({
        companyTimeZone,
        from: startOfMonth(clock),
        rows: operationalMonthHourRows,
        scenarios: heatmapScenarios,
        sourceGranularity: operationalMonthHourState?.granularity ?? "hour",
        to: endOfAggregateBucket(startOfHour(clock), "hour"),
      }),
    [
      clock,
      companyTimeZone,
      heatmapScenarios,
      operationalMonthHourRows,
      operationalMonthHourState?.granularity,
    ],
  );
  const targetProgress = baselineDailyAverage
    ? todayTotal / baselineDailyAverage
    : null;
  const monthlyAccessRankingPoints = React.useMemo(
    () =>
      buildScenarioPeriodComparisonPoints(
        rankingScenarios,
        currentMonthDayRows,
        startOfMonth(clock),
        addDays(startOfDay(clock), 1),
        currentMonthDayState?.granularity ?? "day",
      ),
    [
      clock,
      currentMonthDayRows,
      currentMonthDayState?.granularity,
      rankingScenarios,
    ],
  );
  const roseScenarioPoints = React.useMemo(
    () =>
      buildScenarioPeriodComparisonPoints(
        roseScenarios,
        currentMonthDayRows,
        startOfMonth(clock),
        addDays(startOfDay(clock), 1),
        currentMonthDayState?.granularity ?? "day",
      ),
    [
      clock,
      currentMonthDayRows,
      currentMonthDayState?.granularity,
      roseScenarios,
    ],
  );
  const cumulativeScenarioPoints = React.useMemo(
    () =>
      buildScenarioCumulativeTotals({
        from: startOfDay(clock),
        rows: hourRows,
        scenarios: cumulativeScenarios,
        sourceGranularity: chartData.live_chart_hour?.granularity ?? "hour",
        to: clock,
      }),
    [
      chartData.live_chart_hour?.granularity,
      clock,
      cumulativeScenarios,
      hourRows,
    ],
  );
  const scenarioTableTodayPoints = React.useMemo(
    () =>
      buildScenarioCumulativeTotals({
        from: startOfDay(clock),
        rows: hourRows,
        scenarios: scenarioTableScenarios,
        sourceGranularity: chartData.live_chart_hour?.granularity ?? "hour",
        to: clock,
      }),
    [
      chartData.live_chart_hour?.granularity,
      clock,
      hourRows,
      scenarioTableScenarios,
    ],
  );
  const scenarioTableMonthPoints = React.useMemo(
    () =>
      buildScenarioCumulativeTotals({
        from: startOfMonth(clock),
        rows: currentMonthDayRows,
        scenarios: scenarioTableScenarios,
        sourceGranularity: currentMonthDayState?.granularity ?? "day",
        to: clock,
      }),
    [
      clock,
      currentMonthDayRows,
      currentMonthDayState?.granularity,
      scenarioTableScenarios,
    ],
  );
  const scenarioTableRows = React.useMemo(
    () =>
      buildScenarioTotalsTableRows(
        scenarioTableTodayPoints,
        scenarioTableMonthPoints,
      ),
    [scenarioTableMonthPoints, scenarioTableTodayPoints],
  );
  const liveAnnualComparisonModel = React.useMemo(
    () =>
      selectedScope &&
      annualHistoryState &&
      !annualHistoryState.error &&
      annualRecentMonthState?.granularity === "month" &&
      !annualRecentMonthState.error &&
      operationalMonthHourState?.granularity === "hour" &&
      !operationalMonthHourState.error
        ? buildLiveAnnualComparisonModel({
            historicalMonthRows: annualHistoryState.rows,
            hourlyRows: operationalMonthHourRows,
            now: clock,
            recentMonthRows: annualRecentMonthRows,
            scenarios,
            scope: selectedScope,
          })
        : null,
    [
      annualHistoryState,
      annualRecentMonthRows,
      annualRecentMonthState,
      clock,
      operationalMonthHourRows,
      operationalMonthHourState,
      scenarios,
      selectedScope,
    ],
  );
  const liveAnnualComparisonError =
    annualHistoryState?.error ||
    annualRecentMonthState?.error ||
    operationalMonthHourState?.error;
  const liveAnnualComparisonLoading =
    initialLoading || (!annualHistoryState && !liveAnnualComparisonError);
  const peakDayPoints = React.useMemo(
    () =>
      buildTopScenarioPeakDays({
        from: startOfMonth(clock),
        rows: currentMonthDayRows,
        scenarios: peakDayScenarios,
        sourceGranularity: currentMonthDayState?.granularity ?? "day",
        to: addDays(startOfDay(clock), 1),
      }),
    [
      clock,
      currentMonthDayRows,
      currentMonthDayState?.granularity,
      peakDayScenarios,
    ],
  );
  const hourlyOccupancyPoints = React.useMemo(
    () =>
      buildScenarioHourlyOccupancy({
        companyTimeZone,
        day: clock,
        entryScenarios: occupancyEntryScenarios,
        exitScenarios: occupancyExitScenarios,
        rows: occupancyHourRows,
        sourceGranularity: occupancyHourState?.granularity ?? "hour",
        startHour: operationalSettings.occupancyStartHour,
        through: clock,
      }),
    [
      clock,
      companyTimeZone,
      occupancyEntryScenarios,
      occupancyExitScenarios,
      occupancyHourRows,
      occupancyHourState?.granularity,
      operationalSettings.occupancyStartHour,
    ],
  );
  const scenarioTodayComparisonPoints = React.useMemo(
    () =>
      buildScenarioTodayComparisonPoints(
        scenarios,
        hourRows,
        clock,
        hourState?.granularity ?? "hour",
      ),
    [clock, hourRows, hourState?.granularity, scenarios],
  );
  const locationTodayComparisonPoints = React.useMemo(
    () =>
      buildScopeTodayComparisonPoints(
        buildRealtimeScopeOptions({
          cameras,
          groups: cameraGroups,
          locations,
          manager,
          mode: "location",
          scenarios,
          subLocations,
          workerLocationAssignments,
          workers,
        }),
        hourRows,
        clock,
        hourState?.granularity ?? "hour",
      ),
    [
      cameraGroups,
      cameras,
      clock,
      hourRows,
      hourState?.granularity,
      locations,
      manager,
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    ],
  );
  const subLocationTodayComparisonPoints = React.useMemo(
    () =>
      buildScopeTodayComparisonPoints(
        buildRealtimeScopeOptions({
          cameras,
          groups: cameraGroups,
          locations,
          manager,
          mode: "sub_location",
          scenarios,
          subLocations,
          workerLocationAssignments,
          workers,
        }),
        hourRows,
        clock,
        hourState?.granularity ?? "hour",
      ),
    [
      cameraGroups,
      cameras,
      clock,
      hourRows,
      hourState?.granularity,
      locations,
      manager,
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    ],
  );

  function getScopeOptionsForMode(mode: RealtimeCustomWidgetScopeMode) {
    return buildRealtimeScopeOptions({
      cameras,
      groups: cameraGroups,
      locations,
      manager,
      mode,
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    });
  }

  function updateOperationalSettings(
    patch:
      | Partial<LiveOperationalSettings>
      | ((current: LiveOperationalSettings) => Partial<LiveOperationalSettings>),
  ) {
    setOperationalSettings((current) => {
      const resolvedPatch =
        typeof patch === "function" ? patch(current) : patch;
      return saveLiveOperationalSettings(
        { ...current, ...resolvedPatch },
        companyScopeId,
        preferenceScope,
      );
    });
  }

  function openCustomWidgetDialog() {
    const preferredMode = (selectedScope?.mode ??
      availableModes[0]?.value ??
      "scenario") as RealtimeCustomWidgetScopeMode;
    const options = getScopeOptionsForMode(preferredMode);
    const scope =
      selectedScope?.mode === preferredMode ? selectedScope : options[0] ?? null;
    const granularity: RealtimeCustomWidgetGranularity = "hour";

    setCustomWidgetForm({
      comparisonSettings: createDefaultScenarioComparisonSettings(),
      granularity,
      kind: "scope",
      scenarioIds: [],
      scenarioSelectionMode: "all",
      scenarioWidgetType: "ranking",
      scopeId: scope?.id ?? "",
      scopeMode: (scope?.mode ?? preferredMode) as RealtimeCustomWidgetScopeMode,
      title: scope ? buildCustomWidgetDefaultTitle(scope, granularity) : "",
    });
    setCustomWidgetDialogOpen(true);
  }

  function openCustomWidgetEditor(widget: RealtimeCustomWidget) {
    const preferredMode = (selectedScope?.mode ??
      availableModes[0]?.value ??
      "scenario") as RealtimeCustomWidgetScopeMode;
    const fallbackScope = getScopeOptionsForMode(preferredMode)[0] ?? null;

    if (widget.kind === "scenario_comparison") {
      setCustomWidgetForm({
        comparisonSettings: loadScenarioComparisonSettings(
          realtimeScenarioComparisonStorageKey(widget.id),
          companyScopeId,
          preferenceScope,
        ),
        granularity: "hour",
        id: widget.id,
        kind: "scenario_comparison",
        scenarioIds: [],
        scenarioSelectionMode: "all",
        scenarioWidgetType: "ranking",
        scopeId: fallbackScope?.id ?? "",
        scopeMode: preferredMode,
        title: widget.title,
      });
    } else if (widget.kind === "scenario_widget") {
      setCustomWidgetForm({
        comparisonSettings: createDefaultScenarioComparisonSettings(),
        granularity: "hour",
        id: widget.id,
        kind: "scenario_widget",
        scenarioIds: widget.scenarioIds,
        scenarioSelectionMode: widget.selectionMode,
        scenarioWidgetType: widget.widgetType,
        scopeId: fallbackScope?.id ?? "",
        scopeMode: preferredMode,
        title: widget.title,
      });
    } else {
      setCustomWidgetForm({
        comparisonSettings: createDefaultScenarioComparisonSettings(),
        granularity: widget.granularity,
        id: widget.id,
        kind: "scope",
        scenarioIds: [],
        scenarioSelectionMode: "all",
        scenarioWidgetType: "ranking",
        scopeId: widget.scopeId,
        scopeMode: widget.scopeMode,
        title: widget.title,
      });
    }

    setCustomWidgetDialogOpen(true);
  }

  function handleCustomWidgetKindChange(value: string) {
    const kind = value as RealtimeCustomWidgetKind;
    const scope = customWidgetScopeOptions.find(
      (option) => option.id === customWidgetForm.scopeId,
    );

    setCustomWidgetForm((current) => ({
      ...current,
      kind,
      title:
        kind === "scenario_comparison"
          ? "Cenários por período"
          : kind === "scenario_widget"
            ? scenarioWidgetOption(current.scenarioWidgetType).label
          : scope
            ? buildCustomWidgetDefaultTitle(scope, current.granularity)
            : "",
    }));
  }

  function handleScenarioWidgetTypeChange(value: string) {
    const scenarioWidgetType = value as RealtimeScenarioWidgetType;
    setCustomWidgetForm((current) => ({
      ...current,
      scenarioWidgetType,
      title: scenarioWidgetOption(scenarioWidgetType).label,
    }));
  }

  function handleCustomWidgetModeChange(value: string) {
    const scopeMode = value as RealtimeCustomWidgetScopeMode;
    const nextScope = getScopeOptionsForMode(scopeMode)[0];

    setCustomWidgetForm((current) => ({
      ...current,
      scopeId: nextScope?.id ?? "",
      scopeMode,
      title:
        current.title ||
        (nextScope
          ? buildCustomWidgetDefaultTitle(nextScope, current.granularity)
          : ""),
    }));
  }

  function handleCustomWidgetScopeChange(value: string) {
    const nextScope = customWidgetScopeOptions.find(
      (option) => option.id === value,
    );

    setCustomWidgetForm((current) => ({
      ...current,
      scopeId: value,
      title:
        current.title ||
        (nextScope
          ? buildCustomWidgetDefaultTitle(nextScope, current.granularity)
          : ""),
    }));
  }

  function handleCustomWidgetGranularityChange(value: string) {
    const granularity = value as RealtimeCustomWidgetGranularity;
    const currentScope = customWidgetScopeOptions.find(
      (option) => option.id === customWidgetForm.scopeId,
    );

    setCustomWidgetForm((current) => ({
      ...current,
      granularity,
      title:
        current.title ||
        (currentScope
          ? buildCustomWidgetDefaultTitle(currentScope, granularity)
          : ""),
    }));
  }

  function saveCustomWidget() {
    const widgetId = customWidgetForm.id;
    const editing = Boolean(widgetId);

    if (customWidgetForm.kind === "scenario_comparison") {
      const nextWidgets = upsertRealtimeCustomWidget(
        {
          id: widgetId,
          kind: "scenario_comparison",
          title: customWidgetForm.title.trim() || "Cenários por período",
        },
        companyScopeId,
        preferenceScope,
      );
      const savedWidget = widgetId
        ? nextWidgets.find((widget) => widget.id === widgetId)
        : nextWidgets.find(
            (widget) =>
              widget.kind === "scenario_comparison" &&
              !customWidgets.some((current) => current.id === widget.id),
          );

      if (savedWidget?.kind === "scenario_comparison") {
        saveScenarioComparisonSettings(
          realtimeScenarioComparisonStorageKey(savedWidget.id),
          customWidgetForm.comparisonSettings,
          companyScopeId,
          preferenceScope,
        );
      }

      setCustomWidgets(nextWidgets);
      setCustomWidgetDialogOpen(false);
      toast.success(
        editing
          ? "Widget de cenários por período atualizado."
          : "Widget de cenários por período adicionado.",
      );
      return;
    }

    if (customWidgetForm.kind === "scenario_widget") {
      if (
        customWidgetForm.scenarioSelectionMode === "custom" &&
        !customWidgetForm.scenarioIds.length
      ) {
        toast.error("Selecione ao menos um cenário para criar o widget.");
        return;
      }

      const nextWidgets = upsertRealtimeCustomWidget(
        {
          id: widgetId,
          kind: "scenario_widget",
          scenarioIds: customWidgetForm.scenarioIds,
          selectionMode: customWidgetForm.scenarioSelectionMode,
          title:
            customWidgetForm.title.trim() ||
            scenarioWidgetOption(customWidgetForm.scenarioWidgetType).label,
          widgetType: customWidgetForm.scenarioWidgetType,
        },
        companyScopeId,
        preferenceScope,
      );
      setCustomWidgets(nextWidgets);
      setCustomWidgetDialogOpen(false);
      toast.success(
        editing ? "Widget por cenário atualizado." : "Widget por cenário adicionado.",
      );
      return;
    }

    const scope = getScopeOptionsForMode(customWidgetForm.scopeMode).find(
      (option) => option.id === customWidgetForm.scopeId,
    );

    if (!scope) {
      toast.error("Selecione uma visão válida para criar o widget.");
      return;
    }

    const title =
      customWidgetForm.title.trim() ||
      buildCustomWidgetDefaultTitle(scope, customWidgetForm.granularity);
    const nextWidgets = upsertRealtimeCustomWidget(
      {
        granularity: customWidgetForm.granularity,
        id: widgetId,
        kind: "scope",
        scopeId: scope.id,
        scopeMode: scope.mode as RealtimeCustomWidgetScopeMode,
        scopeName: scope.name,
        title,
      },
      companyScopeId,
      preferenceScope,
    );

    setCustomWidgets(nextWidgets);
    setCustomWidgetDialogOpen(false);
    toast.success(editing ? "Widget atualizado." : "Widget adicionado ao Ao Vivo.");
  }

  function removeCustomWidget(widgetId: string) {
    const widget = customWidgets.find((item) => item.id === widgetId);
    if (widget?.kind === "scenario_comparison") {
      deleteScenarioComparisonSettings(
        realtimeScenarioComparisonStorageKey(widget.id),
        companyScopeId,
        preferenceScope,
      );
    }
    const nextWidgets = deleteRealtimeCustomWidget(
      widgetId,
      companyScopeId,
      preferenceScope,
    );
    setCustomWidgets(nextWidgets);
    toast.success("Widget removido.");
  }

  const metricCards = [
    {
      id: "live_intraday_comparison",
      label: "Hoje até agora",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          error={
            chartData.live_chart_minute?.error ||
            hourState?.error ||
            comparisonHourState?.error
          }
          icon={Clock3}
          label="Hoje até agora"
          value={todayTotal}
          loading={initialLoading}
          tone="primary"
          description={
            completedHourCount
              ? `${formatNumber(
                  currentHourPartialTotal,
                )} na hora em andamento · ${formatDelta(
                  comparisonDelta,
                )} nas horas fechadas vs. ${intradayComparisonSeriesLabel(
                  operationalSettings.intradayComparison,
                ).toLowerCase()} · base ${formatNumber(
                  comparisonComparableTotal,
                )}`
              : "Atualização contínua; comparativo disponível após a primeira hora fechada"
          }
        />
      ),
    },
    {
      id: "live_target_progress",
      label: "Hoje x média-base",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          error={hourState?.error || operationalMonthHourState?.error}
          icon={Target}
          label="Hoje x média-base"
          value={
            targetProgress === null
              ? "Sem base"
              : `${Math.round(targetProgress * 100)}%`
          }
          loading={initialLoading}
          tone="indigo"
          description={
            baselineDailyAverage
              ? `${formatNumber(todayTotal)} hoje · ${averageBaseDescription(
                  operationalSettings.monthComparison,
                ).toLowerCase()} de ${formatNumber(
                  baselineDailyAverage,
                )}`
              : "sem histórico diário na base escolhida"
          }
        />
      ),
    },
    {
      id: "live_month_previous_comparison",
      label: "Acumulado x mês anterior",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          error={
            operationalMonthHourState?.error ||
            previousMonthDayState?.error
          }
          icon={Activity}
          label="Acumulado x mês anterior"
          value={currentMonthRealtimeTotal}
          comparison={formatDelta(previousMonthDelta)}
          loading={initialLoading}
          tone="sky"
          description={`${formatNumber(
            previousMonthComparableTotal,
          )} até o último dia fechado do mês anterior · comparação em ${completedMonthDayCount} dias fechados`}
        />
      ),
    },
    {
      id: "live_month_year_comparison",
      label: "Acumulado x ano anterior",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          error={
            operationalMonthHourState?.error ||
            lastYearMonthDayState?.error
          }
          icon={TrendingUp}
          label="Acumulado x ano anterior"
          value={currentMonthRealtimeTotal}
          comparison={formatDelta(lastYearMonthDelta)}
          loading={initialLoading}
          tone="indigo"
          description={`${formatNumber(
            lastYearMonthComparableTotal,
          )} até o último dia fechado do ano anterior · comparação em ${completedMonthDayCount} dias fechados`}
        />
      ),
    },
  ].map((card) => ({
    ...card,
    defaultHeight: "short" as const,
    maxHeight: "short" as const,
    maxHeightLevel: 1 as const,
    maxWidthLevel: 3 as const,
    minHeight: "short" as const,
    minHeightLevel: 1 as const,
    minWidthLevel: 1 as const,
    titleEditable: true as const,
  }));

  const operationalComparisonDefinition =
    buildOperationalComparisonHoursDefinition(
      clock,
      operationalSettings.intradayComparison,
    );
  const hourlyDefinition = chartDefinitions.find(
    (definition) => definition.id === "live_chart_hour",
  );
  const minuteDayDefinition = buildMinuteDayDefinition(clock);
  const operationalCards = [
    {
      id: LIVE_DAY_MINUTES_ID,
      label: "Minuto a minuto · Hoje",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 4 as const,
      narrowMinHeightLevel: 5 as const,
      titleEditable: true as const,
      zoomEnabled: true as const,
      node: selectedScope ? (
        <MinuteDayChartCard
          clock={clock}
          companyTimeZone={companyTimeZone}
          definition={minuteDayDefinition}
          loading={initialLoading}
          rows={minuteDayRows}
          scope={selectedScope}
          state={minuteDayState}
        />
      ) : (
        <EmptyRealtimeCard title="Minuto a minuto · Hoje" />
      ),
    },
    {
      id: "live_chart_hour",
      chartTypeEnabled: true,
      label: "Hora a Hora",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      node:
        selectedScope && hourlyDefinition ? (
        <OperationalHourlyChartCard
          averageDescription={averageBaseDescription(
            operationalSettings.monthComparison,
          )}
          comparisonDefinition={operationalComparisonDefinition}
          comparisonLabel={intradayComparisonSeriesLabel(
            operationalSettings.intradayComparison,
          )}
          comparisonRows={comparisonHourRows}
          currentDefinition={hourlyDefinition}
          currentRows={hourRows}
          targetDailyAverage={baselineDailyAverage}
          loading={initialLoading}
          scope={selectedScope}
          state={chartData.live_chart_hour}
        />
      ) : (
        <EmptyRealtimeCard title="Hora a Hora" />
      ),
    },
    {
      id: "live_moving_average_trend",
      chartTypeEnabled: true,
      label: "Tendência 7 x 30 dias",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      node: (
        <OperationalTrendCard
          error={operationalMonthHourState?.error}
          loading={initialLoading}
          month={clock}
          points={operationalTrendPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
    {
      id: "live_hourly_occupancy",
      chartTypeEnabled: true,
      label: "Ocupação hora a hora",
      defaultHeight: "standard" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 5 as const,
      minWidthLevel: 4 as const,
      narrowMinHeightLevel: 5 as const,
      node: (
        <HourlyOccupancyCard
          canConfigure={canEditVisual}
          entryScenarioIds={
            operationalSettings.occupancySelectionMode === "custom"
              ? operationalSettings.occupancyEntryScenarioIds
              : occupancyEntryScenarios.map((scenario) => scenario.id)
          }
          entryScenarios={occupancyEntryScenarios}
          error={occupancyHourState?.error}
          exitScenarioIds={
            operationalSettings.occupancySelectionMode === "custom"
              ? operationalSettings.occupancyExitScenarioIds
              : occupancyExitScenarios.map((scenario) => scenario.id)
          }
          exitScenarios={occupancyExitScenarios}
          loading={initialLoading}
          monitorMode={monitorMode}
          onEntryScenarioIdsChange={(occupancyEntryScenarioIds) =>
            updateOperationalSettings((current) => ({
              occupancyEntryScenarioIds,
              occupancyExitScenarioIds:
                current.occupancyExitScenarioIds.filter(
                  (id) => !occupancyEntryScenarioIds.includes(id),
                ),
            }))
          }
          onExitScenarioIdsChange={(occupancyExitScenarioIds) =>
            updateOperationalSettings((current) => ({
              occupancyEntryScenarioIds:
                current.occupancyEntryScenarioIds.filter(
                  (id) => !occupancyExitScenarioIds.includes(id),
                ),
              occupancyExitScenarioIds,
            }))
          }
          onSelectionModeChange={(occupancySelectionMode) =>
            updateOperationalSettings((current) => {
              if (occupancySelectionMode === "auto") {
                return { occupancySelectionMode };
              }

              const validScenarioIds = new Set(
                scenarios.map((scenario) => scenario.id),
              );
              const savedEntries = current.occupancyEntryScenarioIds.filter(
                (id) => validScenarioIds.has(id),
              );
              const savedEntryIds = new Set(savedEntries);
              const savedExits = current.occupancyExitScenarioIds.filter(
                (id) => validScenarioIds.has(id) && !savedEntryIds.has(id),
              );
              const hasSavedSelection = savedEntries.length || savedExits.length;

              return {
                occupancyEntryScenarioIds: hasSavedSelection
                  ? savedEntries
                  : automaticOccupancyScenarios.entries.map(
                      (scenario) => scenario.id,
                    ),
                occupancyExitScenarioIds: hasSavedSelection
                  ? savedExits
                  : automaticOccupancyScenarios.exits.map(
                      (scenario) => scenario.id,
                    ),
                occupancySelectionMode,
              };
            })
          }
          onStartHourChange={(occupancyStartHour) =>
            updateOperationalSettings({ occupancyStartHour })
          }
          points={hourlyOccupancyPoints}
          scenarios={scenarios}
          selectionMode={operationalSettings.occupancySelectionMode}
          startHour={operationalSettings.occupancyStartHour}
        />
      ),
    },
    {
      id: "live_scenario_cumulative",
      label: "Acumulado por cenário",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 5 as const,
      minWidthLevel: 4 as const,
      narrowMinHeightLevel: 5 as const,
      node: (
        <ScenarioCumulativeTotalsCard
          canConfigure={canEditVisual}
          loading={initialLoading}
          monitorMode={monitorMode}
          onSelectedIdsChange={(cumulativeScenarioIds) =>
            updateOperationalSettings({ cumulativeScenarioIds })
          }
          onSelectionModeChange={(cumulativeSelectionMode) =>
            updateOperationalSettings({ cumulativeSelectionMode })
          }
          points={cumulativeScenarioPoints}
          scenarios={scenarios}
          selectedIds={operationalSettings.cumulativeScenarioIds}
          selectionMode={operationalSettings.cumulativeSelectionMode}
        />
      ),
    },
    {
      id: "live_scenario_totals_table",
      label: "Tabela acumulada por cenário",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 4 as const,
      narrowMinHeightLevel: 5 as const,
      node: (
        <ScenarioTotalsTableCard
          canConfigure={canEditVisual}
          loading={initialLoading}
          monitorMode={monitorMode}
          onSelectedIdsChange={(scenarioTableIds) =>
            updateOperationalSettings({ scenarioTableIds })
          }
          onSelectionModeChange={(scenarioTableSelectionMode) =>
            updateOperationalSettings({ scenarioTableSelectionMode })
          }
          rows={scenarioTableRows}
          scenarios={scenarios}
          selectedIds={operationalSettings.scenarioTableIds}
          selectionMode={operationalSettings.scenarioTableSelectionMode}
        />
      ),
    },
    {
      id: "live_current_year_monthly",
      chartTypeEnabled: true,
      label: "Comparativo mensal por ano",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 5 as const,
      minWidthLevel: 4 as const,
      node: (
        <LiveAnnualComparisonCard
          accumulated={false}
          error={liveAnnualComparisonError}
          loading={liveAnnualComparisonLoading}
          model={liveAnnualComparisonModel}
          refreshing={loadingAnnualHistory && Boolean(annualHistoryState)}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
    {
      id: "live_current_year_accumulated",
      chartTypeEnabled: true,
      label: "Comparativo acumulado por ano",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 5 as const,
      minWidthLevel: 4 as const,
      node: (
        <LiveAnnualComparisonCard
          accumulated
          error={liveAnnualComparisonError}
          loading={liveAnnualComparisonLoading}
          model={liveAnnualComparisonModel}
          refreshing={loadingAnnualHistory && Boolean(annualHistoryState)}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
    {
      id: "live_month_hour_heatmap",
      colorPreview: "gradient" as const,
      label: "Mapa de calor dia x hora",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 5 as const,
      minWidthLevel: 4 as const,
      narrowMinHeightLevel: 5 as const,
      node: (
        <OperationalHeatmapCard
          canConfigure={canEditVisual}
          error={operationalMonthHourState?.error}
          loading={initialLoading}
          month={clock}
          monitorMode={monitorMode}
          onSelectedIdsChange={(heatmapScenarioIds) =>
            updateOperationalSettings({ heatmapScenarioIds })
          }
          onSelectionModeChange={(heatmapSelectionMode) =>
            updateOperationalSettings({ heatmapSelectionMode })
          }
          points={operationalHeatmapPoints}
          scenarios={scenarios}
          selectedIds={operationalSettings.heatmapScenarioIds}
          selectionLabel={scenarioSelectionSummary(
            scenarios,
            operationalSettings.heatmapSelectionMode,
            operationalSettings.heatmapScenarioIds,
          )}
          selectionMode={operationalSettings.heatmapSelectionMode}
        />
      ),
    },
    {
      id: "live_month_access_ranking",
      label: "Ranking dos acessos do mês",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      node: (
        <MonthlyAccessRankingCard
          canConfigure={canEditVisual}
          loading={initialLoading}
          monitorMode={monitorMode}
          onSelectedIdsChange={(rankingScenarioIds) =>
            updateOperationalSettings({ rankingScenarioIds })
          }
          onSelectionModeChange={(rankingSelectionMode) =>
            updateOperationalSettings({ rankingSelectionMode })
          }
          points={monthlyAccessRankingPoints}
          scenarios={scenarios}
          selectedIds={operationalSettings.rankingScenarioIds}
          selectionMode={operationalSettings.rankingSelectionMode}
        />
      ),
    },
    {
      id: "live_month_peak_days",
      label: "Top 5 dias de pico",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      node: (
        <PeakDaysRankingCard
          canConfigure={canEditVisual}
          loading={initialLoading}
          monitorMode={monitorMode}
          onSelectedIdsChange={(peakDayScenarioIds) =>
            updateOperationalSettings({ peakDayScenarioIds })
          }
          onSelectionModeChange={(peakDaySelectionMode) =>
            updateOperationalSettings({ peakDaySelectionMode })
          }
          points={peakDayPoints}
          scenarios={scenarios}
          selectedIds={operationalSettings.peakDayScenarioIds}
          selectionMode={operationalSettings.peakDaySelectionMode}
        />
      ),
    },
    {
      id: "live_scenario_rose",
      chartTypes: ["rose", "treemap"] as const,
      label: "Composição por cenário",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      node: (
        <ScenarioRoseCard
          canConfigure={canEditVisual}
          loading={initialLoading}
          monitorMode={monitorMode}
          onSelectedIdsChange={(roseScenarioIds) =>
            updateOperationalSettings({ roseScenarioIds })
          }
          onSelectionModeChange={(roseSelectionMode) =>
            updateOperationalSettings({ roseSelectionMode })
          }
          points={roseScenarioPoints}
          scenarios={scenarios}
          selectedIds={operationalSettings.roseScenarioIds}
          selectionMode={operationalSettings.roseSelectionMode}
        />
      ),
    },
    {
      id: "live_operational_month_comparison",
      chartTypeEnabled: true,
      label: "Dias x meses",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 4 as const,
      node: (
        <OperationalMonthComparisonCard
          loading={initialLoading}
          month={clock}
          mode={operationalSettings.monthComparison}
          points={monthComparisonPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
    {
      id: "live_operational_month_cumulative",
      chartTypeEnabled: true,
      label: "Acumulado diário x mês-base",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 4 as const,
      node: (
        <OperationalMonthCumulativeCard
          loading={initialLoading}
          month={clock}
          mode={operationalSettings.monthComparison}
          points={monthComparisonPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
  ].map((card) => ({
    ...card,
    colorEditable: card.id !== "live_scenario_totals_table",
    titleEditable: true as const,
    zoomEnabled: card.id !== "live_scenario_totals_table",
  }));
  const comparisonCards = [
    scenarioTodayComparisonPoints.length > 1 &&
    scenarioTodayComparisonPoints.some((point) => point.total > 0)
      ? {
          id: "live_today_scenario_comparison",
          chartTypeEnabled: true,
          label: "Hoje por cenário",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          node: (
            <TodayComparisonCard
              description="Comparativo do acumulado do dia entre os cenários cadastrados."
              emptyText="Nenhum cenário disponível para comparar."
              loading={initialLoading}
              points={scenarioTodayComparisonPoints}
              title="Hoje por cenário"
            />
          ),
        }
      : null,
    locationTodayComparisonPoints.length > 1 &&
    locationTodayComparisonPoints.some((point) => point.total > 0)
      ? {
          id: "live_today_location_comparison",
          chartTypeEnabled: true,
          label: "Hoje por local",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          node: (
            <TodayComparisonCard
              description="Comparativo do acumulado do dia entre os locais cadastrados."
              emptyText="Nenhum local disponível para comparar."
              loading={initialLoading}
              points={locationTodayComparisonPoints}
              title="Hoje por local"
            />
          ),
        }
      : null,
    subLocationTodayComparisonPoints.length > 1 &&
    subLocationTodayComparisonPoints.some((point) => point.total > 0)
      ? {
          id: "live_today_sub_location_comparison",
          chartTypeEnabled: true,
          label: "Hoje por sublocal",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          node: (
            <TodayComparisonCard
              description="Comparativo do acumulado do dia entre os sublocais cadastrados."
              emptyText="Nenhum sublocal disponível para comparar."
              loading={initialLoading}
              points={subLocationTodayComparisonPoints}
              title="Hoje por sublocal"
            />
          ),
        }
      : null,
  ]
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
    .map((card) => ({
      ...card,
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      titleEditable: true as const,
      zoomEnabled: true as const,
    }));

  const customWidgetCards = customWidgets.map((widget) => {
    if (widget.kind === "scenario_comparison") {
      return {
        id: `live_custom_${widget.id}`,
        chartTypeEnabled: true,
        titleEditable: true,
        zoomEnabled: true,
        label: widget.title,
        defaultSize: "full" as const,
        className: "sm:col-span-2 xl:col-span-4",
        maxHeightLevel: 6 as const,
        maxWidthLevel: 6 as const,
        minHeightLevel: 5 as const,
        minWidthLevel: 4 as const,
        narrowMinHeightLevel: 5 as const,
        node: (
          <ScenarioComparisonCard
            action={
              canEditVisual && !monitorMode ? (
                <CustomWidgetActions
                  onEdit={() => openCustomWidgetEditor(widget)}
                  onRemove={() => removeCustomWidget(widget.id)}
                  title={widget.title}
                />
              ) : null
            }
            autoRefresh
            companyId={companyScopeId}
            companyTimeZone={companyTimeZone}
            disabledReason={liveComparisonDisabledReason}
            hourlySource={liveComparisonHourlySource}
            monitorMode={monitorMode}
            preferenceScopeId={selectedScope?.id}
            scenarios={scenarios}
            storageKey={realtimeScenarioComparisonStorageKey(widget.id)}
            title={widget.title}
          />
        ),
      };
    }

    if (widget.kind === "scenario_widget") {
      return {
        id: `live_custom_${widget.id}`,
        chartTypes:
          widget.widgetType === "rose"
            ? (["rose", "treemap"] as const)
            : undefined,
        colorEditable: widget.widgetType !== "totals_table",
        colorPreview:
          widget.widgetType === "heatmap" ? ("gradient" as const) : undefined,
        label: widget.title,
        titleEditable: true,
        zoomEnabled: widget.widgetType !== "totals_table",
        defaultHeight:
          widget.widgetType === "heatmap" || widget.widgetType === "totals_table"
            ? ("tall" as const)
            : ("standard" as const),
        defaultSize:
          widget.widgetType === "heatmap" || widget.widgetType === "totals_table"
            ? ("full" as const)
            : ("wide" as const),
        maxHeightLevel: 6 as const,
        maxWidthLevel: 6 as const,
        minHeightLevel:
          widget.widgetType === "heatmap"
            ? (5 as const)
            : (4 as const),
        minWidthLevel:
          widget.widgetType === "heatmap" || widget.widgetType === "totals_table"
            ? (4 as const)
            : (3 as const),
        narrowMinHeightLevel:
          widget.widgetType === "heatmap" || widget.widgetType === "totals_table"
            ? (5 as const)
            : (4 as const),
        node: (
          <CustomScenarioWidgetCard
            canConfigure={canEditVisual}
            clock={clock}
            companyTimeZone={companyTimeZone}
            currentMonthDayGranularity={
              currentMonthDayState?.granularity ?? "day"
            }
            currentMonthDayRows={currentMonthDayRows}
            error={operationalMonthHourState?.error}
            hourGranularity={
              chartData.live_chart_hour?.granularity ?? "hour"
            }
            hourRows={hourRows}
            loading={initialLoading}
            monitorMode={monitorMode}
            monthHourGranularity={
              operationalMonthHourState?.granularity ?? "hour"
            }
            monthHourRows={operationalMonthHourRows}
            onEdit={() => openCustomWidgetEditor(widget)}
            onChange={(patch) => {
              const nextWidgets = upsertRealtimeCustomWidget(
                {
                  id: widget.id,
                  kind: "scenario_widget",
                  scenarioIds: patch.scenarioIds ?? widget.scenarioIds,
                  selectionMode:
                    patch.selectionMode ?? widget.selectionMode,
                  title: widget.title,
                  widgetType: widget.widgetType,
                },
                companyScopeId,
                preferenceScope,
              );
              setCustomWidgets(nextWidgets);
            }}
            onRemove={() => removeCustomWidget(widget.id)}
            scenarios={scenarios}
            widget={widget}
          />
        ),
      };
    }

    const scope = getScopeOptionsForMode(widget.scopeMode).find(
      (option) => option.id === widget.scopeId,
    );
    const definition = buildCustomWidgetDefinition(
      widget,
      chartDefinitions,
      scope,
    );
    const state = chartStateForGranularity(chartData, widget.granularity);

    return {
      id: `live_custom_${widget.id}`,
      chartTypeEnabled: true,
      titleEditable: true,
      zoomEnabled: true,
      label: widget.title,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
      node: scope ? (
        <RealtimeChartCard
          action={
            canEditVisual && !monitorMode ? (
              <CustomWidgetActions
                onEdit={() => openCustomWidgetEditor(widget)}
                onRemove={() => removeCustomWidget(widget.id)}
                title={widget.title}
              />
            ) : null
          }
          definition={definition}
          loading={initialLoading}
          rows={state?.rows ?? []}
          scope={scope}
          state={state}
        />
      ) : (
        <MissingCustomWidgetCard
          title={widget.title}
          onEdit={
            canEditVisual && !monitorMode
              ? () => openCustomWidgetEditor(widget)
              : undefined
          }
          onRemove={
            canEditVisual && !monitorMode
              ? () => removeCustomWidget(widget.id)
              : undefined
          }
        />
      ),
    };
  });

  const liveLayoutCards = [
    ...metricCards,
    ...operationalCards,
    ...comparisonCards,
    ...customWidgetCards,
  ];
  const liveCardIds = liveLayoutCards.map((card) => card.id);
  const liveCardIdsKey = liveCardIds.join("|");
  const livePreferences = useCardPreferences(
    "live",
    liveCardIds,
    companyScopeId,
    {
      userId: user?.id,
      viewId: selectedScope?.id,
    },
  );
  const liveColorByCardId = React.useMemo(
    () =>
      new Map(
        livePreferences.flatMap((preference) =>
          preference.color ? [[preference.id, preference.color] as const] : [],
        ),
      ),
    [livePreferences],
  );
  const liveChartTypeByCardId = React.useMemo(
    () =>
      new Map(
        livePreferences.flatMap((preference) =>
          preference.chartType
            ? [[preference.id, preference.chartType] as const]
            : [],
        ),
      ),
    [livePreferences],
  );
  const liveTitleByCardId = React.useMemo(
    () =>
      new Map(
        livePreferences.flatMap((preference) =>
          preference.title
            ? [[preference.id, preference.title] as const]
            : [],
        ),
      ),
    [livePreferences],
  );
  const resolveLiveTitle = React.useCallback(
    (cardId: string, fallback: string) =>
      liveTitleByCardId.get(cardId) ?? fallback,
    [liveTitleByCardId],
  );
  const visibleLiveCardIds = React.useMemo(() => {
    const cardIds = new Set(liveCardIdsKey ? liveCardIdsKey.split("|") : []);
    const preferenceIds = new Set(
      livePreferences.map((preference) => preference.id),
    );
    const ordered = livePreferences
      .filter((preference) => preference.visible && cardIds.has(preference.id))
      .map((preference) => preference.id);
    const missing = Array.from(cardIds).filter(
      (id) => !preferenceIds.has(id),
    );

    return [...ordered, ...missing];
  }, [liveCardIdsKey, livePreferences]);

  const liveMetricByCardId = new Map<string, ReportMetric>([
    [
      "live_intraday_comparison",
      {
        description: completedHourCount
          ? `${formatNumber(
              currentHourPartialTotal,
            )} na hora em andamento · ${formatDelta(
              comparisonDelta,
            )} nas horas fechadas contra ${intradayComparisonSeriesLabel(
              operationalSettings.intradayComparison,
            ).toLowerCase()}`
          : "Atualização contínua; comparativo disponível após a primeira hora fechada",
        label: resolveLiveTitle(
          "live_intraday_comparison",
          "Hoje até agora",
        ),
        value: todayTotal,
      },
    ],
    [
      "live_target_progress",
      {
        description: averageBaseDescription(
          operationalSettings.monthComparison,
        ),
        label: resolveLiveTitle(
          "live_target_progress",
          "Hoje x média-base",
        ),
        value:
          targetProgress === null
            ? "Sem base"
            : `${Math.round(targetProgress * 100)}%`,
      },
    ],
    [
      "live_month_previous_comparison",
      {
        description: `${formatDelta(previousMonthDelta)} contra ${formatNumber(
          previousMonthComparableTotal,
        )} até o último dia fechado do mês anterior`,
        label: resolveLiveTitle(
          "live_month_previous_comparison",
          "Acumulado x mês anterior",
        ),
        value: currentMonthRealtimeTotal,
      },
    ],
    [
      "live_month_year_comparison",
      {
        description: `${formatDelta(lastYearMonthDelta)} contra ${formatNumber(
          lastYearMonthComparableTotal,
        )} até o último dia fechado do ano anterior`,
        label: resolveLiveTitle(
          "live_month_year_comparison",
          "Acumulado x ano anterior",
        ),
        value: currentMonthRealtimeTotal,
      },
    ],
  ]);

  const liveChartEntries: Array<
    readonly [string, ReportPayload["charts"][number]]
  > = [];
  if (selectedScope && hourlyDefinition) {
    liveChartEntries.push([
      LIVE_DAY_MINUTES_ID,
      buildMinuteDayReportChart({
        clock,
        companyTimeZone,
        definition: minuteDayDefinition,
        rows: minuteDayRows,
        scope: selectedScope,
        widgetColor: liveColorByCardId.get(LIVE_DAY_MINUTES_ID),
      }),
    ]);
    liveChartEntries.push([
      "live_chart_hour",
      buildOperationalHourlyReportChart({
        averageDescription: averageBaseDescription(
          operationalSettings.monthComparison,
        ),
        comparisonDefinition: operationalComparisonDefinition,
        comparisonLabel: intradayComparisonSeriesLabel(
          operationalSettings.intradayComparison,
        ),
        comparisonRows: comparisonHourRows,
        currentDefinition: hourlyDefinition,
        currentRows: hourRows,
        scope: selectedScope,
        targetDailyAverage: baselineDailyAverage,
        widgetColor: liveColorByCardId.get("live_chart_hour"),
      }),
    ]);
    liveChartEntries.push([
      "live_month_hour_heatmap",
      buildOperationalHeatmapReportChart({
        month: clock,
        points: operationalHeatmapPoints,
        scopeName: scenarioSelectionSummary(
          scenarios,
          operationalSettings.heatmapSelectionMode,
          operationalSettings.heatmapScenarioIds,
        ),
        widgetColor: liveColorByCardId.get("live_month_hour_heatmap"),
      }),
    ]);
    liveChartEntries.push([
      "live_operational_month_comparison",
      buildOperationalMonthReportChart({
        accumulated: false,
        month: clock,
        mode: operationalSettings.monthComparison,
        points: monthComparisonPoints,
        scopeName: selectedScope.name,
        widgetColor: liveColorByCardId.get(
          "live_operational_month_comparison",
        ),
      }),
    ]);
    liveChartEntries.push([
      "live_operational_month_cumulative",
      buildOperationalMonthReportChart({
        accumulated: true,
        month: clock,
        mode: operationalSettings.monthComparison,
        points: monthComparisonPoints,
        scopeName: selectedScope.name,
        widgetColor: liveColorByCardId.get(
          "live_operational_month_cumulative",
        ),
      }),
    ]);
    liveChartEntries.push([
      "live_moving_average_trend",
      buildOperationalTrendReportChart(
        operationalTrendPoints,
        selectedScope.name,
        clock,
        liveColorByCardId.get("live_moving_average_trend"),
      ),
    ]);
    if (liveAnnualComparisonModel) {
      const annualAssets = buildCountingIntelligenceReportAssets(
        liveAnnualComparisonModel,
        {
          [COUNTING_INTELLIGENCE_CARD_IDS.annualComparison]:
            liveColorByCardId.get("live_current_year_monthly"),
          [COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison]:
            liveColorByCardId.get("live_current_year_accumulated"),
        },
      );
      const monthly = annualAssets.charts.find(
        (entry) =>
          entry.cardId === COUNTING_INTELLIGENCE_CARD_IDS.annualComparison,
      );
      const accumulated = annualAssets.charts.find(
        (entry) =>
          entry.cardId ===
          COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison,
      );

      if (monthly) {
        liveChartEntries.push([
          "live_current_year_monthly",
          monthly.value,
        ]);
      }
      if (accumulated) {
        liveChartEntries.push([
          "live_current_year_accumulated",
          accumulated.value,
        ]);
      }
    }
  }
  liveChartEntries.push([
    "live_hourly_occupancy",
    buildHourlyOccupancyReportChart({
      entryScenarios: occupancyEntryScenarios,
      exitScenarios: occupancyExitScenarios,
      points: hourlyOccupancyPoints,
      startHour: operationalSettings.occupancyStartHour,
      widgetColor: liveColorByCardId.get("live_hourly_occupancy"),
    }),
  ]);
  liveChartEntries.push([
    "live_scenario_cumulative",
    buildScenarioCumulativeTotalsReportChart(
      cumulativeScenarioPoints,
      liveColorByCardId.get("live_scenario_cumulative"),
    ),
  ]);
  liveChartEntries.push([
    "live_month_access_ranking",
    buildMonthlyAccessRankingReportChart(
      monthlyAccessRankingPoints,
      liveColorByCardId.get("live_month_access_ranking"),
    ),
  ]);
  liveChartEntries.push([
    "live_scenario_rose",
    buildScenarioRoseReportChart(
      roseScenarioPoints,
      scenarioSelectionSummary(
        scenarios,
        operationalSettings.roseSelectionMode,
        operationalSettings.roseScenarioIds,
      ),
      liveColorByCardId.get("live_scenario_rose"),
      undefined,
      normalizeScenarioCompositionChartType(
        liveChartTypeByCardId.get("live_scenario_rose"),
      ),
    ),
  ]);
  liveChartEntries.push([
    "live_month_peak_days",
    buildPeakDaysRankingReportChart(
      peakDayPoints,
      scenarioSelectionSummary(
        scenarios,
        operationalSettings.peakDaySelectionMode,
        operationalSettings.peakDayScenarioIds,
      ),
      liveColorByCardId.get("live_month_peak_days"),
    ),
  ]);
  liveChartEntries.push(
    [
      "live_today_scenario_comparison",
      buildTodayComparisonReportChart(
        "Hoje por cenário",
        "Acumulado de hoje por cenário.",
        scenarioTodayComparisonPoints,
        liveColorByCardId.get("live_today_scenario_comparison"),
      ),
    ],
    [
      "live_today_location_comparison",
      buildTodayComparisonReportChart(
        "Hoje por local",
        "Acumulado de hoje por local.",
        locationTodayComparisonPoints,
        liveColorByCardId.get("live_today_location_comparison"),
      ),
    ],
    [
      "live_today_sub_location_comparison",
      buildTodayComparisonReportChart(
        "Hoje por sublocal",
        "Acumulado de hoje por sublocal.",
        subLocationTodayComparisonPoints,
        liveColorByCardId.get("live_today_sub_location_comparison"),
      ),
    ],
  );

  customWidgets
    .filter(
      (widget): widget is RealtimeScopeCustomWidget => widget.kind === "scope",
    )
    .forEach((widget) => {
      const scope = getScopeOptionsForMode(widget.scopeMode).find(
        (option) => option.id === widget.scopeId,
      );
      if (!scope) return;
      const definition = buildCustomWidgetDefinition(
        widget,
        chartDefinitions,
        scope,
      );
      const state = chartStateForGranularity(chartData, widget.granularity);
      const cardId = `live_custom_${widget.id}`;
      liveChartEntries.push([
        cardId,
        buildRealtimeScopeReportChart(
          definition,
          state?.rows ?? [],
          scope,
          liveColorByCardId.get(cardId),
        ),
      ]);
    });

  const customScenarioTableByCardId = new Map<string, ReportTable>();
  customWidgets
    .filter(
      (widget): widget is RealtimeScenarioCustomWidget =>
        widget.kind === "scenario_widget",
    )
    .forEach((widget) => {
      const cardId = `live_custom_${widget.id}`;
      const widgetColor = liveColorByCardId.get(cardId);
      const selectedScenarios = selectScenarios(
        scenarios,
        widget.selectionMode,
        widget.scenarioIds,
      );
      const monthStart = startOfMonth(clock);
      const monthEnd = addDays(startOfDay(clock), 1);
      const selectionLabel = scenarioSelectionSummary(
        scenarios,
        widget.selectionMode,
        widget.scenarioIds,
      );
      const rankingPoints = buildScenarioPeriodComparisonPoints(
        selectedScenarios,
        currentMonthDayRows,
        monthStart,
        monthEnd,
        currentMonthDayState?.granularity ?? "day",
      );

      if (widget.widgetType === "ranking") {
        liveChartEntries.push([
          cardId,
          renameReportChart(
            buildMonthlyAccessRankingReportChart(rankingPoints, widgetColor),
            widget.title,
          ),
        ]);
        return;
      }

      if (widget.widgetType === "rose") {
        liveChartEntries.push([
          cardId,
          buildScenarioRoseReportChart(
            rankingPoints,
            selectionLabel,
            widgetColor,
            widget.title,
            normalizeScenarioCompositionChartType(
              liveChartTypeByCardId.get(cardId),
            ),
          ),
        ]);
        return;
      }

      if (widget.widgetType === "peak_days") {
        const points = buildTopScenarioPeakDays({
          from: monthStart,
          rows: currentMonthDayRows,
          scenarios: selectedScenarios,
          sourceGranularity: currentMonthDayState?.granularity ?? "day",
          to: monthEnd,
        });
        liveChartEntries.push([
          cardId,
          renameReportChart(
            buildPeakDaysRankingReportChart(points, selectionLabel, widgetColor),
            widget.title,
          ),
        ]);
        return;
      }

      if (widget.widgetType === "heatmap") {
        const points = buildScenarioCivilHourMagnitudePoints({
          companyTimeZone,
          from: monthStart,
          rows: operationalMonthHourRows,
          scenarios: selectedScenarios,
          sourceGranularity: operationalMonthHourState?.granularity ?? "hour",
          to: endOfAggregateBucket(startOfHour(clock), "hour"),
        });
        liveChartEntries.push([
          cardId,
          renameReportChart(
            buildOperationalHeatmapReportChart({
              month: clock,
              points,
              scopeName: selectionLabel,
              widgetColor,
            }),
            widget.title,
          ),
        ]);
        return;
      }

      if (widget.widgetType === "cumulative") {
        const points = buildScenarioCumulativeTotals({
          from: startOfDay(clock),
          rows: hourRows,
          scenarios: selectedScenarios,
          sourceGranularity: chartData.live_chart_hour?.granularity ?? "hour",
          to: clock,
        });
        liveChartEntries.push([
          cardId,
          renameReportChart(
            buildScenarioCumulativeTotalsReportChart(points, widgetColor),
            widget.title,
          ),
        ]);
        return;
      }

      const today = buildScenarioCumulativeTotals({
        from: startOfDay(clock),
        rows: hourRows,
        scenarios: selectedScenarios,
        sourceGranularity: chartData.live_chart_hour?.granularity ?? "hour",
        to: clock,
      });
      const month = buildScenarioCumulativeTotals({
        from: monthStart,
        rows: currentMonthDayRows,
        scenarios: selectedScenarios,
        sourceGranularity: currentMonthDayState?.granularity ?? "day",
        to: monthEnd,
      });
      const table = buildScenarioTotalsReportTable(
        buildScenarioTotalsTableRows(today, month),
      );
      customScenarioTableByCardId.set(cardId, {
        ...table,
        title: widget.title,
      });
    });

  const configuredLiveChartEntries = liveChartEntries.map(
    ([cardId, chart]) =>
      [
        cardId,
        renameReportChart(
          {
            ...chart,
            option: applyChartTypePreference(
              chart.option,
              liveChartTypeByCardId.get(cardId),
            ),
          },
          resolveLiveTitle(cardId, chart.title),
        ),
      ] as const,
  );

  const liveTableByCardId = new Map<string, ReportTable>([
    [
      "live_scenario_totals_table",
      buildScenarioTotalsReportTable(scenarioTableRows),
    ],
    ...customScenarioTableByCardId.entries(),
  ]);

  function composeLiveReportPayload(
    charts: ReportPayload["charts"],
  ): ReportPayload {
    return {
      title: selectedScope
        ? `Ao Vivo - ${selectedScope.name}`
        : "Ao Vivo - Contagem",
      subtitle: "Leitura operacional atualizada a cada 5 segundos.",
      filename: `ipxdata-ao-vivo-${realtimeReportDateSlug(lastUpdated ?? clock)}`,
      generatedAt: lastUpdated ?? clock,
      dataCompleteUntil: lastUpdated ?? clock,
      context: [
        selectedScope
          ? `${scopeModeLabel(selectedScope.mode)}: ${selectedScope.name}`
          : "",
        `Comparação intradiária: ${intradayComparisonSeriesLabel(
          operationalSettings.intradayComparison,
        )}`,
        `Média-base: ${averageBaseDescription(
          operationalSettings.monthComparison,
        ).toLowerCase()}`,
        "Ordem, visibilidade e cores seguem a configuração individual dos widgets.",
      ].filter(Boolean),
      metrics: visibleLiveCardIds
        .map((id) => liveMetricByCardId.get(id))
        .filter((metric): metric is ReportMetric => Boolean(metric)),
      charts,
      tables: visibleLiveCardIds
        .map((id) => {
          const table = liveTableByCardId.get(id);
          return table
            ? {
                ...table,
                title: resolveLiveTitle(id, table.title),
              }
            : undefined;
        })
        .filter((table): table is ReportTable => Boolean(table)),
    };
  }

  async function buildConfiguredLiveReportPayload() {
    const chartByCardId = new Map(configuredLiveChartEntries);
    if (
      visibleLiveCardIds.includes(LIVE_DAY_MINUTES_ID) &&
      minuteDayState?.error
    ) {
      throw new Error(
        `O widget minuto a minuto não está certificado: ${minuteDayState.error}`,
      );
    }
    const visibleComparisonWidgets = customWidgets.filter(
      (widget) =>
        widget.kind === "scenario_comparison" &&
        visibleLiveCardIds.includes(`live_custom_${widget.id}`),
    );

    if (visibleComparisonWidgets.length && liveComparisonDisabledReason) {
      throw new Error(liveComparisonDisabledReason);
    }

    await Promise.all(
      visibleComparisonWidgets
        .map(async (widget) => {
          const cardId = `live_custom_${widget.id}`;
          try {
            const storageKey = realtimeScenarioComparisonStorageKey(widget.id);
            const settings = loadScenarioComparisonSettings(
              storageKey,
              companyScopeId,
              preferenceScope,
            );
            const definition = buildScenarioComparisonDefinition(
              settings,
              new Date(),
            );
            const rows = await fetchScenarioComparisonRows(
              definition,
              liveComparisonHourlySource,
              companyTimeZone,
              companyScopeId,
            );
            const reportChart = buildScenarioComparisonReportChart({
              definition,
              rows,
              scenarios,
              settings,
              title: resolveLiveTitle(cardId, widget.title),
              widgetColor: liveColorByCardId.get(cardId),
            });
            chartByCardId.set(cardId, {
              ...reportChart,
              option: applyChartTypePreference(
                reportChart.option,
                liveChartTypeByCardId.get(cardId),
              ),
            });
          } catch (error) {
            const detail =
              error instanceof Error
                ? error.message
                : "falha desconhecida na consulta";
            throw new Error(
              `Não foi possível certificar o comparativo "${widget.title}": ${detail}`,
            );
          }
        }),
    );

    return composeLiveReportPayload(
      visibleLiveCardIds
        .map((id) => chartByCardId.get(id))
        .filter((chart): chart is ReportPayload["charts"][number] =>
          Boolean(chart),
        ),
    );
  }

  const liveReportPayload = composeLiveReportPayload(
    liveCardIds
      .map((id) => new Map(configuredLiveChartEntries).get(id))
      .filter((chart): chart is ReportPayload["charts"][number] =>
        Boolean(chart),
      ),
  );

  return (
    <section
      id="ao-vivo"
      className={cn(
        "min-w-0 [&_[data-card-description]]:[overflow-wrap:anywhere] [&_[data-card-header]_h3]:[overflow-wrap:anywhere] [&_[data-card-header]_h3_svg]:shrink-0",
        monitorMode
          ? "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "scroll-mt-6 space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {liveDataCertificationError && !initialLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Consulta bloqueada: {liveDataCertificationError}
        </div>
      ) : null}
      {workerMetadataWarning && !initialLoading ? (
        <div
          aria-live="polite"
          className="rounded-md border border-amber-300/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 [overflow-wrap:anywhere] dark:text-amber-200"
          role="status"
        >
          {workerMetadataWarning}
        </div>
      ) : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Ao vivo
            </div>
            <div className="break-words text-lg font-semibold [overflow-wrap:anywhere]">
              {selectedScope?.name ?? "Visão selecionada"}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-primary/30 bg-primary/10 text-primary"
            >
              <Zap className="h-3.5 w-3.5" />
              5 segundos
            </Badge>
            <Badge variant="outline" className="gap-1 bg-card">
              <Route className="h-3.5 w-3.5" />
              {scopeModeLabel(scopeMode)}
            </Badge>
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="@container rounded-md border border-border bg-card px-3 py-2 shadow-soft">
        {loadingScenarios ? (
          <div className="grid w-full min-w-0 grid-cols-[80px_minmax(0,104px)_minmax(176px,1fr)] items-center gap-1 @sm:grid-cols-[80px_104px_minmax(176px,1fr)] @sm:gap-2 @md:grid-cols-[104px_144px_minmax(176px,1fr)] @lg:grid-cols-[112px_168px_minmax(176px,1fr)] @xl:grid-cols-[120px_200px_minmax(176px,1fr)] @2xl:grid-cols-[132px_220px_minmax(176px,1fr)]">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <div className="col-start-3 row-start-1 flex w-full min-w-0 items-center justify-end gap-2">
              <Skeleton className="hidden h-3.5 w-4 shrink-0 @lg:block @xl:w-12 @2xl:w-24" />
              <Skeleton className="h-8 w-[176px] shrink-0" />
            </div>
          </div>
        ) : scopeOptions.length ? (
          <div className="space-y-3">
            <div
              aria-label="Controles da visão ao vivo de Contagem"
              className="grid w-full min-w-0 grid-cols-[80px_minmax(0,104px)_minmax(176px,1fr)] items-center gap-1 @sm:grid-cols-[80px_104px_minmax(176px,1fr)] @sm:gap-2 @md:grid-cols-[104px_144px_minmax(176px,1fr)] @lg:grid-cols-[112px_168px_minmax(176px,1fr)] @xl:grid-cols-[120px_200px_minmax(176px,1fr)] @2xl:grid-cols-[132px_220px_minmax(176px,1fr)]"
              role="group"
            >
              <div className="min-w-0">
                <Select
                  value={scopeMode}
                  onValueChange={(value) => {
                    setScopeMode(value as RealtimeScopeMode);
                    setSelectedId("");
                  }}
                >
                  <SelectTrigger
                    aria-label="Tipo da visão de Contagem"
                    className="h-8 w-full min-w-0 bg-card"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModes.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger
                    aria-label={`${scopeModeLabel(scopeMode)} em foco`}
                    className="h-8 w-full min-w-0 bg-card"
                  >
                    <SelectValue placeholder="Selecione uma visão" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-start-3 row-start-1 flex w-full min-w-0 items-center justify-end gap-2">
                {lastUpdated ? (
                  <span
                    aria-label={`Última atualização às ${formatTime(lastUpdated)}`}
                    className="hidden min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] tabular-nums text-muted-foreground @lg:inline-flex"
                    title={`Última atualização às ${formatTime(lastUpdated)}`}
                  >
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden @xl:inline @2xl:hidden">
                      {formatTime(lastUpdated)}
                    </span>
                    <span className="hidden @2xl:inline">
                      Atualizado às {formatTime(lastUpdated)}
                    </span>
                  </span>
                ) : null}
                <div
                  aria-label="Ações da visão ao vivo de Contagem"
                  className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1"
                  role="group"
                >
                  <ReportExportActions
                    compact
                    disabled={
                      initialLoading ||
                      loadingAnnualHistory ||
                      !selectedScope ||
                      Boolean(liveDataCertificationError) ||
                      Boolean(liveAnnualComparisonError)
                    }
                    getPayload={buildConfiguredLiveReportPayload}
                    payload={liveReportPayload}
                  />
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
                  <Button
                    type="button"
                    variant={operationalSettingsOpen ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setOperationalSettingsOpen((current) => !current)
                    }
                    aria-label={
                      operationalSettingsOpen
                        ? "Ocultar bases de comparação"
                        : "Exibir bases de comparação"
                    }
                    aria-controls="counting-live-comparison-settings"
                    aria-expanded={operationalSettingsOpen}
                    title={
                      operationalSettingsOpen
                        ? "Ocultar bases de comparação"
                        : "Exibir bases de comparação"
                    }
                  >
                    <Target className="h-4 w-4" />
                  </Button>
                  <MonitorModeButton
                    compact
                    onClick={enterMonitorMode}
                    disabled={!scopeOptions.length}
                  />
                </div>
              </div>
            </div>
            {operationalSettingsOpen ? (
              <div
                id="counting-live-comparison-settings"
                aria-label="Bases de comparação da Contagem"
                className="grid gap-3 rounded-xl border bg-muted/15 p-3 md:grid-cols-2 md:items-end"
                role="group"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={intradayComparisonSelectId}>
                    Comparação intradiária
                  </Label>
                  <Select
                    value={operationalSettings.intradayComparison}
                    onValueChange={(value) =>
                      updateOperationalSettings({
                        intradayComparison:
                          value as LiveOperationalSettings["intradayComparison"],
                      })
                    }
                  >
                    <SelectTrigger id={intradayComparisonSelectId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yesterday">Ontem</SelectItem>
                      <SelectItem value="last_week">
                        Mesmo dia da semana anterior
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={monthComparisonSelectId}>
                    Base das médias e comparativos
                  </Label>
                  <Select
                    value={operationalSettings.monthComparison}
                    onValueChange={(value) =>
                      updateOperationalSettings({
                        monthComparison:
                          value as LiveOperationalSettings["monthComparison"],
                      })
                    }
                  >
                    <SelectTrigger id={monthComparisonSelectId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="previous_month">Mês anterior</SelectItem>
                      <SelectItem value="last_year">
                        Mesmo mês do ano anterior
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma visão disponível. Cadastre cenários, locations ou sub-locations
            com câmeras vinculadas.
          </div>
        )}
      </div>
      )}

      {scopeOptions.length &&
      (!liveDataCertificationError || initialLoading) ? (
        <CardLayout
          menuKey="live"
          monitorMode={monitorMode}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          preferenceScopeId={selectedScope?.id}
          reorderMode={layoutReorderMode}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
          viewScopeName={selectedScope?.name}
          viewScopes={scopeOptions.map((scope) => ({
            id: scope.id,
            name: scope.name,
          }))}
          editActions={
            <Button
              type="button"
              size="sm"
              onClick={openCustomWidgetDialog}
              disabled={!availableModes.length}
            >
              <Plus className="h-4 w-4" />
              Adicionar widget
            </Button>
          }
          cards={[
            ...liveLayoutCards,
          ]}
        />
      ) : null}

      {monitorMode ? null : (
      <Dialog
        open={customWidgetDialogOpen}
        onOpenChange={setCustomWidgetDialogOpen}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {customWidgetForm.id
                ? "Editar widget ao vivo"
                : "Novo widget ao vivo"}
            </DialogTitle>
            <DialogDescription>
              {customWidgetForm.id
                ? "Altere o título e qualquer configuração deste widget."
                : "Adicione uma visão individual ou uma comparação de cenários."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor={customKindSelectId}>Tipo de widget</Label>
              <Select
                value={customWidgetForm.kind}
                onValueChange={handleCustomWidgetKindChange}
              >
                <SelectTrigger id={customKindSelectId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scope">Visão individual</SelectItem>
                  <SelectItem value="scenario_widget">
                    Widget configurável por cenário
                  </SelectItem>
                  <SelectItem value="scenario_comparison">
                    Cenários por período
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-widget-title">Título</Label>
              <Input
                id="custom-widget-title"
                value={customWidgetForm.title}
                onChange={(event) =>
                  setCustomWidgetForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder={
                  customWidgetForm.kind === "scenario_comparison"
                    ? "Comparativo de entradas e saídas"
                    : customWidgetForm.kind === "scenario_widget"
                      ? "Ranking das entradas"
                    : "Entradas hora a hora"
                }
              />
            </div>

            {customWidgetForm.kind === "scope" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={customScopeModeSelectId}>
                      Tipo de visão
                    </Label>
                    <Select
                      value={customWidgetForm.scopeMode}
                      onValueChange={handleCustomWidgetModeChange}
                    >
                      <SelectTrigger id={customScopeModeSelectId}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={customScopeSelectId}>
                      {scopeModeLabel(customWidgetForm.scopeMode)}
                    </Label>
                    <Select
                      value={customWidgetForm.scopeId}
                      onValueChange={handleCustomWidgetScopeChange}
                      disabled={!customWidgetScopeOptions.length}
                    >
                      <SelectTrigger id={customScopeSelectId}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {customWidgetScopeOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={customGranularitySelectId}>Gráfico</Label>
                  <Select
                    value={customWidgetForm.granularity}
                    onValueChange={handleCustomWidgetGranularityChange}
                  >
                    <SelectTrigger id={customGranularitySelectId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOM_WIDGET_GRANULARITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : customWidgetForm.kind === "scenario_comparison" ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <ScenarioComparisonConfigurator
                  onChange={(patch) =>
                    setCustomWidgetForm((current) => ({
                      ...current,
                      comparisonSettings: {
                        ...current.comparisonSettings,
                        ...patch,
                      },
                    }))
                  }
                  scenarios={scenarios}
                  settings={customWidgetForm.comparisonSettings}
                />
              </div>
            ) : (
              <div className="space-y-4 rounded-md border bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label htmlFor={customModelSelectId}>Modelo</Label>
                  <Select
                    value={customWidgetForm.scenarioWidgetType}
                    onValueChange={handleScenarioWidgetTypeChange}
                  >
                    <SelectTrigger id={customModelSelectId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENARIO_WIDGET_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {
                      scenarioWidgetOption(customWidgetForm.scenarioWidgetType)
                        .description
                    }
                  </p>
                </div>
                <ScenarioPicker
                  mode={customWidgetForm.scenarioSelectionMode}
                  onModeChange={(scenarioSelectionMode) =>
                    setCustomWidgetForm((current) => ({
                      ...current,
                      scenarioSelectionMode,
                    }))
                  }
                  onSelectedIdsChange={(scenarioIds) =>
                    setCustomWidgetForm((current) => ({
                      ...current,
                      scenarioIds,
                    }))
                  }
                  scenarios={scenarios}
                  selectedIds={customWidgetForm.scenarioIds}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomWidgetDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={saveCustomWidget}
              disabled={
                (customWidgetForm.kind === "scope" && !customWidgetForm.scopeId) ||
                (customWidgetForm.kind === "scenario_comparison" &&
                  customWidgetForm.comparisonSettings.selectionMode === "custom" &&
                  !customWidgetForm.comparisonSettings.selectedScenarioIds.length) ||
                (customWidgetForm.kind === "scenario_widget" &&
                  customWidgetForm.scenarioSelectionMode === "custom" &&
                  !customWidgetForm.scenarioIds.length)
              }
            >
              {customWidgetForm.id ? "Salvar alterações" : "Adicionar widget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </section>
  );
}

function MetricCard({
  comparison,
  description,
  error,
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: {
  comparison?: string;
  description: string;
  error?: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  loading: boolean;
  tone: "primary" | "sky" | "indigo" | "slate";
  value: number | string;
}) {
  const widgetColorOverride = useWidgetColorOverride();
  const iconToneClass = {
    primary: "text-primary",
    sky: "text-sky-700 dark:text-sky-300",
    indigo: "text-indigo-700 dark:text-indigo-300",
    slate: "text-muted-foreground",
  }[tone];

  return (
    <Card className="@container h-full min-w-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <div className="flex min-w-0 items-start gap-1.5 break-words text-xs font-medium uppercase text-muted-foreground [overflow-wrap:anywhere]">
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", iconToneClass)}
              style={
                widgetColorOverride
                  ? { color: widgetColorOverride }
                  : undefined
              }
            />
            <WidgetTitleText fallback={label} />
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : error ? (
            <div className="mt-2 text-sm font-semibold text-destructive">
              Não certificado
            </div>
          ) : (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="max-w-full break-all text-[clamp(1.35rem,12cqi,1.875rem)] font-semibold leading-none tabular-nums">
                {typeof value === "number" ? formatNumber(value) : value}
              </div>
              {comparison ? (
                <div
                  className={cn(
                    "max-w-full break-all text-sm font-semibold tabular-nums",
                    metricComparisonClassName(comparison),
                  )}
                >
                  {comparison}
                </div>
              ) : null}
            </div>
          )}
          <div
            className="mt-auto line-clamp-2 break-words pt-1 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]"
            title={description}
          >
            {description}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function metricComparisonClassName(value: string) {
  const normalized = value.trim();
  if (normalized.startsWith("+")) {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (normalized.startsWith("-")) {
    return "text-rose-700 dark:text-rose-300";
  }
  return "text-muted-foreground";
}

function MinuteDayChartCard({
  clock,
  companyTimeZone,
  definition,
  loading,
  rows,
  scope,
  state,
}: {
  clock: Date;
  companyTimeZone: string;
  definition: RealtimeChartDefinition;
  loading: boolean;
  rows: AggregateEventRow[];
  scope: RealtimeScopeOption;
  state?: RealtimeChartState;
}) {
  const widgetColor = useWidgetColor();
  const points = React.useMemo(
    () => buildScopePoints(definition, rows, scope),
    [definition, rows, scope],
  );
  const slots = React.useMemo(
    () =>
      buildFixedMinuteDayAxis({
        day: clock,
        points,
        referenceTime: clock,
        timeZone: companyTimeZone,
      }),
    [clock, companyTimeZone, points],
  );
  const option = React.useMemo(
    () => buildMinuteDayChartOption(slots, widgetColor),
    [slots, widgetColor],
  );
  const currentSlot = slots.find((slot) => slot.status === "current");

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Activity className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={definition.label} />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {definition.description}
            </CardDescription>
          </div>
          <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit bg-primary/10 text-primary">
              {scope.name}
            </Badge>
            {currentSlot ? (
              <Badge variant="outline" className="w-fit bg-card">
                Em andamento · {currentSlot.label}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
        ) : (
          <div className="h-full min-h-0 w-full">
            <EChart
              ariaDescription="Fluxo certificado minuto a minuto do dia atual; minutos futuros permanecem vazios."
              ariaLabel="Fluxo minuto a minuto de hoje"
              className="h-full min-h-0"
              mergeUpdates
              option={option}
              valueLabels="none"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RealtimeChartCard({
  action,
  definition,
  loading,
  rows,
  scope,
  state,
  targetValue = 0,
}: {
  action?: React.ReactNode;
  definition: RealtimeChartDefinition;
  loading: boolean;
  rows: AggregateEventRow[];
  scope: RealtimeScopeOption;
  state?: RealtimeChartState;
  targetValue?: number;
}) {
  const widgetColor = useWidgetColor();
  const points = React.useMemo(
    () => buildScopePoints(definition, rows, scope),
    [definition, rows, scope],
  );
  const option = React.useMemo(
    () => buildChartOption(definition, points, widgetColor, targetValue),
    [definition, points, targetValue, widgetColor],
  );
  const hasData = points.some((point) => point.total !== 0);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={definition.label} />
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit bg-primary/10 text-primary">
              {scope.name}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
        ) : hasData ? (
          <div className="h-full min-h-0 w-full">
            <EChart option={option} />
          </div>
        ) : (
          <EmptyChartState text="Sem eventos ao vivo nesta visão." />
        )}
      </CardContent>
    </Card>
  );
}

function OperationalHourlyChartCard({
  averageDescription,
  comparisonDefinition,
  comparisonLabel,
  comparisonRows,
  currentDefinition,
  currentRows,
  targetDailyAverage,
  loading,
  scope,
  state,
}: {
  averageDescription: string;
  comparisonDefinition: RealtimeChartDefinition;
  comparisonLabel: string;
  comparisonRows: AggregateEventRow[];
  currentDefinition: RealtimeChartDefinition;
  currentRows: AggregateEventRow[];
  targetDailyAverage: number;
  loading: boolean;
  scope: RealtimeScopeOption;
  state?: RealtimeChartState;
}) {
  const widgetColor = useWidgetColor();
  const currentPoints = React.useMemo(
    () => buildScopePoints(currentDefinition, currentRows, scope),
    [currentDefinition, currentRows, scope],
  );
  const comparisonPoints = React.useMemo(
    () => buildScopePoints(comparisonDefinition, comparisonRows, scope),
    [comparisonDefinition, comparisonRows, scope],
  );
  const option = React.useMemo(
    () =>
      buildOperationalHourlyChartOption({
        averageDescription,
        comparisonLabel,
        comparisonPoints,
        currentPoints,
        targetPerHour: targetDailyAverage > 0 ? targetDailyAverage / 24 : 0,
        widgetColor,
      }),
    [
      averageDescription,
      comparisonLabel,
      comparisonPoints,
      currentPoints,
      targetDailyAverage,
      widgetColor,
    ],
  );
  const hasData = [...currentPoints, ...comparisonPoints].some(
    (point) => point.total !== 0,
  );

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 gap-2 @sm:grid-cols-[minmax(0,1fr)_auto] @sm:items-start">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback="Hora a Hora" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              Base histórica à esquerda e hoje à direita. Linha tracejada: {averageDescription.toLowerCase()} convertida em média horária.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="max-w-full whitespace-normal break-words bg-primary/10 text-left leading-5 text-primary [overflow-wrap:anywhere] @sm:justify-self-end"
          >
            {scope.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
        ) : hasData ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-full min-h-0"
            text="Sem eventos para a comparação horária."
          />
        )}
      </CardContent>
    </Card>
  );
}

function CustomScenarioWidgetCard({
  canConfigure,
  clock,
  companyTimeZone,
  currentMonthDayGranularity,
  currentMonthDayRows,
  error,
  hourGranularity,
  hourRows,
  loading,
  monitorMode,
  monthHourGranularity,
  monthHourRows,
  onEdit,
  onChange,
  onRemove,
  scenarios,
  widget,
}: {
  canConfigure: boolean;
  clock: Date;
  companyTimeZone: string;
  currentMonthDayGranularity: AggregateGranularity;
  currentMonthDayRows: AggregateEventRow[];
  error?: string;
  hourGranularity: AggregateGranularity;
  hourRows: AggregateEventRow[];
  loading: boolean;
  monitorMode: boolean;
  monthHourGranularity: AggregateGranularity;
  monthHourRows: AggregateEventRow[];
  onEdit: () => void;
  onChange: (patch: CustomScenarioWidgetPatch) => void;
  onRemove: () => void;
  scenarios: Scenario[];
  widget: RealtimeScenarioCustomWidget;
}) {
  const selectedScenarios = React.useMemo(
    () => selectScenarios(scenarios, widget.selectionMode, widget.scenarioIds),
    [scenarios, widget.scenarioIds, widget.selectionMode],
  );
  const selectionLabel = scenarioSelectionSummary(
    scenarios,
    widget.selectionMode,
    widget.scenarioIds,
  );
  const action =
    monitorMode || !canConfigure ? null : (
      <CustomWidgetActions
        onEdit={onEdit}
        onRemove={onRemove}
        title={widget.title}
      />
    );
  const selectionProps = {
    canConfigure,
    monitorMode,
    onSelectedIdsChange: (scenarioIds: string[]) => onChange({ scenarioIds }),
    onSelectionModeChange: (selectionMode: "all" | "custom") =>
      onChange({ selectionMode }),
    scenarios,
    selectedIds: widget.scenarioIds,
    selectionMode: widget.selectionMode,
  };
  const monthStart = startOfMonth(clock);
  const monthEnd = addDays(startOfDay(clock), 1);
  const rankingPoints = React.useMemo(
    () =>
      buildScenarioPeriodComparisonPoints(
        selectedScenarios,
        currentMonthDayRows,
        monthStart,
        monthEnd,
        currentMonthDayGranularity,
      ),
    [
      currentMonthDayGranularity,
      currentMonthDayRows,
      monthEnd,
      monthStart,
      selectedScenarios,
    ],
  );
  const peakPoints = React.useMemo(
    () =>
      buildTopScenarioPeakDays({
        from: monthStart,
        rows: currentMonthDayRows,
        scenarios: selectedScenarios,
        sourceGranularity: currentMonthDayGranularity,
        to: monthEnd,
      }),
    [
      currentMonthDayGranularity,
      currentMonthDayRows,
      monthEnd,
      monthStart,
      selectedScenarios,
    ],
  );
  const heatmapPoints = React.useMemo(
    () =>
      buildScenarioCivilHourMagnitudePoints({
        companyTimeZone,
        from: monthStart,
        rows: monthHourRows,
        scenarios: selectedScenarios,
        sourceGranularity: monthHourGranularity,
        to: endOfAggregateBucket(startOfHour(clock), "hour"),
      }),
    [
      clock,
      companyTimeZone,
      monthHourGranularity,
      monthHourRows,
      monthStart,
      selectedScenarios,
    ],
  );
  const cumulativePoints = React.useMemo(
    () =>
      buildScenarioCumulativeTotals({
        from: startOfDay(clock),
        rows: hourRows,
        scenarios: selectedScenarios,
        sourceGranularity: hourGranularity,
        to: clock,
      }),
    [clock, hourGranularity, hourRows, selectedScenarios],
  );
  const tableRows = React.useMemo(() => {
    const today = buildScenarioCumulativeTotals({
      from: startOfDay(clock),
      rows: hourRows,
      scenarios: selectedScenarios,
      sourceGranularity: hourGranularity,
      to: clock,
    });
    const month = buildScenarioCumulativeTotals({
      from: monthStart,
      rows: currentMonthDayRows,
      scenarios: selectedScenarios,
      sourceGranularity: currentMonthDayGranularity,
      to: monthEnd,
    });
    return buildScenarioTotalsTableRows(today, month);
  }, [
    clock,
    currentMonthDayGranularity,
    currentMonthDayRows,
    hourGranularity,
    hourRows,
    monthEnd,
    monthStart,
    selectedScenarios,
  ]);

  if (widget.widgetType === "heatmap") {
    return (
      <OperationalHeatmapCard
        {...selectionProps}
        action={action}
        error={error}
        loading={loading}
        month={clock}
        points={heatmapPoints}
        selectionLabel={selectionLabel}
        title={widget.title}
      />
    );
  }

  if (widget.widgetType === "peak_days") {
    return (
      <PeakDaysRankingCard
        {...selectionProps}
        action={action}
        loading={loading}
        points={peakPoints}
        title={widget.title}
      />
    );
  }

  if (widget.widgetType === "cumulative") {
    return (
      <ScenarioCumulativeTotalsCard
        {...selectionProps}
        action={action}
        loading={loading}
        points={cumulativePoints}
        title={widget.title}
      />
    );
  }

  if (widget.widgetType === "totals_table") {
    return (
      <ScenarioTotalsTableCard
        {...selectionProps}
        action={action}
        loading={loading}
        rows={tableRows}
        title={widget.title}
      />
    );
  }

  if (widget.widgetType === "rose") {
    return (
      <ScenarioRoseCard
        {...selectionProps}
        action={action}
        loading={loading}
        points={rankingPoints}
        title={widget.title}
      />
    );
  }

  return (
    <MonthlyAccessRankingCard
      {...selectionProps}
      action={action}
      loading={loading}
      points={rankingPoints}
      title={widget.title}
    />
  );
}

function CustomWidgetActions({
  onEdit,
  onRemove,
  title,
}: {
  onEdit: () => void;
  onRemove: () => void;
  title: string;
}) {
  return (
    <WidgetCardActions label={`Ações do widget ${title}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        aria-label={`Editar widget ${title}`}
        title="Editar widget"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remover widget ${title}`}
        title="Remover widget"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </WidgetCardActions>
  );
}

function OperationalHeatmapCard({
  action,
  canConfigure,
  error,
  loading,
  month,
  monitorMode,
  onSelectedIdsChange,
  onSelectionModeChange,
  points,
  scenarios,
  selectedIds,
  selectionLabel,
  selectionMode,
  title = "Mapa de calor dia x hora",
}: {
  action?: React.ReactNode;
  canConfigure: boolean;
  error?: string;
  loading: boolean;
  month: Date;
  monitorMode: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  points: OperationalHeatmapPoint[];
  scenarios: Scenario[];
  selectedIds: string[];
  selectionLabel: string;
  selectionMode: "all" | "custom";
  title?: string;
}) {
  const widgetColor = useWidgetColor();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const option = React.useMemo(
    () => buildOperationalHeatmapOption(points, month, widgetColor),
    [month, points, widgetColor],
  );
  const hasData = points.some((point) => point.total > 0);
  const hasSelection =
    selectionMode === "all" ||
    scenarios.some((scenario) => selectedIds.includes(scenario.id));

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Grid3X3 className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1">
              Intensidade do fluxo nas 24 faixas horárias e nos dias 1 a 31
              do mês atual; fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere]"
            >
              {selectionLabel}
            </Badge>
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar cenários do mapa de calor"
                title="Configurar cenários"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <ScenarioPicker
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            onSelectedIdsChange={onSelectedIdsChange}
            scenarios={scenarios}
            selectedIds={selectedIds}
          />
        ) : null}
        {!hasSelection ? (
          <EmptyChartState
            className="h-[260px]"
            text="Selecione ao menos um cenário para montar o mapa de calor."
          />
        ) : loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : error ? (
          <EmptyChartState className="h-[260px]" text={error} />
        ) : hasData ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-[260px]"
            text="Sem eventos horários no mês atual para esta visão."
          />
        )}
      </CardContent>
    </Card>
  );
}

function HourlyOccupancyCard({
  canConfigure,
  entryScenarioIds,
  entryScenarios,
  error,
  exitScenarioIds,
  exitScenarios,
  loading,
  monitorMode,
  onEntryScenarioIdsChange,
  onExitScenarioIdsChange,
  onSelectionModeChange,
  onStartHourChange,
  points,
  scenarios,
  selectionMode,
  startHour,
}: {
  canConfigure: boolean;
  entryScenarioIds: string[];
  entryScenarios: Scenario[];
  error?: string;
  exitScenarioIds: string[];
  exitScenarios: Scenario[];
  loading: boolean;
  monitorMode: boolean;
  onEntryScenarioIdsChange: (ids: string[]) => void;
  onExitScenarioIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "auto" | "custom") => void;
  onStartHourChange: (hour: number) => void;
  points: ScenarioHourlyOccupancyPoint[];
  scenarios: Scenario[];
  selectionMode: "auto" | "custom";
  startHour: number;
}) {
  const widgetColor = useWidgetColor();
  const startHourSelectId = React.useId();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const option = React.useMemo(
    () => buildHourlyOccupancyOption(points, widgetColor),
    [points, widgetColor],
  );
  const latestPoint = [...points]
    .reverse()
    .find((point) => point.occupancy !== null);
  const hasSelection = entryScenarios.length + exitScenarios.length > 0;
  const hasData = points.some((point) => point.occupancy !== null);

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <DoorOpen className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback="Ocupação hora a hora" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              Saldo acumulado diariamente a partir de
              {` ${formatOccupancyStartHour(startHour)}`}: entradas menos saídas.
              Antes desse horário, o saldo permanece zerado.
            </CardDescription>
          </div>
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">
              E {entryScenarios.length} · S {exitScenarios.length}
            </Badge>
            <Badge variant="outline">
              Início {formatOccupancyStartHour(startHour)}
            </Badge>
            {latestPoint && latestPoint.occupancy !== null ? (
              <>
                <Badge variant="outline" className="tabular-nums">
                  Entradas {formatNumber(latestPoint.entries)}
                </Badge>
                <Badge variant="outline" className="tabular-nums">
                  Saídas {formatNumber(latestPoint.exits)}
                </Badge>
                <Badge variant="secondary" className="tabular-nums">
                  Saldo {formatNumber(latestPoint.occupancy)}
                </Badge>
              </>
            ) : null}
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen(true)}
                aria-label="Configurar ocupação"
                title="Configurar ocupação"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        data-echart-layout="natural"
      >
        {!hasSelection ? (
          <EmptyChartState
            className="h-[220px]"
            text="Configure ao menos um cenário de entrada ou de saída."
          />
        ) : loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : error ? (
          <EmptyChartState className="h-[220px]" text={error} />
        ) : hasData ? (
          <EChart option={option} className="h-full min-h-0 flex-1" />
        ) : (
          <EmptyChartState
            className="h-[220px]"
            text="As linhas dos cenários selecionados não possuem eventos horários no dia atual."
          />
        )}
      </CardContent>
      <Dialog open={settingsOpen && !monitorMode} onOpenChange={setSettingsOpen}>
        <DialogContent className="@container grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configurar ocupação hora a hora</DialogTitle>
            <DialogDescription>
              Defina a associação direcional e o início da contagem sem reduzir a
              área útil do gráfico.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-3 rounded-md border bg-muted/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    Associação direcional
                  </div>
                  <div className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                    {selectionMode === "auto"
                      ? "Detectada pelos nomes e linhas"
                      : "Seleção manual por cenário"}
                  </div>
                </div>
                <div
                  aria-label="Modo de associação direcional"
                  className="grid w-full grid-cols-2 gap-2 @sm:w-[240px]"
                  role="group"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={selectionMode === "auto" ? "default" : "outline"}
                    onClick={() => onSelectionModeChange("auto")}
                  >
                    Automático
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={selectionMode === "custom" ? "default" : "outline"}
                    onClick={() => onSelectionModeChange("custom")}
                  >
                    Manual
                  </Button>
                </div>
              </div>
              <div className="w-full space-y-1.5 @sm:max-w-[220px]">
                <Label htmlFor={startHourSelectId}>Início da contagem</Label>
                <Select
                  value={String(startHour)}
                  onValueChange={(value) => onStartHourChange(Number(value))}
                >
                  <SelectTrigger id={startHourSelectId}>
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
              {selectionMode === "custom" ? (
                <div className="grid min-w-0 gap-3 @xl:grid-cols-2">
                  <ScenarioPicker
                    allowAll={false}
                    label="Cenários de entrada"
                    mode="custom"
                    onModeChange={() => undefined}
                    onSelectedIdsChange={onEntryScenarioIdsChange}
                    scenarios={scenarios}
                    selectedIds={entryScenarioIds}
                  />
                  <ScenarioPicker
                    allowAll={false}
                    label="Cenários de saída"
                    mode="custom"
                    onModeChange={() => undefined}
                    onSelectedIdsChange={onExitScenarioIdsChange}
                    scenarios={scenarios}
                    selectedIds={exitScenarioIds}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setSettingsOpen(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ScenarioCumulativeTotalsCard({
  action,
  canConfigure,
  loading,
  monitorMode,
  onSelectedIdsChange,
  onSelectionModeChange,
  points,
  scenarios,
  selectedIds,
  selectionMode,
  title = "Acumulado por cenário",
}: {
  action?: React.ReactNode;
  canConfigure: boolean;
  loading: boolean;
  monitorMode: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  points: ScenarioCumulativeTotalPoint[];
  scenarios: Scenario[];
  selectedIds: string[];
  selectionMode: "all" | "custom";
  title?: string;
}) {
  const widgetColor = useWidgetColor();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const orderedPoints = React.useMemo(
    () =>
      [...points].sort(
        (left, right) =>
          right.total - left.total ||
          left.name.localeCompare(right.name, "pt-BR"),
      ),
    [points],
  );
  const option = React.useMemo(
    () =>
      buildScenarioCumulativeTotalsOption(
        orderedPoints,
        widgetColor,
        "Acumulado de hoje",
      ),
    [orderedPoints, widgetColor],
  );
  const total = orderedPoints.reduce((sum, point) => sum + point.total, 0);
  const selectedScenarioCount = selectScenarios(
    scenarios,
    selectionMode,
    selectedIds,
  ).length;

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Sigma className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1">
              Total combinado e acumulado individual de hoje. A hora atual é
              parcial e atualiza a cada 5 segundos.
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">
              {scenarioSelectionSummary(scenarios, selectionMode, selectedIds)}
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              Total {formatNumber(total)}
            </Badge>
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar cenários do acumulado"
                title="Configurar cenários"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <ScenarioPicker
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            onSelectedIdsChange={onSelectedIdsChange}
            scenarios={scenarios}
            selectedIds={selectedIds}
          />
        ) : null}
        {!selectedScenarioCount ? (
          <EmptyChartState
            className="h-[220px]"
            text="Selecione ao menos um cenário para calcular o acumulado."
          />
        ) : loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : orderedPoints.some((point) => point.total > 0) ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-[220px]"
            text="As linhas dos cenários selecionados não possuem eventos horários no dia atual."
          />
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioTotalsTableCard({
  action,
  canConfigure,
  loading,
  monitorMode,
  onSelectedIdsChange,
  onSelectionModeChange,
  rows,
  scenarios,
  selectedIds,
  selectionMode,
  title = "Tabela acumulada por cenário",
}: {
  action?: React.ReactNode;
  canConfigure: boolean;
  loading: boolean;
  monitorMode: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  rows: ScenarioTotalsTableRow[];
  scenarios: Scenario[];
  selectedIds: string[];
  selectionMode: "all" | "custom";
  title?: string;
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const totalToday = rows.reduce((sum, row) => sum + row.today, 0);
  const totalMonth = rows.reduce((sum, row) => sum + row.month, 0);
  const selectedScenarioCount = selectScenarios(
    scenarios,
    selectionMode,
    selectedIds,
  ).length;

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Table2 className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1">
              Totais de hoje e do mês atual, linha por linha, incluindo os
              períodos parciais.
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">
              {scenarioSelectionSummary(scenarios, selectionMode, selectedIds)}
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              Hoje {formatNumber(totalToday)}
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              Mês {formatNumber(totalMonth)}
            </Badge>
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar cenários da tabela acumulada"
                title="Configurar cenários"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <ScenarioPicker
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            onSelectedIdsChange={onSelectedIdsChange}
            scenarios={scenarios}
            selectedIds={selectedIds}
          />
        ) : null}
        {!selectedScenarioCount ? (
          <EmptyChartState
            className="h-[180px]"
            text="Selecione ao menos um cenário para montar a tabela."
          />
        ) : loading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <div className="max-h-[440px] overflow-auto rounded-md border sm:max-h-[460px]">
            <Table
              className="min-w-[640px]"
              scrollRegionLabel="Resultados por cenário; role horizontalmente para ver todas as colunas"
            >
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Cenário</TableHead>
                  <TableHead className="text-right">Hoje</TableHead>
                  <TableHead className="text-right">Mês atual</TableHead>
                  <TableHead className="text-right">% do mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-[12rem] max-w-[360px] font-medium">
                      <span
                        className="block break-words [overflow-wrap:anywhere]"
                        title={row.name}
                      >
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.today)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNumber(row.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {new Intl.NumberFormat("pt-BR", {
                        maximumFractionDigits: 1,
                        style: "percent",
                      }).format(row.share)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiveAnnualComparisonCard({
  accumulated,
  error,
  loading,
  model,
  refreshing,
  scopeName,
}: {
  accumulated: boolean;
  error?: string;
  loading: boolean;
  model: CountingIntelligenceModel | null;
  refreshing: boolean;
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () =>
      model
        ? accumulated
          ? buildAnnualAccumulatedComparisonChartOption(model, widgetColor)
          : buildAnnualComparisonChartOption(model, widgetColor)
        : {},
    [accumulated, model, widgetColor],
  );
  const currentYearRow = model?.yearRows.find(
    (row) => row.year === model.currentYear,
  );
  const insightLabel = accumulated ? "Ano atual" : "Mês atual";
  const insightValue = accumulated
    ? currentYearRow?.total ?? 0
    : model?.currentMonthValue ?? 0;
  const hasData =
    model?.yearRows.some((row) =>
      row.months.some((value) => value !== null && value !== 0),
    ) ?? false;
  const title = accumulated
    ? "Comparativo acumulado por ano"
    : "Comparativo mensal por ano";
  const periodLabel = model
    ? formatCountingIntelligencePeriod(model)
    : "Histórico anual";

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              {accumulated ? (
                <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              )}
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {accumulated
                ? "Soma progressiva mês a mês para comparar a trajetória acumulada de cada ano e identificar avanço ou atraso."
                : `Anos lado a lado. Linha tracejada: média mensal de ${
                    (model?.currentYear ?? new Date().getFullYear()) - 1
                  } como média-base; percentuais mostram a variação entre os anos comparáveis.`}
            </CardDescription>
          </div>
        </div>
        <div className="min-w-0 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere]"
              title={scopeName}
            >
              {scopeName}
            </Badge>
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere]"
              title={periodLabel}
            >
              {periodLabel}
            </Badge>
            {model ? (
              <Badge
                variant="secondary"
                className="max-w-full gap-1 bg-primary/10 tabular-nums text-primary"
                title={`${insightLabel}: ${formatNumber(insightValue)}`}
              >
                <span className="font-normal opacity-75">{insightLabel}</span>
                <span className="max-w-full break-all font-semibold">
                  {formatNumber(insightValue)}
                </span>
              </Badge>
            ) : null}
            {refreshing ? (
              <Badge variant="secondary">Atualizando histórico…</Badge>
            ) : null}
            {currentYearRow?.ytdYoy !== null &&
            currentYearRow?.ytdYoy !== undefined ? (
              <Badge variant="outline" className="tabular-nums">
                vs {model?.currentYear ? model.currentYear - 1 : "-"}{" "}
                {formatDelta(currentYearRow.ytdYoy)}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3 pb-3 pt-2">
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : error ? (
          <EmptyChartState className="h-full min-h-0" text={error} />
        ) : hasData ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-full min-h-0"
            text="Sem valores mensais no histórico desta visão."
          />
        )}
      </CardContent>
    </Card>
  );
}

function OperationalMonthComparisonCard({
  loading,
  month,
  mode,
  points,
  scopeName,
}: {
  loading: boolean;
  month: Date;
  mode: LiveOperationalSettings["monthComparison"];
  points: OperationalMonthComparisonPoint[];
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildOperationalMonthComparisonOption(points, mode, month, widgetColor),
    [mode, month, points, widgetColor],
  );
  const hasData = points.some(
    (point) => (point.current ?? 0) !== 0 || (point.baseline ?? 0) !== 0,
  );

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 gap-2 @sm:grid-cols-[minmax(0,1fr)_auto] @sm:items-start">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback="Dias x meses" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {monthComparisonLabel(mode)} à esquerda e mês atual à direita. Linha tracejada: {averageBaseDescription(mode).toLowerCase()}. Fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="max-w-full whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere] @sm:justify-self-end"
          >
            {scopeName}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[310px] w-full" />
        ) : hasData ? (
          <EChart option={option} className="h-[310px]" />
        ) : (
          <EmptyChartState
            className="h-[200px]"
            text="Sem dados diários para o comparativo mensal."
          />
        )}
      </CardContent>
    </Card>
  );
}

function OperationalMonthCumulativeCard({
  loading,
  month,
  mode,
  points,
  scopeName,
}: {
  loading: boolean;
  month: Date;
  mode: LiveOperationalSettings["monthComparison"];
  points: OperationalMonthComparisonPoint[];
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildOperationalMonthCumulativeOption(points, mode, month, widgetColor),
    [mode, month, points, widgetColor],
  );
  const hasData = points.some(
    (point) => (point.current ?? 0) !== 0 || (point.baseline ?? 0) !== 0,
  );

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 gap-2 @sm:grid-cols-[minmax(0,1fr)_auto] @sm:items-start">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback="Acumulado diário x mês-base" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              Evolução acumulada nos mesmos dias: {monthComparisonLabel(mode).toLowerCase()} à esquerda e mês atual à direita. Fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="max-w-full whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere] @sm:justify-self-end"
          >
            {scopeName}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[310px] w-full" />
        ) : hasData ? (
          <EChart option={option} className="h-[310px]" />
        ) : (
          <EmptyChartState
            className="h-[200px]"
            text="Sem dados acumulados para o comparativo mensal."
          />
        )}
      </CardContent>
    </Card>
  );
}

function OperationalTrendCard({
  error,
  loading,
  month,
  points,
  scopeName,
}: {
  error?: string;
  loading: boolean;
  month: Date;
  points: OperationalTrendPoint[];
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const trend7 = movingAverageTrend(points, "average7");
  const trend30 = movingAverageTrend(points, "average30");
  const option = React.useMemo(
    () =>
      buildOperationalTrendOption(
        points,
        trend7.direction,
        trend30.direction,
        month,
        widgetColor,
      ),
    [month, points, trend30.direction, trend7.direction, widgetColor],
  );
  const hasData = points.some((point) => point.average7 !== null);

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 gap-2 @sm:grid-cols-[minmax(0,1fr)_auto] @sm:items-start">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback="Tendência 7 x 30 dias" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              Dia atual parcial incluído e atualizado a cada 5 segundos. Eixo de 1 a 31; fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 @sm:justify-end">
            <TrendBadge label="MM7" trend={trend7} />
            <TrendBadge label="MM30" trend={trend30} />
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere]"
            >
              {scopeName}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : error ? (
          <EmptyChartState
            className="h-[200px]"
            text="Não foi possível certificar a base horária da tendência."
          />
        ) : hasData ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-[200px]"
            text="São necessários ao menos 7 dias com dados para calcular a tendência."
          />
        )}
      </CardContent>
    </Card>
  );
}

function TrendBadge({
  label,
  trend,
}: {
  label: string;
  trend: ReturnType<typeof movingAverageTrend>;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular-nums",
        trend.direction > 0 &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        trend.direction < 0 &&
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      {label} {formatMovingAverageTrend(trend)}
    </Badge>
  );
}

function ScenarioRoseCard({
  action,
  canConfigure,
  loading,
  monitorMode,
  onSelectedIdsChange,
  onSelectionModeChange,
  points,
  scenarios,
  selectedIds,
  selectionMode,
  title = "Composição por cenário",
}: {
  action?: React.ReactNode;
  canConfigure: boolean;
  loading: boolean;
  monitorMode: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  points: ScenarioComparisonPoint[];
  scenarios: Scenario[];
  selectedIds: string[];
  selectionMode: "all" | "custom";
  title?: string;
}) {
  const widgetColor = useWidgetColor();
  const chartType = normalizeScenarioCompositionChartType(
    useWidgetChartType(),
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const visiblePoints = React.useMemo(
    () =>
      [...points]
        .filter((point) => point.total > 0)
        .sort(
          (left, right) =>
            right.total - left.total || left.name.localeCompare(right.name, "pt-BR"),
        ),
    [points],
  );
  const option = React.useMemo(
    () => buildScenarioRoseOption(visiblePoints, widgetColor, chartType),
    [chartType, visiblePoints, widgetColor],
  );
  const total = visiblePoints.reduce((sum, point) => sum + point.total, 0);
  const selectedScenarioCount = selectScenarios(
    scenarios,
    selectionMode,
    selectedIds,
  ).length;

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <ChartPie className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1">
              {scenarioCompositionDescription(chartType)}
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">
              {scenarioSelectionSummary(scenarios, selectionMode, selectedIds)}
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              Total {formatNumber(total)}
            </Badge>
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar cenários da composição"
                title="Configurar cenários"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <ScenarioPicker
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            onSelectedIdsChange={onSelectedIdsChange}
            scenarios={scenarios}
            selectedIds={selectedIds}
          />
        ) : null}
        {!selectedScenarioCount ? (
          <EmptyChartState
            className="h-[220px]"
            text="Selecione ao menos um cenário para montar a composição."
          />
        ) : loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : visiblePoints.length ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-[220px]"
            text="Sem fluxo mensal para os cenários selecionados."
          />
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyAccessRankingCard({
  action,
  canConfigure,
  loading,
  monitorMode,
  onSelectedIdsChange,
  onSelectionModeChange,
  points,
  scenarios,
  selectedIds,
  selectionMode,
  title = "Ranking dos acessos do mês",
}: {
  action?: React.ReactNode;
  canConfigure: boolean;
  loading: boolean;
  monitorMode: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  points: ScenarioComparisonPoint[];
  scenarios: Scenario[];
  selectedIds: string[];
  selectionMode: "all" | "custom";
  title?: string;
}) {
  const widgetColor = useWidgetColor();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const rankedPoints = React.useMemo(
    () => points.filter((point) => point.total > 0),
    [points],
  );
  const option = React.useMemo(
    () => buildMonthlyAccessRankingOption(rankedPoints, widgetColor),
    [rankedPoints, widgetColor],
  );
  const selectedScenarioCount = selectScenarios(
    scenarios,
    selectionMode,
    selectedIds,
  ).length;

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1">
              Volume e representatividade de cada cenário no mês em andamento.
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">
              {scenarioSelectionSummary(scenarios, selectionMode, selectedIds)}
            </Badge>
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar cenários do ranking"
                title="Configurar cenários"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <ScenarioPicker
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            onSelectedIdsChange={onSelectedIdsChange}
            scenarios={scenarios}
            selectedIds={selectedIds}
          />
        ) : null}
        {!selectedScenarioCount ? (
          <EmptyChartState
            className="h-[200px]"
            text="Selecione ao menos um cenário para montar o ranking."
          />
        ) : loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : rankedPoints.length ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-[200px]"
            text="Sem fluxo mensal para classificar os acessos."
          />
        )}
      </CardContent>
    </Card>
  );
}

function PeakDaysRankingCard({
  action,
  canConfigure,
  loading,
  monitorMode,
  onSelectedIdsChange,
  onSelectionModeChange,
  points,
  scenarios,
  selectedIds,
  selectionMode,
  title = "Top 5 dias de pico do mês",
}: {
  action?: React.ReactNode;
  canConfigure: boolean;
  loading: boolean;
  monitorMode: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  points: ScenarioPeakDayPoint[];
  scenarios: Scenario[];
  selectedIds: string[];
  selectionMode: "all" | "custom";
  title?: string;
}) {
  const widgetColor = useWidgetColor();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const option = React.useMemo(
    () => buildPeakDaysRankingOption(points, widgetColor),
    [points, widgetColor],
  );
  const selectedScenarioCount = selectScenarios(
    scenarios,
    selectionMode,
    selectedIds,
  ).length;

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Trophy className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1">
              Dias com maior volume acumulado nos cenários escolhidos; o dia
              atual é parcial e acompanha a atualização ao vivo.
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">
              {scenarioSelectionSummary(scenarios, selectionMode, selectedIds)}
            </Badge>
            {points[0] ? (
              <Badge variant="secondary" className="tabular-nums">
                1º {points[0].label} · {formatNumber(points[0].total)}
              </Badge>
            ) : null}
            {canConfigure && !monitorMode ? (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar cenários do Top 5"
                title="Configurar cenários"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <ScenarioPicker
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            onSelectedIdsChange={onSelectedIdsChange}
            scenarios={scenarios}
            selectedIds={selectedIds}
          />
        ) : null}
        {!selectedScenarioCount ? (
          <EmptyChartState
            className="h-[200px]"
            text="Selecione ao menos um cenário para calcular os dias de pico."
          />
        ) : loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : points.length ? (
          <EChart option={option} className="h-full min-h-0" />
        ) : (
          <EmptyChartState
            className="h-[200px]"
            text="Sem fluxo diário no mês atual para classificar."
          />
        )}
      </CardContent>
    </Card>
  );
}

function MissingCustomWidgetCard({
  onEdit,
  onRemove,
  title,
}: {
  onEdit?: () => void;
  onRemove?: () => void;
  title: string;
}) {
  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText
                fallback={title || "Widget personalizado"}
              />
            </CardTitle>
            <CardDescription>
              A visão vinculada a este widget não está mais disponível.
            </CardDescription>
          </div>
          {onEdit && onRemove ? (
            <CustomWidgetActions
              onEdit={onEdit}
              onRemove={onRemove}
              title={title}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <EmptyChartState text="Selecione outro widget ou remova este card." />
      </CardContent>
    </Card>
  );
}

function TodayComparisonCard({
  description,
  emptyText,
  loading,
  points,
  title,
}: {
  description: string;
  emptyText: string;
  loading: boolean;
  points: TodayComparisonPoint[];
  title: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildScenarioComparisonOption(points, widgetColor),
    [points, widgetColor],
  );

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
          <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
          <WidgetTitleText fallback={title} />
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : points.length ? (
          <div className="h-full min-h-0 w-full">
            <EChart option={option} />
          </div>
        ) : (
          <EmptyChartState text={emptyText} />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyRealtimeCard({ title }: { title: string }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="[overflow-wrap:anywhere]">
          <WidgetTitleText fallback={title} />
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          Selecione um cenário para ver o ao vivo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyChartState text="Nenhum cenário selecionado." />
      </CardContent>
    </Card>
  );
}

function EmptyChartState({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {text}
    </div>
  );
}

function buildRealtimeChartDefinitions(now: Date): RealtimeChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = endOfAggregateBucket(startOfHour(now), "hour");
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);

  return [
    {
      id: "live_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos no cenário selecionado.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "live_chart_hour",
      label: "Hora a hora",
      description: "Somente o dia atual, sem comparação histórica.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "live_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias no cenário selecionado.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "live_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas no cenário selecionado.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "live_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses no cenário selecionado.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
  ];
}

function buildMinuteDayDefinition(now: Date): RealtimeChartDefinition {
  return {
    id: LIVE_DAY_MINUTES_ID,
    label: "Minuto a minuto · Hoje",
    description:
      "Fluxo do dia em resolução de minuto, com horários futuros vazios.",
    granularity: "minute",
    from: startOfDay(now),
    to: addMinutes(startOfMinute(now), 1),
  };
}

function buildCurrentMonthDaysDefinition(now: Date): RealtimeChartDefinition {
  const todayStart = startOfDay(now);

  return {
    id: CURRENT_MONTH_DAYS_ID,
    label: "Dias do mês atual",
    description: "Base auxiliar para manter o mês em andamento atualizado.",
    granularity: "day",
    from: startOfMonth(now),
    to: addDays(todayStart, 1),
  };
}

function buildOperationalComparisonHoursDefinition(
  now: Date,
  mode: LiveOperationalSettings["intradayComparison"],
): RealtimeChartDefinition {
  const from = operationalComparisonDayStart(now, mode);
  return {
    id: OPERATIONAL_COMPARISON_HOURS_ID,
    label: intradayComparisonSeriesLabel(mode),
    description: "Base auxiliar do comparativo hora a hora.",
    granularity: "hour",
    from,
    to: addDays(from, 1),
  };
}

function buildOperationalBaselineMonthDefinition(
  now: Date,
  mode: LiveOperationalSettings["monthComparison"],
): RealtimeChartDefinition {
  const currentMonth = startOfMonth(now);
  const from =
    mode === "last_year"
      ? new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 1)
      : addMonths(currentMonth, -1);

  return {
    id:
      mode === "last_year"
        ? OPERATIONAL_LAST_YEAR_MONTH_ID
        : OPERATIONAL_PREVIOUS_MONTH_ID,
    label: monthComparisonLabel(mode),
    description: "Base horária canônica do comparativo mensal operacional.",
    granularity: "hour",
    from,
    to: addMonths(from, 1),
  };
}

function buildOperationalTrendDaysDefinition(now: Date): RealtimeChartDefinition {
  const todayStart = startOfDay(now);

  return {
    id: OPERATIONAL_TREND_DAYS_ID,
    label: "Tendência diária",
    description: "Janela auxiliar de 90 dias para médias móveis de 7 e 30 dias.",
    granularity: "day",
    from: addDays(todayStart, -89),
    to: addDays(todayStart, 1),
  };
}

function buildOperationalMonthHoursDefinition(
  now: Date,
): RealtimeChartDefinition {
  const currentMonthStart = startOfMonth(now);
  const historyStart = addMonths(currentMonthStart, -12);

  return {
    id: OPERATIONAL_MONTH_HOURS_ID,
    label: "Histórico horário operacional",
    description:
      "Base horária canônica do mês atual e dos 12 meses anteriores.",
    granularity: "hour",
    from: historyStart,
    to: endOfAggregateBucket(startOfHour(now), "hour"),
  };
}

function buildLiveAnnualRecentMonthsDefinition(
  now: Date,
): RealtimeChartDefinition {
  const currentMonthStart = startOfMonth(now);

  return {
    id: LIVE_ANNUAL_RECENT_MONTHS_ID,
    label: "Meses recentes do comparativo anual",
    description:
      "Rollup canônico do mês atual e dos 12 meses anteriores.",
    granularity: "month",
    from: addMonths(currentMonthStart, -12),
    to: addMonths(currentMonthStart, 1),
  };
}

function buildOperationalCurrentHourMinutesDefinition(
  now: Date,
): RealtimeChartDefinition {
  return {
    id: OPERATIONAL_CURRENT_HOUR_MINUTES_ID,
    label: "Minutos da hora atual",
    description:
      "Base canônica para reconciliar a hora civil ainda aberta.",
    granularity: "minute",
    from: startOfHour(now),
    to: addMinutes(startOfMinute(now), 1),
  };
}

function buildHourlyOccupancyDataDefinition(
  now: Date,
  startHour: number,
): RealtimeChartDefinition {
  const from = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    startHour,
  );

  return {
    id: OCCUPANCY_HOURS_ID,
    label: "Ocupação hora a hora",
    description: `Contagem diária a partir de ${formatOccupancyStartHour(startHour)}.`,
    granularity: "hour",
    from,
    to: addDays(startOfDay(now), 1),
  };
}

function buildCustomWidgetDefinition(
  widget: RealtimeScopeCustomWidget,
  definitions: RealtimeChartDefinition[],
  scope?: RealtimeScopeOption,
): RealtimeChartDefinition {
  const base =
    definitions.find((definition) => definition.granularity === widget.granularity) ??
    definitions.find((definition) => definition.id === "live_chart_hour") ??
    buildRealtimeChartDefinitions(new Date())[1];
  const scopeName = scope?.name ?? widget.scopeName;

  return {
    ...base,
    description: `${granularityLabel(widget.granularity)} em ${scopeModeLabel(
      widget.scopeMode,
    ).toLowerCase()}: ${scopeName}.`,
    id: `live_custom_${widget.id}`,
    label: widget.title || buildCustomWidgetDefaultTitleFromName(scopeName, widget.granularity),
  };
}

function realtimeScenarioComparisonStorageKey(widgetId: string) {
  return `live-custom-${widgetId}`;
}

function chartStateForGranularity(
  data: Record<string, RealtimeChartState>,
  granularity: RealtimeCustomWidgetGranularity,
) {
  const idByGranularity: Record<RealtimeCustomWidgetGranularity, string> = {
    day: "live_chart_day",
    hour: "live_chart_hour",
    minute: "live_chart_minute",
    month: "live_chart_month",
    week: "live_chart_week",
  };

  return data[idByGranularity[granularity]];
}

function buildCustomWidgetDefaultTitle(
  scope: RealtimeScopeOption,
  granularity: RealtimeCustomWidgetGranularity,
) {
  return buildCustomWidgetDefaultTitleFromName(scope.name, granularity);
}

function buildCustomWidgetDefaultTitleFromName(
  scopeName: string,
  granularity: RealtimeCustomWidgetGranularity,
) {
  return `${scopeName} - ${granularityLabel(granularity)}`;
}

function granularityLabel(granularity: RealtimeCustomWidgetGranularity) {
  return (
    CUSTOM_WIDGET_GRANULARITY_OPTIONS.find((option) => option.value === granularity)
      ?.label ?? "Hora a hora"
  );
}

function aggregatePath(definition: RealtimeChartDefinition) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: aggregateQueryIso(definition.from, definition.granularity),
    to: aggregateQueryIso(definition.to, definition.granularity),
    metric_type: DEFAULT_METRIC_TYPE,
  });

  return `/analytics/aggregate?${params.toString()}`;
}

function hydrateRealtimeOpenBuckets(
  data: Record<string, RealtimeChartState>,
  definitions: RealtimeChartDefinition[],
  now: Date,
) {
  const next = Object.fromEntries(
    Object.entries(data).map(([id, state]) => [
      id,
      { ...state, rows: [...state.rows] },
    ]),
  ) as Record<string, RealtimeChartState>;
  const definitionById = new Map(
    definitions.map((definition) => [definition.id, definition] as const),
  );
  const minuteState = next[OPERATIONAL_CURRENT_HOUR_MINUTES_ID];
  const visibleMinuteState = next.live_chart_minute;
  const canonicalDefinition = definitionById.get(
    OPERATIONAL_MONTH_HOURS_ID,
  );
  const canonicalState = next[OPERATIONAL_MONTH_HOURS_ID];

  if (
    minuteState &&
    !minuteState.error &&
    minuteState.granularity === "minute" &&
    visibleMinuteState &&
    !visibleMinuteState.error &&
    visibleMinuteState.granularity === "minute"
  ) {
    const currentHourStart = startOfHour(now);
    visibleMinuteState.rows = reconcileAggregateRows(
      visibleMinuteState.rows,
      "minute",
      minuteState.rows,
      "minute",
      currentHourStart,
      addMinutes(startOfMinute(now), 1),
    );
  }

  if (
    canonicalDefinition &&
    canonicalState &&
    !canonicalState.error &&
    canonicalState.granularity === "hour" &&
    minuteState &&
    !minuteState.error &&
    minuteState.granularity === "minute"
  ) {
    const currentHourStart = startOfHour(now);
    canonicalState.rows = reconcileAggregateRows(
      canonicalState.rows,
      "hour",
      minuteState.rows,
      "minute",
      currentHourStart,
      endOfAggregateBucket(currentHourStart, "hour"),
    );
  }

  if (
    !canonicalDefinition ||
    !canonicalState ||
    canonicalState.error ||
    canonicalState.granularity !== "hour"
  ) {
    return next;
  }

  const rolledRows = rollupAggregateRowsMany(
    canonicalState.rows,
    "hour",
    ["hour", "day", "week", "month"],
    canonicalDefinition.from,
    canonicalDefinition.to,
  );

  CANONICAL_HOUR_DERIVED_TARGETS.forEach(({ granularity, id }) => {
    const target = next[id];
    const definition = definitionById.get(id);
    if (!target || !definition) return;

    target.rows = (rolledRows.get(granularity) ?? []).filter((row) =>
      aggregateBucketInRange(
        row.bucket,
        granularity,
        definition.from,
        definition.to,
      ),
    );
    target.granularity = granularity;
    delete target.error;
  });

  return next;
}

async function fetchSubLocations(
  locations: Location[],
  companyScopeId?: string | null,
) {
  const expectedCompanyId = companyScopeId?.trim() || undefined;
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<unknown>(`/locations/${location.id}/sub-locations`, {
        companyScopeId: expectedCompanyId,
      }).then((value) => requireSubLocationRows(value, expectedCompanyId)),
    ),
  );

  return filterScopedApiRows(
    requireSubLocationRows(rows.flat(), expectedCompanyId),
    companyScopeId,
  );
}

async function fetchRealtimeWorkers(
  companyId: string | null | undefined,
  { requireExplicitCompanyId }: WorkerMetadataValidationOptions,
): Promise<OptionalWorkerMetadata> {
  const companyScopeId = companyId?.trim() || undefined;
  const rows = await apiFetch<unknown>("/workers", { companyScopeId }).then(
    (value) =>
      requireWorkerRows(
        value,
        requireExplicitCompanyId ? undefined : companyScopeId,
      ),
  );
  const { foreignRows, scopedRows } = partitionWorkersByCompanyScope(
    rows,
    companyId,
  );

  return {
    rows: sortWorkersByActivity(collapseWorkerIdentityChains(scopedRows)),
    warning: foreignRows.length
      ? `${formatNumber(foreignRows.length)} worker(s) fora da empresa selecionada foram ocultados. Os cenários, câmeras e locais continuam disponíveis.`
      : "",
  };
}

function unavailableWorkerMetadata(error: unknown): OptionalWorkerMetadata {
  const detail =
    error instanceof Error
      ? error.message
      : "A API não certificou os workers desta empresa.";

  return {
    rows: [],
    warning: `Vínculos de workers indisponíveis: ${detail}`,
  };
}

function buildRealtimeScopeOptions({
  cameras,
  groups,
  locations,
  manager,
  mode,
  scenarios,
  subLocations,
  workerLocationAssignments,
  workers,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  mode: RealtimeScopeMode;
  scenarios: Scenario[];
  subLocations: SubLocation[];
  workerLocationAssignments: WorkerLocationAssignments;
  workers: Worker[];
}) {
  if (mode === "location") {
    return buildWorkerBackedLocationOptions({
      assignments: workerLocationAssignments,
      cameras,
      locations,
      manager,
      workers,
    }).map<RealtimeScopeOption>((option) => ({
        cameraIds: option.cameraIds,
        description: option.description,
        id: option.id,
        location: option.location,
        mode: "location",
        name: option.name,
        worker: option.worker,
        workerId: option.workerId,
      }));
  }

  if (mode === "sub_location") {
    return buildSubLocationCameraOptions({
      cameras,
      groups,
      locations,
      manager,
      subLocations,
    }).map<RealtimeScopeOption>((option) => ({
      cameraIds: option.cameraIds,
      description: option.description,
      group: option.group,
      id: option.id,
      mode: "sub_location",
      name: option.name,
      parentName: option.parentName,
      subLocation: option.subLocation,
    }));
  }

  return scenarios.map<RealtimeScopeOption>((scenario) => ({
    cameraIds: [],
    description: scenario.description || "Cenário personalizado de contagem.",
    id: scenario.id,
    mode: "scenario",
    name: scenario.name,
    scenario,
  }));
}

function buildRealtimeScopeModes({
  cameras,
  groups,
  locations,
  manager,
  scenarios,
  subLocations,
  workerLocationAssignments,
  workers,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  scenarios: Scenario[];
  subLocations: SubLocation[];
  workerLocationAssignments: WorkerLocationAssignments;
  workers: Worker[];
}) {
  const modes: Array<{ label: string; value: RealtimeScopeMode }> = [];
  if (scenarios.length) modes.push({ label: "Cenário", value: "scenario" });
  if (
    buildRealtimeScopeOptions({
      cameras,
      groups,
      locations,
      manager,
      mode: "location",
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    }).length
  ) {
    modes.push({ label: "Location", value: "location" });
  }
  if (
    buildRealtimeScopeOptions({
      cameras,
      groups,
      locations,
      manager,
      mode: "sub_location",
      scenarios,
      subLocations,
      workerLocationAssignments,
      workers,
    }).length
  ) {
    modes.push({ label: "Sub-location", value: "sub_location" });
  }

  return modes;
}

function scopeModeLabel(mode: RealtimeScopeMode) {
  if (mode === "location") return "Location";
  if (mode === "sub_location") return "Sub-location";
  return "Cenário";
}

function buildScopePoints(
  definition: RealtimeChartDefinition,
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
) {
  const totals = aggregateScopeRowsByBucket(rows, scope, definition.granularity);

  return listBucketStarts(definition).map((bucketStart) => {
    const key = bucketKeyForGranularity(bucketStart, definition.granularity);

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
      total: totals.get(key) ?? 0,
    };
  });
}

function buildScenarioTodayComparisonPoints(
  scenarios: Scenario[],
  rows: AggregateEventRow[],
  now: Date,
  sourceGranularity: AggregateGranularity,
): ScenarioComparisonPoint[] {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  return buildScenarioPeriodComparisonPoints(
    scenarios,
    rows,
    todayStart,
    tomorrowStart,
    sourceGranularity,
  );
}

function buildScenarioPeriodComparisonPoints(
  scenarios: Scenario[],
  rows: AggregateEventRow[],
  from: Date,
  to: Date,
  sourceGranularity: AggregateGranularity,
): ScenarioComparisonPoint[] {
  return scenarios
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      total: sumScenarioRowsInRange(
        rows,
        scenario,
        from,
        to,
        sourceGranularity,
      ),
    }))
    .sort(
      (left, right) =>
        right.total - left.total || left.name.localeCompare(right.name, "pt-BR"),
    );
}

function buildScopeTodayComparisonPoints(
  scopes: RealtimeScopeOption[],
  rows: AggregateEventRow[],
  now: Date,
  sourceGranularity: AggregateGranularity,
): TodayComparisonPoint[] {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  return scopes
    .map((scope) => ({
      id: scope.id,
      name: scope.name,
      total: sumScopeRowsInRange(
        rows,
        scope,
        todayStart,
        tomorrowStart,
        sourceGranularity,
      ),
    }))
    .sort(
      (left, right) =>
        right.total - left.total || left.name.localeCompare(right.name, "pt-BR"),
    );
}

function buildOperationalMonthComparisonPoints(
  currentRows: AggregateEventRow[],
  baselineRows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  now: Date,
  mode: LiveOperationalSettings["monthComparison"],
  currentGranularity: AggregateGranularity,
  baselineGranularity: AggregateGranularity,
): OperationalMonthComparisonPoint[] {
  const currentStart = startOfMonth(now);
  const baselineStart =
    mode === "last_year"
      ? new Date(currentStart.getFullYear() - 1, currentStart.getMonth(), 1)
      : addMonths(currentStart, -1);
  const dayCount = DAY_OF_MONTH_AXIS_LABELS.length;

  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const currentFrom = new Date(
      currentStart.getFullYear(),
      currentStart.getMonth(),
      day,
    );
    const baselineFrom = new Date(
      baselineStart.getFullYear(),
      baselineStart.getMonth(),
      day,
    );
    const currentExists = day <= daysInCalendarMonth(currentStart);
    const baselineExists = day <= daysInCalendarMonth(baselineStart);
    const currentClosedOrOpen = currentExists && day <= now.getDate();

    return {
      baseline: baselineExists
        ? sumScopeRowsInRange(
            baselineRows,
            scope,
            baselineFrom,
            addDays(baselineFrom, 1),
            baselineGranularity,
          )
        : null,
      current: currentClosedOrOpen
        ? sumScopeRowsInRange(
            currentRows,
            scope,
            currentFrom,
            addDays(currentFrom, 1),
            currentGranularity,
          )
        : null,
      day,
      isSaturday: currentExists && currentFrom.getDay() === 6,
      isSunday: currentExists && currentFrom.getDay() === 0,
    };
  });
}

function buildOperationalTrendPoints(
  points: ChartPoint[],
): OperationalTrendPoint[] {
  return points.map((point, index) => ({
    ...point,
    average7: movingAverageAt(points, index, 7),
    average30: movingAverageAt(points, index, 30),
  }));
}

function buildOperationalMonthCumulativePoints(
  points: OperationalMonthComparisonPoint[],
) {
  let baselineTotal = 0;
  let currentTotal = 0;

  return points.map((point) => {
    if (point.current === null) {
      return { baseline: null, current: null, day: point.day };
    }
    baselineTotal += point.baseline ?? 0;
    currentTotal += point.current;
    return { baseline: baselineTotal, current: currentTotal, day: point.day };
  });
}

function movingAverageAt(points: ChartPoint[], index: number, windowSize: number) {
  if (index + 1 < windowSize) return null;
  const window = points.slice(index + 1 - windowSize, index + 1);
  return window.reduce((sum, point) => sum + point.total, 0) / windowSize;
}

function movingAverageTrend(
  points: OperationalTrendPoint[],
  key: "average7" | "average30",
) {
  const values = points.flatMap((point) =>
    point[key] === null ? [] : [point[key]],
  );
  const current = values.at(-1) ?? null;
  const previous = values.at(-2) ?? null;
  const delta =
    current !== null && previous !== null
      ? percentageDelta(current, previous)
      : null;

  return {
    current,
    delta,
    direction:
      current === null || previous === null
        ? 0
        : current > previous
          ? 1
          : current < previous
            ? -1
            : 0,
    previous,
  };
}

function sumScenarioRowsInRange(
  rows: AggregateEventRow[],
  scenario: Scenario,
  from: Date,
  to: Date,
  sourceGranularity: AggregateGranularity,
) {
  const multipliers = scenarioMultiplierMap(scenario);

  return rows.reduce((sum, row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return sum;

    if (!aggregateBucketInRange(row.bucket, sourceGranularity, from, to)) {
      return sum;
    }

    return sum + (row.total ?? 0) * multiplier;
  }, 0);
}

function aggregateScopeRowsByBucket(
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  granularity: AggregateGranularity,
) {
  if (scope.scenario) {
    return aggregateScenarioRowsByBucket(rows, scope.scenario, granularity);
  }

  const cameraIds = new Set(scope.cameraIds);
  const totals = new Map<number, number>();

  rows.forEach((row) => {
    if (!row.camera_id || !cameraIds.has(row.camera_id)) return;

    const date = parseAggregateBucket(row.bucket, granularity);
    if (!date) return;

    const key = bucketKeyForGranularity(date, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0));
  });

  return totals;
}

function aggregateScenarioRowsByBucket(
  rows: AggregateEventRow[],
  scenario: Scenario,
  granularity: AggregateGranularity,
) {
  const multipliers = scenarioMultiplierMap(scenario);
  const totals = new Map<number, number>();

  rows.forEach((row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return;

    const date = parseAggregateBucket(row.bucket, granularity);
    if (!date) return;

    const key = bucketKeyForGranularity(date, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0) * multiplier);
  });

  return totals;
}

function scenarioMultiplierMap(scenario: Scenario) {
  return new Map(
    scenario.lines
      ?.filter((line) => line.action_multiplier !== 0)
      .map((line) => [line.line_count_id, line.action_multiplier ?? 1]) ?? [],
  );
}

function scenarioNamesSummary(scenarios: Scenario[]) {
  if (!scenarios.length) return "nenhum cenário";
  const visibleNames = scenarios.slice(0, 3).map((scenario) => scenario.name);
  return scenarios.length > visibleNames.length
    ? `${visibleNames.join(", ")} +${scenarios.length - visibleNames.length}`
    : visibleNames.join(", ");
}

function buildScenarioTotalsTableRows(
  todayPoints: ScenarioCumulativeTotalPoint[],
  monthPoints: ScenarioCumulativeTotalPoint[],
): ScenarioTotalsTableRow[] {
  const todayById = new Map(
    todayPoints.map((point) => [point.id, point.total]),
  );

  return monthPoints
    .map((point) => ({
      id: point.id,
      month: point.total,
      name: point.name,
      share: point.share,
      today: todayById.get(point.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.month - left.month || left.name.localeCompare(right.name, "pt-BR"),
    );
}

function sumScopeRowsInRange(
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  from: Date,
  to: Date,
  sourceGranularity: AggregateGranularity,
) {
  if (!scope.scenario) {
    const cameraIds = new Set(scope.cameraIds);

    return rows.reduce((sum, row) => {
      if (!row.camera_id || !cameraIds.has(row.camera_id)) return sum;

      if (!aggregateBucketInRange(row.bucket, sourceGranularity, from, to)) {
        return sum;
      }

      return sum + (row.total ?? 0);
    }, 0);
  }

  const scenario = scope.scenario;
  const multipliers = scenarioMultiplierMap(scenario);

  return rows.reduce((sum, row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return sum;

    if (!aggregateBucketInRange(row.bucket, sourceGranularity, from, to)) {
      return sum;
    }

    return sum + (row.total ?? 0) * multiplier;
  }, 0);
}

function listBucketStarts(definition: RealtimeChartDefinition) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(definition.from, definition.granularity);
  const end = alignEndToGranularity(definition.to, definition.granularity);
  let guard = 0;

  while (cursor < end && guard < MAX_REALTIME_BUCKETS) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, definition.granularity);
    guard += 1;
  }

  if (cursor < end) {
    throw new RangeError(
      `O período de ${definition.label} excede ${MAX_REALTIME_BUCKETS} pontos e não pode ser exibido sem perda de dados.`,
    );
  }

  return starts;
}

function buildOperationalHourlyChartOption({
  averageDescription,
  comparisonLabel,
  comparisonPoints,
  currentPoints,
  targetPerHour,
  widgetColor,
}: {
  averageDescription: string;
  comparisonLabel: string;
  comparisonPoints: ChartPoint[];
  currentPoints: ChartPoint[];
  targetPerHour: number;
  widgetColor: string;
}): EnterpriseChartOption {
  const throughHour = latestHourlyPointHour(currentPoints);
  const currentValues = buildFixedHourlyAxisValues(currentPoints, throughHour);
  const comparisonValues = buildFixedHourlyAxisValues(
    comparisonPoints,
    throughHour,
  );

  return {
    color: ["#8FA7BF", widgetColor, "#D7A85B"],
    grid: { bottom: 6, containLabel: true, left: 6, right: 10, top: 50 },
    legend: {
      itemGap: 14,
      itemHeight: 9,
      itemWidth: 12,
      left: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) => formatNumber(Number(value ?? 0)),
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        hideOverlap: true,
        interval: 1,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: HOUR_OF_DAY_LABELS,
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "44%",
        barMaxWidth: 24,
        data: comparisonValues,
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#A3AFBF",
          opacity: 0.78,
        },
        name: comparisonLabel,
        type: "bar",
      },
      {
        barGap: "8%",
        barMaxWidth: 28,
        data: currentValues,
        itemStyle: { borderRadius: [2, 2, 0, 0], color: widgetColor },
        markLine:
          targetPerHour > 0
            ? {
                animation: false,
                data: [{ name: averageDescription, yAxis: targetPerHour }],
                label: {
                  color: "#A46B18",
                  fontSize: 10,
                  formatter: "Média-base",
                  position: "insideEndTop",
                },
                lineStyle: {
                  color: "#C48A38",
                  opacity: 0.72,
                  type: "dashed",
                  width: 1,
                },
                silent: true,
                symbol: "none",
              }
            : undefined,
        name: "Hoje",
        type: "bar",
      },
    ],
  };
}

function buildOperationalHeatmapOption(
  points: OperationalHeatmapPoint[],
  month: Date,
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  const maximum = Math.max(1, ...points.map((point) => point.total));
  const heatmapData = points
    .filter((point) => point.total > 0)
    .map((point) => [point.day - 1, point.hour, point.total]);

  return {
    grid: {
      bottom: 72,
      containLabel: true,
      left: 18,
      right: 18,
      top: 18,
    },
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        if (!params || typeof params !== "object") return "";
        const value = (params as { value?: unknown }).value;
        if (!Array.isArray(value)) return "";
        const day = Number(value[0]) + 1;
        const hour = Number(value[1]);
        const total = Number(value[2] ?? 0);
        const intensity = maximum ? total / maximum : 0;

        return [
          `<strong>Dia ${day}</strong>`,
          hourRangeLabel(hour),
          `${formatNumber(total)} eventos`,
          `${new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 0,
            style: "percent",
          }).format(intensity)} do maior pico`,
        ].join("<br />");
      },
      padding: [10, 12],
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "item",
    },
    visualMap: {
      calculable: true,
      inRange: {
        color: monochromeHeatmapPalette(widgetColor),
      },
      itemHeight: 210,
      itemWidth: 10,
      left: "center",
      max: maximum,
      min: 0,
      orient: "horizontal",
      precision: 0,
      seriesIndex: 0,
      text: ["Maior fluxo", "Menor fluxo"],
      textGap: 8,
      textStyle: { color: "#526477", fontSize: 10 },
      bottom: 4,
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 9,
        holidayIndexes: holidayCategoryIndexesForMonth(month),
        saturdayIndexes: saturdayCategoryIndexesForMonth(month),
        sundayIndexes: sundayCategoryIndexesForMonth(month),
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: DAY_OF_MONTH_AXIS_LABELS,
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 9, interval: 0 },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: HOUR_AXIS_LABELS,
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
    series: [
      {
        data: heatmapData,
        emphasis: {
          itemStyle: {
            borderColor: "#13233A",
            borderWidth: 1,
            shadowBlur: 8,
            shadowColor: "rgba(18, 35, 58, 0.24)",
          },
        },
        itemStyle: {
          borderWidth: 0,
        },
        markArea: buildCalendarMarkAreaForMonth(month),
        name: "Intensidade horária",
        progressive: 1_000,
        type: "heatmap",
      },
    ],
  };
}

function buildPeakDaysRankingOption(
  points: ScenarioPeakDayPoint[],
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  return {
    grid: { bottom: 8, containLabel: true, left: 8, right: 66, top: 8 },
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        if (!params || typeof params !== "object") return "";
        const data = (params as { data?: unknown }).data;
        if (!data || typeof data !== "object") return "";
        const point = data as {
          dayLabel?: string;
          rank?: number;
          value?: number;
        };
        return [
          `<strong>${point.rank ?? "-"}º · ${point.dayLabel ?? "Dia"}</strong>`,
          `${formatNumber(point.value ?? 0)} eventos`,
        ].join("<br />");
      },
      padding: [10, 12],
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    yAxis: {
      axisLabel: { color: "#526477", fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      data: points.map((point) => `${point.rank}º  ${point.label}`),
      inverse: true,
      type: "category",
    },
    series: [
      {
        barCategoryGap: "34%",
        barMaxWidth: 28,
        data: points.map((point, index) => ({
          itemStyle: {
            borderRadius: [0, 3, 3, 0],
            color: index === 0 ? widgetColor : pastelBarColor(index + 2),
          },
          dayLabel: point.label,
          rank: point.rank,
          value: point.total,
        })),
        label: {
          color: "#526477",
          distance: 6,
          fontSize: 10,
          formatter: (params: { value?: number }) =>
            formatNumber(Number(params.value ?? 0)),
          position: "right",
          show: true,
        },
        name: "Volume diário",
        type: "bar",
      },
    ],
  };
}

function saturdayIndexesFromMonthPoints(
  points: OperationalMonthComparisonPoint[],
) {
  return new Set(
    points.flatMap((point, index) => (point.isSaturday ? [index] : [])),
  );
}

function sundayIndexesFromMonthPoints(
  points: OperationalMonthComparisonPoint[],
) {
  return new Set(
    points.flatMap((point, index) => (point.isSunday ? [index] : [])),
  );
}

function buildOperationalMonthComparisonOption(
  points: OperationalMonthComparisonPoint[],
  mode: LiveOperationalSettings["monthComparison"],
  month: Date,
  widgetColor: string,
): EnterpriseChartOption {
  const baselineValues = points.flatMap((point) =>
    point.baseline === null ? [] : [point.baseline],
  );
  const baselineAverage = baselineValues.length
    ? baselineValues.reduce((sum, value) => sum + value, 0) /
      baselineValues.length
    : 0;

  return {
    color: ["#8FA7BF", widgetColor],
    grid: { bottom: 6, containLabel: true, left: 6, right: 10, top: 50 },
    legend: {
      itemGap: 14,
      itemHeight: 9,
      itemWidth: 12,
      left: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) => formatNumber(Number(value ?? 0)),
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 9,
        holidayIndexes: holidayCategoryIndexesForMonth(month),
        saturdayIndexes: saturdayIndexesFromMonthPoints(points),
        sundayIndexes: sundayIndexesFromMonthPoints(points),
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: DAY_OF_MONTH_AXIS_LABELS,
      name: "Dia",
      nameTextStyle: { color: "#66758A", fontSize: 10 },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "40%",
        barMaxWidth: 22,
        data: points.map((point) => point.baseline),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#A3AFBF",
          opacity: 0.82,
        },
        markArea: buildCalendarMarkAreaForMonth(month),
        name: monthComparisonLabel(mode),
        type: "bar",
      },
      {
        barGap: "8%",
        barMaxWidth: 22,
        data: points.map((point) => point.current),
        itemStyle: { borderRadius: [2, 2, 0, 0], color: widgetColor },
        markLine:
          baselineAverage > 0
            ? {
                animation: false,
                data: [
                  {
                    name: averageBaseDescription(mode),
                    yAxis: baselineAverage,
                  },
                ],
                label: {
                  color: "#A46B18",
                  fontSize: 10,
                  formatter: "Média-base",
                  position: "insideEndTop",
                },
                lineStyle: {
                  color: "#C48A38",
                  opacity: 0.72,
                  type: "dashed",
                  width: 1,
                },
                silent: true,
                symbol: "none",
              }
            : undefined,
        name: "Mês atual",
        type: "bar",
      },
    ],
  };
}

function buildOperationalMonthCumulativeOption(
  points: OperationalMonthComparisonPoint[],
  mode: LiveOperationalSettings["monthComparison"],
  month: Date,
  widgetColor: string,
): EnterpriseChartOption {
  const cumulative = buildOperationalMonthCumulativePoints(points);

  return {
    color: ["#8FA7BF", widgetColor],
    grid: { bottom: 6, containLabel: true, left: 6, right: 10, top: 50 },
    legend: {
      itemGap: 14,
      itemHeight: 9,
      itemWidth: 12,
      left: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : formatNumber(Number(value)),
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 9,
        holidayIndexes: holidayCategoryIndexesForMonth(month),
        saturdayIndexes: saturdayIndexesFromMonthPoints(points),
        sundayIndexes: sundayIndexesFromMonthPoints(points),
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: DAY_OF_MONTH_AXIS_LABELS,
      name: "Dia",
      nameTextStyle: { color: "#66758A", fontSize: 10 },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "40%",
        barMaxWidth: 22,
        data: cumulative.map((point) => point.baseline),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#A3AFBF",
          opacity: 0.78,
        },
        markArea: buildCalendarMarkAreaForMonth(month),
        name: `${monthComparisonLabel(mode)} acumulado`,
        type: "bar",
      },
      {
        barGap: "8%",
        barMaxWidth: 22,
        data: cumulative.map((point) => point.current),
        itemStyle: { borderRadius: [2, 2, 0, 0], color: widgetColor },
        name: "Mês atual acumulado",
        type: "bar",
      },
    ],
  };
}

function buildOperationalTrendOption(
  points: OperationalTrendPoint[],
  direction7: number,
  direction30: number,
  month: Date,
  volumeColor = "#C7D2DE",
): EnterpriseChartOption {
  const directionColor = (direction: number) =>
    direction > 0 ? "#0F766E" : direction < 0 ? "#C2410C" : "#64748B";
  const valuesByDay = (
    selector: (point: OperationalTrendPoint) => number | null,
  ) => {
    const values: Array<number | null> = Array.from(
      { length: DAY_OF_MONTH_AXIS_LABELS.length },
      () => null,
    );

    points.forEach((point) => {
      const date = new Date(point.bucket);
      if (Number.isNaN(date.getTime())) return;
      const dayIndex = date.getDate() - 1;
      if (dayIndex >= 0 && dayIndex < values.length) {
        values[dayIndex] = selector(point);
      }
    });

    return values;
  };

  return {
    color: [volumeColor, directionColor(direction30), directionColor(direction7)],
    grid: { bottom: 8, containLabel: true, left: 8, right: 12, top: 52 },
    legend: {
      itemGap: 14,
      itemHeight: 9,
      itemWidth: 14,
      left: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
    },
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : formatNumber(Number(value)),
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 9,
        holidayIndexes: holidayCategoryIndexesForMonth(month),
        saturdayIndexes: saturdayCategoryIndexesForMonth(month),
        sundayIndexes: sundayCategoryIndexesForMonth(month),
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: DAY_OF_MONTH_AXIS_LABELS,
      name: "Dia",
      nameTextStyle: { color: "#66758A", fontSize: 10 },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barMaxWidth: 14,
        data: valuesByDay((point) => point.total),
        itemStyle: { color: volumeColor, opacity: 0.42 },
        markArea: buildCalendarMarkAreaForMonth(month),
        name: "Volume diário",
        type: "bar",
      },
      {
        data: valuesByDay((point) => point.average30),
        lineStyle: {
          color: directionColor(direction30),
          opacity: 0.9,
          type: "solid",
          width: 2.5,
        },
        name: "Média móvel 30 dias",
        showSymbol: false,
        smooth: 0.18,
        type: "line",
      },
      {
        data: valuesByDay((point) => point.average7),
        lineStyle: {
          color: directionColor(direction7),
          opacity: 0.76,
          type: "dashed",
          width: 1.25,
        },
        name: "Média móvel 7 dias",
        showSymbol: false,
        smooth: 0.18,
        type: "line",
      },
    ],
  };
}

function buildScenarioRoseOption(
  points: ScenarioComparisonPoint[],
  widgetColor: string,
  chartType: ScenarioCompositionChartType = "rose",
): EnterpriseChartOption {
  return buildScenarioCompositionOption(
    points.map((point) => ({ name: point.name, value: point.total })),
    widgetColor,
    chartType,
  );
}

function buildMonthlyAccessRankingOption(
  points: ScenarioComparisonPoint[],
  widgetColor: string,
): EnterpriseChartOption {
  const total = points.reduce((sum, point) => sum + point.total, 0);

  return {
    grid: {
      bottom: 8,
      containLabel: true,
      left: 8,
      right: 112,
      top: 8,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) => `${formatNumber(Number(value ?? 0))} eventos`,
    },
    xAxis: {
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        overflow: "truncate",
        width: 145,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: points.map((point) => point.name),
      inverse: true,
      type: "category",
    },
    series: [
      {
        barCategoryGap: "28%",
        barMaxWidth: 24,
        data: points.map((point, index) => ({
          itemStyle: {
            color: index === 0 ? widgetColor : pastelBarColor(index),
          },
          value: point.total,
        })),
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: {
          color: "#526477",
          distance: 6,
          fontSize: 10,
          formatter: (params: { dataIndex?: number; value?: number }) => {
            const value = Number(params.value ?? 0);
            const share = total ? value / total : 0;
            return `${new Intl.NumberFormat("pt-BR", {
              maximumFractionDigits: 1,
              style: "percent",
            }).format(share)} · ${formatNumber(value)}`;
          },
          position: "right",
          show: true,
        },
        name: "Fluxo do mês",
        type: "bar",
      },
    ],
  };
}

function isSingleDayHourlyDefinition(definition: RealtimeChartDefinition) {
  if (definition.granularity !== "hour" || definition.to <= definition.from) {
    return false;
  }

  const finalInstant = new Date(definition.to.getTime() - 1);
  return (
    definition.from.getFullYear() === finalInstant.getFullYear() &&
    definition.from.getMonth() === finalInstant.getMonth() &&
    definition.from.getDate() === finalInstant.getDate()
  );
}

function buildMinuteDayChartOption(
  slots: readonly MinuteDayAxisSlot[],
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  return {
    animation: false,
    color: [widgetColor],
    dataZoom: [],
    grid: {
      bottom: 4,
      containLabel: true,
      left: 4,
      right: 10,
      top: 18,
    },
    tooltip: {
      axisPointer: {
        lineStyle: {
          color: widgetColor,
          opacity: 0.35,
          width: 1,
        },
        type: "line",
      },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      formatter: (parameters: unknown) => {
        const first = Array.isArray(parameters) ? parameters[0] : parameters;
        const dataIndex =
          first && typeof first === "object"
            ? Number((first as { dataIndex?: unknown }).dataIndex)
            : -1;
        const slot = Number.isSafeInteger(dataIndex)
          ? slots[dataIndex]
          : undefined;
        if (!slot) return "";
        if (slot.status === "future") {
          return `${slot.label}<br/>Aguardando este horário`;
        }
        if (slot.status === "unavailable") {
          return `${slot.label}<br/>Horário inexistente por mudança de fuso`;
        }
        const suffix =
          slot.status === "current" ? " · minuto em andamento" : "";
        return `${slot.label}<br/><strong>${formatNumber(
          slot.value ?? 0,
        )} eventos</strong>${suffix}`;
      },
      padding: [10, 12],
      textStyle: {
        color: "#13233A",
        fontSize: 12,
      },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (_value: string, index: number) =>
          minuteDayHourAxisLabel(index),
        hideOverlap: true,
        interval: 59,
      },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        alignWithLabel: true,
        interval: 59,
        length: 3,
      },
      boundaryGap: false,
      data: slots.map((slot) => slot.label),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
      },
      min: 0,
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: "#E8EEF6",
        },
      },
      type: "value",
    },
    series: [
      {
        areaStyle: {
          color: widgetColor,
          opacity: 0.1,
        },
        connectNulls: false,
        data: slots.map((slot) => slot.value),
        emphasis: {
          focus: "series",
        },
        label: {
          show: false,
        },
        lineStyle: {
          color: widgetColor,
          width: 1.75,
        },
        name: "Fluxo por minuto",
        progressive: 2_000,
        progressiveThreshold: 1_000,
        sampling: "lttb",
        showSymbol: false,
        smooth: 0.12,
        symbol: "none",
        type: "line",
      },
    ],
  };
}

function buildChartOption(
  definition: RealtimeChartDefinition,
  points: ChartPoint[],
  widgetColor = "#1267C4",
  targetValue = 0,
): EnterpriseChartOption {
  const fixedHourlyAxis = isSingleDayHourlyDefinition(definition);
  const hourlyThrough = fixedHourlyAxis ? latestHourlyPointHour(points) : -1;
  const axisLabels = fixedHourlyAxis
    ? HOUR_OF_DAY_LABELS
    : points.map((point) => point.label);
  const seriesData = fixedHourlyAxis
    ? buildFixedHourlyAxisValues(points, hourlyThrough)
    : points.map((point) => point.total);
  const calendarDates =
    definition.granularity === "day"
      ? points.map((point) => point.bucket)
      : [];
  const saturdayIndexes = new Set(
    definition.granularity === "day"
      ? points.flatMap((point, index) => {
          const bucket = new Date(point.bucket);
          return !Number.isNaN(bucket.getTime()) && bucket.getDay() === 6
            ? [index]
            : [];
        })
      : [],
  );
  const sundayIndexes = new Set(
    definition.granularity === "day"
      ? points.flatMap((point, index) => {
          const bucket = new Date(point.bucket);
          return !Number.isNaN(bucket.getTime()) && bucket.getDay() === 0
            ? [index]
            : [];
        })
      : [],
  );

  return {
    color: [widgetColor],
    grid: {
      bottom: 2,
      containLabel: true,
      left: 4,
      right: 10,
      top: 18,
    },
    tooltip: {
      axisPointer: {
        shadowStyle: {
          color: "rgba(18, 103, 196, 0.06)",
        },
        type: "shadow",
      },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      padding: [10, 12],
      textStyle: {
        color: "#13233A",
        fontSize: 12,
      },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : `${formatNumber(Number(value))} eventos`,
    },
    xAxis: {
      axisLabel:
        definition.granularity === "day"
          ? buildCalendarAxisLabel({
              fontSize: 11,
              hideOverlap: true,
              holidayIndexes: holidayCategoryIndexes(calendarDates),
              saturdayIndexes,
              sundayIndexes,
            })
          : {
              color: "#66758A",
              fontSize: 11,
              hideOverlap: true,
            },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        show: false,
      },
      boundaryGap: true,
      data: axisLabels,
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
      },
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: "#E8EEF6",
        },
      },
      type: "value",
    },
    series: [
      {
        barCategoryGap:
          definition.granularity === "minute" ? "42%" : "50%",
        barMaxWidth: definition.granularity === "minute" ? 18 : 28,
        data: seriesData,
        emphasis: {
          itemStyle: {
            color: widgetColor,
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: widgetColor,
        },
        markArea:
          definition.granularity === "day"
            ? buildCalendarMarkArea(calendarDates)
            : undefined,
        markLine:
          targetValue > 0
            ? {
                animation: false,
                data: [{ name: "Média-base", yAxis: targetValue }],
                label: {
                  color: "#A46B18",
                  fontSize: 10,
                  formatter: "Média-base",
                  position: "insideEndTop",
                },
                lineStyle: {
                  color: "#C48A38",
                  opacity: 0.72,
                  type: "dashed",
                  width: 1,
                },
                silent: true,
                symbol: "none",
              }
            : undefined,
        name: "Tempo real",
        type: "bar",
      },
    ],
  };
}

function buildScenarioComparisonOption(
  points: ScenarioComparisonPoint[],
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  return buildScopeTotalsComparisonOption(points, widgetColor, "Hoje");
}

function buildMinuteDayReportChart({
  clock,
  companyTimeZone,
  definition,
  rows,
  scope,
  widgetColor = "#1267C4",
}: {
  clock: Date;
  companyTimeZone: string;
  definition: RealtimeChartDefinition;
  rows: AggregateEventRow[];
  scope: RealtimeScopeOption;
  widgetColor?: string;
}): ReportPayload["charts"][number] {
  const points = buildScopePoints(definition, rows, scope);
  const slots = buildFixedMinuteDayAxis({
    day: clock,
    points,
    referenceTime: clock,
    timeZone: companyTimeZone,
  });

  return {
    description: `${definition.description} Visão: ${scope.name}. O eixo preserva as 24 horas e mantém o futuro vazio.`,
    option: buildMinuteDayChartOption(slots, widgetColor),
    table: {
      title: "Dados - Minuto a minuto · Hoje",
      columns: [
        { key: "minute", label: "Horário", width: 14 },
        { key: "status", label: "Situação", width: 24 },
        { key: "total", label: "Total", numeric: true, width: 18 },
      ],
      rows: slots
        .filter(
          (slot) =>
            slot.status === "elapsed" ||
            slot.status === "current" ||
            slot.status === "unavailable",
        )
        .map((slot) => ({
          minute: slot.label,
          status:
            slot.status === "current"
              ? "Em andamento"
              : slot.status === "unavailable"
                ? "Horário inexistente"
                : "Concluído",
          total: slot.value,
        })),
    },
    title: definition.label,
  };
}

function buildRealtimeScopeReportChart(
  definition: RealtimeChartDefinition,
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  widgetColor = "#1267C4",
): ReportPayload["charts"][number] {
  const points = buildScopePoints(definition, rows, scope);

  return {
    description: `${definition.description} Visão: ${scope.name}.`,
    option: buildChartOption(definition, points, widgetColor),
    table: {
      title: `Dados - ${definition.label}`,
      columns: [
        { key: "period", label: "Período", width: 18 },
        { key: "period_start", label: "Início", width: 22 },
        { key: "total", label: "Total", numeric: true, width: 18 },
      ],
      rows: points.map((point) => ({
        period: point.label,
        period_start: formatRealtimeReportDateTime(point.bucket),
        total: point.total,
      })),
    },
    title: definition.label,
  };
}

function buildOperationalHourlyReportChart({
  averageDescription,
  comparisonDefinition,
  comparisonLabel,
  comparisonRows,
  currentDefinition,
  currentRows,
  scope,
  targetDailyAverage,
  widgetColor = "#1267C4",
}: {
  averageDescription: string;
  comparisonDefinition: RealtimeChartDefinition;
  comparisonLabel: string;
  comparisonRows: AggregateEventRow[];
  currentDefinition: RealtimeChartDefinition;
  currentRows: AggregateEventRow[];
  scope: RealtimeScopeOption;
  targetDailyAverage: number;
  widgetColor?: string;
}): ReportPayload["charts"][number] {
  const currentPoints = buildScopePoints(currentDefinition, currentRows, scope);
  const comparisonPoints = buildScopePoints(
    comparisonDefinition,
    comparisonRows,
    scope,
  );

  return {
    comparison: `${comparisonLabel} à esquerda · Hoje à direita`,
    description: `Comparação hora a hora. Linha tracejada: ${averageDescription.toLowerCase()} convertida em média horária.`,
    option: buildOperationalHourlyChartOption({
      averageDescription,
      comparisonLabel,
      comparisonPoints,
      currentPoints,
      targetPerHour: targetDailyAverage > 0 ? targetDailyAverage / 24 : 0,
      widgetColor,
    }),
    table: {
      title: "Dados - Hora a Hora",
      columns: [
        { key: "hour", label: "Hora", width: 14 },
        { key: "baseline", label: comparisonLabel, numeric: true, width: 26 },
        { key: "current", label: "Hoje", numeric: true, width: 18 },
      ],
      rows: currentPoints.map((point, index) => ({
        baseline: comparisonPoints[index]?.total ?? 0,
        current: point.total,
        hour: point.label,
      })),
    },
    title: "Hora a Hora",
  };
}

function buildOperationalHeatmapReportChart({
  month,
  points,
  scopeName,
  widgetColor = "#1267C4",
}: {
  month: Date;
  points: OperationalHeatmapPoint[];
  scopeName: string;
  widgetColor?: string;
}): ReportPayload["charts"][number] {
  const ranked = [...points]
    .filter((point) => point.total > 0)
    .sort((left, right) => right.total - left.total);
  const maximum = ranked[0]?.total ?? 0;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(month);

  return {
    comparison: maximum
      ? `Maior pico: dia ${ranked[0].day}, ${hourRangeLabel(ranked[0].hour)}, ${formatNumber(maximum)} eventos`
      : "Nenhum pico registrado no período",
    description: `Intensidade do fluxo por dia e faixa horária em ${monthLabel}. Fins de semana e feriados nacionais e de São Paulo destacados. Visão: ${scopeName}.`,
    option: buildOperationalHeatmapOption(points, month, widgetColor),
    table: {
      title: "Dados - Maiores picos por dia e hora",
      description:
        "As 48 faixas horárias de maior fluxo no mês, em ordem decrescente.",
      columns: [
        { key: "rank", label: "Posição", numeric: true, width: 12 },
        { key: "day", label: "Dia", numeric: true, width: 12 },
        { key: "hour", label: "Faixa horária", width: 22 },
        { key: "total", label: "Eventos", numeric: true, width: 18 },
        { key: "intensity", label: "% do pico", width: 18 },
      ],
      rows: ranked.slice(0, 48).map((point, index) => ({
        day: point.day,
        hour: hourRangeLabel(point.hour),
        intensity: maximum
          ? new Intl.NumberFormat("pt-BR", {
              maximumFractionDigits: 1,
              style: "percent",
            }).format(point.total / maximum)
          : "0%",
        rank: index + 1,
        total: point.total,
      })),
    },
    title: "Mapa de calor dia x hora",
  };
}

function buildHourlyOccupancyReportChart({
  entryScenarios,
  exitScenarios,
  points,
  startHour,
  widgetColor = "#1267C4",
}: {
  entryScenarios: Scenario[];
  exitScenarios: Scenario[];
  points: ScenarioHourlyOccupancyPoint[];
  startHour: number;
  widgetColor?: string;
}): ReportPayload["charts"][number] {
  const latestPoint = [...points]
    .reverse()
    .find((point) => point.occupancy !== null);

  return {
    comparison: latestPoint
      ? `Saldo atual: ${formatNumber(latestPoint.occupancy ?? 0)} · Entradas: ${formatNumber(
          latestPoint.entries,
        )} · Saídas: ${formatNumber(latestPoint.exits)}`
      : "Sem saldo calculado no dia atual",
    description: `Saldo acumulado diariamente a partir de ${formatOccupancyStartHour(
      startHour,
    )}. Entradas: ${scenarioNamesSummary(entryScenarios)}. Saídas: ${scenarioNamesSummary(
      exitScenarios,
    )}.`,
    option: buildHourlyOccupancyOption(points, widgetColor),
    table: {
      title: "Dados - Ocupação hora a hora",
      columns: [
        { key: "hour", label: "Hora", width: 14 },
        {
          key: "entries",
          label: "Entradas acumuladas",
          numeric: true,
          width: 24,
        },
        {
          key: "exits",
          label: "Saídas acumuladas",
          numeric: true,
          width: 24,
        },
        {
          key: "occupancy",
          label: "Ocupação estimada",
          numeric: true,
          width: 24,
        },
      ],
      rows: points
        .filter((point) => point.occupancy !== null)
        .map((point) => ({
          entries: point.entries,
          exits: point.exits,
          hour: point.label,
          occupancy: point.occupancy,
        })),
    },
    title: "Ocupação hora a hora",
  };
}

function buildScenarioCumulativeTotalsReportChart(
  points: ScenarioCumulativeTotalPoint[],
  widgetColor = "#1267C4",
): ReportPayload["charts"][number] {
  const orderedPoints = [...points].sort(
    (left, right) =>
      right.total - left.total || left.name.localeCompare(right.name, "pt-BR"),
  );
  const total = orderedPoints.reduce((sum, point) => sum + point.total, 0);

  return {
    comparison: `${formatNumber(total)} eventos nos cenários selecionados`,
    description:
      "Total combinado e acumulado individual de cada cenário no dia atual, incluindo a hora parcial.",
    option: buildScenarioCumulativeTotalsOption(
      orderedPoints,
      widgetColor,
      "Acumulado de hoje",
    ),
    table: {
      title: "Dados - Acumulado por cenário",
      columns: [
        { key: "scenario", label: "Cenário", width: 40 },
        { key: "total", label: "Acumulado", numeric: true, width: 20 },
        { key: "share", label: "Participação", width: 20 },
      ],
      rows: orderedPoints.map((point) => ({
        scenario: point.name,
        share: new Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 1,
          style: "percent",
        }).format(point.share),
        total: point.total,
      })),
    },
    title: "Acumulado por cenário",
  };
}

function buildScenarioTotalsReportTable(
  rows: ScenarioTotalsTableRow[],
): ReportTable {
  const totalToday = rows.reduce((sum, row) => sum + row.today, 0);
  const totalMonth = rows.reduce((sum, row) => sum + row.month, 0);

  return {
    columns: [
      { key: "scenario", label: "Cenário", width: 40 },
      { key: "today", label: "Hoje", numeric: true, width: 18 },
      { key: "month", label: "Mês atual", numeric: true, width: 20 },
      { key: "share", label: "% do mês", width: 18 },
    ],
    description: `Total hoje: ${formatNumber(totalToday)}. Total mensal: ${formatNumber(totalMonth)}.`,
    includeInCharts: true,
    rows: [
      {
        month: totalMonth,
        scenario: "TOTAL",
        share: totalMonth ? "100%" : "0%",
        today: totalToday,
      },
      ...rows.map((row) => ({
        month: row.month,
        scenario: row.name,
        share: new Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 1,
          style: "percent",
        }).format(row.share),
        today: row.today,
      })),
    ],
    title: "Tabela acumulada por cenário",
  };
}

function buildOperationalMonthReportChart({
  accumulated,
  month,
  mode,
  points,
  scopeName,
  widgetColor = "#1267C4",
}: {
  accumulated: boolean;
  month: Date;
  mode: LiveOperationalSettings["monthComparison"];
  points: OperationalMonthComparisonPoint[];
  scopeName: string;
  widgetColor?: string;
}): ReportPayload["charts"][number] {
  const values = accumulated
    ? buildOperationalMonthCumulativePoints(points)
    : points;
  const title = accumulated ? "Acumulado diário x mês-base" : "Dias x meses";

  return {
    comparison: `${monthComparisonLabel(mode)} à esquerda · Mês atual à direita`,
    description: accumulated
      ? `Acumulados comparáveis nos mesmos dias, com fins de semana e feriados nacionais e de São Paulo destacados no eixo. Visão: ${scopeName}.`
      : `Valores diários, com fins de semana e feriados nacionais e de São Paulo destacados no eixo. Linha tracejada: ${averageBaseDescription(mode).toLowerCase()}. Visão: ${scopeName}.`,
    option: accumulated
      ? buildOperationalMonthCumulativeOption(points, mode, month, widgetColor)
      : buildOperationalMonthComparisonOption(points, mode, month, widgetColor),
    table: {
      title: `Dados - ${title}`,
      columns: [
        { key: "day", label: "Dia", width: 12 },
        {
          key: "baseline",
          label: accumulated
            ? `${monthComparisonLabel(mode)} acumulado`
            : monthComparisonLabel(mode),
          numeric: true,
          width: 28,
        },
        {
          key: "current",
          label: accumulated ? "Mês atual acumulado" : "Mês atual",
          numeric: true,
          width: 24,
        },
      ],
      rows: values.map((point) => ({
        baseline: point.baseline,
        current: point.current,
        day: point.day,
      })),
    },
    title,
  };
}

function buildOperationalTrendReportChart(
  points: OperationalTrendPoint[],
  scopeName: string,
  month: Date,
  widgetColor = "#9AAABD",
): ReportPayload["charts"][number] {
  const trend7 = movingAverageTrend(points, "average7");
  const trend30 = movingAverageTrend(points, "average30");

  return {
    comparison: `MM7 ${formatMovingAverageTrend(
      trend7,
    )} · MM30 ${formatMovingAverageTrend(trend30)}`,
    description: `Médias móveis de 7 e 30 dias atualizadas com o dia corrente parcial, exibidas no eixo mensal de 1 a 31 com fins de semana e feriados nacionais e de São Paulo destacados. Visão: ${scopeName}.`,
    option: buildOperationalTrendOption(
      points,
      trend7.direction,
      trend30.direction,
      month,
      widgetColor,
    ),
    table: {
      title: "Dados - Tendência 7 x 30 dias",
      columns: [
        { key: "date", label: "Dia do mês", width: 18 },
        { key: "total", label: "Volume", numeric: true, width: 18 },
        { key: "average7", label: "Média móvel 7d", numeric: true, width: 20 },
        { key: "average30", label: "Média móvel 30d", numeric: true, width: 20 },
      ],
      rows: points.map((point) => ({
        average30:
          point.average30 === null ? null : Math.round(point.average30 * 10) / 10,
        average7:
          point.average7 === null ? null : Math.round(point.average7 * 10) / 10,
        date: new Date(point.bucket).getDate(),
        total: point.total,
      })),
    },
    title: "Tendência 7 x 30 dias",
  };
}

function buildMonthlyAccessRankingReportChart(
  points: ScenarioComparisonPoint[],
  widgetColor = "#1267C4",
): ReportPayload["charts"][number] {
  const ranked = points.filter((point) => point.total > 0);
  const total = ranked.reduce((sum, point) => sum + point.total, 0);

  return {
    description: "Volume, participação e posição de cada cenário no mês em andamento.",
    option: buildMonthlyAccessRankingOption(ranked, widgetColor),
    table: {
      title: "Dados - Ranking dos acessos do mês",
      columns: [
        { key: "rank", label: "Posição", numeric: true, width: 12 },
        { key: "scenario", label: "Cenário", width: 36 },
        { key: "total", label: "Total", numeric: true, width: 18 },
        { key: "share", label: "Representatividade", width: 22 },
      ],
      rows: ranked.map((point, index) => ({
        rank: index + 1,
        scenario: point.name,
        share: new Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 1,
          style: "percent",
        }).format(total ? point.total / total : 0),
        total: point.total,
      })),
    },
    title: "Ranking dos acessos do mês",
  };
}

function buildScenarioRoseReportChart(
  points: ScenarioComparisonPoint[],
  scopeName: string,
  widgetColor = "#1267C4",
  title = "Composição por cenário",
  chartType: ScenarioCompositionChartType = "rose",
): ReportPayload["charts"][number] {
  const visiblePoints = points.filter((point) => point.total > 0);
  const total = visiblePoints.reduce((sum, point) => sum + point.total, 0);

  return {
    comparison: `${formatNumber(total)} eventos · ${scopeName}`,
    description: scenarioCompositionDescription(chartType),
    option: buildScenarioRoseOption(visiblePoints, widgetColor, chartType),
    table: {
      title: `Dados - ${title}`,
      columns: [
        { key: "scenario", label: "Cenário", width: 38 },
        { key: "total", label: "Total", numeric: true, width: 20 },
        { key: "share", label: "Representatividade", width: 22 },
      ],
      rows: visiblePoints.map((point) => ({
        scenario: point.name,
        share: new Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 1,
          style: "percent",
        }).format(total ? point.total / total : 0),
        total: point.total,
      })),
    },
    title,
  };
}

function renameReportChart(
  chart: ReportPayload["charts"][number],
  title: string,
): ReportPayload["charts"][number] {
  return {
    ...chart,
    table: {
      ...chart.table,
      title: `Dados - ${title}`,
    },
    title,
  };
}

function buildPeakDaysRankingReportChart(
  points: ScenarioPeakDayPoint[],
  scopeName: string,
  widgetColor = "#1267C4",
): ReportPayload["charts"][number] {
  return {
    comparison: points.length
      ? `Maior dia: ${points[0].label}, ${formatNumber(points[0].total)} eventos`
      : "Nenhum dia com fluxo no período",
    description: `Cinco dias com maior volume acumulado no mês em andamento. Visão: ${scopeName}.`,
    option: buildPeakDaysRankingOption(points, widgetColor),
    table: {
      title: "Dados - Top 5 dias de pico do mês",
      columns: [
        { key: "rank", label: "Posição", numeric: true, width: 12 },
        { key: "day", label: "Dia", width: 20 },
        { key: "total", label: "Volume", numeric: true, width: 18 },
      ],
      rows: points.map((point) => ({
        day: point.label,
        rank: point.rank,
        total: point.total,
      })),
    },
    title: "Top 5 dias de pico do mês",
  };
}

function buildTodayComparisonReportChart(
  title: string,
  description: string,
  points: ScenarioComparisonPoint[],
  widgetColor = "#1267C4",
): ReportPayload["charts"][number] {
  return {
    description,
    option: buildScenarioComparisonOption(points, widgetColor),
    table: {
      title: `Dados - ${title}`,
      columns: [
        { key: "name", label: "Visão", width: 38 },
        { key: "total", label: "Total hoje", numeric: true, width: 18 },
      ],
      rows: points.map((point) => ({ name: point.name, total: point.total })),
    },
    title,
  };
}

function alignToGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  if (granularity === "month") return startOfMonth(date);
  if (granularity === "semester") return startOfSemester(date);
  return startOfYear(date);
}

function alignEndToGranularity(date: Date, granularity: AggregateGranularity) {
  const aligned = alignToGranularity(date, granularity);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity);
}

function addGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") {
    return endOfAggregateBucket(date, "hour");
  }
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "month") return addMonths(date, 1);
  if (granularity === "semester") return addMonths(date, 6);
  return addYears(date, 1);
}

function bucketKeyForGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return startOfMinute(date).getTime();
  if (granularity === "hour") return startOfHour(date).getTime();
  if (granularity === "day") {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (granularity === "week") {
    const weekStart = startOfWeek(date);
    return Date.UTC(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate(),
    );
  }
  if (granularity === "month") {
    return Date.UTC(date.getFullYear(), date.getMonth(), 1);
  }
  if (granularity === "semester") {
    return Date.UTC(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
  }

  return Date.UTC(date.getFullYear(), 0, 1);
}

function bucketLabel(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return formatTime(date);
  if (granularity === "hour") return `${String(date.getHours()).padStart(2, "0")}h`;
  if (granularity === "day") {
    const dayMonth = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);

    return `${weekdayShortName(date)} ${dayMonth}`;
  }
  if (granularity === "week") return weekOfMonthLabel(date);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function weekOfMonthLabel(date: Date) {
  const monthGridStart = startOfWeek(startOfMonth(date));
  const index =
    Math.max(
      0,
      Math.round(
        (startOfWeek(date).getTime() - monthGridStart.getTime()) / (7 * DAY_MS),
      ),
    ) + 1;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(date)
    .replace(".", "");

  return `${index}ª sem. ${month}`;
}

function weekdayShortName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
}

function operationalComparisonDayStart(
  now: Date,
  mode: LiveOperationalSettings["intradayComparison"],
) {
  return addDays(startOfDay(now), mode === "last_week" ? -7 : -1);
}

function intradayComparisonSeriesLabel(
  mode: LiveOperationalSettings["intradayComparison"],
) {
  return mode === "last_week" ? "Mesmo dia, semana anterior" : "Ontem";
}

function monthComparisonLabel(
  mode: LiveOperationalSettings["monthComparison"],
) {
  return mode === "last_year" ? "Mesmo mês do ano anterior" : "Mês anterior";
}

function averageBaseDescription(
  mode: LiveOperationalSettings["monthComparison"],
) {
  return mode === "last_year"
    ? "Média dos dias do mesmo mês do ano anterior"
    : "Média dos dias do mês anterior";
}

function hourRangeLabel(hour: number) {
  const start = String(Math.max(0, Math.min(23, hour))).padStart(2, "0");
  const end = String(Math.max(1, Math.min(24, hour + 1))).padStart(2, "0");
  return `${start}h–${end}h`;
}

function percentageDelta(current: number, previous: number) {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

function formatDelta(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Sem base";
  const signal = value > 0 ? "+" : "";
  return `${signal}${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value)}`;
}

function formatMovingAverageTrend(
  trend: ReturnType<typeof movingAverageTrend>,
) {
  if (trend.current === null) return "Sem base";

  const currentValue = formatNumber(
    Math.round((trend.current + Number.EPSILON) * 10) / 10,
  );
  if (trend.delta !== null) {
    return `${currentValue} · ${formatDelta(trend.delta)}`;
  }
  if (trend.previous === null) return currentValue;
  if (trend.direction > 0) return `${currentValue} · em alta`;
  if (trend.direction < 0) return `${currentValue} · em queda`;
  return `${currentValue} · estável`;
}

function formatRealtimeReportDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function realtimeReportDateSlug(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
    String(value.getHours()).padStart(2, "0"),
    String(value.getMinutes()).padStart(2, "0"),
  ].join("-");
}

function daysInCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function comparableMonthEnd(monthStart: Date, completedDayCount: number) {
  const requestedEnd = addDays(monthStart, Math.max(0, completedDayCount));
  const monthEnd = addMonths(monthStart, 1);
  return requestedEnd < monthEnd ? requestedEnd : monthEnd;
}

function startOfMinute(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function startOfHour(date: Date) {
  return startOfAggregateBucket(date, "hour");
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfSemester(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
