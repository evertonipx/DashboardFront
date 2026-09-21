const OCCUPANCY_COUNT_FORMATTER = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export type OccupancyComparisonAxisMemory = {
  maximum: number;
  scopeKey: string;
};

/**
 * Keeps the live comparison scale stable for the lifetime of the widget.
 * Occupancy is discrete, so the ceiling is always a positive integer and can
 * only grow when a larger certified snapshot arrives.
 */
export function growOccupancyComparisonAxisMaximum(
  previousMaximum: number,
  values: readonly (number | null | undefined)[],
) {
  let maximum =
    Number.isFinite(previousMaximum) && previousMaximum > 0
      ? Math.ceil(previousMaximum)
      : 1;

  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      continue;
    }
    maximum = Math.max(maximum, Math.ceil(value));
  }

  return maximum;
}

export function occupancyComparisonAxisScopeKey(
  scenarioIds: readonly string[],
) {
  return [...new Set(scenarioIds.map((id) => id.trim()).filter(Boolean))]
    .sort()
    .join("|");
}

export function updateOccupancyComparisonAxisMemory(
  current: OccupancyComparisonAxisMemory,
  scopeKey: string,
  values: readonly (number | null | undefined)[],
): OccupancyComparisonAxisMemory {
  const maximum = growOccupancyComparisonAxisMaximum(
    current.scopeKey === scopeKey ? current.maximum : 1,
    values,
  );
  if (current.scopeKey === scopeKey && current.maximum === maximum) {
    return current;
  }
  return { maximum, scopeKey };
}

export function formatOccupancyCount(value: number) {
  if (!Number.isFinite(value)) return "—";
  return OCCUPANCY_COUNT_FORMATTER.format(Math.max(0, Math.round(value)));
}

export function formatOccupancyIntegerAxisTick(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0
    ? OCCUPANCY_COUNT_FORMATTER.format(numeric)
    : "";
}
