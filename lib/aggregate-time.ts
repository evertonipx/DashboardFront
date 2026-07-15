import type { AggregateGranularity } from "@/lib/types";

export function aggregateQueryIso(
  date: Date,
  granularity: AggregateGranularity,
) {
  if (granularity === "minute" || granularity === "hour") {
    return date.toISOString();
  }

  const year = date.getFullYear();
  const month =
    granularity === "year"
      ? 0
      : granularity === "semester"
        ? date.getMonth() < 6
          ? 0
          : 6
        : date.getMonth();
  const day =
    granularity === "month" ||
    granularity === "semester" ||
    granularity === "year"
      ? 1
      : date.getDate();

  return new Date(Date.UTC(year, month, day)).toISOString();
}
