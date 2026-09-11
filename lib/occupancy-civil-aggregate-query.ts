import { apiFetch } from "@/lib/api";
import {
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";
import {
  aggregateOccupancyRowsByBucket,
  OccupancyCivilBucketAlignmentError,
  requireOccupancyAggregateRows,
  type OccupancyAggregateMetric,
} from "@/lib/occupancy-aggregate-validation";
import type {
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioBucketRow,
} from "@/lib/types";

type CivilGranularity = "day" | "week" | "month";
type Unit = { from: number; to: number; granularity: "hour" | "minute" };
type CivilBucket = { label: string; from: number; to: number; units: Unit[] };
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_RANGE_DAYS = 4 * 366;
const MAX_HOURS_PER_REQUEST = 31 * 24;
const MAX_MINUTES_PER_REQUEST = 480;

export type OccupancyCivilAggregateQueryOptions = {
  scenarioId: string;
  granularity: CivilGranularity;
  /** Floating calendar markers: local Y/M/D identify the selected civil dates. */
  from: Date;
  to: Date;
  timeZone: string;
  companyScopeId?: string | null;
  signal?: AbortSignal;
  requestedAt?: Date;
  openBucket?: Date;
  fetchResponse?: (path: string) => Promise<OccupancyScenarioAggregateResponse>;
  /** Owned by the caller/batch; never shared globally between tenants. */
  capabilities?: Map<string, boolean>;
};

/**
 * Prefer a civil aggregate when the API actually returns civil boundaries.
 * UTC calendar aggregates cannot be renamed as company days. Fall back to
 * complete UTC hours and minute edges, then compose scenario metrics in time
 * (never across independent areas). A missing unit makes its civil bucket
 * unavailable. No final value or source certification is synthesized.
 */
export async function fetchOccupancyCivilAggregate(
  options: OccupancyCivilAggregateQueryOptions,
): Promise<OccupancyScenarioAggregateResponse> {
  const { scenarioId, granularity, signal } = options;
  signal?.throwIfAborted();
  if (!scenarioId || scenarioId !== scenarioId.trim()) {
    throw new Error("O cenário da consulta civil de ocupação é inválido.");
  }
  const timeZone = requireCompanyTimeZone(options.timeZone);
  const buckets = planCivilBuckets(options, timeZone);
  const from = buckets[0].from;
  const to = buckets.at(-1)!.to;
  const fetchResponse = options.fetchResponse ?? ((path: string) =>
    apiFetch<OccupancyScenarioAggregateResponse>(path, {
      companyScopeId: options.companyScopeId ?? undefined,
      signal,
    }));
  const capabilityKey = JSON.stringify([
    options.companyScopeId ?? "", scenarioId, timeZone, granularity,
  ]);
  const validation = {
    allowDocumentedAggregateResponse: true,
    expectedTimezone: timeZone,
    openBucket: options.openBucket,
    requestedAt: options.requestedAt,
    requireCertification: true,
  };

  if (options.capabilities?.get(capabilityKey) !== false) {
    const response = await fetchResponse(aggregatePath(scenarioId, granularity, from, to));
    signal?.throwIfAborted();
    try {
      const data = requireOccupancyAggregateRows(response, granularity, scenarioId, timeZone, validation);
      const expectedLabels = new Set(buckets.map((bucket) => bucket.label));
      if (data.some((row) => !expectedLabels.has(row.bucket.slice(0, 10)))) {
        throw new Error("A API retornou um bucket civil de ocupação fora do período solicitado.");
      }
      options.capabilities?.set(capabilityKey, true);
      return { ...response, data };
    } catch (error) {
      if (!(error instanceof OccupancyCivilBucketAlignmentError)) throw error;
    }
  }

  const requestedAt = options.requestedAt?.getTime();
  const cutoff = requestedAt === undefined ? to : Math.min(to, Math.floor(requestedAt / MINUTE_MS) * MINUTE_MS);
  const units: Unit[] = [];
  buckets.forEach((bucket) => {
    bucket.units = planUnits(bucket.from, Math.min(bucket.to, cutoff));
    units.push(...bucket.units);
  });
  const metrics = new Map<number, OccupancyAggregateMetric>();
  const requests = groupUnits(units);
  // A shared scheduler may coalesce paths across widgets; this local bound
  // also prevents unbounded fan-out when no scheduler is provided.
  let cursor = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(4, requests.length) }, async () => {
    while (!failed && cursor < requests.length) {
      const group = requests[cursor++];
      try {
        signal?.throwIfAborted();
        const response = await fetchResponse(aggregatePath(
          scenarioId, group[0].granularity, group[0].from, group.at(-1)!.to,
        ));
        signal?.throwIfAborted();
        const rows = requireOccupancyAggregateRows(
          response, group[0].granularity, scenarioId, timeZone,
          { allowDocumentedAggregateResponse: true, requireCertification: true },
        );
        const values = aggregateOccupancyRowsByBucket(rows, group[0].granularity, {
          allowDocumentedAggregateResponse: true, expectedTimezone: timeZone,
        });
        const expected = new Set(group.map((unit) => unit.from));
        values.forEach((metric, key) => {
          if (!expected.has(key)) throw new Error("A API retornou ocupação fora das horas solicitadas.");
          metrics.set(key, metric);
        });
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  signal?.throwIfAborted();
  const data = buckets.flatMap((bucket): OccupancyScenarioBucketRow[] => {
    if (!bucket.units.length || bucket.units.some((unit) => !metrics.has(unit.from))) return [];
    let weightedAverage = 0;
    let seconds = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let peak = 0;
    bucket.units.forEach((unit) => {
      const metric = metrics.get(unit.from)!;
      const duration = (unit.to - unit.from) / 1_000;
      weightedAverage += metric.average * duration;
      seconds += duration;
      minimum = Math.min(minimum, metric.minimum);
      peak = Math.max(peak, metric.peak);
    });
    const rawAverage = weightedAverage / seconds;
    if (!Number.isFinite(rawAverage)) throw new Error("O agregado civil de ocupação excedeu o limite numérico.");
    // Floating-point accumulation can overshoot an otherwise constant bound.
    const average = Math.min(peak, Math.max(minimum, rawAverage));
    return [{ bucket: bucket.label, scenario_total_avg: average,
      scenario_total_min: minimum, scenario_total_max: peak }];
  });
  options.capabilities?.set(capabilityKey, false);
  return { data, granularity, scenario_id: scenarioId };
}

function aggregatePath(scenarioId: string, granularity: string, from: number, to: number) {
  const params = new URLSearchParams({
    from: new Date(from).toISOString(), granularity, to: new Date(to).toISOString(),
  });
  return `/occupancy/scenarios/${encodeURIComponent(scenarioId)}/aggregate?${params}`;
}

function planCivilBuckets(options: OccupancyCivilAggregateQueryOptions, timeZone: string) {
  const { from, to, granularity } = options;
  if (!(["day", "week", "month"] as string[]).includes(granularity) ||
      !validDate(from) || !validDate(to) ||
      (options.requestedAt !== undefined && !validDate(options.requestedAt))) {
    throw new RangeError("O intervalo civil de ocupação é inválido.");
  }
  const start = civilMarker(from);
  const end = civilMarker(to);
  const days = (end.getTime() - start.getTime()) / (24 * HOUR_MS);
  if (days <= 0 || days > MAX_RANGE_DAYS) {
    throw new RangeError("A consulta civil de ocupação aceita no máximo quatro anos.");
  }
  if ((granularity === "week" && (start.getUTCDay() !== 1 || end.getUTCDay() !== 1)) ||
      (granularity === "month" && (start.getUTCDate() !== 1 || end.getUTCDate() !== 1))) {
    throw new RangeError("O intervalo civil não está alinhado à granularidade de ocupação.");
  }
  const buckets: CivilBucket[] = [];
  for (let marker = start; marker < end;) {
    const next = new Date(marker);
    if (granularity === "month") next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCDate(next.getUTCDate() + (granularity === "week" ? 7 : 1));
    if (next > end) throw new RangeError("O último bucket civil de ocupação está incompleto.");
    buckets.push({ label: marker.toISOString().slice(0, 10),
      from: civilInstant(marker, timeZone), to: civilInstant(next, timeZone), units: [] });
    marker = next;
  }
  return buckets;
}

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function civilMarker(value: Date) {
  const marker = new Date(0);
  marker.setUTCFullYear(value.getFullYear(), value.getMonth(), value.getDate());
  marker.setUTCHours(0, 0, 0, 0);
  return marker;
}

function civilInstant(marker: Date, timeZone: string) {
  return startOfCompanyTimeZoneCivilDay({
    year: marker.getUTCFullYear(), month: marker.getUTCMonth() + 1, day: marker.getUTCDate(),
  }, timeZone).getTime();
}

function planUnits(from: number, to: number): Unit[] {
  const units: Unit[] = [];
  for (let cursor = from; cursor < to;) {
    const wholeHour = cursor % HOUR_MS === 0 && cursor + HOUR_MS <= to;
    const end = cursor + (wholeHour ? HOUR_MS : MINUTE_MS);
    units.push({ from: cursor, to: end, granularity: wholeHour ? "hour" : "minute" });
    cursor = end;
  }
  return units;
}

function groupUnits(units: Unit[]) {
  const groups: Unit[][] = [];
  units.forEach((unit) => {
    const previous = groups.at(-1);
    const limit = unit.granularity === "hour" ? MAX_HOURS_PER_REQUEST : MAX_MINUTES_PER_REQUEST;
    if (previous && previous.length < limit && previous.at(-1)!.to === unit.from &&
        previous[0].granularity === unit.granularity) previous.push(unit);
    else groups.push([unit]);
  });
  return groups;
}
