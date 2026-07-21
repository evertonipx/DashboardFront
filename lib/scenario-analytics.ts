import type {
  AggregateEventRow,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import { parseAggregateBucket } from "@/lib/aggregate-time";

export type ScenarioSelectionMode = "all" | "custom";
export type ScenarioAnalyticsGranularity = "hour" | "day";

export type ScenarioAnalyticsPoint = {
  bucket: string;
  label: string;
  total: number;
  isSaturday: boolean;
  isSunday: boolean;
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

export type ScenarioHourlyOccupancyPoint = {
  bucket: string;
  entries: number;
  exits: number;
  hour: number;
  label: string;
  occupancy: number | null;
};

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
  const totals = aggregateSelectedRowsByBucket(
    rows,
    scenarios,
    granularity,
    sourceGranularity,
    from,
    to,
  );

  return listBucketStarts(from, to, granularity).map((bucket) => ({
    bucket: bucket.toISOString(),
    isSaturday: granularity === "day" && bucket.getDay() === 6,
    isSunday: granularity === "day" && bucket.getDay() === 0,
    label: formatBucketLabel(bucket, granularity),
    total: totals.get(bucketKey(bucket, granularity)) ?? 0,
  }));
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
  day,
  entryScenarios,
  exitScenarios,
  rows,
  sourceGranularity,
  startHour = 0,
  through,
}: {
  day: Date;
  entryScenarios: Scenario[];
  exitScenarios: Scenario[];
  rows: AggregateEventRow[];
  sourceGranularity: AggregateGranularity;
  startHour?: number;
  through: Date;
}): ScenarioHourlyOccupancyPoint[] {
  const normalizedStartHour = normalizeStartHour(startHour);
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
    from,
    granularity: "hour",
    rows,
    scenarios: entryScenarios,
    sourceGranularity,
    to,
  });
  const exitTotals = aggregateScenarioMagnitudesByBucket({
    from,
    granularity: "hour",
    rows,
    scenarios: exitScenarios,
    sourceGranularity,
    to,
  });
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
    const included = !beforeStart && bucket < to;

    if (included) {
      cumulativeEntries += entryTotals.get(bucketKey(bucket, "hour")) ?? 0;
      cumulativeExits += exitTotals.get(bucketKey(bucket, "hour")) ?? 0;
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

export function formatOccupancyStartHour(startHour: number) {
  return `${String(normalizeStartHour(startHour)).padStart(2, "0")}:00`;
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
  const multipliers = buildCombinedMultiplierMap(scenarios);
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
) {
  const multipliers = buildCombinedMultiplierMap(scenarios);
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
    if (bucketTime < fromTime || bucketTime >= toTime) return;

    const key = bucketKey(bucket, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0) * multiplier);
  });

  return totals;
}

function buildCombinedMultiplierMap(scenarios: Scenario[]) {
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

function listBucketStarts(
  from: Date,
  to: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  const buckets: Date[] = [];
  let cursor = startOfBucket(from, granularity);
  let guard = 0;

  while (cursor < to && guard < 20_000) {
    buckets.push(new Date(cursor));
    cursor = addBucket(cursor, granularity);
    guard += 1;
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
  return granularity === "hour"
    ? new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
      )
    : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addBucket(
  date: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  const next = new Date(date);
  if (granularity === "hour") next.setHours(next.getHours() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

function formatBucketLabel(
  date: Date,
  granularity: ScenarioAnalyticsGranularity,
) {
  if (granularity === "hour") {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      month: "2-digit",
    }).format(date);
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

function normalizeStartHour(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 0;
}
