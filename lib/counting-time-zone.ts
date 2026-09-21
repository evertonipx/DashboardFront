import {
  companyCalendarDate,
  companyZonedDateParts,
  endOfCompanyTimeZoneHour,
  requireCertifiedCompanyTimeZone,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
  startOfCompanyTimeZoneHour,
  type CompanyTimeZoneResolution,
} from "@/lib/company-time-zone";

export type CountingCalendarGranularity =
  | "day"
  | "week"
  | "month"
  | "semester"
  | "year";

export type CountingDateRange = Readonly<{ from: Date; to: Date }>;

/**
 * Legacy name kept while callers migrate. Its contract now only validates
 * the selected company's IANA timezone; it never reads the browser timezone.
 */
export function requireCountingRuntimeTimeZone(timeZone: string) {
  return requireCompanyTimeZone(timeZone);
}

/** Certifies that the timezone belongs to the selected company, not a fallback. */
export function requireCertifiedCountingTimeZone(
  resolution: CompanyTimeZoneResolution,
) {
  return requireCertifiedCompanyTimeZone(resolution);
}

/** @deprecated Use requireCertifiedCountingTimeZone. */
export const requireCertifiedCountingRuntimeTimeZone =
  requireCertifiedCountingTimeZone;

/**
 * Calendar aggregate endpoints use floating civil buckets. The returned Date
 * carries the company's Y-M-D in the runtime calendar; it is not an instant
 * and must only be serialized through aggregateQueryIso.
 */
export function countingCalendarDate(
  instant: Date,
  timeZone: string,
  granularity: Exclude<CountingCalendarGranularity, "week" | "semester"> = "day",
) {
  return companyCalendarDate(instant, requireCompanyTimeZone(timeZone), granularity);
}

export function countingCalendarStart(
  instant: Date,
  timeZone: string,
  granularity: CountingCalendarGranularity,
) {
  const day = countingCalendarDate(instant, timeZone, "day");
  if (granularity === "day") return day;
  if (granularity === "week") {
    return countingAddCalendarDays(day, -((day.getDay() + 6) % 7));
  }
  if (granularity === "month") {
    return new Date(day.getFullYear(), day.getMonth(), 1);
  }
  if (granularity === "semester") {
    return new Date(day.getFullYear(), day.getMonth() < 6 ? 0 : 6, 1);
  }
  return new Date(day.getFullYear(), 0, 1);
}

export function countingAddCalendarDays(date: Date, amount: number) {
  requireCalendarDate(date);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function countingAddCalendarMonths(date: Date, amount: number) {
  requireCalendarDate(date);
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function countingAddCalendarYears(date: Date, amount: number) {
  requireCalendarDate(date);
  return new Date(date.getFullYear() + amount, date.getMonth(), date.getDate());
}

/** Converts a floating company calendar boundary into its real UTC instant. */
export function countingCalendarBoundaryInstant(
  calendarDate: Date,
  timeZone: string,
) {
  requireCalendarDate(calendarDate);
  return startOfCompanyTimeZoneCivilDay(
    {
      day: calendarDate.getDate(),
      month: calendarDate.getMonth() + 1,
      year: calendarDate.getFullYear(),
    },
    requireCompanyTimeZone(timeZone),
  );
}

export function countingCalendarRangeToInstants(
  range: CountingDateRange,
  timeZone: string,
): CountingDateRange {
  if (range.from >= range.to) {
    throw new RangeError("O intervalo civil da Contagem é inválido.");
  }
  const from = countingCalendarBoundaryInstant(range.from, timeZone);
  const to = countingCalendarBoundaryInstant(range.to, timeZone);
  if (from >= to) {
    throw new RangeError("O intervalo IANA da Contagem é inválido.");
  }
  return { from, to };
}

export function countingStartOfDayInstant(instant: Date, timeZone: string) {
  return countingCalendarBoundaryInstant(
    countingCalendarDate(instant, timeZone, "day"),
    timeZone,
  );
}

export function countingStartOfHourInstant(instant: Date, timeZone: string) {
  return startOfCompanyTimeZoneHour(instant, requireCompanyTimeZone(timeZone));
}

export function countingEndOfHourInstant(instant: Date, timeZone: string) {
  return endOfCompanyTimeZoneHour(instant, requireCompanyTimeZone(timeZone));
}

/**
 * Resolves a civil hour on a company date. Repeated hours select the first
 * occurrence; a skipped DST hour advances to the first real following hour.
 */
export function countingCalendarHourInstant(
  calendarDate: Date,
  hour: number,
  timeZone: string,
) {
  if (!Number.isSafeInteger(hour) || hour < 0 || hour > 24) {
    throw new RangeError("A hora civil da Contagem deve estar entre 0 e 24.");
  }
  if (hour === 24) {
    return countingCalendarBoundaryInstant(
      countingAddCalendarDays(calendarDate, 1),
      timeZone,
    );
  }

  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const from = countingCalendarBoundaryInstant(calendarDate, canonicalTimeZone);
  const to = countingCalendarBoundaryInstant(
    countingAddCalendarDays(calendarDate, 1),
    canonicalTimeZone,
  );
  let cursor = from;
  while (cursor < to) {
    const civilHour = companyZonedDateParts(cursor, canonicalTimeZone).hour;
    if (civilHour >= hour) return cursor;
    cursor = endOfCompanyTimeZoneHour(cursor, canonicalTimeZone);
  }
  return to;
}

/** Moves an hourly instant by civil years without consulting the browser. */
export function countingShiftInstantYearsClamped(
  instant: Date,
  amount: number,
  timeZone: string,
) {
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const parts = companyZonedDateParts(instant, canonicalTimeZone);
  const targetYear = parts.year + amount;
  const maximumDay = new Date(Date.UTC(targetYear, parts.month, 0)).getUTCDate();
  const calendarDate = new Date(
    targetYear,
    parts.month - 1,
    Math.min(parts.day, maximumDay),
  );
  const hourStart = countingCalendarHourInstant(
    calendarDate,
    parts.hour,
    canonicalTimeZone,
  );
  return new Date(
    hourStart.getTime() +
      parts.minute * 60_000 +
      parts.second * 1_000 +
      instant.getMilliseconds(),
  );
}

function requireCalendarDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A data civil da Contagem é inválida.");
  }
}
