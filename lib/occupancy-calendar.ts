import {
  companyCalendarDate,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";

/** Calendar aggregates use floating civil dates, never UTC instants. */
export function occupancyCalendarDateKey(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Rebuild each civil boundary so a midnight DST gap cannot leak 01:00 into later days. */
export function shiftOccupancyCalendarDate(
  date: Date,
  days = 0,
  months = 0,
  years = 0,
) {
  const civil = new Date(0);
  civil.setUTCFullYear(date.getFullYear() + years, date.getMonth() + months, date.getDate() + days);
  civil.setUTCHours(0, 0, 0, 0);
  const result = new Date(0);
  result.setFullYear(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate());
  result.setHours(0, 0, 0, 0);
  return result;
}

export function occupancyCalendarBoundaryInstant(date: Date, timeZone: string) {
  return startOfCompanyTimeZoneCivilDay({
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
  }, timeZone);
}

export function shiftOccupancyCompanyDay(date: Date, days: number, timeZone: string) {
  const calendar = shiftOccupancyCalendarDate(companyCalendarDate(date, timeZone, "day"), days);
  return occupancyCalendarBoundaryInstant(calendar, timeZone);
}
