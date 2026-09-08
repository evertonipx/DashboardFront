import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);
const analysisPath = "components/app/period-analysis-dashboard.tsx";
const reportsPath = "components/app/scenario-reports-dashboard.tsx";

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function execute(source, bindings = {}) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("module", "exports", ...Object.keys(bindings), output)(
    loadedModule,
    loadedModule.exports,
    ...Object.values(bindings),
  );
  return loadedModule.exports;
}

function standaloneFunction(path, name, bindings = {}) {
  const sourceFile = ts.createSourceFile(
    path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const declaration = sourceFile.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(declaration, `${name} must exist`);
  return execute(
    `${declaration.getText(sourceFile)}\nmodule.exports = ${name};`,
    bindings,
  );
}

const {
  reconcileCountingHistoryItems,
  createCountingHistoryRequestQueue,
  createCountingHistoryDatasetLoader,
} = execute(read("lib/counting-history-performance.ts"));
const { aggregateBucketInRange } = execute(read("lib/aggregate-time.ts"));
const readCoveringAnalysisDayDataset = standaloneFunction(
  analysisPath, "readCoveringAnalysisDayDataset", { aggregateBucketInRange },
);

test("equivalent storage hydration preserves the widget array and model identities", () => {
  const current = [{ id: "a", scenarioIds: ["s1"], title: "Total" }];
  assert.equal(
    reconcileCountingHistoryItems(current, structuredClone(current)),
    current,
  );
});

test("editing or reordering one widget preserves untouched widget identities", () => {
  const current = [
    { id: "a", scenarioIds: ["s1"], title: "Total" },
    { id: "b", scenarioIds: ["s2"], title: "Ranking" },
  ];
  const edited = structuredClone(current);
  edited[0].scenarioIds = ["s3"];
  const next = reconcileCountingHistoryItems(current, edited);
  assert.equal(next[0], edited[0]);
  assert.equal(next[1], current[1]);
  assert.deepEqual(current[0].scenarioIds, ["s1"]);
  const reordered = reconcileCountingHistoryItems(current, [...current].reverse());
  assert.equal(reordered[0], current[1]);
  assert.equal(reordered[1], current[0]);
  assert.deepEqual(reconcileCountingHistoryItems(current, []), []);
});

test("report transport deduplicates identical paths and bounds concurrent requests", async () => {
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const queue = createCountingHistoryRequestQueue(async (path) => {
    calls += 1;
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return path;
  }, new AbortController().signal);
  const requests = Array.from({ length: 12 }, (_, index) => queue(`range-${index}`));
  assert.equal(queue("range-0"), requests[0]);
  assert.deepEqual(await Promise.all(requests), Array.from({ length: 12 }, (_, i) => `range-${i}`));
  assert.equal(calls, 12);
  assert.equal(maximum, 4);
});

test("a failed report request releases its slot without suppressing other results", async () => {
  const queue = createCountingHistoryRequestQueue(async (path) => {
    if (path === "bad") throw new Error("Unavailable");
    return path;
  }, new AbortController().signal, 1);
  const results = await Promise.allSettled([queue("bad"), queue("good")]);
  assert.equal(results[0].status, "rejected");
  assert.deepEqual(results[1], { status: "fulfilled", value: "good" });
});

test("aborting a report generation prevents queued requests from reaching the API", async () => {
  const controller = new AbortController();
  const reason = new Error("Changed company");
  const started = [];
  const queue = createCountingHistoryRequestQueue((path) => {
    started.push(path);
    return new Promise((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    });
  }, controller.signal, 2);
  const settled = Promise.allSettled([queue("a"), queue("b"), queue("c"), queue("d")]);
  await Promise.resolve();
  controller.abort(reason);
  const results = await settled;
  assert.deepEqual(started, ["a", "b"]);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason === reason));
  await assert.rejects(queue("a"), (error) => error === reason);
  assert.throws(() => createCountingHistoryRequestQueue(async () => null, controller.signal, 0), RangeError);
});

test("coarsened custom widgets share complete dataset assembly once per generation", async () => {
  let builds = 0;
  const build = async () => { builds += 1; return [{ total: 91 }]; };
  const load = createCountingHistoryDatasetLoader(build);
  const query = { granularity: "month", from: new Date(2022, 0, 1), to: new Date(2026, 0, 1) };
  const first = load({ ...query, id: "minute-widget" });
  const equivalent = load({ ...structuredClone(query), id: "hour-widget" });
  assert.equal(equivalent, first);
  assert.equal((await first)[0].total, 91);
  assert.equal(builds, 1);
  await load({ ...query, granularity: "year" });
  await load({ ...query, to: new Date(2025, 0, 1) });
  assert.equal(builds, 3);
  await createCountingHistoryDatasetLoader(build)(query);
  assert.equal(builds, 4, "refresh/company changes get a new generation, never stale data");
});

test("a late transport that ignores abort cannot publish a report result", async () => {
  const controller = new AbortController();
  let resolveRequest;
  const queue = createCountingHistoryRequestQueue(
    () => new Promise((resolve) => { resolveRequest = resolve; }),
    controller.signal,
  );
  const result = queue("range");
  const rejected = assert.rejects(result, /Closed report/);
  await Promise.resolve();
  controller.abort(new Error("Closed report"));
  resolveRequest({ total: 123 });
  await rejected;
});

for (const [path, name] of [
  [analysisPath, "fetchAnalysisSubLocations"],
  [reportsPath, "fetchSubLocations"],
]) {
  test(`${name}: sublocation discovery is bounded, scoped and keeps input order`, async () => {
    let active = 0;
    let maximum = 0;
    const controller = new AbortController();
    const calls = [];
    const fetchLocations = standaloneFunction(path, name, {
      createCountingHistoryRequestQueue,
      apiFetch: async (route, options) => {
        active += 1;
        maximum = Math.max(maximum, active);
        calls.push({ route, options });
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        return [{ id: route.split("/")[2], company_id: "company-a" }];
      },
      requireSubLocationRows: (rows, companyId) => {
        assert.equal(companyId, "company-a");
        return rows;
      },
      filterScopedApiRows: (rows) => rows,
      selectExplicitCompanyScopedRows: (rows, companyId) => {
        assert.equal(companyId, "company-a");
        return { rows };
      },
    });
    const locations = Array.from({ length: 12 }, (_, i) => ({ id: `location-${i}` }));
    const rows = await fetchLocations(locations, "company-a", controller.signal, true);
    assert.equal(maximum, 4);
    assert.deepEqual(rows.map((row) => row.id), locations.map((row) => row.id));
    assert.ok(calls.every(({ options }) => options.companyScopeId === "company-a" && options.signal === controller.signal));
  });
}

function createDayLoader() {
  const calls = [];
  const pending = new WeakMap();
  const rows = [1, 2, 3, 4].map((day) => ({ bucket: `2026-08-0${day}T00:00:00Z`, total: day * 10 }));
  const load = standaloneFunction(analysisPath, "fetchCachedAnalysisDayDataset", {
    readCoveringAnalysisDayDataset,
    setAnalysisDayCacheEntry: (cache, key, value) => cache.set(key, value),
    pendingAnalysisDayRequestsForCache: (cache) => {
      if (!pending.has(cache)) pending.set(cache, new Map());
      return pending.get(cache);
    },
    fetchAnalysisDataset: async (granularity, range, companyScopeId) => {
      calls.push({ granularity, range, companyScopeId });
      return { granularity, rows: rows.filter((row) => aggregateBucketInRange(row.bucket, "day", range.from, range.to)) };
    },
  });
  return { load, calls, rows };
}

test("a narrower closed-day analysis reuses certified rows without another request", async () => {
  const { load, calls, rows } = createDayLoader();
  const options = { cache: new Map(), cacheScope: "company-a:America/Sao_Paulo", revision: "2026-09-08" };
  const full = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 5) };
  const subset = { from: new Date(2026, 7, 2), to: new Date(2026, 7, 4) };
  await load(full, "company-a", undefined, options);
  const result = await load(subset, "company-a", undefined, options);
  assert.equal(calls.length, 1);
  assert.deepEqual(result.rows, rows.slice(1, 3));
  assert.equal(result.rows.reduce((sum, row) => sum + row.total, 0), 50);
  assert.equal(options.cache.size, 2);
  assert.equal(await load(subset, "company-a", undefined, options), result);
});

test("analysis day reuse never crosses companies, timezone revisions, dates, or incomplete ranges", async () => {
  const { load, calls } = createDayLoader();
  const cache = new Map();
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 5) };
  const options = { cache, cacheScope: "company-a:America/Sao_Paulo", revision: "2026-09-08" };
  await load(range, "company-a", undefined, options);
  await load(range, "company-b", undefined, { ...options, cacheScope: "company-b:America/Sao_Paulo" });
  await load(range, "company-a", undefined, { ...options, cacheScope: "company-a:UTC" });
  await load(range, "company-a", undefined, { ...options, revision: "2026-09-09" });
  await load({ ...range, to: new Date(2026, 7, 6) }, "company-a", undefined, options);
  assert.equal(calls.length, 5);
});

test("failed day datasets cannot satisfy a narrower analysis", () => {
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 5) };
  const cache = new Map([["invalid", {
    cacheScope: "scope", revision: "today", from: +range.from, to: +range.to,
    dataset: { granularity: "day", rows: [], error: "Partial response" },
  }]]);
  assert.equal(readCoveringAnalysisDayDataset(cache, range, "scope", "today"), undefined);
});

function runReportSelectionEffect(bindings) {
  const sourceFile = ts.createSourceFile(reportsPath, read(reportsPath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === "React.useEffect") {
      const candidate = node.arguments[0];
      if (candidate?.getText(sourceFile).includes("Nenhuma visão de relatório está selecionada.")) callback = candidate;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.ok(callback);
  const effect = execute(`module.exports = (${callback.getText(sourceFile)});`, bindings);
  effect();
}

test("changing report view type preserves global data and its in-flight request", () => {
  const controller = new AbortController();
  const bindings = {
    selectedScope: null,
    scopeOptions: [{ id: "new-location" }],
    chartRequestSequenceRef: { current: 2 },
    chartRequestControllerRef: { current: controller },
    activeChartQueryKeyRef: { current: "in-flight" },
    completedChartQueryKeyRef: { current: "complete" },
    abortRequest: () => assert.fail("view composition must not abort company aggregates"),
    setChartLoadError: () => assert.fail("no dataset reset during focus resolution"),
    setChartData: () => assert.fail("no dataset reset during focus resolution"),
  };
  runReportSelectionEffect(bindings);
  assert.equal(bindings.chartRequestSequenceRef.current, 2);
  assert.equal(bindings.chartRequestControllerRef.current, controller);
  assert.equal(bindings.completedChartQueryKeyRef.current, "complete");
});

test("an actually empty report catalog invalidates completed keys with the dataset", () => {
  const bindings = {
    selectedScope: null, scopeOptions: [], chartRequestSequenceRef: { current: 2 },
    chartRequestControllerRef: { current: null }, activeChartQueryKeyRef: { current: "active" },
    completedChartQueryKeyRef: { current: "old" }, setChartLoadError: () => {},
    setChartData: (value) => assert.deepEqual(value, {}),
  };
  runReportSelectionEffect(bindings);
  assert.equal(bindings.activeChartQueryKeyRef.current, "");
  assert.equal(bindings.completedChartQueryKeyRef.current, "");
});

test("query dependencies stay semantic and historical defaults remain unchanged", () => {
  const analysis = read(analysisPath);
  const reports = read(reportsPath);
  const loader = reports.slice(reports.indexOf("  const loadCharts ="), reports.indexOf("  React.useEffect(() => {", reports.indexOf("  const loadCharts =")));
  assert.doesNotMatch(loader, /customWidgets|visibleReportCardIdsKey/);
  assert.match(loader, /requiredCustomGranularitiesKey/);
  assert.match(analysis, /shiftOccupancyAnalysisDateInput\(\s*companyTodayInput,\s*-1/);
  assert.match(analysis, /setAnalysisRequested\(true\)/);
  assert.match(reports, /defaultCountingReportPeriod\(\)/);
  assert.doesNotMatch(analysis + reports, /setInterval\(/);
  assert.match(analysis, /reconcileCountingHistoryItems\(current, next\)/);
  assert.match(reports, /reconcileCountingHistoryItems\(current, next\)/);
  const queryKey = reports.slice(reports.indexOf("  const chartQueryKey ="), reports.indexOf("  const loadScenarios ="));
  assert.match(queryKey, /userId \?\? ""/);
  assert.match(queryKey, /companyTimeZoneResolution\.fallback/);
  assert.match(reports, /\}, \[companyScopeId, userId\]\);/);
  assert.match(loader, /fetchBoundedHourlyAggregateRanges\(\{[\s\S]*?request: requestAggregate/);
});
