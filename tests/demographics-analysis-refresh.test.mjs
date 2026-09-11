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
const initializers = new Map();
visit(ast);

function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(ast), node.initializer.getText(ast));
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
const refreshPolicy = loadModule("lib/demographics-refresh-policy.ts");
const dateRanges = loadModule("lib/demographics-date-range.ts", {
  "@/lib/master-company-scope": {
    getUserViewScopedStorageKey: () => "fixture:date-range",
    readUserViewScopedStorageEntry: () => null,
  },
  "@/lib/user-grid-local": { writeUserGridPreference: () => true },
});

function createFixture({ visible = true, preferencesReady = true, pageVisible = true, online = true } = {}) {
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
    serverError: null,
    calls: [],
    data: null,
    lastUpdated: null,
    loading: false,
    refreshing: false,
    error: "",
    hold: false,
    releases: [],
    visible,
    preferencesReady,
    pageVisible,
    online,
  };
  const refs = {
    activeRequestRef: { current: null },
    comparisonRequestRef: { current: null },
    comparisonCacheRef: { current: null },
    comparisonRetryRef: { current: null },
    liveRetryRef: { current: null },
    settledRequestKeyRef: { current: "" },
    requestSequenceRef: { current: 0 },
    pendingLiveAggregationRef: { current: null },
    liveCacheRef: { current: null },
    partitionCacheRef: { current: new Map() },
    dataStateRef: { current: null },
  };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now.getTime(); }
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
      MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES: 400,
      apiFetch: async (path, options) => {
        const total = state.serverTotal;
        const error = state.serverError;
        state.calls.push({ path, ...options });
        if (state.hold) await new Promise((resolve) => { state.releases.push(resolve); });
        if (error) throw error;
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
    const requestWindow = helpers.buildDemographicRequestWindow({
      ...selectedRange, clock: state.clock, timeZone: state.timeZone,
    });
    const keyBindings = {
      user: { id: state.userId }, companyScopeId: state.companyId,
      timeZone: state.timeZone, surface: "analysis", appliedRange: selectedRange,
      todayInput: time.companyDateKey(state.clock, state.timeZone),
    };
    const dataScopeKey = compile(`return ${initializers.get("dataScopeKey")};`, {
      ...keyBindings, React: { useMemo: (factory) => factory() },
    });
    return {
      ...demographics, ...time, ...dateRanges, ...cancellation, ...refreshPolicy, ...helpers, ...refs,
      Date: FixtureDate,
      window: fakeWindow,
      surface: "analysis",
      timeZone: state.timeZone,
      companyScopeId: state.companyId,
      user: { id: state.userId },
      todayInput: time.companyDateKey(state.clock, state.timeZone),
      fallbackRange: fallback(),
      appliedRange: selectedRange,
      rangeScopeKey: identity(),
      historicalQueryIdentityKey: identity(),
      queryRequested: state.requestedKey === identity(),
      rangeReady: state.rangeState?.key === identity(),
      hasVisibleWidgets: state.visible,
      preferencesReady: state.preferencesReady,
      pageActive: state.pageVisible && state.online,
      refreshVersion: state.refreshVersion,
      liveCacheScopeKey: "unused-analysis-live-key",
      requestWindow,
      dataScopeKey,
      requestKey: compile(`return ${initializers.get("requestKey")};`, { dataScopeKey, requestWindow, refreshVersion: state.refreshVersion }),
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
  let cacheIdentity;
  function synchronizeIdentity() {
    const nextIdentity = `${state.userId}|${state.companyId}|${state.timeZone}`;
    if (cacheIdentity === nextIdentity) return;
    const effect = effects.find((candidate) => candidate.includes("partitionCacheRef.current = new Map()"));
    assert.ok(effect, "reset de identidade precisa descartar a referência do cache anterior");
    compile(`return (${effect});`, bindings())();
    cacheIdentity = nextIdentity;
  }
  function initialize() {
    synchronizeIdentity();
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
    synchronizeIdentity();
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

test("retornar a outra empresa exige nova consulta e não restaura o cache da identidade anterior", async () => {
  const fixture = createFixture();
  await fixture.run();
  fixture.state.companyId = "company-b";
  fixture.state.now = new Date("2026-09-10T16:15:42Z");
  fixture.initialize();
  await fixture.run();
  assert.equal(fixture.state.lastUpdated.toISOString(), "2026-09-10T16:15:42.000Z");
  fixture.state.companyId = "company-a";
  fixture.state.serverTotal = 40;
  fixture.state.now = new Date("2026-09-10T17:15:42Z");
  fixture.initialize();
  await fixture.run();
  assert.equal(fixture.state.calls.length, 3);
  assert.deepEqual(fixture.state.calls.map(({ companyScopeId }) => companyScopeId), ["company-a", "company-b", "company-a"]);
  assert.equal(fixture.state.data.summary.total, 40);
  assert.equal(fixture.state.lastUpdated.toISOString(), "2026-09-10T17:15:42.000Z");
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
  assert.match(source, /if \(surface !== "live" \|\| !hasVisibleWidgets \|\| !preferencesReady \|\| !pageActive\) return;/);
  assert.doesNotMatch(source, /const rangeScopeKey = .*todayInput/);
  assert.doesNotMatch(source, /\[\s*preferences,[\s\S]*?requestWindow,[\s\S]*?surface,[\s\S]*?\]\);/);
});

for (const [reason, paused] of [
  ["preferências pendentes", { preferencesReady: false }],
  ["aba inativa", { pageVisible: false }],
  ["offline", { online: false }],
]) {
  test(`${reason}: nenhuma consulta antes de retomar a elegibilidade`, async () => {
    const fixture = createFixture(paused);
    await fixture.run();
    assert.equal(fixture.state.calls.length, 0);
    assert.equal(fixture.state.data, null);
    assert.equal(fixture.refs.settledRequestKeyRef.current, "", "pausar não marca a consulta como concluída");
    Object.assign(fixture.state, { preferencesReady: true, pageVisible: true, online: true });
    await fixture.run();
    assert.equal(fixture.state.calls.length, 1);
    assert.equal(fixture.state.data.summary.total, 100);
  });
}

test("retomar um histórico concluído da aba inativa ou offline não refaz GET nem altera snapshot", async () => {
  const fixture = createFixture();
  await fixture.run();
  const data = fixture.state.data;
  const received = fixture.state.lastUpdated;
  for (const key of ["pageVisible", "online", "preferencesReady"]) {
    fixture.state[key] = false;
    await fixture.run();
    fixture.state.now = new Date(fixture.state.now.getTime() + 60_000);
    fixture.state[key] = true;
    await fixture.run();
    assert.equal(fixture.state.calls.length, 1);
    assert.equal(fixture.state.data, data);
    assert.equal(fixture.state.lastUpdated, received);
    assert.equal(fixture.state.loading, false);
    assert.equal(fixture.state.refreshing, false);
  }
});

test("aplicar outro intervalo reaproveita dias sobrepostos; reaplicar o mesmo renova todos os dias", async () => {
  const fixture = createFixture();
  fixture.apply({ startInput: "2026-09-01", endInput: "2026-09-03" });
  await fixture.run();
  assert.equal(fixture.state.calls.length, 3);
  assert.equal(fixture.state.data.summary.total, 300);
  fixture.apply({ startInput: "2026-09-02", endInput: "2026-09-04" });
  assert.equal(fixture.refs.partitionCacheRef.current.size, 3);
  await fixture.run();
  assert.equal(fixture.state.calls.length, 4);
  assert.equal(new URL(fixture.state.calls.at(-1).path, "https://fixture.invalid").searchParams.get("from"), "2026-09-04T03:00:00.000Z");
  assert.equal(fixture.state.data.summary.total, 300);
  fixture.state.serverTotal = 20;
  fixture.apply();
  assert.equal(fixture.refs.partitionCacheRef.current.size, 0);
  await fixture.run();
  assert.equal(fixture.state.calls.length, 7);
  assert.equal(fixture.state.data.summary.total, 60);
});

test("falha histórica só repete por atualização explícita, não por retomar a aba ou a conexão", async () => {
  const fixture = createFixture();
  fixture.state.serverError = new Error("fixture unavailable");
  await fixture.run();
  assert.equal(fixture.state.calls.length, 1);
  assert.equal(fixture.state.error, "fixture unavailable");
  assert.equal(fixture.state.loading, false);
  assert.equal(fixture.refs.liveRetryRef.current, null, "histórico não agenda polling de retry");
  const settled = fixture.refs.settledRequestKeyRef.current;
  assert.ok(settled);
  fixture.state.serverError = null;
  for (const key of ["pageVisible", "online"]) {
    fixture.state[key] = false;
    await fixture.run();
    fixture.state.now = new Date(fixture.state.now.getTime() + 3_600_000);
    fixture.state[key] = true;
    await fixture.run();
    assert.equal(fixture.state.calls.length, 1);
    assert.equal(fixture.state.error, "fixture unavailable");
    assert.equal(fixture.refs.settledRequestKeyRef.current, settled);
  }
  fixture.refresh();
  await fixture.run();
  assert.equal(fixture.state.calls.length, 2);
  assert.equal(fixture.state.data.summary.total, 100);
  assert.equal(fixture.state.error, "");
});

test("falha histórica permanece ao ocultar e reexibir todos os widgets até atualização explícita", async () => {
  const fixture = createFixture();
  fixture.state.serverError = new Error("fixture unavailable");
  await fixture.run();
  const settled = fixture.refs.settledRequestKeyRef.current;
  assert.equal(fixture.state.error, "fixture unavailable");
  fixture.state.serverError = null;
  for (const visible of [false, true, false, true]) {
    fixture.state.visible = visible;
    await fixture.run();
    assert.equal(fixture.state.calls.length, 1);
    assert.equal(fixture.state.error, "fixture unavailable", "ocultar widgets não transforma a falha em ausência de dados");
    assert.equal(fixture.refs.settledRequestKeyRef.current, settled);
    assert.equal(fixture.state.loading, false);
    assert.equal(fixture.state.refreshing, false);
  }
  fixture.refresh();
  await fixture.run();
  assert.equal(fixture.state.calls.length, 2);
  assert.equal(fixture.state.data.summary.total, 100);
  assert.equal(fixture.state.error, "");
});

for (const [property, next] of [["userId", "user-b"], ["companyId", "company-b"], ["timeZone", "UTC"]]) {
  test(`mudar ${property} descarta caches, retentativas e chave concluída antes de consultar`, async () => {
    const fixture = createFixture();
    await fixture.run();
    const previousCache = fixture.refs.partitionCacheRef.current;
    const previousDataKey = fixture.state.data.key;
    fixture.refs.comparisonCacheRef.current = { sentinel: true };
    fixture.refs.liveCacheRef.current = { sentinel: true };
    fixture.refs.comparisonRetryRef.current = { failures: 2, retryAt: Infinity };
    fixture.refs.liveRetryRef.current = { failures: 2, retryAt: Infinity };
    fixture.state[property] = next;
    fixture.state.serverTotal = 40;
    fixture.initialize();
    assert.notEqual(fixture.refs.partitionCacheRef.current, previousCache);
    assert.equal(fixture.refs.partitionCacheRef.current.size, 0);
    assert.equal(fixture.refs.comparisonCacheRef.current, null);
    assert.equal(fixture.refs.liveCacheRef.current, null);
    assert.equal(fixture.refs.comparisonRetryRef.current, null);
    assert.equal(fixture.refs.liveRetryRef.current, null);
    assert.equal(fixture.refs.settledRequestKeyRef.current, "");
    await fixture.run();
    assert.equal(fixture.state.calls.length, 2);
    assert.equal(fixture.state.data.summary.total, 40);
    assert.notEqual(fixture.state.data.key, previousDataKey);
    assert.ok(fixture.state.data.key.startsWith(`${fixture.state.userId}|${fixture.state.companyId}|${fixture.state.timeZone}|`));
    assert.equal(fixture.state.data.summary.temporal.timeZone, fixture.state.timeZone);
  });
}

test("resposta retida da identidade anterior não repovoa o mapa novo nem substitui dados do novo usuário", async () => {
  const fixture = createFixture();
  fixture.state.hold = true;
  await fixture.run();
  const oldController = fixture.refs.activeRequestRef.current;
  const oldCache = fixture.refs.partitionCacheRef.current;
  fixture.state.userId = "user-b";
  fixture.initialize();
  fixture.state.hold = false;
  fixture.state.serverTotal = 40;
  await fixture.run();
  fixture.state.releases.splice(0).forEach((release) => release());
  await fixture.flush();
  assert.equal(oldController.signal.aborted, true);
  assert.notEqual(fixture.refs.partitionCacheRef.current, oldCache);
  assert.equal(fixture.state.data.summary.total, 40);
  assert.ok(fixture.state.data.key.startsWith("user-b|company-a|"));
  assert.deepEqual([...fixture.refs.partitionCacheRef.current.values()].map(({ total }) => total), [40]);
});
