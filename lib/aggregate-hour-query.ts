import {
  aggregateBucketInRange,
  aggregateQueryIso,
  requireAggregateGranularity,
  requireAggregateRows,
  requireAggregateRowsInRange,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  MAX_HOURLY_CALENDAR_MONTH_QUERIES,
  planHourlyCalendarMonthQueries,
  type AggregateQueryRange,
  type HourlyCalendarMonthQuery,
} from "@/lib/aggregate-query-plan";
import { apiFetch } from "@/lib/api";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
} from "@/lib/types";

const DEFAULT_METRIC_TYPE = "count";
const DEFAULT_QUERY_CONCURRENCY = 4;
const RECENTLY_CLOSED_MONTH_MS = 48 * 60 * 60 * 1_000;

export type HourlyAggregateCacheEntry = Readonly<{
  revision: string;
  rows: readonly AggregateEventRow[];
}>;

export type HourlyAggregateCache = Map<
  string,
  HourlyAggregateCacheEntry
>;

export function clearHourlyAggregateCache(cache: HourlyAggregateCache) {
  cache.clear();
  pendingRequestsByCache.get(cache)?.clear();
}

type PendingHourlyAggregateRequest = Readonly<{
  promise: Promise<readonly AggregateEventRow[]>;
  revision: string;
  signal?: AbortSignal;
}>;

type HourlyAggregateQuery = Readonly<{
  key: string;
  from: Date;
  to: Date;
}>;

const pendingRequestsByCache = new WeakMap<
  HourlyAggregateCache,
  Map<string, PendingHourlyAggregateRequest>
>();

type FetchHourlyAggregateRangesOptions = {
  cache?: HourlyAggregateCache;
  cacheScope: string;
  companyScopeId?: string;
  metricType?: string;
  now?: Date;
  queryConcurrency?: number;
  ranges: readonly AggregateQueryRange[];
  signal?: AbortSignal;
};

/**
 * Loads one deterministic, validated civil-month request per required month.
 * Open and recently closed months refresh hourly; older months refresh daily.
 */
export async function fetchHourlyAggregateRanges({
  cache,
  cacheScope,
  companyScopeId,
  metricType = DEFAULT_METRIC_TYPE,
  now = new Date(),
  queryConcurrency = DEFAULT_QUERY_CONCURRENCY,
  ranges,
  signal,
}: FetchHourlyAggregateRangesOptions) {
  requireValidFetchOptions(cacheScope, metricType, now, queryConcurrency);
  const queries = planHourlyCalendarMonthQueries(ranges);
  if (queries.length > MAX_HOURLY_CALENDAR_MONTH_QUERIES) {
    throw new RangeError(
      `O período horário excede ${MAX_HOURLY_CALENDAR_MONTH_QUERIES} meses. Reduza o intervalo para evitar uma carga incompleta.`,
    );
  }
  const rowsByQuery = await mapWithConcurrency(
    queries,
    queryConcurrency,
    (query) =>
      loadHourlyAggregateQuery({
        cache,
        cacheScope,
        companyScopeId,
        query,
        metricType,
        revision: hourlyAggregateCacheRevision(query, now),
        signal,
      }),
  );
  const rows = rowsByQuery.flat();

  return filterHourlyAggregateRowsToRanges(rows, ranges, metricType);
}

/**
 * Same certified/cached loader used by the dashboards, but each civil-month
 * request is clipped to the requested intersections. This is intended for a
 * bounded drill-down window where fetching the rest of either edge month
 * would defeat the range budget.
 */
export async function fetchBoundedHourlyAggregateRanges({
  cache,
  cacheScope,
  companyScopeId,
  metricType = DEFAULT_METRIC_TYPE,
  now = new Date(),
  queryConcurrency = DEFAULT_QUERY_CONCURRENCY,
  ranges,
  signal,
}: FetchHourlyAggregateRangesOptions) {
  requireValidFetchOptions(cacheScope, metricType, now, queryConcurrency);
  const queries = planBoundedHourlyQueries(ranges);
  const rowsByQuery = await mapWithConcurrency(
    queries,
    queryConcurrency,
    (query) =>
      loadHourlyAggregateQuery({
        cache,
        cacheScope,
        companyScopeId,
        query,
        metricType,
        revision: hourlyAggregateCacheRevision(query, now),
        signal,
      }),
  );

  return filterHourlyAggregateRowsToRanges(
    rowsByQuery.flat(),
    ranges,
    metricType,
  );
}

function planBoundedHourlyQueries(
  ranges: readonly AggregateQueryRange[],
): HourlyAggregateQuery[] {
  const months = planHourlyCalendarMonthQueries(ranges);
  const queries = new Map<string, HourlyAggregateQuery>();

  months.forEach((month) => {
    ranges.forEach((range) => {
      const from = new Date(
        Math.max(month.from.getTime(), range.from.getTime()),
      );
      const to = new Date(Math.min(month.to.getTime(), range.to.getTime()));
      if (from >= to) return;

      const key = `${month.key}:${from.toISOString()}:${to.toISOString()}`;
      queries.set(key, { from, key, to });
    });
  });

  return Array.from(queries.values()).sort(
    (left, right) => left.from.getTime() - right.from.getTime(),
  );
}

export function filterHourlyAggregateRowsToRanges(
  rows: AggregateEventRow[],
  ranges: readonly AggregateQueryRange[],
  metricType = DEFAULT_METRIC_TYPE,
) {
  planHourlyCalendarMonthQueries(ranges);
  return requireAggregateRows(
    rows.filter((row) =>
      ranges.some((range) =>
        aggregateBucketInRange(
          row.bucket,
          "hour",
          range.from,
          range.to,
        ),
      ),
    ),
    "hour",
    metricType,
  );
}

export function hourlyAggregateCacheKey(
  cacheScope: string,
  metricType: string,
  query: Pick<HourlyCalendarMonthQuery, "key">,
) {
  return JSON.stringify([cacheScope, metricType, query.key]);
}

export function hourlyAggregateCacheRevision(
  query: Pick<HourlyCalendarMonthQuery, "from" | "to">,
  now: Date,
) {
  const hourlyRevision = startOfAggregateBucket(now, "hour").toISOString();
  if (query.from <= now && now < query.to) {
    return `hour:${hourlyRevision}`;
  }
  if (
    query.to > now ||
    now.getTime() - query.to.getTime() <= RECENTLY_CLOSED_MONTH_MS
  ) {
    return `hour:${hourlyRevision}`;
  }

  return `day:${startOfAggregateBucket(now, "day").toISOString()}`;
}

async function fetchHourlyAggregateQuery(
  query: HourlyAggregateQuery,
  metricType: string,
  signal?: AbortSignal,
  companyScopeId?: string,
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(query.from, "hour"),
    granularity: "hour",
    metric_type: metricType,
    to: aggregateQueryIso(query.to, "hour"),
  });
  const response = await apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
    { companyScopeId, signal },
  );
  const granularity = requireAggregateGranularity(
    response.granularity,
    "hour",
  );
  return requireAggregateRowsInRange(
    response.data,
    granularity,
    query.from,
    query.to,
    metricType,
  );
}

async function loadHourlyAggregateQuery({
  cache,
  cacheScope,
  companyScopeId,
  metricType,
  query,
  revision,
  signal,
}: {
  cache?: HourlyAggregateCache;
  cacheScope: string;
  companyScopeId?: string;
  metricType: string;
  query: HourlyAggregateQuery;
  revision: string;
  signal?: AbortSignal;
}) {
  signal?.throwIfAborted();
  const cacheKey = hourlyAggregateCacheKey(
    cacheScope,
    metricType,
    query,
  );
  const cached = cache?.get(cacheKey);
  if (cached?.revision === revision) return cached.rows;

  const pendingRequests = cache
    ? pendingRequestsForCache(cache)
    : undefined;
  const pending = pendingRequests?.get(cacheKey);
  if (
    pending?.revision === revision &&
    pending.signal === signal
  ) {
    return pending.promise;
  }

  const promise = fetchHourlyAggregateQuery(
    query,
    metricType,
    signal,
    companyScopeId,
  );
  pendingRequests?.set(cacheKey, { promise, revision, signal });

  try {
    const rows = await promise;
    signal?.throwIfAborted();
    const activeRequest = pendingRequests?.get(cacheKey);
    if (activeRequest?.promise === promise) {
      cache?.set(cacheKey, { revision, rows });
    }
    return rows;
  } finally {
    if (pendingRequests?.get(cacheKey)?.promise === promise) {
      pendingRequests.delete(cacheKey);
    }
  }
}

function pendingRequestsForCache(cache: HourlyAggregateCache) {
  const existing = pendingRequestsByCache.get(cache);
  if (existing) return existing;

  const pending = new Map<string, PendingHourlyAggregateRequest>();
  pendingRequestsByCache.set(cache, pending);
  return pending;
}

async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  operation: (value: Input) => Promise<Output>,
) {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

function requireValidFetchOptions(
  cacheScope: string,
  metricType: string,
  now: Date,
  queryConcurrency: number,
) {
  if (!cacheScope.trim()) {
    throw new TypeError("O escopo do cache horário é obrigatório.");
  }
  if (!metricType.trim()) {
    throw new TypeError("O tipo de métrica horário é obrigatório.");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("A referência da consulta horária é inválida.");
  }
  if (
    !Number.isSafeInteger(queryConcurrency) ||
    queryConcurrency < 1
  ) {
    throw new RangeError(
      "A concorrência da consulta horária deve ser um inteiro positivo.",
    );
  }
}
