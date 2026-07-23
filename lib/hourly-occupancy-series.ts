export type HourlyOccupancySeriesPoint = {
  bucket: string;
  entries: number;
  exits: number;
  hour: number;
  label: string;
  occupancy: number | null;
};

export function buildHourlyOccupancySeries({
  day,
  entriesByHour,
  exitsByHour,
  startHour = 0,
  through,
}: {
  day: Date;
  entriesByHour: readonly number[];
  exitsByHour: readonly number[];
  startHour?: number;
  through: Date;
}): HourlyOccupancySeriesPoint[] {
  const normalizedStartHour = normalizeOccupancyStartHour(startHour);
  const dayStart = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
  );
  const countingStart = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    normalizedStartHour,
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const effectiveEnd = new Date(
    Math.min(
      dayEnd.getTime(),
      Math.max(countingStart.getTime(), through.getTime()),
    ),
  );
  let cumulativeEntries = 0;
  let cumulativeExits = 0;

  return Array.from({ length: 24 }, (_, hour) => {
    const bucket = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate(),
      hour,
    );
    const beforeStart = hour < normalizedStartHour;
    const included = !beforeStart && bucket < effectiveEnd;

    if (included) {
      cumulativeEntries += finiteHourlyTotal(entriesByHour[hour]);
      cumulativeExits += finiteHourlyTotal(exitsByHour[hour]);
    }

    return {
      bucket: bucket.toISOString(),
      entries: cumulativeEntries,
      exits: cumulativeExits,
      hour,
      label: `${String(hour).padStart(2, "0")}h`,
      occupancy: beforeStart
        ? 0
        : included
          ? cumulativeEntries - cumulativeExits
          : null,
    };
  });
}

export function normalizeOccupancyStartHour(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 0;
}

function finiteHourlyTotal(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
