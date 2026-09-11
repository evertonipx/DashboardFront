import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const modules = new Map();
const { aggregateDemographicBuckets } = load("lib/demographics.ts");
const SIX_HOURS = 6 * 3_600_000;
const MINUTE = 60_000;
const FROM = Date.parse("2026-09-10T03:00:00Z");

test("avanço de minuto busca somente o delta e preserva totais e marginais temporais", async () => {
  const harness = fixture();
  const source = [row(0, 2), row(1, 3), row(2, 4), row(3, 5)];
  harness.state.rows = source;
  for (const minutes of [1, 2, 3, 4]) {
    const summary = await harness.query(minutes);
    assert.deepEqual(summary, aggregate(source.slice(0, minutes)));
  }
  assert.deepEqual(harness.requests.map(({ from, to }) => [from, to]), [
    [FROM, FROM + MINUTE], [FROM + MINUTE, FROM + 2 * MINUTE],
    [FROM + 2 * MINUTE, FROM + 3 * MINUTE], [FROM + 3 * MINUTE, FROM + 4 * MINUTE],
  ]);
  assert.ok(harness.requests.every(({ revalidate }) => revalidate === false));
  const snapshot = harness.cacheRef.current;
  assert.equal(await harness.query(4), snapshot.summary);
  assert.equal(harness.cacheRef.current, snapshot);
  assert.equal(harness.requests.length, 4, "mesmo corte não consulta nem reconsolida");
});

test("seis horas exigem releitura integral e substituem correções, zeros e ausência", async () => {
  const harness = fixture();
  harness.state.rows = [row(0, 7)];
  assert.equal((await harness.query(2)).total, 7);
  const firstFullAt = harness.cacheRef.current.lastFullRefreshAt;
  harness.state.now += SIX_HOURS - 1;
  harness.state.rows = [row(0, 11)];
  assert.equal((await harness.query(3)).total, 7, "delta não inventa correções ao prefixo fechado");
  assert.equal(harness.cacheRef.current.lastFullRefreshAt, firstFullAt);
  harness.state.now += 1;
  assert.equal((await harness.query(3)).total, 11);
  assert.deepEqual(harness.requests.at(-1), { from: FROM, to: FROM + 3 * MINUTE, revalidate: true });
  for (const rows of [[row(0, 0)], []]) {
    harness.state.rows = rows;
    harness.state.now += SIX_HOURS;
    const summary = await harness.query(3);
    assert.deepEqual(summary, aggregate(rows));
    assert.equal(summary.total, 0);
    assert.ok(summary.gender.every(({ percentage }) => percentage === null));
    assert.equal(summary.hasData, rows.length > 0);
    const count = harness.requests.length;
    assert.equal(await harness.query(3), summary);
    assert.equal(harness.requests.length, count, "zero e ausência são resultados cacheáveis");
  }
});

test("primeira carga, retrocesso e mudança de início permitem reutilizar partições principais", async () => {
  const harness = fixture();
  harness.state.rows = [row(0, 2), row(1, 3), row(2, 4)];
  await harness.query(3);
  assert.equal((await harness.query(1)).total, 2);
  assert.equal((await harness.query(3, { from: new Date(FROM + MINUTE) })).total, 7);
  assert.deepEqual(harness.requests, [
    { from: FROM, to: FROM + 3 * MINUTE, revalidate: false },
    { from: FROM, to: FROM + MINUTE, revalidate: false },
    { from: FROM + MINUTE, to: FROM + 3 * MINUTE, revalidate: false },
  ]);
});

test("troca de identidade e limpeza manual nunca combinam resumos de escopos anteriores", async () => {
  const harness = fixture();
  harness.state.rows = [row(0, 7)];
  await harness.query(1);
  for (const scopeKey of ["another-user|tenant-a|America/Sao_Paulo|previous-period", "user|tenant-b|UTC|previous-week"]) {
    harness.state.rows = [row(0, 2)];
    const summary = await harness.query(2, { scopeKey });
    assert.equal(summary.total, 2);
    assert.equal(harness.cacheRef.current.scopeKey, scopeKey);
    assert.equal(harness.requests.at(-1).from, FROM);
    assert.equal(harness.requests.at(-1).revalidate, false);
  }
  harness.cacheRef.current = null;
  harness.state.rows = [];
  assert.equal((await harness.query(2)).hasData, false);
  assert.equal(harness.requests.at(-1).from, FROM);
});

test("aborto durante a carga ou antes do cache hit não publica nem renova a validade", async () => {
  const harness = fixture();
  await harness.query(1);
  const previous = harness.cacheRef.current;
  const controller = new AbortController();
  const pending = deferred();
  const loadRange = () => pending.promise;
  const request = harness.query(2, { signal: controller.signal, loadRange });
  controller.abort();
  pending.resolve(aggregate([row(1, 5)]));
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(harness.cacheRef.current, previous);
  await assert.rejects(harness.query(1, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(harness.requests.length, 1);
});

test("falha da releitura conserva o snapshot e a próxima tentativa continua integral", async () => {
  const harness = fixture();
  await harness.query(1);
  const previous = harness.cacheRef.current;
  harness.state.now += SIX_HOURS;
  harness.state.failure = new Error("fixture unavailable");
  await assert.rejects(harness.query(2), /fixture unavailable/);
  assert.equal(harness.cacheRef.current, previous);
  harness.state.failure = null;
  await harness.query(2);
  assert.deepEqual(harness.requests.slice(-2), [
    { from: FROM, to: FROM + 2 * MINUTE, revalidate: true },
    { from: FROM, to: FROM + 2 * MINUTE, revalidate: true },
  ]);
});

test("respostas fora de ordem não substituem a janela mais nova nem o novo escopo", async () => {
  for (const changeScope of [false, true]) {
    const harness = fixture();
    const old = deferred();
    const fresh = deferred();
    const olderRequest = harness.query(1, { loadRange: () => old.promise });
    const newerRequest = harness.query(2, { scopeKey: changeScope ? "new-tenant" : harness.scopeKey, loadRange: () => fresh.promise });
    fresh.resolve(aggregate([row(0, 9)]));
    const latest = await newerRequest;
    const latestCache = harness.cacheRef.current;
    old.resolve(aggregate([row(0, 3)]));
    assert.equal((await olderRequest).total, 3, "cada consumidor recebe seu intervalo; publicação depende da geração");
    assert.equal(harness.cacheRef.current, latestCache);
    assert.equal(harness.cacheRef.current.summary, latest);
    assert.equal(harness.cacheRef.current.to, FROM + 2 * MINUTE);
    assert.equal(harness.cacheRef.current.scopeKey, changeScope ? "new-tenant" : harness.scopeKey);
  }
});

test("cache hit mais recente também invalida publicação de uma expansão obsoleta", async () => {
  const harness = fixture();
  await harness.query(1);
  const previous = harness.cacheRef.current;
  const pending = deferred();
  const obsolete = harness.query(3, { loadRange: () => pending.promise });
  assert.equal(await harness.query(1), previous.summary);
  pending.resolve(aggregate([row(1, 5)]));
  await obsolete;
  assert.equal(harness.cacheRef.current, previous);
});

test("limpeza manual ou substituição da referência impede escrita tardia mesmo sem novo pedido", async () => {
  const harness = fixture();
  await harness.query(1);
  const pending = deferred();
  const obsolete = harness.query(2, { loadRange: () => pending.promise });
  harness.cacheRef.current = null;
  pending.resolve(aggregate([row(1, 5)]));
  await obsolete;
  assert.equal(harness.cacheRef.current, null);
});

test("intervalos inválidos são recusados antes da consulta; intervalo vazio conserva ausência", async () => {
  const harness = fixture();
  for (const change of [{ from: new Date(NaN) }, { to: new Date(NaN) }, { from: new Date(FROM + 3 * MINUTE) }, { scopeKey: " " }]) {
    await assert.rejects(harness.query(1, change), { name: "RangeError" });
  }
  assert.equal(harness.requests.length, 0);
  const empty = await harness.query(0);
  assert.equal(empty.hasData, false);
  assert.ok(empty.gender.every(({ percentage }) => percentage === null));
  assert.equal(await harness.query(0), empty);
  assert.equal(harness.requests.length, 1, "o loader de intervalo vazio pode retornar o resumo sem HTTP");
});

test("instantes de fusos fracionários e da repetição DST não arredondam o delta", async () => {
  for (const [from, firstTo, secondTo] of [
    ["2026-09-09T18:15:00Z", "2026-09-09T18:16:00Z", "2026-09-09T18:17:00Z"],
    ["2026-11-01T04:00:00Z", "2026-11-01T05:59:00Z", "2026-11-01T06:01:00Z"],
  ]) {
    const harness = fixture();
    await harness.query(1, { from: new Date(from), to: new Date(firstTo) });
    await harness.query(1, { from: new Date(from), to: new Date(secondTo) });
    assert.deepEqual(harness.requests.map(({ from, to }) => [from, to]), [
      [Date.parse(from), Date.parse(firstTo)], [Date.parse(firstTo), Date.parse(secondTo)],
    ]);
  }
});

test("relógio que retrocede exige reconciliação sem estender validade indefinidamente", async () => {
  const harness = fixture();
  await harness.query(1);
  harness.state.now -= MINUTE;
  await harness.query(1);
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].revalidate, true);
});

function fixture() {
  const state = { now: Date.parse("2026-09-11T13:00:00Z"), rows: [], failure: null };
  const requests = [];
  const cacheRef = { current: null };
  const scopeKey = "user|tenant-a|America/Sao_Paulo|previous-period|2026-09-10";
  class FixtureDate extends Date { static now() { return state.now; } }
  const { loadDemographicComparisonAggregation } = load("lib/demographics-comparison-query.ts", { Date: FixtureDate });
  const loadRange = async (from, to, signal, options) => {
    requests.push({ from: from.getTime(), to: to.getTime(), revalidate: options.revalidate });
    signal.throwIfAborted();
    if (state.failure) throw state.failure;
    return aggregate(state.rows.filter(({ bucket }) => Date.parse(bucket) >= from.getTime() && Date.parse(bucket) < to.getTime()));
  };
  const query = (minutes, changes = {}) => loadDemographicComparisonAggregation({
    cacheRef, scopeKey, from: new Date(FROM), to: new Date(FROM + minutes * MINUTE),
    signal: new AbortController().signal, loadRange, ...changes,
  });
  return { state, requests, cacheRef, scopeKey, query };
}

function aggregate(rows) { return aggregateDemographicBuckets(rows, { timeZone: "America/Sao_Paulo" }); }
function row(minute, count) {
  return { bucket: new Date(FROM + minute * MINUTE).toISOString(), count, camera_id: "fixture-camera", gender: minute % 2 ? "Man" : "Woman", age_bucket: "20-29", emotion: "happy" };
}
function deferred() { let resolveRequest; const promise = new Promise((resolve) => { resolveRequest = resolve; }); return { promise, resolve: resolveRequest }; }

function load(path, bindings = {}) {
  if (!Object.keys(bindings).length && modules.has(path)) return modules.get(path);
  const loadedModule = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", ...Object.keys(bindings), compiled)(loadedModule, loadedModule.exports,
    (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name), ...Object.values(bindings));
  if (!Object.keys(bindings).length) modules.set(path, loadedModule.exports);
  return loadedModule.exports;
}
