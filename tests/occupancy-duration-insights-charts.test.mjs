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
const modelModule = load("lib/occupancy-duration-insights.ts");
const charts = load("components/app/occupancy-duration-insights-widgets.tsx");
const month = modelModule.buildOccupancyDurationInsightMonth(new Date("2026-09-02T06:00:00Z"), "America/Sao_Paulo");
const series = [{
  scenarioId: "scenario-a",
  name: '<img src=x onerror="alert(1)"> & Entrada',
  hours: [
    hour("2026-09-01", 0, 3600, 0, 0, 0),
    hour("2026-09-01", 1, 0, 3600, 0, 0),
    hour("2026-09-01", 2, 0, 0, 1800, 1800),
    hour("2026-09-02", 0, 900, 900, 900, 900),
  ],
}];
const model = modelModule.buildOccupancyDurationInsightModel(series, month);

for (const theme of ["light", "dark"]) {
  for (const kind of charts.OCCUPANCY_DURATION_INSIGHT_CARD_IDS) {
    test(`${kind} renderiza no primeiro frame em ${theme}, inclusive compacto`, () => {
      const option = build(kind, theme);
      for (const [width, height] of [[900, 430], [320, 190]]) {
        const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
        try {
          chart.setOption(option, { notMerge: true, lazyUpdate: false });
          const svg = chart.renderToSVGString();
          assert.ok(svg.length > 2000, "a visualização deve produzir conteúdo sem interação");
          assert.match(svg, /ecmeta_series_index="0"/);
          assert.doesNotMatch(svg, /\bNaN\b|\bInfinity\b/);
          const rendered = chart.getOption();
          if (kind.endsWith("heatmap")) {
            assert.equal(rendered.visualMap[0].min, 0);
            assert.equal(rendered.visualMap[0].max, 100);
            assert.equal(rendered.visualMap[0].dimension, 2);
            assert.deepEqual(rendered.visualMap[0].seriesIndex, [0]);
          }
        } finally {
          chart.dispose();
        }
      }
    });
  }
}

test("calendário distingue 0% confirmado, ausência e futuro sem omitir dia 1 ou hora 23", () => {
  const option = build("occupancy_duration_month_heatmap", "light");
  assert.equal(option.xAxis.data[0], "01");
  assert.equal(option.xAxis.data.at(-1), "30");
  assert.equal(option.yAxis.data[0], "00h");
  assert.equal(option.yAxis.data.at(-1), "23h");
  assert.equal(option.yAxis.inverse, true);
  const occupied = option.series[0].data.find((point) => point.value[0] === 0 && point.value[1] === 0);
  const zero = option.series[0].data.find((point) => point.value[0] === 0 && point.value[1] === 1);
  const missing = option.series[1].data.find((point) => point.value[0] === 0 && point.value[1] === 3);
  const future = option.series[2].data.find((point) => point.value[0] === 2 && point.value[1] === 0);
  assert.equal(occupied.value[2], 100);
  assert.equal(zero.value[2], 0);
  assert.ok(missing);
  assert.ok(future);
  assert.notEqual(option.series[1].itemStyle.color, option.visualMap[0].inRange.color[0]);
  assert.notEqual(option.series[2].itemStyle.color, option.series[1].itemStyle.color);
  assert.match(option.tooltip.formatter({ data: zero }), /Ocupado confirmado: <strong>0%<\/strong>/);
  assert.match(option.tooltip.formatter({ data: zero }), /01\/09\/2026 · 01h/);
  assert.match(option.tooltip.formatter({ data: missing }), /Sem tempo ocupado ou livre confirmado/);
  assert.match(option.tooltip.formatter({ data: future }), /Intervalo ainda não decorrido/);
  assert.equal(option.series.reduce((sum, item) => sum + item.data.length, 0), month.dateKeys.length * 24);
  const transition = option.series[3].data.find((point) => point.value[0] === 0 && point.value[1] === 2);
  assert.ok(transition);
  assert.notEqual(option.series[3].itemStyle.color, option.series[1].itemStyle.color);
});

test("eixos semanais e por cenário preservam o domínio completo e tooltip escapa nomes", () => {
  const scenario = build("occupancy_duration_scenario_heatmap", "dark");
  const weekly = build("occupancy_duration_week_heatmap", "dark");
  assert.deepEqual(weekly.xAxis.data, ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
  assert.deepEqual(weekly.yAxis.data, Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}h`));
  assert.equal(weekly.yAxis.inverse, true);
  assert.equal(scenario.xAxis.data.length, 24);
  assert.deepEqual(scenario.yAxis.data, series.map((item) => item.name));
  const point = scenario.series[0].data[0];
  const tooltip = scenario.tooltip.formatter({ data: point });
  assert.doesNotMatch(tooltip, /<img/);
  assert.match(tooltip, /&lt;img/);
  assert.match(tooltip, /&amp; Entrada/);
  assert.match(tooltip, /Tempo decorrido/);
  const tuesday = weekly.series[0].data.find((item) => item.value[0] === 1 && item.value[1] === 0);
  assert.ok(tuesday);
  assert.equal(tuesday.value[2], 100);
  assert.match(weekly.tooltip.formatter({ data: tuesday }), /Ter · 00h/);
});

test("rótulos dos heatmaps não colidem e preservam 00h/23h em tamanhos intermediários e compactos", () => {
  const selected = Array.from({ length: 20 }, (_, index) => ({ ...series[0], scenarioId: `scenario-${index}`, name: `${index + 1}. Estacionamento e praça de alimentação` }));
  const selectedModel = modelModule.buildOccupancyDurationInsightModel(selected, month);
  for (const theme of ["light", "dark"]) {
    for (const kind of charts.OCCUPANCY_DURATION_INSIGHT_CARD_IDS.filter((item) => item.endsWith("heatmap"))) {
      for (const [width, height] of [[900, 430], [636, 330], [320, 190]]) {
        const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
        try {
          chart.setOption(charts.buildOccupancyDurationInsightOption({ kind, model: selectedModel, month, scenarioNames: selected.map((item) => item.name), theme }), { notMerge: true, lazyUpdate: false });
          const context = `${kind} ${theme} ${width}x${height}`;
          const horizontal = axisLabelRects(chart, "xAxis").sort((a, b) => a.rect.x - b.rect.x);
          const vertical = axisLabelRects(chart, "yAxis").sort((a, b) => a.rect.y - b.rect.y);
          const hours = kind === "occupancy_duration_scenario_heatmap" ? horizontal : vertical;
          assert.equal(hours[0].text, "00h", context);
          assert.equal(hours.at(-1).text, "23h", context);
          assert.ok(vertical.length > 1, context);
          for (let index = 1; index < horizontal.length; index++) {
            const previous = horizontal[index - 1];
            const current = horizontal[index];
            assert.ok(previous.rect.x + previous.rect.width <= current.rect.x + 0.5, `${context}: ${previous.text} e ${current.text} não podem se sobrepor`);
          }
          for (let index = 1; index < vertical.length; index++) {
            const previous = vertical[index - 1];
            const current = vertical[index];
            assert.ok(previous.rect.y + previous.rect.height <= current.rect.y + 0.5, `${context}: ${previous.text} e ${current.text} não podem se sobrepor`);
          }
          if (kind === "occupancy_duration_month_heatmap") {
            assert.equal(horizontal[0].text, "01", context);
            assert.equal(horizontal.at(-1).text, "30", context);
          } else if (kind === "occupancy_duration_week_heatmap") {
            assert.deepEqual(horizontal.map((label) => label.text), ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"], context);
          }
        } finally {
          chart.dispose();
        }
      }
    }
  }
});

test("composição diária fecha em 100%, futuro permanece vazio e legenda acompanha cada cor", () => {
  const option = build("occupancy_duration_daily_profile", "light");
  for (let index = 0; index < model.days.length; index++) {
    const values = option.series.map((item) => item.data[index]);
    if (model.days[index].expectedSeconds > 0) {
      assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) < 1e-9);
    } else {
      assert.deepEqual(values, [null, null, null, null]);
    }
  }
  option.series.forEach((item, index) => {
    assert.equal(item.name, option.legend.data[index].name);
    assert.equal(item.itemStyle.color, option.legend.data[index].itemStyle.color);
    assert.equal(item.itemStyle.color, option.color[index]);
  });
  assert.equal(new Set(option.color).size, 4);
  assert.equal(option.yAxis.max, 100);
});

test("seleções grandes preservam todos os cenários com navegação vertical legível", () => {
  const selected = Array.from({ length: 20 }, (_, index) => ({ ...series[0], scenarioId: `scenario-${index}`, name: `Cenário ${index + 1}` }));
  const largeModel = modelModule.buildOccupancyDurationInsightModel(selected, month);
  const option = charts.buildOccupancyDurationInsightOption({ kind: "occupancy_duration_scenario_heatmap", model: largeModel, month, scenarioNames: selected.map((item) => item.name), theme: "light" });
  assert.equal(option.yAxis.data.length, 20);
  assert.equal(option.dataZoom[0].yAxisIndex, 0);
  assert.equal(option.dataZoom[0].endValue, 11);
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 900, height: 430 });
  try {
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
    assert.ok(chart.renderToSVGString().length > 2000);
    chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, startValue: 12, endValue: 19 });
    const finalPage = chart.renderToSVGString();
    assert.match(finalPage, /Cenário 20/);
    assert.equal(chart.getOption().dataZoom[0].endValue, 19);
  } finally {
    chart.dispose();
  }
});

test("rótulos diários estreitos mantêm todos os dígitos sobre fundo contrastante", () => {
  const labelModel = {
    ...model,
    days: model.days.map((day, index) => index === 0 ? {
      ...day, expectedSeconds: 86400, confirmedOccupiedSeconds: 32340,
      confirmedFreeSeconds: 54000, transitionSeconds: 60, unknownSeconds: 0,
    } : day),
  };
  for (const theme of ["light", "dark"]) {
    for (const width of [380, 636, 1100]) {
      const option = charts.buildOccupancyDurationInsightOption({ kind: "occupancy_duration_daily_profile", model: labelModel, month, scenarioNames: ["Entrada"], theme });
      const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height: 360 });
      try {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
        const label = chart.getModel().getSeriesByIndex(0).getData().getItemGraphicEl(0).getTextContent();
        assert.equal(label.style.text, width <= 950 ? "{value|37%}" : "{value|37,4%}");
        assert.equal(label.style.fill, theme === "dark" ? "#E2E8F0" : "#13233A");
        assert.equal(label.style.rich.value.backgroundColor, theme === "dark" ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.94)");
        assert.deepEqual(label.style.rich.value.padding, [1, 2, 1, 2]);
        const smallLabel = chart.getModel().getSeriesByIndex(1).getData().getItemGraphicEl(0).getTextContent();
        assert.equal(smallLabel.style.text, "");
        assert.equal(smallLabel.style.backgroundColor, undefined);
        assert.equal(smallLabel.style.padding, undefined);
        assert.equal(smallLabel.getBoundingRect().width, 0, "segmentos pequenos não devem desenhar pílulas vazias");
        const svg = chart.renderToSVGString();
        assert.match(svg, width <= 950 ? />37%<\/text>/ : />37,4%<\/text>/);
      } finally {
        chart.dispose();
      }
    }
  }
});

test("composição de cenários usa tempo somado, sem somar percentuais ou sugerir permanência individual", () => {
  const selected = [series[0], { scenarioId: "scenario-b", name: "Saída", hours: [hour("2026-09-01", 0, 0, 3600, 0, 0)] }];
  const combined = modelModule.buildOccupancyDurationInsightModel(selected, month);
  const option = charts.buildOccupancyDurationInsightOption({ kind: "occupancy_duration_month_heatmap", model: combined, month, scenarioNames: selected.map((item) => item.name), theme: "light" });
  const point = option.series[0].data.find((item) => item.value[0] === 0 && item.value[1] === 0);
  assert.equal(point.value[2], 50);
  const tooltip = option.tooltip.formatter({ data: point });
  assert.match(tooltip, /Tempo somado de 2 cenários: 2h/);
  assert.match(tooltip, /Durações simultâneas de cenários são somadas/);
});

test("exportação usa tema claro, unidades legíveis e ausência nunca vira 0% confirmado", () => {
  for (const kind of charts.OCCUPANCY_DURATION_INSIGHT_CARD_IDS) {
    const report = charts.buildOccupancyDurationInsightReport({ kind, series, month });
    assert.equal(report.title, charts.OCCUPANCY_DURATION_INSIGHT_LABELS[kind]);
    assert.equal(report.option.tooltip.backgroundColor, "#FFFFFF");
    assert.ok(report.table.rows.length);
    assert.ok(report.table.rows.every((row) => typeof row.elapsed === "string"));
    assert.ok(report.table.rows.every((row) => /[hmsd]/.test(row.occupied)));
    assert.ok(report.table.columns.some((column) => column.key === "unknown"));
    const displayed = build(kind, "light");
    assert.deepEqual(report.option.xAxis.data, displayed.xAxis.data, "a exportação deve preservar a orientação horizontal exibida");
    assert.deepEqual(report.option.yAxis.data, displayed.yAxis.data, "a exportação deve preservar a orientação vertical exibida");
  }
  const report = charts.buildOccupancyDurationInsightReport({ kind: "occupancy_duration_month_heatmap", series, month });
  const missing = report.table.rows.find((row) => row.period === "01/09/2026 · 03h");
  const zero = report.table.rows.find((row) => row.period === "01/09/2026 · 01h");
  assert.equal(missing.occupiedPercent, null);
  assert.equal(zero.occupiedPercent, 0);
  assert.ok(report.table.rows.every((row) => !row.period.startsWith("03/09/2026")));
});

function build(kind, theme) {
  return charts.buildOccupancyDurationInsightOption({ kind, model, month, scenarioNames: series.map((item) => item.name), theme, widgetColor: "#1267C4" });
}

function hour(dateKey, hour, confirmedOccupiedSeconds, confirmedFreeSeconds, transitionSeconds, unknownSeconds) {
  return { dateKey, hour, confirmedOccupiedSeconds, confirmedFreeSeconds, transitionSeconds, unknownSeconds, expectedSeconds: confirmedOccupiedSeconds + confirmedFreeSeconds + transitionSeconds + unknownSeconds };
}

function axisLabelRects(chart, axis) {
  const labels = [];
  const axisModel = chart.getModel().getComponent(axis);
  chart.getViewOfComponentModel(axisModel).group.traverse((element) => {
    if (element.type !== "text" || element.ignore || element.invisible || !element.style.text) return;
    const rect = element.getBoundingRect().clone();
    rect.applyTransform(element.getComputedTransform());
    labels.push({ text: element.style.text, rect });
  });
  return labels;
}

function load(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  if (modules.has(filename)) return modules.get(filename).exports;
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return require(specifier);
    // The options/report builders run without mounting React or importing
    // dashboard providers. Their data and palette dependencies remain real.
    if (specifier.startsWith("@/components/") && specifier !== "@/components/app/occupancy-chart-palette") return {};
    const path = specifier.slice(2);
    return load(existsSync(resolve(projectRoot, `${path}.ts`)) ? `${path}.ts` : `${path}.tsx`);
  };
  new Function("exports", "require", "module", output)(loaded.exports, localRequire, loaded);
  return loaded.exports;
}
