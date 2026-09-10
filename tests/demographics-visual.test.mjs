import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { circularLegendIssues, clippedYAxisLabels, collectCircularLayout, collectYAxisLabels, demographicCircularFixtureCases, demographicFixtureCases, demographicFixtureParts, demographicFixturePresets, demographicFixtureRows, overlappingTexts } from "../tools/verify-demographics.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const echarts = require("echarts");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8");
const parts = demographicFixtureParts(source);
const modules = new Map();
function loadModule(path) {
  if (modules.has(path)) return modules.get(path);
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", output)(loaded, loaded.exports, (name) => name.startsWith("@/") ? loadModule(`${name.slice(2)}.ts`) : require(name));
  modules.set(path, loaded.exports);
  return loaded.exports;
}
const demographics = loadModule("lib/demographics.ts");
const palette = loadModule("lib/chart-palette.ts");
const utils = loadModule("lib/utils.ts");
const presentation = loadModule("lib/demographics-presentation.ts");
const chartOptions = loadModule("lib/demographics-chart-options.ts");
const crossingOptions = loadModule("lib/demographics-crossing-options.ts");
const temporalPreferences = loadModule("lib/demographics-temporal-preferences.ts");
const bindings = { ...demographics, ...palette, ...utils, ...presentation, ...chartOptions, ...crossingOptions, ...temporalPreferences };
const functionNames = ["buildGenderOption", "buildAgeOption", "buildEmotionOption", "buildAgeGenderPyramidOption", "buildAgeEmotionHeatmapOption", "compactDemographicChartOption"];
const output = ts.transpileModule(`${parts.declarations}\nmodule.exports = {${functionNames.join(",")}};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", "require", ...Object.keys(bindings), output)(loaded, loaded.exports, require, ...Object.values(bindings));
const functions = loaded.exports;

function renderPresentationControls(dimension, value) {
  const controlsSource = readFileSync(resolve(root, "components/app/demographics-widget-controls.tsx"), "utf8");
  const ast = ts.createSourceFile("controls.tsx", controlsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = ast.statements.filter((node) => ts.isVariableStatement(node) || ts.isFunctionDeclaration(node)).map((node) => node.getText(ast)).join("\n");
  const javascript = ts.transpileModule(`${declarations}\nmodule.exports = DemographicsWidgetControls;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const controlsBindings = {
    ...presentation, ...utils,
    Button: "button", Checkbox: "checkbox", Select: "select", SelectContent: "select-content",
    SelectItem: "option", SelectTrigger: "select-trigger", SelectValue: "select-value",
    BarChart3: "icon", ChartNoAxesColumnIncreasing: "icon", ChartPie: "icon", Donut: "icon", RotateCcw: "icon", Smile: "icon",
  };
  const controlsModule = { exports: {} };
  new Function("module", "exports", "require", ...Object.keys(controlsBindings), javascript)(controlsModule, controlsModule.exports, require, ...Object.values(controlsBindings));
  const changes = [];
  const tree = controlsModule.exports({ dimension, value, onChange: (next) => changes.push(next) });
  const elements = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.props) { elements.push(node); visit(node.props.children); }
  }
  visit(tree);
  return { elements, changes };
}

function options(summary, theme = "light") {
  return [
    ["gender", functions.buildGenderOption(summary)],
    ["distribution", functions.buildAgeOption(summary, "#1267C4")],
    ["distribution", functions.buildEmotionOption(summary, "#7C3AED")],
    ["matrix", functions.buildAgeGenderPyramidOption(summary, theme)],
    ["heatmap", functions.buildAgeEmotionHeatmapOption(summary, theme)],
  ];
}

test("a fixture utiliza a lista real de quatro KPIs e cinco gráficos, sem API ou sessão", () => {
  assert.equal((parts.cards.match(/id: "demographics_/g) || []).length, 9);
  assert.equal((parts.cards.match(/previewKind: "metric"/g) || []).length, 4);
  for (const component of ["GenderCompositionCard", "AgeDistributionCard", "EmotionDistributionCard", "AgeGenderPyramidCard", "AgeEmotionHeatmapCard"]) {
    assert.ok(parts.cards.includes(`<${component}`), `${component} deve vir do código real`);
  }
  const tool = readFileSync(resolve(root, "tools/verify-demographics.mjs"), "utf8");
  assert.doesNotMatch(tool, /import \{ useAuth \}|Authorization:|Bearer |apiFetch\(/);
  assert.match(tool, /ipxdata-demographics-/);
  assert.match(tool, /data-layout-card-configure/);
  for (const hook of ["data-layout-card-id", "data-layout-card-height-level", "data-layout-card-density", "data-layout-card-width-level"]) assert.ok(tool.includes(hook));
});

test("a matriz visual cobre formatos, direção, ordenação, símbolos e paleta em telas pequenas e grandes", () => {
  assert.equal(demographicFixtureCases.filter((item) => item.preset === "default").length, 12);
  const settings = Object.values(demographicFixturePresets).flatMap(Object.values);
  for (const type of ["half-donut", "pie", "donut", "rose", "bar", "stacked"]) assert.ok(settings.some((value) => value.type === type));
  for (const order of ["ascending", "descending"]) assert.ok(settings.some((value) => value.order === order));
  assert.ok(settings.some((value) => value.orientation === "vertical"));
  assert.ok(settings.some((value) => value.emojis === true));
  assert.ok(settings.some((value) => value.palette === "cyber"));
  for (const preset of Object.keys(demographicFixturePresets).filter((value) => value !== "default")) {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 1440]) {
        assert.ok(demographicFixtureCases.some((value) => value.preset === preset && value.theme === theme && value.width === width && value.compact));
      }
    }
  }
});

test("a inspeção visual distingue colisões reais de caixas delimitadoras de textos inclinados", () => {
  const tilted = (offset, text) => {
    const factor = Math.SQRT1_2;
    const polygon = [[0, 0], [40, 0], [40, 9], [0, 9]].map(([x, y]) => [(x - y) * factor + offset, (x + y) * factor]);
    return {
      text, polygon, x: Math.min(...polygon.map((point) => point[0])), right: Math.max(...polygon.map((point) => point[0])),
      y: Math.min(...polygon.map((point) => point[1])), bottom: Math.max(...polygon.map((point) => point[1])),
    };
  };
  assert.equal(overlappingTexts([tilted(0, "Primeiro"), tilted(20, "Segundo")]).length, 0);
  assert.equal(overlappingTexts([tilted(0, "Primeiro"), tilted(6, "Segundo")]).length, 1);
  assert.equal(overlappingTexts([{ text: "A", x: 0, y: 0, right: 10, bottom: 10 }, { text: "B", x: 5, y: 5, right: 15, bottom: 15 }]).length, 1);
});

test("a inspeção de eixo Y usa seus spans reais, incluindo rich text, sem confundir eixo X ou nome do eixo", () => {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 300, height: 200 });
  try {
    chart.setOption({
      animation: false,
      grid: { left: 0, right: 30, top: 30, bottom: 30, containLabel: false, outerBoundsMode: "none" },
      xAxis: { type: "category", data: ["10-19"], axisLabel: { interval: 0 } },
      yAxis: { type: "category", data: ["10-19", "Desprezo"], name: "Nome do eixo", axisLabel: {
        interval: 0, fontSize: 11, formatter: (value) => `{label|${value}}{icon| 👩}`,
        rich: { label: { fontSize: 11 }, icon: { fontSize: 11 } },
      } },
      series: [{ type: "heatmap", data: [[0, 0, 2], [0, 1, 3]], label: { show: true } }],
      visualMap: { show: false, min: 0, max: 3 },
    });
    chart.renderToSVGString();
    const labels = collectYAxisLabels(chart);
    assert.equal(labels.length, 4, "dois rótulos rich de dois spans cada, sem texto X/nome/série");
    assert.equal(labels.filter((label) => label.text === "10-19").length, 1);
    assert.equal(labels.filter((label) => label.text === "Desprezo").length, 1);
    assert.ok(labels.every((label) => label.axisIndex === 0 && label.axisType === "category"));
    assert.ok(clippedYAxisLabels(labels, chart.getWidth()).some((label) => label.text === "10-19" && label.x < 0));
    chart.setOption({ yAxis: { axisLabel: { show: false } } });
    chart.renderToSVGString();
    assert.deepEqual(collectYAxisLabels(chart), [], "rótulos não desenhados não entram na medição");
  } finally { chart.dispose(); }
});

test("limite horizontal do eixo Y detecta corte subpixel e em ambos os lados, preservando x zero", () => {
  const labels = [
    { text: "na borda", x: 0, right: 100 },
    { text: "antes da borda", x: -0.01, right: 30 },
    { text: "além da borda", x: 70, right: 100.01 },
  ];
  assert.deepEqual(clippedYAxisLabels(labels, 100).map((label) => label.text), ["antes da borda", "além da borda"]);
});

test("casos circulares extras preservam a matriz legada e incluem alturas normais e compactas", () => {
  assert.equal(demographicFixtureCases.length, 36);
  assert.equal(demographicCircularFixtureCases.length, 36);
  for (const preset of ["circular", "circularAlternate", "cyber"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 768, 1440]) {
        for (const compact of [false, true]) {
          assert.ok(demographicCircularFixtureCases.some((item) => item.preset === preset && item.theme === theme && item.width === width && item.compact === compact));
        }
      }
    }
  }
});

test("legenda circular real mantém correspondência por nome e cor após reordenação e formatação rich", () => {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 400, height: 240 });
  try {
    chart.setOption({
      animation: false,
      legend: {
        data: ["Homem 👨", "Mulher 👩"], bottom: 0, selectedMode: false,
        formatter: (name) => `{name|${name}}\n{value|${name.startsWith("Homem") ? "60" : "40"}%}`,
        textStyle: { rich: { name: { fontSize: 11 }, value: { fontSize: 11 } } },
      },
      series: [{ type: "pie", radius: [20, 60], center: ["50%", "40%"], label: { show: false }, data: [
        { name: "Mulher 👩", key: "Woman", value: 40, count: 40, percentage: 40, itemStyle: { color: "#DB2777" } },
        { name: "Homem 👨", key: "Man", value: 60, count: 60, percentage: 60, itemStyle: { color: "#2563EB" } },
      ] }],
    });
    chart.renderToSVGString();
    const layout = collectCircularLayout(chart);
    assert.equal(layout.series[0].diameter, 120);
    assert.deepEqual(layout.legendItems.map((item) => item.name), ["Homem 👨", "Mulher 👩"]);
    assert.deepEqual(layout.legendItems.map((item) => item.color), ["#2563EB", "#DB2777"]);
    assert.deepEqual(circularLegendIssues(layout, chart.getWidth(), chart.getHeight()), []);
  } finally { chart.dispose(); }
});

test("detector circular reprova legendas truncadas, cores/percentuais trocados e setores minúsculos", () => {
  const valid = {
    series: [{ diameter: 80, slices: [{ name: "Mulher 👩", count: 4, percentage: 40, color: "#DB2777" }] }],
    legendEnabled: true,
    legendItems: [{ name: "Mulher 👩", color: "#DB2777", expectedText: "Mulher 👩\n40%", renderedText: "Mulher 👩\n40%", spans: [{ x: 10, y: 80, right: 80, bottom: 100 }] }],
  };
  assert.deepEqual(circularLegendIssues(valid, 200, 120), []);
  const corrupted = structuredClone(valid);
  corrupted.series[0].diameter = 24;
  corrupted.legendItems[0].color = "#2563EB";
  corrupted.legendItems[0].renderedText = "Mulher ...\n60%";
  corrupted.legendItems[0].spans[0].right = 201;
  const issues = circularLegendIssues(corrupted, 200, 120);
  for (const message of ["diameter", "color differs", "truncates", "exact percentage", "exceeds the canvas"]) assert.ok(issues.some((issue) => issue.includes(message)), message);
  assert.ok(circularLegendIssues({ ...valid, legendItems: [] }, 200, 120).some((issue) => issue.includes("omits")));
  const zero = structuredClone(valid);
  zero.series[0] = { diameter: 0, slices: [{ ...zero.series[0].slices[0], count: 0, percentage: 0 }] };
  zero.legendItems[0].expectedText = zero.legendItems[0].renderedText = "Mulher 👩";
  assert.deepEqual(circularLegendIssues(zero, 200, 120), [], "zero sem fatia não é confundido com gráfico minúsculo");
});

test("heatmap compacto mantém texto primeiro e emoji à direita sem alterar categorias ou valores", () => {
  const summary = demographics.aggregateDemographicBuckets(demographicFixtureRows);
  const settings = presentation.normalizeDemographicPresentation({ emojis: true }, "age-emotion");
  const original = crossingOptions.buildDemographicCrossingOption(summary, settings, "age-emotion");
  const compact = functions.compactDemographicChartOption(original, "heatmap", { compact: true, narrow: true });
  assert.deepEqual(compact.xAxis.data, original.xAxis.data);
  assert.deepEqual(compact.series.map(series => series.data), original.series.map(series => series.data));
  assert.equal(compact.xAxis.axisLabel.formatter("Neutro 😐"), "Ne. 😐");
  assert.equal(compact.xAxis.axisLabel.formatter("Nojo 🤢"), "No. 🤢");
  assert.equal(compact.xAxis.axisLabel.formatter("Neutro"), "Neu.");
  assert.equal(compact.xAxis.axisLabel.formatter("Categoria futura"), "Categoria futura");
  for (const label of original.xAxis.data) assert.match(label, /^\p{L}.* \p{Extended_Pictographic}/u);
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: novos formatos renderizam a distribuição real sem texturas nem alterar o total`, () => {
    const summary = demographics.aggregateDemographicBuckets(demographicFixtureRows);
    const original = structuredClone(summary);
    for (const [name, preset] of Object.entries(demographicFixturePresets)) {
      for (const dimension of ["gender", "age", "emotion"]) {
        const settings = presentation.normalizeDemographicPresentation(preset[dimension], dimension);
        const option = chartOptions.buildDemographicDistributionOption(summary[dimension], settings, { dimension, theme });
        assert.notEqual(option.aria?.decal?.show, true, `${name}/${dimension} não deve ativar texturas`);
        const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 320, height: 180 });
        try {
          chart.setOption({ ...option, animation: false });
          const svg = chart.renderToSVGString();
          assert.match(svg, /<svg/);
          assert.doesNotMatch(svg, /<pattern\b|url\(#.*pattern/i);
          assert.doesNotMatch(svg, /(?:NaN|undefined)/);
          if (["pie", "donut", "half-donut", "rose"].includes(settings.type)) {
            const series = option.series[0];
            assert.equal(series.type, "pie");
            assert.equal(series.data.reduce((total, item) => total + item.value, 0), summary.total);
            assert.equal(series.data.length, summary[dimension].length, "meia-rosca não adiciona uma fatia artificial");
            for (const item of series.data) assert.ok(item.value >= 0);
            if (settings.type === "half-donut") {
              assert.equal(series.startAngle, 180);
              assert.equal(series.endAngle, 0);
            }
          }
        } finally { chart.dispose(); }
      }
    }
    assert.deepEqual(summary, original, "novas opções apenas apresentam dados, sem mudar contagens");
  });
}

test("a paleta padrão associa rosa e azul à categoria, independentemente da ordenação", () => {
  const pink = presentation.demographicCategoryColor("Woman", 0, "pink-blue", "gender");
  const blue = presentation.demographicCategoryColor("Man", 1, "pink-blue", "gender");
  assert.equal(pink, "#DB2777");
  assert.equal(blue, "#2563EB");
  assert.notEqual(pink, blue);
  assert.equal(presentation.demographicCategoryColor("Woman", 2, "pink-blue", "gender"), pink);
  assert.equal(presentation.demographicCategoryColor("Man", 0, "pink-blue", "gender"), blue);
  const neutral = presentation.demographicCategoryColor("unknown", 2, "pink-blue", "gender");
  assert.notEqual(neutral, pink);
  assert.notEqual(neutral, blue);
});

test("controles reais aplicam formatos, orientação, ordem, paleta e emojis apenas na apresentação", () => {
  const initial = presentation.defaultDemographicPresentation("gender");
  const { elements, changes } = renderPresentationControls("gender", initial);
  const buttons = elements.filter((element) => element.type === "button" && "aria-pressed" in element.props);
  assert.equal(buttons.length, 8, "seis formatos e duas orientações ficam acessíveis");
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(changes.slice(0, 6).map((value) => value.type), ["bar", "stacked", "pie", "donut", "half-donut", "rose"]);
  assert.deepEqual(changes.slice(6, 8).map((value) => value.orientation), ["horizontal", "vertical"]);
  const selects = elements.filter((element) => element.type === "select");
  selects[0].props.onValueChange("ascending");
  selects[1].props.onValueChange("cyber");
  elements.find((element) => element.type === "checkbox").props.onCheckedChange(true);
  assert.equal(changes.at(-3).order, "ascending");
  assert.equal(changes.at(-2).palette, "cyber");
  assert.equal(changes.at(-1).emojis, true);
  for (const value of changes) assert.deepEqual(Object.keys(value).sort(), ["emojis", "order", "orientation", "palette", "type"]);
  assert.deepEqual(initial, presentation.defaultDemographicPresentation("gender"));
});

test("matrizes oferecem configurações compatíveis sem trocar indevidamente a dimensão", () => {
  for (const dimension of ["age-gender", "age-emotion"]) {
    const { elements, changes } = renderPresentationControls(dimension, presentation.defaultDemographicPresentation(dimension));
    assert.equal(elements.filter((element) => element.type === "button" && "aria-pressed" in element.props).length, 0);
    const selects = elements.filter((element) => element.type === "select");
    assert.equal(selects.length, 2);
    selects[0].props.onValueChange("descending");
    selects[1].props.onValueChange("cyber");
    assert.equal(changes[0].order, "descending");
    assert.equal(changes[1].palette, "cyber");
    for (const value of changes) assert.equal(value.type, dimension === "age-gender" ? "matrix" : "heatmap");
  }
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: cinco gráficos usam cores sólidas e SVG real sem pattern`, () => {
    const summary = demographics.aggregateDemographicBuckets(demographicFixtureRows);
    const original = structuredClone(summary);
    for (const [kind, option] of options(summary, theme)) {
      assert.notEqual(option.aria?.decal?.show, true, `${kind} não deve ativar texturas`);
      const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 600, height: 300 });
      try {
        chart.setOption({ ...option, animation: false });
        const svg = chart.renderToSVGString();
        assert.match(svg, /<svg/);
        assert.doesNotMatch(svg, /<pattern\b|url\(#.*pattern/i, `${kind} não deve produzir texturas`);
        assert.ok(option.series.length > 0);
      } finally { chart.dispose(); }
    }
    assert.deepEqual(summary, original, "a apresentação não altera contagens ou distribuições");
  });

  test(`${theme}: densidades compacta e estreita preservam séries, dados e tooltips`, () => {
    const summary = demographics.aggregateDemographicBuckets(demographicFixtureRows);
    for (const [kind, option] of options(summary, theme)) {
      const original = option.series.map((series) => JSON.stringify(series.data));
      for (const density of [{ compact: true, narrow: true }, { compact: false, narrow: true }]) {
        const adapted = functions.compactDemographicChartOption(option, kind, density);
        assert.deepEqual(adapted.series.map((series) => JSON.stringify(series.data)), original);
        assert.equal(adapted.tooltip, option.tooltip);
        assert.notEqual(adapted.aria?.decal?.show, true);
        assert.ok(adapted.series.every((series) => !series.label?.fontSize || series.label.fontSize >= 9));
      }
      assert.deepEqual(option.series.map((series) => JSON.stringify(series.data)), original);
    }
  });
}

test("zero e ausência continuam distintos após a mudança visual", () => {
  const empty = demographics.aggregateDemographicBuckets([]);
  const zero = demographics.aggregateDemographicBuckets([{ ...demographicFixtureRows[0], count: 0 }]);
  assert.equal(empty.hasData, false);
  assert.equal(zero.hasData, true);
  for (const summary of [empty, zero]) {
    for (const [, option] of options(summary)) {
      assert.ok(option.series.length > 0);
      assert.notEqual(option.aria?.decal?.show, true);
    }
  }
});

test("gutter do EChart não encurta composição interna, mas preserva rótulos externos e verticais", () => {
  const chartSource = readFileSync(resolve(root, "components/app/echart.tsx"), "utf8");
  const ast = ts.createSourceFile("echart.tsx", chartSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["valueLabelGrid", "numericGridOffset"]);
  const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map((node) => node.getText(ast)).join("\n");
  const labels = loadModule("lib/chart-value-labels.ts");
  const javascript = ts.transpileModule(`${declarations}\nreturn valueLabelGrid;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const gridFor = new Function(...Object.keys(labels), javascript)(...Object.values(labels));
  const grid = { left: 4, right: 4, top: 8, bottom: 0, containLabel: false };
  const inside = [{ type: "bar", label: { show: true, position: "inside" } }, { type: "bar", label: { show: true, position: "insideLeft" } }];
  assert.equal(gridFor(grid, inside, true), grid);
  const mixed = gridFor(grid, [...inside, { type: "bar", label: { show: true, position: "right" } }], true);
  assert.equal(mixed.right, 58);
  assert.equal(mixed.top, grid.top);
  const vertical = gridFor(grid, [{ type: "bar", label: { show: true, position: "top" } }], false);
  assert.ok(vertical.top >= 38);
  assert.equal(vertical.right, grid.right);
  assert.deepEqual(grid, { left: 4, right: 4, top: 8, bottom: 0, containLabel: false });
});

test("rótulos internos permanecem ancorados no segmento e rótulos externos mantêm ajuste de colisão", () => {
  const chartSource = readFileSync(resolve(root, "components/app/echart.tsx"), "utf8");
  const ast = ts.createSourceFile("echart.tsx", chartSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text !== "EChart").map((node) => node.getText(ast).replace(/^export\s+/, "")).join("\n");
  const labels = loadModule("lib/chart-value-labels.ts");
  const javascript = ts.transpileModule(`${declarations}\nreturn enhanceInteractiveChartOption;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const enhance = new Function(...Object.keys(labels), javascript)(...Object.values(labels));
  const option = enhance({ xAxis: { type: "value" }, yAxis: { type: "category", data: ["Total"] }, series: [
    { type: "bar", name: "Interno", data: [42], label: { position: "inside", show: true } },
    { type: "bar", name: "Externo", data: [14], label: { position: "right", show: true } },
  ] }, false, "always");
  assert.equal(option.series[0].labelLayout({}).moveOverlap, undefined);
  assert.equal(option.series[0].labelLayout({}).hideOverlap, true);
  assert.equal(option.series[1].labelLayout({}).moveOverlap, "shiftY");
});
