"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { CardLayout } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { useAuth } from "@/components/app/auth-provider";
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
import {
  loadCustomAggregateCharts,
  saveCustomAggregateCharts,
  type CustomAggregateChart,
} from "@/lib/custom-aggregate-charts";
import {
  loadLiveDashboardSettings,
  saveLiveDashboardSettings,
  type IntradayComparisonMode,
} from "@/lib/live-dashboard-settings";
import { LIVE_REFRESH_EVENT } from "@/lib/live-refresh";
import {
  getCurrentUserCompanyId,
  getStoredMasterCompanyScope,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import type { ReportPayload } from "@/lib/report-export";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  CurrentUser,
  DashboardSummary,
  RealtimeEventsResponse,
} from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatNumber,
  formatTime,
  toDateTimeLocalValue,
} from "@/lib/utils";

type LiveDashboardProps = {
  compact?: boolean;
};

type LoadOptions = {
  silent?: boolean;
  force?: boolean;
};

type AggregateChartDefinition = {
  id: string;
  label: string;
  description: string;
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
  custom?: boolean;
};

type AggregateChartState = {
  rows: AggregateEventRow[];
  granularity: AggregateGranularity;
  error?: string;
};

type ChartPoint = {
  bucket: string;
  label: string;
  total: number;
};

type LiveDashboardSnapshot = {
  scopeId: string;
  summary: DashboardSummary | null;
  aggregateData: Record<string, AggregateChartState>;
  clock: string;
  lastUpdated: string;
};

const REFRESH_MS = 5_000;
const REALTIME_LOOKBACK_MINUTES = 120;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_METRIC_TYPE = "count";
const YESTERDAY_COMPARABLE_ID = "live_yesterday_comparable";
const CURRENT_MONTH_DAYS_ID = "live_current_month_days";
const PREVIOUS_SUFFIX = "__previous";

const aggregateGranularityOptions: Array<{
  value: AggregateGranularity;
  label: string;
}> = [
  { value: "minute", label: "Minuto" },
  { value: "hour", label: "Hora" },
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "semester", label: "Semestre" },
  { value: "year", label: "Ano" },
];

let liveDashboardSnapshot: LiveDashboardSnapshot | null = null;

export function LiveDashboard({ compact = false }: LiveDashboardProps) {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const snapshotScopeId = React.useMemo(() => resolveSnapshotScopeId(user), [user]);
  const cachedSnapshot = React.useMemo(
    () => readLiveDashboardSnapshot(snapshotScopeId),
    [snapshotScopeId],
  );
  const canEditVisual = hasVisualAdminAccess(user);
  const [customCharts, setCustomCharts] = React.useState<CustomAggregateChart[]>(
    () => loadCustomAggregateCharts(companyScopeId),
  );
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState(
    () => loadLiveDashboardSettings(companyScopeId).showPreviousPeriod,
  );
  const [intradayComparison, setIntradayComparison] =
    React.useState<IntradayComparisonMode>(
      () => loadLiveDashboardSettings(companyScopeId).intradayComparison,
    );
  const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<DashboardSummary | null>(
    () => cachedSnapshot?.summary ?? null,
  );
  const [aggregateData, setAggregateData] = React.useState<
    Record<string, AggregateChartState>
  >(() => cachedSnapshot?.aggregateData ?? {});
  const [loading, setLoading] = React.useState(() => !cachedSnapshot);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(
    () => parseSnapshotDate(cachedSnapshot?.lastUpdated),
  );
  const [clock, setClock] = React.useState(
    () => parseSnapshotDate(cachedSnapshot?.clock) ?? new Date(),
  );

  const requestRef = React.useRef<AbortController | null>(null);
  const runningRef = React.useRef(false);
  const hasDataRef = React.useRef(Boolean(cachedSnapshot));

  const chartDefinitions = React.useMemo(
    () => buildAggregateChartDefinitions(clock, customCharts),
    [clock, customCharts],
  );
  const minuteRows = React.useMemo(
    () => aggregateData.live_chart_minute?.rows ?? [],
    [aggregateData],
  );
  const hourRows = React.useMemo(
    () => aggregateData.live_chart_hour?.rows ?? [],
    [aggregateData],
  );
  const yesterdayComparableRows = React.useMemo(
    () => aggregateData[YESTERDAY_COMPARABLE_ID]?.rows ?? [],
    [aggregateData],
  );
  const hasRenderableData =
    Boolean(summary) ||
    Object.values(aggregateData).some((data) => data.rows.length > 0);
  const initialLoading = loading && !hasRenderableData;

  React.useEffect(() => {
    const storedCharts = loadCustomAggregateCharts(companyScopeId);
    const settings = loadLiveDashboardSettings(companyScopeId);
    setCustomCharts((current) =>
      JSON.stringify(current) === JSON.stringify(storedCharts)
        ? current
        : storedCharts,
    );
    setShowPreviousPeriod(settings.showPreviousPeriod);
    setIntradayComparison(settings.intradayComparison);
  }, [companyScopeId]);

  React.useEffect(() => {
    hasDataRef.current = hasRenderableData;
  }, [hasRenderableData]);

  const load = React.useCallback(
    async ({ silent = false, force = false }: LoadOptions = {}) => {
      if (runningRef.current) {
        if (!force) return;
        requestRef.current?.abort();
      }

      const controller = new AbortController();
      requestRef.current = controller;
      runningRef.current = true;

      const silentLoad = silent || hasDataRef.current;
      if (silentLoad) setRefreshing(true);
      else setLoading(true);

      const now = new Date();
      const visibleDefinitions = buildAggregateChartDefinitions(now, customCharts);
      const previousDefinitions = showPreviousPeriod
        ? visibleDefinitions.map((definition) =>
            buildComparisonAggregateDefinition(definition, intradayComparison),
          )
        : [];
      const definitions = [
        ...visibleDefinitions,
        ...previousDefinitions,
        buildYesterdayComparableDefinition(now),
        buildCurrentMonthDaysDefinition(now),
      ];

      try {
        const [summaryResult, realtimeResult, aggregateEntries] = await Promise.all([
          apiFetch<DashboardSummary>("/analytics/dashboard", {
            signal: controller.signal,
          }).catch(() => null),
          apiFetch<RealtimeEventsResponse>(
            `/analytics/realtime?minutes=${REALTIME_LOOKBACK_MINUTES}`,
            {
              signal: controller.signal,
            },
          ).catch(() => null),
          Promise.all(
            definitions.map(async (definition) => {
              try {
                const response = await apiFetch<AggregateEventsResponse>(
                  aggregatePath(definition),
                  { signal: controller.signal },
                );
                const state: AggregateChartState = {
                  rows: response.data ?? [],
                  granularity: response.granularity ?? definition.granularity,
                };
                return [definition.id, state] as const;
              } catch (error) {
                if (isAbortError(error)) throw error;

                const state: AggregateChartState = {
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
          ),
        ]);

        const rawAggregateData = Object.fromEntries(aggregateEntries);
        if (realtimeResult?.data?.length) {
          rawAggregateData.live_chart_minute = {
            rows: realtimeResult.data,
            granularity: "minute",
          };
        }

        const nextAggregateData = hydrateOpenAggregateBuckets(
          rawAggregateData,
          now,
          visibleDefinitions,
        );
        const refreshedAt = new Date();

        setSummary(summaryResult);
        setAggregateData(nextAggregateData);
        setClock(now);
        setLastUpdated(refreshedAt);
        storeLiveDashboardSnapshot({
          scopeId: snapshotScopeId,
          summary: summaryResult,
          aggregateData: nextAggregateData,
          clock: now.toISOString(),
          lastUpdated: refreshedAt.toISOString(),
        });

        const visibleDefinitionIds = new Set(
          [...visibleDefinitions, ...previousDefinitions].map(
            (definition) => definition.id,
          ),
        );
        const hasAggregateError = aggregateEntries.some(
          ([id, data]) => visibleDefinitionIds.has(id) && data.error,
        );
        if (hasAggregateError && !silentLoad) {
          toast.error("Alguns gráficos não puderam ser carregados.");
        }
      } catch (error) {
        if (isAbortError(error)) return;

        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os dados ao vivo.";
        toast.error(message);
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          runningRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [customCharts, intradayComparison, showPreviousPeriod, snapshotScopeId],
  );

  React.useEffect(() => {
    let disposed = false;
    let timeout: number | undefined;

    function scheduleNextRefresh() {
      timeout = window.setTimeout(async () => {
        if (disposed) return;

        if (document.visibilityState === "visible") {
          await load({ silent: true });
        }

        scheduleNextRefresh();
      }, REFRESH_MS);
    }

    load({ force: true }).finally(scheduleNextRefresh);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        load({ silent: true, force: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestRef.current?.abort();
    };
  }, [load]);

  React.useEffect(() => {
    function handleLiveRefresh() {
      load({ silent: true, force: true });
    }

    window.addEventListener(LIVE_REFRESH_EVENT, handleLiveRefresh);

    return () => {
      window.removeEventListener(LIVE_REFRESH_EVENT, handleLiveRefresh);
    };
  }, [load]);

  function updateCustomCharts(nextCharts: CustomAggregateChart[]) {
    setCustomCharts(nextCharts);
    saveCustomAggregateCharts(nextCharts, companyScopeId);
  }

  function updateShowPreviousPeriod(value: boolean) {
    setShowPreviousPeriod(value);
    saveLiveDashboardSettings({
      intradayComparison,
      showPreviousPeriod: value,
    }, companyScopeId);
  }

  function updateIntradayComparison(value: IntradayComparisonMode) {
    setIntradayComparison(value);
    saveLiveDashboardSettings({
      intradayComparison: value,
      showPreviousPeriod,
    }, companyScopeId);
  }

  const todayTotal = React.useMemo(() => sumAggregateRows(hourRows), [hourRows]);
  const yesterdayComparableTotal = React.useMemo(
    () => sumAggregateRows(yesterdayComparableRows),
    [yesterdayComparableRows],
  );
  const realtimeOneMinuteTotal = React.useMemo(
    () => sumRowsSince(minuteRows, clock, 1),
    [clock, minuteRows],
  );
  const realtimeHourTotal = React.useMemo(
    () => sumRowsSince(minuteRows, clock, 60),
    [clock, minuteRows],
  );
  const realtimeFiveMinutesTotal = React.useMemo(
    () => sumRowsSince(minuteRows, clock, 5),
    [clock, minuteRows],
  );
  const activeCamerasToday = React.useMemo(
    () => {
      const todayStart = startOfDay(clock).getTime();
      return new Set(
        [...hourRows, ...minuteRows]
          .filter((row) => {
            const bucket = new Date(row.bucket).getTime();
            return !Number.isNaN(bucket) && bucket >= todayStart;
          })
          .map((row) => row.camera_id)
          .filter(Boolean),
      ).size;
    },
    [clock, hourRows, minuteRows],
  );
  const hourDefinition = chartDefinitions.find(
    (definition) => definition.id === "live_chart_hour",
  );
  const hourPoints = React.useMemo(
    () => (hourDefinition ? buildAggregatePoints(hourDefinition, hourRows) : []),
    [hourDefinition, hourRows],
  );
  const peakHour = getPeakPoint(hourPoints);
  const projectedTotal = projectDayTotal(todayTotal, clock);
  const delta = computeDelta(todayTotal, yesterdayComparableTotal);

  const metricCards = [
    {
      id: "live_today_total",
      label: "Acumulado hoje",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Activity}
          label="Acumulado hoje"
          value={todayTotal}
          loading={initialLoading}
          tone="primary"
          description="00:00 até agora"
        />
      ),
    },
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
          tone="indigo"
          description="barra atual em formação"
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
          tone="sky"
          description="últimos 60 minutos"
        />
      ),
    },
    {
      id: "live_vs_yesterday",
      label: "Vs ontem",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={delta !== null && delta < 0 ? TrendingDown : TrendingUp}
          label="Vs ontem"
          value={todayTotal - yesterdayComparableTotal}
          loading={initialLoading}
          tone={delta !== null && delta < 0 ? "slate" : "sky"}
          description={
            delta === null ? "sem base" : `${formatPercent(delta)} no mesmo horário`
          }
          signed
        />
      ),
    },
  ];

  const chartCards = chartDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    defaultSize: "wide" as const,
    className: "sm:col-span-2 xl:col-span-2",
    node: (
      <AggregateChartCard
        definition={definition}
        loading={initialLoading}
        previousState={aggregateData[previousAggregateId(definition.id)]}
        intradayComparison={intradayComparison}
        showPreviousPeriod={showPreviousPeriod}
        state={aggregateData[definition.id]}
      />
    ),
  }));

  const insightCards = compact
    ? []
    : [
        {
          id: "live_insights",
          label: "Leituras inteligentes",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          node: (
            <Card>
              <CardHeader>
                <CardTitle>Leituras inteligentes</CardTitle>
                <CardDescription>
                  Indicadores derivados dos agregados minuto e hora.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {initialLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))
                ) : (
                  <>
                    <InsightRow
                      label="Ontem no mesmo horário"
                      value={formatNumber(yesterdayComparableTotal)}
                    />
                    <InsightRow
                      label="Últimos 5 minutos"
                      value={formatNumber(realtimeFiveMinutesTotal)}
                    />
                    <InsightRow
                      label="Pico do dia"
                      value={
                        peakHour
                          ? `${peakHour.label} · ${formatNumber(peakHour.total)}`
                          : "-"
                      }
                    />
                    <InsightRow
                      label="Câmeras com evento hoje"
                      value={formatNumber(activeCamerasToday)}
                    />
                    <InsightRow
                      label="Câmeras ativas"
                      value={formatNumber(summary?.active_cameras)}
                    />
                    <InsightRow
                      label="Projeção do dia"
                      value={formatNumber(projectedTotal)}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ),
        },
      ];
  const liveReportPayload: ReportPayload = {
    title: "Relatório Ao Vivo",
    subtitle:
      "Dados agregados por minuto, hora, dia, semana, mês, semestre e ano.",
    filename: `ipxdata-ao-vivo-${reportDateSlug(lastUpdated ?? clock)}`,
    generatedAt: lastUpdated ?? clock,
    dataCompleteUntil: clock,
    context: [
      showPreviousPeriod
        ? `Comparativo: ${intradayComparison === "last_week" ? "semana passada" : "ontem"}`
        : "Sem período anterior",
    ].filter(Boolean),
    metrics: [
      {
        label: "Acumulado hoje",
        value: formatNumber(todayTotal),
        description: "00:00 até agora",
      },
      {
        label: "Último minuto",
        value: formatNumber(realtimeOneMinuteTotal),
        description: "Barra atual em formação",
      },
      {
        label: "Última hora",
        value: formatNumber(realtimeHourTotal),
        description: "Últimos 60 minutos",
      },
      {
        label: "Vs ontem",
        value: formatSignedNumber(todayTotal - yesterdayComparableTotal, true),
        description:
          delta === null ? "Sem base comparativa" : `${formatPercent(delta)} no mesmo horário`,
      },
      {
        label: "Câmeras com evento hoje",
        value: formatNumber(activeCamerasToday),
      },
      {
        label: "Câmeras ativas",
        value: formatNumber(summary?.active_cameras),
      },
      {
        label: "Workers ativos",
        value: formatNumber(summary?.active_workers),
      },
      {
        label: "Projeção do dia",
        value: formatNumber(projectedTotal),
      },
    ],
    charts: chartDefinitions.map((definition) =>
      buildLiveReportChart(
        definition,
        aggregateData[definition.id],
        aggregateData[previousAggregateId(definition.id)],
        showPreviousPeriod,
        intradayComparison,
      ),
    ),
    tables: [
      {
        title: "Leituras inteligentes",
        columns: [
          { key: "label", label: "Indicador", width: 28 },
          { key: "value", label: "Valor", width: 20 },
        ],
        rows: [
          {
            label: "Ontem no mesmo horário",
            value: formatNumber(yesterdayComparableTotal),
          },
          {
            label: "Últimos 5 minutos",
            value: formatNumber(realtimeFiveMinutesTotal),
          },
          {
            label: "Pico do dia",
            value: peakHour
              ? `${peakHour.label} · ${formatNumber(peakHour.total)}`
              : "-",
          },
          {
            label: "Câmeras com evento hoje",
            value: formatNumber(activeCamerasToday),
          },
          {
            label: "Câmeras ativas",
            value: formatNumber(summary?.active_cameras),
          },
          {
            label: "Projeção do dia",
            value: formatNumber(projectedTotal),
          },
        ],
      },
    ],
  };

  return (
    <section id="ao-vivo" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
          <Zap className="h-3.5 w-3.5" />
          Atualização 5s
        </Badge>
        <Badge variant="outline" className="gap-1 bg-card">
          <BarChart3 className="h-3.5 w-3.5" />
          Aggregate
        </Badge>
        <PreviousPeriodToggle
          checked={showPreviousPeriod}
          onCheckedChange={updateShowPreviousPeriod}
        />
        {showPreviousPeriod ? (
          <ComparisonModeSelect
            value={intradayComparison}
            onValueChange={updateIntradayComparison}
          />
        ) : null}
        {lastUpdated ? (
          <Badge variant="outline" className="gap-1 bg-card">
            <Clock3 className="h-3.5 w-3.5" />
            {formatTime(lastUpdated)}
          </Badge>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => load({ silent: true, force: true })}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Atualizar
        </Button>
        <ReportExportActions
          payload={liveReportPayload}
          disabled={initialLoading || !hasRenderableData}
        />
      </div>

      <CardLayout
        menuKey="live"
        cards={[...metricCards, ...chartCards, ...insightCards]}
        editActions={
          canEditVisual ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCustomDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Gráfico personalizado
            </Button>
          ) : null
        }
      />

      {canEditVisual ? (
        <CustomChartDialog
          open={customDialogOpen}
          charts={customCharts}
          onChartsChange={updateCustomCharts}
          onOpenChange={setCustomDialogOpen}
        />
      ) : null}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  loading,
  tone,
  description,
  signed = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: number;
  loading: boolean;
  tone: "primary" | "sky" | "indigo" | "slate";
  description?: string;
  signed?: boolean;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary ring-primary/20",
    sky: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    indigo: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
    slate: "bg-muted text-muted-foreground ring-border",
  }[tone];

  return (
    <Card>
      <CardContent className="flex min-h-[116px] items-center justify-between gap-4 p-4">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-2 text-2xl font-semibold">
              {formatSignedNumber(value, signed)}
            </div>
          )}
          {description ? (
            <div className="mt-1 text-xs text-muted-foreground">{description}</div>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-md ring-1",
            toneClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function AggregateChartCard({
  definition,
  intradayComparison,
  loading,
  state,
  previousState,
  showPreviousPeriod,
}: {
  definition: AggregateChartDefinition;
  intradayComparison: IntradayComparisonMode;
  loading: boolean;
  state: AggregateChartState | undefined;
  previousState: AggregateChartState | undefined;
  showPreviousPeriod: boolean;
}) {
  const points = React.useMemo(
    () => buildAggregatePoints(definition, state?.rows ?? []),
    [definition, state?.rows],
  );
  const previousPoints = React.useMemo(
    () =>
      showPreviousPeriod
        ? buildAggregateComparisonPoints(
            definition,
            previousState?.rows ?? [],
            intradayComparison,
          )
        : [],
    [definition, intradayComparison, previousState?.rows, showPreviousPeriod],
  );
  const option = React.useMemo(
    () => buildChartOption(definition, points, previousPoints, intradayComparison),
    [definition, intradayComparison, points, previousPoints],
  );
  const hasData =
    points.some((point) => point.total !== 0) ||
    previousPoints.some((point) => point.total !== 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          {definition.label}
        </CardTitle>
        <CardDescription>{definition.description}</CardDescription>
        {showPreviousPeriod ? (
          <div className="max-w-full break-words rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-5 text-primary">
            {comparisonDescription(definition, intradayComparison)}
          </div>
        ) : null}
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
          <EmptyChartState text="Sem eventos no período deste gráfico." />
        )}
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

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function PreviousPeriodToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition",
        checked
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-7 items-center rounded-full p-0.5 transition",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full bg-background shadow-sm transition",
            checked && "translate-x-3",
          )}
        />
      </span>
      Período anterior
    </button>
  );
}

function ComparisonModeSelect({
  value,
  onValueChange,
}: {
  value: IntradayComparisonMode;
  onValueChange: (value: IntradayComparisonMode) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onValueChange(nextValue as IntradayComparisonMode)
      }
    >
      <SelectTrigger className="h-9 w-full min-w-[190px] bg-card text-xs sm:w-[190px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yesterday">Min/hora: ontem</SelectItem>
        <SelectItem value="last_week">Min/hora: semana passada</SelectItem>
      </SelectContent>
    </Select>
  );
}

function CustomChartDialog({
  open,
  charts,
  onChartsChange,
  onOpenChange,
}: {
  open: boolean;
  charts: CustomAggregateChart[];
  onChartsChange: (charts: CustomAggregateChart[]) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const [granularity, setGranularity] =
    React.useState<AggregateGranularity>("day");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  React.useEffect(() => {
    if (!open) return;

    const now = new Date();
    setName("");
    setGranularity("day");
    setFrom(toDateTimeLocalValue(addDays(startOfDay(now), -6)));
    setTo(toDateTimeLocalValue(addDays(startOfDay(now), 1)));
  }, [open]);

  function saveChart() {
    const cleanName = name.trim();
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (!cleanName) {
      toast.error("Informe um nome para o gráfico.");
      return;
    }

    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate >= toDate
    ) {
      toast.error("Informe um período válido.");
      return;
    }

    onChartsChange([
      ...charts,
      {
        id: createCustomChartId(),
        name: cleanName,
        granularity,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    onOpenChange(false);
  }

  function removeChart(chartId: string) {
    onChartsChange(charts.filter((chart) => chart.id !== chartId));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gráfico personalizado</DialogTitle>
          <DialogDescription>
            Salve um período agregado para adicioná-lo como card no Ao vivo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor="custom-chart-name">Nome</Label>
            <Input
              id="custom-chart-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Horário comercial"
            />
          </div>
          <div className="space-y-2">
            <Label>Agregação</Label>
            <Select
              value={granularity}
              onValueChange={(value) =>
                setGranularity(value as AggregateGranularity)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aggregateGranularityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="custom-chart-from">De</Label>
            <Input
              id="custom-chart-from"
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-chart-to">Até</Label>
            <Input
              id="custom-chart-to"
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        {charts.length ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Personalizados salvos</div>
            <div className="space-y-2">
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{chart.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {granularityLabel(chart.granularity)} ·{" "}
                      {formatDateTime(chart.from)} até {formatDateTime(chart.to)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChart(chart.id)}
                    aria-label={`Excluir ${chart.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={saveChart}>
            <Save className="h-4 w-4" />
            Salvar gráfico
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildAggregateChartDefinitions(
  now: Date,
  customCharts: CustomAggregateChart[],
): AggregateChartDefinition[] {
  const defaultDefinitions = buildDefaultAggregateChartDefinitions(now);
  const customDefinitions = customCharts
    .map((chart) => {
      const from = new Date(chart.from);
      const to = new Date(chart.to);
      if (
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime()) ||
        from >= to
      ) {
        return null;
      }

      return {
        id: `live_custom_${chart.id}`,
        label: chart.name,
        description: `${granularityLabel(chart.granularity)} personalizado.`,
        granularity: chart.granularity,
        from,
        to,
        custom: true,
      } satisfies AggregateChartDefinition;
    })
    .filter(Boolean) as AggregateChartDefinition[];

  return [...defaultDefinitions, ...customDefinitions];
}

function buildDefaultAggregateChartDefinitions(
  now: Date,
): AggregateChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = addHours(startOfHour(now), 1);
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);
  const currentSemesterStart = startOfSemester(now);
  const currentYearStart = startOfYear(now);

  return [
    {
      id: "live_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "live_chart_hour",
      label: "Hora a hora",
      description: "Hoje por hora.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "live_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "live_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "live_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
    {
      id: "live_chart_semester",
      label: "Semestre a semestre",
      description: "Últimos 6 semestres.",
      granularity: "semester",
      from: addMonths(currentSemesterStart, -5 * 6),
      to: addMonths(currentSemesterStart, 6),
    },
    {
      id: "live_chart_year",
      label: "Ano a ano",
      description: "Últimos 5 anos.",
      granularity: "year",
      from: addYears(currentYearStart, -4),
      to: addYears(currentYearStart, 1),
    },
  ];
}

function buildYesterdayComparableDefinition(now: Date): AggregateChartDefinition {
  const todayStart = startOfDay(now);
  const yesterdayStart = addDays(todayStart, -1);
  const elapsed = Math.max(now.getTime() - todayStart.getTime(), 1);

  return {
    id: YESTERDAY_COMPARABLE_ID,
    label: "Ontem comparável",
    description: "Mesmo intervalo do dia anterior.",
    granularity: "hour",
    from: yesterdayStart,
    to: new Date(yesterdayStart.getTime() + elapsed),
  };
}

function buildCurrentMonthDaysDefinition(now: Date): AggregateChartDefinition {
  const todayStart = startOfDay(now);

  return {
    id: CURRENT_MONTH_DAYS_ID,
    label: "Dias do mês atual",
    description: "Base auxiliar para acumular mês, semestre e ano em andamento.",
    granularity: "day",
    from: startOfMonth(now),
    to: addDays(todayStart, 1),
  };
}

function buildComparisonAggregateDefinition(
  definition: AggregateChartDefinition,
  intradayComparison: IntradayComparisonMode,
): AggregateChartDefinition {
  const comparisonStarts = listAggregateBucketStarts(definition).map((date) =>
    comparisonBucketStart(date, definition.granularity, intradayComparison),
  );
  const from = comparisonStarts.length
    ? new Date(Math.min(...comparisonStarts.map((date) => date.getTime())))
    : definition.from;
  const lastStart = comparisonStarts.length
    ? new Date(Math.max(...comparisonStarts.map((date) => date.getTime())))
    : definition.from;
  const to = addGranularity(lastStart, definition.granularity);

  return {
    ...definition,
    id: previousAggregateId(definition.id),
    label: comparisonSeriesName(definition, intradayComparison),
    description: comparisonDescription(definition, intradayComparison),
    from,
    to,
  };
}

function previousAggregateId(chartId: string) {
  return `${chartId}${PREVIOUS_SUFFIX}`;
}

function comparisonDescription(
  definition: AggregateChartDefinition,
  intradayComparison: IntradayComparisonMode,
) {
  if (
    (definition.granularity === "minute" || definition.granularity === "hour") &&
    !definition.custom
  ) {
    const currentReference = addMinutes(definition.to, -1);
    const comparisonReference = comparisonBucketStart(
      currentReference,
      definition.granularity,
      intradayComparison,
    );

    return intradayComparison === "last_week"
      ? `Comparando com ${weekdayName(comparisonReference)} da semana passada.`
      : `Comparando com ontem, ${weekdayName(comparisonReference)}.`;
  }

  if (definition.granularity === "day" && !definition.custom) {
    return "Comparando com os mesmos dias da semana passada.";
  }
  if (definition.granularity === "week" && !definition.custom) {
    return "Comparando cada semana com a mesma semana do mês anterior: 1ª com 1ª, 2ª com 2ª, e assim por diante.";
  }
  if (definition.granularity === "month" && !definition.custom) {
    return "Comparando cada mês com o mesmo mês do ano anterior.";
  }
  if (definition.granularity === "semester" && !definition.custom) {
    return "Comparando cada semestre com o mesmo semestre do ano anterior.";
  }
  if (definition.granularity === "year" && !definition.custom) {
    return "Comparando cada ano com o ano anterior.";
  }

  return "Comparando com período anterior.";
}

function aggregatePath(definition: AggregateChartDefinition) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: definition.from.toISOString(),
    to: definition.to.toISOString(),
    metric_type: DEFAULT_METRIC_TYPE,
  });

  return `/analytics/aggregate?${params.toString()}`;
}

function hydrateOpenAggregateBuckets(
  data: Record<string, AggregateChartState>,
  now: Date,
  visibleDefinitions: AggregateChartDefinition[],
) {
  const next = Object.fromEntries(
    Object.entries(data).map(([id, state]) => [
      id,
      { ...state, rows: [...state.rows] },
    ]),
  ) as Record<string, AggregateChartState>;

  const currentHourStart = startOfHour(now);
  const previousHourStart = addHours(currentHourStart, -1);
  hydrateHourBucketFromMinuteRows(next, previousHourStart, currentHourStart);
  hydrateHourBucketFromMinuteRows(
    next,
    currentHourStart,
    addHours(currentHourStart, 1),
    true,
  );

  const todayStart = startOfDay(now);
  const todayTotal = sumRowsInRange(
    next.live_chart_hour?.rows ?? [],
    todayStart,
    addDays(todayStart, 1),
  );
  replaceBucketTotal(next, "live_chart_day", "day", todayStart, todayTotal);
  replaceBucketTotal(
    next,
    CURRENT_MONTH_DAYS_ID,
    "day",
    todayStart,
    todayTotal,
  );

  const currentWeekStart = startOfWeek(now);
  const currentWeekTotal = sumRowsInBucketRange(
    next.live_chart_day?.rows ?? [],
    "day",
    currentWeekStart,
    addDays(currentWeekStart, 7),
  );
  replaceBucketTotal(
    next,
    "live_chart_week",
    "week",
    currentWeekStart,
    currentWeekTotal,
  );

  const currentMonthStart = startOfMonth(now);
  const currentMonthTotal = sumRowsInBucketRange(
    next[CURRENT_MONTH_DAYS_ID]?.rows ?? [],
    "day",
    currentMonthStart,
    addMonths(currentMonthStart, 1),
  );
  replaceBucketTotal(
    next,
    "live_chart_month",
    "month",
    currentMonthStart,
    currentMonthTotal,
  );

  const currentSemesterStart = startOfSemester(now);
  const currentSemesterTotal = sumRowsInBucketRange(
    next.live_chart_month?.rows ?? [],
    "month",
    currentSemesterStart,
    addMonths(currentSemesterStart, 6),
  );
  replaceBucketTotal(
    next,
    "live_chart_semester",
    "semester",
    currentSemesterStart,
    currentSemesterTotal,
  );

  const currentYearStart = startOfYear(now);
  const currentYearTotal = sumRowsInBucketRange(
    next.live_chart_month?.rows ?? [],
    "month",
    currentYearStart,
    addYears(currentYearStart, 1),
  );
  replaceBucketTotal(
    next,
    "live_chart_year",
    "year",
    currentYearStart,
    currentYearTotal,
  );

  visibleDefinitions
    .filter((definition) => definition.custom)
    .forEach((definition) => {
      hydrateCustomOpenBucket(next, definition, now);
    });

  return next;
}

function hydrateHourBucketFromMinuteRows(
  data: Record<string, AggregateChartState>,
  from: Date,
  to: Date,
  replaceWhenEmpty = false,
) {
  const minuteRows = data.live_chart_minute?.rows ?? [];
  const hasMinuteRows = minuteRows.some((row) => {
    const bucket = new Date(row.bucket).getTime();
    return !Number.isNaN(bucket) && bucket >= from.getTime() && bucket < to.getTime();
  });

  if (!replaceWhenEmpty && !hasMinuteRows) return;

  const existingTotal = getBucketTotal(data.live_chart_hour?.rows ?? [], "hour", from);
  const minuteTotal = sumRowsInRange(minuteRows, from, to);
  const total = Math.max(existingTotal, minuteTotal);

  replaceBucketTotal(
    data,
    "live_chart_hour",
    "hour",
    from,
    total,
  );
}

function hydrateCustomOpenBucket(
  data: Record<string, AggregateChartState>,
  definition: AggregateChartDefinition,
  now: Date,
) {
  if (!data[definition.id] || now < definition.from || now >= definition.to) {
    return;
  }

  const bucketStart = alignToGranularity(now, definition.granularity);
  const bucketEnd = addGranularity(bucketStart, definition.granularity);
  const source = sourceRowsForOpenBucket(data, definition.granularity);
  if (!source) return;

  replaceBucketTotal(
    data,
    definition.id,
    definition.granularity,
    bucketStart,
    sumRowsForSource(source.rows, source.granularity, bucketStart, bucketEnd),
  );
}

function sourceRowsForOpenBucket(
  data: Record<string, AggregateChartState>,
  granularity: AggregateGranularity,
): { rows: AggregateEventRow[]; granularity: AggregateGranularity } | null {
  if (granularity === "minute") return null;
  if (granularity === "hour") {
    return { rows: data.live_chart_minute?.rows ?? [], granularity: "minute" };
  }
  if (granularity === "day") {
    return { rows: data.live_chart_hour?.rows ?? [], granularity: "hour" };
  }
  if (granularity === "week") {
    return { rows: data.live_chart_day?.rows ?? [], granularity: "day" };
  }
  if (granularity === "month") {
    return {
      rows: data[CURRENT_MONTH_DAYS_ID]?.rows ?? [],
      granularity: "day",
    };
  }
  if (granularity === "semester" || granularity === "year") {
    return { rows: data.live_chart_month?.rows ?? [], granularity: "month" };
  }

  return null;
}

function replaceBucketTotal(
  data: Record<string, AggregateChartState>,
  chartId: string,
  granularity: AggregateGranularity,
  bucketStart: Date,
  total: number,
) {
  const state = data[chartId];
  if (!state) return;

  const bucketKey = bucketKeyForGranularity(bucketStart, granularity);
  data[chartId] = {
    ...state,
    rows: [
      ...state.rows.filter((row) => {
        const rowDate = new Date(row.bucket);
        if (Number.isNaN(rowDate.getTime())) return true;
        return bucketKeyForGranularity(rowDate, granularity) !== bucketKey;
      }),
      createAggregateRow(bucketStart, total),
    ],
  };
}

function createAggregateRow(bucket: Date, total: number): AggregateEventRow {
  return {
    bucket: bucket.toISOString(),
    camera_id: "",
    metric_type: DEFAULT_METRIC_TYPE,
    total,
  };
}

function buildAggregatePoints(
  definition: AggregateChartDefinition,
  rows: AggregateEventRow[],
) {
  const totals = aggregateRowsByBucket(rows, definition.granularity);
  const points: ChartPoint[] = [];
  listAggregateBucketStarts(definition).forEach((bucketStart) => {
    const key = bucketKeyForGranularity(bucketStart, definition.granularity);
    points.push({
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
      total: totals.get(key) ?? 0,
    });
  });

  return points;
}

function buildAggregateComparisonPoints(
  definition: AggregateChartDefinition,
  rows: AggregateEventRow[],
  intradayComparison: IntradayComparisonMode,
) {
  const totals = aggregateRowsByBucket(rows, definition.granularity);

  return listAggregateBucketStarts(definition).map((bucketStart) => {
    const comparisonStart = comparisonBucketStart(
      bucketStart,
      definition.granularity,
      intradayComparison,
    );
    const key = bucketKeyForGranularity(comparisonStart, definition.granularity);

    return {
      bucket: comparisonStart.toISOString(),
      label: bucketLabel(comparisonStart, definition.granularity),
      total: totals.get(key) ?? 0,
    };
  });
}

function listAggregateBucketStarts(definition: AggregateChartDefinition) {
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

function aggregateRowsByBucket(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
) {
  const totals = new Map<number, number>();

  rows.forEach((row) => {
    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;

    const key = bucketKeyForGranularity(date, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0));
  });

  return totals;
}

function getBucketTotal(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
  bucketStart: Date,
) {
  const key = bucketKeyForGranularity(bucketStart, granularity);

  return rows.reduce((sum, row) => {
    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return sum;
    if (bucketKeyForGranularity(date, granularity) !== key) return sum;
    return sum + (row.total ?? 0);
  }, 0);
}

function comparisonBucketStart(
  bucketStart: Date,
  granularity: AggregateGranularity,
  intradayComparison: IntradayComparisonMode,
) {
  if (granularity === "minute" || granularity === "hour") {
    return addDays(bucketStart, intradayComparison === "last_week" ? -7 : -1);
  }
  if (granularity === "day") return addDays(bucketStart, -7);
  if (granularity === "week") return equivalentWeekInPreviousMonth(bucketStart);
  if (granularity === "month" || granularity === "semester") {
    return addYears(bucketStart, -1);
  }
  return addYears(bucketStart, -1);
}

function equivalentWeekInPreviousMonth(bucketStart: Date) {
  const currentMonthGridStart = startOfWeek(startOfMonth(bucketStart));
  const weekIndex = Math.max(
    0,
    Math.round(
      (startOfWeek(bucketStart).getTime() - currentMonthGridStart.getTime()) /
        (7 * DAY_MS),
    ),
  );
  const previousMonthGridStart = startOfWeek(
    addMonths(startOfMonth(bucketStart), -1),
  );

  return addDays(previousMonthGridStart, weekIndex * 7);
}

function comparisonSeriesName(
  definition: AggregateChartDefinition,
  intradayComparison: IntradayComparisonMode,
) {
  if (definition.granularity === "minute" || definition.granularity === "hour") {
    const currentReference = addMinutes(definition.to, -1);
    const comparisonReference = comparisonBucketStart(
      currentReference,
      definition.granularity,
      intradayComparison,
    );

    return intradayComparison === "last_week"
      ? `Semana passada (${weekdayName(comparisonReference)})`
      : `Ontem (${weekdayName(comparisonReference)})`;
  }
  if (definition.granularity === "day") return "Mesmo dia da semana passada";
  if (definition.granularity === "week") return "Mesma semana do mês anterior";
  if (definition.granularity === "month") return "Mesmo mês do ano anterior";
  if (definition.granularity === "semester") return "Mesmo semestre do ano anterior";
  return "Ano anterior";
}

function buildChartOption(
  definition: AggregateChartDefinition,
  points: ChartPoint[],
  previousPoints: ChartPoint[],
  intradayComparison: IntradayComparisonMode,
): EnterpriseChartOption {
  const showPreviousSeries = previousPoints.length > 0;
  const previousSeriesName = comparisonSeriesName(definition, intradayComparison);

  return {
    color: showPreviousSeries ? ["#1267C4", "#B7C7DA"] : ["#1267C4"],
    grid: {
      left: 4,
      right: 10,
      top: showPreviousSeries ? 58 : 18,
      bottom: 2,
      containLabel: true,
    },
    legend: showPreviousSeries
      ? {
          top: 0,
          left: 0,
          right: 0,
          itemGap: 14,
          itemWidth: 10,
          itemHeight: 10,
          textStyle: {
            color: "#526477",
            fontSize: 12,
          },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: "rgba(18, 103, 196, 0.06)",
        },
      },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      padding: [10, 12],
      textStyle: {
        color: "#13233A",
        fontSize: 12,
      },
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : `${formatNumber(Number(value))} eventos`,
    },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: points.map((point) => point.label),
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: "#E8EEF6",
        },
      },
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
      },
    },
    series: [
      {
        name: "Período atual",
        type: "bar",
        data: points.map((point) => point.total),
        barMaxWidth: barMaxWidth(definition.granularity),
        barGap: "18%",
        barCategoryGap:
          definition.granularity === "minute" || definition.granularity === "hour"
            ? "42%"
            : "50%",
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#1267C4" },
              { offset: 1, color: "#5AA8F5" },
            ],
          },
        },
        emphasis: {
          itemStyle: {
            color: "#0B4EA2",
          },
        },
      },
      ...(showPreviousSeries
        ? [
            {
              name: previousSeriesName,
              type: "bar",
              data: points.map((_, index) => previousPoints[index]?.total ?? 0),
              barMaxWidth: barMaxWidth(definition.granularity),
              itemStyle: {
                borderRadius: [2, 2, 0, 0],
                color: "#B7C7DA",
              },
              emphasis: {
                itemStyle: {
                  color: "#8FA5BE",
                },
              },
            },
          ]
        : []),
    ],
  };
}

function buildLiveReportChart(
  definition: AggregateChartDefinition,
  state: AggregateChartState | undefined,
  previousState: AggregateChartState | undefined,
  showPreviousPeriod: boolean,
  intradayComparison: IntradayComparisonMode,
): ReportPayload["charts"][number] {
  const points = buildAggregatePoints(definition, state?.rows ?? []);
  const previousPoints = showPreviousPeriod
    ? buildAggregateComparisonPoints(
        definition,
        previousState?.rows ?? [],
        intradayComparison,
      )
    : [];
  const previousColumnLabel = comparisonSeriesName(definition, intradayComparison);
  const showWeekday = definition.granularity === "day";
  const showWeekOfMonth = definition.granularity === "week";

  return {
    comparison: showPreviousPeriod
      ? comparisonDescription(definition, intradayComparison)
      : undefined,
    description: definition.description,
    option: buildChartOption(
      definition,
      points,
      previousPoints,
      intradayComparison,
    ),
    table: {
      title: `Dados - ${definition.label}`,
      columns: [
        { key: "period", label: "Período", width: 20 },
        { key: "period_start", label: "Início do período", width: 22 },
        ...(showWeekday
          ? [{ key: "weekday", label: "Dia da semana", width: 20 }]
          : []),
        ...(showWeekOfMonth
          ? [{ key: "week_of_month", label: "Semana do mês", width: 20 }]
          : []),
        { key: "current", label: "Período atual", width: 18, numeric: true },
        ...(showPreviousPeriod
          ? [
              {
                key: "previous",
                label: previousColumnLabel,
                width: 28,
                numeric: true,
              },
              {
                key: "previous_reference",
                label: "Referência anterior",
                width: 32,
              },
            ]
          : []),
      ],
      rows: points.map((point, index) => ({
        current: point.total,
        period: point.label,
        period_start: formatDateTime(point.bucket),
        weekday: showWeekday ? weekdayName(new Date(point.bucket)) : undefined,
        previous: showPreviousPeriod ? previousPoints[index]?.total ?? 0 : undefined,
        previous_reference:
          showPreviousPeriod && previousPoints[index]
            ? comparisonReferenceLabel(
                definition.granularity,
                new Date(point.bucket),
                new Date(previousPoints[index].bucket),
                intradayComparison,
              )
            : undefined,
        week_of_month: showWeekOfMonth
          ? weekOfMonthLabel(new Date(point.bucket), false)
          : undefined,
      })),
    },
    title: definition.label,
  };
}

function barMaxWidth(granularity: AggregateGranularity) {
  if (granularity === "minute" || granularity === "hour") return 18;
  if (granularity === "day" || granularity === "week") return 26;
  return 34;
}

function sumAggregateRows(rows: AggregateEventRow[]) {
  return rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
}

function sumRowsInRange(rows: AggregateEventRow[], from: Date, to: Date) {
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return rows.reduce((sum, row) => {
    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) {
      return sum;
    }

    return sum + (row.total ?? 0);
  }, 0);
}

function sumRowsInBucketRange(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const fromKey = bucketKeyForGranularity(from, granularity);
  const toKey = bucketKeyForGranularity(to, granularity);

  return rows.reduce((sum, row) => {
    const rowDate = new Date(row.bucket);
    if (Number.isNaN(rowDate.getTime())) return sum;

    const bucketKey = bucketKeyForGranularity(rowDate, granularity);
    if (bucketKey < fromKey || bucketKey >= toKey) return sum;

    return sum + (row.total ?? 0);
  }, 0);
}

function sumRowsForSource(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  if (granularity === "minute" || granularity === "hour") {
    return sumRowsInRange(rows, from, to);
  }

  return sumRowsInBucketRange(rows, granularity, from, to);
}

function sumRowsSince(rows: AggregateEventRow[], now: Date, minutes: number) {
  const from = now.getTime() - minutes * MINUTE_MS;
  return rows.reduce((sum, row) => {
    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < from) return sum;
    return sum + (row.total ?? 0);
  }, 0);
}

function projectDayTotal(total: number, now: Date) {
  const start = startOfDay(now);
  const elapsed = Math.max(now.getTime() - start.getTime(), 1);
  return Math.round((total / elapsed) * DAY_MS);
}

function computeDelta(current: number, previous: number) {
  if (!previous) return null;
  return (current - previous) / previous;
}

function getPeakPoint(points: ChartPoint[]) {
  return points.reduce<ChartPoint | null>((peak, point) => {
    if (!peak || point.total > peak.total) return point;
    return peak;
  }, null);
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

function startOfUtcWeek(date: Date) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = next.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + diff);
  return next;
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
  if (granularity === "week") return weekOfMonthLabel(date, true);
  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
    }).format(date);
  }
  if (granularity === "semester") {
    return `${date.getMonth() < 6 ? "1S" : "2S"} ${date.getFullYear()}`;
  }
  return String(date.getFullYear());
}

function granularityLabel(value: AggregateGranularity) {
  return (
    aggregateGranularityOptions.find((option) => option.value === value)?.label ??
    value
  );
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    style: "percent",
    signDisplay: "always",
  }).format(value);
}

function comparisonReferenceLabel(
  granularity: AggregateGranularity,
  currentDate: Date,
  previousDate: Date,
  intradayComparison: IntradayComparisonMode,
) {
  if (granularity === "minute" || granularity === "hour") {
    return intradayComparison === "last_week"
      ? `${weekdayName(previousDate)} da semana passada (${formatShortDate(previousDate)})`
      : `Ontem, ${weekdayName(previousDate)} (${formatShortDate(previousDate)})`;
  }
  if (granularity === "day") {
    return `${weekdayName(previousDate)} anterior (${formatShortDate(previousDate)})`;
  }
  if (granularity === "week") {
    return `${weekOfMonthLabel(previousDate, false)} de ${monthYearLabel(previousDate)}`;
  }
  if (granularity === "month") {
    return `Mesmo mês em ${previousDate.getFullYear()}`;
  }
  if (granularity === "semester") {
    return `Mesmo semestre em ${previousDate.getFullYear()}`;
  }

  return `${currentDate.getFullYear() - 1}`;
}

function weekOfMonthLabel(date: Date, compact: boolean) {
  const index = weekOfMonthIndex(date) + 1;
  const suffix = compact ? "sem." : "semana";
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: compact ? "short" : "long",
  })
    .format(date)
    .replace(".", "");

  return `${index}ª ${suffix} ${month}`;
}

function weekOfMonthIndex(date: Date) {
  const monthGridStart = startOfWeek(startOfMonth(date));

  return Math.max(
    0,
    Math.round(
      (startOfWeek(date).getTime() - monthGridStart.getTime()) / (7 * DAY_MS),
    ),
  );
}

function weekdayName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
}

function weekdayShortName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
}

function monthYearLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatSignedNumber(value: number | undefined, signed: boolean) {
  if (!signed) return formatNumber(value);
  return new Intl.NumberFormat("pt-BR", {
    signDisplay: "always",
  }).format(value ?? 0);
}

function resolveSnapshotScopeId(user: CurrentUser | null) {
  const masterScope = getStoredMasterCompanyScope();
  if (masterScope?.id) return `master:${masterScope.id}`;

  const companyId = getCurrentUserCompanyId(user);
  return companyId ? `company:${companyId}` : "default";
}

function readLiveDashboardSnapshot(scopeId: string) {
  if (liveDashboardSnapshot?.scopeId !== scopeId) return null;
  return liveDashboardSnapshot;
}

function storeLiveDashboardSnapshot(snapshot: LiveDashboardSnapshot) {
  liveDashboardSnapshot = snapshot;
}

function parseSnapshotDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function createCustomChartId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function reportDateSlug(date: Date) {
  return date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
}
