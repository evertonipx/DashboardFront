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
const time = load("lib/aggregate-time.ts");
const scenariosModel = load("lib/scenario-analytics.ts");
const analysis = load("lib/period-analysis-model.ts");
const reconciliation = load("lib/aggregate-reconciliation.ts");
const livePath = "components/app/realtime-dashboard.tsx";
const liveTotal = standalone("sumScopeRowsInRange", {
  aggregateBucketInRange: time.aggregateBucketInRange,
  buildCombinedScenarioMultiplierMap: scenariosModel.buildCombinedScenarioMultiplierMap,
});

const scenarios = [{
  active: true, company_id: "company", id: "net", name: "Entradas menos saídas",
  lines: [
    { line_count_id: "entry", action_multiplier: 1 },
    { line_count_id: "exit", action_multiplier: -1 },
    { line_count_id: "ignored", action_multiplier: 0 },
  ],
}, {
  active: true, company_id: "company", id: "extra", name: "Outra entrada",
  lines: [{ line_count_id: "extra", action_multiplier: 1 }],
}];

for (const [year, month, day] of [[2026, 7, 1], [2026, 0, 1], [2024, 1, 29]]) {
  for (const scopeMode of ["scenario", "location", "sub_location"]) {
    test(`total diário Live/Análises coincide em ${year}-${month + 1}-${day}, por ${scopeMode}`, () => {
      const from = new Date(year, month, day);
      const to = new Date(year, month, day + 1);
      const rows = [
        row(new Date(from.getTime() - 3_600_000), "entry", 800),
        row(from, "entry", 10),
        row(new Date(year, month, day, 10), "entry", 30),
        row(new Date(year, month, day, 10), "exit", 7),
        row(new Date(year, month, day, 10), "ignored", 90),
        row(new Date(year, month, day, 12), "extra", 15, "camera-b"),
        row(new Date(year, month, day, 13), null, 4),
        row(new Date(year, month, day, 23), "entry", 5),
        row(to, "entry", 900),
      ];
      const scope = scopeMode === "scenario"
        ? { mode: scopeMode, scenarios: [scenarios[0]], cameraIds: [] }
        : { id: "place", name: "Local", mode: scopeMode, cameraIds: ["camera"] };
      const expected = scopeMode === "scenario" ? 38 : 146;
      assert.equal(liveTotal(rows, scope, from, to, "hour"), expected);
      for (const kind of ["summary", "day_total"]) {
        const model = analysis.buildPeriodAnalysisWidgetModel({
          data: data(rows), period: { from, to }, scenarios,
          scopeOptions: scopeMode === "scenario" ? [] : [scope],
          widget: widget(kind, scopeMode, scopeMode === "scenario" ? ["net"] : ["place"]),
        });
        assert.equal(model.metrics[0].value, expected, kind);
      }
    });
  }
}

test("a composição individual preserva os multiplicadores igualmente nas duas telas", () => {
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 2);
  const rows = [row(from, "entry", 20), row(from, "exit", 6), row(from, "extra", 11, "camera-b")];
  for (const selected of [[scenarios[0]], [scenarios[1]], scenarios]) {
    const expected = liveTotal(rows, { mode: "scenario", cameraIds: [], scenarios: selected }, from, to, "hour");
    const model = analysis.buildPeriodAnalysisWidgetModel({
      data: data(rows), period: { from, to }, scenarios,
      widget: widget("day_total", "scenario", selected.map((scenario) => scenario.id)),
    });
    assert.equal(model.metrics[0].value, expected);
  }
});

test("hora parcial substitui a hora agregada sem duplicar o total diário", () => {
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 2);
  const hourFrom = new Date(2026, 7, 1, 10);
  const hourTo = new Date(2026, 7, 1, 11);
  const hours = [row(from, "entry", 20), row(hourFrom, "entry", 999)];
  const minutes = [row(hourFrom, "entry", 5), row(new Date(2026, 7, 1, 10, 1), "entry", 8)];
  const reconciled = reconciliation.reconcileAggregateRows(hours, "hour", minutes, "minute", hourFrom, hourTo);
  assert.equal(liveTotal(reconciled, { mode: "scenario", cameraIds: [], scenarios }, from, to, "hour"), 33);
  const model = analysis.buildPeriodAnalysisWidgetModel({
    data: data(reconciled), period: { from, to }, scenarios,
    widget: widget("day_total", "scenario", ["net"]),
  });
  assert.equal(model.metrics[0].value, 33);
});

test("agregados civis recentes renovam por hora; histórico não é baixado em cada tick", async () => {
  const calls = [];
  let total = 100;
  const loadNative = standalone("loadCachedRealtimeNativeQuery", {
    ...time,
    DEFAULT_METRIC_TYPE: "count",
    startOfDay: (date) => time.startOfAggregateBucket(date, "day"),
    addDays: (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count),
    fetchCompleteAggregateRange: async (query) => { calls.push(query); return [{ total }]; },
  });
  const cache = new Map();
  const base = {
    cache, cacheScope: "company:America/Sao_Paulo", companyScopeId: "company",
    signal: new AbortController().signal,
    query: { granularity: "day", from: new Date(2026, 7, 1), to: new Date(2026, 7, 27) },
  };
  assert.equal((await loadNative({ ...base, now: new Date(2026, 7, 27, 10) }))[0].total, 100);
  total = 140;
  assert.equal((await loadNative({ ...base, now: new Date(2026, 7, 27, 10, 5) }))[0].total, 100);
  assert.equal(calls.length, 1);
  assert.equal((await loadNative({ ...base, now: new Date(2026, 7, 27, 11) }))[0].total, 140);
  total = 0;
  assert.equal((await loadNative({ ...base, now: new Date(2026, 7, 27, 12) }))[0].total, 0);
  const historical = { ...base, query: { granularity: "day", from: new Date(2025, 7, 1), to: new Date(2025, 8, 1) } };
  await loadNative({ ...historical, now: new Date(2026, 7, 27, 10) });
  await loadNative({ ...historical, now: new Date(2026, 7, 27, 11) });
  assert.equal(calls.length, 4);
  await loadNative({ ...historical, now: new Date(2026, 7, 28, 10) });
  assert.equal(calls.length, 5);
  assert.ok(calls.every((query) => query.companyScopeId === "company" && query.signal === base.signal));
  cache.clear();
  total = 200;
  assert.equal((await loadNative({ ...base, now: new Date(2026, 7, 27, 12) }))[0].total, 200);
});

test("atualização explícita é distinta da troca do plano de widgets", () => {
  const source = readFileSync(resolve(root, livePath), "utf8");
  assert.match(source, /if \(refreshData\) \{[\s\S]*?clearHourlyAggregateCache[\s\S]*?clearRealtimeHourlyCoverageCache[\s\S]*?nativeAggregateCacheRef\.current\.clear\(\)[\s\S]*?clearRealtimeRollingMinuteCache[\s\S]*?clearMinuteDayAggregateCache/);
  assert.match(source, /aria-label="Atualizar dados do Ao Vivo"/);
  assert.match(source, /loadCharts\(\{ force: true, refreshData: true \}\)/);
  assert.match(source, /loadCharts\(\{ silent: true \}\)/);
});

test("Live recompõe dias completos como Análises, preservando lacunas e dias parciais", () => {
  const hydrate = liveHydrator();
  const from = new Date(2026, 7, 1);
  const day2 = new Date(2026, 7, 2);
  const day3 = new Date(2026, 7, 3);
  const to = new Date(2026, 7, 4);
  const hours = [row(new Date(2026, 7, 1, 10), "entry", 100), row(new Date(2026, 7, 3, 10), "entry", 10)];
  const original = {
    live_operational_month_hours: { granularity: "hour", rows: hours },
    daily: { granularity: "day", rows: [
      { ...row(from, "entry", 130), bucket: "2026-08-01" },
      { ...row(day2, "entry", 500), bucket: "2026-08-02" },
      { ...row(day3, "entry", 99), bucket: "2026-08-03" },
    ] },
  };
  const definitions = [
    { id: "live_operational_month_hours", from, to, granularity: "hour" },
    { id: "daily", from, to, granularity: "day" },
  ];
  const coverage = [
    { from, to: new Date(2026, 7, 1, 12) },
    { from: new Date(2026, 7, 1, 12), to: day2 },
    { from: new Date(2026, 7, 3, 10), to: new Date(2026, 7, 3, 11) },
  ];
  const result = hydrate(original, definitions, new Date(2026, 7, 10), coverage);
  const totals = Object.fromEntries(result.daily.rows.map((item) => [item.bucket, item.total]));
  assert.deepEqual(totals, { "2026-08-01": 100, "2026-08-02": 500, "2026-08-03": 99 });
  assert.equal(original.daily.rows[0].total, 130, "hidratação não altera snapshot anterior");
  const model = analysis.buildPeriodAnalysisWidgetModel({
    data: data(hours), period: { from, to: day2 }, scenarios,
    widget: widget("day_total", "scenario", ["net"]),
  });
  assert.equal(totals["2026-08-01"], model.metrics[0].value);
  const zero = hydrate({ ...original, live_operational_month_hours: { granularity: "hour", rows: [] } }, definitions, new Date(2026, 7, 10), coverage);
  assert.equal(zero.daily.rows.some((item) => item.bucket === "2026-08-01"), false, "resposta completa vazia substitui valor antigo por zero");
  assert.equal(zero.daily.rows.find((item) => item.bucket === "2026-08-02").total, 500);
});

test("falha na hora em andamento não publica um total parcial como diário completo", () => {
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 2);
  const result = liveHydrator()({
    live_operational_month_hours: { granularity: "hour", rows: [row(from, "entry", 50)] },
    live_operational_current_hour_minutes: { granularity: "minute", rows: [] },
    live_chart_minute: { granularity: "minute", rows: [], error: "Minutos indisponíveis" },
    live_chart_hour: { granularity: "hour", rows: [] },
    daily: { granularity: "day", rows: [] },
  }, [
    { id: "live_operational_month_hours", from, to, granularity: "hour" },
    { id: "live_chart_hour", from, to, granularity: "hour" },
    { id: "daily", from, to, granularity: "day" },
  ], new Date(2026, 7, 1, 10, 20), [{ from, to: new Date(2026, 7, 1, 11) }]);
  for (const id of ["live_operational_month_hours", "live_chart_hour", "daily"]) {
    assert.equal(result[id].error, "Minutos indisponíveis");
    assert.deepEqual(result[id].rows, []);
  }
});

function liveHydrator() {
  const base = {
    ...time, ...reconciliation,
    startOfHour: (date) => time.startOfAggregateBucket(date, "hour"),
    startOfMinute: (date) => time.startOfAggregateBucket(date, "minute"),
    startOfDay: (date) => time.startOfAggregateBucket(date, "day"),
    addDays: (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count),
    addMinutes: (date, count) => new Date(date.getTime() + count * 60_000),
    isRealtimeNativeCoarseGranularity: standalone("isRealtimeNativeCoarseGranularity", {}),
  };
  return standalone("hydrateRealtimeOpenBuckets", {
    ...base,
    OPERATIONAL_MONTH_HOURS_ID: "live_operational_month_hours",
    OPERATIONAL_CURRENT_HOUR_MINUTES_ID: "live_operational_current_hour_minutes",
    OPEN_COARSE_DAYS_ID: "live_open_coarse_days",
    CANONICAL_HOUR_DERIVED_IDS: new Set(["live_chart_hour"]),
    CANONICAL_HOUR_DERIVED_TARGETS: [{ id: "live_chart_hour", granularity: "hour" }],
    realtimeNativeOpenBoundaryRange: standalone("realtimeNativeOpenBoundaryRange", base),
    realtimeNativeOpenBucketRange: standalone("realtimeNativeOpenBucketRange", base),
    mergeRealtimeQueryRanges: standalone("mergeRealtimeQueryRanges", {}),
  });
}

function row(date, line, total, camera = "camera") {
  return { bucket: date.toISOString(), camera_id: camera, line_count_id: line, metric_type: "count", total };
}
function widget(kind, scopeMode, scenarioIds) {
  return { id: kind, kind, title: kind, scopeMode, scenarioIds, selectionMode: "custom", granularity: "day", baseline: "previous_period", startHour: 0, entryScenarioIds: [], exitScenarioIds: [] };
}
function data(rows) {
  return { baseline: {}, contextHour: { granularity: "hour", rows }, hour: { granularity: "hour", rows }, minute: { granularity: "minute", rows: [] }, day: { granularity: "day", rows: [] }, month: { granularity: "month", rows: [] } };
}
function load(path) {
  const filename = resolve(root, path);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText;
  const nodeRequire = createRequire(filename);
  new Function("exports", "require", "module", output)(loaded.exports, (specifier) => specifier.startsWith("@/") ? load(`${specifier.slice(2)}.ts`) : nodeRequire(specifier), loaded);
  return loaded.exports;
}
function standalone(name, bindings) {
  const filename = resolve(root, livePath);
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration);
  const output = ts.transpileModule(`${declaration.getText(source)}\nmodule.exports = ${name};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", ...Object.keys(bindings), output)(loaded, ...Object.values(bindings));
  return loaded.exports;
}
