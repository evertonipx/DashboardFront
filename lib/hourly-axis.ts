export type HourlyAxisPoint = {
  bucket: string;
  total: number;
};

export type FixedHourlyAxisOptions = {
  fromHour?: number;
  missingHourValue?: number | null;
};

export type FixedHourlyDayWindow = {
  fromHour: number;
  throughHour: number;
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
  options: FixedHourlyAxisOptions = {},
) {
  const totals = new Map<number, number>();
  points.forEach((point) => {
    const bucket = new Date(point.bucket);
    if (Number.isNaN(bucket.getTime())) return;
    const hour = bucket.getHours();
    totals.set(
      hour,
      (totals.get(hour) ?? 0) + finiteTotal(point.total),
    );
  });

  const normalizedFrom = Math.max(
    0,
    Math.min(23, Math.trunc(options.fromHour ?? 0)),
  );
  const normalizedThrough = Math.max(-1, Math.min(23, throughHour));
  const { missingHourValue = 0 } = options;

  return HOUR_OF_DAY_LABELS.map((_, hour) => {
    if (hour < normalizedFrom || hour > normalizedThrough) return null;
    return totals.has(hour) ? totals.get(hour)! : missingHourValue;
  });
}

export function resolveFixedHourlyDayWindow(
  from: Date,
  to: Date,
  referenceTime: Date,
): FixedHourlyDayWindow | null {
  if (
    !isValidDate(from) ||
    !isValidDate(to) ||
    !isValidDate(referenceTime) ||
    to <= from
  ) {
    return null;
  }

  const finalInstant = new Date(to.getTime() - 1);
  if (!sameCalendarDay(from, finalInstant)) return null;

  let throughHour = finalInstant.getHours();
  if (referenceTime < from) {
    throughHour = -1;
  } else if (sameCalendarDay(referenceTime, from)) {
    throughHour = Math.min(referenceTime.getHours(), throughHour);
  }

  return {
    fromHour: from.getHours(),
    throughHour,
  };
}

function sameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isValidDate(value: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function finiteTotal(value: number) {
  return Number.isFinite(value) ? value : 0;
}
