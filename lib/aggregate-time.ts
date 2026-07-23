import type { AggregateGranularity } from "@/lib/types";

const CALENDAR_BUCKET_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

export function aggregateQueryIso(
  date: Date,
  granularity: AggregateGranularity,
) {
  if (granularity === "minute" || granularity === "hour") {
    return date.toISOString();
  }

  const year = date.getFullYear();
  const month =
    granularity === "year"
      ? 0
      : granularity === "semester"
        ? date.getMonth() < 6
          ? 0
          : 6
        : date.getMonth();
  const day =
    granularity === "month" ||
    granularity === "semester" ||
    granularity === "year"
      ? 1
      : date.getDate();

  return new Date(Date.UTC(year, month, day)).toISOString();
}

export function parseAggregateBucket(
  value: string | Date,
  granularity: AggregateGranularity,
) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  if (isCalendarGranularity(granularity)) {
    const match = CALENDAR_BUCKET_PATTERN.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const date = new Date(
        year,
        month,
        day,
      );
      return !Number.isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() === day
        ? date
        : null;
    }
  }

  // The aggregate API also returns SQL timestamp buckets without an offset.
  // Those values are company-local wall-clock buckets, not UTC instants.
  const localDateTime = parseLocalDateTime(value);
  if (localDateTime) return localDateTime;

  // Zone-aware RFC3339 values remain absolute instants.
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function aggregateBucketInRange(
  value: string | Date,
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const bucket = parseAggregateBucket(value, granularity);
  return bucket ? bucket >= from && bucket < to : false;
}

export function isCalendarGranularity(granularity: AggregateGranularity) {
  return (
    granularity === "day" ||
    granularity === "week" ||
    granularity === "month" ||
    granularity === "semester" ||
    granularity === "year"
  );
}

function parseLocalDateTime(value: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  const date = new Date(
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second
    ? date
    : null;
}
