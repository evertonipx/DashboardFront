"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Gauge,
  ShieldCheck,
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
import { aggregateQueryIso } from "@/lib/aggregate-time";
import { apiFetch } from "@/lib/api";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  occupancyAggregateCoverageWarning,
  occupancyAggregateMetadataWarning,
  requireOccupancyAggregateRows,
  type OccupancyAggregateMetric,
} from "@/lib/occupancy-aggregate-validation";
import {
  buildOccupancyClosedDayMinuteRange,
  buildOccupancyDurationSummary,
  formatOccupancyDuration,
  reconcileOccupancyDurationMetrics,
  type OccupancyDurationMinuteRange,
  type OccupancyDurationState,
  type OccupancyDurationSummary,
} from "@/lib/occupancy-duration";
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
  "occupancy_duration_longest",
  "occupancy_duration_load",
  "occupancy_duration_coverage",
  "occupancy_duration_timeline",
  "occupancy_duration_by_scenario",
] as const;

export type OccupancyDurationCardId =
  (typeof OCCUPANCY_DURATION_CARD_IDS)[number];

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
  name: string;
  scenarioId: string;
  summary: OccupancyDurationSummary;
  warning?: string;
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

type DurationSelectionStats = {
  confirmedFreeSeconds: number;
  confirmedOccupiedSeconds: number;
  errorCount: number;
  expectedSeconds: number;
  loadUnitSeconds: number;
  longestConfirmedOccupiedSeconds: number;
  observedSeconds: number;
  scenarioCount: number;
  successfulScenarioCount: number;
  transitionSeconds: number;
  unknownSeconds: number;
  warnings: string[];
};

type DurationStateVisual = {
  border: string;
  color: string;
  label: string;
  text: string;
};

const DEFAULT_AGGREGATE_REFRESH_MS = 60_000;
const MAX_PARALLEL_REQUESTS = 4;
// The deployed aggregate API can truncate a response at this boundary without
// publishing pagination metadata. A full civil day has up to 1,500 minutes on
// an IANA fallback day and may also contain several rows per bucket, so every
// response that reaches the ceiling is recursively divided before use.
const AGGREGATE_RESPONSE_ROW_CEILING = 1_000;
const MAX_COMPLETENESS_SPLIT_DEPTH = 16;
const DURATION_FULL_REFRESH_MS = 15 * 60_000;
const DURATION_RECONCILIATION_MINUTES = 5;
const MAX_REPORT_SCENARIOS_PER_CHART = 8;
const COMPACT_CHART_HEIGHT_PX = 300;
const MINUTE_MS = 60_000;
const HOUR_SECONDS = 3_600;

const DURATION_STATE_ORDER: readonly OccupancyDurationState[] = [
  "occupied",
  "transition",
  "free",
  "unknown",
];

const CARD_LABELS: Record<OccupancyDurationCardId, string> = {
  occupancy_duration_confirmed: "Tempo ocupado confirmado",
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
  monitorMode,
  preferences,
  scenarios,
  timeZone,
  timeZoneWarning,
}: {
  aggregateRefreshMs?: number;
  companyScopeId: string;
  enabled?: boolean;
  focusScenarioId: string;
  monitorMode: boolean;
  preferences: CardPreference[];
  scenarios: OccupancyScenario[];
  timeZone: string;
  timeZoneWarning?: string;
}) {
  const scenarioOptions = React.useMemo<DurationScenario[]>(
    () =>
      scenarios.flatMap((scenario) =>
        companyScopeId.trim() && scenario.company_id === companyScopeId
          ? [{ id: scenario.id, name: scenario.name }]
          : [],
      ),
    [companyScopeId, scenarios],
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
    OCCUPANCY_DURATION_CARD_IDS.forEach((cardId) => {
      const preference = preferenceByCardId.get(cardId);
      if (preference?.visible === false) return;
      resolveWidgetScenarios(
        scenarioOptions,
        scenarioSelectionFromPreference(preference),
        inheritedScenarios,
      ).forEach((scenario) => requested.set(scenario.id, scenario));
    });
    return Array.from(requested.keys()).sort().join(",");
  }, [enabled, inheritedScenarios, preferenceByCardId, scenarioOptions]);
  // Keep the scenario array referentially stable when only title, color,
  // dimensions or order change. The fetch effect owns the day cache, so a
  // visual edit must not abort it or trigger another full-day request.
  const requestedScenarios = React.useMemo(() => {
    const requestedIds = new Set(
      requestedScenarioKey ? requestedScenarioKey.split(",") : [],
    );
    return scenarioOptions
      .filter((scenario) => requestedIds.has(scenario.id))
      .sort((left, right) => left.id.localeCompare(right.id));
  }, [requestedScenarioKey, scenarioOptions]);
  const scopeKey = `${companyScopeId.trim()}|${timeZone.trim()}|${requestedScenarioKey}`;
  const [dataset, setDataset] = React.useState<OccupancyDurationDataset>({
    loading: false,
    range: null,
    scopeKey: "",
    series: [],
  });

  React.useEffect(() => {
    if (!enabled) {
      setDataset({
        loading: false,
        range: null,
        scopeKey: "",
        series: [],
      });
      return;
    }

    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let generation = 0;
    let lastCompletedRangeEnd = Number.NaN;
    const scenarioCache = new Map<string, OccupancyDurationScenarioCache>();
    const refreshMs = normalizeRefreshMilliseconds(aggregateRefreshMs);

    const scheduleNext = () => {
      if (disposed) return;
      timer = window.setTimeout(load, refreshMs);
    };

    const load = async () => {
      if (disposed) return;

      if (document.visibilityState !== "visible") {
        scheduleNext();
        return;
      }

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

      if (!companyScopeId.trim() || requestedScenarios.length === 0) {
        setDataset({
          loading: false,
          range,
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
        scheduleNext();
        return;
      }

      // Polling may be more frequent than one minute. The aggregate cannot
      // change until another civil minute closes, so avoid identical queries.
      if (range.to.getTime() === lastCompletedRangeEnd) {
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
      setDataset((current) => ({
        ...(current.scopeKey === scopeKey
          ? current
          : { range, scopeKey, series: [] }),
        loading: current.scopeKey !== scopeKey || current.series.length === 0,
      }));

      try {
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
            const needsFullRefresh =
              !cacheMatchesDay ||
              range.requestedAt.getTime() - cached.lastFullRefreshAt >=
                DURATION_FULL_REFRESH_MS;
            const reconciliationFrom = needsFullRefresh
              ? range.from.getTime()
              : Math.max(
                  range.from.getTime(),
                  cached.to - DURATION_RECONCILIATION_MINUTES * MINUTE_MS,
                );
            const requestedBuckets = range.buckets.filter(
              (bucket) => bucket.getTime() >= reconciliationFrom,
            );
            try {
              const aggregate = await fetchCompleteDurationAggregate({
                buckets: requestedBuckets,
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
              scenarioCache.set(scenario.id, nextCache);
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
              const preservedTotals = cacheMatchesDay
                ? cached.totals
                : new Map<number, OccupancyAggregateMetric>();
              return {
                ...(cacheMatchesDay && cached.asOf
                  ? { asOf: cached.asOf }
                  : {}),
                error: durationRequestError(
                  error,
                  "Não foi possível validar a duração deste cenário.",
                ),
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
        );
        if (
          disposed ||
          requestController.signal.aborted ||
          currentGeneration !== generation
        ) {
          return;
        }
        lastCompletedRangeEnd = range.to.getTime();
        setDataset({
          loading: false,
          range,
          scopeKey,
          series,
        });
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
        if (!disposed && currentGeneration === generation) scheduleNext();
      }
    };

    void load();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (controller) {
        abortRequest(
          controller,
          "A consulta de duração foi cancelada porque a visão mudou.",
        );
      }
    };
  }, [
    aggregateRefreshMs,
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
  const selectedSeriesCache = React.useMemo(() => {
    const seriesById = new Map(
      currentDataset.series.map((item) => [item.scenarioId, item]),
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
    currentDataset.series,
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
        currentDataset.series.map((item) => [item.scenarioId, item]),
      );
      return selected.flatMap((scenario) => {
        const item = byId.get(scenario.id);
        return item ? [item] : [];
      });
    }, [
      currentDataset.series,
      inheritedScenarios,
      scenarioOptions,
      selectedSeriesCache,
    ]);
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
    inheritedScenarioIds,
    inheritedScenarioLabel,
    inheritedScenarios,
    monitorMode,
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
  const reportAssets = React.useMemo(
    () =>
      buildDurationReportAssets({
        inheritedScenarios,
        monitorMode,
        preferenceByCardId,
        range: currentDataset.range,
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
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  );

  return {
    cards,
    dataCompleteUntil: durationDataCompleteUntil,
    loading: currentDataset.loading,
    reportAssets,
    reportContext,
    reportMetrics,
    reportWarnings,
  };
}

type DurationMetricKind = "confirmed" | "longest" | "load" | "coverage";

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
  const description = `Hoje, cada faixa representa um minuto fechado; os horários futuros permanecem vazios. Composição: ${composition.shortLabel}.`;
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
      loading={loading}
      option={option}
      textAlternative={
        <DurationScenarioTextAlternative
          chartLabel={CARD_LABELS.occupancy_duration_timeline}
          series={selectedSeries}
        />
      }
      title={CARD_LABELS.occupancy_duration_timeline}
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
  const description = `Hoje por cenário: ocupado confirmado, transição, livre confirmado e sem dados. Composição: ${composition.shortLabel}.`;
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
      loading={loading}
      option={option}
      textAlternative={
        <DurationScenarioTextAlternative
          chartLabel={CARD_LABELS.occupancy_duration_by_scenario}
          series={selectedSeries}
        />
      }
      title={CARD_LABELS.occupancy_duration_by_scenario}
      warning={joinMessages(
        selectedSeriesWarnings(selectedSeries),
      )}
    />
  );
}

function DurationChartCard({
  chartKind,
  description,
  emptyText,
  error,
  hasSelection,
  loading,
  option,
  textAlternative,
  title,
  warning,
}: {
  chartKind: "comparison" | "timeline";
  description: string;
  emptyText: string;
  error?: string;
  hasSelection: boolean;
  loading: boolean;
  option: EnterpriseChartOption;
  textAlternative: React.ReactNode;
  title: string;
  warning?: string;
}) {
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
        {error ? (
          <DurationNotice compact={compact} tone="error">
            {error}
          </DurationNotice>
        ) : warning ? (
          <DurationNotice compact={compact} tone="warning">
            {warning}
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
        {!loading && hasSelection ? textAlternative : null}
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
  const rows = series.map((scenario) => ({
    coverage: formatCoverage(scenario.summary),
    free: formatOccupancyDuration(scenario.summary.confirmedFreeSeconds),
    load: `${formatDecimal(
      scenario.summary.loadUnitSeconds / HOUR_SECONDS,
      2,
    )} unid·h`,
    name: scenario.name,
    occupied: formatOccupancyDuration(
      scenario.summary.confirmedOccupiedSeconds,
    ),
    transition: formatOccupancyDuration(scenario.summary.transitionSeconds),
    unknown: formatOccupancyDuration(scenario.summary.unknownSeconds),
  }));

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
                {row.free}; sem dados {row.unknown}; cobertura {row.coverage}; carga{" "}
                {row.load}.
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
  chartKind: "comparison" | "timeline",
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
          ...(horizontal ? {} : { width: 82 }),
        },
      };
    });

  return {
    ...option,
    dataZoom: mapComponent(option.dataZoom, (record) => ({
      ...record,
      ...(record.type === "slider" ? { right: 1, width: 8 } : {}),
    })) as EnterpriseChartOption["dataZoom"],
    grid: mapComponent(option.grid, (record) => ({
      ...record,
      bottom: chartKind === "timeline" ? 30 : 18,
      left: 6,
      right: 12,
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
    xAxis: compactAxis(option.xAxis, chartKind === "comparison") as EnterpriseChartOption["xAxis"],
    yAxis: compactAxis(option.yAxis, false) as EnterpriseChartOption["yAxis"],
  };
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
  const dataByState = new Map<OccupancyDurationState, TimelineDatum[]>();
  DURATION_STATE_ORDER.forEach((state) => dataByState.set(state, []));
  series.forEach((scenario, scenarioIndex) => {
    scenario.summary.segments.forEach((segment) => {
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
          "Linha do tempo dos minutos fechados por cenário. Ocupado e livre são estados confirmados; transição não permite inferir a duração exata e sem dados permanece desconhecido.",
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
      data: DURATION_STATE_ORDER.map((state) => visuals[state].label),
      itemHeight: 8,
      itemWidth: 14,
      left: 8,
      textStyle: { color: palette.legendText, fontSize: 10 },
      top: 4,
      type: "scroll",
    },
    series: DURATION_STATE_ORDER.map((state) => ({
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
      name: visuals[state].label,
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
        const state = DURATION_STATE_ORDER.find(
          (candidate) => visuals[candidate].label === record.seriesName,
        );
        const start = numericValue(value[4]);
        const end = numericValue(value[5]);
        const seconds = numericValue(value[3]) ?? 0;
        return [
          `<strong>${escapeHtml(scenarioName)}</strong>`,
          `Estado: ${escapeHtml(state ? visuals[state].label : "-")}`,
          `Início: ${escapeHtml(start === null ? "-" : timeFormatter.format(start))}`,
          `Fim: ${escapeHtml(end === null ? "-" : timeFormatter.format(end))}`,
          `Duração: ${escapeHtml(formatOccupancyDuration(seconds))}`,
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) => `${timeFormatter.format(value).slice(0, 2)}h`,
        fontSize: 9,
        hideOverlap: true,
        rotate: 45,
        showMaxLabel: false,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: true },
      interval: 60 * MINUTE_MS,
      max: range.dayEnd.getTime(),
      min: range.from.getTime(),
      splitLine: { lineStyle: { color: palette.gridLine }, show: true },
      type: "time",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: string) => truncateLabel(value, 18),
        width: 112,
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
          "Barras empilhadas por cenário com tempo ocupado confirmado, transição, livre confirmado e sem dados nos minutos já fechados.",
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
        formatter: (value: string) => truncateLabel(value, 18),
        width: 112,
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
    { cardId: "occupancy_duration_longest", kind: "longest" },
    { cardId: "occupancy_duration_load", kind: "load" },
    { cardId: "occupancy_duration_coverage", kind: "coverage" },
  ];
  return definitions.flatMap(({ cardId, kind }) => {
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
    const stats = summarizeSelectedSeries(
      resolveSelectedSeries(selection),
      selectedScenarios.length,
    );
    const definition = durationMetricDefinition(kind, stats);
    const composition = describeDurationScenarioComposition(selectedScenarios);
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
  resolveSelectedSeries,
  scenarioOptions,
  timeZone,
  timeZoneWarning,
}: {
  inheritedScenarios: DurationScenario[];
  monitorMode: boolean;
  preferenceByCardId: Map<string, CardPreference>;
  range: OccupancyDurationMinuteRange | null;
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
  const timelineSelection = scenarioSelectionFromPreference(
    timelinePreference,
  );
  const comparisonSelection = scenarioSelectionFromPreference(
    comparisonPreference,
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
              "Estados conservadores por minuto fechado; o futuro permanece vazio e transições não são convertidas em permanência.",
              `Composição: ${timelineComposition.fullLabel}.`,
              chunks.length > 1
                ? `Cenários ${index * MAX_REPORT_SCENARIOS_PER_CHART + 1}–${
                    index * MAX_REPORT_SCENARIOS_PER_CHART + chunk.length
                  } de ${timelineSeries.length}.`
                : undefined,
              timeZoneWarning,
            ) ??
            "Estados conservadores por minuto fechado; o futuro permanece vazio e transições não são convertidas em permanência.",
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

  return assets;
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
    )} linha(s), sem truncar os totais. Carga é a integral da ocupação média, não permanência individual.`,
    rows: series.map((scenario) => ({
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
      load: Number(
        (scenario.summary.loadUnitSeconds / HOUR_SECONDS).toFixed(6),
      ),
      longest: scenario.summary.longestConfirmedOccupiedSeconds / 60,
      observed: scenario.summary.observedSeconds / 60,
      occupied: scenario.summary.confirmedOccupiedSeconds / 60,
      scenario: scenario.name,
      transition: scenario.summary.transitionSeconds / 60,
      unknown: scenario.summary.unknownSeconds / 60,
    })),
    title,
  };
}

function chunkDurationSeries(series: OccupancyDurationScenarioSeries[]) {
  const chunks: OccupancyDurationScenarioSeries[][] = [];
  for (
    let index = 0;
    index < series.length;
    index += MAX_REPORT_SCENARIOS_PER_CHART
  ) {
    chunks.push(series.slice(index, index + MAX_REPORT_SCENARIOS_PER_CHART));
  }
  return chunks;
}

function orderedSelectedSeries(
  scenarios: DurationScenario[],
  selection: CardScenarioSelection,
  inheritedScenarios: DurationScenario[],
  series: OccupancyDurationScenarioSeries[],
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
    confirmedOccupiedSeconds: 0,
    errorCount: 0,
    expectedSeconds: 0,
    loadUnitSeconds: 0,
    longestConfirmedOccupiedSeconds: 0,
    observedSeconds: 0,
    scenarioCount: selectedScenarioCount,
    successfulScenarioCount: 0,
    transitionSeconds: 0,
    unknownSeconds: 0,
    warnings: [],
  };
  series.forEach((scenario) => {
    totals.confirmedFreeSeconds += scenario.summary.confirmedFreeSeconds;
    totals.confirmedOccupiedSeconds +=
      scenario.summary.confirmedOccupiedSeconds;
    totals.expectedSeconds += scenario.summary.expectedSeconds;
    totals.loadUnitSeconds += scenario.summary.loadUnitSeconds;
    totals.longestConfirmedOccupiedSeconds = Math.max(
      totals.longestConfirmedOccupiedSeconds,
      scenario.summary.longestConfirmedOccupiedSeconds,
    );
    totals.observedSeconds += scenario.summary.observedSeconds;
    totals.transitionSeconds += scenario.summary.transitionSeconds;
    totals.unknownSeconds += scenario.summary.unknownSeconds;
    if (scenario.error) totals.errorCount += 1;
    else totals.successfulScenarioCount += 1;
    if (scenario.warning) totals.warnings.push(scenario.warning);
  });
  return totals;
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
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(from, "minute"),
    granularity: "minute",
    to: aggregateQueryIso(to, "minute"),
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

async function fetchCompleteDurationAggregate({
  buckets,
  companyScopeId,
  scenarioId,
  signal,
  timeZone,
}: {
  buckets: readonly Date[];
  companyScopeId: string;
  scenarioId: string;
  signal: AbortSignal;
  timeZone: string;
}): Promise<CompleteDurationAggregate> {
  if (buckets.length === 0) {
    return { asOf: null, metadataWarnings: [], totals: new Map() };
  }

  return fetchDurationAggregatePartition({
    buckets,
    companyScopeId,
    scenarioId,
    signal,
    splitDepth: 0,
    timeZone,
  });
}

async function fetchDurationAggregatePartition({
  buckets,
  companyScopeId,
  scenarioId,
  signal,
  splitDepth,
  timeZone,
}: {
  buckets: readonly Date[];
  companyScopeId: string;
  scenarioId: string;
  signal: AbortSignal;
  splitDepth: number;
  timeZone: string;
}): Promise<CompleteDurationAggregate> {
  signal.throwIfAborted();
  const from = buckets[0];
  const to = new Date(buckets.at(-1)!.getTime() + MINUTE_MS);
  const response = await apiFetch<OccupancyScenarioAggregateResponse>(
    occupancyDurationAggregatePath(scenarioId, from, to),
    { companyScopeId, signal },
  );
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
        "Há dados demais em um único minuto para calcular a duração com segurança. Refine a seleção.",
      );
    }

    const midpoint = Math.floor(buckets.length / 2);
    // Partitions stay sequential inside each scenario so the outer pool remains
    // the single concurrency limit and cannot overload the tenant API.
    const left = await fetchDurationAggregatePartition({
      buckets: buckets.slice(0, midpoint),
      companyScopeId,
      scenarioId,
      signal,
      splitDepth: splitDepth + 1,
      timeZone,
    });
    const right = await fetchDurationAggregatePartition({
      buckets: buckets.slice(midpoint),
      companyScopeId,
      scenarioId,
      signal,
      splitDepth: splitDepth + 1,
      timeZone,
    });
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
    allowLegacyUncertifiedInstantBuckets: true,
    requireCertification: true,
  } as const;
  const rows = requireOccupancyAggregateRows(
    response,
    "minute",
    scenarioId,
    timeZone,
    validationOptions,
  );
  const coverage = aggregateOccupancyRowsForRequestedBuckets(
    rows,
    "minute",
    buckets,
    validationOptions,
  );
  const metadataWarning = occupancyAggregateMetadataWarning(
    response,
    "minute",
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
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function normalizeRefreshMilliseconds(value: number) {
  return Number.isFinite(value) && value > 0
    ? Math.max(1_000, Math.floor(value))
    : DEFAULT_AGGREGATE_REFRESH_MS;
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
  return joinMessages(...series.map((item) => item.warning));
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
