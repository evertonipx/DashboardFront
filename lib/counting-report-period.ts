import { COUNTING_HISTORY_START_YEAR } from "@/lib/counting-intelligence";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";

export type CountingReportPeriod = {
  from: string;
  to: string;
};

export type CountingReportPeriodPreset =
  | "history"
  | "current_year"
  | "last_12_months"
  | "custom";

const STORAGE_KEY = "ipxdata.counting-report-period.v1";
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function defaultCountingReportPeriod(
  now = new Date(),
): CountingReportPeriod {
  return {
    from: `${COUNTING_HISTORY_START_YEAR}-01`,
    to: monthInputValue(now),
  };
}

export function countingReportPeriodForPreset(
  preset: Exclude<CountingReportPeriodPreset, "custom">,
  now = new Date(),
): CountingReportPeriod {
  if (preset === "history") return defaultCountingReportPeriod(now);

  if (preset === "current_year") {
    return normalizeCountingReportPeriod(
      {
        from: `${now.getFullYear()}-01`,
        to: monthInputValue(now),
      },
      now,
    );
  }

  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return normalizeCountingReportPeriod(
    { from: monthInputValue(from), to: monthInputValue(now) },
    now,
  );
}

export function detectCountingReportPeriodPreset(
  period: CountingReportPeriod,
  now = new Date(),
): CountingReportPeriodPreset {
  const normalized = normalizeCountingReportPeriod(period, now);

  for (const preset of [
    "history",
    "current_year",
    "last_12_months",
  ] as const) {
    const candidate = countingReportPeriodForPreset(preset, now);
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
): CountingReportPeriod {
  const fallback = defaultCountingReportPeriod(now);
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
): CountingReportPeriod {
  if (typeof window === "undefined") return defaultCountingReportPeriod(now);

  try {
    const stored = window.localStorage.getItem(storageKey(companyId, scope));
    if (!stored) return defaultCountingReportPeriod(now);
    return normalizeCountingReportPeriod(
      JSON.parse(stored) as Partial<CountingReportPeriod>,
      now,
    );
  } catch {
    return defaultCountingReportPeriod(now);
  }
}

export function saveCountingReportPeriod(
  period: CountingReportPeriod,
  companyId?: string | null,
  now = new Date(),
  scope: ViewPreferenceScope = {},
) {
  const normalized = normalizeCountingReportPeriod(period, now);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
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
) {
  const dates = countingReportPeriodDates(period);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const maximumTo = includeOpenPeriod
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
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

export function minimumCountingReportMonth() {
  return `${COUNTING_HISTORY_START_YEAR}-01`;
}

export function maximumCountingReportMonth(now = new Date()) {
  return monthInputValue(now);
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
