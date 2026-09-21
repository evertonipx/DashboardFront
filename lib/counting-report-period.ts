import { COUNTING_HISTORY_START_YEAR } from "@/lib/counting-intelligence";
import { companyCalendarDate } from "@/lib/company-time-zone";
import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import { writeUserGridPreference } from "@/lib/user-grid-local";

export type CountingReportPeriod = {
  from: string;
  to: string;
};

export type CountingReportPeriodPreset =
  | "history"
  | "current_year"
  | "last_12_months"
  | "custom";

export const COUNTING_REPORT_HISTORY_YEARS = 4;

const STORAGE_KEY = "ipxdata.counting-report-period.v1";
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function defaultCountingReportPeriod(
  now = new Date(),
  timeZone?: string,
): CountingReportPeriod {
  return {
    from: minimumCountingReportMonth(now, timeZone),
    to: monthInputValue(referenceCalendarDate(now, timeZone)),
  };
}

export function countingReportPeriodForPreset(
  preset: Exclude<CountingReportPeriodPreset, "custom">,
  now = new Date(),
  timeZone?: string,
): CountingReportPeriod {
  if (preset === "history") return defaultCountingReportPeriod(now, timeZone);

  const calendarNow = referenceCalendarDate(now, timeZone);

  if (preset === "current_year") {
    return normalizeCountingReportPeriod(
      {
        from: `${calendarNow.getFullYear()}-01`,
        to: monthInputValue(calendarNow),
      },
      now,
      timeZone,
    );
  }

  const from = new Date(
    calendarNow.getFullYear(),
    calendarNow.getMonth() - 11,
    1,
  );
  return normalizeCountingReportPeriod(
    { from: monthInputValue(from), to: monthInputValue(calendarNow) },
    now,
    timeZone,
  );
}

export function detectCountingReportPeriodPreset(
  period: CountingReportPeriod,
  now = new Date(),
  timeZone?: string,
): CountingReportPeriodPreset {
  const normalized = normalizeCountingReportPeriod(period, now, timeZone);

  for (const preset of [
    "history",
    "current_year",
    "last_12_months",
  ] as const) {
    const candidate = countingReportPeriodForPreset(preset, now, timeZone);
    if (
      candidate.from === normalized.from &&
      candidate.to === normalized.to
    ) {
      return preset;
    }
  }

  return "custom";
}

export function normalizeCountingReportPeriod(
  period: Partial<CountingReportPeriod> | null | undefined,
  now = new Date(),
  timeZone?: string,
): CountingReportPeriod {
  const fallback = defaultCountingReportPeriod(now, timeZone);
  const minimum = fallback.from;
  const maximum = fallback.to;
  let from = isMonthInputValue(period?.from) ? period.from : fallback.from;
  let to = isMonthInputValue(period?.to) ? period.to : fallback.to;

  from = clampMonth(from, minimum, maximum);
  to = clampMonth(to, minimum, maximum);

  if (from > to) {
    [from, to] = [to, from];
  }

  return { from, to };
}

export function loadCountingReportPeriod(
  companyId?: string | null,
  now = new Date(),
  scope: ViewPreferenceScope = {},
  timeZone?: string,
): CountingReportPeriod {
  if (typeof window === "undefined") {
    return defaultCountingReportPeriod(now, timeZone);
  }

  try {
    const stored = readUserViewScopedStorageEntry(
      STORAGE_KEY,
      companyId,
      scope.userId,
      scope.viewId,
    );
    if (!stored?.value) return defaultCountingReportPeriod(now, timeZone);
    return normalizeCountingReportPeriod(
      JSON.parse(stored.value) as Partial<CountingReportPeriod>,
      now,
      timeZone,
    );
  } catch {
    return defaultCountingReportPeriod(now, timeZone);
  }
}

export function saveCountingReportPeriod(
  period: CountingReportPeriod,
  companyId?: string | null,
  now = new Date(),
  scope: ViewPreferenceScope = {},
  timeZone?: string,
) {
  const normalized = normalizeCountingReportPeriod(period, now, timeZone);
  if (typeof window !== "undefined") {
    writeUserGridPreference(
      storageKey(companyId, scope),
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

export function countingReportPeriodDates(period: CountingReportPeriod) {
  const normalized = normalizeCountingReportPeriod(period);
  const from = monthValueToDate(normalized.from);
  const inclusiveTo = monthValueToDate(normalized.to);
  const to = new Date(
    inclusiveTo.getFullYear(),
    inclusiveTo.getMonth() + 1,
    1,
  );

  return { from, to };
}

export function effectiveCountingReportPeriodDates(
  period: CountingReportPeriod,
  includeOpenPeriod: boolean,
  now = new Date(),
  timeZone?: string,
) {
  const dates = countingReportPeriodDates(period);
  const calendarNow = referenceCalendarDate(now, timeZone);
  const currentMonthStart = new Date(
    calendarNow.getFullYear(),
    calendarNow.getMonth(),
    1,
  );
  const maximumTo = includeOpenPeriod
    ? new Date(calendarNow.getFullYear(), calendarNow.getMonth() + 1, 1)
    : currentMonthStart;
  const to = new Date(Math.min(dates.to.getTime(), maximumTo.getTime()));
  const from = new Date(Math.min(dates.from.getTime(), to.getTime()));

  return { from, to };
}

export function countingReportPeriodMonthCount(period: CountingReportPeriod) {
  const { from, to } = countingReportPeriodDates(period);
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    to.getMonth() -
    from.getMonth()
  );
}

export function formatCountingReportPeriod(period: CountingReportPeriod) {
  const normalized = normalizeCountingReportPeriod(period);
  return `${formatMonth(normalized.from)} a ${formatMonth(normalized.to)}`;
}

export function minimumCountingReportMonth(now = new Date(), timeZone?: string) {
  return monthInputValue(countingReportHistoryFrom(now, timeZone));
}

export function countingReportHistoryFrom(now = new Date(), timeZone?: string) {
  const currentYear = referenceCalendarDate(now, timeZone).getFullYear();
  const rangeStartYear = currentYear - (COUNTING_REPORT_HISTORY_YEARS - 1);
  const minimumYear = Math.min(
    currentYear,
    Math.max(COUNTING_HISTORY_START_YEAR, rangeStartYear),
  );

  return new Date(minimumYear, 0, 1);
}

export function maximumCountingReportMonth(now = new Date(), timeZone?: string) {
  return monthInputValue(referenceCalendarDate(now, timeZone));
}

function isMonthInputValue(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

function monthValueToDate(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function referenceCalendarDate(now: Date, timeZone?: string) {
  return timeZone ? companyCalendarDate(now, timeZone, "day") : now;
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  })
    .format(monthValueToDate(value))
    .replace(" de ", "/")
    .replace(".", "");
}

function clampMonth(value: string, minimum: string, maximum: string) {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function storageKey(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return getUserViewScopedStorageKey(
    STORAGE_KEY,
    companyId,
    scope.userId,
    scope.viewId,
  );
}
