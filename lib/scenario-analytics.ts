import type {
  AggregateEventRow,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import {
  endOfAggregateBucket,
  parseAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  companyZonedDateParts,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";
import {
  buildHourlyOccupancySeries,
  normalizeOccupancyStartHour,
  type HourlyOccupancySeriesPoint,
} from "@/lib/hourly-occupancy-series";

export type ScenarioSelectionMode = "all" | "custom";
export type ScenarioAnalyticsGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type ScenarioAnalyticsPoint = {
  bucket: string;
  label: string;
  total: number;
  isSaturday: boolean;
  isSunday: boolean;
};

export type ScenarioCivilHourMagnitudePoint = {
  bucket: string;
  day: number;
  hour: number;
  total: number;
};

export type ScenarioAnalyticsSeries = {
  id: string;
  name: string;
  points: ScenarioAnalyticsPoint[];
};

export type ScenarioRankingPoint = {
  id: string;
  name: string;
  share: number;
  total: number;
};

export type ScenarioPeakDayPoint = {
  bucket: string;
  label: string;
  rank: number;
  total: number;
};

export type ScenarioHourlyOccupancyPoint = HourlyOccupancySeriesPoint;

export type ScenarioCumulativeTotalPoint = {
  id: string;
  name: string;
  share: number;
  total: number;
};

export function selectScenarios(
  scenarios: Scenario[],
  mode: ScenarioSelectionMode,
  selectedIds: string[],
) {
  if (mode === "all") return scenarios;

  const selectedIdSet = new Set(selectedIds);
  return scenarios.filter((scenario) => selectedIdSet.has(scenario.id));
}

export function scenarioSelectionSummary(
  scenarios: Scenario[],
  mode: ScenarioSelectionMode,
  selectedIds: string[],
) {
  if (mode === "all") return `Todos os cenários (${scenarios.length})`;

  const count = selectScenarios(scenarios, mode, selectedIds).length;
  return count === 1 ? "1 cenário" : `${count} cenários`;
}

export function buildCombinedScenarioPoints({
  from,
  granularity,
  includeOverlappingSourceBuckets = false,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  granularity: ScenarioAnalyticsGranularity;
  includeOverlappingSourceBuckets?: boolean;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioAnalyticsPoint[] {
  const totals = aggregateSelectedRowsByBucket(
    rows,
    scenarios,
    granularity,
    sourceGranularity,
    from,
    to,
    includeOverlappingSourceBuckets,
  );

  return listBucketStarts(from, to, granularity).map((bucket) => ({
    bucket: bucket.toISOString(),
    isSaturday: granularity === "day" && bucket.getDay() === 6,
    isSunday: granularity === "day" && bucket.getDay() === 0,
    label: formatBucketLabel(bucket, granularity),
    total: totals.get(bucketKey(bucket, granularity)) ?? 0,
  }));
}

/**
 * Builds an intensity series for widgets where direction must not make a
 * recorded count disappear. Every selected physical line contributes once
 * by magnitude, regardless of whether it represents entry or exit. This
 * keeps an exit-only scenario visible, prevents opposite directions inside
 * one scenario from cancelling and avoids counting a shared line twice.
 */
export function buildCombinedScenarioMagnitudePoints({
  from,
  granularity,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  granularity: ScenarioAnalyticsGranularity;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioAnalyticsPoint[] {
  const totals = aggregateScenarioMagnitudesByBucket({
    deduplicateLines: true,
    from,
    granularity,
    rows,
    scenarios,
    sourceGranularity,
    to,
  });

  return listBucketStarts(from, to, granularity).map((bucket) => ({
    bucket: bucket.toISOString(),
    isSaturday: granularity === "day" && bucket.getDay() === 6,
    isSunday: granularity === "day" && bucket.getDay() === 0,
    label: formatBucketLabel(bucket, granularity),
    total: totals.get(bucketKey(bucket, granularity)) ?? 0,
  }));
}

/**
 * Projects absolute hourly buckets into the company's civil calendar and
 * explicitly merges repeated DST hours into one heatmap cell. The cell keeps
 * the sum of both real instants instead of letting ECharts overlap them.
 */
export function buildScenarioCivilHourMagnitudePoints({
  companyTimeZone,
  from,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  companyTimeZone: string;
  from: Date;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioCivilHourMagnitudePoint[] {
  const timeZone = requireCompanyTimeZone(companyTimeZone);
  const cells = new Map<
    string,
    ScenarioCivilHourMagnitudePoint & { month: number; year: number }
  >();

  buildCombinedScenarioMagnitudePoints({
    from,
    granularity: "hour",
    rows,
    scenarios,
    sourceGranularity,
    to,
  }).forEach((point) => {
    const bucket = new Date(point.bucket);
    const parts = companyZonedDateParts(bucket, timeZone);
    const key = JSON.stringify([
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
    ]);
    const current = cells.get(key);
    cells.set(key, {
      bucket:
        !current || bucket.getTime() < new Date(current.bucket).getTime()
          ? point.bucket
          : current.bucket,
      day: parts.day,
      hour: parts.hour,
      month: parts.month,
      total: (current?.total ?? 0) + point.total,
      year: parts.year,
    });
  });

  return Array.from(cells.values())
    .sort(
      (left, right) =>
        left.year - right.year ||
        left.month - right.month ||
        left.day - right.day ||
        left.hour - right.hour,
    )
    .map((point) => ({
      bucket: point.bucket,
      day: point.day,
      hour: point.hour,
      total: point.total,
    }));
}

/** Builds every scenario series in one row pass instead of rescanning the
 * complete aggregate payload once per scenario. */
export function buildIndividualScenarioSeries({
  from,
  granularity,
  includeOverlappingSourceBuckets = false,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  granularity: ScenarioAnalyticsGranularity;
  includeOverlappingSourceBuckets?: boolean;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioAnalyticsSeries[] {
  const contributions = buildLineScenarioContributions(scenarios);
  const totalsByScenario = new Map(
    scenarios.map((scenario) => [scenario.id, new Map<number, number>()]),
  );
  const fromTime = from.getTime();
  const toTime = to.getTime();

  rows.forEach((row) => {
    if (!row.line_count_id) return;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return;
    const bucketTime = bucket.getTime();
    if (includeOverlappingSourceBuckets) {
      const bucketEnd = endOfAggregateBucket(
        bucket,
        sourceGranularity,
      ).getTime();
      if (bucketTime >= toTime || bucketEnd <= fromTime) return;
    } else if (bucketTime < fromTime || bucketTime >= toTime) {
      return;
    }

    const key = bucketKey(bucket, granularity);
    const total = Number.isFinite(row.total) ? row.total : 0;
    (contributions.get(row.line_count_id) ?? []).forEach(
      ({ multiplier, scenarioId }) => {
        const scenarioTotals = totalsByScenario.get(scenarioId);
        if (!scenarioTotals) return;
        scenarioTotals.set(
          key,
          (scenarioTotals.get(key) ?? 0) + total * multiplier,
        );
      },
    );
  });

  const buckets = listBucketStarts(from, to, granularity).map((bucket) => ({
    bucket: bucket.toISOString(),
    isSaturday: granularity === "day" && bucket.getDay() === 6,
    isSunday: granularity === "day" && bucket.getDay() === 0,
    key: bucketKey(bucket, granularity),
    label: formatBucketLabel(bucket, granularity),
  }));
  return scenarios.map((scenario) => {
    const totals = totalsByScenario.get(scenario.id) ?? new Map();
    return {
      id: scenario.id,
      name: scenario.name,
      points: buckets.map(({ key, ...point }) => ({
        ...point,
        total: totals.get(key) ?? 0,
      })),
    };
  });
}

export function buildScenarioRanking({
  from,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioRankingPoint[] {
  const totals = aggregateIndividualScenarioTotals({
    from,
    rows,
    scenarios,
    sourceGranularity,
    to,
  });

  const ranked = scenarios
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      total: totals.get(scenario.id) ?? 0,
    }))
    .filter((point) => point.total > 0)
    .sort(
      (left, right) =>
        right.total - left.total || left.name.localeCompare(right.name, "pt-BR"),
    );
  const grandTotal = ranked.reduce((sum, point) => sum + point.total, 0);

  return ranked.map((point) => ({
    ...point,
    share: grandTotal ? point.total / grandTotal : 0,
  }));
}

export function buildScenarioCumulativeTotals({
  from,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioCumulativeTotalPoint[] {
  const totals = aggregateIndividualScenarioTotals({
    from,
    rows,
    scenarios,
    sourceGranularity,
    to,
  });
  const points = scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    total: Math.abs(totals.get(scenario.id) ?? 0),
  }));
  const grandTotal = points.reduce((sum, point) => sum + point.total, 0);

  return points.map((point) => ({
    ...point,
    share: grandTotal ? point.total / grandTotal : 0,
  }));
}

export function buildTopScenarioPeakDays({
  from,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}): ScenarioPeakDayPoint[] {
  const totals = aggregateScenarioMagnitudesByBucket({
    from,
    granularity: "day",
    rows,
    scenarios,
    sourceGranularity,
    to,
  });

  return listBucketStarts(from, to, "day")
    .map((bucket) => ({
      bucket: bucket.toISOString(),
      label: formatPeakDayLabel(bucket),
      total: totals.get(bucketKey(bucket, "day")) ?? 0,
    }))
    .filter((point) => point.total > 0)
    .sort(
      (left, right) =>
        right.total - left.total ||
        new Date(left.bucket).getTime() - new Date(right.bucket).getTime(),
    )
    .slice(0, 5)
    .map((point, index) => ({ ...point, rank: index + 1 }));
}

export function buildScenarioHourlyOccupancy({
  companyTimeZone,
  day,
  entryScenarios,
  exitScenarios,
  rows,
  sourceGranularity,
  startHour = 0,
  through,
}: {
  companyTimeZone?: string;
  day: Date;
  entryScenarios: Scenario[];
  exitScenarios: Scenario[];
  rows: AggregateEventRow[];
  sourceGranularity: AggregateGranularity;
  startHour?: number;
  through: Date;
}): ScenarioHourlyOccupancyPoint[] {
  const normalizedStartHour = normalizeOccupancyStartHour(startHour);
  if (companyTimeZone) {
    return buildCompanyTimeZoneHourlyOccupancy({
      companyTimeZone,
      day,
      entryScenarios,
      exitScenarios,
      normalizedStartHour,
      rows,
      sourceGranularity,
      through,
    });
  }
  const dayStart = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
  );
  const from = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    normalizedStartHour,
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const to = new Date(
    Math.min(dayEnd.getTime(), Math.max(from.getTime(), through.getTime())),
  );
  const entryTotals = aggregateScenarioMagnitudesByBucket({
    deduplicateLines: true,
    from,
    granularity: "hour",
    rows,
    scenarios: entryScenarios,
    sourceGranularity,
    to,
  });
  const exitTotals = aggregateScenarioMagnitudesByBucket({
    deduplicateLines: true,
    from,
    granularity: "hour",
    rows,
    scenarios: exitScenarios,
    sourceGranularity,
    to,
  });
  const entriesByHour = totalsByLocalHour(entryTotals, dayStart, dayEnd);
  const exitsByHour = totalsByLocalHour(exitTotals, dayStart, dayEnd);

  return buildHourlyOccupancySeries({
    day: dayStart,
    entriesByHour,
    exitsByHour,
    startHour: normalizedStartHour,
    through,
  });
}

function buildCompanyTimeZoneHourlyOccupancy({
  companyTimeZone,
  day,
  entryScenarios,
  exitScenarios,
  normalizedStartHour,
  rows,
  sourceGranularity,
  through,
}: {
  companyTimeZone: string;
  day: Date;
  entryScenarios: Scenario[];
  exitScenarios: Scenario[];
  normalizedStartHour: number;
  rows: AggregateEventRow[];
  sourceGranularity: AggregateGranularity;
  through: Date;
}) {
  const timeZone = requireCompanyTimeZone(companyTimeZone);
  const civilDate = {
    day: day.getDate(),
    month: day.getMonth() + 1,
    year: day.getFullYear(),
  };
  const nextCivilDateValue = new Date(
    Date.UTC(civilDate.year, civilDate.month - 1, civilDate.day + 1),
  );
  const dayStart = startOfCompanyTimeZoneCivilDay(civilDate, timeZone);
  const dayEnd = startOfCompanyTimeZoneCivilDay(
    {
      day: nextCivilDateValue.getUTCDate(),
      month: nextCivilDateValue.getUTCMonth() + 1,
      year: nextCivilDateValue.getUTCFullYear(),
    },
    timeZone,
  );
  const effectiveEnd = new Date(
    Math.min(
      dayEnd.getTime(),
      Math.max(dayStart.getTime(), through.getTime()),
    ),
  );
  const entriesByHour = totalsByCompanyTimeZoneHour(
    rows,
    entryScenarios,
    sourceGranularity,
    dayStart,
    effectiveEnd,
    timeZone,
  );
  const exitsByHour = totalsByCompanyTimeZoneHour(
    rows,
    exitScenarios,
    sourceGranularity,
    dayStart,
    effectiveEnd,
    timeZone,
  );
  const lastIncludedHour =
    effectiveEnd >= dayEnd
      ? 23
      : effectiveEnd <= dayStart
        ? -1
        : companyZonedDateParts(
            new Date(effectiveEnd.getTime() - 1),
            timeZone,
          ).hour;
  let cumulativeEntries = 0;
  let cumulativeExits = 0;

  return Array.from({ length: 24 }, (_, hour) => {
    const beforeStart = hour < normalizedStartHour;
    const included = !beforeStart && hour <= lastIncludedHour;
    if (included) {
      cumulativeEntries += entriesByHour[hour];
      cumulativeExits += exitsByHour[hour];
    }

    return {
      // This is a stable civil-hour identity. The chart uses the explicit
      // label below; actual API instants remain authoritative for grouping.
      bucket: new Date(
        Date.UTC(civilDate.year, civilDate.month - 1, civilDate.day, hour),
      ).toISOString(),
      entries: cumulativeEntries,
      exits: cumulativeExits,
      hour,
      label: `${String(hour).padStart(2, "0")}h`,
      occupancy: beforeStart
        ? 0
        : included
          ? cumulativeEntries - cumulativeExits
          : null,
    } satisfies ScenarioHourlyOccupancyPoint;
  });
}

function totalsByCompanyTimeZoneHour(
  rows: AggregateEventRow[],
  scenarios: Scenario[],
  sourceGranularity: AggregateGranularity,
  from: Date,
  to: Date,
  timeZone: string,
) {
  const lineIds = activeScenarioLineIds(scenarios);
  const values = Array.from({ length: 24 }, () => 0);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  rows.forEach((row) => {
    if (!row.line_count_id || !lineIds.has(row.line_count_id)) return;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return;
    const timestamp = bucket.getTime();
    if (timestamp < fromTime || timestamp >= toTime) return;

    const hour = companyZonedDateParts(bucket, timeZone).hour;
    values[hour] += Math.abs(Number.isFinite(row.total) ? row.total : 0);
  });

  return values;
}

function totalsByLocalHour(
  totals: Map<number, number>,
  dayStart: Date,
  dayEnd: Date,
) {
  const values = Array.from({ length: 24 }, () => 0);
  totals.forEach((total, timestamp) => {
    const bucket = new Date(timestamp);
    if (bucket < dayStart || bucket >= dayEnd) return;
    values[bucket.getHours()] += total;
  });
  return values;
}

export function sharedScenarioLineIds(
  firstGroup: Scenario[],
  secondGroup: Scenario[],
) {
  const firstLineIds = activeScenarioLineIds(firstGroup);
  const secondLineIds = activeScenarioLineIds(secondGroup);
  return Array.from(firstLineIds).filter((lineId) =>
    secondLineIds.has(lineId),
  );
}

export function formatOccupancyStartHour(startHour: number) {
  return `${String(normalizeOccupancyStartHour(startHour)).padStart(2, "0")}:00`;
}

export function sumSelectedScenarioRows({
  from,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}) {
  const multipliers = buildCombinedScenarioMultiplierMap(scenarios);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return rows.reduce((sum, row) => {
    if (!row.line_count_id) return sum;
    const multiplier = multipliers.get(row.line_count_id);
    if (multiplier === undefined) return sum;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return sum;
    const bucketTime = bucket.getTime();
    if (bucketTime < fromTime || bucketTime >= toTime) return sum;

    return sum + (row.total ?? 0) * multiplier;
  }, 0);
}

function aggregateSelectedRowsByBucket(
  rows: AggregateEventRow[],
  scenarios: Scenario[],
  granularity: ScenarioAnalyticsGranularity,
  sourceGranularity: AggregateGranularity,
  from: Date,
  to: Date,
  includeOverlappingSourceBuckets: boolean,
) {
  const multipliers = buildCombinedScenarioMultiplierMap(scenarios);
  const totals = new Map<number, number>();
  const fromTime = from.getTime();
  const toTime = to.getTime();

  rows.forEach((row) => {
    if (!row.line_count_id) return;
    const multiplier = multipliers.get(row.line_count_id);
    if (multiplier === undefined) return;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return;
    const bucketTime = bucket.getTime();
    if (includeOverlappingSourceBuckets) {
      const bucketEnd = endOfAggregateBucket(
        bucket,
        sourceGranularity,
      ).getTime();
      if (bucketTime >= toTime || bucketEnd <= fromTime) return;
    } else if (bucketTime < fromTime || bucketTime >= toTime) {
      return;
    }

    const key = bucketKey(bucket, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0) * multiplier);
  });

  return totals;
}

export function buildCombinedScenarioMultiplierMap(scenarios: Scenario[]) {
  const multipliers = new Map<string, number>();

  scenarios.forEach((scenario) => {
    scenario.lines?.forEach((line) => {
      if (!line.line_count_id || line.action_multiplier === 0) return;
      multipliers.set(
        line.line_count_id,
        (multipliers.get(line.line_count_id) ?? 0) +
          (line.action_multiplier ?? 1),
      );
    });
  });

  return multipliers;
}

function buildLineScenarioContributions(scenarios: Scenario[]) {
  const contributions = new Map<
    string,
    Array<{ multiplier: number; scenarioId: string }>
  >();

  scenarios.forEach((scenario) => {
    scenario.lines?.forEach((line) => {
      if (!line.line_count_id || line.action_multiplier === 0) return;
      const values = contributions.get(line.line_count_id) ?? [];
      values.push({
        multiplier: line.action_multiplier ?? 1,
        scenarioId: scenario.id,
      });
      contributions.set(line.line_count_id, values);
    });
  });

  return contributions;
}

function aggregateIndividualScenarioTotals({
  from,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}) {
  const totals = new Map(scenarios.map((scenario) => [scenario.id, 0]));
  const lineContributions = buildLineScenarioContributions(scenarios);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  rows.forEach((row) => {
    if (!row.line_count_id) return;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return;
    const bucketTime = bucket.getTime();
    if (bucketTime < fromTime || bucketTime >= toTime) return;

    const contributions = lineContributions.get(row.line_count_id) ?? [];
    contributions.forEach(({ multiplier, scenarioId }) => {
      totals.set(
        scenarioId,
        (totals.get(scenarioId) ?? 0) +
          (Number.isFinite(row.total) ? row.total : 0) * multiplier,
      );
    });
  });

  return totals;
}

function aggregateScenarioMagnitudesByBucket({
  deduplicateLines = false,
  from,
  granularity,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  deduplicateLines?: boolean;
  from: Date;
  granularity: ScenarioAnalyticsGranularity;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}) {
  if (deduplicateLines) {
    return aggregateUniqueLineMagnitudesByBucket({
      from,
      granularity,
      rows,
      scenarios,
      sourceGranularity,
      to,
    });
  }

  const contributions = buildLineScenarioContributions(scenarios);
  const scenarioTotalsByBucket = new Map<number, Map<string, number>>();
  const fromTime = from.getTime();
  const toTime = to.getTime();

  rows.forEach((row) => {
    if (!row.line_count_id) return;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return;
    const bucketTime = bucket.getTime();
    if (bucketTime < fromTime || bucketTime >= toTime) return;

    const bucketStartKey = bucketKey(bucket, granularity);
    const scenarioTotals =
      scenarioTotalsByBucket.get(bucketStartKey) ?? new Map<string, number>();
    const rowContributions = contributions.get(row.line_count_id) ?? [];
    rowContributions.forEach(({ multiplier, scenarioId }) => {
      scenarioTotals.set(
        scenarioId,
        (scenarioTotals.get(scenarioId) ?? 0) +
          (Number.isFinite(row.total) ? row.total : 0) * multiplier,
      );
    });
    scenarioTotalsByBucket.set(bucketStartKey, scenarioTotals);
  });

  return new Map(
    Array.from(scenarioTotalsByBucket, ([key, scenarioTotals]) => [
      key,
      Array.from(scenarioTotals.values()).reduce(
        (sum, value) => sum + Math.abs(value),
        0,
      ),
    ]),
  );
}

function aggregateUniqueLineMagnitudesByBucket({
  from,
  granularity,
  rows,
  scenarios,
  sourceGranularity,
  to,
}: {
  from: Date;
  granularity: ScenarioAnalyticsGranularity;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  sourceGranularity: AggregateGranularity;
  to: Date;
}) {
  const lineIds = activeScenarioLineIds(scenarios);
  const totals = new Map<number, number>();
  const fromTime = from.getTime();
  const toTime = to.getTime();

  rows.forEach((row) => {
    if (!row.line_count_id || !lineIds.has(row.line_count_id)) return;
    const bucket = parseAggregateBucket(row.bucket, sourceGranularity);
    if (!bucket) return;
    const bucketTime = bucket.getTime();
    if (bucketTime < fromTime || bucketTime >= toTime) return;

    const key = bucketKey(bucket, granularity);
    const magnitude = Math.abs(
      Number.isFinite(row.total) ? row.total : 0,
    );
    totals.set(key, (totals.get(key) ?? 0) + magnitude);
  });

  return totals;
}

function activeScenarioLineIds(scenarios: Scenario[]) {
  return new Set(
    scenarios.flatMap((scenario) =>
      scenario.lines.flatMap((line) =>
        line.line_count_id && line.action_multiplier !== 0
          ? [line.line_count_id]
          : [],
      ),
    ),
  );
}

function listBucketStarts(
  from: Date,
  to: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  const buckets: Date[] = [];
  let cursor = startOfBucket(from, granularity);

  while (cursor < to) {
    buckets.push(new Date(cursor));
    cursor = addBucket(cursor, granularity);
  }

  return buckets;
}

function bucketKey(date: Date, granularity: ScenarioAnalyticsGranularity) {
  return startOfBucket(date, granularity).getTime();
}

function startOfBucket(
  date: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  return startOfAggregateBucket(date, granularity);
}

function addBucket(
  date: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  return endOfAggregateBucket(date, granularity);
}

function formatBucketLabel(
  date: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  if (granularity === "minute") {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
    }).format(date);
  }
  if (granularity === "hour") {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      month: "2-digit",
    }).format(date);
  }
  if (granularity === "week") {
    return `Sem. ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date)}`;
  }
  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
    })
      .format(date)
      .replace(".", "");
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatPeakDayLabel(date: Date) {
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
  })
    .format(date)
    .replace(".", "");
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return `${weekday} ${dayMonth}`;
}
