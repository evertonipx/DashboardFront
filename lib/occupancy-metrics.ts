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

function roundOccupancyValue(value: number) {
  return Math.round(value * 10) / 10;
}
