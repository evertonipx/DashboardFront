import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const echarts = require("echarts");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const palette = load("lib/chart-palette.ts");
const { OCCUPANCY_COLOR_PALETTES } = load("lib/occupancy-color-palettes.ts");
const occupancy = load("lib/occupancy-heatmap-visual.ts");
const duration = load("lib/occupancy-duration-insights.ts");
const durationCharts = load("components/app/occupancy-duration-insights-widgets.tsx");
const counting = load("lib/counting-intelligence.ts");
const colors = [...new Set([
  "#1267C4", "#ffffff", "#000000", "#FFFF00", "#00FF00",
  ...palette.PASTEL_BAR_COLORS,
  ...OCCUPANCY_COLOR_PALETTES.flatMap((entry) => entry.colors),
])];

test("todas as paletas, inclusive pastel e Cyber, vão de branco a escuro nos dois temas", () => {
  for (const color of colors) {
    const light = palette.monochromeHeatmapPalette(color, "light");
    const dark = palette.monochromeHeatmapPalette(color, "dark");
    assert.deepEqual(dark, light, `${color}: trocar o tema não deve inverter a intensidade`);
    assertWhiteToDark(light, color);
  }
});

test("somente a cor das células recebe a suavização de 78%, composta em HEX opaco", () => {
  for (const color of colors) {
    const previous = originalHeatmapStops(color);
    const softened = palette.monochromeHeatmapPalette(color);
    const expected = previous.map((stop) => stop.map((channel) => Math.round(255 + (channel - 255) * 0.78)));
    softened.forEach((stop, index) => {
      const actual = echarts.color.parse(stop);
      assert.deepEqual(actual.slice(0, 3), expected[index], `${color}: parada ${index}`);
      assert.equal(actual[3], 1, "a suavização não depende da superfície abaixo nem torna a célula transparente");
      assert.ok(luminance(stop) >= luminance(`rgb(${previous[index].join(",")})`), `${color}: a célula não deve escurecer`);
    });
    assert.equal(softened[0].toLowerCase(), "#ffffff", "zero observado permanece branco puro");
  }
});

test("cores inválidas preservam a escala branca-escura de fallback, sem NaN", () => {
  for (const color of ["", "invalid", "#12345G", "#12", "transparent", "var(--color)"]) {
    for (const theme of ["light", "dark"]) {
      const result = palette.monochromeHeatmapPalette(color, theme);
      assert.deepEqual(result, palette.monochromeHeatmapPalette("#1267C4", theme));
      assertWhiteToDark(result, `${color} ${theme}`);
    }
  }
});

test("a cor dos números maximiza contraste com a interpolação real, inclusive neon claro", () => {
  for (const color of colors) {
    const scale = palette.monochromeHeatmapPalette(color, "dark");
    for (let index = 0; index <= 100; index++) {
      const ratio = index / 100;
      const background = echarts.color.lerp(ratio, scale);
      const actual = palette.heatmapLabelColor(scale, ratio);
      const whiteContrast = contrast("#FFFFFF", background);
      const darkContrast = contrast("#0F172A", background);
      assert.equal(actual, whiteContrast >= darkContrast ? "#FFFFFF" : "#0F172A", `${color} ${ratio}`);
      assert.ok(contrast(actual, background) >= 4, `${color} ${ratio}: números não podem desaparecer`);
    }
    assert.equal(palette.heatmapLabelColor(scale, 0), "#0F172A");
  }
});

for (const theme of ["light", "dark"]) {
  test(`ocupação compara valores com menor branco e maior escuro no primeiro frame (${theme})`, () => {
    const scale = palette.monochromeHeatmapPalette("#1267C4", theme);
    const option = {
      animation: false,
      xAxis: { type: "category", data: ["00h", "01h", "02h"] },
      yAxis: { type: "category", data: ["Entrada"] },
      visualMap: occupancy.buildOccupancyHeatmapVisualMaps("#1267C4", 100, theme),
      series: [
        { type: "heatmap", data: [[2, 0, -1]] },
        { type: "heatmap", data: [[0, 0, 0], [1, 0, 100]] },
      ],
    };
    withChart(option, (chart) => {
      assertRgbEqual(fill(chart, 1, 0), "#FFFFFF");
      assertRgbEqual(fill(chart, 1, 1), scale.at(-1));
      assert.notDeepEqual(echarts.color.parse(fill(chart, 0, 0)), echarts.color.parse("#FFFFFF"), "sem dados não equivale a zero confirmado");
    });
  });

  test(`os três mapas de tempo ocupado compartilham a mesma escala sem inverter no ${theme}`, () => {
    const month = duration.buildOccupancyDurationInsightMonth(new Date("2026-09-02T06:00:00Z"), "America/Sao_Paulo");
    const series = [{
      scenarioId: "entry", name: "Entrada",
      hours: [
        { dateKey: "2026-09-01", hour: 0, confirmedOccupiedSeconds: 0, confirmedFreeSeconds: 3600, transitionSeconds: 0, unknownSeconds: 0, expectedSeconds: 3600 },
        { dateKey: "2026-09-01", hour: 1, confirmedOccupiedSeconds: 3600, confirmedFreeSeconds: 0, transitionSeconds: 0, unknownSeconds: 0, expectedSeconds: 3600 },
      ],
    }];
    const model = duration.buildOccupancyDurationInsightModel(series, month);
    for (const kind of durationCharts.OCCUPANCY_DURATION_INSIGHT_CARD_IDS.filter((id) => id.endsWith("heatmap"))) {
      const option = durationCharts.buildOccupancyDurationInsightOption({ kind, model, month, scenarioNames: ["Entrada"], theme, widgetColor: "#00E5FF" });
      assert.deepEqual(option.visualMap[0].inRange.color, palette.monochromeHeatmapPalette("#00E5FF", theme));
      withChart(option, (chart) => {
        const values = option.series[0].data;
        const zeroIndex = values.findIndex((point) => point.value[2] === 0);
        assert.ok(zeroIndex >= 0, `${kind}: deve haver zero certificado`);
        assertRgbEqual(fill(chart, 0, zeroIndex), "#FFFFFF");
        const positiveIndex = values.findIndex((point) => point.value[2] > 0);
        assert.ok(positiveIndex >= 0);
        assert.ok(luminance(fill(chart, 0, positiveIndex)) < luminance(fill(chart, 0, zeroIndex)));
      });
      const exported = durationCharts.buildOccupancyDurationInsightReport({ kind, month, series, widgetColor: "#00E5FF" });
      assert.deepEqual(exported.option.visualMap[0].inRange.color, option.visualMap[0].inRange.color, "exportar não deve alterar a leitura de intensidade");
    }
  });

  test(`mapas de relatórios mantêm escala e números legíveis em células claras/escuras (${theme})`, () => {
    const totals = Array.from({ length: 11 }, (_, index) => index * 10);
    const model = {
      yearRows: [{ year: 2026, months: [...totals, null] }],
      dayMonthHeatmapCells: [...totals.map((total, index) => ({ total, date: new Date(2026, 0, index + 1), day: index + 1, month: 0 })), { total: null, date: null, day: 12, month: 0 }],
      dayMonthHeatmapYear: 2026,
    };
    for (const color of ["#1267C4", "#C6FF00", "#FDE68A"]) {
      for (const builder of [counting.buildCountingDayMonthHeatmapChartOption, counting.buildCountingMonthYearHeatmapChartOption]) {
        const option = builder(model, color, theme);
        assert.deepEqual(option.visualMap[1].inRange.color, palette.monochromeHeatmapPalette(color, theme));
        withChart(option, (chart) => {
          assertRgbEqual(fill(chart, 1, 0), "#FFFFFF");
          assertRgbEqual(fill(chart, 1, totals.length - 1), palette.monochromeHeatmapPalette(color, theme).at(-1));
          if (builder === counting.buildCountingMonthYearHeatmapChartOption) {
            const data = chart.getModel().getSeriesByIndex(1).getData();
            totals.forEach((value, index) => {
              const label = data.getItemGraphicEl(index).getTextContent();
              const token = /^\{([^|]+)\|/.exec(label.style.text)?.[1];
              assert.ok(token, `o valor ${value} deve estar renderizado sem hover`);
              const textColor = label.style.rich[token].fill;
              assertRgbEqual(textColor, palette.heatmapLabelColor(option.visualMap[1].inRange.color, value / 100));
              assert.ok(contrast(textColor, fill(chart, 1, index)) >= 4, `${color} ${theme} ${value}: contraste da legenda real`);
            });
          }
        });
      }
    }
  });
}

test("Demographics aplica a escala comum e escolhe rótulos pelo fundo real", () => {
  const filename = "components/app/demographics-dashboard.tsx";
  const source = readFileSync(resolve(projectRoot, filename), "utf8");
  assert.match(source, /HEATMAP_COLORS\s*=\s*monochromeHeatmapPalette\(HEATMAP_BASE_COLOR\)/);
  const scale = palette.monochromeHeatmapPalette("#2563EB");
  const formatLabel = standalone(filename, "heatmapPercentageLabel", {
    HEATMAP_COLORS: scale,
    heatmapLabelColor: palette.heatmapLabelColor,
    isRecord: (value) => value !== null && typeof value === "object",
    formatDecimal: String,
  });
  const builder = standalone(filename, "buildAgeEmotionHeatmapOption", {
    HEATMAP_COLORS: scale, heatmapPercentageLabel: formatLabel, heatmapTooltip: () => "",
    formatDecimal: standalone(filename, "formatDecimal", {}),
  });
  const summary = { crossings: { ageByEmotion: { columns: [{ key: "happy", label: "Feliz" }, { key: "neutral", label: "Neutro" }, { key: "sad", label: "Triste" }], rows: [{ key: "20-29", label: "20–29", cells: [0, 10, 100].map((percentage) => ({ count: percentage * 25, percentage })) }] } } };
  for (const theme of ["light", "dark"]) {
    const option = builder(summary, theme);
    assert.deepEqual(option.visualMap.inRange.color, scale);
    assert.equal(option.visualMap.dimension, 2, "a intensidade representa a porcentagem, não a quantidade bruta na quarta posição");
    assert.equal(option.visualMap.seriesIndex, 0);
    withChart(option, (chart) => {
      assertRgbEqual(fill(chart, 0, 0), "#FFFFFF");
      assertRgbEqual(fill(chart, 0, 1), echarts.color.lerp(0.1, scale));
      assertRgbEqual(fill(chart, 0, 2), scale.at(-1));
      for (const [index, value] of [[1, 10], [2, 100]]) {
        const label = chart.getModel().getSeriesByIndex(0).getData().getItemGraphicEl(index).getTextContent();
        const token = /^\{([^|]+)\|/.exec(label.style.text)?.[1];
        assert.ok(token);
        assertRgbEqual(label.style.rich[token].fill, palette.heatmapLabelColor(scale, value / 100));
      }
    });
  }
});

test("o tema automático do EChart preserva intensidade e rótulos, mas adapta superfícies e outros gráficos", () => {
  const mapChartValue = standalone("components/app/echart.tsx", "mapChartValue", {});
  const applyChartTheme = standalone("components/app/echart.tsx", "applyChartTheme", { mapChartValue });
  const scale = palette.monochromeHeatmapPalette("#1267C4");
  const option = {
    tooltip: { backgroundColor: "#FFFFFF", textStyle: { color: "#13233A" } },
    xAxis: { axisLabel: { color: "#66758A" }, axisLine: { lineStyle: { color: "#D8E3F2" } } },
    visualMap: [
      { type: "continuous", inRange: { color: scale }, outOfRange: { color: ["#FFFFFF", "#1267C4"] } },
      { type: "piecewise", pieces: [{ value: -1, color: "#FFFFFF" }] },
    ],
    series: [
      {
        type: "heatmap",
        data: [{ value: [0, 0, 0], itemStyle: { color: "#FFFFFF" }, label: { color: "#0F172A" } }],
        label: { rich: { strong: { color: "#FFFFFF" }, soft: { color: "#0F172A" } } },
        itemStyle: { color: "#1267C4" },
        emphasis: { itemStyle: { color: "#FFFFFF" }, label: { color: "#0F172A" } },
        select: { label: { color: "#FFFFFF" } },
        blur: { itemStyle: { color: "#1267C4" } },
      },
      { type: "line", lineStyle: { color: "#1267C4" }, label: { color: "#13233A" } },
    ],
  };
  const sourceSnapshot = structuredClone(option);
  assert.equal(applyChartTheme(option, false), option);
  const dark = applyChartTheme(option, true);
  assert.deepEqual(dark.visualMap, option.visualMap, "a transformação geral não pode recolorir os valores da escala");
  assert.deepEqual(dark.series[0], option.series[0], "cores de células, estados e seus números são semânticas");
  assert.equal(dark.tooltip.backgroundColor, "#18181b");
  assert.equal(dark.tooltip.textStyle.color, "#f4f4f5");
  assert.equal(dark.xAxis.axisLabel.color, "#a1a1aa");
  assert.equal(dark.xAxis.axisLine.lineStyle.color, "#2a2a30");
  assert.equal(dark.series[1].lineStyle.color, "#5aa8ff", "a adaptação dos gráficos de linha deve permanecer");
  assert.equal(dark.series[1].label.color, "#f4f4f5");
  assert.deepEqual(option, sourceSnapshot, "renderizar dark não deve modificar a opção compartilhada com a exportação light");

  const monthly = counting.buildCountingMonthYearHeatmapChartOption({ yearRows: [{ year: 2026, months: [0, 100, ...Array(10).fill(null)] }] }, "#1267C4", "dark");
  withChart(applyChartTheme(monthly, true), (chart) => {
    assertRgbEqual(fill(chart, 1, 0), "#FFFFFF");
    assertRgbEqual(fill(chart, 1, 1), scale.at(-1));
    const maximumLabel = chart.getModel().getSeriesByIndex(1).getData().getItemGraphicEl(1).getTextContent();
    assert.equal(maximumLabel.style.text, "{strong|100}");
    assertRgbEqual(maximumLabel.style.rich.strong.fill, "#FFFFFF");
    assert.ok(contrast(maximumLabel.style.rich.strong.fill, fill(chart, 1, 1)) > 4);
  });
});

function assertWhiteToDark(scale, context) {
  assert.equal(scale[0].toLowerCase(), "#ffffff", `${context}: o mínimo deve ser branco puro`);
  assert.equal(scale.length, 7);
  const values = scale.map((color) => {
    assert.match(color, /^#[0-9a-f]{6}$/i);
    return luminance(color);
  });
  values.slice(1).forEach((value, index) => assert.ok(value <= values[index], `${context}: intensidade ${index + 1} não pode ficar mais clara`));
  assert.ok(values.at(-1) < 0.42, `${context}: até cores brancas/neon devem conservar um máximo forte após suavização`);
  assert.ok(values[0] > values.at(-1));
}

function originalHeatmapStops(color) {
  const source = echarts.color.parse(color).slice(0, 3);
  const mix = (target, weight) => source.map((channel, index) => Math.round(channel + (target[index] - channel) * weight));
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  return [white, mix(white, 0.7), mix(white, 0.48), mix(white, 0.26), mix(black, 0.02), mix(black, 0.2), mix(black, 0.42)];
}

function luminance(color) {
  const [red, green, blue] = echarts.color.parse(color).slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function assertRgbEqual(actual, expected) {
  assert.deepEqual(echarts.color.parse(actual), echarts.color.parse(expected));
}

function fill(chart, series, index) {
  return chart.getModel().getSeriesByIndex(series).getData().getItemGraphicEl(index).style.fill;
}

function withChart(option, verify) {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 1200, height: 600 });
  try {
    chart.setOption({ ...option, animation: false }, { notMerge: true, lazyUpdate: false });
    assert.match(chart.renderToSVGString(), /ecmeta_series_index/);
    verify(chart);
  } finally {
    chart.dispose();
  }
}

function standalone(relativePath, name, bindings) {
  const filename = resolve(projectRoot, relativePath);
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
  assert.ok(declaration, `${name} deve existir`);
  const output = ts.transpileModule(`${declaration.getText(source)}\nmodule.exports = ${name};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", ...Object.keys(bindings), output)(loaded, loaded.exports, ...Object.values(bindings));
  return loaded.exports;
}

function load(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  if (modules.has(filename)) return modules.get(filename).exports;
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return require(specifier);
    if (specifier.startsWith("@/components/") && specifier !== "@/components/app/occupancy-chart-palette") return {};
    const path = specifier.slice(2);
    return load(existsSync(resolve(projectRoot, `${path}.ts`)) ? `${path}.ts` : `${path}.tsx`);
  };
  new Function("exports", "require", "module", output)(loaded.exports, localRequire, loaded);
  return loaded.exports;
}
