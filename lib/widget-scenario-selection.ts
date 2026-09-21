import type { CardScenarioSelection } from "@/lib/view-preferences";

export type WidgetScenarioOption = {
  id: string;
  name: string;
};

export function resolveWidgetScenarios<TScenario extends WidgetScenarioOption>(
  scenarios: TScenario[],
  selection: CardScenarioSelection,
  inheritedScenarios: TScenario[] = [],
): TScenario[] {
  const selectedIds = new Set(selection.scenarioIds);
  const candidates = selection.mode === "inherit"
    ? inheritedScenarios
    : selection.mode === "all"
      ? scenarios
      : scenarios.filter((scenario) => selectedIds.has(scenario.id));
  const orderedIds = orderWidgetScenarioIds(
    candidates.map((scenario) => scenario.id),
    selection.scenarioOrder,
  );
  const byId = new Map(candidates.map((scenario) => [scenario.id, scenario]));
  return orderedIds.flatMap((id) => {
    const scenario = byId.get(id);
    return scenario ? [scenario] : [];
  });
}

/**
 * Reconciles a saved presentation order with the scenarios currently in
 * scope. Missing/deleted IDs are ignored and newly available scenarios are
 * appended in their natural source order.
 */
export function orderWidgetScenarioIds(
  availableIds: readonly string[],
  preferredOrder: readonly string[] | undefined,
): string[] {
  const normalizedAvailable = uniqueIds(availableIds);
  const available = new Set(normalizedAvailable);
  const ordered = uniqueIds(preferredOrder ?? []).filter((id) =>
    available.has(id),
  );
  const included = new Set(ordered);
  normalizedAvailable.forEach((id) => {
    if (!included.has(id)) {
      included.add(id);
      ordered.push(id);
    }
  });
  return ordered;
}

export function widgetScenarioSelectionKey(
  selection: CardScenarioSelection,
  inheritedScenarios: WidgetScenarioOption[] = [],
) {
  const ids =
    selection.mode === "inherit"
      ? inheritedScenarios.map((scenario) => scenario.id)
      : selection.mode === "all"
        ? ["*"]
        : selection.scenarioIds;
  // This key identifies the data composition, not its presentation. A manual
  // reorder must never invalidate or repeat the underlying requests.
  return `${selection.mode}:${uniqueIds(ids).sort().join(",")}`;
}

export function widgetScenarioSelectionLabel(
  selectedScenarios: WidgetScenarioOption[],
  selection: CardScenarioSelection,
) {
  if (selection.mode === "inherit") return "Filtro da tela";
  if (selection.mode === "all") {
    return `Todos os cenários (${selectedScenarios.length})`;
  }
  if (!selectedScenarios.length) return "Nenhum cenário selecionado";
  if (selectedScenarios.length === 1) return selectedScenarios[0].name;

  const visibleNames = selectedScenarios
    .slice(0, 3)
    .map((scenario) => scenario.name);
  const remainingCount = selectedScenarios.length - visibleNames.length;
  return remainingCount > 0
    ? `${visibleNames.join(", ")} +${remainingCount}`
    : visibleNames.join(" + ");
}

function uniqueIds(ids: readonly string[]) {
  const unique: string[] = [];
  const seen = new Set<string>();
  ids.forEach((candidate) => {
    const id = candidate.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    unique.push(id);
  });
  return unique;
}
