import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(projectRoot, "components/app/realtime-dashboard.tsx"), "utf8");
const sourceFile = ts.createSourceFile("realtime-dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test("sublocais limitam concorrência a quatro preservando ordem, empresa e sinal", async () => {
  let active = 0;
  let maximum = 0;
  const controller = new AbortController();
  const calls = [];
  const fetchSubLocations = standalone("fetchSubLocations", {
    apiFetch: async (path, options) => {
      calls.push({ path, options });
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1));
      active -= 1;
      return [{ id: path.split("/")[2] }];
    },
    requireSubLocationRows: (rows) => rows,
    filterScopedApiRows: (rows) => rows,
  });
  const locations = Array.from({ length: 13 }, (_, id) => ({ id: String(id) }));
  const rows = await fetchSubLocations(locations, "tenant-a", false, controller.signal);
  assert.equal(maximum, 4);
  assert.deepEqual(rows.map((row) => row.id), locations.map((location) => location.id));
  assert.ok(calls.every(({ options }) => options.companyScopeId === "tenant-a" && options.signal === controller.signal));
});

test("cancelar catálogo impede iniciar os próximos sublocais", async () => {
  const controller = new AbortController();
  const pending = [];
  const fetchSubLocations = standalone("fetchSubLocations", {
    apiFetch: () => new Promise((resolveRequest) => pending.push(resolveRequest)),
    requireSubLocationRows: (rows) => rows,
    filterScopedApiRows: (rows) => rows,
  });
  const request = fetchSubLocations(Array.from({ length: 12 }, (_, id) => ({ id })), "tenant-a", false, controller.signal);
  assert.equal(pending.length, 4);
  controller.abort();
  pending.forEach((resolveRequest) => resolveRequest([]));
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(pending.length, 4);
});

test("falha do catálogo interrompe a fila de sublocais", async () => {
  let calls = 0;
  const fetchSubLocations = standalone("fetchSubLocations", {
    apiFetch: async () => {
      calls += 1;
      if (calls === 1) throw new Error("metadata failed");
      return [];
    },
    requireSubLocationRows: (rows) => rows,
    filterScopedApiRows: (rows) => rows,
  });
  await assert.rejects(fetchSubLocations(Array.from({ length: 30 }, (_, id) => ({ id })), "tenant-a"), /metadata failed/);
  assert.equal(calls, 4);
});

test("replay de montagem agenda somente um catálogo e cleanup cancela seu contexto", () => {
  const window = fakeWindow();
  const metadataAbortControllerRef = { current: null };
  const metadataRequestSequenceRef = { current: 0 };
  const metadataRequestKeyRef = { current: "" };
  let calls = 0;
  const setup = effect("Coalesce the StrictMode", {
    window,
    loadScenarios: () => { calls += 1; },
    metadataAbortControllerRef,
    metadataRequestSequenceRef,
    metadataRequestKeyRef,
  });
  const firstCleanup = setup();
  firstCleanup();
  const finalCleanup = setup();
  window.flushTimeouts();
  assert.equal(calls, 1);
  const controller = new AbortController();
  metadataAbortControllerRef.current = controller;
  metadataRequestKeyRef.current = "tenant-a";
  finalCleanup();
  assert.equal(controller.signal.aborted, true);
  assert.equal(metadataAbortControllerRef.current, null);
  assert.equal(metadataRequestKeyRef.current, "");
  assert.equal(metadataRequestSequenceRef.current, 2);
});

test("retomar aba respeita frescor, não força requisição concorrente e pausa offline", () => {
  const window = fakeWindow();
  const document = fakeTarget({ visibilityState: "visible" });
  const navigator = { onLine: true };
  const calls = [];
  let now = 10_000;
  const setup = effect("function handleVisibilityChange()", {
    window, document, navigator,
    Date: { now: () => now },
    loadCharts: (options) => calls.push(options),
    realtimeDataPlanKey: "ready",
    realtimeRequestKey: "tenant-a|plan-a",
    completedChartsRequestKeyRef: { current: "" },
    realtimeDataPlan: { refreshIntervalMs: 5_000 },
    lastChartsCompletedAtRef: { current: 9_000 },
    requestRef: { current: null },
    runningRef: { current: false },
    setLoadingCharts: () => {},
  });
  const cleanup = setup();
  window.flushTimeouts();
  assert.deepEqual(calls, [{ force: true }]);
  document.emit("visibilitychange");
  assert.equal(calls.length, 1, "a recently completed response is still fresh");
  now = 14_000;
  document.emit("visibilitychange");
  assert.deepEqual(calls[1], { silent: true }, "resume never aborts equivalent work using force");
  navigator.onLine = false;
  window.tickIntervals();
  document.emit("visibilitychange");
  assert.equal(calls.length, 2);
  navigator.onLine = true;
  window.emit("online");
  assert.equal(calls.length, 3);
  cleanup();
  window.emit("online");
  document.emit("visibilitychange");
  window.tickIntervals();
  assert.equal(calls.length, 3, "cleanup removes timers and resume listeners");
});

test("preferências de paleta/layout/outro escopo não reabrem o plano de comparativos", () => {
  const window = fakeWindow();
  const targetKey = "ipxdata.live-custom-a.scenario-comparison.v1.company.one.user.user-a.view.view-a";
  let revisions = 0;
  const setup = effect("function syncComparisonSettingsPlan", {
    window,
    USER_GRID_LOCAL_CHANGE_EVENT: "local-change",
    USER_GRID_HYDRATED_EVENT: "hydrated",
    comparisonSettingsReadKeys: new Set([targetKey]),
    setComparisonSettingsRevision: () => { revisions += 1; },
  });
  const cleanup = setup();
  window.emit("local-change", { detail: { key: "ipxdata.card-view.palettes" } });
  window.emit("storage", { key: targetKey.replace("company.one", "company.two") });
  assert.equal(revisions, 0);
  window.emit("local-change", { detail: { key: targetKey } });
  window.emit("storage", { key: targetKey });
  window.emit("hydrated");
  assert.equal(revisions, 3);
  cleanup();
  window.emit("hydrated");
  assert.equal(revisions, 3);
  const memoSection = source.slice(source.indexOf("const comparisonSettingsForPlan ="), source.indexOf("const openScenarioComparisonWidgetIds ="));
  assert.doesNotMatch(memoSection, /\bclock\b/, "each live tick must not re-read stored JSON");
});

test("trocar filtro com plano equivalente reutiliza dados frescos sem antecipar polling", () => {
  const window = fakeWindow();
  const calls = [];
  let now = 10_000;
  const completedChartsRequestKeyRef = { current: "tenant-a|plan-a" };
  const setup = effect("function handleVisibilityChange()", {
    window,
    document: fakeTarget({ visibilityState: "visible" }),
    navigator: { onLine: true },
    Date: { now: () => now },
    loadCharts: (options) => calls.push(options),
    realtimeDataPlanKey: "plan-a",
    realtimeRequestKey: "tenant-a|plan-a",
    realtimeDataPlan: { refreshIntervalMs: 5_000 },
    completedChartsRequestKeyRef,
    lastChartsCompletedAtRef: { current: 9_000 },
    requestRef: { current: null },
    runningRef: { current: false },
    setLoadingCharts: () => {},
  });
  let cleanup = setup();
  window.flushTimeouts();
  assert.equal(calls.length, 0);
  cleanup();
  now = 14_000;
  cleanup = setup();
  window.flushTimeouts();
  assert.equal(calls.length, 1, "stale datasets still refresh at the normal cadence");
  cleanup();
  now = 10_000;
  completedChartsRequestKeyRef.current = "tenant-b|plan-a";
  cleanup = setup();
  window.flushTimeouts();
  assert.equal(calls.length, 2, "a dataset from another tenant is never reused");
  cleanup();
  const identity = source.slice(source.indexOf("const realtimeRequestKey ="), source.indexOf("const preferenceScope ="));
  assert.match(identity, /companyScopeId[\s\S]*companyTimeZone[\s\S]*realtimeDataPlanKey/);
  assert.doesNotMatch(identity, /selectedId|selectedScope|palette|color|layout/);
});

test("controles de fontes ocultas não entram nas dependências de rede", () => {
  const load = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "loadCharts");
  const dependencies = load.initializer.arguments[1].getText(sourceFile);
  assert.match(dependencies, /requestedIntradayComparison/);
  assert.match(dependencies, /requestedOccupancyStartHour/);
  assert.doesNotMatch(dependencies, /operationalSettings\./);
  assert.match(source, /requestedIntradayComparison = realtimeDataPlan\.definitionIds\.includes\(\s*OPERATIONAL_COMPARISON_HOURS_ID/);
  assert.match(source, /requestedOccupancyStartHour = realtimeDataPlan\.definitionIds\.includes\(\s*OCCUPANCY_HOURS_ID/);
});

test("resposta reconciliada depois de cancelamento não publica gráficos antigos", async () => {
  const entered = deferred();
  const reconciliation = deferred();
  const published = [];
  const requestRef = { current: null };
  const now = new Date("2026-09-08T15:00:00Z");
  const minute = { id: "live_chart_minute", granularity: "minute", from: new Date(now.getTime() - 60_000), to: now };
  const noop = () => {};
  const bindings = {
    realtimeDataPlanKey: "ready", companyScopeCertificationError: "", companyScopeId: "tenant-a", companyTimeZone: "America/Sao_Paulo",
    requestRef, runningRef: { current: false }, hasLoadedChartsRef: { current: false }, lastChartsCompletedAtRef: { current: 0 },
    completedChartsRequestKeyRef: { current: "" }, realtimeRequestKey: "tenant-a|plan-a",
    hourlyAggregateCacheRef: { current: new Map() }, hourlyCoverageCacheRef: { current: {} }, nativeAggregateCacheRef: { current: new Map() }, rollingMinuteCacheRef: { current: {} }, minuteDayAggregateCacheRef: { current: new Map() },
    requireCountingRuntimeTimeZone: noop, setLoadingCharts: noop,
    buildRealtimeChartDefinitions: () => [minute], buildMinuteDayDefinition: () => minute,
    buildCurrentMonthDaysDefinition: () => ({ id: "month" }), buildOperationalComparisonHoursDefinition: () => ({ id: "comparison" }),
    buildOperationalBaselineMonthDefinition: () => ({ id: "baseline" }), buildOperationalTrendDaysDefinition: () => ({ id: "trend" }), buildHourlyOccupancyDataDefinition: () => ({ id: "occupancy" }),
    requestedIntradayComparison: "yesterday", requestedOccupancyStartHour: 0,
    realtimeDataPlan: { definitionIds: [minute.id], minuteDay: true, rollingMinute: true },
    dedupeRealtimeDefinitions: (definitions) => [...new Map(definitions.map((definition) => [definition.id, definition])).values()],
    buildRealtimeCanonicalHourRanges: () => [], buildRealtimeCanonicalHourDefinition: () => null,
    buildRealtimeNativeClosedQueries: () => [], CANONICAL_HOUR_DERIVED_IDS: new Set(), OPERATIONAL_CURRENT_HOUR_MINUTES_ID: "current-minute", OPERATIONAL_MONTH_HOURS_ID: "month-hour", LIVE_DAY_MINUTES_ID: "minute-day",
    fetchIncrementalRealtimeMinuteWindow: async () => [], fetchMinuteDayAggregateBootstrap: async () => [],
    hydrateRealtimeOpenBuckets: (data) => data,
    refreshMinuteDayAggregateCache: () => { entered.resolve(); return reconciliation.promise; },
    setChartData: (data) => published.push(data), setChartLoadError: noop, setClock: noop, setLastUpdated: noop, setHasLoadedCharts: noop,
    React: { startTransition: (callback) => callback() }, toast: { error: noop }, isAbortError: (error) => error?.name === "AbortError", dashboardErrorMessage: (error) => error.message,
  };
  const loadCharts = callback("loadCharts", bindings);
  const load = loadCharts();
  await entered.promise;
  requestRef.current.abort();
  requestRef.current = new AbortController();
  reconciliation.resolve([]);
  await load;
  assert.deepEqual(published, []);
  assert.equal(bindings.lastChartsCompletedAtRef.current, 0);
  requestRef.current = null;
  bindings.runningRef.current = false;
  await loadCharts();
  assert.equal(published.length, 1, "the current certified response still publishes normally");
  assert.equal(bindings.completedChartsRequestKeyRef.current, "tenant-a|plan-a");
});

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveValue) => { resolvePromise = resolveValue; });
  return { promise, resolve: resolvePromise };
}
function fakeTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
    emit: (type, extraEvent = {}) => listeners.get(type)?.forEach((callback) => callback({ type, ...extraEvent })),
  };
}
function fakeWindow() {
  let id = 0;
  const timeouts = new Map();
  const intervals = new Map();
  return {
    ...fakeTarget(),
    setTimeout: (callback) => { timeouts.set(++id, callback); return id; },
    clearTimeout: (key) => timeouts.delete(key),
    setInterval: (callback) => { intervals.set(++id, callback); return id; },
    clearInterval: (key) => intervals.delete(key),
    flushTimeouts: () => { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach((callback) => callback()); },
    tickIntervals: () => intervals.forEach((callback) => callback()),
  };
}
function findNode(predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(sourceFile);
  assert.ok(found, "source callback/function exists");
  return found;
}
function compile(expression, bindings) {
  const compiled = ts.transpileModule(`const target = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn target;`)(...Object.values(bindings));
}
function standalone(name, bindings) {
  return compile(findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(sourceFile), bindings);
}
function callback(name, bindings) {
  const node = findNode((item) => ts.isVariableDeclaration(item) && item.name.getText(sourceFile) === name);
  return compile(node.initializer.arguments[0].getText(sourceFile), bindings);
}
function effect(marker, bindings) {
  const node = findNode((item) => ts.isCallExpression(item) && item.expression.getText(sourceFile) === "React.useEffect" && item.arguments[0]?.getText(sourceFile).includes(marker));
  return compile(node.arguments[0].getText(sourceFile), bindings);
}
