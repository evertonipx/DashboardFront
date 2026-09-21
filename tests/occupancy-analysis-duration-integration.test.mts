import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { createModuleLoader, type RuntimeFixture } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const load = createModuleLoader(projectRoot);
const preferencesModule = load<typeof import("../lib/view-preferences.ts")>("lib/view-preferences.ts");
const insightIds = [
  "occupancy_duration_month_heatmap",
  "occupancy_duration_scenario_heatmap",
  "occupancy_duration_week_heatmap",
  "occupancy_duration_daily_profile",
] as const;
const dashboardSource = readFileSync(resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"), "utf8");
const dashboardAst = ts.createSourceFile("dashboard.tsx", dashboardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function source(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

test("dashboard cria período de duração com instantes civis e corte histórico corretos", () => {
  const initializer = dashboardVariable("occupancyDurationAnalysisPeriod");
  assert.ok(ts.isCallExpression(initializer));
  const factory = initializer.arguments[0].getText(dashboardAst);
  const from = new Date("2026-07-10T03:00:00Z"), to = new Date("2026-07-13T03:00:00Z");
  const clock = new Date("2026-09-15T15:31:25Z");
  const reportRange = { instantFrom: from, instantTo: to, includesToday: false, from: new Date("2026-07-10T00:00:00Z"), to: new Date("2026-07-13T00:00:00Z") };
  const boundaries: RuntimeFixture[] = [];
  const bindings = {
    analysis: true, reportRange, clock, durationAnalysisCutoff: clock,
    companyTimeZone: "America/Sao_Paulo",
    buildOccupancyDurationInsightAnalysisPeriod: (options: RuntimeFixture) => options,
    occupancyCalendarBoundaryInstant: (date: Date, zone: string) => {
      boundaries.push([date, zone]); return date === reportRange.from ? from : to;
    },
  };
  assert.deepEqual(evaluateDashboard(`return (${factory})();`, bindings), { from, to, cutoff: to, timeZone: "America/Sao_Paulo" });
  assert.equal(boundaries.length, 0, "instantes já resolvidos não sofrem segunda conversão");
  assert.deepEqual(evaluateDashboard(`return (${factory})();`, {
    ...bindings, reportRange: { ...reportRange, includesToday: true },
  }), { from, to, cutoff: clock, timeZone: "America/Sao_Paulo" });
  assert.equal(evaluateDashboard(`return (${factory})();`, { ...bindings, analysis: false }), null);
  assert.deepEqual(evaluateDashboard(`return (${factory})();`, {
    ...bindings, reportRange: { ...reportRange, instantFrom: undefined, instantTo: undefined },
  }), { from, to, cutoff: to, timeZone: "America/Sao_Paulo" });
  assert.deepEqual(boundaries, [[reportRange.from, "America/Sao_Paulo"], [reportRange.to, "America/Sao_Paulo"]]);
});

test("dashboard só habilita insights manuais após pedido, cenário e preferências prontos", () => {
  const initializer = dashboardVariable("occupancyDurationInsights");
  assert.ok(ts.isCallExpression(initializer));
  assert.equal(initializer.expression.getText(dashboardAst), "useOccupancyDurationInsights");
  const options = initializer.arguments[0].getText(dashboardAst);
  const bindings = {
    analysis: true, layoutPreferencesReady: true, reportRequested: true,
    companyTimeZoneCertified: true,
    analysisWidgetSettings: { colorPaletteId: "enterprise" },
    getOccupancyColorPalette: () => ({ colors: ["#2563EB"] }),
    selectedScope: { scenario: { id: "scenario-a" } }, occupancyDurationAnalysisPeriod: { from: "fixture" },
    companyScopeId: "company-a", userId: "user-a", monitorMode: false, companyTimeZone: "America/Sao_Paulo",
    scenarios: [{ id: "scenario-a" }], layoutPreferences: [{ id: insightIds[0], visible: true }],
    requestedHistoricalCardIds: new Set([insightIds[0]]),
  };
  const configured = evaluateDashboard(`return (${options});`, bindings);
  assert.equal(configured.enabled, true);
  assert.equal(configured.refreshMode, "manual");
  assert.equal(configured.period, bindings.occupancyDurationAnalysisPeriod);
  assert.equal(configured.preferences, bindings.layoutPreferences);
  assert.equal(configured.requestedCardIds, bindings.requestedHistoricalCardIds);
  assert.equal(configured.focusScenarioId, "scenario-a");
  assert.equal(configured.defaultWidgetColor, "#2563EB");
  for (const [key, value] of [
    ["companyTimeZoneCertified", false], ["analysis", false],
    ["layoutPreferencesReady", false], ["reportRequested", false],
    ["selectedScope", null], ["occupancyDurationAnalysisPeriod", null],
  ] as const) {
    const disabled = evaluateDashboard(`return (${options});`, { ...bindings, [key]: value });
    assert.equal(disabled.enabled, false, key);
    if (key === "layoutPreferencesReady") assert.deepEqual(disabled.preferences, []);
  }
});

test("hidratação remota pendente mantém a demanda histórica vazia e não consulta duração", async () => {
  const readyExpression = dashboardVariable("layoutPreferencesReady").getText(dashboardAst);
  assert.equal(
    evaluateDashboard(`return (${readyExpression});`, {
      layoutPreferencesIdentityKey: "company-a|user-a|analysis:scenario-a",
      layoutPreferencesScopeKey: "company-a|user-a|analysis:scenario-a",
      userGridReadiness: "pending",
    }),
    false,
  );

  const requestedInitializer = dashboardVariable("requestedHistoricalCardIds");
  assert.ok(ts.isCallExpression(requestedInitializer));
  const requestedFactory = requestedInitializer.arguments[0].getText(dashboardAst);
  const requested = evaluateDashboard(`return (${requestedFactory})();`, {
    layoutPreferencesReady: false,
    layoutPreferences: insightIds.map((id) => ({ id, visible: true })),
  }) as Set<string>;
  assert.equal(requested.size, 0, "defaults locais não podem abrir rede antes do user-grid");
  const dashboardQuery = load<
    typeof import("../lib/occupancy-dashboard-query.ts")
  >("lib/occupancy-dashboard-query.ts");
  assert.deepEqual(
    dashboardQuery.buildOccupancyReportResourcePlan({
      definitionIds: ["occupancy_report_hour", "occupancy_report_day"],
      hasScenario: true,
      metricVisibility: { average: true, minimum: true, peak: true },
      preferences: [
        { id: "occupancy_report_current", visible: true },
        { id: "occupancy_report_hour", visible: true },
      ],
      requestedCardIds: requested,
    }),
    { comparisonDefinitionIds: "", currentSnapshot: false, definitionIds: "" },
  );

  const fixture = createInsightHookFixture({
    refreshMode: "manual",
    requestedCardIds: requested,
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
  } finally {
    fixture.cleanup();
  }
});

test("CardLayout recebe tempo ocupado em Análises e permanência individual também em Relatórios", () => {
  const cardsExpression = dashboardVariable("occupancyReportLayoutCards").getText(dashboardAst);
  const cards = insightIds.map((id) => ({ id }));
  const loiteringCards = [{ id: "occupancy_loitering_summary" }];
  const bindings = { analysis: true, metricCards: [], definitions: [], customMetricCards: [], customTrendCards: [], occupancyDurationInsights: { cards }, occupancyLoitering: { cards: loiteringCards } };
  assert.deepEqual(evaluateDashboard(`return (${cardsExpression});`, bindings), [...loiteringCards, ...cards]);
  assert.deepEqual(evaluateDashboard(`return (${cardsExpression});`, { ...bindings, analysis: false }), loiteringCards);
  const layout = dashboardJsxTag("CardLayout");
  const options = [{ id: "scenario-a", name: "Entrada", company_id: "company-a" }];
  assert.deepEqual(evaluateDashboard(`return (${jsxAttribute(layout, "scenarios")});`, { analysis: true, scenarios: options }), [{ id: "scenario-a", name: "Entrada" }]);
  assert.deepEqual(evaluateDashboard(`return (${jsxAttribute(layout, "scenarios")});`, { analysis: false, scenarios: options }), []);
  assert.equal(jsxAttribute(layout, "showCardConfigurationActions"), "analysis");
  assert.equal(jsxAttribute(layout, "preferenceScopeId"), "reportPreferenceScopeId");
  assert.match(jsxAttribute(layout, "presetNamespace"), /analysis \? "occupancy-analysis" : "occupancy-reports"/);
});

test("exportação ordena assets paginados junto aos cards visíveis e mantém títulos personalizados", () => {
  const payload = dashboardNodes().find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "buildOccupancyReportPayload");
  assert.ok(payload?.body);
  const mapStatement = payload.body.statements.find((node) =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(dashboardAst) === "durationInsightChartsByCardId"));
  const populate = payload.body.statements.find((node) =>
    ts.isExpressionStatement(node) && node.expression.getText(dashboardAst).startsWith("occupancyDurationInsights.reportAssets.forEach"));
  const returned = payload.body.statements.find((node): node is ts.ReturnStatement => ts.isReturnStatement(node));
  assert.ok(mapStatement && populate && returned?.expression && ts.isObjectLiteralExpression(returned.expression));
  const charts = returned.expression.properties.find((property): property is ts.PropertyAssignment =>
    ts.isPropertyAssignment(property) && property.name.getText(dashboardAst) === "charts");
  assert.ok(charts);
  const reportAssets = [
    { cardId: insightIds[0], chart: { title: "Dias", table: { rows: ["days"] } } },
    { cardId: insightIds[1], titleSuffix: " · 1/2", chart: { title: "Cenários", table: { rows: ["first-page"] } } },
    { cardId: insightIds[1], titleSuffix: " · 2/2", chart: { title: "Cenários", table: { rows: ["second-page"] } } },
    { cardId: insightIds[2], chart: { title: "Oculto", table: { rows: ["hidden"] } } },
  ];
  const result = evaluateDashboard(`${mapStatement.getText(dashboardAst)}\n${populate.getText(dashboardAst)}\nreturn (${charts.initializer.getText(dashboardAst)});`, {
    occupancyDurationInsights: { reportAssets },
    orderedVisibleReportCardIds: ["occupancy_report_day", insightIds[1], insightIds[0]],
    exportChartByCardId: new Map([["occupancy_report_day", { title: "Histórico" }]]),
    resolveReportCardTitle: (id: string, fallback: string) => id === insightIds[1] ? "Minha comparação" : fallback,
  });
  assert.deepEqual(result.map((chart: RuntimeFixture) => chart.title), ["Histórico", "Minha comparação · 1/2", "Minha comparação · 2/2", "Dias"]);
  assert.deepEqual(result.slice(1).map((chart: RuntimeFixture) => chart.table.title), ["Dados - Minha comparação · 1/2", "Dados - Minha comparação · 2/2", "Dados - Dias"]);
  assert.deepEqual(result.slice(1).flatMap((chart: RuntimeFixture) => chart.table.rows), ["first-page", "second-page", "days"]);
});

test("carregamento e corte dos insights participam das travas de exportação e IA", () => {
  const pending = dashboardVariable("chartsPending").getText(dashboardAst);
  assert.equal(evaluateDashboard(`return (${pending});`, {
    loadingCharts: false, occupancyDurationInsights: { loading: true }, reportRequested: false,
    occupancyLoitering: { loading: false }, selectedScope: {}, chartDataIsCurrent: true,
  }), true);
  const partial = dashboardVariable("hasPartialOccupancyCoverage").getText(dashboardAst);
  const coverageBindings = {
    currentSnapshotRequested: false, queriedDefinitions: [],
    occupancyDurationInsights: { dataCompleteUntil: null },
  };
  assert.equal(evaluateDashboard(`return (${partial});`, coverageBindings), true);
  assert.equal(evaluateDashboard(`return (${partial});`, {
    ...coverageBindings, occupancyDurationInsights: { dataCompleteUntil: undefined },
  }), false);
  assert.match(dashboardVariable("reportDataCompleteUntil").getText(dashboardAst), /mergeOccupancyDataCompleteUntil\([\s\S]*occupancyDurationInsights\.dataCompleteUntil/);
  for (const tagName of ["ReportExportActions", "AiAnalysisAction"]) {
    const disabled = jsxAttribute(dashboardJsxTag(tagName), "disabled");
    const options = { chartsPending: false, selectedScope: {}, occupancyCertificationError: "", hasPartialOccupancyCoverage: false, reportRequested: true };
    assert.equal(evaluateDashboard(`return (${disabled});`, options), false, tagName);
    assert.equal(evaluateDashboard(`return (${disabled});`, { ...options, chartsPending: true }), true, tagName);
    assert.equal(evaluateDashboard(`return (${disabled});`, { ...options, hasPartialOccupancyCoverage: true }), true, tagName);
  }
});

test("cutoff distingue ausência de widgets core de fonte core incompleta", () => {
  const helper = dashboardNodes().find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "mergeOccupancyDataCompleteUntil");
  assert.ok(helper);
  const merge = evaluateDashboard(`${helper.getText(dashboardAst)}\nreturn mergeOccupancyDataCompleteUntil;`);
  const core = new Date("2026-07-13T03:00:00Z");
  const insight = new Date("2026-07-13T02:59:00Z");
  assert.equal(merge(undefined, insight), insight, "layout só-insights preserva corte certificado");
  assert.equal(merge(core, undefined), core, "layout sem insights mantém corte core");
  assert.equal(merge(undefined, undefined), null);
  assert.equal(merge(undefined, null), null);
  assert.equal(merge(null, insight), null);
  assert.equal(merge(core, null), null);
  assert.equal(merge(core, insight).getTime(), insight.getTime());
  assert.equal(merge(insight, core).getTime(), insight.getTime());
  const initializer = dashboardVariable("coreReportDataCompleteUntil").getText(dashboardAst);
  assert.equal(evaluateDashboard(`return (${initializer});`, {
    reportCertificationSources: [], resolveCertifiedOccupancyDataCutoff: () => null,
  }), undefined);
});

test("botão Consultar/Atualizar recarrega permanência nas duas superfícies e tempo ocupado só em Análises", () => {
  const refreshButton = dashboardNodes().find((node): node is ts.JsxOpeningElement =>
    ts.isJsxOpeningElement(node) && node.tagName.getText(dashboardAst) === "Button" &&
    node.attributes.getText(dashboardAst).includes("refreshOccupancyDurationInsights()"));
  assert.ok(refreshButton);
  const callback = jsxAttribute(refreshButton, "onClick");
  for (const analysis of [true, false]) {
    const calls: string[] = [];
    evaluateDashboard(`return (${callback})();`, {
      analysis, selectedScope: { scenario: { id: "scenario-a" } },
      setReportRequested: () => calls.push("requested"),
      setDurationAnalysisCutoff: () => calls.push("cutoff"),
      refreshOccupancyDurationInsights: () => calls.push("insights"),
      refreshOccupancyLoitering: () => calls.push("loitering"),
      loadCharts: () => calls.push("charts"), loadScopes: () => calls.push("scopes"),
    });
    assert.deepEqual(calls, analysis
      ? ["requested", "cutoff", "insights", "loitering", "charts"]
      : ["requested", "cutoff", "loitering", "charts"]);
  }
  assert.match(
    dashboardVariable("retryOccupancyData").getText(dashboardAst),
    /setDurationAnalysisCutoff\(refreshAt\);[\s\S]*if \(analysis\) \{[\s\S]*refreshOccupancyDurationInsights\(\)[\s\S]*refreshOccupancyLoitering\(\)/,
  );
});

test("os quatro insights reutilizam IDs persistidos e a configuração comum de cenários", async () => {
  const exportedIds = source("components/app/occupancy-duration-insights-widgets.tsx")
    .match(/export const OCCUPANCY_DURATION_INSIGHT_CARD_IDS = \[([\s\S]*?)\] as const/);
  assert.ok(exportedIds, "o catálogo de insights permanece explícito e compartilhado");
  assert.deepEqual([...exportedIds[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]), insightIds);
  const fixture = createInsightHookFixture({ enabled: false });
  try {
    await fixture.flush();
    assert.deepEqual(fixture.result.cards.map((card: RuntimeFixture) => card.id), insightIds);
    for (const card of fixture.result.cards) {
      assert.equal(card.scenarioConfigurable, true);
      assert.equal(card.titleEditable, true);
      assert.equal(card.zoomEnabled, true);
      assert.deepEqual(card.inheritedScenarioIds, ["scenario-a"]);
      assert.equal(card.scenarioSelectionPolicy,
        card.id === "occupancy_duration_scenario_heatmap" ? "compare" : "aggregate");
    }
    assert.equal(fixture.requests.length, 0);
  } finally { fixture.cleanup(); }
});

test("adicionar insights preserva os cards históricos e as 36 dimensões salvas", () => {
  const cardIds = ["occupancy_report_day", "occupancy_report_hour", ...insightIds];
  for (const widthLevel of [1, 2, 3, 4, 5, 6] as const) {
    for (const heightLevel of [1, 2, 3, 4, 5, 6] as const) {
      const saved = [{
        id: "occupancy_report_hour", title: "Minha série histórica", visible: false,
        widthLevel, heightLevel, scenarioSelectionMode: "custom" as const,
        scenarioIds: ["scenario-b", "scenario-a"],
      }, { id: "occupancy_report_day", visible: true }];
      const normalized = preferencesModule.normalizeCardPreferences("occupancy", saved, cardIds);
      assert.deepEqual(normalized.slice(0, 2).map((card) => card.id), saved.map((card) => card.id));
      assert.deepEqual(normalized[0], {
        ...saved[0],
        size: preferencesModule.cardLayoutLevelToCardSize(widthLevel),
        height: preferencesModule.cardLayoutLevelToCardHeight(heightLevel),
        chartType: undefined, color: undefined, zoom: undefined,
      });
      assert.deepEqual(new Set(normalized.map((card) => card.id)), new Set(cardIds));
    }
  }
});

test("modo manual consulta uma vez e não registra polling nem retomada ao voltar à aba", async () => {
  const fixture = createInsightHookFixture({ refreshMode: "manual" });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].minuteRefinement, "complete");
    assert.equal(fixture.result.loading, false);
    assert.equal(fixture.timers.size, 0, "Análises não agenda refresh automático");
    assert.equal(fixture.visibilityListeners.size, 0, "foco da aba não deve refazer consulta manual");
    await fixture.render({});
    assert.equal(fixture.requests.length, 1, "render sem nova intenção não consulta novamente");
    fixture.result.refresh();
    await fixture.flush();
    assert.equal(fixture.requests.length, 2, "Atualizar refaz a leitura do mesmo período");
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.cleanup(); }
});

test("antes de Gerar/Atualizar, enabled=false não consulta nem agenda timer", async () => {
  const fixture = createInsightHookFixture({ refreshMode: "manual", enabled: false });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
    await fixture.render({ enabled: true });
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.cleanup(); }
});

test("seleção customizada vazia, widgets ocultos e IDs de outra empresa não geram consultas", async () => {
  for (const preferences of [
    insightIds.map((id) => ({ id, visible: true, scenarioSelectionMode: "custom", scenarioIds: [] })),
    insightIds.map((id) => ({ id, visible: false })),
    insightIds.map((id) => ({ id, visible: true, scenarioSelectionMode: "custom", scenarioIds: ["foreign-scenario"] })),
  ]) {
    const fixture = createInsightHookFixture({ refreshMode: "manual", preferences });
    try {
      await fixture.flush();
      assert.equal(fixture.requests.length, 0);
      assert.equal(fixture.timers.size, 0);
      assert.equal(fixture.result.reportAssets.length, 0);
    } finally { fixture.cleanup(); }
  }
});

test("seleções independentes deduplicam a consulta e exportam os mesmos cenários", async () => {
  const fixture = createInsightHookFixture({ refreshMode: "manual", preferences: [
    { id: insightIds[0], visible: true, scenarioSelectionMode: "custom", scenarioIds: ["scenario-b"] },
    { id: insightIds[1], visible: true, scenarioSelectionMode: "all" },
    { id: insightIds[2], visible: true, scenarioSelectionMode: "custom", scenarioIds: [] },
    { id: insightIds[3], visible: false, scenarioSelectionMode: "all" },
  ] });
  try {
    await fixture.flush();
    assert.deepEqual(fixture.requests.map((request) => request.scenarioId).sort(), ["scenario-a", "scenario-b"]);
    assert.deepEqual(fixture.result.reportAssets.map((asset: RuntimeFixture) => ({
      id: asset.cardId, scenarioIds: asset.chart.scenarioIds,
    })), [
      { id: insightIds[0], scenarioIds: ["scenario-b"] },
      { id: insightIds[1], scenarioIds: ["scenario-a", "scenario-b"] },
    ]);
    await fixture.render({ preferences: fixture.props.preferences.map((preference: RuntimeFixture) => ({
      ...preference, title: "Título alterado", color: "#123456", widthLevel: 2, heightLevel: 6,
    })) });
    assert.equal(fixture.requests.length, 2, "aparência e dimensões não invalidam o cache de dados");
  } finally { fixture.cleanup(); }
});

test("Ao Vivo atualiza duração somente quando fecha um novo minuto", async () => {
  const fixture = createInsightHookFixture();
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].minuteRefinement, "live-edge");
    assert.equal(fixture.timers.size, 1);
    const initialTimerDelay = fixture.nextTimerDelay();
    assert.notEqual(initialTimerDelay, undefined);
    assert.ok(initialTimerDelay! >= 250);
    assert.ok(initialTimerDelay! <= 61_000);
    assert.equal(fixture.visibilityListeners.size, 1);
    await fixture.runNextTimer();
    assert.equal(
      fixture.requests.length,
      1,
      "a mesma borda fechada não pode ser consultada outra vez",
    );
    const nextTimerDelay = fixture.nextTimerDelay();
    assert.notEqual(nextTimerDelay, undefined);
    assert.ok(nextTimerDelay! >= 250);
    assert.ok(nextTimerDelay! <= 61_000);
  } finally { fixture.cleanup(); }
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.visibilityListeners.size, 0);
  assert.ok(fixture.requests.every((request) => request.signal.aborted));
});

test("Ao Vivo sem card de duração demandado não consulta nem mantém timer", async () => {
  const fixture = createInsightHookFixture({ requestedCardIds: new Set() });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.cleanup(); }
});

test("período histórico explícito é consultado exatamente e nunca substituído pelo mês atual", async () => {
  const period = {
    from: new Date("2026-07-10T03:00:00Z"),
    to: new Date("2026-07-13T03:00:00Z"),
    monthEnd: new Date("2026-07-13T03:00:00Z"),
    dateKeys: ["2026-07-10", "2026-07-11", "2026-07-12"],
    timeZone: "America/Sao_Paulo",
  };
  const fixture = createInsightHookFixture({ period, refreshMode: "manual" });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.requests[0].month, period);
    assert.equal(fixture.timers.size, 0);
    fixture.result.refresh();
    await fixture.flush();
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(fixture.requests[1].month, period);
    const nextPeriod = {
      ...period,
      from: new Date("2026-08-02T03:00:00Z"),
      to: new Date("2026-08-04T03:00:00Z"),
      monthEnd: new Date("2026-08-04T03:00:00Z"),
      dateKeys: ["2026-08-02", "2026-08-03"],
    };
    await fixture.render({ period: nextPeriod });
    assert.equal(fixture.requests.length, 3);
    assert.deepEqual(fixture.requests[2].month, nextPeriod);
    assert.equal(fixture.timers.size, 0);
    assert.equal(fixture.requests[0].signal.aborted, true);
  } finally { fixture.cleanup(); }
});

test("período histórico ainda indisponível não cai silenciosamente no mês corrente", async () => {
  const fixture = createInsightHookFixture({ period: null, refreshMode: "manual" });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
    assert.equal(fixture.result.reportAssets.length, 0);
  } finally { fixture.cleanup(); }
});

test("falha manual não inicia retry automático nem certifica dados; Atualizar tenta novamente", async () => {
  const fixture = createInsightHookFixture({ refreshMode: "manual" });
  fixture.setFailure(new Error("fixture unavailable"));
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.result.loading, false);
    assert.equal(fixture.result.dataCompleteUntil, null);
    assert.equal(fixture.timers.size, 0);
    assert.equal(fixture.visibilityListeners.size, 0);
    fixture.setFailure(null);
    fixture.result.refresh();
    await fixture.flush();
    assert.equal(fixture.requests.length, 2);
    assert.ok(fixture.result.dataCompleteUntil instanceof Date);
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.cleanup(); }
});

/** Execute the real hook with deterministic React slots and no browser/network. */
function createInsightHookFixture(overrides: Record<string, RuntimeFixture> = {}) {
  type Slot = { value?: RuntimeFixture; dependencies?: readonly unknown[]; cleanup?: () => void };
  const slots: Slot[] = [];
  const queuedEffects: Array<() => void> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const visibilityListeners = new Set<() => void>();
  const requests: RuntimeFixture[] = [];
  let cursor = 0;
  let timerId = 0;
  let dirty = true;
  let failure: Error | null = null;
  let result: RuntimeFixture;
  const props = {
    companyScopeId: "company-a", enabled: true, focusScenarioId: "scenario-a",
    monitorMode: false, timeZone: "America/Sao_Paulo", userId: "user-a",
    scenarios: [
      { id: "scenario-a", name: "Entrada", company_id: "company-a" },
      { id: "scenario-b", name: "Saída", company_id: "company-a" },
      { id: "foreign-scenario", name: "Outra empresa", company_id: "company-b" },
    ],
    preferences: insightIds.map((id) => ({ id, visible: true })),
    ...(overrides.refreshMode === "manual" ? { period: {
      from: new Date("2026-07-10T03:00:00Z"),
      to: new Date("2026-07-13T03:00:00Z"),
      monthEnd: new Date("2026-07-13T03:00:00Z"),
      dateKeys: ["2026-07-10", "2026-07-11", "2026-07-12"],
      timeZone: "America/Sao_Paulo",
    } } : {}),
    ...overrides,
  };
  function sameDependencies(left: readonly unknown[] | undefined, right: readonly unknown[]) {
    return Boolean(left && left.length === right.length && left.every((value, index) => Object.is(value, right[index])));
  }
  const react = {
    useMemo(factory: () => RuntimeFixture, dependencies: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && sameDependencies(previous.dependencies, dependencies)) return previous.value;
      const value = factory();
      slots[index] = { value, dependencies };
      return value;
    },
    useCallback(callback: RuntimeFixture, dependencies: readonly unknown[]) {
      return react.useMemo(() => callback, dependencies);
    },
    useRef(initial: RuntimeFixture) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useState(initial: RuntimeFixture) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (update: RuntimeFixture) => {
        const next = typeof update === "function" ? update(slots[index].value) : update;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useEffect(effect: () => (() => void) | undefined, dependencies: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && sameDependencies(previous.dependencies, dependencies)) return;
      const slot: Slot = { dependencies };
      slots[index] = slot;
      queuedEffects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  const queryMock = async (request: RuntimeFixture) => {
    requests.push(request);
    if (failure) throw failure;
    return { scenarioId: request.scenarioId, name: request.name, hours: [], asOf: request.month.to };
  };
  const sharedQueryCaches = new Map<string, Map<RuntimeFixture, RuntimeFixture>>();
  const widgetMock = {
    OCCUPANCY_DURATION_INSIGHT_CARD_IDS: insightIds,
    OCCUPANCY_DURATION_INSIGHT_LABELS: Object.fromEntries(insightIds.map((id) => [id, id])),
    OccupancyDurationInsightCard: () => null,
    buildOccupancyDurationInsightReport: ({ series }: RuntimeFixture) => ({
      scenarioIds: series.map((item: RuntimeFixture) => item.scenarioId),
    }),
  };
  const compiled = ts.transpileModule(source("components/app/use-occupancy-duration-insights.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: "use-occupancy-duration-insights.tsx",
  }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("module", "exports", "require", "document", "window", "setTimeout", "clearTimeout", compiled)(
    loaded, loaded.exports,
    (specifier: string) => {
      if (specifier === "react") return react;
      if (specifier === "@/components/app/occupancy-duration-insights-widgets") return widgetMock;
      if (specifier === "@/lib/occupancy-duration-insights-query") return {
        acquireOccupancyDurationInsightQueryCache: (scope: RuntimeFixture) => {
          if (!scope.userId) return null;
          const key = JSON.stringify([scope.userId, scope.companyScopeId, scope.timeZone]);
          if (!sharedQueryCaches.has(key)) sharedQueryCaches.set(key, new Map());
          return sharedQueryCaches.get(key);
        },
        fetchOccupancyDurationInsightScenario: queryMock,
        invalidateOccupancyDurationInsightOpenEdge: () => undefined,
      };
      return specifier.startsWith("@/") ? load(`${specifier.slice(2)}.ts`) : require(specifier);
    },
    {
      visibilityState: "visible",
      addEventListener: (_event: string, callback: () => void) => visibilityListeners.add(callback),
      removeEventListener: (_event: string, callback: () => void) => visibilityListeners.delete(callback),
    },
    {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    (callback: () => void, delay = 0) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    (id: number) => timers.delete(id),
  );
  async function flush() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (dirty) {
        dirty = false; cursor = 0;
        result = loaded.exports.useOccupancyDurationInsights(props);
        queuedEffects.splice(0).forEach((effect) => effect());
      }
      await new Promise<void>((done) => setImmediate(done));
      if (!dirty) return;
    }
    assert.fail("o hook não estabilizou após 20 renders");
  }
  return {
    props, requests, timers, visibilityListeners, flush,
    nextTimerDelay() {
      return timers.values().next().value?.delay;
    },
    async runNextTimer() {
      const entry = timers.entries().next().value;
      assert.ok(entry, "timer esperado");
      const [id, timer] = entry;
      timers.delete(id);
      timer.callback();
      await flush();
    },
    setFailure(error: Error | null) { failure = error; },
    get result() { return result; },
    async render(changes: Record<string, RuntimeFixture>) { Object.assign(props, changes); dirty = true; await flush(); },
    cleanup() { slots.forEach((slot) => slot.cleanup?.()); },
  };
}

function dashboardNodes() {
  const nodes: ts.Node[] = [];
  function visit(node: ts.Node) { nodes.push(node); ts.forEachChild(node, visit); }
  visit(dashboardAst);
  return nodes;
}

function dashboardVariable(name: string) {
  const declaration = dashboardNodes().find((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
  assert.ok(declaration?.initializer, `variável do dashboard ausente: ${name}`);
  return declaration.initializer;
}

function dashboardJsxTag(tag: string) {
  const node = dashboardNodes().find((candidate): candidate is ts.JsxOpeningElement | ts.JsxSelfClosingElement =>
    (ts.isJsxOpeningElement(candidate) || ts.isJsxSelfClosingElement(candidate)) &&
    candidate.tagName.getText(dashboardAst) === tag);
  assert.ok(node, `componente ausente: ${tag}`);
  return node;
}

function jsxAttribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  const property = node.attributes.properties.find((candidate): candidate is ts.JsxAttribute =>
    ts.isJsxAttribute(candidate) && candidate.name.getText(dashboardAst) === name);
  assert.ok(property?.initializer && ts.isJsxExpression(property.initializer) && property.initializer.expression,
    `atributo JSX sem expressão: ${name}`);
  return property.initializer.expression.getText(dashboardAst);
}

function evaluateDashboard(code: string, bindings: Record<string, RuntimeFixture> = {}): RuntimeFixture {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: "dashboard-test.tsx",
  }).outputText;
  return new Function("require", "exports", ...Object.keys(bindings), compiled)(require, {}, ...Object.values(bindings));
}
