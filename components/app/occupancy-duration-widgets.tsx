"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CircleOff,
  Clock3,
  Gauge,
  Percent,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react";

import {
  type LayoutCard,
  type LayoutCardRenderContext,
} from "@/components/app/card-layout";
import {
  COMPACT_METRIC_LAYOUT_DEFAULTS,
  CompactMetricCard,
} from "@/components/app/compact-metric-card";
import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import { getOccupancyChartPalette } from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
import {
  WidgetTitleText,
  useWidgetColor,
} from "@/components/app/widget-appearance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAccessTokenContext } from "@/lib/access-token-claims";
import { aggregateQueryIso } from "@/lib/aggregate-time";
import { getStoredSession } from "@/lib/api";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  occupancyAggregateCoverageWarning,
  occupancyAggregateMetadataWarning,
  occupancyAggregatePresentationWarning,
  requireOccupancyAggregateRows,
  type OccupancyAggregateMetric,
} from "@/lib/occupancy-aggregate-validation";
import {
  buildOccupancyClosedDayMinuteRange,
  buildOccupancyDurationSummary,
  deriveOccupancyStateMetrics,
  formatOccupancyDuration,
  reconcileOccupancyDurationMetrics,
  type OccupancyDurationMinuteRange,
  type OccupancyDurationState,
  type OccupancyDurationSummary,
} from "@/lib/occupancy-duration";
import {
  groupContiguousOccupancyDurationBuckets,
  planOccupancyDurationCoarseQuery,
  resolveOccupancyDurationHourlyPlan,
} from "@/lib/occupancy-duration-query-plan";
import {
  occupancyDurationMinuteTransportTtl,
  occupancyDurationNextMinuteRefreshDelay,
  occupancyDurationReconciliationFrom,
} from "@/lib/occupancy-duration-refresh";
import {
  formatOccupancyLoiteringDuration,
  type OccupancyLoiteringTotals,
} from "@/lib/occupancy-loitering";
import { fetchSharedOccupancyQuery } from "@/lib/occupancy-shared-query";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import type { ReportChart, ReportMetric } from "@/lib/report-export";
import type {
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
} from "@/lib/types";
import type {
  CardPreference,
  CardScenarioSelection,
} from "@/lib/view-preferences";
import { resolveWidgetScenarios } from "@/lib/widget-scenario-selection";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

export const OCCUPANCY_DURATION_CARD_IDS = [
  "occupancy_duration_confirmed",
  "occupancy_duration_free",
  "occupancy_duration_average",
  "occupancy_duration_average_by_scenario",
  "occupancy_duration_rate",
  "occupancy_duration_transitions",
  "occupancy_duration_longest",
  "occupancy_duration_load",
  "occupancy_duration_coverage",
  "occupancy_duration_timeline",
  "occupancy_duration_by_scenario",
] as const;

export type OccupancyDurationCardId =
  (typeof OCCUPANCY_DURATION_CARD_IDS)[number];

const OCCUPANCY_AGGREGATE_DURATION_CARD_IDS =
  OCCUPANCY_DURATION_CARD_IDS.filter(
    (cardId) => cardId !== "occupancy_duration_average_by_scenario",
  );

export type OccupancyDurationReportAsset = {
  cardId: OccupancyDurationCardId;
  chart: ReportChart;
  titleSuffix?: string;
};

export type OccupancyDurationReportMetric = {
  cardId: OccupancyDurationCardId;
  metric: ReportMetric;
};

type DurationScenario = Pick<OccupancyScenario, "id" | "name">;

type OccupancyDurationScenarioSeries = {
  asOf?: Date;
  error?: string;
  individualDwell?: {
    error?: string;
    loading: boolean;
    totals?: OccupancyLoiteringTotals;
  };
  name: string;
  scenarioId: string;
  summary: OccupancyDurationSummary;
  warning?: string;
};

type OccupancyIndividualDwellScenarioSeries = Pick<
  OccupancyDurationScenarioSeries,
  "name" | "scenarioId"
> & {
  individualDwell: NonNullable<
    OccupancyDurationScenarioSeries["individualDwell"]
  >;
};

type OccupancyDurationAverageByScenarioEntry = {
  averageDurationSeconds: number | null;
  error?: string;
  loading: boolean;
  maximumDurationSeconds: number | null;
  minimumDurationSeconds: number | null;
  name: string;
  scenarioId: string;
  sessionCount: number | null;
};

type OccupancyDurationDataset = {
  error?: string;
  loading: boolean;
  range: OccupancyDurationMinuteRange | null;
  scopeKey: string;
  series: OccupancyDurationScenarioSeries[];
};

type OccupancyDurationScenarioCache = {
  asOf: Date | null;
  from: number;
  lastFullRefreshAt: number;
  metadataWarnings: string[];
  to: number;
  totals: Map<number, OccupancyAggregateMetric>;
};

type OccupancyDurationFailureBackoff = {
  attempts: number;
  message: string;
  retryAt: number;
};

type OccupancyDurationScenarioCacheScope = {
  failures: Map<string, OccupancyDurationFailureBackoff>;
  lastUsedAt: number;
  scenarios: Map<string, OccupancyDurationScenarioCache>;
};

type DurationSelectionStats = {
  confirmedFreeSeconds: number;
  confirmedFreeSequenceCount: number;
  confirmedOccupiedSeconds: number;
  confirmedOccupiedSequenceCount: number;
  errorCount: number;
  expectedSeconds: number;
  loadUnitSeconds: number;
  longestConfirmedOccupiedSeconds: number;
  minimumDetectedTransitions: number;
  observedSeconds: number;
  scenarioCount: number;
  successfulScenarioCount: number;
  transitionSeconds: number;
  unknownSeconds: number;
  warnings: string[];
};

type DurationAverageSummary = {
  averageFreeSeconds: number | null;
  averageOccupancy: number | null;
  averageOccupiedSeconds: number | null;
  coverage: number | null;
};

type DurationAverageComparisonRow = {
  kind: "global" | "scenario";
  label: string;
  scenarioId?: string;
  summary: DurationAverageSummary;
};

type DurationStateVisual = {
  border: string;
  color: string;
  label: string;
  text: string;
};

const DEFAULT_AGGREGATE_REFRESH_MS = 60_000;
const MAX_PARALLEL_REQUESTS = 4;
// The deployed occupancy aggregate can truncate a response at this boundary
// without publishing pagination metadata. Coarse hours and exact minute
// refinements may both contain several area rows per bucket, so every response
// that reaches the ceiling is recursively divided before use.
const AGGREGATE_RESPONSE_ROW_CEILING = 1_000;
const MAX_COMPLETENESS_SPLIT_DEPTH = 16;
// The closed minute edge is reconciled once when the minute advances. A
// full-day replay remains a six-hour correction audit.
const DURATION_FULL_REFRESH_MS = 6 * 60 * 60_000;
// The semantic cache below owns long-lived coverage. Transport cache is only
// a short remount/deduplication bridge and stays within the broker's 60s cap.
const DURATION_TRANSPORT_CACHE_TTL_MS = 60_000;
const DURATION_CACHE_IDLE_TTL_MS = 12 * 60 * 60_000;
const DURATION_FAILURE_MAX_BACKOFF_MS = 15 * 60_000;
const MAX_DURATION_CACHE_SCOPES = 12;
const MAX_DURATION_SCENARIOS_PER_SCOPE = 64;
const MAX_REPORT_SCENARIOS_PER_CHART = 8;
const COMPACT_CHART_HEIGHT_PX = 300;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const HOUR_SECONDS = 3_600;

const DURATION_STATE_ORDER: readonly OccupancyDurationState[] = [
  "occupied",
  "transition",
  "free",
  "unknown",
];

type OccupancyDurationTimelineState = Exclude<
  OccupancyDurationState,
  "transition"
>;

// A transição permanece conservadora em todos os resumos e métricas. Somente
// a linha do tempo projeta esse minuto como ocupado para oferecer os dois
// estados operacionais, sem confundir ausência de cobertura com desocupação.
const DURATION_TIMELINE_STATE_ORDER: readonly OccupancyDurationTimelineState[] = [
  "occupied",
  "free",
  "unknown",
];

const sharedDurationScenarioCaches = new Map<
  string,
  OccupancyDurationScenarioCacheScope
>();

const CARD_LABELS: Record<OccupancyDurationCardId, string> = {
  occupancy_duration_confirmed: "Tempo ocupado confirmado",
  occupancy_duration_free: "Tempo desocupado confirmado",
  occupancy_duration_average: "Resumo médio de ocupação",
  occupancy_duration_average_by_scenario: "Permanência média por cenário",
  occupancy_duration_rate: "Taxa de tempo ocupado",
  occupancy_duration_transitions: "Mudanças mínimas de estado",
  occupancy_duration_longest: "Maior período ocupado",
  occupancy_duration_load: "Carga de ocupação",
  occupancy_duration_coverage: "Cobertura da duração",
  occupancy_duration_timeline: "Linha do tempo de ocupação",
  occupancy_duration_by_scenario: "Tempo por cenário",
};

export function useOccupancyDurationCards({
  aggregateRefreshMs = DEFAULT_AGGREGATE_REFRESH_MS,
  companyScopeId,
  enabled = true,
  focusScenarioId,
  individualDwellError,
  individualDwellLoading = false,
  individualDwellTotalsByScenarioId,
  monitorMode,
  preferences,
  requestedCardIds,
  scenarios,
  timeZone,
  timeZoneWarning,
}: {
  aggregateRefreshMs?: number;
  companyScopeId: string;
  enabled?: boolean;
  focusScenarioId: string;
  individualDwellError?: string;
  individualDwellLoading?: boolean;
  individualDwellTotalsByScenarioId?: ReadonlyMap<
    string,
    OccupancyLoiteringTotals
  >;
  monitorMode: boolean;
  preferences: CardPreference[];
  requestedCardIds?: ReadonlySet<string>;
  scenarios: OccupancyScenario[];
  timeZone: string;
  timeZoneWarning?: string;
}) {
  const scenarioOptionsKey = React.useMemo(
    () =>
      JSON.stringify(
        scenarios.flatMap((scenario) =>
          companyScopeId.trim() && scenario.company_id === companyScopeId
            ? [{ id: scenario.id, name: scenario.name }]
            : [],
        ),
      ),
    [companyScopeId, scenarios],
  );
  // Several parent resources can be refreshed without changing the scenario
  // catalogue. Keep the normalized array stable in that case so an in-flight
  // duration query is not aborted and restarted merely because `scenarios`
  // received a new reference.
  const scenarioOptions = React.useMemo<DurationScenario[]>(
    () => JSON.parse(scenarioOptionsKey) as DurationScenario[],
    [scenarioOptionsKey],
  );
  const inheritedScenarios = React.useMemo<DurationScenario[]>(() => {
    const selected = scenarioOptions.find(
      (scenario) => scenario.id === focusScenarioId,
    );
    return selected ? [selected] : [];
  }, [focusScenarioId, scenarioOptions]);
  const inheritedScenarioIds = React.useMemo(
    () => inheritedScenarios.map((scenario) => scenario.id),
    [inheritedScenarios],
  );
  const inheritedScenarioLabel =
    inheritedScenarios[0]?.name ?? "Nenhum cenário selecionado na tela";
  const preferenceByCardId = React.useMemo(
    () => new Map(preferences.map((preference) => [preference.id, preference])),
    [preferences],
  );
  const requestedScenarioKey = React.useMemo(() => {
    if (!enabled) return "";
    const requested = new Map<string, DurationScenario>();
    OCCUPANCY_AGGREGATE_DURATION_CARD_IDS.forEach((cardId) => {
      if (requestedCardIds && !requestedCardIds.has(cardId)) return;
      const preference = preferenceByCardId.get(cardId);
      if (preference?.visible !== true) return;
      resolveWidgetScenarios(
        scenarioOptions,
        scenarioSelectionFromPreference(preference),
        inheritedScenarios,
      ).forEach((scenario) => requested.set(scenario.id, scenario));
    });
    return Array.from(requested.keys()).sort().join(",");
  }, [
    enabled,
    inheritedScenarios,
    preferenceByCardId,
    requestedCardIds,
    scenarioOptions,
  ]);
  // Keep the scenario array referentially stable when only title, color,
  // dimensions or order change. The fetch effect owns the day cache, so a
  // visual edit must not abort it or trigger another full-day request.
  const requestedScenarios = React.useMemo(() => {
    const requestedIds = new Set(
      requestedScenarioKey ? requestedScenarioKey.split(",") : [],
    );
    const requested = scenarioOptions.filter((scenario) =>
      requestedIds.has(scenario.id),
    );
    const focusIndex = requested.findIndex(
      (scenario) => scenario.id === focusScenarioId,
    );
    if (focusIndex <= 0) return requested;
    return [
      requested[focusIndex],
      ...requested.slice(0, focusIndex),
      ...requested.slice(focusIndex + 1),
    ];
  }, [focusScenarioId, requestedScenarioKey, scenarioOptions]);
  const authenticatedUserId = resolveAccessTokenContext(
    getStoredSession()?.access_token ?? "",
  )?.userId ?? "";
  const cacheScopeKey = JSON.stringify([
    authenticatedUserId,
    companyScopeId.trim(),
    timeZone.trim(),
  ]);
  const scopeKey = `${cacheScopeKey}|${requestedScenarioKey}`;
  const scenarioCacheRef = React.useRef<{
    scopeKey: string;
    value: OccupancyDurationScenarioCacheScope;
  }>({
    scopeKey: "",
    value: createOccupancyDurationScenarioCacheScope(),
  });
  const [dataset, setDataset] = React.useState<OccupancyDurationDataset>({
    loading: false,
    range: null,
    scopeKey: "",
    series: [],
  });

  React.useEffect(() => {
    if (!enabled || !companyScopeId.trim()) {
      setDataset({
        loading: false,
        range: null,
        scopeKey: "",
        series: [],
      });
      return;
    }

    if (requestedScenarios.length === 0) {
      // A ausência temporária de demanda significa apenas que o card saiu da
      // margem da viewport. Preserve a última série certificada para que a
      // rolagem de volta não troque o gráfico por skeleton enquanto o polling
      // seletivo é retomado. A troca real de empresa/fuso continua limpando o
      // dataset no ramo acima.
      return;
    }

    let disposed = false;
    let timer: number | undefined;
    let progressTimer: number | undefined;
    let controller: AbortController | null = null;
    let generation = 0;
    let publishedRangeEnd = Number.NaN;
    const sharedScenarioCache = acquireOccupancyDurationScenarioCache({
      companyScopeId,
      timeZone,
      userId: authenticatedUserId,
    });
    if (!sharedScenarioCache) {
      if (scenarioCacheRef.current.scopeKey !== cacheScopeKey) {
        scenarioCacheRef.current = {
          scopeKey: cacheScopeKey,
          value: createOccupancyDurationScenarioCacheScope(),
        };
      }
    }
    const cacheState = sharedScenarioCache ?? scenarioCacheRef.current.value;
    const scenarioCache = cacheState.scenarios;
    const failureBackoffs = cacheState.failures;
    const retryBaseMs = normalizeRefreshMilliseconds(aggregateRefreshMs);

    const scheduleNext = () => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        void runLoad();
      }, occupancyDurationNextMinuteRefreshDelay());
    };

    const load = async () => {
      if (disposed) return;

      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        scheduleNext();
        return;
      }
      cacheState.lastUsedAt = Date.now();

      let range: OccupancyDurationMinuteRange;
      try {
        range = buildOccupancyClosedDayMinuteRange(new Date(), timeZone);
      } catch (error) {
        if (disposed) return;
        setDataset({
          error: durationRequestError(
            error,
            "Não foi possível determinar o dia civil da empresa.",
          ),
          loading: false,
          range: null,
          scopeKey,
          series: [],
        });
        scheduleNext();
        return;
      }

      if (range.buckets.length === 0) {
        setDataset({
          loading: false,
          range,
          scopeKey,
          series: requestedScenarios.map((scenario) => ({
            name: scenario.name,
            scenarioId: scenario.id,
            summary: buildOccupancyDurationSummary([], new Map()),
          })),
        });
        publishedRangeEnd = range.to.getTime();
        scheduleNext();
        return;
      }

      // The API exposes closed minute buckets. The raw snapshot still pulses
      // every five seconds, but this aggregate has no new bucket until the
      // minute advances. The next rolling five-minute edge reconciles delayed
      // ingestion, so replaying the identical edge is both redundant and
      // expensive for multi-scenario views.
      const hasDueScenario = requestedScenarios.some((scenario) =>
        occupancyDurationScenarioRefreshIsDue(
          scenarioCache.get(scenario.id),
          failureBackoffs.get(scenario.id),
          range,
        ),
      );
      if (!hasDueScenario && publishedRangeEnd === range.to.getTime()) {
        scheduleNext();
        return;
      }
      const cachedSeries = publishedRangeEnd === range.to.getTime()
        ? []
        : requestedScenarios.flatMap((scenario) => {
            const cached = scenarioCache.get(scenario.id);
            const cacheMatchesDay = Boolean(
              cached &&
                cached.from === range.from.getTime() &&
                cached.to <= range.to.getTime(),
            );
            const failure = failureBackoffs.get(scenario.id);
            if (!cacheMatchesDay && !failure) return [];
            const totals = cacheMatchesDay
              ? cached!.totals
              : new Map<number, OccupancyAggregateMetric>();
            return [
              {
                ...(cacheMatchesDay && cached!.asOf
                  ? { asOf: cached!.asOf }
                  : {}),
                ...(failure ? { error: failure.message } : {}),
                name: scenario.name,
                scenarioId: scenario.id,
                summary: buildOccupancyDurationSummary(range.buckets, totals),
                ...(cacheMatchesDay
                  ? {
                      warning: joinMessages(
                        occupancyAggregateCoverageWarning(
                          range.buckets.length - totals.size,
                          range.buckets.length,
                        ),
                        ...cached!.metadataWarnings,
                      ),
                    }
                  : {}),
              } satisfies OccupancyDurationScenarioSeries,
            ];
          });
      if (!hasDueScenario) {
        setDataset((current) => {
          if (
            current.scopeKey === scopeKey &&
            current.range?.from.getTime() === range.from.getTime() &&
            current.range.to.getTime() === range.to.getTime() &&
            current.series.length === cachedSeries.length &&
            !current.loading
          ) {
            return current;
          }
          return {
            loading: false,
            range,
            scopeKey,
            series: cachedSeries,
          };
        });
        publishedRangeEnd = range.to.getTime();
        scheduleNext();
        return;
      }

      generation += 1;
      const currentGeneration = generation;
      if (controller) {
        abortRequest(
          controller,
          "A consulta anterior de duração foi substituída por uma mais recente.",
        );
      }
      const requestController = new AbortController();
      controller = requestController;
      setDataset((current) => {
        const currentSeries =
          current.scopeKey === scopeKey ? current.series : cachedSeries;
        const loading = currentSeries.length === 0;
        if (
          current.scopeKey === scopeKey &&
          !current.error &&
          current.loading === loading
        ) {
          return current;
        }
        return {
          ...(current.scopeKey === scopeKey
            ? current
            : { range, scopeKey, series: cachedSeries }),
          error: undefined,
          loading,
        };
      });

      try {
        const progressiveSeries = new Array<
          OccupancyDurationScenarioSeries | undefined
        >(requestedScenarios.length);
        const publishProgress = () => {
          progressTimer = undefined;
          if (
            disposed ||
            requestController.signal.aborted ||
            currentGeneration !== generation
          ) {
            return;
          }
          const completed = progressiveSeries.filter(
            (item): item is OccupancyDurationScenarioSeries => Boolean(item),
          );
          if (!completed.length) return;
          setDataset((current) => {
            const byId = new Map(
              current.scopeKey === scopeKey
                ? current.series.map((item) => [item.scenarioId, item])
                : [],
            );
            completed.forEach((item) => byId.set(item.scenarioId, item));
            const visibleSeries = requestedScenarios.flatMap((scenario) => {
              const item = byId.get(scenario.id);
              return item ? [item] : [];
            });
            return {
              loading: visibleSeries.length < requestedScenarios.length,
              range,
              scopeKey,
              series: visibleSeries,
            };
          });
        };
        const series = await mapWithConcurrency(
          requestedScenarios,
          MAX_PARALLEL_REQUESTS,
          async (scenario): Promise<OccupancyDurationScenarioSeries> => {
            if (requestController.signal.aborted) {
              throw requestController.signal.reason;
            }
            const cached = scenarioCache.get(scenario.id);
            const cacheMatchesDay =
              cached?.from === range.from.getTime() &&
              cached.to <= range.to.getTime();
            const failureBackoff = failureBackoffs.get(scenario.id);
            if (
              failureBackoff &&
              range.requestedAt.getTime() < failureBackoff.retryAt
            ) {
              const totals = cacheMatchesDay
                ? cached.totals
                : new Map<number, OccupancyAggregateMetric>();
              return {
                ...(cacheMatchesDay && cached.asOf
                  ? { asOf: cached.asOf }
                  : {}),
                error: failureBackoff.message,
                name: scenario.name,
                scenarioId: scenario.id,
                summary: buildOccupancyDurationSummary(range.buckets, totals),
              };
            }
            const needsFullRefresh =
              !cacheMatchesDay ||
              range.requestedAt.getTime() < cached.lastFullRefreshAt ||
              range.requestedAt.getTime() - cached.lastFullRefreshAt >=
                DURATION_FULL_REFRESH_MS;
            if (
              cached &&
              cacheMatchesDay &&
              cached.to === range.to.getTime() &&
              !needsFullRefresh
            ) {
              touchOccupancyDurationScenarioCache(
                scenarioCache,
                scenario.id,
                cached,
              );
              return {
                ...(cached.asOf ? { asOf: cached.asOf } : {}),
                name: scenario.name,
                scenarioId: scenario.id,
                summary: buildOccupancyDurationSummary(
                  range.buckets,
                  cached.totals,
                ),
                warning: joinMessages(
                  occupancyAggregateCoverageWarning(
                    range.buckets.length - cached.totals.size,
                    range.buckets.length,
                  ),
                  ...cached.metadataWarnings,
                ),
              };
            }
            const reconciliationFrom = needsFullRefresh
              ? range.from.getTime()
              : occupancyDurationReconciliationFrom(
                  range.from.getTime(),
                  range.to.getTime(),
                  cached.to,
                );
            const requestedBuckets = range.buckets.filter(
              (bucket) => bucket.getTime() >= reconciliationFrom,
            );
            try {
              const aggregate = await fetchCompleteDurationAggregate({
                buckets: requestedBuckets,
                cacheTtlMs: needsFullRefresh
                  ? DURATION_TRANSPORT_CACHE_TTL_MS
                  : occupancyDurationMinuteTransportTtl(
                      range.requestedAt.getTime(),
                    ),
                companyScopeId,
                scenarioId: scenario.id,
                signal: requestController.signal,
                timeZone,
              });
              const totals = needsFullRefresh
                ? new Map(aggregate.totals)
                : reconcileOccupancyDurationMetrics(
                    cached.totals,
                    aggregate.totals,
                    reconciliationFrom,
                    range.to.getTime(),
                  );
              const nextCache: OccupancyDurationScenarioCache = {
                asOf: aggregate.asOf,
                from: range.from.getTime(),
                lastFullRefreshAt: needsFullRefresh
                  ? range.requestedAt.getTime()
                  : cached.lastFullRefreshAt,
                metadataWarnings: aggregate.metadataWarnings,
                to: range.to.getTime(),
                totals,
              };
              touchOccupancyDurationScenarioCache(
                scenarioCache,
                scenario.id,
                nextCache,
              );
              failureBackoffs.delete(scenario.id);
              return {
                ...(nextCache.asOf ? { asOf: nextCache.asOf } : {}),
                name: scenario.name,
                scenarioId: scenario.id,
                summary: buildOccupancyDurationSummary(
                  range.buckets,
                  totals,
                ),
                warning: joinMessages(
                  occupancyAggregateCoverageWarning(
                    range.buckets.length - totals.size,
                    range.buckets.length,
                  ),
                  ...nextCache.metadataWarnings,
                ),
              };
            } catch (error) {
              if (isAbortError(error, requestController.signal)) throw error;
              const message = durationRequestError(
                error,
                "Não foi possível validar a duração deste cenário.",
              );
              const previousFailure = failureBackoffs.get(scenario.id);
              const attempts = (previousFailure?.attempts ?? 0) + 1;
              touchOccupancyDurationFailureBackoff(failureBackoffs, scenario.id, {
                attempts,
                message,
                retryAt:
                  range.requestedAt.getTime() +
                  durationFailureBackoffMilliseconds(attempts, retryBaseMs),
              });
              const preservedTotals = cacheMatchesDay
                ? cached.totals
                : new Map<number, OccupancyAggregateMetric>();
              return {
                ...(cacheMatchesDay && cached.asOf
                  ? { asOf: cached.asOf }
                  : {}),
                error: message,
                name: scenario.name,
                scenarioId: scenario.id,
                // Dados já certificados do mesmo dia sobrevivem a uma falha
                // transitória; minutos novos continuam desconhecidos.
                summary: buildOccupancyDurationSummary(
                  range.buckets,
                  preservedTotals,
                ),
              };
            }
          },
          (item, index) => {
            progressiveSeries[index] = item;
            // Network responses commonly settle in small bursts. Publish a
            // burst together so the first scenarios become usable promptly
            // without committing one React render per response.
            if (progressTimer === undefined) {
              progressTimer = window.setTimeout(publishProgress, 32);
            }
          },
        );
        if (
          disposed ||
          requestController.signal.aborted ||
          currentGeneration !== generation
        ) {
          return;
        }
        if (progressTimer !== undefined) {
          window.clearTimeout(progressTimer);
          progressTimer = undefined;
        }
        setDataset({
          loading: false,
          range,
          scopeKey,
          series,
        });
        publishedRangeEnd = range.to.getTime();
      } catch (error) {
        if (isAbortError(error, requestController.signal) || disposed) return;
        setDataset({
          error: durationRequestError(
            error,
            "Não foi possível atualizar os tempos de ocupação.",
          ),
          loading: false,
          range,
          scopeKey,
          series: [],
        });
      } finally {
        if (currentGeneration === generation && controller === requestController) {
          controller = null;
        }
        if (!disposed && currentGeneration === generation) scheduleNext();
      }
    };

    const runLoad = async () => {
      try {
        await load();
      } catch (error) {
        if (disposed || isAbortError(error, controller?.signal)) return;
        setDataset((current) => ({
          ...(current.scopeKey === scopeKey
            ? current
            : { range: null, scopeKey, series: [] }),
          error: durationRequestError(
            error,
            "Não foi possível atualizar os tempos de ocupação.",
          ),
          loading: false,
        }));
        scheduleNext();
      }
    };

    const resume = () => {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false ||
        controller !== null
      ) return;
      failureBackoffs.clear();
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      void runLoad();
    };

    void runLoad();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (progressTimer !== undefined) window.clearTimeout(progressTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      if (controller) {
        abortRequest(
          controller,
          "A consulta de duração foi cancelada porque a visão mudou.",
        );
      }
    };
  }, [
    aggregateRefreshMs,
    authenticatedUserId,
    cacheScopeKey,
    companyScopeId,
    enabled,
    requestedScenarios,
    requestedScenarioKey,
    scopeKey,
    timeZone,
  ]);

  const currentDataset =
    !enabled
      ? {
          loading: false,
          range: null,
          scopeKey: "",
          series: [],
        }
      : dataset.scopeKey === scopeKey
      ? dataset
      : {
          loading: Boolean(requestedScenarios.length),
          range: null,
          scopeKey,
          series: [],
        };
  const displaySeries = React.useMemo(() => {
    const hasIndividualDwellContext = Boolean(
      individualDwellTotalsByScenarioId ||
        individualDwellLoading ||
        individualDwellError,
    );
    if (!hasIndividualDwellContext) return currentDataset.series;
    return currentDataset.series.map((item) => ({
      ...item,
      individualDwell: {
        ...(individualDwellError ? { error: individualDwellError } : {}),
        loading: individualDwellLoading,
        totals: individualDwellTotalsByScenarioId?.get(item.scenarioId),
      },
    }));
  }, [
    currentDataset.series,
    individualDwellError,
    individualDwellLoading,
    individualDwellTotalsByScenarioId,
  ]);
  const selectedSeriesCache = React.useMemo(() => {
    const seriesById = new Map(
      displaySeries.map((item) => [item.scenarioId, item]),
    );
    const selections = [
      { mode: "inherit", scenarioIds: [] } as CardScenarioSelection,
      { mode: "all", scenarioIds: [] } as CardScenarioSelection,
      ...OCCUPANCY_DURATION_CARD_IDS.map((cardId) =>
        scenarioSelectionFromPreference(preferenceByCardId.get(cardId)),
      ),
    ];
    return new Map(
      selections.map((selection) => {
        const selected = resolveWidgetScenarios(
          scenarioOptions,
          selection,
          inheritedScenarios,
        );
        return [
          selected.map((scenario) => scenario.id).join("|"),
          selected.flatMap((scenario) => {
            const item = seriesById.get(scenario.id);
            return item ? [item] : [];
          }),
        ] as const;
      }),
    );
  }, [
    displaySeries,
    inheritedScenarios,
    preferenceByCardId,
    scenarioOptions,
  ]);
  const resolveSelectedSeries = React.useCallback(
    (selection: CardScenarioSelection) => {
      const selected = resolveWidgetScenarios(
        scenarioOptions,
        selection,
        inheritedScenarios,
      );
      const selectionKey = selected.map((scenario) => scenario.id).join("|");
      const cachedSelection = selectedSeriesCache.get(selectionKey);
      if (cachedSelection) return cachedSelection;
      const byId = new Map(
        displaySeries.map((item) => [item.scenarioId, item]),
      );
      return selected.flatMap((scenario) => {
        const item = byId.get(scenario.id);
        return item ? [item] : [];
      });
    }, [
      displaySeries,
      inheritedScenarios,
      scenarioOptions,
      selectedSeriesCache,
    ]);
  const resolveSelectedIndividualDwellSeries = React.useCallback(
    (
      selection: CardScenarioSelection,
    ): OccupancyIndividualDwellScenarioSeries[] =>
      resolveWidgetScenarios(
        scenarioOptions,
        selection,
        inheritedScenarios,
      ).map((scenario) => ({
        individualDwell: {
          ...(individualDwellError ? { error: individualDwellError } : {}),
          loading: individualDwellLoading,
          totals: individualDwellLoading
            ? undefined
            : individualDwellTotalsByScenarioId?.get(scenario.id),
        },
        name: scenario.name,
        scenarioId: scenario.id,
      })),
    [
      individualDwellError,
      individualDwellLoading,
      individualDwellTotalsByScenarioId,
      inheritedScenarios,
      scenarioOptions,
    ],
  );
  const cards = React.useMemo<LayoutCard[]>(() => {
    const commonCardProps = {
      inheritedScenarioIds,
      inheritedScenarioLabel,
      scenarioConfigurable: true as const,
      titleEditable: true as const,
    };
    const renderMetric = (
      kind: DurationMetricKind,
      fallbackTitle: string,
    ) =>
      function OccupancyDurationMetricRenderer({
        scenarioSelection,
      }: LayoutCardRenderContext) {
        const selectedScenarios = resolveWidgetScenarios(
          scenarioOptions,
          scenarioSelection,
          inheritedScenarios,
        );
        return (
          <OccupancyDurationMetricCard
            datasetError={currentDataset.error}
            fallbackTitle={fallbackTitle}
            kind={kind}
            loading={currentDataset.loading}
            selectedScenarios={selectedScenarios}
            selectedSeries={resolveSelectedSeries(scenarioSelection)}
          />
        );
      };

    return [
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_confirmed",
      label: CARD_LABELS.occupancy_duration_confirmed,
      node: renderMetric(
        "confirmed",
        CARD_LABELS.occupancy_duration_confirmed,
      ),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_free",
      label: CARD_LABELS.occupancy_duration_free,
      node: renderMetric("free", CARD_LABELS.occupancy_duration_free),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      colorEditable: true,
      defaultHeight: "tall",
      defaultHeightLevel: 4,
      defaultSize: "full",
      defaultWidthLevel: 4,
      id: "occupancy_duration_average",
      label: CARD_LABELS.occupancy_duration_average,
      node: ({ scenarioSelection }: LayoutCardRenderContext) => {
        const selectedScenarios = resolveWidgetScenarios(
          scenarioOptions,
          scenarioSelection,
          inheritedScenarios,
        );
        return (
          <OccupancyDurationAverageSummaryCard
            datasetError={currentDataset.error}
            loading={currentDataset.loading}
            selectedScenarios={selectedScenarios}
            selectedSeries={resolveSelectedSeries(scenarioSelection)}
          />
        );
      },
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      colorEditable: true,
      defaultHeight: "tall",
      defaultHeightLevel: 4,
      defaultSize: "full",
      id: "occupancy_duration_average_by_scenario",
      label: CARD_LABELS.occupancy_duration_average_by_scenario,
      node: ({ scenarioSelection }: LayoutCardRenderContext) => {
        const selectedScenarios = resolveWidgetScenarios(
          scenarioOptions,
          scenarioSelection,
          inheritedScenarios,
        );
        return (
          <OccupancyDurationAverageByScenarioCard
            datasetError={individualDwellError}
            loading={individualDwellLoading}
            monitorMode={monitorMode}
            selectedScenarios={selectedScenarios}
            selectedSeries={resolveSelectedIndividualDwellSeries(
              scenarioSelection,
            )}
          />
        );
      },
      previewColors: ["#0F766E"],
      previewKind: "ranking",
      previewOrientation: "horizontal",
      scenarioOrderingDisabled: true,
      scenarioSelectionPolicy: "compare",
      zoomEnabled: true,
    },
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_rate",
      label: CARD_LABELS.occupancy_duration_rate,
      node: renderMetric("rate", CARD_LABELS.occupancy_duration_rate),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_transitions",
      label: CARD_LABELS.occupancy_duration_transitions,
      node: renderMetric(
        "transitions",
        CARD_LABELS.occupancy_duration_transitions,
      ),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_longest",
      label: CARD_LABELS.occupancy_duration_longest,
      node: renderMetric("longest", CARD_LABELS.occupancy_duration_longest),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_load",
      label: CARD_LABELS.occupancy_duration_load,
      node: renderMetric("load", CARD_LABELS.occupancy_duration_load),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      colorEditable: true,
      id: "occupancy_duration_coverage",
      label: CARD_LABELS.occupancy_duration_coverage,
      node: renderMetric("coverage", CARD_LABELS.occupancy_duration_coverage),
      previewKind: "metric",
      scenarioSelectionPolicy: "aggregate",
    },
    {
      ...commonCardProps,
      colorEditable: true,
      defaultHeight: "tall",
      defaultHeightLevel: 4,
      defaultSize: "full",
      id: "occupancy_duration_timeline",
      label: CARD_LABELS.occupancy_duration_timeline,
      node: ({ scenarioSelection }: LayoutCardRenderContext) => {
        const selectedScenarios = resolveWidgetScenarios(
          scenarioOptions,
          scenarioSelection,
          inheritedScenarios,
        );
        return (
          <OccupancyDurationTimelineCard
            datasetError={currentDataset.error}
            loading={currentDataset.loading}
            monitorMode={monitorMode}
            range={currentDataset.range}
            selectedScenarios={selectedScenarios}
            selectedSeries={resolveSelectedSeries(scenarioSelection)}
            timeZone={timeZone}
          />
        );
      },
      previewColors: ["#1267C4", "#D97706", "#16A34A", "#94A3B8"],
      previewKind: "chart",
      previewOrientation: "horizontal",
      scenarioSelectionPolicy: "compare",
      zoomEnabled: true,
    },
    {
      ...commonCardProps,
      colorEditable: true,
      defaultHeight: "tall",
      defaultHeightLevel: 4,
      defaultSize: "full",
      id: "occupancy_duration_by_scenario",
      label: CARD_LABELS.occupancy_duration_by_scenario,
      node: ({ scenarioSelection }: LayoutCardRenderContext) => {
        const selectedScenarios = resolveWidgetScenarios(
          scenarioOptions,
          scenarioSelection,
          inheritedScenarios,
        );
        return (
          <OccupancyDurationByScenarioCard
            datasetError={currentDataset.error}
            loading={currentDataset.loading}
            monitorMode={monitorMode}
            selectedScenarios={selectedScenarios}
            selectedSeries={resolveSelectedSeries(scenarioSelection)}
          />
        );
      },
      previewColors: ["#1267C4", "#D97706", "#16A34A", "#94A3B8"],
      previewKind: "ranking",
      previewOrientation: "horizontal",
      scenarioSelectionPolicy: "compare",
      zoomEnabled: true,
    },
    ];
  }, [
    currentDataset.error,
    currentDataset.loading,
    currentDataset.range,
    individualDwellError,
    individualDwellLoading,
    inheritedScenarioIds,
    inheritedScenarioLabel,
    inheritedScenarios,
    monitorMode,
    resolveSelectedIndividualDwellSeries,
    resolveSelectedSeries,
    scenarioOptions,
    timeZone,
  ]);

  const reportMetrics = React.useMemo(
    () =>
      buildDurationReportMetrics({
        inheritedScenarios,
        preferenceByCardId,
        resolveSelectedSeries,
        scenarioOptions,
      }),
    [
      inheritedScenarios,
      preferenceByCardId,
      resolveSelectedSeries,
      scenarioOptions,
    ],
  );
  const getReportAssets = React.useCallback(
    () =>
      buildDurationReportAssets({
        inheritedScenarios,
        monitorMode,
        preferenceByCardId,
        range: currentDataset.range,
        resolveSelectedIndividualDwellSeries,
        resolveSelectedSeries,
        scenarioOptions,
        timeZone,
        timeZoneWarning,
      }),
    [
      currentDataset.range,
      inheritedScenarios,
      monitorMode,
      preferenceByCardId,
      resolveSelectedIndividualDwellSeries,
      resolveSelectedSeries,
      scenarioOptions,
      timeZone,
      timeZoneWarning,
    ],
  );
  const reportContext = React.useMemo(
    () =>
      buildDurationReportContext({
        inheritedScenarios,
        preferenceByCardId,
        scenarioOptions,
      }),
    [inheritedScenarios, preferenceByCardId, scenarioOptions],
  );

  const durationDataIncomplete =
    requestedScenarios.length > 0 &&
    (Boolean(currentDataset.error) ||
      currentDataset.series.length !== requestedScenarios.length ||
      currentDataset.series.some(
        (item) => Boolean(item.error) || item.summary.unknownSeconds > 0,
      ));
  const durationDataCompleteUntil =
    requestedScenarios.length === 0
      ? undefined
      : !durationDataIncomplete &&
          currentDataset.series.length === requestedScenarios.length &&
          currentDataset.series.every((item) => item.asOf)
        ? earliestDate(...currentDataset.series.map((item) => item.asOf))
        : null;
  const reportWarnings = Array.from(
    new Set(
      [
        timeZoneWarning,
        currentDataset.error,
        ...currentDataset.series.flatMap((item) => [item.error, item.warning]),
      ]
        .map(occupancyAggregatePresentationWarning)
        .filter((value): value is string => Boolean(value?.trim())),
    ),
  );

  return {
    cards,
    dataCompleteUntil: durationDataCompleteUntil,
    getReportAssets,
    loading: currentDataset.loading,
    reportContext,
    reportMetrics,
    reportWarnings,
  };
}

type DurationMetricKind =
  | "confirmed"
  | "free"
  | "average"
  | "rate"
  | "transitions"
  | "longest"
  | "load"
  | "coverage";

function OccupancyDurationMetricCard({
  datasetError,
  fallbackTitle,
  kind,
  loading,
  selectedScenarios,
  selectedSeries,
}: {
  datasetError?: string;
  fallbackTitle: string;
  kind: DurationMetricKind;
  loading: boolean;
  selectedScenarios: DurationScenario[];
  selectedSeries: OccupancyDurationScenarioSeries[];
}) {
  const stats = summarizeSelectedSeries(selectedSeries, selectedScenarios.length);
  const definition = durationMetricDefinition(kind, stats);
  const composition = describeDurationScenarioComposition(selectedScenarios);
  const contextualMessage = joinMessages(
    datasetError,
    stats.errorCount
      ? `${stats.errorCount} cenário(s) permanecem sem dados válidos.`
      : undefined,
    ...stats.warnings,
  );
  const completeDescription =
    joinMessages(
      definition.description,
      `Composição: ${composition.shortLabel}.`,
      contextualMessage,
    ) ?? definition.description;
  const hasError = Boolean(datasetError || stats.errorCount);

  return (
    <CompactMetricCard
      action={
        contextualMessage ? (
          <span
            aria-atomic="true"
            aria-live={hasError ? "assertive" : "polite"}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md border",
              hasError
                ? "border-destructive/25 bg-destructive/5 text-destructive"
                : "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300",
            )}
            role={hasError ? "alert" : "status"}
            title={contextualMessage}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{contextualMessage}</span>
          </span>
        ) : undefined
      }
      description={completeDescription}
      descriptionTitle={completeDescription}
      icon={definition.icon}
      label={fallbackTitle}
      loading={loading}
      meta={composition.shortLabel}
      metaTitle={composition.fullLabel}
      toneColor={definition.color}
      value={definition.value}
      valueTitle={definition.value}
    />
  );
}

function OccupancyDurationAverageSummaryCard({
  datasetError,
  loading,
  selectedScenarios,
  selectedSeries,
}: {
  datasetError?: string;
  loading: boolean;
  selectedScenarios: DurationScenario[];
  selectedSeries: OccupancyDurationScenarioSeries[];
}) {
  const widgetColor = useWidgetColor("#0F766E");
  const stats = summarizeSelectedSeries(
    selectedSeries,
    selectedScenarios.length,
  );
  const comparisonRows = buildDurationAverageComparisonRows(
    selectedScenarios,
    selectedSeries,
  );
  const composition = describeDurationScenarioComposition(selectedScenarios);
  const contextualMessage = joinMessages(
    datasetError,
    stats.errorCount
      ? `${stats.errorCount} cenário(s) permanecem sem dados válidos.`
      : undefined,
    ...stats.warnings,
  );
  const hasError = Boolean(datasetError || stats.errorCount);
  const metrics = [
    {
      key: "averageOccupancy",
      label: "Ocupação média",
      title:
        "Média de unidades ocupadas por cenário e minuto observado.",
      value: (summary: DurationAverageSummary) =>
        summary.averageOccupancy === null
          ? "—"
          : formatDecimal(summary.averageOccupancy, 2),
    },
    {
      key: "averageOccupiedSeconds",
      label: "Tempo médio ocupado",
      title: "Média das sequências continuamente ocupadas.",
      value: (summary: DurationAverageSummary) =>
        summary.averageOccupiedSeconds === null
          ? "—"
          : formatOccupancyDuration(summary.averageOccupiedSeconds),
    },
    {
      key: "averageFreeSeconds",
      label: "Tempo médio livre",
      title: "Média das sequências continuamente desocupadas.",
      value: (summary: DurationAverageSummary) =>
        summary.averageFreeSeconds === null
          ? "—"
          : formatOccupancyDuration(summary.averageFreeSeconds),
    },
    {
      key: "coverage",
      label: "Cobertura",
      title: "Minutos observados sobre todos os minutos encerrados esperados.",
      value: (summary: DurationAverageSummary) =>
        summary.coverage === null
          ? "—"
          : `${formatDecimal(summary.coverage * 100, 1)}%`,
    },
  ] as const;

  return (
    <Card
      className="@container h-full min-w-0 overflow-hidden"
      data-compact-metric-card
      data-duration-average-summary
    >
      <CardContent className="flex h-full min-h-0 min-w-0 flex-col p-2.5">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <h3 className="flex min-w-0 items-start gap-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.025em] text-muted-foreground">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              data-compact-metric-icon
              style={
                {
                  "--compact-metric-accent": widgetColor,
                } as React.CSSProperties
              }
            >
              <Timer aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
            <span className="line-clamp-2 min-w-0 break-words pt-1 [overflow-wrap:anywhere]">
              <WidgetTitleText fallback={CARD_LABELS.occupancy_duration_average} />
            </span>
          </h3>
          {contextualMessage ? (
            <span
              aria-atomic="true"
              aria-live={hasError ? "assertive" : "polite"}
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                hasError
                  ? "border-destructive/25 bg-destructive/5 text-destructive"
                  : "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300",
              )}
              role={hasError ? "alert" : "status"}
              title={contextualMessage}
            >
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">{contextualMessage}</span>
            </span>
          ) : null}
        </div>

        <p
          className="mt-1 truncate text-[10px] leading-3 text-muted-foreground"
          title={composition.fullLabel}
        >
          {composition.shortLabel}
        </p>

        <div
          aria-label="Comparação das médias globais e individuais da ocupação"
          className="mt-1.5 grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]"
        >
          {comparisonRows.map((row) => (
            <section
              aria-label={row.label}
              className={cn(
                "grid min-w-0 grid-cols-2 overflow-hidden rounded-md border @2xl:grid-cols-[minmax(112px,1.15fr)_repeat(4,minmax(76px,1fr))]",
                row.kind === "global"
                  ? "border-[color:var(--duration-summary-accent)] bg-muted/45"
                  : "border-border/70 bg-card",
              )}
              data-duration-average-row-scope={row.kind}
              key={row.kind === "global" ? "global" : row.scenarioId}
              style={
                row.kind === "global"
                  ? ({
                      "--duration-summary-accent": widgetColor,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <div className="col-span-2 flex min-w-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5 @2xl:col-span-1 @2xl:border-b-0 @2xl:border-r">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: widgetColor }}
                />
                <div className="min-w-0">
                  <p
                    className="truncate text-[11px] font-semibold leading-4 text-foreground"
                    title={row.label}
                  >
                    {row.label}
                  </p>
                  <p className="truncate text-[9px] leading-3 text-muted-foreground">
                    {row.kind === "global"
                      ? "Média entre cenários · tempos médios ponderados"
                      : "Cenário individual"}
                  </p>
                </div>
              </div>

              {metrics.map((metric) => {
                const value = metric.value(row.summary);
                return (
                  <dl
                    className="flex min-w-0 flex-col justify-center border-border/60 px-2 py-1.5 odd:border-r @2xl:border-r @2xl:last:border-r-0"
                    key={metric.key}
                    title={`${metric.label}: ${value}. ${metric.title}`}
                  >
                    <dt className="truncate text-[8px] font-medium uppercase leading-3 tracking-wide text-muted-foreground">
                      {metric.label}
                    </dt>
                    <dd className="mt-0.5 truncate text-xs font-semibold leading-4 tabular-nums text-foreground">
                      {loading && value === "—" ? (
                        <Skeleton className="h-4 w-12" />
                      ) : (
                        value
                      )}
                    </dd>
                  </dl>
                );
              })}
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OccupancyDurationTimelineCard({
  datasetError,
  loading,
  monitorMode,
  range,
  selectedScenarios,
  selectedSeries,
  timeZone,
}: {
  datasetError?: string;
  loading: boolean;
  monitorMode: boolean;
  range: OccupancyDurationMinuteRange | null;
  selectedScenarios: DurationScenario[];
  selectedSeries: OccupancyDurationScenarioSeries[];
  timeZone: string;
}) {
  const { effectiveTheme } = useTheme();
  const widgetColor = useWidgetColor("#1267C4");
  const visuals = React.useMemo(
    () => durationStateVisuals(effectiveTheme, widgetColor),
    [effectiveTheme, widgetColor],
  );
  const option = React.useMemo(
    () =>
      range
        ? buildOccupancyDurationTimelineOption({
            monitorMode,
            range,
            series: selectedSeries,
            theme: effectiveTheme,
            timeZone,
            visuals,
          })
        : emptyDurationChartOption(effectiveTheme),
    [effectiveTheme, monitorMode, range, selectedSeries, timeZone, visuals],
  );
  const composition = describeDurationScenarioComposition(selectedScenarios);
  const description = `Hoje, cada faixa representa um minuto fechado como ocupado ou desocupado; somente a apresentação incorpora transições ao estado ocupado, sem alterar os cálculos. Intervalos sem cobertura continuam identificados e horários futuros permanecem vazios. Composição: ${composition.shortLabel}.`;
  return (
    <DurationChartCard
      chartKind="timeline"
      description={description}
      emptyText="Selecione ao menos um cenário para montar a linha do tempo."
      error={joinMessages(
        datasetError,
        selectedSeriesErrors(selectedSeries),
      )}
      hasSelection={selectedScenarios.length > 0}
      loading={loading && selectedSeries.length === 0}
      option={option}
      textAlternative={
        <DurationScenarioTextAlternative
          chartLabel={CARD_LABELS.occupancy_duration_timeline}
          series={selectedSeries}
        />
      }
      title={CARD_LABELS.occupancy_duration_timeline}
      updating={loading && selectedSeries.length < selectedScenarios.length}
      warning={joinMessages(
        selectedSeriesWarnings(selectedSeries),
      )}
    />
  );
}

function OccupancyDurationByScenarioCard({
  datasetError,
  loading,
  monitorMode,
  selectedScenarios,
  selectedSeries,
}: {
  datasetError?: string;
  loading: boolean;
  monitorMode: boolean;
  selectedScenarios: DurationScenario[];
  selectedSeries: OccupancyDurationScenarioSeries[];
}) {
  const { effectiveTheme } = useTheme();
  const widgetColor = useWidgetColor("#1267C4");
  const visuals = React.useMemo(
    () => durationStateVisuals(effectiveTheme, widgetColor),
    [effectiveTheme, widgetColor],
  );
  const option = React.useMemo(
    () =>
      buildOccupancyDurationByScenarioOption({
        monitorMode,
        series: selectedSeries,
        theme: effectiveTheme,
        visuals,
      }),
    [effectiveTheme, monitorMode, selectedSeries, visuals],
  );
  const composition = describeDurationScenarioComposition(selectedScenarios);
  const description = `Hoje por cenário: ocupado confirmado, transição, livre, sem dados e permanência média das sessões concluídas em cada linha. Composição: ${composition.shortLabel}.`;
  return (
    <DurationChartCard
      chartKind="comparison"
      description={description}
      emptyText="Selecione ao menos um cenário para comparar."
      error={joinMessages(
        datasetError,
        selectedSeriesErrors(selectedSeries),
      )}
      hasSelection={selectedScenarios.length > 0}
      loading={loading && selectedSeries.length === 0}
      option={option}
      textAlternative={
        <DurationScenarioTextAlternative
          chartLabel={CARD_LABELS.occupancy_duration_by_scenario}
          series={selectedSeries}
        />
      }
      title={CARD_LABELS.occupancy_duration_by_scenario}
      updating={loading && selectedSeries.length < selectedScenarios.length}
      warning={joinMessages(
        selectedSeriesWarnings(selectedSeries),
      )}
    />
  );
}

function OccupancyDurationAverageByScenarioCard({
  datasetError,
  loading,
  monitorMode,
  selectedScenarios,
  selectedSeries,
}: {
  datasetError?: string;
  loading: boolean;
  monitorMode: boolean;
  selectedScenarios: DurationScenario[];
  selectedSeries: OccupancyIndividualDwellScenarioSeries[];
}) {
  const { effectiveTheme } = useTheme();
  const widgetColor = useWidgetColor("#0F766E");
  const entries = React.useMemo(
    () => buildOccupancyDurationAverageByScenarioEntries(selectedSeries),
    [selectedSeries],
  );
  const option = React.useMemo(
    () =>
      buildOccupancyDurationAverageByScenarioOption({
        entries,
        monitorMode,
        theme: effectiveTheme,
        widgetColor,
      }),
    [effectiveTheme, entries, monitorMode, widgetColor],
  );
  const composition = describeDurationScenarioComposition(selectedScenarios);
  const description = `Hoje por cenário: permanência individual real das sessões concluídas, ponderada pela quantidade de sessões. Composição: ${composition.shortLabel}.`;
  const hasResolvedSummary = entries.some(
    (entry) => entry.sessionCount !== null,
  );
  const hasCompletedSessions = entries.some(
    (entry) => entry.sessionCount !== null && entry.sessionCount > 0,
  );

  return (
    <DurationChartCard
      chartKind="average"
      description={description}
      emptyText="Selecione ao menos um cenário para comparar a permanência média."
      error={datasetError}
      hasData={hasCompletedSessions}
      hasSelection={selectedScenarios.length > 0}
      loading={loading && !hasResolvedSummary}
      noDataText="Nenhuma sessão de permanência foi concluída neste período."
      option={option}
      textAlternative={
        <DurationAverageByScenarioTextAlternative entries={entries} />
      }
      title={CARD_LABELS.occupancy_duration_average_by_scenario}
      updating={loading && hasResolvedSummary}
    />
  );
}

function DurationChartCard({
  chartKind,
  description,
  emptyText,
  error,
  hasData = true,
  hasSelection,
  loading,
  noDataText = "Não há dados para exibir neste período.",
  option,
  textAlternative,
  title,
  updating = false,
  warning,
}: {
  chartKind: "average" | "comparison" | "timeline";
  description: string;
  emptyText: string;
  error?: string;
  hasData?: boolean;
  hasSelection: boolean;
  loading: boolean;
  noDataText?: string;
  option: EnterpriseChartOption;
  textAlternative: React.ReactNode;
  title: string;
  updating?: boolean;
  warning?: string;
}) {
  const visibleWarning = occupancyAggregatePresentationWarning(warning);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const nextCompact =
        root.getBoundingClientRect().height < COMPACT_CHART_HEIGHT_PX;
      setCompact((current) =>
        current === nextCompact ? current : nextCompact,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const responsiveOption = React.useMemo(
    () =>
      compact ? compactDurationChartOption(option, chartKind) : option,
    [chartKind, compact, option],
  );

  return (
    <Card
      aria-busy={loading || updating}
      ref={rootRef}
      className="@container flex h-full min-w-0 flex-col overflow-hidden"
      data-duration-chart-density={compact ? "compact" : "regular"}
    >
      <CardHeader
        className={cn(
          "min-w-0 gap-0.5",
          compact ? "p-2 pb-0.5" : "p-3 pb-1",
        )}
      >
        <CardTitle
          className={cn(
            "min-w-0 [overflow-wrap:anywhere]",
            compact && "text-sm leading-5",
          )}
        >
          <WidgetTitleText fallback={title} />
        </CardTitle>
        <CardDescription
          className={cn(
            "min-w-0 text-xs leading-4 [overflow-wrap:anywhere]",
            compact ? "sr-only" : "line-clamp-1 @sm:line-clamp-2",
          )}
        >
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          compact ? "gap-1 p-2 pt-0" : "gap-1.5 p-3 pt-0",
        )}
      >
        {updating && !loading ? (
          <span className="sr-only" role="status">
            Carregando os demais cenários deste gráfico.
          </span>
        ) : null}
        {error && hasData ? (
          <DurationNotice compact={compact} tone="error">
            {error}
          </DurationNotice>
        ) : visibleWarning ? (
          <DurationNotice compact={compact} tone="warning">
            {visibleWarning}
          </DurationNotice>
        ) : null}
        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="min-h-0 flex-1 w-full" />
          </div>
        ) : !hasSelection ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : error && !hasData ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-destructive/25 bg-destructive/5 px-3 text-center text-xs text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : !hasData ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground"
            role="status"
          >
            {noDataText}
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1" data-echart-layout="natural">
            <EChart
              ariaDescription={description}
              ariaLabel={title}
              className="h-full min-h-0 w-full"
              option={responsiveOption}
              themeMode="explicit"
              valueLabels="always"
            />
          </div>
        )}
        {!loading && hasSelection && hasData ? textAlternative : null}
      </CardContent>
    </Card>
  );
}

function DurationNotice({
  children,
  compact = false,
  tone,
}: {
  children: React.ReactNode;
  compact?: boolean;
  tone: "error" | "warning";
}) {
  return (
    <div
      aria-atomic="true"
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        compact
          ? "line-clamp-1 px-2 py-0.5 text-[10px] leading-4"
          : "line-clamp-2 px-2.5 py-1.5 text-[11px] leading-4",
        "rounded-md border",
        tone === "error"
          ? "border-destructive/25 bg-destructive/5 text-destructive"
          : "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300",
      )}
      role={tone === "error" ? "alert" : "status"}
      title={typeof children === "string" ? children : undefined}
    >
      {children}
    </div>
  );
}

function DurationScenarioTextAlternative({
  chartLabel,
  series,
}: {
  chartLabel: string;
  series: OccupancyDurationScenarioSeries[];
}) {
  if (!series.length) return null;
  const rows = series.map((scenario) => {
    const state = deriveOccupancyStateMetrics(scenario.summary);
    const dwell = scenario.individualDwell;
    const dwellTotals = dwell?.totals;
    const dwellAverage = dwell?.loading &&
      (!dwellTotals || dwellTotals.sessionCount === 0)
      ? "Carregando"
      : dwellTotals
        ? dwellTotals.sessionCount > 0
        ? formatOccupancyLoiteringDuration(
            dwellTotals.avgDurationSeconds,
            true,
          )
        : "—"
        : dwell?.error
          ? "Indisponível"
          : "—";
    return {
      averageFree:
        state.averageConfirmedFreeSequenceSeconds === null
          ? "—"
          : formatOccupancyDuration(
              state.averageConfirmedFreeSequenceSeconds,
            ),
      averageOccupied:
        state.averageConfirmedOccupiedSequenceSeconds === null
          ? "—"
          : formatOccupancyDuration(
              state.averageConfirmedOccupiedSequenceSeconds,
            ),
      coverage: formatCoverage(scenario.summary),
      free: formatOccupancyDuration(scenario.summary.confirmedFreeSeconds),
      load: `${formatDecimal(
        scenario.summary.loadUnitSeconds / HOUR_SECONDS,
        2,
      )} unid·h`,
      individualDwellAverage: dwellAverage,
      individualDwellSessions: dwell?.loading &&
        (!dwellTotals || dwellTotals.sessionCount === 0)
        ? "—"
        : dwellTotals
        ? dwellTotals.sessionCount.toLocaleString("pt-BR")
        : "—",
      minimumTransitions: state.minimumDetectedTransitions.toLocaleString(
        "pt-BR",
      ),
      name: scenario.name,
      occupied: formatOccupancyDuration(
        scenario.summary.confirmedOccupiedSeconds,
      ),
      occupiedRate:
        state.occupiedShareOfConfirmed === null
          ? "—"
          : `${formatDecimal(state.occupiedShareOfConfirmed * 100, 1)}%`,
      transition: formatOccupancyDuration(scenario.summary.transitionSeconds),
      unknown: formatOccupancyDuration(scenario.summary.unknownSeconds),
    };
  });

  return (
    <>
      <table className="sr-only">
        <caption>{`${chartLabel}: resumo textual de todos os cenários selecionados.`}</caption>
        <thead>
          <tr>
            <th scope="col">Cenário</th>
            <th scope="col">Ocupado confirmado</th>
            <th scope="col">Transição</th>
            <th scope="col">Livre confirmado</th>
            <th scope="col">Média do período ocupado</th>
            <th scope="col">Média do período desocupado</th>
            <th scope="col">Permanência média concluída</th>
            <th scope="col">Sessões concluídas</th>
            <th scope="col">Taxa de tempo ocupado</th>
            <th scope="col">Mudanças mínimas de estado</th>
            <th scope="col">Sem dados</th>
            <th scope="col">Cobertura</th>
            <th scope="col">Carga de ocupação, não permanência individual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${series[index].scenarioId}-accessible`}>
              <th scope="row">{row.name}</th>
              <td>{row.occupied}</td>
              <td>{row.transition}</td>
              <td>{row.free}</td>
              <td>{row.averageOccupied}</td>
              <td>{row.averageFree}</td>
              <td>{row.individualDwellAverage}</td>
              <td>{row.individualDwellSessions}</td>
              <td>{row.occupiedRate}</td>
              <td>{row.minimumTransitions}</td>
              <td>{row.unknown}</td>
              <td>{row.coverage}</td>
              <td>{row.load}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 ? (
        <details className="shrink-0 rounded-md border bg-card/95 px-2 py-1 text-[10px] leading-4 text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Consultar os {rows.length} cenários em texto
          </summary>
          <div className="mt-1 max-h-28 space-y-1 overflow-auto pr-1">
            {rows.map((row, index) => (
              <p
                className="min-w-0 [overflow-wrap:anywhere]"
                key={`${series[index].scenarioId}-visible-summary`}
              >
                <strong className="text-foreground">{row.name}:</strong>{" "}
                ocupado {row.occupied}; transição {row.transition}; livre{" "}
                {row.free}; média ocupada {row.averageOccupied}; média livre{" "}
                {row.averageFree}; permanência média concluída{" "}
                {row.individualDwellAverage}; sessões concluídas{" "}
                {row.individualDwellSessions}; taxa ocupada {row.occupiedRate}; mudanças mínimas{" "}
                {row.minimumTransitions}; sem dados {row.unknown}; cobertura{" "}
                {row.coverage}; carga{" "}
                {row.load}.
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function DurationAverageByScenarioTextAlternative({
  entries,
}: {
  entries: OccupancyDurationAverageByScenarioEntry[];
}) {
  if (!entries.length) return null;
  const durationLabel = (value: number | null) =>
    value === null
      ? "—"
      : formatOccupancyLoiteringDuration(value, true);

  return (
    <>
      <table className="sr-only">
        <caption>
          Permanência individual das sessões concluídas por cenário.
        </caption>
        <thead>
          <tr>
            <th scope="col">Cenário</th>
            <th scope="col">Permanência média</th>
            <th scope="col">Menor permanência</th>
            <th scope="col">Maior permanência</th>
            <th scope="col">Sessões concluídas</th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.scenarioId}-average-accessible`}>
              <th scope="row">{entry.name}</th>
              <td>{durationLabel(entry.averageDurationSeconds)}</td>
              <td>{durationLabel(entry.minimumDurationSeconds)}</td>
              <td>{durationLabel(entry.maximumDurationSeconds)}</td>
              <td>
                {entry.sessionCount === null
                  ? "—"
                  : entry.sessionCount.toLocaleString("pt-BR")}
              </td>
              <td>{durationAverageEntryStatus(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length > 8 ? (
        <details className="shrink-0 rounded-md border bg-card/95 px-2 py-1 text-[10px] leading-4 text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Consultar os {entries.length} cenários em texto
          </summary>
          <div className="mt-1 max-h-28 space-y-1 overflow-auto pr-1">
            {entries.map((entry) => (
              <p
                className="min-w-0 [overflow-wrap:anywhere]"
                key={`${entry.scenarioId}-average-visible-summary`}
              >
                <strong className="text-foreground">{entry.name}:</strong>{" "}
                média {durationLabel(entry.averageDurationSeconds)}; mínimo{" "}
                {durationLabel(entry.minimumDurationSeconds)}; máximo{" "}
                {durationLabel(entry.maximumDurationSeconds)};{" "}
                {entry.sessionCount === null
                  ? "sessões indisponíveis"
                  : `${entry.sessionCount.toLocaleString("pt-BR")} sessão(ões) concluída(s)`}.
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function compactDurationChartOption(
  option: EnterpriseChartOption,
  chartKind: "average" | "comparison" | "timeline",
): EnterpriseChartOption {
  const mapComponent = (
    value: unknown,
    transform: (record: Record<string, unknown>) => Record<string, unknown>,
  ): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) =>
        item && typeof item === "object"
          ? transform(item as Record<string, unknown>)
          : item,
      );
    }
    return value && typeof value === "object"
      ? transform(value as Record<string, unknown>)
      : value;
  };
  const compactAxis = (axis: unknown, horizontal: boolean) =>
    mapComponent(axis, (record) => {
      const axisLabel =
        record.axisLabel && typeof record.axisLabel === "object"
          ? (record.axisLabel as Record<string, unknown>)
          : {};
      return {
        ...record,
        ...(horizontal ? { name: undefined } : {}),
        axisLabel: {
          ...axisLabel,
          fontSize: 8,
          ...(horizontal
            ? {}
            : {
                width:
                  chartKind === "timeline" || chartKind === "comparison"
                    ? 112
                    : 82,
              }),
        },
      };
    });

  return {
    ...option,
    dataZoom: mapComponent(option.dataZoom, (record) => ({
      ...record,
      ...(record.type === "slider" ? { right: 1, width: 8 } : {}),
      ...(chartKind === "average" && typeof record.endValue === "number"
        ? { endValue: Math.min(4, record.endValue) }
        : {}),
    })) as EnterpriseChartOption["dataZoom"],
    grid: mapComponent(option.grid, (record) => ({
      ...record,
      bottom: chartKind === "timeline" ? 30 : 18,
      left: 6,
      right: chartKind === "average" ? 64 : 12,
      top: 24,
    })) as EnterpriseChartOption["grid"],
    legend: mapComponent(option.legend, (record) => {
      const textStyle =
        record.textStyle && typeof record.textStyle === "object"
          ? (record.textStyle as Record<string, unknown>)
          : {};
      return {
        ...record,
        itemGap: 6,
        itemHeight: 6,
        itemWidth: 10,
        textStyle: { ...textStyle, fontSize: 8 },
        top: 0,
      };
    }) as EnterpriseChartOption["legend"],
    xAxis: compactAxis(
      option.xAxis,
      chartKind === "average" || chartKind === "comparison",
    ) as EnterpriseChartOption["xAxis"],
    yAxis: compactAxis(option.yAxis, false) as EnterpriseChartOption["yAxis"],
  };
}

function durationScenarioAverageLabel(
  scenario: OccupancyDurationScenarioSeries,
) {
  const dwell = scenario.individualDwell;
  if (dwell) {
    const totals = dwell.totals;
    if (dwell.loading && (!totals || totals.sessionCount === 0)) {
      return "Média carregando…";
    }
    if (totals && totals.sessionCount > 0) {
      return `Média ${formatOccupancyLoiteringDuration(
        totals.avgDurationSeconds,
      )} · ${totals.sessionCount.toLocaleString("pt-BR")} sess.`;
    }
    if (totals && totals.sessionCount === 0) {
      return "Média —";
    }
    if (dwell.error) return "Média indisponível";
    return "Média —";
  }
  const average = deriveOccupancyStateMetrics(
    scenario.summary,
  ).averageConfirmedOccupiedSequenceSeconds;
  return average === null
    ? "Média ocupada —"
    : `Média ocupada ${formatOccupancyDuration(average)}`;
}

function durationScenarioAxisLabel(
  scenario: OccupancyDurationScenarioSeries,
  maximumNameLength: number,
) {
  return `${truncateLabel(
    scenario.name,
    maximumNameLength,
  )}\n${durationScenarioAverageLabel(scenario)}`;
}

function durationScenarioDwellTooltipLines(
  scenario: OccupancyDurationScenarioSeries | undefined,
) {
  const dwell = scenario?.individualDwell;
  if (!dwell) return [];
  const totals = dwell.totals;
  if (dwell.loading && (!totals || totals.sessionCount === 0)) {
    return ["Permanência média concluída: carregando…"];
  }
  if (totals && totals.sessionCount > 0) {
    return [
      `Permanência média concluída: ${escapeHtml(
        formatOccupancyLoiteringDuration(totals.avgDurationSeconds, true),
      )}`,
      `Sessões concluídas: ${totals.sessionCount.toLocaleString("pt-BR")}`,
    ];
  }
  if (totals && totals.sessionCount === 0) {
    return ["Permanência média concluída: —"];
  }
  return ["Permanência média concluída: indisponível"];
}

function buildOccupancyDurationTimelineOption({
  interactive = true,
  monitorMode,
  range,
  series,
  theme,
  timeZone,
  visuals,
}: {
  interactive?: boolean;
  monitorMode: boolean;
  range: OccupancyDurationMinuteRange;
  series: OccupancyDurationScenarioSeries[];
  theme: "dark" | "light";
  timeZone: string;
  visuals: Record<OccupancyDurationState, DurationStateVisual>;
}): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const timeFormatter = zonedTimeFormatter(timeZone);
  const dataByState = new Map<
    OccupancyDurationTimelineState,
    TimelineDatum[]
  >();
  DURATION_TIMELINE_STATE_ORDER.forEach((state) =>
    dataByState.set(state, []),
  );
  series.forEach((scenario, scenarioIndex) => {
    buildOccupancyDurationTimelineSegments(
      scenario.summary.segments,
    ).forEach((segment) => {
      dataByState.get(segment.state)!.push({
        name: scenario.name,
        value: [
          scenarioIndex,
          segment.from.getTime(),
          segment.to.getTime(),
          segment.seconds,
          segment.from.getTime(),
          segment.to.getTime(),
        ],
      });
    });
  });
  const showVerticalZoom = interactive && series.length > 8;

  return {
    animation: !monitorMode,
    aria: {
      show: true,
      label: {
        description:
          "Linha do tempo minuto a minuto por cenário. A apresentação exibe ocupado ou desocupado e incorpora transições ao estado ocupado sem alterar as métricas conservadoras. Intervalos sem cobertura permanecem identificados.",
      },
    },
    dataZoom: showVerticalZoom
      ? [
          {
            endValue: Math.min(7, series.length - 1),
            filterMode: "weakFilter",
            right: 4,
            startValue: 0,
            type: "slider",
            width: 12,
            yAxisIndex: 0,
          },
          {
            endValue: Math.min(7, series.length - 1),
            filterMode: "weakFilter",
            startValue: 0,
            type: "inside",
            yAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom: 56,
      containLabel: true,
      left: 12,
      right: showVerticalZoom ? 26 : 12,
      top: 46,
    },
    legend: {
      data: DURATION_TIMELINE_STATE_ORDER.map((state) =>
        occupancyDurationTimelineStateLabel(state),
      ),
      itemHeight: 8,
      itemWidth: 14,
      left: 8,
      textStyle: { color: palette.legendText, fontSize: 10 },
      top: 4,
      type: "scroll",
    },
    series: DURATION_TIMELINE_STATE_ORDER.map((state) => ({
      data: dataByState.get(state),
      dimensions: [
        "scenarioIndex",
        "start",
        "end",
        "durationSeconds",
        "startAt",
        "endAt",
      ],
      encode: {
        tooltip: [4, 5, 3],
        x: [1, 2],
        y: 0,
      },
      itemStyle: { color: visuals[state].color },
      name: occupancyDurationTimelineStateLabel(state),
      progressive: 800,
      progressiveThreshold: 1_200,
      renderItem: durationTimelineRenderItem(visuals[state], state),
      type: "custom",
    })),
    tooltip: {
      appendToBody: true,
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw[0] : raw;
        const record = isRecord(params) ? params : {};
        const data = isRecord(record.data) ? record.data : {};
        const value = Array.isArray(data.value) ? data.value : [];
        const scenarioName =
          typeof data.name === "string" ? data.name : "Cenário";
        const state = DURATION_TIMELINE_STATE_ORDER.find(
          (candidate) =>
            occupancyDurationTimelineStateLabel(candidate) ===
            record.seriesName,
        );
        const start = numericValue(value[4]);
        const end = numericValue(value[5]);
        const seconds = numericValue(value[3]) ?? 0;
        const scenarioIndex = numericValue(value[0]);
        const scenario = scenarioIndex === null
          ? undefined
          : series[scenarioIndex];
        const scenarioState = scenario
          ? deriveOccupancyStateMetrics(scenario.summary)
          : null;
        return [
          `<strong>${escapeHtml(scenarioName)}</strong>`,
          `Estado: ${escapeHtml(
            state ? occupancyDurationTimelineStateLabel(state) : "-",
          )}`,
          `Início: ${escapeHtml(start === null ? "-" : timeFormatter.format(start))}`,
          `Fim: ${escapeHtml(end === null ? "-" : timeFormatter.format(end))}`,
          `Duração: ${escapeHtml(formatOccupancyDuration(seconds))}`,
          ...(scenarioState
            ? [
                `Média do período ocupado: ${escapeHtml(
                  scenarioState.averageConfirmedOccupiedSequenceSeconds === null
                    ? "—"
                    : formatOccupancyDuration(
                        scenarioState.averageConfirmedOccupiedSequenceSeconds,
                      ),
                )}`,
                `Média do período desocupado: ${escapeHtml(
                  scenarioState.averageConfirmedFreeSequenceSeconds === null
                    ? "—"
                    : formatOccupancyDuration(
                        scenarioState.averageConfirmedFreeSequenceSeconds,
                      ),
                )}`,
                `Taxa de tempo ocupado: ${
                  scenarioState.occupiedShareOfConfirmed === null
                    ? "—"
                    : `${formatDecimal(
                        scenarioState.occupiedShareOfConfirmed * 100,
                        1,
                      )}%`
                }`,
                `Mudanças mínimas: ${scenarioState.minimumDetectedTransitions.toLocaleString(
                  "pt-BR",
                )}`,
              ]
            : []),
          ...durationScenarioDwellTooltipLines(scenario),
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) => `${timeFormatter.format(value).slice(0, 2)}h`,
        fontSize: 8,
        hideOverlap: false,
        rotate: 45,
        showMaxLabel: false,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: true },
      interval: HOUR_MS,
      max: range.dayEnd.getTime(),
      maxInterval: HOUR_MS,
      min: range.from.getTime(),
      minInterval: HOUR_MS,
      splitNumber: Math.max(
        1,
        Math.round(
          (range.dayEnd.getTime() - range.from.getTime()) / HOUR_MS,
        ),
      ),
      splitLine: { lineStyle: { color: palette.gridLine }, show: true },
      type: "time",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: string, index: number) => {
          const scenario = series[index];
          return scenario
            ? durationScenarioAxisLabel(scenario, 18)
            : truncateLabel(value, 18);
        },
        fontSize: 10,
        lineHeight: 14,
        width: 132,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: series.map((scenario) => scenario.name),
      inverse: true,
      type: "category",
    },
  };
}

type TimelineDatum = {
  name: string;
  value: [number, number, number, number, number, number];
};

function occupancyDurationTimelineState(
  state: OccupancyDurationState,
): OccupancyDurationTimelineState {
  return state === "transition" ? "occupied" : state;
}

function occupancyDurationTimelineStateLabel(
  state: OccupancyDurationTimelineState,
) {
  if (state === "occupied") return "Ocupado";
  if (state === "free") return "Desocupado";
  return "Sem dados";
}

function buildOccupancyDurationTimelineSegments(
  segments: OccupancyDurationSummary["segments"],
) {
  const result: Array<{
    from: Date;
    seconds: number;
    state: OccupancyDurationTimelineState;
    to: Date;
  }> = [];
  segments.forEach((segment) => {
    const state = occupancyDurationTimelineState(segment.state);
    const previous = result.at(-1);
    if (
      previous?.state === state &&
      previous.to.getTime() === segment.from.getTime()
    ) {
      previous.seconds += segment.seconds;
      previous.to = segment.to;
      return;
    }
    result.push({
      from: segment.from,
      seconds: segment.seconds,
      state,
      to: segment.to,
    });
  });
  return result;
}

function durationTimelineRenderItem(
  visual: DurationStateVisual,
  state: OccupancyDurationState,
) {
  return (
    params: {
      coordSys?: { height: number; width: number; x: number; y: number };
    },
    api: {
      coord: (value: [number, number]) => [number, number];
      size: (value: [number, number]) => [number, number];
      value: (dimension: number) => unknown;
    },
  ) => {
    const coordSys = params.coordSys;
    if (!coordSys) return null;
    const scenarioIndex = numericValue(api.value(0));
    const startValue = numericValue(api.value(1));
    const endValue = numericValue(api.value(2));
    const durationSeconds = numericValue(api.value(3)) ?? 0;
    if (
      scenarioIndex === null ||
      startValue === null ||
      endValue === null ||
      endValue <= startValue
    ) {
      return null;
    }
    const start = api.coord([startValue, scenarioIndex]);
    const end = api.coord([endValue, scenarioIndex]);
    const bandHeight = Math.abs(api.size([0, 1])[1]);
    const height = Math.max(5, Math.min(24, bandHeight * 0.58));
    const left = Math.max(coordSys.x, start[0]);
    const right = Math.min(coordSys.x + coordSys.width, end[0]);
    const top = Math.max(coordSys.y, start[1] - height / 2);
    const bottom = Math.min(
      coordSys.y + coordSys.height,
      start[1] + height / 2,
    );
    if (right <= left || bottom <= top) return null;
    const children: Array<Record<string, unknown>> = [
      {
        shape: {
          height: bottom - top,
          r: 3,
          width: right - left,
          x: left,
          y: top,
        },
        style: {
          fill: visual.color,
          lineDash: state === "unknown" ? [4, 3] : undefined,
          lineWidth: state === "unknown" ? 1 : 0.75,
          opacity: state === "unknown" ? 0.7 : 0.94,
          stroke: visual.border,
        },
        type: "rect",
      },
    ];
    if (
      right - left >= 54 &&
      bottom - top >= height * 0.8 &&
      durationSeconds !== 0 &&
      state !== "unknown"
    ) {
      children.push({
        style: {
          align: "center",
          fill: visual.text,
          font: "600 9px sans-serif",
          text: formatOccupancyDuration(durationSeconds),
          verticalAlign: "middle",
          x: left + (right - left) / 2,
          y: start[1],
        },
        type: "text",
      });
    }
    return { children, type: "group" };
  };
}

function buildOccupancyDurationAverageByScenarioEntries(
  series: OccupancyIndividualDwellScenarioSeries[],
): OccupancyDurationAverageByScenarioEntry[] {
  return series
    .map((scenario) => {
      const dwell = scenario.individualDwell;
      const totals = dwell.totals;
      const hasCompletedSessions = Boolean(
        totals && totals.sessionCount > 0,
      );
      return {
        averageDurationSeconds: hasCompletedSessions
          ? totals?.avgDurationSeconds ?? null
          : null,
        error: dwell.error,
        loading: dwell.loading,
        maximumDurationSeconds: hasCompletedSessions
          ? totals?.maxDurationSeconds ?? null
          : null,
        minimumDurationSeconds: hasCompletedSessions
          ? totals?.minDurationSeconds ?? null
          : null,
        name: scenario.name,
        scenarioId: scenario.scenarioId,
        sessionCount: totals?.sessionCount ?? null,
      };
    })
    .sort((left, right) => {
      if (left.averageDurationSeconds === null) {
        return right.averageDurationSeconds === null ? 0 : 1;
      }
      if (right.averageDurationSeconds === null) return -1;
      return right.averageDurationSeconds - left.averageDurationSeconds;
    });
}

function durationAverageEntryStatus(
  entry: OccupancyDurationAverageByScenarioEntry,
) {
  if (entry.error) {
    return entry.averageDurationSeconds === null
      ? "Fonte indisponível"
      : "Último valor disponível";
  }
  if (entry.loading && entry.sessionCount === null) return "Carregando";
  return entry.sessionCount === 0
    ? "Aguardando amostra"
    : entry.averageDurationSeconds === null
      ? "Dados indisponíveis"
    : "Disponível";
}

function buildOccupancyDurationAverageByScenarioOption({
  entries,
  interactive = true,
  monitorMode,
  theme,
  widgetColor,
}: {
  entries: OccupancyDurationAverageByScenarioEntry[];
  interactive?: boolean;
  monitorMode: boolean;
  theme: "dark" | "light";
  widgetColor: string;
}): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const showVerticalZoom = interactive && entries.length > 8;

  return {
    animation: !monitorMode,
    aria: {
      show: true,
      label: {
        description:
          "Ranking por cenário da permanência média individual nas sessões concluídas. Ausência de sessões permanece sem valor.",
      },
    },
    dataZoom: showVerticalZoom
      ? [
          {
            endValue: Math.min(7, entries.length - 1),
            filterMode: "weakFilter",
            right: 4,
            startValue: 0,
            type: "slider",
            width: 12,
            yAxisIndex: 0,
          },
          {
            endValue: Math.min(7, entries.length - 1),
            filterMode: "weakFilter",
            startValue: 0,
            type: "inside",
            yAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom: 32,
      containLabel: true,
      left: 12,
      right: showVerticalZoom ? 92 : 76,
      top: 18,
    },
    series: [
      {
        barMaxWidth: 28,
        data: entries.map((entry) => entry.averageDurationSeconds),
        emphasis: { focus: "self" },
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
          color: widgetColor,
        },
        label: {
          color: palette.legendText,
          formatter: (params: unknown) => {
            const record = isRecord(params) ? params : {};
            const seconds = numericValue(record.value);
            return seconds !== null && seconds > 0
              ? formatOccupancyLoiteringDuration(seconds, true)
              : "";
          },
          fontSize: 10,
          fontWeight: 600,
          position: "right",
          show: true,
        },
        labelLayout: { hideOverlap: false },
        name: "Permanência média",
        type: "bar",
      },
    ],
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw[0] : raw;
        const record = isRecord(params) ? params : {};
        const dataIndex = numericValue(record.dataIndex);
        const entry = dataIndex === null ? undefined : entries[dataIndex];
        if (!entry) return "";
        const average = entry.averageDurationSeconds === null
          ? "—"
          : formatOccupancyLoiteringDuration(
              entry.averageDurationSeconds,
              true,
            );
        const minimum = entry.minimumDurationSeconds === null
          ? "—"
          : formatOccupancyLoiteringDuration(
              entry.minimumDurationSeconds,
              true,
            );
        const maximum = entry.maximumDurationSeconds === null
          ? "—"
          : formatOccupancyLoiteringDuration(
              entry.maximumDurationSeconds,
              true,
            );
        return [
          `<strong>${escapeHtml(entry.name)}</strong>`,
          `Permanência média: ${escapeHtml(average)}`,
          `Menor permanência: ${escapeHtml(minimum)}`,
          `Maior permanência: ${escapeHtml(maximum)}`,
          `Sessões concluídas: ${entry.sessionCount === null ? "—" : entry.sessionCount.toLocaleString("pt-BR")}`,
          `Situação: ${escapeHtml(durationAverageEntryStatus(entry))}`,
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) =>
          value > 0 ? formatOccupancyLoiteringDuration(value, true) : "",
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      min: 0,
      name: "Permanência média",
      nameTextStyle: { color: palette.axisText },
      splitLine: { lineStyle: { color: palette.gridLine }, show: true },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: string) => truncateLabel(value, 22),
        width: 140,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: entries.map((entry) => entry.name),
      inverse: true,
      type: "category",
    },
  };
}

function buildOccupancyDurationByScenarioOption({
  interactive = true,
  monitorMode,
  series,
  theme,
  visuals,
}: {
  interactive?: boolean;
  monitorMode: boolean;
  series: OccupancyDurationScenarioSeries[];
  theme: "dark" | "light";
  visuals: Record<OccupancyDurationState, DurationStateVisual>;
}): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const showVerticalZoom = interactive && series.length > 8;
  const secondsByState: Record<
    OccupancyDurationState,
    (summary: OccupancyDurationSummary) => number
  > = {
    free: (summary) => summary.confirmedFreeSeconds,
    occupied: (summary) => summary.confirmedOccupiedSeconds,
    transition: (summary) => summary.transitionSeconds,
    unknown: (summary) => summary.unknownSeconds,
  };

  return {
    animation: !monitorMode,
    aria: {
      show: true,
      label: {
        description:
          "Barras empilhadas por cenário com tempo ocupado confirmado, transição, livre, sem dados e a permanência média das sessões concluídas visível em cada linha.",
      },
    },
    dataZoom: showVerticalZoom
      ? [
          {
            endValue: Math.min(7, series.length - 1),
            filterMode: "weakFilter",
            right: 4,
            startValue: 0,
            type: "slider",
            width: 12,
            yAxisIndex: 0,
          },
          {
            endValue: Math.min(7, series.length - 1),
            filterMode: "weakFilter",
            startValue: 0,
            type: "inside",
            yAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom: 28,
      containLabel: true,
      left: 12,
      right: showVerticalZoom ? 28 : 16,
      top: 52,
    },
    legend: {
      data: DURATION_STATE_ORDER.map((state) => visuals[state].label),
      itemHeight: 8,
      itemWidth: 14,
      left: 8,
      textStyle: { color: palette.legendText, fontSize: 10 },
      top: 4,
      type: "scroll",
    },
    series: DURATION_STATE_ORDER.map((state) => ({
      barMaxWidth: 28,
      data: series.map(
        (scenario) => secondsByState[state](scenario.summary) / HOUR_SECONDS,
      ),
      emphasis: { focus: "series" },
      itemStyle: {
        borderColor: visuals[state].border,
        borderWidth: state === "unknown" ? 1 : 0,
        color: visuals[state].color,
        decal:
          state === "unknown"
            ? {
                color: visuals[state].border,
                dashArrayX: [1, 0],
                dashArrayY: [3, 3],
                rotation: Math.PI / 4,
                symbol: "rect",
              }
            : undefined,
      },
      label: {
        color: visuals[state].text,
        formatter: (params: unknown) => {
          const record = isRecord(params) ? params : {};
          const hours = numericValue(record.value) ?? 0;
          return hours > 0
            ? formatOccupancyDuration(hours * HOUR_SECONDS)
            : "";
        },
        fontSize: 9,
        fontWeight: 600,
        position: "inside",
        show: true,
      },
      labelLayout: { hideOverlap: true },
      name: visuals[state].label,
      stack: "duration",
      type: "bar",
    })),
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw : [raw];
        const records = params.filter(isRecord);
        const scenarioName =
          typeof records[0]?.axisValueLabel === "string"
            ? records[0].axisValueLabel
            : typeof records[0]?.name === "string"
              ? records[0].name
              : "Cenário";
        const scenarioIndex = numericValue(records[0]?.dataIndex);
        const scenario = scenarioIndex === null
          ? undefined
          : series[scenarioIndex];
        const state = scenario
          ? deriveOccupancyStateMetrics(scenario.summary)
          : null;
        return [
          `<strong>${escapeHtml(scenarioName)}</strong>`,
          ...records.map((record) => {
            const label =
              typeof record.seriesName === "string"
                ? record.seriesName
                : "Estado";
            const hours = numericValue(record.value) ?? 0;
            return `${escapeHtml(label)}: ${escapeHtml(
              formatOccupancyDuration(hours * HOUR_SECONDS),
            )}`;
          }),
          ...(state
            ? [
                `Média ocupado: ${escapeHtml(
                  state.averageConfirmedOccupiedSequenceSeconds === null
                    ? "—"
                    : formatOccupancyDuration(
                        state.averageConfirmedOccupiedSequenceSeconds,
                      ),
                )}`,
                `Média desocupado: ${escapeHtml(
                  state.averageConfirmedFreeSequenceSeconds === null
                    ? "—"
                    : formatOccupancyDuration(
                        state.averageConfirmedFreeSequenceSeconds,
                      ),
                )}`,
                `Taxa ocupada: ${
                  state.occupiedShareOfConfirmed === null
                    ? "—"
                    : `${formatDecimal(
                        state.occupiedShareOfConfirmed * 100,
                        1,
                      )}%`
                }`,
                `Mudanças mínimas: ${state.minimumDetectedTransitions.toLocaleString(
                  "pt-BR",
                )}`,
              ]
            : []),
          ...durationScenarioDwellTooltipLines(scenario),
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) => `${formatDecimal(value, 1)}h`,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      min: 0,
      name: "Tempo nos minutos fechados",
      nameTextStyle: { color: palette.axisText },
      splitLine: { lineStyle: { color: palette.gridLine }, show: true },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: string, index: number) => {
          const scenario = series[index];
          return scenario
            ? durationScenarioAxisLabel(scenario, 18)
            : truncateLabel(value, 18);
        },
        fontSize: 10,
        lineHeight: 14,
        width: 132,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: series.map((scenario) => scenario.name),
      inverse: true,
      type: "category",
    },
  };
}

function buildDurationReportContext({
  inheritedScenarios,
  preferenceByCardId,
  scenarioOptions,
}: {
  inheritedScenarios: DurationScenario[];
  preferenceByCardId: Map<string, CardPreference>;
  scenarioOptions: DurationScenario[];
}) {
  return OCCUPANCY_DURATION_CARD_IDS.flatMap((cardId) => {
    const preference = preferenceByCardId.get(cardId);
    if (preference?.visible === false) return [];
    const selectedScenarios = resolveWidgetScenarios(
      scenarioOptions,
      scenarioSelectionFromPreference(preference),
      inheritedScenarios,
    );
    const composition = describeDurationScenarioComposition(selectedScenarios);
    return [
      `Composição de duração — ${CARD_LABELS[cardId]}: ${composition.fullLabel}.`,
    ];
  });
}

function buildDurationReportMetrics({
  inheritedScenarios,
  preferenceByCardId,
  resolveSelectedSeries,
  scenarioOptions,
}: {
  inheritedScenarios: DurationScenario[];
  preferenceByCardId: Map<string, CardPreference>;
  resolveSelectedSeries: (
    selection: CardScenarioSelection,
  ) => OccupancyDurationScenarioSeries[];
  scenarioOptions: DurationScenario[];
}): OccupancyDurationReportMetric[] {
  const definitions: Array<{
    cardId: OccupancyDurationCardId;
    kind: DurationMetricKind;
  }> = [
    { cardId: "occupancy_duration_confirmed", kind: "confirmed" },
    { cardId: "occupancy_duration_free", kind: "free" },
    { cardId: "occupancy_duration_average", kind: "average" },
    { cardId: "occupancy_duration_rate", kind: "rate" },
    { cardId: "occupancy_duration_transitions", kind: "transitions" },
    { cardId: "occupancy_duration_longest", kind: "longest" },
    { cardId: "occupancy_duration_load", kind: "load" },
    { cardId: "occupancy_duration_coverage", kind: "coverage" },
  ];
  return definitions.flatMap(({
    cardId,
    kind,
  }): OccupancyDurationReportMetric[] => {
    const preference = preferenceByCardId.get(cardId);
    if (preference?.visible === false) return [];
    const selection = scenarioSelectionFromPreference(
      preference,
    );
    const selectedScenarios = resolveWidgetScenarios(
      scenarioOptions,
      selection,
      inheritedScenarios,
    );
    const selectedSeries = resolveSelectedSeries(selection);
    const stats = summarizeSelectedSeries(
      selectedSeries,
      selectedScenarios.length,
    );
    const composition = describeDurationScenarioComposition(selectedScenarios);
    if (cardId === "occupancy_duration_average") {
      const comparisonRows = buildDurationAverageComparisonRows(
        selectedScenarios,
        selectedSeries,
      );
      const globalSummary = comparisonRows[0]?.summary;
      const validScenarioCount = comparisonRows
        .slice(1)
        .filter((row) => row.summary.averageOccupancy !== null).length;
      return [{
        cardId,
        metric: {
          description:
            joinMessages(
              validScenarioCount > 0
                ? `Média aritmética entre ${validScenarioCount} cenário(s) com ocupação válida; cenários sem valor não entram no divisor.`
                : "Nenhum cenário possui ocupação válida no período.",
              globalSummary?.averageOccupiedSeconds == null
                ? "Tempo médio ocupado indisponível."
                : `Tempo médio ocupado: ${formatOccupancyDuration(globalSummary.averageOccupiedSeconds)}.`,
              globalSummary?.averageFreeSeconds == null
                ? "Tempo médio livre indisponível."
                : `Tempo médio livre: ${formatOccupancyDuration(globalSummary.averageFreeSeconds)}.`,
              globalSummary?.coverage == null
                ? "Cobertura indisponível."
                : `Cobertura: ${formatDecimal(globalSummary.coverage * 100, 1)}%.`,
              `Composição: ${composition.fullLabel}.`,
              stats.errorCount
                ? `${stats.errorCount} cenário(s) sem dados válidos.`
                : undefined,
              ...stats.warnings,
            ) ?? "Resumo médio de ocupação.",
          label: `${CARD_LABELS[cardId]} · Ocupação média`,
          value:
            globalSummary?.averageOccupancy == null
              ? "—"
              : formatDecimal(globalSummary.averageOccupancy, 2),
        },
      }];
    }
    const definition = durationMetricDefinition(kind, stats);
    return [{
      cardId,
      metric: {
        description:
          joinMessages(
            definition.description,
            `Composição: ${composition.fullLabel}.`,
            stats.errorCount
              ? `${stats.errorCount} cenário(s) sem dados válidos.`
              : undefined,
            ...stats.warnings,
          ) ?? definition.description,
        label: CARD_LABELS[cardId],
        value: definition.value,
      },
    }];
  });
}

function buildDurationReportAssets({
  inheritedScenarios,
  monitorMode,
  preferenceByCardId,
  range,
  resolveSelectedIndividualDwellSeries,
  resolveSelectedSeries,
  scenarioOptions,
  timeZone,
  timeZoneWarning,
}: {
  inheritedScenarios: DurationScenario[];
  monitorMode: boolean;
  preferenceByCardId: Map<string, CardPreference>;
  range: OccupancyDurationMinuteRange | null;
  resolveSelectedIndividualDwellSeries: (
    selection: CardScenarioSelection,
  ) => OccupancyIndividualDwellScenarioSeries[];
  resolveSelectedSeries: (
    selection: CardScenarioSelection,
  ) => OccupancyDurationScenarioSeries[];
  scenarioOptions: DurationScenario[];
  timeZone: string;
  timeZoneWarning?: string;
}): OccupancyDurationReportAsset[] {
  const timelinePreference = preferenceByCardId.get(
    "occupancy_duration_timeline",
  );
  const comparisonPreference = preferenceByCardId.get(
    "occupancy_duration_by_scenario",
  );
  const averageByScenarioPreference = preferenceByCardId.get(
    "occupancy_duration_average_by_scenario",
  );
  const timelineSelection = scenarioSelectionFromPreference(
    timelinePreference,
  );
  const comparisonSelection = scenarioSelectionFromPreference(
    comparisonPreference,
  );
  const averageByScenarioSelection = scenarioSelectionFromPreference(
    averageByScenarioPreference,
  );
  const timelineSeries = orderedSelectedSeries(
    scenarioOptions,
    timelineSelection,
    inheritedScenarios,
    resolveSelectedSeries(timelineSelection),
  );
  const comparisonSeries = orderedSelectedSeries(
    scenarioOptions,
    comparisonSelection,
    inheritedScenarios,
    resolveSelectedSeries(comparisonSelection),
  );
  const averageByScenarioSeries = orderedSelectedSeries(
    scenarioOptions,
    averageByScenarioSelection,
    inheritedScenarios,
    resolveSelectedIndividualDwellSeries(averageByScenarioSelection),
  );
  const timelineComposition = describeDurationScenarioComposition(
    resolveWidgetScenarios(
      scenarioOptions,
      timelineSelection,
      inheritedScenarios,
    ),
  );
  const comparisonComposition = describeDurationScenarioComposition(
    resolveWidgetScenarios(
      scenarioOptions,
      comparisonSelection,
      inheritedScenarios,
    ),
  );
  const averageByScenarioComposition = describeDurationScenarioComposition(
    resolveWidgetScenarios(
      scenarioOptions,
      averageByScenarioSelection,
      inheritedScenarios,
    ),
  );
  const assets: OccupancyDurationReportAsset[] = [];

  if (
    timelinePreference?.visible !== false &&
    range &&
    timelineSeries.length
  ) {
    const chunks = chunkDurationSeries(timelineSeries);
    const visuals = durationStateVisuals(
      "light",
      timelinePreference?.color ?? "#1267C4",
    );
    chunks.forEach((chunk, index) => {
      assets.push({
        cardId: "occupancy_duration_timeline",
        chart: {
          description:
            joinMessages(
              "Visualização minuto a minuto em ocupado ou desocupado; somente no gráfico as transições aparecem como ocupado, enquanto os cálculos conservadores permanecem inalterados. O futuro permanece vazio e intervalos sem cobertura continuam identificados.",
              `Composição: ${timelineComposition.fullLabel}.`,
              chunks.length > 1
                ? `Cenários ${index * MAX_REPORT_SCENARIOS_PER_CHART + 1}–${
                    index * MAX_REPORT_SCENARIOS_PER_CHART + chunk.length
                  } de ${timelineSeries.length}.`
                : undefined,
              timeZoneWarning,
            ) ??
            "Visualização minuto a minuto em ocupado ou desocupado; somente no gráfico as transições aparecem como ocupado, enquanto os cálculos conservadores permanecem inalterados. O futuro permanece vazio e intervalos sem cobertura continuam identificados.",
          option: buildOccupancyDurationTimelineOption({
            interactive: false,
            monitorMode,
            range,
            series: chunk,
            theme: "light",
            timeZone,
            visuals,
          }),
          table: buildDurationSummaryReportTable(
            chunk,
            "Resumo numérico da linha do tempo de ocupação",
            "A linha do tempo visual preserva todos os intervalos.",
          ),
          title: CARD_LABELS.occupancy_duration_timeline,
        },
        ...(chunks.length > 1
          ? { titleSuffix: ` · ${index + 1}/${chunks.length}` }
          : {}),
      });
    });
  }

  if (comparisonPreference?.visible !== false && comparisonSeries.length) {
    const chunks = chunkDurationSeries(comparisonSeries);
    const visuals = durationStateVisuals(
      "light",
      comparisonPreference?.color ?? "#1267C4",
    );
    chunks.forEach((chunk, index) => {
      assets.push({
        cardId: "occupancy_duration_by_scenario",
        chart: {
          description: joinMessages(
            "Comparação do tempo observado e da ausência de cobertura entre os cenários selecionados.",
            `Composição: ${comparisonComposition.fullLabel}.`,
            chunks.length > 1
              ? `Cenários ${index * MAX_REPORT_SCENARIOS_PER_CHART + 1}–${
                  index * MAX_REPORT_SCENARIOS_PER_CHART + chunk.length
                } de ${comparisonSeries.length}.`
              : undefined,
          ),
          option: buildOccupancyDurationByScenarioOption({
            interactive: false,
            monitorMode,
            series: chunk,
            theme: "light",
            visuals,
          }),
          table: buildDurationSummaryReportTable(
            chunk,
            "Tempo de ocupação por cenário",
            "Consolidação exata dos minutos fechados apresentados nas barras.",
          ),
          title: CARD_LABELS.occupancy_duration_by_scenario,
        },
        ...(chunks.length > 1
          ? { titleSuffix: ` · ${index + 1}/${chunks.length}` }
          : {}),
      });
    });
  }

  if (
    averageByScenarioPreference?.visible !== false &&
    averageByScenarioSeries.length
  ) {
    const entries = buildOccupancyDurationAverageByScenarioEntries(
      averageByScenarioSeries,
    );
    const chunks = chunkDurationSeries(entries);
    chunks.forEach((chunk, index) => {
      assets.push({
        cardId: "occupancy_duration_average_by_scenario",
        chart: {
          description: joinMessages(
            "Ranking da permanência individual real das sessões concluídas, com média, menor duração, maior duração e total de sessões por cenário.",
            `Composição: ${averageByScenarioComposition.fullLabel}.`,
            chunks.length > 1
              ? `Cenários ${index * MAX_REPORT_SCENARIOS_PER_CHART + 1}–${
                  index * MAX_REPORT_SCENARIOS_PER_CHART + chunk.length
                } de ${entries.length}.`
              : undefined,
            joinMessages(
              ...averageByScenarioSeries.map((item) =>
                item.individualDwell.error
                  ? `${item.name}: ${item.individualDwell.error}`
                  : undefined,
              ),
            ),
            timeZoneWarning,
          ),
          option: buildOccupancyDurationAverageByScenarioOption({
            entries: chunk,
            interactive: false,
            monitorMode,
            theme: "light",
            widgetColor:
              averageByScenarioPreference?.color ?? "#0F766E",
          }),
          table: buildDurationAverageByScenarioReportTable(chunk),
          title: CARD_LABELS.occupancy_duration_average_by_scenario,
        },
        ...(chunks.length > 1
          ? { titleSuffix: ` · ${index + 1}/${chunks.length}` }
          : {}),
      });
    });
  }

  return assets;
}

function buildDurationAverageByScenarioReportTable(
  entries: OccupancyDurationAverageByScenarioEntry[],
) {
  return {
    columns: [
      { key: "scenario", label: "Cenário", width: 26 },
      {
        key: "averageDurationSeconds",
        label: "Permanência média (s)",
        numeric: true,
        width: 18,
      },
      {
        key: "minimumDurationSeconds",
        label: "Menor permanência (s)",
        numeric: true,
        width: 18,
      },
      {
        key: "maximumDurationSeconds",
        label: "Maior permanência (s)",
        numeric: true,
        width: 18,
      },
      {
        key: "sessionCount",
        label: "Sessões concluídas",
        numeric: true,
        width: 17,
      },
      { key: "status", label: "Situação", width: 20 },
    ],
    description:
      "Valores auditáveis das sessões individuais concluídas retornadas pelo resumo de permanência. Ausência de sessões preserva as durações sem valor e não inventa zero.",
    rows: entries.map((entry) => ({
      averageDurationSeconds: roundLoiteringSeconds(
        entry.averageDurationSeconds,
      ),
      maximumDurationSeconds: roundLoiteringSeconds(
        entry.maximumDurationSeconds,
      ),
      minimumDurationSeconds: roundLoiteringSeconds(
        entry.minimumDurationSeconds,
      ),
      scenario: entry.name,
      sessionCount: entry.sessionCount,
      status: durationAverageEntryStatus(entry),
    })),
    title: CARD_LABELS.occupancy_duration_average_by_scenario,
  };
}

function roundLoiteringSeconds(value: number | null) {
  return value === null ? null : Number(value.toFixed(2));
}

function buildDurationSummaryReportTable(
  series: OccupancyDurationScenarioSeries[],
  title: string,
  detail: string,
) {
  const intervalCount = series.reduce(
    (total, scenario) => total + scenario.summary.segments.length,
    0,
  );
  return {
    columns: [
      { key: "scenario", label: "Cenário", width: 24 },
      { key: "occupied", label: "Ocupado (min)", numeric: true, width: 14 },
      { key: "longest", label: "Maior sequência (min)", numeric: true, width: 16 },
      { key: "averageOccupied", label: "Média ocupado (min)", numeric: true, width: 16 },
      { key: "averageFree", label: "Média desocupado (min)", numeric: true, width: 17 },
      { key: "individualDwellAverage", label: "Permanência média (s)", numeric: true, width: 17 },
      { key: "individualDwellSessions", label: "Sessões concluídas", numeric: true, width: 15 },
      { key: "occupiedRate", label: "Tempo ocupado (%)", numeric: true, width: 15 },
      { key: "stateChanges", label: "Mudanças mín.", numeric: true, width: 13 },
      { key: "transition", label: "Transição (min)", numeric: true, width: 14 },
      { key: "free", label: "Livre (min)", numeric: true, width: 13 },
      { key: "unknown", label: "Sem dados (min)", numeric: true, width: 14 },
      { key: "observed", label: "Observados (min)", numeric: true, width: 14 },
      { key: "expected", label: "Esperados (min)", numeric: true, width: 14 },
      { key: "coverage", label: "Cobertura (%)", numeric: true, width: 13 },
      { key: "load", label: "Carga (unid·h)", numeric: true, width: 15 },
    ],
    description: `${detail} ${intervalCount.toLocaleString(
      "pt-BR",
    )} intervalo(s) foram resumidos em ${series.length.toLocaleString(
      "pt-BR",
    )} linha(s), sem truncar os totais. Permanência média considera sessões concluídas e é separada da média dos estados ocupado/desocupado.`,
    rows: series.map((scenario) => {
      const state = deriveOccupancyStateMetrics(scenario.summary);
      const dwellTotals = scenario.individualDwell?.totals;
      return {
        averageFree:
          state.averageConfirmedFreeSequenceSeconds === null
            ? null
            : Number(
                (state.averageConfirmedFreeSequenceSeconds / 60).toFixed(4),
              ),
        averageOccupied:
          state.averageConfirmedOccupiedSequenceSeconds === null
            ? null
            : Number(
                (
                  state.averageConfirmedOccupiedSequenceSeconds / 60
                ).toFixed(4),
              ),
        coverage:
          scenario.summary.expectedSeconds > 0
            ? Number(
                (
                  (scenario.summary.observedSeconds /
                    scenario.summary.expectedSeconds) *
                  100
                ).toFixed(4),
              )
            : null,
        expected: scenario.summary.expectedSeconds / 60,
        free: scenario.summary.confirmedFreeSeconds / 60,
        individualDwellAverage:
          dwellTotals && dwellTotals.sessionCount > 0
            ? Number((dwellTotals.avgDurationSeconds ?? 0).toFixed(4))
            : null,
        individualDwellSessions: dwellTotals?.sessionCount ?? null,
        load: Number(
          (scenario.summary.loadUnitSeconds / HOUR_SECONDS).toFixed(6),
        ),
        longest: scenario.summary.longestConfirmedOccupiedSeconds / 60,
        observed: scenario.summary.observedSeconds / 60,
        occupied: scenario.summary.confirmedOccupiedSeconds / 60,
        occupiedRate:
          state.occupiedShareOfConfirmed === null
            ? null
            : Number((state.occupiedShareOfConfirmed * 100).toFixed(4)),
        scenario: scenario.name,
        stateChanges: state.minimumDetectedTransitions,
        transition: scenario.summary.transitionSeconds / 60,
        unknown: scenario.summary.unknownSeconds / 60,
      };
    }),
    title,
  };
}

function chunkDurationSeries<T>(series: T[]) {
  const chunks: T[][] = [];
  for (
    let index = 0;
    index < series.length;
    index += MAX_REPORT_SCENARIOS_PER_CHART
  ) {
    chunks.push(series.slice(index, index + MAX_REPORT_SCENARIOS_PER_CHART));
  }
  return chunks;
}

function orderedSelectedSeries<T extends { scenarioId: string }>(
  scenarios: DurationScenario[],
  selection: CardScenarioSelection,
  inheritedScenarios: DurationScenario[],
  series: T[],
) {
  const order = new Map(
    resolveWidgetScenarios(scenarios, selection, inheritedScenarios).map(
      (scenario, index) => [scenario.id, index],
    ),
  );
  return [...series].sort(
    (left, right) =>
      (order.get(left.scenarioId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.scenarioId) ?? Number.MAX_SAFE_INTEGER),
  );
}

function summarizeSelectedSeries(
  series: OccupancyDurationScenarioSeries[],
  selectedScenarioCount = series.length,
): DurationSelectionStats {
  const totals: DurationSelectionStats = {
    confirmedFreeSeconds: 0,
    confirmedFreeSequenceCount: 0,
    confirmedOccupiedSeconds: 0,
    confirmedOccupiedSequenceCount: 0,
    errorCount: 0,
    expectedSeconds: 0,
    loadUnitSeconds: 0,
    longestConfirmedOccupiedSeconds: 0,
    minimumDetectedTransitions: 0,
    observedSeconds: 0,
    scenarioCount: selectedScenarioCount,
    successfulScenarioCount: 0,
    transitionSeconds: 0,
    unknownSeconds: 0,
    warnings: [],
  };
  series.forEach((scenario) => {
    const state = deriveOccupancyStateMetrics(scenario.summary);
    totals.confirmedFreeSeconds += scenario.summary.confirmedFreeSeconds;
    totals.confirmedFreeSequenceCount += state.confirmedFreeSequenceCount;
    totals.confirmedOccupiedSeconds +=
      scenario.summary.confirmedOccupiedSeconds;
    totals.confirmedOccupiedSequenceCount +=
      state.confirmedOccupiedSequenceCount;
    totals.expectedSeconds += scenario.summary.expectedSeconds;
    totals.loadUnitSeconds += scenario.summary.loadUnitSeconds;
    totals.longestConfirmedOccupiedSeconds = Math.max(
      totals.longestConfirmedOccupiedSeconds,
      scenario.summary.longestConfirmedOccupiedSeconds,
    );
    totals.minimumDetectedTransitions += state.minimumDetectedTransitions;
    totals.observedSeconds += scenario.summary.observedSeconds;
    totals.transitionSeconds += scenario.summary.transitionSeconds;
    totals.unknownSeconds += scenario.summary.unknownSeconds;
    if (scenario.error) totals.errorCount += 1;
    else totals.successfulScenarioCount += 1;
    const visibleWarning = occupancyAggregatePresentationWarning(
      scenario.warning,
    );
    if (visibleWarning) totals.warnings.push(visibleWarning);
  });
  return totals;
}

function durationAverageSummary(
  stats: DurationSelectionStats,
): DurationAverageSummary {
  return {
    averageFreeSeconds:
      stats.confirmedFreeSequenceCount > 0
        ? stats.confirmedFreeSeconds / stats.confirmedFreeSequenceCount
        : null,
    // The denominator is scenario-time rather than wall-clock time. This
    // remains mathematically valid when selected scenarios have different
    // coverage and avoids presenting an inferred simultaneous total.
    averageOccupancy:
      stats.observedSeconds > 0
        ? stats.loadUnitSeconds / stats.observedSeconds
        : null,
    averageOccupiedSeconds:
      stats.confirmedOccupiedSequenceCount > 0
        ? stats.confirmedOccupiedSeconds /
          stats.confirmedOccupiedSequenceCount
        : null,
    coverage:
      stats.successfulScenarioCount > 0 && stats.expectedSeconds > 0
        ? stats.observedSeconds / stats.expectedSeconds
        : null,
  };
}

function buildDurationAverageComparisonRows(
  selectedScenarios: DurationScenario[],
  selectedSeries: OccupancyDurationScenarioSeries[],
): DurationAverageComparisonRow[] {
  const selectedIds = new Set(
    selectedScenarios.map((scenario) => scenario.id),
  );
  const seriesByScenarioId = new Map(
    selectedSeries
      .filter((series) => selectedIds.has(series.scenarioId))
      .map((series) => [series.scenarioId, series]),
  );
  const scopedSeries = selectedScenarios.flatMap((scenario) => {
    const series = seriesByScenarioId.get(scenario.id);
    return series ? [series] : [];
  });
  const scenarioCount = selectedScenarios.length;
  const globalLabel = scenarioCount === 1
    ? "Média global · 1 cenário"
    : `Média global · ${scenarioCount} cenários`;
  const scenarioRows: DurationAverageComparisonRow[] = selectedScenarios.map(
    (scenario) => {
      const series = seriesByScenarioId.get(scenario.id);
      return {
        kind: "scenario",
        label: scenario.name,
        scenarioId: scenario.id,
        summary: durationAverageSummary(
          summarizeSelectedSeries(series ? [series] : [], 1),
        ),
      };
    },
  );
  const globalSummary = durationAverageSummary(
    summarizeSelectedSeries(scopedSeries, scenarioCount),
  );
  const availableAverageOccupancies = scenarioRows.flatMap((row) =>
    row.summary.averageOccupancy === null
      ? []
      : [row.summary.averageOccupancy],
  );

  return [
    {
      kind: "global",
      label: globalLabel,
      summary: {
        ...globalSummary,
        // The global occupancy is the arithmetic mean of the selected
        // scenarios that actually have a certified value. A scenario without
        // coverage must not become an artificial zero or enter the divisor.
        // Durations and coverage keep their weighted semantics from the
        // certified series instead of averaging averages.
        averageOccupancy: availableAverageOccupancies.length
          ? availableAverageOccupancies.reduce(
              (total, value) => total + value,
              0,
            ) / availableAverageOccupancies.length
          : null,
      },
    },
    ...scenarioRows,
  ];
}

function durationMetricDefinition(
  kind: DurationMetricKind,
  stats: DurationSelectionStats,
) {
  const hasObservedData = stats.observedSeconds > 0;
  if (kind === "confirmed") {
    return {
      color: "#1267C4",
      description:
        "Hoje: tempo mínimo confirmado; transições e ausência de dados não entram na soma.",
      icon: Clock3,
      value: hasObservedData
        ? formatOccupancyDuration(stats.confirmedOccupiedSeconds)
        : "—",
    };
  }
  if (kind === "free") {
    return {
      color: "#16A34A",
      description:
        "Hoje: tempo mínimo confirmado sem ocupação; transições e ausência de dados não entram na soma.",
      icon: CircleOff,
      value: hasObservedData
        ? formatOccupancyDuration(stats.confirmedFreeSeconds)
        : "—",
    };
  }
  if (kind === "average") {
    const averageOccupied = stats.confirmedOccupiedSequenceCount > 0
      ? stats.confirmedOccupiedSeconds /
        stats.confirmedOccupiedSequenceCount
      : null;
    const averageFree = stats.confirmedFreeSequenceCount > 0
      ? stats.confirmedFreeSeconds / stats.confirmedFreeSequenceCount
      : null;
    return {
      color: "#0F766E",
      description: joinMessages(
        "Hoje: média das sequências continuamente ocupadas; não representa permanência individual.",
        averageFree === null
          ? "Nenhum período desocupado foi confirmado."
          : `Média dos períodos desocupados: ${formatOccupancyDuration(
              averageFree,
            )}.`,
      ) ?? "Média das sequências continuamente ocupadas.",
      icon: Timer,
      value:
        averageOccupied === null
          ? "—"
          : formatOccupancyDuration(averageOccupied),
    };
  }
  if (kind === "rate") {
    const confirmedSeconds =
      stats.confirmedOccupiedSeconds + stats.confirmedFreeSeconds;
    return {
      color: "#2563EB",
      description:
        "Hoje: participação ocupada somente no tempo com estado confirmado; minutos mistos e sem dados ficam fora da base.",
      icon: Percent,
      value:
        confirmedSeconds > 0
          ? `${formatDecimal(
              (stats.confirmedOccupiedSeconds / confirmedSeconds) * 100,
              1,
            )}%`
          : "—",
    };
  }
  if (kind === "transitions") {
    return {
      color: "#D97706",
      description:
        "Hoje: piso conservador de mudanças ocupado/desocupado; cada minuto misto representa ao menos uma mudança.",
      icon: RefreshCw,
      value: hasObservedData
        ? formatDecimal(stats.minimumDetectedTransitions, 0)
        : "—",
    };
  }
  if (kind === "longest") {
    return {
      color: "#0F766E",
      description:
        "Hoje: maior sequência confirmada em um cenário; simultâneos não são unidos.",
      icon: Activity,
      value: hasObservedData
        ? formatOccupancyDuration(stats.longestConfirmedOccupiedSeconds)
        : "—",
    };
  }
  if (kind === "load") {
    return {
      color: "#7C3AED",
      description:
        "Hoje: integral da ocupação média em unidades-hora; não é permanência individual.",
      icon: Gauge,
      value: hasObservedData
        ? `${formatDecimal(stats.loadUnitSeconds / HOUR_SECONDS, 2)} unid·h`
        : "—",
    };
  }
  return {
    color: "#16A34A",
    description:
      "Hoje: minutos com dados sobre todos os minutos encerrados esperados.",
    icon: ShieldCheck,
    value:
      stats.successfulScenarioCount > 0 && stats.expectedSeconds > 0
        ? formatCoverageFromStats(stats)
        : "—",
  };
}

function scenarioSelectionFromPreference(
  preference: CardPreference | undefined,
): CardScenarioSelection {
  const mode = preference?.scenarioSelectionMode ?? "inherit";
  return {
    mode,
    scenarioOrder: preference?.scenarioOrder ?? [],
    scenarioIds: mode === "custom" ? preference?.scenarioIds ?? [] : [],
  };
}

function durationStateVisuals(
  theme: "dark" | "light",
  occupiedColor: string,
): Record<OccupancyDurationState, DurationStateVisual> {
  if (theme === "dark") {
    return {
      free: {
        border: "#34D399",
        color: "#047857",
        label: "Livre confirmado",
        text: "#ECFDF5",
      },
      occupied: {
        border: "#93C5FD",
        color: occupiedColor,
        label: "Ocupado confirmado",
        text: readableDurationTextColor(occupiedColor),
      },
      transition: {
        border: "#FCD34D",
        color: "#B45309",
        label: "Transição",
        text: "#FFFBEB",
      },
      unknown: {
        border: "#94A3B8",
        color: "#475569",
        label: "Sem dados",
        text: "#F8FAFC",
      },
    };
  }
  return {
    free: {
      border: "#15803D",
      color: "#22C55E",
      label: "Livre confirmado",
      text: "#052E16",
    },
    occupied: {
      border: "#0B4A82",
      color: occupiedColor,
      label: "Ocupado confirmado",
      text: readableDurationTextColor(occupiedColor),
    },
    transition: {
      border: "#B45309",
      color: "#F59E0B",
      label: "Transição",
      text: "#451A03",
    },
    unknown: {
      border: "#64748B",
      color: "#CBD5E1",
      label: "Sem dados",
      text: "#0F172A",
    },
  };
}

function emptyDurationChartOption(
  theme: "dark" | "light",
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  return {
    grid: { bottom: 20, left: 20, right: 20, top: 20 },
    series: [],
    xAxis: {
      axisLine: { lineStyle: { color: palette.axisLine } },
      show: false,
      type: "value",
    },
    yAxis: {
      axisLine: { lineStyle: { color: palette.axisLine } },
      show: false,
      type: "value",
    },
  };
}

function occupancyDurationAggregatePath(
  scenarioId: string,
  from: Date,
  to: Date,
  granularity: DurationAggregateGranularity,
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(from, granularity),
    granularity,
    to: aggregateQueryIso(to, granularity),
  });
  return `/occupancy/scenarios/${encodeURIComponent(
    scenarioId,
  )}/aggregate?${params.toString()}`;
}

type CompleteDurationAggregate = {
  asOf: Date | null;
  metadataWarnings: string[];
  totals: Map<number, OccupancyAggregateMetric>;
};

type DurationAggregateGranularity = "hour" | "minute";

async function fetchCompleteDurationAggregate({
  buckets,
  cacheTtlMs,
  companyScopeId,
  scenarioId,
  signal,
  timeZone,
}: {
  buckets: readonly Date[];
  cacheTtlMs: number;
  companyScopeId: string;
  scenarioId: string;
  signal: AbortSignal;
  timeZone: string;
}): Promise<CompleteDurationAggregate> {
  if (buckets.length === 0) {
    return { asOf: null, metadataWarnings: [], totals: new Map() };
  }

  const coarsePlan = planOccupancyDurationCoarseQuery(buckets);
  const hourlyAggregate = coarsePlan.hourlyBuckets.length
    ? await fetchDurationAggregatePartition({
        buckets: coarsePlan.hourlyBuckets,
        cacheTtlMs,
        companyScopeId,
        granularity: "hour",
        scenarioId,
        signal,
        splitDepth: 0,
        timeZone,
      })
    : null;
  signal.throwIfAborted();

  const refinementPlan = resolveOccupancyDurationHourlyPlan({
    buckets,
    hourlyMetrics: hourlyAggregate?.totals ?? new Map(),
  });
  // `resolveOccupancyDurationHourlyPlan` already contains both partial-hour
  // edges and the complete hours proven to be mixed. Group that final set only
  // once: an edge adjacent to a mixed hour then becomes part of the same API
  // interval instead of producing two overlapping network round trips.
  const refinementMinuteGroups = groupContiguousOccupancyDurationBuckets(
    refinementPlan.minuteBuckets,
  );
  const minuteAggregates = await Promise.all(
    refinementMinuteGroups.map((minuteBuckets) =>
      fetchDurationAggregatePartition({
        buckets: minuteBuckets,
        cacheTtlMs,
        companyScopeId,
        granularity: "minute",
        scenarioId,
        signal,
        splitDepth: 0,
        timeZone,
      }),
    ),
  );
  signal.throwIfAborted();

  const totals = new Map(refinementPlan.synthesizedMinuteMetrics);
  minuteAggregates.forEach((aggregate) => {
    aggregate.totals.forEach((metric, bucket) => {
      if (totals.has(bucket)) {
        throw new Error(
          "Não foi possível consolidar a duração porque o mesmo minuto apareceu mais de uma vez.",
        );
      }
      totals.set(bucket, metric);
    });
  });
  const sources = [
    ...(hourlyAggregate ? [hourlyAggregate] : []),
    ...minuteAggregates,
  ];
  return {
    asOf:
      sources.length > 0 && sources.every((source) => source.asOf)
        ? earliestDate(...sources.map((source) => source.asOf))
        : null,
    metadataWarnings: Array.from(
      new Set(sources.flatMap((source) => source.metadataWarnings)),
    ),
    totals,
  };
}

async function fetchDurationAggregatePartition({
  buckets,
  cacheTtlMs,
  companyScopeId,
  granularity,
  scenarioId,
  signal,
  splitDepth,
  timeZone,
}: {
  buckets: readonly Date[];
  cacheTtlMs: number;
  companyScopeId: string;
  granularity: DurationAggregateGranularity;
  scenarioId: string;
  signal: AbortSignal;
  splitDepth: number;
  timeZone: string;
}): Promise<CompleteDurationAggregate> {
  signal.throwIfAborted();
  const from = buckets[0];
  const bucketSizeMs = granularity === "hour" ? HOUR_MS : MINUTE_MS;
  const to = new Date(buckets.at(-1)!.getTime() + bucketSizeMs);
  const response = await fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
    cacheTtlMs,
    companyScopeId,
    path: occupancyDurationAggregatePath(
      scenarioId,
      from,
      to,
      granularity,
    ),
    priority: "background",
    scenarioId,
    signal,
    timeZone,
  });
  signal.throwIfAborted();

  if (
    Array.isArray(response?.data) &&
    response.data.length >= AGGREGATE_RESPONSE_ROW_CEILING
  ) {
    if (
      buckets.length < 2 ||
      splitDepth >= MAX_COMPLETENESS_SPLIT_DEPTH
    ) {
      throw new Error(
        "Há dados demais em um único intervalo para calcular a duração com segurança. Refine a seleção.",
      );
    }

    const midpoint = Math.floor(buckets.length / 2);
    // Split branches may run together: the shared occupancy broker remains the
    // single global concurrency limiter and avoids serial row-cap backfills.
    const [left, right] = await Promise.all([
      fetchDurationAggregatePartition({
        buckets: buckets.slice(0, midpoint),
        cacheTtlMs,
        companyScopeId,
        granularity,
        scenarioId,
        signal,
        splitDepth: splitDepth + 1,
        timeZone,
      }),
      fetchDurationAggregatePartition({
        buckets: buckets.slice(midpoint),
        cacheTtlMs,
        companyScopeId,
        granularity,
        scenarioId,
        signal,
        splitDepth: splitDepth + 1,
        timeZone,
      }),
    ]);
    const totals = new Map(left.totals);
    right.totals.forEach((metric, bucket) => {
      if (totals.has(bucket)) {
        throw new Error(
          "Não foi possível consolidar a duração porque o mesmo minuto apareceu mais de uma vez.",
        );
      }
      totals.set(bucket, metric);
    });
    return {
      asOf:
        left.asOf && right.asOf
          ? earliestDate(left.asOf, right.asOf)
          : null,
      metadataWarnings: Array.from(
        new Set([...left.metadataWarnings, ...right.metadataWarnings]),
      ),
      totals,
    };
  }

  const validationOptions = {
    allowDocumentedAggregateResponse: true,
    expectedTimezone: timeZone,
    requireCertification: true,
  } as const;
  const rows = requireOccupancyAggregateRows(
    response,
    granularity,
    scenarioId,
    timeZone,
    validationOptions,
  );
  const coverage = aggregateOccupancyRowsForRequestedBuckets(
    rows,
    granularity,
    buckets,
    validationOptions,
  );
  const metadataWarning = occupancyAggregateMetadataWarning(
    response,
    granularity,
  );
  return {
    asOf:
      typeof response.as_of === "string" && response.as_of.trim()
        ? new Date(response.as_of)
        : null,
    metadataWarnings: metadataWarning ? [metadataWarning] : [],
    totals: coverage.totals,
  };
}

function earliestDate(...values: Array<Date | null | undefined>) {
  const dates = values.filter(
    (value): value is Date =>
      value instanceof Date && Number.isFinite(value.getTime()),
  );
  return dates.length
    ? new Date(Math.min(...dates.map((value) => value.getTime())))
    : null;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, index: number) => void,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const result = await mapper(items[index], index);
        results[index] = result;
        onResult?.(result, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function occupancyDurationScenarioRefreshIsDue(
  cached: OccupancyDurationScenarioCache | undefined,
  failure: OccupancyDurationFailureBackoff | undefined,
  range: OccupancyDurationMinuteRange,
) {
  const now = range.requestedAt.getTime();
  if (failure && now < failure.retryAt) return false;
  if (
    !cached ||
    cached.from !== range.from.getTime() ||
    cached.to > range.to.getTime()
  ) {
    return true;
  }
  if (
    now < cached.lastFullRefreshAt ||
    now - cached.lastFullRefreshAt >= DURATION_FULL_REFRESH_MS ||
    cached.to < range.to.getTime()
  ) {
    return true;
  }
  return false;
}

function normalizeRefreshMilliseconds(value: number) {
  return Number.isFinite(value) && value > 0
    ? Math.max(1_000, Math.floor(value))
    : DEFAULT_AGGREGATE_REFRESH_MS;
}

function createOccupancyDurationScenarioCacheScope(): OccupancyDurationScenarioCacheScope {
  return {
    failures: new Map(),
    lastUsedAt: Date.now(),
    scenarios: new Map(),
  };
}

function acquireOccupancyDurationScenarioCache({
  companyScopeId,
  timeZone,
  userId,
}: {
  companyScopeId: string;
  timeZone: string;
  userId: string;
}) {
  const normalizedUserId = userId.trim();
  const normalizedCompanyId = companyScopeId.trim();
  const normalizedTimeZone = timeZone.trim();
  // An absent JWT identity must never become a cache shared by two sessions.
  if (!normalizedUserId || !normalizedCompanyId || !normalizedTimeZone) {
    return null;
  }
  const now = Date.now();
  for (const [key, cached] of sharedDurationScenarioCaches) {
    if (
      now >= cached.lastUsedAt &&
      now - cached.lastUsedAt > DURATION_CACHE_IDLE_TTL_MS
    ) {
      sharedDurationScenarioCaches.delete(key);
    }
  }
  const key = JSON.stringify([
    normalizedUserId,
    normalizedCompanyId,
    normalizedTimeZone,
  ]);
  const existing = sharedDurationScenarioCaches.get(key);
  if (existing) {
    existing.lastUsedAt = now;
    sharedDurationScenarioCaches.delete(key);
    sharedDurationScenarioCaches.set(key, existing);
    return existing;
  }
  const created = createOccupancyDurationScenarioCacheScope();
  sharedDurationScenarioCaches.set(key, created);
  while (sharedDurationScenarioCaches.size > MAX_DURATION_CACHE_SCOPES) {
    const oldestKey = sharedDurationScenarioCaches.keys().next().value;
    if (typeof oldestKey !== "string") break;
    sharedDurationScenarioCaches.delete(oldestKey);
  }
  return created;
}

function touchOccupancyDurationScenarioCache(
  cache: Map<string, OccupancyDurationScenarioCache>,
  scenarioId: string,
  value: OccupancyDurationScenarioCache,
) {
  cache.delete(scenarioId);
  cache.set(scenarioId, value);
  while (cache.size > MAX_DURATION_SCENARIOS_PER_SCOPE) {
    const oldestScenarioId = cache.keys().next().value;
    if (typeof oldestScenarioId !== "string") break;
    cache.delete(oldestScenarioId);
  }
}

function durationFailureBackoffMilliseconds(
  attempts: number,
  refreshMs: number,
) {
  return Math.min(
    DURATION_FAILURE_MAX_BACKOFF_MS,
    Math.max(DEFAULT_AGGREGATE_REFRESH_MS, refreshMs) *
      2 ** Math.max(0, Math.min(4, attempts - 1)),
  );
}

function touchOccupancyDurationFailureBackoff(
  failures: Map<string, OccupancyDurationFailureBackoff>,
  scenarioId: string,
  value: OccupancyDurationFailureBackoff,
) {
  failures.delete(scenarioId);
  failures.set(scenarioId, value);
  while (failures.size > MAX_DURATION_SCENARIOS_PER_SCOPE) {
    const oldestScenarioId = failures.keys().next().value;
    if (typeof oldestScenarioId !== "string") break;
    failures.delete(oldestScenarioId);
  }
}

function durationRequestError(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}

function selectedSeriesErrors(series: OccupancyDurationScenarioSeries[]) {
  const errors = series.flatMap((item) => (item.error ? [item.error] : []));
  if (!errors.length) return undefined;
  const unique = Array.from(new Set(errors));
  return unique.length === 1
    ? unique[0]
    : `${unique[0]} · mais ${unique.length - 1} falha(s).`;
}

function selectedSeriesWarnings(series: OccupancyDurationScenarioSeries[]) {
  return occupancyAggregatePresentationWarning(
    joinMessages(...series.map((item) => item.warning)),
  );
}

function joinMessages(...messages: Array<string | undefined>) {
  const unique = Array.from(
    new Set(messages.map((message) => message?.trim()).filter(Boolean)),
  );
  return unique.length ? unique.join(" · ") : undefined;
}

function describeDurationScenarioComposition(
  scenarios: readonly DurationScenario[],
) {
  const names = Array.from(
    new Set(
      scenarios.map((scenario) => scenario.name.trim()).filter(Boolean),
    ),
  );
  if (!names.length) {
    return {
      fullLabel: "Nenhum cenário selecionado",
      shortLabel: "Nenhum cenário selecionado",
    };
  }
  const fullLabel = names.join(" + ");
  return {
    fullLabel,
    shortLabel:
      names.length <= 3
        ? fullLabel
        : `${names.slice(0, 3).join(", ")} +${names.length - 3}`,
  };
}

function formatCoverage(summary: OccupancyDurationSummary) {
  return summary.expectedSeconds > 0
    ? `${formatDecimal(
        (summary.observedSeconds / summary.expectedSeconds) * 100,
        1,
      )}%`
    : "—";
}

function formatCoverageFromStats(stats: DurationSelectionStats) {
  return stats.expectedSeconds > 0
    ? `${formatDecimal(
        (stats.observedSeconds / stats.expectedSeconds) * 100,
        1,
      )}%`
    : "—";
}

function formatDecimal(value: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function zonedTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  });
}

function truncateLabel(value: string, maximumLength: number) {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, Math.max(1, maximumLength - 1))}…`;
}

function readableDurationTextColor(backgroundColor: string) {
  if (!/^#[0-9a-f]{6}$/i.test(backgroundColor)) return "#F8FAFC";
  const channels = [1, 3, 5].map((offset) => {
    const channel =
      Number.parseInt(backgroundColor.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const contrastWithDark = (luminance + 0.05) / (0.009 + 0.05);
  const contrastWithLight = (1.0 + 0.05) / (luminance + 0.05);
  return contrastWithDark >= contrastWithLight ? "#111827" : "#F8FAFC";
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
