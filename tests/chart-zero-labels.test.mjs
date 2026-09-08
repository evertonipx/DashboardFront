import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const echarts = require("echarts");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loadedModules = new Map();

function loadModule(relativePath) {
  const path = resolve(projectRoot, relativePath);
  if (loadedModules.has(path)) return loadedModules.get(path);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  loadedModules.set(path, compiledModule.exports);
  const localRequire = (name) => name.startsWith("@/")
    ? loadModule(`${name.slice(2)}.ts`)
    : name.startsWith(".") ? loadModule(resolve(dirname(path), `${name}.ts`)) : require(name);
  new Function("module", "exports", "require", compiled)(compiledModule, compiledModule.exports, localRequire);
  return compiledModule.exports;
}

const { suppressZeroChartLabels } = loadModule("lib/chart-zero-labels.ts");

function withChart(option, inspect) {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 760, height: 360 });
  try {
    chart.setOption({ animation: false, ...option }, { notMerge: true, lazyUpdate: false });
    return inspect(chart);
  } finally {
    chart.dispose();
  }
}

function svg(option) {
  return withChart(option, (chart) => chart.renderToSVGString());
}

function cartesian(type, data, seriesOverrides = {}, optionOverrides = {}) {
  return {
    animation: false,
    grid: { left: 55, right: 100, top: 45, bottom: 45 },
    xAxis: { type: "category", data: ["00h", "01h", "02h", "03h", "04h", "05h"], axisLabel: { interval: 0 } },
    yAxis: { type: "value", min: -10, max: 20 },
    tooltip: { trigger: "axis", formatter: "Tooltip: {c}" },
    series: [{ type, name: "Fluxo", data, label: { show: true, position: "top", formatter: "VALOR={c}" }, ...seriesOverrides }],
    ...optionOverrides,
  };
}

function freezeRecursively(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freezeRecursively);
  return value;
}

for (const type of ["line", "bar"]) {
  test(`SVG ${type}: elimina rótulos zero, mantém positivos, negativos e 00h no eixo`, () => {
    const option = cartesian(type, [0, 7, -3, 0]);
    assert.match(svg(option), /VALOR=0/, "a fixture precisa reproduzir o rótulo zero anterior");
    const transformed = suppressZeroChartLabels(option);
    const rendered = svg(transformed);
    assert.doesNotMatch(rendered, /VALOR=0/);
    assert.match(rendered, /VALOR=7/);
    assert.match(rendered, /VALOR=-3/);
    assert.match(rendered, />00h<\/text>/);
    assert.equal(transformed.xAxis, option.xAxis);
    assert.equal(transformed.yAxis, option.yAxis);
    assert.equal(transformed.tooltip, option.tooltip);
    withChart(transformed, (chart) => {
      const series = chart.getModel().getSeriesByIndex(0);
      assert.equal(series.getData().count(), 4);
      assert.deepEqual([0, 1, 2, 3].map((index) => series.getRawValue(index)), [0, 7, -3, 0]);
    });
  });
}

test("SVG heatmap: avalia a medida, não as coordenadas zero da célula", () => {
  const option = {
    animation: false,
    xAxis: { type: "category", data: ["00h", "01h"] },
    yAxis: { type: "category", data: ["Segunda", "Terça"] },
    visualMap: { min: -3, max: 9, show: false },
    series: [{ type: "heatmap", data: [[0, 0, 9], [1, 0, 0], [0, 1, -3]], label: { show: true, formatter: (params) => `CELULA=${params.value[2]}` } }],
  };
  assert.match(svg(option), /CELULA=0/);
  const rendered = svg(suppressZeroChartLabels(option));
  assert.doesNotMatch(rendered, /CELULA=0/);
  assert.match(rendered, /CELULA=9/);
  assert.match(rendered, /CELULA=-3/);
  assert.match(rendered, />00h<\/text>/);
});

test("SVG pie: omite fatia zero sem trocar valor, nome ou percentual das demais", () => {
  const option = {
    animation: false,
    series: [{ type: "pie", radius: "55%", data: [{ name: "Sem público", value: 0 }, { name: "Visitantes", value: 5 }], label: { show: true, formatter: "FATIA={b}:{c}:{d}%" } }],
  };
  assert.match(svg(option), /FATIA=Sem público:0:0%/);
  const rendered = svg(suppressZeroChartLabels(option));
  assert.doesNotMatch(rendered, /FATIA=Sem público/);
  assert.match(rendered, /FATIA=Visitantes:5:100%/);
});

test("objetos value e label por ponto não reintroduzem zero sobre a regra da série", () => {
  const option = cartesian("bar", [
    { value: 0, label: { show: true, formatter: "PONTO={c}" }, itemStyle: { color: "#1267C4" } },
    { value: 8, label: { show: true, formatter: "PONTO={c}" }, itemStyle: { color: "#219653" } },
  ]);
  const before = structuredClone(option);
  const transformed = suppressZeroChartLabels(freezeRecursively(option));
  const rendered = svg(transformed);
  assert.doesNotMatch(rendered, /PONTO=0/);
  assert.match(rendered, /PONTO=8/);
  assert.deepEqual(option, before);
  withChart(transformed, (chart) => {
    const series = chart.getModel().getSeriesByIndex(0);
    assert.equal(series.getRawValue(0), 0);
    assert.equal(series.getRawValue(1), 8);
  });
});

test("formatter callback preserva saída não-zero e os parâmetros reais do ECharts", () => {
  const observed = [];
  const formatter = function (params) {
    observed.push({ value: params.value, name: params.name, seriesName: params.seriesName, dataIndex: params.dataIndex });
    return `CUSTOM=${params.seriesName}:${params.name}:${params.value}`;
  };
  const option = cartesian("line", [0, -2, 6], { label: { show: true, formatter } });
  const rendered = svg(suppressZeroChartLabels(option));
  assert.doesNotMatch(rendered, /CUSTOM=Fluxo:00h:0/);
  assert.match(rendered, /CUSTOM=Fluxo:01h:-2/);
  assert.match(rendered, /CUSTOM=Fluxo:02h:6/);
  assert.ok(observed.some((params) => params.value === 6 && params.name === "02h" && params.seriesName === "Fluxo" && params.dataIndex === 2));
  assert.equal(option.series[0].label.formatter, formatter);
});

test("rich text e formatter string mantêm seu conteúdo positivo e estilos", () => {
  const rich = { amount: { color: "#cc00ff", fontWeight: "bold" } };
  const option = cartesian("bar", [0, 12], { label: { show: true, formatter: "{amount|RICO={c}}", rich } });
  const transformed = suppressZeroChartLabels(option);
  const rendered = svg(transformed);
  assert.doesNotMatch(rendered, /RICO=0/);
  assert.match(rendered, /RICO=12/);
  assert.match(rendered, /fill="#cc00ff"/i);
  assert.deepEqual(transformed.series[0].label.rich, rich);
});

test("null, undefined e marcador de ausência não são convertidos em zero", () => {
  const formatter = ({ value }) => value == null || value === "-" ? "SEM DADOS" : `VALOR=${value}`;
  const option = cartesian("line", [null, undefined, "-", 0, 4], { label: { show: true, formatter } });
  const originalData = [...option.series[0].data];
  const originalRawValues = withChart(option, (chart) => {
    const series = chart.getModel().getSeriesByIndex(0);
    return [0, 1, 2].map((index) => series.getRawValue(index));
  });
  const transformed = suppressZeroChartLabels(option);
  withChart(transformed, (chart) => {
    const series = chart.getModel().getSeriesByIndex(0);
    assert.deepEqual([0, 1, 2].map((index) => series.getRawValue(index)), originalRawValues, "preserva a normalização nativa do ECharts para valores ausentes");
    assert.equal(series.getFormattedLabel(0), "SEM DADOS");
    assert.equal(series.getFormattedLabel(1), "SEM DADOS");
    assert.equal(series.getFormattedLabel(2), "SEM DADOS");
  });
  assert.deepEqual(transformed.series[0].data, originalData);
  assert.deepEqual(option.series[0].data, originalData);
});

test("tooltip e referência zero em eixo permanecem intactos mesmo com todos os valores zerados", () => {
  const tooltipFormatter = (params) => `TOTAL=${params[0].value}`;
  const option = cartesian("bar", [0, 0], {}, { tooltip: { trigger: "axis", formatter: tooltipFormatter }, yAxis: { type: "value", min: 0, max: 2, interval: 1 } });
  const transformed = suppressZeroChartLabels(option);
  assert.equal(transformed.tooltip, option.tooltip);
  assert.equal(transformed.tooltip.formatter([{ value: 0 }]), "TOTAL=0");
  const rendered = svg(transformed);
  assert.doesNotMatch(rendered, /VALOR=0/);
  assert.match(rendered, />0<\/text>/, "o tick zero do eixo deve continuar visível");
  assert.match(rendered, />00h<\/text>/);
});

test("endLabel de linha não reintroduz o último valor zero", () => {
  const option = cartesian("line", [8, 4, 0], {
    label: { show: false },
    endLabel: { show: true, formatter: "FINAL={c}" },
  });
  assert.match(svg(option), /FINAL=0/);
  assert.doesNotMatch(svg(suppressZeroChartLabels(option)), /FINAL=0/);
  const positive = cartesian("line", [0, 4, -2], { label: { show: false }, endLabel: { show: true, formatter: "FINAL={c}" } });
  assert.match(svg(suppressZeroChartLabels(positive)), /FINAL=-2/);
});

test("estado emphasis não traz de volta o rótulo zero oculto", () => {
  const option = cartesian("bar", [0, 8], { label: { show: true, formatter: "NORMAL={c}" }, emphasis: { label: { show: true, formatter: "DESTAQUE={c}" } } });
  withChart(suppressZeroChartLabels(option), (chart) => {
    const data = chart.getModel().getSeriesByIndex(0).getData();
    const zeroText = data.getItemGraphicEl(0)?.getTextContent();
    const positiveText = data.getItemGraphicEl(1)?.getTextContent();
    assert.ok(zeroText, "o ECharts deve criar o texto para permitir checar seu estado");
    assert.ok(zeroText.states.emphasis.ignore || zeroText.states.emphasis.style.text === "", "emphasis do ponto zero permanece vazio");
    assert.equal(positiveText.states.emphasis.style.text, "DESTAQUE=8");
  });
});

test("endLabel possui proteção também quando emphasis define formatter próprio", () => {
  const option = cartesian("line", [4, 0], {
    label: { show: false },
    endLabel: { show: true, formatter: "FINAL={c}" },
    emphasis: { endLabel: { show: true, formatter: "FINAL-DESTAQUE={c}" } },
  });
  withChart(suppressZeroChartLabels(option), (chart) => {
    const series = chart.getModel().getSeriesByIndex(0);
    const view = chart.getViewOfSeriesModel(series);
    assert.ok(view._endLabel, "o renderer real da linha precisa criar o rótulo terminal");
    const emphasis = view._endLabel.states.emphasis;
    assert.ok(emphasis?.ignore || emphasis?.style?.text === "", "emphasis do rótulo terminal zero permanece vazio");
  });
});

test("aplicação repetida é estável e não modifica opções, dados ou formatter original", () => {
  let calls = 0;
  const formatter = ({ value }) => { calls += 1; return `REPETIDO=${value}`; };
  const option = cartesian("bar", [0, 9, -1], { label: { show: true, formatter } });
  freezeRecursively(option);
  const once = suppressZeroChartLabels(option);
  const twice = suppressZeroChartLabels(once);
  const firstSvg = svg(once);
  const firstCalls = calls;
  calls = 0;
  const secondSvg = svg(twice);
  assert.equal(calls, firstCalls, "aplicação repetida não multiplica execução do formatter original");
  assert.doesNotMatch(firstSvg, /REPETIDO=0/);
  assert.doesNotMatch(secondSvg, /REPETIDO=0/);
  assert.match(secondSvg, /REPETIDO=9/);
  assert.match(secondSvg, /REPETIDO=-1/);
  assert.deepEqual(option.series[0].data, [0, 9, -1]);
  assert.equal(option.series[0].label.formatter, formatter);
});

test("sem séries é uma transformação neutra e não fabrica rótulos", () => {
  const option = freezeRecursively({ title: { text: "Visão sem dados" }, xAxis: { data: ["00h"] } });
  assert.deepEqual(suppressZeroChartLabels(option), option);
});

test("formatter ausente continua usando fallback nativo para valores não-zero", () => {
  const option = cartesian("bar", [0, 9], { label: { show: true } });
  const transformed = suppressZeroChartLabels(option);
  const formatter = transformed.series[0].label.formatter;
  assert.equal(formatter({ value: 0 }), "");
  assert.equal(formatter({ value: 9 }), undefined);
  const original = svg(option);
  const rendered = svg(transformed);
  const zeros = (markup) => (markup.match(/>0<\/text>/g) ?? []).length;
  assert.equal(zeros(rendered), zeros(original) - 1, "some apenas o zero do dado, preservando o tick zero do eixo");
  assert.match(rendered, />9<\/text>/);
  assert.equal(transformed.series[0].data, option.series[0].data);
});

test("callback mantém this e argumentos adicionais; somente zero real é suprimido", () => {
  const context = { prefix: "CONTEXTO" };
  const extra = { unit: "pessoas" };
  const formatter = function (params, suffix) {
    assert.equal(this, context);
    assert.equal(suffix, extra);
    return `${this.prefix}:${params.value}:${suffix.unit}`;
  };
  const transformed = suppressZeroChartLabels(cartesian("line", [0, -4], { label: { show: true, formatter } }));
  const wrapped = transformed.series[0].label.formatter;
  assert.equal(wrapped.call(context, { value: 0 }, extra), "");
  assert.equal(wrapped.call(context, { value: -4 }, extra), "CONTEXTO:-4:pessoas");
});

test("zero negativo e strings numéricas zero são ocultos sem apagar frações não-zero", () => {
  const transformed = suppressZeroChartLabels(cartesian("line", [], { label: { show: true, formatter: ({ value }) => `N=${value}` } }));
  const formatter = transformed.series[0].label.formatter;
  for (const value of [0, -0, "0", "0.0", "-0"]) assert.equal(formatter({ value }), "", `zero ${String(value)}`);
  for (const value of [0.001, -0.001, "0.01", "-2"]) assert.equal(formatter({ value }), `N=${value}`);
  for (const value of [null, undefined, false, true, "", " ", "00h", "-", NaN]) {
    assert.equal(formatter({ value }), `N=${value}`, `não-zero/ausente ${String(value)} não é convertido em zero`);
  }
  const rounded = suppressZeroChartLabels(cartesian("line", [], { label: { show: true, formatter: () => "0" } }));
  assert.equal(rounded.series[0].label.formatter({ value: 0.001 }), "0", "não altera o resultado deliberado de um formatter para valor não-zero");
});

test("arrays [x,y] não confundem eixo x zero com medida positiva", () => {
  const option = cartesian("line", [[0, 7], [1, 0], [2, -3]], {
    encode: { x: 0, y: 1, label: 1 },
    label: { show: true, formatter: "XY={@[1]}" },
  }, { xAxis: { type: "value", min: 0, max: 2 } });
  const rendered = svg(suppressZeroChartLabels(option));
  assert.doesNotMatch(rendered, /XY=0/);
  assert.match(rendered, /XY=7/);
  assert.match(rendered, /XY=-3/);
});

test("barras horizontais resolvem a medida no encode x, não na categoria y", () => {
  const option = cartesian("bar", [[0, "00h"], [7, "01h"], [-3, "02h"]], {
    encode: { x: 0, y: 1 }, label: { show: true, position: "right", formatter: "HORIZONTAL={@[0]}" },
  }, { xAxis: { type: "value", min: -10, max: 20 }, yAxis: { type: "category", data: ["00h", "01h", "02h"] } });
  const rendered = svg(suppressZeroChartLabels(option));
  assert.doesNotMatch(rendered, /HORIZONTAL=0/);
  assert.match(rendered, /HORIZONTAL=7/);
  assert.match(rendered, /HORIZONTAL=-3/);
  assert.match(rendered, />00h<\/text>/);
});

for (const layout of ["array", "object"]) {
  test(`dataset ${layout}: encode por dimensão preserva fonte e interpola template nativo`, () => {
    const dataset = layout === "array"
      ? { source: [["hora", "quantidade"], ["00h", 0], ["01h", 7], ["02h", -3]] }
      : { dimensions: ["hora", "quantidade"], source: [{ hora: "00h", quantidade: 0 }, { hora: "01h", quantidade: 7 }, { hora: "02h", quantidade: -3 }] };
    const option = cartesian("bar", undefined, {
      encode: { x: "hora", y: "quantidade" }, label: { show: true, formatter: "DATASET={@quantidade}" },
    }, { dataset, xAxis: { type: "category" } });
    const transformed = suppressZeroChartLabels(option);
    assert.equal(transformed.dataset, dataset);
    const rendered = svg(transformed);
    assert.doesNotMatch(rendered, /DATASET=0/);
    assert.match(rendered, /DATASET=7/);
    assert.match(rendered, /DATASET=-3/);
    assert.match(rendered, />00h<\/text>/);
  });
}

test("estados emphasis, blur e select não ressuscitam zero nem alteram texto positivo", () => {
  const option = cartesian("bar", [0, 5], {
    emphasis: { label: { show: true, formatter: "EMPH={c}" } },
    blur: { label: { show: true, formatter: "BLUR={c}" } },
    select: { label: { show: true, formatter: "SELECT={c}" } },
  });
  const transformed = suppressZeroChartLabels(option);
  withChart(transformed, (chart) => {
    const series = chart.getModel().getSeriesByIndex(0);
    for (const state of ["emphasis", "blur", "select"]) {
      assert.equal(series.getFormattedLabel(0, state), "");
      assert.equal(series.getFormattedLabel(1, state), `${state === "emphasis" ? "EMPH" : state.toUpperCase()}=5`);
    }
  });
});

test("item com label sem formatter herda a formatação da série", () => {
  const option = cartesian("bar", [{ value: 0, label: { show: true } }, { value: 5, label: { color: "#cc00ff" } }], {
    label: { show: true, formatter: "HERDADO={c}" },
  });
  const rendered = svg(suppressZeroChartLabels(option));
  assert.doesNotMatch(rendered, /HERDADO=0/);
  assert.match(rendered, /HERDADO=5/);
});

test("baseOption, media e options recebem a mesma regra sem mutar fontes", () => {
  const embedded = () => cartesian("bar", [0, 5]);
  const option = { baseOption: embedded(), media: [{ query: { maxWidth: 500 }, option: embedded() }], options: [embedded()] };
  const before = structuredClone(option);
  const transformed = suppressZeroChartLabels(freezeRecursively(option));
  for (const nested of [transformed.baseOption, transformed.media[0].option, transformed.options[0]]) {
    assert.equal(nested.series[0].label.formatter({ value: 0 }), "");
    assert.equal(nested.series[0].label.formatter({ value: 5, $vars: ["seriesName", "name", "value"] }), "VALOR=5");
  }
  assert.deepEqual(option, before);
});

test("séries custom preservam renderItem e seus dados para regras próprias de renderização", () => {
  const custom = { type: "custom", data: [[0, 0, 7]], label: { show: true, formatter: "Custom {c}" }, renderItem: () => ({ type: "text", style: { text: "00h" } }) };
  const transformed = suppressZeroChartLabels({ series: [custom] });
  assert.deepEqual(transformed.series[0], custom);
  assert.equal(transformed.series[0].renderItem, custom.renderItem);
});
