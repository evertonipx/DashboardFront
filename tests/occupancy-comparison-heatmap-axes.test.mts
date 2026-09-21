// Dynamic fixtures intentionally cross injected-module and malformed-input boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const echarts = require("echarts");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = "components/app/occupancy-comparison-widgets.tsx";
const source = readFileSync(resolve(root, sourcePath), "utf8");
const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}h`);
const modules = new Map();
const buildHeatmap = standalone("buildHeatmapOption", {
  ...load("lib/occupancy-heatmap-visual.ts"),
  ...load("components/app/occupancy-chart-palette.ts"),
  ...Object.fromEntries(["escapeTooltip", "formatChartNumber", "metricLabel", "truncateLabel"].map((name) => [name, standalone(name)])),
});

for (const rowKind of ["dias", "cenários"]) {
  for (const theme of ["light", "dark"]) {
    test(`${rowKind}: horas horizontais, linhas ordenadas e renderização imediata em ${theme}`, () => {
      const rows = rowKind === "dias" ? ["ter., 01/09", "qua., 02/09"] : ["Entrada", "Estacionamento"];
      const option = build(rows, theme);
      assert.deepEqual(option.xAxis.data, hours);
      assert.deepEqual(option.yAxis.data, rows);
      assert.equal(option.yAxis.inverse, true);
      assert.deepEqual(option.series[0].data, [[2, 0, -1]]);
      assert.deepEqual(option.series[1].data, [[0, 0, 17], [1, 0, 0], [23, 1, 38]]);
      assert.match(option.tooltip.formatter({ seriesName: "Pico horário", value: [23, 1, 38] }), new RegExp(`${rows[1]} · 23h`));
      assert.match(option.tooltip.formatter({ seriesName: "Sem dados", value: [2, 0, -1] }), /Sem dados/);
      assert.match(option.tooltip.formatter({ seriesName: "Pico horário", value: [1, 0, 0] }), /Pico horário: 0/);
      for (const [width, height] of [[960, 420], [320, 210]] as const) {
        const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
        try {
          chart.setOption(option, { notMerge: true, lazyUpdate: false });
          const svg = chart.renderToSVGString();
          assert.match(svg, /ecmeta_series_index="1"/);
          assert.doesNotMatch(svg, /\bNaN\b|\bInfinity\b/);
          assert.match(svg, />00h<\/text>/);
          assert.match(svg, />23h<\/text>/);
          const firstRow = chart.convertToPixel({ yAxisIndex: 0 }, 0);
          const secondRow = chart.convertToPixel({ yAxisIndex: 0 }, 1);
          assert.ok(firstRow < secondRow, "a primeira categoria deve estar acima da segunda");
          assert.ok(chart.convertToPixel({ xAxisIndex: 0 }, 0) < chart.convertToPixel({ xAxisIndex: 0 }, 23));
        } finally {
          chart.dispose();
        }
      }
    });
  }
}

test("mais linhas preservam acesso ao último cenário e exportação não recorta linhas", () => {
  const rows = Array.from({ length: 30 }, (_, index) => `Cenário ${index + 1}`);
  const cells = rows.flatMap((_, row) => hours.map((_, hour) => ({ x: row, y: hour, value: row + hour })));
  const option = build(rows, "dark", { cells });
  assert.equal(option.dataZoom[0].yAxisIndex, 0);
  assert.equal(option.dataZoom[0].endValue, 13);
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 960, height: 460 });
  try {
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
    chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, startValue: 16, endValue: 29 });
    assert.match(chart.renderToSVGString(), /Cenário 30/);
  } finally {
    chart.dispose();
  }
  const report = build(rows, "light", { cells, interactive: false });
  assert.equal(report.dataZoom, undefined);
  assert.equal(report.yAxis.data.length, 30);
  assert.equal(report.series[1].data.length, 720);
  assert.ok(report.media.every(({ option: media }: RuntimeFixture) => media.dataZoom === undefined));
});

test("tooltips preservam nomes completos escapados e grade não inventa horas futuras", () => {
  const rows = ['<img src=x onerror="alert(1)"> & Entrada extensa'];
  const option = build(rows, "light", { cells: [{ x: 0, y: 3, value: 5 }] });
  const tooltip = option.tooltip.formatter({ seriesName: "Pico horário", value: [3, 0, 5] });
  assert.doesNotMatch(tooltip, /<img/);
  assert.match(tooltip, /&lt;img/);
  assert.match(tooltip, /&amp; Entrada extensa/);
  assert.equal(option.xAxis.data.length, 24);
  assert.equal(option.series[0].data.length, 0);
  assert.equal(option.series[1].data.length, 1);
  assert.deepEqual(option.series[1].data[0], [3, 0, 5]);
});

test("eixo responsivo se adapta a qualquer quantidade de períodos sem assumir 24 horas", () => {
  const minuteLabels = Array.from(
    { length: 60 },
    (_, index) => `12:${String(index).padStart(2, "0")}`,
  );
  const option = build(["Entrada"], "light", {
    cells: [
      { x: 0, y: 0, value: 1 },
      { x: 0, y: 59, value: 2 },
    ],
    granularity: "minute",
    xLabels: minuteLabels,
  });
  const desktopInterval = option.xAxis.axisLabel.interval;
  const compactInterval = option.media[0].option.xAxis.axisLabel.interval;

  assert.equal(option.xAxis.data.length, 60);
  assert.equal(option.dataZoom[0].type, "inside");
  assert.equal(option.dataZoom[0].xAxisIndex, 0);
  assert.equal(option.dataZoom[0].startValue, 36);
  assert.equal(option.dataZoom[0].endValue, 59);
  assert.equal(desktopInterval(0), true);
  assert.equal(desktopInterval(59), true);
  assert.equal(compactInterval(0), true);
  assert.equal(compactInterval(59), true);

  const optionSource = source.slice(
    source.indexOf("function buildHeatmapOption"),
    source.indexOf("function sharedHeatmapMaximum"),
  );
  assert.match(optionSource, /const lastXIndex = Math\.max\(0, xLabels\.length - 1\)/);
  assert.doesNotMatch(optionSource, /index\s*===\s*23/);
});

test("configurador e relatório preservam o ID legado nas cinco granularidades", () => {
  const optionsSource = source.slice(
    source.indexOf("function OccupancyComparisonOptions"),
    source.indexOf("function OccupancyHalfDonutCard"),
  );
  for (const granularity of ["minute", "hour", "day", "week", "month"]) {
    assert.match(optionsSource, new RegExp(`<SelectItem value="${granularity}">`));
  }
  assert.doesNotMatch(optionsSource, /<SelectItem value="(?:semester|year)">/);
  assert.match(
    optionsSource,
    /scenarioPeriodCard && settings\.scenarioHeatmapGranularity === "hour"[\s\S]*?scenarioHourHeatmapDateKey/,
    "a data civil legada deve continuar configurável somente no modo horário",
  );
  assert.match(
    source,
    /id: "occupancy_scenario_hour_heatmap"[\s\S]*?label: `Ocupação por cenários x \$\{occupancyScenarioHeatmapGranularityLabel/,
  );
  assert.doesNotMatch(
    source,
    /id: "occupancy_scenario_(?:minute|day|week|month)_heatmap"/,
    "visões salvas não podem perder o widget por troca de ID",
  );
});

test("tela e exportação consomem o mesmo dataset por período", () => {
  assert.match(
    source,
    /const certifiedScenarioHeatmap[\s\S]*?granularity === "hour"[\s\S]*?certifiedAggregate[\s\S]*?scenarioHeatmapDataset\.scopeKey === scenarioHeatmapScopeKey/,
  );
  assert.match(
    source,
    /<OccupancyScenarioHourHeatmapCard[\s\S]*?buckets=\{certifiedScenarioHeatmap\.buckets\}[\s\S]*?series=\{series\}/,
  );
  assert.match(
    source,
    /scenarioHeatmapBuckets: certifiedScenarioHeatmap\.buckets,[\s\S]*?scenarioHeatmapSeries: certifiedScenarioHeatmap\.series/,
  );
  assert.equal(
    (source.match(/buildOccupancyScenarioPeriodHeatmap\(\{/g) ?? []).length,
    2,
    "a mesma projeção certificada deve alimentar o card e o PDF",
  );
  assert.match(
    source,
    /table:[\s\S]*?period: scenarioPeriodMatrix\.labels\[cell\.y\][\s\S]*?scenario: scenarioPeriodMatrix\.scenarioNames\[cell\.x\]/,
  );
});

test("tela e exportação usam o mesmo mapeamento, sem alterar os índices semânticos da tabela", () => {
  assert.equal(
    (source.match(/xLabels: OCCUPANCY_FIXED_HOUR_LABELS,/g) ?? []).length,
    2,
    "o mapa dias x horas continua com o eixo fixo de 24 horas na tela e na exportação",
  );
  assert.equal(
    (source.match(/xLabels: (?:matrix|scenarioPeriodMatrix)\.labels,/g) ?? [])
      .length,
    2,
    "o mapa por cenários deve compartilhar os labels dinâmicos na tela e exportação",
  );
  assert.equal(
    (source.match(/yLabels: (?:dayHourLabels|dayLabels),/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/yLabels: (?:matrix|scenarioPeriodMatrix)\.scenarioNames,/g) ?? [])
      .length,
    2,
  );
  assert.equal((source.match(/interactive: false,/g) ?? []).length, 2);
  assert.match(source, /hour: OCCUPANCY_FIXED_HOUR_LABELS\[cell\.y\]/);
  assert.match(source, /period: scenarioPeriodMatrix\.labels\[cell\.y\]/);
  assert.match(source, /scenario: scenarioPeriodMatrix\.scenarioNames\[cell\.x\]/);
});

function build(rows: RuntimeFixture, theme: RuntimeFixture, overrides: Record<string, RuntimeFixture> = {}) {
  return buildHeatmap({
    cells: [{ x: 0, y: 0, value: 17 }, { x: 0, y: 1, value: 0 }, { x: 0, y: 2, value: null }, { x: 1, y: 23, value: 38 }],
    maximum: 38, metric: "peak", theme, widgetColor: "#1267C4", xLabels: hours, yLabels: rows, ...overrides,
  });
}

function standalone(name: RuntimeFixture, bindings: Record<string, RuntimeFixture> = {}) {
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} deve existir`);
  const output = ts.transpileModule(`${declaration.getText(ast)}\nmodule.exports = ${name};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: sourcePath }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("module", ...Object.keys(bindings), output)(loaded, ...Object.values(bindings));
  return loaded.exports;
}

function load(relativePath: string): RuntimeFixture {
  if (modules.has(relativePath)) return modules.get(relativePath).exports;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  modules.set(relativePath, loaded);
  const output = ts.transpileModule(readFileSync(resolve(root, relativePath), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relativePath }).outputText;
  new Function("exports", "require", "module", output)(loaded.exports, (specifier: string) => specifier.startsWith("@/") ? load(`${specifier.slice(2)}.ts`) : require(specifier), loaded);
  return loaded.exports;
}
