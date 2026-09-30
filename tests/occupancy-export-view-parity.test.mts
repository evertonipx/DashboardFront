import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function componentSource(file: string) {
  return readFileSync(resolve(projectRoot, "components/app", file), "utf8");
}

const liveSource = componentSource("occupancy-scenario-dashboard.tsx");
const reportsSource = componentSource("occupancy-reports-dashboard.tsx");

test("exportação Ao Vivo mantém ordem, visibilidade, títulos, tipos e paleta da visão", () => {
  const parsed = ts.createSourceFile(
    "occupancy-scenario-dashboard.tsx",
    liveSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const builder = parsed.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "buildOccupancyDashboardReport",
  );
  assert.ok(builder, "montador do relatório Ao Vivo ausente");
  const compiled = ts.transpileModule(
    `${builder.getText(parsed)}\nreturn buildOccupancyDashboardReport(input);`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const bindings = {
    buildOccupancyReportChart: ({ title, palette, chartType }: {
      title: string;
      palette: { current: string };
      chartType: string;
    }) => ({ title, option: { color: palette.current, chartType }, table: { title: `Dados - ${title}` } }),
    formatDateTime: () => "data",
    occupancyReportDataCompleteUntil: () => null,
    reportDateSlug: () => "2026-09-30",
    reportOccupancyValue: (value: number | null) => value ?? "—",
    resolveOccupancyChartPaletteFromColors: (_theme: string, colors: string[], override: string) => ({
      current: override,
      colors,
    }),
  };
  const input = {
    activeAreas: 1,
    alerts: [],
    alertsError: "",
    chartData: {
      occupancy_chart_day: { points: [{ bucket: "2026-09-30", current: 2 }] },
      occupancy_chart_hour: { points: [{ bucket: "2026-09-30T10:00:00Z", current: 3 }] },
    },
    chartDefinitions: [
      { id: "occupancy_chart_hour", label: "Hora", granularity: "hour" },
      { id: "occupancy_chart_day", label: "Dia", granularity: "day" },
    ],
    chartTypeByCardId: new Map([["occupancy_custom_trend", "line"]]),
    colorByCardId: new Map([["occupancy_chart_day", "#123456"]]),
    currentTotal: 2,
    customWidgets: [{ id: "trend", kind: "trend", granularity: "hour", title: "Minha tendência", series: {} }],
    generatedAt: new Date("2026-09-30T12:00:00Z"),
    history: null,
    lastReading: { asOf: null, value: 2 },
    metricVisibility: {},
    occupancyComparisonReportAssets: [],
    occupancyDurationDataCompleteUntil: undefined,
    occupancyDurationReportAssets: [],
    occupancyDurationReportContext: [],
    occupancyDurationReportMetrics: [],
    occupancyDurationReportWarnings: [],
    occupancyDurationInsightReportAssets: [],
    occupancyDurationInsightDataCompleteUntil: undefined,
    occupancyLoiteringReportAssets: [],
    palette: { current: "#1267C4" },
    scenario: { areas: [], id: "scenario-1" },
    timeZone: "America/Sao_Paulo",
    titleByCardId: new Map([
      ["occupancy_custom_trend", "Tendência editada"],
      ["occupancy_chart_day", "Dia editado"],
      ["occupancy_current_total", "Total editado"],
    ]),
    todayMetric: { average: 2, minimum: 1, peak: 4 },
    utilization: 0.2,
    visibleCardIds: ["occupancy_custom_trend", "occupancy_current_total", "occupancy_chart_day"],
    viewPaletteColors: ["#AA0000", "#00AA00"],
  };
  const build = new Function(
    ...Object.keys(bindings),
    "input",
    compiled,
  ) as (...args: unknown[]) => {
    charts: Array<{ title: string; option: { color: string; chartType: string } }>;
    metrics: Array<{ label: string }>;
  };
  const report = build(...Object.values(bindings), input);
  assert.deepEqual(report.charts.map((chart) => chart.title), ["Tendência editada", "Dia editado"]);
  assert.deepEqual(report.metrics.map((metric) => metric.label), ["Total editado"]);
  assert.equal(report.charts[0].option.chartType, "line");
  assert.equal(report.charts[0].option.color, "#AA0000");
  assert.equal(report.charts[1].option.color, "#123456");
});

test("exportação Ao Vivo carrega apenas séries visíveis ausentes ou fora da janela atual", () => {
  assert.match(liveSource, /if \(!occupancyPreferencesReady\) \{\s*throw new Error\("Aguarde a configuração da visão/);
  assert.match(liveSource, /if \(!visibleCardIds\.length\) \{\s*throw new Error\("Ative ao menos um widget/);
  assert.match(liveSource, /!visibleOccupancyCardIds\.length/);
  assert.match(liveSource, /const visibleChartDefinitions = chartDefinitions\.filter\(/);
  assert.match(liveSource, /visibleCardIdSet\.has\(definition\.id\)/);
  assert.match(liveSource, /visibleTrendGranularities\.has\(definition\.granularity\)/);
  assert.match(liveSource, /matchesCurrentWindow &&\s*occupancyDataPlan\.granularities\.includes/);
  assert.match(liveSource, /const state = await loadExportChartState\(definition\)/);
  assert.match(liveSource, /chartData: exportedChartData/);
  assert.match(liveSource, /Não foi possível exportar o gráfico/);
});

test("Análises e Relatórios usam a paleta da visão e omitem comparação inválida", () => {
  assert.match(reportsSource, /if \(!orderedVisibleReportCardIds\.length\) \{\s*throw new Error\("Ative ao menos um widget/);
  assert.match(reportsSource, /const configuredViewPaletteId = layoutPreferences\.find/);
  assert.match(reportsSource, /configuredViewPalette\s*\? resolveOccupancyChartPaletteFromColors/);
  assert.match(reportsSource, /Boolean\(previousState && !previousState\.error && !previousState\.incomplete\)/);
  assert.match(reportsSource, /configuredViewPalette\?\.id \?\? analysisWidgetSettings\.colorPaletteId/);
  assert.match(reportsSource, /charts: orderedVisibleReportCardIds\.flatMap/);
});
