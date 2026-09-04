import {
  aggregateQueryIso,
  endOfAggregateBucket,
  requireAggregateGranularity,
  requireAggregateRows,
  requireAggregateRowsInRange,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import { apiFetch } from "@/lib/api";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
} from "@/lib/types";

const DEFAULT_METRIC_TYPE = "count";

/* The aggregate endpoint does not expose pagination/completeness metadata.
   A response at the deployed 1,000-row ceiling is therefore treated as
   potentially truncated and divided on a bucket boundary until every leaf
   response is strictly below the ceiling. */
export const AGGREGATE_RESPONSE_ROW_CEILING = 1_000;
const MAX_COMPLETENESS_SPLIT_DEPTH = 20;

export type CompleteAggregateRequest = (
  path: string,
) => Promise<AggregateEventsResponse>;

export async function fetchCompleteAggregateRange({
  companyScopeId,
  from,
  granularity,
  metricType = DEFAULT_METRIC_TYPE,
  request,
  signal,
  to,
}: {
  companyScopeId?: string;
  from: Date;
  granularity: AggregateGranularity;
  metricType?: string;
  request?: CompleteAggregateRequest;
  signal?: AbortSignal;
  to: Date;
}): Promise<AggregateEventRow[]> {
  requireCompleteAggregateOptions(from, to, metricType);

  const execute: CompleteAggregateRequest =
    request ??
    ((path) =>
      apiFetch<AggregateEventsResponse>(path, {
        companyScopeId,
        signal,
      }));

  return fetchCompleteAggregatePartition({
    execute,
    from,
    granularity,
    metricType,
    signal,
    splitDepth: 0,
    to,
  });
}

async function fetchCompleteAggregatePartition({
  execute,
  from,
  granularity,
  metricType,
  signal,
  splitDepth,
  to,
}: {
  execute: CompleteAggregateRequest;
  from: Date;
  granularity: AggregateGranularity;
  metricType: string;
  signal?: AbortSignal;
  splitDepth: number;
  to: Date;
}): Promise<AggregateEventRow[]> {
  signal?.throwIfAborted();
  const params = new URLSearchParams({
    from: aggregateQueryIso(from, granularity),
    granularity,
    metric_type: metricType,
    to: aggregateQueryIso(to, granularity),
  });
  const response = await execute(`/analytics/aggregate?${params.toString()}`);
  const responseGranularity = requireAggregateGranularity(
    response.granularity,
    granularity,
  );
  const rows = requireAggregateRowsInRange(
    response.data,
    responseGranularity,
    from,
    to,
    metricType,
  );

  if (rows.length < AGGREGATE_RESPONSE_ROW_CEILING) return rows;

  const split = splitCompleteAggregateRange(from, to, granularity);
  if (!split || splitDepth >= MAX_COMPLETENESS_SPLIT_DEPTH) {
    throw new Error(
      `A consulta ${granularity} atingiu o limite seguro em um único intervalo e não pode ser certificada como completa.`,
    );
  }

  const completeRows: AggregateEventRow[] = [];
  for (const partition of split) {
    signal?.throwIfAborted();
    completeRows.push(
      ...(await fetchCompleteAggregatePartition({
        execute,
        from: partition.from,
        granularity,
        metricType,
        signal,
        splitDepth: splitDepth + 1,
        to: partition.to,
      })),
    );
  }

  return requireAggregateRows(completeRows, granularity, metricType);
}

export function splitCompleteAggregateRange(
  from: Date,
  to: Date,
  granularity: AggregateGranularity,
): readonly [
  Readonly<{ from: Date; to: Date }>,
  Readonly<{ from: Date; to: Date }>,
] | null {
  if (from >= to) return null;

  const firstBucketEnd = endOfAggregateBucket(from, granularity);
  if (firstBucketEnd >= to) return null;

  const midpoint = new Date(
    from.getTime() + Math.floor((to.getTime() - from.getTime()) / 2),
  );
  let boundary = startOfAggregateBucket(midpoint, granularity);
  if (boundary <= from) boundary = firstBucketEnd;
  if (boundary >= to) return null;

  return [
    { from: new Date(from), to: new Date(boundary) },
    { from: new Date(boundary), to: new Date(to) },
  ];
}

function requireCompleteAggregateOptions(
  from: Date,
  to: Date,
  metricType: string,
) {
  if (
    !(from instanceof Date) ||
    Number.isNaN(from.getTime()) ||
    !(to instanceof Date) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    throw new RangeError("O intervalo agregado deve ter início anterior ao fim.");
  }
  if (!metricType.trim()) {
    throw new TypeError("O tipo da métrica agregada é obrigatório.");
  }
}
