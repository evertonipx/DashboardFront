import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import { writeUserGridPreference } from "@/lib/user-grid-local";

export const DEMOGRAPHICS_DATE_RANGE_STORAGE_KEY =
  "ipxdata.demographics-range.v1";
export const MAX_DEMOGRAPHICS_DATE_RANGE_DAYS = 31;

export type DemographicsDateRange = {
  endInput: string;
  startInput: string;
};

export type DemographicsDateRangeSurface = "analysis" | "reports";

export type DemographicsDateRangeScope = {
  companyId?: string | null;
  surface: DemographicsDateRangeSurface;
  userId?: string | null;
};

export type DemographicsDateRangeContext = DemographicsDateRangeScope & {
  fallback: DemographicsDateRange;
  todayInput: string;
};

/**
 * Normalizes an inclusive civil-date range without consulting the browser
 * timezone. Invalid, inverted, or overlong values resolve to the caller's
 * validated fallback. Future bounds are clamped to the supplied company day.
 */
export function normalizeDemographicsDateRange(
  range: Partial<DemographicsDateRange> | null | undefined,
  context: Pick<DemographicsDateRangeContext, "fallback" | "todayInput">,
): DemographicsDateRange {
  const todayInput = requireDateInput(context.todayInput, "data atual");
  const fallback = normalizeFallback(context.fallback, todayInput);
  if (
    typeof range?.startInput !== "string" ||
    typeof range.endInput !== "string" ||
    parseDateInput(range.startInput) === null ||
    parseDateInput(range.endInput) === null
  ) {
    return fallback;
  }

  const candidate = {
    startInput: clampDateInput(range.startInput, todayInput),
    endInput: clampDateInput(range.endInput, todayInput),
  };
  if (
    candidate.startInput > candidate.endInput ||
    countDemographicsDateRangeDays(candidate) > MAX_DEMOGRAPHICS_DATE_RANGE_DAYS
  ) {
    return fallback;
  }
  return candidate;
}

export function loadDemographicsDateRange(
  context: DemographicsDateRangeContext,
): DemographicsDateRange {
  const surface = requireSurface(context.surface);
  const fallback = normalizeDemographicsDateRange(context.fallback, context);
  if (typeof window === "undefined") return fallback;

  try {
    const stored = readUserViewScopedStorageEntry(
      DEMOGRAPHICS_DATE_RANGE_STORAGE_KEY,
      context.companyId,
      context.userId,
      surface,
    );
    if (!stored?.value) return fallback;
    return normalizeDemographicsDateRange(
      JSON.parse(stored.value) as Partial<DemographicsDateRange>,
      { fallback, todayInput: context.todayInput },
    );
  } catch {
    return fallback;
  }
}

export function saveDemographicsDateRange(
  range: Partial<DemographicsDateRange> | null | undefined,
  context: DemographicsDateRangeContext,
): DemographicsDateRange {
  const normalized = normalizeDemographicsDateRange(range, context);
  if (typeof window !== "undefined") {
    writeUserGridPreference(
      demographicsDateRangeStorageKey(context),
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

export function demographicsDateRangeStorageKey(
  scope: DemographicsDateRangeScope,
) {
  const surface = requireSurface(scope.surface);
  return getUserViewScopedStorageKey(
    DEMOGRAPHICS_DATE_RANGE_STORAGE_KEY,
    scope.companyId,
    scope.userId,
    surface,
  );
}

export function countDemographicsDateRangeDays(range: DemographicsDateRange) {
  const start = parseDateInput(range.startInput);
  const end = parseDateInput(range.endInput);
  if (start === null || end === null || start > end) {
    throw new RangeError("O período demográfico é inválido.");
  }
  return Math.round((end - start) / 86_400_000) + 1;
}

function normalizeFallback(
  fallback: DemographicsDateRange,
  todayInput: string,
) {
  if (
    !fallback ||
    typeof fallback.startInput !== "string" ||
    typeof fallback.endInput !== "string" ||
    parseDateInput(fallback.startInput) === null ||
    parseDateInput(fallback.endInput) === null
  ) {
    throw new RangeError("O período demográfico padrão é inválido.");
  }
  const normalized = {
    startInput: clampDateInput(fallback.startInput, todayInput),
    endInput: clampDateInput(fallback.endInput, todayInput),
  };
  if (
    normalized.startInput > normalized.endInput ||
    countDemographicsDateRangeDays(normalized) >
      MAX_DEMOGRAPHICS_DATE_RANGE_DAYS
  ) {
    throw new RangeError(
      `O período demográfico padrão deve ter no máximo ${MAX_DEMOGRAPHICS_DATE_RANGE_DAYS} dias inclusivos.`,
    );
  }
  return normalized;
}

function requireDateInput(value: string, label: string) {
  if (parseDateInput(value) === null) {
    throw new RangeError(`A ${label} do período demográfico é inválida.`);
  }
  return value;
}

function requireSurface(value: unknown): DemographicsDateRangeSurface {
  if (value !== "analysis" && value !== "reports") {
    throw new RangeError("A superfície do período demográfico é inválida.");
  }
  return value;
}

function clampDateInput(value: string, maximum: string) {
  return value > maximum ? maximum : value;
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
