import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  createModuleLoader,
  type RuntimeFixture,
} from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = createModuleLoader(projectRoot);
const analysisSource = source("components/app/occupancy-reports-dashboard.tsx");
const liveSource = source("components/app/occupancy-scenario-dashboard.tsx");
const analysisAst = ts.createSourceFile(
  "occupancy-reports-dashboard.tsx",
  analysisSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

test("catálogo compartilhado e aparência histórica permanecem em escopos distintos", () => {
  const scopeBlock = between(
    analysisSource,
    "const liveCustomizationScenarioId",
    "const layoutPreferencesReady",
  );
  const synchronizationBlock = effectContaining(
    "const synchronizeLiveCustomizations",
  );

  assertContains(
    scopeBlock,
    /analysis\s*\?\s*selectedScope\?\.scenario\?\.id\s*\?\?\s*""/,
    "o catálogo deve continuar vinculado ao ID cru do cenário do Ao Vivo",
  );
  assertContains(
    synchronizationBlock,
    /loadOccupancyCustomWidgets\(companyScopeId,\s*\{[\s\S]*?userId,[\s\S]*?viewId:\s*liveCustomizationScenarioId/,
  );
  assertContains(
    scopeBlock,
    /`\$\{analysis\s*\?\s*"analysis"\s*:\s*"reports"\}:\$\{selectedScope\.id\}`/,
    "preferências visuais do Análises precisam usar analysis:<cenário>",
  );
  assertContains(
    analysisSource,
    /preferenceScopeId=\{reportPreferenceScopeId\}/,
    "CardLayout deve persistir aparência no escopo histórico independente",
  );
  assert.doesNotMatch(
    synchronizationBlock,
    /loadOccupancyCustomWidgets[\s\S]*?viewId:\s*reportPreferenceScopeId/,
    "o catálogo do Ao Vivo não pode ser duplicado no escopo visual do Análises",
  );
});

test("Análises abre a visão salva no Ao Vivo sem sobrescrever a configuração original", () => {
  const importer = between(
    analysisSource,
    "function applySavedLiveOccupancyView",
    "const reportCardIdSet",
  );

  assertContains(
    analysisSource,
    /onApplySavedViewSource=\{analysis \? applySavedLiveOccupancyView : undefined\}/,
  );
  assertContains(
    analysisSource,
    /savedViewSources=\{analysis \? OCCUPANCY_LIVE_VIEW_SOURCES : \[\]\}/,
  );
  assertContains(analysisSource, /namespace: "occupancy-live" as const/);
  assertContains(importer, /userGridReadiness === "pending"/);
  assertContains(importer, /const targetViewId = `analysis:\$\{targetScope\.id\}`/);
  assertContains(importer, /buildOccupancyLiveAnalysisImport\(\{/);
  assertContains(importer, /if \(!imported\.importedCount\)/);
  assertContains(importer, /saveOccupancyWidgetSettings\(/);
  assertContains(importer, /saveOccupancyDashboardSettings\(/);
  assertContains(
    importer,
    /saveCardPreferences\(\s*"occupancy",\s*imported\.preferences,\s*targetCardIds,\s*companyScopeId,\s*userId,\s*targetViewId/,
  );
  assertContains(importer, /setSelectedId\(targetScope\.id\)/);
  assert.doesNotMatch(importer, /applyWidgetViewPreset|clearMenuStorage/);
});

test("widgets personalizados preservam séries, cor, tipo de gráfico e ações no Análises", () => {
  const analysisCards = between(
    analysisSource,
    "const customMetricCards",
    "const reportCardIds",
  );
  const liveCards = between(
    liveSource,
    "const customWidgetCards",
    "const detailCards",
  );

  for (const cards of [liveCards, analysisCards]) {
    assertContains(cards, /id:\s*`occupancy_custom_\$\{widget\.id\}`/);
    assertContains(cards, /metricVisibility=\{widget\.series\}/);
    assertContains(cards, /chartTypeEnabled:\s*true/);
    assertContains(cards, /configurationContent/);
  }
  assertContains(
    analysisCards,
    /customTrendCards\.map[\s\S]*?colorEditable:\s*true/,
    "a tendência histórica personalizada deve aceitar a mesma cor configurável",
  );
  assert.ok(
    (analysisCards.match(/configurationContent,/g) ?? []).length >= 2,
    "métrica e tendência personalizadas precisam expor as ações do catálogo",
  );
  assertContains(analysisCards, /canEditVisual[\s\S]*?!monitorMode/);
  assertContains(analysisCards, /onEdit/);
  assertContains(analysisCards, /onRemove/);
});

test("renderer histórico aplica o contexto visual do CardLayout", () => {
  const renderer = functionText("OccupancyReportChartCard");

  assertContains(renderer, /useWidgetChartType\(\)/);
  assertContains(renderer, /useWidgetColor\(/);
  assertContains(
    renderer,
    /(?:resolveOccupancyChartPalette|getConfiguredOccupancyChartPalette)\(/,
  );
  assertContains(
    renderer,
    /buildOccupancyReportChartOption\([\s\S]*?palette,[\s\S]*?chartType/,
    "o tipo salvo precisa chegar ao builder, não apenas à miniatura",
  );
  assertContains(
    renderer,
    /widgetColor/,
    "a cor salva precisa alterar a série renderizada",
  );
});

test("paleta do Análises é editável e salva no escopo visual histórico", () => {
  assertContains(analysisSource, /OccupancyPaletteSelect/);
  assertContains(analysisSource, /colorPaletteId/);
  assert.ok(
    callTexts("useOccupancyWidgetSettings").some(
      (call) =>
        call.includes("companyScopeId") &&
        call.includes("userId") &&
        /viewId:\s*reportPreferenceScopeId/.test(call),
    ),
    "o hook visual deve ler e salvar a paleta em analysis:<cenário>",
  );
  assertContains(analysisSource, /updateAnalysisWidgetSettings/);

  const paletteControlStart = analysisSource.indexOf("<OccupancyPaletteSelect");
  assert.notEqual(paletteControlStart, -1);
  const paletteControl = analysisSource.slice(
    paletteControlStart,
    analysisSource.indexOf("/>", paletteControlStart) + 2,
  );
  assertContains(paletteControl, /value=\{[^}]*colorPaletteId[^}]*\}/);
  assertContains(
    paletteControl,
    /onValueChange=\{\(colorPaletteId\)\s*=>[\s\S]*?updateAnalysisWidgetSettings\(\{\s*colorPaletteId\s*\}\)/,
  );
  assert.doesNotMatch(paletteControl, /loadCharts|apiFetch|setReportRequested/);
  assertContains(
    analysisSource,
    /defaultWidgetColor:\s*getOccupancyColorPalette\(\s*analysisWidgetSettings\.colorPaletteId/,
    "a paleta global também deve alimentar os widgets de duração",
  );
});

test("séries históricas acompanham o mesmo escopo visual de cada cenário", () => {
  assert.ok(
    callTexts("loadOccupancyDashboardSettings").some((call) =>
      call.includes("reportPreferenceScopeId"),
    ),
    "a seleção de séries deve ser lida de analysis:<cenário>",
  );
  assert.ok(
    callTexts("saveOccupancyDashboardSettings").some((call) =>
      call.includes("reportPreferenceScopeId"),
    ),
    "a seleção de séries deve ser salva em analysis:<cenário>",
  );
  assert.doesNotMatch(
    analysisSource,
    /saveOccupancyDashboardSettings\([\s\S]{0,300}?analysis\s*\?\s*"analysis"/,
    "o cenário atual não pode sobrescrever a configuração global de outra análise",
  );
});

test("persistência conserva a composição visual e as séries sem misturar os escopos", () => {
  const preferences = load<typeof import("../lib/view-preferences.ts")>(
    "lib/view-preferences.ts",
  );
  const customWidgets = load<typeof import("../lib/occupancy-custom-widgets.ts")>(
    "lib/occupancy-custom-widgets.ts",
  );
  const widgetSettings = load<typeof import("../lib/occupancy-widget-settings.ts")>(
    "lib/occupancy-widget-settings.ts",
  );
  const cardId = "occupancy_custom_trend-a";
  const normalizedPreferences = preferences.normalizeCardPreferences(
    "occupancy",
    [
      {
        chartType: "line",
        color: "#12AB34",
        heightLevel: 6,
        id: cardId,
        title: "Evolução executiva",
        visible: true,
        widthLevel: 5,
        zoom: 110,
      },
    ],
    [cardId],
  );
  assert.deepEqual(normalizedPreferences[0], {
    chartType: "line",
    color: "#12AB34",
    height: preferences.cardLayoutLevelToCardHeight(6),
    heightLevel: 6,
    id: cardId,
    size: preferences.cardLayoutLevelToCardSize(5),
    title: "Evolução executiva",
    visible: true,
    widthLevel: 5,
    zoom: 110,
  });

  const normalizedWidgets = customWidgets.normalizeOccupancyCustomWidgets([
    {
      created_at: "2026-09-15T12:00:00.000Z",
      granularity: "week",
      id: "trend-a",
      kind: "trend",
      series: { average: true, minimum: false, peak: true },
      title: "Evolução executiva",
      updated_at: "2026-09-15T12:00:00.000Z",
    },
  ]);
  const normalizedTrend = normalizedWidgets[0];
  assert.equal(normalizedTrend?.kind, "trend");
  assert.deepEqual(normalizedTrend?.kind === "trend" ? normalizedTrend.series : null, {
    average: true,
    minimum: false,
    peak: true,
  });
  assert.equal(
    widgetSettings.normalizeOccupancyWidgetSettings({ colorPaletteId: "cyber" })
      .colorPaletteId,
    "cyber",
  );
});

test("aparência e paleta não ampliam nem repetem o plano de consultas", () => {
  const helpers = extractFunctions(
    ["buildOccupancyCustomWidgetResourcePlan", "occupancyCustomTrendSourceId"],
  );
  const widgets = [
    {
      granularity: "week",
      id: "trend-a",
      kind: "trend",
      series: { average: true, minimum: false, peak: false },
    },
  ];
  const base = [{ id: "occupancy_custom_trend-a", visible: true }];
  const styled = [
    {
      ...base[0],
      chartType: "line",
      color: "#12AB34",
      heightLevel: 6,
      title: "Título salvo",
      widthLevel: 2,
      zoom: 1.6,
    },
  ];
  const alternateSeries = [
    {
      ...widgets[0],
      series: { average: false, minimum: false, peak: true },
    },
  ];

  const plan = helpers.buildOccupancyCustomWidgetResourcePlan(widgets, base);
  assert.deepEqual(
    helpers.buildOccupancyCustomWidgetResourcePlan(widgets, styled),
    plan,
    "cor, tipo, tamanho, zoom e título não são identidades de rede",
  );
  assert.deepEqual(
    helpers.buildOccupancyCustomWidgetResourcePlan(alternateSeries, styled),
    plan,
    "trocar uma série visível não exige outro agregado",
  );
  assert.equal(plan.definitionIds, "occupancy_report_day");
  assert.equal(plan.comparisonDefinitionIds, "occupancy_report_day");

  const requestPlan = between(
    analysisSource,
    "const requestPlanKey",
    "const requestedDefinitionIdSet",
  );
  assert.doesNotMatch(
    requestPlan,
    /colorPaletteId|chartType|widgetColor|\.color|\.title|heightLevel|widthLevel|zoom/,
  );
});

function source(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function assertContains(value: string, pattern: RegExp, message?: string) {
  assert.ok(pattern.test(value), message ?? `padrão ausente: ${pattern}`);
}

function between(value: string, startMarker: string, endMarker: string) {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `marcador inicial ausente: ${startMarker}`);
  assert.notEqual(end, -1, `marcador final ausente: ${endMarker}`);
  return value.slice(start, end);
}

function functionText(name: string) {
  const declaration = analysisAst.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(declaration, `função ausente: ${name}`);
  return declaration.getText(analysisAst);
}

function effectContaining(marker: string) {
  let effect = "";
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(analysisAst) === "React.useEffect"
    ) {
      const callback = node.arguments[0]?.getText(analysisAst) ?? "";
      if (callback.includes(marker)) effect = callback;
    }
    ts.forEachChild(node, visit);
  }
  visit(analysisAst);
  assert.ok(effect, `efeito ausente: ${marker}`);
  return effect;
}

function callTexts(name: string) {
  const calls: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(analysisAst) === name
    ) {
      calls.push(node.getText(analysisAst));
    }
    ts.forEachChild(node, visit);
  }
  visit(analysisAst);
  return calls;
}

function extractFunctions(names: string[]) {
  const declarations = analysisAst.statements.filter(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) &&
      Boolean(node.name && names.includes(node.name.text)),
  );
  assert.equal(declarations.length, names.length, `helpers ausentes: ${names}`);
  const output = ts.transpileModule(
    `${declarations.map((node) => node.getText(analysisAst)).join("\n")}\nreturn {${names.join(",")}};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  return new Function(output)() as Record<string, RuntimeFixture>;
}
