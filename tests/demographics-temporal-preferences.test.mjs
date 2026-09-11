import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} };
  modules.set(path, loaded);
  const javascript = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports, (name) => {
    if (!name.startsWith("@/")) return require(name);
    const base = name.slice(2);
    return load(`${base}${existsSync(resolve(root, `${base}.ts`)) ? ".ts" : ".tsx"}`);
  });
  return loaded.exports;
}
const temporal = load("lib/demographics-temporal-preferences.ts");
const preferences = load("lib/view-preferences.ts");
const grid = load("lib/user-grid-local.ts");
const { DemographicsTemporalControls: Controls } = load("components/app/demographics-temporal-controls.tsx");
const { Select } = load("components/ui/select.tsx");
const { Checkbox } = load("components/ui/checkbox.tsx");
const { Button } = load("components/ui/button.tsx");
const ids = temporal.DEMOGRAPHICS_TEMPORAL_WIDGET_IDS;
const settings = { dimension: "emotion", metric: "count", granularity: "month", chartType: "line", categoryKeys: ["happy", "sad"], palette: "cyber" };

test("cinco padrões temporais são explícitos e não compartilham arrays mutáveis", () => {
  const expected = [["gender", "auto", "area"], ["emotion", "hour", "heatmap"], ["age", "hour", "heatmap"], ["gender", "day", "line"], ["gender", "auto", "bar"]];
  assert.equal(ids.length, 5);
  ids.forEach((id, index) => {
    const value = temporal.defaultDemographicTemporalSettings(id);
    assert.deepEqual([value.dimension, value.granularity, value.chartType], expected[index]);
    assert.equal(value.metric, "percentage");
    assert.equal(value.palette, "pink-blue");
    assert.deepEqual(value.categoryKeys, []);
    assert.equal(value.comparison, index === 4 ? "previous-period" : undefined);
    value.categoryKeys.push("invalid");
    assert.deepEqual(temporal.defaultDemographicTemporalSettings(id).categoryKeys, []);
  });
});

test("configurações inválidas retornam defaults sem coerções ou propriedades extras", () => {
  for (const id of ids) {
    for (const value of [undefined, null, [], "line", 1, false, { dimension: "person", metric: "value", granularity: "year", chartType: "pie", categoryKeys: [3, null, "invalid"], palette: "missing", comparison: "next-week", unknown: true }]) {
      assert.deepEqual(temporal.normalizeDemographicTemporalSettings(value, id), temporal.defaultDemographicTemporalSettings(id));
    }
  }
  assert.deepEqual(temporal.normalizeDemographicTemporalSettings({ ...settings, extra: 1 }, ids[0]), settings);
  for (const value of ["demographics_total", "demographics_gender_mix", "__proto__", {}, undefined]) assert.equal(temporal.isDemographicTemporalWidgetId(value), false);
});

test("perfis horários são sempre hour e comparação usa o período completo", () => {
  for (const chartType of ["bar", "area", "line", "heatmap"]) {
    for (const granularity of ["auto", "hour", "day", "month"]) {
      for (const id of ids.slice(1, 3)) assert.equal(temporal.normalizeDemographicTemporalSettings({ ...settings, chartType, granularity }, id).granularity, "hour");
      assert.equal(temporal.normalizeDemographicTemporalSettings({ ...settings, chartType, granularity }, ids[4]).granularity, "auto");
      for (const id of [ids[0], ids[3]]) assert.equal(temporal.normalizeDemographicTemporalSettings({ ...settings, chartType, granularity }, id).granularity, granularity);
    }
  }
  for (const comparison of ["previous-period", "previous-week", "previous-month"]) {
    assert.equal(temporal.normalizeDemographicTemporalSettings({ comparison }, ids[4]).comparison, comparison);
    for (const id of ids.slice(0, 4)) assert.equal(Object.hasOwn(temporal.normalizeDemographicTemporalSettings({ comparison }, id), "comparison"), false);
  }
});

test("seleções são limitadas à dimensão, deduplicadas e armazenadas por chave canônica", () => {
  const normalized = temporal.normalizeDemographicTemporalSettings({ ...settings, categoryKeys: ["sad", "happy", "Woman", "happy", 0, "20-29"] }, ids[0]);
  assert.deepEqual(normalized.categoryKeys, ["happy", "sad"]);
  assert.deepEqual(temporal.normalizeDemographicTemporalSettings({ ...normalized, dimension: "gender" }, ids[0]).categoryKeys, []);
  for (const dimension of ["gender", "age", "emotion"]) {
    const categories = temporal.demographicTemporalCategories(dimension);
    assert.ok(categories.every(({ key, label }) => typeof key === "string" && label));
    assert.ok(categories.length <= 9);
    assert.deepEqual(temporal.normalizeDemographicTemporalSettings({ dimension, categoryKeys: categories.map(({ key }) => key).reverse() }, ids[0]).categoryKeys, []);
  }
  assert.deepEqual(temporal.demographicTemporalCategories("gender"), [{ key: "Woman", label: "Mulher" }, { key: "Man", label: "Homem" }]);
});

test("seleções legadas de gênero removem unknown sem esconder os gêneros identificados", () => {
  for (const id of ids) {
    for (const [categoryKeys, expected] of [[['unknown'], []], [['Woman', 'unknown'], ['Woman']], [['Man', 'unknown'], ['Man']], [['unknown', 'Woman', 'Man'], []]]) {
      const value = temporal.normalizeDemographicTemporalSettings({ dimension: "gender", categoryKeys, palette: "cyber", metric: "count" }, id);
      assert.deepEqual(value.categoryKeys, expected);
      assert.equal(value.palette, "cyber");
      assert.equal(value.metric, "count");
    }
  }
});

test("persistência só aceita demographicsTemporal nos cinco IDs e não altera objetos legados", () => {
  assert.ok(ids.every((id) => preferences.getCardMenuDefinition("demographics").cards.some((card) => card.id === id)));
  for (const id of ids) {
    const [value] = preferences.normalizeCardPreferences("demographics", [{ id, visible: false, title: "Título", widthLevel: 4, demographicsTemporal: settings }], [id]);
    assert.deepEqual(value.demographicsTemporal, temporal.normalizeDemographicTemporalSettings(settings, id));
    assert.equal(value.visible, false);
    assert.equal(value.title, "Título");
    assert.equal(value.widthLevel, 4);
    assert.equal(Object.hasOwn(preferences.normalizeCardPreferences("live", [value], [id])[0], "demographicsTemporal"), false);
    assert.equal(Object.hasOwn(preferences.normalizeCardPreferences("demographics", [{ id, visible: true }], [id])[0], "demographicsTemporal"), false);
  }
  for (const id of ["demographics_gender_mix", "demographics_custom", "occupancy_chart_hour"]) {
    const [value] = preferences.normalizeCardPreferences("demographics", [{ id, visible: true, demographicsTemporal: settings }], [id]);
    assert.equal(Object.hasOwn(value, "demographicsTemporal"), false);
  }
});

test("salvar e recarregar usa writer user-grid e mantém escopos empresa/usuário/visão", (t) => {
  const previous = globalThis.window;
  const storage = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
    key: (index) => [...storage.keys()][index] ?? null, get length() { return storage.size; },
  }, dispatchEvent: () => true };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const scope = ["company-fixture", "user-fixture", "demographics-analysis"];
  preferences.saveCardPreferences("demographics", [{ id: ids[0], visible: true, demographicsTemporal: settings }], [ids[0]], ...scope);
  const [loaded] = preferences.loadScopedCardPreferences("demographics", [ids[0]], ...scope);
  assert.deepEqual(loaded.demographicsTemporal, settings);
  assert.ok(grid.readUserGridLocalMutations().some((item) => item.key === preferences.getCardViewStorageKey(...scope)));
  assert.equal(preferences.loadScopedCardPreferences("demographics", [ids[0]], "other-company", scope[1], scope[2])[0].demographicsTemporal, undefined);
});

function allElements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => allElements(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...allElements(node.props.children, predicate)];
}
function select(tree, label) {
  return allElements(tree, (element) => element.type === Select && allElements(element, (child) => child.props["aria-label"] === label).length)[0];
}

test("controles reais limpam categorias ao trocar dimensão e respeitam disabled", () => {
  const changes = [];
  const tree = Controls({ widgetId: ids[0], value: settings, onChange: (value) => changes.push(value) });
  select(tree, "Dimensão demográfica").props.onValueChange("age");
  assert.equal(changes[0].dimension, "age");
  assert.deepEqual(changes[0].categoryKeys, []);
  assert.equal(changes[0].palette, "cyber");
  const locked = Controls({ widgetId: ids[0], value: settings, disabled: true, onChange: (value) => changes.push(value) });
  assert.ok(allElements(locked, (node) => node.type === Select).every((node) => node.props.disabled));
  select(locked, "Dimensão demográfica").props.onValueChange("age");
  assert.equal(changes.length, 1);
});

test("categorias vazias significam todas e UI não permite esconder a última categoria", () => {
  const changes = [];
  const tree = Controls({ widgetId: ids[0], onChange: (value) => changes.push(value) });
  const boxes = allElements(tree, (node) => node.type === Checkbox);
  assert.equal(boxes.length, 2);
  assert.ok(boxes.every((box) => box.props.checked));
  boxes[0].props.onCheckedChange(false);
  assert.deepEqual(changes[0].categoryKeys, ["Man"]);
  const single = Controls({ widgetId: ids[0], value: { ...temporal.defaultDemographicTemporalSettings(ids[0]), categoryKeys: ["Woman"] }, onChange: (value) => changes.push(value) });
  const selected = allElements(single, (node) => node.type === Checkbox && node.props.checked)[0];
  assert.equal(selected.props.disabled, true);
  selected.props.onCheckedChange(false);
  assert.equal(changes.length, 1);
  allElements(single, (node) => node.type === Button && node.props.children === "Mostrar todas as categorias")[0].props.onClick();
  assert.deepEqual(changes[1].categoryKeys, []);
});

test("SSR real fornece rótulos, contexto de percentuais e controles compatíveis com cada widget", () => {
  for (const id of ids) {
    const html = renderToStaticMarkup(React.createElement(Controls, { widgetId: id, onChange: () => {} }));
    assert.match(html, /data-demographics-temporal-controls/);
    assert.match(html, /Dimensão demográfica/);
    assert.match(html, /Métrica do gráfico temporal/);
    assert.match(html, temporal.defaultDemographicTemporalSettings(id).dimension === "gender" ? /(?:entre gêneros identificados|consideram Mulher e Homem em cada intervalo)/ : /total de todas as categorias de cada intervalo/);
    assert.doesNotMatch(html, /Não identificado/);
    assert.match(html, /Categorias visíveis/);
    assert.doesNotMatch(html, /\b(?:Authorization|Bearer|company_id)\b/);
    if (temporal.isDemographicHourlyProfile(id)) {
      assert.match(html, /Perfil das 24 horas/);
      assert.doesNotMatch(html, /Agrupamento temporal/);
    }
    if (id === ids[4]) { assert.match(html, /Período de comparação/); assert.doesNotMatch(html, /Agrupamento temporal/); }
    else assert.doesNotMatch(html, /Período de comparação/);
  }
});
