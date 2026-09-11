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
const effects = [];
const declarations = new Map();
visit(ast);
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "React.useEffect") effects.push(node.arguments[0].getText(ast));
  ts.forEachChild(node, visit);
}
function evaluate(code, bindings) {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}
function load(path) {
  const loaded = { exports: {} };
  evaluate(readFileSync(resolve(root, path), "utf8"), {
    module: loaded, exports: loaded.exports,
    require: (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
  });
  return loaded.exports;
}
const demographics = load("lib/demographics.ts");
const comparison = load("lib/demographics-comparison-query.ts");
const windows = load("lib/demographics-comparison-window.ts");
const time = load("lib/company-time-zone.ts");
const retry = load("lib/demographics-refresh-policy.ts");

function harness() {
  const state = {
    cutoff: new Date("2026-09-10T13:00:00Z"),
    result: null, calls: [], pending: [], hold: false, failure: false,
    pageActive: true, preferencesReady: true, comparisonVisible: true,
    queryRequested: true, rangeReady: true, comparisonReady: true,
    surface: "live", mode: "previous-period",
  };
  const comparisonCacheRef = { current: null };
  const comparisonRequestRef = { current: null };
  const comparisonRetryRef = { current: null };
  const timers = new Map();
  let nextTimer = 0;
  const helpers = evaluate([
    ...["buildCivilDayPartitions", "buildInstantPartitions", "civilDayStart", "parseCivilDateKey", "shiftCivilDateKey"].map((name) => declarations.get(name)),
    "return {buildCivilDayPartitions, buildInstantPartitions};",
  ].join("\n"), { ...time, MINUTE_MS: 60_000, MAX_DEMOGRAPHICS_DATE_RANGE_DAYS: 366 });
  function bindings() {
    const comparisonWindow = windows.buildDemographicComparisonWindow({
      startInput: "2026-09-10", endInput: "2026-09-10", timeZone: "America/Sao_Paulo",
      cutoff: state.cutoff, mode: state.mode,
    });
    const comparisonCacheScopeKey = `user-a|tenant-a|America/Sao_Paulo|${state.mode}|2026-09-10|2026-09-10`;
    return {
      ...state, ...helpers, ...comparison, ...retry,
      comparisonWindow, comparisonCacheScopeKey,
      comparisonKey: `${comparisonCacheScopeKey}|${comparisonWindow.to.toISOString()}`,
      comparisonState: state.result, comparisonCacheRef, comparisonRequestRef, comparisonRetryRef,
      companyScopeId: "tenant-a", timeZone: "America/Sao_Paulo", partitionCacheRef: { current: new Map() },
      window: {
        setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout: (id) => timers.delete(id),
      },
      abortRequest: (controller) => controller.abort(),
      isAbortError: (error, signal) => signal.aborted || error?.name === "AbortError",
      userFacingErrorMessage: () => "Falha no comparativo",
      setComparisonState: (result) => { state.result = result; },
      loadPartitionedDemographicAggregation: async ({ partitions, signal, companyScopeId }) => {
        state.calls.push({ partitions, signal, companyScopeId });
        if (state.hold) await new Promise((resolve) => state.pending.push(resolve));
        signal.throwIfAborted();
        if (state.failure) throw new Error("fixture unavailable");
        return demographics.aggregateDemographicBuckets(partitions.map(({ from, to }) => ({
          bucket: from.toISOString(), count: (to - from) / 60_000,
          gender: "Woman", age_bucket: "20-29", emotion: "happy", camera_id: "camera-a",
        })), { timeZone: "America/Sao_Paulo" });
      },
    };
  }
  const effect = effects.find((text) => text.includes("void loadDemographicComparisonAggregation"));
  let cleanup;
  async function flush() {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
    await new Promise((resolve) => setImmediate(resolve));
  }
  function setup() { return evaluate(`return (${effect});`, bindings())(); }
  return {
    state, comparisonCacheRef, comparisonRequestRef, comparisonRetryRef, setup, flush,
    async run() { cleanup?.(); cleanup = setup(); await flush(); },
    cleanup: () => cleanup?.(),
  };
}

for (const guard of ["pageActive", "preferencesReady", "comparisonVisible", "queryRequested", "rangeReady", "comparisonReady"]) {
  test(`comparativo não consulta enquanto ${guard} está desabilitado`, async () => {
    const fixture = harness();
    fixture.state[guard] = false;
    await fixture.run();
    assert.equal(fixture.state.calls.length, 0);
    fixture.state[guard] = true;
    await fixture.run();
    assert.equal(fixture.state.calls.length, 1);
    fixture.cleanup();
  });
}

test("comparativo live lê o dia anterior uma vez e depois apenas minutos novos", async () => {
  const fixture = harness();
  await fixture.run();
  assert.equal(fixture.state.result.summary.total, 600);
  assert.equal(fixture.comparisonRequestRef.current, null, "conclusão libera o relógio live");
  for (let minute = 1; minute <= 3; minute += 1) {
    fixture.state.cutoff = new Date(Date.parse("2026-09-10T13:00:00Z") + minute * 60_000);
    await fixture.run();
    assert.equal(fixture.state.result.summary.total, 600 + minute);
  }
  assert.equal(fixture.state.calls.length, 4);
  for (const call of fixture.state.calls.slice(1)) {
    assert.equal(call.partitions.length, 1);
    assert.equal(call.partitions[0].to - call.partitions[0].from, 60_000);
    assert.equal(call.companyScopeId, "tenant-a");
  }
  await fixture.run();
  assert.equal(fixture.state.calls.length, 4, "render/foco com mesmo corte não repete GET");
});

test("Strict Mode coalesce o timer inicial do comparativo", async () => {
  const fixture = harness();
  fixture.setup()();
  const cleanup = fixture.setup();
  await fixture.flush();
  assert.equal(fixture.state.calls.length, 1);
  cleanup();
});

test("ocultar aba cancela baseline pendente sem publicar dados ou cache", async () => {
  const fixture = harness();
  fixture.state.hold = true;
  await fixture.run();
  const pending = fixture.comparisonRequestRef.current;
  fixture.state.pageActive = false;
  await fixture.run();
  assert.equal(pending.signal.aborted, true);
  fixture.state.pending.splice(0).forEach((resolve) => resolve());
  await fixture.flush();
  assert.equal(fixture.state.result, null);
  assert.equal(fixture.comparisonCacheRef.current, null);
  fixture.state.hold = false;
  fixture.state.pageActive = true;
  await fixture.run();
  assert.equal(fixture.state.result.summary.total, 600);
});

test("falha live limita novas tentativas sem refazer consulta a cada render", async () => {
  const fixture = harness();
  fixture.state.failure = true;
  await fixture.run();
  assert.ok(fixture.comparisonRetryRef.current.retryAt > Date.now());
  assert.equal(fixture.comparisonRequestRef.current, null);
  fixture.state.cutoff = new Date("2026-09-10T13:01:00Z");
  await fixture.run();
  assert.equal(fixture.state.calls.length, 1);
  fixture.comparisonRetryRef.current.retryAt = 0;
  fixture.state.failure = false;
  await fixture.run();
  assert.equal(fixture.state.calls.length, 2);
  assert.equal(fixture.state.result.summary.total, 601);
  assert.equal(fixture.comparisonRetryRef.current, null);
});
