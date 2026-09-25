// Dynamic fixtures intentionally cross injected-module and malformed-input boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
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
    ] as const) {
      const range = windowApi.resolveOccupancyAnalysisRange(new Date("2026-12-01T12:00:00Z"), date, date, true, "2026-12-01", timeZone);
      assert.equal(range.instantFrom.toISOString(), from);
      assert.equal(range.instantTo.toISOString(), to);
      assert.equal(range.reference.getTime(), Date.parse(to) - 1);
      assert.equal(calendar.occupancyCalendarDateKey(range.from), date);
      const definitions = reports.buildOccupancyReportDefinitions(range.reference, null, true, range, timeZone);
      const hourly = definitions.find((item: RuntimeFixture) => item.granularity === "hour");
      assert.equal(hourly.from.toISOString(), from);
      assert.equal(hourly.to.toISOString(), to);
      assert.equal(hourly.openBucket, undefined, "dia fechado não pode ganhar bucket aberto por parâmetro default");
      const minute = definitions.find((item: RuntimeFixture) => item.granularity === "minute");
      assert.equal(minute.from.toISOString(), from);
      assert.equal(minute.to.toISOString(), to);
      assert.equal(minute.to - minute.from, Date.parse(to) - Date.parse(from));
      assert.equal(minute.openBucket, undefined);
      assert.equal(
        reports.listBucketStarts(minute).length,
        (Date.parse(to) - Date.parse(from)) / 60_000,
        "o histórico minuto a minuto deve cobrir todo o último dia civil",
      );
      assert.equal(reports.listBucketStarts(hourly).length,
        timeZone === "Australia/Lord_Howe" ? 24 : (Date.parse(to) - Date.parse(from)) / 3_600_000);
      assert.equal(reports.buildEmptyPoints(hourly).length, 24);
    }
  });
});

test("Análises: o dia atual cobre desde 00h até o minuto aberto", () => {
  inTimeZones(["UTC", "Asia/Tokyo"], () => {
    const now = new Date("2026-09-10T13:42:37Z");
    const range = windowApi.resolveOccupancyAnalysisRange(
      now,
      "2026-09-10",
      "2026-09-10",
      true,
      "2026-09-10",
      "America/Sao_Paulo",
    );
    const minute = reports
      .buildOccupancyReportDefinitions(
        range.reference,
        now,
        true,
        range,
        "America/Sao_Paulo",
      )
      .find((item: RuntimeFixture) => item.granularity === "minute");

    assert.equal(minute.from.toISOString(), "2026-09-10T03:00:00.000Z");
    assert.equal(minute.to.toISOString(), "2026-09-10T13:43:00.000Z");
    assert.equal(minute.openBucket.toISOString(), "2026-09-10T13:42:00.000Z");
    assert.equal(reports.listBucketStarts(minute).length, 643);
  });
});

test("Análises: uma amostra diurna permanece no histórico diário por minuto", () => {
  inTimeZones(["UTC", "Asia/Tokyo"], () => {
    const range = windowApi.resolveOccupancyAnalysisRange(
      new Date("2026-12-01T12:00:00Z"),
      "2026-09-10",
      "2026-09-10",
      true,
      "2026-12-01",
      "America/Sao_Paulo",
    );
    const minute = reports
      .buildOccupancyReportDefinitions(
        range.reference,
        null,
        true,
        range,
        "America/Sao_Paulo",
      )
      .find((item: RuntimeFixture) => item.granularity === "minute");
    const state = reports.buildScenarioPoints(minute, [
      {
        bucket: "2026-09-10T13:00:00Z",
        scenario_total_avg: 3,
        scenario_total_max: 5,
        scenario_total_min: 1,
      },
    ]);
    const tenOClock = state.points.find(
      (point: RuntimeFixture) => point.bucket === "2026-09-10T13:00:00.000Z",
    );

    assert.equal(tenOClock?.label, "10:00");
    assert.deepEqual(
      {
        average: tenOClock?.average,
        minimum: tenOClock?.minimum,
        peak: tenOClock?.peak,
      },
      { average: 3, minimum: 1, peak: 5 },
    );
  });
});

test("calendário diário continua após meia-noite inexistente, sem propagar 01h", () => {
  inTimeZones(["America/Havana", "America/Sao_Paulo", "UTC"], () => {
    for (const [start, end, days] of [["2026-03-07", "2026-03-10", 4], ["2018-11-03", "2018-11-06", 4]] as const) {
      const range = windowApi.resolveOccupancyAnalysisRange(new Date("2026-12-01T12:00:00Z"), start, end, true, "2026-12-01", "America/Sao_Paulo");
      const plan = resolution.buildOccupancyAnalysisResolutionPlan(range.from, range.to, days);
      assert.equal(plan.pointCount, days);
      const dates = plan.segments.flatMap((segment: RuntimeFixture) => segment.bucketStarts).map(calendar.occupancyCalendarDateKey);
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
    const hourly = definitions.find((item: RuntimeFixture) => item.granularity === "hour");
    assert.equal(hourly.from.toISOString(), "2026-09-10T03:00:00.000Z");
    assert.equal(hourly.to.toISOString(), "2026-09-11T02:00:00.000Z");
    assert.equal(hourly.openBucket.toISOString(), "2026-09-11T01:00:00.000Z");
    const daily = definitions.find((item: RuntimeFixture) => item.granularity === "day");
    assert.equal(calendar.occupancyCalendarDateKey(daily.from), "2026-09-04");
    assert.equal(calendar.occupancyCalendarDateKey(daily.to), "2026-09-11");
    assert.equal(calendar.occupancyCalendarDateKey(daily.openBucket), "2026-09-10");
    assert.equal(reports.listBucketStarts(daily).length, 7);
    const month = definitions.find((item: RuntimeFixture) => item.granularity === "month");
    assert.equal(calendar.occupancyCalendarDateKey(month.from), "2025-10-01");
    assert.equal(calendar.occupancyCalendarDateKey(month.to), "2026-10-01");
  });
});

test("Relatórios e Análises exibem buckets civis abertos sem certificar a leitura parcial", () => {
  const aggregate = load("lib/occupancy-aggregate-validation.ts");
  inTimeZones(["UTC", "Asia/Tokyo"], () => {
    const now = new Date("2026-09-11T12:00:00Z");
    const definitions = reports.buildOccupancyReportDefinitions(
      now, now, false, undefined, "America/Sao_Paulo",
    );
    for (const granularity of ["day", "week", "month"]) {
      const definition = definitions.find(
        (item: RuntimeFixture) => item.granularity === granularity,
      );
      const buckets = reports.listBucketStarts(definition);
      const rows = buckets.map((bucket: Date, index: number) => ({
        bucket: calendar.occupancyCalendarDateKey(bucket),
        complete: index !== buckets.length - 1,
        scenario_total_avg: index + 1,
        scenario_total_max: index + 1,
        scenario_total_min: index + 1,
        status: index === buckets.length - 1 ? "partial" : "complete",
      }));
      const state = reports.buildScenarioPoints(definition, rows);
      assert.equal(state.points.at(-1).average, buckets.length, granularity);
      assert.equal(state.incomplete, true, granularity);
      assert.ok(state.warning, granularity);
      assert.equal(aggregate.occupancyAggregatePresentationWarning(state.warning), undefined);
      assert.equal(aggregate.resolveCertifiedOccupancyDataCutoff([
        { asOf: now.toISOString(), warning: state.warning },
      ]), null, granularity);

      const closed = reports.buildScenarioPoints(definition, rows.map((row: RuntimeFixture) => ({
        ...row, complete: true, status: "complete",
      })));
      assert.equal(closed.incomplete, false, granularity);
      assert.equal(closed.warning, undefined, granularity);
    }
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
    assert.ok(buckets.every((bucket: RuntimeFixture, index: number) => index === 0 || bucket > buckets[index - 1]));
    const currentPoints = reports.buildEmptyPoints(definition);
    const previousPoints = reports.buildEmptyPoints(previous).map((point: RuntimeFixture, index: number) => ({ ...point, average: index + 1 }));
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
    for (const [day, expected] of [["2026-03-09", 23], ["2026-11-02", 25]] as const) {
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
    assert.ok(reports.listBucketStarts(previous).every((bucket: RuntimeFixture) => zone.companyZonedDateParts(bucket, "America/New_York").hour !== 2));
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
    const definition = reports.buildOccupancyReportDefinitions(now, now, false, undefined, "America/Sao_Paulo").find((item: RuntimeFixture) => item.granularity === "hour");
    const data = { occupancy_report_hour__previous: { points: fixed.map((item: RuntimeFixture) => ({ ...item, average: 5 })) } };
    reports.maskOpenBucketComparisons(data, [definition], now);
    assert.equal(data.occupancy_report_hour__previous.points[12].average, null);
    assert.equal(data.occupancy_report_hour__previous.points[15].average, 5);
  });
});

test("IA mantém a data civil das linhas diárias sem converter floating como instante", () => {
  inTimeZones(["UTC", "America/Los_Angeles", "Asia/Tokyo"], () => {
    const range = windowApi.resolveOccupancyAnalysisRange(new Date("2026-09-11T12:00:00Z"), "2026-09-09", "2026-09-10", true, "2026-09-11", "America/Sao_Paulo");
    const definition = reports.buildOccupancyReportDefinitions(range.reference, null, true, range, "America/Sao_Paulo").find((item: RuntimeFixture) => item.id === "occupancy_report_day");
    const buckets = reports.listBucketStarts(definition);
    const table = reports.buildOccupancyAiDailyTable({ bucketStarts: buckets, companyTimeZone: "America/Sao_Paulo", points: reports.buildEmptyPoints(definition) });
    assert.deepEqual(table.rows.map((row: RuntimeFixture) => row.date), ["2026-09-09", "2026-09-10"]);
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

test("current_value só representa o bucket aberto que contém current_at", () => {
  const row = {
    area: undefined,
    avg: 5.4,
    camera_id: "camera-a",
    current_at: "2026-09-10T13:42:30.000Z",
    current_value: 7,
    min: 0,
    object_class: "person",
    occupied: true,
    peak: 12,
  };
  const window = {
    from: new Date("2026-09-10T13:42:00.000Z"),
    open: true,
    to: new Date("2026-09-10T13:43:00.000Z"),
  };

  assert.deepEqual(reports.buildRowsMetric([row], window), {
    average: 5.4,
    current: 7,
    minimum: 0,
    peak: 12,
  });
  assert.equal(
    reports.buildRowsMetric([row], { ...window, open: false }).current,
    null,
    "bucket fechado não pode repetir a fotografia atual",
  );
  assert.equal(
    reports.buildRowsMetric([row], {
      ...window,
      from: new Date("2026-09-10T12:00:00.000Z"),
      to: new Date("2026-09-10T13:00:00.000Z"),
    }).current,
    null,
    "current_at fora do bucket aberto não pode preencher o período",
  );
});

test("leitura aberta prefere o lote raw e completa áreas quietas pelo histórico pontual", () => {
  const source = readFileSync(
    resolve(root, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const loaderStart = source.indexOf(
    "async function loadOccupancyReportCurrentSnapshot",
  );
  const loaderEnd = source.indexOf("\nfunction occupancyPath", loaderStart);
  const loader =
    loaderStart >= 0 && loaderEnd > loaderStart
      ? source.slice(loaderStart, loaderEnd)
      : "";

  assert.ok(loader, "o loader da leitura atual deve estar declarado");
  assert.match(loader, /occupancyLiveSnapshotQuery\(\{ now: requestedAt }\)/);
  assert.match(loader, /requireOccupancyCurrentSnapshotRows\(response,/);
  assert.match(
    loader,
    /occupancyScenarioSnapshotHasCompleteCoverage\(scenario, rows\)/,
  );
  assert.match(loader, /buildOccupancyScenarioSnapshotValue\(scenario, rows\)/);
  assert.match(loader, /rows\.filter\(\(row\) => row\.occupied\)\.length/);
  assert.match(
    loader,
    /!occupancyScenarioSnapshotHasCompleteCoverage\(scenario, rows\)[\s\S]*?occupancyScenarioHistoryPath\([\s\S]*?requireAreaSnapshots: true[\s\S]*?area\.value > 0/,
    "uma resposta parcial precisa completar somente o cenário demandado sem inventar zero",
  );
  assert.match(
    source,
    /usesLiveDay\s*\? loadOccupancyReportCurrentSnapshot\([\s\S]*?: scheduleQuery\([\s\S]*?occupancyScenarioHistoryPath/,
    "somente o intervalo fechado pode recorrer ao snapshot histórico",
  );
});

test("Análises não rejeita composição histórica nem emite alerta global por leitura final opcional", () => {
  const source = readFileSync(
    resolve(root, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const closedBranchStart = source.indexOf(
    ": scheduleQuery(",
    source.indexOf("const [entries, currentSnapshotResult]"),
  );
  const closedBranchEnd = source.indexOf(
    ": Promise.resolve({ data: null, error: \"\" })",
    closedBranchStart,
  );
  assert.ok(closedBranchStart >= 0 && closedBranchEnd > closedBranchStart);
  const closedBranch = source.slice(closedBranchStart, closedBranchEnd);
  assert.match(closedBranch, /requireOccupancyHistoryResponse\(/);
  assert.doesNotMatch(closedBranch, /expectedAreas\s*:/);
  assert.doesNotMatch(source, /A leitura final do intervalo não pôde ser carregada\./);

  const comparisonSource = readFileSync(
    resolve(root, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const historicalStart = comparisonSource.indexOf(
    "if (referenceAt) {",
    comparisonSource.indexOf("async function loadOccupancyComparisonReportSnapshots"),
  );
  const historicalEnd = comparisonSource.indexOf(
    "const query = occupancyLiveSnapshotQuery",
    historicalStart,
  );
  assert.ok(historicalStart >= 0 && historicalEnd > historicalStart);
  const historicalBranch = comparisonSource.slice(historicalStart, historicalEnd);
  assert.match(historicalBranch, /requireOccupancyHistoryResponse\(/);
  assert.doesNotMatch(historicalBranch, /expectedAreas\s*:/);
});

function inTimeZones(zones: RuntimeFixture, run: (...args: RuntimeFixture[]) => RuntimeFixture) {
  const previous = process.env.TZ;
  try { for (const timeZone of zones) { process.env.TZ = timeZone; run(); } }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
}

function load(relative: string): RuntimeFixture {
  if (relative === "lib/master-company-scope.ts") return {};
  if (relative === "lib/user-grid-local.ts") return {};
  const file = resolve(root, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  modules.set(file, loaded);
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
  new Function("exports", "require", "module", output)(loaded.exports, (name: RuntimeFixture) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : createRequire(file)(name), loaded);
  return loaded.exports;
}

function loadReportFunctions(): RuntimeFixture {
  const file = resolve(root, "components/app/occupancy-reports-dashboard.tsx");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = source.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(source)).join("\n");
  const bindings: Record<string, RuntimeFixture> = {
    ...load("lib/aggregate-time.ts"), ...calendar, ...zone, ...windowApi, ...resolution,
    ...comparison, ...hourAxis, ...load("lib/occupancy-metrics.ts"), ...load("lib/utils.ts"),
    ...load("lib/occupancy-aggregate-validation.ts"),
    MINUTE_MS: 60_000, HOUR_MS: 3_600_000, DAY_MS: 86_400_000,
    AI_INSIGHTS_LIMITS: { dailyDatasetRows: 5000 }, AI_OCCUPANCY_DAILY_CHUNK_DAYS: 62,
    MAX_CLOSED_SEGMENT_CACHE_ENTRIES: 256,
    MAX_OCCUPANCY_MINUTE_REPORT_BUCKETS: 1_600,
    MAX_OCCUPANCY_REPORT_BUCKETS: 500,
  };
  const output = ts.transpileModule(declarations, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }, fileName: file }).outputText;
  return new Function("exports", ...Object.keys(bindings), `${output};return {buildOccupancyReportDefinitions,listBucketStarts,buildEmptyPoints,buildComparisonDefinition,alignMinuteComparisonPoints,maskOpenBucketComparisons,buildOccupancyAiDailyTable,buildScenarioPoints,summarizeOccupancyRangeMetrics,cacheCertifiedClosedSegment,buildRowsMetric};`)({}, ...Object.values(bindings));
}
