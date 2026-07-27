import type {
  AggregateEventRow,
  AggregateGranularity,
} from "@/lib/types";

const CALENDAR_BUCKET_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:(?:T| )00:00:00(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const ZONED_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

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

  // Only explicit RFC3339 values remain absolute instants. Rejecting other
  // strings prevents JavaScript from silently normalizing invalid wall times.
  if (!ZONED_DATE_TIME_PATTERN.test(value)) return null;

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

export function requireAggregateGranularity(
  actual: AggregateGranularity | null | undefined,
  requested: AggregateGranularity,
) {
  if (actual !== requested) {
    throw new Error(
      `A API retornou granularidade ${actual ?? "ausente"} para uma consulta ${requested}.`,
    );
  }

  return requested;
}

export function requireAggregateRows(
  data: AggregateEventRow[] | null | undefined,
  granularity: AggregateGranularity,
  expectedMetricType?: string,
) {
  if (!Array.isArray(data)) {
    throw new Error("A API retornou uma resposta agregada sem o campo data.");
  }

  const identities = new Set<string>();
  data.forEach((row, index) => {
    const valid =
      row &&
      typeof row === "object" &&
      typeof row.bucket === "string" &&
      isAggregateBucketAligned(row.bucket, granularity) &&
      typeof row.camera_id === "string" &&
      row.camera_id.trim().length > 0 &&
      row.camera_id === row.camera_id.trim() &&
      (row.line_count_id === undefined ||
        (typeof row.line_count_id === "string" &&
          row.line_count_id.trim().length > 0 &&
          row.line_count_id === row.line_count_id.trim())) &&
      typeof row.metric_type === "string" &&
      row.metric_type.trim().length > 0 &&
      row.metric_type === row.metric_type.trim() &&
      (expectedMetricType === undefined ||
        row.metric_type === expectedMetricType) &&
      (row.object_class === undefined ||
        (typeof row.object_class === "string" &&
          row.object_class.trim().length > 0 &&
          row.object_class === row.object_class.trim())) &&
      typeof row.total === "number" &&
      Number.isSafeInteger(row.total) &&
      row.total >= 0;

    if (!valid) {
      throw new Error(
        `A API retornou uma linha agregada inválida na posição ${index}.`,
      );
    }

    const bucket = parseAggregateBucket(row.bucket, granularity)!;
    const bucketIdentity = isCalendarGranularity(granularity)
      ? Date.UTC(
          bucket.getFullYear(),
          bucket.getMonth(),
          bucket.getDate(),
        )
      : bucket.getTime();
    const identity = JSON.stringify([
      bucketIdentity,
      row.camera_id,
      row.line_count_id ?? "",
      row.metric_type,
      row.object_class ?? "",
    ]);
    if (identities.has(identity)) {
      throw new Error(
        `A API retornou uma identidade agregada duplicada na posição ${index}.`,
      );
    }
    identities.add(identity);
  });

  return data;
}

export function requireAggregateRowsInRange(
  data: AggregateEventRow[] | null | undefined,
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
  expectedMetricType?: string,
) {
  if (
    !(from instanceof Date) ||
    Number.isNaN(from.getTime()) ||
    !(to instanceof Date) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    throw new RangeError(
      "O intervalo da resposta agregada deve ter início anterior ao fim.",
    );
  }

  const rows = requireAggregateRows(
    data,
    granularity,
    expectedMetricType,
  );
  rows.forEach((row, index) => {
    if (!aggregateBucketInRange(row.bucket, granularity, from, to)) {
      throw new Error(
        `A API retornou um bucket fora do intervalo consultado na posição ${index}.`,
      );
    }
  });

  return rows;
}

export function isAggregateBucketAligned(
  value: string | Date,
  granularity: AggregateGranularity,
) {
  const bucket = parseAggregateBucket(value, granularity);
  if (
    !bucket ||
    (typeof value === "string" && hasNonZeroFractionalSecond(value))
  ) {
    return false;
  }
  return (
    startOfAggregateBucket(bucket, granularity).getTime() === bucket.getTime()
  );
}

export function startOfAggregateBucket(
  date: Date,
  granularity: AggregateGranularity,
) {
  if (granularity === "minute") {
    return floorLocalInstant(date, 60_000);
  }
  if (granularity === "hour") {
    return floorLocalInstant(date, 60 * 60_000);
  }
  if (granularity === "day") {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (granularity === "week") {
    const day = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    return new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate() - ((day.getDay() + 6) % 7),
    );
  }
  if (granularity === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  if (granularity === "semester") {
    return new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
  }
  return new Date(date.getFullYear(), 0, 1);
}

export function endOfAggregateBucket(
  date: Date,
  granularity: AggregateGranularity,
) {
  const start = startOfAggregateBucket(date, granularity);
  if (granularity === "minute") {
    return new Date(start.getTime() + 60_000);
  }
  if (granularity === "hour") {
    // Find the next real civil-hour boundary. This handles both repeated
    // fallback hours and partial 30-minute hours such as Lord Howe's 02:30.
    for (let minute = 1; minute <= 3 * 60; minute += 1) {
      const candidate = new Date(start.getTime() + minute * 60_000);
      if (
        startOfAggregateBucket(candidate, "hour").getTime() !==
        start.getTime()
      ) {
        return candidate;
      }
    }
    return new Date(start.getTime() + 60 * 60_000);
  }

  if (granularity === "day") {
    return new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 1,
    );
  }
  if (granularity === "week") {
    return new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 7,
    );
  }
  if (granularity === "month") {
    return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
  if (granularity === "semester") {
    return new Date(start.getFullYear(), start.getMonth() + 6, 1);
  }
  return new Date(start.getFullYear() + 1, 0, 1);
}

function floorLocalInstant(date: Date, durationMs: number) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const localTime = date.getTime() - offsetMs;
  const candidate = new Date(
    Math.floor(localTime / durationMs) * durationMs + offsetMs,
  );
  if (
    candidate.getTimezoneOffset() === date.getTimezoneOffset() &&
    sameLocalBucket(candidate, date, durationMs)
  ) {
    return candidate;
  }

  const minuteMs = 60_000;
  let cursor = new Date(Math.floor(date.getTime() / minuteMs) * minuteMs);
  let earliest: Date | null = null;
  for (let index = 0; index <= 6 * 60; index += 1) {
    const belongsToBucket =
      cursor.getTimezoneOffset() === date.getTimezoneOffset() &&
      sameLocalBucket(cursor, date, durationMs);
    if (belongsToBucket) {
      earliest = new Date(cursor);
    } else if (earliest) {
      break;
    }
    cursor = new Date(cursor.getTime() - minuteMs);
  }

  return earliest ?? candidate;
}

function sameLocalBucket(left: Date, right: Date, durationMs: number) {
  if (
    left.getFullYear() !== right.getFullYear() ||
    left.getMonth() !== right.getMonth() ||
    left.getDate() !== right.getDate() ||
    left.getHours() !== right.getHours()
  ) {
    return false;
  }

  return durationMs > 60_000 || left.getMinutes() === right.getMinutes();
}

function hasNonZeroFractionalSecond(value: string) {
  const fraction = /\.(\d+)/.exec(value)?.[1];
  return Boolean(fraction && /[1-9]/.test(fraction));
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
