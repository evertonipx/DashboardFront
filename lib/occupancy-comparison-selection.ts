import type { CardPreference, CardScenarioSelection } from "@/lib/view-preferences";
import { orderWidgetScenarioIds } from "@/lib/widget-scenario-selection";

export const OCCUPANCY_COMPARISON_SCENARIO_CARD_IDS = [
  "occupancy_scenario_half_donut",
  "occupancy_scenario_bar_race",
  "occupancy_scenario_max_hour",
  "occupancy_scenario_max_month",
  "occupancy_scenario_max_year",
  "occupancy_day_hour_heatmap",
  "occupancy_scenario_hour_heatmap",
] as const;

const MIN_COMPARISON_SNAPSHOT_REFRESH_MS = 5_000;

type Scenario = { active?: boolean; id: string };
type Preference = Pick<
  CardPreference,
  | "id"
  | "visible"
  | "scenarioSelectionMode"
  | "scenarioIds"
  | "scenarioOrder"
>;

export function occupancyComparisonSnapshotRefreshIntervalMs({
  baseRefreshMs,
  concurrency,
  scenarioCount,
}: {
  baseRefreshMs: number;
  concurrency: number;
  scenarioCount: number;
}): number {
  if (!Number.isFinite(baseRefreshMs) || baseRefreshMs <= 0) {
    throw new RangeError("O intervalo-base de snapshots deve ser positivo.");
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("A concorrência de snapshots deve ser um inteiro positivo.");
  }
  if (!Number.isSafeInteger(scenarioCount) || scenarioCount < 0) {
    throw new RangeError("A quantidade de cenários deve ser um inteiro não negativo.");
  }

  // Current snapshots are read in one tenant-scoped batch. Keep every
  // demanded comparison on the same five-second live pulse.
  const normalizedBaseRefreshMs = Math.max(
    MIN_COMPARISON_SNAPSHOT_REFRESH_MS,
    Math.round(baseRefreshMs),
  );
  return normalizedBaseRefreshMs;
}

export function occupancyComparisonSelection(preference?: Preference): CardScenarioSelection {
  return {
    mode: preference?.scenarioSelectionMode ?? "inherit",
    scenarioOrder: preference?.scenarioOrder ?? [],
    scenarioIds: preference?.scenarioIds ?? [],
  };
}

export function resolveOccupancyComparisonInheritedScenarioIds({
  configuredScenarioIds,
  focusScenarioId,
  scenarios,
}: {
  configuredScenarioIds: readonly string[];
  focusScenarioId: string;
  scenarios: readonly Scenario[];
}): string[] {
  const availableIds = new Set(scenarios.map((scenario) => scenario.id));
  const configured = Array.from(new Set(configuredScenarioIds)).filter((id) =>
    availableIds.has(id),
  );
  if (configured.length) return configured;
  const activeScenarioIds = scenarios
    .filter((scenario) => scenario.active === true)
    .map((scenario) => scenario.id);
  if (activeScenarioIds.length) return activeScenarioIds;
  if (availableIds.has(focusScenarioId)) return [focusScenarioId];
  return scenarios.map((scenario) => scenario.id);
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
  const selected = orderWidgetScenarioIds(
    Array.from(new Set(candidates)).filter((id) => available.has(id)),
    selection.scenarioOrder,
  );
  return cardId === "occupancy_day_hour_heatmap" ? selected.slice(0, 1) : selected;
}

export function buildOccupancyComparisonSelectionPlan({
  scenarios,
  preferences,
  inheritedScenarioIds,
  inheritedHeatmapScenarioId,
  hexScenarioIds,
  scenarioHeatmapGranularity = "hour",
}: {
  scenarios: readonly Scenario[];
  preferences: readonly Preference[];
  inheritedScenarioIds: readonly string[];
  inheritedHeatmapScenarioId: string;
  hexScenarioIds: readonly string[];
  scenarioHeatmapGranularity?: "minute" | "hour" | "day" | "week" | "month";
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
    const requested = new Set(
      cardIds.flatMap((id) =>
        preferenceById.get(id)?.visible === true
          ? byCard.get(id) ?? []
          : [],
      ),
    );
    if (
      includeHex &&
      preferenceById.get("occupancy_hex_layout")?.visible === true
    ) {
      hexScenarioIds.forEach((id) => requested.add(id));
    }
    return availableScenarioIds.filter((id) => requested.has(id));
  }
  return {
    byCard,
    snapshots: union(["occupancy_scenario_half_donut", "occupancy_scenario_bar_race", "occupancy_scenario_max_hour", "occupancy_scenario_max_year"], true),
    hourly: union([
      "occupancy_scenario_max_hour",
      "occupancy_day_hour_heatmap",
      ...(scenarioHeatmapGranularity === "hour"
        ? ["occupancy_scenario_hour_heatmap"]
        : []),
    ]),
    // Both month/year trends advance from the same open-hour maximum. This
    // keeps their five-second edge current without re-reading the month.
    currentHour: union([
      "occupancy_scenario_max_hour",
      "occupancy_scenario_max_month",
      "occupancy_scenario_max_year",
    ]),
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
