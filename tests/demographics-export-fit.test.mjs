import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const echarts = require("echarts");
const modules = new Map();
const { prepareReportChartOption: prepare, withExportBarValueLabels: exportStyles } = load(
  "lib/report-export.ts", ["prepareReportChartOption", "withExportBarValueLabels"],
);
const { buildDemographicDistributionOption: build, fitDemographicCompositionOption: fit } = load("lib/demographics-chart-options.ts");
const { defaultDemographicPresentation: defaults } = load("lib/demographics-presentation.ts");
const { visibleDemographicDistribution } = load("lib/demographics-visible-categories.ts");

test("o ajuste opcional recebe tamanho real depois dos estilos de exportação, sem mutar a origem", () => {
  const option = {
    legend: { itemGap: 2, textStyle: { fontSize: 9 } },
    series: [{ type: "pie", data: [{ name: "Categoria", value: 8 }] }],
  };
  const snapshot = structuredClone(option);
  for (const size of [{ width: 900, height: 400 }, { width: 520, height: 260 }]) {
    let calls = 0;
    const result = prepare({
      option,
      fitOption: (prepared, dimensions) => {
        calls++;
        assert.equal(dimensions, size);
        assert.equal(prepared.legend.itemGap, 12, "o enhancer genérico deve executar antes do ajuste final");
        assert.equal(prepared.textStyle.fontFamily, "Arial, sans-serif");
        assert.equal(prepared.series[0].data, option.series[0].data);
        return { ...prepared, legend: { ...prepared.legend, itemGap: 3 }, fittedSize: dimensions };
      },
    }, size);
    assert.equal(calls, 1);
    assert.equal(result.legend.itemGap, 3, "o ajuste final não pode ser sobrescrito pelo enhancer de exportação");
    assert.equal(result.fittedSize, size);
  }
  assert.deepEqual(option, snapshot);
});

test("gráficos de outros módulos sem callback mantêm o caminho anterior e os rótulos de zero", () => {
  const option = {
    xAxis: { type: "category" }, yAxis: { type: "value" },
    series: [{ type: "bar", name: "Atual", data: [0, 8, -3] }],
  };
  const snapshot = structuredClone(option);
  const actual = prepare({ option }, { width: 900, height: 400 });
  const previous = exportStyles(option);
  assert.equal(JSON.stringify(actual), JSON.stringify(previous));
  assert.equal(actual.series[0].label.formatter({ dataIndex: 0, value: 0 }), "");
  assert.equal(actual.series[0].label.formatter({ dataIndex: 1, value: 8 }), "8");
  assert.equal(actual.series[0].label.formatter({ dataIndex: 2, value: -3 }), "-3");
  assert.deepEqual(option, snapshot);
});

for (const exporter of ["exportReportToExcel", "exportReportToPdf"]) {
  test(`${exporter}: rasterização usa a opção ajustada, dimensões exatas e o sinal de cancelamento`, async () => {
    const render = exportRenderStep(exporter);
    const controller = new AbortController();
    let fitSize;
    let rendered = 0;
    const option = { series: [{ type: "pie", data: [{ name: "Categoria", value: 1 }] }] };
    const result = await render({
      option,
      fitOption: (prepared, size) => {
        fitSize = size;
        return { ...prepared, fittedForExport: true };
      },
    }, { signal: controller.signal }, prepare, async (prepared, size) => {
      rendered++;
      assert.equal(prepared.fittedForExport, true);
      assert.equal(size, fitSize);
      assert.equal(size.width, 900);
      assert.equal(size.height, 400);
      assert.equal(size.signal, controller.signal);
      return "data:image/png;base64,fixture";
    });
    assert.equal(result, "data:image/png;base64,fixture");
    assert.equal(rendered, 1);

    await assert.rejects(render({ option, fitOption: () => { throw new Error("fit failed"); } }, {}, prepare,
      async () => { throw new Error("não rasterizar uma opção cujo ajuste falhou"); }), /fit failed/);
  });
}

test("apenas as três distribuições do relatório demográfico optam pelo ajuste por dimensões", () => {
  const source = sourceFile("components/app/demographics-dashboard.tsx");
  const report = declaration(source, "buildDemographicsReport");
  const charts = descendants(report).find((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === "charts");
  assert.ok(charts && ts.isArrayLiteralExpression(charts.initializer));
  assert.equal(charts.initializer.elements.length, 5);
  charts.initializer.elements.forEach((chart, index) => {
    const fitProperty = chart.properties.find((property) => property.name?.getText(source) === "fitOption");
    if (index < 3) assert.equal(fitProperty?.initializer.getText(source), "fitDemographicCompositionOption");
    else assert.equal(fitProperty, undefined, "cruzamentos e heatmaps não recebem ajuste circular");
  });
  const shared = readFileSync(resolve(root, "lib/report-export.ts"), "utf8");
  assert.doesNotMatch(shared, /from\s+["']@\/lib\/demographics/, "exportação genérica não depende do módulo Demográfico");
});

const groups = {
  gender: [["Woman", "Mulher"], ["Man", "Homem"], ["unknown", "Não identificado"]],
  age: ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"].map((key) => [key, key]),
  emotion: [["neutral", "Neutro"], ["happy", "Feliz"], ["surprise", "Surpresa"], ["sad", "Triste"], ["angry", "Raiva"], ["disgust", "Nojo"], ["fear", "Medo"], ["contempt", "Desprezo"]],
};

test("circulares ajustados para PDF/Excel preservam percentuais exatos, fatias e textos em SVG real", () => {
  for (const [dimension, categories] of Object.entries(groups)) for (const type of ["pie", "donut", "half-donut", "rose"]) {
    const items = categories.map(([key, label], index) => ({
      key, label, observed: true, count: [9500, 499, 1][index] ?? 0, percentage: [95, 4.99, 0.01][index] ?? 0,
    }));
    const option = build(items, { ...defaults(dimension), type }, { dimension, showLegend: true });
    const visible = visibleDemographicDistribution(items, dimension);
    const before = JSON.stringify(option);
    const prepared = prepare({ option, fitOption: fit }, { width: 900, height: 400 });
    assert.deepEqual(prepared.series.flatMap((series) => series.data).map(({ key, value, count, percentage }) => ({ key, value, count, percentage })),
      visible.map(({ key, count, percentage }) => ({ key, value: count, count, percentage })));
    assert.ok(!prepared.media?.length);
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 400 });
    try {
      chart.setOption({ ...prepared, animation: false });
      const svg = chart.renderToSVGString();
      assert.doesNotMatch(svg, /NaN|<pattern\b/);
      const percentages = dimension === "gender" ? ["95,01%", "4,99%"] : ["95%", "4,99%", "0,01%"];
      for (const percentage of percentages) assert.ok(svg.includes(percentage), `${dimension}/${type}: ${percentage} deve aparecer na imagem`);
      if (dimension === "gender") assert.doesNotMatch(svg, /Não identificado/);
      assert.equal(chart.getModel().getSeriesByIndex(0).getData().count(), visible.length);
    } finally { chart.dispose(); }
    assert.equal(JSON.stringify(option), before);
  }
});

function sourceFile(path) {
  return ts.createSourceFile(path, readFileSync(resolve(root, path), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function declaration(source, name) {
  const found = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(found, `${name} deve existir`);
  return found;
}

function descendants(node) {
  const result = [];
  const visit = (child) => { result.push(child); ts.forEachChild(child, visit); };
  visit(node);
  return result;
}

function exportRenderStep(name) {
  const source = sourceFile("lib/report-export.ts");
  const nodes = descendants(declaration(source, name));
  const dimensions = nodes.find((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === "chartDimensions");
  const image = nodes.find((node) => ts.isVariableDeclaration(node) && node.initializer &&
    ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression) &&
    node.initializer.expression.expression.getText(source) === "renderEChartToDataUrl");
  assert.ok(dimensions && image, `${name}: tamanho e chamada de render precisam existir`);
  const input = `async function execute(chart, options, prepareReportChartOption, renderEChartToDataUrl) {
    ${dimensions.parent.parent.getText(source)}
    ${image.parent.parent.getText(source)}
    return ${image.name.getText(source)};
  }; module.exports = execute;`;
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", compiled)(loaded);
  return loaded.exports;
}

function load(path, extraExports = []) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} };
  modules.set(path, loaded);
  const input = readFileSync(resolve(root, path), "utf8") + (extraExports.length ? `\nexport { ${extraExports.join(", ")} };` : "");
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", compiled)(loaded, loaded.exports, (name) =>
    name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  return loaded.exports;
}
