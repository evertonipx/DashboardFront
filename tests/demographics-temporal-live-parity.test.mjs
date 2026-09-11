import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8");
const ast = ts.createSourceFile("dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const modules = new Map();
const demographics = load("lib/demographics.ts");
const functions = new Map();
let comparisonReady;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "comparisonReady") comparisonReady = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

for (const [timeZone, from] of [
  ["America/Sao_Paulo", "2026-09-10T03:00:00Z"],
  ["Asia/Kathmandu", "2026-09-09T18:15:00Z"],
  ["America/New_York", "2026-11-01T04:00:00Z"],
]) {
  test(`${timeZone}: bootstrap, cauda, promoção, lacuna e releitura equivalem ao resumo direto`, async () => {
    const harness = fixture(from);
    const cacheRef = { current: null };
    const partitionCache = new Map();
    const options = { cacheRef, partitionCache, companyScopeId: "tenant-a", scopeKey: `tenant-a|${timeZone}|day`, timeZone, signal: new AbortController().signal };
    for (const minutes of [6, 7, 70, 73, 73, 185, 240]) {
      const to = new Date(Date.parse(from) + minutes * 60_000);
      harness.state.now = to.getTime() + 1_000;
      const summary = await harness.live({ ...options, window: { from: new Date(from), to } });
      const expected = demographics.aggregateDemographicBuckets(harness.state.rows.filter((row) => Date.parse(row.bucket) < to.getTime()), { timeZone });
      assert.equal(summary.total, expected.total);
      assert.deepEqual(summary.temporal, expected.temporal, `janela de ${minutes} minutos`);
      assert.deepEqual(summary.gender, expected.gender);
    }
    harness.state.rows = harness.state.rows.map((row) => ({ ...row, count: 0 }));
    harness.state.now += 6 * 3_600_000;
    const to = new Date(Date.parse(from) + 240 * 60_000);
    const zero = await harness.live({ ...options, window: { from: new Date(from), to } });
    assert.equal(zero.hasData, true);
    assert.ok(zero.temporal.bins.every((bin) => bin.total === 0));
    harness.state.rows = [];
    harness.state.now += 6 * 3_600_000;
    const missing = await harness.live({ ...options, window: { from: new Date(from), to } });
    assert.equal(missing.hasData, false);
    assert.deepEqual(missing.temporal.bins, []);
    assert.ok(harness.requests.every((entry) => entry.companyScopeId === "tenant-a"));
  });
}

test("janela idêntica com outro fuso não reutiliza a partição temporal anterior", async () => {
  const from = "2026-09-10T00:00:00Z";
  const harness = fixture(from);
  const cache = new Map();
  const partitions = [{ from: new Date(from), to: new Date("2026-09-10T01:00:00Z") }];
  const options = { cache, companyScopeId: "tenant-a", partitions, signal: new AbortController().signal };
  const utc = await harness.partitioned({ ...options, timeZone: "UTC" });
  const kathmandu = await harness.partitioned({ ...options, timeZone: "Asia/Kathmandu" });
  assert.equal(harness.requests.length, 2);
  assert.equal(cache.size, 2);
  assert.equal(utc.temporal.bins.length, 1);
  assert.equal(kathmandu.temporal.bins.length, 2);
  assert.equal(utc.total, kathmandu.total);
});

test("comparação aguarda a publicação principal da janela e refresh atuais", () => {
  assert.ok(comparisonReady);
  const through = Date.parse("2026-09-10T15:00:00Z");
  const base = {
    dataState: { key: "scope", refreshVersion: 2, through },
    dataScopeKey: "scope", refreshVersion: 2,
    requestWindow: { to: new Date(through) },
    summary: { hasData: true }, loading: false, refreshing: false, error: "",
  };
  const ready = (changes = {}) => execute(`return ${comparisonReady};`, { ...base, ...changes });
  assert.equal(ready(), true);
  assert.equal(ready({ refreshVersion: 3 }), false, "Atualizar não libera comparação sobre o snapshot anterior");
  assert.equal(ready({ requestWindow: { to: new Date(through + 60_000) } }), false, "tick Live aguarda o minuto novo no principal");
  assert.equal(ready({ dataScopeKey: "other" }), false);
  assert.equal(ready({ refreshing: true }), false);
  assert.equal(ready({ error: "principal indisponível" }), false);
});

test("Atualizar aborta baseline sincronamente e resposta antiga não repovoa o cache limpo", async () => {
  const harness = fixture("2026-09-10T03:00:00Z");
  const cache = new Map();
  const controller = new AbortController();
  let release;
  harness.state.wait = new Promise((resolveRequest) => { release = resolveRequest; });
  const request = harness.partitioned({
    cache, companyScopeId: "tenant-a", timeZone: "America/Sao_Paulo", signal: controller.signal,
    partitions: [{ from: new Date("2026-09-10T03:00:00Z"), to: new Date("2026-09-10T04:00:00Z") }],
  });
  const comparisonRequestRef = { current: controller };
  const comparisonCacheRef = { current: { summary: "stale" } };
  const liveRetryRef = { current: { failures: 2, retryAt: Date.now() + 60_000 } };
  const comparisonRetryRef = { current: { failures: 1, retryAt: Date.now() + 60_000 } };
  const refresh = execute(`${functions.get("requestFreshData")}\nreturn requestFreshData;`, {
    requestSequenceRef: { current: 1 }, activeRequestRef: { current: null }, comparisonRequestRef,
    pendingLiveAggregationRef: { current: null }, liveCacheRef: { current: null }, partitionCacheRef: { current: cache },
    comparisonCacheRef, liveRetryRef, comparisonRetryRef,
    surface: "analysis", historicalQueryIdentityKey: "identity", setHistoricalQueryScopeKey() {},
    abortRequest: (target) => target.abort(), setClock() {}, setRefreshVersion() {},
  });
  refresh(new Date("2026-09-10T04:00:00Z"));
  assert.equal(controller.signal.aborted, true);
  assert.equal(comparisonRequestRef.current, null);
  assert.equal(comparisonCacheRef.current, null);
  assert.equal(liveRetryRef.current, null);
  assert.equal(comparisonRetryRef.current, null);
  release();
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(cache.size, 0);
});

function fixture(from) {
  const state = {
    now: Date.parse(from), wait: undefined,
    rows: Array.from({ length: 240 }, (_, minute) => ({
      bucket: new Date(Date.parse(from) + minute * 60_000).toISOString(),
      count: minute % 7 === 0 ? 0 : minute + 1,
      camera_id: "fixture-camera", gender: ["Woman", "Man", "unknown"][minute % 3],
      age_bucket: ["0-2", "20-29", "70+"][minute % 3], emotion: ["happy", "sad", "neutral"][minute % 3],
    })),
  };
  const requests = [];
  class FixtureDate extends Date { static now() { return state.now; } }
  const names = ["buildInstantPartitions", "fetchDemographicResponse", "fetchDemographicRows", "fetchDemographicSummary", "demographicPartitionCacheKey", "cacheDemographicPartition", "loadPartitionedDemographicAggregation", "loadLiveDemographicAggregation"];
  const result = execute(`${names.map((name) => functions.get(name)).join("\n")}\nreturn {live:loadLiveDemographicAggregation,partitioned:loadPartitionedDemographicAggregation};`, {
    ...demographics, Date: FixtureDate, MINUTE_MS: 60_000, LIVE_TAIL_MINUTES: 5, LIVE_FULL_REFRESH_MS: 6 * 3_600_000, MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES: 400,
    apiFetch: async (path, options) => {
      const query = new URL(path, "http://fixture.invalid").searchParams;
      const request = { ...options, from: Date.parse(query.get("from")), to: Date.parse(query.get("to")) };
      requests.push(request);
      await state.wait;
      return { data: state.rows.filter((row) => Date.parse(row.bucket) >= request.from && Date.parse(row.bucket) < request.to).map((row) => ({ ...row })) };
    },
  });
  return { ...result, state, requests };
}

function execute(text, bindings) {
  const javascript = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), javascript)(...Object.values(bindings));
}

function load(path) {
  if (modules.has(path)) return modules.get(path);
  const loaded = { exports: {} };
  execute(readFileSync(resolve(root, path), "utf8"), { module: loaded, exports: loaded.exports, require: (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name) });
  modules.set(path, loaded.exports);
  return loaded.exports;
}
