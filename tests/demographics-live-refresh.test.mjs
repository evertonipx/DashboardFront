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
const sourceFile = ts.createSourceFile("demographics-dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const demographics = loadDemographics();
const sixHours = 6 * 60 * 60 * 1_000;

test("releitura integral de seis horas atualiza partições antigas: 7 passa para 11", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  assert.equal((await harness.live(options)).total, 7);
  harness.state.rows[0] = { ...harness.state.rows[0], count: 9 };
  harness.state.now += sixHours;
  const updated = await harness.live(options);
  assert.equal(updated.total, 11);
  assert.equal(updated.temporal.timeZone, "America/Sao_Paulo");
  assert.equal(updated.temporal.bins.reduce((sum, bin) => sum + bin.total, 0), 11);
  assert.equal(options.cacheRef.current.lastFullRefreshAt, harness.state.now);
  assert.equal(harness.requests.filter(({ from, to }) =>
    from.toISOString() === "2026-09-10T04:00:00.000Z" &&
    to.toISOString() === "2026-09-10T05:00:00.000Z",
  ).length, 2, "a hora corrigida deve chegar à API de novo, mesmo com a mesma chave");
});

test("releitura integral substitui resumo positivo por zero explícito e depois ausência", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  await harness.live(options);
  harness.state.rows = harness.state.rows.map((row) => ({ ...row, count: 0 }));
  harness.state.now += sixHours;
  const zero = await harness.live(options);
  assert.equal(zero.total, 0);
  assert.equal(zero.hasData, true);
  assert.ok(zero.gender.every(({ percentage }) => percentage === null));
  harness.state.rows = [];
  harness.state.now += sixHours;
  const missing = await harness.live(options);
  assert.equal(missing.total, 0);
  assert.equal(missing.hasData, false);
  assert.ok([...options.partitionCache.values()].every((summary) => summary.total === 0 && !summary.hasData));
});

test("polling entre releituras consulta só a cauda e não duplica minutos promovidos", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  assert.equal((await harness.live(options)).total, 7);
  const bootstrapCalls = harness.requests.length;
  harness.state.rows.push(row("2026-09-10T09:00:00Z", 3));
  for (const minute of [1, 4, 6]) {
    harness.state.now = Date.parse("2026-09-10T09:00:10Z") + minute * 60_000;
    const summary = await harness.live({
      ...options,
      window: { ...options.window, to: new Date(Date.parse("2026-09-10T09:00:00Z") + minute * 60_000) },
    });
    assert.equal(summary.total, 10);
  }
  assert.equal(harness.requests.length - bootstrapCalls, 3);
  assert.ok(harness.requests.slice(bootstrapCalls).every(({ from, to }) => to - from === 5 * 60_000));
  assert.equal(options.cacheRef.current.stableSummary.total, 10);
});

test("revalidar uma empresa/período preserva entradas de outra empresa e outro intervalo", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  const foreignKey = JSON.stringify(["tenant-b", "2026-09-10T04:00:00.000Z", "2026-09-10T05:00:00.000Z"]);
  const historicalKey = JSON.stringify(["tenant-a", "2026-09-09T03:00:00.000Z", "2026-09-09T04:00:00.000Z"]);
  const foreign = demographics.summarizeDemographicBuckets({ data: [row("2026-09-10T04:30:00Z", 99)] });
  const historical = demographics.summarizeDemographicBuckets({ data: [row("2026-09-09T03:30:00Z", 88)] });
  options.partitionCache.set(foreignKey, foreign);
  options.partitionCache.set(historicalKey, historical);
  await harness.live(options);
  harness.state.rows[0] = { ...harness.state.rows[0], count: 9 };
  harness.state.now += sixHours;
  assert.equal((await harness.live(options)).total, 11);
  assert.equal(options.partitionCache.get(foreignKey), foreign);
  assert.equal(options.partitionCache.get(historicalKey), historical);
  assert.ok(harness.requests.every(({ companyScopeId }) => companyScopeId === "tenant-a"));
});

test("cancelar a cauda de uma releitura não publica snapshot nem nova validade", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  await harness.live(options);
  const before = structuredClone(options.cacheRef.current);
  harness.state.rows[0] = { ...harness.state.rows[0], count: 9 };
  harness.state.now += sixHours;
  const controller = new AbortController();
  harness.state.onRequest = ({ from }) => {
    if (from.toISOString() === "2026-09-10T08:55:00.000Z") controller.abort();
  };
  await assert.rejects(harness.live({ ...options, signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(options.cacheRef.current, before);
  harness.state.onRequest = null;
  assert.equal((await harness.live(options)).total, 11);
});

test("falha em partição fechada não retorna total antigo como atualização bem-sucedida", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  await harness.live(options);
  const before = structuredClone(options.cacheRef.current);
  harness.state.now += sixHours;
  harness.state.onRequest = ({ from }) => {
    if (from.toISOString() === "2026-09-10T04:00:00.000Z") throw new Error("fixture unavailable");
  };
  await assert.rejects(harness.live(options), /fixture unavailable/);
  assert.deepEqual(options.cacheRef.current, before);
  harness.state.rows = [];
  harness.state.onRequest = null;
  assert.equal((await harness.live(options)).hasData, false);
});

test("fonte já cancelada não reutiliza snapshot nem trata intervalo vazio como sucesso", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  await harness.live(options);
  const controller = new AbortController();
  controller.abort();
  const requestCount = harness.requests.length;
  await assert.rejects(harness.live({ ...options, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(harness.partitioned({
    cache: options.partitionCache,
    companyScopeId: "tenant-a",
    partitions: [],
    signal: controller.signal,
  }), { name: "AbortError" });
  assert.equal(harness.requests.length, requestCount);
});

test("releitura conserva concorrência de duas partições e deduplica consumidores", async () => {
  const harness = makeHarness();
  const options = liveOptions();
  harness.state.onRequest = () => new Promise((resolveRequest) => setTimeout(resolveRequest, 1));
  const shared = { ...options, pendingRef: { current: null }, refreshVersion: 0 };
  const [first, second] = await Promise.all([harness.shared(shared), harness.shared(shared)]);
  assert.equal(first.total, 7);
  assert.deepEqual(first, second);
  assert.equal(harness.requests.length, 7, "seis partições estáveis e uma cauda para os dois consumidores");
  assert.equal(harness.state.maximumActive, 2);
  assert.equal(shared.pendingRef.current, null);
});

function makeHarness() {
  const state = {
    now: Date.parse("2026-09-10T09:00:10Z"),
    rows: [row("2026-09-10T04:30:00Z", 5), row("2026-09-10T08:58:00Z", 2)],
    onRequest: null,
    active: 0,
    maximumActive: 0,
  };
  const requests = [];
  class FixtureDate extends Date {
    static now() { return state.now; }
  }
  const bindings = {
    ...demographics,
    Date: FixtureDate,
    LIVE_FULL_REFRESH_MS: sixHours,
    LIVE_TAIL_MINUTES: 5,
    MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES: 96,
    MINUTE_MS: 60_000,
    abortRequest: (controller) => controller.abort(),
    apiFetch: async (path, options) => {
      const params = new URL(path, "http://fixture.invalid").searchParams;
      assert.deepEqual([...params.keys()].sort(), ["from", "to"], "o contrato não possui paginação ou teto declarado");
      const from = new Date(params.get("from"));
      const to = new Date(params.get("to"));
      const request = { ...options, from, to };
      requests.push(request);
      state.active += 1;
      state.maximumActive = Math.max(state.maximumActive, state.active);
      try {
        await state.onRequest?.(request);
        return {
          data: state.rows
            .filter(({ bucket }) => Date.parse(bucket) >= from.getTime() && Date.parse(bucket) < to.getTime())
            .map((row) => ({ ...row })),
        };
      } finally {
        state.active -= 1;
      }
    },
  };
  for (const name of [
    "buildInstantPartitions",
    "fetchDemographicResponse",
    "fetchDemographicRows",
    "fetchDemographicSummary",
    "demographicPartitionCacheKey",
    "cacheDemographicPartition",
    "loadPartitionedDemographicAggregation",
    "loadLiveDemographicAggregation",
    "liveDemographicRequestKey",
    "loadSharedLiveDemographicAggregation",
  ]) bindings[name] = standalone(name, bindings);
  return {
    live: bindings.loadLiveDemographicAggregation,
    partitioned: bindings.loadPartitionedDemographicAggregation,
    shared: bindings.loadSharedLiveDemographicAggregation,
    requests,
    state,
  };
}

function loadDemographics(path = "lib/demographics.ts") {
  const loadedModule = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("module", "exports", "require", compiled)(loadedModule, loadedModule.exports, (name) =>
    name.startsWith("@/") ? loadDemographics(`${name.slice(2)}.ts`) : require(name));
  return loadedModule.exports;
}

function standalone(name, bindings) {
  const node = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `${name} exists`);
  const compiled = ts.transpileModule(`const target = ${node.getText(sourceFile)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn target;`)(...Object.values(bindings));
}

function liveOptions() {
  return {
    cacheRef: { current: null },
    companyScopeId: "tenant-a",
    partitionCache: new Map(),
    scopeKey: "tenant-a|America/Sao_Paulo|2026-09-10",
    timeZone: "America/Sao_Paulo",
    signal: new AbortController().signal,
    window: { from: new Date("2026-09-10T03:00:00Z"), to: new Date("2026-09-10T09:00:00Z") },
  };
}

function row(bucket, count) {
  return { bucket, count, camera_id: "camera-a", age_bucket: "20-29", gender: "Woman", emotion: "happy" };
}
