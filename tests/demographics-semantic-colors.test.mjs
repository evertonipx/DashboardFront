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
  const compiled = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("module", "exports", "require", compiled)(loaded, loaded.exports, (name) => {
    if (!name.startsWith("@/")) return require(name);
    const base = name.slice(2);
    return load(`${base}${existsSync(resolve(root, `${base}.ts`)) ? ".ts" : ".tsx"}`);
  });
  return loaded.exports;
}

const presentation = load("lib/demographics-presentation.ts");
const { OCCUPANCY_COLOR_PALETTES } = load("lib/occupancy-color-palettes.ts");
const { buildDemographicDistributionOption: build } = load("lib/demographics-chart-options.ts");
const { DemographicsWidgetControls: Controls } = load("components/app/demographics-widget-controls.tsx");
const { DemographicsTemporalControls: TemporalControls } = load("components/app/demographics-temporal-controls.tsx");
const { defaultDemographicTemporalSettings } = load("lib/demographics-temporal-preferences.ts");
const categories = [
  { key: "Woman", label: "Mulher", count: 20, percentage: 20, observed: true },
  { key: "Man", label: "Homem", count: 70, percentage: 70, observed: true },
  { key: "unknown", label: "Não identificado", count: 10, percentage: 10, observed: true },
];
function rgb(color) { return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)); }
function hue(color) {
  const [red, green, blue] = rgb(color).map((channel) => channel / 255);
  const maximum = Math.max(red, green, blue);
  const range = maximum - Math.min(red, green, blue);
  const component = maximum === red ? (green - blue) / range : maximum === green ? (blue - red) / range + 2 : (red - green) / range + 4;
  return (60 * component + 360) % 360;
}

test("todas as paletas demográficas mantêm Mulher rosa/magenta, Homem azul/ciano e unknown neutro", () => {
  for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
    const colors = presentation.getDemographicGenderPalette(id);
    assert.ok(hue(colors.Woman) >= 285 && hue(colors.Woman) <= 355, `${id}: Mulher deve permanecer rosa/magenta`);
    assert.ok(hue(colors.Man) >= 180 && hue(colors.Man) <= 240, `${id}: Homem deve permanecer azul/ciano`);
    assert.equal(colors.unknown, "#8A99AF");
    assert.ok(Math.max(...rgb(colors.unknown)) - Math.min(...rgb(colors.unknown)) <= 40);
    assert.equal(new Set(Object.values(colors)).size, 3);
  }
  assert.deepEqual(presentation.getDemographicGenderPalette("pink-blue"), { Woman: "#DB2777", Man: "#2563EB", unknown: "#8A99AF" });
  assert.deepEqual(presentation.getDemographicGenderPalette("invalid"), presentation.getDemographicGenderPalette("pink-blue"));
});

test("reordenar ou filtrar gêneros nunca remapeia Homem ou unknown para a primeira cor rosa", () => {
  for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
    const expected = presentation.getDemographicGenderPalette(id);
    for (const dimension of ["gender", "age-gender"]) {
      for (const keys of [["Woman", "Man", "unknown"], ["unknown", "Man", "Woman"], ["Man"], ["unknown"]]) {
        keys.forEach((key, index) => assert.equal(presentation.demographicCategoryColor(key, index, id, dimension), expected[key]));
      }
      for (const key of ["future", "__proto__", "toString"]) assert.equal(presentation.demographicCategoryColor(key, 0, id, dimension), expected.unknown);
    }
  }
});

test("formatos reais usam cores semânticas estáveis com todas as paletas, ordens e filtros", () => {
  const original = structuredClone(categories);
  for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
    const expected = presentation.getDemographicGenderPalette(palette);
    for (const type of ["bar", "stacked", "pie", "donut", "half-donut", "rose"]) {
      for (const order of ["default", "ascending", "descending"]) {
        for (const items of [categories, categories.filter(({ key }) => key === "Man")]) {
          const option = build(items, { ...presentation.defaultDemographicPresentation("gender"), palette, type, order }, { dimension: "gender" });
          const data = option.series.flatMap((series) => series.data);
          assert.equal(data.length, items.length);
          for (const point of data) {
            assert.equal(point.itemStyle.color, expected[point.key]);
            assert.equal(point.count, items.find(({ key }) => key === point.key).count);
            assert.equal(point.percentage, items.find(({ key }) => key === point.key).percentage);
          }
        }
      }
    }
  }
  assert.deepEqual(categories, original);
});

test("semântica de gênero não altera paletas originais de Ocupação ou cores das demais dimensões", () => {
  const before = structuredClone(OCCUPANCY_COLOR_PALETTES);
  for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
    assert.equal(presentation.demographicPalettePreviewColors(palette.id, "age"), palette.colors);
    assert.equal(presentation.demographicPalettePreviewColors(palette.id, "emotion"), palette.colors);
    assert.equal(presentation.demographicPalettePreviewColors(palette.id, "age-emotion"), palette.colors);
    assert.equal(presentation.demographicCategoryColor("0-2", 0, palette.id, "age"), palette.colors[0]);
    assert.equal(presentation.demographicCategoryColor("happy", 8, palette.id, "emotion"), palette.colors[1]);
    const semantic = presentation.getDemographicGenderPalette(palette.id);
    for (const dimension of ["gender", "age-gender"]) assert.deepEqual(presentation.demographicPalettePreviewColors(palette.id, dimension), [semantic.Woman, semantic.Man, semantic.unknown]);
  }
  assert.deepEqual(OCCUPANCY_COLOR_PALETTES, before);
  assert.deepEqual(presentation.DEMOGRAPHICS_PALETTES.slice(1), OCCUPANCY_COLOR_PALETTES);
});

function elements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children, predicate)];
}

test("controles de distribuição e temporais apresentam as cores efetivas por dimensão", () => {
  for (const dimension of ["gender", "age-gender", "age", "emotion"]) {
    const tree = Controls({ dimension, value: { ...presentation.defaultDemographicPresentation(dimension), palette: "cyber" }, onChange: () => {} });
    const swatches = elements(tree, (node) => node.type?.name === "PaletteSwatches");
    assert.ok(swatches.length > 0);
    assert.deepEqual(swatches[0].props.colors, presentation.demographicPalettePreviewColors("cyber", dimension));
  }
  for (const dimension of ["gender", "age", "emotion"]) {
    const widgetId = "demographics_gender_timeline";
    const tree = TemporalControls({ widgetId, value: { ...defaultDemographicTemporalSettings(widgetId), dimension }, onChange: () => {} });
    for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
      const item = elements(tree, (node) => node.props.value === id && typeof node.props.textValue === "string")[0];
      const colors = elements(item, (node) => node.props.style?.backgroundColor).map((node) => node.props.style.backgroundColor);
      assert.deepEqual(colors, presentation.demographicPalettePreviewColors(id, dimension).slice(0, 5));
    }
  }
});

test("comparativo por gênero explica cores de período e oculta paleta sem efeito preservando escolha", () => {
  const widgetId = "demographics_period_comparison";
  const settings = { ...defaultDemographicTemporalSettings(widgetId), palette: "cyber" };
  const changes = [];
  const tree = TemporalControls({ widgetId, value: settings, onChange: (value) => changes.push(value) });
  const html = renderToStaticMarkup(React.createElement(TemporalControls, { widgetId, value: settings, onChange: () => {} }));
  assert.match(html, /As cores distinguem os períodos comparados, não os gêneros/);
  assert.doesNotMatch(html, /Paleta temporal:/);
  const dimensionSelect = elements(tree, (node) => node.props.onValueChange && elements(node, (child) => child.props["aria-label"] === "Dimensão demográfica").length)[0];
  dimensionSelect.props.onValueChange("age");
  assert.equal(changes[0].palette, "cyber");
  const changed = renderToStaticMarkup(React.createElement(TemporalControls, { widgetId, value: changes[0], onChange: () => {} }));
  assert.match(changed, /Paleta temporal: Cyber/);
});
