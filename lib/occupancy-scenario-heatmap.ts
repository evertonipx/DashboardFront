import { startOfAggregateBucket } from "@/lib/aggregate-time";
import {
  companyCalendarDate,
  companyTimeZoneOffsetLabel,
  companyZonedDateParts,
  requireCompanyTimeZone,
} from "@/lib/company-time-zone";
import {
  buildOccupancyHourlyRange,
  buildScenariosHoursOccupancyCells,
  localDateKey,
  occupancyMetricValue,
  OCCUPANCY_FIXED_HOUR_LABELS,
  type OccupancyComparisonMetricKey,
  type OccupancyHeatmapCell,
  type OccupancyScenarioHourlySeries,
} from "@/lib/occupancy-comparison";
import { occupancyAggregateBucketKey } from "@/lib/occupancy-aggregate-validation";
import { shiftOccupancyCalendarDate } from "@/lib/occupancy-calendar";

export type OccupancyScenarioHeatmapGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type OccupancyScenarioHeatmapRange = {
  buckets: Date[];
  from: Date;
  to: Date;
};

type OccupancyScenarioHeatmapAttemptOptions = {
  fullRefresh: boolean;
  granularity: OccupancyScenarioHeatmapGranularity;
  missingBuckets?: readonly Date[];
  previous: ReadonlySet<number>;
  previousRetry?: ReadonlySet<number>;
  refreshedBuckets: readonly Date[];
  requestedBuckets: readonly Date[];
};

type OccupancyScenarioPeriodHeatmapOptions = {
  buckets: readonly Date[];
  dateKey?: string;
  granularity: OccupancyScenarioHeatmapGranularity;
  metric: OccupancyComparisonMetricKey;
  series: readonly OccupancyScenarioHourlySeries[];
  timeZone: string;
};

const OCCUPANCY_SCENARIO_HEATMAP_DAY_COUNTS = new Set([7, 14, 30]);
const MINUTE_MS = 60_000;
const PORTUGUESE_WEEKDAYS = [
  "dom.",
  "seg.",
  "ter.",
  "qua.",
  "qui.",
  "sex.",
  "sáb.",
] as const;
const PORTUGUESE_MONTHS = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
] as const;

export function occupancyScenarioHeatmapGranularityLabel(
  granularity: OccupancyScenarioHeatmapGranularity,
) {
  if (granularity === "minute") return "minutos";
  if (granularity === "hour") return "horários";
  if (granularity === "day") return "dias";
  if (granularity === "week") return "semanas";
  if (granularity === "month") return "meses";
  return assertNever(granularity);
}

export function occupancyScenarioHeatmapPeriodDescription(
  granularity: OccupancyScenarioHeatmapGranularity,
  dayCount: 7 | 14 | 30,
  dateKey?: string,
) {
  if (granularity === "minute") return "últimos 60 minutos";
  if (granularity === "hour") {
    return dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? `horários de ${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)}`
      : "horários da data selecionada";
  }
  if (granularity === "day") return `últimos ${dayCount} dias`;
  if (granularity === "week") return "últimas 8 semanas";
  if (granularity === "month") return "últimos 12 meses";
  return assertNever(granularity);
}

/**
 * Builds the same compact rolling windows used by Occupancy's live charts.
 * Minute/hour buckets are real instants; calendar buckets deliberately remain
 * floating civil dates so the API query layer can resolve them in the
 * company's IANA timezone without borrowing the browser timezone.
 */
export function buildOccupancyScenarioHeatmapRange(
  now: Date,
  granularity: OccupancyScenarioHeatmapGranularity,
  dayCount: 7 | 14 | 30,
  timeZone: string,
): OccupancyScenarioHeatmapRange {
  requireValidDate(now, "instante do mapa de calor por cenário");
  requireCompanyTimeZone(timeZone);
  if (!OCCUPANCY_SCENARIO_HEATMAP_DAY_COUNTS.has(dayCount)) {
    throw new RangeError(
      "O mapa de calor por cenário aceita períodos de 7, 14 ou 30 dias.",
    );
  }

  if (granularity === "hour") {
    return buildOccupancyHourlyRange(now, dayCount, timeZone);
  }

  if (granularity === "minute") {
    const currentMinute = startOfAggregateBucket(now, "minute");
    const to = new Date(currentMinute.getTime() + MINUTE_MS);
    const from = new Date(to.getTime() - 60 * MINUTE_MS);
    return {
      buckets: Array.from(
        { length: 60 },
        (_, index) => new Date(from.getTime() + index * MINUTE_MS),
      ),
      from,
      to,
    };
  }

  const companyDay = companyCalendarDate(now, timeZone, "day");
  if (granularity === "day") {
    const from = shiftOccupancyCalendarDate(companyDay, -(dayCount - 1));
    const to = shiftOccupancyCalendarDate(companyDay, 1);
    return {
      buckets: listCivilBuckets(from, dayCount, "day"),
      from,
      to,
    };
  }

  if (granularity === "week") {
    const daysSinceMonday = (companyDay.getDay() + 6) % 7;
    const currentWeek = shiftOccupancyCalendarDate(
      companyDay,
      -daysSinceMonday,
    );
    const from = shiftOccupancyCalendarDate(currentWeek, -7 * 7);
    const to = shiftOccupancyCalendarDate(currentWeek, 7);
    return {
      buckets: listCivilBuckets(from, 8, "week"),
      from,
      to,
    };
  }

  if (granularity === "month") {
    const currentMonth = companyCalendarDate(now, timeZone, "month");
    const from = shiftOccupancyCalendarDate(currentMonth, 0, -11);
    const to = shiftOccupancyCalendarDate(currentMonth, 0, 1);
    return {
      buckets: listCivilBuckets(from, 12, "month"),
      from,
      to,
    };
  }

  return assertNever(granularity);
}

/**
 * Keeps query coverage inside the requested window. The open edge always stays
 * mutable. A missing bucket immediately behind it gets one additional query,
 * which absorbs eventual-consistency delay after rollover without repeatedly
 * polling older gaps.
 */
export function updateOccupancyScenarioHeatmapAttemptedBuckets({
  fullRefresh,
  granularity,
  missingBuckets = [],
  previous,
  previousRetry = new Set<number>(),
  refreshedBuckets,
  requestedBuckets,
}: OccupancyScenarioHeatmapAttemptOptions) {
  const requestedKeys = new Set(
    requestedBuckets.map((bucket) =>
      occupancyAggregateBucketKey(bucket, granularity),
    ),
  );
  const attempted = new Set(
    fullRefresh
      ? []
      : Array.from(previous).filter((key) => requestedKeys.has(key)),
  );
  const retry = new Set(
    fullRefresh
      ? []
      : Array.from(previousRetry).filter((key) => requestedKeys.has(key)),
  );
  refreshedBuckets.forEach((bucket) => {
    const key = occupancyAggregateBucketKey(bucket, granularity);
    if (!requestedKeys.has(key)) return;
    attempted.add(key);
    retry.delete(key);
  });
  const openBucket = requestedBuckets.at(-1);
  const openBucketKey = openBucket
    ? occupancyAggregateBucketKey(openBucket, granularity)
    : undefined;
  const latestClosedBucket = requestedBuckets.at(-2);
  const latestClosedBucketKey = latestClosedBucket
    ? occupancyAggregateBucketKey(latestClosedBucket, granularity)
    : undefined;
  missingBuckets.forEach((bucket) => {
    const key = occupancyAggregateBucketKey(bucket, granularity);
    if (!requestedKeys.has(key) || key === openBucketKey) return;
    if (key !== latestClosedBucketKey) {
      attempted.add(key);
      retry.delete(key);
      return;
    }
    if (retry.has(key)) {
      attempted.add(key);
      retry.delete(key);
      return;
    }
    attempted.delete(key);
    retry.add(key);
  });
  if (openBucket) {
    attempted.delete(openBucketKey!);
    retry.delete(openBucketKey!);
  }
  return {
    attemptedBucketKeys: attempted,
    coverageRetryBucketKeys: retry,
  };
}

/**
 * Produces one certified cell for every scenario/bucket pair. Missing metrics
 * remain null and certified zeroes remain zero; the helper only projects the
 * average or peak already returned by the aggregate API.
 */
export function buildOccupancyScenarioPeriodHeatmap({
  buckets,
  dateKey,
  granularity,
  metric,
  series,
  timeZone,
}: OccupancyScenarioPeriodHeatmapOptions): {
  cells: OccupancyHeatmapCell[];
  labels: string[];
  scenarioNames: string[];
} {
  requireCompanyTimeZone(timeZone);
  buckets.forEach((bucket) =>
    requireValidDate(bucket, "bucket do mapa de calor por cenário"),
  );

  if (granularity === "hour") {
    const effectiveDateKey = resolveHourlyDateKey(buckets, dateKey, timeZone);
    const matrix = effectiveDateKey
      ? buildScenariosHoursOccupancyCells({
          buckets,
          dateKey: effectiveDateKey,
          metric,
          series,
          timeZone,
        })
      : { cells: [], scenarioNames: series.map((scenario) => scenario.name) };
    return {
      ...matrix,
      labels: [...OCCUPANCY_FIXED_HOUR_LABELS],
    };
  }

  const labels = buildPeriodLabels(buckets, granularity, timeZone);
  const cells = series.flatMap((scenario, scenarioIndex) =>
    buckets.map((bucket, bucketIndex): OccupancyHeatmapCell => ({
      bucket: new Date(bucket),
      scenarioId: scenario.scenarioId,
      value: occupancyMetricValue(
        scenario.metrics.get(
          occupancyAggregateBucketKey(bucket, granularity),
        ),
        metric,
      ),
      x: scenarioIndex,
      y: bucketIndex,
    })),
  );

  return {
    cells,
    labels,
    scenarioNames: series.map((scenario) => scenario.name),
  };
}

function resolveHourlyDateKey(
  buckets: readonly Date[],
  dateKey: string | undefined,
  timeZone: string,
) {
  if (dateKey !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError("A data do mapa de calor é inválida.");
  }
  return dateKey ?? (buckets.length ? localDateKey(buckets.at(-1)!, timeZone) : "");
}

function buildPeriodLabels(
  buckets: readonly Date[],
  granularity: Exclude<OccupancyScenarioHeatmapGranularity, "hour">,
  timeZone: string,
) {
  if (granularity === "minute") {
    const clockLabels = buckets.map((bucket) => {
      const parts = companyZonedDateParts(bucket, timeZone);
      return `${String(parts.hour).padStart(2, "0")}:${String(
        parts.minute,
      ).padStart(2, "0")}`;
    });
    const occurrences = countLabels(clockLabels);
    return clockLabels.map((label, index) =>
      (occurrences.get(label) ?? 0) > 1
        ? `${label} (${companyTimeZoneOffsetLabel(buckets[index], timeZone)})`
        : label,
    );
  }

  return buckets.map((bucket) => {
    const year = bucket.getFullYear();
    const month = bucket.getMonth();
    const day = bucket.getDate();
    if (granularity === "day") {
      const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
      return `${PORTUGUESE_WEEKDAYS[weekday]} ${pad2(day)}/${pad2(month + 1)}`;
    }
    if (granularity === "week") {
      return `Sem. ${pad2(day)}/${pad2(month + 1)}`;
    }
    return `${PORTUGUESE_MONTHS[month]}/${String(year).slice(-2)}`;
  });
}

function listCivilBuckets(
  from: Date,
  count: number,
  granularity: "day" | "week" | "month",
) {
  return Array.from({ length: count }, (_, index) => {
    if (granularity === "month") {
      return shiftOccupancyCalendarDate(from, 0, index);
    }
    return shiftOccupancyCalendarDate(
      from,
      index * (granularity === "week" ? 7 : 1),
    );
  });
}

function countLabels(labels: readonly string[]) {
  const counts = new Map<string, number>();
  labels.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1));
  return counts;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function requireValidDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError(`O ${label} é inválido.`);
  }
}

function assertNever(value: never): never {
  throw new RangeError(`A granularidade ${String(value)} é inválida.`);
}
