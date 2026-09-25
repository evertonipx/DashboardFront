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
// A four-year monthly view stays below the page-wide 32-request budget while
// each response remains bounded. Smaller/visible windows are normally served
// by one request and all equivalent paths are still coalesced by the shared
// occupancy transport.
const MAX_HOURS_PER_REQUEST = 62 * 24;
const MAX_MINUTES_PER_REQUEST = 480;

type CivilCapabilityProbeResult =
  | { supported: false }
  | { supported: true; response: OccupancyScenarioAggregateResponse };

const civilCapabilityProbes = new WeakMap<
  Map<string, boolean>,
  Map<string, Promise<CivilCapabilityProbeResult>>
>();

class OccupancyCivilAggregateCapabilityError extends Error {
  constructor() {
    super(
      "A API não certificou o fuso e a completude do agregado civil de ocupação.",
    );
    this.name = "OccupancyCivilAggregateCapabilityError";
  }
}

export class OccupancyCivilFallbackRequestLimitError extends Error {
  readonly maximumRequests: number;
  readonly plannedRequests: number;

  constructor(plannedRequests: number, maximumRequests: number) {
    super("O histórico desta visão ao vivo não está disponível para este período.");
    this.name = "OccupancyCivilFallbackRequestLimitError";
    this.maximumRequests = maximumRequests;
    this.plannedRequests = plannedRequests;
  }
}

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
  /** Deterministic receipt time, primarily for verification fixtures. */
  receivedAt?: Date;
  /** Use the actual HTTP receipt as the upper bound of an open live bucket. */
  useResponseReceiptTime?: boolean;
  fetchResponse?: (path: string) => Promise<OccupancyScenarioAggregateResponse>;
  /** Owned by the caller/batch; never shared globally between tenants. */
  capabilities?: Map<string, boolean>;
  /**
   * Optional caller-owned cache for the hour/minute units used by the civil
   * fallback. Live dashboards keep this cache scoped to the authenticated
   * company/scenario and clear it whenever that scope changes.
   */
  unitCache?: OccupancyCivilAggregateUnitCache;
  /** A cold audit may explicitly re-read every unit before replacing cache. */
  bypassUnitCache?: boolean;
  /** Maximum hour/minute transport requests allowed after a coarse miss. */
  maximumFallbackRequests?: number;
};

type OccupancyCivilAggregateUnitCacheEntry = {
  /** Null records an unavailable closed unit only until the next cutoff. */
  metric: OccupancyAggregateMetric | null;
  checkedThrough: number;
};

export type OccupancyCivilAggregateUnitCache = Map<
  string,
  OccupancyCivilAggregateUnitCacheEntry
>;

/**
 * Prefer a civil aggregate when the API actually returns civil boundaries.
 * UTC calendar aggregates cannot be renamed as company days. Fall back to
 * complete UTC hours and minute edges, then compose scenario metrics in time
 * (never across independent areas). Missing units make a closed civil bucket
 * unavailable. The open bucket may show its observed units as a partial
 * preview. No final value or source certification is synthesized.
 */
export async function fetchOccupancyCivilAggregate(
  options: OccupancyCivilAggregateQueryOptions,
): Promise<OccupancyScenarioAggregateResponse> {
  const { scenarioId, granularity, signal } = options;
  signal?.throwIfAborted();
  if (!scenarioId || scenarioId !== scenarioId.trim()) {
    throw new Error("O cenário da consulta civil de ocupação é inválido.");
  }
  const maximumFallbackRequests = options.maximumFallbackRequests;
  if (
    maximumFallbackRequests !== undefined &&
    (!Number.isSafeInteger(maximumFallbackRequests) ||
      maximumFallbackRequests < 0)
  ) {
    throw new RangeError("O limite do fallback civil de ocupação é inválido.");
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
    options.companyScopeId ?? "", timeZone, granularity,
  ]);
  const validation = {
    allowDocumentedAggregateResponse: true,
    expectedTimezone: timeZone,
    openBucket: options.openBucket,
    requestedAt: options.requestedAt,
    requireCertification: true,
  };

  const fetchCivilResponse = async () => {
    const response = await fetchResponse(
      aggregatePath(scenarioId, granularity, from, to),
    );
    signal?.throwIfAborted();
    const receivedAt = options.receivedAt ??
      (options.useResponseReceiptTime ? new Date() : undefined);
    // Validate identity, metrics and IANA alignment before deciding that a
    // schema is merely missing capability metadata. Tenant/schema failures
    // must never be disguised as a reason to issue a second request.
    requireOccupancyAggregateRows(
      response,
      granularity,
      scenarioId,
      timeZone,
      {
        allowDocumentedAggregateResponse: true,
        expectedTimezone: timeZone,
        openBucket: options.openBucket,
        requestedAt: options.requestedAt,
        receivedAt,
      },
    );
    if (!hasCertifiedCivilEnvelope(response)) {
      throw new OccupancyCivilAggregateCapabilityError();
    }
    const data = requireOccupancyAggregateRows(
      response,
      granularity,
      scenarioId,
      timeZone,
      { ...validation, receivedAt },
    );
    const expectedLabels = new Set(buckets.map((bucket) => bucket.label));
    if (data.some((row) => !expectedLabels.has(row.bucket.slice(0, 10)))) {
      throw new Error(
        "A API retornou um bucket civil de ocupação fora do período solicitado.",
      );
    }
    return { ...response, data };
  };

  const capabilities = options.capabilities;
  const knownCapability = capabilities?.get(capabilityKey);
  if (knownCapability !== false) {
    if (capabilities && knownCapability === undefined) {
      let probes = civilCapabilityProbes.get(capabilities);
      if (!probes) {
        probes = new Map();
        civilCapabilityProbes.set(capabilities, probes);
      }
      let probe = probes.get(capabilityKey);
      const ownsProbe = !probe;
      if (!probe) {
        probe = fetchCivilResponse()
          .then((response): CivilCapabilityProbeResult => {
            capabilities.set(capabilityKey, true);
            return { supported: true, response };
          })
          .catch((error): CivilCapabilityProbeResult => {
            if (!isUnsupportedCivilAggregate(error)) {
              throw error;
            }
            capabilities.set(capabilityKey, false);
            return { supported: false };
          });
        probes.set(capabilityKey, probe);
      }
      try {
        const result = await probe;
        signal?.throwIfAborted();
        if (result.supported) {
          if (ownsProbe) return result.response;
          try {
            return await fetchCivilResponse();
          } catch (error) {
            if (!isUnsupportedCivilAggregate(error)) {
              throw error;
            }
            capabilities.set(capabilityKey, false);
          }
        }
      } finally {
        if (ownsProbe && probes.get(capabilityKey) === probe) {
          probes.delete(capabilityKey);
        }
      }
    } else {
      try {
        const response = await fetchCivilResponse();
        capabilities?.set(capabilityKey, true);
        return response;
      } catch (error) {
        if (!isUnsupportedCivilAggregate(error)) throw error;
        // Alignment is an API capability for the tenant/timezone. Persist the
        // discovery before attempting a fallback so concurrent scenarios do
        // not repeat the same incompatible coarse request.
        capabilities?.set(capabilityKey, false);
      }
    }
  }

  const requestedAt = options.requestedAt?.getTime();
  // The fallback deliberately stops at the last closed minute. A five-second
  // dashboard pulse can therefore reuse every unit until the next minute
  // boundary instead of repeatedly asking for an identical closed bucket.
  const cutoff = requestedAt === undefined ? to : Math.min(to, Math.floor(requestedAt / MINUTE_MS) * MINUTE_MS);
  const units: Unit[] = [];
  buckets.forEach((bucket) => {
    bucket.units = planUnits(bucket.from, Math.min(bucket.to, cutoff));
    units.push(...bucket.units);
  });
  const metrics = new Map<number, OccupancyAggregateMetric>();
  const unitsToFetch = units.filter((unit) => {
    const cached = options.unitCache?.get(unitCacheKey(options, timeZone, unit));
    if (
      !options.bypassUnitCache &&
      cached &&
      (cached.metric !== null || cached.checkedThrough >= cutoff)
    ) {
      if (cached.metric !== null) metrics.set(unit.from, cached.metric);
      return false;
    }
    return true;
  });
  const requests = groupUnits(unitsToFetch);
  if (
    maximumFallbackRequests !== undefined &&
    requests.length > maximumFallbackRequests
  ) {
    throw new OccupancyCivilFallbackRequestLimitError(
      requests.length,
      maximumFallbackRequests,
    );
  }
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
        const expected = new Map(group.map((unit) => [unit.from, unit]));
        expected.forEach((unit) => {
          options.unitCache?.set(unitCacheKey(options, timeZone, unit), {
            checkedThrough: cutoff,
            metric: null,
          });
        });
        values.forEach((metric, key) => {
          const unit = expected.get(key);
          if (!unit) throw new Error("A API retornou ocupação fora das horas solicitadas.");
          metrics.set(key, metric);
          options.unitCache?.set(
            unitCacheKey(options, timeZone, unit),
            { checkedThrough: Number.POSITIVE_INFINITY, metric: { ...metric } },
          );
        });
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  signal?.throwIfAborted();
  const openBucketLabel = options.openBucket
    ? civilMarker(options.openBucket).toISOString().slice(0, 10)
    : null;
  const data = buckets.flatMap((bucket): OccupancyScenarioBucketRow[] => {
    const observedUnits = bucket.units.filter((unit) => metrics.has(unit.from));
    const openBucket = bucket.label === openBucketLabel && bucket.to > cutoff;
    // A civil period still in progress can show its observed units without
    // treating missing hours or minutes as zero. Closed periods retain the
    // strict coverage requirement before they become historical data.
    if (
      !observedUnits.length ||
      (!openBucket && observedUnits.length !== bucket.units.length)
    ) return [];
    let weightedAverage = 0;
    let seconds = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let peak = 0;
    observedUnits.forEach((unit) => {
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
    const complete = !openBucket && bucket.to <= cutoff;
    return [{
      bucket: bucket.label,
      complete,
      scenario_total_avg: average,
      scenario_total_min: minimum,
      scenario_total_max: peak,
      status: complete ? "complete" : "partial",
    }];
  });
  options.capabilities?.set(capabilityKey, false);
  const complete = cutoff >= to;
  return {
    as_of: new Date(cutoff).toISOString(),
    complete,
    data,
    granularity,
    scenario_id: scenarioId,
    status: complete ? "complete" : "partial",
    timezone: timeZone,
  };
}

function hasCertifiedCivilEnvelope(
  response: OccupancyScenarioAggregateResponse,
) {
  if (
    response.timezone === undefined ||
    response.complete === undefined ||
    response.status === undefined ||
    response.as_of === undefined
  ) {
    return false;
  }
  return !Array.isArray(response.data) || response.data.every(
    (row) =>
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      (
        row.complete !== undefined &&
        row.status !== undefined &&
        ((row.complete === false && row.status === "partial") ||
          ((row.area_avg === undefined || row.area_final !== undefined) &&
            (row.scenario_total_avg === undefined ||
              row.scenario_total_final !== undefined)))
      ),
  );
}

function isUnsupportedCivilAggregate(error: unknown) {
  return error instanceof OccupancyCivilBucketAlignmentError ||
    error instanceof OccupancyCivilAggregateCapabilityError;
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

function unitCacheKey(
  options: OccupancyCivilAggregateQueryOptions,
  timeZone: string,
  unit: Unit,
) {
  return JSON.stringify([
    options.companyScopeId ?? "",
    options.scenarioId,
    timeZone,
    unit.granularity,
    unit.from,
    unit.to,
  ]);
}
