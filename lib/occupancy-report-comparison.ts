import type { IntradayComparisonMode } from "@/lib/live-dashboard-settings";
import { endOfAggregateBucket } from "@/lib/aggregate-time";
import type { AggregateGranularity } from "@/lib/types";
import {
  companyCalendarDate,
  companyDateKey,
  companyZonedDateParts,
  listCompanyTimeZoneHourBuckets,
  startOfCompanyTimeZoneHour,
} from "@/lib/company-time-zone";
import { occupancyCalendarBoundaryInstant, shiftOccupancyCalendarDate } from "@/lib/occupancy-calendar";

export type OccupancyReportGranularity = Extract<
  AggregateGranularity,
  "minute" | "hour" | "day" | "week" | "month" | "semester" | "year"
>;

export function occupancyComparisonBucketStarts({
  bucketStarts,
  granularity,
  intradayComparison,
  timeZone,
}: {
  bucketStarts: readonly Date[];
  granularity: OccupancyReportGranularity;
  intradayComparison: IntradayComparisonMode;
  timeZone?: string;
}) {
  bucketStarts.forEach((bucketStart) => {
    requireValidDate(bucketStart);
    if (timeZone && (granularity === "minute" || granularity === "hour")) {
      const aligned = granularity === "minute"
        ? bucketStart.getTime() % 60_000 === 0
        : startOfCompanyTimeZoneHour(bucketStart, timeZone).getTime() === bucketStart.getTime();
      if (!aligned) throw new RangeError("O bucket do comparativo não está alinhado à hora da empresa.");
    } else requireAlignedBucket(bucketStart, granularity);
  });

  // Build target-day buckets in chronological order, rather than shifting each
  // instant with setDate. A fallback minute window can run 01:30 -> 01:29;
  // shifting those endpoints independently reverses the previous-day query.
  if (granularity === "minute" || (granularity === "hour" && timeZone)) {
    return comparisonInstantBucketStarts(
      bucketStarts, granularity, intradayComparison === "last_week" ? -7 : -1,
      timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  }

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

function comparisonInstantBucketStarts(
  bucketStarts: readonly Date[],
  granularity: "minute" | "hour",
  dayOffset: number,
  timeZone: string,
) {
  const days = new Map<string, { first: Date; slots: Set<number> }>();
  for (const bucket of bucketStarts) {
    const key = companyDateKey(bucket, timeZone);
    const parts = companyZonedDateParts(bucket, timeZone);
    const existing = days.get(key) ?? { first: bucket, slots: new Set<number>() };
    existing.slots.add(granularity === "hour" ? parts.hour : parts.hour * 60 + parts.minute);
    days.set(key, existing);
  }
  const result = new Map<number, Date>();
  for (const { first, slots } of days.values()) {
    const targetDay = shiftOccupancyCalendarDate(companyCalendarDate(first, timeZone, "day"), dayOffset);
    const from = occupancyCalendarBoundaryInstant(targetDay, timeZone);
    const to = occupancyCalendarBoundaryInstant(shiftOccupancyCalendarDate(targetDay, 1), timeZone);
    const hours = listCompanyTimeZoneHourBuckets(from, to, timeZone);
    for (let index = 0; index < hours.length; index += 1) {
      const hour = hours[index];
      const hourValue = companyZonedDateParts(hour, timeZone).hour;
      if (granularity === "hour") {
        if (hourValue >= Math.min(...slots) && hourValue <= Math.max(...slots)) result.set(hour.getTime(), hour);
        continue;
      }
      if (![...slots].some((slot) => Math.floor(slot / 60) === hourValue)) continue;
      const end = hours[index + 1] ?? to;
      for (let instant = hour.getTime(); instant < end.getTime(); instant += 60_000) {
        const bucket = new Date(instant);
        const parts = companyZonedDateParts(bucket, timeZone);
        if (slots.has(parts.hour * 60 + parts.minute)) result.set(instant, bucket);
      }
    }
  }
  return [...result.values()].sort((a, b) => a.getTime() - b.getTime());
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
    const shifted = new Date(bucketStart);
    shifted.setDate(shifted.getDate() + (intradayComparison === "last_week" ? -7 : -1));
    return shifted;
  }
  if (granularity === "day") return addDays(bucketStart, -7);
  if (granularity === "week") return addDays(bucketStart, -28);
  return addYears(bucketStart, -1);
}

function addDays(date: Date, days: number) {
  return shiftOccupancyCalendarDate(date, days);
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
  return shiftOccupancyCalendarDate(date, 0, 0, years);
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
  const atMidnight = date.getTime() === new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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
