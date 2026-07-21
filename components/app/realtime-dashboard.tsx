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
import {
  useWidgetChartType,
  useWidgetColor,
} from "@/components/app/widget-appearance";
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
import { hasVisualAdminAccess } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import {
  aggregateBucketInRange,
  aggregateQueryIso,
  parseAggregateBucket,
} from "@/lib/aggregate-time";
import {
  CAMERA_GROUPS_UPDATED_EVENT,
  type CameraGroup,
  type WorkerLocationAssignments,
  buildWorkerBackedLocationOptions,
  buildSubLocationCameraOptions,
  readCameraGroups,
  readWorkerLocationAssignments,
  resolveCameraGroupCompanyScope,
} from "@/lib/camera-groups";
import {
  filterScopedApiRows,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
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
import {
  monochromeHeatmapPalette,
  pastelBarColor,
} from "@/lib/chart-palette";
import {
  buildScenarioCompositionOption,
  normalizeScenarioCompositionChartType,
  scenarioCompositionDescription,
  type ScenarioCompositionChartType,
} from "@/lib/chart-composition";
import { buildHourlyOccupancyOption } from "@/lib/hourly-occupancy-chart";
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
  COUNTING_MONTH_LABELS,
} from "@/lib/counting-intelligence";
import type {
  ReportMetric,
  ReportPayload,
  ReportTable,
} from "@/lib/report-export";
import {
  buildCombinedScenarioPoints,
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
  normalizeWorkerRows,
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

type ChartPoint = {
  bucket: string;
  label: string;
  total: number;
};

type AggregateIdentityTotal = {
  cameraId: string;
  lineCountId: string;
  metricType: string;
  objectClass: string;
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

type CurrentYearMonthPoint = {
  accumulated: number | null;
  label: string;
  month: number;
  value: number | null;
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
const RECENT_DAY_RECONCILIATION_COUNT = 3;
const DEFAULT_METRIC_TYPE = "count";
const CURRENT_MONTH_DAYS_ID = "live_current_month_days";
const OPERATIONAL_COMPARISON_HOURS_ID = "live_operational_comparison_hours";
const OPERATIONAL_PREVIOUS_MONTH_ID = "live_operational_previous_month";
const OPERATIONAL_LAST_YEAR_MONTH_ID = "live_operational_last_year_month";
const OPERATIONAL_TREND_DAYS_ID = "live_operational_trend_days";
const OPERATIONAL_MONTH_HOURS_ID = "live_operational_month_hours";
const OCCUPANCY_HOURS_ID = "live_hourly_occupancy_data";
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
  const companyScopeId = companyIdOverride?.trim() || storedCompanyScopeId;
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
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
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
  const runningRef = React.useRef(false);
  const hasLoadedChartsRef = React.useRef(false);

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
  const hourState = chartData.live_chart_hour;
  const hourRows = hourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const occupancyHourState = chartData[OCCUPANCY_HOURS_ID];
  const occupancyHourRows =
    occupancyHourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const monthRows = chartData.live_chart_month?.rows ?? EMPTY_AGGREGATE_ROWS;
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
  const baselineMonthDayRows =
    operationalSettings.monthComparison === "last_year"
      ? lastYearMonthDayRows
      : previousMonthDayRows;
  const baselineMonthDayGranularity =
    operationalSettings.monthComparison === "last_year"
      ? lastYearMonthDayState?.granularity ?? "day"
      : previousMonthDayState?.granularity ?? "day";

  const loadScenarios = React.useCallback(async () => {
    setLoadingScenarios(true);
    try {
      const [data, cameraRows, locationRows, workerRows] = await Promise.all([
        apiFetch<Scenario[]>("/scenarios"),
        apiFetch<Camera[]>("/cameras").catch(() => []),
        apiFetch<Location[]>("/locations").catch(() => []),
        fetchRealtimeWorkers(companyScopeId).catch(() => []),
      ]);
      const scopedScenarios = filterScopedApiRows(data, companyScopeId);
      const scopedCameras = filterScopedApiRows(cameraRows, companyScopeId);
      const scopedLocations = filterScopedApiRows(locationRows, companyScopeId);
      const subLocationRows = await fetchSubLocations(
        scopedLocations,
        companyScopeId,
      );
      const visible = manager
        ? scopedScenarios
        : scopedScenarios.filter((scenario) => scenario.active);

      setScenarios(visible);
      setCameras(scopedCameras);
      setLocations(scopedLocations);
      setSubLocations(subLocationRows);
      setWorkers(workerRows);
      const modes = buildRealtimeScopeModes({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        scenarios: visible,
        subLocations: subLocationRows,
        workerLocationAssignments,
        workers: workerRows,
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
        workers: workerRows,
      });

      if (nextMode !== scopeMode) setScopeMode(nextMode);
      setSelectedId((current) => {
        if (current && options.some((option) => option.id === current)) {
          return current;
        }

        return options[0]?.id ?? "";
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as visões de contagem.",
      );
    } finally {
      setLoadingScenarios(false);
    }
  }, [
    cameraGroups,
    companyScopeId,
    manager,
    scopeMode,
    workerLocationAssignments,
  ]);

  const loadCharts = React.useCallback(
    async ({ force = false, silent = false }: LoadOptions = {}) => {
      if (!companyScopeId) {
        setChartData({});
        setLoadingCharts(false);
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
      const visibleDefinitionIds = new Set(definitions.map((definition) => definition.id));
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
        buildHourlyOccupancyDataDefinition(
          now,
          operationalSettings.occupancyStartHour,
        ),
      ];
      try {
        const entries = await Promise.all(
          [...definitions, ...supportDefinitions].map(async (definition) => {
            try {
              const response = await apiFetch<AggregateEventsResponse>(
                aggregatePath(definition),
                { signal: controller.signal },
              );
              const state: RealtimeChartState = {
                rows: response.data ?? [],
                granularity: response.granularity ?? definition.granularity,
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

        const nextData = hydrateRealtimeOpenBuckets(Object.fromEntries(entries), now);
        const refreshedAt = new Date();

        setChartData(nextData);
        setClock(now);
        setLastUpdated(refreshedAt);
        setHasLoadedCharts(true);
        hasLoadedChartsRef.current = true;

        if (
          entries.some(([id, state]) => visibleDefinitionIds.has(id) && state.error) &&
          !silentLoad
        ) {
          toast.error("Alguns dados ao vivo não puderam ser carregados.");
        }
      } catch (error) {
        if (!isAbortError(error)) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados ao vivo.",
          );
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
      companyScopeId,
      operationalSettings.intradayComparison,
      operationalSettings.occupancyStartHour,
    ],
  );

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  React.useEffect(() => {
    function syncCameraGroups() {
      const scopeId = resolveCameraGroupCompanyScope(user);
      setCameraGroups(readCameraGroups(scopeId));
      setWorkerLocationAssignments(readWorkerLocationAssignments(scopeId));
    }

    syncCameraGroups();
    window.addEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);

    return () => {
      window.removeEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);
    };
  }, [user]);

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
  }, [companyScopeId, initialScopeId, initialScopeMode]);

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
        previousMonthDayState?.granularity ?? "day",
      )
    : 0;
  const lastYearMonthComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        lastYearMonthDayRows,
        selectedScope,
        lastYearMonthStart,
        comparableMonthEnd(lastYearMonthStart, completedMonthDayCount),
        lastYearMonthDayState?.granularity ?? "day",
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
      buildCombinedScenarioPoints({
        from: startOfMonth(clock),
        granularity: "hour",
        rows: operationalMonthHourRows,
        scenarios: heatmapScenarios,
        sourceGranularity: operationalMonthHourState?.granularity ?? "hour",
        to: addHours(startOfHour(clock), 1),
      }).map((point) => {
        const bucket = new Date(point.bucket);
        return {
          bucket: point.bucket,
          day: bucket.getDate(),
          hour: bucket.getHours(),
          total: point.total,
        };
      }),
    [
      clock,
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
  const currentYearMonthPoints = React.useMemo(
    () =>
      selectedScope
        ? buildCurrentYearMonthPoints(monthRows, selectedScope, clock)
        : [],
    [clock, monthRows, selectedScope],
  );
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
      label: "Hoje em tempo real",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
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
  ];

  const operationalComparisonDefinition =
    buildOperationalComparisonHoursDefinition(
      clock,
      operationalSettings.intradayComparison,
    );
  const hourlyDefinition = chartDefinitions.find(
    (definition) => definition.id === "live_chart_hour",
  );
  const operationalCards = [
    {
      id: "live_chart_hour",
      chartTypeEnabled: true,
      label: "Hora a Hora",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
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
      node: (
        <OperationalTrendCard
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
      standardHeightClassName: "row-span-4 sm:row-span-2",
      tallHeightClassName: "row-span-4 sm:row-span-3",
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
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: (
        <CurrentYearComparisonCard
          accumulated={false}
          loading={initialLoading}
          points={currentYearMonthPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
          year={clock.getFullYear()}
        />
      ),
    },
    {
      id: "live_current_year_accumulated",
      chartTypeEnabled: true,
      label: "Comparativo acumulado por ano",
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: (
        <CurrentYearComparisonCard
          accumulated
          loading={initialLoading}
          points={currentYearMonthPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
          year={clock.getFullYear()}
        />
      ),
    },
    {
      id: "live_month_hour_heatmap",
      label: "Mapa de calor dia x hora",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
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
  ];
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
  ].filter((card): card is NonNullable<typeof card> => Boolean(card));

  const customWidgetCards = customWidgets.map((widget) => {
    if (widget.kind === "scenario_comparison") {
      return {
        id: `live_custom_${widget.id}`,
        chartTypeEnabled: true,
        label: widget.title,
        defaultSize: "full" as const,
        className: "sm:col-span-2 xl:col-span-4",
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
        label: widget.title,
        defaultHeight:
          widget.widgetType === "heatmap" || widget.widgetType === "totals_table"
            ? ("tall" as const)
            : ("standard" as const),
        defaultSize:
          widget.widgetType === "heatmap" || widget.widgetType === "totals_table"
            ? ("full" as const)
            : ("wide" as const),
        standardHeightClassName:
          widget.widgetType === "totals_table"
            ? "row-span-4 sm:row-span-2"
            : undefined,
        tallHeightClassName:
          widget.widgetType === "totals_table"
            ? "row-span-4 sm:row-span-3"
            : undefined,
        node: (
          <CustomScenarioWidgetCard
            canConfigure={canEditVisual}
            clock={clock}
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
      label: widget.title,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
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
        label: "Hoje até agora",
        value: todayTotal,
      },
    ],
    [
      "live_target_progress",
      {
        description: averageBaseDescription(
          operationalSettings.monthComparison,
        ),
        label: "Hoje x média-base",
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
        label: "Acumulado x mês anterior",
        value: currentMonthRealtimeTotal,
      },
    ],
    [
      "live_month_year_comparison",
      {
        description: `${formatDelta(lastYearMonthDelta)} contra ${formatNumber(
          lastYearMonthComparableTotal,
        )} até o último dia fechado do ano anterior`,
        label: "Acumulado x ano anterior",
        value: currentMonthRealtimeTotal,
      },
    ],
  ]);

  const liveChartEntries: Array<
    readonly [string, ReportPayload["charts"][number]]
  > = [];
  if (selectedScope && hourlyDefinition) {
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
    liveChartEntries.push([
      "live_current_year_monthly",
      buildCurrentYearComparisonReportChart({
        accumulated: false,
        points: currentYearMonthPoints,
        scopeName: selectedScope.name,
        widgetColor: liveColorByCardId.get("live_current_year_monthly"),
        year: clock.getFullYear(),
      }),
    ]);
    liveChartEntries.push([
      "live_current_year_accumulated",
      buildCurrentYearComparisonReportChart({
        accumulated: true,
        points: currentYearMonthPoints,
        scopeName: selectedScope.name,
        widgetColor: liveColorByCardId.get("live_current_year_accumulated"),
        year: clock.getFullYear(),
      }),
    ]);
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
        const points = buildCombinedScenarioPoints({
          from: monthStart,
          granularity: "hour",
          rows: operationalMonthHourRows,
          scenarios: selectedScenarios,
          sourceGranularity: operationalMonthHourState?.granularity ?? "hour",
          to: addHours(startOfHour(clock), 1),
        }).map((point) => {
          const bucket = new Date(point.bucket);
          return {
            bucket: point.bucket,
            day: bucket.getDate(),
            hour: bucket.getHours(),
            total: point.total,
          };
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
        {
          ...chart,
          option: applyChartTypePreference(
            chart.option,
            liveChartTypeByCardId.get(cardId),
          ),
        },
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
        .map((id) => liveTableByCardId.get(id))
        .filter((table): table is ReportTable => Boolean(table)),
    };
  }

  async function buildConfiguredLiveReportPayload() {
    const chartByCardId = new Map(configuredLiveChartEntries);

    await Promise.all(
      customWidgets
        .filter(
          (widget) =>
            widget.kind === "scenario_comparison" &&
            visibleLiveCardIds.includes(`live_custom_${widget.id}`),
        )
        .map(async (widget) => {
          try {
            const cardId = `live_custom_${widget.id}`;
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
            const rows = await fetchScenarioComparisonRows(definition);
            const reportChart = buildScenarioComparisonReportChart({
                definition,
                rows,
                scenarios,
                settings,
                title: widget.title,
                widgetColor: liveColorByCardId.get(cardId),
              });
            chartByCardId.set(
              cardId,
              {
                ...reportChart,
                option: applyChartTypePreference(
                  reportChart.option,
                  liveChartTypeByCardId.get(cardId),
                ),
              },
            );
          } catch {
            // Preserva os demais widgets caso um comparativo isolado falhe.
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
        monitorMode
          ? "fixed inset-0 z-[100] h-screen overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "scroll-mt-6 space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Ao vivo
            </div>
            <div className="truncate text-lg font-semibold">
              {selectedScope?.name ?? "Visão selecionada"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
      <div className="rounded-md border border-border bg-card p-4 shadow-soft">
        {loadingScenarios ? (
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        ) : scopeOptions.length ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="text-sm font-medium">Visão</div>
                <Select
                  value={scopeMode}
                  onValueChange={(value) => {
                    setScopeMode(value as RealtimeScopeMode);
                    setSelectedId("");
                  }}
                >
                  <SelectTrigger className="bg-card">
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
              <div className="min-w-0 space-y-2">
                <div className="text-sm font-medium">{scopeModeLabel(scopeMode)}</div>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger className="bg-card">
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 bg-primary/10 text-primary"
              >
                <Zap className="h-3.5 w-3.5" />
                5 segundos
              </Badge>
              {lastUpdated ? (
                <Badge variant="outline" className="gap-1 bg-card">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatTime(lastUpdated)}
                </Badge>
              ) : null}
              <ReportExportActions
                disabled={initialLoading || !selectedScope}
                getPayload={buildConfiguredLiveReportPayload}
                payload={liveReportPayload}
              />
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
              <Button
                type="button"
                variant={operationalSettingsOpen ? "default" : "outline"}
                onClick={() =>
                  setOperationalSettingsOpen((current) => !current)
                }
              >
                <Target className="h-4 w-4" />
                Bases de comparação
              </Button>
              <MonitorModeButton
                onClick={enterMonitorMode}
                disabled={!scopeOptions.length}
              />
            </div>
            </div>
            {operationalSettingsOpen ? (
              <div className="grid gap-3 rounded-md border bg-muted/15 p-3 md:grid-cols-2 md:items-end">
                <div className="space-y-1.5">
                  <Label>Comparação intradiária</Label>
                  <Select
                    value={operationalSettings.intradayComparison}
                    onValueChange={(value) =>
                      updateOperationalSettings({
                        intradayComparison:
                          value as LiveOperationalSettings["intradayComparison"],
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yesterday">Ontem</SelectItem>
                      <SelectItem value="last_week">
                        Mesmo dia da semana anterior
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Base das médias e comparativos</Label>
                  <Select
                    value={operationalSettings.monthComparison}
                    onValueChange={(value) =>
                      updateOperationalSettings({
                        monthComparison:
                          value as LiveOperationalSettings["monthComparison"],
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="previous_month">Mês anterior</SelectItem>
                      <SelectItem value="last_year">
                        Mesmo mês do ano anterior
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end md:col-span-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setOperationalSettingsOpen(false)}
                  >
                    Concluir
                  </Button>
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

      {scopeOptions.length ? (
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
              <Label>Tipo de widget</Label>
              <Select
                value={customWidgetForm.kind}
                onValueChange={handleCustomWidgetKindChange}
              >
                <SelectTrigger>
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
                    <Label>Tipo de visão</Label>
                    <Select
                      value={customWidgetForm.scopeMode}
                      onValueChange={handleCustomWidgetModeChange}
                    >
                      <SelectTrigger>
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
                    <Label>{scopeModeLabel(customWidgetForm.scopeMode)}</Label>
                    <Select
                      value={customWidgetForm.scopeId}
                      onValueChange={handleCustomWidgetScopeChange}
                      disabled={!customWidgetScopeOptions.length}
                    >
                      <SelectTrigger>
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
                  <Label>Gráfico</Label>
                  <Select
                    value={customWidgetForm.granularity}
                    onValueChange={handleCustomWidgetGranularityChange}
                  >
                    <SelectTrigger>
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
                  <Label>Modelo</Label>
                  <Select
                    value={customWidgetForm.scenarioWidgetType}
                    onValueChange={handleScenarioWidgetTypeChange}
                  >
                    <SelectTrigger>
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
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: {
  comparison?: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading: boolean;
  tone: "primary" | "sky" | "indigo" | "slate";
  value: number | string;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary ring-primary/20",
    sky: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    indigo:
      "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
    slate: "bg-muted text-muted-foreground ring-border",
  }[tone];

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="flex h-full min-h-0 items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <div className="text-3xl font-semibold leading-none tabular-nums">
                {typeof value === "number" ? formatNumber(value) : value}
              </div>
              {comparison ? (
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    metricComparisonClassName(comparison),
                  )}
                >
                  {comparison}
                </div>
              ) : null}
            </div>
          )}
          <div className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
            {description}
          </div>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1",
            toneClass,
          )}
        >
          <Icon className="h-5 w-5" />
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {definition.label}
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="w-fit bg-primary/10 text-primary">
              {scope.name}
            </Badge>
            {action}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
        ) : hasData ? (
          <div className="h-[300px] w-full">
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Hora a Hora
            </CardTitle>
            <CardDescription className="mt-1">
              Base histórica à esquerda e hoje à direita. Linha tracejada: {averageDescription.toLowerCase()} convertida em média horária.
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary">
            {scope.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
        ) : hasData ? (
          <EChart option={option} className="h-[300px]" />
        ) : (
          <EmptyChartState
            className="h-[300px]"
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
      buildCombinedScenarioPoints({
        from: monthStart,
        granularity: "hour",
        rows: monthHourRows,
        scenarios: selectedScenarios,
        sourceGranularity: monthHourGranularity,
        to: addHours(startOfHour(clock), 1),
      }).map((point) => {
        const bucket = new Date(point.bucket);
        return {
          bucket: point.bucket,
          day: bucket.getDate(),
          hour: bucket.getHours(),
          total: point.total,
        };
      }),
    [clock, monthHourGranularity, monthHourRows, monthStart, selectedScenarios],
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
    <div className="flex items-center gap-0.5">
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
    </div>
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              Intensidade do fluxo nas 24 faixas horárias e nos dias 1 a 31
              do mês atual; fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="max-w-full truncate">
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
            {action}
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
          <Skeleton className="h-[500px] w-full" />
        ) : error ? (
          <EmptyChartState className="h-[260px]" text={error} />
        ) : hasData ? (
          <EChart option={option} className="h-[500px]" />
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
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-primary" />
              Ocupação hora a hora
            </CardTitle>
            <CardDescription className="mt-1">
              Saldo acumulado diariamente a partir de
              {` ${formatOccupancyStartHour(startHour)}`}: entradas menos saídas.
              Antes desse horário, o saldo permanece zerado.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
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
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Configurar ocupação"
                title="Configurar ocupação"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {settingsOpen && !monitorMode ? (
          <div className="space-y-3 rounded-md border bg-muted/10 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Associação direcional
                </div>
                <div className="text-sm font-semibold">
                  {selectionMode === "auto"
                    ? "Detectada pelos nomes e linhas"
                    : "Seleção manual por cenário"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-[240px]">
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
            <div className="max-w-[220px] space-y-1.5">
              <Label>Início da contagem</Label>
              <Select
                value={String(startHour)}
                onValueChange={(value) => onStartHourChange(Number(value))}
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
            {selectionMode === "custom" ? (
              <div className="grid gap-3 xl:grid-cols-2">
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
        ) : null}
        {!hasSelection ? (
          <EmptyChartState
            className="h-[220px]"
            text="Configure ao menos um cenário de entrada ou de saída."
          />
        ) : loading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : error ? (
          <EmptyChartState className="h-[220px]" text={error} />
        ) : hasData ? (
          <EChart option={option} className="h-[320px]" />
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
    () => buildScenarioCumulativeTotalsOption(orderedPoints, widgetColor),
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sigma className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              Total combinado e acumulado individual de hoje. A hora atual é
              parcial e atualiza a cada 5 segundos.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
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
            {action}
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
          <Skeleton className="h-[320px] w-full" />
        ) : orderedPoints.some((point) => point.total > 0) ? (
          <EChart option={option} className="h-[320px]" />
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Table2 className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              Totais de hoje e do mês atual, linha por linha, incluindo os
              períodos parciais.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
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
            {action}
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
            <Table className="min-w-[640px]">
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
                    <TableCell className="max-w-[360px] font-medium">
                      <span className="block truncate" title={row.name}>
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

function CurrentYearComparisonCard({
  accumulated,
  loading,
  points,
  scopeName,
  year,
}: {
  accumulated: boolean;
  loading: boolean;
  points: CurrentYearMonthPoint[];
  scopeName: string;
  year: number;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildCurrentYearComparisonOption(points, accumulated, year, widgetColor),
    [accumulated, points, widgetColor, year],
  );
  const values = points.flatMap((point) => {
    const value = accumulated ? point.accumulated : point.value;
    return value === null ? [] : [value];
  });
  const total = accumulated
    ? values.at(-1) ?? 0
    : values.reduce((sum, value) => sum + value, 0);
  const title = accumulated
    ? "Comparativo acumulado por ano"
    : "Comparativo mensal por ano";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              {accumulated ? (
                <TrendingUp className="h-4 w-4 text-primary" />
              ) : (
                <CalendarDays className="h-4 w-4 text-primary" />
              )}
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              {accumulated
                ? "Soma progressiva dos meses do ano atual."
                : "Meses do ano atual com média mensal tracejada."} {scopeName}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{year}</Badge>
            <Badge variant="secondary" className="tabular-nums">
              Total {formatNumber(total)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : values.length ? (
          <EChart option={option} className="h-[320px]" />
        ) : (
          <EmptyChartState
            className="h-[220px]"
            text={`Sem valores mensais em ${year} para esta visão.`}
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
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Dias x meses
            </CardTitle>
            <CardDescription className="mt-1">
              {monthComparisonLabel(mode)} à esquerda e mês atual à direita. Linha tracejada: {averageBaseDescription(mode).toLowerCase()}. Fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <Badge variant="outline" className="max-w-full truncate">
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
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Acumulado diário x mês-base
            </CardTitle>
            <CardDescription className="mt-1">
              Evolução acumulada nos mesmos dias: {monthComparisonLabel(mode).toLowerCase()} à esquerda e mês atual à direita. Fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <Badge variant="outline" className="max-w-full truncate">
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
  loading,
  month,
  points,
  scopeName,
}: {
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
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tendência 7 x 30 dias
            </CardTitle>
            <CardDescription className="mt-1">
              Dia atual parcial incluído e atualizado a cada 5 segundos. Eixo de 1 a 31; fins de semana e feriados nacionais e de São Paulo destacados.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TrendBadge label="MM7" trend={trend7} />
            <TrendBadge label="MM30" trend={trend30} />
            <Badge variant="outline" className="max-w-full truncate">
              {scopeName}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : hasData ? (
          <EChart option={option} className="h-[300px]" />
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ChartPie className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              {scenarioCompositionDescription(chartType)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {action}
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
          <Skeleton className="h-[320px] w-full" />
        ) : visiblePoints.length ? (
          <EChart option={option} className="h-[320px]" />
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              Volume e representatividade de cada cenário no mês em andamento.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {action}
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
          <Skeleton className="h-[300px] w-full" />
        ) : rankedPoints.length ? (
          <EChart option={option} className="h-[300px]" />
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              Dias com maior volume acumulado nos cenários escolhidos; o dia
              atual é parcial e acompanha a atualização ao vivo.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {action}
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
          <Skeleton className="h-[300px] w-full" />
        ) : points.length ? (
          <EChart option={option} className="h-[300px]" />
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {title || "Widget personalizado"}
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : points.length ? (
          <div className="h-[300px] w-full">
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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Selecione um cenário para ver o ao vivo.</CardDescription>
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
        "flex h-[300px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {text}
    </div>
  );
}

function buildRealtimeChartDefinitions(now: Date): RealtimeChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = addHours(startOfHour(now), 1);
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
    description: "Base diária auxiliar do comparativo mensal operacional.",
    granularity: "day",
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
  const recentDayStart = addDays(
    startOfDay(now),
    1 - RECENT_DAY_RECONCILIATION_COUNT,
  );

  return {
    id: OPERATIONAL_MONTH_HOURS_ID,
    label: "Mapa de calor dia x hora",
    description: "Distribuição horária do fluxo no mês em andamento.",
    granularity: "hour",
    from: recentDayStart < currentMonthStart ? recentDayStart : currentMonthStart,
    to: addHours(startOfHour(now), 1),
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
  now: Date,
) {
  const next = Object.fromEntries(
    Object.entries(data).map(([id, state]) => [
      id,
      { ...state, rows: [...state.rows] },
    ]),
  ) as Record<string, RealtimeChartState>;

  const currentHourStart = startOfHour(now);
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);

  replaceBucketRowsFromSource(
    next,
    "live_chart_hour",
    "hour",
    currentHourStart,
    addHours(currentHourStart, 1),
    next.live_chart_minute?.rows ?? [],
    "minute",
  );
  replaceBucketRowsFromSource(
    next,
    OCCUPANCY_HOURS_ID,
    "hour",
    currentHourStart,
    addHours(currentHourStart, 1),
    next.live_chart_minute?.rows ?? [],
    "minute",
  );
  replaceBucketRowsFromSource(
    next,
    OPERATIONAL_MONTH_HOURS_ID,
    "hour",
    currentHourStart,
    addHours(currentHourStart, 1),
    next.live_chart_minute?.rows ?? [],
    "minute",
  );
  replaceBucketRowsFromSource(
    next,
    "live_chart_day",
    "day",
    todayStart,
    addDays(todayStart, 1),
    next.live_chart_hour?.rows ?? [],
    "hour",
  );
  replaceBucketRowsFromSource(
    next,
    CURRENT_MONTH_DAYS_ID,
    "day",
    todayStart,
    addDays(todayStart, 1),
    next.live_chart_hour?.rows ?? [],
    "hour",
  );
  replaceBucketRowsFromSource(
    next,
    OPERATIONAL_TREND_DAYS_ID,
    "day",
    todayStart,
    addDays(todayStart, 1),
    next.live_chart_hour?.rows ?? [],
    "hour",
  );

  const recentDayStart = addDays(
    todayStart,
    1 - RECENT_DAY_RECONCILIATION_COUNT,
  );
  const tomorrowStart = addDays(todayStart, 1);
  const monthHourRows = next[OPERATIONAL_MONTH_HOURS_ID]?.rows ?? [];
  replaceDailyBucketsFromHourlySource(
    next,
    "live_chart_day",
    recentDayStart,
    tomorrowStart,
    monthHourRows,
  );
  replaceDailyBucketsFromHourlySource(
    next,
    OPERATIONAL_TREND_DAYS_ID,
    recentDayStart,
    tomorrowStart,
    monthHourRows,
  );
  replaceDailyBucketsFromHourlySource(
    next,
    CURRENT_MONTH_DAYS_ID,
    recentDayStart < currentMonthStart ? currentMonthStart : recentDayStart,
    tomorrowStart,
    monthHourRows,
  );

  if (recentDayStart < currentMonthStart) {
    replaceDailyBucketsFromHourlySource(
      next,
      OPERATIONAL_PREVIOUS_MONTH_ID,
      recentDayStart,
      currentMonthStart,
      monthHourRows,
    );
  }

  replaceBucketRowsFromSource(
    next,
    "live_chart_week",
    "week",
    currentWeekStart,
    addDays(currentWeekStart, 7),
    next.live_chart_day?.rows ?? [],
    "day",
  );
  replaceBucketRowsFromSource(
    next,
    "live_chart_month",
    "month",
    currentMonthStart,
    addMonths(currentMonthStart, 1),
    next[CURRENT_MONTH_DAYS_ID]?.rows ?? [],
    "day",
  );
  const previousMonthStart = addMonths(currentMonthStart, -1);
  replaceBucketRowsFromSource(
    next,
    "live_chart_month",
    "month",
    previousMonthStart,
    currentMonthStart,
    next[OPERATIONAL_PREVIOUS_MONTH_ID]?.rows ?? [],
    "day",
  );

  return next;
}

function replaceDailyBucketsFromHourlySource(
  data: Record<string, RealtimeChartState>,
  targetId: string,
  from: Date,
  to: Date,
  sourceRows: AggregateEventRow[],
) {
  let cursor = startOfDay(from);

  while (cursor < to) {
    const nextDay = addDays(cursor, 1);
    replaceBucketRowsFromSource(
      data,
      targetId,
      "day",
      cursor,
      nextDay,
      sourceRows,
      "hour",
    );
    cursor = nextDay;
  }
}

function replaceBucketRowsFromSource(
  data: Record<string, RealtimeChartState>,
  targetId: string,
  targetGranularity: AggregateGranularity,
  from: Date,
  to: Date,
  sourceRows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
) {
  const target = data[targetId];
  if (!target) return;

  const fromKey = bucketKeyForGranularity(from, targetGranularity);
  const existingTotals = aggregateRowsByIdentity(
    target.rows,
    targetGranularity,
    from,
    to,
  );
  const sourceTotals = aggregateRowsByIdentity(
    sourceRows,
    sourceGranularity,
    from,
    to,
  );
  const mergedTotals = mergeIdentityTotals(existingTotals, sourceTotals);
  if (!mergedTotals.size) return;

  const replacementRows = Array.from(mergedTotals.values()).map((identity) =>
    createAggregateRow(from, identity),
  );

  target.rows = [
    ...target.rows.filter((row) => {
      const date = parseAggregateBucket(row.bucket, targetGranularity);
      return (
        !date ||
        bucketKeyForGranularity(date, targetGranularity) !== fromKey
      );
    }),
    ...replacementRows,
  ];
}

function aggregateRowsByIdentity(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const totals = new Map<string, AggregateIdentityTotal>();
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const fromKey = bucketKeyForGranularity(from, granularity);
  const toKey = bucketKeyForGranularity(to, granularity);

  rows.forEach((row) => {
    const identity = rowIdentity(row);
    if (!identity.cameraId && !identity.lineCountId) return;

    const bucket = parseAggregateBucket(row.bucket, granularity);
    if (!bucket) return;

    const inRange =
      granularity === "minute" || granularity === "hour"
        ? bucket.getTime() >= fromTime && bucket.getTime() < toTime
        : bucketKeyForGranularity(bucket, granularity) >= fromKey &&
          bucketKeyForGranularity(bucket, granularity) < toKey;
    if (!inRange) return;

    const key = rowIdentityKey(identity);
    const current = totals.get(key);
    totals.set(key, {
      ...identity,
      total: (current?.total ?? 0) + (row.total ?? 0),
    });
  });

  return totals;
}

function mergeIdentityTotals(
  existingTotals: Map<string, AggregateIdentityTotal>,
  sourceTotals: Map<string, AggregateIdentityTotal>,
) {
  const merged = new Map<string, AggregateIdentityTotal>();
  const keys = new Set([...existingTotals.keys(), ...sourceTotals.keys()]);

  keys.forEach((key) => {
    const existing = existingTotals.get(key);
    const source = sourceTotals.get(key);
    const identity = source ?? existing;
    if (!identity) return;

    merged.set(key, {
      ...identity,
      total: Math.max(existing?.total ?? 0, source?.total ?? 0),
    });
  });

  return merged;
}

function rowIdentity(row: AggregateEventRow): Omit<AggregateIdentityTotal, "total"> {
  return {
    cameraId: row.camera_id ?? "",
    lineCountId: row.line_count_id ?? "",
    metricType: row.metric_type ?? DEFAULT_METRIC_TYPE,
    objectClass: row.object_class ?? "",
  };
}

function rowIdentityKey(identity: Omit<AggregateIdentityTotal, "total">) {
  return [
    identity.cameraId,
    identity.lineCountId,
    identity.metricType,
    identity.objectClass,
  ].join("|");
}

function createAggregateRow(
  bucket: Date,
  identity: AggregateIdentityTotal,
): AggregateEventRow {
  return {
    bucket: bucket.toISOString(),
    camera_id: identity.cameraId,
    line_count_id: identity.lineCountId || undefined,
    metric_type: identity.metricType || DEFAULT_METRIC_TYPE,
    object_class: identity.objectClass || undefined,
    total: identity.total,
  };
}

async function fetchSubLocations(
  locations: Location[],
  companyScopeId?: string | null,
) {
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<SubLocation[]>(`/locations/${location.id}/sub-locations`).catch(
        () => [],
      ),
    ),
  );

  return filterScopedApiRows(rows.flat(), companyScopeId);
}

async function fetchRealtimeWorkers(companyId?: string | null) {
  const rows = await apiFetch<unknown>("/workers").then((response) =>
    normalizeWorkerRows(response),
  );
  const { scopedRows } = partitionWorkersByCompanyScope(rows, companyId);
  return sortWorkersByActivity(collapseWorkerIdentityChains(scopedRows));
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

function buildCurrentYearMonthPoints(
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  clock: Date,
): CurrentYearMonthPoint[] {
  const totals = aggregateScopeRowsByBucket(rows, scope, "month");
  const year = clock.getFullYear();
  const currentMonth = clock.getMonth();
  let accumulated = 0;

  return COUNTING_MONTH_LABELS.map((label, month) => {
    const key = Date.UTC(year, month, 1);
    const value = month <= currentMonth && totals.has(key)
      ? totals.get(key) ?? 0
      : null;

    if (value !== null) accumulated += value;

    return {
      accumulated: value === null ? null : accumulated,
      label,
      month,
      value,
    };
  });
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
        interval:
          currentPoints.length > 18 ? 2 : currentPoints.length > 12 ? 1 : 0,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: currentPoints.map((point) => point.label),
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
        data: currentPoints.map(
          (_, index) => comparisonPoints[index]?.total ?? 0,
        ),
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
        data: currentPoints.map((point) => point.total),
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

function buildScenarioCumulativeTotalsOption(
  points: ScenarioCumulativeTotalPoint[],
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  return {
    grid: { bottom: 8, containLabel: true, left: 8, right: 82, top: 8 },
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
          scenarioName?: string;
          share?: number;
          value?: number;
        };

        return [
          `<strong>${point.scenarioName ?? "Cenário"}</strong>`,
          `Acumulado: ${formatNumber(point.value ?? 0)}`,
          `Participação: ${new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 1,
            style: "percent",
          }).format(point.share ?? 0)}`,
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
      axisLabel: {
        color: "#526477",
        fontSize: 11,
        overflow: "truncate",
        width: 220,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: points.map((point) => point.name),
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
          scenarioName: point.name,
          share: point.share,
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
        name: "Acumulado de hoje",
        type: "bar",
      },
    ],
  };
}

function buildCurrentYearComparisonOption(
  points: CurrentYearMonthPoint[],
  accumulated: boolean,
  year: number,
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  const values = points.map((point) =>
    accumulated ? point.accumulated : point.value,
  );
  const recordedValues = points.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  const average = recordedValues.length
    ? recordedValues.reduce((sum, value) => sum + value, 0) /
      recordedValues.length
    : 0;
  const averageName = `Média mensal de ${year}`;

  return {
    color: [widgetColor, "#C48A38"],
    grid: { bottom: 8, containLabel: true, left: 8, right: 10, top: 58 },
    legend: {
      data: [String(year), ...(!accumulated && average ? [averageName] : [])],
      itemGap: 12,
      itemHeight: 9,
      itemWidth: 9,
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
      axisLabel: { color: "#66758A", fontSize: 10, interval: 0 },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: points.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: number) => compactChartNumber(value),
      },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "30%",
        barMaxWidth: 28,
        data: values,
        emphasis: { focus: "series" },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: widgetColor,
        },
        label: {
          align: "left",
          color: "#526477",
          distance: 7,
          fontSize: 9,
          formatter: (params: { value?: number | null }) => {
            const value = params.value;
            return value === null || value === undefined || value === 0
              ? ""
              : compactChartNumber(value);
          },
          position: "top",
          rotate: 90,
          show: true,
          verticalAlign: "middle",
        },
        name: String(year),
        type: "bar",
      },
      ...(!accumulated && average
        ? [
            {
              animation: false,
              data: points.map((point) =>
                point.value === null ? null : average,
              ),
              itemStyle: { color: "#D49A45" },
              lineStyle: {
                color: "#C48A38",
                opacity: 0.72,
                type: "dashed",
                width: 1,
              },
              name: averageName,
              showSymbol: false,
              silent: true,
              symbol: "none",
              type: "line",
            },
          ]
        : []),
    ],
  };
}

function compactChartNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
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

function buildChartOption(
  definition: RealtimeChartDefinition,
  points: ChartPoint[],
  widgetColor = "#1267C4",
  targetValue = 0,
): EnterpriseChartOption {
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
      data: points.map((point) => point.label),
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
        data: points.map((point) => point.total),
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
  const dense = points.length > 12;
  const veryDense = points.length > 24;

  return {
    color: [widgetColor],
    grid: {
      bottom: veryDense ? 88 : dense ? 72 : 42,
      containLabel: true,
      left: 36,
      right: 18,
      top: 12,
    },
    tooltip: {
      axisPointer: {
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
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
        hideOverlap: true,
        interval: 0,
        overflow: "truncate",
        rotate: veryDense ? 45 : dense ? 28 : 0,
        width: dense ? 92 : undefined,
      },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        show: false,
      },
      data: points.map((point) => point.name),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
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
        barCategoryGap: veryDense ? "18%" : dense ? "28%" : "36%",
        barMaxWidth: veryDense ? 24 : dense ? 30 : 34,
        data: points.map((point, index) => ({
          itemStyle: {
            color: index === 0 ? widgetColor : pastelBarColor(index),
          },
          value: point.total,
        })),
        emphasis: {
          itemStyle: {
          color: widgetColor,
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
        },
        name: "Hoje",
        type: "bar",
      },
    ],
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
    option: buildScenarioCumulativeTotalsOption(orderedPoints, widgetColor),
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

function buildCurrentYearComparisonReportChart({
  accumulated,
  points,
  scopeName,
  widgetColor = "#1267C4",
  year,
}: {
  accumulated: boolean;
  points: CurrentYearMonthPoint[];
  scopeName: string;
  widgetColor?: string;
  year: number;
}): ReportPayload["charts"][number] {
  const title = accumulated
    ? "Comparativo acumulado por ano"
    : "Comparativo mensal por ano";
  const values = points.flatMap((point) => {
    const value = accumulated ? point.accumulated : point.value;
    return value === null ? [] : [value];
  });
  const total = accumulated
    ? values.at(-1) ?? 0
    : values.reduce((sum, value) => sum + value, 0);

  return {
    comparison: `${year}: ${formatNumber(total)} eventos até o mês atual`,
    description: `${
      accumulated
        ? "Soma progressiva dos meses"
        : "Valores mensais do ano atual"
    }. Visão: ${scopeName}.`,
    option: buildCurrentYearComparisonOption(
      points,
      accumulated,
      year,
      widgetColor,
    ),
    table: {
      title: `Dados - ${title}`,
      columns: [
        { key: "month", label: "Mês", width: 18 },
        {
          key: "value",
          label: accumulated ? "Acumulado" : String(year),
          numeric: true,
          width: 22,
        },
      ],
      rows: points.map((point) => ({
        month: point.label,
        value: accumulated ? point.accumulated : point.value,
      })),
    },
    title,
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
  if (granularity === "hour") return addHours(date, 1);
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
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
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
