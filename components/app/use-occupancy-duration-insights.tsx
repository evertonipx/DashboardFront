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
import {
  fetchOccupancyDurationInsightScenario,
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
  error?: string;
  loading: boolean;
  month: OccupancyDurationInsightMonth | null;
  scopeKey: string;
  series: OccupancyDurationInsightScenario[];
};

export type OccupancyDurationInsightReportAsset = {
  cardId: OccupancyDurationInsightCardId;
  chart: ReportChart;
  titleSuffix?: string;
};

const REFRESH_MS = 60_000;
const CONCURRENT_SCENARIOS = 3;
const REPORT_SCENARIOS_PER_PAGE = 8;

export function useOccupancyDurationInsights({
  companyScopeId,
  enabled,
  focusScenarioId,
  monitorMode,
  preferences,
  scenarios,
  timeZone,
  userId,
}: {
  companyScopeId: string;
  enabled: boolean;
  focusScenarioId: string;
  monitorMode: boolean;
  preferences: CardPreference[];
  scenarios: OccupancyScenario[];
  timeZone: string;
  userId?: string | null;
}) {
  const optionsKey = JSON.stringify(scenarios
    .filter((scenario) => scenario.company_id === companyScopeId)
    .map(({ id, name }) => ({ id, name })));
  const options = React.useMemo<ScenarioOption[]>(() => JSON.parse(optionsKey), [optionsKey]);
  const inherited = React.useMemo(
    () => options.filter((scenario) => scenario.id === focusScenarioId),
    [focusScenarioId, options],
  );
  const preferenceById = React.useMemo(
    () => new Map(preferences.map((preference) => [preference.id, preference])),
    [preferences],
  );
  const requested = new Map<string, ScenarioOption>();
  if (enabled) {
    OCCUPANCY_DURATION_INSIGHT_CARD_IDS.forEach((id) => {
      const preference = preferenceById.get(id);
      if (!preference?.visible) return;
      resolveWidgetScenarios(options, selectionFromPreference(preference), inherited)
        .forEach((scenario) => requested.set(scenario.id, scenario));
    });
  }
  // Only the query scope can restart loading. Editing size, title or color does
  // not discard the month cache or repeat requests for the same selection.
  const requestKey = JSON.stringify([...requested.values()].sort((a, b) => a.id.localeCompare(b.id)));
  const requestedScenarios = React.useMemo<ScenarioOption[]>(() => JSON.parse(requestKey), [requestKey]);
  const cacheScope = JSON.stringify([userId ?? "", companyScopeId, timeZone]);
  const scopeKey = JSON.stringify([cacheScope, requestKey, enabled]);
  const cacheRef = React.useRef<{
    scope: string;
    month: number;
    value: OccupancyDurationInsightQueryCache;
  }>({ scope: "", month: 0, value: new Map() });
  const lastSeriesRef = React.useRef<{
    scope: string;
    month: number;
    through: number;
    value: Map<string, OccupancyDurationInsightScenario>;
  }>({ scope: "", month: 0, through: 0, value: new Map() });
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [dataset, setDataset] = React.useState<Dataset>({
    loading: false, month: null, scopeKey: "", series: [],
  });
  const refresh = React.useCallback(() => {
    cacheRef.current = { scope: "", month: 0, value: new Map() };
    setRefreshVersion((value) => value + 1);
  }, []);

  React.useEffect(() => {
    if (!enabled || !companyScopeId || requestedScenarios.length === 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let lastLoadedMinute = 0;

    function schedule() {
      if (!controller.signal.aborted) timer = setTimeout(() => void load(), REFRESH_MS);
    }
    async function load() {
      if (controller.signal.aborted || running) return;
      if (document.visibilityState === "hidden") { schedule(); return; }
      running = true;
      try {
        const month = buildOccupancyDurationInsightMonth(new Date(), timeZone);
        if (month.to.getTime() === lastLoadedMinute) return;
        if (cacheRef.current.scope !== cacheScope || cacheRef.current.month !== month.from.getTime()) {
          cacheRef.current = { scope: cacheScope, month: month.from.getTime(), value: new Map() };
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
        const cache = cacheRef.current.value;
        const previousSeries = lastSeriesRef.current.value;
        setDataset((current) => ({
          scopeKey, month,
          series: current.scopeKey === scopeKey &&
            current.month?.from.getTime() === month.from.getTime() &&
            current.month.to.getTime() <= month.to.getTime()
            ? current.series : [],
          loading: true,
        }));
        const series = new Array<OccupancyDurationInsightScenario>(requestedScenarios.length);
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(CONCURRENT_SCENARIOS, requestedScenarios.length) }, async () => {
          while (cursor < requestedScenarios.length) {
            controller.signal.throwIfAborted();
            const index = cursor++;
            const scenario = requestedScenarios[index];
            try {
              series[index] = await fetchOccupancyDurationInsightScenario({
                cache, companyScopeId, month, name: scenario.name,
                scenarioId: scenario.id, signal: controller.signal, timeZone,
              });
              controller.signal.throwIfAborted();
              previousSeries.set(scenario.id, series[index]);
            } catch (error) {
              if (isAbortError(error, controller.signal)) throw error;
              series[index] = {
                ...previousSeries.get(scenario.id),
                scenarioId: scenario.id, name: scenario.name,
                hours: previousSeries.get(scenario.id)?.hours ?? [],
                error: userFacingErrorMessage(error, "Não foi possível atualizar o tempo ocupado deste cenário."),
              };
            }
          }
        }));
        if (controller.signal.aborted) return;
        lastLoadedMinute = series.some((item) => item.error) ? 0 : month.to.getTime();
        setDataset({ scopeKey, month, series, loading: false });
      } catch (error) {
        if (isAbortError(error, controller.signal)) return;
        setDataset({
          scopeKey, month: null, series: [], loading: false,
          error: userFacingErrorMessage(error, "Não foi possível carregar os tempos de ocupação do mês."),
        });
      } finally {
        running = false;
        schedule();
      }
    }
    function resume() {
      if (document.visibilityState !== "visible" || running) return;
      if (timer) clearTimeout(timer);
      void load();
    }
    void load();
    document.addEventListener("visibilitychange", resume);
    return () => {
      abortRequest(controller);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [cacheScope, companyScopeId, enabled, refreshVersion, requestedScenarios, scopeKey, timeZone]);

  const current = dataset.scopeKey === scopeKey ? dataset : {
    scopeKey, month: null, series: [], loading: enabled && requestedScenarios.length > 0,
  };
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
        kind={kind} series={resolveSeries(scenarioSelection)} month={current.month}
        loading={current.loading} error={current.error} monitorMode={monitorMode}
      />,
    })),
  [current.error, current.loading, current.month, inherited, monitorMode, resolveSeries]);

  const reportAssets = React.useMemo<OccupancyDurationInsightReportAsset[]>(() => {
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
        chart: buildOccupancyDurationInsightReport({ kind, series, month, widgetColor: preference.color }),
        titleSuffix: pages.length > 1 ? ` · ${index + 1}/${pages.length}` : "",
      }));
    });
  }, [current.month, preferenceById, resolveSeries]);

  const dataCompleteUntil = requestedScenarios.length === 0
    ? undefined
    : current.series.length === requestedScenarios.length && current.series.every((item) =>
      !item.error && item.asOf && Number.isFinite(item.asOf.getTime()) &&
      item.hours.every((hour) => hour.unknownSeconds === 0))
      ? new Date(Math.min(...current.series.map((item) => item.asOf!.getTime())))
      : null;

  return { cards, dataCompleteUntil, loading: current.loading, refresh, reportAssets };
}

function selectionFromPreference(preference?: CardPreference): CardScenarioSelection {
  return { mode: preference?.scenarioSelectionMode ?? "inherit", scenarioIds: preference?.scenarioIds ?? [] };
}
