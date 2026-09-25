import type { CardPreference } from "@/lib/view-preferences";
import type { WidgetViewSnapshot } from "@/lib/widget-view-presets";

export type OccupancyLiveAnalysisImportResult = {
  preferences: CardPreference[];
  sourceCardCount: number;
  unsupportedCount: number;
  importedCount: number;
};

// Only cards with an equivalent historical meaning may change IDs. Other
// widgets can cross views only when the analysis layout actually exposes the
// same ID (comparison, duration, loitering and custom widgets).
const HISTORICAL_CARD_IDS = new Map([
  ["occupancy_current_total", "occupancy_report_current"],
  ["occupancy_average", "occupancy_report_average"],
  ["occupancy_peak", "occupancy_report_peak"],
  ["occupancy_minimum", "occupancy_report_minimum"],
  ["occupancy_chart_minute", "occupancy_report_minute"],
  ["occupancy_chart_hour", "occupancy_report_hour"],
  ["occupancy_chart_day", "occupancy_report_day"],
]);

export function buildOccupancyLiveAnalysisImport({
  snapshot,
  targetCardIds,
  availableScenarioIds,
}: {
  snapshot: WidgetViewSnapshot;
  targetCardIds: readonly string[];
  availableScenarioIds: readonly string[];
}): OccupancyLiveAnalysisImportResult {
  const targetIds = uniqueIds(targetCardIds);
  const targetIdSet = new Set(targetIds);
  const availableIds = new Set(uniqueIds(availableScenarioIds));
  const sourcePreferences = completeSourcePreferences(snapshot);
  const imported: CardPreference[] = [];
  const importedIds = new Set<string>();
  let sourceCardCount = 0;
  let unsupportedCount = 0;

  sourcePreferences.forEach((preference) => {
    if (preference.visible === false) return;
    sourceCardCount += 1;

    const targetId = HISTORICAL_CARD_IDS.get(preference.id) ?? preference.id;
    if (!targetIdSet.has(targetId) || importedIds.has(targetId)) {
      unsupportedCount += 1;
      return;
    }
    const scenarioIds = filterAvailableIds(preference.scenarioIds, availableIds);
    if (preference.scenarioSelectionMode === "custom" && !scenarioIds?.length) {
      // Never widen a selection to every scenario when its saved IDs no
      // longer belong to the current company's catalog.
      unsupportedCount += 1;
      return;
    }

    importedIds.add(targetId);
    imported.push({
      chartType: preference.chartType,
      color: preference.color,
      height: preference.height,
      heightLevel: preference.heightLevel,
      id: targetId,
      scenarioIds,
      scenarioOrder: filterAvailableIds(preference.scenarioOrder, availableIds),
      scenarioSelectionMode: preference.scenarioSelectionMode,
      size: preference.size,
      title: preference.title,
      visible: true,
      widthLevel: preference.widthLevel,
      zoom: preference.zoom,
    });
  });

  return {
    // saveCardPreferences fills omitted IDs with visible defaults. Explicitly
    // hide every non-imported target to preserve the saved view's composition.
    preferences: [
      ...imported,
      ...targetIds
        .filter((id) => !importedIds.has(id))
        .map((id): CardPreference => ({ id, visible: false })),
    ],
    sourceCardCount,
    unsupportedCount,
    importedCount: imported.length,
  };
}

export function occupancyPresetStorageValue(
  snapshot: WidgetViewSnapshot,
  baseKey: string,
): unknown {
  const entry = snapshot.storage.find((candidate) => candidate.baseKey === baseKey);
  if (!entry) return undefined;

  try {
    return JSON.parse(entry.value) as unknown;
  } catch {
    return undefined;
  }
}

function completeSourcePreferences(snapshot: WidgetViewSnapshot): CardPreference[] {
  const byId = new Map<string, CardPreference>();
  // Preserve the first position of a duplicated ID, but the last saved value.
  snapshot.preferences.forEach((preference) => {
    if (preference.id) byId.set(preference.id, preference);
  });
  uniqueIds(snapshot.cardIds).forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, visible: true });
  });
  return [...byId.values()];
}

function filterAvailableIds(
  sourceIds: readonly string[] | undefined,
  availableIds: ReadonlySet<string>,
): string[] | undefined {
  if (!sourceIds) return undefined;
  return uniqueIds(sourceIds).filter((id) => availableIds.has(id));
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
