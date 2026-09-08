import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const query = loadModule("lib/occupancy-dashboard-query.ts");
const definitionIds = ["occupancy_report_hour", "occupancy_report_day", "occupancy_report_month"];
const metricVisibility = { average: true, minimum: true, peak: true };
const cardIds = [...definitionIds, "occupancy_report_current", "occupancy_report_average", "occupancy_report_peak", "occupancy_report_minimum"];
const preferencesFor = (...visibleIds) => cardIds.map((id) => ({ id, visible: visibleIds.includes(id) }));

test("somente leitura atual do cenário não consulta agregados diários nem comparativos", () => {
  const plan = query.buildOccupancyReportResourcePlan({
    definitionIds, metricVisibility, hasScenario: true,
    preferences: preferencesFor("occupancy_report_current"),
  });
  assert.deepEqual(plan, { definitionIds: "", comparisonDefinitionIds: "", currentSnapshot: true });
});

test("média, pico e mínimo reutilizam uma fonte diária; ocultos não pedem rede", () => {
  const plan = query.buildOccupancyReportResourcePlan({
    definitionIds, metricVisibility, hasScenario: true,
    preferences: preferencesFor("occupancy_report_average", "occupancy_report_peak", "occupancy_report_minimum"),
  });
  assert.deepEqual(plan, { definitionIds: "occupancy_report_day", comparisonDefinitionIds: "", currentSnapshot: false });
  const hidden = query.buildOccupancyReportResourcePlan({
    definitionIds, metricVisibility, hasScenario: true, preferences: preferencesFor(),
  });
  assert.deepEqual(hidden, { definitionIds: "", comparisonDefinitionIds: "", currentSnapshot: false });
});

test("fonte sem cenário conserva leitura derivada diária e configuração visual não altera consultas", () => {
  const input = {
    definitionIds, metricVisibility, hasScenario: false,
    preferences: preferencesFor("occupancy_report_current", "occupancy_report_hour"),
  };
  const plan = query.buildOccupancyReportResourcePlan(input);
  assert.equal(plan.definitionIds, "occupancy_report_day|occupancy_report_hour");
  assert.equal(plan.comparisonDefinitionIds, "occupancy_report_hour");
  assert.equal(plan.currentSnapshot, false);
  assert.deepEqual(query.buildOccupancyReportResourcePlan({ ...input,
    preferences: input.preferences.toReversed().map((preference) => ({
      ...preference, color: "#6633ff", title: "Título alterado", size: "full", heightLevel: 6,
    })),
  }), plan);
});

test("a fila impõe um limite global mesmo com muitas definições e segmentos", async () => {
  const schedule = query.createOccupancyQueryScheduler(undefined, 3);
  let active = 0;
  let peak = 0;
  const releases = [];
  const pending = Array.from({ length: 21 }, (_, index) => schedule(`segment:${index}`, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => releases.push(resolve));
    active -= 1;
    return index;
  }));
  for (let offset = 0; offset < 21; offset += 3) {
    await drain();
    assert.equal(active, 3);
    releases.splice(0).forEach((release) => release());
  }
  assert.deepEqual(await Promise.all(pending), Array.from({ length: 21 }, (_, index) => index));
  assert.equal(peak, 3);
});

test("widgets da mesma execução compartilham consulta idêntica sem compartilhar entre execuções", async () => {
  const schedule = query.createOccupancyQueryScheduler();
  let calls = 0;
  const load = async () => ({ total: ++calls });
  const first = schedule("/scenario/a/hour", load);
  const duplicate = schedule("/scenario/a/hour", load);
  assert.equal(first, duplicate);
  assert.deepEqual(await first, { total: 1 });
  assert.deepEqual(await schedule("/scenario/a/hour", load), { total: 1 });
  assert.equal(calls, 1);
  const anotherBatch = query.createOccupancyQueryScheduler();
  assert.deepEqual(await anotherBatch("/scenario/a/hour", load), { total: 2 });
});

test("abortamento impede consultas enfileiradas e rejeita resultados de execução substituída", async () => {
  const controller = new AbortController();
  const schedule = query.createOccupancyQueryScheduler(controller.signal, 1);
  let release;
  let calls = 0;
  const requests = Array.from({ length: 6 }, (_, index) => schedule(`request:${index}`, async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return index;
  }));
  const settled = Promise.allSettled(requests);
  await drain();
  controller.abort(new DOMException("Visão alterada", "AbortError"));
  release();
  const results = await settled;
  assert.equal(calls, 1);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason.name === "AbortError"));
  await assert.rejects(schedule("new", async () => { calls += 1; }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("uma falha libera a fila e permite uma nova tentativa explícita", async () => {
  const schedule = query.createOccupancyQueryScheduler(undefined, 1);
  await assert.rejects(schedule("same", async () => { throw new Error("temporário"); }), /temporário/);
  assert.equal(await schedule("same", async () => 42), 42);
  assert.equal(await schedule("next", async () => 7), 7);
  assert.throws(() => query.createOccupancyQueryScheduler(undefined, 0), /concorrência/);
});

function drain() { return new Promise((resolve) => setImmediate(resolve)); }

function loadModule(relativePath) {
  const filename = resolve(root, relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "require", "module", output)(loaded.exports, createRequire(filename), loaded);
  return loaded.exports;
}
