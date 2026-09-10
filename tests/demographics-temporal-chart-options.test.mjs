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
const { buildDemographicTemporalModel: build, fitDemographicTemporalOption: fit, demographicTemporalValueLabels: valueLabels } = load("lib/demographics-temporal-chart-options.ts");
const { DEMOGRAPHICS_TEMPORAL_WIDGET_IDS: ids, defaultDemographicTemporalSettings: defaults } = load("lib/demographics-temporal-preferences.ts");
const { heatmapLabelColor } = load("lib/chart-palette.ts");
const { demographicHeatmapColors } = load("lib/demographics-crossing-options.ts");
const { DEMOGRAPHICS_PALETTES } = load("lib/demographics-presentation.ts");
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
  assert.equal(row.percentage, 73.33);
  assert.notEqual(row.percentage, 60, "não usar média simples dos percentuais diários");
  assert.equal(model.table.rows.filter((row) => row.period === "10h").reduce((total, row) => total + row.percentage, 0), 100);
});

test("selecionar uma categoria não renormaliza o denominador nem altera dados de origem", () => {
  const snapshot = structuredClone(summary);
  const all = modelFor("demographics_emotion_hourly", { dimension: "gender" });
  const selected = modelFor("demographics_emotion_hourly", { dimension: "gender", categoryKeys: ["Woman"] });
  assert.equal(selected.categoryCount, 1);
  assert.deepEqual(selected.table.rows, all.table.rows.filter((row) => row.category === "Mulher"));
  assert.equal(selected.table.rows.find((row) => row.period === "10h").percentage, 73.33);
  assert.deepEqual(summary, snapshot);
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
  }
});

test("heatmaps horários compartilham dark demográfico, preservando light, dados, percentuais e tabelas", () => {
  const snapshot = structuredClone(summary);
  for (const id of ["demographics_emotion_hourly", "demographics_age_hourly"]) {
    for (const { id: palette } of DEMOGRAPHICS_PALETTES) {
      for (const metric of ["count", "percentage"]) {
        const light = modelFor(id, { palette, metric }, { theme: "light" });
        const dark = modelFor(id, { palette, metric }, { theme: "dark" });
        assert.deepEqual(light.option.visualMap[1].inRange.color, demographicHeatmapColors(palette, "light"));
        assert.deepEqual(dark.option.visualMap[1].inRange.color, demographicHeatmapColors(palette, "dark"));
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
  assert.equal(row.current_percentage, 75);
  assert.equal(row.reference_count, 25);
  assert.equal(row.reference_percentage, 25);
  assert.equal(row.change_pp, 50);
  assert.ok(model.table.columns.some((column) => column.key === "change_pp" && column.label.includes("p.p.")));
  assert.ok(model.description.includes(input.comparisonLabel));
});

test("comparativo absoluto calcula deltas e evita infinito quando a referência é zero ou inexistente", () => {
  const count = modelFor("demographics_period_comparison", { metric: "count" });
  const woman = count.table.rows.find((row) => row.category === "Mulher");
  const unknown = count.table.rows.find((row) => row.category === "Não identificado");
  assert.equal(woman.change_count, 125);
  assert.equal(woman.change_count_percentage, 500);
  assert.equal(unknown.reference_count, 0);
  assert.equal(unknown.change_count_percentage, null);
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
        assert.equal(model.table.rows.find((row) => row.category === "Mulher").change_pp, 50);
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

test("modelo diário respeita agregação por dia e histórico extenso promove hora sem milhares de pontos", () => {
  const daily = modelFor("demographics_daily_evolution");
  assert.equal(daily.pointCount, 2);
  assert.deepEqual(daily.option.xAxis.data, ["09/09/2026", "10/09/2026"]);
  const firstWoman = daily.table.rows.find((row) => row.period === "09/09/2026" && row.category === "Mulher");
  assert.equal(firstWoman.count, 50);
  assert.equal(firstWoman.percentage, 50);
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
    assert.deepEqual(model.option.series.map((series) => series.data[0].value), [50, 40, 10]);
    assert.equal(model.table.rows.find((row) => row.category === "Mulher").percentage, 50);
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
