import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.TZ = "America/Sao_Paulo";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "components/app/realtime-dashboard.tsx"), "utf8");
const sourceFile = ts.createSourceFile("realtime-dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const scope = "tenant-a:America/Sao_Paulo";

test("hora aberta revalida todos os minutos e propaga aumento, zero e remoção", async () => {
  const harness = makeHarness();
  const closed = row("2026-09-10T12:50:00Z", 4);
  const current = row("2026-09-10T13:05:00Z", 2);
  const latest = row("2026-09-10T13:39:00Z", 1);
  harness.state.minute = [closed, current, latest];
  const options = minuteOptions("2026-09-10T13:40:10Z", "2026-09-10T12:40:00Z", "2026-09-10T13:41:00Z");
  assert.equal(total(await harness.minute(options)), 7);
  harness.state.minute = [closed, { ...current, total: 9 }, latest];
  assert.equal(total(await harness.minute(options)), 14);
  harness.state.minute = [closed, { ...current, total: 0 }, latest];
  assert.equal(total(await harness.minute(options)), 5);
  harness.state.minute = [closed, latest];
  assert.equal(total(await harness.minute(options)), 5);
  assert.equal(harness.requests.length, 5, "um prefixo fechado e uma hora aberta por refresh");
  assert.deepEqual(harness.requests.slice(1).map(requestBounds), Array(4).fill([
    "2026-09-10T13:00:00.000Z", "2026-09-10T13:41:00.000Z",
  ]));
  assert.deepEqual(
    options.cache.rows.map(({ bucket, total }) => [date(bucket).getTime(), total]),
    [[date(closed.bucket).getTime(), closed.total]],
    "a hora mutável nunca entra no cache fechado",
  );
  assert.ok(harness.requests.every((request) => request.companyScopeId === "tenant-a"));
});

test("virada da hora certifica o prefixo fechado sem duplicar a nova hora", async () => {
  const harness = makeHarness();
  harness.state.minute = [row("2026-09-10T13:05:00Z", 2)];
  const options = minuteOptions("2026-09-10T13:59:10Z", "2026-09-10T13:00:00Z", "2026-09-10T14:00:00Z");
  assert.equal(total(await harness.minute(options)), 2);
  harness.state.minute = [row("2026-09-10T13:05:00Z", 8), row("2026-09-10T14:00:00Z", 1)];
  const next = {
    ...options,
    now: date("2026-09-10T14:00:10Z"),
    definition: { ...options.definition, to: date("2026-09-10T14:01:00Z") },
  };
  assert.equal(total(await harness.minute(next)), 9);
  assert.deepEqual(harness.requests.slice(1).map(requestBounds), [
    ["2026-09-10T13:00:00.000Z", "2026-09-10T14:00:00.000Z"],
    ["2026-09-10T14:00:00.000Z", "2026-09-10T14:01:00.000Z"],
  ]);
});

test("meia-noite civil não inclui o dia anterior nem o limite exclusivo", async () => {
  const harness = makeHarness();
  harness.state.minute = [
    row("2026-09-10T02:59:00Z", 90),
    row("2026-09-10T03:00:00Z", 3),
    row("2026-09-10T03:01:00Z", 70),
  ];
  const rows = await harness.minute(minuteOptions(
    "2026-09-10T03:00:10Z", "2026-09-10T03:00:00Z", "2026-09-10T03:01:00Z",
  ));
  assert.equal(total(rows), 3);
  assert.deepEqual(harness.requests.map(requestBounds), [[
    "2026-09-10T03:00:00.000Z", "2026-09-10T03:01:00.000Z",
  ]]);
});

test("erro ou cancelamento da hora aberta não promove a cobertura dos minutos", async () => {
  for (const abort of [false, true]) {
    const harness = makeHarness();
    const controller = new AbortController();
    harness.state.minute = [row("2026-09-10T12:50:00Z", 4)];
    const options = minuteOptions("2026-09-10T13:40:10Z", "2026-09-10T12:40:00Z", "2026-09-10T13:41:00Z");
    await harness.minute(options);
    const before = structuredClone(options.cache);
    harness.state.minute.push(row("2026-09-10T13:50:00Z", 7));
    harness.state.onRequest = ({ from }) => {
      if (from.getTime() !== date("2026-09-10T14:00:00Z").getTime()) return;
      if (abort) controller.abort();
      else throw new Error("fixture unavailable");
    };
    await assert.rejects(harness.minute({
      ...options,
      now: date("2026-09-10T14:00:10Z"),
      signal: controller.signal,
      definition: { ...options.definition, from: date("2026-09-10T13:00:00Z"), to: date("2026-09-10T14:01:00Z") },
    }));
    assert.deepEqual(options.cache, before);
  }
});

test("revisão horária substitui apenas hoje e ontem, incluindo correções para zero", async () => {
  const harness = makeHarness();
  const historical = row("2025-05-10T12:00:00Z", 50);
  const older = row("2026-09-08T12:00:00Z", 30);
  const yesterday = row("2026-09-09T12:00:00Z", 10);
  const today = row("2026-09-10T12:00:00Z", 7);
  harness.state.hour = [historical, older, yesterday, today];
  const options = hourOptions();
  assert.equal(total(await harness.hour(options)), 97);
  const initialRequests = harness.requests.length;
  await harness.hour(options);
  assert.equal(harness.requests.length, initialRequests, "a mesma revisão não rebaixa horas fechadas");

  harness.state.hour = [historical, older, { ...today, total: 20 }];
  assert.equal(total(await harness.hour({ ...options, now: date("2026-09-10T14:10:00Z") })), 100);
  assert.deepEqual(harness.requests.slice(initialRequests).map(requestBounds), [[
    "2026-09-09T03:00:00.000Z", "2026-09-10T13:00:00.000Z",
  ]]);
  harness.state.hour = [historical, older, { ...today, total: 0 }];
  assert.equal(total(await harness.hour({ ...options, now: date("2026-09-10T15:10:00Z") })), 80);
  harness.state.hour = [historical, older];
  const emptyRecent = await harness.hour({ ...options, now: date("2026-09-10T16:10:00Z") });
  assert.equal(total(emptyRecent), 80);
  assert.equal(emptyRecent.length, 2, "resposta vazia remove a identidade anteriormente corrigida para zero");
});

test("histórico fechado recebe revisão diária, não a cada refresh horário", async () => {
  const harness = makeHarness();
  const old = row("2025-05-10T12:00:00Z", 50);
  harness.state.hour = [old];
  const options = hourOptions();
  await harness.hour(options);
  harness.state.hour = [{ ...old, total: 4 }];
  const sameDay = await harness.hour({ ...options, now: date("2026-09-10T14:10:00Z") });
  assert.equal(total(sameDay), 50);
  const nextDay = await harness.hour({ ...options, now: date("2026-09-11T03:01:00Z") });
  assert.equal(total(nextDay), 4);
  assert.equal(options.coverageCache.dayRevision, "2026-09-11T03:00:00.000Z");
});

test("erro ou cancelamento de revalidação horária não publica nem promove revisão", async () => {
  for (const abort of [false, true]) {
    const harness = makeHarness();
    harness.state.hour = [row("2026-09-10T12:00:00Z", 7)];
    const options = hourOptions();
    await harness.hour(options);
    const before = structuredClone(options.coverageCache);
    const controller = new AbortController();
    harness.state.onRequest = () => {
      if (abort) controller.abort();
      else throw new Error("fixture unavailable");
    };
    const next = { ...options, now: date("2026-09-10T14:10:00Z"), signal: controller.signal };
    await assert.rejects(harness.hour(next));
    assert.deepEqual(options.coverageCache, before);
    harness.state.onRequest = null;
    harness.state.hour = [];
    assert.deepEqual(await harness.hour({ ...next, signal: new AbortController().signal }), []);
    assert.equal(options.coverageCache.hourRevision, "2026-09-10T14:00:00.000Z");
  }
});

test("bootstrap diário revalida prefixo por hora; reconciliar cauda não renova sua revisão", async () => {
  const harness = makeHarness();
  const options = dayOptions();
  harness.state.minute = [row("2026-09-10T09:00:00Z", 5)];
  assert.equal(total(await harness.day.fetchMinuteDayAggregateBootstrap(options)), 5);
  await harness.day.fetchMinuteDayAggregateBootstrap({ ...options, now: date("2026-09-10T13:45:00Z") });
  assert.equal(harness.requests.length, 1);
  const key = harness.day.minuteDayAggregateCacheKey(scope, "count", options.from);
  await harness.day.refreshMinuteDayAggregateCache({
    ...options,
    now: date("2026-09-10T14:10:00Z"),
    sourceFrom: date("2026-09-10T11:00:00Z"),
    sourceTo: date("2026-09-10T13:00:00Z"),
    sourceRows: [row("2026-09-10T12:10:00Z", 2)],
  });
  assert.equal(options.cache.get(key).revision, "2026-09-10T13:00:00.000Z");
  harness.state.minute = [row("2026-09-10T12:10:00Z", 2)];
  assert.equal(total(await harness.day.fetchMinuteDayAggregateBootstrap({
    ...options,
    now: date("2026-09-10T14:10:00Z"),
    to: date("2026-09-10T13:00:00Z"),
  })), 2);
  assert.equal(harness.requests.length, 2);
  assert.equal(options.cache.get(key).revision, "2026-09-10T14:00:00.000Z");
  harness.state.minute = [];
  assert.deepEqual(await harness.day.fetchMinuteDayAggregateBootstrap({
    ...options, now: date("2026-09-10T15:10:00Z"),
  }), []);
});

test("bootstrap diário sinaliza falha de revalidação, sem retornar total antigo", async () => {
  const harness = makeHarness();
  const options = dayOptions();
  harness.state.minute = [row("2026-09-10T09:00:00Z", 5)];
  await harness.day.fetchMinuteDayAggregateBootstrap(options);
  harness.state.onRequest = () => { throw new Error("fixture unavailable"); };
  const next = { ...options, now: date("2026-09-10T14:10:00Z") };
  await assert.rejects(harness.day.fetchMinuteDayAggregateBootstrap(next), /fixture unavailable/);
  const key = harness.day.minuteDayAggregateCacheKey(scope, "count", options.from);
  assert.equal(options.cache.get(key).status, "error");
  const requestCount = harness.requests.length;
  await assert.rejects(harness.day.fetchMinuteDayAggregateBootstrap(next), /fixture unavailable/);
  assert.equal(harness.requests.length, requestCount, "retentativas da mesma falha permanecem limitadas por minuto");
  harness.state.onRequest = null;
  harness.state.minute = [];
  assert.deepEqual(await harness.day.fetchMinuteDayAggregateBootstrap({
    ...next, now: date("2026-09-10T14:11:00Z"),
  }), []);
});

test("cancelar novo bootstrap não promove a revisão nem destrói o snapshot anterior", async () => {
  const harness = makeHarness();
  const options = dayOptions();
  harness.state.minute = [row("2026-09-10T09:00:00Z", 5)];
  await harness.day.fetchMinuteDayAggregateBootstrap(options);
  const key = harness.day.minuteDayAggregateCacheKey(scope, "count", options.from);
  const before = structuredClone(options.cache.get(key));
  const controller = new AbortController();
  harness.state.onRequest = () => controller.abort();
  await assert.rejects(harness.day.fetchMinuteDayAggregateBootstrap({
    ...options, now: date("2026-09-10T14:10:00Z"), signal: controller.signal,
  }), { name: "AbortError" });
  assert.deepEqual(options.cache.get(key), before);
  harness.state.onRequest = null;
  harness.state.minute = [];
  assert.deepEqual(await harness.day.fetchMinuteDayAggregateBootstrap({
    ...options, now: date("2026-09-10T14:10:00Z"),
  }), []);
});

function makeHarness() {
  const requests = [];
  const state = { hour: [], minute: [], onRequest: null };
  const modules = new Map();
  let time;
  const apiFetch = async (path, options = {}) => {
    const params = new URL(path, "http://fixture.invalid").searchParams;
    const granularity = params.get("granularity");
    const from = date(params.get("from"));
    const to = date(params.get("to"));
    const request = { from, to, granularity, ...options };
    requests.push(request);
    await state.onRequest?.(request);
    assert.ok(granularity === "hour" || granularity === "minute");
    return {
      granularity,
      data: state[granularity]
        .filter((row) => time.aggregateBucketInRange(row.bucket, granularity, from, to))
        .map((row) => ({ ...row })),
    };
  };
  function load(relativePath) {
    if (modules.has(relativePath)) return modules.get(relativePath);
    const loadedModule = { exports: {} };
    modules.set(relativePath, loadedModule.exports);
    const compiled = ts.transpileModule(readFileSync(resolve(root, relativePath), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function("require", "module", "exports", compiled)((name) => {
      if (name === "@/lib/api") return { apiFetch };
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      throw new Error(`Unexpected fixture dependency: ${name}`);
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  time = load("lib/aggregate-time.ts");
  const reconciliation = load("lib/aggregate-reconciliation.ts");
  const hourQuery = load("lib/aggregate-hour-query.ts");
  const rangeQuery = load("lib/aggregate-range-query.ts");
  const bindings = {
    ...time,
    ...reconciliation,
    ...hourQuery,
    ...rangeQuery,
    DEFAULT_METRIC_TYPE: "count",
    startOfHour: (date) => time.startOfAggregateBucket(date, "hour"),
  };
  bindings.mergeRealtimeQueryRanges = standalone("mergeRealtimeQueryRanges", bindings);
  bindings.subtractRealtimeQueryRanges = standalone("subtractRealtimeQueryRanges", bindings);
  bindings.filterRealtimeRowsToRanges = standalone("filterRealtimeRowsToRanges", bindings);
  bindings.clearRealtimeHourlyCoverageCache = standalone("clearRealtimeHourlyCoverageCache", bindings);
  bindings.clearRealtimeRollingMinuteCache = standalone("clearRealtimeRollingMinuteCache", bindings);
  return {
    day: load("lib/aggregate-minute-day-query.ts"),
    hour: standalone("fetchIncrementalRealtimeHourlyRanges", bindings),
    minute: standalone("fetchIncrementalRealtimeMinuteWindow", bindings),
    requests,
    state,
  };
}

function standalone(name, bindings) {
  const node = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `function ${name} exists`);
  const compiled = ts.transpileModule(`const target = ${node.getText(sourceFile)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn target;`)(...Object.values(bindings));
}

function minuteOptions(now, from, to) {
  return {
    cache: { cacheScope: "", coveredFrom: null, coveredTo: null, rows: [] },
    cacheScope: scope,
    companyScopeId: "tenant-a",
    definition: { from: date(from), to: date(to), granularity: "minute" },
    now: date(now),
    signal: new AbortController().signal,
  };
}

function hourOptions() {
  return {
    cacheScope: scope,
    companyScopeId: "tenant-a",
    coverageCache: { cacheScope: "", ranges: [], rows: [] },
    includeOpenHour: false,
    now: date("2026-09-10T13:10:00Z"),
    queryCache: new Map(),
    ranges: [{ from: date("2025-05-01T03:00:00Z"), to: date("2026-09-10T13:00:00Z") }],
    signal: new AbortController().signal,
  };
}

function dayOptions() {
  return {
    cache: new Map(),
    cacheScope: scope,
    companyScopeId: "tenant-a",
    from: date("2026-09-10T03:00:00Z"),
    now: date("2026-09-10T13:10:00Z"),
    to: date("2026-09-10T12:00:00Z"),
  };
}

function row(bucket, total) {
  return { bucket, total, camera_id: "camera-a", line_count_id: "line-a", metric_type: "count" };
}
function date(value) { return new Date(value); }
function total(rows) { return rows.reduce((sum, row) => sum + row.total, 0); }
function requestBounds({ from, to }) { return [from.toISOString(), to.toISOString()]; }
