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
  if (selection.mode === "inherit") return inheritedScenarios;
  if (selection.mode === "all") return scenarios;

  const selectedIds = new Set(selection.scenarioIds);
  return scenarios.filter((scenario) => selectedIds.has(scenario.id));
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
  return `${selection.mode}:${Array.from(new Set(ids)).sort().join(",")}`;
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
