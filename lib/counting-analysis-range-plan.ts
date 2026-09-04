import type { ScenarioAnalyticsGranularity } from "@/lib/scenario-analytics";

export type CountingAnalysisRange = Readonly<{
  from: Date;
  to: Date;
}>;

export type CountingAnalysisRangePlan = Readonly<{
  hourlyDetail: boolean;
  mode: "detailed" | "consolidated";
  spanDays: number;
}>;

/**
 * Hourly views remain bounded to one civil month. Larger selections keep the
 * complete daily history and expose a clearly labelled hourly detail window.
 */
export const MAX_COUNTING_ANALYSIS_HOURLY_DETAIL_DAYS = 31;

const VISUAL_POINT_LIMITS: Readonly<
  Record<ScenarioAnalyticsGranularity, number>
> = {
  day: 93,
  hour: 48,
  minute: 2_000,
  month: 240,
  week: 105,
};

const MAX_COUNTING_ANALYSIS_VISUAL_CELLS = 5_000;

const GRANULARITY_ORDER: readonly ScenarioAnalyticsGranularity[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
];

export function buildCountingAnalysisRangePlan(
  range: CountingAnalysisRange,
): CountingAnalysisRangePlan {
  requireCountingAnalysisRange(range);
  const spanDays = countIntersectingCivilDays(range);
  const hourlyDetail =
    spanDays <= MAX_COUNTING_ANALYSIS_HOURLY_DETAIL_DAYS;

  return {
    hourlyDetail,
    mode: hourlyDetail ? "detailed" : "consolidated",
    spanDays,
  };
}

/**
 * Promotes only the presentation resolution. The underlying selected range
 * and its total never change; coarser points are exact sums of the same data.
 */
export function resolveCountingAnalysisVisualGranularity(
  configured: ScenarioAnalyticsGranularity,
  range: CountingAnalysisRange,
  seriesCount = 1,
): ScenarioAnalyticsGranularity {
  requireCountingAnalysisRange(range);
  if (!Number.isSafeInteger(seriesCount) || seriesCount < 1) {
    throw new RangeError(
      "A quantidade de séries da análise deve ser um inteiro positivo.",
    );
  }
  const configuredIndex = GRANULARITY_ORDER.indexOf(configured);
  if (configuredIndex < 0) {
    throw new TypeError("A granularidade visual da análise é inválida.");
  }

  for (let index = configuredIndex; index < GRANULARITY_ORDER.length; index += 1) {
    const candidate = GRANULARITY_ORDER[index];
    const points = estimateCountingAnalysisVisualPoints(range, candidate);
    if (
      (points <= VISUAL_POINT_LIMITS[candidate] &&
        points * seriesCount <= MAX_COUNTING_ANALYSIS_VISUAL_CELLS) ||
      candidate === "month"
    ) {
      return candidate;
    }
  }

  return "month";
}

export function countingAnalysisHourlyDetailRange(
  range: CountingAnalysisRange,
) {
  const plan = buildCountingAnalysisRangePlan(range);
  if (plan.hourlyDetail) {
    return { from: new Date(range.from), limited: false, to: new Date(range.to) };
  }

  const toDay = new Date(
    range.to.getFullYear(),
    range.to.getMonth(),
    range.to.getDate(),
  );
  const toIsDayBoundary = toDay.getTime() === range.to.getTime();
  const from = new Date(
    toDay.getFullYear(),
    toDay.getMonth(),
    toDay.getDate() -
      (toIsDayBoundary
        ? MAX_COUNTING_ANALYSIS_HOURLY_DETAIL_DAYS
        : MAX_COUNTING_ANALYSIS_HOURLY_DETAIL_DAYS - 1),
  );

  return {
    from: new Date(Math.max(from.getTime(), range.from.getTime())),
    limited: true,
    to: new Date(range.to),
  };
}

export function estimateCountingAnalysisVisualPoints(
  range: CountingAnalysisRange,
  granularity: ScenarioAnalyticsGranularity,
) {
  requireCountingAnalysisRange(range);
  const spanMs = range.to.getTime() - range.from.getTime();
  if (granularity === "minute") return Math.ceil(spanMs / 60_000);
  if (granularity === "hour") return Math.ceil(spanMs / 3_600_000);

  const days = countIntersectingCivilDays(range);
  if (granularity === "day") return days;
  if (granularity === "week") return Math.ceil(days / 7) + 1;

  return countIntersectingCivilMonths(range);
}

function countIntersectingCivilDays(range: CountingAnalysisRange) {
  const start = civilDateUtc(range.from);
  const endBoundary = new Date(
    range.to.getFullYear(),
    range.to.getMonth(),
    range.to.getDate(),
  );
  const end = civilDateUtc(range.to);
  const fullDayDifference = Math.round((end - start) / 86_400_000);
  return Math.max(
    1,
    fullDayDifference +
      (range.to.getTime() === endBoundary.getTime() ? 0 : 1),
  );
}

function countIntersectingCivilMonths(range: CountingAnalysisRange) {
  const inclusiveEnd = new Date(range.to.getTime() - 1);
  return Math.max(
    1,
    (inclusiveEnd.getFullYear() - range.from.getFullYear()) * 12 +
      inclusiveEnd.getMonth() -
      range.from.getMonth() +
      1,
  );
}

function civilDateUtc(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function requireCountingAnalysisRange(
  range: CountingAnalysisRange,
): asserts range is CountingAnalysisRange {
  if (
    !range ||
    !(range.from instanceof Date) ||
    Number.isNaN(range.from.getTime()) ||
    !(range.to instanceof Date) ||
    Number.isNaN(range.to.getTime()) ||
    range.from >= range.to
  ) {
    throw new RangeError(
      "O intervalo da análise deve ter início anterior ao fim.",
    );
  }
}
