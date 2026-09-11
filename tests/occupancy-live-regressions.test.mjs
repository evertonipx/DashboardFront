import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
const retry = load("lib/occupancy-live-retry.ts");
const source = readFileSync(resolve(root, "components/app/occupancy-scenario-dashboard.tsx"), "utf8");
const ast = ts.createSourceFile("live.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["buildOccupancyChartDefinitions", "listBucketStarts", "alignToGranularity", "alignEndToGranularity", "addGranularity", "bucketLabel", "weekdayShortName", "weekOfMonthLabel", "startOfMinute", "startOfHour", "startOfDay", "startOfWeek", "startOfMonth", "addMinutes", "addDays", "addMonths", "buildOccupancyChartState", "buildOccupancyPoints", "occupancyDisplayPoints", "joinOccupancyWarnings"];
const bindings = {
  ...load("lib/company-time-zone.ts"), ...load("lib/aggregate-time.ts"),
  ...load("lib/occupancy-calendar.ts"), ...load("lib/utils.ts"),
  ...load("lib/occupancy-aggregate-validation.ts"), ...load("lib/occupancy-hour-axis.ts"),
  MINUTE_MS: 60_000, HOUR_MS: 3_600_000, DAY_MS: 86_400_000,
};
const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(declarations.length, names.length);
const output = ts.transpileModule(declarations.map((node) => node.getText(ast)).join("\n") + "\nreturn {buildOccupancyChartDefinitions,listBucketStarts,bucketLabel,buildOccupancyChartState};", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const live = new Function(...Object.keys(bindings), output)(...Object.values(bindings));

test("falhas usam espera progressiva limitada, sem novas tentativas a cada 5 segundos", () => {
  let state;
  let now = 1_000_000;
  for (const delay of [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
    state = retry.nextOccupancyLiveRetry(state, false, now);
    assert.equal(state.retryAt - now, delay);
    assert.equal(retry.occupancyLiveRetryReady(state, now + 5_000), false);
    assert.equal(retry.occupancyLiveRetryReady(state, state.retryAt - 1), false);
    assert.equal(retry.occupancyLiveRetryReady(state, state.retryAt), true);
    now = state.retryAt;
  }
});

test("atualização manual ignora espera e sucesso reinicia o contador", () => {
  const state = retry.nextOccupancyLiveRetry(undefined, false, 1_000);
  assert.equal(retry.occupancyLiveRetryReady(state, 1_001, true), true);
  assert.equal(retry.nextOccupancyLiveRetry(state, true, 1_002), undefined);
  assert.equal(retry.occupancyLiveRetryReady(undefined, 1_002), true);
});

test("controle de tentativas precede mudança de janela e só sucesso atualiza frescor", () => {
  assert.match(source, /if \(!occupancyLiveRetryReady\([\s\S]*?\)\) return false;[\s\S]*?const windowKey/);
  assert.match(source, /if \(!entry.succeeded\) return;\s*nextFreshness.chartAt/);
  assert.match(source, /retries\?\.history/);
  assert.match(source, /retries\?\.alerts/);
});

for (const browserZone of ["UTC", "America/Sao_Paulo", "America/Santiago"]) {
  test(`Ao Vivo respeita dia da empresa com navegador ${browserZone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = browserZone;
    try {
      const definitions = live.buildOccupancyChartDefinitions(new Date("2026-09-11T02:30:00Z"), "America/Sao_Paulo");
      const hourly = definitions.find((item) => item.granularity === "hour");
      assert.equal(hourly.from.toISOString(), "2026-09-10T03:00:00.000Z");
      assert.equal(hourly.to.toISOString(), "2026-09-11T03:00:00.000Z");
      const buckets = live.listBucketStarts(hourly);
      assert.equal(buckets.length, 24);
      assert.equal(live.bucketLabel(buckets[0], "hour", hourly.timeZone), "00h");
      assert.equal(live.bucketLabel(buckets.at(-1), "hour", hourly.timeZone), "23h");
      const daily = definitions.find((item) => item.granularity === "day");
      assert.equal(bindings.occupancyCalendarDateKey(daily.from), "2026-09-04");
      assert.equal(bindings.occupancyCalendarDateKey(daily.to), "2026-09-11");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}

test("intervalo civil não carrega 01h do avanço DST para o próximo dia", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Santiago";
  try {
    const definitions = live.buildOccupancyChartDefinitions(new Date("2026-09-06T12:00:00Z"), "America/Santiago");
    const daily = definitions.find((item) => item.granularity === "day");
    assert.equal(daily.to.getHours(), 0);
    assert.equal(live.listBucketStarts(daily).length, 7);
    const hourly = definitions.find((item) => item.granularity === "hour");
    assert.equal(hourly.from.toISOString(), "2026-09-06T04:00:00.000Z");
    assert.equal(live.bucketLabel(hourly.from, "hour", hourly.timeZone), "01h");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("configurações persistidas e controles visuais respeitam o acesso de edição", () => {
  assert.match(source, /const updateDashboardSettings[\s\S]*?if \(!canEditVisual\) return;/);
  assert.match(source, /canEditVisual && operationalSettingsOpen/);
  assert.match(source, /canEditVisual \? <div\s+aria-label="Aparência/);
  assert.match(source, /masterCrossCompanyScope\s*\? selectExplicitCompanyScopedRows\(response, companyScopeId/);
});

test("metadados opcionais não bloqueiam dados válidos; lacunas reais permanecem identificadas", () => {
  const definition = {
    from: new Date("2026-09-10T13:00:00Z"), to: new Date("2026-09-10T14:00:00Z"),
    granularity: "hour", timeZone: "America/Sao_Paulo",
  };
  const rows = [{ bucket: "2026-09-10T13:00:00Z", scenario_total_avg: 8, scenario_total_min: 1, scenario_total_max: 12 }];
  const state = live.buildOccupancyChartState(definition, rows, "A fonte não informa metadados adicionais.");
  assert.equal(state.incomplete, false);
  assert.equal(state.points[10].average, 8);
  assert.equal(state.points[10].current, null);
  assert.equal(state.points[11].average, null);
  assert.equal(live.buildOccupancyChartState(definition, []).incomplete, true);
  assert.match(source, /const hasIncompleteOccupancyCoverage = occupancyDataPlan.granularities.some/);
  assert.match(source, /return !state \|\| Boolean\(state.error \|\| state.incomplete\)/);
  assert.match(source, /loading=\{initialLoading \|\| !certifiedChartData\[definition.id\]\}/);
});

function load(path) {
  const filename = resolve(root, path);
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const localRequire = createRequire(filename);
  new Function("exports", "require", "module", output)(loaded.exports,
    (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : localRequire(name), loaded);
  return loaded.exports;
}
