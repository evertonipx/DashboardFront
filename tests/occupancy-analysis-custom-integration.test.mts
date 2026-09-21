import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { createModuleLoader, type RuntimeFixture } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardSource = readFileSync(resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"), "utf8");
const ast = ts.createSourceFile("occupancy-reports-dashboard.tsx", dashboardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const load = createModuleLoader(projectRoot);
const palette = load("components/app/occupancy-chart-palette.ts").getOccupancyChartPalette("light");
const chartFunctions = extractFunctions(["buildOccupancyReportChartOption"], {
  denseMarkerSize: () => 4,
  occupancyFixedHourLabelInterval: () => true,
});
const definition = {
  id: "occupancy_custom_fixture", label: "Tendência personalizada", description: "Histórico selecionado",
  granularity: "day", from: new Date("2026-07-10T03:00:00Z"), to: new Date("2026-07-13T03:00:00Z"),
  timeZone: "America/Sao_Paulo",
};
const points = [
  { bucket: "2026-07-10", label: "10/07", average: 3, current: null, minimum: 0, peak: 8 },
  { bucket: "2026-07-11", label: "11/07", average: 0, current: null, minimum: 0, peak: 0 },
  { bucket: "2026-07-12", label: "12/07", average: null, current: null, minimum: null, peak: null },
];
const previousPoints = [
  { ...points[0], average: 6, minimum: 2, peak: 10 },
  { ...points[1] },
  { ...points[2] },
];

for (const comparison of [false, true]) {
  test(`tendência histórica só média não revela extremos desmarcados (comparativo ${comparison})`, () => {
    const option = buildOption({ average: true, minimum: false, peak: false }, comparison);
    assertNoRangeBands(option);
    assert.deepEqual(metricSeries(option).map((series) => series.name),
      comparison ? ["Média", "Média comparativa"] : ["Média"]);
    assert.deepEqual(metricSeries(option)[0].data, [3, 0, null]);
    if (comparison) assert.deepEqual(metricSeries(option)[1].data, [6, 0, null]);
  });

  test(`tendência histórica só mínimo exibe o mínimo como série independente (comparativo ${comparison})`, () => {
    const option = buildOption({ average: false, minimum: true, peak: false }, comparison);
    assertNoRangeBands(option);
    const series = metricSeries(option);
    assert.equal(series.length, comparison ? 2 : 1);
    assert.ok(series.every((item) => /^Mínimo(?:\s|$)/.test(item.name)));
    assert.deepEqual(series[0].data, [0, 0, null]);
    if (comparison) assert.deepEqual(series[1].data, [2, 0, null]);
  });

  test(`tendência histórica só máximo exibe o máximo como série independente (comparativo ${comparison})`, () => {
    const option = buildOption({ average: false, minimum: false, peak: true }, comparison);
    assertNoRangeBands(option);
    const series = metricSeries(option);
    assert.equal(series.length, comparison ? 2 : 1);
    assert.ok(series.every((item) => /^Máximo(?:\s|$)/.test(item.name)));
    assert.deepEqual(series[0].data, [8, 0, null]);
    if (comparison) assert.deepEqual(series[1].data, [10, 0, null]);
  });

  test(`tendência histórica com todas as séries desmarcadas não revela dados ocultos (comparativo ${comparison})`, () => {
    const option = buildOption({ average: false, minimum: false, peak: false }, comparison);
    assertNoRangeBands(option);
    assert.equal(metricSeries(option).length, 0);
  });
}

test("tendência com mínimo e máximo habilitados preserva a banda, os zeros e as lacunas", () => {
  const option = buildOption({ average: false, minimum: true, peak: true }, true);
  const currentBand = option.series.filter((series: RuntimeFixture) => series.stack === "occupancy_range");
  const previousBand = option.series.filter((series: RuntimeFixture) => series.stack === "previous_occupancy_range");
  assert.equal(currentBand.length, 2);
  assert.equal(previousBand.length, 2);
  assert.deepEqual(currentBand[0].data, [0, 0, null]);
  assert.deepEqual(currentBand[1].data, [8, 0, null]);
  assert.deepEqual(previousBand[0].data, [2, 0, null]);
  assert.deepEqual(previousBand[1].data, [8, 0, null]);
});

test("tela e exportação fornecem as séries salvas do widget ao mesmo renderer histórico", () => {
  const cards = dashboardSource.slice(dashboardSource.indexOf("const customTrendCards"), dashboardSource.indexOf("const reportCardIds"));
  const payload = dashboardSource.slice(dashboardSource.indexOf("function buildOccupancyReportPayload"), dashboardSource.indexOf("const getOccupancyAiPayload"));
  assert.match(cards, /customTrendCards\.map[\s\S]*?metricVisibility=\{widget\.series\}/);
  assert.match(payload, /customTrendCards\.forEach[\s\S]*?buildExportChart\(\s*definition,\s*sourceDefinition,\s*widget\.series,/);
  assert.match(payload, /buildOccupancyReportChartOption\(\s*definition,\s*points,[\s\S]*?visibility,/);
});

test("personalizações são lidas no escopo Ao Vivo da mesma empresa, usuário e cenário", () => {
  const reads: RuntimeFixture[] = [];
  const listeners = new Map<string, () => void>();
  let state: RuntimeFixture;
  const widgets = [{ id: "custom-a", kind: "metric", metric: "current", title: "Leitura" }];
  const effect = findEffect("const synchronizeLiveCustomizations");
  const cleanup = evaluate(`return (${effect})();`, {
    companyScopeId: "company-a", userId: "user-a",
    liveCustomizationScenarioId: "scenario-a",
    liveCustomizationScopeKey: "company-a|user-a|scenario-a",
    loadOccupancyCustomWidgets: (...args: RuntimeFixture[]) => { reads.push(args); return widgets; },
    loadOccupancyWidgetSettings: (...args: RuntimeFixture[]) => {
      reads.push(args); return { capacities: { "scenario-a": 50, "scenario-b": 100 } };
    },
    setLiveCustomizationState: (value: RuntimeFixture) => { state = value; },
    window: {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT: "custom",
    OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT: "settings",
    USER_GRID_HYDRATED_EVENT: "hydrated",
  });
  assert.deepEqual(reads, [
    ["company-a", { userId: "user-a", viewId: "scenario-a" }],
    ["company-a", "user-a", "scenario-a"],
  ]);
  assert.deepEqual(state, { capacity: 50, scopeKey: "company-a|user-a|scenario-a", widgets });
  assert.deepEqual([...listeners.keys()].sort(), ["custom", "hydrated", "settings", "storage"]);
  listeners.get("hydrated")!();
  assert.equal(reads.length, 4, "hidratação remota atualiza a mesma composição escopada");
  cleanup();
  assert.equal(listeners.size, 0);
  assert.match(dashboardSource, /liveCustomizationState\.scopeKey === liveCustomizationScopeKey/);
  assert.match(dashboardSource, /analysis \? selectedScope\?\.scenario\?\.id \?\? "" : ""/);
});

test("sem cenário histórico válido nenhuma preferência Ao Vivo é lida", () => {
  let state: RuntimeFixture = { capacity: 50, scopeKey: "old", widgets: [{ id: "old" }] };
  const result = evaluate(`return (${findEffect("const synchronizeLiveCustomizations")})();`, {
    liveCustomizationScenarioId: "", liveCustomizationScopeKey: "",
    setLiveCustomizationState: (update: RuntimeFixture) => { state = update(state); },
  });
  assert.equal(result, undefined);
  assert.deepEqual(state, { capacity: null, scopeKey: "", widgets: [] });
});

test("plano customizado consulta somente fontes necessárias e deduplica tendências do mesmo período", () => {
  const helpers = customFunctions();
  const widgets = [
    { id: "current", kind: "metric", metric: "current" },
    { id: "average", kind: "metric", metric: "average" },
    { id: "minute", kind: "trend", granularity: "minute" },
    { id: "hour", kind: "trend", granularity: "hour" },
    { id: "day", kind: "trend", granularity: "day" },
    { id: "week", kind: "trend", granularity: "week" },
    { id: "month", kind: "trend", granularity: "month" },
  ].map((widget) => widget.kind === "trend"
    ? { ...widget, series: { average: true, minimum: true, peak: true } }
    : widget);
  const preferences = widgets.map((widget) => ({ id: `occupancy_custom_${widget.id}`, visible: true }));
  const plan = helpers.buildOccupancyCustomWidgetResourcePlan(widgets, preferences);
  assert.equal(plan.currentSnapshot, true);
  assert.equal(plan.definitionIds, "occupancy_report_day|occupancy_report_hour|occupancy_report_minute");
  assert.equal(plan.comparisonDefinitionIds, plan.definitionIds);
  assert.equal(helpers.mergeOccupancyResourceIds("occupancy_report_day|occupancy_report_hour", plan.definitionIds), plan.definitionIds);
  const hidden = helpers.buildOccupancyCustomWidgetResourcePlan(widgets, preferences.map((preference) => ({ ...preference, visible: false })));
  assert.deepEqual(hidden, { currentSnapshot: false, definitionIds: "", comparisonDefinitionIds: "" });
  const notRequested = helpers.buildOccupancyCustomWidgetResourcePlan(
    widgets,
    preferences,
    new Set<string>(),
  );
  assert.deepEqual(
    notRequested,
    { currentSnapshot: false, definitionIds: "", comparisonDefinitionIds: "" },
    "um widget fora da demanda visível não pode ativar sua fonte compartilhada",
  );
  const missingPreferences = helpers.buildOccupancyCustomWidgetResourcePlan(
    widgets,
    [],
    new Set(preferences.map((preference) => preference.id)),
  );
  assert.deepEqual(
    missingPreferences,
    { currentSnapshot: false, definitionIds: "", comparisonDefinitionIds: "" },
    "preferências ainda não normalizadas devem falhar fechadas",
  );
  const partialPreferences = helpers.buildOccupancyCustomWidgetResourcePlan(
    widgets,
    [{ id: "occupancy_custom_average", visible: true }],
    new Set(preferences.map((preference) => preference.id)),
  );
  assert.deepEqual(
    partialPreferences,
    {
      currentSnapshot: false,
      definitionIds: "occupancy_report_day",
      comparisonDefinitionIds: "",
    },
    "uma lista parcial só pode ativar o widget explicitamente visível",
  );
});

test("métricas customizadas usam snapshot ou agregado diário sem pedir comparativos desnecessários", () => {
  const helpers = customFunctions();
  for (const metric of ["current", "active_areas", "utilization", "average", "minimum", "peak", "alerts"]) {
    const widget = { id: metric, kind: "metric", metric };
    const plan = helpers.buildOccupancyCustomWidgetResourcePlan([widget], [{ id: `occupancy_custom_${metric}`, visible: true }]);
    assert.equal(plan.currentSnapshot, ["current", "active_areas", "utilization"].includes(metric), metric);
    assert.equal(plan.definitionIds, ["average", "minimum", "peak"].includes(metric) ? "occupancy_report_day" : "", metric);
    assert.equal(plan.comparisonDefinitionIds, "", metric);
  }
});

test("granularidades customizadas reutilizam fontes históricas disponíveis sem inventar consulta semanal/mensal", () => {
  const helpers = customFunctions();
  const source = { ...definition, id: "occupancy_report_day", granularity: "day" };
  for (const [granularity, expectedId] of [
    ["minute", "occupancy_report_minute"], ["hour", "occupancy_report_hour"],
    ["day", "occupancy_report_day"], ["week", "occupancy_report_day"], ["month", "occupancy_report_day"],
  ]) {
    assert.equal(helpers.occupancyCustomTrendSourceId(granularity), expectedId);
  }
  const custom = helpers.buildOccupancyCustomTrendDefinition({ id: "weekly", title: "Minha tendência", kind: "trend", granularity: "week" }, source);
  assert.equal(custom.id, "occupancy_custom_weekly");
  assert.equal(custom.label, "Minha tendência");
  assert.equal(custom.granularity, "day", "a série diária não pode ser rotulada como agregado semanal");
  assert.deepEqual(custom.from, source.from);
  assert.deepEqual(custom.to, source.to);
  assert.match(custom.description, /dia|resolu|período|intervalo/i);
});

test("métricas personalizadas refletem o snapshot histórico e o agregado fornecido, nunca dados atuais", () => {
  const presentation = customFunctions().occupancyAnalysisCustomMetricPresentation;
  const values = {
    capacity: 50, rangeMetric: { average: 8, current: 11, minimum: 2, peak: 30 },
    snapshot: { total: 12, activeAreas: 2, asOf: "2026-07-12T23:59:59Z" }, snapshotError: "",
  };
  for (const [metric, value] of [["current", 12], ["active_areas", 2], ["average", 8], ["minimum", 2], ["peak", 30]]) {
    assert.equal(presentation(metric, values).value, value, String(metric));
  }
  assert.equal(presentation("utilization", values).value, "24%");
  assert.equal(presentation("utilization", { ...values, capacity: null }).value, null);
  assert.equal(presentation("utilization", { ...values, capacity: 0 }).value, null);
  for (const metric of ["current", "active_areas", "utilization"]) {
    assert.equal(presentation(metric, { ...values, snapshot: null, snapshotError: "historical snapshot unavailable" }).value, null);
  }
  assert.equal(presentation("alerts", values).value, null, "alertas recentes do Ao Vivo não podem fingir representar o passado");
  assert.match(presentation("alerts", values).description, /históric|disponível|suport|janela|período/i);
});

function buildOption(visibility: { average: boolean; minimum: boolean; peak: boolean }, comparison: boolean) {
  return chartFunctions.buildOccupancyReportChartOption(
    definition, points, comparison ? previousPoints : [], visibility, {}, palette,
  );
}

function assertNoRangeBands(option: RuntimeFixture) {
  assert.ok(option.series.every((series: RuntimeFixture) =>
    series.stack !== "occupancy_range" && series.stack !== "previous_occupancy_range"),
  "a banda mínimo–máximo só pode existir quando ambas as séries estão selecionadas");
}

function metricSeries(option: RuntimeFixture): RuntimeFixture[] {
  return option.series.filter((series: RuntimeFixture) => !series.silent && series.name);
}

function extractFunctions(names: string[], bindings: Record<string, RuntimeFixture> = {}): Record<string, RuntimeFixture> {
  const declarations = ast.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text));
  assert.equal(declarations.length, names.length, `helpers ausentes: ${names.join(", ")}`);
  return evaluate(declarations.map((node) => node.getText(ast)).join("\n") + `\nreturn {${names.join(",")}};`, bindings);
}

function evaluate(source: string, bindings: Record<string, RuntimeFixture> = {}): RuntimeFixture {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}

function findEffect(marker: string) {
  let effect: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "React.useEffect") {
      const callback = node.arguments[0]?.getText(ast);
      if (callback?.includes(marker)) effect = callback;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(effect, `efeito não encontrado: ${marker}`);
  return effect;
}

function customFunctions() {
  return extractFunctions([
    "buildOccupancyCustomWidgetResourcePlan", "mergeOccupancyResourceIds",
    "occupancyCustomTrendSourceId", "buildOccupancyCustomTrendDefinition",
    "occupancyAnalysisCustomMetricPresentation", "formatOccupancyValue", "roundValue",
  ], Object.fromEntries(["Bell", "Gauge", "UsersRound", "Activity", "MapPinned", "BarChart3", "TrendingUp"].map((icon) => [icon, icon])));
}
