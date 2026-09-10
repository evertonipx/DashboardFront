import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ts = require("typescript");
const echarts = require("echarts");
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

const { aggregateDemographicBuckets } = load("lib/demographics.ts");
const { defaultDemographicPresentation } = load("lib/demographics-presentation.ts");
const { buildDemographicDistributionOption } = load("lib/demographics-chart-options.ts");
const { buildDemographicCrossingOption } = load("lib/demographics-crossing-options.ts");
const { buildDemographicTemporalModel, fitDemographicTemporalOption } = load("lib/demographics-temporal-chart-options.ts");
const { DEMOGRAPHICS_TEMPORAL_WIDGET_IDS, defaultDemographicTemporalSettings } = load("lib/demographics-temporal-preferences.ts");

// Extract the actual responsive transform, not a reimplementation of its
// margins, truncation, or font rules. No React/auth/API setup is necessary.
const dashboard = ts.createSourceFile("dashboard.tsx", readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const densitySource = ["compactDemographicChartOption", "mapChartOptionCollection"].map((name) => {
  const declaration = dashboard.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} deve vir do dashboard real`);
  return declaration.getText(dashboard);
}).join("\n");
const compactDemographicChartOption = new Function("isRecord", ts.transpileModule(`${densitySource}\nreturn compactDemographicChartOption;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText)((value) => value && typeof value === "object" && !Array.isArray(value));

const summary = aggregateDemographicBuckets([
  { bucket: "2026-09-09T13:00:00Z", gender: "Woman", age_bucket: "20-29", emotion: "happy", count: 456_789_012_345 },
  { bucket: "2026-09-09T14:00:00Z", gender: "Man", age_bucket: "30-39", emotion: "neutral", count: 987_654_321_123 },
  { bucket: "2026-09-09T14:00:00Z", gender: "unknown", age_bucket: "40-49", emotion: "fear", count: 45_678_901_234 },
].map((row) => ({ ...row, camera_id: "synthetic-axis-check" })), { timeZone: "America/Sao_Paulo" });
const longName = "Categoria demográfica não identificada — descrição extensa Ω漢字 🧑🏽‍💻";

function legacyCardDensity(option, kind, { width, height }) {
  const density = { compact: height < 220, narrow: width < 400 };
  return density.compact || density.narrow ? compactDemographicChartOption(option, kind, density) : option;
}

function casesFor({ width, height, theme, stress }) {
  const cases = [];
  for (const dimension of ["gender", "age", "emotion"]) {
    const items = summary[dimension].map((item, index) => ({ ...item, label: stress ? `${longName} ${index}` : item.label }));
    const source = buildDemographicDistributionOption(items, {
      ...defaultDemographicPresentation(dimension), type: "bar", emojis: true,
    }, { dimension, theme });
    cases.push({ id: `distribution-${dimension}`, source, option: legacyCardDensity(source, "distribution", { width, height }) });
  }
  for (const dimension of ["age-gender", "age-emotion"]) {
    const custom = structuredClone(summary);
    if (stress) {
      const crossing = dimension === "age-gender" ? custom.crossings.ageByGender : custom.crossings.ageByEmotion;
      crossing.rows.forEach((row, index) => { row.label = `${longName} ${index}`; });
    }
    const source = buildDemographicCrossingOption(custom, {
      ...defaultDemographicPresentation(dimension), emojis: true,
    }, dimension, theme);
    cases.push({ id: `crossing-${dimension}`, source, option: legacyCardDensity(source, dimension === "age-gender" ? "matrix" : "heatmap", { width, height }) });
  }
  for (const id of DEMOGRAPHICS_TEMPORAL_WIDGET_IDS) {
    const model = buildDemographicTemporalModel({
      id, summary, comparisonSummary: summary,
      settings: { ...defaultDemographicTemporalSettings(id), metric: "count" },
      from: "2026-09-09T03:00:00Z", to: "2026-09-10T03:00:00Z", now: "2026-09-10T03:00:00Z",
      timeZone: "America/Sao_Paulo", theme,
    });
    const source = model.option;
    const option = fitDemographicTemporalOption(model, { width, height });
    // Temporal categories are currently canonical; exercise future long
    // translations without changing their coordinates or numeric data.
    if (stress && option.yAxis.type === "category") {
      option.yAxis.data = option.yAxis.data.map((_, index) => `${longName} ${index} 😐`);
    }
    cases.push({ id, source, option });
  }
  return cases;
}

function yAxisTextBounds(chart) {
  const view = chart.getViewOfComponentModel(chart.getModel().getComponent("yAxis"));
  const labels = [];
  view.group.traverse((element) => {
    if (element.type !== "text" || element.ignore || element.invisible) return;
    for (const span of element.childrenRef?.() ?? [element]) {
      if (!span.style?.text || span.ignore || span.invisible) continue;
      const bounds = span.getBoundingRect().clone();
      bounds.applyTransform(span.getComputedTransform());
      labels.push({ text: span.style.text, bounds });
    }
  });
  return labels;
}

function withChart(option, size, verify) {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, ...size });
  try {
    chart.setOption({ ...option, animation: false }, { notMerge: true, lazyUpdate: false });
    const svg = chart.renderToSVGString();
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /NaN|undefined/);
    verify(chart);
  } finally { chart.dispose(); }
}

// 4 widths × 2 heights × 2 themes × 2 label sets × 10 real options = 320
// renderings. Cell values and rotated series labels are deliberately excluded:
// this regression concerns the actual glyphs belonging to the Y-axis view.
for (const width of [200, 256, 440, 640]) for (const height of [120, 320]) for (const theme of ["light", "dark"]) {
  test(`eixo Y permanece contido em ${width}×${height}, ${theme}, incluindo nomes longos e números altos`, () => {
    const before = structuredClone(summary);
    for (const stress of [false, true]) {
      const cases = casesFor({ width, height, theme, stress });
      assert.equal(cases.length, 10);
      for (const { id, source, option } of cases) {
        const context = `${id} ${width}×${height} ${theme} stress=${stress}`;
        const beforeData = structuredClone(option.series.map((series) => series.data));
        assert.deepEqual(option.series.map((series) => series.data), source.series.map((series) => series.data), `${context}: a densidade não pode alterar valores exportados`);
        assert.equal(option.tooltip, source.tooltip, `${context}: manter o tooltip completo`);
        assert.equal(option.grid.containLabel, false, context);
        assert.equal(option.grid.outerBoundsMode, "same", context);
        assert.equal(option.grid.outerBoundsContain, "axisLabel", context);
        assert.ok(option.grid.left >= 4, `${context}: não voltar a encostar no limite do canvas`);
        withChart(option, { width, height }, (chart) => {
          const grid = chart.getModel().getComponent("grid").coordinateSystem.getRect();
          assert.ok(grid.width > 0 && grid.height > 0, `${context}: área útil precisa ser positiva`);
          const labels = yAxisTextBounds(chart);
          assert.ok(labels.length > 0, `${context}: medir rótulos reais, não passar com eixo vazio`);
          for (const { text, bounds } of labels) {
            assert.ok(bounds.x >= -0.5, `${context}: '${text}' ultrapassa esquerda em ${bounds.x}px`);
            assert.ok(bounds.x + bounds.width <= width + 0.5, `${context}: '${text}' ultrapassa direita`);
            assert.ok(bounds.y >= -0.5 && bounds.y + bounds.height <= height + 0.5, `${context}: '${text}' ultrapassa a altura do canvas`);
          }
        });
        assert.deepEqual(option.series.map((series) => series.data), beforeData, `${context}: renderização não pode alterar dados`);
      }
    }
    assert.deepEqual(summary, before, "o agregado original deve permanecer imutável");
  });
}

test("opções diretas de exportação preservam containment moderno e os mesmos valores da prévia", () => {
  for (const theme of ["light", "dark"]) {
    for (const { id, source, option } of casesFor({ width: 640, height: 320, theme, stress: true })) {
      assert.equal(source.grid.containLabel, false, id);
      assert.equal(source.grid.outerBoundsMode, "same", id);
      assert.equal(source.grid.outerBoundsContain, "axisLabel", id);
      assert.deepEqual(source.series.map((series) => series.data), option.series.map((series) => series.data), id);
      withChart(source, { width: 640, height: 320 }, (chart) => {
        for (const { text, bounds } of yAxisTextBounds(chart)) {
          assert.ok(bounds.x >= -0.5 && bounds.x + bounds.width <= 640.5, `${id}: '${text}' cortado na exportação direta`);
        }
      });
    }
  }
});
