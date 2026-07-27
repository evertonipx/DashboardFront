import {
  endOfAggregateBucket,
  parseAggregateBucket,
  requireAggregateRows,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import type {
  AggregateEventRow,
  AggregateGranularity,
} from "@/lib/types";

const DEFAULT_METRIC_TYPE = "count";

type AggregateIdentityTotal = {
  cameraId: string;
  lineCountId: string;
  metricType: string;
  objectClass: string;
  total: number;
};

/**
 * Rebuilds coarser aggregate buckets from a more detailed source in one pass.
 * A successful detailed response is authoritative for the requested range and
 * replaces every coarse bucket in it, including corrections to zero.
 */
export function reconcileAggregateRows(
  targetRows: AggregateEventRow[],
  targetGranularity: AggregateGranularity,
  sourceRows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  if (!canRollUp(sourceGranularity, targetGranularity)) return targetRows;

  const rolledSource = rollupAggregateRows(
    sourceRows,
    sourceGranularity,
    targetGranularity,
    from,
    to,
  );
  const sourceByBucket = aggregateRowsByBucketAndIdentity(
    rolledSource,
    targetGranularity,
  );
  const stableRows = targetRows.filter((row) => {
    return !aggregateBucketOverlapsRange(
      row.bucket,
      targetGranularity,
      from,
      to,
    );
  });
  const replacementRows: AggregateEventRow[] = [];

  sourceByBucket.forEach((sourceTotals, key) => {
    const bucket = bucketStartFromKey(key, targetGranularity);
    sourceTotals.forEach((identity) => {
      replacementRows.push(createAggregateRow(bucket, targetGranularity, identity));
    });
  });

  return [...stableRows, ...replacementRows];
}

export function rollupAggregateRows(
  rows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
  targetGranularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  return (
    rollupAggregateRowsMany(
      rows,
      sourceGranularity,
      [targetGranularity],
      from,
      to,
    ).get(targetGranularity) ?? []
  );
}

export function rollupAggregateRowsMany(
  rows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
  targetGranularities: readonly AggregateGranularity[],
  from: Date,
  to: Date,
) {
  const parsedRows = validateAndParseSourceRows(rows, sourceGranularity);
  const targets = Array.from(
    new Set(
      targetGranularities.filter((target) =>
        canRollUp(sourceGranularity, target),
      ),
    ),
  );
  const totalsByTarget = new Map(
    targets.map((target) => [
      target,
      new Map<string, AggregateIdentityTotal & { bucket: Date }>(),
    ]),
  );

  parsedRows.forEach(({ identity, row, sourceBucket }) => {
    if (
      !dateBucketOverlapsRange(sourceBucket, sourceGranularity, from, to)
    ) {
      return;
    }

    totalsByTarget.forEach((totals, targetGranularity) => {
      const bucket = startOfBucket(sourceBucket, targetGranularity);
      const key = `${bucketKey(bucket, targetGranularity)}|${rowIdentityKey(identity)}`;
      const current = totals.get(key);
      const total = addFiniteTotals(
        current?.total ?? 0,
        finiteTotal(row.total),
      );
      totals.set(key, {
        ...identity,
        bucket,
        total,
      });
    });
  });

  return new Map(
    Array.from(totalsByTarget, ([targetGranularity, totals]) => [
      targetGranularity,
      Array.from(totals.values(), ({ bucket, ...identity }) =>
        createAggregateRow(bucket, targetGranularity, identity),
      ),
    ]),
  );
}

function aggregateRowsByBucketAndIdentity(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
) {
  const buckets = new Map<string, Map<string, AggregateIdentityTotal>>();

  rows.forEach((row) => {
    const bucket = parseAggregateBucket(row.bucket, granularity);
    if (!bucket) return;
    const identity = rowIdentity(row);
    if (!identity.cameraId && !identity.lineCountId) return;

    const bucketId = bucketKey(bucket, granularity);
    const identityId = rowIdentityKey(identity);
    const totals = buckets.get(bucketId) ?? new Map();
    const current = totals.get(identityId);
    totals.set(identityId, {
      ...identity,
      total: addFiniteTotals(
        current?.total ?? 0,
        finiteTotal(row.total),
      ),
    });
    buckets.set(bucketId, totals);
  });

  return buckets;
}

function rowIdentity(
  row: AggregateEventRow,
): Omit<AggregateIdentityTotal, "total"> {
  return {
    cameraId: row.camera_id ?? "",
    lineCountId: row.line_count_id ?? "",
    metricType: row.metric_type ?? DEFAULT_METRIC_TYPE,
    objectClass: row.object_class ?? "",
  };
}

function rowIdentityKey(
  identity: Omit<AggregateIdentityTotal, "total">,
) {
  return JSON.stringify([
    identity.cameraId,
    identity.lineCountId,
    identity.metricType,
    identity.objectClass,
  ]);
}

function createAggregateRow(
  bucket: Date,
  granularity: AggregateGranularity,
  identity: AggregateIdentityTotal,
): AggregateEventRow {
  return {
    bucket: formatBucket(bucket, granularity),
    camera_id: identity.cameraId,
    line_count_id: identity.lineCountId || undefined,
    metric_type: identity.metricType || DEFAULT_METRIC_TYPE,
    object_class: identity.objectClass || undefined,
    total: identity.total,
  };
}

function formatBucket(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute" || granularity === "hour") {
    return date.toISOString();
  }

  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function bucketKey(date: Date, granularity: AggregateGranularity) {
  const start = startOfBucket(date, granularity);
  if (granularity === "minute" || granularity === "hour") {
    return String(start.getTime());
  }

  return String(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  );
}

function bucketStartFromKey(
  key: string,
  granularity: AggregateGranularity,
) {
  const timestamp = Number(key);
  if (granularity === "minute" || granularity === "hour") {
    return new Date(timestamp);
  }

  const utc = new Date(timestamp);
  return new Date(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
  );
}

function startOfBucket(date: Date, granularity: AggregateGranularity) {
  return startOfAggregateBucket(date, granularity);
}

function finiteTotal(value: number) {
  return value;
}

function addFiniteTotals(left: number, right: number) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new Error(
      "A soma do agregado excedeu o intervalo numérico seguro; a reconciliação foi cancelada.",
    );
  }
  return total;
}

function aggregateBucketOverlapsRange(
  value: string | Date,
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const bucket = parseAggregateBucket(value, granularity);
  return bucket
    ? dateBucketOverlapsRange(bucket, granularity, from, to)
    : false;
}

function dateBucketOverlapsRange(
  bucket: Date,
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const start = startOfBucket(bucket, granularity);
  const end = endOfBucket(start, granularity);
  return start < to && end > from;
}

function endOfBucket(date: Date, granularity: AggregateGranularity) {
  return endOfAggregateBucket(date, granularity);
}

function validateAndParseSourceRows(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
) {
  try {
    requireAggregateRows(rows, granularity);
  } catch (error) {
    throw new Error(
      `Fonte agregada inválida; a reconciliação foi cancelada. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    );
  }

  return rows.map((row, index) => {
    const identity = rowIdentity(row);
    const sourceBucket = parseAggregateBucket(row.bucket, granularity);
    if (
      !sourceBucket ||
      !identity.cameraId ||
      !Number.isFinite(row.total)
    ) {
      throw new Error(
        `Fonte agregada inválida na posição ${index}; a reconciliação foi cancelada.`,
      );
    }

    return { identity, row, sourceBucket };
  });
}

function canRollUp(
  sourceGranularity: AggregateGranularity,
  targetGranularity: AggregateGranularity,
) {
  const allowedTargets: Record<
    AggregateGranularity,
    ReadonlySet<AggregateGranularity>
  > = {
    minute: new Set([
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "semester",
      "year",
    ]),
    hour: new Set([
      "hour",
      "day",
      "week",
      "month",
      "semester",
      "year",
    ]),
    day: new Set(["day", "week", "month", "semester", "year"]),
    week: new Set(["week"]),
    month: new Set(["month", "semester", "year"]),
    semester: new Set(["semester", "year"]),
    year: new Set(["year"]),
  };

  return allowedTargets[sourceGranularity].has(targetGranularity);
}
