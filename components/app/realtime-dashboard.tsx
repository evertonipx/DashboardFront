"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { CardLayout } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ScenarioComparisonCard } from "@/components/app/scenario-comparison-card";
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
import { apiFetch } from "@/lib/api";
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
  getStoredMasterCompanyScope,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  deleteRealtimeCustomWidget,
  loadRealtimeCustomWidgets,
  REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertRealtimeCustomWidget,
  type RealtimeCustomWidget,
  type RealtimeCustomWidgetGranularity,
  type RealtimeCustomWidgetScopeMode,
} from "@/lib/realtime-custom-widgets";
import { pastelBarColor } from "@/lib/chart-palette";
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
  granularity: RealtimeCustomWidgetGranularity;
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  title: string;
};

const REFRESH_MS = 5_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_METRIC_TYPE = "count";
const CURRENT_MONTH_DAYS_ID = "live_current_month_days";
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
  const [masterScopeId, setMasterScopeId] = React.useState(
    () => getStoredMasterCompanyScope()?.id ?? "",
  );
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
  const [refreshing, setRefreshing] = React.useState(false);
  const [hasLoadedCharts, setHasLoadedCharts] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());
  const [customWidgets, setCustomWidgets] = React.useState<
    RealtimeCustomWidget[]
  >([]);
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<RealtimeCustomWidgetForm>({
      granularity: "hour",
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
  const minuteRows = chartData.live_chart_minute?.rows ?? [];
  const hourRows = chartData.live_chart_hour?.rows ?? [];

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
    masterScopeId,
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
      if (silentLoad) setRefreshing(true);
      else setLoadingCharts(true);

      const now = new Date();
      const definitions = buildRealtimeChartDefinitions(now);
      const visibleDefinitionIds = new Set(definitions.map((definition) => definition.id));
      const supportDefinitions = [buildCurrentMonthDaysDefinition(now)];

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
          setRefreshing(false);
        }
      }
    },
    [masterScopeId],
  );

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  React.useEffect(() => {
    function syncCameraGroups() {
      const scopeId = resolveCameraGroupCompanyScope(user);
      setMasterScopeId(getStoredMasterCompanyScope()?.id ?? "");
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
      setCustomWidgets(loadRealtimeCustomWidgets(companyScopeId));
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
  }, [companyScopeId]);

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
  }, [masterScopeId]);

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
  const realtimeOneMinuteTotal = selectedScope
    ? sumScopeRowsSince(minuteRows, selectedScope, clock, 1)
    : 0;
  const realtimeFiveMinutesTotal = selectedScope
    ? sumScopeRowsSince(minuteRows, selectedScope, clock, 5)
    : 0;
  const realtimeHourTotal = selectedScope
    ? sumScopeRowsSince(minuteRows, selectedScope, clock, 60)
    : 0;
  const todayTotal = selectedScope
    ? sumScopeRowsInRange(hourRows, selectedScope, startOfDay(clock), addDays(startOfDay(clock), 1))
    : 0;
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

  function openCustomWidgetDialog() {
    const preferredMode = (selectedScope?.mode ??
      availableModes[0]?.value ??
      "scenario") as RealtimeCustomWidgetScopeMode;
    const options = getScopeOptionsForMode(preferredMode);
    const scope =
      selectedScope?.mode === preferredMode ? selectedScope : options[0] ?? null;
    const granularity: RealtimeCustomWidgetGranularity = "hour";

    setCustomWidgetForm({
      granularity,
      scopeId: scope?.id ?? "",
      scopeMode: (scope?.mode ?? preferredMode) as RealtimeCustomWidgetScopeMode,
      title: scope ? buildCustomWidgetDefaultTitle(scope, granularity) : "",
    });
    setCustomWidgetDialogOpen(true);
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
        scopeId: scope.id,
        scopeMode: scope.mode as RealtimeCustomWidgetScopeMode,
        scopeName: scope.name,
        title,
      },
      companyScopeId,
    );

    setCustomWidgets(nextWidgets);
    setCustomWidgetDialogOpen(false);
    toast.success("Widget adicionado ao Ao Vivo.");
  }

  function removeCustomWidget(widgetId: string) {
    const nextWidgets = deleteRealtimeCustomWidget(widgetId, companyScopeId);
    setCustomWidgets(nextWidgets);
    toast.success("Widget removido.");
  }

  const metricCards = [
    {
      id: "live_last_minute",
      label: "Último minuto",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Gauge}
          label="Último minuto"
          value={realtimeOneMinuteTotal}
          loading={initialLoading}
          tone="primary"
          description="janela em tempo real"
        />
      ),
    },
    {
      id: "live_last_5_minutes",
      label: "Últimos 5 minutos",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Zap}
          label="Últimos 5 minutos"
          value={realtimeFiveMinutesTotal}
          loading={initialLoading}
          tone="sky"
          description="curto prazo"
        />
      ),
    },
    {
      id: "live_last_hour",
      label: "Última hora",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Activity}
          label="Última hora"
          value={realtimeHourTotal}
          loading={initialLoading}
          tone="indigo"
          description="últimos 60 minutos"
        />
      ),
    },
    {
      id: "live_today_total",
      label: "Acumulado hoje",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Clock3}
          label="Acumulado hoje"
          value={todayTotal}
          loading={initialLoading}
          tone="slate"
          description="00:00 até agora"
        />
      ),
    },
  ];

  const scenarioComparisonCards = scenarios.length
    ? [
        {
          id: "live_scenario_period_comparison",
          label: "Cenários por período",
          defaultSize: "full" as const,
          className: "sm:col-span-2 xl:col-span-4",
          node: (
            <ScenarioComparisonCard
              autoRefresh
              companyId={companyScopeId}
              description="Compare todos os cenários ou apenas os escolhidos, com período e granularidade próprios."
              monitorMode={monitorMode}
              scenarios={scenarios}
              storageKey="live"
            />
          ),
        },
      ]
    : [];

  const chartCards = chartDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    defaultSize: "wide" as const,
    className: "sm:col-span-2 xl:col-span-2",
    node: selectedScope ? (
      <RealtimeChartCard
        definition={definition}
        loading={initialLoading}
        rows={chartData[definition.id]?.rows ?? []}
        scope={selectedScope}
        state={chartData[definition.id]}
      />
    ) : (
      <EmptyRealtimeCard title={definition.label} />
    ),
  }));
  const comparisonCards = [
    scenarioTodayComparisonPoints.length > 1
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
    locationTodayComparisonPoints.length > 1
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
    subLocationTodayComparisonPoints.length > 1
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

  const detailCards = selectedScope
    ? [
        {
          id: "live_scenario_detail",
          label: "Visão selecionada",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          node: (
            <ScopeDetailCard cameras={cameras} scope={selectedScope} />
          ),
        },
      ]
    : [];

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
                Tempo real
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
              <Button
                type="button"
                variant="outline"
                onClick={openCustomWidgetDialog}
                disabled={!availableModes.length}
              >
                <Plus className="h-4 w-4" />
                Widget
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  loadScenarios();
                  loadCharts({ force: true, silent: true });
                }}
                disabled={refreshing || loadingCharts}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    (refreshing || loadingCharts) && "animate-spin",
                  )}
                />
                Atualizar
              </Button>
              <MonitorModeButton
                onClick={enterMonitorMode}
                disabled={!scopeOptions.length}
              />
            </div>
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
          editActions={
            <Button type="button" variant="outline" size="sm" onClick={openCustomWidgetDialog}>
              <Settings2 className="h-3.5 w-3.5" />
              Novo widget
            </Button>
          }
          cards={[
            ...metricCards,
            ...scenarioComparisonCards,
            ...comparisonCards,
            ...customWidgetCards,
            ...chartCards,
            ...(monitorMode ? [] : detailCards),
          ]}
        />
      ) : null}

      {monitorMode ? null : (
      <Dialog
        open={customWidgetDialogOpen}
        onOpenChange={setCustomWidgetDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo widget ao vivo</DialogTitle>
            <DialogDescription>
              Escolha a visão, o período do gráfico e o título exibido no card.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
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
                placeholder="Entradas hora a hora"
              />
            </div>

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

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Os widgets do Ao Vivo usam atualização automática a cada 5 segundos.
            </div>
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
              disabled={!customWidgetForm.scopeId}
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
  value: number;
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
              {formatNumber(value)}
            </div>
          )}
          <div className="mt-1 truncate text-xs text-muted-foreground">
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
}: {
  action?: React.ReactNode;
  definition: RealtimeChartDefinition;
  loading: boolean;
  rows: AggregateEventRow[];
  scope: RealtimeScopeOption;
  state?: RealtimeChartState;
}) {
  const points = React.useMemo(
    () => buildScopePoints(definition, rows, scope),
    [definition, rows, scope],
  );
  const option = React.useMemo(
    () => buildChartOption(definition, points),
    [definition, points],
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
  const option = React.useMemo(
    () => buildScenarioComparisonOption(points),
    [points],
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

function ScopeDetailCard({
  cameras,
  scope,
}: {
  cameras: Camera[];
  scope: RealtimeScopeOption;
}) {
  const scopeCameras = cameras.filter((camera) => scope.cameraIds.includes(camera.id));
  const activeLineCount =
    scope.scenario?.lines?.filter((line) => line.action_multiplier !== 0).length ??
    0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          {scope.name}
        </CardTitle>
        <CardDescription>
          {scope.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <SmallInfo label="Tipo" value={scopeModeLabel(scope.mode)} />
          <SmallInfo
            label={scope.mode === "scenario" ? "Linhas ativas" : "Câmeras"}
            value={formatNumber(
              scope.mode === "scenario" ? activeLineCount : scope.cameraIds.length,
            )}
          />
          <SmallInfo
            label="Origem"
            value={
              scope.mode === "scenario"
                ? "Personalizada"
                : scope.subLocation || scope.group
                  ? "Sub-location"
                  : "Location"
            }
          />
          {scope.mode === "location" ? (
            <SmallInfo
              label="Worker"
              value={
                scope.worker?.name ??
                (scope.workerId ? "Não retornado pela API" : "Não vinculado")
              }
            />
          ) : null}
        </div>
        <div className="max-h-[210px] space-y-2 overflow-y-auto pr-1">
          {scope.scenario?.lines?.length ? (
            scope.scenario.lines.map((line, index) => (
              <div
                key={`${line.line_count_id}-${index}`}
                className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {line.label || `Linha ${index + 1}`}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {line.line_count_id}
                  </div>
                </div>
                <Badge
                  variant={
                    line.action_multiplier === -1
                      ? "warning"
                      : line.action_multiplier === 0
                        ? "secondary"
                        : "success"
                  }
                >
                  {line.action_multiplier === -1
                    ? "Subtrai"
                    : line.action_multiplier === 0
                      ? "Ignora"
                      : "Soma"}
                </Badge>
              </div>
            ))
          ) : scopeCameras.length ? (
            scopeCameras.map((camera) => (
              <div
                key={camera.id}
                className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{camera.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {camera.code || camera.id}
                  </div>
                </div>
                <Badge variant={camera.active ? "success" : "secondary"}>
                  {camera.active ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum item vinculado a esta visão.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
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

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
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

function buildCustomWidgetDefinition(
  widget: RealtimeCustomWidget,
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
    from: definition.from.toISOString(),
    to: definition.to.toISOString(),
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
  return sortWorkersByActivity(scopedRows);
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

  return scenarios
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      total: sumScenarioRowsInRange(rows, scenario, todayStart, tomorrowStart),
    }))
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, "pt-BR"));
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

function sumScopeRowsSince(
  rows: AggregateEventRow[],
  scope: RealtimeScopeOption,
  now: Date,
  minutes: number,
) {
  return sumScopeRowsInRange(
    rows,
    scope,
    new Date(now.getTime() - minutes * MINUTE_MS),
    now,
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

  while (cursor < end && guard < 200) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, definition.granularity);
    guard += 1;
  }

  return starts;
}

function buildChartOption(
  definition: RealtimeChartDefinition,
  points: ChartPoint[],
): EnterpriseChartOption {
  return {
    color: ["#1267C4"],
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
      axisLabel: {
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
            color: "#0B4EA2",
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: {
            colorStops: [
              { color: "#1267C4", offset: 0 },
              { color: "#5AA8F5", offset: 1 },
            ],
            type: "linear",
            x: 0,
            x2: 0,
            y: 0,
            y2: 1,
          },
        },
        name: "Tempo real",
        type: "bar",
      },
    ],
  };
}

function buildScenarioComparisonOption(
  points: ScenarioComparisonPoint[],
): EnterpriseChartOption {
  const dense = points.length > 12;
  const veryDense = points.length > 24;

  return {
    color: ["#1267C4"],
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
            color: pastelBarColor(index),
          },
          value: point.total,
        })),
        emphasis: {
          itemStyle: {
            color: "#0B4EA2",
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
