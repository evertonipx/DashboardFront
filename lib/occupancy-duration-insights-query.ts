import { apiFetch } from "@/lib/api";
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
import type { OccupancyScenarioAggregateResponse } from "@/lib/types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_MONTH_MS = 32 * 25 * HOUR_MS;
const MAX_RESPONSE_ROWS = 1_000;
const MAX_MINUTE_BATCH = 480;
const OVERLAP_MS = 5 * MINUTE_MS;
const RECONCILE_MS = 15 * MINUTE_MS;
export const OCCUPANCY_DURATION_CLOSED_CACHE_TTL_MS = HOUR_MS;

type CachedSpan = {
  asOf?: number;
  cachedAt?: number;
  final: boolean;
  hours: OccupancyDurationInsightHour[];
  minuteMetrics?: Map<number, OccupancyAggregateMetric>;
  reconciledAt?: number;
  refreshedAt: number;
  to: number;
};

export type OccupancyDurationInsightDayCache = {
  from: number;
  spans: Map<number, CachedSpan>;
  to: number;
};

/** Owned by the mounted dashboard; never shared across authenticated users. */
export type OccupancyDurationInsightQueryCache = Map<
  string,
  OccupancyDurationInsightDayCache
>;

type QueryContext = {
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
 * Closed spans retain only small civil-hour summaries. The open span retains
 * at most one hour of minutes, with five-minute overlap and a full refresh of
 * that hour every fifteen minutes. Changing company or timezone cannot reuse
 * another scope's cache. Closed summaries expire after one wall-clock hour,
 * including fully covered hours, so later corrections are observed. All cache
 * writes are committed only after success.
 */
export async function fetchOccupancyDurationInsightScenario({
  cache,
  companyScopeId,
  month,
  name,
  scenarioId,
  signal,
  timeZone,
}: QueryContext & {
  cache: OccupancyDurationInsightQueryCache;
  month: OccupancyDurationInsightMonth;
  name: string;
}): Promise<OccupancyDurationInsightScenario> {
  signal.throwIfAborted();
  requireIdentity(companyScopeId, "empresa");
  requireIdentity(scenarioId, "cenário");
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  requireMonth(month, canonicalTimeZone);
  const context = { companyScopeId, scenarioId, signal, timeZone: canonicalTimeZone };
  const cacheTime = Date.now();
  const pending = new Map<string, OccupancyDurationInsightDayCache>();
  const spans = planSpans(context, month, cache, pending, cacheTime);
  const unresolved = spans.filter((span) => !span.cached?.final);
  const fullHours = unresolved.filter(
    (span) => span.final && span.from % HOUR_MS === 0 && span.to - span.from === HOUR_MS,
  );
  const refinements: MinuteRefinement[] = [];

  // Gaps in an already-populated cache become separate ranges. A cold cache
  // produces one month-wide hourly request, not one request for each day.
  for (const group of contiguousGroups(fullHours)) {
    const result = await fetchAggregate(context, group.map((span) => span.from), group.at(-1)!.to, "hour");
    group.forEach((span) => {
      const metric = result.metrics.get(span.from);
      if (metric && metric.minimum === 0 && metric.peak > 0) {
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
        refreshedAt: month.to.getTime(),
        to: span.to,
      });
    });
  }

  const fullHourSet = new Set(fullHours);
  unresolved.filter((span) => !fullHourSet.has(span)).forEach((span) => {
    const cached = span.cached;
    if (cached && cached.to === span.to) return;
    const reconcile = !cached?.minuteMetrics || cached.to > span.to ||
      span.to - (cached.reconciledAt ?? 0) >= RECONCILE_MS;
    refinements.push({
      from: reconcile ? span.from : Math.max(span.from, cached.to - OVERLAP_MS),
      span,
      to: span.to,
    });
  });

  refinements.sort((left, right) => left.from - right.from);
  for (const group of contiguousGroups(refinements)) {
    const from = group[0].from;
    const to = group.at(-1)!.to;
    const metrics = new Map<number, OccupancyAggregateMetric>();
    const sourceCutoffs: Array<number | undefined> = [];
    for (let cursor = from; cursor < to; cursor += MAX_MINUTE_BATCH * MINUTE_MS) {
      const end = Math.min(to, cursor + MAX_MINUTE_BATCH * MINUTE_MS);
      const result = await fetchAggregate(context, bucketStarts(cursor, end, MINUTE_MS), end, "minute");
      result.metrics.forEach((metric, bucket) => metrics.set(bucket, metric));
      sourceCutoffs.push(result.asOf);
    }
    const sourceAsOf = oldestCutoff(sourceCutoffs);
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
  pending.forEach((day, key) => cache.set(key, day));
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
  const response = await apiFetch<OccupancyScenarioAggregateResponse>(
    `/occupancy/scenarios/${encodeURIComponent(context.scenarioId)}/aggregate?${params.toString()}`,
    { companyScopeId: context.companyScopeId, signal: context.signal },
  );
  context.signal.throwIfAborted();

  // A backend row cap applies to areas as well as hours. Re-query smaller
  // time ranges before accepting coverage, even if 1,000 rows look valid.
  if (Array.isArray(response?.data) && response.data.length >= MAX_RESPONSE_ROWS) {
    requireEnvelope(response, context, granularity);
    if (buckets.length < 2) {
      throw new Error("O volume de dados deste intervalo impede calcular a duração com segurança.");
    }
    const middle = Math.floor(buckets.length / 2);
    const left = await fetchAggregate(context, buckets.slice(0, middle), buckets[middle], granularity);
    const right = await fetchAggregate(context, buckets.slice(middle), to, granularity);
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
      spans.push({
        cacheKey,
        cached: cached && cached.to <= to && !retryRecentGap && !expiredClosed ? cached : undefined,
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

function oldestCutoff(values: Array<number | undefined>) {
  if (!values.length || values.some((value) => value === undefined || !Number.isFinite(value))) return undefined;
  return Math.min(...values as number[]);
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
