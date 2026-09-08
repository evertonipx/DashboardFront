import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const selection = load("lib/occupancy-comparison-selection.ts");
const source = readFileSync(resolve(root, "components/app/occupancy-comparison-widgets.tsx"), "utf8");
const scenarios = ["a", "b", "c", "d"].map((id) => ({ id, name: `Cenário ${id}` }));
const ids = selection.OCCUPANCY_COMPARISON_SCENARIO_CARD_IDS;

function preference(id, scenarioIds, visible = true) {
  return { id, visible, scenarioSelectionMode: "custom", scenarioIds };
}
function plan(preferences, overrides = {}) {
  return selection.buildOccupancyComparisonSelectionPlan({
    scenarios,
    preferences,
    inheritedScenarioIds: ["b", "a"],
    inheritedHeatmapScenarioId: "a",
    hexScenarioIds: ["d"],
    ...overrides,
  });
}

test("cada comparativo preserva sua composição sem modificar os demais", () => {
  const result = plan([
    preference(ids[0], ["c"]), preference(ids[1], ["a", "b"]),
    preference(ids[2], ["d"]), preference(ids[3], ["b"]),
    preference(ids[4], ["c"]), preference(ids[5], ["a"]),
    preference(ids[6], ["b", "d"]),
  ]);
  assert.deepEqual(result.byCard.get(ids[0]), ["c"]);
  assert.deepEqual(result.byCard.get(ids[1]), ["a", "b"]);
  assert.deepEqual(result.byCard.get(ids[2]), ["d"]);
  assert.deepEqual(result.byCard.get(ids[3]), ["b"]);
  assert.deepEqual(result.byCard.get(ids[4]), ["c"]);
  assert.deepEqual(result.byCard.get(ids[5]), ["a"]);
  assert.deepEqual(result.byCard.get(ids[6]), ["b", "d"]);
});

test("visões antigas herdam a seleção salva e o cenário legado do heatmap diário", () => {
  const result = plan(ids.map((id) => ({ id, visible: true })));
  for (const id of ids.filter((id) => id !== "occupancy_day_hour_heatmap")) {
    assert.deepEqual(result.byCard.get(id), ["b", "a"]);
  }
  assert.deepEqual(result.byCard.get("occupancy_day_hour_heatmap"), ["a"]);
});

test("seleção vazia explícita não volta a todos nem consulta fontes", () => {
  const result = plan(ids.map((id) => preference(id, [])));
  for (const id of ids) assert.deepEqual(result.byCard.get(id), []);
  for (const family of ["snapshots", "hourly", "currentHour", "trends"]) {
    assert.deepEqual(result[family], []);
  }
});

test("requisições são deduplicadas e limitadas à família de widgets visíveis", () => {
  const result = plan([
    preference("occupancy_scenario_half_donut", ["a"]),
    preference("occupancy_scenario_bar_race", ["a"]),
    preference("occupancy_day_hour_heatmap", ["b"]),
    preference("occupancy_scenario_max_month", ["c"]),
    preference("occupancy_scenario_max_year", ["d"], false),
    preference("occupancy_scenario_max_hour", ["d"], false),
  ]);
  assert.deepEqual(result.snapshots, ["a"]);
  assert.deepEqual(result.hourly, ["b"]);
  assert.deepEqual(result.currentHour, []);
  assert.deepEqual(result.trends, ["c"]);
});

test("máximo anual não amplia consultas horárias de outro widget", () => {
  const result = plan([
    preference("occupancy_scenario_max_year", ["c"]),
    preference("occupancy_scenario_max_hour", ["b"]),
  ]);
  assert.deepEqual(result.hourly, ["b"]);
  assert.deepEqual(result.currentHour, ["b", "c"]);
  assert.deepEqual(result.trends, ["c"]);
  assert.deepEqual(result.snapshots, ["b", "c"]);
});

test("hexágonos preservam vínculos próprios e não ampliam séries históricas", () => {
  const result = plan([{ id: "occupancy_hex_layout", visible: true }]);
  assert.deepEqual(result.snapshots, ["d"]);
  assert.deepEqual(result.hourly, []);
  assert.deepEqual(result.currentHour, []);
  assert.deepEqual(result.trends, []);
});

test("IDs de outra empresa, removidos ou duplicados não entram na seleção", () => {
  const result = plan([preference(ids[0], ["foreign", "c", "c", "a"])]);
  assert.deepEqual(result.byCard.get(ids[0]), ["c", "a"]);
  assert.deepEqual(result.snapshots, ["a", "c"]);
});

test("todos respeita cenários disponíveis; mapa diário mantém apenas um cenário", () => {
  const result = plan([
    { id: ids[0], visible: true, scenarioSelectionMode: "all" },
    preference("occupancy_day_hour_heatmap", ["c", "b"]),
  ]);
  assert.deepEqual(result.byCard.get(ids[0]), ["a", "b", "c", "d"]);
  assert.deepEqual(result.byCard.get("occupancy_day_hour_heatmap"), ["c"]);
});

test("filtro preserva ordem e zeros sem introduzir linhas de outro widget", () => {
  const rows = [{ scenarioId: "a", total: 9 }, { scenarioId: "b", total: 0 }, { scenarioId: "c", total: 7 }];
  assert.deepEqual(selection.filterOccupancyComparisonRows(rows, ["b", "a"]), [rows[1], rows[0]]);
  assert.deepEqual(selection.filterOccupancyComparisonRows(rows, []), []);
  assert.deepEqual(rows.map((row) => row.total), [9, 0, 7]);
});

test("comparativos usam o inspetor comum, sem segundo seletor compartilhado no cabeçalho", () => {
  assert.doesNotMatch(source, /ScenarioScopeDialog|onScenarioIdsChange|commonScopeProps/);
  assert.equal((source.match(/\.\.\.scenarioCardDefaults/g) ?? []).length, 7);
  assert.equal((source.match(/node: \(context\) =>/g) ?? []).length, 7);
  assert.match(source, /scenarioConfigurable: true/);
  assert.match(source, /scenarioSelectionPolicy: "single"/);
  assert.equal((source.match(/configurationContent: !monitorMode/g) ?? []).length, 4);
});

test("foco pendente fora da seleção não bloqueia nem contamina séries horárias", () => {
  const declarations = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = declarations.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "resolveSharedOccupancyHourlyAggregate");
  const compiled = ts.transpileModule(`${declaration.getText(declarations)}\nmodule.exports = resolveSharedOccupancyHourlyAggregate;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", "sameOccupancyRange", "occupancyAggregateBucketKey", compiled)(loaded,
    (a, b) => a.from.getTime() === b.from.getTime() && a.to.getTime() === b.to.getTime(),
    (date) => date.getTime(),
  );
  const range = { buckets: [], from: new Date("2026-09-04T03:00:00Z"), to: new Date("2026-09-04T15:00:00Z") };
  const pendingSource = { ...range, series: null };
  assert.deepEqual(loaded.exports(pendingSource, "a", range, new Set(["b"])), { covered: false, series: null });
  assert.deepEqual(loaded.exports(pendingSource, "a", range, new Set(["a"])), { covered: true, series: null });
  const series = { scenarioId: "a", name: "Foco", metrics: new Map() };
  assert.deepEqual(loaded.exports({ ...range, series }, "a", range, new Set(["b"])), { covered: false, series: null });
  assert.equal(loaded.exports({ ...range, series }, "a", range, new Set(["a", "b"])).series, series);
  assert.match(source, /resolveSharedOccupancyHourlyAggregate\(\s*focusHourlyAggregateRef\.current,\s*focusScenarioId,\s*range,\s*requestedIds,/);
});

test("consulta independente não reutiliza data antiga da leitura de outro cenário", () => {
  const snapshot = { scenarioId: "a", requestedAt: new Date("2026-09-01T03:00:00Z") };
  assert.equal(selection.selectOccupancyComparisonSharedSource(snapshot, "a", new Set(["b"])), null);
  assert.equal(selection.selectOccupancyComparisonSharedSource(snapshot, "b", new Set(["b"])), null);
  assert.equal(selection.selectOccupancyComparisonSharedSource(snapshot, "a", new Set(["a"])), snapshot);
  assert.equal(selection.selectOccupancyComparisonSharedSource(null, "a", new Set(["a"])), null);
  assert.match(source, /const sharedFocusSnapshot = selectOccupancyComparisonSharedSource\(\s*focusSnapshotRef\.current,\s*focusScenarioId,\s*requestedIds,/);
  assert.match(source, /const requestedAt = sharedFocusSnapshot\?\.requestedAt \?\? new Date\(\)/);
});

test("exportação usa os mesmos cenários independentes, inclusive seleção vazia", () => {
  const declarations = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = declarations.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildOccupancyComparisonReportAssets");
  const helpers = {
    ...load("lib/occupancy-comparison.ts"),
    ...load("lib/occupancy-color-palettes.ts"),
    ...load("lib/occupancy-widget-settings.ts"),
    ...load("lib/occupancy-hex-layout.ts"),
    ...load("lib/occupancy-hex-palette.ts"),
    ...load("lib/occupancy-hex-visual.ts"),
    ...selection,
    buildCurrentComparisonBarOption: () => ({}),
    buildCurrentComparisonVerticalBarOption: () => ({}),
    buildHalfDonutOption: () => ({}),
    buildLiveBarRaceOption: () => ({}),
    buildMaximumLineSeries: ({ series }) => series,
    buildMaximumReportAsset: ({ cardId, series }) => ({ cardId, chart: { table: { rows: series.map((item) => ({ scenario: item.name })) } } }),
    buildHexLayoutOption: () => ({}),
    buildHeatmapOption: () => ({}),
    sharedHeatmapMaximum: () => 1,
    formatHeatmapDateKey: (value) => value,
    formatDateTime: (value) => value,
    metricLabel: (value) => value,
    comparisonStateLabel: (value) => value,
    occupancyStateLabel: (value) => value,
  };
  const compiled = ts.transpileModule(`${declaration.getText(declarations)}\nmodule.exports = buildOccupancyComparisonReportAssets;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", ...Object.keys(helpers), compiled)(loaded, ...Object.values(helpers));
  const series = scenarios.map((scenario) => ({ scenarioId: scenario.id, name: scenario.name, metrics: new Map() }));
  const selectionsByCard = new Map(ids.map((id) => [id, []]));
  selectionsByCard.set(ids[0], ["a"]);
  selectionsByCard.set(ids[1], ["c"]);
  selectionsByCard.set(ids[3], ["b"]);
  const reports = loaded.exports({
    aggregateBuckets: [], aggregateSeries: series, currentHourBucket: null,
    currentHourSeries: [], heatmapScenarioId: "a", hexSnapshots: [],
    hourlyMaximumBuckets: [], hourlyMaximumSeries: series,
    maximumTrendRanges: null, maximumTrendSeries: series, scenarioHourHeatmapDateKey: "",
    scenarios, selectionsByCard, selectedScenarioIds: ["a", "b", "c", "d"],
    settings: load("lib/occupancy-widget-settings.ts").DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
    snapshots: scenarios.map((scenario, index) => ({ scenarioId: scenario.id, name: scenario.name, total: index + 1 })),
  });
  const byId = new Map(reports.map((report) => [report.cardId, report.chart.table.rows]));
  assert.deepEqual(byId.get(ids[0]).map((row) => row.scenario), ["Cenário a"]);
  assert.deepEqual(byId.get(ids[1]).map((row) => row.scenario), ["Cenário c"]);
  assert.deepEqual(byId.get(ids[2]), []);
  assert.deepEqual(byId.get(ids[3]).map((row) => row.scenario), ["Cenário b"]);
  assert.deepEqual(byId.get(ids[4]), []);
  assert.deepEqual(byId.get(ids[5]), []);
  assert.deepEqual(byId.get(ids[6]), []);
});

function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} };
  modules.set(path, loaded);
  const output = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: path }).outputText;
  new Function("exports", "require", "module", output)(loaded.exports, (specifier) => specifier.startsWith("@/") ? load(`${specifier.slice(2)}.ts`) : require(specifier), loaded);
  return loaded.exports;
}
