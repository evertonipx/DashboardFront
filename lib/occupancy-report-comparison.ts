import type { IntradayComparisonMode } from "@/lib/live-dashboard-settings";
import { endOfAggregateBucket } from "@/lib/aggregate-time";
import type { AggregateGranularity } from "@/lib/types";

export type OccupancyReportGranularity = Extract<
  AggregateGranularity,
  "minute" | "hour" | "day" | "week" | "month" | "semester" | "year"
>;

export function occupancyComparisonBucketStarts({
  bucketStarts,
  granularity,
  intradayComparison,
}: {
  bucketStarts: readonly Date[];
  granularity: OccupancyReportGranularity;
  intradayComparison: IntradayComparisonMode;
}) {
  bucketStarts.forEach((bucketStart) => {
    requireValidDate(bucketStart);
    requireAlignedBucket(bucketStart, granularity);
  });

  if (granularity === "hour") {
    return comparisonHourlyBucketStarts(
      bucketStarts,
      intradayComparison === "last_week" ? -7 : -1,
    );
  }

  return bucketStarts.map((bucketStart) =>
    occupancyComparisonBucketStart(
      bucketStart,
      granularity,
      intradayComparison,
    ),
  );
}

function comparisonHourlyBucketStarts(
  bucketStarts: readonly Date[],
  dayOffset: number,
) {
  const sourceDays = new Map<
    string,
    { first: Date; maximumHour: number; minimumHour: number }
  >();

  bucketStarts.forEach((bucketStart) => {
    const key = localDayIdentity(bucketStart);
    const existing = sourceDays.get(key);
    if (existing) {
      existing.minimumHour = Math.min(existing.minimumHour, bucketStart.getHours());
      existing.maximumHour = Math.max(existing.maximumHour, bucketStart.getHours());
      return;
    }
    sourceDays.set(key, {
      first: bucketStart,
      maximumHour: bucketStart.getHours(),
      minimumHour: bucketStart.getHours(),
    });
  });

  const result: Date[] = [];
  const identities = new Set<number>();
  sourceDays.forEach(({ first, maximumHour, minimumHour }) => {
    const targetDay = shiftLocalDay(first, dayOffset);
    actualHourBuckets(targetDay).forEach((bucket) => {
      if (bucket.getHours() < minimumHour || bucket.getHours() > maximumHour) {
        return;
      }
      if (identities.has(bucket.getTime())) return;
      identities.add(bucket.getTime());
      result.push(bucket);
    });
  });

  return result.sort((left, right) => left.getTime() - right.getTime());
}

export function occupancyComparisonBucketStart(
  bucketStart: Date,
  granularity: OccupancyReportGranularity,
  intradayComparison: IntradayComparisonMode,
) {
  requireValidDate(bucketStart);
  requireAlignedBucket(bucketStart, granularity);

  if (granularity === "minute" || granularity === "hour") {
    return addDays(bucketStart, intradayComparison === "last_week" ? -7 : -1);
  }
  if (granularity === "day") return addDays(bucketStart, -7);
  if (granularity === "week") return addDays(bucketStart, -28);
  return addYears(bucketStart, -1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shiftLocalDay(date: Date, days: number) {
  const marker = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  marker.setDate(marker.getDate() + days);
  return new Date(marker.getFullYear(), marker.getMonth(), marker.getDate());
}

function actualHourBuckets(day: Date) {
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const buckets: Date[] = [];
  let cursor = new Date(day);
  let guard = 0;

  while (cursor < end && guard < 30) {
    buckets.push(new Date(cursor));
    const next = endOfAggregateBucket(cursor, "hour");
    if (next <= cursor) {
      throw new RangeError("A sequência horária do comparativo é inválida.");
    }
    cursor = next;
    guard += 1;
  }

  if (cursor < end) {
    throw new RangeError(
      "O dia civil do comparativo excedeu o limite seguro de buckets horários.",
    );
  }

  return buckets;
}

function localDayIdentity(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function requireValidDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("O bucket do comparativo de ocupação é inválido.");
  }
}

function requireAlignedBucket(
  date: Date,
  granularity: OccupancyReportGranularity,
) {
  const atMidnight =
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;
  const aligned =
    granularity === "minute"
      ? date.getSeconds() === 0 && date.getMilliseconds() === 0
      : granularity === "hour"
        ? date.getMinutes() === 0 &&
          date.getSeconds() === 0 &&
          date.getMilliseconds() === 0
        : granularity === "day"
          ? atMidnight
          : granularity === "week"
            ? atMidnight && date.getDay() === 1
            : granularity === "month"
              ? atMidnight && date.getDate() === 1
              : granularity === "semester"
                ? atMidnight &&
                  date.getDate() === 1 &&
                  (date.getMonth() === 0 || date.getMonth() === 6)
                : atMidnight && date.getDate() === 1 && date.getMonth() === 0;

  if (!aligned) {
    throw new RangeError(
      `O bucket do comparativo não está alinhado à granularidade ${granularity}.`,
    );
  }
}
