import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = "components/app/period-analysis-dashboard.tsx";
const dashboardSource = readFileSync(resolve(root, dashboardPath), "utf8");
const dashboardAst = ts.createSourceFile(dashboardPath, dashboardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const modules = new Map();
const time = loadModule("lib/aggregate-time.ts");
const hourQuery = loadModule("lib/aggregate-hour-query.ts");
const { normalizeOccupancyAnalysisDateRangeInput } = loadModule("lib/occupancy-analysis-window.ts");
const { companyDateKey } = loadModule("lib/company-time-zone.ts");
const { resolvePeriodAnalysisRange } = loadModule("lib/period-analysis-model.ts");

function loadModule(relativePath) {
  if (modules.has(relativePath)) return modules.get(relativePath);
  const filename = resolve(root, relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => name === "@/lib/api"
    ? { apiFetch: () => { throw new Error("The refresh fixture must not call a real API."); } }
    : name.startsWith("@/") ? loadModule(`${name.slice(2)}.ts`) : require(name);
  new Function("module", "exports", "require", output)(loaded, loaded.exports, localRequire);
  modules.set(relativePath, loaded.exports);
  return loaded.exports;
}

function declaration(name) {
  let result;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node;
    ts.forEachChild(node, visit);
  }
  visit(dashboardAst);
  assert.ok(result, `${name} must exist`);
  return result;
}

function standalone(name, bindings) {
  const output = ts.transpileModule(`${declaration(name).getText(dashboardAst)}\nmodule.exports = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("module", ...Object.keys(bindings), output)(loaded, ...Object.values(bindings));
  return loaded.exports;
}

function createFixture({ storageFails = false } = {}) {
  const hourlyAggregateCacheRef = { current: new Map() };
  const dailyAggregateCacheRef = { current: new Map() };
  const requestRef = { current: null };
  const pendingAnalysisDayRequests = new WeakMap();
  const pendingForCache = standalone("pendingAnalysisDayRequestsForCache", { pendingAnalysisDayRequests });
  const clearAnalysisDayCache = standalone("clearAnalysisDayCache", { pendingAnalysisDayRequests });
  const range = resolvePeriodAnalysisRange("2026-08-27", "2026-08-28");
  const settings = { from: "2026-08-27", to: "2026-08-28", mode: "range" };
  const state = { version: 0, serverTotal: 100, dayRequests: 0, hourRequests: 0, errors: [], saved: [], hold: null };
  const rows = (granularity) => state.serverTotal === null ? [] : [{
    bucket: granularity === "day" ? "2026-08-27" : new Date(2026, 7, 27, 12).toISOString(),
    camera_id: "camera-a", line_count_id: "line-a", metric_type: "count", total: state.serverTotal,
  }];
  const loadDay = standalone("fetchCachedAnalysisDayDataset", {
    readCoveringAnalysisDayDataset: standalone("readCoveringAnalysisDayDataset", { aggregateBucketInRange: time.aggregateBucketInRange }),
    setAnalysisDayCacheEntry: standalone("setAnalysisDayCacheEntry", { MAX_ANALYSIS_DAY_CACHE_ENTRIES: 64 }),
    pendingAnalysisDayRequestsForCache: pendingForCache,
    fetchAnalysisDataset: async (granularity, requestedRange, companyScopeId, signal) => {
      assert.equal(companyScopeId, "company-a");
      assert.deepEqual(requestedRange, range);
      assert.ok(signal instanceof AbortSignal);
      state.dayRequests += 1;
      const data = rows(granularity);
      if (state.hold) await state.hold;
      return { granularity, rows: data };
    },
  });
  const commit = standalone("commitAnalysisSettings", {
    normalizeOccupancyAnalysisDateRangeInput, companyDateKey, resolvePeriodAnalysisRange,
    companyTimeZone: "America/Sao_Paulo", companyScopeId: "company-a", user: { id: "operator-a" },
    savePeriodAnalysisSettings: (...args) => {
      state.saved.push(args);
      if (storageFails) throw new Error("Storage unavailable");
    },
    toast: { error: (message) => state.errors.push(message) },
    requestRef, abortRequest: (controller) => controller.abort(),
    hourlyAggregateCacheRef, dailyAggregateCacheRef,
    clearHourlyAggregateCache: hourQuery.clearHourlyAggregateCache, clearAnalysisDayCache,
    hasLoadedDataRef: { current: true },
    setDataLoadError: () => {}, setData: () => {}, emptyData: () => ({}),
    setLoadingData: () => {}, setAnalysisRequested: () => {}, setAppliedSettings: () => {},
    setQueryVersion: (update) => { state.version = update(state.version); },
  });
  async function load() {
    const controller = new AbortController();
    requestRef.current = controller;
    return Promise.all([
      loadDay(range, "company-a", controller.signal, {
        cache: dailyAggregateCacheRef.current, cacheScope: "analysis:company-a:America/Sao_Paulo", revision: "2026-09-10",
      }),
      hourQuery.fetchBoundedHourlyAggregateRanges({
        cache: hourlyAggregateCacheRef.current, cacheScope: "analysis:company-a:America/Sao_Paulo",
        companyScopeId: "company-a", ranges: [range], now: new Date(2026, 8, 10, 12), signal: controller.signal,
        request: async (url) => {
          const params = new URL(url, "https://fixture.invalid").searchParams;
          assert.equal(params.get("metric_type"), "count");
          assert.equal(params.get("from"), range.from.toISOString());
          assert.equal(params.get("to"), range.to.toISOString());
          state.hourRequests += 1;
          const data = rows("hour");
          if (state.hold) await state.hold;
          return { granularity: "hour", data };
        },
      }),
    ]).then(([day, hour]) => [day.rows, hour].map((rows) => rows.reduce((sum, row) => sum + row.total, 0)));
  }
  return { state, load, apply: () => commit(settings), requestRef, hourlyAggregateCacheRef, dailyAggregateCacheRef };
}

for (const nextTotal of [140, 40, 0, null]) {
  test(`reaplicar o período renova horas e dias, inclusive correção para ${nextTotal ?? "sem linhas"}`, async () => {
    const fixture = createFixture();
    assert.deepEqual(await fixture.load(), [100, 100]);
    fixture.state.serverTotal = nextTotal;
    fixture.apply();
    assert.deepEqual(await fixture.load(), [nextTotal ?? 0, nextTotal ?? 0]);
    assert.equal(fixture.state.version, 1);
    assert.deepEqual([fixture.state.dayRequests, fixture.state.hourRequests], [2, 2]);
    assert.deepEqual(fixture.state.saved[0].slice(1), ["company-a", "operator-a"]);
  });
}

test("reutilizar dados sem solicitação explícita mantém os caches e evita novas consultas", async () => {
  const fixture = createFixture();
  assert.deepEqual(await fixture.load(), [100, 100]);
  fixture.state.serverTotal = 140;
  assert.deepEqual(await fixture.load(), [100, 100]);
  assert.equal(fixture.state.version, 0);
  assert.deepEqual([fixture.state.dayRequests, fixture.state.hourRequests], [1, 1]);
});

test("solicitação explícita aborta a anterior e uma resposta tardia não restaura dados velhos", async () => {
  const fixture = createFixture();
  let release;
  fixture.state.hold = new Promise((resolve) => { release = resolve; });
  const previous = fixture.load();
  const previousController = fixture.requestRef.current;
  const rejected = assert.rejects(previous, (error) => error.name === "AbortError");
  fixture.apply();
  assert.equal(previousController.signal.aborted, true);
  fixture.state.hold = null;
  fixture.state.serverTotal = 40;
  assert.deepEqual(await fixture.load(), [40, 40]);
  release();
  await rejected;
  assert.deepEqual(await fixture.load(), [40, 40]);
  assert.deepEqual([fixture.state.dayRequests, fixture.state.hourRequests], [2, 2]);
});

test("falha ao salvar a preferência não impede buscar a contagem atual", async () => {
  const fixture = createFixture({ storageFails: true });
  await fixture.load();
  fixture.state.serverTotal = 0;
  fixture.apply();
  assert.equal(fixture.state.errors.length, 1);
  assert.deepEqual(await fixture.load(), [0, 0]);
});

test("horas de uma janela parcial não apagam a indisponibilidade do histórico diário", () => {
  const merge = standalone("mergeExactHoursIntoDays", loadModule("lib/aggregate-reconciliation.ts"));
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 8, 1) };
  const unavailableHistory = {
    granularity: "day", rows: [], error: "O histórico diário de 2024 a 2026 está indisponível.",
  };
  for (const rows of [[], [{
    bucket: new Date(2026, 7, 27, 12).toISOString(), camera_id: "camera-a",
    line_count_id: "line-a", metric_type: "count", total: 20,
  }]]) {
    assert.equal(
      merge(unavailableHistory, { granularity: "hour", rows }, range),
      unavailableHistory,
      "uma janela horária de 31 dias, inclusive vazia, não certifica o histórico inteiro",
    );
  }
});

test("dias disponíveis continuam reconciliando horas válidas, inclusive correção vazia", () => {
  const merge = standalone("mergeExactHoursIntoDays", loadModule("lib/aggregate-reconciliation.ts"));
  const range = { from: new Date(2026, 7, 27), to: new Date(2026, 7, 28) };
  const row = { camera_id: "camera-a", line_count_id: "line-a", metric_type: "count" };
  const daily = { granularity: "day", rows: [
    { ...row, bucket: "2026-08-26", total: 100 },
    { ...row, bucket: "2026-08-27", total: 50 },
  ] };
  const before = structuredClone(daily);
  const corrected = merge(daily, {
    granularity: "hour", rows: [{ ...row, bucket: new Date(2026, 7, 27, 12).toISOString(), total: 20 }],
  }, range);
  assert.equal(corrected.error, undefined);
  assert.deepEqual(corrected.rows.map(({ bucket, total }) => [bucket, total]), [
    ["2026-08-26", 100], ["2026-08-27", 20],
  ]);
  assert.deepEqual(merge(daily, { granularity: "hour", rows: [] }, range).rows, [daily.rows[0]]);
  assert.deepEqual(daily, before);
});

test("renovação fica no aplicar explícito, preservando abertura em ontem e sem polling", () => {
  const commit = declaration("commitAnalysisSettings").getText(dashboardAst);
  assert.match(commit, /clearHourlyAggregateCache\(hourlyAggregateCacheRef\.current\)/);
  assert.match(commit, /clearAnalysisDayCache\(dailyAggregateCacheRef\.current\)/);
  assert.match(dashboardSource, /shiftOccupancyAnalysisDateInput\(\s*companyTodayInput,\s*-1/);
  assert.doesNotMatch(dashboardSource, /setInterval\(/);
  assert.equal((dashboardSource.match(/clearHourlyAggregateCache\(hourlyAggregateCacheRef\.current\)/g) ?? []).length, 2);
  assert.equal((dashboardSource.match(/clearAnalysisDayCache\(dailyAggregateCacheRef\.current\)/g) ?? []).length, 2);
});
