import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const echarts = require("echarts");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const { buildDemographicDistributionOption: build, fitDemographicCompositionOption: fitComposition } = load("lib/demographics-chart-options.ts");
const { defaultDemographicPresentation, DEMOGRAPHICS_PALETTES } = load("lib/demographics-presentation.ts");

const items = Object.freeze([
  Object.freeze({ key: "Woman", label: "Mulher", count: 1, percentage: 33.34, observed: true }),
  Object.freeze({ key: "Man", label: "Homem", count: 1, percentage: 33.33, observed: true }),
  Object.freeze({ key: "unknown", label: "Não identificado", count: 1, percentage: 33.33, observed: true }),
]);
const presets = [
  ["bar", "horizontal"], ["bar", "vertical"],
  ["stacked", "horizontal"], ["stacked", "vertical"],
  ["pie", "horizontal"], ["donut", "horizontal"],
  ["half-donut", "horizontal"], ["rose", "horizontal"],
];

function settings(overrides = {}, dimension = "gender") {
  return { ...defaultDemographicPresentation(dimension), ...overrides };
}

function allData(option) {
  return option.series.flatMap((series) => series.data);
}

for (const [type, orientation] of presets) {
  test(`${type}/${orientation}: mantém contagens, percentuais e categorias sem mutar a origem`, () => {
    const before = JSON.stringify(items);
    const option = build(items, settings({ type, orientation }), { dimension: "gender" });
    const data = allData(option);
    assert.equal(data.length, items.length);
    assert.equal(option.aria.enabled, true);
    assert.equal(option.aria.decal.show, false);
    for (const original of items) {
      const point = data.find((entry) => entry.key === original.key);
      assert.equal(point.count, original.count);
      assert.equal(point.percentage, original.percentage);
      assert.equal(point.categoryLabel, original.label);
      assert.equal(point.observed, original.observed);
      assert.equal(point.value, type === "bar" || type === "stacked" ? original.percentage : original.count);
      assert.equal(typeof point.itemStyle.color, "string");
    }
    assert.equal(JSON.stringify(items), before);
  });
}

test("ordenação é estável e não troca categoria, cor, rótulo ou percentual", () => {
  const source = [
    { key: "first", label: "Primeira", count: 20, percentage: 40, observed: true },
    { key: "second", label: "Segunda", count: 10, percentage: 20, observed: true },
    { key: "third", label: "Terceira", count: 20, percentage: 40, observed: true },
    { key: "zero", label: "Zero", count: 0, percentage: 0, observed: false },
  ];
  const original = structuredClone(source);
  for (const palette of DEMOGRAPHICS_PALETTES) {
    const natural = allData(build(source, settings({ type: "bar", palette: palette.id }), { dimension: "age" }));
    for (const [order, expected] of [
      ["default", ["first", "second", "third", "zero"]],
      ["ascending", ["zero", "second", "first", "third"]],
      ["descending", ["first", "third", "second", "zero"]],
    ]) {
      const sorted = allData(build(source, settings({ type: "bar", order, palette: palette.id }), { dimension: "age" }));
      assert.deepEqual(sorted.map((entry) => entry.key), expected);
      for (const point of sorted) {
        assert.deepEqual(point, natural.find((entry) => entry.key === point.key));
      }
    }
  }
  assert.deepEqual(source, original);
});

test("cores padrão rosa/azul/neutro e emojis opcionais preservam a identidade", () => {
  const colors = ["#DB2777", "#2563EB", "#8A99AF"];
  for (const emojis of [false, true]) {
    const data = allData(build(items, settings({ type: "pie", emojis }), { dimension: "gender" }));
    data.forEach((point, index) => {
      assert.equal(point.itemStyle.color, colors[index]);
      assert.equal(point.categoryLabel, items[index].label);
      assert.ok(point.name.startsWith(items[index].label));
      assert.equal(point.name === items[index].label, !emojis);
      assert.equal(point.count, items[index].count);
      assert.equal(point.percentage, items[index].percentage);
    });
  }
});

for (const type of ["pie", "donut", "half-donut", "rose"]) {
  test(`${type}: legenda, rótulo e tooltip usam o percentual canônico, não params.percent`, () => {
    const option = build(items, settings({ type }), { dimension: "gender", showLegend: true });
    const datum = option.series[0].data[0];
    const params = { data: datum, name: datum.name, percent: 99.99, value: datum.value };
    assert.equal(option.series[0].label.formatter(params), "33,34%");
    assert.match(option.tooltip.formatter(params), /Participação no total: 33,34%/);
    assert.match(option.tooltip.formatter(params), /Detecções: 1/);
    assert.equal(option.legend.formatter(datum.name), "Mulher · 33,34%");
    assert.equal(option.legend.selectedMode, false);
    assert.deepEqual(option.legend.data.map((entry) => entry.name), items.map((entry) => entry.label));
    assert.equal(option.series[0].showEmptyCircle, false);
    assert.equal(option.series[0].stillShowZeroSum, false);
  });
}

test("tooltip escapa categoria e não perde percentual ou contagem após sort", () => {
  const source = [
    { key: "small", label: "Menor", count: 1, percentage: 0.01, observed: true },
    { key: "unsafe", label: '<img src=x onerror="bad()"> & \'categoria\'', count: 9_999, percentage: 99.99, observed: true },
  ];
  const option = build(source, settings({ type: "bar", order: "descending" }), { dimension: "emotion" });
  const datum = option.series[0].data[0];
  const text = option.tooltip.formatter([{ data: datum, value: datum.value }]);
  assert.doesNotMatch(text, /<img/);
  assert.match(text, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; &#039;categoria&#039;/);
  assert.match(text, /99,99%/);
  assert.match(text, /9\.999/);
  assert.equal(option.series[0].label.formatter({ data: option.series[0].data[1] }), "0,01%");
});

test("zeros ficam sem rótulo, mas ausência e zero permanecem distintos no tooltip", () => {
  const source = [
    { key: "Woman", label: "Mulher", count: 0, percentage: 0, observed: true },
    { key: "Man", label: "Homem", count: 0, percentage: null, observed: false },
  ];
  for (const [type, orientation] of presets) {
    const option = build(source, settings({ type, orientation }), { dimension: "gender" });
    for (const series of option.series) {
      for (const datum of series.data) {
        const params = { data: datum, value: datum.value, percent: 50 };
        assert.equal(series.label.formatter(params), "");
        assert.match(option.tooltip.formatter(params), datum.observed ? /Participação no total: 0%/ : /Participação no total: —/);
      }
    }
  }
});

test("barras usam eixos coerentes, escala adaptativa explícita e ordem canônica", () => {
  const source = [
    { key: "0-2", label: "0–2", count: 1, percentage: 12.5, observed: true },
    { key: "3-9", label: "3–9", count: 7, percentage: 87.5, observed: true },
  ];
  for (const orientation of ["horizontal", "vertical"]) {
    const option = build(source, settings({ type: "bar", orientation }), { dimension: "age" });
    const categoryAxis = orientation === "horizontal" ? option.yAxis : option.xAxis;
    const valueAxis = orientation === "horizontal" ? option.xAxis : option.yAxis;
    assert.deepEqual(categoryAxis.data, ["0–2", "3–9"]);
    assert.equal(categoryAxis.axisLabel.interval, 0);
    assert.equal(valueAxis.min, 0);
    assert.equal(valueAxis.max, 100);
    assert.equal(valueAxis.axisLabel.formatter, "{value}%");
  }
  const smaller = build([source[0]], settings({ type: "bar" }), { dimension: "age" });
  assert.equal(smaller.xAxis.max, 20);
  const empty = build([], settings({ type: "bar" }), { dimension: "age" });
  assert.equal(empty.xAxis.max, 10);
});

test("meia-rosca real ocupa apenas π radianos, sem categoria ou detecção artificial", () => {
  const option = build(items, settings({ type: "half-donut" }), { dimension: "gender" });
  assert.equal(option.series.length, 1);
  assert.equal(option.series[0].startAngle, 180);
  assert.equal(option.series[0].endAngle, 0);
  assert.equal(option.series[0].data.length, items.length);
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 600, height: 320 });
  try {
    chart.setOption({ ...option, animation: false });
    const data = chart.getModel().getSeriesByIndex(0).getData();
    let angle = 0;
    for (let index = 0; index < data.count(); index += 1) {
      const layout = data.getItemLayout(index);
      angle += Math.abs(layout.endAngle - layout.startAngle);
    }
    assert.ok(Math.abs(angle - Math.PI) < 0.00001, `ângulo observado ${angle}`);
    assert.equal(data.count(), items.length);
    const svg = chart.renderToSVGString();
    assert.doesNotMatch(svg, /<pattern\b|\bNaN\b|\bInfinity\b/);
    assert.match(svg, /33,34%/);
  } finally { chart.dispose(); }
});

test("tema e legenda alteram apenas a apresentação, sem filtrar fatias ou recalcular valores", () => {
  for (const [type, orientation] of presets) {
    const light = build(items, settings({ type, orientation }), { dimension: "gender", theme: "light", showLegend: true });
    const dark = build(items, settings({ type, orientation }), { dimension: "gender", theme: "dark", showLegend: false });
    assert.deepEqual(allData(dark), allData(light));
    assert.equal(dark.textStyle.color, "#CBD5E1");
    assert.equal(light.textStyle.color, "#526477");
    assert.equal(dark.legend.show, false);
  }
});

for (const type of ["pie", "donut", "half-donut", "rose", "stacked"]) {
  test(`${type}: compacto mantém nove percentuais legíveis na legenda e restaura o layout ao ampliar`, () => {
    const source = Array.from({ length: 9 }, (_, index) => ({
      key: `age-${index}`,
      label: `${index * 10}–${index * 10 + 9}`,
      count: index + 1,
      percentage: Number(((index + 1) * 100 / 45).toFixed(2)),
      observed: true,
    }));
    const option = build(source, settings({ type }), { dimension: "age", showLegend: true });
    assert.ok(option.media.some((entry) => entry.query?.maxWidth === 400));
    assert.ok(option.media.some((entry) => entry.query?.maxHeight === 160));
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 320 });
    try {
      chart.setOption({ ...option, animation: false });
      for (const [width, height] of [[251, 125], [674, 125], [251, 125]]) {
        chart.resize({ width, height });
        const actual = chart.getOption();
        const legend = actual.legend[0];
        assert.equal(legend.show, true);
        assert.equal(legend.textStyle.fontSize, 10);
        assert.ok(actual.series.every((series) => series.label.show === false));
        for (const original of source) {
          const expectedPercentage = `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(original.percentage)}%`;
          assert.ok(legend.formatter(original.label).includes(expectedPercentage));
          assert.ok(chart.renderToSVGString().includes(expectedPercentage));
        }
        for (const node of chart.getZr().storage.getDisplayList().filter((item) => item.type === "tspan")) {
          const rect = node.getBoundingRect().clone();
          rect.applyTransform(node.getComputedTransform());
          assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1, `texto cortado horizontalmente em ${width}: ${node.style.text}`);
          assert.ok(rect.y >= -1 && rect.y + rect.height <= height + 1, `texto cortado verticalmente em ${height}: ${node.style.text}`);
        }
        assert.doesNotMatch(chart.renderToSVGString(), /<pattern\b|\bNaN\b|\bInfinity\b/);
      }
      chart.resize({ width: 900, height: 320 });
      const enlarged = chart.getOption();
      assert.ok(enlarged.series.every((series) => series.label.show === true));
      assert.equal(enlarged.legend[0].textStyle.fontSize, 11);
      assert.ok(enlarged.legend[0].top === null || enlarged.legend[0].top === "auto");
      assert.equal(enlarged.legend[0].bottom, 0);
      assert.notEqual(enlarged.legend[0].textStyle.width, 62, "ampliar deve limpar a largura de texto residual da legenda compacta");
      if (type !== "stacked") assert.ok(enlarged.series.every((series) => series.labelLine.show === true), "linhas de referência da pizza devem reaparecer ao ampliar");
      assert.ok(enlarged.series.every((series) => series.emphasis.label.show === true), "o estado de destaque não pode manter o label oculto do compacto");
      const paintedLegend = legendText(chart).join("\n");
      for (const original of source) {
        const percentage = `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(original.percentage)}%`;
        assert.ok(paintedLegend.includes(percentage), `percentual ${percentage} não pode estar apenas no formatter e cortado no texto desenhado`);
      }
      assert.deepEqual(allData(enlarged).map((datum) => datum.count), source.map((datum) => datum.count));
    } finally { chart.dispose(); }
  });
}

function legendText(chart) {
  const model = chart.getModel().getComponent("legend");
  const view = chart.getViewOfComponentModel(model);
  const values = [];
  view.group.traverse((element) => {
    if (element.type !== "text" || element.ignore || element.invisible) return;
    for (const span of element.childrenRef?.() ?? [element]) {
      if (span.style?.text && !span.ignore && !span.invisible) values.push(span.style.text);
    }
  });
  return values;
}

test("ajuste de composições não interfere nas barras simples ou recalcula os dados", () => {
  for (const orientation of ["horizontal", "vertical"]) {
    const option = build(items, settings({ type: "bar", orientation }), { dimension: "gender" });
    assert.equal(fitComposition(option, { width: 200, height: 125 }), option);
  }
});

test("trocar de formato na mesma instância não conserva meia circunferência, roseType ou séries antigas", () => {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 251, height: 125 });
  try {
    for (const type of ["half-donut", "pie", "rose", "donut", "stacked", "pie", "half-donut"]) {
      const option = build(items, settings({ type, emojis: true, palette: "cyber" }), { dimension: "gender", showLegend: true });
      const adapted = fitComposition(option, { width: 251, height: 125 });
      chart.setOption({ ...adapted, animation: false }, { notMerge: true, lazyUpdate: false });
      chart.renderToSVGString();
      const actual = chart.getOption();
      assert.equal(actual.series.length, type === "stacked" ? items.length : 1);
      assert.deepEqual(allData(actual).map((datum) => datum.key), items.map((datum) => datum.key));
      assert.deepEqual(allData(actual).map((datum) => datum.count), items.map((datum) => datum.count));
      if (type !== "stacked") {
        const data = chart.getModel().getSeriesByIndex(0).getData();
        const angle = Array.from({ length: data.count() }, (_, index) => data.getItemLayout(index))
          .reduce((total, layout) => total + Math.abs(layout.endAngle - layout.startAngle), 0);
        assert.ok(Math.abs(angle - (type === "half-donut" ? Math.PI : 2 * Math.PI)) < 0.00001, `${type}: limpar o intervalo do formato anterior`);
        if (type !== "rose") assert.ok(!actual.series[0].roseType, `${type}: não herdar roseType`);
      }
      for (const percentage of ["33,34%", "33,33%"]) assert.ok(legendText(chart).includes(percentage));
    }
  } finally { chart.dispose(); }
});

const compositionSources = {
  gender: items,
  age: ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"].map((key, index) => ({
    key, label: key, count: index + 1, percentage: Number(((index + 1) * 100 / 45).toFixed(2)), observed: true,
  })),
  emotion: [
    ["neutral", "Neutro"], ["happy", "Feliz"], ["surprise", "Surpresa"], ["sad", "Triste"],
    ["angry", "Raiva"], ["disgust", "Nojo"], ["fear", "Medo"], ["contempt", "Desprezo"],
  ].map(([key, label], index) => ({ key, label, count: index + 1, percentage: Number(((index + 1) * 100 / 36).toFixed(2)), observed: true })),
};
const compositionSizes = [
  { width: 900, height: 320 }, { width: 200, height: 125 }, { width: 224, height: 125 },
  { width: 200, height: 114 }, { width: 251, height: 114 }, { width: 251, height: 330 },
  { width: 251, height: 125 }, { width: 674, height: 125 }, { width: 440, height: 320 }, { width: 900, height: 320 },
];

for (const [type, orientation] of presets.filter(([type]) => type !== "bar")) {
  test(`${type}/${orientation}: layout medido mantém índices e formas separados em diferentes tamanhos`, () => {
    for (const [dimension, source] of Object.entries(compositionSources)) for (const theme of ["light", "dark"]) {
      const option = build(source, settings({ type, orientation, emojis: true, palette: theme === "dark" ? "cyber" : "pink-blue", order: "descending" }, dimension), { dimension, theme, showLegend: true });
      const before = JSON.stringify(option);
      const sourceData = structuredClone(allData(option));
      const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 320 });
      try {
        for (const size of compositionSizes) {
          const context = `${type}/${orientation} ${dimension} ${theme} ${size.width}×${size.height}`;
          const adapted = fitComposition(option, size);
          assert.deepEqual(allData(adapted), sourceData, `${context}: valores, nomes e cores devem permanecer canônicos`);
          assert.equal(adapted.tooltip, option.tooltip, `${context}: tooltip mantém valores e nomes completos`);
          assert.ok(!adapted.media || adapted.media.length === 0, `${context}: layout calculado não pode depender de media residual`);
          chart.resize(size);
          chart.setOption({ ...adapted, animation: false }, { notMerge: true, lazyUpdate: false });
          // Flush the SVG display list after replacing the option; resize may
          // otherwise leave the previous frame's text nodes in the cache.
          const svg = chart.renderToSVGString();
          const actual = chart.getOption();
          const names = sourceData.map((datum) => datum.name);
          assert.deepEqual(actual.legend[0].data.map((datum) => typeof datum === "string" ? datum : datum.name).filter(Boolean), names, `${context}: ordem da legenda deve seguir dados`);
          const text = legendText(chart).join("\n");
          for (const datum of sourceData) {
            const percentage = `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(datum.percentage)}%`;
            assert.ok(text.includes(percentage), `${context}: o percentual ${percentage} precisa estar efetivamente desenhado na legenda`);
          }
          for (const element of chart.getZr().storage.getDisplayList().filter((item) => item.type === "tspan" && !item.ignore && !item.invisible)) {
            const bounds = globalBounds(element);
            assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= size.width + 1, `${context}: texto '${element.style.text}' fora da largura`);
            assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= size.height + 1, `${context}: texto '${element.style.text}' fora da altura [${bounds.y}, ${bounds.y + bounds.height}]`);
            const fontSize = Number.parseFloat(element.style.fontSize ?? /([\d.]+)px/.exec(element.style.font ?? "")?.[1] ?? "0");
            assert.ok(fontSize >= 9, `${context}: não reduzir a fonte abaixo de9px`);
          }
          const legend = chart.getModel().getComponent("legend");
          const legendView = chart.getViewOfComponentModel(legend);
          const legendBounds = globalBounds(legendView.getContentGroup());
          const actualSeries = chart.getModel().getSeries();
          if (type !== "stacked" && size.width >= 251) {
            const data = actualSeries[0].getData();
            const diameter = Math.max(...Array.from({ length: data.count() }, (_, index) => 2 * data.getItemLayout(index).r));
            assert.ok(diameter >= 48, `${context}: diâmetro ${diameter}px não pode tornar o gráfico uma miniatura ilegível`);
          }
          for (const series of actualSeries) {
            const data = series.getData();
            for (let index = 0; index < data.count(); index++) {
              const datum = data.getRawDataItem(index);
              if (!(datum.value > 0)) continue;
              const shape = data.getItemGraphicEl(index);
              assert.ok(shape, `${context}: preservar a forma correspondente a ${datum.name}`);
              const bounds = globalBounds(shape);
              assert.ok(bounds.width > 0 && bounds.height > 0, `${context}: gráfico não pode desaparecer por falta de espaço`);
              assert.ok(!rectanglesOverlap(bounds, legendBounds), `${context}: forma de ${datum.name} colide com a legenda`);
            }
          }
          for (const group of legendView.getContentGroup().childrenRef()) {
            const legendIndex = group.__legendDataIndex;
            if (!Number.isInteger(legendIndex)) continue;
            const name = legend.getData()[legendIndex].get("name");
            const expected = sourceData.find((datum) => datum.name === name);
            assert.ok(expected, `${context}: legenda inesperada ${name}`);
            const icon = group.childrenRef().find((element) => element.type !== "text" && element.style?.fill && !element.ignore && !element.invisible && element.style.opacity !== 0);
            assert.ok(icon, `${context}: índice ${name} precisa de marcador`);
            assert.deepEqual(echarts.color.parse(icon.style.fill), echarts.color.parse(expected.itemStyle.color), `${context}: marcador e dados devem ter a mesma cor`);
          }
          assert.doesNotMatch(svg, /<pattern\b|NaN|undefined/);
        }
      } finally { chart.dispose(); }
      assert.equal(JSON.stringify(option), before, "a apresentação original/exportação não pode ser modificada pelo resize");
    }
  });
}

function globalBounds(element) {
  const bounds = element.getBoundingRect().clone();
  bounds.applyTransform(element.getComputedTransform());
  return bounds;
}

function rectanglesOverlap(left, right) {
  return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 1 &&
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 1;
}

function load(path) {
  if (modules.has(path)) return modules.get(path);
  const loaded = { exports: {} };
  const javascript = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports, (name) =>
    name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
  );
  modules.set(path, loaded.exports);
  return loaded.exports;
}
