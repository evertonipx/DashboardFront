import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loadedModules = new Map();
const { resolveChartLabelValue, isZeroChartLabelValue } = loadModule("lib/chart-label-value.ts");
const { formatBarLabelValue, withExportBarValueLabels } = loadModule("lib/report-export.ts", ["formatBarLabelValue", "withExportBarValueLabels"]);
const vertical = { xAxis: { type: "category" }, yAxis: { type: "value" } };
const horizontal = { xAxis: { type: "value" }, yAxis: { type: "category" } };

test("somente zero numérico real é identificado, sem converter ausência em zero", () => {
  for (const value of [0, -0, "0", "-0", "0.00", "+0e2", " 0 "]) assert.equal(isZeroChartLabelValue(value), true);
  for (const value of [null, undefined, "", " ", false, true, [], {}, NaN, Infinity, 1, -1, 0.001, "1e-9999", "0,0", "0%", "zero"]) {
    assert.equal(isZeroChartLabelValue(value), false, String(value));
  }
});

test("coordenadas zero não ocultam valores verticais, horizontais nem heatmaps", () => {
  assert.equal(resolveChartLabelValue({ value: [0, 8] }, { type: "bar" }, vertical), 8);
  assert.equal(resolveChartLabelValue({ value: [8, 0] }, { type: "bar" }, horizontal), 8);
  assert.equal(resolveChartLabelValue({ value: [0, 0, 8] }, { type: "heatmap" }, vertical), 8);
  assert.equal(resolveChartLabelValue({ value: [1, 2, 0] }, { type: "heatmap" }, vertical), 0);
  assert.equal(resolveChartLabelValue({ value: [0, 4] }, { type: "line" }, {}), 4);
});

test("dataset com dimensões nomeadas e objeto não depende da ordem de propriedades", () => {
  const series = { type: "bar", dimensions: [{ name: "date" }, { name: "total" }, { name: "other" }], encode: { x: "date", y: "total" } };
  assert.equal(resolveChartLabelValue({ value: [0, 7, 0] }, series, vertical), 7);
  assert.equal(resolveChartLabelValue({ value: { other: 0, total: 7, date: 0 } }, series, vertical), 7);
  assert.equal(resolveChartLabelValue({ value: { value: 0, total: 7 } }, { type: "bar", encode: { y: "total" } }, vertical), 7);
});

test("índices de encode em runtime e eixo específico prevalecem", () => {
  const params = { value: [0, 9, 0], encode: { x: [0], y: [1] }, dimensionNames: ["day", "total", "reference"] };
  assert.equal(resolveChartLabelValue(params, { type: "bar", encode: { y: 2 } }, vertical), 9);
  assert.equal(resolveChartLabelValue({ value: [6, 0], encode: { x: [0], y: [1] } }, { type: "bar", xAxisIndex: 1, yAxisIndex: 1 }, {
    xAxis: [{ type: "category" }, { type: "value" }], yAxis: [{ type: "value" }, { type: "category" }],
  }), 6);
});

test("encode.value e label explícitos resolvem dados multivariados", () => {
  assert.equal(resolveChartLabelValue({ value: [0, 4, 0], encode: { value: [1] } }, { type: "scatter" }, {}), 4);
  assert.equal(resolveChartLabelValue({ value: [0, 4, 0], encode: { label: [1] } }, { type: "scatter" }, {}), 4);
  assert.equal(resolveChartLabelValue({ value: { count: 5, reference: 0 }, dimensionNames: ["count", "reference"], encode: { value: [0] } }, { type: "pie" }, {}), 5);
  assert.equal(resolveChartLabelValue({ value: [0, 4, 0], encode: { defaultedLabel: [1] } }, { type: "scatter" }, {}), 4);
});

test("dimensões ambíguas não são confundidas com um zero", () => {
  assert.equal(resolveChartLabelValue({ value: [0, 9] }, { type: "scatter" }, {}), undefined);
  assert.equal(resolveChartLabelValue({ value: [0, 9] }, { type: "line" }, { xAxis: { type: "value" }, yAxis: { type: "value" } }), undefined);
  assert.equal(resolveChartLabelValue({ value: [0, 9, 0], encode: { y: [1, 2] } }, { type: "bar" }, vertical), undefined);
  assert.equal(resolveChartLabelValue({ value: [0, 9], encode: { label: [0, 1] } }, { type: "scatter" }, {}), undefined);
  assert.equal(resolveChartLabelValue({ value: { category: 0, total: 9 } }, { type: "bar" }, vertical), undefined);
  assert.equal(resolveChartLabelValue({ value: [0, 9], encode: { y: "missing" } }, { type: "bar" }, vertical), undefined);
});

test("escalar e objeto value preservam números, negativos e ausência", () => {
  for (const value of [0, -0, -8, 9, "0", null, ""]) {
    assert.equal(resolveChartLabelValue({ value }, { type: "bar" }, vertical), value);
    assert.equal(resolveChartLabelValue({ data: { value } }, { type: "bar" }, vertical), value);
  }
  assert.equal(resolveChartLabelValue({ value: false }, { type: "bar" }, vertical), undefined);
  assert.equal(resolveChartLabelValue({ value: 0, encode: { value: [2] } }, { type: "bar" }, vertical), 0);
  assert.equal(resolveChartLabelValue({ value: { value: ["day", 4] } }, { type: "line" }, vertical), 4);
});

test("exportação oculta zeros, mas mantém negativos e valores exatos das tabelas", () => {
  for (const value of [0, -0, "0", { value: 0 }, ["day", 0], null]) assert.equal(formatBarLabelValue(value), "");
  assert.equal(formatBarLabelValue(-12.5), "-12,5");
  const option = { ...vertical, series: [{ type: "line", name: "Atual", data: [0, 8, -3, 0] }] };
  const before = structuredClone(option);
  const output = withExportBarValueLabels(option);
  assert.equal(output.series[0].data, option.series[0].data);
  assert.deepEqual(option, before);
  assert.equal(output.series[0].label.formatter({ dataIndex: 0, value: 0 }), "");
  assert.equal(output.series[0].label.formatter({ dataIndex: 2, value: -3 }), "-3");
});

test("cem zeros não consomem a amostragem e escondem os únicos valores positivos", () => {
  const data = Array(100).fill(0);
  data[50] = 5;
  data[83] = -7;
  const output = withExportBarValueLabels({ ...vertical, series: [{ type: "line", name: "Atual", data }] });
  const formatter = output.series[0].label.formatter;
  assert.equal(formatter({ dataIndex: 50, value: 5 }), "5");
  assert.equal(formatter({ dataIndex: 83, value: -7 }), "-7");
  assert.equal(formatter({ dataIndex: 99, value: 0 }), "");
  assert.equal(output.series[0].label.fontSize, 11);
});

function loadModule(relativePath, extraExports = []) {
  if (loadedModules.has(relativePath)) return loadedModules.get(relativePath);
  const filename = resolve(root, relativePath);
  const input = readFileSync(filename, "utf8") + (extraExports.length ? `\nexport { ${extraExports.join(", ")} };` : "");
  const output = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  const scopedRequire = (specifier) => specifier.startsWith("@/")
    ? loadModule(`${specifier.slice(2)}.ts`)
    : createRequire(filename)(specifier);
  new Function("exports", "require", "module", output)(loaded.exports, scopedRequire, loaded);
  loadedModules.set(relativePath, loaded.exports);
  return loaded.exports;
}
