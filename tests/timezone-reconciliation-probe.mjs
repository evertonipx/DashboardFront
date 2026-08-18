import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const reconciliation = loadTypeScriptModule(
  "lib/aggregate-reconciliation.ts",
);
const aggregateTime = loadTypeScriptModule("lib/aggregate-time.ts");
const scenarioAnalytics = loadTypeScriptModule("lib/scenario-analytics.ts");
const hourlyAxis = loadTypeScriptModule("lib/hourly-axis.ts");
const periodAnalysisModel = loadTypeScriptModule(
  "lib/period-analysis-model.ts",
);
const probe = process.argv[2];

if (probe === "company-four-hour-offset") {
  const occupancy = scenarioAnalytics.buildScenarioHourlyOccupancy({
    companyTimeZone: "America/Manaus",
    day: new Date(2026, 7, 3),
    entryScenarios: [countingScenario()],
    exitScenarios: [],
    rows: [
      aggregateRow("2026-08-03T13:00:00Z", 100),
      aggregateRow("2026-08-03T14:00:00Z", 5),
      aggregateRow("2026-08-03T15:00:00Z", 7),
    ],
    sourceGranularity: "hour",
    startHour: 10,
    through: new Date("2026-08-04T04:00:00Z"),
  });

  assert.deepEqual(
    occupancy.slice(9, 12).map(({ entries, hour, occupancy: value }) => ({
      entries,
      hour,
      occupancy: value,
    })),
    [
      { entries: 0, hour: 9, occupancy: 0 },
      { entries: 5, hour: 10, occupancy: 5 },
      { entries: 12, hour: 11, occupancy: 12 },
    ],
  );
  assert.equal(
    occupancy.findIndex((point) => point.entries > 0),
    10,
    "10h da empresa não pode ser deslocado para 14h do runtime UTC",
  );
} else if (probe === "fallback") {
  const rows = reconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-11-01T05:00:00Z", 2),
      aggregateRow("2026-11-01T06:00:00Z", 3),
    ],
    "hour",
    "hour",
    new Date("2026-11-01T00:00:00Z"),
    new Date("2026-11-02T00:00:00Z"),
  );

  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.bucket)).size, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 5);

  const points = scenarioAnalytics.buildCombinedScenarioPoints({
    from: new Date("2026-11-01T05:00:00Z"),
    granularity: "hour",
    rows: [
      aggregateRow("2026-11-01T05:00:00Z", 2),
      aggregateRow("2026-11-01T06:00:00Z", 3),
    ],
    scenarios: [countingScenario()],
    sourceGranularity: "hour",
    to: new Date("2026-11-01T07:00:00Z"),
  });
  assert.equal(points.length, 2);
  assert.equal(new Set(points.map((point) => point.bucket)).size, 2);
  assert.deepEqual(points.map((point) => point.total), [2, 3]);

  const occupancy = scenarioAnalytics.buildScenarioHourlyOccupancy({
    companyTimeZone: "America/New_York",
    day: new Date("2026-11-01T05:00:00Z"),
    entryScenarios: [countingScenario()],
    exitScenarios: [],
    rows: [
      aggregateRow("2026-11-01T05:00:00Z", 2),
      aggregateRow("2026-11-01T06:00:00Z", 3),
    ],
    sourceGranularity: "hour",
    through: new Date("2026-11-01T07:00:00Z"),
  });
  assert.equal(occupancy[1].entries, 5);
  assert.equal(occupancy[1].occupancy, 5);
  assert.equal(
    hourlyAxis.buildFixedHourlyAxisValues(
      [
        { bucket: "2026-11-01T05:00:00Z", total: 2 },
        { bucket: "2026-11-01T06:00:00Z", total: 3 },
      ],
      1,
    )[1],
    5,
  );
} else if (probe === "half-hour-forward") {
  const rows = reconciliation.rollupAggregateRows(
    [aggregateRow("2026-10-03T15:45:00Z", 7)],
    "minute",
    "hour",
    new Date("2026-10-03T15:30:00Z"),
    new Date("2026-10-03T16:00:00Z"),
  );

  assert.equal(rows.length, 1);
  const bucket = new Date(rows[0].bucket);
  assert.equal(bucket.getFullYear(), 2026);
  assert.equal(bucket.getMonth(), 9);
  assert.equal(bucket.getDate(), 4);
  assert.equal(bucket.getHours(), 2);
  assert.equal(bucket.getMinutes(), 30);
  assert.equal(rows[0].total, 7);
  assert.equal(aggregateTime.isAggregateBucketAligned(bucket, "hour"), true);
  assert.equal(
    aggregateTime.endOfAggregateBucket(bucket, "hour").toISOString(),
    "2026-10-03T16:00:00.000Z",
  );

  const reconciled = reconciliation.reconcileAggregateRows(
    [aggregateRow(rows[0].bucket, 100)],
    "hour",
    [aggregateRow("2026-10-03T16:00:00Z", 5)],
    "hour",
    new Date("2026-10-03T16:00:00Z"),
    new Date("2026-10-03T17:00:00Z"),
  );
  assert.deepEqual(
    reconciled
      .map((row) => [row.bucket, row.total])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ["2026-10-03T15:30:00.000Z", 100],
      ["2026-10-03T16:00:00.000Z", 5],
    ],
  );

  const points = scenarioAnalytics.buildCombinedScenarioPoints({
    from: new Date("2026-10-03T15:30:00Z"),
    granularity: "hour",
    rows: [
      aggregateRow("2026-10-03T15:45:00Z", 7),
      aggregateRow("2026-10-03T16:00:00Z", 5),
    ],
    scenarios: [countingScenario()],
    sourceGranularity: "minute",
    to: new Date("2026-10-03T17:00:00Z"),
  });
  assert.equal(points.length, 2);
  assert.deepEqual(points.map((point) => point.total), [7, 5]);
} else if (probe === "midnight-forward") {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2018-11-04",
    "2018-11-04",
  );
  assert.ok(period);
  assert.equal(period.from.getFullYear(), 2018);
  assert.equal(period.from.getMonth(), 10);
  assert.equal(period.from.getDate(), 4);
  assert.equal(period.from.getHours(), 1);
  assert.equal(period.to.getFullYear(), 2018);
  assert.equal(period.to.getMonth(), 10);
  assert.equal(period.to.getDate(), 5);
  assert.equal(period.to.getHours(), 0);
  assert.equal(
    aggregateTime.endOfAggregateBucket(period.from, "day").getTime(),
    period.to.getTime(),
  );

  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2010, 1, 14),
      to: new Date(2010, 1, 15),
    },
    "last_year",
  );
  assert.equal(baseline.from.getTime(), new Date(2009, 1, 14).getTime());
  assert.equal(baseline.to.getTime(), new Date(2009, 1, 15).getTime());
} else {
  throw new Error(`Probe desconhecido: ${probe ?? "ausente"}`);
}

function countingScenario() {
  return {
    active: true,
    company_id: "company",
    id: "scenario",
    lines: [{ action_multiplier: 1, line_count_id: "line-entry" }],
    name: "Contagem",
  };
}

function aggregateRow(bucket, total) {
  return {
    bucket,
    camera_id: "camera",
    line_count_id: "line-entry",
    metric_type: "count",
    total,
  };
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return nodeRequire(specifier);
    return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
