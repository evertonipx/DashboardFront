import {
  companyTimeZoneOffsetLabel,
  companyZonedDateParts,
  endOfCompanyTimeZoneHour,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
  startOfCompanyTimeZoneHour,
} from "@/lib/company-time-zone";
import {
  formatOccupancyLoiteringDuration,
  occupancyLoiteringKey,
  requireOccupancyLoiteringSessionRows,
  type OccupancyLoiteringSessionRow,
  type OccupancyLoiteringSummaryModel,
} from "@/lib/occupancy-loitering";

const MINUTE_MS = 60_000;
const DEFAULT_MAX_BUCKETS = 240;
const MAX_BUCKETS = 10_000;
const DEFAULT_HISTOGRAM_EDGES_SECONDS = [
  0,
  5,
  15,
  30,
  60,
  120,
  300,
  600,
  1_800,
  3_600,
] as const;

export type OccupancyLoiteringTemporalGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type OccupancyLoiteringTemporalStats = {
  count: number;
  sumDurationSeconds: number;
  avgDurationSeconds: number | null;
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  medianDurationSeconds: number | null;
  p90DurationSeconds: number | null;
};

export type OccupancyLoiteringTemporalBucket =
  OccupancyLoiteringTemporalStats & {
    from: string;
    hasSessions: boolean;
    index: number;
    key: string;
    label: string;
    /** The supplied session response covers this complete (possibly partial) bucket. */
    observed: true;
    to: string;
  };

export type OccupancyLoiteringTemporalAreaBucket =
  OccupancyLoiteringTemporalStats & {
    bucketIndex: number;
    bucketKey: string;
    hasSessions: boolean;
    observed: true;
  };

export type OccupancyLoiteringDurationHistogramBin = {
  count: number;
  fromSeconds: number;
  index: number;
  label: string;
  percentage: number;
  sumDurationSeconds: number;
  /** Exclusive upper limit; `null` denotes an open-ended final bin. */
  toSeconds: number | null;
};

export type OccupancyLoiteringTemporalArea = {
  buckets: OccupancyLoiteringTemporalAreaBucket[];
  histogram: OccupancyLoiteringDurationHistogramBin[];
  key: string;
  label: string;
  scenarioIds: string[];
  scenarioLabels: string[];
  stats: OccupancyLoiteringTemporalStats;
};

export type OccupancyLoiteringTemporalMatrixCell =
  OccupancyLoiteringTemporalStats & {
    areaIndex: number;
    areaKey: string;
    bucketIndex: number;
    bucketKey: string;
    hasSessions: boolean;
    observed: true;
  };

export type OccupancyLoiteringTemporalModel = {
  areas: OccupancyLoiteringTemporalArea[];
  buckets: OccupancyLoiteringTemporalBucket[];
  from: string;
  granularity: OccupancyLoiteringTemporalGranularity;
  histogram: OccupancyLoiteringDurationHistogramBin[];
  matrix: OccupancyLoiteringTemporalMatrixCell[];
  requestedGranularity: "auto" | OccupancyLoiteringTemporalGranularity;
  /** Number of civil units represented by a bucket. Usually 1; long ranges may group months. */
  stride: number;
  timeZone: string;
  to: string;
  totals: OccupancyLoiteringTemporalStats;
};

export type OccupancyLoiteringTemporalOptions = {
  context: OccupancyLoiteringSummaryModel;
  from: Date | string;
  granularity?: "auto" | OccupancyLoiteringTemporalGranularity;
  histogramEdgesSeconds?: readonly number[];
  maxBuckets?: number;
  sessions: readonly OccupancyLoiteringSessionRow[];
  /**
   * Internal fast path for rows already certified by the loitering API parser.
   * Public/domain callers must keep the default so malformed input still
   * fails closed before aggregation.
   */
  sessionsCertifiedByApi?: boolean;
  timeZone: string;
  to: Date | string;
};

export type OccupancyLoiteringTemporalAreaContext = {
  key: string;
  label: string;
  scenarioIds: string[];
  scenarioLabels: string[];
};

type InternalBoundary = {
  alignedFrom: number;
  from: number;
  label: string;
  to: number;
};

type MutableStats = {
  compensation: number;
  count: number;
  maximum: number | null;
  minimum: number | null;
  sum: number;
  /** Raw samples are retained only where percentile widgets consume them. */
  values: number[] | null;
};

const GRANULARITIES: readonly OccupancyLoiteringTemporalGranularity[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
];

/**
 * Produces completed-session analytics only. Durations are person-seconds and
 * must never be presented as unique people or as elapsed time with an area in
 * the occupied state. Rows are assigned by their exclusive exit instant.
 */
export function buildOccupancyLoiteringTemporalModel(
  options: OccupancyLoiteringTemporalOptions,
): OccupancyLoiteringTemporalModel {
  const timeZone = requireCompanyTimeZone(options.timeZone);
  const from = requireInstant(options.from, "início");
  const to = requireInstant(options.to, "fim");
  if (from >= to) {
    throw new RangeError(
      "O início da permanência temporal deve ser anterior ao fim.",
    );
  }

  const maximum = options.maxBuckets ?? DEFAULT_MAX_BUCKETS;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_BUCKETS) {
    throw new RangeError(
      `O limite temporal de permanência deve estar entre 1 e ${MAX_BUCKETS} pontos.`,
    );
  }
  const requestedGranularity = options.granularity ?? "auto";
  if (
    requestedGranularity !== "auto" &&
    !GRANULARITIES.includes(requestedGranularity)
  ) {
    throw new RangeError("A granularidade temporal de permanência é inválida.");
  }
  const histogramEdges = requireHistogramEdges(
    options.histogramEdgesSeconds ?? DEFAULT_HISTOGRAM_EDGES_SECONDS,
  );
  const rows = options.sessionsCertifiedByApi
    ? options.sessions
    : requireOccupancyLoiteringSessionRows({ data: Array.from(options.sessions) });
  const areaContexts = buildOccupancyLoiteringTemporalAreaContexts(
    options.context,
  );
  const areaIndexByKey = new Map(
    areaContexts.map((area, index) => [area.key, index]),
  );
  const boundaryPlan = resolveBoundaries({
    from,
    maximum,
    requestedGranularity,
    timeZone,
    to,
  });
  const { boundaries, granularity, stride } = boundaryPlan;

  const totalStats = createMutableStats(true);
  const areaStats = areaContexts.map(() => createMutableStats(true));
  // Timeline and heatmap cells consume count/sum/average/extrema only. Avoid
  // four extra copies and sorts of a potentially very large live session set.
  const bucketStats = boundaries.map(() => createMutableStats(false));
  const cellStats = new Map<number, MutableStats>();

  for (const row of rows) {
    const endedAt = Date.parse(row.ended_at);
    if (endedAt < from || endedAt >= to) continue;
    const areaIndex = areaIndexByKey.get(
      occupancyLoiteringKey(row.camera_id, row.area, row.object_class),
    );
    if (areaIndex === undefined) continue;
    const bucketIndex = findBoundaryIndex(boundaries, endedAt);
    if (bucketIndex < 0) {
      throw new RangeError(
        "Uma sessão concluída não pôde ser associada ao período solicitado.",
      );
    }
    const cellKey = areaIndex * boundaries.length + bucketIndex;
    const cell = cellStats.get(cellKey) ?? createMutableStats(false);
    addDuration(totalStats, row.duration_seconds);
    addDuration(areaStats[areaIndex], row.duration_seconds);
    addDuration(bucketStats[bucketIndex], row.duration_seconds);
    addDuration(cell, row.duration_seconds);
    cellStats.set(cellKey, cell);
  }

  const bucketModels = boundaries.map((boundary, index) => {
    const stats = finalizeStats(bucketStats[index]);
    return {
      ...stats,
      from: new Date(boundary.from).toISOString(),
      hasSessions: stats.count > 0,
      index,
      key: JSON.stringify([
        granularity,
        stride,
        new Date(boundary.alignedFrom).toISOString(),
      ]),
      label: boundary.label,
      observed: true as const,
      to: new Date(boundary.to).toISOString(),
    };
  });
  const areas = areaContexts.map((area, areaIndex) => {
    const stats = finalizeStats(areaStats[areaIndex]);
    return {
      ...area,
      buckets: bucketModels.map((bucket, bucketIndex) => {
        const cell = finalizeStats(
          cellStats.get(areaIndex * boundaries.length + bucketIndex) ??
            createMutableStats(false),
        );
        return {
          ...cell,
          bucketIndex,
          bucketKey: bucket.key,
          hasSessions: cell.count > 0,
          observed: true as const,
        };
      }),
      histogram: buildHistogram(
        areaStats[areaIndex].values ?? [],
        histogramEdges,
      ),
      stats,
    };
  });
  const matrix = areas.flatMap((area, areaIndex) =>
    area.buckets.map((cell) => ({
      ...cell,
      areaIndex,
      areaKey: area.key,
    })),
  );

  return {
    areas,
    buckets: bucketModels,
    from: new Date(from).toISOString(),
    granularity,
    histogram: buildHistogram(totalStats.values ?? [], histogramEdges),
    matrix,
    requestedGranularity,
    stride,
    timeZone,
    to: new Date(to).toISOString(),
    totals: finalizeStats(totalStats),
  };
}

/** Maps each physical area once while preserving every selected scenario association. */
export function buildOccupancyLoiteringTemporalAreaContexts(
  context: OccupancyLoiteringSummaryModel,
): OccupancyLoiteringTemporalAreaContext[] {
  if (!context || !Array.isArray(context.areas) || !Array.isArray(context.scenarios)) {
    throw new TypeError("O contexto temporal de permanência é inválido.");
  }
  const scenarios = new Map<
    string,
    { ids: Set<string>; labels: Set<string> }
  >();
  for (const scenario of context.scenarios) {
    for (const area of scenario.areas) {
      const entry = scenarios.get(area.key) ?? {
        ids: new Set<string>(),
        labels: new Set<string>(),
      };
      entry.ids.add(scenario.scenarioId);
      entry.labels.add(scenario.label);
      scenarios.set(area.key, entry);
    }
  }
  const seen = new Set<string>();
  return context.areas.map((area) => {
    if (seen.has(area.key)) {
      throw new RangeError(
        "O contexto temporal contém uma área física repetida.",
      );
    }
    seen.add(area.key);
    const membership = scenarios.get(area.key);
    return {
      key: area.key,
      label: area.label,
      scenarioIds: Array.from(membership?.ids ?? []),
      scenarioLabels: Array.from(membership?.labels ?? []),
    };
  });
}

type BoundaryOptions = {
  from: number;
  maximum: number;
  requestedGranularity: "auto" | OccupancyLoiteringTemporalGranularity;
  timeZone: string;
  to: number;
};

function resolveBoundaries(options: BoundaryOptions) {
  const firstCandidate = options.requestedGranularity === "auto"
    ? 0
    : GRANULARITIES.indexOf(options.requestedGranularity);
  for (let index = firstCandidate; index < GRANULARITIES.length; index += 1) {
    const granularity = GRANULARITIES[index];
    const stride = granularity === "month"
      ? resolveMonthStride(options.from, options.to, options.timeZone, options.maximum)
      : 1;
    const boundaries = buildBoundaries(
      options.from,
      options.to,
      options.timeZone,
      granularity,
      stride,
      options.maximum + 1,
    );
    if (boundaries.length <= options.maximum) {
      return { boundaries, granularity, stride };
    }
  }
  throw new RangeError(
    "O período de permanência excede o limite temporal configurado.",
  );
}

function buildBoundaries(
  from: number,
  to: number,
  timeZone: string,
  granularity: OccupancyLoiteringTemporalGranularity,
  stride: number,
  stopAfter: number,
) {
  const result: InternalBoundary[] = [];
  let alignedFrom = alignedBoundaryStart(from, timeZone, granularity);
  while (alignedFrom < to) {
    const next = nextBoundary(alignedFrom, timeZone, granularity, stride);
    if (!Number.isFinite(next) || next <= alignedFrom) {
      throw new RangeError(
        "Não foi possível avançar o calendário civil da permanência.",
      );
    }
    result.push({
      alignedFrom,
      from: Math.max(from, alignedFrom),
      label: boundaryLabel(
        alignedFrom,
        next,
        from,
        to,
        timeZone,
        granularity,
        stride,
      ),
      to: Math.min(to, next),
    });
    if (result.length >= stopAfter) break;
    alignedFrom = next;
  }
  disambiguateRepeatedLabels(result, timeZone, granularity);
  return result;
}

function alignedBoundaryStart(
  timestamp: number,
  timeZone: string,
  granularity: OccupancyLoiteringTemporalGranularity,
) {
  const date = new Date(timestamp);
  if (granularity === "minute") {
    const parts = companyZonedDateParts(date, timeZone);
    return timestamp - parts.second * 1_000 - date.getUTCMilliseconds();
  }
  if (granularity === "hour") {
    return startOfCompanyTimeZoneHour(date, timeZone).getTime();
  }
  const parts = companyZonedDateParts(date, timeZone);
  if (granularity === "day") {
    return civilStart(parts.year, parts.month, parts.day, timeZone);
  }
  if (granularity === "week") {
    const ordinal = Date.UTC(parts.year, parts.month - 1, parts.day);
    const mondayDelta = (new Date(ordinal).getUTCDay() + 6) % 7;
    const monday = new Date(ordinal - mondayDelta * 24 * 60 * MINUTE_MS);
    return civilStart(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
      timeZone,
    );
  }
  return civilStart(parts.year, parts.month, 1, timeZone);
}

function nextBoundary(
  timestamp: number,
  timeZone: string,
  granularity: OccupancyLoiteringTemporalGranularity,
  stride: number,
) {
  if (granularity === "minute") return timestamp + stride * MINUTE_MS;
  if (granularity === "hour") {
    let cursor = timestamp;
    for (let index = 0; index < stride; index += 1) {
      cursor = endOfCompanyTimeZoneHour(new Date(cursor), timeZone).getTime();
    }
    return cursor;
  }
  const parts = companyZonedDateParts(new Date(timestamp), timeZone);
  if (granularity === "month") {
    const ordinal = new Date(Date.UTC(parts.year, parts.month - 1 + stride, 1));
    return civilStart(
      ordinal.getUTCFullYear(),
      ordinal.getUTCMonth() + 1,
      1,
      timeZone,
    );
  }
  return civilStartAfterDays(
    parts.year,
    parts.month,
    parts.day,
    granularity === "week" ? 7 * stride : stride,
    timeZone,
  );
}

function civilStartAfterDays(
  year: number,
  month: number,
  day: number,
  amount: number,
  timeZone: string,
) {
  const target = new Date(Date.UTC(year, month - 1, day + amount));
  for (let skipped = 0; skipped < 8; skipped += 1) {
    const candidate = new Date(
      Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        target.getUTCDate() + skipped,
      ),
    );
    try {
      return civilStart(
        candidate.getUTCFullYear(),
        candidate.getUTCMonth() + 1,
        candidate.getUTCDate(),
        timeZone,
      );
    } catch {
      // A civil date skipped by an IANA dateline transition has no bucket.
    }
  }
  throw new RangeError("Não foi possível localizar o próximo dia civil.");
}

function civilStart(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  return startOfCompanyTimeZoneCivilDay({ day, month, year }, timeZone).getTime();
}

function resolveMonthStride(
  from: number,
  to: number,
  timeZone: string,
  maximum: number,
) {
  const first = companyZonedDateParts(new Date(from), timeZone);
  const last = companyZonedDateParts(new Date(to - 1), timeZone);
  const months =
    (last.year - first.year) * 12 + last.month - first.month + 1;
  return Math.max(1, Math.ceil(months / maximum));
}

function boundaryLabel(
  alignedFrom: number,
  next: number,
  rangeFrom: number,
  rangeTo: number,
  timeZone: string,
  granularity: OccupancyLoiteringTemporalGranularity,
  stride: number,
) {
  const parts = companyZonedDateParts(new Date(alignedFrom), timeZone);
  const firstDate = companyZonedDateParts(new Date(rangeFrom), timeZone);
  const lastDate = companyZonedDateParts(new Date(rangeTo - 1), timeZone);
  const multipleDays =
    firstDate.year !== lastDate.year ||
    firstDate.month !== lastDate.month ||
    firstDate.day !== lastDate.day;
  const day = `${pad(parts.day)}/${pad(parts.month)}`;
  if (granularity === "minute") {
    return `${multipleDays ? `${day} ` : ""}${pad(parts.hour)}:${pad(parts.minute)}`;
  }
  if (granularity === "hour") {
    return `${multipleDays ? `${day} ` : ""}${pad(parts.hour)}h`;
  }
  if (granularity === "day") return `${day}/${parts.year}`;
  if (granularity === "week") return `Sem. ${day}`;
  const start = `${pad(parts.month)}/${parts.year}`;
  if (stride === 1) return start;
  const end = companyZonedDateParts(new Date(next - 1), timeZone);
  return `${start}–${pad(end.month)}/${end.year}`;
}

function disambiguateRepeatedLabels(
  boundaries: InternalBoundary[],
  timeZone: string,
  granularity: OccupancyLoiteringTemporalGranularity,
) {
  if (granularity !== "minute" && granularity !== "hour") return;
  const counts = new Map<string, number>();
  boundaries.forEach((boundary) =>
    counts.set(boundary.label, (counts.get(boundary.label) ?? 0) + 1),
  );
  boundaries.forEach((boundary) => {
    if ((counts.get(boundary.label) ?? 0) > 1) {
      boundary.label = `${boundary.label} ${companyTimeZoneOffsetLabel(
        new Date(boundary.alignedFrom),
        timeZone,
      )}`;
    }
  });
}

function findBoundaryIndex(boundaries: readonly InternalBoundary[], timestamp: number) {
  let low = 0;
  let high = boundaries.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const boundary = boundaries[middle];
    if (timestamp < boundary.from) high = middle - 1;
    else if (timestamp >= boundary.to) low = middle + 1;
    else return middle;
  }
  return -1;
}

function createMutableStats(trackPercentiles = true): MutableStats {
  return {
    compensation: 0,
    count: 0,
    maximum: null,
    minimum: null,
    sum: 0,
    values: trackPercentiles ? [] : null,
  };
}

function addDuration(target: MutableStats, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("A duração temporal de permanência é inválida.");
  }
  if (!Number.isSafeInteger(target.count + 1)) {
    throw new RangeError("A quantidade temporal de sessões excedeu o limite seguro.");
  }
  const adjusted = value - target.compensation;
  const sum = target.sum + adjusted;
  target.compensation = sum - target.sum - adjusted;
  if (!Number.isFinite(sum)) {
    throw new RangeError("A duração temporal acumulada excedeu o limite seguro.");
  }
  target.sum = sum;
  target.count += 1;
  target.minimum = target.minimum === null ? value : Math.min(target.minimum, value);
  target.maximum = target.maximum === null ? value : Math.max(target.maximum, value);
  target.values?.push(value);
}

function finalizeStats(source: MutableStats): OccupancyLoiteringTemporalStats {
  if (!source.count) {
    return {
      avgDurationSeconds: null,
      count: 0,
      maxDurationSeconds: null,
      medianDurationSeconds: null,
      minDurationSeconds: null,
      p90DurationSeconds: null,
      sumDurationSeconds: 0,
    };
  }
  if (!source.values) {
    return {
      avgDurationSeconds: source.sum / source.count,
      count: source.count,
      maxDurationSeconds: source.maximum,
      medianDurationSeconds: null,
      minDurationSeconds: source.minimum,
      p90DurationSeconds: null,
      sumDurationSeconds: source.sum,
    };
  }
  const sorted = [...source.values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  const p90 = sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)];
  return {
    avgDurationSeconds: source.sum / source.count,
    count: source.count,
    maxDurationSeconds: source.maximum,
    medianDurationSeconds: median,
    minDurationSeconds: source.minimum,
    p90DurationSeconds: p90,
    sumDurationSeconds: source.sum,
  };
}

function requireHistogramEdges(values: readonly number[]) {
  if (!Array.isArray(values) || !values.length || values[0] !== 0) {
    throw new RangeError("O histograma de permanência deve começar em zero.");
  }
  const result = Array.from(values);
  result.forEach((value, index) => {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (index > 0 && value <= result[index - 1])
    ) {
      throw new RangeError(
        "Os limites do histograma de permanência devem ser crescentes.",
      );
    }
  });
  return result;
}

function buildHistogram(
  values: readonly number[],
  edges: readonly number[],
): OccupancyLoiteringDurationHistogramBin[] {
  const counts = edges.map(() => ({ count: 0, sum: 0, compensation: 0 }));
  for (const value of values) {
    let low = 0;
    let high = edges.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (edges[middle] <= value) low = middle;
      else high = middle - 1;
    }
    const target = counts[low];
    const adjusted = value - target.compensation;
    const sum = target.sum + adjusted;
    target.compensation = sum - target.sum - adjusted;
    target.sum = sum;
    target.count += 1;
  }
  return edges.map((fromSeconds, index) => {
    const toSeconds = edges[index + 1] ?? null;
    return {
      count: counts[index].count,
      fromSeconds,
      index,
      label: toSeconds === null
        ? `≥ ${formatOccupancyLoiteringDuration(fromSeconds)}`
        : `${formatOccupancyLoiteringDuration(fromSeconds)}–< ${formatOccupancyLoiteringDuration(toSeconds)}`,
      percentage: values.length ? (counts[index].count / values.length) * 100 : 0,
      sumDurationSeconds: counts[index].sum,
      toSeconds,
    };
  });
}

function requireInstant(value: Date | string, label: string) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`O ${label} temporal de permanência é inválido.`);
  }
  return timestamp;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
