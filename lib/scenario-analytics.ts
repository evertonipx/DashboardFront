import type {
  AggregateEventRow,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";

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
        (totals.get(scenarioId) ?? 0) + (row.total ?? 0) * multiplier,
      );
    });
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

export function parseAggregateBucket(
  value: string,
  sourceGranularity: AggregateGranularity,
) {
  if (
    sourceGranularity === "day" ||
    sourceGranularity === "week" ||
    sourceGranularity === "month" ||
    sourceGranularity === "semester" ||
    sourceGranularity === "year"
  ) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
