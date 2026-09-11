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
const identifiedItems = items.filter(({ key }) => key === "Woman" || key === "Man");
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
  test(`${type}/${orientation}: mostra apenas gêneros identificados, rebasa percentuais e preserva contagens brutas`, () => {
    const before = JSON.stringify(items);
    const option = build(items, settings({ type, orientation }), { dimension: "gender" });
    const data = allData(option);
    assert.deepEqual(data.map((point) => point.key), ["Woman", "Man"]);
    assert.equal(data.reduce((total, point) => total + point.percentage, 0), 100);
    assert.equal(option.aria.enabled, true);
    assert.equal(option.aria.decal.show, false);
    for (const original of identifiedItems) {
      const point = data.find((entry) => entry.key === original.key);
      assert.equal(point.count, original.count);
      assert.equal(point.percentage, 50);
      assert.equal(point.categoryLabel, original.label);
      assert.equal(point.observed, original.observed);
      assert.equal(point.value, type === "bar" || type === "stacked" ? 50 : original.count);
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

test("cores padrão rosa/azul e emojis opcionais preservam a identidade dos gêneros visíveis", () => {
  const colors = ["#DB2777", "#2563EB"];
  for (const emojis of [false, true]) {
    const data = allData(build(items, settings({ type: "pie", emojis }), { dimension: "gender" }));
    assert.equal(data.length, colors.length);
    data.forEach((point, index) => {
      assert.equal(point.itemStyle.color, colors[index]);
      assert.equal(point.categoryLabel, items[index].label);
      assert.ok(point.name.startsWith(items[index].label));
      assert.equal(point.name === items[index].label, !emojis);
      assert.equal(point.count, items[index].count);
      assert.equal(point.percentage, 50);
    });
  }
});

for (const type of ["pie", "donut", "half-donut", "rose"]) {
  test(`${type}: legenda, rótulo e tooltip usam o percentual canônico, não params.percent`, () => {
    const option = build(items, settings({ type }), { dimension: "gender", showLegend: true });
    const datum = option.series[0].data[0];
    const params = { data: datum, name: datum.name, percent: 99.99, value: datum.value };
    assert.equal(option.series[0].label.formatter(params), "50%");
    assert.match(option.tooltip.formatter(params), /Participação entre gêneros identificados: 50%/);
    assert.match(option.tooltip.formatter(params), /Detecções: 1/);
    assert.equal(option.legend.formatter(datum.name), "Mulher", "a legenda identifica a fatia sem repetir o percentual");
    assert.equal(option.legend.selectedMode, false);
    assert.deepEqual(option.legend.data.map((entry) => entry.name), identifiedItems.map((entry) => entry.label));
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
    { key: "happy", label: "Feliz", count: 0, percentage: 0, observed: true },
    { key: "neutral", label: "Neutro", count: 0, percentage: null, observed: false },
  ];
  for (const [type, orientation] of presets) {
    const option = build(source, settings({ type, orientation }, "emotion"), { dimension: "emotion" });
    for (const series of option.series) {
      for (const datum of series.data) {
        const params = { data: datum, value: datum.value, percent: 50 };
        assert.equal(series.label.formatter(params), "");
        assert.match(option.tooltip.formatter(params), datum.observed ? /Participação no total: 0%/ : /Participação no total: —/);
      }
    }
  }
});

test("sem gêneros identificados, a base vazia permanece null e não ganha participação artificial", () => {
  const source = Object.freeze([
    Object.freeze({ key: "Woman", label: "Mulher", count: 0, percentage: 0, observed: true }),
    Object.freeze({ key: "Man", label: "Homem", count: 0, percentage: null, observed: false }),
    Object.freeze({ key: "unknown", label: "Não identificado", count: 8, percentage: 100, observed: true }),
  ]);
  const before = JSON.stringify(source);
  for (const [type, orientation] of presets) {
    const option = build(source, settings({ type, orientation }), { dimension: "gender" });
    assert.deepEqual(allData(option).map((point) => point.key), ["Woman", "Man"]);
    for (const series of option.series) for (const datum of series.data) {
      assert.equal(datum.count, 0);
      assert.equal(datum.percentage, null);
      assert.equal(datum.observed, source.find(({ key }) => key === datum.key).observed);
      const params = { data: datum, value: datum.value, percent: 50 };
      assert.equal(series.label.formatter(params), "");
      assert.match(option.tooltip.formatter(params), /Participação entre gêneros identificados: —/);
      assert.match(option.tooltip.formatter(params), /Detecções: 0/);
    }
  }
  assert.equal(JSON.stringify(source), before);
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
  assert.equal(option.series[0].data.length, identifiedItems.length);
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
    assert.equal(data.count(), identifiedItems.length);
    const svg = chart.renderToSVGString();
    assert.doesNotMatch(svg, /<pattern\b|\bNaN\b|\bInfinity\b/);
    assert.match(svg, /50%/);
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

for (const type of ["stacked"]) {
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

for (const type of ["pie", "donut", "half-donut", "rose"]) {
  test(`${type}: fallback não medido mantém rótulos externos e guias sem herdar ocultação de media`, () => {
    const source = Array.from({ length: 9 }, (_, index) => ({
      key: `age-${index}`, label: `${index * 10}–${index * 10 + 9}`, count: index + 1,
      percentage: Number(((index + 1) * 100 / 45).toFixed(2)), observed: true,
    }));
    const option = build(source, settings({ type }), { dimension: "age", showLegend: true });
    assert.ok(!option.media || !option.media.length, "não pode existir media que oculte percentuais radiais");
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 320 });
    try {
      chart.setOption({ ...option, animation: false });
      for (const size of [{ width: 251, height: 125 }, { width: 674, height: 125 }, { width: 900, height: 320 }]) {
        chart.resize(size);
        const actual = chart.getOption();
        assert.equal(actual.series[0].label.show, true);
        assert.equal(actual.series[0].labelLine.show, true);
        assert.equal(actual.series[0].labelLayout.hideOverlap, false);
        chart.renderToSVGString();
      }
      assert.doesNotMatch(legendText(chart).join("\n"), /%/);
      const positions = assertRadialLabels(chart, allData(option), `${type}: fallback amplo`);
      assert.equal(positions.outside, source.length);
      assert.deepEqual(allData(chart.getOption()).map(semanticDatum), allData(option).map(semanticDatum));
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
      assert.equal(actual.series.length, type === "stacked" ? identifiedItems.length : 1);
      assert.deepEqual(allData(actual).map((datum) => datum.key), identifiedItems.map((datum) => datum.key));
      assert.deepEqual(allData(actual).map((datum) => datum.count), identifiedItems.map((datum) => datum.count));
      if (type !== "stacked") {
        const data = chart.getModel().getSeriesByIndex(0).getData();
        const angle = Array.from({ length: data.count() }, (_, index) => data.getItemLayout(index))
          .reduce((total, layout) => total + Math.abs(layout.endAngle - layout.startAngle), 0);
        assert.ok(Math.abs(angle - (type === "half-donut" ? Math.PI : 2 * Math.PI)) < 0.00001, `${type}: limpar o intervalo do formato anterior`);
        if (type !== "rose") assert.ok(!actual.series[0].roseType, `${type}: não herdar roseType`);
      }
      if (type === "stacked") {
        assert.equal(legendText(chart).filter((text) => text === "50%").length, identifiedItems.length);
      } else {
        assertRadialLabels(chart, allData(option), `${type}: troca de formato`);
      }
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
          assert.deepEqual(allData(adapted).map(semanticDatum), sourceData.map(semanticDatum), `${context}: valores, nomes e cores devem permanecer canônicos`);
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
          if (type === "stacked") {
            for (const datum of sourceData) {
              const percentage = formattedPercentage(datum.percentage);
              assert.ok(text.includes(percentage), `${context}: o percentual ${percentage} precisa estar efetivamente desenhado na legenda`);
            }
          } else {
            assert.doesNotMatch(text, /%/, `${context}: legenda radial identifica categorias sem duplicar percentuais`);
            assertRadialLabels(chart, sourceData, context);
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

for (const type of ["pie", "donut", "half-donut", "rose"]) {
  test(`${type}: percentuais extremos, zero e ausência preservam identidade e rótulos permanentes ao redimensionar`, () => {
    const source = [
      { key: "happy", label: "Feliz", count: 9_998, percentage: 99.98, observed: true },
      { key: "neutral", label: "Neutro", count: 1, percentage: 0.01, observed: true },
      { key: "surprise", label: "Surpresa", count: 1, percentage: 0.01, observed: true },
      { key: "zero", label: "Zero observado", count: 0, percentage: 0, observed: true },
      { key: "missing", label: "Sem informação", count: 0, percentage: null, observed: false },
    ];
    for (const theme of ["light", "dark"]) for (const order of ["ascending", "descending"]) {
      const option = build(source, settings({ type, order, palette: "cyber" }, "emotion"), { dimension: "emotion", theme });
      const snapshot = JSON.stringify(option);
      const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 320 });
      try {
        for (const size of [{ width: 900, height: 320 }, { width: 251, height: 114 }, { width: 900, height: 320 }]) {
          const context = `${type} extremo ${theme}/${order} ${size.width}×${size.height}`;
          const adapted = fitComposition(option, size);
          assert.deepEqual(allData(adapted).map(semanticDatum), allData(option).map(semanticDatum));
          chart.resize(size);
          chart.setOption({ ...adapted, animation: false }, { notMerge: true, lazyUpdate: false });
          chart.renderToSVGString();
          const positions = assertRadialLabels(chart, allData(option), context);
          assert.ok(positions.outside >= 2, `${context}: fatias de0,01% não comportam rótulos internos`);
          if (size.width === 900) assert.ok(positions.inside >= 1, `${context}: a maior fatia deve aproveitar seu espaço interno`);
          for (const datum of allData(adapted)) {
            assert.equal(adapted.tooltip.formatter({ data: datum, percent: 77 }), option.tooltip.formatter({ data: datum, percent: 77 }));
          }
        }
      } finally { chart.dispose(); }
      assert.equal(JSON.stringify(option), snapshot);
    }
  });
}

function semanticDatum(datum) {
  return {
    categoryLabel: datum.categoryLabel,
    count: datum.count,
    color: datum.itemStyle.color,
    key: datum.key,
    name: datum.name,
    observed: datum.observed,
    percentage: datum.percentage,
    value: datum.value,
  };
}

test("todas as paletas mantêm contraste dos percentuais internos sem trocar as cores das categorias", () => {
  for (const { id: palette } of DEMOGRAPHICS_PALETTES) for (const theme of ["light", "dark"]) {
    for (const type of ["pie", "donut", "half-donut", "rose"]) {
      const option = build(items, settings({ type, palette }), { dimension: "gender", theme });
      const size = { width: 900, height: 320 };
      const adapted = fitComposition(option, size);
      const chart = echarts.init(null, null, { renderer: "svg", ssr: true, ...size });
      try {
        chart.setOption({ ...adapted, animation: false }, { notMerge: true, lazyUpdate: false });
        chart.renderToSVGString();
        const positions = assertRadialLabels(chart, allData(option), `${type}/${palette}/${theme}`);
        assert.equal(positions.inside, identifiedItems.length, "fatias amplas devem usar percentuais internos legíveis");
        assert.deepEqual(allData(adapted).map((datum) => datum.itemStyle.color), allData(option).map((datum) => datum.itemStyle.color));
      } finally { chart.dispose(); }
    }
  }
});

function formattedPercentage(value) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function assertRadialLabels(chart, sourceData, context) {
  const series = chart.getModel().getSeriesByIndex(0);
  const data = series.getData();
  const legendModel = chart.getModel().getComponent("legend");
  const legendBounds = legendModel.get("show") ? globalBounds(chart.getViewOfComponentModel(legendModel).getContentGroup()) : null;
  const positions = { inside: 0, outside: 0 };
  const outsideBounds = [];
  const labelLayout = series.get("labelLayout");
  if (typeof labelLayout !== "function") assert.equal(labelLayout.hideOverlap, false, `${context}: sobreposição não pode ocultar percentuais`);
  for (let index = 0; index < data.count(); index++) {
    const datum = data.getRawDataItem(index);
    const expected = sourceData.find((candidate) => candidate.key === datum.key);
    assert.ok(expected, `${context}: categoria inesperada ${datum.key}`);
    const graphic = data.getItemGraphicEl(index);
    const label = graphic?.getTextContent();
    const spans = label?.childrenRef().filter((span) => span.type === "tspan" && !span.ignore && !span.invisible) ?? [];
    const positive = typeof expected.percentage === "number" && expected.percentage > 0;
    if (!positive) {
      assert.ok(!label || label.ignore || !spans.some((span) => span.style?.text), `${context}: zero/ausência não podem pintar percentual`);
      continue;
    }
    assert.ok(label && !label.ignore && !label.invisible, `${context}: percentual de ${datum.name} precisa estar visível sem hover`);
    assert.equal(spans.map((span) => span.style?.text ?? "").join(""), formattedPercentage(expected.percentage), `${context}: valor canônico precisa estar associado à fatia ${datum.name}`);
    // ECharts may retain an unpainted background rect from the original
    // outside-label width; inspect the actual glyphs after labelLayout moves.
    const bounds = globalBounds(spans[0]);
    for (const span of spans.slice(1)) bounds.union(globalBounds(span));
    if (typeof labelLayout === "function") {
      const layoutResult = labelLayout({ dataIndex: index, seriesIndex: 0, text: label.style.text, rect: globalBounds(graphic), labelRect: bounds });
      assert.equal(layoutResult.hideOverlap, false, `${context}: callback não pode ocultar percentuais`);
    }
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= chart.getWidth() + 1, `${context}: percentual de ${datum.name} sai da largura`);
    assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= chart.getHeight() + 1, `${context}: percentual de ${datum.name} sai da altura`);
    if (legendBounds) assert.ok(!rectanglesOverlap(bounds, legendBounds), `${context}: percentual de ${datum.name} sobrepõe a legenda`);
    const position = data.getItemModel(index).get(["label", "position"]);
    const guide = graphic.getTextGuideLine();
    if (position === "inside" || position === "inner") {
      positions.inside++;
      assert.ok(!guide || guide.ignore, `${context}: percentual interno não usa linha-guia`);
      assert.ok(contrast(spans[0].style.fill, graphic.style.fill) >= 4.5, `${context}: contraste interno insuficiente para ${datum.name}`);
      assertTextInsideSector(bounds, data.getItemLayout(index), `${context}: ${datum.name}`);
    } else {
      positions.outside++;
      assert.ok(position === "outside" || position === "outer", `${context}: posição externa explícita`);
      assert.ok(guide && !guide.ignore && !guide.invisible, `${context}: percentual externo de ${datum.name} precisa de linha-guia visível`);
      assert.ok(guide.shape.points.length >= 2 && guide.shape.points.every((point) => point.every(Number.isFinite)), `${context}: linha-guia deve possuir coordenadas válidas`);
      assert.ok(guide.shape.points.some((point, pointIndex, points) => pointIndex > 0 && Math.hypot(point[0] - points[pointIndex - 1][0], point[1] - points[pointIndex - 1][1]) > 1), `${context}: linha-guia não pode ser degenerada`);
      for (const other of outsideBounds) assert.ok(!rectanglesOverlap(bounds, other), `${context}: percentuais externos sobrepostos`);
      outsideBounds.push(bounds);
    }
  }
  return positions;
}

function assertTextInsideSector(bounds, layout, context) {
  const { cx, cy, r, r0, startAngle, endAngle } = layout;
  const midAngle = (startAngle + endAngle) / 2;
  const halfAngle = Math.abs(endAngle - startAngle) / 2;
  const corners = [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height],
  ];
  for (const [x, y] of corners) {
    assert.ok(Math.hypot(x - cx, y - cy) <= r + 0.25, `${context}: canto do texto ultrapassa o raio externo`);
    const delta = Math.atan2(Math.sin(Math.atan2(y - cy, x - cx) - midAngle), Math.cos(Math.atan2(y - cy, x - cx) - midAngle));
    assert.ok(Math.abs(delta) <= halfAngle + 0.00001, `${context}: canto do texto invade uma fatia vizinha`);
  }
  const nearestX = Math.max(bounds.x, Math.min(cx, bounds.x + bounds.width));
  const nearestY = Math.max(bounds.y, Math.min(cy, bounds.y + bounds.height));
  assert.ok(Math.hypot(nearestX - cx, nearestY - cy) >= r0 - 0.25, `${context}: retângulo do texto invade o centro vazio da rosca`);
}

function contrast(foreground, background) {
  const luminances = [foreground, background].map((color) => {
    const channels = echarts.color.parse(color).slice(0, 3).map((channel) => {
      const srgb = channel / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  });
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
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
