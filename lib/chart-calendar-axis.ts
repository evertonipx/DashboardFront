type CalendarAxisLabelOptions = {
  fontSize?: number;
  hideOverlap?: boolean;
  interval?: number;
  rotate?: number;
  saturdayIndexes: Iterable<number>;
  sundayIndexes?: Iterable<number>;
};

export const DAY_OF_MONTH_AXIS_LABELS = Array.from(
  { length: 31 },
  (_, index) => String(index + 1),
);

export function saturdayCategoryIndexesForMonth(month: Date) {
  return categoryIndexesForWeekday(month, 6);
}

export function sundayCategoryIndexesForMonth(month: Date) {
  return categoryIndexesForWeekday(month, 0);
}

function categoryIndexesForWeekday(month: Date, weekday: number) {
  const indexes = new Set<number>();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();

  for (let day = 1; day <= dayCount; day += 1) {
    if (new Date(year, monthIndex, day).getDay() === weekday) {
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
  sundayIndexes = [],
}: CalendarAxisLabelOptions) {
  const highlightedSaturdays = new Set(saturdayIndexes);
  const highlightedSundays = new Set(sundayIndexes);

  return {
    color: "#66758A",
    fontSize,
    formatter: (value: string, index: number) => {
      if (highlightedSaturdays.has(index)) return `{saturday|${value}}`;
      if (highlightedSundays.has(index)) return `{sunday|${value}}`;
      return value;
    },
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
      sunday: {
        backgroundColor: "#EAF8F4",
        borderColor: "#B8E0D2",
        borderRadius: 2,
        borderWidth: 1,
        color: "#0F766E",
        fontSize,
        fontWeight: 700,
        padding: [1, 2],
      },
    },
    rotate,
  };
}
