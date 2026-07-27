export type AggregateQueryRange = Readonly<{
  from: Date;
  to: Date;
}>;

export type HourlyCalendarMonthQuery = Readonly<{
  key: string;
  from: Date;
  to: Date;
}>;

export const MAX_HOURLY_CALENDAR_MONTH_QUERIES = 240;

/**
 * Expands each half-open source range into the complete civil months that it
 * intersects. Months are deduplicated and ordered, but gaps between source
 * ranges are deliberately preserved.
 *
 * Civil constructors are used instead of fixed millisecond durations because
 * a local month may contain daylight-saving transitions.
 */
export function planHourlyCalendarMonthQueries(
  ranges: readonly AggregateQueryRange[],
): HourlyCalendarMonthQuery[] {
  if (!Array.isArray(ranges)) {
    throw new TypeError("Os intervalos de consulta devem ser uma lista.");
  }

  const queriesByKey = new Map<string, HourlyCalendarMonthQuery>();

  ranges.forEach((range, index) => {
    requireValidRange(range, index);

    let year = range.from.getFullYear();
    let monthIndex = range.from.getMonth();

    while (true) {
      const from = civilMonthBoundary(year, monthIndex);
      const { year: nextYear, monthIndex: nextMonthIndex } =
        nextCivilMonth(year, monthIndex);
      const to = civilMonthBoundary(nextYear, nextMonthIndex);

      // The exclusive upper boundary prevents an exact first-of-month `to`
      // from scheduling the month that starts there.
      if (from >= range.to) break;

      if (to > range.from) {
        const key = calendarMonthQueryKey(from);
        if (!queriesByKey.has(key)) {
          queriesByKey.set(key, { key, from, to });
          if (queriesByKey.size > MAX_HOURLY_CALENDAR_MONTH_QUERIES) {
            throw new RangeError(
              `O período horário excede ${MAX_HOURLY_CALENDAR_MONTH_QUERIES} meses. Reduza o intervalo para evitar uma carga incompleta.`,
            );
          }
        }
      }

      year = nextYear;
      monthIndex = nextMonthIndex;
    }
  });

  return Array.from(queriesByKey.values()).sort(
    (left, right) => left.from.getTime() - right.from.getTime(),
  );
}

/**
 * Returns a local civil-month key that is stable across DST offset changes.
 */
export function calendarMonthQueryKey(date: Date) {
  requireValidDate(date, "A data da chave mensal");

  return `${formatCalendarYear(date.getFullYear())}-${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function requireValidRange(
  range: AggregateQueryRange,
  index: number,
): asserts range is AggregateQueryRange {
  if (!range || typeof range !== "object") {
    throw new TypeError(
      `O intervalo de consulta na posição ${index} é inválido.`,
    );
  }

  requireValidDate(range.from, `O início do intervalo na posição ${index}`);
  requireValidDate(range.to, `O fim do intervalo na posição ${index}`);

  if (range.from >= range.to) {
    throw new RangeError(
      `O intervalo de consulta na posição ${index} deve ter início anterior ao fim.`,
    );
  }
}

function requireValidDate(
  date: Date,
  label: string,
): asserts date is Date {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} é inválida.`);
  }
}

function nextCivilMonth(year: number, monthIndex: number) {
  return monthIndex === 11
    ? { year: year + 1, monthIndex: 0 }
    : { year, monthIndex: monthIndex + 1 };
}

function civilMonthBoundary(year: number, monthIndex: number) {
  const boundary = new Date(year, monthIndex, 1, 0, 0, 0, 0);

  // The multi-argument Date constructor maps years 0..99 to 1900..1999.
  if (year >= 0 && year < 100) {
    boundary.setFullYear(year);
  }

  if (Number.isNaN(boundary.getTime())) {
    throw new RangeError("O intervalo mensal excede os limites de data.");
  }

  return boundary;
}

function formatCalendarYear(year: number) {
  if (year >= 0) return String(year).padStart(4, "0");
  return `-${String(Math.abs(year)).padStart(6, "0")}`;
}
