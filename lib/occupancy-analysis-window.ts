import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";

export type ClosedOccupancyHistoricalGranularity = "week" | "month";

export type OccupancyAnalysisDateRangeInput = {
  endInput: string;
  startInput: string;
};

export type ResolvedOccupancyAnalysisRange = OccupancyAnalysisDateRangeInput & {
  dayCount: number;
  from: Date;
  includesToday: boolean;
  reference: Date;
  to: Date;
};

export const MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS = 366;

const OCCUPANCY_ANALYSIS_RANGE_STORAGE_KEY =
  "ipxdata.occupancy-analysis-range.v1";

export type OccupancyAnalysisDatasetKeyInput = {
  analysis: boolean;
  companyScopeId?: string | null;
  endDateInput: string;
  intradayComparison: string;
  scopeId?: string | null;
  showPreviousPeriod: boolean;
  startDateInput: string;
  timeZone: string;
};

export function occupancyAnalysisDatasetKey({
  analysis,
  companyScopeId,
  endDateInput,
  intradayComparison,
  scopeId,
  showPreviousPeriod,
  startDateInput,
  timeZone,
}: OccupancyAnalysisDatasetKeyInput) {
  return JSON.stringify([
    companyScopeId?.trim() ?? "",
    timeZone.trim(),
    scopeId?.trim() ?? "",
    analysis ? [startDateInput, endDateInput] : "live",
    showPreviousPeriod,
    showPreviousPeriod ? intradayComparison : "",
  ]);
}

export function normalizeOccupancyAnalysisDateRangeInput(
  startInput: string,
  endInput: string,
  maximum: Date | string,
): OccupancyAnalysisDateRangeInput {
  const maximumInput = resolveMaximumDateInput(maximum);
  const normalizedEnd = normalizeDateInputAgainstMaximum(
    endInput,
    maximumInput,
  );
  const normalizedStart = normalizeDateInputAgainstMaximum(
    startInput,
    maximumInput,
  );

  // A UI impede intervalos invertidos. O resolver também fecha de forma
  // conservadora caso receba estado persistido ou programático inválido.
  return normalizedStart > normalizedEnd
    ? { endInput: normalizedEnd, startInput: normalizedEnd }
    : { endInput: normalizedEnd, startInput: normalizedStart };
}

export function resolveOccupancyAnalysisRange(
  clock: Date,
  startInput: string,
  endInput: string,
  analysis: boolean,
  maximumInput = formatOccupancyAnalysisDateInput(clock),
): ResolvedOccupancyAnalysisRange {
  requireValidDate(clock);
  const todayInput = resolveMaximumDateInput(maximumInput);
  const normalized = analysis
    ? normalizeOccupancyAnalysisDateRangeInput(startInput, endInput, todayInput)
    : { endInput: todayInput, startInput: todayInput };
  const selectedStart = parseOccupancyAnalysisDateInput(
    normalized.startInput,
  );
  const selectedEnd = parseOccupancyAnalysisDateInput(normalized.endInput);
  if (!selectedStart || !selectedEnd) {
    throw new RangeError("O intervalo da análise de ocupação é inválido.");
  }

  const dayCount = countOccupancyAnalysisDateRangeDays(
    normalized.startInput,
    normalized.endInput,
  );
  if (dayCount > MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS) {
    throw new RangeError(
      `O intervalo da análise de ocupação não pode exceder ${MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS} dias.`,
    );
  }

  const from = startOfLocalDay(selectedStart);
  const to = startOfLocalDay(selectedEnd);
  to.setDate(to.getDate() + 1);
  const includesToday = normalized.endInput === todayInput;

  return {
    ...normalized,
    dayCount,
    from,
    includesToday,
    reference: includesToday ? new Date(clock) : new Date(to.getTime() - 1),
    to,
  };
}

export function countOccupancyAnalysisDateRangeDays(
  startInput: string,
  endInput: string,
) {
  const start = parseOccupancyAnalysisDateInput(startInput);
  const end = parseOccupancyAnalysisDateInput(endInput);
  if (!start || !end || start > end) {
    throw new RangeError("O intervalo da análise de ocupação é inválido.");
  }

  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1_000)) + 1;
}

export function listClosedOccupancyBucketsWithinRange(
  from: Date,
  to: Date,
  granularity: ClosedOccupancyHistoricalGranularity,
) {
  requireValidDate(from);
  requireValidDate(to);
  if (from > to) {
    throw new RangeError("O intervalo histórico de ocupação é inválido.");
  }
  if (from.getTime() === to.getTime()) return [];

  let cursor =
    granularity === "week" ? startOfLocalWeek(from) : startOfLocalMonth(from);
  if (cursor < from) cursor = addHistoricalBucket(cursor, granularity);

  const buckets: Date[] = [];
  while (cursor < to) {
    const next = addHistoricalBucket(cursor, granularity);
    if (next > to) break;
    buckets.push(new Date(cursor));
    cursor = next;
    if (buckets.length > MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS) {
      throw new RangeError("O intervalo histórico de ocupação é excessivo.");
    }
  }
  return buckets;
}

export function occupancyAnalysisClosedBucketCutoff(
  range: ResolvedOccupancyAnalysisRange,
) {
  return range.includesToday
    ? startOfLocalDay(range.reference)
    : new Date(range.to);
}

export function loadOccupancyAnalysisDateRange(
  maximum: Date | string,
  companyId?: string | null,
  userId?: string | null,
): OccupancyAnalysisDateRangeInput {
  const todayInput = resolveMaximumDateInput(maximum);
  const fallback = { endInput: todayInput, startInput: todayInput };
  if (typeof window === "undefined") return fallback;

  try {
    const stored = readUserViewScopedStorageEntry(
      OCCUPANCY_ANALYSIS_RANGE_STORAGE_KEY,
      companyId,
      userId,
    );
    if (!stored?.value) return fallback;
    const range = JSON.parse(
      stored.value,
    ) as Partial<OccupancyAnalysisDateRangeInput>;
    if (
      typeof range.startInput !== "string" ||
      typeof range.endInput !== "string" ||
      !parseOccupancyAnalysisDateInput(range.startInput) ||
      !parseOccupancyAnalysisDateInput(range.endInput)
    ) {
      return fallback;
    }
    const normalizedStart = normalizeDateInputAgainstMaximum(
      range.startInput,
      todayInput,
    );
    const normalizedEnd = normalizeDateInputAgainstMaximum(
      range.endInput,
      todayInput,
    );
    if (normalizedStart > normalizedEnd) return fallback;
    const normalized = normalizeOccupancyAnalysisDateRangeInput(
      normalizedStart,
      normalizedEnd,
      todayInput,
    );
    return countOccupancyAnalysisDateRangeDays(
      normalized.startInput,
      normalized.endInput,
    ) <= MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS
      ? normalized
      : fallback;
  } catch {
    return fallback;
  }
}

export function saveOccupancyAnalysisDateRange(
  range: OccupancyAnalysisDateRangeInput,
  companyId?: string | null,
  userId?: string | null,
) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        occupancyAnalysisDateRangeStorageKey(companyId, userId),
        JSON.stringify(range),
      );
    } catch {
      // Persistência é conveniência; a consulta aplicada continua válida.
    }
  }
  return range;
}

export function buildClosedOccupancyHistoricalRange(
  reference: Date,
  granularity: ClosedOccupancyHistoricalGranularity,
  bucketCount: number,
) {
  requireValidDate(reference);
  if (!Number.isSafeInteger(bucketCount) || bucketCount < 1) {
    throw new RangeError("A quantidade de buckets históricos é inválida.");
  }

  const to =
    granularity === "week"
      ? startOfLocalWeek(reference)
      : startOfLocalMonth(reference);
  const from = new Date(to);
  if (granularity === "week") {
    from.setDate(from.getDate() - bucketCount * 7);
  } else {
    from.setMonth(from.getMonth() - bucketCount);
  }

  return { from, to };
}

export function normalizeOccupancyAnalysisDateInput(
  value: string,
  maximum: Date,
) {
  requireValidDate(maximum);
  const maximumInput = formatOccupancyAnalysisDateInput(maximum);
  const parsed = parseOccupancyAnalysisDateInput(value);
  if (!parsed) return maximumInput;

  const normalized = formatOccupancyAnalysisDateInput(parsed);
  return normalized > maximumInput ? maximumInput : normalized;
}

function normalizeDateInputAgainstMaximum(value: string, maximumInput: string) {
  const parsed = parseOccupancyAnalysisDateInput(value);
  if (!parsed) return maximumInput;
  const normalized = formatOccupancyAnalysisDateInput(parsed);
  return normalized > maximumInput ? maximumInput : normalized;
}

export function resolveOccupancyAnalysisReference(
  clock: Date,
  dateInput: string,
  analysis: boolean,
) {
  requireValidDate(clock);
  if (!analysis) return clock;

  const normalized = normalizeOccupancyAnalysisDateInput(dateInput, clock);
  const selected = parseOccupancyAnalysisDateInput(normalized);
  if (!selected || isSameOccupancyAnalysisDay(selected, clock)) return clock;

  const dayStart = startOfLocalDay(selected);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return new Date(dayEnd.getTime() - 1);
}

export function parseOccupancyAnalysisDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(0);
  parsed.setFullYear(year, monthIndex, day);
  parsed.setHours(12, 0, 0, 0);

  return parsed.getFullYear() === year &&
    parsed.getMonth() === monthIndex &&
    parsed.getDate() === day
    ? parsed
    : null;
}

export function formatOccupancyAnalysisDateInput(date: Date) {
  requireValidDate(date);
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function shiftOccupancyAnalysisDateInput(
  value: string,
  amount: number,
) {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("O deslocamento da data de ocupação é inválido.");
  }
  const date = parseOccupancyAnalysisDateInput(value);
  if (!date) return value;
  date.setDate(date.getDate() + amount);
  return formatOccupancyAnalysisDateInput(date);
}

export function isSameOccupancyAnalysisDay(left: Date, right: Date) {
  return (
    formatOccupancyAnalysisDateInput(left) ===
    formatOccupancyAnalysisDateInput(right)
  );
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfLocalWeek(date: Date) {
  const next = startOfLocalDay(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addHistoricalBucket(
  date: Date,
  granularity: ClosedOccupancyHistoricalGranularity,
) {
  const next = new Date(date);
  if (granularity === "week") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function occupancyAnalysisDateRangeStorageKey(
  companyId?: string | null,
  userId?: string | null,
) {
  return getUserViewScopedStorageKey(
    OCCUPANCY_ANALYSIS_RANGE_STORAGE_KEY,
    companyId,
    userId,
  );
}

function resolveMaximumDateInput(maximum: Date | string) {
  if (maximum instanceof Date) {
    requireValidDate(maximum);
    return formatOccupancyAnalysisDateInput(maximum);
  }
  const parsed = parseOccupancyAnalysisDateInput(maximum);
  if (!parsed) {
    throw new RangeError("A data máxima da análise de ocupação é inválida.");
  }
  return formatOccupancyAnalysisDateInput(parsed);
}

function requireValidDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("A data da análise de ocupação é inválida.");
  }
}
