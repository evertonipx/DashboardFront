import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
function compile(source, bindings = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}
function load(path) {
  const loaded = { exports: {} };
  compile(readFileSync(resolve(root, path), "utf8"), { module: loaded, exports: loaded.exports, require: (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name) });
  return loaded.exports;
}
const time = load("lib/company-time-zone.ts");
const cancellation = load("lib/request-cancellation.ts");
const { buildDemographicComparisonWindow: build } = load("lib/demographics-comparison-window.ts");
const windowFor = (values) => build({ timeZone: "America/Sao_Paulo", mode: "previous-period", startInput: "2026-09-10", endInput: "2026-09-10", cutoff: new Date("2026-09-11T03:00:00Z"), ...values });

test("período anterior respeita dias civis inclusivos e fronteira exclusiva em São Paulo", () => {
  const result = windowFor({ startInput: "2026-09-01", endInput: "2026-09-07", cutoff: new Date("2026-09-08T03:00:00Z") });
  assert.equal(result.startInput, "2026-08-25");
  assert.equal(result.endInput, "2026-08-31");
  assert.equal(result.from.toISOString(), "2026-08-25T03:00:00.000Z");
  assert.equal(result.to.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(result.partial, false);
});

test("semana anterior mantém corte civil de hoje em São Paulo e Kolkata", () => {
  const paulista = windowFor({ mode: "previous-week", cutoff: new Date("2026-09-10T15:17:00Z") });
  assert.equal(paulista.from.toISOString(), "2026-09-03T03:00:00.000Z");
  assert.equal(paulista.to.toISOString(), "2026-09-03T15:17:00.000Z");
  const indiano = windowFor({ mode: "previous-week", timeZone: "Asia/Kolkata", cutoff: new Date("2026-09-10T06:47:00Z") });
  assert.equal(indiano.from.toISOString(), "2026-09-02T18:30:00.000Z");
  assert.equal(indiano.to.toISOString(), "2026-09-03T06:47:00.000Z");
  assert.equal(indiano.partial, true);
  assert.match(indiano.label, /até o mesmo horário/);
});

test("mês fechado compara mês fechado, incluindo fevereiro bissexto e fevereiro curto", () => {
  for (const [year, leapDays] of [[2024, 29], [2026, 28]]) {
    const result = windowFor({ mode: "previous-month", startInput: `${year}-03-01`, endInput: `${year}-03-31`, cutoff: new Date(`${year}-04-01T03:00:00Z`) });
    assert.equal(result.startInput, `${year}-02-01`);
    assert.equal(result.endInput, `${year}-02-${leapDays}`);
    assert.equal(result.to.toISOString(), `${year}-03-01T03:00:00.000Z`);
    assert.equal((result.to - result.from) / 86_400_000, leapDays);
    assert.equal(result.partial, false);
  }
});

test("mês anterior limita dias inexistentes e aplica corte atual sem incluir futuro", () => {
  const short = windowFor({ mode: "previous-month", startInput: "2026-03-31", endInput: "2026-03-31", cutoff: new Date("2026-04-01T03:00:00Z") });
  assert.equal(short.startInput, "2026-02-28");
  assert.equal(short.endInput, "2026-02-28");
  const partial = windowFor({ mode: "previous-month", startInput: "2026-09-01", endInput: "2026-09-30", cutoff: new Date("2026-09-10T15:25:00Z") });
  assert.equal(partial.startInput, "2026-08-01");
  assert.equal(partial.endInput, "2026-08-31");
  assert.equal(partial.to.toISOString(), "2026-08-10T15:25:00.000Z");
});

test("New York preserva horário civil no início do DST sem subtrair 24 horas fixas", () => {
  const result = windowFor({ timeZone: "America/New_York", startInput: "2026-03-08", endInput: "2026-03-08", cutoff: new Date("2026-03-08T16:35:00Z") });
  assert.equal(result.from.toISOString(), "2026-03-07T05:00:00.000Z");
  assert.equal(result.to.toISOString(), "2026-03-07T17:35:00.000Z");
  assert.equal(result.partial, true);
});

test("corte em minuto inexistente no baseline DST avança ao primeiro minuto disponível", () => {
  const result = windowFor({ mode: "previous-week", timeZone: "America/New_York", startInput: "2026-03-15", endInput: "2026-03-15", cutoff: new Date("2026-03-15T06:30:00Z") });
  assert.equal(result.startInput, "2026-03-08");
  assert.equal(result.to.toISOString(), "2026-03-08T07:00:00.000Z");
});

test("corte em horário repetido no baseline usa a primeira ocorrência documentada", () => {
  const result = windowFor({ mode: "previous-week", timeZone: "America/New_York", startInput: "2026-11-08", endInput: "2026-11-08", cutoff: new Date("2026-11-08T06:30:00Z") });
  assert.equal(result.to.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(time.companyDateKey(result.to, "America/New_York"), "2026-11-01");
});

test("comparação rejeita período inválido, invertido, além de 366 dias ou corte inválido", () => {
  for (const values of [{ startInput: "2026-02-30" }, { startInput: "2026-09-11" }, { startInput: "2024-01-01", endInput: "2025-01-01" }, { cutoff: new Date(NaN) }]) assert.throws(() => windowFor(values), RangeError);
});

const source = readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8");
const ast = ts.createSourceFile("dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
let comparisonReadyExpression;
const comparisonPresentationExpressions = {};
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "React.useEffect") effects.push(node);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "comparisonReady") comparisonReadyExpression = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && ["comparisonLoading", "comparisonError"].includes(node.name.getText(ast))) comparisonPresentationExpressions[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const effect = effects.find((node) => node.arguments[0].getText(ast).includes("if (!comparisonVisible"));
assert.ok(effect, "comparison effect exists");
assert.ok(comparisonReadyExpression, "comparison readiness guard exists");
const names = new Set(["buildCivilDayPartitions", "civilDayStart", "shiftCivilDateKey", "parseCivilDateKey"]);
const helpers = compile(ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map((node) => node.getText(ast)).join("\n") + "\nreturn {buildCivilDayPartitions};", { ...time, MAX_DEMOGRAPHICS_DATE_RANGE_DAYS: 366 });
function harness(overrides = {}) {
  const requests = [];
  const states = [];
  const timers = new Map();
  const releases = [];
  const comparisonRequestRef = { current: null };
  let timerId = 0;
  const state = { comparisonVisible: true, queryRequested: true, rangeReady: true, comparisonReady: true, companyScopeId: "company-a", comparisonState: null, comparisonKey: "comparison-a", comparisonWindow: windowFor({}), timeZone: "America/Sao_Paulo", pending: false, error: null, ...overrides };
  const run = () => compile(`return (${effect.arguments[0].getText(ast)});`, {
    ...state, ...helpers, ...cancellation, comparisonRequestRef,
    window: { setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    partitionCacheRef: { current: new Map() },
    userFacingErrorMessage: (error) => error.message,
    loadPartitionedDemographicAggregation: (options) => {
      requests.push(options);
      if (state.pending) return new Promise((resolve, reject) => releases.push({ resolve, reject }));
      return state.error ? Promise.reject(state.error) : Promise.resolve({ total: 17 });
    },
    setComparisonState: (value) => { state.comparisonState = value; states.push(value); },
  })();
  const flush = async () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); await new Promise((resolve) => setImmediate(resolve)); };
  return { run, flush, state, requests, states, releases, comparisonRequestRef };
}

test("comparativo só consulta quando visível, solicitado, com período e dados primários prontos", async () => {
  for (const blocked of [{ comparisonVisible: false }, { queryRequested: false }, { rangeReady: false }, { comparisonReady: false }, { companyScopeId: "" }, { comparisonState: { key: "comparison-a" } }]) {
    const testHarness = harness(blocked);
    testHarness.run();
    await testHarness.flush();
    assert.equal(testHarness.requests.length, 0);
  }
  const ready = harness();
  ready.run(); await ready.flush();
  assert.equal(ready.requests.length, 1);
  assert.equal(ready.requests[0].companyScopeId, "company-a");
  assert.equal(ready.requests[0].timeZone, "America/Sao_Paulo");
  assert.equal(ready.requests[0].partitions[0].from.toISOString(), "2026-09-09T03:00:00.000Z");
  assert.deepEqual(ready.states, [{ key: "comparison-a", summary: { total: 17 } }]);
});

test("falha no período principal encerra o carregamento do comparativo e apresenta o erro", () => {
  const current = (overrides = {}) => compile(`return {loading: ${comparisonPresentationExpressions.comparisonLoading}, error: ${comparisonPresentationExpressions.comparisonError}};`, {
    queryRequested: true, comparisonVisible: true, summary: { hasData: true },
    comparisonKey: "new-period", comparisonState: { key: "old-period" }, error: "", ...overrides,
  });
  assert.deepEqual(current(), { loading: true, error: undefined });
  assert.deepEqual(current({ error: "Não foi possível atualizar o período." }), {
    loading: false, error: "Não foi possível atualizar o período.",
  });
  assert.deepEqual(current({ comparisonState: { key: "new-period", error: "Comparação indisponível." } }), {
    loading: false, error: "Comparação indisponível.",
  });
});

test("Refresh e tick do Ao Vivo bloqueiam baseline até a publicação da mesma versão e corte principal", async () => {
  const previousTo = new Date("2026-09-10T15:10:00Z");
  const primary = { key: "company-a|scope", refreshVersion: 7, through: previousTo.getTime() };
  const base = { dataState: primary, dataScopeKey: primary.key, refreshVersion: 7, requestWindow: { to: previousTo }, summary: { hasData: true }, loading: false, refreshing: false, error: "" };
  const ready = (bindings) => compile(`return (${comparisonReadyExpression});`, bindings);
  assert.equal(ready(base), true);
  for (const update of [
    { refreshVersion: 8 },
    { requestWindow: { to: new Date(previousTo.getTime() + 60_000) } },
  ]) {
    const awaitingPrimary = { ...base, ...update };
    assert.equal(ready(awaitingPrimary), false, "dados antigos não ficam prontos antes de setLoading/setRefreshing");
    const fixture = harness({ comparisonReady: ready(awaitingPrimary) });
    fixture.run(); await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    const published = { ...awaitingPrimary, dataState: { ...primary, refreshVersion: awaitingPrimary.refreshVersion, through: awaitingPrimary.requestWindow.to.getTime() } };
    fixture.state.comparisonReady = ready(published);
    assert.equal(fixture.state.comparisonReady, true);
    fixture.run(); await fixture.flush();
    assert.equal(fixture.requests.length, 1);
  }
});

test("baseline mensal de uma seleção anual inclui o dia extra do ano bissexto sem truncar partições", async () => {
  const comparisonWindow = windowFor({ mode: "previous-month", startInput: "2024-03-01", endInput: "2025-03-01", cutoff: new Date("2025-03-02T03:00:00Z") });
  assert.equal(comparisonWindow.startInput, "2024-02-01");
  assert.equal(comparisonWindow.endInput, "2025-02-01");
  const fixture = harness({ comparisonWindow });
  fixture.run(); await fixture.flush();
  assert.equal(fixture.requests[0].partitions.length, 367);
  assert.equal(fixture.requests[0].partitions.at(-1).to.toISOString(), "2025-02-02T03:00:00.000Z");
});

test("replay de Strict Mode e descarte de resposta obsoleta não duplicam nem publicam baseline antigo", async () => {
  const replay = harness();
  const cleanup = replay.run(); cleanup(); replay.run(); await replay.flush();
  assert.equal(replay.requests.length, 1);
  const old = harness({ pending: true });
  const dispose = old.run(); await old.flush(); dispose();
  assert.equal(old.requests[0].signal.aborted, true);
  assert.equal(old.comparisonRequestRef.current, null);
  old.releases[0].resolve({ total: 999 }); await old.flush();
  assert.deepEqual(old.states, []);
});

test("falha não vira dado completo e alteração apenas visual não dispara outra comparação", async () => {
  const failed = harness({ error: new Error("fixture unavailable") });
  failed.run(); await failed.flush();
  assert.deepEqual(failed.states, [{ key: "comparison-a", error: "fixture unavailable" }]);
  const ready = harness(); ready.run(); await ready.flush();
  ready.state.temporalSettings = { palette: "cyber" };
  ready.run(); await ready.flush();
  assert.equal(ready.requests.length, 1);
  assert.doesNotMatch(effect.arguments[1].getText(ast), /temporalSettings|palette|dimension|chartType|metric|categoryKeys/);
});
