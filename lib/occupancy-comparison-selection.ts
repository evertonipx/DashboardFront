import type { CardPreference, CardScenarioSelection } from "@/lib/view-preferences";

export const OCCUPANCY_COMPARISON_SCENARIO_CARD_IDS = [
  "occupancy_scenario_half_donut",
  "occupancy_scenario_bar_race",
  "occupancy_scenario_max_hour",
  "occupancy_scenario_max_month",
  "occupancy_scenario_max_year",
  "occupancy_day_hour_heatmap",
  "occupancy_scenario_hour_heatmap",
] as const;

type Scenario = { id: string };
type Preference = Pick<CardPreference, "id" | "visible" | "scenarioSelectionMode" | "scenarioIds">;

export function occupancyComparisonSelection(preference?: Preference): CardScenarioSelection {
  return {
    mode: preference?.scenarioSelectionMode ?? "inherit",
    scenarioIds: preference?.scenarioIds ?? [],
  };
}

export function resolveOccupancyComparisonScenarioIds({
  cardId,
  selection,
  availableScenarioIds,
  inheritedScenarioIds,
  inheritedHeatmapScenarioId,
}: {
  cardId: string;
  selection: CardScenarioSelection;
  availableScenarioIds: readonly string[];
  inheritedScenarioIds: readonly string[];
  inheritedHeatmapScenarioId: string;
}): string[] {
  const available = new Set(availableScenarioIds);
  const candidates = selection.mode === "all"
    ? availableScenarioIds
    : selection.mode === "custom"
      ? selection.scenarioIds
      : cardId === "occupancy_day_hour_heatmap"
        ? [inheritedHeatmapScenarioId]
        : inheritedScenarioIds;
  const selected = Array.from(new Set(candidates)).filter((id) => available.has(id));
  return cardId === "occupancy_day_hour_heatmap" ? selected.slice(0, 1) : selected;
}

export function buildOccupancyComparisonSelectionPlan({
  scenarios,
  preferences,
  inheritedScenarioIds,
  inheritedHeatmapScenarioId,
  hexScenarioIds,
}: {
  scenarios: readonly Scenario[];
  preferences: readonly Preference[];
  inheritedScenarioIds: readonly string[];
  inheritedHeatmapScenarioId: string;
  hexScenarioIds: readonly string[];
}) {
  const availableScenarioIds = scenarios.map((scenario) => scenario.id);
  const preferenceById = new Map(preferences.map((preference) => [preference.id, preference]));
  const byCard = new Map<string, string[]>(OCCUPANCY_COMPARISON_SCENARIO_CARD_IDS.map((cardId) => [
    cardId,
    resolveOccupancyComparisonScenarioIds({
      availableScenarioIds,
      cardId,
      inheritedHeatmapScenarioId,
      inheritedScenarioIds,
      selection: occupancyComparisonSelection(preferenceById.get(cardId)),
    }),
  ]));
  function union(cardIds: readonly string[], includeHex = false) {
    const requested = new Set(cardIds.flatMap((id) => preferenceById.get(id)?.visible ? byCard.get(id) ?? [] : []));
    if (includeHex && preferenceById.get("occupancy_hex_layout")?.visible) {
      hexScenarioIds.forEach((id) => requested.add(id));
    }
    return availableScenarioIds.filter((id) => requested.has(id));
  }
  return {
    byCard,
    snapshots: union(["occupancy_scenario_half_donut", "occupancy_scenario_bar_race", "occupancy_scenario_max_hour", "occupancy_scenario_max_year"], true),
    hourly: union(["occupancy_scenario_max_hour", "occupancy_day_hour_heatmap", "occupancy_scenario_hour_heatmap"]),
    currentHour: union(["occupancy_scenario_max_hour", "occupancy_scenario_max_year"]),
    trends: union(["occupancy_scenario_max_month", "occupancy_scenario_max_year"]),
  };
}

export function filterOccupancyComparisonRows<T extends { scenarioId: string }>(
  rows: readonly T[],
  selectedScenarioIds: readonly string[],
): T[] {
  const byId = new Map(rows.map((row) => [row.scenarioId, row]));
  return selectedScenarioIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export function selectOccupancyComparisonSharedSource<T extends { scenarioId: string }>(
  source: T | null | undefined,
  focusScenarioId: string,
  requestedScenarioIds: ReadonlySet<string>,
): T | null {
  return requestedScenarioIds.has(focusScenarioId) && source?.scenarioId === focusScenarioId
    ? source
    : null;
}
