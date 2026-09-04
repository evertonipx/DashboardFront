import {
  companyZonedDateParts,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
  startOfCompanyTimeZoneDay,
} from "@/lib/company-time-zone";

const MINUTE_MS = 60_000;
const MINUTE_SECONDS = 60;
const MAX_CIVIL_DAY_MINUTES = 26 * 60;

export type OccupancyDurationState =
  | "occupied"
  | "free"
  | "transition"
  | "unknown";

export type OccupancyDurationMetric = {
  average: number;
  minimum: number;
  peak: number;
};

export type OccupancyDurationMinuteRange = {
  buckets: Date[];
  /** Exclusive end of the current civil day in the company's IANA timezone. */
  dayEnd: Date;
  from: Date;
  requestedAt: Date;
  timeZone: string;
  /** Exclusive end: start of the minute that is still open at requestedAt. */
  to: Date;
};

export type OccupancyDurationSegment = {
  bucketCount: number;
  from: Date;
  /** Integral of the scenario total over this segment, in unit-seconds. */
  loadUnitSeconds: number;
  seconds: number;
  state: OccupancyDurationState;
  to: Date;
};

export type OccupancyDurationSummary = {
  bucketCount: number;
  confirmedFreeSeconds: number;
  confirmedOccupiedSeconds: number;
  expectedSeconds: number;
  /** Integral of scenario occupancy. It is not individual dwell time. */
  loadUnitSeconds: number;
  longestConfirmedOccupiedSeconds: number;
  observedBucketCount: number;
  observedSeconds: number;
  /** Upper bound within observed buckets: confirmed plus transition buckets. */
  possibleOccupiedSeconds: number;
  segments: OccupancyDurationSegment[];
  transitionSeconds: number;
  unknownSeconds: number;
};

/**
 * Lists every fully closed absolute minute in the company's current civil day.
 * A DST transition therefore produces the real 23/24/25-hour timeline rather
 * than assuming that every civil day contains exactly 1,440 minutes.
 */
export function buildOccupancyClosedDayMinuteRange(
  now: Date,
  timeZone: string,
): OccupancyDurationMinuteRange {
  const requestedAt = requireValidDate(now, "instante de referência");
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const from = startOfCompanyTimeZoneDay(requestedAt, canonicalTimeZone);
  const dayEnd = startOfNextCompanyCivilDay(
    requestedAt,
    canonicalTimeZone,
  );
  const to = new Date(
    Math.floor(requestedAt.getTime() / MINUTE_MS) * MINUTE_MS,
  );

  if (to < from) {
    throw new RangeError(
      "O último minuto fechado é anterior ao início do dia da empresa.",
    );
  }

  const buckets: Date[] = [];
  for (
    let cursor = from.getTime();
    cursor < to.getTime();
    cursor += MINUTE_MS
  ) {
    buckets.push(new Date(cursor));
    if (buckets.length > MAX_CIVIL_DAY_MINUTES) {
      throw new RangeError("O dia civil de ocupação excedeu o limite seguro.");
    }
  }

  return {
    buckets,
    dayEnd,
    from: new Date(from),
    requestedAt,
    timeZone: canonicalTimeZone,
    to,
  };
}

/**
 * Builds a conservative duration summary over a complete, contiguous minute
 * axis. Map keys are minute-start epoch milliseconds (the same identity used
 * by occupancyAggregateBucketKey for minute aggregates). Metrics outside the
 * requested axis are deliberately ignored.
 *
 * A bucket is only confirmed occupied when its minimum is greater than zero,
 * and only confirmed free when its peak is zero. A bucket that touched both
 * states remains a transition: avg/min/max cannot reveal its exact split.
 */
export function buildOccupancyDurationSummary(
  buckets: readonly Date[],
  metrics: ReadonlyMap<number, OccupancyDurationMetric>,
): OccupancyDurationSummary {
  requireMinuteAxis(buckets);
  requireMetricMap(metrics);

  const segments: OccupancyDurationSegment[] = [];
  let confirmedFreeSeconds = 0;
  let confirmedOccupiedSeconds = 0;
  let observedBucketCount = 0;
  let transitionSeconds = 0;
  let unknownSeconds = 0;
  let loadUnitSeconds = 0;

  buckets.forEach((bucket) => {
    const from = new Date(bucket);
    const to = new Date(bucket.getTime() + MINUTE_MS);
    const metric = metrics.get(bucket.getTime());
    const state = classifyDurationMetric(metric);
    const segmentLoad = metric
      ? requireFiniteProduct(metric.average, MINUTE_SECONDS)
      : 0;

    if (state === "occupied") {
      confirmedOccupiedSeconds += MINUTE_SECONDS;
    } else if (state === "free") {
      confirmedFreeSeconds += MINUTE_SECONDS;
    } else if (state === "transition") {
      transitionSeconds += MINUTE_SECONDS;
    } else {
      unknownSeconds += MINUTE_SECONDS;
    }
    if (metric) {
      observedBucketCount += 1;
      loadUnitSeconds = requireFiniteSum(loadUnitSeconds, segmentLoad);
    }

    appendDurationSegment(segments, {
      bucketCount: 1,
      from,
      loadUnitSeconds: segmentLoad,
      seconds: MINUTE_SECONDS,
      state,
      to,
    });
  });

  const expectedSeconds = buckets.length * MINUTE_SECONDS;
  const observedSeconds = observedBucketCount * MINUTE_SECONDS;
  const summary: OccupancyDurationSummary = {
    bucketCount: buckets.length,
    confirmedFreeSeconds,
    confirmedOccupiedSeconds,
    expectedSeconds,
    loadUnitSeconds,
    longestConfirmedOccupiedSeconds: longestConfirmedSequence(segments),
    observedBucketCount,
    observedSeconds,
    possibleOccupiedSeconds:
      confirmedOccupiedSeconds + transitionSeconds,
    segments,
    transitionSeconds,
    unknownSeconds,
  };
  requireSummaryInvariants(summary);
  return summary;
}

/**
 * Combines non-overlapping temporal chunks of the same scenario. Adjacent
 * segments with the same state are joined, so an occupied sequence crossing a
 * query boundary remains one sequence. Overlapping summaries are rejected;
 * combining different scenarios would otherwise invent a temporal result.
 */
export function combineOccupancyDurationSummaries(
  summaries: readonly OccupancyDurationSummary[],
): OccupancyDurationSummary {
  summaries.forEach(requireSummaryInvariants);
  const orderedSegments = summaries
    .flatMap((summary) => summary.segments.map(cloneSegment))
    .sort((left, right) => left.from.getTime() - right.from.getTime());
  const segments: OccupancyDurationSegment[] = [];
  orderedSegments.forEach((segment) => {
    const previous = segments.at(-1);
    if (previous && segment.from < previous.to) {
      throw new RangeError(
        "Os resumos de duração de ocupação possuem períodos sobrepostos.",
      );
    }
    appendDurationSegment(segments, segment);
  });

  const total = (key: DurationTotalKey) =>
    summaries.reduce(
      (sum, summary) => requireFiniteSum(sum, summary[key]),
      0,
    );
  const summary: OccupancyDurationSummary = {
    bucketCount: total("bucketCount"),
    confirmedFreeSeconds: total("confirmedFreeSeconds"),
    confirmedOccupiedSeconds: total("confirmedOccupiedSeconds"),
    expectedSeconds: total("expectedSeconds"),
    loadUnitSeconds: total("loadUnitSeconds"),
    longestConfirmedOccupiedSeconds: longestConfirmedSequence(segments),
    observedBucketCount: total("observedBucketCount"),
    observedSeconds: total("observedSeconds"),
    possibleOccupiedSeconds: total("possibleOccupiedSeconds"),
    segments,
    transitionSeconds: total("transitionSeconds"),
    unknownSeconds: total("unknownSeconds"),
  };
  requireSummaryInvariants(summary);
  return summary;
}

export function formatOccupancyDuration(seconds: number) {
  requireNonNegativeFinite(seconds, "duração de ocupação");
  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) return `${roundedSeconds}s`;

  const days = Math.floor(roundedSeconds / 86_400);
  const hours = Math.floor((roundedSeconds % 86_400) / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const remainder = roundedSeconds % 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}min` : "",
    remainder ? `${remainder}s` : "",
  ]
    .filter(Boolean)
    .join(" ") || "0min";
}

/**
 * Reconciles a rolling aggregate window. Values at and after `replaceFrom`
 * are removed before the new response is applied, so a bucket omitted by the
 * API remains unknown instead of retaining a stale value.
 */
export function reconcileOccupancyDurationMetrics(
  current: ReadonlyMap<number, OccupancyDurationMetric>,
  incoming: ReadonlyMap<number, OccupancyDurationMetric>,
  replaceFrom: number,
  rangeTo: number,
) {
  requireMetricMap(current);
  requireMetricMap(incoming);
  if (
    !Number.isSafeInteger(replaceFrom) ||
    !Number.isSafeInteger(rangeTo) ||
    replaceFrom % MINUTE_MS !== 0 ||
    rangeTo % MINUTE_MS !== 0 ||
    replaceFrom > rangeTo
  ) {
    throw new RangeError("A janela de reconciliação da duração é inválida.");
  }

  const totals = new Map<number, OccupancyDurationMetric>();
  current.forEach((metric, bucket) => {
    requireMetricEntry(bucket, metric);
    if (bucket < replaceFrom && bucket < rangeTo) totals.set(bucket, metric);
  });
  incoming.forEach((metric, bucket) => {
    requireMetricEntry(bucket, metric);
    if (bucket < replaceFrom || bucket >= rangeTo) {
      throw new RangeError(
        "A resposta incremental contém um bucket fora da janela solicitada.",
      );
    }
    totals.set(bucket, metric);
  });
  return totals;
}

function classifyDurationMetric(
  metric: OccupancyDurationMetric | undefined,
): OccupancyDurationState {
  if (!metric) return "unknown";
  requireDurationMetric(metric);
  if (metric.minimum > 0) return "occupied";
  if (metric.peak === 0) return "free";
  return "transition";
}

function appendDurationSegment(
  segments: OccupancyDurationSegment[],
  next: OccupancyDurationSegment,
) {
  requireDurationSegment(next);
  const previous = segments.at(-1);
  if (
    previous &&
    previous.state === next.state &&
    previous.to.getTime() === next.from.getTime()
  ) {
    previous.bucketCount += next.bucketCount;
    previous.loadUnitSeconds = requireFiniteSum(
      previous.loadUnitSeconds,
      next.loadUnitSeconds,
    );
    previous.seconds += next.seconds;
    previous.to = new Date(next.to);
    return;
  }
  segments.push(cloneSegment(next));
}

function longestConfirmedSequence(segments: OccupancyDurationSegment[]) {
  return segments.reduce(
    (longest, segment) =>
      segment.state === "occupied"
        ? Math.max(longest, segment.seconds)
        : longest,
    0,
  );
}

function requireMinuteAxis(buckets: readonly Date[]) {
  if (!Array.isArray(buckets)) {
    throw new TypeError("O eixo de minutos da ocupação é inválido.");
  }
  let previous: number | null = null;
  buckets.forEach((bucket, index) => {
    const current = requireValidDate(
      bucket,
      `bucket de ocupação na posição ${index}`,
    ).getTime();
    if (current % MINUTE_MS !== 0) {
      throw new RangeError(
        `O bucket de ocupação na posição ${index} não inicia em um minuto.`,
      );
    }
    if (previous !== null && current !== previous + MINUTE_MS) {
      throw new RangeError(
        "O eixo de minutos da ocupação precisa ser contínuo e crescente.",
      );
    }
    previous = current;
  });
}

function requireMetricMap(
  metrics: ReadonlyMap<number, OccupancyDurationMetric>,
) {
  if (!metrics || typeof metrics.get !== "function") {
    throw new TypeError("As métricas de duração de ocupação são inválidas.");
  }
}

function requireMetricEntry(
  bucket: number,
  metric: OccupancyDurationMetric,
) {
  if (!Number.isSafeInteger(bucket) || bucket % MINUTE_MS !== 0) {
    throw new RangeError("A chave da métrica de duração é inválida.");
  }
  requireDurationMetric(metric);
}

function requireDurationMetric(metric: OccupancyDurationMetric) {
  if (!metric || typeof metric !== "object") {
    throw new TypeError("A métrica de duração de ocupação é inválida.");
  }
  requireNonNegativeFinite(metric.average, "média de ocupação");
  requireNonNegativeFinite(metric.minimum, "mínimo de ocupação");
  requireNonNegativeFinite(metric.peak, "máximo de ocupação");
  if (metric.minimum > metric.average || metric.average > metric.peak) {
    throw new RangeError("A métrica de duração de ocupação é inconsistente.");
  }
}

function requireDurationSegment(segment: OccupancyDurationSegment) {
  const from = requireValidDate(segment.from, "início do segmento");
  const to = requireValidDate(segment.to, "fim do segmento");
  if (from >= to) {
    throw new RangeError("O segmento de duração de ocupação é inválido.");
  }
  if (
    !Number.isSafeInteger(segment.bucketCount) ||
    segment.bucketCount < 1 ||
    !Number.isSafeInteger(segment.seconds) ||
    segment.seconds !== segment.bucketCount * MINUTE_SECONDS ||
    to.getTime() - from.getTime() !== segment.seconds * 1_000 ||
    !isDurationState(segment.state)
  ) {
    throw new RangeError("O segmento de duração de ocupação é inconsistente.");
  }
  requireNonNegativeFinite(segment.loadUnitSeconds, "carga de ocupação");
  if (segment.state === "unknown" && segment.loadUnitSeconds !== 0) {
    throw new RangeError(
      "Um segmento sem dados não pode publicar carga de ocupação.",
    );
  }
}

function requireSummaryInvariants(summary: OccupancyDurationSummary) {
  if (!summary || typeof summary !== "object") {
    throw new TypeError("O resumo de duração de ocupação é inválido.");
  }
  const integerFields: DurationIntegerKey[] = [
    "bucketCount",
    "confirmedFreeSeconds",
    "confirmedOccupiedSeconds",
    "expectedSeconds",
    "longestConfirmedOccupiedSeconds",
    "observedBucketCount",
    "observedSeconds",
    "possibleOccupiedSeconds",
    "transitionSeconds",
    "unknownSeconds",
  ];
  integerFields.forEach((field) => {
    const value = summary[field];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("O resumo de duração de ocupação é inconsistente.");
    }
  });
  requireNonNegativeFinite(summary.loadUnitSeconds, "carga de ocupação");
  if (!Array.isArray(summary.segments)) {
    throw new TypeError("Os segmentos de duração de ocupação são inválidos.");
  }
  let segmentBucketCount = 0;
  let segmentExpectedSeconds = 0;
  let segmentObservedBucketCount = 0;
  let segmentConfirmedFreeSeconds = 0;
  let segmentConfirmedOccupiedSeconds = 0;
  let segmentTransitionSeconds = 0;
  let segmentUnknownSeconds = 0;
  let segmentLoadUnitSeconds = 0;
  let previous: OccupancyDurationSegment | undefined;
  summary.segments.forEach((segment) => {
    requireDurationSegment(segment);
    if (previous && segment.from < previous.to) {
      throw new RangeError(
        "Os segmentos de duração de ocupação possuem períodos sobrepostos.",
      );
    }
    if (
      previous &&
      previous.to.getTime() === segment.from.getTime() &&
      previous.state === segment.state
    ) {
      throw new RangeError(
        "Segmentos contíguos com o mesmo estado precisam estar consolidados.",
      );
    }
    segmentBucketCount += segment.bucketCount;
    segmentExpectedSeconds += segment.seconds;
    segmentLoadUnitSeconds = requireFiniteSum(
      segmentLoadUnitSeconds,
      segment.loadUnitSeconds,
    );
    if (segment.state === "unknown") {
      segmentUnknownSeconds += segment.seconds;
    } else {
      segmentObservedBucketCount += segment.bucketCount;
      if (segment.state === "occupied") {
        segmentConfirmedOccupiedSeconds += segment.seconds;
      } else if (segment.state === "free") {
        segmentConfirmedFreeSeconds += segment.seconds;
      } else {
        segmentTransitionSeconds += segment.seconds;
      }
    }
    previous = segment;
  });

  if (
    summary.expectedSeconds !== summary.bucketCount * MINUTE_SECONDS ||
    summary.observedSeconds !==
      summary.observedBucketCount * MINUTE_SECONDS ||
    summary.observedSeconds !==
      summary.confirmedOccupiedSeconds +
        summary.confirmedFreeSeconds +
        summary.transitionSeconds ||
    summary.expectedSeconds !==
      summary.observedSeconds + summary.unknownSeconds ||
    summary.possibleOccupiedSeconds !==
      summary.confirmedOccupiedSeconds + summary.transitionSeconds ||
    summary.longestConfirmedOccupiedSeconds !==
      longestConfirmedSequence(summary.segments) ||
    segmentBucketCount !== summary.bucketCount ||
    segmentExpectedSeconds !== summary.expectedSeconds ||
    segmentObservedBucketCount !== summary.observedBucketCount ||
    segmentConfirmedFreeSeconds !== summary.confirmedFreeSeconds ||
    segmentConfirmedOccupiedSeconds !== summary.confirmedOccupiedSeconds ||
    segmentTransitionSeconds !== summary.transitionSeconds ||
    segmentUnknownSeconds !== summary.unknownSeconds ||
    !nearlyEqual(segmentLoadUnitSeconds, summary.loadUnitSeconds)
  ) {
    throw new RangeError("O resumo de duração de ocupação é inconsistente.");
  }
}

function cloneSegment(
  segment: OccupancyDurationSegment,
): OccupancyDurationSegment {
  return {
    ...segment,
    from: new Date(segment.from),
    to: new Date(segment.to),
  };
}

function requireValidDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError(`O ${label} é inválido.`);
  }
  return new Date(value);
}

function requireNonNegativeFinite(value: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`A ${label} é inválida.`);
  }
  return value;
}

function requireFiniteProduct(left: number, right: number) {
  const product = left * right;
  if (!Number.isFinite(product) || product < 0) {
    throw new RangeError("A carga de ocupação excedeu o limite numérico.");
  }
  return product;
}

function requireFiniteSum(left: number, right: number) {
  const sum = left + right;
  if (!Number.isFinite(sum) || sum < 0) {
    throw new RangeError("O total de duração de ocupação excedeu o limite.");
  }
  return sum;
}

function nearlyEqual(left: number, right: number) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
}

function isDurationState(value: unknown): value is OccupancyDurationState {
  return (
    value === "occupied" ||
    value === "free" ||
    value === "transition" ||
    value === "unknown"
  );
}

function startOfNextCompanyCivilDay(date: Date, timeZone: string) {
  const parts = companyZonedDateParts(date, timeZone);
  const civilNoon = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12),
  );

  // A skipped civil date is rare but valid in IANA history. In that case the
  // end of the current day is the start of the next civil date that exists.
  for (let dayOffset = 1; dayOffset <= 3; dayOffset += 1) {
    const candidate = new Date(
      civilNoon.getTime() + dayOffset * 24 * 60 * 60_000,
    );
    try {
      return startOfCompanyTimeZoneCivilDay(
        {
          day: candidate.getUTCDate(),
          month: candidate.getUTCMonth() + 1,
          year: candidate.getUTCFullYear(),
        },
        timeZone,
      );
    } catch {
      // Continue only to bridge a civil date that does not exist in this zone.
    }
  }

  throw new Error("Não foi possível localizar o fim do dia civil da empresa.");
}

type DurationTotalKey = Exclude<
  keyof OccupancyDurationSummary,
  "segments" | "longestConfirmedOccupiedSeconds"
>;

type DurationIntegerKey = Exclude<
  keyof OccupancyDurationSummary,
  "segments" | "loadUnitSeconds"
>;
