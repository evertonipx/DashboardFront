"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Grid3X3,
  Plus,
  Route,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { useWidgetColor } from "@/components/app/widget-appearance";
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
import { hasVisualAdminAccess } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { aggregateQueryIso } from "@/lib/aggregate-time";
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
  type RealtimeScopeCustomWidget,
} from "@/lib/realtime-custom-widgets";
import {
  monochromeHeatmapPalette,
  pastelBarColor,
} from "@/lib/chart-palette";
import {
  DAY_OF_MONTH_AXIS_LABELS,
  buildCalendarAxisLabel,
  saturdayCategoryIndexesForMonth,
  sundayCategoryIndexesForMonth,
} from "@/lib/chart-calendar-axis";
import type { ReportMetric, ReportPayload } from "@/lib/report-export";
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
  annotateWorkerCompanyScope,
  collapseWorkerIdentityChains,
  normalizeWorkerRows,
  partitionWorkersByCompanyScope,
  sortWorkersByActivity,
} from "@/lib/worker-scope";

type RealtimeDashboardProps = {
  manager?: boolean;
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
  kind: RealtimeCustomWidgetKind;
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  title: string;
};

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

export function RealtimeDashboard({ manager = false }: RealtimeDashboardProps) {
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
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
    React.useState<RealtimeScopeMode>("scenario");
  const [selectedId, setSelectedId] = React.useState("");
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
  const hourRows = chartData.live_chart_hour?.rows ?? EMPTY_AGGREGATE_ROWS;
  const comparisonHourRows =
    chartData[OPERATIONAL_COMPARISON_HOURS_ID]?.rows ?? EMPTY_AGGREGATE_ROWS;
  const currentMonthDayRows =
    chartData[CURRENT_MONTH_DAYS_ID]?.rows ?? EMPTY_AGGREGATE_ROWS;
  const previousMonthDayRows =
    chartData[OPERATIONAL_PREVIOUS_MONTH_ID]?.rows ?? EMPTY_AGGREGATE_ROWS;
  const lastYearMonthDayRows =
    chartData[OPERATIONAL_LAST_YEAR_MONTH_ID]?.rows ?? EMPTY_AGGREGATE_ROWS;
  const operationalTrendRows =
    chartData[OPERATIONAL_TREND_DAYS_ID]?.rows ?? EMPTY_AGGREGATE_ROWS;
  const operationalMonthHourState = chartData[OPERATIONAL_MONTH_HOURS_ID];
  const operationalMonthHourRows =
    operationalMonthHourState?.rows ?? EMPTY_AGGREGATE_ROWS;
  const baselineMonthDayRows =
    operationalSettings.monthComparison === "last_year"
      ? lastYearMonthDayRows
      : previousMonthDayRows;

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
      ];
      const headers = companyScopeId
        ? ({ "X-Company-ID": companyScopeId } satisfies HeadersInit)
        : undefined;

      try {
        const entries = await Promise.all(
          [...definitions, ...supportDefinitions].map(async (definition) => {
            try {
              const response = await apiFetch<AggregateEventsResponse>(
                aggregatePath(definition),
                { headers, signal: controller.signal },
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
    [companyScopeId, operationalSettings.intradayComparison],
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
    setSelectedId("");
    setChartData({});
    setHasLoadedCharts(false);
    hasLoadedChartsRef.current = false;
  }, [companyScopeId]);

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

    let disposed = false;
    let timeout: number | undefined;

    function scheduleNextRefresh() {
      timeout = window.setTimeout(async () => {
        if (disposed) return;

        if (document.visibilityState === "visible") {
          await loadCharts({ force: true, silent: true });
        }

        scheduleNextRefresh();
      }, REFRESH_MS);
    }

    scheduleNextRefresh();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadCharts({ force: true, silent: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestRef.current?.abort();
    };
  }, [loadCharts]);

  const initialLoading = (loadingScenarios || loadingCharts) && !hasLoadedCharts;
  const todayTotal = selectedScope
    ? sumScopeRowsInRange(hourRows, selectedScope, startOfDay(clock), addDays(startOfDay(clock), 1))
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
      )
    : 0;
  const comparisonComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        comparisonHourRows,
        selectedScope,
        comparisonDayStart,
        addHours(comparisonDayStart, completedHourCount),
      )
    : 0;
  const comparisonDelta = percentageDelta(
    todayComparableTotal,
    comparisonComparableTotal,
  );
  const completedMonthDayCount = Math.max(0, clock.getDate() - 1);
  const currentMonthClosedTotal = selectedScope
    ? sumScopeRowsInRange(
        currentMonthDayRows,
        selectedScope,
        startOfMonth(clock),
        startOfDay(clock),
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
      )
    : 0;
  const lastYearMonthComparableTotal = selectedScope
    ? sumScopeRowsInRange(
        lastYearMonthDayRows,
        selectedScope,
        lastYearMonthStart,
        comparableMonthEnd(lastYearMonthStart, completedMonthDayCount),
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
          )
        : [],
    [
      baselineMonthDayRows,
      clock,
      currentMonthDayRows,
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
    const closedPoints = buildScopePoints(
      definition,
      operationalTrendRows,
      selectedScope,
    ).filter((point) => new Date(point.bucket) < startOfDay(clock));

    return buildOperationalTrendPoints(closedPoints).filter((point) => {
      const bucket = new Date(point.bucket);
      return bucket >= currentMonthStart;
    });
  }, [clock, operationalTrendRows, selectedScope]);
  const operationalHeatmapPoints = React.useMemo(
    () =>
      selectedScope
        ? buildOperationalHeatmapPoints(
            operationalMonthHourRows,
            selectedScope,
            clock,
          )
        : [],
    [clock, operationalMonthHourRows, selectedScope],
  );
  const targetProgress = baselineDailyAverage
    ? todayTotal / baselineDailyAverage
    : null;
  const monthlyAccessRankingPoints = React.useMemo(
    () =>
      buildScenarioPeriodComparisonPoints(
        scenarios,
        currentMonthDayRows,
        startOfMonth(clock),
        addDays(startOfDay(clock), 1),
      ),
    [clock, currentMonthDayRows, scenarios],
  );
  const scenarioTodayComparisonPoints = React.useMemo(
    () => buildScenarioTodayComparisonPoints(scenarios, hourRows, clock),
    [clock, hourRows, scenarios],
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
      ),
    [
      cameraGroups,
      cameras,
      clock,
      hourRows,
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
    ),
    [
      cameraGroups,
      cameras,
      clock,
      hourRows,
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
    patch: Partial<LiveOperationalSettings>,
  ) {
    setOperationalSettings((current) =>
      saveLiveOperationalSettings(
        { ...current, ...patch },
        companyScopeId,
        preferenceScope,
      ),
    );
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
      scopeId: scope?.id ?? "",
      scopeMode: (scope?.mode ?? preferredMode) as RealtimeCustomWidgetScopeMode,
      title: scope ? buildCustomWidgetDefaultTitle(scope, granularity) : "",
    });
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
          : scope
            ? buildCustomWidgetDefaultTitle(scope, current.granularity)
            : "",
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
    if (customWidgetForm.kind === "scenario_comparison") {
      const nextWidgets = upsertRealtimeCustomWidget(
        {
          kind: "scenario_comparison",
          title: customWidgetForm.title.trim() || "Cenários por período",
        },
        companyScopeId,
        preferenceScope,
      );
      const addedWidget =
        nextWidgets.find(
          (widget) =>
            widget.kind === "scenario_comparison" &&
            !customWidgets.some((current) => current.id === widget.id),
        ) ?? nextWidgets.at(-1);

      if (addedWidget?.kind === "scenario_comparison") {
        saveScenarioComparisonSettings(
          realtimeScenarioComparisonStorageKey(addedWidget.id),
          customWidgetForm.comparisonSettings,
          companyScopeId,
          preferenceScope,
        );
      }

      setCustomWidgets(nextWidgets);
      setCustomWidgetDialogOpen(false);
      toast.success("Widget de cenários por período adicionado.");
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
    toast.success("Widget adicionado ao Ao Vivo.");
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
      label: "Horas fechadas hoje",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Clock3}
          label={`Hoje até ${String(completedHourCount).padStart(2, "0")}h`}
          value={todayComparableTotal}
          loading={initialLoading}
          tone="primary"
          description={
            completedHourCount
              ? `${formatDelta(comparisonDelta)} vs. ${intradayComparisonSeriesLabel(
                  operationalSettings.intradayComparison,
                ).toLowerCase()} · base ${formatNumber(
                  comparisonComparableTotal,
                )}`
              : "Aguardando a primeira hora completa"
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
          value={formatDelta(previousMonthDelta)}
          loading={initialLoading}
          tone="sky"
          description={`${formatNumber(
            currentMonthClosedTotal,
          )} atual · ${formatNumber(
            previousMonthComparableTotal,
          )} base · ${completedMonthDayCount} dias fechados`}
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
          value={formatDelta(lastYearMonthDelta)}
          loading={initialLoading}
          tone="indigo"
          description={`${formatNumber(
            currentMonthClosedTotal,
          )} atual · ${formatNumber(
            lastYearMonthComparableTotal,
          )} base · ${completedMonthDayCount} dias fechados`}
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
      label: "Hora a Hora",
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
      id: "live_month_hour_heatmap",
      label: "Mapa de calor dia x hora",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: (
        <OperationalHeatmapCard
          error={operationalMonthHourState?.error}
          loading={initialLoading}
          month={clock}
          points={operationalHeatmapPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
    {
      id: "live_moving_average_trend",
      label: "Tendência 7 x 30 dias",
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
      id: "live_month_access_ranking",
      label: "Ranking dos acessos do mês",
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: (
        <MonthlyAccessRankingCard
          loading={initialLoading}
          points={monthlyAccessRankingPoints}
        />
      ),
    },
    {
      id: "live_operational_month_comparison",
      label: "Dias x meses",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: (
        <OperationalMonthComparisonCard
          loading={initialLoading}
          mode={operationalSettings.monthComparison}
          points={monthComparisonPoints}
          scopeName={selectedScope?.name ?? "Visão selecionada"}
        />
      ),
    },
    {
      id: "live_operational_month_cumulative",
      label: "Acumulado diário x mês-base",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: (
        <OperationalMonthCumulativeCard
          loading={initialLoading}
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
        label: widget.title,
        defaultSize: "full" as const,
        className: "sm:col-span-2 xl:col-span-4",
        node: (
          <ScenarioComparisonCard
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  removeCustomWidget(widget.id);
                }}
                aria-label={`Remover widget ${widget.title}`}
                title="Remover widget"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
      label: widget.title,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: scope ? (
        <RealtimeChartCard
          action={
            monitorMode ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  removeCustomWidget(widget.id);
                }}
                aria-label={`Remover widget ${widget.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )
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
          onRemove={monitorMode ? undefined : () => removeCustomWidget(widget.id)}
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
      syncServer: false,
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
          ? `${formatDelta(comparisonDelta)} contra ${intradayComparisonSeriesLabel(
              operationalSettings.intradayComparison,
            ).toLowerCase()}`
          : "Aguardando a primeira hora completa",
        label: `Hoje até ${String(completedHourCount).padStart(2, "0")}h`,
        value: todayComparableTotal,
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
        description: `${formatNumber(currentMonthClosedTotal)} atual · ${formatNumber(
          previousMonthComparableTotal,
        )} base`,
        label: "Acumulado x mês anterior",
        value: formatDelta(previousMonthDelta),
      },
    ],
    [
      "live_month_year_comparison",
      {
        description: `${formatNumber(currentMonthClosedTotal)} atual · ${formatNumber(
          lastYearMonthComparableTotal,
        )} base`,
        label: "Acumulado x ano anterior",
        value: formatDelta(lastYearMonthDelta),
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
        scopeName: selectedScope.name,
        widgetColor: liveColorByCardId.get("live_month_hour_heatmap"),
      }),
    ]);
    liveChartEntries.push([
      "live_operational_month_comparison",
      buildOperationalMonthReportChart({
        accumulated: false,
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
  }
  liveChartEntries.push([
    "live_month_access_ranking",
    buildMonthlyAccessRankingReportChart(
      monthlyAccessRankingPoints,
      liveColorByCardId.get("live_month_access_ranking"),
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
    };
  }

  async function buildConfiguredLiveReportPayload() {
    const chartByCardId = new Map(liveChartEntries);

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
            const rows = await fetchScenarioComparisonRows(
              definition,
              companyScopeId,
            );
            chartByCardId.set(
              cardId,
              buildScenarioComparisonReportChart({
                definition,
                rows,
                scenarios,
                settings,
                title: widget.title,
                widgetColor: liveColorByCardId.get(cardId),
              }),
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
      .map((id) => new Map(liveChartEntries).get(id))
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
            <DialogTitle>Novo widget ao vivo</DialogTitle>
            <DialogDescription>
              Adicione uma visão individual ou uma comparação de cenários.
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
            ) : (
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
                  !customWidgetForm.comparisonSettings.selectedScenarioIds.length)
              }
            >
              Adicionar widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </section>
  );
}

function MetricCard({
  description,
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: {
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
    <Card>
      <CardContent className="flex min-h-[116px] items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-2 text-2xl font-semibold">
              {typeof value === "number" ? formatNumber(value) : value}
            </div>
          )}
          <div className="mt-1 text-xs leading-4 text-muted-foreground">
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

function OperationalHeatmapCard({
  error,
  loading,
  month,
  points,
  scopeName,
}: {
  error?: string;
  loading: boolean;
  month: Date;
  points: OperationalHeatmapPoint[];
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildOperationalHeatmapOption(points, month, widgetColor),
    [month, points, widgetColor],
  );
  const hasData = points.some((point) => point.total > 0);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-primary" />
              Mapa de calor dia x hora
            </CardTitle>
            <CardDescription className="mt-1">
              Intensidade do fluxo nas 24 faixas horárias e nos dias 1 a 31
              do mês atual; fins de semana destacados no eixo.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="max-w-full truncate">
              {scopeName}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[500px] w-full" />
        ) : error ? (
          <EmptyChartState className="h-[260px]" text={error} />
        ) : hasData ? (
          <div className="overflow-x-auto">
            <EChart option={option} className="h-[500px] min-w-[760px]" />
          </div>
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

function OperationalMonthComparisonCard({
  loading,
  mode,
  points,
  scopeName,
}: {
  loading: boolean;
  mode: LiveOperationalSettings["monthComparison"];
  points: OperationalMonthComparisonPoint[];
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildOperationalMonthComparisonOption(points, mode, widgetColor),
    [mode, points, widgetColor],
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
              {monthComparisonLabel(mode)} à esquerda e mês atual à direita. Linha tracejada: {averageBaseDescription(mode).toLowerCase()}. Fins de semana destacados no eixo.
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
          <div className="overflow-x-auto">
            <EChart option={option} className="h-[310px] min-w-[720px]" />
          </div>
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
  mode,
  points,
  scopeName,
}: {
  loading: boolean;
  mode: LiveOperationalSettings["monthComparison"];
  points: OperationalMonthComparisonPoint[];
  scopeName: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildOperationalMonthCumulativeOption(points, mode, widgetColor),
    [mode, points, widgetColor],
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
              Evolução acumulada nos mesmos dias: {monthComparisonLabel(mode).toLowerCase()} à esquerda e mês atual à direita. Fins de semana destacados no eixo.
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
          <div className="overflow-x-auto">
            <EChart option={option} className="h-[310px] min-w-[720px]" />
          </div>
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
              Médias móveis calculadas somente com dias fechados. Eixo de 1 a 31; fins de semana destacados.
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
          <div className="overflow-x-auto">
            <EChart option={option} className="h-[300px] min-w-[560px]" />
          </div>
        ) : (
          <EmptyChartState
            className="h-[200px]"
            text="São necessários ao menos 7 dias fechados para calcular a tendência."
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

function MonthlyAccessRankingCard({
  loading,
  points,
}: {
  loading: boolean;
  points: ScenarioComparisonPoint[];
}) {
  const widgetColor = useWidgetColor();
  const rankedPoints = React.useMemo(
    () => points.filter((point) => point.total > 0),
    [points],
  );
  const option = React.useMemo(
    () => buildMonthlyAccessRankingOption(rankedPoints, widgetColor),
    [rankedPoints, widgetColor],
  );
  const chartHeight = Math.max(280, rankedPoints.length * 34 + 30);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Ranking dos acessos do mês
            </CardTitle>
            <CardDescription className="mt-1">
              Volume e representatividade de cada cenário no mês em andamento.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {rankedPoints.length} {rankedPoints.length === 1 ? "acesso" : "acessos"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : rankedPoints.length ? (
          <div className="max-h-[360px] overflow-y-auto overflow-x-hidden pr-1">
            <div style={{ height: chartHeight }}>
              <EChart option={option} />
            </div>
          </div>
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

function MissingCustomWidgetCard({
  onRemove,
  title,
}: {
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
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label="Remover widget"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
  return {
    id: OPERATIONAL_MONTH_HOURS_ID,
    label: "Mapa de calor dia x hora",
    description: "Distribuição horária do fluxo no mês em andamento.",
    granularity: "hour",
    from: startOfMonth(now),
    to: addHours(startOfHour(now), 1),
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

  return next;
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
      const date = new Date(row.bucket);
      return (
        Number.isNaN(date.getTime()) ||
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

    const bucket = new Date(row.bucket);
    if (Number.isNaN(bucket.getTime())) return;

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

function companyScopeHeaders(companyId?: string | null) {
  const cleanCompanyId = companyId?.trim();
  return cleanCompanyId ? { "X-Company-ID": cleanCompanyId } : undefined;
}

async function fetchRealtimeWorkers(companyId?: string | null) {
  const headers = companyScopeHeaders(companyId);
  const rows = await apiFetch<unknown>("/workers", { headers }).then((response) =>
    normalizeWorkerRows(response).map((row) =>
      annotateWorkerCompanyScope(row, companyId, "GET /workers"),
    ),
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
): ScenarioComparisonPoint[] {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  return buildScenarioPeriodComparisonPoints(
    scenarios,
    rows,
    todayStart,
    tomorrowStart,
  );
}

function buildScenarioPeriodComparisonPoints(
  scenarios: Scenario[],
  rows: AggregateEventRow[],
  from: Date,
  to: Date,
): ScenarioComparisonPoint[] {
  return scenarios
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      total: sumScenarioRowsInRange(rows, scenario, from, to),
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
): TodayComparisonPoint[] {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  return scopes
    .map((scope) => ({
      id: scope.id,
      name: scope.name,
      total: sumScopeRowsInRange(rows, scope, todayStart, tomorrowStart),
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
          )
        : null,
      current: currentClosedOrOpen
        ? sumScopeRowsInRange(
            currentRows,
            scope,
            currentFrom,
            addDays(currentFrom, 1),
          )
        : null,
      day,
      isSaturday: currentExists && currentFrom.getDay() === 6,
      isSunday: currentExists && currentFrom.getDay() === 0,
    };
  });
}

function buildOperationalHeatmapPoints(
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  now: Date,
): OperationalHeatmapPoint[] {
  const definition = buildOperationalMonthHoursDefinition(now);

  return buildScopePoints(definition, rows, scope).map((point) => {
    const bucket = new Date(point.bucket);

    return {
      bucket: point.bucket,
      day: bucket.getDate(),
      hour: bucket.getHours(),
      total: point.total,
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
) {
  const multipliers = scenarioMultiplierMap(scenario);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return rows.reduce((sum, row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return sum;

    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) {
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

    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;

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

    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;

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

function sumScopeRowsInRange(
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  from: Date,
  to: Date,
) {
  if (!scope.scenario) {
    const cameraIds = new Set(scope.cameraIds);
    const fromTime = from.getTime();
    const toTime = to.getTime();

    return rows.reduce((sum, row) => {
      if (!row.camera_id || !cameraIds.has(row.camera_id)) return sum;

      const bucket = new Date(row.bucket).getTime();
      if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) {
        return sum;
      }

      return sum + (row.total ?? 0);
    }, 0);
  }

  const scenario = scope.scenario;
  const multipliers = scenarioMultiplierMap(scenario);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return rows.reduce((sum, row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return sum;

    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) {
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
        name: "Intensidade horária",
        progressive: 1_000,
        type: "heatmap",
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
        name: "Volume diário",
        type: "bar",
      },
      {
        data: valuesByDay((point) => point.average30),
        lineStyle: {
          color: directionColor(direction30),
          opacity: 0.72,
          type: "dashed",
          width: 1.5,
        },
        name: "Média móvel 30 dias",
        showSymbol: false,
        smooth: 0.18,
        type: "line",
      },
      {
        data: valuesByDay((point) => point.average7),
        lineStyle: { color: directionColor(direction7), width: 2.25 },
        name: "Média móvel 7 dias",
        showSymbol: false,
        smooth: 0.18,
        type: "line",
      },
    ],
  };
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
    description: `Intensidade do fluxo por dia e faixa horária em ${monthLabel}. Fins de semana destacados. Visão: ${scopeName}.`,
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

function buildOperationalMonthReportChart({
  accumulated,
  mode,
  points,
  scopeName,
  widgetColor = "#1267C4",
}: {
  accumulated: boolean;
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
      ? `Acumulados comparáveis nos mesmos dias, com fins de semana destacados no eixo. Visão: ${scopeName}.`
      : `Valores diários, com fins de semana destacados no eixo. Linha tracejada: ${averageBaseDescription(mode).toLowerCase()}. Visão: ${scopeName}.`,
    option: accumulated
      ? buildOperationalMonthCumulativeOption(points, mode, widgetColor)
      : buildOperationalMonthComparisonOption(points, mode, widgetColor),
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
    description: `Médias móveis de 7 e 30 dias calculadas apenas com dias fechados, exibidas no eixo mensal de 1 a 31 com fins de semana destacados. Visão: ${scopeName}.`,
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
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (granularity === "week") return startOfUtcWeek(date).getTime();
  if (granularity === "month") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  if (granularity === "semester") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() < 6 ? 0 : 6, 1);
  }

  return Date.UTC(date.getUTCFullYear(), 0, 1);
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

function startOfUtcWeek(date: Date) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = next.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + diff);
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
