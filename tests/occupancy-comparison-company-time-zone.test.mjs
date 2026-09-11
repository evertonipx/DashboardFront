import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript"), modules = new Map();
const comparison = load("lib/occupancy-comparison.ts");
const widgets = load("components/app/occupancy-comparison-widgets.tsx");
const utils = load("lib/utils.ts");
const duration = load("lib/occupancy-duration.ts");
const timeZone = "America/Sao_Paulo";
const instant = new Date("2026-01-01T01:15:37Z");

test("horas e dias da empresa não dependem do fuso do navegador, incluindo offset fracionário", () => {
  withBrowserZone("Asia/Kolkata", () => {
    for (const [zone, from, to, count] of [
      [timeZone, "2025-12-31T03:00:00.000Z", "2026-01-01T02:00:00.000Z", 23],
      ["UTC", "2026-01-01T00:00:00.000Z", "2026-01-01T02:00:00.000Z", 2],
      ["Asia/Kolkata", "2025-12-31T18:30:00.000Z", "2026-01-01T01:30:00.000Z", 7],
    ]) {
      const range = comparison.buildOccupancyHourlyRange(instant, 1, zone);
      assert.equal(range.from.toISOString(), from); assert.equal(range.to.toISOString(), to);
      assert.equal(range.buckets.length, count);
      const open = comparison.buildOccupancyCurrentHourRange(instant, zone);
      const minutes = comparison.buildOccupancyClosedMinuteRange(instant, zone);
      assert.equal(open.from.getTime(), range.buckets.at(-1).getTime());
      assert.equal(minutes.from.getTime(), open.from.getTime());
      assert.equal(minutes.to.toISOString(), "2026-01-01T01:15:00.000Z");
    }
  });
});

test("hora repetida no DST mantém ambas as ocorrências e exige cobertura das duas", () => {
  withBrowserZone("UTC", () => {
    const zone = "America/New_York";
    const range = comparison.buildOccupancyHourlyRange(new Date("2026-11-01T07:15:00Z"), 1, zone);
    assert.deepEqual(comparison.occupancyMaximumTrendBucketLabels(range.buckets, "hour", zone), ["00h", "01h (UTC-04)", "01h (UTC-05)", "02h"]);
    const metrics = new Map(range.buckets.map((bucket, index) => [bucket.getTime(), { average: index + 1, peak: index + 1, minimum: index + 1 }]));
    assert.equal(comparison.buildOccupancyFixedHourlyPeakValues({ buckets: range.buckets, metrics, timeZone: zone })[1], 3);
    metrics.delete(range.buckets[2].getTime());
    assert.equal(comparison.buildOccupancyFixedHourlyPeakValues({ buckets: range.buckets, metrics, timeZone: zone })[1], null);
  });
});

test("mês e ano permanecem calendários civis e o pico aberto usa o ano da empresa", () => {
  withBrowserZone("UTC", () => {
    const ranges = comparison.buildOccupancyMaximumTrendRanges(instant, timeZone);
    assert.equal(ranges.monthly.buckets.at(-1).getFullYear(), 2025);
    assert.equal(ranges.monthly.buckets.at(-1).getMonth(), 11);
    assert.deepEqual(comparison.occupancyMaximumTrendBucketLabels(ranges.annual.buckets, "year", timeZone), ["2022", "2023", "2024", "2025"]);
    const points = comparison.buildOccupancyAnnualMaximumPoints({ annualBuckets: ranges.annual.buckets, monthlyBuckets: ranges.monthlySource.buckets, metrics: new Map(), liveBucket: instant, livePeak: 7, timeZone });
    assert.deepEqual(points.at(-1), { partial: true, value: 7 });
    assert.ok(points.slice(0, -1).every((point) => point.value === null));
  });
});

test("mapas de calor e índices de máximos usam a mesma data/hora da empresa", () => {
  withBrowserZone("UTC", () => {
    const bucket = new Date("2026-01-01T01:00:00Z");
    const scenario = { scenarioId: "a", name: "Entrada", metrics: new Map([[bucket.getTime(), { average: 3, peak: 3, minimum: 3 }]]) };
    const days = comparison.buildDaysHoursOccupancyCells({ buckets: [bucket], metric: "peak", scenario, timeZone });
    assert.deepEqual(days.dayKeys, ["2025-12-31"]); assert.equal(days.cells[0].y, 22);
    const scenarios = comparison.buildScenariosHoursOccupancyCells({ buckets: [bucket], dateKey: "2025-12-31", metric: "peak", series: [scenario], timeZone });
    assert.equal(scenarios.cells[0].y, 22); assert.equal(scenarios.cells[0].value, 3);
    const series = widgets.buildMaximumLineSeries({ buckets: [bucket], currentBucket: bucket, currentSnapshots: [{ scenarioId: "a", name: "Entrada", total: 7, asOf: instant.toISOString() }], currentSeries: [], granularity: "hour", monthlySourceBuckets: [], scenarios: [{ id: "a", name: "Entrada" }], series: [scenario], timeZone });
    assert.deepEqual(series[0].partialIndexes, [22]); assert.equal(series[0].values[22], 7);
    assert.equal(series[0].values[1], null);
  });
});

test("exportação preserva data, hora e instante local do widget, não do navegador", () => {
  withBrowserZone("UTC", () => {
    const bucket = new Date("2026-01-01T01:00:00Z");
    const scenario = { id: "a", name: "Entrada" };
    const series = [{ scenarioId: "a", name: "Entrada", metrics: new Map([[bucket.getTime(), { average: 3, peak: 3, minimum: 3 }]]) }];
    const reports = widgets.buildOccupancyComparisonReportAssets({ aggregateBuckets: [bucket], aggregateSeries: series, currentHourBucket: bucket, currentHourSeries: [], heatmapScenarioId: "a", hexSnapshots: [], hourlyMaximumBuckets: [bucket], hourlyMaximumSeries: series, maximumTrendRanges: null, maximumTrendSeries: [], scenarioHourHeatmapDateKey: "2025-12-31", scenarios: [scenario], selectedScenarioIds: ["a"], settings: load("lib/occupancy-widget-settings.ts").DEFAULT_OCCUPANCY_WIDGET_SETTINGS, snapshots: [{ scenarioId: "a", name: "Entrada", total: 3, asOf: instant.toISOString() }], timeZone });
    const byId = new Map(reports.map((report) => [report.cardId, report.chart]));
    const heat = byId.get("occupancy_day_hour_heatmap");
    assert.equal(heat.table.rows[0].date, "2025-12-31"); assert.equal(heat.table.rows[0].hour, "22h");
    assert.equal(byId.get("occupancy_scenario_half_donut").table.rows[0].asOf, utils.formatDateTime(instant, timeZone));
    assert.equal(byId.get("occupancy_scenario_bar_race").table.rows[0].asOf, utils.formatDateTime(instant, timeZone));
  });
});

test("permanência usa somente minutos fechados do mesmo dia civil da empresa", () => {
  withBrowserZone("UTC", () => {
    const range = duration.buildOccupancyClosedDayMinuteRange(instant, timeZone);
    assert.equal(range.from.toISOString(), "2025-12-31T03:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-01-01T01:15:00.000Z");
    assert.equal(range.buckets.length, 22 * 60 + 15);
  });
});

test("callbacks passam explicitamente o fuso aos intervalos, exportação e redutores", () => {
  const source = readFileSync(resolve("components/app/occupancy-comparison-widgets.tsx"), "utf8");
  assert.doesNotMatch(source, /requireRuntimeCompanyTimeZone/);
  assert.match(source, /buildOccupancyHourlyRange\(\s*requestedAt,\s*hourlyAggregateDayCount,\s*timeZone/);
  assert.match(source, /buildOccupancyMaximumTrendRanges\(requestedAt, timeZone\)/);
  assert.match(source, /buildOccupancyComparisonReportAssets\(\{\s*timeZone,/);
  assert.match(source, /fetchOccupancyCivilAggregate\(\{[\s\S]*?granularity: "month"[\s\S]*?fetchResponse: \(path\) => scheduleQuery/);
  assert.match(source, /const nextMonthlyBoundary = occupancyCalendarBoundaryInstant\(ranges.monthlySource.to, timeZone\)/);
  assert.doesNotMatch(source, /scheduleNext\(ranges.monthlySource.to\)/);
  assert.equal((source.match(/allowDocumentedAggregateResponse: true/g) ?? []).length, 8);
  assert.equal((source.match(/expectedTimezone: timeZone/g) ?? []).length, 8);
  assert.match(source, /formatDateTime\(requestedAt, timeZone\)/);
});

function withBrowserZone(zone, callback) {
  const previous = process.env.TZ; process.env.TZ = zone;
  try { callback(); } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
}
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  let source = readFileSync(resolve(path), "utf8");
  if (path.endsWith("occupancy-comparison-widgets.tsx")) source += "\nexport { buildMaximumLineSeries, buildOccupancyComparisonReportAssets };";
  const loaded = { exports: {} }; modules.set(path, loaded);
  const output = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("module", "exports", "require", output)(loaded, loaded.exports, (name) => {
    if (!name.startsWith("@/")) return require(name);
    if (name === "@/lib/api") return { apiFetch: () => { throw new Error("Unexpected request"); } };
    if (name.startsWith("@/components/") && name !== "@/components/app/occupancy-chart-palette") return {};
    const base = name.slice(2); return load(existsSync(resolve(`${base}.ts`)) ? `${base}.ts` : `${base}.tsx`);
  });
  return loaded.exports;
}
