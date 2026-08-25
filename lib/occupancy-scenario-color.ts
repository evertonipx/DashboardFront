/**
 * Assigns a scenario a stable palette slot.
 *
 * The slot depends only on the scenario id and the shared palette, so sorting,
 * filtering or changing an individual card accent cannot change its identity.
 */
export function occupancyScenarioColor(
  scenarioId: string,
  widgetColor: string,
  colorPalette: readonly string[],
) {
  let hash = 0;
  for (let index = 0; index < scenarioId.length; index += 1) {
    hash = (hash * 31 + scenarioId.charCodeAt(index)) >>> 0;
  }

  const palette = Array.from(
    new Set(colorPalette.map((color) => color.toUpperCase())),
  );
  if (!palette.length) palette.push(widgetColor.toUpperCase());
  return palette[hash % palette.length];
}

export function buildOccupancyScenarioColorMap(
  scenarioIds: readonly string[],
  widgetColor: string,
  colorPalette: readonly string[],
) {
  return new Map(
    Array.from(new Set(scenarioIds)).map((scenarioId) => [
      scenarioId,
      occupancyScenarioColor(scenarioId, widgetColor, colorPalette),
    ]),
  );
}
