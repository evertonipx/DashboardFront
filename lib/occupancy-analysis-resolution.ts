export type OccupancyAnalysisResolutionGranularity =
  | "day"
  | "week"
  | "month";

export type OccupancyAnalysisResolutionSegment = {
  bucketStarts: Date[];
  from: Date;
  granularity: OccupancyAnalysisResolutionGranularity;
  to: Date;
};

export type OccupancyAnalysisResolutionPlan = {
  pointCount: number;
  primaryGranularity: OccupancyAnalysisResolutionGranularity;
  segments: OccupancyAnalysisResolutionSegment[];
};

/**
 * Daily points remain easy to inspect through roughly two months. Above that,
 * complete civil weeks are requested directly from the API. Large ranges use
 * complete civil months. Boundary periods stay daily so a custom date filter
 * never includes observations outside the selected interval.
 */
export const OCCUPANCY_ANALYSIS_DAILY_MAX_DAYS = 62;
export const OCCUPANCY_ANALYSIS_WEEKLY_MAX_DAYS = 183;

const CLOSED_SEGMENT_HISTORICAL_REVISION_MS = 24 * 60 * 60 * 1_000;
const CLOSED_SEGMENT_RECENT_REVISION_MS = 15 * 60 * 1_000;
const CLOSED_SEGMENT_RECENT_WINDOW_MS = 48 * 60 * 60 * 1_000;
const MAX_PLAN_BUCKETS = 400;

export function occupancyAnalysisClosedSegmentRevision(
  segmentTo: Date,
  requestedAt: Date,
) {
  requireValidDate(segmentTo);
  requireValidDate(requestedAt);
  const age = Math.max(0, requestedAt.getTime() - segmentTo.getTime());
  const revisionMs =
    age <= CLOSED_SEGMENT_RECENT_WINDOW_MS
      ? CLOSED_SEGMENT_RECENT_REVISION_MS
      : CLOSED_SEGMENT_HISTORICAL_REVISION_MS;
  return `${revisionMs}:${Math.floor(requestedAt.getTime() / revisionMs)}`;
}

export function buildOccupancyAnalysisResolutionPlan(
  from: Date,
  to: Date,
  dayCount: number,
): OccupancyAnalysisResolutionPlan {
  requireValidRange(from, to, dayCount);

  const primaryGranularity =
    dayCount <= OCCUPANCY_ANALYSIS_DAILY_MAX_DAYS
      ? "day"
      : dayCount <= OCCUPANCY_ANALYSIS_WEEKLY_MAX_DAYS
        ? "week"
        : "month";

  if (primaryGranularity === "day") {
    return finalizePlan(primaryGranularity, [
      buildSegment(from, to, "day"),
    ]);
  }

  const coarseStart = firstCompleteBucketStart(from, primaryGranularity);
  const finalDayStart = addDays(to, -1);
  // Keeping the final selected day outside a coarse bucket preserves the
  // exact closing/partial value used by the summary cards.
  const coarseEnd = startOfBucket(finalDayStart, primaryGranularity);

  if (coarseStart >= coarseEnd) {
    return finalizePlan("day", [buildSegment(from, to, "day")]);
  }

  const segments: OccupancyAnalysisResolutionSegment[] = [];
  if (from < coarseStart) {
    segments.push(buildSegment(from, coarseStart, "day"));
  }
  segments.push(
    buildSegment(coarseStart, coarseEnd, primaryGranularity),
  );
  if (coarseEnd < to) {
    segments.push(buildSegment(coarseEnd, to, "day"));
  }

  return finalizePlan(primaryGranularity, segments);
}

function finalizePlan(
  primaryGranularity: OccupancyAnalysisResolutionGranularity,
  segments: OccupancyAnalysisResolutionSegment[],
): OccupancyAnalysisResolutionPlan {
  const pointCount = segments.reduce(
    (total, segment) => total + segment.bucketStarts.length,
    0,
  );
  if (pointCount < 1 || pointCount > MAX_PLAN_BUCKETS) {
    throw new RangeError(
      "O plano de consolidação da análise de ocupação é excessivo.",
    );
  }
  return { pointCount, primaryGranularity, segments };
}

function buildSegment(
  from: Date,
  to: Date,
  granularity: OccupancyAnalysisResolutionGranularity,
): OccupancyAnalysisResolutionSegment {
  const bucketStarts: Date[] = [];
  let cursor = new Date(from);

  while (cursor < to && bucketStarts.length <= MAX_PLAN_BUCKETS) {
    bucketStarts.push(new Date(cursor));
    cursor = addBucket(cursor, granularity);
  }

  if (cursor.getTime() !== to.getTime()) {
    throw new RangeError(
      "O intervalo não pode ser consolidado em buckets civis completos.",
    );
  }

  return {
    bucketStarts,
    from: new Date(from),
    granularity,
    to: new Date(to),
  };
}

function firstCompleteBucketStart(
  from: Date,
  granularity: Exclude<OccupancyAnalysisResolutionGranularity, "day">,
) {
  const aligned = startOfBucket(from, granularity);
  return aligned.getTime() === from.getTime()
    ? aligned
    : addBucket(aligned, granularity);
}

function startOfBucket(
  date: Date,
  granularity: OccupancyAnalysisResolutionGranularity,
) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  if (granularity === "month") {
    next.setDate(1);
    return next;
  }
  if (granularity === "week") {
    const weekday = next.getDay();
    next.setDate(next.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  }
  return next;
}

function addBucket(
  date: Date,
  granularity: OccupancyAnalysisResolutionGranularity,
) {
  if (granularity === "month") {
    const next = new Date(date);
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  return addDays(date, granularity === "week" ? 7 : 1);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function requireValidRange(from: Date, to: Date, dayCount: number) {
  if (
    !(from instanceof Date) ||
    !(to instanceof Date) ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to ||
    from.getHours() !== 0 ||
    from.getMinutes() !== 0 ||
    from.getSeconds() !== 0 ||
    from.getMilliseconds() !== 0 ||
    to.getHours() !== 0 ||
    to.getMinutes() !== 0 ||
    to.getSeconds() !== 0 ||
    to.getMilliseconds() !== 0 ||
    !Number.isSafeInteger(dayCount) ||
    dayCount < 1
  ) {
    throw new RangeError(
      "O intervalo da consolidação da análise de ocupação é inválido.",
    );
  }

  const civilDayCount = Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      (24 * 60 * 60 * 1_000),
  );
  if (civilDayCount !== dayCount) {
    throw new RangeError(
      "A quantidade de dias não corresponde ao intervalo civil da análise de ocupação.",
    );
  }
}

function requireValidDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("A data da análise de ocupação é inválida.");
  }
}
