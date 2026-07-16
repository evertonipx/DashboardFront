type CalendarAxisLabelOptions = {
  fontSize?: number;
  hideOverlap?: boolean;
  holidayIndexes?: Iterable<number>;
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

export function holidayCategoryIndexesForMonth(month: Date) {
  return holidayCategoryIndexes(calendarDatesForMonth(month));
}

export function holidayCategoryIndexes(
  dates: Iterable<Date | string | null | undefined>,
) {
  return new Set(
    Array.from(dates).flatMap((rawDate, index) => {
      if (!rawDate) return [];
      const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
      return !Number.isNaN(date.getTime()) && brazilianNationalHolidayName(date)
        ? [index]
        : [];
    }),
  );
}

export function calendarDatesForMonth(month: Date, slots = 31) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();

  return Array.from({ length: slots }, (_, index) =>
    index < dayCount ? new Date(year, monthIndex, index + 1) : null,
  );
}

export function buildCalendarMarkAreaForMonth(month: Date, slots = 31) {
  return buildCalendarMarkArea(calendarDatesForMonth(month, slots));
}

export function buildCalendarMarkArea(
  dates: Iterable<Date | string | null | undefined>,
) {
  const data = Array.from(dates).flatMap((rawDate, index) => {
    if (!rawDate) return [];
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (Number.isNaN(date.getTime())) return [];

    const holiday = brazilianNationalHolidayName(date);
    const kind = holiday
      ? "holiday"
      : date.getDay() === 0
        ? "sunday"
        : date.getDay() === 6
          ? "saturday"
          : null;
    if (!kind) return [];

    const style = calendarBandStyle(kind);
    const name = holiday ?? (kind === "saturday" ? "Sábado" : "Domingo");

    return [
      [
        {
          itemStyle: style,
          name,
          xAxis: index - 0.5,
        },
        { xAxis: index + 0.5 },
      ],
    ];
  });

  return data.length
    ? {
        animation: false,
        data,
        label: { show: false },
        silent: true,
        tooltip: { show: false },
      }
    : undefined;
}

export function brazilianNationalHolidayName(date: Date) {
  return BRAZILIAN_NATIONAL_HOLIDAYS.get(
    `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`,
  );
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
  holidayIndexes = [],
  interval = 0,
  rotate = 0,
  saturdayIndexes,
  sundayIndexes = [],
}: CalendarAxisLabelOptions) {
  const highlightedSaturdays = new Set(saturdayIndexes);
  const highlightedSundays = new Set(sundayIndexes);
  const highlightedHolidays = new Set(holidayIndexes);

  return {
    color: "#66758A",
    fontSize,
    formatter: (value: string, index: number) => {
      if (highlightedHolidays.has(index)) return `{holiday|${value}}`;
      if (highlightedSaturdays.has(index)) return `{saturday|${value}}`;
      if (highlightedSundays.has(index)) return `{sunday|${value}}`;
      return value;
    },
    hideOverlap,
    interval,
    rich: {
      holiday: {
        backgroundColor: "#FFF7E8",
        borderColor: "#E8C98E",
        borderRadius: 2,
        borderWidth: 1,
        color: "#A16207",
        fontSize,
        fontWeight: 700,
        padding: [1, 2],
      },
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

const BRAZILIAN_NATIONAL_HOLIDAYS = new Map([
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
  ["12-25", "Natal"],
]);

function calendarBandStyle(kind: "holiday" | "saturday" | "sunday") {
  if (kind === "holiday") {
    return {
      borderColor: "rgba(196, 138, 56, 0.18)",
      borderWidth: 1,
      color: "rgba(196, 138, 56, 0.075)",
    };
  }

  if (kind === "sunday") {
    return {
      borderWidth: 0,
      color: "rgba(15, 118, 110, 0.045)",
    };
  }

  return {
    borderWidth: 0,
    color: "rgba(18, 103, 196, 0.032)",
  };
}
