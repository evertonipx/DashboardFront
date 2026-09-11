import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} };
  modules.set(path, loaded);
  const javascript = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports, (name) =>
    name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  return loaded.exports;
}
const presentation = load("lib/demographics-presentation.ts");
const temporalPreferences = load("lib/demographics-temporal-preferences.ts");
const demographic = load("lib/demographics.ts");
const distribution = load("lib/demographics-chart-options.ts");
const crossing = load("lib/demographics-crossing-options.ts");
const visibleCategories = load("lib/demographics-visible-categories.ts");
const palette = load("lib/chart-palette.ts");
const utils = load("lib/utils.ts");
const access = load("lib/access.ts");
const source = readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8");
const ast = ts.createSourceFile("dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variables = new Map();
const calls = [];
function visit(node) {
  if (ts.isVariableDeclaration(node)) variables.set(node.name.getText(ast), node);
  if (ts.isCallExpression(node)) calls.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function evaluate(code, bindings = {}) {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return new Function("require", "exports", ...Object.keys(bindings), compiled)(require, {}, ...Object.values(bindings));
}
const cardIds = evaluate(`return ${variables.get("DEMOGRAPHICS_CARD_IDS").initializer.getText(ast)};`, temporalPreferences);
const menuKey = evaluate(`return ${variables.get("DEMOGRAPHICS_MENU_KEY").initializer.getText(ast)};`);
const callbackSource = variables.get("updateWidgetPresentation").initializer.arguments[0].getText(ast);
const selectedId = "demographics_gender_mix";

test("preferências anteriores à hidratação não liberam consultas dos widgets padrão", () => {
  const key = "company-selected|user-a|demographics-live";
  const state = { readiness: "pending", preference: null, rows: [{ id: selectedId, visible: true }] };
  const isReady = () => evaluate(`return ${variables.get("preferencesReady").initializer.getText(ast)};`, {
    gridReadiness: state.readiness, preferenceState: state.preference, preferenceIdentityKey: key,
  });
  const synchronize = () => evaluate(`return (${variables.get("synchronizePreferences").initializer.arguments[0].getText(ast)});`, {
    gridReadiness: state.readiness, preferenceIdentityKey: key, companyScopeId: "company-selected",
    user: { id: "user-a" }, preferenceScopeId: "demographics-live",
    DEMOGRAPHICS_MENU_KEY: menuKey, DEMOGRAPHICS_CARD_IDS: cardIds,
    loadScopedCardPreferences: () => state.rows,
    setPreferenceState: (value) => { state.preference = value; },
  })();
  // CardLayout may publish local defaults before remote user-grid arrives.
  synchronize();
  assert.equal(isReady(), false);
  state.readiness = "ready";
  state.rows = [{ id: selectedId, visible: false }];
  assert.equal(isReady(), false, "same identity is insufficient: this render still contains pre-hydration defaults");
  synchronize();
  assert.equal(isReady(), true);
  assert.equal(state.preference.value.some((item) => item.visible !== false), false);
  state.readiness = "pending";
  assert.equal(isReady(), false);
  state.readiness = "fallback";
  assert.equal(isReady(), false);
  synchronize();
  assert.equal(isReady(), true, "failed synchronization permits freshly read local preferences");
});
const settings = { ...presentation.defaultDemographicPresentation("gender"), type: "half-donut", palette: "cyber", emojis: true };
const admin = { id: "admin-id", company_id: "company-jwt", role: "admin", is_master: false, permissions: [{ id: "permission-widget", slug: "dashboard_widgets_manage" }] };

function callbackHarness(options = {}) {
  const loaded = [];
  const saved = [];
  const states = [];
  const refetches = [];
  const user = options.user === undefined ? admin : options.user;
  const companyScopeId = options.companyScopeId === undefined ? "company-selected" : options.companyScopeId;
  const preferenceScopeId = options.preferenceScopeId ?? "demographics-analysis";
  const preferenceIdentityKey = `${companyScopeId}|${user?.id ?? ""}|${preferenceScopeId}`;
  let latest = options.latest ?? [{ id: selectedId, visible: true }];
  const execute = evaluate(`return (${callbackSource});`, {
    ...presentation,
    canEditVisual: access.hasVisualAdminAccess(user), companyScopeId,
    user, preferenceScopeId, preferenceIdentityKey, gridReadiness: "ready",
    DEMOGRAPHICS_MENU_KEY: menuKey, DEMOGRAPHICS_CARD_IDS: cardIds,
    loadScopedCardPreferences: (...args) => { loaded.push(args); return latest; },
    saveCardPreferences: (...args) => { saved.push(args); latest = args[1]; },
    setPreferenceState: (value) => states.push(value),
    apiFetch: (...args) => refetches.push(args),
    forceRefresh: (...args) => refetches.push(args),
    requestFreshData: (...args) => refetches.push(args),
    setClock: (...args) => refetches.push(args),
    setRefreshVersion: (...args) => refetches.push(args),
  });
  return { execute, loaded, saved, states, refetches, setLatest: (value) => { latest = value; } };
}

test("callback real permite admin autorizado/Master e bloqueia operador, admin sem grant e contexto ausente", () => {
  for (const user of [admin, { ...admin, is_master: true, permissions: [] }]) {
    const harness = callbackHarness({ user });
    harness.execute(selectedId, settings);
    assert.equal(harness.saved.length, 1);
  }
  for (const options of [
    { user: { ...admin, role: "operator" } },
    { user: { ...admin, permissions: [] } },
    { user: null }, { user: { ...admin, id: "" } }, { companyScopeId: "" },
  ]) {
    const harness = callbackHarness(options);
    harness.execute(selectedId, settings);
    assert.deepEqual(harness.loaded, []);
    assert.deepEqual(harness.saved, []);
    assert.deepEqual(harness.states, []);
  }
  for (const id of ["demographics_total", "live_chart_hour", "unknown", "__proto__"]) {
    const harness = callbackHarness();
    harness.execute(id, settings);
    assert.equal(harness.saved.length, 0);
  }
});

test("callback busca preferências mais recentes e altera somente apresentação do widget escolhido", () => {
  const harness = callbackHarness();
  const unrelated = Object.freeze({ id: "demographics_age_distribution", title: "Título recente", visible: false, widthLevel: 5, demographics: { ...settings, type: "pie" } });
  const target = Object.freeze({ id: selectedId, visible: true, title: "Gênero atualizado", heightLevel: 4, widthLevel: 2, zoom: 110, color: "#123456", scenarioSelectionMode: "custom", scenarioIds: ["scenario-a"] });
  const fresh = Object.freeze([unrelated, target]);
  harness.setLatest(fresh);
  harness.execute(selectedId, settings);
  const updated = harness.saved[0][1];
  assert.deepEqual(updated.map((item) => item.id), fresh.map((item) => item.id));
  assert.equal(updated[0], unrelated);
  assert.deepEqual(updated[1], { ...target, demographics: settings });
  assert.equal(Object.hasOwn(target, "demographics"), false);
  assert.deepEqual(harness.loaded[0], [menuKey, cardIds, "company-selected", admin.id, "demographics-analysis"]);
  assert.deepEqual(harness.saved[0], [menuKey, updated, cardIds, "company-selected", admin.id, "demographics-analysis"]);
  assert.deepEqual(harness.states[0], { key: `company-selected|${admin.id}|demographics-analysis`, readiness: "ready", value: updated });
  assert.deepEqual(harness.refetches, []);
});

test("edições consecutivas preservam o outro widget e o escopo de Live/Análises/Relatórios", () => {
  for (const surface of ["live", "analysis", "reports"]) {
    const otherId = "demographics_emotion_distribution";
    const harness = callbackHarness({ preferenceScopeId: `demographics-${surface}`, latest: [{ id: selectedId, visible: true }, { id: otherId, visible: false }] });
    harness.execute(selectedId, settings);
    harness.execute(otherId, { ...settings, type: "pie", order: "descending" });
    assert.equal(harness.loaded.length, 2);
    assert.deepEqual(harness.saved[1][1][0].demographics, settings);
    assert.equal(harness.saved[1][1][1].visible, false);
    assert.equal(harness.saved[1][5], `demographics-${surface}`);
    assert.deepEqual(harness.refetches, []);
  }
});

test("normalização do callback é segura e preferências visuais não entram nas dependências de consulta", () => {
  const harness = callbackHarness();
  harness.execute(selectedId, { ...settings, type: "invalid", palette: "bad", emojis: "false" });
  assert.deepEqual(harness.saved[0][1][0].demographics, presentation.defaultDemographicPresentation("gender"));
  const loadEffect = calls.find((call) => call.expression.getText(ast) === "React.useEffect" && call.arguments[0]?.getText(ast).includes("async function load()"));
  assert.ok(loadEffect);
  const dependencies = [loadEffect.arguments[1], variables.get("requestWindow").initializer.arguments[1], variables.get("dataScopeKey").initializer.arguments[1]].map((node) => node.getText(ast)).join("\n");
  assert.doesNotMatch(dependencies, /widgetPresentations|preferenceState|updateWidgetPresentation|\bpreferences\b/);
  assert.doesNotMatch(callbackSource, /apiFetch|forceRefresh|requestFreshData|setClock|setRefreshVersion/);
  assert.deepEqual(harness.refetches, []);
});

const declarations = ast.statements.filter((node) => ts.isVariableStatement(node) || (ts.isFunctionDeclaration(node) && node.name?.text !== "DemographicsDashboard")).map((node) => node.getText(ast).replace(/^export\s+/, "")).join("\n");
const buildReport = evaluate(`${declarations}\nreturn buildDemographicsReport;`, { ...demographic, ...presentation, ...temporalPreferences, ...distribution, ...crossing, ...palette, ...utils, ...visibleCategories });
const summary = demographic.aggregateDemographicBuckets([
  { gender: "Woman", age_bucket: "0-2", emotion: "happy", count: 5 },
  { gender: "Man", age_bucket: "20-29", emotion: "neutral", count: 7 },
].map((row) => ({ bucket: "2026-09-10T13:00:00Z", camera_id: "fixture-camera", ...row })));
const reportContext = { audience: "Visão gerencial", rangeLabel: "10/09/2026", summary, surface: "analysis", timeZone: "America/Sao_Paulo" };

test("relatório usa tipos/paletas/ordem selecionados, com emojis desativados apenas na exportação", () => {
  const presentations = {
    demographics_gender_mix: settings,
    demographics_age_distribution: { ...settings, type: "rose", palette: "ocean", order: "ascending" },
    demographics_emotion_distribution: { ...settings, type: "bar", orientation: "vertical", palette: "berry" },
    demographics_age_gender_pyramid: { ...settings, type: "matrix", palette: "enterprise", order: "descending" },
    demographics_age_emotion_heatmap: { ...settings, type: "heatmap", palette: "forest", order: "ascending" },
  };
  const original = structuredClone(presentations);
  const report = buildReport({ ...reportContext, presentations });
  const expected = [
    distribution.buildDemographicDistributionOption(summary.gender, { ...presentations.demographics_gender_mix, emojis: false }, { dimension: "gender", showLegend: true }),
    distribution.buildDemographicDistributionOption(summary.age, { ...presentations.demographics_age_distribution, emojis: false }, { dimension: "age", showLegend: true }),
    distribution.buildDemographicDistributionOption(summary.emotion, { ...presentations.demographics_emotion_distribution, emojis: false }, { dimension: "emotion", showLegend: true }),
    crossing.buildDemographicCrossingOption(summary, { ...presentations.demographics_age_gender_pyramid, emojis: false }, "age-gender", "light"),
    crossing.buildDemographicCrossingOption(summary, { ...presentations.demographics_age_emotion_heatmap, emojis: false }, "age-emotion", "light"),
  ];
  assert.equal(report.charts.length, 5);
  report.charts.forEach((chart, index) => assert.equal(JSON.stringify(chart.option), JSON.stringify(expected[index])));
  assert.deepEqual(presentations, original);
  assert.doesNotMatch(JSON.stringify(report.charts), /\p{Extended_Pictographic}/u);
  assert.equal(report.timeZone, reportContext.timeZone);
});

test("opções visuais do relatório não alteram tabelas, totais, métricas ou período", () => {
  const legacy = buildReport(reportContext);
  const configured = buildReport({ ...reportContext, presentations: { demographics_gender_mix: settings } });
  assert.deepEqual(configured.charts.map((chart) => chart.table), legacy.charts.map((chart) => chart.table));
  assert.deepEqual(configured.metrics, legacy.metrics);
  assert.deepEqual(configured.context, legacy.context);
  assert.equal(configured.subtitle, legacy.subtitle);
  assert.equal(configured.timeZone, legacy.timeZone);
});

test("relatórios configurados e legados omitem gênero desconhecido sem apagar suas detecções", () => {
  const mixed = demographic.aggregateDemographicBuckets([
    { gender: "Woman", age_bucket: "20-29", emotion: "happy", count: 30 },
    { gender: "Man", age_bucket: "20-29", emotion: "neutral", count: 20 },
    { gender: "unknown", age_bucket: "30-39", emotion: "happy", count: 50 },
  ].map((row) => ({ bucket: "2026-09-10T13:00:00Z", camera_id: "fixture-camera", ...row })));
  const before = structuredClone(mixed);
  for (const presentations of [undefined, { demographics_gender_mix: settings }]) {
    const report = buildReport({ ...reportContext, summary: mixed, presentations });
    assert.doesNotMatch(JSON.stringify(report), /Não identificado|"unknown"/);
    assert.equal(report.metrics[0].value, 100);
    assert.equal(report.metrics[1].value, "Mulher · 60%");
    assert.deepEqual(report.charts[0].table.rows.map(({ count, percentage }) => [count, percentage]), [[30, "60%"], [20, "40%"]]);
    assert.equal(report.charts[3].table.rows.reduce((total, row) => total + row.total, 0), 50);
    for (const index of [1, 2]) assert.equal(report.charts[index].table.rows.reduce((total, row) => total + row.count, 0), 100);
  }
  assert.deepEqual(mixed, before);
});
