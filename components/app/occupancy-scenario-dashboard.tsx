"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Clock3,
  Gauge,
  MapPinned,
  RefreshCw,
  Settings2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { CardLayout } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { useAuth } from "@/components/app/auth-provider";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import {
  getOccupancyChartPalette,
  type OccupancyChartPalette,
} from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import {
  aggregateQueryIso,
  endOfAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  filterScopedApiRows,
  getScopedStorageKey,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  aggregateOccupancyRowsByBucket,
  occupancyAggregateBucketKey,
  requireOccupancyAggregateRows,
} from "@/lib/occupancy-aggregate-validation";
import { summarizeOccupancyMetrics } from "@/lib/occupancy-metrics";
import {
  requireOccupancyAlertRows,
  requireOccupancyHistoryResponse,
  requireOccupancyScenarioRows,
} from "@/lib/occupancy-validation";
import { canManageOccupancy, canManageScenarios } from "@/lib/permissions";
import type {
  AggregateGranularity,
  OccupancyAlertRow,
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioBucketRow,
  OccupancyScenarioHistoryResponse,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber, formatTime } from "@/lib/utils";

type LoadOptions = {
  force?: boolean;
  silent?: boolean;
};

type OccupancyChartDefinition = {
  id: string;
  label: string;
  description: string;
  granularity: Extract<
    AggregateGranularity,
    "minute" | "hour" | "day" | "week" | "month"
  >;
  from: Date;
  to: Date;
};

type OccupancyChartState = {
  rows: OccupancyScenarioBucketRow[];
  points: OccupancyPoint[];
  error?: string;
};

type OccupancyPoint = {
  bucket: string;
  label: string;
  average: number | null;
  current: number | null;
  minimum: number | null;
  peak: number | null;
};

type PeriodMetric = {
  average: number | null;
  minimum: number | null;
  peak: number | null;
};

type OccupancyMarkerKind = "average" | "current" | "limit";

type OccupancyMarkerDefinition = {
  color: string;
  data: Array<number | null>;
  effect?: boolean;
  fill: string;
  kind: OccupancyMarkerKind;
  name: string;
  offset: [number, number];
  size: number | [number, number];
  symbol: "circle" | "rect";
  z: number;
};

type OccupancyMetricVisibility = {
  average: boolean;
  minimum: boolean;
  peak: boolean;
};

const REFRESH_MS = 5_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OCCUPANCY_METRIC_VISIBILITY_KEY =
  "ipxdata.occupancy.metric-visibility.v1";
const DEFAULT_OCCUPANCY_METRIC_VISIBILITY: OccupancyMetricVisibility = {
  average: true,
  minimum: true,
  peak: true,
};

export function OccupancyScenarioDashboard() {
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const canManage =
    canManageOccupancy(user) || canManageScenarios(user);
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, OccupancyChartState>
  >({});
  const [history, setHistory] =
    React.useState<OccupancyScenarioHistoryResponse | null>(null);
  const [alerts, setAlerts] = React.useState<OccupancyAlertRow[]>([]);
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [dataLoadError, setDataLoadError] = React.useState("");
  const [hasLoadedData, setHasLoadedData] = React.useState(false);
  const [loadedDataScopeKey, setLoadedDataScopeKey] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());
  const [metricVisibility, setMetricVisibility] =
    React.useState<OccupancyMetricVisibility>(() =>
      readOccupancyMetricVisibility(companyScopeId),
    );

  const requestRef = React.useRef<AbortController | null>(null);
  const runningRef = React.useRef(false);
  const hasLoadedDataRef = React.useRef(false);
  const activeDataScopeKeyRef = React.useRef("");
  const loadedDataScopeKeyRef = React.useRef("");
  const metadataRequestSequenceRef = React.useRef(0);

  const visibleScenarios = React.useMemo(
    () => (canManage ? scenarios : scenarios.filter((scenario) => scenario.active)),
    [canManage, scenarios],
  );
  const selectedScenario = React.useMemo(
    () =>
      visibleScenarios.find((scenario) => scenario.id === selectedId) ??
      null,
    [selectedId, visibleScenarios],
  );
  const activeDataScopeKey = occupancyDataScopeKey(companyScopeId, selectedId);
  const hasLoadedSelectedScenario =
    Boolean(selectedScenario) &&
    hasLoadedData &&
    loadedDataScopeKey === activeDataScopeKey;
  const certifiedChartData = hasLoadedSelectedScenario ? chartData : {};
  const certifiedHistory = hasLoadedSelectedScenario ? history : null;
  const certifiedAlerts = hasLoadedSelectedScenario ? alerts : [];
  const chartDefinitions = React.useMemo(
    () => buildOccupancyChartDefinitions(clock),
    [clock],
  );

  const loadScenarios = React.useCallback(async (selectId?: string) => {
    const requestSequence = ++metadataRequestSequenceRef.current;
    setLoadingScenarios(true);
    setMetadataError("");
    try {
      const response = await apiFetch<unknown>("/occupancy/scenarios");
      const nextScenarios = filterScopedApiRows(
        requireOccupancyScenarioRows(response),
        companyScopeId,
      );

      if (requestSequence !== metadataRequestSequenceRef.current) return;
      setMetadataError("");
      setScenarios(nextScenarios);
      setSelectedId((current) => {
        const selectable = canManage
          ? nextScenarios
          : nextScenarios.filter((scenario) => scenario.active);
        const requested = selectId || current;

        if (requested && selectable.some((scenario) => scenario.id === requested)) {
          return requested;
        }

        return (
          selectable.find((scenario) => scenario.active)?.id ??
          selectable[0]?.id ??
          ""
        );
      });
    } catch (error) {
      if (requestSequence !== metadataRequestSequenceRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cenários de ocupação.";
      setScenarios([]);
      setSelectedId("");
      setChartData({});
      setHistory(null);
      setAlerts([]);
      setMetadataError(message);
      toast.error(message);
    } finally {
      if (requestSequence === metadataRequestSequenceRef.current) {
        setLoadingScenarios(false);
      }
    }
  }, [canManage, companyScopeId]);

  const loadScenarioData = React.useCallback(
    async (
      scenario: OccupancyScenario,
      { force = false, silent = false }: LoadOptions = {},
    ) => {
      const requestedScopeKey = occupancyDataScopeKey(
        companyScopeId,
        scenario.id,
      );
      if (
        !companyScopeId ||
        scenario.company_id !== companyScopeId ||
        activeDataScopeKeyRef.current !== requestedScopeKey
      ) {
        return;
      }

      if (runningRef.current) {
        if (!force) return;
        requestRef.current?.abort();
      }

      const controller = new AbortController();
      requestRef.current = controller;
      runningRef.current = true;

      const sameScenarioLoaded =
        hasLoadedDataRef.current &&
        loadedDataScopeKeyRef.current === requestedScopeKey;
      const silentLoad = sameScenarioLoaded && (silent || hasLoadedDataRef.current);
      if (silentLoad) setRefreshing(true);
      else setLoadingData(true);

      const now = new Date();
      const definitions = buildOccupancyChartDefinitions(now);
      const isCurrentRequest = () =>
        !controller.signal.aborted &&
        requestRef.current === controller &&
        activeDataScopeKeyRef.current === requestedScopeKey;

      try {
        const [historyResult, alertResult, chartEntries] = await Promise.all([
          apiFetch<unknown>(
            occupancyScenarioHistoryPath(scenario.id, now),
            { signal: controller.signal },
          ).then((response) =>
            requireOccupancyHistoryResponse(response, scenario.id, {
              expectedAreas: scenario.areas,
              requestedAt: now,
            }),
          ),
          apiFetch<unknown>(
            `/occupancy/scenarios/${scenario.id}/alerts?limit=12`,
            { signal: controller.signal },
          ).then((response) =>
            requireOccupancyAlertRows(
              response,
              scenario.id,
              scenario.object_class,
            ),
          ),
          Promise.all(
            definitions.map(async (definition) => {
              try {
                const response =
                  await apiFetch<OccupancyScenarioAggregateResponse>(
                    occupancyScenarioAggregatePath(scenario.id, definition),
                    { signal: controller.signal },
                  );
                const rows = requireOccupancyAggregateRows(
                  response,
                  definition.granularity,
                  scenario.id,
                );
                const state: OccupancyChartState = buildOccupancyChartState(
                  definition,
                  rows,
                );

                return [definition.id, state] as const;
              } catch (error) {
                if (isAbortError(error)) throw error;
                const state: OccupancyChartState = {
                  rows: [],
                  points: buildEmptyOccupancyPoints(definition),
                  error:
                    error instanceof Error
                      ? error.message
                      : "Não foi possível carregar este período.",
                };

                return [definition.id, state] as const;
              }
            }),
          ),
        ]);

        const historyTotal = historyResult?.total;
        const nextChartData = Object.fromEntries(
          chartEntries.map(([id, state]) => [
            id,
            historyTotal === undefined
              ? state
              : attachCurrentToLatestPoint(state, historyTotal),
          ]),
        ) as Record<string, OccupancyChartState>;

        if (!isCurrentRequest()) return;
        setChartData(nextChartData);
        setHistory(historyResult);
        setAlerts(alertResult);
        setDataLoadError("");
        setClock(now);
        setLastUpdated(new Date());
        setHasLoadedData(true);
        hasLoadedDataRef.current = true;
        loadedDataScopeKeyRef.current = requestedScopeKey;
        setLoadedDataScopeKey(requestedScopeKey);

        if (chartEntries.some(([, state]) => state.error) && !silentLoad) {
          toast.error("Alguns períodos de ocupação não puderam ser carregados.");
        }
      } catch (error) {
        if (!isAbortError(error) && isCurrentRequest()) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a ocupação.";
          setDataLoadError(message);
          toast.error(message);
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          runningRef.current = false;
          setLoadingData(false);
          setRefreshing(false);
        }
      }
    },
    [companyScopeId],
  );

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  React.useEffect(() => {
    activeDataScopeKeyRef.current = activeDataScopeKey;
    requestRef.current?.abort();

    if (loadedDataScopeKeyRef.current !== activeDataScopeKey) {
      loadedDataScopeKeyRef.current = "";
      hasLoadedDataRef.current = false;
      setLoadedDataScopeKey("");
      setHasLoadedData(false);
      setChartData({});
      setHistory(null);
      setAlerts([]);
      setDataLoadError("");
      setLastUpdated(null);
    }
  }, [activeDataScopeKey]);

  React.useEffect(() => {
    requestRef.current?.abort();
    setMetadataError("");
    setDataLoadError("");
    setScenarios([]);
    setSelectedId("");
    setChartData({});
    setHistory(null);
    setAlerts([]);
    setMetricVisibility(readOccupancyMetricVisibility(companyScopeId));
    setHasLoadedData(false);
    hasLoadedDataRef.current = false;
    setLoadedDataScopeKey("");
    loadedDataScopeKeyRef.current = "";
  }, [companyScopeId]);

  React.useEffect(() => {
    saveOccupancyMetricVisibility(metricVisibility, companyScopeId);
  }, [companyScopeId, metricVisibility]);

  React.useEffect(() => {
    if (!selectedScenario) {
      setDataLoadError("");
      setChartData({});
      setHistory(null);
      setAlerts([]);
      return;
    }

    loadScenarioData(selectedScenario, { force: true });
  }, [loadScenarioData, selectedScenario]);

  React.useEffect(() => {
    let disposed = false;
    let timeout: number | undefined;

    function scheduleNextRefresh() {
      timeout = window.setTimeout(async () => {
        if (disposed) return;

        if (document.visibilityState === "visible" && selectedScenario) {
          await loadScenarioData(selectedScenario, {
            force: true,
            silent: true,
          });
        }

        scheduleNextRefresh();
      }, REFRESH_MS);
    }

    scheduleNextRefresh();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && selectedScenario) {
        loadScenarioData(selectedScenario, { force: true, silent: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestRef.current?.abort();
    };
  }, [loadScenarioData, selectedScenario]);

  const initialLoading =
    Boolean(selectedScenario) && !hasLoadedSelectedScenario
      ? true
      : (loadingScenarios || loadingData) && !hasLoadedSelectedScenario;
  const currentTotal = certifiedHistory?.total ?? null;
  const activeAreas =
    certifiedHistory?.areas?.filter((area) => area.value > 0).length ?? null;
  const todayMetric = buildPeriodMetric(
    certifiedChartData.occupancy_chart_hour?.points ?? [],
  );
  const occupancyCertificationError =
    metadataError ||
    dataLoadError ||
    Object.values(certifiedChartData).find((state) => state.error)?.error;
  const thresholdStatus = selectedScenario && currentTotal !== null
    ? occupancyThresholdStatus(currentTotal, selectedScenario)
    : null;

  const metricCards = [
    {
      id: "occupancy_current_total",
      label: "Último snapshot",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={UsersRound}
          label="Último snapshot"
          value={currentTotal}
          loading={initialLoading}
          tone={thresholdStatus?.tone ?? "primary"}
          description={
            certifiedHistory?.as_of
              ? `fonte em ${formatDateTime(certifiedHistory.as_of)}`
              : selectedScenario?.name ?? "Cenário obrigatório"
          }
        />
      ),
    },
    ...(metricVisibility.average
      ? [
          {
            id: "occupancy_average",
            label: "Média hoje",
            defaultSize: "compact" as const,
            node: (
              <MetricCard
                icon={Gauge}
                label="Média hoje"
                value={todayMetric.average}
                loading={initialLoading}
                tone="average"
                description="cenário selecionado"
              />
            ),
          },
        ]
      : []),
    ...(metricVisibility.minimum
      ? [
          {
            id: "occupancy_minimum",
            label: "Mínimo hoje",
            defaultSize: "compact" as const,
            node: (
              <MetricCard
                icon={Activity}
                label="Mínimo hoje"
                value={todayMetric.minimum}
                loading={initialLoading}
                tone="minimum"
                description="menor total observado"
              />
            ),
          },
        ]
      : []),
    ...(metricVisibility.peak
      ? [
          {
            id: "occupancy_peak",
            label: "Máximo hoje",
            defaultSize: "compact" as const,
            node: (
              <MetricCard
                icon={BarChart3}
                label="Máximo hoje"
                value={todayMetric.peak}
                loading={initialLoading}
                tone="maximum"
                description="maior total observado"
              />
            ),
          },
        ]
      : []),
    {
      id: "occupancy_alerts",
      label: "Alertas",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Bell}
          label="Alertas"
          value={certifiedAlerts.length}
          loading={initialLoading}
          tone={certifiedAlerts.length ? "warning" : "slate"}
          description={thresholdStatus?.label ?? "limites do cenário"}
        />
      ),
    },
    {
      id: "occupancy_active_areas",
      label: "Áreas ocupadas",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={MapPinned}
          label="Áreas ocupadas"
          value={activeAreas}
          loading={initialLoading}
          tone="slate"
          description={`${formatNumber(selectedScenario?.areas?.length ?? 0)} monitoradas`}
        />
      ),
    },
  ];

  const chartCards = chartDefinitions.map((definition) => ({
    chartTypeEnabled: true,
    id: definition.id,
    label: definition.label,
    defaultSize: "wide" as const,
    className: "sm:col-span-2 xl:col-span-2",
    node: selectedScenario ? (
      <OccupancyChartCard
        definition={definition}
        loading={initialLoading}
        metricVisibility={metricVisibility}
        scenario={selectedScenario}
        state={certifiedChartData[definition.id]}
      />
    ) : (
      <EmptyOccupancyCard title={definition.label} />
    ),
  }));

  const detailCards = selectedScenario
    ? [
        {
          id: "occupancy_scenario_detail",
          label: "Cenário de ocupação",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          standardHeightClassName: "row-span-3 sm:row-span-2",
          node: (
            <OccupancyScenarioDetailCard
              history={certifiedHistory}
              scenario={selectedScenario}
            />
          ),
        },
        {
          id: "occupancy_alert_list",
          label: "Histórico de alertas",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
            node: (
              <OccupancyAlertsCard
                alerts={certifiedAlerts}
                loading={initialLoading}
              />
            ),
        },
      ]
    : [];

  return (
    <section
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-screen overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {occupancyCertificationError && !initialLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Dados de ocupação não certificados: {occupancyCertificationError}
        </div>
      ) : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Ocupação ao vivo
            </div>
            <div className="truncate text-lg font-semibold">
              {selectedScenario?.name ?? "Cenário selecionado"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-primary/30 bg-primary/10 text-primary"
            >
              <Activity className="h-3.5 w-3.5" />
              5 segundos
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
        ) : visibleScenarios.length ? (
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-sm font-medium">Cenário de ocupação</div>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Selecione um cenário" />
                </SelectTrigger>
                <SelectContent>
                  {visibleScenarios.map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 bg-primary/10 text-primary"
              >
                <Activity className="h-3.5 w-3.5" />
                Ao vivo
              </Badge>
              <Badge variant="outline" className="gap-1 bg-card">
                <AlertTriangle className="h-3.5 w-3.5" />
                Alertas
              </Badge>
              {lastUpdated ? (
                <Badge variant="outline" className="gap-1 bg-card">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatTime(lastUpdated)}
                </Badge>
              ) : null}
              <MetricVisibilityControls
                onChange={setMetricVisibility}
                value={metricVisibility}
              />
              {canManage ? (
                <Button
                  variant="outline"
                  asChild
                >
                  <Link href="/manager/scenarios">
                    <Settings2 className="h-4 w-4" />
                    Cenários
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (selectedScenario) {
                    loadScenarioData(selectedScenario, {
                      force: true,
                      silent: true,
                    });
                  }
                  loadScenarios();
                }}
                disabled={refreshing || loadingData}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    (refreshing || loadingData) && "animate-spin",
                  )}
                />
                Atualizar
              </Button>
              <MonitorModeButton
                onClick={enterMonitorMode}
                disabled={!visibleScenarios.length}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            <div>
              Nenhum cenário de ocupação configurado. A ocupação usa sempre os
              cenários de áreas, inclusive quando o cenário possui apenas uma área.
            </div>
            {canManage ? (
              <Button
                className="mt-4"
                asChild
              >
                <Link href="/manager/scenarios">
                  <MapPinned className="h-4 w-4" />
                  Configurar cenários
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
      )}

      {visibleScenarios.length && !occupancyCertificationError ? (
        <CardLayout
          menuKey="occupancy"
          monitorMode={monitorMode}
          cards={[
            ...metricCards,
            ...chartCards,
            ...(monitorMode ? [] : detailCards),
          ]}
        />
      ) : null}
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
  tone:
    | "average"
    | "maximum"
    | "minimum"
    | "primary"
    | "sky"
    | "indigo"
    | "slate"
    | "warning";
  value: number | null;
}) {
  const toneClass = {
    average:
      "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
    maximum:
      "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
    minimum:
      "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300",
    primary: "bg-primary/10 text-primary ring-primary/20",
    sky: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    indigo:
      "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
    slate: "bg-muted text-muted-foreground ring-border",
    warning:
      "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300",
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
              {formatOccupancyValue(value)}
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

function OccupancyChartCard({
  definition,
  loading,
  metricVisibility,
  scenario,
  state,
}: {
  definition: OccupancyChartDefinition;
  loading: boolean;
  metricVisibility: OccupancyMetricVisibility;
  scenario: OccupancyScenario;
  state?: OccupancyChartState;
}) {
  const points = state?.points ?? buildEmptyOccupancyPoints(definition);
  const { effectiveTheme } = useTheme();
  const palette = React.useMemo(
    () => getOccupancyChartPalette(effectiveTheme),
    [effectiveTheme],
  );
  const option = React.useMemo(
    () =>
      buildOccupancyChartOption(
        definition,
        points,
        metricVisibility,
        {
          maximum: scenario.max_total ?? undefined,
          minimum: scenario.min_total ?? undefined,
        },
        palette,
      ),
    [
      definition,
      metricVisibility,
      palette,
      points,
      scenario.max_total,
      scenario.min_total,
    ],
  );
  const hasReferenceLimit =
    (scenario.min_total !== null && scenario.min_total !== undefined) ||
    (scenario.max_total !== null && scenario.max_total !== undefined);
  const hasData = points.some(
    (point) =>
      (metricVisibility.average && point.average !== null) ||
      (metricVisibility.minimum && point.minimum !== null) ||
      (metricVisibility.peak && point.peak !== null) ||
      point.current !== null,
  ) || hasReferenceLimit;

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
          <Badge variant="outline" className="w-fit bg-primary/10 text-primary">
            {scenario.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[190px] w-full sm:h-[300px]" />
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
        ) : hasData ? (
          <div className="h-[190px] w-full sm:h-[300px]">
            <EChart option={option} />
          </div>
        ) : (
          <EmptyChartState text="Sem dados de ocupação para este cenário." />
        )}
      </CardContent>
    </Card>
  );
}

function MetricVisibilityControls({
  onChange,
  value,
}: {
  onChange: React.Dispatch<React.SetStateAction<OccupancyMetricVisibility>>;
  value: OccupancyMetricVisibility;
}) {
  const options = [
    { key: "average", label: "Média" },
    { key: "minimum", label: "Mínimo" },
    { key: "peak", label: "Máximo" },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 p-1">
      {options.map((option) => {
        const active = value[option.key];

        return (
          <button
            key={option.key}
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() =>
              onChange((current) => ({
                ...current,
                [option.key]: !current[option.key],
              }))
            }
            className={cn(
              "h-8 rounded px-2 text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function OccupancyScenarioDetailCard({
  history,
  scenario,
}: {
  history: OccupancyScenarioHistoryResponse | null;
  scenario: OccupancyScenario;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-primary" />
          {scenario.name}
        </CardTitle>
        <CardDescription>
          Classe {scenario.object_class || "person"} com limites de alerta do
          cenário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <SmallInfo label="Áreas" value={formatNumber(scenario.areas?.length ?? 0)} />
          <SmallInfo
            label="Mínimo"
            value={thresholdLabel(scenario.min_total)}
          />
          <SmallInfo
            label="Máximo"
            value={thresholdLabel(scenario.max_total)}
          />
        </div>
        <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
          {scenario.areas?.length ? (
            scenario.areas.map((area, index) => {
              const currentArea = history?.areas?.find(
                (item) =>
                  item.area_id === area.area_id && item.camera_id === area.camera_id,
              );

              return (
                <div
                  key={`${area.camera_id}-${area.area_id}-${index}`}
                  className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_90px]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {area.label || area.area_id}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {area.camera_id} / {area.area_id}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {formatOccupancyValue(currentArea?.value)}
                    </div>
                    <div className="text-xs text-muted-foreground">agora</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma área vinculada.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OccupancyAlertsCard({
  alerts,
  loading,
}: {
  alerts: OccupancyAlertRow[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Histórico de alertas
        </CardTitle>
        <CardDescription>
          Alertas gerados pelos limites mínimo e máximo do cenário.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : alerts.length ? (
          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={alert.threshold_kind === "min" ? "warning" : "destructive"}
                    >
                      {alert.threshold_kind === "min" ? "Mínimo" : "Máximo"}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatOccupancyValue(alert.total_value)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      limite {formatOccupancyValue(alert.threshold_value)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(alert.triggered_at)}
                  </div>
                </div>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Sem alertas registrados para este cenário.
          </div>
        )}
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

function EmptyOccupancyCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Selecione um cenário de ocupação.</CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyChartState text="Nenhum cenário selecionado." />
      </CardContent>
    </Card>
  );
}

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex h-[190px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground sm:h-[330px]">
      {text}
    </div>
  );
}

function buildOccupancyChartDefinitions(now: Date): OccupancyChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = endOfAggregateBucket(startOfHour(now), "hour");
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);

  return [
    {
      id: "occupancy_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos do cenário.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "occupancy_chart_hour",
      label: "Hora a hora",
      description: "Hoje por hora com mínimo, média, máximo e atual.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "occupancy_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias do cenário.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "occupancy_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas do cenário.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "occupancy_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses do cenário.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
  ];
}

function occupancyScenarioAggregatePath(
  scenarioId: string,
  definition: OccupancyChartDefinition,
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(definition.from, definition.granularity),
    granularity: definition.granularity,
    to: aggregateQueryIso(definition.to, definition.granularity),
  });

  return `/occupancy/scenarios/${scenarioId}/aggregate?${params.toString()}`;
}

function occupancyScenarioHistoryPath(scenarioId: string, at: Date) {
  const params = new URLSearchParams({ at: at.toISOString() });
  return `/occupancy/scenarios/${scenarioId}/history?${params.toString()}`;
}

function buildOccupancyChartState(
  definition: OccupancyChartDefinition,
  rows: OccupancyScenarioBucketRow[],
): OccupancyChartState {
  return {
    rows,
    points: buildOccupancyPoints(definition, rows),
  };
}

function buildOccupancyPoints(
  definition: OccupancyChartDefinition,
  rows: OccupancyScenarioBucketRow[],
) {
  const totals = aggregateOccupancyRowsByBucket(rows, definition.granularity);

  return listBucketStarts(definition).map((bucketStart) => {
    const key = occupancyAggregateBucketKey(
      bucketStart,
      definition.granularity,
    );
    const total = totals.get(key);
    if (!total) {
      throw new Error(
        `A API não retornou o bucket de ocupação ${bucketStart.toISOString()}; ausência não é ocupação zero.`,
      );
    }

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
      average: total.average,
      current: null,
      minimum: total.minimum,
      peak: total.peak,
    };
  });
}

function buildEmptyOccupancyPoints(
  definition: OccupancyChartDefinition,
): OccupancyPoint[] {
  return listBucketStarts(definition).map((bucketStart) => ({
    bucket: bucketStart.toISOString(),
    label: bucketLabel(bucketStart, definition.granularity),
    average: null,
    current: null,
    minimum: null,
    peak: null,
  }));
}

function attachCurrentToLatestPoint(
  state: OccupancyChartState,
  current: number,
): OccupancyChartState {
  if (!state.points.length) return state;

  const points = state.points.map((point, index) =>
    index === state.points.length - 1 ? { ...point, current } : point,
  );

  return {
    ...state,
    points,
  };
}

function buildPeriodMetric(points: OccupancyPoint[]): PeriodMetric {
  const metric = summarizeOccupancyMetrics(points);
  return {
    average: metric.average,
    minimum: metric.minimum,
    peak: metric.peak,
  };
}

function buildOccupancyChartOption(
  definition: OccupancyChartDefinition,
  points: OccupancyPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: {
    maximum?: number;
    minimum?: number;
  },
  palette: OccupancyChartPalette,
): EnterpriseChartOption {
  const markerDefinitions: OccupancyMarkerDefinition[] = [
    {
      color: palette.current,
      data: points.map((point) => point.current ?? null),
      effect: true,
      fill: palette.current,
      kind: "current",
      name: "Atual",
      offset: [0, 0],
      size: denseMarkerSize(definition, "current"),
      symbol: "circle",
      z: 6,
    },
  ];

  if (metricVisibility.average) {
    markerDefinitions.push({
      color: palette.average,
      data: points.map((point) => point.average),
      fill: palette.average,
      kind: "average",
      name: "Média",
      offset: [0, 0],
      size: denseMarkerSize(definition, "average"),
      symbol: "rect",
      z: 5,
    });
  }

  const dense = definition.granularity === "minute";
  const thresholdDefinitions = [
    ...(limits.minimum !== undefined
      ? [
          {
            data: points.map(() => limits.minimum),
            name: "Limite mínimo",
            color: palette.minimumLimit,
          },
        ]
      : []),
    ...(limits.maximum !== undefined
      ? [
          {
            data: points.map(() => limits.maximum),
            name: "Limite máximo",
            color: palette.maximumLimit,
          },
        ]
      : []),
  ];
  const rangeBaseValues = points.map((point) =>
    point.minimum === null ? null : Math.max(0, point.minimum),
  );
  const rangeSpanValues = points.map((point) =>
    point.minimum === null || point.peak === null
      ? null
      : Math.max(0, point.peak - Math.max(0, point.minimum)),
  );

  return {
    color: [
      ...markerDefinitions.map((series) => series.color),
      ...thresholdDefinitions.map((series) => series.color),
    ],
    grid: {
      bottom: 2,
      containLabel: true,
      left: 4,
      right: 12,
      top: 42,
    },
    legend: {
      data: [
        ...markerDefinitions.map((series) => ({
          icon: series.symbol === "circle" ? "circle" : "roundRect",
          name: series.name,
        })),
        ...thresholdDefinitions.map((series) => series.name),
      ],
      icon: "roundRect",
      itemGap: 14,
      itemHeight: 6,
      itemWidth: 9,
      selectedMode: false,
      textStyle: {
        color: palette.legendText,
        fontSize: 11,
      },
      top: 0,
    },
    tooltip: {
      axisPointer: {
        shadowStyle: {
          color: palette.shadow,
        },
        type: "shadow",
      },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (params: unknown) =>
        formatOccupancyChartTooltip(params, points, metricVisibility, limits),
      padding: [10, 12],
      textStyle: {
        color: palette.tooltipText,
        fontSize: 12,
      },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : `${formatOccupancyValue(Number(value))} pessoas`,
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 11,
        hideOverlap: true,
      },
      axisLine: {
        lineStyle: {
          color: palette.axisLine,
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
        color: palette.axisText,
        fontSize: 11,
      },
      min: 0,
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: palette.gridLine,
        },
      },
      type: "value",
    },
    series: [
      {
        barCategoryGap: dense ? "56%" : "62%",
        barMaxWidth: dense ? 10 : 22,
        data: rangeBaseValues,
        emphasis: {
          disabled: true,
        },
        itemStyle: {
          color: "transparent",
        },
        name: "Base",
        silent: true,
        stack: "occupancy_range",
        tooltip: {
          show: false,
        },
        type: "bar",
      },
      {
        barCategoryGap: dense ? "56%" : "62%",
        barMaxWidth: dense ? 10 : 22,
        barMinHeight: 2,
        data: rangeSpanValues,
        emphasis: {
          itemStyle: {
            color: palette.rangeEmphasis,
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 2, 2],
          color: {
            colorStops: [
              { color: palette.rangeStart, offset: 0 },
              { color: palette.rangeEnd, offset: 1 },
            ],
            type: "linear",
            x: 0,
            x2: 0,
            y: 0,
            y2: 1,
          },
        },
        name: "Intervalo",
        stack: "occupancy_range",
        tooltip: {
          show: false,
        },
        type: "bar",
      },
      ...thresholdDefinitions.map((series) => ({
        data: series.data,
        emphasis: {
          disabled: true,
        },
        lineStyle: {
          color: series.color,
          opacity: 0.86,
          type: "dashed",
          width: 1.6,
        },
        name: series.name,
        showSymbol: false,
        smooth: false,
        symbol: "none",
        tooltip: {
          valueFormatter: (value: number | null | undefined) =>
            value === null || value === undefined
              ? "-"
              : `${formatOccupancyValue(Number(value))} pessoas`,
        },
        type: "line",
        z: 3,
      })),
      ...markerDefinitions.map((series) => ({
        data: series.data,
        itemStyle: {
          borderWidth: 0,
          color: series.fill,
        },
        name: series.name,
        label:
          series.kind === "current"
            ? {
                color: palette.legendText,
                distance: 7,
                fontSize: 10,
                fontWeight: 600,
                formatter: (params: { value?: number | null }) =>
                  params.value === null || params.value === undefined
                    ? ""
                    : formatOccupancyValue(Number(params.value)),
                position: "top",
                show: true,
              }
            : { show: false },
        rippleEffect: series.effect
          ? {
              brushType: "stroke",
              period: 2.8,
              scale: 2.8,
            }
          : undefined,
        showEffectOn: series.effect ? "render" : undefined,
        symbol: series.symbol,
        symbolOffset: series.offset,
        symbolSize: series.size,
        tooltip: {
          valueFormatter: (value: number | null | undefined) =>
            value === null || value === undefined
              ? "-"
              : `${formatOccupancyValue(Number(value))} pessoas`,
        },
        type: series.effect ? "effectScatter" : "scatter",
        z: series.z,
      })),
    ],
  };
}

function formatOccupancyChartTooltip(
  params: unknown,
  points: OccupancyPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: {
    maximum?: number;
    minimum?: number;
  },
) {
  const dataIndex = tooltipDataIndex(params);
  const point = dataIndex === undefined ? undefined : points[dataIndex];
  if (!point) return "";

  const rows = [
    `<strong>${escapeHtml(point.label)}</strong>`,
    point.current === null
      ? undefined
      : `Atual: ${formatOccupancyValue(point.current)}`,
    metricVisibility.average
      ? `Média: ${formatOccupancyValue(point.average)}`
      : undefined,
    metricVisibility.minimum
      ? `Mínimo: ${formatOccupancyValue(point.minimum)}`
      : undefined,
    metricVisibility.peak
      ? `Máximo: ${formatOccupancyValue(point.peak)}`
      : undefined,
    limits.minimum === undefined
      ? undefined
      : `Limite mínimo: ${formatOccupancyValue(limits.minimum)}`,
    limits.maximum === undefined
      ? undefined
      : `Limite máximo: ${formatOccupancyValue(limits.maximum)}`,
  ];

  return rows.filter(Boolean).join("<br/>");
}

function tooltipDataIndex(params: unknown) {
  const candidates = Array.isArray(params) ? params : [params];
  const item = candidates.find(
    (candidate): candidate is { dataIndex: number } =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      typeof (candidate as { dataIndex?: unknown }).dataIndex === "number",
  );

  return item?.dataIndex;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function denseMarkerSize(
  definition: OccupancyChartDefinition,
  kind: "current" | "average" | "limit",
): number | [number, number] {
  const dense = definition.granularity === "minute";

  if (kind === "current") return dense ? 6 : 7.5;
  if (kind === "average") return dense ? [13, 2] : [19, 2.2];
  return dense ? [11, 1.8] : [15, 2];
}

function listBucketStarts(definition: OccupancyChartDefinition) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(definition.from, definition.granularity);
  const end = alignEndToGranularity(definition.to, definition.granularity);
  let guard = 0;

  while (cursor < end && guard < 500) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, definition.granularity);
    guard += 1;
  }

  return starts;
}

function occupancyThresholdStatus(
  current: number,
  scenario: OccupancyScenario,
) {
  if (scenario.max_total !== null && scenario.max_total !== undefined) {
    if (current > scenario.max_total) {
      return {
        label: "acima do máximo",
        tone: "warning" as const,
      };
    }
  }

  if (scenario.min_total !== null && scenario.min_total !== undefined) {
    if (current < scenario.min_total) {
      return {
        label: "abaixo do mínimo",
        tone: "warning" as const,
      };
    }
  }

  return {
    label: "dentro dos limites",
    tone: "primary" as const,
  };
}

function thresholdLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "Sem limite" : formatOccupancyValue(value);
}

function occupancyDataScopeKey(
  companyScopeId?: string | null,
  scenarioId?: string | null,
) {
  if (!companyScopeId || !scenarioId) return "";
  return JSON.stringify([companyScopeId, scenarioId]);
}

function readOccupancyMetricVisibility(
  companyScopeId?: string | null,
): OccupancyMetricVisibility {
  if (typeof window === "undefined") {
    return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;
  }

  try {
    const raw = window.localStorage.getItem(
      occupancyMetricVisibilityKey(companyScopeId),
    );
    if (!raw) return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;
    }

    const stored = parsed as Partial<
      Record<keyof OccupancyMetricVisibility, unknown>
    >;

    return {
      average:
        typeof stored.average === "boolean"
          ? stored.average
          : DEFAULT_OCCUPANCY_METRIC_VISIBILITY.average,
      minimum:
        typeof stored.minimum === "boolean"
          ? stored.minimum
          : DEFAULT_OCCUPANCY_METRIC_VISIBILITY.minimum,
      peak:
        typeof stored.peak === "boolean"
          ? stored.peak
          : DEFAULT_OCCUPANCY_METRIC_VISIBILITY.peak,
    };
  } catch {
    return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;
  }
}

function saveOccupancyMetricVisibility(
  value: OccupancyMetricVisibility,
  companyScopeId?: string | null,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      occupancyMetricVisibilityKey(companyScopeId),
      JSON.stringify(value),
    );
  } catch {
    // Persisting the visual preference is optional.
  }
}

function occupancyMetricVisibilityKey(companyScopeId?: string | null) {
  return getScopedStorageKey(OCCUPANCY_METRIC_VISIBILITY_KEY, companyScopeId);
}

function alignToGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function alignEndToGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
) {
  const aligned = alignToGranularity(date, granularity);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity);
}

function addGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") return endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  return addMonths(date, 1);
}

function bucketLabel(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
) {
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

function formatOccupancyValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value);
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

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
