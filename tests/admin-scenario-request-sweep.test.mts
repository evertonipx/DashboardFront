import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const counting = readFileSync(resolve(root, "components/app/scenario-manager.tsx"), "utf8");
const occupancy = readFileSync(resolve(root, "components/app/occupancy-scenario-manager.tsx"), "utf8");

test("Cenários de Contagem só consultam resultados quando a linha está visível", () => {
  const listLoad = counting.slice(
    counting.indexOf("const loadScenarios ="),
    counting.indexOf("const loadVisibleScenarioResult ="),
  );
  assert.ok(listLoad.length > 0);
  assert.doesNotMatch(listLoad, /\/scenarios\/\$\{scenario\.id\}\/result/);
  assert.match(counting, /new IntersectionObserver\(/);
  assert.match(counting, /if \(entries\.some\(\(entry\) => entry\.isIntersecting\)\)/);
  assert.match(counting, /const pendingKey = `\$\{requestSequence\}:\$\{cacheKey\}`/);
  assert.match(counting, /const cacheKey = `\$\{requestedUserId\}:\$\{requestedCompanyScopeId\}:\$\{scenarioId\}`/);
  assert.match(counting, /resolvedActiveTab !== "flow"/);
  assert.match(counting, /scenarioCatalogUserId === userId/);
});

test("fila de resultados limita consultas simultâneas e drena ao concluírem", async () => {
  const start = counting.indexOf("function drainScenarioResultQueue(");
  const end = counting.indexOf("\n}\n", start) + 3;
  assert.ok(start >= 0 && end > start);
  const source = ts.transpileModule(
    `${counting.slice(start, end)}\nmodule.exports = drainScenarioResultQueue;`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const fixtureModule: { exports: unknown } = { exports: null };
  new Function("module", "SCENARIO_RESULT_MAX_CONCURRENT", source)(fixtureModule, 4);
  const drain = fixtureModule.exports as (
    queue: Array<() => Promise<void>>,
    active: { current: number },
  ) => void;

  const releases: Array<() => void> = [];
  const active = { current: 0 };
  let started = 0;
  const queue = Array.from({ length: 7 }, () => async () => {
    started += 1;
    await new Promise<void>((resolve) => releases.push(resolve));
  });
  drain(queue, active);
  assert.equal(started, 4);
  assert.equal(active.current, 4);
  assert.equal(queue.length, 3);
  releases.splice(0, 2).forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(started, 6);
  assert.equal(active.current, 4);
  releases.splice(0).forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(started, 7);
  releases.splice(0).forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(active.current, 0);
  assert.equal(queue.length, 0);
});

test("Cenários de Ocupação descobrem áreas só ao abrir editor e não fazem polling", () => {
  const scopeEffect = occupancy.slice(
    occupancy.indexOf("React.useEffect(() => {\n    areaRequestSequenceRef.current += 1;"),
    occupancy.indexOf("function openCreateDialog()"),
  );
  assert.ok(scopeEffect.length > 0);
  assert.doesNotMatch(scopeEffect, /void loadAreaOptions\(\)/);
  assert.doesNotMatch(occupancy, /useResourceAutoRefresh\(/);
  assert.match(occupancy, /setDialogOpen\(true\);\n    if \(!areaCatalogCertified && !loadingAreas\) void loadAreaOptions\(\)/);
  assert.match(occupancy, /onRetryAreaCatalog=\{\(\) => void loadAreaOptions\(\)\}/);
  assert.match(occupancy, /areaRequestSequenceRef\.current === requestSequence|requestSequence === areaRequestSequenceRef\.current/);
  assert.match(occupancy, /bypassReadCache: true/);
  assert.match(occupancy, /scenarioCatalogUserId === userId/);
  assert.match(occupancy, /areaCatalogUserId === userId/);
  assert.match(occupancy, /userIdRef\.current === requestedUserId/);
});
