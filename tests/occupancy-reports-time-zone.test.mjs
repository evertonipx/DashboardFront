import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const calendar = load("lib/occupancy-calendar.ts");
const zone = load("lib/company-time-zone.ts");
const windowApi = load("lib/occupancy-analysis-window.ts");
const resolution = load("lib/occupancy-analysis-resolution.ts");
const comparison = load("lib/occupancy-report-comparison.ts");
const hourAxis = load("lib/occupancy-hour-axis.ts");
const reports = loadReportFunctions();

test("Análises: o dia fechado usa instantes IANA e não depende do fuso do navegador", () => {
  inTimeZones(["UTC", "America/Sao_Paulo", "America/Los_Angeles", "Asia/Tokyo", "America/Havana", "Asia/Kathmandu"], () => {
    for (const [timeZone, date, from, to] of [
      ["America/Sao_Paulo", "2026-09-10", "2026-09-10T03:00:00.000Z", "2026-09-11T03:00:00.000Z"],
      ["America/New_York", "2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"],
      ["America/New_York", "2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
      ["Australia/Lord_Howe", "2026-10-04", "2026-10-03T13:30:00.000Z", "2026-10-04T13:00:00.000Z"],
      ["America/Havana", "2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"],
      ["Asia/Kathmandu", "2026-09-11", "2026-09-10T18:15:00.000Z", "2026-09-11T18:15:00.000Z"],
    ]) {
      const range = windowApi.resolveOccupancyAnalysisRange(new Date("2026-12-01T12:00:00Z"), date, date, true, "2026-12-01", timeZone);
      assert.equal(range.instantFrom.toISOString(), from);
      assert.equal(range.instantTo.toISOString(), to);
      assert.equal(range.reference.getTime(), Date.parse(to) - 1);
      assert.equal(calendar.occupancyCalendarDateKey(range.from), date);
      const definitions = reports.buildOccupancyReportDefinitions(range.reference, null, true, range, timeZone);
      const hourly = definitions.find((item) => item.granularity === "hour");
      assert.equal(hourly.from.toISOString(), from);
      assert.equal(hourly.to.toISOString(), to);
      assert.equal(hourly.openBucket, undefined, "dia fechado não pode ganhar bucket aberto por parâmetro default");
      const minute = definitions.find((item) => item.granularity === "minute");
      assert.equal(minute.to.toISOString(), to);
      assert.equal(minute.to - minute.from, 60 * 60_000);
      assert.equal(minute.openBucket, undefined);
      assert.equal(reports.listBucketStarts(hourly).length,
        timeZone === "Australia/Lord_Howe" ? 24 : (Date.parse(to) - Date.parse(from)) / 3_600_000);
      assert.equal(reports.buildEmptyPoints(hourly).length, 24);
    }
  });
});

test("calendário diário continua após meia-noite inexistente, sem propagar 01h", () => {
  inTimeZones(["America/Havana", "America/Sao_Paulo", "UTC"], () => {
    for (const [start, end, days] of [["2026-03-07", "2026-03-10", 4], ["2018-11-03", "2018-11-06", 4]]) {
      const range = windowApi.resolveOccupancyAnalysisRange(new Date("2026-12-01T12:00:00Z"), start, end, true, "2026-12-01", "America/Sao_Paulo");
      const plan = resolution.buildOccupancyAnalysisResolutionPlan(range.from, range.to, days);
      assert.equal(plan.pointCount, days);
      const dates = plan.segments.flatMap((segment) => segment.bucketStarts).map(calendar.occupancyCalendarDateKey);
      assert.equal(dates[0], start);
      assert.equal(dates.at(-1), end);
      assert.equal(new Set(dates).size, days);
      assert.equal(plan.segments.at(-1).to.getTime(), range.to.getTime());
    }
  });
});

test("Relatórios: intervalos de calendário e hora atual seguem a empresa em outro dia do navegador", () => {
  inTimeZones(["UTC", "America/Sao_Paulo", "Asia/Tokyo"], () => {
    const now = new Date("2026-09-11T01:30:00Z");
    const definitions = reports.buildOccupancyReportDefinitions(now, now, false, undefined, "America/Sao_Paulo");
    const hourly = definitions.find((item) => item.granularity === "hour");
    assert.equal(hourly.from.toISOString(), "2026-09-10T03:00:00.000Z");
    assert.equal(hourly.to.toISOString(), "2026-09-11T02:00:00.000Z");
    assert.equal(hourly.openBucket.toISOString(), "2026-09-11T01:00:00.000Z");
    const daily = definitions.find((item) => item.granularity === "day");
    assert.equal(calendar.occupancyCalendarDateKey(daily.from), "2026-09-04");
    assert.equal(calendar.occupancyCalendarDateKey(daily.to), "2026-09-11");
    assert.equal(calendar.occupancyCalendarDateKey(daily.openBucket), "2026-09-10");
    assert.equal(reports.listBucketStarts(daily).length, 7);
    const month = definitions.find((item) => item.granularity === "month");
    assert.equal(calendar.occupancyCalendarDateKey(month.from), "2025-10-01");
    assert.equal(calendar.occupancyCalendarDateKey(month.to), "2026-10-01");
  });
});

test("comparativo minuto no retorno DST nunca inverte intervalo nem duplica consultas", () => {
  inTimeZones(["UTC", "America/New_York", "Asia/Tokyo"], () => {
    const definition = {
      id: "occupancy_report_minute", granularity: "minute", timeZone: "America/New_York",
      from: new Date("2026-11-01T05:31:00Z"), to: new Date("2026-11-01T06:31:00Z"),
    };
    const previous = reports.buildComparisonDefinition(definition, "previous_day");
    const buckets = reports.listBucketStarts(previous);
    assert.equal(buckets.length, 60);
    assert.equal(previous.from.toISOString(), "2026-10-31T05:00:00.000Z");
    assert.equal(previous.to.toISOString(), "2026-10-31T06:00:00.000Z");
    assert.ok(buckets.every((bucket, index) => index === 0 || bucket > buckets[index - 1]));
    const currentPoints = reports.buildEmptyPoints(definition);
    const previousPoints = reports.buildEmptyPoints(previous).map((point, index) => ({ ...point, average: index + 1 }));
    const data = { [definition.id]: { points: currentPoints }, [previous.id]: { points: previousPoints } };
    reports.alignMinuteComparisonPoints(data, [definition]);
    assert.equal(data[previous.id].points.length, 60);
    for (let index = 0; index < currentPoints.length; index += 1) {
      assert.equal(data[previous.id].points[index].label, currentPoints[index].label);
      assert.equal(data[previous.id].points[index].average, Number(currentPoints[index].label.split(":")[1]) + 1);
    }
  });
});

test("comparativo horário usa as 23/25 ocorrências reais do dia anterior, sem herdar navegador", () => {
  inTimeZones(["UTC", "America/Sao_Paulo", "Asia/Kathmandu"], () => {
    for (const [day, expected] of [["2026-03-09", 23], ["2026-11-02", 25]]) {
      const from = zone.startOfCompanyTimeZoneCivilDay({ year: 2026, month: Number(day.slice(5, 7)), day: Number(day.slice(8)) }, "America/New_York");
      const to = calendar.shiftOccupancyCompanyDay(from, 1, "America/New_York");
      const source = zone.listCompanyTimeZoneHourBuckets(from, to, "America/New_York");
      const previous = comparison.occupancyComparisonBucketStarts({ bucketStarts: source, granularity: "hour", intradayComparison: "previous_day", timeZone: "America/New_York" });
      assert.equal(previous.length, expected);
      assert.equal(new Set(previous.map(Number)).size, expected);
    }
  });
});

test("minutos ausentes e janelas descontínuas DST não consultam horários extras", () => {
  inTimeZones(["UTC", "Asia/Kathmandu"], () => {
    const definition = {
      id: "occupancy_report_minute", granularity: "minute", timeZone: "America/New_York",
      from: new Date("2026-03-08T06:31:00Z"), to: new Date("2026-03-08T07:31:00Z"),
    };
    const previous = reports.buildComparisonDefinition(definition, "previous_day");
    assert.equal(previous.querySegments.length, 2);
    assert.equal(reports.listBucketStarts(previous).length, 60);
    assert.ok(reports.listBucketStarts(previous).every((bucket) => zone.companyZonedDateParts(bucket, "America/New_York").hour !== 2));
    const missing = reports.buildComparisonDefinition({ ...definition,
      from: new Date("2026-03-09T06:00:00Z"), to: new Date("2026-03-09T07:00:00Z"),
    }, "previous_day");
    assert.deepEqual(missing.querySegments, []);
    assert.deepEqual(reports.listBucketStarts(missing), []);
    assert.equal(missing.from.getTime(), missing.to.getTime());
  });
});

test("eixo fixo e mascaramento identificam a hora da empresa; dados permanecem íntegros", () => {
  inTimeZones(["UTC", "Asia/Tokyo"], () => {
    const day = new Date("2026-09-10T03:00:00Z");
    const point = { bucket: "2026-09-10T15:00:00Z", label: "", average: 4, minimum: 1, peak: 7, current: 3 };
    const original = JSON.stringify(point);
    const fixed = hourAxis.buildFixedOccupancyHourlyPoints(day, [point], "America/Sao_Paulo");
    assert.equal(fixed[12].average, 4);
    assert.equal(fixed[15].average, null);
    assert.equal(JSON.stringify(point), original);
    const now = new Date("2026-09-10T15:30:00Z");
    const definition = reports.buildOccupancyReportDefinitions(now, now, false, undefined, "America/Sao_Paulo").find((item) => item.granularity === "hour");
    const data = { occupancy_report_hour__previous: { points: fixed.map((item) => ({ ...item, average: 5 })) } };
    reports.maskOpenBucketComparisons(data, [definition], now);
    assert.equal(data.occupancy_report_hour__previous.points[12].average, null);
    assert.equal(data.occupancy_report_hour__previous.points[15].average, 5);
  });
});

test("IA mantém a data civil das linhas diárias sem converter floating como instante", () => {
  inTimeZones(["UTC", "America/Los_Angeles", "Asia/Tokyo"], () => {
    const range = windowApi.resolveOccupancyAnalysisRange(new Date("2026-09-11T12:00:00Z"), "2026-09-09", "2026-09-10", true, "2026-09-11", "America/Sao_Paulo");
    const definition = reports.buildOccupancyReportDefinitions(range.reference, null, true, range, "America/Sao_Paulo").find((item) => item.id === "occupancy_report_day");
    const buckets = reports.listBucketStarts(definition);
    const table = reports.buildOccupancyAiDailyTable({ bucketStarts: buckets, companyTimeZone: "America/Sao_Paulo", points: reports.buildEmptyPoints(definition) });
    assert.deepEqual(table.rows.map((row) => row.date), ["2026-09-09", "2026-09-10"]);
  });
});

test("métricas Swagger completas não dependem de final; lacunas continuam indisponíveis", () => {
  inTimeZones(["UTC", "America/Sao_Paulo", "Asia/Kathmandu"], () => {
    const definition = {
      id: "occupancy_report_hour", granularity: "hour", timeZone: "America/Sao_Paulo",
      from: new Date("2026-09-10T13:00:00Z"), to: new Date("2026-09-10T14:00:00Z"),
    };
    const rows = [{ bucket: "2026-09-10T13:00:00Z", scenario_total_avg: 8, scenario_total_min: 1, scenario_total_max: 12 }];
    const state = reports.buildScenarioPoints(definition, rows, "A fonte não informa certificação adicional.");
    assert.equal(state.incomplete, false);
    assert.equal(state.points[0].current, null);
    assert.deepEqual(reports.summarizeOccupancyRangeMetrics(state.points), { average: 8, minimum: 1, peak: 12, current: null });
    const cache = new Map();
    reports.cacheCertifiedClosedSegment(cache, "valid", { ...definition, bucketStarts: [definition.from] }, state);
    assert.equal(cache.get("valid"), state, "ausência de final não causa consultas idênticas repetidas");
    const missing = reports.buildScenarioPoints(definition, []);
    assert.equal(missing.incomplete, true);
    reports.cacheCertifiedClosedSegment(cache, "missing", { ...definition, bucketStarts: [definition.from] }, missing);
    assert.equal(cache.has("missing"), false);
    assert.equal(reports.summarizeOccupancyRangeMetrics([...state.points, ...missing.points]).average, null);
  });
  const source = readFileSync(resolve(root, "components/app/occupancy-reports-dashboard.tsx"), "utf8");
  assert.doesNotMatch(source, /reportDataCompleteUntil === null/);
  assert.match(source, /hasPartialOccupancyCoverage \|\| !reportRequested/);
  assert.match(source, /dailyState\.error \|\| dailyState\.incomplete/);
});

function inTimeZones(zones, run) {
  const previous = process.env.TZ;
  try { for (const timeZone of zones) { process.env.TZ = timeZone; run(); } }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
}

function load(relative) {
  if (relative === "lib/master-company-scope.ts") return {};
  if (relative === "lib/user-grid-local.ts") return {};
  const file = resolve(root, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const loaded = { exports: {} };
  modules.set(file, loaded);
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
  new Function("exports", "require", "module", output)(loaded.exports, (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : createRequire(file)(name), loaded);
  return loaded.exports;
}

function loadReportFunctions() {
  const file = resolve(root, "components/app/occupancy-reports-dashboard.tsx");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = source.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(source)).join("\n");
  const bindings = {
    ...load("lib/aggregate-time.ts"), ...calendar, ...zone, ...windowApi, ...resolution,
    ...comparison, ...hourAxis, ...load("lib/occupancy-metrics.ts"), ...load("lib/utils.ts"),
    ...load("lib/occupancy-aggregate-validation.ts"),
    MINUTE_MS: 60_000, HOUR_MS: 3_600_000, DAY_MS: 86_400_000,
    AI_INSIGHTS_LIMITS: { dailyDatasetRows: 5000 }, AI_OCCUPANCY_DAILY_CHUNK_DAYS: 62,
    MAX_CLOSED_SEGMENT_CACHE_ENTRIES: 256,
  };
  const output = ts.transpileModule(declarations, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }, fileName: file }).outputText;
  return new Function("exports", ...Object.keys(bindings), `${output};return {buildOccupancyReportDefinitions,listBucketStarts,buildEmptyPoints,buildComparisonDefinition,alignMinuteComparisonPoints,maskOpenBucketComparisons,buildOccupancyAiDailyTable,buildScenarioPoints,summarizeOccupancyRangeMetrics,cacheCertifiedClosedSegment};`)({}, ...Object.values(bindings));
}
