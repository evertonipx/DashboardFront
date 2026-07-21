"use client";

import { normalizeScenarioComparisonSettings } from "@/components/app/scenario-comparison-card";
import { normalizeLiveOperationalSettings } from "@/lib/live-operational-settings";
import {
  normalizeRealtimeCustomWidgets,
  type RealtimeCustomWidget,
} from "@/lib/realtime-custom-widgets";
import type {
  PeriodAnalysisBaseline,
  PeriodAnalysisWidget,
  PeriodAnalysisWidgetKind,
} from "@/lib/period-analysis-widgets";
import type { Scenario } from "@/lib/types";
import type { CardPreference } from "@/lib/view-preferences";
import type { WidgetViewSnapshot } from "@/lib/widget-view-presets";

export type LiveAnalysisImportResult = {
  preferences: CardPreference[];
  sourceResolution: "scenario_id" | "scenario_name" | "all_scenarios";
  sourceCardCount: number;
  unsupportedCount: number;
  widgets: PeriodAnalysisWidget[];
};

export function buildLiveAnalysisImport({
  scenarios,
  snapshot,
}: {
  scenarios: Scenario[];
  snapshot: WidgetViewSnapshot;
}): LiveAnalysisImportResult {
  const customWidgets = normalizeRealtimeCustomWidgets(
    snapshotStorageValue(snapshot, "ipxdata.realtime-custom-widgets.v1"),
  );
  const allCardIds = uniqueStrings([
    ...snapshot.cardIds,
    ...customWidgets.map((widget) => `live_custom_${widget.id}`),
  ]);
  const preferences = completeSourcePreferences(
    snapshot.preferences,
    allCardIds,
  ).filter((preference) => preference.visible !== false);
  const customByCardId = new Map(
    customWidgets.map((widget) => [`live_custom_${widget.id}`, widget]),
  );
  const operational = normalizeLiveOperationalSettings(
    snapshotStorageValue(snapshot, "ipxdata.live-operational-settings.v1"),
  );
  const sourceSelection = resolveSourceScenarioSelection(snapshot, scenarios);
  const widgets: PeriodAnalysisWidget[] = [];
  const importedPreferences: CardPreference[] = [];
  let unsupportedCount = 0;

  const add = (
    sourcePreference: CardPreference,
    input: {
      baseline?: PeriodAnalysisBaseline;
      entryScenarioIds?: string[];
      exitScenarioIds?: string[];
      granularity?: "hour" | "day";
      kind: PeriodAnalysisWidgetKind;
      scenarioIds?: string[];
      selectionMode?: "all" | "custom";
      startHour?: number;
      title: string;
    },
  ) => {
    const now = new Date().toISOString();
    const id = createImportId();
    widgets.push({
      baseline: input.baseline ?? "previous_period",
      createdAt: now,
      entryScenarioIds: input.entryScenarioIds ?? [],
      exitScenarioIds: input.exitScenarioIds ?? [],
      granularity: input.granularity ?? "day",
      id,
      kind: input.kind,
      scenarioIds:
        input.scenarioIds ?? sourceSelection.selection.scenarioIds,
      selectionMode:
        input.selectionMode ?? sourceSelection.selection.selectionMode,
      startHour: input.startHour ?? 0,
      title: input.title,
      updatedAt: now,
    });
    importedPreferences.push({
      chartType: sourcePreference.chartType,
      color: sourcePreference.color,
      height: sourcePreference.height,
      id,
      size: sourcePreference.size,
      visible: true,
    });
  };

  preferences.forEach((preference) => {
    const common = sourceSelection.selection;
    const operationalBaseline: PeriodAnalysisBaseline =
      operational.monthComparison === "last_year"
        ? "last_year"
        : "previous_month";

    switch (preference.id) {
      case "live_intraday_comparison":
        add(preference, { ...common, kind: "summary", title: "Resumo do período" });
        return;
      case "live_month_previous_comparison":
        add(preference, {
          ...common,
          baseline: "previous_month",
          kind: "cumulative",
          title: "Acumulado x período do mês anterior",
        });
        return;
      case "live_month_year_comparison":
        add(preference, {
          ...common,
          baseline: "last_year",
          kind: "cumulative",
          title: "Acumulado x período do ano anterior",
        });
        return;
      case "live_chart_hour":
        add(preference, {
          ...common,
          granularity: "hour",
          kind: "timeline",
          title: "Hora a Hora",
        });
        return;
      case "live_chart_minute":
        add(preference, {
          ...common,
          granularity: "hour",
          kind: "timeline",
          title: "Fluxo intradiário",
        });
        return;
      case "live_chart_day":
      case "live_chart_week":
      case "live_chart_month":
        add(preference, {
          ...common,
          granularity: "day",
          kind: "timeline",
          title: "Fluxo por período",
        });
        return;
      case "live_moving_average_trend":
        add(preference, {
          ...common,
          kind: "trend",
          title: "Tendência 7 x 30 dias",
        });
        return;
      case "live_scenario_cumulative":
        add(preference, {
          ...selectionFromSettings(
            operational.cumulativeSelectionMode,
            operational.cumulativeScenarioIds,
            scenarios,
          ),
          kind: "totals_table",
          title: "Acumulado por cenário",
        });
        return;
      case "live_scenario_totals_table":
        add(preference, {
          ...selectionFromSettings(
            operational.scenarioTableSelectionMode,
            operational.scenarioTableIds,
            scenarios,
          ),
          kind: "totals_table",
          title: "Tabela acumulada por cenário",
        });
        return;
      case "live_month_hour_heatmap":
        add(preference, {
          ...selectionFromSettings(
            operational.heatmapSelectionMode,
            operational.heatmapScenarioIds,
            scenarios,
          ),
          granularity: "hour",
          kind: "heatmap",
          title: "Mapa de calor dia x hora",
        });
        return;
      case "live_hourly_occupancy": {
        const availableIds = new Set(scenarios.map((scenario) => scenario.id));
        const entryScenarioIds = uniqueStrings(
          operational.occupancyEntryScenarioIds,
        ).filter((scenarioId) => availableIds.has(scenarioId));
        const entryIdSet = new Set(entryScenarioIds);
        const exitScenarioIds = uniqueStrings(
          operational.occupancyExitScenarioIds,
        ).filter(
          (scenarioId) =>
            availableIds.has(scenarioId) && !entryIdSet.has(scenarioId),
        );
        add(preference, {
          entryScenarioIds,
          exitScenarioIds,
          granularity: "hour",
          kind: "hourly_occupancy",
          scenarioIds: [],
          selectionMode:
            operational.occupancySelectionMode === "custom"
              ? "custom"
              : "all",
          startHour: operational.occupancyStartHour,
          title: "Ocupação hora a hora",
        });
        return;
      }
      case "live_month_access_ranking":
        add(preference, {
          ...selectionFromSettings(
            operational.rankingSelectionMode,
            operational.rankingScenarioIds,
            scenarios,
          ),
          kind: "ranking",
          title: "Ranking dos acessos",
        });
        return;
      case "live_month_peak_days":
        add(preference, {
          ...selectionFromSettings(
            operational.peakDaySelectionMode,
            operational.peakDayScenarioIds,
            scenarios,
          ),
          kind: "peak_days",
          title: "Top 5 dias de pico",
        });
        return;
      case "live_scenario_rose":
        add(preference, {
          ...selectionFromSettings(
            operational.roseSelectionMode,
            operational.roseScenarioIds,
            scenarios,
          ),
          kind: "rose",
          title: "Composição por cenário",
        });
        return;
      case "live_operational_month_comparison":
        add(preference, {
          ...common,
          granularity: "day",
          kind: "timeline",
          title: "Dias do período",
        });
        return;
      case "live_operational_month_cumulative":
        add(preference, {
          ...common,
          baseline: operationalBaseline,
          kind: "cumulative",
          title: "Acumulado diário x base",
        });
        return;
      case "live_today_scenario_comparison":
        add(preference, {
          granularity: "hour",
          kind: "comparison",
          scenarioIds: [],
          selectionMode: "all",
          title: "Comparativo de cenários",
        });
        return;
      case "live_scenario_period_comparison":
        add(preference, {
          granularity: "day",
          kind: "comparison",
          scenarioIds: [],
          selectionMode: "all",
          title: "Comparativo de cenários",
        });
        return;
      case "live_scenario_detail":
        add(preference, {
          granularity: "day",
          kind: "totals_table",
          scenarioIds: [],
          selectionMode: "all",
          title: "Totais por cenário",
        });
        return;
      default:
        break;
    }

    const customWidget = customByCardId.get(preference.id);
    if (!customWidget) {
      unsupportedCount += 1;
      return;
    }

    if (
      !addCustomWidget(
        add,
        preference,
        customWidget,
        snapshot,
        scenarios,
      )
    ) {
      unsupportedCount += 1;
    }
  });

  return {
    preferences: importedPreferences,
    sourceResolution: sourceSelection.resolution,
    sourceCardCount: preferences.length,
    unsupportedCount,
    widgets,
  };
}

function addCustomWidget(
  add: (
    sourcePreference: CardPreference,
    input: {
      baseline?: PeriodAnalysisBaseline;
      entryScenarioIds?: string[];
      exitScenarioIds?: string[];
      granularity?: "hour" | "day";
      kind: PeriodAnalysisWidgetKind;
      scenarioIds?: string[];
      selectionMode?: "all" | "custom";
      startHour?: number;
      title: string;
    },
  ) => void,
  preference: CardPreference,
  widget: RealtimeCustomWidget,
  snapshot: WidgetViewSnapshot,
  scenarios: Scenario[],
) {
  if (widget.kind === "scope") {
    if (widget.scopeMode !== "scenario") return false;
    const scenario = resolveScenario(
      scenarios,
      widget.scopeId,
      widget.scopeName,
    );
    if (!scenario) return false;
    add(preference, {
      granularity:
        widget.granularity === "hour" || widget.granularity === "minute"
          ? "hour"
          : "day",
      kind: "timeline",
      scenarioIds: [scenario.id],
      selectionMode: "custom",
      title: widget.title,
    });
    return true;
  }

  if (widget.kind === "scenario_comparison") {
    const settings = normalizeScenarioComparisonSettings(
      snapshotStorageValue(
        snapshot,
        `ipxdata.live-custom-${widget.id}.scenario-comparison.v1`,
      ),
    );
    add(preference, {
      granularity:
        settings.granularity === "hour" ? "hour" : "day",
      kind: "comparison",
      ...selectionFromSettings(
        settings.selectionMode,
        settings.selectedScenarioIds,
        scenarios,
      ),
      title: widget.title,
    });
    return true;
  }

  const kindByType = {
    cumulative: "cumulative",
    heatmap: "heatmap",
    peak_days: "peak_days",
    ranking: "ranking",
    rose: "rose",
    totals_table: "totals_table",
  } satisfies Record<
    typeof widget.widgetType,
    PeriodAnalysisWidgetKind
  >;
  add(preference, {
    baseline: "previous_month",
    granularity: widget.widgetType === "heatmap" ? "hour" : "day",
    kind: kindByType[widget.widgetType],
    ...selectionFromSettings(
      widget.selectionMode,
      widget.scenarioIds,
      scenarios,
    ),
    title: widget.title,
  });
  return true;
}

function selectionFromSettings(
  selectionMode: "all" | "custom",
  scenarioIds: string[],
  scenarios: Scenario[],
) {
  if (selectionMode === "all") {
    return { scenarioIds: [], selectionMode };
  }

  const availableIds = new Set(scenarios.map((scenario) => scenario.id));
  return {
    scenarioIds: uniqueStrings(scenarioIds).filter((scenarioId) =>
      availableIds.has(scenarioId),
    ),
    selectionMode,
  };
}

function resolveSourceScenarioSelection(
  snapshot: WidgetViewSnapshot,
  scenarios: Scenario[],
) {
  const sourceScope = snapshot.sourceScope;
  const byId = sourceScope
    ? scenarios.find((scenario) => scenario.id === sourceScope.id)
    : undefined;
  if (byId) {
    return {
      resolution: "scenario_id" as const,
      selection: {
        scenarioIds: [byId.id],
        selectionMode: "custom" as const,
      },
    };
  }

  const byName = sourceScope
    ? uniqueScenarioByName(scenarios, sourceScope.name)
    : undefined;
  if (byName) {
    return {
      resolution: "scenario_name" as const,
      selection: {
        scenarioIds: [byName.id],
        selectionMode: "custom" as const,
      },
    };
  }

  return {
    resolution: "all_scenarios" as const,
    selection: {
      scenarioIds: [],
      selectionMode: "all" as const,
    },
  };
}

function resolveScenario(
  scenarios: Scenario[],
  scenarioId: string,
  scenarioName: string,
) {
  return (
    scenarios.find((scenario) => scenario.id === scenarioId) ??
    uniqueScenarioByName(scenarios, scenarioName)
  );
}

function uniqueScenarioByName(scenarios: Scenario[], name: string) {
  const normalizedName = normalizeScenarioName(name);
  if (!normalizedName) return undefined;
  const matches = scenarios.filter(
    (scenario) => normalizeScenarioName(scenario.name) === normalizedName,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeScenarioName(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function completeSourcePreferences(
  storedPreferences: CardPreference[] | null,
  cardIds: string[],
) {
  const preferences = storedPreferences ? [...storedPreferences] : [];
  const storedIds = new Set(preferences.map((preference) => preference.id));
  cardIds.forEach((id) => {
    if (!storedIds.has(id)) preferences.push({ id, visible: true });
  });
  return preferences;
}

function createImportId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `analysis-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function snapshotStorageValue(
  snapshot: WidgetViewSnapshot,
  baseKey: string,
) {
  const entry = snapshot.storage.find((candidate) => candidate.baseKey === baseKey);
  if (!entry) return undefined;

  try {
    return JSON.parse(entry.value) as unknown;
  } catch {
    return undefined;
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
