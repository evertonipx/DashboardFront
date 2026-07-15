type CalendarAxisLabelOptions = {
  fontSize?: number;
  hideOverlap?: boolean;
  interval?: number;
  rotate?: number;
  saturdayIndexes: Iterable<number>;
};

export const DAY_OF_MONTH_AXIS_LABELS = Array.from(
  { length: 31 },
  (_, index) => String(index + 1),
);

export function saturdayCategoryIndexesForMonth(month: Date) {
  const indexes = new Set<number>();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();

  for (let day = 1; day <= dayCount; day += 1) {
    if (new Date(year, monthIndex, day).getDay() === 6) {
      indexes.add(day - 1);
    }
  }

  return indexes;
}

export function buildCalendarAxisLabel({
  fontSize = 10,
  hideOverlap = false,
  interval = 0,
  rotate = 0,
  saturdayIndexes,
}: CalendarAxisLabelOptions) {
  const highlightedIndexes = new Set(saturdayIndexes);

  return {
    color: "#66758A",
    fontSize,
    formatter: (value: string, index: number) =>
      highlightedIndexes.has(index) ? `{saturday|${value}}` : value,
    hideOverlap,
    interval,
    rich: {
      saturday: {
        backgroundColor: "#EAF3FF",
        borderColor: "#B7D7FF",
        borderRadius: 2,
        borderWidth: 1,
        color: "#0B4EA2",
        fontSize,
        fontWeight: 700,
        padding: [1, 2],
      },
    },
    rotate,
  };
}
