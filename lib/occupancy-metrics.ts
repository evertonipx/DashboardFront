import { companyCalendarDate, companyDateKey } from "@/lib/company-time-zone";

export type NullableOccupancyMetric = {
  average: number | null;
  current: number | null;
  minimum: number | null;
  peak: number | null;
};

export function emptyOccupancyMetric(): NullableOccupancyMetric {
  return {
    average: null,
    current: null,
    minimum: null,
    peak: null,
  };
}

export function summarizeOccupancyMetrics(
  points: readonly NullableOccupancyMetric[],
): NullableOccupancyMetric {
  const populated = points.flatMap((point, index) => {
    const values = [point.average, point.minimum, point.peak];
    if (values.every((value) => value === null)) return [];
    if (
      !values.every(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0,
      ) ||
      point.minimum! > point.average! ||
      point.average! > point.peak!
    ) {
      throw new Error(
        `As métricas de ocupação na posição ${index} não estão certificadas.`,
      );
    }
    return [
      point as NullableOccupancyMetric & {
        average: number;
        minimum: number;
        peak: number;
      },
    ];
  });
  const current = [...points]
    .reverse()
    .find((point) => point.current !== null)?.current ?? null;
  if (
    current !== null &&
    (!Number.isFinite(current) || current < 0)
  ) {
    throw new Error("O valor atual de ocupação não está certificado.");
  }
  if (!populated.length) {
    return {
      ...emptyOccupancyMetric(),
      current,
    };
  }

  return {
    average: roundOccupancyValue(
      populated.reduce((sum, point) => sum + point.average, 0) /
        populated.length,
    ),
    current,
    minimum: Math.min(...populated.map((point) => point.minimum)),
    peak: Math.max(...populated.map((point) => point.peak)),
  };
}

export function latestOccupancyMetric(
  points: readonly NullableOccupancyMetric[],
): NullableOccupancyMetric {
  const latest = points.at(-1);
  return latest
    ? summarizeOccupancyMetrics([latest])
    : emptyOccupancyMetric();
}

/**
 * The daily aggregate can lag behind the current occupancy snapshot. Only a
 * reading observed on the company's current civil day can advance today's
 * peak; missing aggregate/reading data must remain unknown, never zero.
 */
export function resolveOccupancyTodayMetric({
  now,
  points,
  reading,
  timeZone,
}: {
  now: Date;
  points: readonly (NullableOccupancyMetric & { bucket: string })[];
  reading: { asOf: string | null; value: number | null } | null;
  timeZone: string;
}): NullableOccupancyMetric {
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError("O instante dos indicadores de hoje é inválido.");
  }
  // Civil aggregate buckets are floating calendar dates in the browser's
  // local representation; they are not instants in the company's timezone.
  const todayBucket = companyCalendarDate(now, timeZone, "day").getTime();
  const todayPoint = [...points].reverse().find((point) => {
    const bucket = new Date(point.bucket);
    return Number.isFinite(bucket.getTime()) && bucket.getTime() === todayBucket;
  });
  const aggregate = todayPoint
    ? summarizeOccupancyMetrics([todayPoint])
    : emptyOccupancyMetric();
  const readingAt = reading?.asOf ? new Date(reading.asOf) : null;
  const current =
    readingAt &&
    Number.isFinite(readingAt.getTime()) &&
    readingAt <= now &&
    companyDateKey(readingAt, timeZone) === companyDateKey(now, timeZone) &&
    typeof reading?.value === "number" &&
    Number.isFinite(reading.value) &&
    reading.value >= 0
      ? reading.value
      : null;
  return {
    ...aggregate,
    peak:
      current === null
        ? aggregate.peak
        : Math.max(aggregate.peak ?? current, current),
  };
}

/** Retains the greatest certified observation for each live civil-day scope. */
export function advanceOccupancyTodayPeakMemory(
  memory: ReadonlyMap<string, number>,
  scopeKey: string,
  peak: number | null,
): ReadonlyMap<string, number> {
  if (peak === null) return memory;
  if (!Number.isFinite(peak) || peak < 0) {
    throw new RangeError("O máximo observado hoje é inválido.");
  }
  const previous = memory.get(scopeKey);
  if (previous !== undefined && previous >= peak) return memory;
  const next = new Map(memory);
  next.delete(scopeKey);
  next.set(scopeKey, peak);
  while (next.size > 128) {
    const oldestKey = next.keys().next().value;
    if (oldestKey === undefined) break;
    next.delete(oldestKey);
  }
  return next;
}

function roundOccupancyValue(value: number) {
  return Math.round(value * 10) / 10;
}
