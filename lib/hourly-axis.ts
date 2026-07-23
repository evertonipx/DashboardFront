export type HourlyAxisPoint = {
  bucket: string;
  total: number;
};

export const HOUR_OF_DAY_LABELS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}h`,
);

export function latestHourlyPointHour(points: readonly HourlyAxisPoint[]) {
  return points.reduce((latest, point) => {
    const bucket = new Date(point.bucket);
    return Number.isNaN(bucket.getTime())
      ? latest
      : Math.max(latest, bucket.getHours());
  }, -1);
}

export function buildFixedHourlyAxisValues(
  points: readonly HourlyAxisPoint[],
  throughHour = latestHourlyPointHour(points),
) {
  const totals = new Map<number, number>();
  points.forEach((point) => {
    const bucket = new Date(point.bucket);
    if (Number.isNaN(bucket.getTime())) return;
    totals.set(bucket.getHours(), finiteTotal(point.total));
  });

  const normalizedThrough = Math.max(-1, Math.min(23, throughHour));
  return HOUR_OF_DAY_LABELS.map((_, hour) =>
    hour <= normalizedThrough ? totals.get(hour) ?? 0 : null,
  );
}

function finiteTotal(value: number) {
  return Number.isFinite(value) ? value : 0;
}
