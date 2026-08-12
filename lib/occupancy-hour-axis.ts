export const OCCUPANCY_FIXED_HOUR_LABELS = Array.from(
  { length: 24 },
  (_, hour) =>
    hour === 23 ? "23h–24h" : `${String(hour).padStart(2, "0")}h`,
);

export type OccupancyHourlyAxisPoint = {
  average: number | null;
  bucket: string;
  current: number | null;
  label: string;
  minimum: number | null;
  peak: number | null;
};

export function buildFixedOccupancyHourlyPoints(
  day: Date,
  sourcePoints: readonly OccupancyHourlyAxisPoint[],
): OccupancyHourlyAxisPoint[] {
  requireValidDay(day);
  const dayIdentity = localDayIdentity(day);
  const pointsByHour = Array.from(
    { length: OCCUPANCY_FIXED_HOUR_LABELS.length },
    () => [] as Array<{ bucket: Date; point: OccupancyHourlyAxisPoint }>,
  );

  sourcePoints.forEach((point, index) => {
    const bucket = new Date(point.bucket);
    if (
      Number.isNaN(bucket.getTime()) ||
      localDayIdentity(bucket) !== dayIdentity
    ) {
      throw new RangeError(
        `O ponto horário de ocupação na posição ${index} não pertence ao dia exibido.`,
      );
    }
    pointsByHour[bucket.getHours()].push({ bucket, point });
  });

  return pointsByHour.map((entries, hour) => {
    if (!entries.length) return emptyHourPoint(day, hour);

    entries.sort((left, right) => left.bucket.getTime() - right.bucket.getTime());
    const latest = entries.at(-1)!;
    if (entries.length === 1) {
      return {
        ...latest.point,
        label: OCCUPANCY_FIXED_HOUR_LABELS[hour],
      };
    }

    const completeMetrics = entries.every(({ point }) =>
      hasCompleteOccupancyMetric(point),
    );
    if (!completeMetrics) return emptyHourPoint(day, hour);

    return {
      // A repeated civil hour has more than one absolute bucket. Min/max are
      // exactly composable, and the last occurrence supplies the final value.
      // The average has no certified weight, so it must remain unavailable.
      average: null,
      bucket: latest.point.bucket,
      current: latest.point.current,
      label: OCCUPANCY_FIXED_HOUR_LABELS[hour],
      minimum: Math.min(...entries.map(({ point }) => point.minimum!)),
      peak: Math.max(...entries.map(({ point }) => point.peak!)),
    };
  });
}

export function occupancyFixedHourLabelInterval(index: number) {
  return index % 3 === 0 || index === 23;
}

function emptyHourPoint(day: Date, hour: number): OccupancyHourlyAxisPoint {
  return {
    average: null,
    bucket: localHourSlotIdentity(day, hour),
    current: null,
    label: OCCUPANCY_FIXED_HOUR_LABELS[hour],
    minimum: null,
    peak: null,
  };
}

function localHourSlotIdentity(day: Date, hour: number) {
  return [
    String(day.getFullYear()).padStart(4, "0"),
    "-",
    String(day.getMonth() + 1).padStart(2, "0"),
    "-",
    String(day.getDate()).padStart(2, "0"),
    "T",
    String(hour).padStart(2, "0"),
    ":00:00",
  ].join("");
}

function hasCompleteOccupancyMetric(point: OccupancyHourlyAxisPoint) {
  return (
    point.average !== null &&
    point.minimum !== null &&
    point.peak !== null
  );
}

function localDayIdentity(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function requireValidDay(day: Date) {
  if (!(day instanceof Date) || Number.isNaN(day.getTime())) {
    throw new RangeError("O dia do eixo horário de ocupação é inválido.");
  }
}
