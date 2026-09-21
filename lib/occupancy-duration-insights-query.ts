import {
  companyDateKey,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  aggregateOccupancyRowsByBucket,
  requireOccupancyAggregateRows,
  type OccupancyAggregateMetric,
} from "@/lib/occupancy-aggregate-validation";
import { buildOccupancyDurationSummary } from "@/lib/occupancy-duration";
import {
  summarizeOccupancyDurationInsightHours,
  type OccupancyDurationInsightHour,
  type OccupancyDurationInsightMonth,
  type OccupancyDurationInsightScenario,
} from "@/lib/occupancy-duration-insights";
import {
  occupancyDurationMinuteTransportTtl,
  occupancyDurationReconciliationFrom,
} from "@/lib/occupancy-duration-refresh";
import { fetchSharedOccupancyQuery } from "@/lib/occupancy-shared-query";
import type { OccupancyScenarioAggregateResponse } from "@/lib/types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_MONTH_MS = 32 * 25 * HOUR_MS;
const MAX_RESPONSE_ROWS = 1_000;
const MAX_MINUTE_BATCH = 480;
const RECONCILE_MS = 15 * MINUTE_MS;
// Closed hours are immutable for the live reading except for delayed backend
// corrections. Reaudit them in six-hour windows; the open hour still uses the
// minute reconciliation below and therefore remains current.
export const OCCUPANCY_DURATION_CLOSED_CACHE_TTL_MS = 6 * HOUR_MS;
const SHARED_CACHE_IDLE_TTL_MS = 12 * HOUR_MS;
const MAX_SHARED_CACHE_SCOPES = 12;
const MAX_DAYS_PER_SHARED_CACHE = 384;

type CachedSpan = {
  asOf?: number;
  cachedAt?: number;
  final: boolean;
  hours: OccupancyDurationInsightHour[];
  minuteMetrics?: Map<number, OccupancyAggregateMetric>;
  resolution?: "conservative" | "exact";
  reconciledAt?: number;
  refreshedAt: number;
  to: number;
};

export type OccupancyDurationInsightDayCache = {
  from: number;
  spans: Map<number, CachedSpan>;
  to: number;
};

/** Cache payload. Sharing is allowed only through an authenticated scope. */
export type OccupancyDurationInsightQueryCache = Map<
  string,
  OccupancyDurationInsightDayCache
>;

type OccupancyDurationInsightCacheScope = {
  companyScopeId: string;
  timeZone: string;
  userId?: string | null;
};

type SharedDurationInsightCache = {
  cache: OccupancyDurationInsightQueryCache;
  lastUsedAt: number;
};

// This is deliberately process-memory only. The authenticated user is part of
// the key, so a tenant switch or logout can never expose another principal's
// data. Keeping it outside React lets a remount, navigation back or a switch
// away from and back to a scenario reuse certified closed hours.
const sharedDurationInsightCaches = new Map<
  string,
  SharedDurationInsightCache
>();

export function acquireOccupancyDurationInsightQueryCache(
  scope: OccupancyDurationInsightCacheScope,
  now = Date.now(),
): OccupancyDurationInsightQueryCache | null {
  const key = durationInsightCacheScopeKey(scope);
  if (!key) return null;
  pruneSharedDurationInsightCaches(now);
  const existing = sharedDurationInsightCaches.get(key);
  if (existing) {
    existing.lastUsedAt = now;
    // Refresh insertion order so the bounded pool behaves as a small LRU.
    sharedDurationInsightCaches.delete(key);
    sharedDurationInsightCaches.set(key, existing);
    return existing.cache;
  }
  const created = { cache: new Map(), lastUsedAt: now };
  sharedDurationInsightCaches.set(key, created);
  pruneSharedDurationInsightCaches(now);
  return created.cache;
}

/**
 * An explicit refresh invalidates the mutable span and, for a fully closed
 * range, only its latest hour. Older closed hours remain subject to their
 * bounded correction TTL instead of replaying a whole month.
 */
export function invalidateOccupancyDurationInsightOpenEdge(
  cache: OccupancyDurationInsightQueryCache,
  scope: {
    from?: number;
    scenarioIds?: ReadonlySet<string>;
    to?: number;
  } = {},
) {
  const candidates: Array<{
    day: OccupancyDurationInsightDayCache;
    from: number;
    group: string;
    span: CachedSpan;
  }> = [];
  for (const [cacheKey, day] of cache) {
    const scenarioId = durationInsightCacheScenarioId(cacheKey);
    if (
      (scope.scenarioIds !== undefined &&
        !scope.scenarioIds.has(scenarioId)) ||
      (scope.from !== undefined && day.to <= scope.from) ||
      (scope.to !== undefined && day.from >= scope.to)
    ) {
      continue;
    }
    for (const [from, span] of day.spans) {
      if (
        (scope.from === undefined || span.to > scope.from) &&
        (scope.to === undefined || from < scope.to)
      ) {
        candidates.push({ day, from, group: scenarioId || cacheKey, span });
      }
    }
  }
  const latestByScenario = new Map<string, number>();
  candidates.forEach(({ group, span }) => {
    latestByScenario.set(
      group,
      Math.max(latestByScenario.get(group) ?? Number.NEGATIVE_INFINITY, span.to),
    );
  });
  candidates.forEach(({ day, from, group, span }) => {
    if (!span.final || span.to === latestByScenario.get(group)) {
      day.spans.delete(from);
    }
  });
}

/** Test/session hygiene; production isolation does not depend on this call. */
export function clearOccupancyDurationInsightQueryCaches() {
  sharedDurationInsightCaches.clear();
}

type QueryContext = {
  bypassTransportCache?: boolean;
  companyScopeId: string;
  scenarioId: string;
  signal: AbortSignal;
  timeZone: string;
};

type Span = {
  cacheKey: string;
  cached?: CachedSpan;
  final: boolean;
  from: number;
  to: number;
};

type AggregateResult = {
  asOf?: number;
  metrics: Map<number, OccupancyAggregateMetric>;
};

type MinuteRefinement = {
  from: number;
  span: Span;
  to: number;
};

/**
 * One coarse request normally covers the entire elapsed month. An hourly
 * minimum > 0 proves the whole hour occupied; a zero peak proves it free.
 * Only transitions need minute resolution. No average is converted into an
 * invented dwell time, and missing buckets always remain unknown.
 *
 * Closed spans retain only small civil-hour summaries. In live mode, minute
 * refinement is capped to one recent eight-hour envelope; older mixed hours
 * remain explicitly transitional instead of triggering dozens of GETs or
 * inventing a duration. Manual analysis still requests the complete exact
 * refinement. The open span reconciles one rolling five-minute edge per newly
 * closed minute; after a short suspended interval, that request expands to
 * cover the gap within the live cap. Changing company or timezone cannot
 * reuse another scope's cache. Closed summaries expire after six wall-clock
 * hours, including fully covered hours, so later corrections are observed.
 * All cache writes are committed only after success.
 */
export async function fetchOccupancyDurationInsightScenario({
  bypassTransportCache = true,
  cache,
  companyScopeId,
  minuteRefinement = "complete",
  month,
  name,
  scenarioId,
  signal,
  timeZone,
}: QueryContext & {
  cache: OccupancyDurationInsightQueryCache;
  minuteRefinement?: "complete" | "live-edge";
  month: OccupancyDurationInsightMonth;
  name: string;
}): Promise<OccupancyDurationInsightScenario> {
  signal.throwIfAborted();
  requireIdentity(companyScopeId, "empresa");
  requireIdentity(scenarioId, "cenário");
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  requireMonth(month, canonicalTimeZone);
  const context = {
    bypassTransportCache,
    companyScopeId,
    scenarioId,
    signal,
    timeZone: canonicalTimeZone,
  };
  const cacheTime = Date.now();
  const pending = new Map<string, OccupancyDurationInsightDayCache>();
  const spans = planSpans(
    context,
    month,
    cache,
    pending,
    cacheTime,
    minuteRefinement,
  );
  const unresolved = spans.filter((span) => !span.cached?.final);
  const fullHours = unresolved.filter(
    (span) => span.final && span.from % HOUR_MS === 0 && span.to - span.from === HOUR_MS,
  );
  const refinements: MinuteRefinement[] = [];
  const liveRefinementFrom = liveMinuteRefinementFrom(
    month,
    canonicalTimeZone,
  );

  // Gaps in an already-populated cache become separate ranges. A cold cache
  // produces one month-wide hourly request, not one request for each day.
  for (const group of contiguousGroups(fullHours)) {
    const result = await fetchAggregate(context, group.map((span) => span.from), group.at(-1)!.to, "hour");
    group.forEach((span) => {
      const metric = result.metrics.get(span.from);
      if (
        metric &&
        metric.minimum === 0 &&
        metric.peak > 0 &&
        (minuteRefinement === "complete" || span.from >= liveRefinementFrom)
      ) {
        refinements.push({ from: span.from, span, to: span.to });
        return;
      }
      const metrics = new Map<number, OccupancyAggregateMetric>();
      if (metric) {
        for (let minute = span.from; minute < span.to; minute += MINUTE_MS) {
          metrics.set(minute, metric);
        }
      }
      storeSpan(pending, span, {
        asOf: result.asOf,
        cachedAt: cacheTime,
        final: true,
        hours: summarizeSpan(span, metrics, canonicalTimeZone),
        resolution:
          metric && metric.minimum === 0 && metric.peak > 0
            ? "conservative"
            : "exact",
        refreshedAt: month.to.getTime(),
        to: span.to,
      });
    });
  }

  const fullHourSet = new Set(fullHours);
  unresolved.filter((span) => !fullHourSet.has(span)).forEach((span) => {
    const cached = span.cached;
    // An open span is made only of closed minutes. It cannot change until its
    // exclusive end advances; an explicit refresh removes this cache entry.
    if (cached && cached.to === span.to) return;
    refinements.push({
      from: !cached?.minuteMetrics || cached.to > span.to
        ? minuteRefinement === "live-edge"
          ? Math.max(span.from, liveRefinementFrom)
          : span.from
        : occupancyDurationReconciliationFrom(
            minuteRefinement === "live-edge"
              ? Math.max(span.from, liveRefinementFrom)
              : span.from,
            span.to,
            Math.max(cached.to, liveRefinementFrom),
          ),
      span,
      to: span.to,
    });
  });

  refinements.sort((left, right) => left.from - right.from);
  for (const group of boundedMinuteRefinementGroups(refinements)) {
    const from = group[0].from;
    const to = group.at(-1)!.to;
    const result = await fetchAggregate(
      context,
      bucketStarts(from, to, MINUTE_MS),
      to,
      "minute",
    );
    const metrics = result.metrics;
    const sourceAsOf = result.asOf;
    group.forEach(({ from: requestFrom, span }) => {
      const merged = requestFrom > span.from
        ? new Map(span.cached?.minuteMetrics)
        : new Map<number, OccupancyAggregateMetric>();
      for (let cursor = requestFrom; cursor < span.to; cursor += MINUTE_MS) {
        const metric = metrics.get(cursor);
        if (metric) merged.set(cursor, metric);
        else merged.delete(cursor);
      }
      storeSpan(pending, span, {
        asOf: requestFrom > span.from
          ? oldestCutoff([span.cached?.asOf, sourceAsOf])
          : sourceAsOf,
        final: span.final,
        cachedAt: cacheTime,
        hours: summarizeSpan(span, merged, canonicalTimeZone),
        minuteMetrics: span.final ? undefined : merged,
        resolution: "exact",
        reconciledAt: requestFrom === span.from ? span.to : span.cached?.reconciledAt,
        refreshedAt: month.to.getTime(),
        to: span.to,
      });
    });
  }

  signal.throwIfAborted();
  const values = spans.map((span) => pending.get(span.cacheKey)!.spans.get(span.from)!);
  const hours = values.flatMap((value) => value.hours.map((hour) => ({ ...hour })));
  const cutoff = oldestCutoff(values.map((value) => value.asOf));
  // Another mounted surface can finish the same scope while this request is
  // running. Merge atomically instead of replacing the whole civil day, and
  // never let an older/shorter edge overwrite a newer one.
  pending.forEach((day, key) => {
    const current = cache.get(key);
    if (!current || current.from !== day.from || current.to !== day.to) {
      cache.set(key, day);
      return;
    }
    const spans = new Map(current.spans);
    day.spans.forEach((candidate, from) => {
      const existing = spans.get(from);
      if (!existing || durationInsightSpanIsNewer(candidate, existing)) {
        spans.set(from, candidate);
      }
    });
    cache.set(key, { ...day, spans });
  });
  pruneDurationInsightDayCache(cache, new Set(pending.keys()));
  return {
    asOf: cutoff === undefined || hours.some((hour) => hour.unknownSeconds > 0)
      ? undefined : new Date(cutoff),
    hours,
    name,
    scenarioId,
  };
}

async function fetchAggregate(
  context: QueryContext,
  buckets: number[],
  to: number,
  granularity: "hour" | "minute",
): Promise<AggregateResult> {
  context.signal.throwIfAborted();
  const params = new URLSearchParams({
    from: new Date(buckets[0]).toISOString(),
    granularity,
    to: new Date(to).toISOString(),
  });
  const response = await fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
    bypassCache: context.bypassTransportCache,
    cacheTtlMs: context.bypassTransportCache
      ? 0
      : granularity === "minute"
        ? occupancyDurationMinuteTransportTtl()
        : MINUTE_MS,
    companyScopeId: context.companyScopeId,
    path: `/occupancy/scenarios/${encodeURIComponent(context.scenarioId)}/aggregate?${params.toString()}`,
    priority: "background",
    scenarioId: context.scenarioId,
    signal: context.signal,
    timeZone: context.timeZone,
  });
  context.signal.throwIfAborted();

  // A backend row cap applies to areas as well as hours. Re-query smaller
  // time ranges before accepting coverage, even if 1,000 rows look valid.
  if (Array.isArray(response?.data) && response.data.length >= MAX_RESPONSE_ROWS) {
    requireEnvelope(response, context, granularity);
    if (buckets.length < 2) {
      throw new Error("O volume de dados deste intervalo impede calcular a duração com segurança.");
    }
    const middle = Math.floor(buckets.length / 2);
    const [left, right] = await Promise.all([
      fetchAggregate(
        context,
        buckets.slice(0, middle),
        buckets[middle],
        granularity,
      ),
      fetchAggregate(
        context,
        buckets.slice(middle),
        to,
        granularity,
      ),
    ]);
    return {
      asOf: oldestCutoff([left.asOf, right.asOf]),
      metrics: new Map([...left.metrics, ...right.metrics]),
    };
  }
  const options = {
    allowDocumentedAggregateResponse: true,
    expectedTimezone: context.timeZone,
    requireCertification: true,
  };
  const rows = requireOccupancyAggregateRows(
    response, granularity, context.scenarioId, context.timeZone, options,
  );
  // Hour identities are absolute: validating Date alignment using the
  // browser's local offset would reject UTC hours on a +05:30 workstation.
  const metrics = granularity === "hour"
    ? aggregateOccupancyRowsByBucket(rows, granularity, options)
    : aggregateOccupancyRowsForRequestedBuckets(
        rows, granularity, buckets.map((bucket) => new Date(bucket)), options,
      ).totals;
  const requested = new Set(buckets);
  if (Array.from(metrics.keys()).some((bucket) => !requested.has(bucket))) {
    throw new Error("Os dados retornados estão fora do período solicitado.");
  }
  return {
    asOf: response.timezone && response.complete === true && response.status === "complete" && response.as_of
      ? Date.parse(response.as_of) : undefined,
    metrics,
  };
}

function requireEnvelope(
  response: OccupancyScenarioAggregateResponse,
  context: QueryContext,
  granularity: "hour" | "minute",
) {
  if (response.scenario_id !== context.scenarioId || response.granularity !== granularity ||
    (response.timezone !== undefined && requireCompanyTimeZone(response.timezone) !== context.timeZone)) {
    throw new Error("Os dados retornados não correspondem ao cenário e período selecionados.");
  }
}

function planSpans(
  context: QueryContext,
  month: OccupancyDurationInsightMonth,
  cache: OccupancyDurationInsightQueryCache,
  pending: OccupancyDurationInsightQueryCache,
  cacheTime: number,
  minuteRefinement: "complete" | "live-edge",
) {
  const spans: Span[] = [];
  const boundaries = month.dateKeys.map((dateKey) => {
    const [year, monthNumber, day] = dateKey.split("-").map(Number);
    return startOfCompanyTimeZoneCivilDay({ year, month: monthNumber, day }, context.timeZone).getTime();
  });
  if (boundaries[0] !== month.from.getTime() || boundaries.some((from, index) => {
    const end = boundaries[index + 1] ?? month.monthEnd.getTime();
    return end <= from || end - from > 26 * HOUR_MS;
  })) {
    throw new RangeError("O período de duração não contém todos os dias do calendário.");
  }
  boundaries.forEach((from, index) => {
    if (from >= month.to.getTime()) return;
    const dayEnd = boundaries[index + 1] ?? month.monthEnd.getTime();
    const cacheKey = JSON.stringify([
      context.companyScopeId, context.scenarioId, context.timeZone, month.dateKeys[index],
    ]);
    const previous = cache.get(cacheKey);
    const day = {
      from,
      spans: previous?.from === from && previous.to === dayEnd
        ? new Map(previous.spans) : new Map<number, CachedSpan>(),
      to: dayEnd,
    };
    pending.set(cacheKey, day);
    const through = Math.min(dayEnd, month.to.getTime());
    for (let cursor = from; cursor < through;) {
      const end = Math.min(dayEnd, (Math.floor(cursor / HOUR_MS) + 1) * HOUR_MS);
      const to = Math.min(through, end);
      const cached = day.spans.get(cursor);
      // A fixed historical cutoff cannot measure freshness. Revalidate legacy
      // cache entries and a clock that moved backward as well as expired data.
      const expiredClosed = Boolean(cached?.final && (
        !Number.isFinite(cached.cachedAt) ||
        cacheTime < cached.cachedAt! ||
        cacheTime - cached.cachedAt! >= OCCUPANCY_DURATION_CLOSED_CACHE_TTL_MS
      ));
      // Ingestion can lag behind the last closed hour. Revisit only recent
      // missing coverage at a bounded cadence, never the complete old month.
      const retryRecentGap = Boolean(cached?.final &&
        cached.hours.some((hour) => hour.unknownSeconds > 0) &&
        to >= month.to.getTime() - 24 * HOUR_MS &&
        month.to.getTime() - cached.refreshedAt >= RECONCILE_MS);
      const needsExactRefinement = Boolean(
        cached?.resolution === "conservative" &&
          minuteRefinement === "complete",
      );
      spans.push({
        cacheKey,
        cached:
          cached &&
          cached.to <= to &&
          !retryRecentGap &&
          !expiredClosed &&
          !needsExactRefinement
            ? cached
            : undefined,
        final: to === end,
        from: cursor,
        to,
      });
      cursor = to;
    }
  });
  return spans;
}

function summarizeSpan(span: Span, metrics: Map<number, OccupancyAggregateMetric>, timeZone: string) {
  return summarizeOccupancyDurationInsightHours(
    buildOccupancyDurationSummary(bucketStarts(span.from, span.to, MINUTE_MS).map((bucket) => new Date(bucket)), metrics),
    timeZone,
  );
}

function storeSpan(cache: OccupancyDurationInsightQueryCache, span: Span, value: CachedSpan) {
  cache.get(span.cacheKey)!.spans.set(span.from, value);
}

function bucketStarts(from: number, to: number, step: number) {
  const buckets: number[] = [];
  for (let cursor = from; cursor < to; cursor += step) buckets.push(cursor);
  return buckets;
}

function contiguousGroups<T extends { from: number; to: number }>(values: T[]) {
  const groups: T[][] = [];
  values.forEach((value) => {
    const group = groups.at(-1);
    if (group?.at(-1)?.to === value.from) group.push(value);
    else groups.push([value]);
  });
  return groups;
}

function boundedMinuteRefinementGroups<T extends { from: number; to: number }>(
  values: T[],
) {
  const groups: T[][] = [];
  const maximumSpan = MAX_MINUTE_BATCH * MINUTE_MS;
  values.forEach((value) => {
    const group = groups.at(-1);
    if (group && value.to - group[0].from <= maximumSpan) {
      group.push(value);
      return;
    }
    groups.push([value]);
  });
  return groups;
}

function liveMinuteRefinementFrom(
  month: OccupancyDurationInsightMonth,
  timeZone: string,
) {
  if (month.to.getTime() <= month.from.getTime()) return month.from.getTime();
  const dateKey = companyDateKey(new Date(month.to.getTime() - 1), timeZone);
  const [year, monthNumber, day] = dateKey.split("-").map(Number);
  const dayStart = startOfCompanyTimeZoneCivilDay(
    { year, month: monthNumber, day },
    timeZone,
  ).getTime();
  return Math.max(
    dayStart,
    month.to.getTime() - MAX_MINUTE_BATCH * MINUTE_MS,
  );
}

function oldestCutoff(values: Array<number | undefined>) {
  if (!values.length || values.some((value) => value === undefined || !Number.isFinite(value))) return undefined;
  return Math.min(...values as number[]);
}

function durationInsightSpanIsNewer(
  candidate: CachedSpan,
  existing: CachedSpan,
) {
  if (candidate.to !== existing.to) return candidate.to > existing.to;
  if (candidate.final !== existing.final) return candidate.final;
  if (candidate.resolution !== existing.resolution) {
    return candidate.resolution !== "conservative";
  }
  return durationInsightSpanFreshness(candidate) >=
    durationInsightSpanFreshness(existing);
}

function durationInsightSpanFreshness(span: CachedSpan) {
  return Math.max(
    Number.isFinite(span.cachedAt) ? span.cachedAt! : Number.NEGATIVE_INFINITY,
    Number.isFinite(span.reconciledAt)
      ? span.reconciledAt!
      : Number.NEGATIVE_INFINITY,
    Number.isFinite(span.refreshedAt)
      ? span.refreshedAt
      : Number.NEGATIVE_INFINITY,
  );
}

function durationInsightCacheScopeKey(
  scope: OccupancyDurationInsightCacheScope,
) {
  const userId = scope.userId?.trim() ?? "";
  const companyScopeId = scope.companyScopeId.trim();
  const timeZone = scope.timeZone.trim();
  // Without a certified user identity, fall back to the hook-local cache. A
  // blank shared key would allow two authenticated principals to meet here.
  if (!userId || !companyScopeId || !timeZone) return null;
  return JSON.stringify([userId, companyScopeId, timeZone]);
}

function durationInsightCacheScenarioId(cacheKey: string) {
  try {
    const value = JSON.parse(cacheKey) as unknown;
    return Array.isArray(value) && typeof value[1] === "string"
      ? value[1]
      : "";
  } catch {
    return "";
  }
}

function pruneSharedDurationInsightCaches(now: number) {
  for (const [key, entry] of sharedDurationInsightCaches) {
    if (
      Number.isFinite(now) &&
      Number.isFinite(entry.lastUsedAt) &&
      now >= entry.lastUsedAt &&
      now - entry.lastUsedAt > SHARED_CACHE_IDLE_TTL_MS
    ) {
      sharedDurationInsightCaches.delete(key);
    }
  }
  while (sharedDurationInsightCaches.size > MAX_SHARED_CACHE_SCOPES) {
    const oldestKey = sharedDurationInsightCaches.keys().next().value;
    if (typeof oldestKey !== "string") break;
    sharedDurationInsightCaches.delete(oldestKey);
  }
}

function pruneDurationInsightDayCache(
  cache: OccupancyDurationInsightQueryCache,
  protectedKeys: ReadonlySet<string>,
) {
  if (cache.size <= MAX_DAYS_PER_SHARED_CACHE) return;
  for (const key of cache.keys()) {
    if (cache.size <= MAX_DAYS_PER_SHARED_CACHE) break;
    if (!protectedKeys.has(key)) cache.delete(key);
  }
}

function requireIdentity(value: string, context: string) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`Selecione uma ${context} válida para consultar a duração.`);
  }
}

function requireMonth(month: OccupancyDurationInsightMonth, timeZone: string) {
  const dates = [month.from, month.to, month.monthEnd];
  if (dates.some((date) => !(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getTime() % MINUTE_MS !== 0) ||
    month.from > month.to || month.to > month.monthEnd || month.monthEnd <= month.from ||
    month.monthEnd.getTime() - month.from.getTime() > MAX_MONTH_MS ||
    requireCompanyTimeZone(month.timeZone) !== timeZone ||
    !month.dateKeys.length || month.dateKeys.length > 32 ||
    month.dateKeys[0] !== companyDateKey(month.from, timeZone) ||
    month.dateKeys.some((key, index) => !/^\d{4}-\d{2}-\d{2}$/.test(key) || (index > 0 && key <= month.dateKeys[index - 1]))) {
    throw new RangeError("O período de duração não corresponde ao calendário da empresa.");
  }
}
