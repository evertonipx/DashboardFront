import type { OccupancyAggregateMetric } from "@/lib/occupancy-aggregate-validation";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MINUTES_PER_HOUR = 60;

export type OccupancyDurationCoarseQueryPlan = {
  hourlyBuckets: Date[];
  minuteBuckets: Date[];
};

export type OccupancyDurationRefinementPlan = {
  minuteBuckets: Date[];
  synthesizedMinuteMetrics: Map<number, OccupancyAggregateMetric>;
};

/**
 * Separates complete absolute hours from partial edges.
 *
 * Occupancy duration needs minute states, but a complete hourly bucket can
 * certify all of its minutes when `minimum > 0` (occupied throughout) or
 * `peak === 0` (free throughout). Querying those hours first avoids downloading
 * up to 60 rows per hour and preserves fractional-offset and DST edges as exact
 * minute requests.
 */
export function planOccupancyDurationCoarseQuery(
  buckets: readonly Date[],
): OccupancyDurationCoarseQueryPlan {
  const groups = groupMinuteBucketsByAbsoluteHour(buckets);
  const hourlyBuckets: Date[] = [];
  const minuteBuckets: Date[] = [];

  groups.forEach(({ buckets: hourBuckets, hourStart }) => {
    if (isCompleteAbsoluteHour(hourStart, hourBuckets)) {
      hourlyBuckets.push(new Date(hourStart));
      return;
    }
    minuteBuckets.push(...hourBuckets.map((bucket) => new Date(bucket)));
  });

  return { hourlyBuckets, minuteBuckets };
}

/**
 * Expands only hourly buckets whose extrema prove one stable state. Mixed
 * hours are returned for exact minute refinement; missing hourly buckets stay
 * unknown instead of triggering an unbounded fallback.
 */
export function resolveOccupancyDurationHourlyPlan({
  buckets,
  hourlyMetrics,
}: {
  buckets: readonly Date[];
  hourlyMetrics: ReadonlyMap<number, OccupancyAggregateMetric>;
}): OccupancyDurationRefinementPlan {
  const coarse = planOccupancyDurationCoarseQuery(buckets);
  const minuteBuckets = coarse.minuteBuckets.map((bucket) => new Date(bucket));
  const synthesizedMinuteMetrics = new Map<
    number,
    OccupancyAggregateMetric
  >();

  coarse.hourlyBuckets.forEach((hourBucket) => {
    const hourStart = hourBucket.getTime();
    const metric = hourlyMetrics.get(hourStart);
    if (!metric) return;

    if (metric.minimum > 0 || metric.peak === 0) {
      for (let index = 0; index < MINUTES_PER_HOUR; index += 1) {
        synthesizedMinuteMetrics.set(hourStart + index * MINUTE_MS, metric);
      }
      return;
    }

    for (let index = 0; index < MINUTES_PER_HOUR; index += 1) {
      minuteBuckets.push(new Date(hourStart + index * MINUTE_MS));
    }
  });

  minuteBuckets.sort((left, right) => left.getTime() - right.getTime());
  return { minuteBuckets, synthesizedMinuteMetrics };
}

export function groupContiguousOccupancyDurationBuckets(
  buckets: readonly Date[],
  stepMs = MINUTE_MS,
) {
  if (!Number.isSafeInteger(stepMs) || stepMs <= 0) {
    throw new RangeError("O intervalo dos buckets de ocupação é inválido.");
  }

  const groups: Date[][] = [];
  buckets.forEach((bucket, index) => {
    const time = requireMinuteBucket(bucket, index);
    const current = groups.at(-1);
    const previous = current?.at(-1)?.getTime();
    if (!current || previous === undefined || time !== previous + stepMs) {
      groups.push([new Date(time)]);
      return;
    }
    current.push(new Date(time));
  });
  return groups;
}

function groupMinuteBucketsByAbsoluteHour(buckets: readonly Date[]) {
  const groups: Array<{ buckets: Date[]; hourStart: number }> = [];
  let previous = Number.NEGATIVE_INFINITY;

  buckets.forEach((bucket, index) => {
    const time = requireMinuteBucket(bucket, index);
    if (time <= previous) {
      throw new RangeError(
        "Os buckets de duração devem ser únicos e estar em ordem crescente.",
      );
    }
    previous = time;
    const hourStart = Math.floor(time / HOUR_MS) * HOUR_MS;
    const current = groups.at(-1);
    if (!current || current.hourStart !== hourStart) {
      groups.push({ buckets: [new Date(time)], hourStart });
      return;
    }
    current.buckets.push(new Date(time));
  });

  return groups;
}

function isCompleteAbsoluteHour(hourStart: number, buckets: readonly Date[]) {
  return (
    buckets.length === MINUTES_PER_HOUR &&
    buckets[0]?.getTime() === hourStart &&
    buckets.at(-1)?.getTime() === hourStart + HOUR_MS - MINUTE_MS
  );
}

function requireMinuteBucket(bucket: Date, index: number) {
  if (
    !(bucket instanceof Date) ||
    !Number.isFinite(bucket.getTime()) ||
    bucket.getTime() % MINUTE_MS !== 0
  ) {
    throw new RangeError(
      `O bucket de duração na posição ${index} não inicia em um minuto válido.`,
    );
  }
  return bucket.getTime();
}
