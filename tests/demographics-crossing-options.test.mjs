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
const { buildDemographicCrossingOption: build, demographicHeatmapColors } = load("lib/demographics-crossing-options.ts");
const presentation = load("lib/demographics-presentation.ts");
const { heatmapLabelColor, monochromeHeatmapPalette } = load("lib/chart-palette.ts");
const summary = aggregateDemographicBuckets([
  { gender: "Woman", age_bucket: "0-2", emotion: "happy", count: 3 },
  { gender: "Man", age_bucket: "30-39", emotion: "neutral", count: 7 },
  { gender: "unknown", age_bucket: "20-29", emotion: "sad", count: 0 },
  { gender: "Woman", age_bucket: "3-9", emotion: "happy", count: 7 },
].map((row) => ({ bucket: "2026-09-10T13:00:00Z", camera_id: "fixture-camera", ...row })));
const defaults = (dimension, changes = {}) => ({ ...presentation.defaultDemographicPresentation(dimension), ...changes });
const crossingFor = (dimension, source = summary) => source.crossings[dimension === "age-gender" ? "ageByGender" : "ageByEmotion"];

test("matriz usa tintas sólidas por gênero e visualMap oculto exigido pelo ECharts", () => {
  for (const theme of ["light", "dark"]) {
    const option = build(summary, defaults("age-gender"), "age-gender", theme);
    assert.equal(option.visualMap.show, false);
    assert.equal(option.visualMap.dimension, 0);
    assert.equal(option.visualMap.type, "piecewise");
    assert.deepEqual(option.visualMap.seriesIndex, [0, 1, 2]);
    assert.equal(option.legend.show, false);
    assert.deepEqual(option.series.map((series) => series.emphasis.itemStyle.borderColor), ["#DB2777", "#2563EB", "#8A99AF"]);
    assert.deepEqual(option.series.map((series) => series.itemStyle.color), option.visualMap.pieces.map((piece) => piece.color));
    assert.ok(option.series.every((series) => series.type === "heatmap" && !series.itemStyle.decal));
  }
});

test("ordenação crescente e decrescente é estável, mantém os dados e corrige tooltips", () => {
  for (const dimension of ["age-gender", "age-emotion"]) {
    const crossing = crossingFor(dimension);
    for (const order of ["default", "ascending", "descending"]) {
      const option = build(summary, defaults(dimension, { order }), dimension);
      const expected = crossing.rows.map((row, index) => ({ row, index }));
      if (order !== "default") expected.sort((a, b) => (order === "ascending" ? 1 : -1) * (a.row.count - b.row.count) || a.index - b.index);
      assert.deepEqual(option.yAxis.data, expected.map(({ row }) => row.label));
      for (const series of option.series) {
        for (const value of series.data) {
          const [columnIndex, rowIndex, percentage, count] = value;
          const row = expected[rowIndex].row;
          const column = crossing.columns[columnIndex];
          const cell = row.cells.find((candidate) => candidate.columnKey === column.key);
          assert.equal(percentage, cell.percentage);
          assert.equal(count, cell.count);
          const tooltip = option.tooltip.formatter({ value });
          assert.ok(tooltip.includes(`${row.label} · ${column.label}`));
          assert.ok(tooltip.includes(`Detecções: ${count}`));
        }
      }
    }
  }
});

test("emojis preservam categorias legíveis; tooltip mantém rótulos completos e escapa HTML", () => {
  const source = structuredClone(summary);
  source.crossings.ageByGender.rows[0].label = '<idade "teste">';
  const option = build(source, defaults("age-gender", { emojis: true }), "age-gender");
  assert.ok(option.xAxis.data[0].startsWith("Mulher "));
  assert.ok(option.yAxis.data[0].startsWith('<idade "teste"> '));
  assert.ok(option.tooltip.formatter({ value: [0, 0] }).includes("&lt;idade &quot;teste&quot;&gt;"));
  assert.equal(option.tooltip.formatter({ value: [100, 100] }), "Sem valor");
  assert.equal(option.tooltip.formatter({ value: [0.5, 0] }), "Sem valor");
  assert.equal(option.tooltip.formatter(null), "Sem valor");
});

test("heatmap mantém a progressão claro para escuro com light original e dark demográfico", () => {
  for (const { id: palette, colors } of presentation.DEMOGRAPHICS_PALETTES) {
    for (const theme of ["light", "dark"]) {
      const option = build(summary, defaults("age-emotion", { palette }), "age-emotion", theme);
      assert.deepEqual(option.visualMap.inRange.color, demographicHeatmapColors(palette, theme));
      if (theme === "light") {
        assert.deepEqual(option.visualMap.inRange.color, monochromeHeatmapPalette(palette === "pink-blue" ? colors[1] : colors[0], "light"));
        assert.equal(option.visualMap.inRange.color[0].toUpperCase(), "#FFFFFF");
      } else {
        assert.notEqual(option.visualMap.inRange.color[0].toUpperCase(), "#FFFFFF");
      }
      assert.equal(option.visualMap.dimension, 2);
      assert.equal(option.visualMap.orient, "horizontal");
      assert.equal(option.visualMap.max, Math.max(1, ...option.series[0].data.map((value) => value[2])));
      assert.equal(option.xAxis.splitArea.show, false);
      assert.equal(option.yAxis.splitArea.show, false);
    }
  }
});

test("heatmap padrão mantém azul e bordas suaves sem fundo rosa, preservando light de exportação", () => {
  for (const theme of ["light", "dark"]) {
    const option = build(summary, defaults("age-emotion"), "age-emotion", theme);
    assert.deepEqual(option.visualMap.inRange.color, demographicHeatmapColors("pink-blue", theme));
    if (theme === "light") assert.deepEqual(option.visualMap.inRange.color, monochromeHeatmapPalette("#2563EB", "light"));
    assert.equal(option.series[0].itemStyle.borderWidth, 0.5);
    assert.equal(option.series[0].itemStyle.borderColor, theme === "dark" ? "rgba(226, 232, 240, 0.12)" : "rgba(15, 23, 42, 0.09)");
    assert.equal(option.series[0].emphasis.itemStyle.borderColor, theme === "dark" ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.20)");
    assert.equal(option.series[0].progressive, 1_000);
    assert.notEqual(option.visualMap.inRange.color.at(-1), "#FFFFFF");
  }
});

test("todas as paletas demográficas reduzem brilho no dark sem inverter intensidade nem mudar dados", () => {
  const snapshot = structuredClone(summary);
  for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
    const light = build(summary, defaults("age-emotion", { palette }), "age-emotion", "light");
    const dark = build(summary, defaults("age-emotion", { palette }), "age-emotion", "dark");
    const lightColors = light.visualMap.inRange.color;
    const darkColors = dark.visualMap.inRange.color;
    assert.equal(darkColors.length, lightColors.length);
    assert.deepEqual(dark.series.map((series) => series.data), light.series.map((series) => series.data));
    assert.deepEqual(dark.xAxis.data, light.xAxis.data);
    assert.deepEqual(dark.yAxis.data, light.yAxis.data);
    assert.equal(dark.visualMap.max, light.visualMap.max);
    assert.ok(luminance(darkColors[0]) < 0.4, `${palette}: o mínimo dark não pode virar painel branco`);
    for (let index = 0; index < darkColors.length; index++) {
      assert.match(darkColors[index], /^#[\da-f]{6}$/i, "a suavização deve resultar em HEX opaco");
      assert.ok(luminance(darkColors[index]) < luminance(lightColors[index]), `${palette}: parada ${index} ainda muito clara`);
      if (index > 0) {
        assert.ok(luminance(darkColors[index]) <= luminance(darkColors[index - 1]), `${palette}: não inverter intensidade dark`);
        assert.ok(luminance(lightColors[index]) <= luminance(lightColors[index - 1]), `${palette}: preservar intensidade light`);
      }
    }
    for (let index = 0; index <= 100; index++) {
      const ratio = index / 100;
      const background = echarts.color.lerp(ratio, darkColors);
      const color = heatmapLabelColor(darkColors, ratio);
      const whiteContrast = contrast("#FFFFFF", background);
      const darkContrast = contrast("#0F172A", background);
      assert.equal(color, whiteContrast >= darkContrast ? "#FFFFFF" : "#0F172A", `${palette}: contraste ${ratio}`);
      assert.ok(contrast(color, background) >= 4, `${palette}: rótulo não pode perder legibilidade em ${ratio}`);
    }
    for (const value of dark.series[0].data) assert.equal(dark.tooltip.formatter({ value }), light.tooltip.formatter({ value }));
  }
  assert.deepEqual(summary, snapshot);
});

test("bordas finas e suavidade dos preenchimentos não reduzem a opacidade nem o contraste dos números", () => {
  for (const theme of ["light", "dark"]) {
    for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
      for (const dimension of ["age-gender", "age-emotion"]) {
        const option = build(summary, defaults(dimension, { palette }), dimension, theme);
        for (const series of option.series) {
          assert.equal(series.itemStyle.borderWidth, 0.5);
          assert.ok(series.itemStyle.opacity === undefined || series.itemStyle.opacity === 1);
          assert.ok(series.label.opacity === undefined || series.label.opacity === 1);
          if (dimension === "age-emotion") {
            const colors = option.visualMap.inRange.color;
            for (const ratio of [0.01, 0.25, 0.5, 0.75, 1]) {
              const value = ratio * option.visualMap.max;
              const expected = heatmapLabelColor(colors, ratio) === "#FFFFFF" ? "light" : "dark";
              assert.ok(series.label.formatter({ value: [0, 0, value, 1] }).startsWith(`{${expected}|`));
            }
          }
        }
      }
    }
  }
});

test("percentuais e counts não são arredondados nos dados; zero/null não produzem rótulo nos dois temas", () => {
  const zero = aggregateDemographicBuckets([{ bucket: "2026-09-10T13:00:00Z", camera_id: "fixture-camera", gender: "Woman", age_bucket: "0-2", emotion: "neutral", count: 0 }]);
  for (const theme of ["light", "dark"]) for (const dimension of ["age-gender", "age-emotion"]) {
    const option = build(summary, defaults(dimension), dimension, theme);
    for (const series of option.series) {
      assert.equal(series.label.formatter({ value: [0, 0, 0, 0] }), "");
      assert.equal(series.label.formatter({ value: [0, 0, null, 0] }), "");
      assert.equal(series.label.formatter({ value: [0, 0, NaN, 0] }), "");
      assert.match(series.label.formatter({ value: [0, 0, 17.647058823529413, 3] }), /17,65%/);
    }
    const emptyOption = build(zero, defaults(dimension), dimension, theme);
    assert.ok(emptyOption.series.every((series) => series.data.every((value) => value[2] === null)));
    assert.ok(emptyOption.tooltip.formatter({ value: [0, 0] }).includes("Participação: —"));
  }
});

test("todas as paletas, dois temas e ambos os cruzamentos renderizam SVG real sem texturas", () => {
  const original = structuredClone(summary);
  for (const dimension of ["age-gender", "age-emotion"]) {
    for (const theme of ["light", "dark"]) {
      for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
        const option = build(summary, defaults(dimension, { palette, order: "descending" }), dimension, theme);
        const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 640, height: 300 });
        try {
          chart.setOption({ ...option, animation: false });
          assert.equal(option.aria.decal.show, false);
          const svg = chart.renderToSVGString();
          assert.match(svg, /<svg/);
          assert.doesNotMatch(svg, /<pattern\b|url\(#.*pattern/i);
          if (dimension === "age-emotion") {
            const data = chart.getModel().getSeriesByIndex(0).getData();
            option.series[0].data.forEach((value, index) => {
              if (typeof value[2] !== "number") return;
              const graphic = data.getItemGraphicEl(index);
              assert.ok(graphic, `${palette} ${theme}: célula numérica deve ser desenhada no primeiro frame`);
              const expected = echarts.color.lerp(value[2] / option.visualMap.max, option.visualMap.inRange.color);
              assert.deepEqual(echarts.color.parse(graphic.style.fill), echarts.color.parse(expected));
              if (value[2] <= 0) return;
              const text = graphic.getTextContent();
              const token = heatmapLabelColor(option.visualMap.inRange.color, value[2] / option.visualMap.max) === "#FFFFFF" ? "light" : "dark";
              assert.ok(contrast(text.style.rich[token].fill, graphic.style.fill) >= 4);
              assert.equal(graphic.style.opacity ?? 1, 1);
            });
          }
        } finally { chart.dispose(); }
      }
    }
  }
  assert.deepEqual(summary, original);
});

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
