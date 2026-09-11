import {
  GENDER_LABELS,
  safeDemographicPercentage,
  type DemographicCrossing,
  type DemographicDistributionItem,
} from "@/lib/demographics";

export const DEMOGRAPHIC_VISIBLE_GENDER_KEYS = GENDER_LABELS;

function visibleGender(key: string) {
  return DEMOGRAPHIC_VISIBLE_GENDER_KEYS.some((candidate) => candidate === key);
}

/** Presentation only: raw totals, age/emotion data and source objects stay intact. */
export function visibleDemographicDistribution<Key extends string>(
  items: readonly DemographicDistributionItem<Key>[],
  dimension: string,
): DemographicDistributionItem<Key>[] {
  if (dimension !== "gender") return [...items];
  const visible = items.filter((item) => visibleGender(item.key));
  const percentages = displayPercentages(visible.map((item) => item.count));
  return visible.map((item, index) => ({ ...item, percentage: percentages[index] }));
}

export function visibleDemographicCrossing<RowKey extends string, ColumnKey extends string>(
  crossing: DemographicCrossing<RowKey, ColumnKey>,
  dimension: "age-gender" | "age-emotion",
): DemographicCrossing<RowKey, ColumnKey> {
  if (dimension !== "age-gender") return crossing;
  const columns = crossing.columns.filter((column) => visibleGender(column.key));
  const rows = crossing.rows.map((row) => {
    const cells = row.cells.filter((cell) => visibleGender(cell.columnKey));
    return { ...row, cells, count: cells.reduce((sum, cell) => sum + cell.count, 0),
      observed: cells.some((cell) => cell.observed) };
  });
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const columnTotals = columns.map((column) => {
    const cells = rows.flatMap((row) => row.cells.filter((cell) => cell.columnKey === column.key));
    return { ...column, count: cells.reduce((sum, cell) => sum + cell.count, 0),
      observed: cells.some((cell) => cell.observed), percentage: null as number | null };
  });
  const columnPercentages = displayPercentages(columnTotals.map((column) => column.count));
  const rowPercentages = displayPercentages(rows.map((row) => row.count));
  return {
    ...crossing,
    columns,
    total,
    columnTotals: columnTotals.map((column, index) => ({ ...column, percentage: columnPercentages[index] })),
    rows: rows.map((row, index) => ({
      ...row,
      percentage: rowPercentages[index],
      cells: row.cells.map((cell) => ({
        ...cell,
        percentage: safeDemographicPercentage(cell.count, total),
        rowPercentage: safeDemographicPercentage(cell.count, row.count),
        columnPercentage: safeDemographicPercentage(cell.count,
          columnTotals.find((column) => column.key === cell.columnKey)?.count ?? 0),
      })),
    })),
  };
}

// Largest-remainder rounding keeps a positive composition at exactly 100%.
// No identified detections means no denominator, never an invented 0%/100%.
function displayPercentages(counts: readonly number[]): (number | null)[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return counts.map(() => null);
  const raw = counts.map((count) => count / total * 10_000);
  const points = raw.map(Math.floor);
  const remaining = 10_000 - points.reduce((sum, count) => sum + count, 0);
  const order = raw.map((value, index) => ({ index, remainder: value - points[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) points[order[index % order.length].index] += 1;
  return points.map((value) => value / 100);
}
