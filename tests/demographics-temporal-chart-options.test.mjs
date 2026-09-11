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
  const output = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", output)(loaded, loaded.exports, (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  return loaded.exports;
}
const demographics = load("lib/demographics.ts");
const temporal = load("lib/demographics-temporal.ts");
const originalPlan = temporal.buildDemographicTemporalPlan;
let plannerCalls = 0;
temporal.buildDemographicTemporalPlan = (...arguments_) => { plannerCalls++; return originalPlan(...arguments_); };
const visible = load("lib/demographics-visible-categories.ts");
const originalVisibleDistribution = visible.visibleDemographicDistribution;
let genderRebaseCalls = 0;
visible.visibleDemographicDistribution = (...arguments_) => { genderRebaseCalls++; return originalVisibleDistribution(...arguments_); };
const { buildDemographicTemporalModel: build, fitDemographicTemporalOption: fit, demographicTemporalValueLabels: valueLabels } = load("lib/demographics-temporal-chart-options.ts");
const { DEMOGRAPHICS_TEMPORAL_WIDGET_IDS: ids, defaultDemographicTemporalSettings: defaults } = load("lib/demographics-temporal-preferences.ts");
const { demographicHeatmapColors, demographicHeatmapLabelColor: heatmapLabelColor } = load("lib/demographics-crossing-options.ts");
const { DEMOGRAPHICS_PALETTES, demographicPalettePreviewColors } = load("lib/demographics-presentation.ts");
const zone = "America/Sao_Paulo";
const rows = [
  ["2026-09-09T13:00:00Z", "Woman", "happy", "20-29", 10],
  ["2026-09-09T13:00:00Z", "Man", "neutral", "30-39", 30],
  ["2026-09-09T13:00:00Z", "unknown", "sad", "40-49", 10],
  ["2026-09-09T14:00:00Z", "Woman", "happy", "20-29", 40],
  ["2026-09-09T14:00:00Z", "Man", "neutral", "30-39", 10],
  ["2026-09-10T13:00:00Z", "Woman", "happy", "20-29", 100],
  ["2026-09-10T15:00:00Z", "Woman", "happy", "20-29", 0],
].map(([bucket, gender, emotion, age_bucket, count]) => ({ bucket, gender, emotion, age_bucket, count, camera_id: "synthetic-camera" }));
const summary = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
const reference = demographics.aggregateDemographicBuckets([
  { ...rows[0], count: 25 }, { ...rows[1], count: 75 },
], { timeZone: zone });
const input = { summary, comparisonSummary: reference, comparisonLabel: "07/09/2026 a 08/09/2026", from: "2026-09-09T03:00:00Z", to: "2026-09-11T03:00:00Z", now: "2026-09-11T03:00:00Z", timeZone: zone };
const modelFor = (id, changes = {}, context = {}) => build({ ...input, id, settings: { ...defaults(id), ...changes }, ...context });

test("perfil horário mantém 24 horas e pondera contagens antes de calcular o percentual", () => {
  const model = modelFor("demographics_emotion_hourly", { dimension: "gender" });
  assert.equal(model.pointCount, 24);
  assert.deepEqual(model.option.xAxis.data, Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}h`));
  const row = model.table.rows.find((row) => row.period === "10h" && row.category === "Mulher");
  assert.equal(row.count, 110);
  assert.equal(row.total, 150);
  assert.equal(row.percentage, 78.57);
  assert.notEqual(row.percentage, 60, "não usar média simples dos percentuais diários");
  assert.equal(model.table.rows.filter((row) => row.period === "10h").reduce((total, row) => total + row.percentage, 0), 100);
});

test("selecionar uma categoria não renormaliza o denominador nem altera dados de origem", () => {
  const snapshot = structuredClone(summary);
  const all = modelFor("demographics_emotion_hourly", { dimension: "gender" });
  const selected = modelFor("demographics_emotion_hourly", { dimension: "gender", categoryKeys: ["Woman"] });
  assert.equal(selected.categoryCount, 1);
  assert.deepEqual(selected.table.rows, all.table.rows.filter((row) => row.category === "Mulher"));
  assert.equal(selected.table.rows.find((row) => row.period === "10h").percentage, 78.57);
  assert.deepEqual(summary, snapshot);
});

test("todos os widgets e formatos de gênero mostram apenas identificados e declaram a base dos percentuais", () => {
  const snapshot = structuredClone(summary);
  for (const id of ids) for (const chartType of ["bar", "area", "line", "heatmap"]) for (const metric of ["percentage", "count"]) {
    const model = modelFor(id, { dimension: "gender", chartType, metric });
    assert.equal(model.hasData, true);
    assert.match(model.description, /entre gêneros identificados/);
    assert.match(model.table.description, /entre gêneros identificados/);
    assert.deepEqual([...new Set(model.table.rows.map((row) => row.category))], ["Mulher", "Homem"]);
    const percentages = model.table.columns.filter((column) => /percentage$/.test(column.key) && !column.key.startsWith("change"));
    assert.ok(percentages.every((column) => /entre gêneros identificados/.test(column.label)));
    for (const series of model.option.series) for (const datum of series.data) {
      assert.ok(["Mulher", "Homem"].includes(datum.categoryLabel));
      if (datum.count === null || datum.future) continue;
      assert.match(model.option.tooltip.formatter({ data: datum }), /entre gêneros identificados/);
    }
  }
  assert.equal(summary.total, 200);
  assert.equal(summary.gender.find((item) => item.key === "unknown").count, 10);
  assert.deepEqual(summary, snapshot);
});

test("gênero desconhecido não fabrica percentuais nem dados identificados, mantendo zero observado e total bruto", () => {
  const unknown = demographics.aggregateDemographicBuckets([{ ...rows[2], count: 17 }], { timeZone: zone });
  const zero = demographics.aggregateDemographicBuckets([{ ...rows[0], count: 0 }], { timeZone: zone });
  for (const id of ids) for (const metric of ["percentage", "count"]) {
    const model = modelFor(id, { dimension: "gender", metric }, { summary: unknown, comparisonSummary: unknown });
    assert.equal(model.hasData, false);
    for (const row of model.table.rows) {
      assert.ok(["Mulher", "Homem"].includes(row.category));
      if (id === "demographics_period_comparison") {
        assert.equal(row.current_percentage, null);
        assert.equal(row.reference_percentage, null);
        assert.equal(row.change_pp, null);
      } else {
        assert.equal(row.percentage, null);
        if (row.total !== null) assert.equal(row.total, 17);
      }
    }
    const observedZero = modelFor(id, { dimension: "gender", metric }, { summary: zero, comparisonSummary: zero });
    assert.equal(observedZero.hasData, true, "um bucket explicitamente zerado continua diferente de ausência de classificação");
    assert.equal(unknown.total, 17);
  }
});

test("arredondamento de gêneros identificados soma 100% sem absorver unknown nem renormalizar filtros", () => {
  const rounding = demographics.aggregateDemographicBuckets([
    { ...rows[0], count: 1 }, { ...rows[1], count: 31 }, { ...rows[2], count: 1000 },
  ], { timeZone: zone });
  const model = modelFor("demographics_daily_evolution", {}, { summary: rounding });
  const observed = model.table.rows.filter((row) => row.total !== null);
  assert.deepEqual(observed.map((row) => row.percentage), [3.13, 96.87]);
  assert.equal(observed.reduce((sum, row) => sum + row.percentage, 0), 100);
  assert.ok(observed.every((row) => row.total === 1032));
  const onlyWoman = modelFor("demographics_daily_evolution", { categoryKeys: ["Woman", "unknown"] }, { summary: rounding });
  assert.equal(onlyWoman.table.rows.find((row) => row.total !== null).percentage, 3.13);
});

test("idade e emoção conservam as detecções de gênero desconhecido e os percentuais originais", () => {
  for (const dimension of ["age", "emotion"]) {
    const model = modelFor("demographics_daily_evolution", { dimension });
    const label = dimension === "age" ? "40-49" : demographics.DEMOGRAPHIC_EMOTION_DISPLAY_LABELS.sad;
    const row = model.table.rows.find((row) => row.period === "09/09/2026" && row.category === label);
    assert.equal(row.count, 10);
    assert.equal(row.percentage, 10);
    assert.equal(row.total, 100);
    assert.doesNotMatch(model.description, /gêneros identificados/);
    assert.ok(model.table.columns.some((column) => column.key === "percentage" && column.label === "Participação no intervalo (%)"));
    const comparison = modelFor("demographics_period_comparison", { dimension });
    assert.equal(comparison.table.rows.find((row) => row.category === label).current_percentage, 5);
  }
});

test("zero observado, lacuna e futuro permanecem distintos no gráfico e na tabela nos dois temas", () => {
  for (const theme of ["light", "dark"]) {
    const hourly = modelFor("demographics_age_hourly", { dimension: "gender", metric: "count" }, { theme });
    const observedZero = hourly.table.rows.find((row) => row.period === "12h" && row.category === "Mulher");
    const missing = hourly.table.rows.find((row) => row.period === "09h" && row.category === "Mulher");
    assert.equal(observedZero.count, 0);
    assert.equal(observedZero.percentage, null);
    assert.equal(missing.count, null);
    assert.equal(missing.percentage, null);
    const countSeries = hourly.option.series[1];
    assert.ok(countSeries.data.some((datum) => datum.value[2] === 0));
    assert.ok(hourly.option.series[0].data.some((datum) => datum.value[2] === -1));
    const current = modelFor("demographics_gender_timeline", {}, { to: "2026-09-10T03:00:00Z", now: "2026-09-09T13:30:00Z", theme });
    const future = current.option.series[0].data.find((datum) => datum.periodLabel === "11:00");
    assert.equal(future.future, true);
    assert.equal(future.value, null);
    assert.match(current.option.tooltip.formatter({ data: future }), /Horário futuro/);
    const heatmap = modelFor("demographics_gender_timeline", { chartType: "heatmap" }, { to: "2026-09-10T03:00:00Z", now: "2026-09-09T13:30:00Z", theme });
    const empty = heatmap.option.series[0].data.find((datum) => datum.periodLabel === "11:00");
    assert.equal(empty.future, true);
    assert.equal(empty.value[2], -1);
    assert.match(heatmap.option.tooltip.formatter({ data: empty }), /Horário futuro/);
    assert.notEqual(heatmap.option.visualMap[0].pieces[0].color, heatmap.option.visualMap[1].inRange.color[0], "sem dado não recebe a mesma cor do zero observado");
    assert.equal(heatmap.option.visualMap[0].pieces[0].color, "transparent", "lacunas e futuro deixam a superfície do card visível sem caixinhas cinzas");
    assert.equal(heatmap.option.series[0].itemStyle.color, heatmap.option.visualMap[0].pieces[0].color);
  }
});

test("heatmaps horários compartilham a escala tonal em light/dark, preservando dados, percentuais e tabelas", () => {
  const snapshot = structuredClone(summary);
  for (const id of ["demographics_emotion_hourly", "demographics_age_hourly"]) {
    for (const { id: palette } of DEMOGRAPHICS_PALETTES) {
      for (const metric of ["count", "percentage"]) {
        const light = modelFor(id, { palette, metric }, { theme: "light" });
        const dark = modelFor(id, { palette, metric }, { theme: "dark" });
        assert.deepEqual(light.option.visualMap[1].inRange.color, demographicHeatmapColors(palette, "light"));
        assert.deepEqual(dark.option.visualMap[1].inRange.color, demographicHeatmapColors(palette, "dark"));
        assert.notEqual(dark.option.visualMap[1].inRange.color[0].toUpperCase(), "#3F3F46", `${id}: zero observado usa a paleta escolhida`);
        assert.equal(dark.option.visualMap[0].pieces[0].color, "transparent", `${id}: ausência integra o fundo do card`);
        assert.equal(light.option.visualMap[0].pieces[0].color, "transparent");
        assert.notDeepEqual(dark.option.visualMap[1].inRange.color, light.option.visualMap[1].inRange.color);
        assert.deepEqual(dark.option.series.map((series) => series.data), light.option.series.map((series) => series.data));
        assert.deepEqual(dark.table, light.table);
        assert.deepEqual(dark.option.xAxis.data, light.option.xAxis.data);
        assert.deepEqual(dark.option.yAxis.data, light.option.yAxis.data);
        assert.equal(dark.option.visualMap[1].max, light.option.visualMap[1].max);
        for (const series of dark.option.series) for (const datum of series.data) {
          assert.equal(dark.option.tooltip.formatter({ data: datum }), light.option.tooltip.formatter({ data: datum }));
        }
      }
    }
  }
  assert.deepEqual(summary, snapshot);
});

test("sem agregado temporal não inventa uma série temporal a partir do total", () => {
  const oldSummary = demographics.aggregateDemographicBuckets(rows);
  const model = modelFor("demographics_daily_evolution", {}, { summary: oldSummary });
  assert.equal(oldSummary.hasData, true);
  assert.equal(model.hasData, false);
  assert.ok(model.table.rows.every((row) => row.count === null && row.percentage === null));
});

test("comparativo informa pontos percentuais e não converte diferença em crescimento relativo", () => {
  const model = modelFor("demographics_period_comparison");
  const row = model.table.rows.find((row) => row.category === "Mulher");
  assert.equal(row.current_count, 150);
  assert.equal(row.current_percentage, 78.95);
  assert.equal(row.reference_count, 25);
  assert.equal(row.reference_percentage, 25);
  assert.equal(row.change_pp, 53.95);
  assert.ok(model.table.columns.some((column) => column.key === "change_pp" && column.label.includes("p.p.")));
  assert.ok(model.description.includes(input.comparisonLabel));
});

test("comparativo absoluto calcula deltas e evita infinito quando a referência é zero ou inexistente", () => {
  const count = modelFor("demographics_period_comparison", { metric: "count" });
  const woman = count.table.rows.find((row) => row.category === "Mulher");
  assert.equal(count.table.rows.some((row) => row.category === "Não identificado"), false);
  assert.equal(woman.change_count, 125);
  assert.equal(woman.change_count_percentage, 500);
  const zeroReference = demographics.aggregateDemographicBuckets([{ ...rows[0], count: 25 }], { timeZone: zone });
  const zero = modelFor("demographics_period_comparison", { metric: "count" }, { comparisonSummary: zeroReference });
  const man = zero.table.rows.find((row) => row.category === "Homem");
  assert.equal(man.reference_count, 0);
  assert.equal(man.change_count_percentage, null);
  assert.ok(count.table.columns.some((column) => column.key === "change_count_percentage"));
  assert.ok(!count.table.columns.some((column) => column.key === "change_pp"));
  const absent = modelFor("demographics_period_comparison", {}, { comparisonSummary: null });
  assert.ok(absent.table.rows.every((row) => row.reference_count === null && row.reference_percentage === null && row.change_pp === null));
  assert.ok(absent.option.series[1].data.every((datum) => datum.value === null));
});

test("comparativo de gênero distingue períodos com tons neutros, símbolos e traçados sem trocar a semântica de gênero", () => {
  for (const theme of ["light", "dark"]) {
    for (const chartType of ["bar", "line", "area"]) {
      for (const palette of ["pink-blue", "cyber"]) {
        const model = modelFor("demographics_period_comparison", { chartType, palette }, { theme });
        const colors = theme === "dark" ? ["#CBD5E1", "#64748B"] : ["#475569", "#CBD5E1"];
        assert.deepEqual(model.option.color, colors);
        assert.deepEqual(model.option.series.map((series) => series.itemStyle.color), colors);
        assert.deepEqual(model.option.series.map((series) => series.lineStyle.type), ["solid", "dashed"]);
        assert.deepEqual(model.option.series.map((series) => series.symbol), ["circle", "diamond"]);
        assert.deepEqual(model.option.legend.data, ["Período analisado", input.comparisonLabel]);
        assert.match(model.option.aria.description, /cores distinguem os períodos/);
        assert.equal(model.table.rows.find((row) => row.category === "Mulher").change_pp, 53.95);
      }
    }
  }
});

test("heatmaps temporais mantêm texto opaco e contraste calculado na cor final com borda de meio pixel", () => {
  for (const theme of ["light", "dark"]) {
    for (const id of ids) {
      const model = modelFor(id, { chartType: "heatmap" }, { theme });
      const colors = model.option.visualMap[1].inRange.color;
      const maximum = model.option.visualMap[1].max;
      for (const series of model.option.series) {
        assert.equal(series.itemStyle.borderWidth, 0.5);
        assert.ok(series.itemStyle.opacity === undefined || series.itemStyle.opacity === 1);
        assert.ok(series.label.opacity === undefined || series.label.opacity === 1);
      }
      for (const datum of model.option.series[1].data) {
        const value = datum.value[2];
        if (value <= 0) continue;
        const expected = heatmapLabelColor(colors, value / maximum) === "#FFFFFF" ? "light" : "dark";
        assert.ok(model.option.series[1].label.formatter({ data: datum }).startsWith(`{${expected}|`));
      }
    }
  }
});

test("rótulos não confundem contagem e percentual quando os valores numéricos coincidem", () => {
  const same = demographics.aggregateDemographicBuckets([{ ...rows[0], count: 50 }, { ...rows[1], count: 50 }], { timeZone: zone });
  for (const metric of ["count", "percentage"]) {
    const model = modelFor("demographics_period_comparison", { metric }, { summary: same });
    const datum = model.option.series[0].data[0];
    assert.equal(datum.count, 50);
    assert.equal(datum.percentage, 50);
    assert.equal(model.option.series[0].label.formatter({ data: datum }), metric === "count" ? "50" : "50%");
  }
});

test("paleta mantém cores por categoria mesmo ao filtrar séries", () => {
  const model = modelFor("demographics_gender_timeline", { categoryKeys: ["Man"] });
  assert.equal(model.option.series.length, 1);
  assert.equal(model.option.series[0].itemStyle.color, "#2563EB");
  assert.equal(model.option.series[0].name, "Homem");
});

test("áreas, linhas e barras de gênero desenham as cores exatas das prévias sem transparência residual", () => {
  const snapshot = structuredClone(summary);
  for (const { id: palette } of DEMOGRAPHICS_PALETTES) for (const theme of ["light", "dark"]) {
    const colors = demographicPalettePreviewColors(palette, "gender");
    for (const chartType of ["bar", "area", "line"]) {
      const model = modelFor("demographics_gender_timeline", { palette, chartType, granularity: "day" }, { theme });
      assert.deepEqual(model.option.color, colors);
      model.option.series.forEach((series, index) => {
        assert.equal(series.itemStyle.color, colors[index]);
        assert.equal(series.lineStyle.color, colors[index]);
        if (chartType === "area") {
          assert.equal(series.areaStyle.color, colors[index]);
          assert.equal(series.areaStyle.opacity, 1);
          assert.equal(series.stack, "demographic-share");
          assert.equal(series.label.backgroundColor, theme === "dark" ? "#18181B" : "#FFFFFF");
          assert.equal(series.label.color, theme === "dark" ? "#F8FAFC" : "#0F172A");
          assert.deepEqual(series.label.padding, [1, 2]);
          assert.equal(series.label.borderRadius, 2);
          assert.equal(series.label.position, "top");
          assert.ok(colorContrast(series.label.color, series.label.backgroundColor) >= 4.5);
        } else {
          assert.equal(series.label.backgroundColor, undefined);
        }
      });
      const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 640, height: 300 });
      try {
        chart.setOption({ ...model.option, animation: false });
        chart.renderToSVGString();
        for (const [index, color] of colors.entries()) {
          const seriesModel = chart.getModel().getSeriesByIndex(index);
          assert.deepEqual(echarts.color.parse(seriesModel.getData().getVisual("style").fill), echarts.color.parse(color));
          if (chartType === "area") {
            const polygons = [];
            const valueLabels = [];
            chart.getViewOfSeriesModel(seriesModel).group.traverse((element) => {
              if (element.type === "ec-polygon") polygons.push(element);
              const text = element.getTextContent?.();
              if (typeof text?.style?.text === "string" && text.style.text.endsWith("%")) valueLabels.push(text);
            });
            assert.ok(polygons.length > 0, "a área empilhada precisa estar desenhada");
            for (const polygon of polygons) {
              assert.deepEqual(echarts.color.parse(polygon.style.fill), echarts.color.parse(color));
              assert.equal(polygon.style.opacity, 1);
            }
            assert.ok(valueLabels.length > 0, "valores positivos precisam estar desenhados sem hover");
            for (const text of valueLabels) {
              assert.ok(colorContrast(text.style.fill, text.style.backgroundColor) >= 4.5, "o valor não pode depender da cor da área adjacente");
              const backgrounds = text.childrenRef().filter((element) => element.type === "rect");
              assert.ok(backgrounds.length > 0, "a proteção deve existir na renderização, não apenas na configuração");
              for (const background of backgrounds) {
                assert.deepEqual(echarts.color.parse(background.style.fill), echarts.color.parse(model.option.series[index].label.backgroundColor));
                assert.equal(background.style.opacity ?? 1, 1);
                assert.ok(background.shape.width > 0 && background.shape.height > 0);
              }
            }
          }
        }
      } finally { chart.dispose(); }
    }
    const filtered = modelFor("demographics_gender_timeline", { palette, chartType: "area", categoryKeys: ["Man"] }, { theme });
    assert.equal(filtered.option.series[0].areaStyle.color, colors[1]);
    assert.equal(filtered.option.series[0].areaStyle.opacity, 1);
  }
  for (const dimension of ["age", "emotion"]) {
    const model = modelFor("demographics_gender_timeline", { dimension, chartType: "area" });
    assert.ok(model.option.series.every((series) => series.areaStyle.opacity === 0.32));
    assert.ok(model.option.series.every((series) => series.label.backgroundColor === undefined));
  }
  const oneDay = modelFor("demographics_daily_evolution", { chartType: "area" }, { to: "2026-09-10T03:00:00Z" });
  assert.ok(oneDay.option.series.every((series) => series.label.backgroundColor === undefined));
  assert.deepEqual(summary, snapshot);
});

function colorContrast(first, second) {
  const luminance = (color) => {
    const channels = echarts.color.parse(color).slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("modelo diário respeita agregação por dia e histórico extenso promove hora sem milhares de pontos", () => {
  const daily = modelFor("demographics_daily_evolution");
  assert.equal(daily.pointCount, 2);
  assert.deepEqual(daily.option.xAxis.data, ["09/09/2026", "10/09/2026"]);
  const firstWoman = daily.table.rows.find((row) => row.period === "09/09/2026" && row.category === "Mulher");
  assert.equal(firstWoman.count, 50);
  assert.equal(firstWoman.percentage, 55.56);
  const extensive = modelFor("demographics_gender_timeline", { granularity: "hour" }, { from: "2025-09-11T03:00:00Z" });
  assert.ok(extensive.pointCount <= 744);
  assert.ok(extensive.option.xAxis.data.length <= 744);
});

test("cache compartilha consolidação temporal entre widgets e export sem misturar fusos ou recortes", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const before = plannerCalls;
  modelFor("demographics_emotion_hourly", {}, { summary: fresh });
  modelFor("demographics_age_hourly", {}, { summary: fresh });
  modelFor("demographics_age_hourly", { palette: "cyber" }, { summary: fresh, theme: "dark" });
  assert.equal(plannerCalls - before, 1);
  modelFor("demographics_age_hourly", {}, { summary: fresh, now: "2026-09-10T14:00:00Z" });
  assert.equal(plannerCalls - before, 2);
});

test("modelos idênticos mantêm referências e tema/paleta reutilizam tabelas e dados sem refazer percentuais", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  for (const chartType of ["line", "bar", "area", "heatmap"]) {
    const first = modelFor("demographics_gender_timeline", { chartType }, { summary: fresh });
    const before = genderRebaseCalls;
    const same = modelFor("demographics_gender_timeline", { chartType }, { summary: fresh, from: new Date(input.from), now: new Date(input.now) });
    assert.equal(same, first, "novas instâncias Date e settings equivalentes não invalidam o cache");
    for (const context of [{ theme: "dark" }, { theme: "light" }]) {
      const recolored = modelFor("demographics_gender_timeline", { chartType, palette: "ocean" }, { ...context, summary: fresh });
      assert.equal(recolored.table, first.table);
      recolored.option.series.forEach((series, index) => assert.equal(series.data, first.option.series[index].data));
    }
    assert.equal(genderRebaseCalls, before, "trocar cores não recalcula a base de gêneros identificados");
  }
  const defaultModel = modelFor("demographics_daily_evolution", {}, { summary: fresh });
  const onlyReferenceChanged = modelFor("demographics_daily_evolution", {}, { summary: fresh, comparisonSummary: structuredClone(reference), comparisonLabel: "Outra referência" });
  assert.equal(onlyReferenceChanged, defaultModel, "um widget não comparativo não depende da resposta de comparação");
});

test("resoluções auto/hour/day equivalentes compartilham uma varredura anual e o relógio fechado não invalida", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const context = { summary: fresh, from: "2025-09-11T03:00:00Z", now: "2026-09-11T03:00:00Z" };
  const before = plannerCalls;
  const values = ids.map((id) => modelFor(id, {}, context));
  assert.equal(plannerCalls - before, 1, "os quatro widgets não comparativos devem compartilhar a resolução diária efetiva");
  for (const now of ["2026-09-11T03:01:00Z", "2026-09-12T03:00:00Z", "2027-09-11T03:00:00Z"]) {
    ids.forEach((id, index) => assert.equal(modelFor(id, {}, { ...context, now }), values[index]));
  }
  assert.equal(plannerCalls - before, 1);
  const opened = modelFor(ids[0], {}, { ...context, now: "2026-09-10T14:00:00Z" });
  assert.notEqual(opened, values[0]);
  assert.equal(plannerCalls - before, 2, "um corte ainda aberto deve manter sua própria cobertura/futuro");
});

test("now omitido acompanha o relógio nos minutos abertos e estabiliza somente depois do fim", () => {
  const actualNow = Date.now;
  let clock = Date.parse("2026-09-09T12:59:30Z");
  Date.now = () => clock;
  try {
    const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
    const options = { summary: fresh, now: undefined, to: "2026-09-10T03:00:00Z" };
    const before = plannerCalls;
    const first = modelFor(ids[0], { metric: "count" }, options);
    const nextHour = (model) => model.option.series[0].data.find((datum) => datum.periodLabel === "10:00");
    assert.equal(nextHour(first).future, true);
    assert.equal(nextHour(first).value, null);
    clock = Date.parse("2026-09-09T13:01:30Z");
    const advanced = modelFor(ids[0], { metric: "count" }, options);
    assert.notEqual(advanced, first);
    assert.equal(nextHour(advanced).future, false);
    assert.equal(nextHour(advanced).value, 10);
    assert.equal(plannerCalls - before, 2);
    clock += 10_000;
    assert.equal(modelFor(ids[0], { metric: "count" }, options), advanced, "a política existente consolida o mesmo minuto fechado");
    clock = Date.parse("2026-09-10T04:00:00Z");
    const closed = modelFor(ids[0], { metric: "count" }, options);
    clock = Date.parse("2026-09-12T04:00:00Z");
    assert.equal(modelFor(ids[0], { metric: "count" }, options), closed);
    assert.equal(plannerCalls - before, 3);
  } finally { Date.now = actualNow; }
});

test("cache aquecido não converte datas inválidas ou intervalo invertido em um modelo anterior", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const valid = modelFor(ids[0], {}, { summary: fresh });
  for (const invalid of [
    { now: new Date(NaN) }, { now: "data inválida" },
    { from: new Date(NaN) }, { from: "data inválida" },
    { to: new Date(NaN) }, { to: "data inválida" },
    { from: "2026-09-12T03:00:00Z" },
  ]) {
    for (let retry = 0; retry < 2; retry++) assert.throws(() => modelFor(ids[0], {}, { summary: fresh, ...invalid }), RangeError);
  }
  assert.equal(modelFor(ids[0], {}, { summary: fresh }), valid);
});

test("cache completo distingue dados, recortes, métricas, categorias, fuso e referência de comparação", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const first = modelFor(ids[0], {}, { summary: fresh });
  for (const settings of [{ metric: "count" }, { dimension: "age" }, { categoryKeys: ["Man"] }, { granularity: "day" }]) {
    assert.notEqual(modelFor(ids[0], settings, { summary: fresh }), first);
  }
  assert.notEqual(modelFor(ids[0], {}, { summary: fresh, from: "2026-09-10T03:00:00Z" }), first);
  assert.notEqual(modelFor(ids[0], {}, { summary: fresh, to: "2026-09-10T03:00:00Z" }), first);
  assert.throws(() => modelFor(ids[0], {}, { summary: fresh, timeZone: "Europe/Berlin" }), /fuso/);
  const corrected = demographics.aggregateDemographicBuckets(rows.map((row) => row.gender === "Woman" ? { ...row, gender: "Man" } : row), { timeZone: zone });
  assert.equal(corrected.total, fresh.total);
  const correctedModel = modelFor(ids[0], {}, { summary: corrected });
  assert.notEqual(correctedModel, first, "totais iguais não identificam uma revisão de dados");
  assert.notDeepEqual(correctedModel.table.rows, first.table.rows);
  const comparison = modelFor(ids[4], {}, { summary: fresh });
  const changedReference = modelFor(ids[4], {}, { summary: fresh, comparisonSummary: corrected });
  assert.notEqual(changedReference, comparison);
  assert.notDeepEqual(changedReference.table.rows, comparison.table.rows);
  assert.notEqual(modelFor(ids[4], {}, { summary: fresh, comparisonLabel: "Outro período" }), comparison);
  const recolored = modelFor(ids[4], { palette: "cyber", chartType: "heatmap" }, { summary: fresh, theme: "dark" });
  assert.equal(recolored.table, comparison.table);
});

test("rebase de gênero é feita uma vez por bucket e reutilizada entre seleção, gráfico e tabela", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const before = genderRebaseCalls;
  modelFor(ids[0], {}, { summary: fresh });
  assert.equal(genderRebaseCalls - before, fresh.temporal.bins.length, "tabela e séries não devem refazer os mesmos dois percentuais");
  modelFor(ids[0], { metric: "count", categoryKeys: ["Woman"], chartType: "heatmap" }, { summary: fresh });
  modelFor(ids[0], { categoryKeys: ["Man"] }, { summary: fresh });
  assert.equal(genderRebaseCalls - before, fresh.temporal.bins.length);
});

test("caches temporais são limitados, descartando cortes antigos sem alterar seu resultado", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const begin = Date.parse(input.from) + 60_000;
  const first = modelFor(ids[0], {}, { summary: fresh, now: new Date(begin) });
  for (let minute = 1; minute <= 30; minute++) modelFor(ids[0], {}, { summary: fresh, now: new Date(begin + minute * 60_000) });
  const before = plannerCalls;
  const restored = modelFor(ids[0], {}, { summary: fresh, now: new Date(begin) });
  assert.notEqual(restored, first, "o modelo mais antigo deve sair do cache limitado");
  assert.equal(plannerCalls - before, 1, "o plano antigo também deve sair do cache limitado");
  assert.deepEqual(restored.table, first.table);
  assert.deepEqual(restored.option.series.map((series) => series.data), first.option.series.map((series) => series.data));
});

test("cache não modifica agregações congeladas, tabelas, valores ou preferências", () => {
  const fresh = deepFreeze(structuredClone(summary));
  const stored = deepFreeze({ ...defaults(ids[0]), categoryKeys: ["Woman"] });
  const first = build({ ...input, id: ids[0], summary: fresh, settings: stored });
  deepFreeze(first.table);
  first.option.series.forEach((series) => deepFreeze(series.data));
  const recolored = build({ ...input, id: ids[0], summary: fresh, settings: { ...stored, palette: "cyber", chartType: "heatmap" }, theme: "dark" });
  assert.equal(recolored.table, first.table);
  assert.deepEqual(fresh, summary);
  assert.deepEqual(stored.categoryKeys, ["Woman"]);
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

test("widget oculto retorna metadados baratos sem planejar períodos ou criar tabelas de dados", () => {
  const fresh = demographics.aggregateDemographicBuckets(rows, { timeZone: zone });
  const before = plannerCalls;
  for (const id of ids) {
    const hidden = modelFor(id, {}, { summary: fresh, enabled: false });
    assert.ok(hidden.title);
    assert.ok(hidden.description);
    assert.equal(hidden.hasData, false);
    assert.equal(hidden.pointCount, 0);
    assert.deepEqual(hidden.table.rows, []);
    assert.deepEqual(hidden.option.series, []);
  }
  assert.equal(plannerCalls, before);
  assert.doesNotThrow(() => modelFor(ids[0], {}, { summary: fresh, enabled: false, from: "inválido", to: "inválido", timeZone: "inválido" }), "widgets ocultos não resolvem calendários nem fusos");
});

test("densidade adapta apenas apresentação e preserva todos os dados e tooltips", () => {
  for (const id of ids) {
    const model = modelFor(id);
    const data = structuredClone(model.option.series.map((series) => series.data));
    for (const size of [{ width: 260, height: 120 }, { width: 1360, height: 320 }]) {
      const option = fit(model, size);
      assert.deepEqual(option.series.map((series) => series.data), data);
      assert.equal(option.tooltip, model.option.tooltip);
      assert.ok(option.series.every((series) => series.label.fontSize >= 9));
      if (model.kind === "heatmap" && size.width === 260) assert.equal(option.series[1].label.show, false);
    }
  }
});

test("eixo diário estreito abrevia o ano sem cortar datas ou mudar tooltip e tabela", () => {
  const model = modelFor("demographics_daily_evolution");
  const option = fit(model, { width: 260, height: 120 });
  assert.equal(option.xAxis.axisLabel.formatter("09/09/2026"), "09/09");
  assert.equal(option.xAxis.axisLabel.formatter("10:00"), "10:00");
  assert.equal(option.xAxis.axisLabel.formatter("09/2026"), "09/2026");
  assert.deepEqual(option.xAxis.data, ["09/09/2026", "10/09/2026"]);
  assert.match(option.tooltip.formatter({ data: option.series[0].data[0] }), /09\/09\/2026/);
  assert.equal(model.table.rows[0].period, "09/09/2026");
});

test("um único dia desenha barras distintas sem alterar a preferência, valores ou formato de heatmap", () => {
  for (const chartType of ["line", "area", "bar"]) {
    const settings = { ...defaults("demographics_daily_evolution"), chartType };
    const model = build({ ...input, id: "demographics_daily_evolution", settings, to: "2026-09-10T03:00:00Z" });
    assert.equal(model.pointCount, 1);
    assert.equal(settings.chartType, chartType);
    assert.ok(model.option.series.every((series) => series.type === "bar" && !series.stack && !series.areaStyle));
    assert.deepEqual(model.option.series.map((series) => series.data[0].value), [55.56, 44.44]);
    assert.equal(model.table.rows.find((row) => row.category === "Mulher").percentage, 55.56);
  }
  const heatmap = modelFor("demographics_daily_evolution", { chartType: "heatmap" }, { to: "2026-09-10T03:00:00Z" });
  assert.ok(heatmap.option.series.every((series) => series.type === "heatmap"));
});

test("séries densas em cartões baixos não empilham rótulos sobre a legenda", () => {
  const series = { kind: "series", pointCount: 24, categoryCount: 3 };
  assert.equal(valueLabels(series, { width: 674, height: 120 }), "none");
  assert.equal(valueLabels(series, { width: 1360, height: 320 }), "always");
  assert.equal(valueLabels({ ...series, pointCount: 1 }, { width: 260, height: 120 }), "always");
  assert.equal(valueLabels({ kind: "comparison", pointCount: 3, categoryCount: 2 }, { width: 260, height: 120 }), "always");
  assert.equal(valueLabels({ ...series, kind: "heatmap" }, { width: 1360, height: 320 }), "none");
});

test("cinco widgets em quatro formatos e dois temas geram SVG real sem textura ou valores inválidos", () => {
  const snapshot = structuredClone(summary);
  for (const id of ids) {
    for (const chartType of ["bar", "area", "line", "heatmap"]) {
      for (const theme of ["light", "dark"]) {
        for (const size of [{ width: 260, height: 120 }, { width: 1360, height: 320 }]) {
          const model = modelFor(id, { chartType }, { theme });
          const option = fit(model, size);
          const chart = echarts.init(null, null, { renderer: "svg", ssr: true, ...size });
          try {
            chart.setOption({ ...option, animation: false });
            const svg = chart.renderToSVGString();
            assert.match(svg, /<svg/);
            assert.doesNotMatch(svg, /<pattern\b|url\(#.*pattern|NaN|undefined/);
            assert.doesNotMatch(svg, /Não identificado/);
            assert.notEqual(option.aria.decal.show, true);
            if (model.kind === "heatmap") {
              const colors = option.visualMap[1].inRange.color;
              const maximum = option.visualMap[1].max;
              for (const [seriesIndex, series] of option.series.entries()) {
                const data = chart.getModel().getSeriesByIndex(seriesIndex).getData();
                series.data.forEach((datum, index) => {
                  const graphic = data.getItemGraphicEl(index);
                  assert.ok(graphic, `${id} ${theme}: renderizar célula disponível ou lacuna`);
                  const expected = seriesIndex === 0 ? option.visualMap[0].pieces[0].color : echarts.color.lerp(datum.value[2] / maximum, colors);
                  assert.deepEqual(echarts.color.parse(graphic.style.fill), echarts.color.parse(expected));
                  assert.equal(graphic.style.opacity ?? 1, 1);
                  if (seriesIndex === 1 && series.label.show && datum.value[2] > 0) {
                    const token = heatmapLabelColor(colors, datum.value[2] / maximum) === "#FFFFFF" ? "light" : "dark";
                    const text = graphic.getTextContent();
                    assert.deepEqual(echarts.color.parse(text.style.rich[token].fill), echarts.color.parse(heatmapLabelColor(colors, datum.value[2] / maximum)));
                  }
                });
              }
            }
          } finally { chart.dispose(); }
        }
      }
    }
  }
  assert.deepEqual(summary, snapshot);
});

test("tooltip escapa texto externo e não apresenta emoções como satisfação ou pessoas únicas", () => {
  const model = modelFor("demographics_period_comparison", {}, { comparisonLabel: '<script>"referência"</script>' });
  const datum = model.option.series[1].data[0];
  const tooltip = model.option.tooltip.formatter({ data: datum });
  assert.match(tooltip, /&lt;script&gt;/);
  assert.doesNotMatch(tooltip, /<script>/);
  for (const id of ids) {
    const current = modelFor(id);
    assert.doesNotMatch(current.description, /satisfa[çc][aã]o|pessoas únicas|visitantes únicos/i);
  }
});
