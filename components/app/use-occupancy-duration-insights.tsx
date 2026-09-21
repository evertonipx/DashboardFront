"use client";

import * as React from "react";

import type { LayoutCard } from "@/components/app/card-layout";
import {
  OCCUPANCY_DURATION_INSIGHT_CARD_IDS,
  OCCUPANCY_DURATION_INSIGHT_LABELS,
  OccupancyDurationInsightCard,
  buildOccupancyDurationInsightReport,
  type OccupancyDurationInsightCardId,
} from "@/components/app/occupancy-duration-insights-widgets";
import {
  buildOccupancyDurationInsightMonth,
  type OccupancyDurationInsightMonth,
  type OccupancyDurationInsightScenario,
} from "@/lib/occupancy-duration-insights";
import { occupancyDurationNextMinuteRefreshDelay } from "@/lib/occupancy-duration-refresh";
import {
  acquireOccupancyDurationInsightQueryCache,
  fetchOccupancyDurationInsightScenario,
  invalidateOccupancyDurationInsightOpenEdge,
  type OccupancyDurationInsightQueryCache,
} from "@/lib/occupancy-duration-insights-query";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import type { ReportChart } from "@/lib/report-export";
import type { OccupancyScenario } from "@/lib/types";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import type { CardPreference, CardScenarioSelection } from "@/lib/view-preferences";
import { resolveWidgetScenarios } from "@/lib/widget-scenario-selection";

type ScenarioOption = Pick<OccupancyScenario, "id" | "name">;
type Dataset = {
  dataIdentityKey: string;
  error?: string;
  loading: boolean;
  month: OccupancyDurationInsightMonth | null;
  scopeKey: string;
  series: OccupancyDurationInsightScenario[];
};

type ScenarioRetryState = {
  failures: number;
  retryAt: number;
};

export type OccupancyDurationInsightRefreshMode = "poll" | "manual";

export type OccupancyDurationInsightReportAsset = {
  cardId: OccupancyDurationInsightCardId;
  chart: ReportChart;
  titleSuffix?: string;
};

const CONCURRENT_SCENARIOS = 3;
const REPORT_SCENARIOS_PER_PAGE = 8;
const RETRY_DELAYS_MS = [60_000, 120_000, 240_000, 480_000, 900_000] as const;

export function useOccupancyDurationInsights({
  companyScopeId,
  defaultWidgetColor = "#1267C4",
  enabled,
  focusScenarioId,
  monitorMode,
  period,
  preferences,
  requestedCardIds,
  refreshMode = "poll",
  scenarios,
  timeZone,
  userId,
}: {
  companyScopeId: string;
  defaultWidgetColor?: string;
  enabled: boolean;
  focusScenarioId: string;
  monitorMode: boolean;
  period?: OccupancyDurationInsightMonth | null;
  preferences: CardPreference[];
  requestedCardIds?: ReadonlySet<string>;
  refreshMode?: OccupancyDurationInsightRefreshMode;
  scenarios: OccupancyScenario[];
  timeZone: string;
  userId?: string | null;
}) {
  const optionsKey = React.useMemo(
    () =>
      JSON.stringify(
        scenarios
          .filter((scenario) => scenario.company_id === companyScopeId)
          .map(({ id, name }) => ({ id, name })),
      ),
    [companyScopeId, scenarios],
  );
  const options = React.useMemo<ScenarioOption[]>(() => JSON.parse(optionsKey), [optionsKey]);
  const inherited = React.useMemo(
    () => options.filter((scenario) => scenario.id === focusScenarioId),
    [focusScenarioId, options],
  );
  const preferenceById = React.useMemo(
    () => new Map(preferences.map((preference) => [preference.id, preference])),
    [preferences],
  );
  const periodKey = React.useMemo(
    () =>
      period
        ? JSON.stringify([
            period.from.getTime(),
            period.to.getTime(),
            period.monthEnd.getTime(),
            period.timeZone,
            period.dateKeys,
            period.contextLabel ?? "",
            period.clippedToFinalMonth ?? null,
          ])
        : "",
    [period],
  );
  const stablePeriod = React.useMemo(
    () => occupancyDurationInsightPeriodFromKey(periodKey),
    [periodKey],
  );
  const queryEnabled = enabled && (refreshMode === "poll" || Boolean(period));
  const configuredScenarioKey = React.useMemo(() => {
    const configured = new Map<string, ScenarioOption>();
    if (queryEnabled) {
      OCCUPANCY_DURATION_INSIGHT_CARD_IDS.forEach((id) => {
        const preference = preferenceById.get(id);
        if (preference?.visible !== true) return;
        resolveWidgetScenarios(
          options,
          selectionFromPreference(preference),
          inherited,
        ).forEach((scenario) => configured.set(scenario.id, scenario));
      });
    }
    return JSON.stringify(
      [...configured.values()].sort((a, b) => a.id.localeCompare(b.id)),
    );
  }, [inherited, options, preferenceById, queryEnabled]);
  // Only the query scope can restart loading. Editing size, title or color does
  // not discard the month cache or repeat requests for the same selection.
  const requestKey = React.useMemo(() => {
    const requested = new Map<string, ScenarioOption>();
    if (queryEnabled) {
      OCCUPANCY_DURATION_INSIGHT_CARD_IDS.forEach((id) => {
        if (requestedCardIds && !requestedCardIds.has(id)) return;
        const preference = preferenceById.get(id);
        if (preference?.visible !== true) return;
        resolveWidgetScenarios(
          options,
          selectionFromPreference(preference),
          inherited,
        ).forEach((scenario) => requested.set(scenario.id, scenario));
      });
    }
    return JSON.stringify(
      [...requested.values()].sort((a, b) => a.id.localeCompare(b.id)),
    );
  }, [
    inherited,
    options,
    preferenceById,
    queryEnabled,
    requestedCardIds,
  ]);
  const requestedScenarios = React.useMemo<ScenarioOption[]>(() => JSON.parse(requestKey), [requestKey]);
  const cacheScope = React.useMemo(
    () =>
      JSON.stringify([
        userId ?? "",
        companyScopeId,
        timeZone,
      ]),
    [companyScopeId, timeZone, userId],
  );
  const dataIdentityKey = React.useMemo(
    () =>
      JSON.stringify([
        cacheScope,
        configuredScenarioKey,
        refreshMode,
        refreshMode === "manual" ? periodKey : "live",
      ]),
    [
      cacheScope,
      configuredScenarioKey,
      periodKey,
      refreshMode,
    ],
  );
  const scopeKey = React.useMemo(
    () =>
      JSON.stringify([
        cacheScope,
        requestKey,
        queryEnabled,
        refreshMode === "manual" ? periodKey : "live",
      ]),
    [cacheScope, periodKey, queryEnabled, refreshMode, requestKey],
  );
  const localCacheRef = React.useRef<{
    scope: string;
    value: OccupancyDurationInsightQueryCache;
  }>({ scope: "", value: new Map() });
  const lastSeriesRef = React.useRef<{
    scope: string;
    month: number;
    through: number;
    value: Map<string, OccupancyDurationInsightScenario>;
  }>({ scope: "", month: 0, through: 0, value: new Map() });
  const scenarioRetryRef = React.useRef(new Map<string, ScenarioRetryState>());
  const pollEdgeRef = React.useRef({ scopeKey: "", through: 0 });
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [dataset, setDataset] = React.useState<Dataset>({
    dataIdentityKey: "", loading: false, month: null, scopeKey: "", series: [],
  });
  const resolveQueryCache = React.useCallback(() => {
    const shared = acquireOccupancyDurationInsightQueryCache({
      companyScopeId,
      timeZone,
      userId,
    });
    if (shared) return shared;
    if (localCacheRef.current.scope !== cacheScope) {
      localCacheRef.current = { scope: cacheScope, value: new Map() };
    }
    return localCacheRef.current.value;
  }, [cacheScope, companyScopeId, timeZone, userId]);
  const refresh = React.useCallback(() => {
    // Refresh only the selected range's edge. Replaying every older closed
    // hour is both slow and wasteful; those spans expire on their own TTL.
    invalidateOccupancyDurationInsightOpenEdge(resolveQueryCache(), {
      ...(refreshMode === "manual" && stablePeriod
        ? {
            from: stablePeriod.from.getTime(),
            to: stablePeriod.to.getTime(),
          }
        : {}),
      scenarioIds: new Set(requestedScenarios.map((scenario) => scenario.id)),
    });
    pollEdgeRef.current = { scopeKey: "", through: 0 };
    setRefreshVersion((value) => value + 1);
  }, [refreshMode, requestedScenarios, resolveQueryCache, stablePeriod]);

  React.useEffect(() => {
    if (!queryEnabled || !companyScopeId || requestedScenarios.length === 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let running = false;

    function schedule() {
      if (
        refreshMode === "poll" &&
        !disposed &&
        !controller.signal.aborted
      ) {
        timer = setTimeout(
          () => void load(),
          occupancyDurationNextMinuteRefreshDelay(),
        );
      }
    }
    async function load() {
      if (disposed || controller.signal.aborted || running) return;
      if (navigator.onLine === false) {
        if (refreshMode === "manual") {
          setDataset((current) =>
            current.scopeKey === scopeKey
              ? {
                  ...current,
                  error: "Sem conexão para atualizar os tempos de ocupação.",
                  loading: false,
                }
              : {
                  dataIdentityKey,
                  error: "Sem conexão para atualizar os tempos de ocupação.",
                  loading: false,
                  month: stablePeriod,
                  scopeKey,
                  series: [],
                },
          );
        } else {
          schedule();
        }
        return;
      }
      if (
        refreshMode === "poll" &&
        document.visibilityState === "hidden"
      ) {
        schedule();
        return;
      }
      running = true;
      try {
        const month = refreshMode === "manual"
          ? stablePeriod
          : buildOccupancyDurationInsightMonth(new Date(), timeZone);
        if (!month) return;
        const pollEdge = pollEdgeRef.current;
        if (
          refreshMode === "poll" &&
          pollEdge.scopeKey === scopeKey &&
          pollEdge.through === month.to.getTime()
        ) {
          return;
        }
        if (lastSeriesRef.current.scope !== cacheScope ||
            lastSeriesRef.current.month !== month.from.getTime() ||
            lastSeriesRef.current.through > month.to.getTime()) {
          lastSeriesRef.current = {
            scope: cacheScope, month: month.from.getTime(),
            through: month.to.getTime(), value: new Map(),
          };
        }
        lastSeriesRef.current.through = month.to.getTime();
        const cache = resolveQueryCache();
        const previousSeries = lastSeriesRef.current.value;
        const retainedSeries = requestedScenarios.flatMap((scenario) => {
          const previous = previousSeries.get(scenario.id);
          return previous ? [previous] : [];
        });
        setDataset((current) => {
          const series =
            current.scopeKey === scopeKey &&
            current.month?.from.getTime() === month.from.getTime() &&
            current.month.to.getTime() <= month.to.getTime()
              ? current.series
              : retainedSeries;
          const loading = series.length === 0;
          if (
            current.scopeKey === scopeKey &&
            current.month?.from.getTime() === month.from.getTime() &&
            current.month.to.getTime() === month.to.getTime() &&
            current.series === series &&
            !current.error &&
            current.loading === loading
          ) {
            return current;
          }
          return {
            dataIdentityKey,
            scopeKey,
            month,
            series,
            // Stale-while-revalidate: a minute-edge refresh must not blank
            // four charts while certified closed history is still valid.
            loading,
          };
        });
        const series = new Array<OccupancyDurationInsightScenario>(requestedScenarios.length);
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(CONCURRENT_SCENARIOS, requestedScenarios.length) }, async () => {
          while (cursor < requestedScenarios.length) {
            controller.signal.throwIfAborted();
            const index = cursor++;
            const scenario = requestedScenarios[index];
            const retryKey = `${cacheScope}|${scenario.id}`;
            const retry = scenarioRetryRef.current.get(retryKey);
            if (
              refreshMode === "poll" &&
              retry &&
              retry.retryAt > Date.now()
            ) {
              series[index] = previousSeries.get(scenario.id) ?? {
                scenarioId: scenario.id,
                name: scenario.name,
                hours: [],
                error: "A atualização deste cenário será tentada novamente em instantes.",
              };
              continue;
            }
            try {
              series[index] = await fetchOccupancyDurationInsightScenario({
                bypassTransportCache: refreshMode === "manual",
                cache, companyScopeId, month, name: scenario.name,
                minuteRefinement:
                  refreshMode === "poll" ? "live-edge" : "complete",
                scenarioId: scenario.id, signal: controller.signal, timeZone,
              });
              controller.signal.throwIfAborted();
              previousSeries.set(scenario.id, series[index]);
              scenarioRetryRef.current.delete(retryKey);
            } catch (error) {
              if (isAbortError(error, controller.signal)) throw error;
              const failures = Math.min(
                (scenarioRetryRef.current.get(retryKey)?.failures ?? 0) + 1,
                RETRY_DELAYS_MS.length,
              );
              scenarioRetryRef.current.set(retryKey, {
                failures,
                retryAt:
                  Date.now() + RETRY_DELAYS_MS[Math.max(0, failures - 1)],
              });
              series[index] = {
                ...previousSeries.get(scenario.id),
                scenarioId: scenario.id, name: scenario.name,
                hours: previousSeries.get(scenario.id)?.hours ?? [],
                error: userFacingErrorMessage(error, "Não foi possível atualizar o tempo ocupado deste cenário."),
              };
            }
          }
        }));
        if (disposed || controller.signal.aborted) return;
        if (refreshMode === "poll") {
          pollEdgeRef.current = {
            scopeKey,
            through: month.to.getTime(),
          };
        }
        setDataset({ dataIdentityKey, scopeKey, month, series, loading: false });
      } catch (error) {
        if (disposed || isAbortError(error, controller.signal)) return;
        setDataset({
          dataIdentityKey, scopeKey, month: null, series: [], loading: false,
          error: userFacingErrorMessage(
            error,
            refreshMode === "manual"
              ? "Não foi possível carregar os tempos de ocupação do período selecionado."
              : "Não foi possível carregar os tempos de ocupação do mês.",
          ),
        });
      } finally {
        running = false;
        if (!disposed) schedule();
      }
    }
    function resume() {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false ||
        running
      ) return;
      if (timer) clearTimeout(timer);
      void load();
    }
    void load();
    if (refreshMode === "poll") {
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", resume);
    }
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (refreshMode === "poll") {
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("online", resume);
      }
      abortRequest(controller);
    };
  }, [
    cacheScope,
    companyScopeId,
    dataIdentityKey,
    periodKey,
    queryEnabled,
    refreshMode,
    refreshVersion,
    requestedScenarios,
    resolveQueryCache,
    scopeKey,
    stablePeriod,
    timeZone,
  ]);

  const current = React.useMemo<Dataset>(
    () =>
      dataset.scopeKey === scopeKey ||
      (queryEnabled &&
        requestedScenarios.length === 0 &&
        dataset.dataIdentityKey === dataIdentityKey)
        ? dataset
        : {
            dataIdentityKey,
            scopeKey,
            month: null,
            series: [],
            loading: queryEnabled && requestedScenarios.length > 0,
          },
    [
      dataIdentityKey,
      dataset,
      queryEnabled,
      requestedScenarios.length,
      scopeKey,
    ],
  );
  const seriesById = React.useMemo(
    () => new Map(current.series.map((item) => [item.scenarioId, item])),
    [current.series],
  );
  const selectedSeriesCache = React.useMemo(() => {
    const selections: CardScenarioSelection[] = [
      { mode: "inherit", scenarioIds: [] },
      { mode: "all", scenarioIds: [] },
      ...OCCUPANCY_DURATION_INSIGHT_CARD_IDS.map((id) => selectionFromPreference(preferenceById.get(id))),
    ];
    return new Map(selections.map((selection) => {
      const selected = resolveWidgetScenarios(options, selection, inherited);
      const key = JSON.stringify(selected.map((scenario) => scenario.id));
      const result = selected.map((scenario) => seriesById.get(scenario.id) ?? {
        scenarioId: scenario.id, name: scenario.name, hours: [],
      });
      return [key, result] as const;
    }));
  }, [inherited, options, preferenceById, seriesById]);
  const resolveSeries = React.useCallback((selection: CardScenarioSelection) => {
    const selected = resolveWidgetScenarios(options, selection, inherited);
    return selectedSeriesCache.get(JSON.stringify(selected.map((scenario) => scenario.id))) ?? [];
  }, [inherited, options, selectedSeriesCache]);

  const cards = React.useMemo<LayoutCard[]>(() =>
    OCCUPANCY_DURATION_INSIGHT_CARD_IDS.map((kind) => ({
      id: kind,
      label: OCCUPANCY_DURATION_INSIGHT_LABELS[kind],
      defaultSize: kind === "occupancy_duration_month_heatmap" || kind === "occupancy_duration_scenario_heatmap" ? "full" : "wide",
      defaultHeightLevel: kind === "occupancy_duration_month_heatmap" ? 5 : 4,
      colorEditable: true,
      colorPreview: kind === "occupancy_duration_daily_profile" ? "solid" : "gradient",
      previewKind: kind === "occupancy_duration_daily_profile" ? "chart" : "heatmap",
      scenarioConfigurable: true,
      scenarioSelectionPolicy: kind === "occupancy_duration_scenario_heatmap" ? "compare" : "aggregate",
      titleEditable: true,
      zoomEnabled: true,
      inheritedScenarioIds: inherited.map((scenario) => scenario.id),
      inheritedScenarioLabel: inherited[0]?.name ?? "Cenário da tela",
      node: ({ scenarioSelection }) => <OccupancyDurationInsightCard
        defaultWidgetColor={defaultWidgetColor}
        kind={kind} series={resolveSeries(scenarioSelection)} month={current.month}
        loading={current.loading} error={current.error} monitorMode={monitorMode}
        periodLabel={refreshMode === "manual" ? current.month?.contextLabel : undefined}
      />,
    })),
  [current.error, current.loading, current.month, defaultWidgetColor, inherited, monitorMode, refreshMode, resolveSeries]);

  const getReportAssets = React.useCallback<
    () => OccupancyDurationInsightReportAsset[]
  >(() => {
    if (!current.month) return [];
    const month = current.month;
    return OCCUPANCY_DURATION_INSIGHT_CARD_IDS.flatMap((kind) => {
      const preference = preferenceById.get(kind);
      if (!preference?.visible) return [];
      const selected = resolveSeries(selectionFromPreference(preference));
      if (!selected.length) return [];
      const pages: OccupancyDurationInsightScenario[][] = [];
      if (kind === "occupancy_duration_scenario_heatmap") {
        for (let index = 0; index < selected.length; index += REPORT_SCENARIOS_PER_PAGE) {
          pages.push(selected.slice(index, index + REPORT_SCENARIOS_PER_PAGE));
        }
      } else pages.push(selected);
      return pages.map((series, index) => ({
        cardId: kind,
        chart: buildOccupancyDurationInsightReport({
          kind,
          month,
          periodLabel: refreshMode === "manual" ? month.contextLabel : undefined,
          series,
          widgetColor: preference.color ?? defaultWidgetColor,
        }),
        titleSuffix: pages.length > 1 ? ` · ${index + 1}/${pages.length}` : "",
      }));
    });
  }, [current.month, defaultWidgetColor, preferenceById, refreshMode, resolveSeries]);
  // Historical analysis builds its static report once after the explicit
  // query. The live surface keeps export models lazy so its polling cycle does
  // not rebuild four charts and tables before the user asks to export.
  const reportAssets = React.useMemo(
    () => (refreshMode === "manual" ? getReportAssets() : []),
    [getReportAssets, refreshMode],
  );

  const dataCompleteUntil = React.useMemo(
    () =>
      requestedScenarios.length === 0
        ? undefined
        : current.series.length === requestedScenarios.length &&
            current.series.every(
              (item) =>
                !item.error &&
                item.asOf &&
                Number.isFinite(item.asOf.getTime()) &&
                item.hours.every((hour) => hour.unknownSeconds === 0),
            )
          ? new Date(
              Math.min(
                ...current.series.map((item) => item.asOf!.getTime()),
              ),
            )
          : null,
    [current.series, requestedScenarios.length],
  );

  return {
    cards,
    dataCompleteUntil,
    getReportAssets,
    loading: current.loading,
    refresh,
    reportAssets,
  };
}

function selectionFromPreference(preference?: CardPreference): CardScenarioSelection {
  return {
    mode: preference?.scenarioSelectionMode ?? "inherit",
    scenarioOrder: preference?.scenarioOrder ?? [],
    scenarioIds: preference?.scenarioIds ?? [],
  };
}

function occupancyDurationInsightPeriodFromKey(
  key: string,
): OccupancyDurationInsightMonth | null {
  if (!key) return null;
  const [
    from,
    to,
    monthEnd,
    timeZone,
    dateKeys,
    contextLabel,
    clippedToFinalMonth,
  ] = JSON.parse(key) as [
    number,
    number,
    number,
    string,
    string[],
    string,
    boolean | null,
  ];
  return {
    ...(contextLabel ? { contextLabel } : {}),
    ...(clippedToFinalMonth !== null ? { clippedToFinalMonth } : {}),
    dateKeys,
    from: new Date(from),
    monthEnd: new Date(monthEnd),
    timeZone,
    to: new Date(to),
  };
}
