import {
  parseAggregateBucket,
  requireAggregateRows,
} from "@/lib/aggregate-time";
import {
  countingAddCalendarDays,
  countingCalendarDate,
} from "@/lib/counting-time-zone";
import type {
  AggregateEventRow,
} from "@/lib/types";

type CountingCalendarTarget = "day" | "week" | "month" | "semester" | "year";

type AggregateIdentity = Readonly<{
  cameraId: string;
  lineCountId: string;
  metricType: string;
  objectClass: string;
}>;

/**
 * Replaces company-calendar buckets with authoritative minute/hour instants.
 * Calendar identities are derived in the selected IANA timezone, never in the
 * browser timezone. Empty covered buckets are removed as certified zeroes.
 */
export function reconcileCountingCalendarRows(
  targetRows: AggregateEventRow[],
  targetGranularity: CountingCalendarTarget,
  sourceRows: AggregateEventRow[],
  sourceGranularity: "minute" | "hour",
  from: Date,
  to: Date,
  timeZone: string,
) {
  requireInstantRange(from, to);
  requireAggregateRows(targetRows, targetGranularity);
  requireAggregateRows(sourceRows, sourceGranularity);

  const coveredBuckets = coveredCalendarBucketKeys(
    from,
    to,
    targetGranularity,
    timeZone,
  );
  const stableRows = targetRows.filter((row) => {
    const bucket = parseAggregateBucket(row.bucket, targetGranularity);
    return bucket
      ? !coveredBuckets.has(calendarBucketKey(bucket, targetGranularity))
      : false;
  });
  const replacementRows = rollupCountingInstantRowsToCalendar(
    sourceRows,
    sourceGranularity,
    targetGranularity,
    from,
    to,
    timeZone,
  );
  return [...stableRows, ...replacementRows];
}

export function rollupCountingInstantRowsToCalendar(
  rows: AggregateEventRow[],
  sourceGranularity: "minute" | "hour",
  targetGranularity: CountingCalendarTarget,
  from: Date,
  to: Date,
  timeZone: string,
) {
  requireInstantRange(from, to);
  requireAggregateRows(rows, sourceGranularity);
  const totals = new Map<
    string,
    AggregateIdentity & { bucket: Date; total: number }
  >();

  rows.forEach((row) => {
    const instant = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!instant || instant < from || instant >= to) return;
    const calendarDay = countingCalendarDate(instant, timeZone, "day");
    const bucket = calendarBucketStart(calendarDay, targetGranularity);
    const identity = rowIdentity(row);
    if (!identity.cameraId) return;
    const key = JSON.stringify([
      calendarBucketKey(bucket, targetGranularity),
      identity.cameraId,
      identity.lineCountId,
      identity.metricType,
      identity.objectClass,
    ]);
    const current = totals.get(key);
    const total = (current?.total ?? 0) + row.total;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("A soma civil da Contagem excedeu o limite seguro.");
    }
    totals.set(key, { ...identity, bucket, total });
  });

  return Array.from(totals.values(), ({ bucket, total, ...identity }) => ({
    bucket: formatCalendarBucket(bucket),
    camera_id: identity.cameraId,
    line_count_id: identity.lineCountId || undefined,
    metric_type: identity.metricType,
    object_class: identity.objectClass || undefined,
    total,
  }));
}

function coveredCalendarBucketKeys(
  from: Date,
  to: Date,
  targetGranularity: CountingCalendarTarget,
  timeZone: string,
) {
  const keys = new Set<string>();
  let cursor = countingCalendarDate(from, timeZone, "day");
  const last = countingCalendarDate(new Date(to.getTime() - 1), timeZone, "day");
  while (cursor <= last) {
    keys.add(
      calendarBucketKey(
        calendarBucketStart(cursor, targetGranularity),
        targetGranularity,
      ),
    );
    cursor = countingAddCalendarDays(cursor, 1);
  }
  return keys;
}

function calendarBucketStart(
  day: Date,
  granularity: CountingCalendarTarget,
) {
  if (granularity === "day") return day;
  if (granularity === "week") {
    return countingAddCalendarDays(day, -((day.getDay() + 6) % 7));
  }
  if (granularity === "month") {
    return new Date(day.getFullYear(), day.getMonth(), 1);
  }
  if (granularity === "semester") {
    return new Date(day.getFullYear(), day.getMonth() < 6 ? 0 : 6, 1);
  }
  return new Date(day.getFullYear(), 0, 1);
}

function calendarBucketKey(date: Date, granularity: CountingCalendarTarget) {
  const bucket = calendarBucketStart(date, granularity);
  return `${bucket.getFullYear()}-${bucket.getMonth() + 1}-${bucket.getDate()}`;
}

function formatCalendarBucket(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function rowIdentity(row: AggregateEventRow): AggregateIdentity {
  return {
    cameraId: row.camera_id,
    lineCountId: row.line_count_id ?? "",
    metricType: row.metric_type,
    objectClass: row.object_class ?? "",
  };
}

function requireInstantRange(from: Date, to: Date) {
  if (
    !(from instanceof Date) ||
    Number.isNaN(from.getTime()) ||
    !(to instanceof Date) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    throw new RangeError("O intervalo absoluto da Contagem é inválido.");
  }
}
