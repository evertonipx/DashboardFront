import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const minute = 60_000;

function compile(source, bindings = {}) {
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), javascript)(...Object.values(bindings));
}

function load(path, bindings = {}) {
  const loaded = { exports: {} };
  compile(readFileSync(resolve(root, path), "utf8"), { module: loaded, exports: loaded.exports, ...bindings });
  return loaded.exports;
}

const policy = load("lib/demographics-refresh-policy.ts");
const source = readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8");
const ast = ts.createSourceFile("demographics-dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "React.useEffect") effects.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
const timerEffect = effects.find((node) => node.arguments[0].getText(ast).includes("demographicRefreshDelay"));
assert.ok(timerEffect, "exercitar o efeito real, não uma cópia do timer");

test("backoff cresce em 1/2/4/5 minutos, fica limitado e não modifica o estado anterior", () => {
  let previous = null;
  for (let index = 0; index < 15; index++) {
    const now = Date.UTC(2026, 8, 11, 12) + index * minute;
    const before = previous ? structuredClone(previous) : null;
    if (previous) Object.freeze(previous);
    const next = policy.nextDemographicRetry(previous, now);
    assert.equal(next.retryAt - now, [1, 2, 4, 5][Math.min(index, 3)] * minute);
    assert.equal(next.failures, Math.min(index + 1, 10));
    assert.deepEqual(previous, before);
    previous = next;
  }
  assert.equal(policy.nextDemographicRetry(null, 0).failures, 1, "sucesso pode zerar o backoff usando null");
});

test("timer usa o próximo minuto encerrado mais 2 segundos e respeita retry futuro", () => {
  assert.equal(policy.demographicRefreshDelay(0), 62_000);
  assert.equal(policy.demographicRefreshDelay(59_999), 2_001);
  assert.equal(policy.demographicRefreshDelay(60_000), 62_000);
  assert.equal(policy.demographicRefreshDelay(60_001, 360_001), 300_000);
  assert.equal(policy.demographicRefreshDelay(60_001, 1), 61_999);
  for (const now of [0, 59_999, 60_000, 60_001, Date.UTC(2026, 8, 11)]) {
    const next = now + policy.demographicRefreshDelay(now);
    assert.equal(next % minute, 2_000);
    assert.ok(Math.floor(next / minute) > Math.floor(now / minute));
  }
});

test("clock não avança no mesmo minuto, com relógio regressivo, busy ou backoff vigente", () => {
  const previous = 60_001;
  for (const now of [0, 60_000, 60_001, 119_999]) {
    assert.equal(policy.shouldAdvanceDemographicClock({ now, previous, busy: false }), false);
  }
  assert.equal(policy.shouldAdvanceDemographicClock({ now: 120_000, previous, busy: false }), true);
  assert.equal(policy.shouldAdvanceDemographicClock({ now: 180_000, previous, busy: true }), false);
  assert.equal(policy.shouldAdvanceDemographicClock({ now: 180_000, previous, busy: false, retryAt: 180_001 }), false);
  assert.equal(policy.shouldAdvanceDemographicClock({ now: 180_001, previous, busy: false, retryAt: 180_001 }), true);
});

test("efeito real cria ticker somente Live, página ativa, preferências prontas e widget visível", () => {
  for (const blocked of [
    { surface: "analysis" }, { surface: "reports" }, { pageActive: false },
    { preferencesReady: false }, { hasVisibleWidgets: false },
  ]) {
    const fixture = ticker(blocked);
    assert.equal(fixture.setup(), undefined);
    assert.equal(fixture.timers.size, 0);
    assert.equal(fixture.state.clockWrites, 0);
  }
  const fixture = ticker();
  const cleanup = fixture.setup();
  assert.equal(fixture.timers.size, 1);
  assert.equal(typeof cleanup, "function");
  cleanup();
  assert.equal(fixture.timers.size, 0);
});

test("ticker real atualiza no máximo uma vez por minuto e replay de StrictMode não duplica timers", () => {
  const fixture = ticker();
  const initial = fixture.setup();
  assert.equal(fixture.state.changes.length, 1);
  initial();
  const replay = fixture.setup();
  assert.equal(fixture.state.changes.length, 1);
  assert.equal(fixture.timers.size, 1);
  const due = fixture.nextDue();
  fixture.advance(due - 1);
  assert.equal(fixture.state.changes.length, 1);
  fixture.advance(due);
  assert.equal(fixture.state.changes.length, 2);
  const changedMinute = Math.floor(fixture.state.clock.getTime() / minute);
  replay();
  fixture.setup();
  assert.equal(fixture.state.changes.length, 2);
  assert.equal(fixture.timers.size, 1);
  fixture.advance(fixture.nextDue());
  assert.equal(Math.floor(fixture.state.clock.getTime() / minute), changedMinute + 1);
});

test("carga principal ou comparação em andamento adiam o tick sem abortar a consulta", () => {
  for (const busyRef of ["pendingLiveAggregationRef", "comparisonRequestRef"]) {
    const fixture = ticker();
    const pending = { untouched: true };
    fixture.refs[busyRef].current = pending;
    fixture.setup();
    fixture.advance(fixture.nextDue());
    assert.equal(fixture.state.changes.length, 0, busyRef);
    assert.equal(fixture.refs[busyRef].current, pending);
    assert.equal(fixture.timers.size, 1);
    fixture.refs[busyRef].current = null;
    fixture.advance(fixture.nextDue());
    assert.equal(fixture.state.changes.length, 1);
    assert.equal(fixture.state.clock.getTime(), fixture.state.now);
  }
});

test("hidden e offline barram callback já agendado; cleanup pausa e retomar captura o minuto atual", () => {
  for (const inactive of ["hidden", "offline"]) {
    const fixture = ticker();
    const cleanup = fixture.setup();
    const priorClock = fixture.state.clock;
    if (inactive === "hidden") fixture.document.visibilityState = "hidden";
    else fixture.navigator.onLine = false;
    fixture.advance(fixture.nextDue());
    assert.equal(fixture.state.clock, priorClock, inactive);
    cleanup();
    fixture.state.pageActive = false;
    fixture.setup();
    assert.equal(fixture.timers.size, 0);
    fixture.state.now += 10 * minute;
    fixture.document.visibilityState = "visible";
    fixture.navigator.onLine = true;
    fixture.state.pageActive = true;
    fixture.setup();
    assert.equal(fixture.state.clock.getTime(), fixture.state.now);
    assert.equal(fixture.timers.size, 1);
  }
});

test("ticker real respeita backoff de erro e volta à cadência por minuto após recuperação", () => {
  const fixture = ticker();
  const initial = policy.nextDemographicRetry(null, fixture.state.now);
  fixture.refs.liveRetryRef.current = policy.nextDemographicRetry(initial, fixture.state.now);
  const retryAt = fixture.refs.liveRetryRef.current.retryAt;
  fixture.setup();
  assert.equal(fixture.state.changes.length, 0);
  assert.equal(fixture.nextDue(), retryAt);
  fixture.advance(retryAt - 1);
  assert.equal(fixture.state.changes.length, 0);
  fixture.advance(retryAt);
  assert.equal(fixture.state.changes.length, 1);
  fixture.refs.liveRetryRef.current = null;
  fixture.advance(fixture.nextDue());
  assert.equal(fixture.state.changes.length, 2);
  assert.ok(fixture.nextDue() - fixture.state.now <= 62_000);
});

test("dependências do ticker não incluem apresentação, formato, disposição ou resumo", () => {
  const dependencies = timerEffect.arguments[1].elements.map((node) => node.getText(ast)).sort();
  assert.deepEqual(dependencies, ["hasVisibleWidgets", "pageActive", "preferencesReady", "surface"].sort());
  assert.doesNotMatch(timerEffect.arguments[0].getText(ast), /apiFetch|fetch\(|forceRefresh|requestFreshData|abortRequest|setInterval/);
});

test("hook real observa visibilidade/online/offline sem rede ou polling, com SSR inativo", () => {
  let store;
  const target = new EventTarget(), documentTarget = new EventTarget();
  const fakeDocument = Object.assign(documentTarget, { visibilityState: "visible" });
  const fakeNavigator = { onLine: true };
  const hook = load("components/app/use-demographics-page-active.ts", {
    require: (name) => {
      assert.equal(name, "react");
      return { useSyncExternalStore: (subscribe, snapshot, serverSnapshot) => { store = { subscribe, snapshot, serverSnapshot }; return snapshot(); } };
    },
    document: fakeDocument, navigator: fakeNavigator, window: target,
  });
  assert.equal(hook.useDemographicsPageActive(), true);
  assert.equal(store.serverSnapshot(), false);
  const values = [];
  const unsubscribe = store.subscribe(() => values.push(store.snapshot()));
  fakeDocument.visibilityState = "hidden";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  fakeDocument.visibilityState = "visible";
  fakeNavigator.onLine = false;
  target.dispatchEvent(new Event("offline"));
  fakeNavigator.onLine = true;
  target.dispatchEvent(new Event("online"));
  assert.deepEqual(values, [false, false, true]);
  fakeNavigator.onLine = undefined;
  assert.equal(store.snapshot(), true, "browser sem sinal offline explícito permanece utilizável");
  unsubscribe();
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  target.dispatchEvent(new Event("online"));
  target.dispatchEvent(new Event("offline"));
  assert.deepEqual(values, [false, false, true]);
});

function ticker(overrides = {}) {
  const now = Date.UTC(2026, 8, 11, 12, 0, 10);
  const state = { surface: "live", pageActive: true, preferencesReady: true, hasVisibleWidgets: true, now, clock: new Date(now - minute), clockWrites: 0, changes: [], ...overrides };
  const refs = { pendingLiveAggregationRef: { current: null }, comparisonRequestRef: { current: null }, liveRetryRef: { current: null } };
  const timers = new Map();
  let timerId = 0;
  const fakeWindow = { setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: state.now + delay }); return id; }, clearTimeout: (id) => timers.delete(id) };
  const fakeDocument = { visibilityState: "visible" }, fakeNavigator = { onLine: true };
  class FixtureDate extends Date { static now() { return state.now; } }
  function setup() {
    return compile(`return (${timerEffect.arguments[0].getText(ast)})();`, {
      ...policy, ...refs, ...state, Date: FixtureDate, window: fakeWindow, document: fakeDocument, navigator: fakeNavigator,
      setClock: (update) => {
        state.clockWrites++;
        const next = update(state.clock);
        if (next !== state.clock) state.changes.push(next);
        state.clock = next;
      },
    });
  }
  function advance(to) {
    state.now = to;
    for (const [id, timer] of [...timers]) if (timer.at <= to) { timers.delete(id); timer.callback(); }
  }
  return { state, refs, timers, setup, advance, nextDue: () => Math.min(...[...timers.values()].map(({ at }) => at)), document: fakeDocument, navigator: fakeNavigator };
}
