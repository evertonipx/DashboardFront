import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "components/app/demographics-dashboard.tsx";
const source = readFileSync(resolve(root, filename), "utf8");
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
const effects = [];
visit(ast);

function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "React.useEffect") {
    effects.push(node.arguments[0].getText(ast));
  }
  ts.forEachChild(node, visit);
}

function compile(text, bindings = {}) {
  const output = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), output)(...Object.values(bindings));
}

function loadModule(path, mocks = {}) {
  const loaded = { exports: {} };
  compile(readFileSync(resolve(root, path), "utf8"), {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/")) return loadModule(`${name.slice(2)}.ts`);
      assert.fail(`Unmocked dependency: ${name}`);
    },
  });
  return loaded.exports;
}

const demographics = loadModule("lib/demographics.ts");
const time = loadModule("lib/company-time-zone.ts");
const cancellation = loadModule("lib/request-cancellation.ts");
const dateRanges = loadModule("lib/demographics-date-range.ts", {
  "@/lib/master-company-scope": {
    getUserViewScopedStorageKey: () => "fixture:date-range",
    readUserViewScopedStorageEntry: () => null,
  },
  "@/lib/user-grid-local": { writeUserGridPreference: () => true },
});

function createFixture({ visible = true } = {}) {
  const state = {
    now: new Date("2026-09-10T15:15:42Z"),
    clock: new Date("2026-09-10T13:00:00Z"),
    companyId: "company-a",
    userId: "user-a",
    timeZone: "America/Sao_Paulo",
    rangeState: null,
    requestedKey: "",
    refreshVersion: 0,
    serverTotal: 100,
    calls: [],
    data: null,
    lastUpdated: null,
    loading: false,
    refreshing: false,
    error: "",
    hold: false,
    releases: [],
    visible,
  };
  const refs = {
    activeRequestRef: { current: null },
    comparisonRequestRef: { current: null },
    requestSequenceRef: { current: 0 },
    pendingLiveAggregationRef: { current: null },
    liveCacheRef: { current: null },
    partitionCacheRef: { current: new Map() },
    dataStateRef: { current: null },
  };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
  }
  const timers = new Map();
  let timerId = 0;
  const fakeWindow = {
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  const helperNames = [
    "loadPartitionedDemographicAggregation", "fetchDemographicSummary",
    "demographicPartitionCacheKey", "cacheDemographicPartition", "fetchDemographicResponse",
    "buildDemographicRequestWindow", "buildCivilDayPartitions", "civilDayStart",
    "parseCivilDateKey", "shiftCivilDateKey", "defaultRangeForSurface",
    "cancelPendingLiveDemographicAggregation",
  ];
  const helpers = compile(
    helperNames.map((name) => functions.get(name)).join("\n") + `\nreturn {${helperNames.join(",")}};`,
    {
      ...demographics, ...time, ...cancellation,
      MINUTE_MS: 60_000,
      MAX_DEMOGRAPHICS_DATE_RANGE_DAYS: dateRanges.MAX_DEMOGRAPHICS_DATE_RANGE_DAYS,
      MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES: 96,
      apiFetch: async (path, options) => {
        const total = state.serverTotal;
        state.calls.push({ path, ...options });
        if (state.hold) await new Promise((resolve) => { state.releases.push(resolve); });
        const from = new URL(path, "https://fixture.invalid").searchParams.get("from");
        return { data: total === null ? [] : [{
          bucket: from, camera_id: "fixture-camera", age_bucket: "20-29",
          gender: "Woman", emotion: "happy", count: total,
        }] };
      },
    },
  );

  const identity = () => `${state.companyId}|${state.userId}|analysis`;
  const fallback = () => helpers.defaultRangeForSurface("analysis", time.companyDateKey(state.clock, state.timeZone));
  function bindings() {
    const selectedRange = state.rangeState?.key === identity() ? state.rangeState.value : fallback();
    return {
      ...demographics, ...time, ...dateRanges, ...cancellation, ...helpers, ...refs,
      Date: FixtureDate,
      window: fakeWindow,
      surface: "analysis",
      timeZone: state.timeZone,
      companyScopeId: state.companyId,
      user: { id: state.userId },
      todayInput: time.companyDateKey(state.clock, state.timeZone),
      fallbackRange: fallback(),
      rangeScopeKey: identity(),
      historicalQueryIdentityKey: identity(),
      queryRequested: state.requestedKey === identity(),
      rangeReady: state.rangeState?.key === identity(),
      hasVisibleWidgets: state.visible,
      refreshVersion: state.refreshVersion,
      liveCacheScopeKey: "unused-analysis-live-key",
      requestWindow: helpers.buildDemographicRequestWindow({
        ...selectedRange, clock: state.clock, timeZone: state.timeZone,
      }),
      dataScopeKey: [state.companyId, state.timeZone, "analysis", selectedRange.startInput, selectedRange.endInput].join("|"),
      setRangeState: (update) => { state.rangeState = typeof update === "function" ? update(state.rangeState) : update; },
      setHistoricalQueryScopeKey: (key) => { state.requestedKey = key; },
      setClock: (clock) => { state.clock = clock; },
      setRefreshVersion: (update) => { state.refreshVersion = update(state.refreshVersion); },
      setDataState: (data) => { state.data = data; },
      setLastUpdated: (at) => { state.lastUpdated = at; },
      setLoading: (value) => { state.loading = value; },
      setRefreshing: (value) => { state.refreshing = value; },
      setLoadProgress: () => {},
      setError: (value) => { state.error = value; },
      demographicRequestErrorMessage: (error) => error.message,
    };
  }
  function initialize() {
    const effect = effects.find((candidate) => candidate.includes("const loadSavedRange"));
    compile(`return (${effect});`, bindings())();
  }
  function callbacks() {
    return compile(
      ["applyRange", "forceRefresh", "requestFreshData"].map((name) => functions.get(name)).join("\n") +
      "\nreturn { applyRange, forceRefresh };",
      bindings(),
    );
  }
  function setup() {
    const effect = effects.find((candidate) => candidate.includes("const sequence = ++requestSequenceRef.current"));
    return compile(`return (${effect});`, bindings())();
  }
  async function flush() {
    const scheduled = [...timers.values()];
    timers.clear();
    scheduled.forEach((callback) => callback());
    await new Promise((resolve) => setImmediate(resolve));
  }
  let cleanup;
  async function run() {
    cleanup?.();
    cleanup = setup();
    await flush();
  }
  initialize();
  return {
    state, refs, helpers, initialize, setup, flush, run,
    apply: (value = state.rangeState.value) => callbacks().applyRange(value),
    refresh: () => callbacks().forceRefresh(),
  };
}

for (const correctedTotal of [140, 40, 0, null]) {
  test(`reaplicar Análises busca novamente e substitui total por ${correctedTotal ?? "ausência de linhas"}`, async () => {
    const fixture = createFixture();
    await fixture.run();
    assert.equal(fixture.state.data.summary.total, 100);
    assert.equal(fixture.state.data.summary.temporal.timeZone, "America/Sao_Paulo");
    assert.equal(fixture.state.data.refreshVersion, 0);
    assert.equal(fixture.state.data.through, Date.parse("2026-09-10T03:00:00Z"));
    fixture.state.serverTotal = correctedTotal;
    fixture.apply();
    assert.equal(fixture.refs.partitionCacheRef.current.size, 0);
    await fixture.run();
    assert.equal(fixture.state.data.summary.total, correctedTotal ?? 0);
    assert.equal(fixture.state.data.refreshVersion, 1);
    assert.equal(fixture.state.data.through, Date.parse("2026-09-10T03:00:00Z"));
    assert.equal(fixture.state.calls.length, 2);
    assert.equal(fixture.state.refreshVersion, 1);
    for (const call of fixture.state.calls) assert.equal(call.companyScopeId, "company-a");
  });
}

test("aplicar hoje usa o minuto encerrado no instante do clique, não o relógio da montagem", async () => {
  const fixture = createFixture();
  fixture.apply({ startInput: "2026-09-10", endInput: "2026-09-10" });
  await fixture.run();
  const query = new URL(fixture.state.calls[0].path, "https://fixture.invalid").searchParams;
  assert.equal(query.get("from"), "2026-09-10T03:00:00.000Z");
  assert.equal(query.get("to"), "2026-09-10T15:15:00.000Z");
});

test("Atualizar aborta comparação antes de limpar cache e baseline antigo não repovoa partições", async () => {
  const fixture = createFixture();
  await fixture.run();
  const controller = new AbortController();
  fixture.refs.comparisonRequestRef.current = controller;
  fixture.state.hold = true;
  const baseline = fixture.helpers.loadPartitionedDemographicAggregation({
    cache: fixture.refs.partitionCacheRef.current,
    companyScopeId: fixture.state.companyId,
    partitions: [{ from: new Date("2026-08-20T03:00:00Z"), to: new Date("2026-08-21T03:00:00Z") }],
    signal: controller.signal,
    timeZone: fixture.state.timeZone,
  });
  const aborted = assert.rejects(baseline, { name: "AbortError" });
  fixture.refresh();
  assert.equal(controller.signal.aborted, true);
  assert.equal(fixture.refs.comparisonRequestRef.current, null);
  assert.equal(fixture.refs.partitionCacheRef.current.size, 0);
  fixture.state.hold = false;
  fixture.state.releases.splice(0).forEach((release) => release());
  await aborted;
  assert.equal(fixture.refs.partitionCacheRef.current.size, 0);
  assert.equal(fixture.state.data.summary.total, 100);
});

test("Atualizar renova o histórico e preserva o período aplicado após meia-noite", async () => {
  const fixture = createFixture();
  const selected = { startInput: "2026-09-01", endInput: "2026-09-02" };
  fixture.apply(selected);
  await fixture.run();
  fixture.state.now = new Date("2026-09-11T03:10:42Z");
  fixture.state.serverTotal = 0;
  fixture.refresh();
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, selected);
  await fixture.run();
  assert.equal(fixture.state.data.summary.total, 0);
  assert.equal(fixture.state.calls.length, 4);
});

test("aplicar o novo hoje após meia-noite não o normaliza para o ontem do relógio antigo", async () => {
  const fixture = createFixture();
  fixture.state.now = new Date("2026-09-11T03:10:42Z");
  const today = { startInput: "2026-09-11", endInput: "2026-09-11" };
  fixture.apply(today);
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, today);
  await fixture.run();
  const query = new URL(fixture.state.calls[0].path, "https://fixture.invalid").searchParams;
  assert.equal(query.get("from"), "2026-09-11T03:00:00.000Z");
  assert.equal(query.get("to"), "2026-09-11T03:10:00.000Z");
});

test("aborta antes do novo effect e uma resposta antiga não repovoa cache ou resumo", async () => {
  const fixture = createFixture();
  fixture.state.hold = true;
  await fixture.run();
  const previous = fixture.refs.activeRequestRef.current;
  fixture.apply();
  assert.equal(previous.signal.aborted, true);
  fixture.state.hold = false;
  fixture.state.serverTotal = 40;
  await fixture.run();
  fixture.state.releases.forEach((release) => release());
  await fixture.flush();
  assert.equal(fixture.state.data.summary.total, 40);
  assert.deepEqual([...fixture.refs.partitionCacheRef.current.values()].map((summary) => summary.total), [40]);
  assert.equal(fixture.state.error, "");
});

test("Strict Mode descarta o timer anterior sem duplicar a consulta inicial de ontem", async () => {
  const fixture = createFixture();
  assert.deepEqual(fixture.state.rangeState.value, { startInput: "2026-09-09", endInput: "2026-09-09" });
  const cleanup = fixture.setup();
  cleanup();
  const finalCleanup = fixture.setup();
  await fixture.flush();
  assert.equal(fixture.state.calls.length, 1);
  finalCleanup();
});

test("mudança de identidade reinicia em ontem, mas novo relógio não reinicia a mesma identidade", () => {
  const fixture = createFixture();
  fixture.apply({ startInput: "2026-09-01", endInput: "2026-09-02" });
  fixture.state.companyId = "company-b";
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, { startInput: "2026-09-09", endInput: "2026-09-09" });
  assert.equal(fixture.state.rangeState.key, "company-b|user-a|analysis");
  fixture.apply({ startInput: "2026-09-01", endInput: "2026-09-02" });
  fixture.state.userId = "user-b";
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, { startInput: "2026-09-09", endInput: "2026-09-09" });
  assert.equal(fixture.state.rangeState.key, "company-b|user-b|analysis");
});

test("reexibir cache não produz GET nem inventa novo horário de recebimento", async () => {
  const fixture = createFixture();
  await fixture.run();
  const received = fixture.state.lastUpdated;
  fixture.state.now = new Date("2026-09-10T16:15:42Z");
  await fixture.run();
  assert.equal(fixture.state.calls.length, 1);
  assert.equal(fixture.state.lastUpdated, received);
});

test("retornar ao cache de outra empresa não herda o horário de recebimento da empresa anterior", async () => {
  const fixture = createFixture();
  await fixture.run();
  fixture.state.companyId = "company-b";
  fixture.state.now = new Date("2026-09-10T16:15:42Z");
  fixture.initialize();
  await fixture.run();
  assert.equal(fixture.state.lastUpdated.toISOString(), "2026-09-10T16:15:42.000Z");
  fixture.state.companyId = "company-a";
  fixture.initialize();
  await fixture.run();
  assert.equal(fixture.state.calls.length, 2);
  assert.equal(fixture.state.lastUpdated, null);
});

test("hidratar o fuso real reancora ontem somente quando ainda é a seleção padrão", async () => {
  const fixture = createFixture();
  fixture.state.clock = new Date("2026-09-10T01:00:00Z");
  fixture.state.rangeState = null;
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, { startInput: "2026-09-08", endInput: "2026-09-08" });
  fixture.state.timeZone = "UTC";
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, { startInput: "2026-09-09", endInput: "2026-09-09" });
  await fixture.run();
  const query = new URL(fixture.state.calls[0].path, "https://fixture.invalid").searchParams;
  assert.equal(query.get("from"), "2026-09-09T00:00:00.000Z");
  assert.equal(query.get("to"), "2026-09-10T00:00:00.000Z");
});

test("hidratar fuso preserva datas explicitamente aplicadas e remapeia seus instantes", async () => {
  const fixture = createFixture();
  const chosen = { startInput: "2026-09-01", endInput: "2026-09-01" };
  fixture.apply(chosen);
  fixture.state.timeZone = "UTC";
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, chosen);
  await fixture.run();
  const query = new URL(fixture.state.calls[0].path, "https://fixture.invalid").searchParams;
  assert.equal(query.get("from"), "2026-09-01T00:00:00.000Z");
  assert.equal(query.get("to"), "2026-09-02T00:00:00.000Z");
});

test("Atualizar após meia-noite também preserva a seleção padrão já carregada", async () => {
  const fixture = createFixture();
  const original = fixture.state.rangeState.value;
  fixture.state.now = new Date("2026-09-11T03:10:42Z");
  fixture.refresh();
  fixture.initialize();
  assert.deepEqual(fixture.state.rangeState.value, original);
  await fixture.run();
  const query = new URL(fixture.state.calls[0].path, "https://fixture.invalid").searchParams;
  assert.equal(query.get("from"), "2026-09-09T03:00:00.000Z");
});

test("sem widgets visíveis não consulta e o histórico continua sem polling", async () => {
  const fixture = createFixture({ visible: false });
  await fixture.run();
  assert.equal(fixture.state.calls.length, 0);
  assert.equal(fixture.state.loading, false);
  assert.match(source, /if \(surface !== "live" \|\| !hasVisibleWidgets\) return;/);
  assert.doesNotMatch(source, /const rangeScopeKey = .*todayInput/);
  assert.doesNotMatch(source, /\[\s*preferences,[\s\S]*?requestWindow,[\s\S]*?surface,[\s\S]*?\]\);/);
});
