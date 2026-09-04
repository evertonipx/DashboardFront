import {
  aggregateQueryIso,
  requireAggregateGranularity,
  requireAggregateRowsInRange,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import { reconcileAggregateRows } from "@/lib/aggregate-reconciliation";
import { apiFetch } from "@/lib/api";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
} from "@/lib/types";

const DEFAULT_METRIC_TYPE = "count";
const MAX_CACHE_ENTRIES = 4;
const AGGREGATE_RESPONSE_ROW_CEILING = 1_000;
const MAX_COMPLETENESS_SPLIT_DEPTH = 16;

type MinuteDayAggregateReadyEntry = Readonly<{
  catchUpError?: string;
  coveredTo: string;
  retryRevision?: string;
  rows: readonly AggregateEventRow[];
  status: "ready";
}>;

type MinuteDayAggregateErrorEntry = Readonly<{
  message: string;
  retryRevision: string;
  status: "error";
}>;

export type MinuteDayAggregateCacheEntry =
  | MinuteDayAggregateReadyEntry
  | MinuteDayAggregateErrorEntry;

export type MinuteDayAggregateCache = Map<
  string,
  MinuteDayAggregateCacheEntry
>;

export function clearMinuteDayAggregateCache(
  cache: MinuteDayAggregateCache,
) {
  cache.clear();
}

/**
 * Bootstraps the current civil day once. Subsequent five-second refreshes use
 * the already requested rolling minute source to reconcile this cache instead
 * of downloading every elapsed minute again.
 */
export async function fetchMinuteDayAggregateBootstrap({
  cache,
  cacheScope,
  companyScopeId,
  from,
  metricType = DEFAULT_METRIC_TYPE,
  now = new Date(),
  signal,
  to,
}: {
  cache: MinuteDayAggregateCache;
  cacheScope: string;
  companyScopeId?: string;
  from: Date;
  metricType?: string;
  now?: Date;
  signal?: AbortSignal;
  to: Date;
}) {
  requireFetchOptions(cacheScope, metricType, from, to, now);
  signal?.throwIfAborted();
  const key = minuteDayAggregateCacheKey(cacheScope, metricType, from);
  const cached = cache.get(key);
  if (cached?.status === "ready") return [...cached.rows];

  if (from.getTime() === to.getTime()) {
    cache.set(key, {
      coveredTo: to.toISOString(),
      rows: [],
      status: "ready",
    });
    trimCache(cache);
    return [];
  }

  const retryRevision = startOfAggregateBucket(
    now,
    "minute",
  ).toISOString();
  if (
    cached?.status === "error" &&
    cached.retryRevision === retryRevision
  ) {
    throw new Error(cached.message);
  }

  try {
    const rows = await fetchMinuteAggregateRange({
      companyScopeId,
      from,
      metricType,
      signal,
      to,
    });
    signal?.throwIfAborted();
    cache.set(key, {
      coveredTo: to.toISOString(),
      rows: [...rows],
      status: "ready",
    });
    trimCache(cache);
    return rows;
  } catch (error) {
    if (signal?.aborted || isAbortLikeError(error)) throw error;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar os minutos do dia.";
    cache.set(key, { message, retryRevision, status: "error" });
    trimCache(cache);
    throw new Error(message);
  }
}

export async function refreshMinuteDayAggregateCache({
  cache,
  cacheScope,
  companyScopeId,
  from,
  metricType = DEFAULT_METRIC_TYPE,
  now = new Date(),
  signal,
  sourceFrom,
  sourceRows,
  sourceTo,
}: {
  cache: MinuteDayAggregateCache;
  cacheScope: string;
  companyScopeId?: string;
  from: Date;
  metricType?: string;
  now?: Date;
  signal?: AbortSignal;
  sourceFrom: Date;
  sourceRows: AggregateEventRow[];
  sourceTo: Date;
}) {
  const key = minuteDayAggregateCacheKey(cacheScope, metricType, from);
  const cached = cache.get(key);
  if (cached?.status !== "ready") return null;
  if (
    !(sourceFrom instanceof Date) ||
    Number.isNaN(sourceFrom.getTime()) ||
    !(sourceTo instanceof Date) ||
    Number.isNaN(sourceTo.getTime()) ||
    sourceFrom >= sourceTo
  ) {
    throw new RangeError(
      "A janela de reconciliação minuto a minuto é inválida.",
    );
  }
  const coveredTo = new Date(cached.coveredTo);
  if (Number.isNaN(coveredTo.getTime()) || coveredTo < from) {
    throw new RangeError("A cobertura do cache minuto a minuto é inválida.");
  }

  let rows = [...cached.rows];
  if (sourceFrom > coveredTo) {
    const retryRevision = startOfAggregateBucket(
      now,
      "minute",
    ).toISOString();
    if (
      cached.catchUpError &&
      cached.retryRevision === retryRevision
    ) {
      throw new Error(cached.catchUpError);
    }

    try {
      const catchUpRows = await fetchMinuteAggregateRange({
        companyScopeId,
        from: coveredTo,
        metricType,
        signal,
        to: sourceFrom,
      });
      signal?.throwIfAborted();
      rows = reconcileAggregateRows(
        rows,
        "minute",
        catchUpRows,
        "minute",
        coveredTo,
        sourceFrom,
      );
    } catch (error) {
      if (signal?.aborted || isAbortLikeError(error)) throw error;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível recuperar a lacuna minuto a minuto.";
      cache.set(key, {
        ...cached,
        catchUpError: message,
        retryRevision,
      });
      throw new Error(message);
    }
  }

  rows = reconcileAggregateRows(
    rows,
    "minute",
    sourceRows,
    "minute",
    sourceFrom,
    sourceTo,
  );
  signal?.throwIfAborted();
  cache.set(key, {
    coveredTo: new Date(
      Math.max(coveredTo.getTime(), sourceTo.getTime()),
    ).toISOString(),
    rows,
    status: "ready",
  });
  return rows;
}

export function minuteDayAggregateCacheKey(
  cacheScope: string,
  metricType: string,
  from: Date,
) {
  return JSON.stringify([
    cacheScope,
    metricType,
    aggregateQueryIso(from, "minute"),
  ]);
}

function requireFetchOptions(
  cacheScope: string,
  metricType: string,
  from: Date,
  to: Date,
  now: Date,
) {
  if (!cacheScope.trim()) {
    throw new TypeError("O escopo do cache minuto a minuto é obrigatório.");
  }
  if (!metricType.trim()) {
    throw new TypeError("O tipo de métrica minuto a minuto é obrigatório.");
  }
  [from, to, now].forEach((value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError("A referência da consulta minuto a minuto é inválida.");
    }
  });
  if (from > to) {
    throw new RangeError("O intervalo minuto a minuto é inválido.");
  }
}

async function fetchMinuteAggregateRange({
  companyScopeId,
  from,
  metricType,
  signal,
  splitDepth = 0,
  to,
}: {
  companyScopeId?: string;
  from: Date;
  metricType: string;
  signal?: AbortSignal;
  to: Date;
  splitDepth?: number;
}): Promise<AggregateEventRow[]> {
  const params = new URLSearchParams({
    from: aggregateQueryIso(from, "minute"),
    granularity: "minute",
    metric_type: metricType,
    to: aggregateQueryIso(to, "minute"),
  });
  const response = await apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
    { companyScopeId, signal },
  );
  const granularity = requireAggregateGranularity(
    response.granularity,
    "minute",
  );
  const rows = requireAggregateRowsInRange(
    response.data,
    granularity,
    from,
    to,
    metricType,
  );
  if (rows.length < AGGREGATE_RESPONSE_ROW_CEILING) return rows;

  const durationMinutes = Math.floor(
    (to.getTime() - from.getTime()) / 60_000,
  );
  if (durationMinutes <= 1 || splitDepth >= MAX_COMPLETENESS_SPLIT_DEPTH) {
    throw new Error(
      "A consulta minuto a minuto excedeu o limite seguro em um único intervalo.",
    );
  }
  const split = new Date(
    from.getTime() + Math.floor(durationMinutes / 2) * 60_000,
  );
  const left = await fetchMinuteAggregateRange({
    companyScopeId,
    from,
    metricType,
    signal,
    splitDepth: splitDepth + 1,
    to: split,
  });
  const right = await fetchMinuteAggregateRange({
    companyScopeId,
    from: split,
    metricType,
    signal,
    splitDepth: splitDepth + 1,
    to,
  });
  return [...left, ...right];
}

function trimCache(cache: MinuteDayAggregateCache) {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") return;
    cache.delete(oldestKey);
  }
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
