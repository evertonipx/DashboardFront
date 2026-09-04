import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const echarts = require("echarts");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const aggregateTime = loadTypeScriptModule("lib/aggregate-time.ts");
const aggregateHourQuery = loadTypeScriptModule(
  "lib/aggregate-hour-query.ts",
);
const aggregateMinuteDayQuery = loadTypeScriptModule(
  "lib/aggregate-minute-day-query.ts",
);
const aggregateRangeQuery = loadTypeScriptModule(
  "lib/aggregate-range-query.ts",
);
const aggregateReconciliation = loadTypeScriptModule(
  "lib/aggregate-reconciliation.ts",
);
const aggregateQueryPlan = loadTypeScriptModule(
  "lib/aggregate-query-plan.ts",
);
const chartPalette = loadTypeScriptModule("lib/chart-palette.ts");
const chartCalendarAxis = loadTypeScriptModule("lib/chart-calendar-axis.ts");
const chartSeriesColors = loadTypeScriptModule("lib/chart-series-colors.ts");
const chartValueLabels = loadTypeScriptModule("lib/chart-value-labels.ts");
const cardLayoutSizing = loadTypeScriptModule("lib/card-layout-sizing.ts");
const widgetBentoPreviewLayout = loadTypeScriptModule(
  "lib/widget-bento-preview-layout.ts",
);
const widgetBentoPreviewContent = loadTypeScriptModule(
  "lib/widget-bento-preview-content.ts",
);
const companyTimeZone = loadTypeScriptModule("lib/company-time-zone.ts");
const countingTimeZone = loadTypeScriptModule("lib/counting-time-zone.ts");
const countingIntelligence = loadTypeScriptModule(
  "lib/counting-intelligence.ts",
);
const countingAnalysisRangePlan = loadTypeScriptModule(
  "lib/counting-analysis-range-plan.ts",
);
const liveAnnualComparison = loadTypeScriptModule(
  "lib/live-annual-comparison.ts",
);
const liveDashboardSettings = loadTypeScriptModule(
  "lib/live-dashboard-settings.ts",
);
const liveOperationalSettings = loadTypeScriptModule(
  "lib/live-operational-settings.ts",
);
const countingReportPeriod = loadTypeScriptModule(
  "lib/counting-report-period.ts",
);
const countingReportViewSettings = loadTypeScriptModule(
  "lib/counting-report-view-settings.ts",
);
const currentYearChart = loadTypeScriptModule("lib/current-year-chart.ts");
const operationalTrendStyle = loadTypeScriptModule(
  "lib/operational-trend-style.ts",
);
const masterCompanyScope = loadTypeScriptModule(
  "lib/master-company-scope.ts",
);
const dashboardFocus = loadTypeScriptModule("lib/dashboard-focus.ts");
const occupancyChartPalette = loadTypeScriptModule(
  "components/app/occupancy-chart-palette.ts",
);
const hourlyAxis = loadTypeScriptModule("lib/hourly-axis.ts");
const minuteAxis = loadTypeScriptModule("lib/minute-axis.ts");
const metadataValidation = loadTypeScriptModule(
  "lib/metadata-validation.ts",
);
const workerScope = loadTypeScriptModule("lib/worker-scope.ts");
const occupancyAggregateValidation = loadTypeScriptModule(
  "lib/occupancy-aggregate-validation.ts",
);
const occupancyBucketTime = loadTypeScriptModule(
  "lib/occupancy-bucket-time.ts",
);
const occupancyDuration = loadTypeScriptModule(
  "lib/occupancy-duration.ts",
);
const occupancyAnalysisWindow = loadTypeScriptModule(
  "lib/occupancy-analysis-window.ts",
);
const analysisPeriodSelection = loadTypeScriptModule(
  "lib/analysis-period-selection.ts",
);
const occupancyAreaOptions = loadTypeScriptModule(
  "lib/occupancy-area-options.ts",
);
const occupancyAreas = loadTypeScriptModule("lib/occupancy-areas.ts");
const occupancyMetrics = loadTypeScriptModule(
  "lib/occupancy-metrics.ts",
);
const occupancyObjectClass = loadTypeScriptModule(
  "lib/occupancy-object-class.ts",
);
const occupancyHourAxis = loadTypeScriptModule(
  "lib/occupancy-hour-axis.ts",
);
const occupancyHeatmapVisual = loadTypeScriptModule(
  "lib/occupancy-heatmap-visual.ts",
);
const occupancyHexLayout = loadTypeScriptModule(
  "lib/occupancy-hex-layout.ts",
);
const occupancyHexPalette = loadTypeScriptModule(
  "lib/occupancy-hex-palette.ts",
);
const occupancyHexEditorState = loadTypeScriptModule(
  "lib/occupancy-hex-editor-state.ts",
);
const occupancyHexVisual = loadTypeScriptModule(
  "lib/occupancy-hex-visual.ts",
);
const occupancyComparison = loadTypeScriptModule(
  "lib/occupancy-comparison.ts",
);
const occupancyColorPalettes = loadTypeScriptModule(
  "lib/occupancy-color-palettes.ts",
);
const occupancyScenarioColors = loadTypeScriptModule(
  "lib/occupancy-scenario-color.ts",
);
const occupancyReportComparison = loadTypeScriptModule(
  "lib/occupancy-report-comparison.ts",
);
const occupancySnapshotsProxy = loadTypeScriptModule(
  "lib/occupancy-snapshots-proxy.ts",
);
const occupancyWidgetSettings = loadTypeScriptModule(
  "lib/occupancy-widget-settings.ts",
);
const occupancyCustomWidgets = loadTypeScriptModule(
  "lib/occupancy-custom-widgets.ts",
);
const occupancyDashboardSettings = loadTypeScriptModule(
  "lib/occupancy-dashboard-settings.ts",
);
const occupancyValidation = loadTypeScriptModule(
  "lib/occupancy-validation.ts",
);
const occupancySeries = loadTypeScriptModule(
  "lib/hourly-occupancy-series.ts",
);
const periodAnalysisModel = loadTypeScriptModule(
  "lib/period-analysis-model.ts",
);
const periodAnalysisWidgets = loadTypeScriptModule(
  "lib/period-analysis-widgets.ts",
);
const realtimeCustomWidgets = loadTypeScriptModule(
  "lib/realtime-custom-widgets.ts",
);
const reportCustomWidgets = loadTypeScriptModule(
  "lib/report-custom-widgets.ts",
);
const requestCancellation = loadTypeScriptModule(
  "lib/request-cancellation.ts",
);
const scenarioAnalytics = loadTypeScriptModule("lib/scenario-analytics.ts");
const scenarioValidation = loadTypeScriptModule(
  "lib/scenario-validation.ts",
);
const tenantScopeValidation = loadTypeScriptModule(
  "lib/tenant-scope-validation.ts",
);
const viewPreferences = loadTypeScriptModule("lib/view-preferences.ts");
const widgetScenarioSelection = loadTypeScriptModule(
  "lib/widget-scenario-selection.ts",
);
const userGridLocal = loadTypeScriptModule("lib/user-grid-local.ts");
const videoWall = loadTypeScriptModule("lib/video-wall.ts");
const viewLinkReference = loadTypeScriptModule(
  "lib/view-link-reference.ts",
);
const widgetViewPresets = loadTypeScriptModule("lib/widget-view-presets.ts");

test("proxy de snapshots preserva erro e nunca converte ausência em zero", async () => {
  const routeSource = readFileSync(
    resolve(projectRoot, "app/api/v1/occupancy/snapshots/route.ts"),
    "utf8",
  );
  assert.match(routeSource, /resolveOccupancySnapshotsProxyResult\(response\)/);
  assert.doesNotMatch(routeSource, /status === 404|status === 405|data: \[\]/);

  const unavailable =
    await occupancySnapshotsProxy.resolveOccupancySnapshotsProxyResult(null);
  assert.equal(unavailable.status, 502);
  assert.equal(Object.hasOwn(unavailable.payload, "data"), false);

  const notFound =
    await occupancySnapshotsProxy.resolveOccupancySnapshotsProxyResult(
      new Response(JSON.stringify({ error: "rota ausente" }), {
        headers: { "content-type": "application/json" },
        status: 404,
      }),
    );
  assert.deepEqual(notFound, {
    payload: { error: "rota ausente" },
    status: 404,
  });

  const methodNotAllowed =
    await occupancySnapshotsProxy.resolveOccupancySnapshotsProxyResult(
      new Response("método ausente", { status: 405 }),
    );
  assert.equal(methodNotAllowed.status, 405);
  assert.equal(Object.hasOwn(methodNotAllowed.payload, "data"), false);

  const invalidSuccess =
    await occupancySnapshotsProxy.resolveOccupancySnapshotsProxyResult(
      new Response("resposta inválida", { status: 200 }),
    );
  assert.equal(invalidSuccess.status, 502);
  assert.equal(Object.hasOwn(invalidSuccess.payload, "data"), false);

  const nullSuccess =
    await occupancySnapshotsProxy.resolveOccupancySnapshotsProxyResult(
      new Response("null", {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
  assert.equal(nullSuccess.status, 502);
  assert.equal(Object.hasOwn(nullSuccess.payload, "data"), false);

  const certified =
    await occupancySnapshotsProxy.resolveOccupancySnapshotsProxyResult(
      new Response(JSON.stringify({ data: [{ total: 0 }] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
  assert.deepEqual(certified, {
    payload: { data: [{ total: 0 }] },
    status: 200,
  });
});

test("exportação não transforma corte temporal ausente no relógio do navegador", () => {
  const exportSource = readFileSync(
    resolve(projectRoot, "lib/report-export.ts"),
    "utf8",
  );
  const occupancyReportsSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );

  assert.match(exportSource, /dataCompleteUntil: Date \| null/);
  assert.match(exportSource, /Atualização dos dados não informada/);
  assert.doesNotMatch(
    exportSource,
    /dataCompleteUntil\s*\?\?\s*payload\.generatedAt/,
  );
  assert.match(
    occupancyReportsSource,
    /resolveCertifiedOccupancyDataCutoff\(\s*reportCertificationSources/,
  );
  assert.match(
    occupancyReportsSource,
    /reportDataCompleteUntil === null/,
  );
});

test("comparação de ocupação distingue zero certificado de ausência", () => {
  const snapshots = [
    { name: "Fila A", scenarioId: "a", total: 0 },
    { name: "Fila B", scenarioId: "b", total: 3 },
    { name: "Fila C", scenarioId: "c", total: null },
  ];

  assert.equal(occupancyComparison.classifyOccupancyTotal(0), "unoccupied");
  assert.equal(occupancyComparison.classifyOccupancyTotal(3), "occupied");
  assert.equal(occupancyComparison.classifyOccupancyTotal(null), "unknown");
  assert.deepEqual(
    occupancyComparison
      .filterOccupancySnapshots(snapshots, "unoccupied")
      .map((snapshot) => snapshot.scenarioId),
    ["a"],
  );
  assert.deepEqual(
    occupancyComparison
      .filterOccupancySnapshots(snapshots, "occupied")
      .map((snapshot) => snapshot.scenarioId),
    ["b"],
  );
});

test("meia rosca alterna estado e ocupação real sem apagar cenário zero", () => {
  const snapshots = [
    { name: "Posto livre", scenarioId: "free", total: 0 },
    { name: "Fila ocupada", scenarioId: "busy", total: 7 },
    { name: "Sem dados", scenarioId: "missing", total: null },
  ];
  const status = occupancyComparison.buildOccupancyHalfDonutEntries(
    snapshots,
    "status",
  );
  const actual = occupancyComparison.buildOccupancyHalfDonutEntries(
    snapshots,
    "actual",
  );

  assert.deepEqual(
    status.map((entry) => [entry.scenarioId, entry.chartValue, entry.state, entry.total]),
    [
      ["free", 1, "unoccupied", 0],
      ["busy", 1, "occupied", 7],
    ],
  );
  assert.deepEqual(
    actual.map((entry) => [entry.scenarioId, entry.chartValue, entry.total]),
    [
      ["free", 0, 0],
      ["busy", 7, 7],
    ],
  );
  assert.equal(actual.some((entry) => entry.scenarioId === "missing"), false);

  const afterValueChange = occupancyComparison.buildOccupancyHalfDonutEntries(
    [
      { name: "Posto livre", scenarioId: "free", total: 12 },
      { name: "Fila ocupada", scenarioId: "busy", total: 1 },
    ],
    "actual",
  );
  assert.deepEqual(
    afterValueChange.map((entry) => entry.scenarioId),
    ["free", "busy"],
    "a ordem original dos cenários não pode variar com a ocupação",
  );
});

test("barras atuais preservam ordem, zero e ausência nos dois modos", () => {
  const snapshots = [
    { name: "Livre", scenarioId: "free", total: 0 },
    { name: "Sem dados", scenarioId: "missing", total: null },
    { name: "Ocupado", scenarioId: "busy", total: 9 },
  ];
  const actual = occupancyComparison.buildOccupancyComparisonBarEntries(
    snapshots,
    "actual",
  );
  const status = occupancyComparison.buildOccupancyComparisonBarEntries(
    snapshots,
    "status",
  );

  assert.deepEqual(
    actual.map((entry) => [entry.scenarioId, entry.chartValue, entry.state, entry.total]),
    [
      ["free", 0, "unoccupied", 0],
      ["missing", 0, "unknown", null],
      ["busy", 9, "occupied", 9],
    ],
  );
  assert.deepEqual(
    status.map((entry) => [entry.scenarioId, entry.chartValue, entry.state, entry.total]),
    [
      ["free", 1, "unoccupied", 0],
      ["missing", 0, "unknown", null],
      ["busy", 1, "occupied", 9],
    ],
  );
});

test("barras verticais preservam semântica, ordem e navegação responsiva", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const start = source.indexOf(
    "function buildCurrentComparisonVerticalBarOption",
  );
  const end = source.indexOf("function halfDonutEntryColor", start);
  const optionSource = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(source, /<SelectItem value="vertical_bars">Barras verticais<\/SelectItem>/);
  assert.match(optionSource, /realtimeSort: false/);
  assert.match(optionSource, /dataZoom: usesDataZoom/);
  assert.match(optionSource, /endValue: visibleScenarioCount - 1/);
  assert.match(optionSource, /xAxis:[\s\S]*?type: "category"/);
  assert.match(optionSource, /yAxis:[\s\S]*?type: "value"/);
  assert.match(optionSource, /filter\(\(entry\) => entry\.chartValue === 0\)/);
  assert.doesNotMatch(optionSource, /emptyCircle/);
  assert.match(optionSource, /color:\s*entry\.state === "unknown"[\s\S]*?chartPalette\.surface/);
  assert.match(optionSource, /ausência não é ocupação zero/);
  assert.match(
    optionSource,
    /data: indexedEntries\.map\(\(entry\) => entry\.scenarioId\)/,
    "o eixo categórico deve manter a ordem de entrada dos cenários",
  );
});

test("runtime modular registra dataZoom antes de renderizar o gráfico", () => {
  const runtimeSource = readFileSync(
    resolve(projectRoot, "components/app/echarts-runtime/core.ts"),
    "utf8",
  );
  const registrationSource = readFileSync(
    resolve(
      projectRoot,
      "components/app/echarts-runtime/register-data-zoom.ts",
    ),
    "utf8",
  );
  const chartSource = readFileSync(
    resolve(projectRoot, "components/app/echart.tsx"),
    "utf8",
  );

  assert.match(
    runtimeSource,
    /dataZoom:\s*\(\) => import\("@\/components\/app\/echarts-runtime\/register-data-zoom"\)/,
  );
  assert.match(
    runtimeSource,
    /import \{[\s\S]*?DataZoomComponent,[\s\S]*?\} from "echarts\/components"/,
    "dataZoom automático deve fazer parte do núcleo e não depender apenas de um side-effect em cache durante HMR",
  );
  assert.match(
    runtimeSource,
    /registerECharts\(\[[\s\S]*?DataZoomComponent,[\s\S]*?GridComponent/,
    "DataZoomComponent deve estar registrado antes de qualquer init/setOption",
  );
  assert.match(registrationSource, /import \{ DataZoomComponent \} from "echarts\/components"/);
  assert.match(registrationSource, /registerECharts\(\[DataZoomComponent\]\)/);
  assert.match(chartSource, /if \(option\.dataZoom\) capabilities\.add\("dataZoom"\)/);
  assert.match(
    chartSource,
    /await runtime\.ensureEChartCapabilities\([\s\S]*?chart = runtime\.initEChart\(/,
    "o componente deve estar registrado antes da inicialização do ECharts",
  );
});

test("primeira pintura do acumulado diário não depende de hover", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-08-01",
    "2026-08-03",
  );
  assert.ok(period);
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      baseline: {
        previous_period: {
          granularity: "day",
          rows: [
            aggregateRow("2026-07-29", "line-entry", 80),
            aggregateRow("2026-07-30", "line-entry", 90),
            aggregateRow("2026-07-31", "line-entry", 100),
          ],
        },
      },
      dayRows: [
        aggregateRow("2026-08-01", "line-entry", 100),
        aggregateRow("2026-08-02", "line-entry", 120),
        aggregateRow("2026-08-03", "line-entry", 140),
      ],
    }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("cumulative"),
  });
  assert.equal(model.hasData, true);
  assert.ok(model.option);

  const chart = echarts.init(null, null, {
    height: 360,
    renderer: "svg",
    ssr: true,
    width: 900,
  });
  try {
    chart.setOption(model.option, {
      lazyUpdate: false,
      notMerge: true,
    });
    const firstFrame = chart.renderToSVGString();

    assert.ok(firstFrame.length > 1_000);
    assert.match(firstFrame, /ecmeta_series_index="0"/);
    assert.match(firstFrame, /ecmeta_series_index="1"/);
    assert.match(firstFrame, /fill="#A3AFBF"/i);
    assert.match(firstFrame, /fill="#1267C4"/i);
  } finally {
    chart.dispose();
  }

  const chartSource = readFileSync(
    resolve(projectRoot, "components/app/echart.tsx"),
    "utf8",
  );
  assert.match(
    chartSource,
    /chart\.setOption\(themedOption,\s*\{[\s\S]{0,420}?lazyUpdate:\s*false/,
    "a primeira pintura interativa deve ser confirmada imediatamente",
  );
  assert.match(
    chartSource,
    /renderer:\s*"canvas",[\s\S]{0,360}?useDirtyRect:\s*false/,
    "o canvas não pode depender do redraw parcial para revelar a série",
  );
  assert.match(
    chartSource,
    /const chartPainted = chartMounted && paintedChartKey === chartKey/,
  );
  assert.match(
    chartSource,
    /chart\.setOption\([\s\S]{0,700}?setPaintedChartKey\(chartKey\)/,
    "o loading só deve terminar depois do primeiro setOption síncrono",
  );
  assert.match(chartSource, /aria-busy=\{!chartPainted\}/);
});

test("meia rosca real mantém ângulo estritamente zero no motor ECharts", () => {
  const echarts = require("echarts/core");
  const { PieChart } = require("echarts/charts");
  const { SVGRenderer } = require("echarts/renderers");
  echarts.use([PieChart, SVGRenderer]);
  const chart = echarts.init(null, null, {
    height: 300,
    renderer: "svg",
    ssr: true,
    width: 500,
  });
  try {
    assert.equal(occupancyComparison.occupancyHalfDonutMinimumAngle("actual"), 0);
    chart.setOption({
      series: [
        {
          data: [
            { name: "Livre", value: 0 },
            { name: "Ocupado", value: 7 },
          ],
          minAngle: occupancyComparison.occupancyHalfDonutMinimumAngle("actual"),
          stillShowZeroSum: false,
          type: "pie",
        },
      ],
    });
    const zeroLayout = chart
      .getModel()
      .getSeriesByIndex(0)
      .getData()
      .getItemLayout(0);
    assert.equal(zeroLayout.angle, 0);
  } finally {
    chart.dispose();
  }
});

test("meia rosca vincula índice, cor, nome e percentual aos callouts", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const start = source.indexOf("function buildHalfDonutOption");
  const end = source.indexOf("function halfDonutEntryColor", start);
  const optionSource = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(optionSource, /alignTo: "labelLine"/);
  assert.match(optionSource, /labelLine:[\s\S]*?show: true/);
  assert.match(optionSource, /indexLabel/);
  assert.match(optionSource, /labelStyleKey/);
  assert.match(optionSource, /color: entry\.color/);
  assert.match(optionSource, /params\.data\?\.percentage/);
  assert.match(optionSource, /scenarioIndexes\.get\(entry\.scenarioId\)/);
  assert.match(optionSource, /compactLabels = entries\.length > 8/);
  assert.match(optionSource, /\{name\|/);
  assert.match(
    optionSource,
    /if \(mode === "status"\)[\s\S]*?"Ocupado" : "Desocupado"/,
    "o estado binário deve ser nomeado sem anunciar percentual artificial",
  );
});

test("gráficos de ocupação usam paletas explícitas e superfície correta por tema", () => {
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const light = occupancyChartPalette.getOccupancyChartPalette("light");
  const dark = occupancyChartPalette.getOccupancyChartPalette("dark");

  assert.equal(light.surface, "#FFFFFF");
  assert.equal(dark.surface, "#131316");
  assert.notEqual(light.average, light.surface);
  assert.notEqual(dark.average, dark.surface);
  assert.match(
    comparisonSource,
    /itemStyle:\s*\{[\s\S]*?borderColor: color,[\s\S]*?color: chartSurface,[\s\S]*?symbol: "circle"/,
  );
  assert.ok(
    (comparisonSource.match(/themeMode="explicit"/g) ?? []).length >= 6,
    "todos os comparativos ECharts devem preservar a paleta explícita",
  );
  assert.match(
    reportsSource,
    /<EChart\s+option=\{option\}\s+themeMode="explicit"/,
  );
  assert.doesNotMatch(
    reportsSource,
    /Dados parciais|Comparativo parcial|Dados de ocupação não certificados/,
  );
});

test("layout hexagonal preserva células, lacunas e troca posições sem colisão", () => {
  const normalized = occupancyHexLayout.normalizeOccupancyHexLayout({
    cells: [
      { column: 0, id: "a", label: "Fila A", row: 0, scenarioId: "a" },
      { column: 0, id: "b", label: "Fila B", row: 0, scenarioId: "b" },
      { column: 2, id: "c", label: "Reserva", row: 1, scenarioId: "a" },
    ],
    columns: 3,
    preset: "custom",
    rows: 2,
    version: 1,
  });

  assert.ok(normalized);
  assert.equal(normalized.cells.length, 3);
  assert.equal(new Set(normalized.cells.map((cell) => `${cell.column}:${cell.row}`)).size, 3);
  assert.equal(normalized.cells[2].scenarioId, null);
  const moved = occupancyHexLayout.moveOccupancyHexCell(normalized, "a", 2, 1);
  assert.deepEqual(
    moved.cells.map((cell) => [cell.id, cell.column, cell.row]),
    [
      ["a", 2, 1],
      ["b", 1, 0],
      ["c", 0, 0],
    ],
  );
  const resized = occupancyHexLayout.reflowOccupancyHexLayout(moved, {
    columns: 2,
    rows: 1,
  });
  assert.equal(resized.cells.length, 3);
  assert.ok(resized.rows >= 2);
  assert.equal(new Set(resized.cells.map((cell) => `${cell.column}:${cell.row}`)).size, 3);
  const dense = occupancyHexLayout.createDefaultOccupancyHexLayout({
    columns: 1,
    scenarioIds: Array.from({ length: 100 }, (_, index) => `scenario-${index}`),
  });
  assert.equal(dense.cells.length, 100);
  assert.equal(dense.columns, 2);
  assert.equal(dense.rows, 50);
});

test("layout hexagonal escala em lote para 40, 100 e 300 posições sem perder células", () => {
  const initial = {
    cells: [
      {
        column: 0,
        id: "existing-a",
        label: "Caixa especial",
        row: 0,
        scenarioId: "scenario-a",
      },
      {
        column: 1,
        id: "existing-b",
        label: "Reserva",
        row: 0,
        scenarioId: null,
      },
    ],
    columns: 4,
    preset: "custom",
    rows: 1,
    version: 1,
  };

  const boxes = occupancyHexLayout.expandOccupancyHexLayout({
    columns: 8,
    labelPrefix: "Caixa",
    layout: initial,
    targetCellCount: 40,
  });
  assert.equal(boxes.added, 38);
  assert.equal(boxes.layout.cells.length, 40);
  assert.equal(boxes.layout.columns, 8);
  assert.equal(boxes.layout.rows, 5);
  assert.deepEqual(boxes.layout.cells[0], initial.cells[0]);
  assert.equal(boxes.layout.cells[2].label, "Caixa 03");
  assert.equal(boxes.layout.cells.at(-1).label, "Caixa 40");

  const desks = occupancyHexLayout.expandOccupancyHexLayout({
    columns: 10,
    labelPrefix: "Mesa",
    layout: boxes.layout,
    targetCellCount: 100,
  });
  assert.equal(desks.added, 60);
  assert.equal(desks.layout.cells.length, 100);
  assert.equal(desks.layout.columns, 10);
  assert.equal(desks.layout.rows, 10);

  const parking = occupancyHexLayout.expandOccupancyHexLayout({
    columns: 20,
    labelPrefix: "Vaga",
    layout: desks.layout,
    targetCellCount: 300,
  });
  assert.equal(parking.added, 200);
  assert.equal(parking.layout.cells.length, 300);
  assert.equal(parking.layout.columns, 20);
  assert.equal(parking.layout.rows, 15);
  assert.equal(parking.layout.cells.at(-1).label, "Vaga 300");
  assert.equal(
    new Set(parking.layout.cells.map((cell) => `${cell.column}:${cell.row}`))
      .size,
    300,
  );
  assert.equal(
    new Set(parking.layout.cells.map((cell) => cell.id)).size,
    300,
  );

  const noShrink = occupancyHexLayout.expandOccupancyHexLayout({
    columns: 20,
    layout: parking.layout,
    targetCellCount: 100,
  });
  assert.equal(noShrink.added, 0);
  assert.equal(noShrink.layout.cells.length, 300);
});

test("layout hexagonal vincula cenários em lote usando reservas antes de criar células", () => {
  const layout = occupancyHexLayout.expandOccupancyHexLayout({
    columns: 4,
    labelPrefix: "Mesa",
    layout: {
      cells: [
        {
          column: 0,
          id: "bound",
          label: "Gerência",
          row: 0,
          scenarioId: "scenario-a",
        },
      ],
      columns: 4,
      preset: "custom",
      rows: 1,
      version: 1,
    },
    targetCellCount: 4,
  }).layout;
  const reservedIds = layout.cells.slice(1).map((cell) => cell.id);
  const result =
    occupancyHexLayout.bindOccupancyHexScenariosToAvailableCells({
      layout,
      scenarioIds: [
        "scenario-a",
        "scenario-b",
        "scenario-b",
        "scenario-c",
        "scenario-d",
        "scenario-e",
      ],
    });

  assert.equal(result.bound, 4);
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.layout.cells.length, 5);
  assert.deepEqual(
    result.layout.cells.slice(1, 4).map((cell) => cell.id),
    reservedIds,
  );
  assert.deepEqual(
    result.layout.cells.map((cell) => cell.scenarioId),
    ["scenario-a", "scenario-b", "scenario-c", "scenario-d", "scenario-e"],
  );
});

test("viewport hexagonal aplica densidade e desliga animação para operações grandes", () => {
  const boxes = occupancyHexLayout.occupancyHexViewportMetrics({
    cellCount: 40,
    columns: 8,
    rows: 5,
  });
  const desks = occupancyHexLayout.occupancyHexViewportMetrics({
    cellCount: 100,
    columns: 10,
    rows: 10,
  });
  const parking = occupancyHexLayout.occupancyHexViewportMetrics({
    cellCount: 300,
    columns: 20,
    rows: 15,
  });

  assert.equal(boxes.density, "comfortable");
  assert.equal(desks.density, "compact");
  assert.equal(parking.density, "dense");
  assert.equal(parking.showNames, false);
  assert.equal(parking.showValues, true);
  assert.ok(parking.height < 1_000);
  assert.ok(parking.minimumWidth >= 20 * 48);
  assert.equal(occupancyHexLayout.occupancyHexShouldAnimate(100), true);
  assert.equal(occupancyHexLayout.occupancyHexShouldAnimate(300), false);
  assert.equal(occupancyHexLayout.recommendedOccupancyHexColumns(300), 21);
});

test("simulador hexagonal centraliza uma única linha nos dois eixos", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const builderStart = source.indexOf("function buildHexLayoutOption(");
  const builderEnd = source.indexOf("function hexagonPoints(", builderStart);
  const builder = source.slice(builderStart, builderEnd);

  assert.match(builder, /singleRenderedRow[\s\S]*?renderedMinX[\s\S]*?renderedMaxX/);
  assert.match(
    builder,
    /xAxis:[\s\S]*?max: maxX \+ 0\.8[\s\S]*?singleRenderedRow \? renderedMinX/,
  );
  assert.match(
    builder,
    /yAxis:[\s\S]*?max: maxY \+ 0\.8[\s\S]*?singleRenderedRow \? renderedMinY/,
  );
});

test("normalização hexagonal rejeita excesso em vez de truncar dados silenciosamente", () => {
  const overLimit = Array.from(
    { length: occupancyHexLayout.OCCUPANCY_HEX_MAX_CELLS + 1 },
    (_, index) => ({
      column: index % 20,
      id: `cell-${index}`,
      label: "",
      row: Math.floor(index / 20),
      scenarioId: null,
    }),
  );
  assert.equal(
    occupancyHexLayout.normalizeOccupancyHexLayout({
      cells: overLimit,
      columns: 20,
      preset: "custom",
      rows: Math.ceil(overLimit.length / 20),
      version: 1,
    }),
    null,
  );
  assert.throws(
    () =>
      occupancyHexLayout.expandOccupancyHexLayout({
        columns: 20,
        layout: {
          cells: [],
          columns: 20,
          preset: "custom",
          rows: 1,
          version: 1,
        },
        targetCellCount: occupancyHexLayout.OCCUPANCY_HEX_MAX_CELLS + 1,
      }),
    /total do layout/,
  );
});

test("histórico do editor hexagonal mantém layout e capacidades na mesma transação", () => {
  const initialDocument = {
    capacities: { queue: 12, showcase: 8 },
    layout: {
      cells: [
        {
          column: 0,
          id: "cell-queue",
          label: "Fila",
          row: 0,
          scenarioId: "queue",
        },
      ],
      columns: 2,
      preset: "custom",
      rows: 2,
      version: 1,
    },
  };
  const sameDocumentWithReorderedCapacities = {
    capacities: { showcase: 8, queue: 12 },
    layout: structuredClone(initialDocument.layout),
  };

  assert.equal(
    occupancyHexEditorState.areOccupancyHexEditorDocumentsEqual(
      initialDocument,
      sameDocumentWithReorderedCapacities,
    ),
    true,
  );

  const isolatedClone =
    occupancyHexEditorState.cloneOccupancyHexEditorDocument(initialDocument);
  isolatedClone.layout.cells[0].label = "Clone";
  isolatedClone.capacities.queue = 99;
  assert.equal(initialDocument.layout.cells[0].label, "Fila");
  assert.equal(initialDocument.capacities.queue, 12);

  let state =
    occupancyHexEditorState.createOccupancyHexEditorState(initialDocument);
  const committedDocument = {
    capacities: { showcase: 9, queue: 20 },
    layout: {
      ...structuredClone(initialDocument.layout),
      cells: [
        {
          ...initialDocument.layout.cells[0],
          column: 1,
          label: "Fila principal",
        },
      ],
    },
  };
  state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
    document: committedDocument,
    type: "commit",
  });
  committedDocument.layout.cells[0].label = "Mutação externa";
  committedDocument.capacities.queue = 999;

  assert.equal(state.past.length, 1);
  assert.equal(state.present.layout.cells[0].label, "Fila principal");
  assert.equal(state.present.capacities.queue, 20);
  assert.equal(
    occupancyHexEditorState.isOccupancyHexEditorStateDirty(state),
    true,
  );

  state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
    type: "undo",
  });
  assert.equal(state.present.layout.cells[0].column, 0);
  assert.equal(state.present.capacities.queue, 12);
  assert.equal(
    occupancyHexEditorState.isOccupancyHexEditorStateDirty(state),
    false,
  );

  state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
    type: "redo",
  });
  assert.equal(state.present.layout.cells[0].column, 1);
  assert.equal(state.present.capacities.queue, 20);

  const resetDocument = {
    capacities: { queue: 20, showcase: 9 },
    layout: structuredClone(state.present.layout),
  };
  state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
    document: resetDocument,
    type: "reset",
  });
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  assert.equal(
    occupancyHexEditorState.isOccupancyHexEditorStateDirty(state),
    false,
  );

  const noOpState = occupancyHexEditorState.occupancyHexEditorReducer(state, {
    document: {
      capacities: { showcase: 9, queue: 20 },
      layout: structuredClone(resetDocument.layout),
    },
    type: "commit",
  });
  assert.equal(noOpState, state);
});

test("histórico do editor hexagonal limita desfazer e refazer a 50 transações", () => {
  const initialDocument = {
    capacities: {},
    layout: {
      cells: [
        {
          column: 0,
          id: "cell-a",
          label: "v0",
          row: 0,
          scenarioId: "a",
        },
      ],
      columns: 1,
      preset: "custom",
      rows: 1,
      version: 1,
    },
  };
  let state =
    occupancyHexEditorState.createOccupancyHexEditorState(initialDocument);

  for (let version = 1; version <= 60; version += 1) {
    const document =
      occupancyHexEditorState.cloneOccupancyHexEditorDocument(state.present);
    document.layout.cells[0].label = `v${version}`;
    state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
      document,
      type: "commit",
    });
  }

  assert.equal(state.past.length, 50);
  for (let index = 0; index < 50; index += 1) {
    state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
      type: "undo",
    });
  }
  assert.equal(state.present.layout.cells[0].label, "v10");
  assert.equal(state.future.length, 50);
  const withoutMoreHistory = occupancyHexEditorState.occupancyHexEditorReducer(
    state,
    { type: "undo" },
  );
  assert.equal(withoutMoreHistory, state);

  for (let index = 0; index < 50; index += 1) {
    state = occupancyHexEditorState.occupancyHexEditorReducer(state, {
      type: "redo",
    });
  }
  assert.equal(state.present.layout.cells[0].label, "v60");
  assert.equal(state.past.length, 50);
});

test("validação do editor hexagonal relata conflitos sem alterar o documento", () => {
  const document = {
    capacities: {
      decimal: 1.5,
      huge: 1_000_001,
      nan: Number.NaN,
      valid: 10,
      zero: 0,
    },
    layout: {
      cells: [
        { column: 0, id: "duplicate", label: "A", row: 0, scenarioId: "a" },
        { column: 0, id: "duplicate", label: "B", row: 0, scenarioId: "a" },
        {
          column: 2,
          id: "outside",
          label: "Fora",
          row: 0,
          scenarioId: "missing",
        },
        { column: 1, id: "unlinked", label: "Livre", row: 1, scenarioId: null },
      ],
      columns: 2,
      preset: "custom",
      rows: 2,
      version: 1,
    },
  };
  const beforeValidation = structuredClone(document);
  const result =
    occupancyHexEditorState.validateOccupancyHexEditorDocument(document, {
      availableScenarioIds: ["a"],
    });

  assert.deepEqual(document, beforeValidation);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.filter((issue) => issue.code === "duplicate-cell-id").length,
    1,
  );
  assert.equal(
    result.errors.filter((issue) => issue.code === "duplicate-coordinate").length,
    1,
  );
  assert.equal(
    result.errors.filter((issue) => issue.code === "duplicate-scenario").length,
    1,
  );
  assert.equal(
    result.errors.filter((issue) => issue.code === "cell-out-of-grid").length,
    1,
  );
  assert.equal(
    result.errors.filter((issue) => issue.code === "invalid-capacity").length,
    4,
  );
  assert.deepEqual(
    result.warnings.map((issue) => issue.code).sort(),
    ["unavailable-scenario", "unlinked-cell"],
  );
  const visibleMessages = [...result.errors, ...result.warnings]
    .map((issue) => issue.message)
    .join(" ");
  for (const technicalIdentifier of [
    "duplicate",
    "outside",
    "unlinked",
    "missing",
    "decimal",
    "huge",
    "nan",
    "zero",
  ]) {
    assert.equal(
      visibleMessages.includes(technicalIdentifier),
      false,
      `a validação não deve exibir o identificador ${technicalIdentifier}`,
    );
  }
});

test("classes de objeto de ocupação usam rótulos de negócio", () => {
  assert.equal(occupancyObjectClass.occupancyObjectClassLabel("person"), "Pessoas");
  assert.equal(occupancyObjectClass.occupancyObjectClassLabel(" VEHICLE "), "Veículos");
  assert.equal(occupancyObjectClass.occupancyObjectClassLabel("bicycle"), "Bicicletas");
  assert.equal(
    occupancyObjectClass.occupancyObjectClassLabel("internal_detector_code"),
    "Objetos monitorados",
  );
  assert.equal(occupancyObjectClass.occupancyObjectClassLabel(), "Pessoas");
});

test("simulador hexagonal distingue zero certificado de célula sem vínculo", () => {
  const positions = occupancyComparison.buildOccupancyHexLayout({
    capacities: { free: 10 },
    columns: 3,
    layout: {
      cells: [
        { column: 0, id: "free-cell", label: "Caixa livre", row: 0, scenarioId: "free" },
        { column: 1, id: "gone-cell", label: "Cenário antigo", row: 0, scenarioId: "gone" },
        { column: 2, id: "empty-cell", label: "Reserva", row: 0, scenarioId: null },
      ],
      columns: 3,
      preset: "custom",
      rows: 1,
      version: 1,
    },
    preset: "custom",
    scenarios: [{ id: "free", max_total: 10, name: "Posto" }],
    snapshots: [
      { name: "Posto", scenarioId: "free", total: 0 },
      { name: "Cenário antigo", scenarioId: "gone", total: 99 },
    ],
  });

  assert.equal(positions[0].state, "unoccupied");
  assert.equal(positions[0].total, 0);
  assert.equal(positions[0].name, "Caixa livre");
  assert.equal(positions[1].state, "unavailable");
  assert.equal(positions[1].total, null);
  assert.equal(positions[2].state, "unlinked");
  assert.equal(positions[2].total, null);
  const withoutCapacity = occupancyComparison.buildOccupancyHexLayout({
    capacities: {},
    columns: 1,
    preset: "queue",
    scenarios: [{ id: "busy", max_total: null, name: "Fila" }],
    snapshots: [{ name: "Fila", scenarioId: "busy", total: 7 }],
  });
  assert.equal(withoutCapacity[0].capacity, null);
  assert.equal(withoutCapacity[0].utilization, null);
});

test("escala hexbin usa domínio certificado comum e raio monotônico", () => {
  const visual = occupancyHexVisual.buildOccupancyHexVisualScale([
    { capacity: 10, cellId: "zero", state: "unoccupied", total: 0 },
    { capacity: null, cellId: "one", state: "occupied", total: 1 },
    { capacity: 2, cellId: "four", state: "occupied", total: 4 },
    { capacity: 18, cellId: "nine", state: "occupied", total: 9 },
    { capacity: 999_999, cellId: "unknown", state: "unknown", total: null },
    { capacity: null, cellId: "unavailable", state: "unavailable", total: null },
    { capacity: null, cellId: "unlinked", state: "unlinked", total: null },
  ]);

  assert.equal(visual.certifiedCount, 4);
  assert.equal(visual.certifiedMaximum, 9);
  assert.equal(visual.domainMaximum, 10);
  const byId = new Map(visual.entries.map((entry) => [entry.cellId, entry]));
  assert.equal(
    byId.get("zero").radiusRatio,
    occupancyHexVisual.OCCUPANCY_HEX_ZERO_RADIUS_RATIO,
  );
  assert.equal(byId.get("zero").state, "unoccupied");
  assert.equal(byId.get("zero").valueRatio, 0);
  assert.equal(byId.get("four").valueRatio, 0.4);
  assert.equal(byId.get("nine").valueRatio, 0.9);
  assert.ok(byId.get("one").radiusRatio > byId.get("zero").radiusRatio);
  assert.ok(byId.get("four").radiusRatio > byId.get("one").radiusRatio);
  assert.ok(byId.get("nine").radiusRatio > byId.get("four").radiusRatio);
  assert.ok(byId.get("nine").radiusRatio < 1);
  assert.equal(byId.get("unknown").radiusRatio, null);
  assert.equal(byId.get("unavailable").radiusRatio, null);
  assert.equal(byId.get("unlinked").radiusRatio, null);
});

test("escala hexbin não inventa utilização e preserva estouro de capacidade", () => {
  const visual = occupancyHexVisual.buildOccupancyHexVisualScale([
    { capacity: null, cellId: "without-capacity", state: "occupied", total: 7 },
    { capacity: 4, cellId: "over-capacity", state: "occupied", total: 7 },
    { capacity: 10, cellId: "certified-zero", state: "unoccupied", total: 0 },
    { capacity: 10, cellId: "missing", state: "unknown", total: null },
  ]);
  const byId = new Map(visual.entries.map((entry) => [entry.cellId, entry]));

  assert.equal(byId.get("without-capacity").colorRatio, null);
  assert.equal(byId.get("without-capacity").overCapacity, false);
  assert.equal(byId.get("over-capacity").colorRatio, 1.75);
  assert.equal(byId.get("over-capacity").overCapacity, true);
  assert.equal(byId.get("certified-zero").colorRatio, 0);
  assert.equal(byId.get("missing").colorRatio, null);
});

test("escala hexbin é determinística para vazio, zero, ordem e teto 1/2/5", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 5, 6, 20, 21, 999].map((value) =>
      occupancyHexVisual.niceOccupancyHexCeiling(value),
    ),
    [1, 1, 2, 5, 5, 10, 20, 50, 1_000],
  );

  const empty = occupancyHexVisual.buildOccupancyHexVisualScale([
    { capacity: 10, cellId: "missing", state: "unknown", total: null },
    { capacity: null, cellId: "space", state: "unlinked", total: null },
  ]);
  assert.equal(empty.certifiedCount, 0);
  assert.equal(empty.certifiedMaximum, null);
  assert.equal(empty.domainMaximum, 1);

  const sources = [
    { capacity: 20, cellId: "a", state: "occupied", total: 8 },
    { capacity: 20, cellId: "b", state: "occupied", total: 2 },
    { capacity: 20, cellId: "c", state: "unoccupied", total: 0 },
  ];
  const forward = occupancyHexVisual.buildOccupancyHexVisualScale(sources);
  const reverse = occupancyHexVisual.buildOccupancyHexVisualScale(
    [...sources].reverse(),
  );
  assert.equal(forward.domainMaximum, reverse.domainMaximum);
  assert.deepEqual(
    Object.fromEntries(forward.entries.map((entry) => [entry.cellId, entry.radiusRatio])),
    Object.fromEntries(reverse.entries.map((entry) => [entry.cellId, entry.radiusRatio])),
  );
});

test("escala hexbin rejeita estados e números inconsistentes", () => {
  assert.throws(
    () =>
      occupancyHexVisual.buildOccupancyHexVisualScale([
        { capacity: 10, cellId: "duplicate", state: "occupied", total: 1 },
        { capacity: 10, cellId: "duplicate", state: "occupied", total: 2 },
      ]),
    /duplicado/,
  );
  assert.throws(
    () =>
      occupancyHexVisual.buildOccupancyHexVisualScale([
        { capacity: 10, cellId: "false-zero", state: "unoccupied", total: 1 },
      ]),
    /deve ter total zero/,
  );
  assert.throws(
    () =>
      occupancyHexVisual.buildOccupancyHexVisualScale([
        { capacity: 0, cellId: "capacity", state: "occupied", total: 1 },
      ]),
    /inteiro seguro positivo/,
  );
  assert.throws(
    () =>
      occupancyHexVisual.buildOccupancyHexVisualScale([
        {
          capacity: 10,
          cellId: "unavailable-with-capacity",
          state: "unavailable",
          total: null,
        },
      ]),
    /indisponível.*não pode ter total nem capacidade/,
  );
  assert.throws(
    () => occupancyHexVisual.occupancyHexRadiusRatio(2, 1),
    /não pode exceder/,
  );
  assert.throws(
    () => occupancyHexVisual.niceOccupancyHexCeiling(Number.NaN),
    /inteiro seguro não negativo/,
  );
});

test("hexbin usa superfícies e contraste próprios nos modos light e dark", () => {
  const light = occupancyHexPalette.getOccupancyHexPalette("light", "#1267C4");
  const dark = occupancyHexPalette.getOccupancyHexPalette("dark", "#1267C4");
  const maximum = {
    capacity: 10,
    cellId: "maximum",
    colorRatio: 1,
    overCapacity: false,
    radiusRatio: 1,
    state: "occupied",
    total: 10,
    valueRatio: 1,
  };

  assert.notEqual(light.surfaces.occupied.fill, dark.surfaces.occupied.fill);
  assert.notEqual(light.labelText, dark.labelText);
  assert.notDeepEqual(light.valueColors, dark.valueColors);
  assert.equal(
    occupancyHexPalette.occupancyHexDisplayRadiusRatio(maximum),
    occupancyHexPalette.OCCUPANCY_HEX_INNER_MAX_RATIO,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexTextColor(undefined, light),
    light.labelText,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexTextColor(undefined, dark),
    dark.labelText,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexValueColor(
      { ...maximum, overCapacity: true },
      dark,
    ),
    occupancyHexPalette.occupancyHexValueColor(maximum, dark),
  );
});

test("hexbin aplica cores semânticas com contraste gráfico e textual nos dois temas", () => {
  const semanticColors = {
    occupied: "#0F766E",
    unoccupied: "#B91C1C",
  };
  const maximum = {
    capacity: 10,
    cellId: "maximum",
    colorRatio: 1,
    overCapacity: false,
    radiusRatio: 1,
    state: "occupied",
    total: 10,
    valueRatio: 1,
  };

  for (const theme of ["light", "dark"]) {
    const palette = occupancyHexPalette.getOccupancyHexPalette(
      theme,
      "#1267C4",
      semanticColors,
    );
    const textColor = occupancyHexPalette.occupancyHexTextColor(
      maximum,
      palette,
    );

    assert.ok(
      occupancyHexPalette.contrastRatio(palette.zero, palette.canvas) >= 3,
      `${theme}: o estado desocupado precisa manter contraste não textual`,
    );
    assert.ok(
      occupancyHexPalette.contrastRatio(textColor, palette.labelHalo) >= 4.5,
      `${theme}: o texto constante precisa contrastar com seu halo`,
    );
    assert.equal(textColor, palette.labelText);
  }
});

test("hexbin separa gradiente de valor real do estado binário", () => {
  const scale = occupancyHexVisual.buildOccupancyHexVisualScale([
    { capacity: 2, cellId: "low", state: "occupied", total: 2 },
    { capacity: 100, cellId: "high", state: "occupied", total: 8 },
    { capacity: 1, cellId: "over", state: "occupied", total: 8 },
    { capacity: 10, cellId: "zero", state: "unoccupied", total: 0 },
  ]);
  const byId = new Map(scale.entries.map((entry) => [entry.cellId, entry]));
  const palette = occupancyHexPalette.getOccupancyHexPalette(
    "light",
    "#1267C4",
    { occupied: "#0F766E", unoccupied: "#B91C1C" },
  );
  const low = byId.get("low");
  const high = byId.get("high");
  const over = byId.get("over");
  const zero = byId.get("zero");

  assert.ok(low.valueRatio < high.valueRatio);
  assert.ok(low.colorRatio > high.colorRatio);
  assert.notEqual(
    occupancyHexPalette.occupancyHexValueColor(low, palette, "actual"),
    occupancyHexPalette.occupancyHexValueColor(high, palette, "actual"),
    "a capacidade inversa não pode inverter nem igualar o gradiente real",
  );
  assert.equal(
    occupancyHexPalette.occupancyHexValueColor(high, palette, "status"),
    palette.occupied,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexValueColor(low, palette, "status"),
    palette.occupied,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexValueColor(zero, palette, "actual"),
    palette.valueColors[0],
  );
  assert.equal(
    occupancyHexPalette.occupancyHexValueColor(zero, palette, "status"),
    palette.zero,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexValueColor(over, palette, "actual"),
    occupancyHexPalette.occupancyHexValueColor(high, palette, "actual"),
    "sobrecapacidade deve manter o fill gradual e usar vermelho só no contorno",
  );
  assert.notEqual(
    occupancyHexPalette.occupancyHexValueColor(over, palette, "actual"),
    palette.overCapacity,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexDisplayRadiusRatio(low, "status"),
    occupancyHexPalette.OCCUPANCY_HEX_INNER_MAX_RATIO,
  );
  assert.equal(
    occupancyHexPalette.occupancyHexDisplayRadiusRatio(zero, "status"),
    occupancyHexPalette.OCCUPANCY_HEX_INNER_MAX_RATIO,
  );
  for (const entry of scale.entries) {
    assert.equal(
      occupancyHexPalette.occupancyHexTextColor(entry, palette),
      palette.labelText,
    );
  }
});

test("bar race ao vivo usa snapshots, preserva zero e não transforma ausência em zero", () => {
  const entries = occupancyComparison.buildOccupancyLiveRaceEntries([
    { name: "Posto livre", scenarioId: "free", total: 0 },
    { name: "Fila ocupada", scenarioId: "busy", total: 7 },
    { name: "Sem dados", scenarioId: "missing", total: null },
  ]);

  assert.deepEqual(
    entries.map((entry) => [entry.scenarioId, entry.value]),
    [
      ["free", 0],
      ["busy", 7],
      ["missing", null],
    ],
  );
});

test("máximos por cenário usam recortes civis ordenados de hoje, 12 meses e 5 anos", () => {
  const ranges = occupancyComparison.buildOccupancyMaximumTrendRanges(
    new Date(2026, 7, 7, 15, 37, 42, 123),
  );

  assert.deepEqual(
    ranges.hourly.buckets.map((bucket) => bucket.getHours()),
    Array.from({ length: 16 }, (_, hour) => hour),
    "a série horária deve começar à meia-noite e incluir somente até a hora atual",
  );
  assert.equal(ranges.hourly.from.getHours(), 0);
  assert.equal(ranges.hourly.to.getHours(), 16);
  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      ranges.monthly.buckets,
      "month",
    ),
    [
      "set/25",
      "out/25",
      "nov/25",
      "dez/25",
      "jan/26",
      "fev/26",
      "mar/26",
      "abr/26",
      "mai/26",
      "jun/26",
      "jul/26",
      "ago/26",
    ],
    "os 12 meses devem permanecer em ordem civil, inclusive na virada do ano",
  );
  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      ranges.annual.buckets,
      "year",
    ),
    ["2022", "2023", "2024", "2025", "2026"],
  );
  assert.equal(ranges.monthlySource.buckets.length, 56);
  assert.equal(
    occupancyComparison.occupancyMaximumTrendBucketLabel(
      ranges.monthlySource.buckets[0],
      "month",
    ),
    "jan/22",
  );
  assert.equal(
    occupancyComparison.occupancyMaximumTrendBucketLabel(
      ranges.monthlySource.buckets.at(-1),
      "month",
    ),
    "ago/26",
  );
  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      ranges.hourly.buckets.slice(0, 3),
      "hour",
    ),
    ["00h", "01h", "02h"],
  );
});

test("série máxima usa exclusivamente peak e preserva zero certificado e ausência", () => {
  const buckets = [
    new Date(2026, 7, 7, 10),
    new Date(2026, 7, 7, 11),
    new Date(2026, 7, 7, 12),
  ];
  const metrics = new Map([
    [
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        buckets[0],
        "hour",
      ),
      { average: 999, minimum: 1, peak: 7 },
    ],
    [
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        buckets[1],
        "hour",
      ),
      { average: 999, minimum: 0, peak: 0 },
    ],
  ]);

  assert.deepEqual(
    occupancyComparison.buildOccupancyPeakValues(buckets, metrics, "hour"),
    [7, 0, null],
    "peak zero é dado certificado; bucket ausente deve continuar null",
  );
});

test("eixo máximo horário mantém 24 posições, futuro vazio e substitui a hora aberta", () => {
  const range = occupancyComparison.buildOccupancyMaximumTrendRanges(
    new Date(2026, 7, 7, 15, 37, 42, 123),
  ).hourly;
  const metrics = new Map(
    range.buckets.map((bucket, hour) => [
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        bucket,
        "hour",
      ),
      { average: hour, minimum: 0, peak: hour },
    ]),
  );
  const openBucket = range.buckets.at(-1);

  assert.equal(occupancyComparison.OCCUPANCY_FIXED_HOUR_LABELS.length, 24);
  assert.equal(occupancyComparison.OCCUPANCY_FIXED_HOUR_LABELS[0], "00h");
  assert.equal(
    occupancyComparison.OCCUPANCY_FIXED_HOUR_LABELS.at(-1),
    "23h–24h",
  );
  assert.deepEqual(
    occupancyComparison.buildOccupancyFixedHourlyPeakValues({
      buckets: range.buckets,
      metrics,
    }),
    [...Array.from({ length: 16 }, (_, hour) => hour), ...Array(8).fill(null)],
    "horas futuras são apenas posições visuais e não viram zero",
  );
  assert.equal(
    occupancyComparison.buildOccupancyFixedHourlyPeakValues({
      buckets: range.buckets,
      metrics,
      openBucket,
      openMetric: { average: 5, minimum: 0, peak: 5 },
    })[15],
    5,
    "a leitura dedicada deve substituir o pico anterior, inclusive em correção para baixo",
  );
  assert.equal(
    occupancyComparison.buildOccupancyFixedHourlyPeakValues({
      buckets: range.buckets,
      metrics,
      openBucket,
      openMetric: null,
    })[15],
    null,
    "ausência autoritativa na hora aberta não pode manter o baseline obsoleto",
  );
  assert.equal(
    occupancyComparison.buildOccupancyFixedHourlyPeakValues({
      buckets: range.buckets,
      metrics,
      openBucket,
      openPeak: 9,
    })[15],
    9,
    "o pico recomposto por minutos e snapshot deve alimentar a hora aberta sem fabricar outras métricas",
  );
  assert.equal(
    occupancyComparison.buildOccupancyFixedHourlyPeakValues({
      buckets: range.buckets,
      metrics,
      openBucket,
      openPeak: 5,
      openPeakMode: "maximum",
    })[15],
    15,
    "uma observação parcial nunca pode reduzir um pico horário já conhecido",
  );
});

test("fallback da hora aberta solicita somente minutos já fechados", () => {
  const range = occupancyComparison.buildOccupancyClosedMinuteRange(
    new Date(2026, 7, 7, 15, 37, 42, 123),
  );

  assert.equal(range.from.getHours(), 15);
  assert.equal(range.from.getMinutes(), 0);
  assert.equal(range.to.getHours(), 15);
  assert.equal(range.to.getMinutes(), 37);
  assert.equal(range.buckets.length, 37);
  assert.equal(range.buckets[0].getMinutes(), 0);
  assert.equal(range.buckets.at(-1).getMinutes(), 36);
});

test("snapshot só participa do máximo quando pertence à mesma hora absoluta", () => {
  const bucket = new Date("2026-08-07T15:00:00.000Z");
  assert.equal(
    occupancyComparison.occupancySnapshotTotalWithinHour(
      { asOf: "2026-08-07T15:37:00.000Z", total: 7 },
      bucket,
    ),
    7,
  );
  assert.equal(
    occupancyComparison.occupancySnapshotTotalWithinHour(
      { asOf: "2026-08-07T14:59:59.999Z", total: 12 },
      bucket,
    ),
    undefined,
    "um snapshot anterior não pode contaminar a nova hora",
  );
  assert.equal(
    occupancyComparison.occupancySnapshotTotalWithinHour(
      { asOf: "2026-08-07T16:00:00.000Z", total: 12 },
      bucket,
    ),
    undefined,
  );
});

test("hora aberta usa intervalo semiaberto e reinicia na virada do dia e do ano", () => {
  const before = occupancyComparison.buildOccupancyCurrentHourRange(
    new Date(2026, 11, 31, 23, 59, 59, 999),
  );
  const after = occupancyComparison.buildOccupancyCurrentHourRange(
    new Date(2027, 0, 1, 0, 0, 0, 0),
  );

  assert.deepEqual(
    [before.from.getFullYear(), before.from.getMonth(), before.from.getDate(), before.from.getHours()],
    [2026, 11, 31, 23],
  );
  assert.deepEqual(
    [before.to.getFullYear(), before.to.getMonth(), before.to.getDate(), before.to.getHours()],
    [2027, 0, 1, 0],
  );
  assert.deepEqual(
    [after.from.getFullYear(), after.from.getMonth(), after.from.getDate(), after.from.getHours()],
    [2027, 0, 1, 0],
  );
  assert.deepEqual(
    [after.to.getFullYear(), after.to.getMonth(), after.to.getDate(), after.to.getHours()],
    [2027, 0, 1, 1],
  );
  assert.equal(before.to.getTime(), after.from.getTime());
  assert.equal(before.buckets.length, 1);
  assert.equal(after.buckets.length, 1);
});

test("janelas mensal e anual avançam sem carregar meses ou anos removidos", () => {
  const december = occupancyComparison.buildOccupancyMaximumTrendRanges(
    new Date(2026, 11, 31, 23, 59, 59, 999),
  );
  const january = occupancyComparison.buildOccupancyMaximumTrendRanges(
    new Date(2027, 0, 1, 0, 0, 0, 0),
  );

  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      december.monthly.buckets,
      "month",
    ),
    [
      "jan/26", "fev/26", "mar/26", "abr/26", "mai/26", "jun/26",
      "jul/26", "ago/26", "set/26", "out/26", "nov/26", "dez/26",
    ],
  );
  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      january.monthly.buckets,
      "month",
    ),
    [
      "fev/26", "mar/26", "abr/26", "mai/26", "jun/26", "jul/26",
      "ago/26", "set/26", "out/26", "nov/26", "dez/26", "jan/27",
    ],
  );
  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      december.annual.buckets,
      "year",
    ),
    ["2022", "2023", "2024", "2025", "2026"],
  );
  assert.deepEqual(
    occupancyComparison.occupancyMaximumTrendBucketLabels(
      january.annual.buckets,
      "year",
    ),
    ["2023", "2024", "2025", "2026", "2027"],
  );
  assert.equal(december.monthlySource.buckets.length, 60);
  assert.equal(january.monthlySource.buckets.length, 49);
  assert.equal(
    occupancyComparison.occupancyMaximumTrendBucketLabel(
      january.monthlySource.buckets.at(-1),
      "month",
    ),
    "jan/27",
  );
});

test("eixo horário de ocupação trata horas repetidas por máximo e exige cobertura total", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const first = new Date("2026-11-01T05:00:00Z");
    const second = new Date("2026-11-01T06:00:00Z");
    assert.equal(first.getHours(), 1);
    assert.equal(second.getHours(), 1);
    const firstKey = occupancyAggregateValidation.occupancyAggregateBucketKey(
      first,
      "hour",
    );
    const secondKey = occupancyAggregateValidation.occupancyAggregateBucketKey(
      second,
      "hour",
    );
    const complete = new Map([
      [firstKey, { average: 4, minimum: 0, peak: 7 }],
      [secondKey, { average: 5, minimum: 0, peak: 9 }],
    ]);

    assert.equal(
      occupancyComparison.buildOccupancyFixedHourlyPeakValues({
        buckets: [first, second],
        metrics: complete,
      })[1],
      9,
      "duas ocorrências absolutas da mesma hora civil usam máximo, nunca soma",
    );
    complete.delete(secondKey);
    assert.equal(
      occupancyComparison.buildOccupancyFixedHourlyPeakValues({
        buckets: [first, second],
        metrics: complete,
      })[1],
      null,
      "uma ocorrência ausente torna o máximo civil desconhecido",
    );
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("máximo anual usa os peaks mensais e invalida ano com mês ausente", () => {
  const annualBuckets = [new Date(2025, 0, 1), new Date(2026, 0, 1)];
  const monthlyBuckets = [
    new Date(2025, 0, 1),
    new Date(2025, 1, 1),
    new Date(2026, 0, 1),
    new Date(2026, 1, 1),
  ];
  const metrics = new Map([
    [
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        monthlyBuckets[0],
        "month",
      ),
      { average: 999, minimum: 1, peak: 8 },
    ],
    [
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        monthlyBuckets[2],
        "month",
      ),
      { average: 999, minimum: 0, peak: 0 },
    ],
    [
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        monthlyBuckets[3],
        "month",
      ),
      { average: 999, minimum: 2, peak: 5 },
    ],
  ]);

  assert.deepEqual(
    occupancyComparison.buildOccupancyAnnualMaximumValues({
      annualBuckets,
      metrics,
      monthlyBuckets,
    }),
    [null, 5],
    "um único mês ausente não pode ser certificado como zero nem ignorado no ano",
  );
  assert.deepEqual(
    occupancyComparison.buildOccupancyAnnualMaximumPoints({
      annualBuckets,
      liveBucket: new Date(2026, 1, 12, 10),
      livePeak: 7,
      metrics: new Map(),
      monthlyBuckets,
    }),
    [
      { partial: false, value: null },
      { partial: true, value: 7 },
    ],
    "o ano aberto deve exibir a melhor observação disponível como parcial, nunca como zero ou como ano fechado",
  );
});

test("catálogo de ocupação publica os três comparativos máximos por cenário", () => {
  const cardIds = viewPreferences
    .getCardMenuDefinition("occupancy")
    .cards.map((card) => card.id);

  assert.deepEqual(
    cardIds.filter((id) => id.startsWith("occupancy_scenario_max_")),
    [
      "occupancy_scenario_max_hour",
      "occupancy_scenario_max_month",
      "occupancy_scenario_max_year",
    ],
  );
});

test("comparativos máximos substituem séries ao trocar cenário ou empresa", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const cardStart = source.indexOf(
    "function OccupancyScenarioMaximumLineCard",
  );
  const nextCard = source.indexOf("function OccupancyHexLayoutCard", cardStart);
  const algorithmStart = source.indexOf("function buildMaximumLineSeries");
  const algorithmEnd = source.indexOf(
    "function buildScenarioMaximumLineOption",
    algorithmStart,
  );
  const maximumImplementation = `${source.slice(
    cardStart,
    nextCard,
  )}\n${source.slice(algorithmStart, algorithmEnd)}`;

  assert.ok(
    cardStart >= 0 &&
      nextCard > cardStart &&
      algorithmStart >= 0 &&
      algorithmEnd > algorithmStart,
  );
  assert.doesNotMatch(
    maximumImplementation,
    /mergeUpdates/,
    "o ECharts deve substituir completamente as séries para não reter cenários do escopo anterior",
  );
  assert.match(
    source,
    /const hourlyMaximumBuckets = React\.useMemo\([\s\S]*?certifiedCurrentHourMaximum\.bucket[\s\S]*?buckets=\{hourlyMaximumBuckets\}[\s\S]*?currentBucket=\{certifiedCurrentHourMaximum\.bucket\}/,
    "a hora aberta deve ancorar o dia exibido e não pode reutilizar buckets do dia anterior",
  );
  assert.match(
    source,
    /async function refreshCurrentHourMaximum[\s\S]*?buildOccupancyCurrentHourRange\(requestedAt\)[\s\S]*?buildOccupancyClosedMinuteRange\(requestedAt\)[\s\S]*?"minute"/,
    "a hora aberta deve usar o bucket horário quando existir e recompô-lo com minutos fechados quando a API o omitir",
  );
  assert.match(
    source,
    /minuteCoverage\.missingBuckets\.length[\s\S]*?\? new Map\(\)/,
    "minutos com lacuna não podem ser promovidos a máximo completo da hora",
  );
  assert.match(
    source,
    /latestMinuteRange = buildOccupancyClosedMinuteRange\(completedAt\)[\s\S]*?!sameOccupancyRange\(minuteRange, latestMinuteRange\)/,
    "uma resposta que cruza a virada do minuto deve ser refeita imediatamente",
  );
  assert.match(
    source,
    /showAllSymbol: true,[\s\S]*?showSymbol: true/,
    "um único ponto parcial precisa continuar visível mesmo sem segmento de linha",
  );
  assert.match(
    maximumImplementation,
    /OCCUPANCY_FIXED_HOUR_LABELS[\s\S]*?buildOccupancyFixedHourlyPeakValues\(\{[\s\S]*?buckets/,
    "as 24 posições visuais devem ficar separadas dos buckets cobráveis",
  );
  assert.match(
    source,
    /sameOccupancyRange\(range, latestRange\)[\s\S]*?scheduleNext\(undefined, true\)/,
    "respostas que atravessam a virada civil devem ser descartadas e refeitas",
  );
  assert.match(
    source,
    /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/,
    "voltar à aba visível deve disparar atualização imediata",
  );
});

test("dashboards de ocupação isolam o bucket aberto e descartam respostas de outra janela", () => {
  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const reportSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    liveSource,
    /requireOccupancyAggregateRows\([\s\S]*?openBucket: listBucketStarts\(definition\)\.at\(-1\)/,
    "o Ao Vivo deve liberar parcial somente para o último bucket solicitado",
  );
  assert.match(
    reportSource,
    /requireOccupancyAggregateRows\([\s\S]*?openBucket: definition\.openBucket/,
    "o Relatório deve propagar somente o bucket aberto calculado para a janela",
  );
  assert.match(
    reportSource,
    /function buildComparisonDefinition\([\s\S]*?openBucket: undefined/,
    "o Relatório não pode liberar parcial nos períodos comparativos históricos",
  );
  assert.match(
    liveSource,
    /DefinitionsWindowKey[\s\S]*?buildOccupancyChartDefinitions\(new Date\(\)\)/,
    "a janela ao vivo deve ser revalidada antes de publicar a resposta",
  );
  assert.match(
    reportSource,
    /definitionsWindowKey[\s\S]*?resolveOccupancyAnalysisRange\([\s\S]*?latestNow[\s\S]*?buildOccupancyReportDefinitions/,
    "a janela de relatório ou análise deve ser revalidada antes de publicar a resposta",
  );
  assert.match(
    liveSource,
    /let refreshRunning = false;[\s\S]*?refreshRunning = true;[\s\S]*?await loadScenarioData\(selectedScenario, \{ silent: true \}\);[\s\S]*?finally \{[\s\S]*?refreshRunning = false;[\s\S]*?scheduleNextRefresh\(\)/,
    "o Ao Vivo deve esperar a rodada terminar antes de reagendar, sem abortar consultas lentas a cada tick",
  );
  assert.doesNotMatch(
    reportSource,
    /setInterval|scheduleNextRefresh|refreshWhenVisible|visibilitychange/,
    "relatórios e análises de ocupação só devem consultar ao abrir, aplicar filtros ou atualizar explicitamente",
  );
});

test("Ocupação Ao Vivo consulta somente as fontes exigidas pelos widgets visíveis", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const buildPlan = loadStandaloneFunction(
    "components/app/occupancy-scenario-dashboard.tsx",
    "buildOccupancyLiveDataPlan",
    {
      OCCUPANCY_CHART_CARD_IDS: [
        "occupancy_chart_minute",
        "occupancy_chart_hour",
        "occupancy_chart_day",
        "occupancy_chart_week",
        "occupancy_chart_month",
      ],
    },
  );
  const plan = buildPlan(
    [
      { id: "occupancy_chart_minute", visible: true },
      { id: "occupancy_chart_month", visible: false },
      { id: "occupancy_current_total", visible: false },
      { id: "occupancy_alerts", visible: false },
      { id: "occupancy_custom_hidden", visible: false },
      { id: "occupancy_custom_visible", visible: true },
    ],
    [
      {
        granularity: "month",
        id: "hidden",
        kind: "trend",
      },
      {
        granularity: "day",
        id: "visible",
        kind: "trend",
      },
    ],
  );

  assert.deepEqual(plan.granularities, ["minute", "day"]);
  assert.equal(plan.history, false);
  assert.equal(plan.alerts, false);
  const appearanceOnlyPlan = buildPlan(
    [
      {
        color: "#ff00aa",
        id: "occupancy_custom_visible",
        order: 1,
        title: "Título personalizado",
        visible: true,
      },
      {
        color: "#00ffaa",
        id: "occupancy_chart_minute",
        order: 99,
        title: "Outra aparência",
        visible: true,
      },
    ],
    [
      {
        granularity: "day",
        id: "visible",
        kind: "trend",
      },
    ],
  );
  assert.equal(
    appearanceOnlyPlan.key,
    plan.key,
    "título, cor e ordem não podem alterar a identidade do plano de dados",
  );
  assert.deepEqual(
    buildPlan([{ id: "occupancy_alerts", visible: true }], []),
    {
      alerts: true,
      granularities: [],
      history: false,
      key: JSON.stringify([false, true, []]),
    },
    "alertas não podem disparar /history",
  );
  for (const cardId of [
    "occupancy_average",
    "occupancy_minimum",
    "occupancy_peak",
  ]) {
    assert.deepEqual(
      buildPlan([{ id: cardId, visible: true }], []).granularities,
      ["day"],
      `${cardId} deve carregar a fonte diária consumida pelo KPI`,
    );
  }
  for (const metric of ["average", "minimum", "peak"]) {
    assert.deepEqual(
      buildPlan(
        [{ id: `occupancy_custom_${metric}`, visible: true }],
        [{ id: metric, kind: "metric", metric }],
      ).granularities,
      ["day"],
      `o KPI personalizado ${metric} deve carregar a fonte diária`,
    );
  }
  assert.match(
    source,
    /occupancyPreferencesScopeKey = \[[\s\S]*?companyScopeId \?\? ""[\s\S]*?userId \?\? ""[\s\S]*?selectedId[\s\S]*?occupancyPreferencesReadyKey === occupancyPreferencesScopeKey/,
    "a hidratação deve ser identificada por empresa, usuário e visão",
  );
  assert.match(
    source,
    /hydratedOccupancyPreferences = occupancyPreferencesReady[\s\S]*?EMPTY_OCCUPANCY_PREFERENCES[\s\S]*?buildOccupancyLiveDataPlan\(\s*hydratedOccupancyPreferences/,
    "o plano deve receber uma seleção vazia enquanto o novo escopo hidrata",
  );
  assert.match(
    source,
    /useOccupancyComparisonCards\(\{[\s\S]*?preferences: hydratedOccupancyPreferences[\s\S]*?useOccupancyDurationCards\(\{[\s\S]*?preferences: hydratedOccupancyPreferences/,
    "hooks filhos não podem receber preferências remanescentes do escopo anterior",
  );
  assert.match(
    source,
    /const loadScenarioData = React\.useCallback\([\s\S]*?if \(!occupancyPreferencesReady\) return;/,
    "nenhuma consulta da visão deve começar antes da hidratação",
  );
  assert.match(source, /dueDefinitions = definitions\.filter/);
  assert.match(source, /dueHistory[\s\S]*?dueAlerts[\s\S]*?dueDefinitions\.length === 0/);
  assert.match(source, /Promise\.all\([\s\S]*?dueDefinitions\.map/);
  assert.match(
    source,
    /minute: OCCUPANCY_REFRESH_MS,[\s\S]*?hour: MINUTE_MS,[\s\S]*?day: 5 \* MINUTE_MS,[\s\S]*?week: 15 \* MINUTE_MS,[\s\S]*?month: HOUR_MS/,
  );
  assert.match(source, /const OCCUPANCY_ALERTS_REFRESH_MS = 30_000/);
  assert.match(
    source,
    /computedOccupancyDataPlan = buildOccupancyLiveDataPlan[\s\S]*?React\.useMemo\([\s\S]*?occupancyLiveDataPlanFromKey\(computedOccupancyDataPlan\.key\)[\s\S]*?\[computedOccupancyDataPlan\.key\]/,
    "mudanças apenas de aparência não podem recriar o plano nem a callback de consulta",
  );
});

test("comparativos de Ocupação desligam fontes ocultas e não atualizam cinco anos em cinco segundos", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const dashboardSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );

  for (const guard of [
    "needsSnapshots",
    "needsHourlyAggregate",
    "needsCurrentHourMaximum",
    "needsMaximumTrend",
  ]) {
    assert.match(source, new RegExp(`if \\(!${guard}\\) return;`));
  }
  assert.match(source, /const DEFAULT_MAXIMUM_TREND_REFRESH_MS = 60 \* 60_000/);
  assert.match(
    source,
    /delayMs = maximumTrendRefreshMs[\s\S]*?temporalRefreshDelay\(delayMs, boundary\)/,
  );
  assert.match(
    dashboardSource,
    /aggregateRefreshMs: OCCUPANCY_COMPARISON_AGGREGATE_REFRESH_MS/,
  );
  assert.match(
    source,
    /aggregateCoversCurrentHour[\s\S]*?broader hourly request owns this source[\s\S]*?aggregateDataset\.series\.find/,
  );
  assert.match(source, /if \(!needsHourlyAggregate\) \{[\s\S]*?scheduleNext/);
});

test("retorno à Ocupação respeita o TTL independente de cada fonte", () => {
  const remaining = loadStandaloneFunction(
    "components/app/occupancy-comparison-widgets.tsx",
    "occupancyComparisonFreshnessRemainingMs",
  );
  const freshness = {
    completedAt: 10_000,
    refreshVersion: 3,
    scopeKey: "company|scenario",
    windowKey: "window-a",
  };
  const request = {
    now: new Date(25_000),
    refreshMs: 60_000,
    refreshVersion: 3,
    scopeKey: "company|scenario",
    windowKey: "window-a",
  };

  assert.equal(remaining(freshness, request), 45_000);
  assert.equal(
    remaining(freshness, { ...request, now: new Date(70_000) }),
    0,
  );
  assert.equal(
    remaining(freshness, { ...request, windowKey: "window-b" }),
    0,
    "a virada da janela deve atualizar mesmo dentro do TTL",
  );
  assert.equal(
    remaining(freshness, { ...request, refreshVersion: 4 }),
    0,
    "a atualização manual deve ignorar o TTL",
  );

  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  for (const resource of [
    "snapshots",
    "aggregate",
    "currentHourMaximum",
    "maximumTrend",
  ]) {
    assert.match(
      source,
      new RegExp(
        `occupancyComparisonFreshnessRemainingMs\\(\\s*resourceFreshnessRef\\.current\\.${resource}`,
      ),
      `${resource} deve certificar o próprio frescor antes da consulta`,
    );
  }
  assert.match(
    source,
    /refreshVersion: manualRefreshVersion[\s\S]*?freshnessRemainingMs > 0/,
  );
  assert.match(
    source,
    /return \{ cards, refresh, reportAssets, settings, updateSettings \}/,
    "o botão Atualizar precisa continuar forçando as fontes visíveis",
  );
});

test("Ocupação estabiliza o fuso e executa uma única carga após atualizar metadados", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const loader = source.slice(
    source.indexOf("  const loadScenarioData = React.useCallback"),
    source.indexOf("  const refreshOccupancyDashboard = React.useCallback"),
  );
  const refresh = source.slice(
    source.indexOf("  const refreshOccupancyDashboard = React.useCallback"),
    source.indexOf("  const updateDashboardSettings = React.useCallback"),
  );

  assert.match(
    source,
    /React\.useMemo<CompanyTimeZoneResolution>[\s\S]*?companyTimeZoneResolution\.fallback,[\s\S]*?companyTimeZoneResolution\.source,[\s\S]*?companyTimeZoneResolution\.timeZone,[\s\S]*?companyTimeZoneResolution\.warning/,
  );
  assert.doesNotMatch(
    loader,
    /\bcompanyTimeZoneResolution\b/,
    "a identidade transitória do objeto de fuso não pode recriar o loader",
  );
  assert.match(
    loader,
    /requireCertifiedRuntimeCompanyTimeZone\(\s*certifiedCompanyTimeZoneResolution/,
  );
  assert.match(
    refresh,
    /if \(metadataError\) \{[\s\S]*?metadataLoadedKeyRef\.current = "";[\s\S]*?await loadScenarios\(selectedScenario\?\.id\);[\s\S]*?\} else if \(selectedScenario\) \{[\s\S]*?await loadScenarioData\(selectedScenario, \{ force: true \}\);[\s\S]*?refreshOccupancyComparisons\(\)/,
    "o catálogo só deve ser reconsultado quando o erro pertence aos metadados",
  );
  assert.doesNotMatch(
    refresh,
    /Promise\.all/,
    "metadados e dados não podem ser carregados em paralelo e se abortar",
  );
  assert.match(
    source,
    /onClick=\{\(\) => void refreshOccupancyDashboard\(\)\}/,
  );
  assert.match(
    source,
    /loadScenarioData\(selectedScenario\);/,
    "mudança de plano deve carregar apenas recursos vencidos ou novos",
  );
});

test("Ocupação compartilha a série horária certificada do cenário em foco", () => {
  const dashboardSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const aggregateEffect = comparisonSource.slice(
    comparisonSource.indexOf("    async function refreshAggregates()"),
    comparisonSource.indexOf("  React.useEffect(() => {\n    if (!needsCurrentHourMaximum)"),
  );

  assert.match(
    dashboardSource,
    /focusHourlyAggregate = React\.useMemo<OccupancySharedHourlyAggregate \| null>/,
  );
  assert.match(
    dashboardSource,
    /useOccupancyComparisonCards\(\{[\s\S]*?focusHourlyAggregate,[\s\S]*?focusSnapshotPending,/,
  );
  assert.match(
    dashboardSource,
    /visible\.has\("occupancy_scenario_max_hour"\)[\s\S]*?granularities\.add\("hour"\)/,
    "o pai deve assumir a fonte horária quando apenas o máximo por hora está visível",
  );
  assert.match(
    comparisonSource,
    /hourlyAggregateDayCount = needsHourlyHeatmap \? settings\.dayCount : 1/,
    "o comparativo simples não deve buscar sete dias sem necessidade",
  );
  assert.match(
    aggregateEffect,
    /resolveSharedOccupancyHourlyAggregate\([\s\S]*?sharedFocus\.covered && !sharedFocus\.series[\s\S]*?return;/,
    "a comparação deve aguardar a requisição idêntica que já pertence ao pai",
  );
  assert.match(
    aggregateEffect,
    /scenario\.id === focusScenarioId &&[\s\S]*?sharedFocus\.series[\s\S]*?return sharedFocus\.series;/,
    "a série certificada do foco deve substituir sua segunda chamada",
  );
  assert.ok(
    aggregateEffect.indexOf("return sharedFocus.series;") <
      aggregateEffect.indexOf("apiFetch<OccupancyScenarioAggregateResponse>"),
    "a reutilização precisa ocorrer antes de qualquer GET do cenário",
  );
  assert.match(
    dashboardSource,
    /const focusSnapshotPending = Boolean\([\s\S]*?!certifiedHistoryError[\s\S]*?!sharedFocusSnapshot/,
    "uma falha de /history deve liberar o lote dos demais cenários",
  );
  assert.match(
    comparisonSource,
    /focusSnapshotPending &&[\s\S]*?requestedIds\.has\(focusScenarioId\)[\s\S]*?return;/,
    "o comparativo deve aguardar somente enquanto a requisição do pai está em voo",
  );
  assert.match(
    comparisonSource,
    /const focusHourlyAggregateKey = focusHourlyAggregate[\s\S]*?focusHourlyAggregateKey,[\s\S]*?focusScenarioId/,
    "atualizações do objeto compartilhado não podem abortar o lote dos demais cenários",
  );
});

test("falhas parciais da Ocupação preservam respostas e frescor independentes", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const loader = source.slice(
    source.indexOf("  const loadScenarioData = React.useCallback"),
    source.indexOf("  const refreshOccupancyDashboard = React.useCallback"),
  );

  assert.match(
    loader,
    /occupancyScenarioHistoryPath[\s\S]*?\.catch\(\(error\) => \{[\s\S]*?succeeded: false as const/,
    "history não pode rejeitar o lote inteiro",
  );
  assert.match(
    loader,
    /dueAlerts[\s\S]*?succeeded: true as const[\s\S]*?succeeded: false as const/,
    "alertas precisam informar sucesso separadamente",
  );
  assert.match(
    loader,
    /chartEntries\.map\(\(entry\) => \[entry\.id, entry\.state\]\)/,
    "agregados concluídos devem ser publicados mesmo se outra fonte falhar",
  );
  assert.match(loader, /alertsAt: alertResult\.succeeded \? completedAt/);
  assert.match(loader, /historyAt: historyResult\.succeeded/);
  assert.match(
    loader,
    /chartEntries\.forEach\(\(entry\) => \{[\s\S]*?if \(!entry\.succeeded\) return;[\s\S]*?nextFreshness\.chartAt/,
    "somente a granularidade concluída pode avançar seu TTL",
  );
});

test("catálogo do Ao Vivo deduplica metadados e só tenta novamente após erro", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const loader = source.slice(
    source.indexOf("  const loadScenarios = React.useCallback"),
    source.indexOf("  const loadCharts = React.useCallback"),
  );
  const loaderDependencies = loader.slice(loader.lastIndexOf("  }, ["));
  const autoRefresh = source.slice(
    source.indexOf("  useResourceAutoRefresh(\n    () => loadScenarios"),
    source.indexOf("  React.useEffect(() => {\n    function syncCameraGroups"),
  );

  assert.match(source, /metadataRequestKeyRef = React\.useRef\(""\)/);
  assert.match(source, /metadataLoadedKeyRef = React\.useRef\(""\)/);
  assert.match(
    loader,
    /metadataRequestKeyRef\.current === metadataKey \|\|[\s\S]*?metadataLoadedKeyRef\.current === metadataKey[\s\S]*?return;/,
    "Strict Mode e renders equivalentes devem compartilhar o catálogo",
  );
  assert.doesNotMatch(loaderDependencies, /\bcameraGroups\b/);
  assert.doesNotMatch(loaderDependencies, /\bworkerLocationAssignments\b/);
  assert.match(loader, /cameraGroupsRef\.current/);
  assert.match(loader, /workerLocationAssignmentsRef\.current/);
  assert.match(
    autoRefresh,
    /enabled:[\s\S]*?Boolean\(metadataError\)/,
    "catálogo saudável não deve manter polling em repouso",
  );
});

test("catálogo da Ocupação deduplica replay e preserva seleção ao trocar somente o fuso", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const loader = source.slice(
    source.indexOf("  const loadScenarios = React.useCallback"),
    source.indexOf("  const loadScenarioData = React.useCallback"),
  );
  const resetStart = source.indexOf(
    "  React.useEffect(() => {\n    requestRef.current?.abort();",
  );
  const companyReset = source.slice(
    resetStart,
    source.indexOf("  React.useEffect(() => {\n    if (", resetStart),
  );

  assert.match(loader, /metadataRequestKeyRef\.current === metadataKey/);
  assert.match(loader, /metadataLoadedKeyRef\.current === metadataKey/);
  assert.match(loader, /signal: controller\.signal/);
  assert.match(loader, /metadataLoadedKeyRef\.current = metadataKey/);
  assert.match(companyReset, /\}, \[companyScopeId\]\);/);
  assert.doesNotMatch(
    companyReset.slice(companyReset.lastIndexOf("  }, [")),
    /companyTimeZone/,
    "o fuso invalida dados temporais, não o catálogo tenant-scoped",
  );
});

test("análise por período aguarda configuração, deduplica e não faz polling", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /configurationReadyKey !== configurationScopeKey/);
  assert.match(source, /loadingScenarios/);
  assert.match(source, /setQueryVersion\(\(value\) => value \+ 1\)/);
  assert.match(
    source,
    /completedRequestKeyRef\.current === requestKey[\s\S]*?completedRequestKeyRef\.current = requestKey/,
    "um evento semanticamente idêntico não deve repetir uma análise já concluída",
  );
  assert.doesNotMatch(source, /setInterval|refreshWhenIdle|visibilitychange/);
});

test("análises compartilham datasets e ignoram alterações puramente visuais", () => {
  const countingSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const requirementsSource = countingSource.slice(
    countingSource.indexOf("  const dataRequirementsKey"),
    countingSource.indexOf("  const hourlyDetailRequested"),
  );

  assert.match(
    countingSource,
    /const queryWidgets = React\.useMemo\([\s\S]*?orderByCardPreferences\(widgets, preferences\)/,
  );
  assert.match(
    countingSource,
    /const canonicalHourPromise =[\s\S]*?const contextHourPromise = requirements\.contextHour\s*\? canonicalHourPromise[\s\S]*?const hourPromise = requirements\.hour\s*\? canonicalHourPromise/,
    "widgets horários devem compartilhar uma única promessa de consulta",
  );
  assert.match(
    countingSource,
    /pendingAnalysisDayRequestsForCache[\s\S]*?pending\.promise/,
    "consultas diárias equivalentes em voo devem ser compartilhadas",
  );
  assert.match(
    countingSource,
    /pendingAnalysisDatasetsBySignal[\s\S]*?const existing = pending\.get\(key\);[\s\S]*?if \(existing\) return existing/,
    "a mesma faixa agregada não deve ser disparada duas vezes na mesma análise",
  );
  assert.match(
    countingSource,
    /const reconciliationMinutePromise = currentMinuteRange[\s\S]*?requirements\.minute[\s\S]*?\? minutePromise/,
    "o detalhe minuto já carregado deve reconciliar a hora sem uma chamada sobreposta",
  );
  assert.match(
    requirementsSource,
    /periodAnalysisEffectiveGranularity\([\s\S]*?Math\.max\(1, scenarioCatalogSize\)/,
  );
  assert.doesNotMatch(
    requirementsSource,
    /Array\.from\(\{ length: catalogSize \}/,
    "cada widget deve solicitar somente a resolução que realmente renderiza",
  );
  assert.doesNotMatch(
    requirementsSource,
    /scenarioIds|selectionMode|scopeMode|widgetColorById|widgetTitleById/,
    "composição, cor e título usam a resposta agregada já carregada",
  );
  assert.match(
    occupancySource,
    /requestedDefinitionIdsKey[\s\S]*?preferenceById\.get\(id\)\?\.visible !== false/,
  );
  assert.match(
    occupancySource,
    /buildOccupancyReportDefinitions\([\s\S]*?\.filter\(\(definition\) => requiredDefinitionIds\.has\(definition\.id\)\)/,
    "Ocupação deve consultar somente definições exigidas pelos widgets visíveis",
  );
});

test("visão embutida limita polling aos dados ao vivo e aborta escopos antigos", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/embedded-live-view.tsx"),
    "utf8",
  );
  const dataStart = source.indexOf("  const loadData = React.useCallback");
  const metadataStart = source.indexOf("  const loadMetadata = React.useCallback");
  const effectsStart = source.indexOf("  React.useEffect(() => {", metadataStart);

  assert.ok(dataStart >= 0 && metadataStart > dataStart && effectsStart > metadataStart);
  const dataLoader = source.slice(dataStart, metadataStart);
  const metadataLoader = source.slice(metadataStart, effectsStart);

  assert.doesNotMatch(
    dataLoader,
    /request<unknown>\("\/(?:scenarios|cameras|locations|workers)"\)/,
    "o ciclo de 5 s não deve recarregar catálogos",
  );
  assert.match(metadataLoader, /fetchEmbeddedScenarios\(/);
  assert.match(
    source,
    /fetchEmbeddedScenarios[\s\S]*?request<unknown>\("\/scenarios"\)/,
  );
  assert.match(metadataLoader, /request<unknown>\("\/cameras"\)/);
  assert.match(metadataLoader, /request<unknown>\("\/locations"\)/);
  assert.match(dataLoader, /signal: controller\.signal/);
  assert.match(metadataLoader, /signal: controller\.signal/);
  assert.match(dataLoader, /metadataSnapshotRef\.current !== metadataSnapshot/);
  assert.match(
    metadataLoader,
    /viewIdentityKeyRef\.current !== requestedIdentityKey/,
  );
  assert.doesNotMatch(
    source,
    /setInterval\([\s\S]*?refreshMetadataWhenVisible[\s\S]*?RESOURCE_METADATA_REFRESH_INTERVAL_MS/,
    "metadados devem atualizar por foco/retorno, sem polling periódico",
  );
  assert.match(source, /addEventListener\("focus", refreshMetadataWhenVisible\)/);
  assert.match(
    source,
    /setInterval\([\s\S]*?refreshDataWhenVisible[\s\S]*?REFRESH_SECONDS \* 1000/,
  );
  assert.match(source, /metadataRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /dataRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /metadataRequestIdentityKeyRef = React\.useRef\(""\)/);
  assert.match(
    metadataLoader,
    /metadataRequestRunningRef\.current &&[\s\S]*?metadataRequestIdentityKeyRef\.current === viewIdentityKey[\s\S]*?return;/,
    "o replay do Strict Mode deve reutilizar a requisição semântica em voo",
  );
  assert.match(source, /void loadMetadata\(\);/);
  assert.doesNotMatch(source, /void loadMetadata\(\{ force: true \}\);/);
  assert.match(
    dataLoader,
    /fetchBoundedHourlyAggregateRanges\([\s\S]*?signal: controller\.signal/,
    "o cache horário mais novo deve continuar abortável",
  );
  assert.match(
    dataLoader,
    /const pendingRequests = new Map[\s\S]*?pendingRequests\.get\(path\)/,
    "requisições diretas idênticas da mesma rodada devem compartilhar a promise",
  );
  assert.match(
    dataLoader,
    /const liveSourceRequired = queryableConfigs\.some[\s\S]*?liveSourceRequired[\s\S]*?fetchBoundedHourlyAggregateRanges/,
    "a base ao vivo deve existir somente para widgets que realmente a consomem",
  );
  assert.match(
    dataLoader,
    /scenarioRequests\.get\(queryKey\)[\s\S]*?scenarioRequests\.set\(queryKey, pending\)/,
    "comparativos com a mesma janela devem compartilhar o mesmo dataset",
  );
  assert.match(
    dataLoader,
    /scenarioDatasetCacheRef\.current\.get\(queryKey\)[\s\S]*?definition\.to <= now[\s\S]*?cacheEmbeddedScenarioDataset/,
    "um comparativo histórico fechado deve continuar em cache durante o polling de outros widgets",
  );
  assert.match(
    metadataLoader,
    /const liveDataStale =[\s\S]*?!dataRequestRunningRef\.current[\s\S]*?MIN_DATA_REFRESH_INTERVAL_MS[\s\S]*?metadataChanged \|\|[\s\S]*?liveDataStale/,
    "a atualização de metadados não deve duplicar uma rodada de dados ainda fresca ou em voo",
  );
  assert.match(
    source,
    /certifyCompanyScopeTimeZoneOverride\([\s\S]*?queryCompanyId/,
    "o company_id explícito deve ser certificado contra o escopo autenticado",
  );
  assert.match(
    source,
    /companyScopeCertification\.timeZone[\s\S]*?widgetConfigs/,
    "a identidade embutida deve mudar quando o fuso certificado mudar",
  );
  assert.match(
    source,
    /widgetConfigs\.map\(embeddedWidgetQueryConfig\)[\s\S]*?companyScopeCertification\.timeZone,[\s\S]*?widgetQueryIdentityKey/,
    "a identidade de consulta deve ignorar a apresentação do widget",
  );
  assert.match(
    source,
    /currentConfigById[\s\S]*?config: currentConfigById\.get\(state\.config\.id\)/,
    "o título atual deve ser reaplicado ao dataset sem refazer a consulta",
  );
});

test("visão embutida não atualiza períodos históricos fechados a cada 5 segundos", () => {
  const needsLiveRefresh = loadStandaloneFunction(
    "components/app/embedded-live-view.tsx",
    "embeddedViewNeedsLiveRefresh",
  );
  const now = new Date("2026-09-02T18:00:00.000Z");
  const scenarioWidget = {
    chart: "scenario-hour",
    period: "yesterday",
  };

  assert.equal(needsLiveRefresh([scenarioWidget], now), false);
  assert.equal(
    needsLiveRefresh(
      [
        {
          ...scenarioWidget,
          period: "custom",
          to: "2026-09-01T23:59:59.000Z",
        },
      ],
      now,
    ),
    false,
  );
  assert.equal(
    needsLiveRefresh(
      [
        {
          ...scenarioWidget,
          period: "custom",
          to: "2026-09-03T00:00:00.000Z",
        },
      ],
      now,
    ),
    true,
  );
  assert.equal(
    needsLiveRefresh([{ chart: "today-location" }], now),
    true,
  );
});

test("título da visão embutida não participa da identidade de consulta", () => {
  const queryConfig = loadStandaloneFunction(
    "components/app/embedded-live-view.tsx",
    "embeddedWidgetQueryConfig",
  );
  const base = {
    chart: "scenario-hour",
    from: "2026-08-01T00:00:00.000Z",
    granularity: "day",
    id: "single",
    period: "custom",
    scenarioIds: ["scenario-b", "scenario-a"],
    scopeId: "",
    to: "2026-09-01T00:00:00.000Z",
  };

  assert.deepEqual(
    queryConfig({ ...base, title: "Título A" }),
    queryConfig({ ...base, title: "Título B" }),
  );
  assert.deepEqual(
    queryConfig({ ...base, title: "Título A" }).scenarioIds,
    ["scenario-a", "scenario-b"],
  );
});

test("comparação de cenários separa consulta de apresentação e filtra localmente", () => {
  const dataKey = loadStandaloneFunction(
    "components/app/scenario-comparison-card.tsx",
    "scenarioComparisonSettingsDataKey",
  );
  const presentationKey = loadStandaloneFunction(
    "components/app/scenario-comparison-card.tsx",
    "scenarioComparisonSettingsPresentationKey",
  );
  const base = {
    accumulated: false,
    customFrom: "2026-08-01T00:00",
    customTo: "2026-09-01T00:00",
    granularity: "hour",
    period: "last_30d",
    selectedScenarioIds: [],
    selectionMode: "all",
    view: "period",
  };
  const presentationOnly = {
    ...base,
    accumulated: true,
    selectedScenarioIds: ["scenario-b", "scenario-a", "scenario-b"],
    selectionMode: "custom",
  };

  assert.equal(
    dataKey(base),
    dataKey(presentationOnly),
    "acumulado e cenários são transformações locais da mesma resposta global",
  );
  assert.notEqual(presentationKey(base), presentationKey(presentationOnly));
  assert.equal(
    presentationKey(presentationOnly),
    presentationKey({
      ...presentationOnly,
      selectedScenarioIds: ["scenario-a", "scenario-b"],
    }),
    "ordem e duplicatas da seleção não devem mudar sua identidade visual",
  );
  assert.equal(
    dataKey(base),
    dataKey({
      ...base,
      customFrom: "2019-01-01T00:00",
      customTo: "2020-01-01T00:00",
    }),
    "datas personalizadas inativas não podem invalidar a consulta",
  );
  assert.notEqual(
    dataKey(base),
    dataKey({ ...base, granularity: "day" }),
  );
  assert.equal(
    dataKey({ ...base, granularity: "hour", view: "days_month" }),
    dataKey({ ...base, granularity: "month", view: "days_month" }),
    "comparativos civis usam fonte diária independentemente do seletor oculto",
  );
  assert.equal(
    dataKey(base, true),
    dataKey(
      {
        ...base,
        customFrom: "2019-01-01T00:00",
        customTo: "2019-02-01T00:00",
        period: "custom",
      },
      true,
    ),
    "um período imposto pelo relatório deve ignorar o período salvo no widget",
  );

  const source = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  const dataIdentity = source.slice(
    source.indexOf("  const dataRequestKey ="),
    source.indexOf("  const hasScenarioSelection ="),
  );
  assert.doesNotMatch(
    dataIdentity,
    /settings\.accumulated|selectedScenarioIds|selectionMode|resolvedTitle|widgetColor/,
  );
  assert.match(source, /hourlySourceRef\.current/);
  assert.match(source, /aggregateSourceRef\.current/);
  assert.match(
    source,
    /const definition = React\.useMemo\([\s\S]*?accumulated: settings\.accumulated/,
  );
});

test("catálogo multiempresa do Master é particionado antes da validação", () => {
  const selectedCompanyId = "company-selected";
  assert.equal(
    masterCompanyScope.usesMasterCrossCompanyScope(
      { company_id: "company-jwt", id: "master", is_master: true },
      selectedCompanyId,
    ),
    true,
  );
  assert.equal(
    masterCompanyScope.usesMasterCrossCompanyScope(
      { company_id: selectedCompanyId, id: "master", is_master: true },
      selectedCompanyId,
    ),
    false,
  );
  const mixedScenarios = [
    {
      ...scenario("scenario-jwt", "Cenário do JWT", "line-jwt", 1),
      company_id: "company-jwt",
    },
    {
      ...scenario("scenario-selected", "Cenário selecionado", "line-selected", 1),
      company_id: selectedCompanyId,
    },
  ];
  const selectedScenarios = tenantScopeValidation.selectExplicitCompanyScopedRows(
    mixedScenarios,
    selectedCompanyId,
    { label: "cenários de Contagem" },
  );

  assert.equal(selectedScenarios.foreignCount, 1);
  assert.deepEqual(selectedScenarios.foreignCompanyIds, ["company-jwt"]);
  assert.deepEqual(
    scenarioValidation
      .requireScenarioRows(selectedScenarios.rows, selectedCompanyId)
      .map((row) => row.id),
    ["scenario-selected"],
  );
  assert.throws(
    () =>
      tenantScopeValidation.selectExplicitCompanyScopedRows(
        [{ ...mixedScenarios[0], company_id: undefined }],
        selectedCompanyId,
        { label: "cenários de Contagem" },
      ),
    /company_id.*inválido/,
    "Master nunca pode atribuir uma linha sem company_id ao tenant selecionado",
  );

  const rows = metadataValidation.requireWorkerRows({
    workers: [
      {
        active: true,
        company_id: selectedCompanyId,
        id: "worker-selected",
        name: "Worker selecionado",
      },
      {
        active: true,
        company_id: "company-jwt",
        id: "worker-jwt",
        name: "Worker do JWT",
      },
    ],
  });
  const partition = workerScope.partitionWorkersByCompanyScope(
    rows,
    selectedCompanyId,
  );

  assert.deepEqual(
    partition.scopedRows.map((worker) => worker.id),
    ["worker-selected"],
  );
  assert.deepEqual(
    partition.foreignRows.map((worker) => worker.id),
    ["worker-jwt"],
  );

  const scenarioRows = scenarioValidation.requireScenarioRows(mixedScenarios);
  const scopedScenarioRows = masterCompanyScope.filterScopedApiRows(
    scenarioRows,
    selectedCompanyId,
  );
  assert.deepEqual(
    scopedScenarioRows.map((scenarioRow) => scenarioRow.id),
    ["scenario-selected"],
    "cenário estrangeiro deve ser descartado sem contaminar os demais recursos",
  );

  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const realtimeLoader = realtimeSource.slice(
    realtimeSource.indexOf("  const loadScenarios = React.useCallback"),
    realtimeSource.indexOf("  const loadCharts = React.useCallback"),
  );
  const realtimeWorkerHelper = realtimeSource.slice(
    realtimeSource.indexOf("async function fetchRealtimeWorkers"),
    realtimeSource.indexOf("function buildRealtimeScopeOptions"),
  );

  assert.match(realtimeLoader, /Promise\.allSettled\(/);
  assert.doesNotMatch(
    realtimeLoader,
    /if \(scenarioResult\.status === "rejected"\) throw/,
  );
  assert.match(
    realtimeLoader,
    /scenarioResult\.status === "fulfilled"[\s\S]*?unavailableScenarioMetadata/,
  );
  assert.match(
    realtimeLoader,
    /workerResult\.status === "fulfilled"[\s\S]*?unavailableWorkerMetadata/,
  );
  assert.match(realtimeLoader, /setScenarios\(visible\)/);
  assert.match(realtimeLoader, /setCameras\(scopedCameras\)/);
  assert.match(realtimeLoader, /setLocations\(scopedLocations\)/);
  assert.match(
    realtimeLoader,
    /setScenarioMetadataWarning\(scenarioMetadata\.warning\)/,
  );
  assert.match(realtimeLoader, /setWorkerMetadataWarning\(workerMetadata\.warning\)/);
  assert.match(
    realtimeSource,
    /hasMasterAccess\(user\)[\s\S]*?getCurrentUserCompanyId\(user\) !== companyScopeId/,
  );
  assert.match(
    realtimeWorkerHelper,
    /selectExplicitCompanyScopedRows\(value, companyScopeId!.*?[\s\S]*?requireWorkerRows/,
  );
  assert.match(
    realtimeWorkerHelper,
    /fetchRealtimeScenarios[\s\S]*?filterScopedApiRows\(rows, companyId\)/,
  );

  const embeddedSource = readFileSync(
    resolve(projectRoot, "components/app/embedded-live-view.tsx"),
    "utf8",
  );
  const embeddedLoader = embeddedSource.slice(
    embeddedSource.indexOf("  const loadMetadata = React.useCallback"),
    embeddedSource.indexOf(
      "  React.useEffect(() => {",
      embeddedSource.indexOf("  const loadMetadata = React.useCallback"),
    ),
  );
  const embeddedWorkerHelper = embeddedSource.slice(
    embeddedSource.indexOf("async function fetchEmbeddedWorkers"),
    embeddedSource.indexOf("async function fetchSubLocations"),
  );

  assert.match(embeddedLoader, /Promise\.allSettled\(/);
  assert.doesNotMatch(
    embeddedLoader,
    /if \(scenarioResult\.status === "rejected"\) throw/,
  );
  assert.match(
    embeddedLoader,
    /scenarioResult\.status === "fulfilled"[\s\S]*?unavailableScenarioMetadata/,
  );
  assert.match(
    embeddedLoader,
    /workerResult\.status === "fulfilled"[\s\S]*?unavailableWorkerMetadata/,
  );
  assert.match(embeddedLoader, /scenarioError: scenarioMetadata\.error/);
  assert.match(embeddedLoader, /workers: workerMetadata\.rows/);
  assert.match(
    embeddedLoader,
    /setScenarioMetadataWarning\(scenarioMetadata\.warning\)/,
  );
  assert.match(embeddedLoader, /setMetadataWarning\(workerMetadata\.warning\)/);
  assert.match(
    embeddedWorkerHelper,
    /selectExplicitCompanyScopedRows\(value, companyId!.*?[\s\S]*?requireWorkerRows/,
  );
  assert.match(
    embeddedWorkerHelper,
    /fetchEmbeddedScenarios[\s\S]*?filterScopedApiRows\(rows, companyId\)/,
  );
  assert.match(
    embeddedSource,
    /scenarioError &&[\s\S]*?config\.chart === "scenario-hour"[\s\S]*?config\.chart === "today-scenario"/,
    "somente widgets dependentes de cenário devem receber o erro parcial",
  );
});

test("metadados de exportação usam o último instante realmente coberto", () => {
  const scenarioDataCompleteUntil = loadStandaloneFunction(
    "components/app/scenario-reports-dashboard.tsx",
    "scenarioReportDataCompleteUntil",
  );
  const analysisDataCompleteUntil = loadStandaloneFunction(
    "components/app/period-analysis-dashboard.tsx",
    "periodAnalysisDataCompleteUntil",
  );
  const period = {
    from: new Date("2026-07-01T00:00:00.000Z"),
    to: new Date("2026-08-01T00:00:00.000Z"),
  };

  assert.equal(
    scenarioDataCompleteUntil(
      period,
      new Date("2026-08-11T12:00:00.000Z"),
    ).toISOString(),
    "2026-07-31T23:59:59.999Z",
    "período histórico deve terminar em to - 1 ms",
  );
  assert.equal(
    scenarioDataCompleteUntil(
      period,
      new Date("2026-07-22T12:34:56.789Z"),
    ).toISOString(),
    "2026-07-22T12:34:56.789Z",
    "período aberto deve terminar no menor valor entre agora e to - 1 ms",
  );
  assert.equal(
    analysisDataCompleteUntil(
      period,
      new Date("2026-08-11T12:00:00.000Z"),
    ).toISOString(),
    "2026-07-31T23:59:59.999Z",
    "a análise não pode publicar 00:00 como fim inclusivo",
  );
  assert.equal(
    analysisDataCompleteUntil(
      period,
      new Date("2026-07-22T12:34:56.789Z"),
    ).toISOString(),
    "2026-07-22T12:34:56.789Z",
    "a análise aberta deve publicar somente o instante já coberto",
  );

  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const analysisSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    reportsSource,
    /const generatedAt = new Date\(\);[\s\S]*?generatedAt,[\s\S]*?scenarioReportDataCompleteUntil\([\s\S]*?effectivePeriodDates,[\s\S]*?generatedAt/,
    "generatedAt deve representar a geração, separado do corte dos dados",
  );
  assert.doesNotMatch(
    analysisSource,
    /dataCompleteUntil:\s*addDays\(period\.to,\s*-1\)/,
  );
});

test("análise por período envia empresa e abort signal em toda consulta", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const aggregateSource = readFileSync(
    resolve(projectRoot, "lib/aggregate-range-query.ts"),
    "utf8",
  );

  for (const path of ["scenarios", "cameras", "locations"]) {
    assert.match(
      source,
      new RegExp(
        `apiFetch<unknown>\\("/${path}", \\{[\\s\\S]*?companyScopeId: requestCompanyScopeId,[\\s\\S]*?signal: controller\\.signal`,
      ),
      `/${path} deve receber o escopo selecionado e o cancelamento`,
    );
  }
  assert.match(
    source,
    /`\/locations\/\$\{location\.id\}\/sub-locations`,[\s\S]*?companyScopeId: companyScopeId\?\.trim\(\) \|\| undefined,[\s\S]*?signal/,
    "sub-locations também deve usar a empresa e o mesmo cancelamento",
  );
  assert.equal(
    source.match(/`\/analytics\/aggregate\?/g)?.length,
    undefined,
    "todas as agregações da análise devem passar pelo helper certificado",
  );
  assert.match(
    source,
    /fetchCompleteAggregateRange\(\{[\s\S]*?companyScopeId: companyScopeId\?\.trim\(\) \|\| undefined,[\s\S]*?signal/,
    "o helper agregado deve preservar simultaneamente escopo e abort signal",
  );
  assert.match(aggregateSource, /rows\.length < AGGREGATE_RESPONSE_ROW_CEILING/);
  assert.match(aggregateSource, /splitCompleteAggregateRange/);
  assert.ok(
    source.match(/companyScopeId,\s*controller\.signal/g)?.length >= 3,
    "cada dataset agregado deve receber o escopo efetivo",
  );
});

test("cancelamento da análise não gera rejeição órfã nem mascara erro real", () => {
  const controller = new AbortController();
  const applicationError = new Error("falha real da consolidação");

  requestCancellation.abortRequest(
    controller,
    "A consulta anterior foi substituída.",
  );

  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason.name, "AbortError");
  assert.equal(
    controller.signal.reason.message,
    "A consulta anterior foi substituída.",
  );
  assert.equal(
    requestCancellation.isAbortError(
      controller.signal.reason,
      controller.signal,
    ),
    true,
  );
  assert.equal(
    requestCancellation.isAbortError(applicationError, controller.signal),
    false,
    "um erro de aplicação não pode ser escondido só porque o signal foi abortado",
  );

  const firstReason = controller.signal.reason;
  requestCancellation.abortRequest(controller, "segundo cancelamento");
  assert.equal(
    controller.signal.reason,
    firstReason,
    "o cancelamento deve ser idempotente e preservar a causa original",
  );

  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    source,
    /const \[hourly, boundaries\] = await Promise\.all\(\[\s*hourlyPromise,\s*boundaryPromise,\s*\]\)/,
    "as consultas paralelas de hora e borda precisam receber handlers juntas",
  );
  assert.doesNotMatch(
    source,
    /reconcileAnalysisHourlyBoundaries\(\s*await hourlyPromise,\s*await boundaryPromise/,
    "await sequencial deixa a segunda rejeição de abort sem consumidor",
  );
});

test("Análises e Relatórios segmentam a base horária e validam a cobertura", () => {
  const analysisSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );

  assert.match(
    analysisSource,
    /fetchAnalysisHourlyDatasets\([\s\S]*?fetchBoundedHourlyAggregateRanges\({[\s\S]*?ranges/,
  );
  assert.doesNotMatch(
    analysisSource,
    /function unionAnalysisRanges/,
    "intervalos separados não podem virar uma consulta contínua e truncável",
  );
  assert.match(
    reportsSource,
    /definition\.granularity === "hour"[\s\S]*?fetchBoundedHourlyAggregateRanges/,
  );
  assert.match(
    reportsSource,
    /fetchCompleteAggregateRange\(\{[\s\S]*?from: definition\.from,[\s\S]*?to: definition\.to/,
  );
  assert.match(
    comparisonSource,
    /definition\.granularity !== "hour"[\s\S]*?fetchConsolidatedScenarioComparisonRangeRows/,
  );
  assert.match(
    comparisonSource,
    /fetchCompleteAggregateRange\(\{[\s\S]*?granularity: definition\.granularity/,
  );
  assert.match(
    comparisonSource,
    /const fullTo = lastBoundaryPartial \? lastBoundaryStart : definition\.to/,
    "o bucket civil aberto deve vir apenas da borda horária, nunca de uma consulta day/month redundante",
  );
  assert.match(comparisonSource, /completeSourceCoverage/);
  assert.match(reportsSource, /aggregateSource=\{reportComparisonAggregateSource\}/);
  assert.match(reportsSource, /const requestAggregate: CompleteAggregateRequest/);
  assert.match(
    reportsSource,
    /while \(cursor < end && guard < 500\)[\s\S]*?if \(cursor < end\) \{[\s\S]*?throw new RangeError/,
    "o construtor de buckets deve falhar, nunca publicar uma série truncada",
  );
});

test("mês aberto compara somente horas fechadas equivalentes do ano anterior", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T15:00:00", "line-entry", 110),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T15:00:00", "line-entry", 20),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 310),
      aggregateRow("2026-07-01", "line-entry", 220),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: { cameraIds: [], name: "Entrada", scenario: entryScenario },
  });
  const july = model.yearOverYearMonths.find((row) => row.month === 6);
  const comparison =
    countingIntelligence.buildCountingMonthlyComparison(model);

  assert.equal(model.currentMonthValue, 220);
  assert.equal(model.currentMonthDelta, 0);
  assert.equal(model.periodDelta, 0);
  assert.deepEqual(
    { current: july?.current, delta: july?.delta, previous: july?.previous },
    { current: 200, delta: 0, previous: 200 },
  );
  assert.equal(comparison.variation.accumulated, 0);
});

test("base parcial sobreposta ganha série própria no comparativo anual", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 100),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 310),
      aggregateRow("2026-07-01", "line-entry", 220),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2025, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: { cameraIds: [], name: "Entrada", scenario: entryScenario },
  });
  const comparison =
    countingIntelligence.buildCountingMonthlyComparison(model);
  const selected2025 = comparison.rows.find(
    (row) => row.year === 2025 && !row.baselineOnly,
  );
  const comparable2025 = comparison.rows.find(
    (row) => row.year === 2025 && row.baselineOnly,
  );

  assert.equal(selected2025?.months[6], 310);
  assert.equal(comparable2025?.months[6], 200);
  const rowKeys = comparison.rows.map(
    (row) => `${row.year}:${row.baselineOnly ? "comparison-baseline" : "selected-period"}`,
  );
  assert.equal(
    new Set(rowKeys).size,
    rowKeys.length,
    "ano observado e base comparável precisam de identidades distintas",
  );
});

test("mês civil sem eventos permanece zero certificado", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [aggregateRow("2025-07-01T10:00:00", "line-entry", 100)],
    includeOpenPeriod: true,
    monthlyRows: [aggregateRow("2025-07-01", "line-entry", 100)],
    now: new Date(2026, 6, 22, 15, 30),
    period: { from: new Date(2026, 0, 1), to: new Date(2026, 7, 1) },
    scenarios: [entryScenario],
    scope: { cameraIds: [], name: "Entrada", scenario: entryScenario },
  });
  const july = model.yearOverYearMonths.find((row) => row.month === 6);
  const currentYear = model.yearRows.find((row) => row.year === 2026);

  assert.equal(model.currentMonthValue, 0);
  assert.equal(model.currentMonthDelta, -1);
  assert.deepEqual(
    { current: july?.current, delta: july?.delta, previous: july?.previous },
    { current: 0, delta: -1, previous: 100 },
  );
  assert.equal(currentYear?.months[6], 0);
});

test("heatmaps de ocupação mantêm célula zero e célula ausente", () => {
  const first = new Date(2026, 6, 29, 10, 0, 0, 0);
  const second = new Date(2026, 6, 29, 11, 0, 0, 0);
  const firstKey = occupancyAggregateValidation.occupancyAggregateBucketKey(
    first,
    "hour",
  );
  const scenario = {
    metrics: new Map([
      [firstKey, { average: 0, minimum: 0, peak: 0 }],
    ]),
    name: "Vitrine",
    scenarioId: "showcase",
  };
  const matrix = occupancyComparison.buildDaysHoursOccupancyCells({
    buckets: [first, second],
    metric: "average",
    scenario,
  });

  assert.equal(matrix.cells[0].value, 0);
  assert.equal(matrix.cells[1].value, null);
  assert.equal(matrix.cells[0].x, 0);
  assert.equal(matrix.cells[1].x, 0);
  assert.equal(matrix.cells[0].y, 10);
  assert.equal(matrix.cells[1].y, 11);
});

test("cada série heatmap de ocupação possui visualMap no motor ECharts", () => {
  const echarts = require("echarts/core");
  const { HeatmapChart } = require("echarts/charts");
  const { GridComponent, VisualMapComponent } = require("echarts/components");
  const { SVGRenderer } = require("echarts/renderers");
  echarts.use([
    HeatmapChart,
    GridComponent,
    VisualMapComponent,
    SVGRenderer,
  ]);
  const chart = echarts.init(null, null, {
    height: 360,
    renderer: "svg",
    ssr: true,
    width: 640,
  });

  try {
    const visualMap =
      occupancyHeatmapVisual.buildOccupancyHeatmapVisualMaps("#1267C4", 10);
    const darkVisualMap =
      occupancyHeatmapVisual.buildOccupancyHeatmapVisualMaps(
        "#1267C4",
        10,
        "dark",
      );
    assert.deepEqual(
      visualMap.map((entry) => entry.seriesIndex),
      [0, 1],
    );
    assert.deepEqual(
      visualMap[1].inRange.color,
      chartPalette.monochromeHeatmapPalette("#1267C4"),
      "a ocupação deve usar a mesma paleta monocromática da contagem",
    );
    assert.deepEqual(
      darkVisualMap[1].inRange.color,
      chartPalette.monochromeHeatmapPalette("#1267C4", "dark"),
      "o mapa de ocupação deve gerar sua escala diretamente para o modo escuro",
    );
    assert.equal(darkVisualMap[0].pieces[0].color, "#273244");
    assert.doesNotThrow(() =>
      chart.setOption({
        series: [
          { data: [[0, 0, -1]], type: "heatmap" },
          { data: [[1, 0, 0]], type: "heatmap" },
        ],
        visualMap,
        xAxis: { data: ["00h", "01h"], type: "category" },
        yAxis: { data: ["05/08"], type: "category" },
      }),
    );
    assert.match(chart.renderToSVGString(), /<svg/);
  } finally {
    chart.dispose();
  }
});

test("configuração dos widgets de ocupação é normalizada por schema", () => {
  const settings = occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
    capacities: { a: 12, b: 0, " bad ": 4 },
    colorPaletteId: "aurora",
    comparisonChartType: "bars",
    comparisonMode: "actual",
    comparisonStatusColors: {
      occupied: "#c2410c",
      preset: "availability",
      unoccupied: "#0f766e",
    },
    dayCount: 30,
    heatmapScenarioId: "scenario-a",
    hexColorPaletteId: "ocean",
    hexColumns: 8,
    hexDisplayMode: "status",
    hexLayout: {
      cells: [
        { column: 0, id: "cell-a", label: "Fila A", row: 0, scenarioId: "a" },
      ],
      columns: 4,
      preset: "custom",
      rows: 2,
      version: 1,
    },
    hexPreset: "workstation",
    hexStatusColors: {
      occupied: "#0f766e",
      preset: "productivity",
      unoccupied: "#b91c1c",
    },
    metric: "peak",
    scenarioHourHeatmapDateKey: "2026-08-10",
    scenarioIds: ["a", "a", "", " b "],
    schemaVersion: 99,
  });

  assert.equal(
    settings.schemaVersion,
    occupancyWidgetSettings.OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
  );
  assert.deepEqual(settings.scenarioIds, ["a"]);
  assert.deepEqual(settings.capacities, { a: 12 });
  assert.equal(settings.colorPaletteId, "aurora");
  assert.equal(settings.comparisonChartType, "bars");
  assert.equal(settings.comparisonMode, "actual");
  assert.equal(settings.dayCount, 30);
  assert.equal(settings.hexColorPaletteId, "ocean");
  assert.equal(settings.hexColumns, 8);
  assert.equal(settings.hexDisplayMode, "status");
  assert.equal(settings.hexLayout.cells[0].scenarioId, "a");
  assert.equal(settings.hexLayout.preset, "custom");
  assert.deepEqual(settings.hexStatusColors, {
    occupied: "#0F766E",
    preset: "productivity",
    unoccupied: "#B91C1C",
  });
  assert.equal(settings.metric, "peak");
  assert.equal(settings.scenarioHourHeatmapDateKey, "2026-08-10");
  assert.equal(
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      scenarioHourHeatmapDateKey: "10/08/2026",
    }).scenarioHourHeatmapDateKey,
    "",
    "a data compartilhada do heatmap deve aceitar somente a chave civil ISO",
  );
  const migratedV1 =
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      colorPaletteId: "aurora",
      comparisonStatusColors:
        occupancyWidgetSettings.occupancyStatusColorsForPreset(
          "availability",
        ),
      schemaVersion: 1,
    });
  assert.equal(
    migratedV1.schemaVersion,
    occupancyWidgetSettings.OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
    "payloads v1 devem migrar para o schema atual",
  );
  assert.equal(migratedV1.hexColorPaletteId, "aurora");
  assert.deepEqual(
    migratedV1.hexStatusColors,
    occupancyWidgetSettings.occupancyStatusColorsForPreset("availability"),
  );
  assert.equal(
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      comparisonChartType: "vertical_bars",
    }).comparisonChartType,
    "vertical_bars",
    "a escolha de barras verticais deve sobreviver à normalização persistida",
  );
});

test("cores semânticas de ocupação preservam legado, presets e contraste", () => {
  const legacy = occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
    comparisonMode: "status",
    hexColumns: 7,
    scenarioIds: ["a"],
  });
  assert.deepEqual(
    legacy.hexStatusColors,
    occupancyWidgetSettings.DEFAULT_OCCUPANCY_STATUS_COLORS,
    "configurações anteriores às cores do hex devem receber o preset neutro",
  );
  assert.equal(legacy.hexColumns, 7);
  assert.equal(
    legacy.comparisonChartType,
    "half_donut",
    "configurações anteriores ao seletor devem preservar a meia rosca",
  );
  assert.equal(
    legacy.hexDisplayMode,
    "actual",
    "configurações anteriores ao modo visual devem preservar o valor real",
  );
  assert.deepEqual(legacy.scenarioIds, ["a"]);
  assert.equal(
    legacy.colorPaletteId,
    occupancyColorPalettes.DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
    "configurações legadas devem receber a paleta enterprise",
  );
  assert.equal(
    legacy.hexColorPaletteId,
    occupancyColorPalettes.DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
  );

  const migratedSharedPalette =
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      colorPaletteId: "aurora",
    });
  assert.equal(
    migratedSharedPalette.hexColorPaletteId,
    "aurora",
    "sem hexColorPaletteId, o hex deve herdar a antiga paleta compartilhada",
  );

  const legacySharedColors =
    occupancyWidgetSettings.occupancyStatusColorsForPreset("availability");
  const migratedSharedColors =
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      comparisonStatusColors: legacySharedColors,
    });
  assert.deepEqual(
    migratedSharedColors.hexStatusColors,
    legacySharedColors,
    "sem hexStatusColors, o hex deve herdar as antigas cores compartilhadas",
  );

  assert.equal(
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      comparisonChartType: "invalid",
    }).comparisonChartType,
    "half_donut",
    "tipos de comparação desconhecidos devem usar a meia rosca segura",
  );

  assert.equal(
    occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
      hexDisplayMode: "invalid",
    }).hexDisplayMode,
    "actual",
    "modos desconhecidos devem usar o modo real seguro",
  );

  for (const preset of occupancyWidgetSettings.OCCUPANCY_STATUS_COLOR_PRESETS) {
    const colors = occupancyWidgetSettings.occupancyStatusColorsForPreset(
      preset.id,
    );
    assert.equal(colors.preset, preset.id);
    assert.equal(
      occupancyWidgetSettings.occupancyStatusColorsAreDistinct(colors),
      true,
      `${preset.label} precisa distinguir os dois estados`,
    );
  }

  assert.deepEqual(
    occupancyWidgetSettings.normalizeOccupancyStatusColors({
      occupied: "#112233",
      preset: "neutral",
      unoccupied: "#F5A623",
    }),
    {
      occupied: "#112233",
      preset: "custom",
      unoccupied: "#F5A623",
    },
    "cores alteradas manualmente não podem continuar rotuladas como preset",
  );
  assert.deepEqual(
    occupancyWidgetSettings.normalizeOccupancyStatusColors({
      occupied: "#123456",
      preset: "custom",
      unoccupied: "#123456",
    }),
    occupancyWidgetSettings.DEFAULT_OCCUPANCY_STATUS_COLORS,
    "pares indistinguíveis devem voltar ao neutro seguro",
  );
});

test("catálogo de paletas de ocupação oferece variações persistíveis e seguras", () => {
  assert.ok(
    occupancyColorPalettes.OCCUPANCY_COLOR_PALETTES.length >= 10,
    "o cliente precisa de um catálogo amplo de paletas",
  );
  for (const palette of occupancyColorPalettes.OCCUPANCY_COLOR_PALETTES) {
    assert.ok(palette.colors.length >= 8, `${palette.label} precisa cobrir séries densas`);
    assert.equal(new Set(palette.colors).size, palette.colors.length);
    palette.colors.forEach((color) => assert.match(color, /^#[0-9A-F]{6}$/));
  }
  assert.equal(
    occupancyColorPalettes.normalizeOccupancyColorPaletteId("ocean"),
    "ocean",
  );
  const cyber = occupancyColorPalettes.getOccupancyColorPalette("cyber");
  assert.equal(cyber.id, "cyber");
  assert.equal(cyber.label, "Cyber");
  assert.deepEqual(cyber.colors, [
    "#00E5FF",
    "#FF2A9D",
    "#7C3CFF",
    "#00D68F",
    "#FF6B00",
    "#3D5AFE",
    "#E900FF",
    "#C6FF00",
    "#00B8D9",
    "#FF1744",
  ]);
  const cyberSettings = occupancyWidgetSettings.normalizeOccupancyWidgetSettings({
    colorPaletteId: "cyber",
    hexColorPaletteId: "cyber",
  });
  assert.equal(cyberSettings.colorPaletteId, "cyber");
  assert.equal(cyberSettings.hexColorPaletteId, "cyber");
  assert.equal(
    occupancyColorPalettes.normalizeOccupancyColorPaletteId("desconhecida"),
    occupancyColorPalettes.DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
  );
});

test("paleta dos comparativos da visão fica centralizada na barra superior", () => {
  const dashboardSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const paletteSelectSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-palette-select.tsx"),
    "utf8",
  );
  assert.equal(
    (dashboardSource.match(/<OccupancyPaletteSelect/g) ?? []).length,
    1,
    "a paleta desta visão deve aparecer uma única vez na barra superior",
  );
  assert.match(
    dashboardSource,
    /aria-label="Aparência dos comparativos desta visão"[\s\S]*?<OccupancyPaletteSelect/,
  );
  assert.match(
    paletteSelectSource,
    /ariaLabel = "Paleta dos comparativos desta visão"/,
  );
  assert.match(
    paletteSelectSource,
    /aria-label=\{`\$\{ariaLabel\}: \$\{palette\.label\}`\}/,
  );
  assert.match(
    paletteSelectSource,
    /fluid \? "w-full min-w-0" : "w-\[64px\] @sm:w-\[116px\]"/,
  );
  assert.match(
    dashboardSource,
    /<OccupancyPaletteSelect[\s\S]*?compact[\s\S]*?fluid/,
  );
  assert.match(
    paletteSelectSource,
    /<PaletteSwatches colors=\{palette\.colors\} compact=\{compact\} selected \/>/,
  );
  assert.doesNotMatch(paletteSelectSource, /<SelectValue/);
  assert.match(paletteSelectSource, /selected && !compact \? 10 : 5/);
  assert.match(
    paletteSelectSource,
    /style=\{\{ display: "inline-flex" \}\}/,
    "a régua selecionada deve preservar flex mesmo sob o line-clamp do SelectTrigger",
  );
  assert.match(
    paletteSelectSource,
    /"block h-3\.5 w-1\.5 shrink-0"/,
    "cada amostra escolhida precisa manter dimensões próprias no trigger fechado",
  );
  assert.match(
    paletteSelectSource,
    /<SelectContent[\s\S]*?option\.label[\s\S]*?option\.description/,
    "o menu aberto deve preservar nome e descrição das paletas",
  );
  assert.match(
    paletteSelectSource,
    /title=\{`\$\{palette\.label\} — \$\{palette\.description\}`\}/,
    "os nomes devem permanecer acessíveis sem comprimir os swatches",
  );
  assert.doesNotMatch(
    dashboardSource.slice(dashboardSource.indexOf("{operationalSettingsOpen ? (")),
    /<OccupancyPaletteSelect|<OccupancyStatusColorsDialog/,
    "os seletores visuais não devem voltar ao painel colapsado",
  );
  const compactToolbarSource = dashboardSource.slice(
    dashboardSource.indexOf('aria-label="Controles da visão de ocupação"'),
    dashboardSource.indexOf("{operationalSettingsOpen ? ("),
  );
  assert.match(
    compactToolbarSource,
    /className="grid min-w-0 grid-cols-\[minmax\(0,96px\)_minmax\(0,64px\)_minmax\(248px,1fr\)\][^"]*@md:grid-cols-\[minmax\(120px,160px\)_64px_minmax\(248px,1fr\)\]/,
    "cenário, paleta, horário e ações devem permanecer na mesma linha",
  );
  assert.doesNotMatch(
    compactToolbarSource,
    /enterprise-horizontal-scroll|overflow-x-auto/,
    "a barra superior não deve exigir rolagem horizontal",
  );
  assert.doesNotMatch(
    compactToolbarSource,
    />Contexto<|>Estado<|Sincronização desta visão|dashboardSettings\.liveRefreshSeconds\}s|>Alertas<|>Aparência<|>Ações</,
    "a barra compacta não deve reintroduzir as segmentações removidas",
  );
  assert.match(compactToolbarSource, /<ReportExportActions[\s\S]*?compact/);
  assert.match(
    compactToolbarSource,
    /aria-label="Ações da visão de ocupação"\s+className="ml-auto flex shrink-0 flex-nowrap/,
  );
  assert.match(
    compactToolbarSource,
    /<ReportExportActions[\s\S]*?<ReorderModeButton[\s\S]*?aria-label="Configurar widgets de ocupação"[\s\S]*?aria-label="Configurações operacionais"[\s\S]*?aria-label="Atualizar dados de ocupação"[\s\S]*?<MonitorModeButton/,
  );
  assert.doesNotMatch(
    compactToolbarSource,
    /OccupancyStatusColorsDialog|Cores da comparação|Configurar cenários|manager\/scenarios/,
    "cores semânticas e gestão de cenários não devem ocupar a barra superior",
  );
  assert.match(
    compactToolbarSource,
    /Última atualização às \$\{formatTime\(lastUpdated\)\}/,
    "somente o horário da última atualização deve permanecer junto das ações",
  );
  assert.match(
    dashboardSource,
    /aria-label="Configurações operacionais da ocupação"[\s\S]*?role="group"[\s\S]*?Séries históricas[\s\S]*?<MetricVisibilityControls[\s\S]*?Concluir/,
    "o painel Operação deve conter somente a seleção das séries históricas",
  );
  const operationalPanelSource = dashboardSource.slice(
    dashboardSource.indexOf('aria-label="Configurações operacionais da ocupação"'),
    dashboardSource.indexOf("Nenhum cenário de ocupação configurado"),
  );
  assert.doesNotMatch(
    operationalPanelSource,
    /Atualização automática|Atualização ao vivo|Mapas e comparativos|liveRefreshSelectId|comparisonRefreshSelectId/,
  );
  assert.match(dashboardSource, /const OCCUPANCY_REFRESH_SECONDS = 5/);
  assert.match(
    dashboardSource,
    /aggregateRefreshMs: OCCUPANCY_COMPARISON_AGGREGATE_REFRESH_MS/,
  );
  assert.match(dashboardSource, /aggregateRefreshMs: OCCUPANCY_REFRESH_MS/);
  assert.match(dashboardSource, /aria-label="Cenário de ocupação em foco"/);
  assert.match(
    comparisonSource,
    /return \{ cards, refresh, reportAssets, settings, updateSettings \}/,
    "o painel superior precisa atualizar a mesma preferência persistida dos widgets",
  );
  assert.equal(
    (comparisonSource.match(/<OccupancyPaletteSelect/g) ?? []).length,
    1,
    "somente o simulador hexagonal deve manter seletor de paleta local",
  );
  assert.match(
    comparisonSource,
    /colorPalette=\{selectedHexColorPalette\.colors\}[\s\S]*?paletteId=\{settings\.hexColorPaletteId\}[\s\S]*?ariaLabel="Paleta de cores do simulador hexagonal"[\s\S]*?onSettingsChange\(\{ hexColorPaletteId \}\)/,
  );
  assert.equal(
    (comparisonSource.match(/<OccupancyStatusColorsDialog/g) ?? []).length,
    1,
    "somente o simulador hexagonal deve manter cores semânticas locais",
  );
  assert.match(
    comparisonSource,
    /statusColors=\{settings\.hexStatusColors\}[\s\S]*?buttonLabel="Cores do hex"[\s\S]*?onSettingsChange\(\{ hexStatusColors \}\)/,
  );
  assert.match(
    comparisonSource,
    /const persisted = onChange\(draft\);[\s\S]*?if \(persisted === false\) return;[\s\S]*?toast\.success\(successMessage\)/,
    "o diálogo não deve confirmar uma preferência que falhou ao persistir",
  );
  assert.match(
    comparisonSource,
    /displayStatusColors\.unoccupied[\s\S]*?Todos desocupados/,
    "o estado zerado deve usar a cor corrigida para o tema atual",
  );
  assert.match(
    comparisonSource,
    /grid min-w-0 gap-3 @xl:grid-cols-\[minmax\(220px,0\.8fr\)_minmax\(0,1\.2fr\)\][\s\S]*?<Hexagon[\s\S]*?flex min-w-0 flex-wrap items-center gap-2 @xl:justify-end/,
    "o cabeçalho do Hex deve distribuir título e controles sem criar uma faixa vazia",
  );
  const heatmapCardsSource = comparisonSource.slice(
    comparisonSource.indexOf("function OccupancyDayHourHeatmapCard"),
    comparisonSource.indexOf("function ScenarioScopeDialog"),
  );
  assert.equal(
    (heatmapCardsSource.match(/fallbackColor=\{colorPalette\[0\]\}/g) ?? [])
      .length,
    2,
    "as duas legendas de heatmap devem usar o mesmo fallback cromático das séries",
  );
  assert.match(comparisonSource, /useWidgetColor\(fallbackColor\)/);
});

test("Contagem usa barras compactas e o mesmo seletor profissional de período da Ocupação", () => {
  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const analysisSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const pickerSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-date-range-picker.tsx"),
    "utf8",
  );

  const liveToolbar = liveSource.slice(
    liveSource.indexOf('aria-label="Controles da visão ao vivo de Contagem"'),
    liveSource.indexOf("{operationalSettingsOpen ? ("),
  );
  assert.match(
    liveToolbar,
    /className="grid w-full min-w-0 grid-cols-\[80px_minmax\(0,104px\)_minmax\(212px,1fr\)\][^"]*@2xl:grid-cols-\[132px_220px_minmax\(212px,1fr\)\]/,
  );
  assert.doesNotMatch(liveToolbar, /enterprise-horizontal-scroll|overflow-x-auto/);
  assert.doesNotMatch(liveToolbar, /row-start-2/);
  assert.match(
    liveToolbar,
    /className="col-start-3 row-start-1 flex w-full min-w-0 items-center justify-end gap-2"/,
  );
  assert.match(liveToolbar, /<ReportExportActions[\s\S]*?compact/);
  assert.match(liveToolbar, /<MonitorModeButton[\s\S]*?compact/);
  assert.match(
    liveToolbar,
    /aria-label="Ações da visão ao vivo de Contagem"[\s\S]*?<ReportExportActions[\s\S]*?<ReorderModeButton[\s\S]*?aria-label="Configurar widgets"[\s\S]*?<Target[\s\S]*?<MonitorModeButton/,
  );
  assert.equal((liveToolbar.match(/<ReorderModeButton/g) ?? []).length, 1);
  assert.equal(
    (liveToolbar.match(/aria-label="Configurar widgets"/g) ?? []).length,
    1,
  );
  assert.match(liveToolbar, /aria-controls="counting-live-comparison-settings"/);
  assert.match(liveToolbar, /aria-expanded=\{operationalSettingsOpen\}/);
  assert.doesNotMatch(liveToolbar, />\s*5 segundos\s*</);
  assert.match(
    liveSource,
    /aria-label="Bases de comparação da Contagem"[\s\S]*?operationalSettings\.intradayComparison[\s\S]*?operationalSettings\.monthComparison/,
    "a compactação não pode remover as duas bases algorítmicas",
  );

  const analysisToolbar = analysisSource.slice(
    analysisSource.indexOf('aria-label="Controles da análise de Contagem"'),
    analysisSource.indexOf("{loadingScenarios && !scopeOptions.length"),
  );
  assert.match(
    analysisToolbar,
    /grid-cols-\[32px_minmax\(32px,1fr\)_176px\][^"]*@2xl:grid-cols-\[300px_minmax\(32px,1fr\)_176px\]/,
  );
  assert.match(
    analysisToolbar,
    /aria-label="Informações da análise de Contagem"[\s\S]*?Última atualização às/,
  );
  assert.match(
    analysisToolbar,
    /aria-label="Ações da análise de Contagem"\s+className="col-start-3 row-start-1 flex w-\[176px\][^"]*flex-nowrap/,
  );
  assert.match(analysisToolbar, /<AnalysisDateRangePicker/);
  assert.match(
    analysisToolbar,
    /key=\{`\$\{companyScopeId \?\? ""\}\|\$\{user\?\.id \?\? ""\}`\}/,
    "trocar empresa ou usuário deve descartar o rascunho aberto",
  );
  assert.match(analysisToolbar, /contextLabel="análise de Contagem"/);
  assert.doesNotMatch(
    analysisToolbar,
    /disabled=\{loadingData\}/,
    "o calendário deve continuar acessível enquanto uma consulta anterior termina",
  );
  assert.doesNotMatch(analysisToolbar, /type="date"|>Consultar<|>Dia<|>Período</);
  assert.match(
    analysisSource,
    /mode: startInput === endInput \? "day" : "range"/,
    "um único dia deve continuar acionando os algoritmos diários",
  );
  assert.match(
    analysisSource,
    /try \{[\s\S]*?savePeriodAnalysisSettings[\s\S]*?catch \{[\s\S]*?será aplicado, mas não pôde ser salvo/,
    "falha do armazenamento não pode impedir a consulta escolhida",
  );
  assert.match(
    pickerSource,
    /export function AnalysisDateRangePicker/,
    "Contagem e Ocupação devem compartilhar o mesmo componente visual",
  );
  assert.match(pickerSource, /maximumDays\?: number/);
  assert.match(
    pickerSource,
    /maximumDays=\{MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS\}/,
    "o limite de 366 dias deve continuar exclusivo da Ocupação",
  );
  assert.match(pickerSource, /aria-haspopup="dialog"/);
  assert.match(
    pickerSource,
    /className="h-8 w-8 min-w-0 max-w-full shrink-0[^"]*@sm:w-\[300px\][^"]*"/,
  );
  assert.match(
    analysisSource,
    /maximumInput=\{companyDateKey\(new Date\(\), companyTimeZone\)\}/,
    "o limite futuro deve seguir o dia civil da empresa",
  );
  assert.match(
    readFileSync(
      resolve(projectRoot, "lib/occupancy-analysis-window.ts"),
      "utf8",
    ),
    /Date\.UTC\([\s\S]*?endUtc - startUtc/,
    "a contagem visual de dias não pode truncar intervalos longos da Contagem",
  );
});

test("contador civil compartilhado preserva intervalos longos sem depender de DST", () => {
  assert.equal(
    occupancyAnalysisWindow.countOccupancyAnalysisDateRangeDays(
      "2024-01-01",
      "2025-12-31",
    ),
    731,
  );
  assert.equal(
    occupancyAnalysisWindow.countOccupancyAnalysisDateRangeDays(
      "2026-10-31",
      "2026-11-02",
    ),
    3,
  );
});

test("exportação da Ocupação Ao Vivo inclui comparativos e duração configurados", () => {
  const dashboardSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const durationSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-duration-widgets.tsx"),
    "utf8",
  );
  const reportBuilderSource = comparisonSource.slice(
    comparisonSource.indexOf("function buildOccupancyComparisonReportAssets"),
    comparisonSource.indexOf("function OccupancyHalfDonutCard"),
  );
  const comparisonCardIds = [
    "occupancy_scenario_half_donut",
    "occupancy_scenario_bar_race",
    "occupancy_scenario_max_hour",
    "occupancy_scenario_max_month",
    "occupancy_scenario_max_year",
    "occupancy_hex_layout",
    "occupancy_day_hour_heatmap",
    "occupancy_scenario_hour_heatmap",
  ];

  for (const cardId of comparisonCardIds) {
    assert.match(
      reportBuilderSource,
      new RegExp(`cardId: "${cardId}"`),
      `${cardId} precisa gerar um asset de relatório`,
    );
  }
  for (const cardId of [
    "occupancy_duration_timeline",
    "occupancy_duration_by_scenario",
  ]) {
    assert.match(
      durationSource,
      new RegExp(`cardId: "${cardId}"`),
      `${cardId} precisa gerar um asset de relatório`,
    );
  }
  assert.match(
    durationSource,
    /response\.data\.length\s*>=\s*AGGREGATE_RESPONSE_ROW_CEILING/,
    "a duração precisa detectar o teto silencioso de linhas da API",
  );
  assert.match(
    durationSource,
    /fetchDurationAggregatePartition\([\s\S]*?buckets:\s*buckets\.slice\(0, midpoint\)[\s\S]*?fetchDurationAggregatePartition\([\s\S]*?buckets:\s*buckets\.slice\(midpoint\)/,
    "a duração precisa dividir recursivamente respostas possivelmente truncadas",
  );
  assert.match(
    durationSource,
    /DURATION_RECONCILIATION_MINUTES[\s\S]*?reconcileOccupancyDurationMetrics\(/,
    "a atualização minuto a minuto deve reconciliar uma janela curta em vez de baixar o dia inteiro",
  );
  assert.match(
    durationSource,
    /chunkDurationSeries\([\s\S]*?interactive:\s*false/,
    "a exportação deve dividir muitos cenários e remover o zoom interativo do arquivo estático",
  );
  assert.match(
    durationSource,
    /scenario\.company_id === companyScopeId/,
    "a duração deve particionar os cenários pela empresa antes de consultar a API",
  );
  assert.match(reportBuilderSource, /theme = "light" as const/);
  assert.doesNotMatch(
    reportBuilderSource,
    /occupancy:\s*entry\.total\s*\?\?|value:\s*cell\.value\s*\?\?/,
    "as tabelas do relatório não podem converter ausência certificada em zero",
  );
  assert.match(
    reportBuilderSource,
    /cell\.value === null \? "Sem dados" : "Disponível"/,
  );
  assert.match(
    comparisonSource,
    /dateKey=\{scenarioHourHeatmapDateKey\}[\s\S]*?onDateKeyChange=\{\(scenarioHourHeatmapDateKey\) =>[\s\S]*?updateSettings\(\{ scenarioHourHeatmapDateKey \}\)/,
    "a data exibida no heatmap cenários x horários deve ser a mesma persistida e exportada",
  );
  assert.match(
    dashboardSource,
    /reportAssets: occupancyComparisonReportAssets[\s\S]*?occupancyComparisonReportAssets\.forEach\(\(\{ cardId, chart \}\) =>/,
    "o relatório deve incorporar os assets usando as preferências de ordem, visibilidade e título",
  );
  assert.match(
    dashboardSource,
    /occupancyDurationReportAssets[\s\S]*?occupancyDurationReportAssets\.forEach\([\s\S]*?titleSuffix/,
    "o relatório deve incorporar a linha do tempo e o comparativo de duração",
  );
  assert.match(
    dashboardSource,
    /occupancyDurationReportMetrics[\s\S]*?occupancyDurationReportMetrics\.forEach\(\(\{ cardId, metric \}\) =>/,
    "o relatório deve incorporar os indicadores de duração",
  );
  assert.match(
    dashboardSource,
    /occupancyReportDataCompleteUntil\([\s\S]*?occupancyDurationDataCompleteUntil/,
    "o corte certificado deve considerar também os agregados de duração",
  );
});

test("widgets de duração preservam composição, acessibilidade e resumo numérico limitado", () => {
  const durationPath = "components/app/occupancy-duration-widgets.tsx";
  const durationSource = readFileSync(resolve(projectRoot, durationPath), "utf8");
  const dashboardSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const describeComposition = loadStandaloneFunction(
    durationPath,
    "describeDurationScenarioComposition",
  );
  const buildSummaryTable = loadStandaloneFunction(
    durationPath,
    "buildDurationSummaryReportTable",
    { HOUR_SECONDS: 3_600 },
  );
  const compactOption = loadStandaloneFunction(
    durationPath,
    "compactDurationChartOption",
  );

  assert.deepEqual(
    describeComposition([
      { id: "a", name: "Entrada Norte" },
      { id: "b", name: "Praça de alimentação" },
    ]),
    {
      fullLabel: "Entrada Norte + Praça de alimentação",
      shortLabel: "Entrada Norte + Praça de alimentação",
    },
  );

  const scenarioSeries = ["a", "b"].map((scenarioId, index) => ({
    name: index ? "Praça de alimentação" : "Entrada Norte",
    scenarioId,
    summary: {
      confirmedFreeSeconds: 180 + index * 60,
      confirmedOccupiedSeconds: 120 + index * 60,
      expectedSeconds: 600,
      loadUnitSeconds: 7_200 + index * 3_600,
      longestConfirmedOccupiedSeconds: 120,
      observedSeconds: 540,
      segments: Array.from({ length: 500 }, () => ({ state: "occupied" })),
      transitionSeconds: 240 - index * 60,
      unknownSeconds: 60,
    },
  }));
  const table = buildSummaryTable(
    scenarioSeries,
    "Resumo",
    "Todos os intervalos permanecem no gráfico.",
  );
  assert.equal(table.rows.length, 2, "a tabela deve crescer por cenário, não por segmento");
  assert.match(table.description, /1\.000 intervalo\(s\).*sem truncar os totais/);
  for (const column of table.columns.slice(1)) {
    assert.equal(column.numeric, true, `${column.key} precisa ser quantitativa`);
    assert.equal(typeof table.rows[0][column.key], "number");
  }
  assert.equal(table.rows[0].occupied, 2);
  assert.equal(table.rows[0].load, 2);

  const compact = compactOption(
    {
      grid: { bottom: 56, left: 12, right: 26, top: 46 },
      legend: { itemHeight: 8, textStyle: { fontSize: 10 }, top: 4 },
      xAxis: { axisLabel: { fontSize: 9 }, name: "Tempo" },
      yAxis: { axisLabel: { width: 112 } },
    },
    "timeline",
  );
  assert.equal(compact.grid.top, 24);
  assert.equal(compact.grid.bottom, 30);
  assert.equal(compact.legend.textStyle.fontSize, 8);

  assert.match(
    durationSource,
    /requestedScenarioKey[\s\S]*?React\.useMemo\([\s\S]*?\[requestedScenarioKey, scenarioOptions\]/,
    "edições visuais devem preservar a identidade da lista consultada",
  );
  assert.match(
    durationSource,
    /enabled = true[\s\S]*?if \(!enabled\) return "";[\s\S]*?React\.useEffect\(\(\) => \{\s*if \(!enabled\) \{[\s\S]*?scopeKey: ""[\s\S]*?return;/,
    "a duração deve zerar a fonte e sair antes de criar consulta ou timer enquanto a visão hidrata",
  );
  assert.match(
    dashboardSource,
    /useOccupancyDurationCards\(\{[\s\S]*?enabled: occupancyPreferencesReady/,
    "o dashboard deve habilitar a duração apenas depois de hidratar o escopo atual",
  );
  assert.match(durationSource, /new ResizeObserver\(update\)/);
  assert.match(durationSource, /data-duration-chart-density=/);
  assert.match(durationSource, /aria-live=\{tone === "error" \? "assertive" : "polite"\}/);
  assert.match(
    durationSource,
    /<table className="sr-only">[\s\S]*?Ocupado confirmado[\s\S]*?Sem dados/,
  );
  assert.match(durationSource, /Consultar os \{rows\.length\} cenários em texto/);
  assert.match(
    durationSource,
    /definition\.description,[\s\S]*?composition\.shortLabel[\s\S]*?contextualMessage/,
    "o aviso não pode substituir a semântica conceitual do KPI",
  );
  assert.match(
    durationSource,
    /reportContext[\s\S]*?buildDurationReportContext/,
  );
  assert.match(
    durationSource,
    /const reportWarnings =[\s\S]*?timeZoneWarning,[\s\S]*?currentDataset\.error/,
    "o aviso de fuso deve acompanhar PDF e IA mesmo com a timeline oculta",
  );
  assert.match(
    dashboardSource,
    /\.\.\.occupancyDurationReportContext/,
    "a composição própria dos widgets deve chegar ao relatório e à IA",
  );
});

test("Análises oferece Ocupação com seletor de intervalo civil aplicado", () => {
  const wrapper = readFileSync(
    resolve(projectRoot, "components/app/analysis-dashboard.tsx"),
    "utf8",
  );
  const moduleTabs = readFileSync(
    resolve(projectRoot, "components/app/dashboard-module-tabs.tsx"),
    "utf8",
  );
  const reports = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const picker = readFileSync(
    resolve(projectRoot, "components/app/occupancy-date-range-picker.tsx"),
    "utf8",
  );

  assert.match(wrapper, /<DashboardModuleTabs/);
  assert.match(moduleTabs, /TabsTrigger value="occupancy"[\s\S]*?Ocupação/);
  assert.match(moduleTabs, /DASHBOARD_MODULE_STORAGE_KEY/);
  assert.match(wrapper, /<OccupancyReportsDashboard analysis manager=\{manager\}/);
  assert.match(reports, /<OccupancyDateRangePicker[\s\S]*?onApply=\{updateAnalysisRangeInput\}/);
  assert.match(
    reports,
    /analysis\s*\? "Controles da análise de Ocupação"\s*: "Controles dos relatórios de Ocupação"/,
    "a análise de Ocupação deve reunir os filtros em uma única barra acessível",
  );
  assert.match(
    reports,
    /analysis[\s\S]*?"grid min-w-0 grid-cols-\[minmax\(0,32px\)_minmax\(0,64px\)_minmax\(0,96px\)_minmax\(248px,1fr\)\] items-center gap-1 @4xl:grid-cols-\[300px_minmax\(140px,170px\)_minmax\(180px,220px\)_minmax\(248px,1fr\)\]/,
    "calendário, filtros, horário e ações devem compartilhar uma linha compacta",
  );
  const analysisToolbar = reports.slice(
    reports.indexOf('"Controles da análise de Ocupação"'),
    reports.indexOf("{(analysis && analysisSettingsOpen) ||"),
  );
  assert.doesNotMatch(analysisToolbar, /overflow-x-auto|enterprise-horizontal-scroll/);
  assert.doesNotMatch(analysisToolbar, /row-start-2/);
  assert.match(
    reports,
    /analysis\s*\? "Tipo de visão da análise de Ocupação"\s*: "Tipo de visão dos relatórios de Ocupação"/,
  );
  assert.match(
    reports,
    /aria-label="Configurações da análise de Ocupação"[\s\S]*?<SlidersHorizontal/,
    "comparação e séries devem ficar acessíveis por uma única ação compacta",
  );
  assert.match(
    reports,
    /\? "occupancy-analysis-settings"\s*: "occupancy-report-settings"[\s\S]*?Comparação temporal[\s\S]*?<PreviousPeriodToggle[\s\S]*?compact[\s\S]*?<ComparisonModeSelect[\s\S]*?compact[\s\S]*?fit[\s\S]*?Séries históricas[\s\S]*?<MetricVisibilityControls[\s\S]*?compact/,
    "a otimização não pode remover os algoritmos de comparação nem as séries históricas",
  );
  assert.match(reports, /<ReportExportActions[\s\S]*?compact/);
  assert.match(reports, /<MonitorModeButton[\s\S]*?compact/);
  assert.match(
    reports,
    /loadingScopes && !scopeOptions\.length/,
    "uma atualização silenciosa não deve desmontar os filtros nem perder o foco",
  );
  assert.doesNotMatch(
    reports,
    />\s*Período da análise|Intervalo inclusivo no dia civil da empresa/,
    "a barra não deve reintroduzir um cabeçalho explicativo que consome outra linha",
  );
  assert.match(reports, /analysisIncludesToday \? clock : undefined/);
  assert.match(reports, /companyDateKey\(clock, companyTimeZone\)/);
  assert.match(reports, /openBucket: definition\.openBucket/);
  assert.match(picker, /<Dialog[\s\S]*?<DialogTrigger[\s\S]*?<DialogContent/);
  assert.match(picker, /Início[\s\S]*?type="date"[\s\S]*?Fim[\s\S]*?type="date"/);
  assert.match(picker, /Cancelar[\s\S]*?Aplicar período/);
  assert.match(picker, /Últimos 7 dias[\s\S]*?Semana passada[\s\S]*?Mês anterior/);
});

test("Relatórios de Ocupação mantém filtros e ações na régua compacta", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const reportControlsStart = source.indexOf(
    '"Controles dos relatórios de Ocupação"',
  );
  const reportControls = source.slice(
    reportControlsStart,
    source.indexOf("{(analysis && analysisSettingsOpen) ||", reportControlsStart),
  );

  assert.notEqual(reportControlsStart, -1);
  assert.match(source, /<div className="@container rounded-md border/);
  assert.match(
    source,
    /: "grid min-w-0 grid-cols-\[minmax\(0,64px\)_minmax\(0,96px\)_minmax\(248px,1fr\)\][^"]*@2xl:grid-cols-\[132px_220px_minmax\(248px,1fr\)\]"/,
  );
  assert.equal(
    (reportControls.match(/className="h-8 w-full min-w-0 bg-card"/g) ?? [])
      .length,
    2,
  );
  assert.match(
    reportControls,
    /aria-label="Ações dos relatórios de Ocupação"\s+className="ml-auto flex shrink-0 flex-nowrap/,
  );
  assert.doesNotMatch(
    reportControls,
    /overflow-x-auto|overflow-x-scroll|enterprise-horizontal-scroll|row-start-2/,
  );
  assert.match(
    source,
    /aria-controls="occupancy-report-settings"[\s\S]*?"occupancy-report-settings"[\s\S]*?<PreviousPeriodToggle[\s\S]*?compact[\s\S]*?<ComparisonModeSelect[\s\S]*?compact[\s\S]*?fit[\s\S]*?<MetricVisibilityControls[\s\S]*?compact/,
  );
});

test("Relatórios de Contagem não duplica o controle do mês aberto", () => {
  const periodSource = readFileSync(
    resolve(projectRoot, "components/app/counting-report-period-control.tsx"),
    "utf8",
  );
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );

  assert.equal(
    (periodSource.match(/role="switch"/g) ?? []).length,
    1,
  );
  assert.match(periodSource, /<DialogTrigger asChild>/);
  assert.match(
    periodSource,
    /className="h-8 w-8[^"]*@sm:w-full[^"]*@sm:justify-start/,
  );
  assert.match(
    reportsSource,
    /aria-label="Ações dos relatórios de Contagem"\s+className="col-start-5 row-start-1 flex w-\[248px\][^"]*flex-nowrap/,
  );
});

test("Relatórios de Contagem limita consultas e preferências antigas a quatro anos civis", () => {
  const now = new Date(2026, 8, 3, 10, 30);
  const periodSource = readFileSync(
    resolve(projectRoot, "components/app/counting-report-period-control.tsx"),
    "utf8",
  );
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );

  assert.equal(countingReportPeriod.COUNTING_REPORT_HISTORY_YEARS, 4);
  assert.equal(countingReportPeriod.minimumCountingReportMonth(now), "2023-01");
  assert.deepEqual(
    localDateParts(countingReportPeriod.countingReportHistoryFrom(now)),
    [2023, 1, 1],
  );
  assert.deepEqual(countingReportPeriod.defaultCountingReportPeriod(now), {
    from: "2023-01",
    to: "2026-09",
  });
  assert.deepEqual(
    countingReportPeriod.normalizeCountingReportPeriod(
      { from: "2020-01", to: "2026-09" },
      now,
    ),
    { from: "2023-01", to: "2026-09" },
  );
  assert.match(
    periodSource,
    /Últimos \$\{COUNTING_REPORT_HISTORY_YEARS\} anos/,
  );
  assert.match(
    reportsSource,
    /from: addYears\(currentYearStart, -\(COUNTING_REPORT_HISTORY_YEARS - 1\)\)/,
  );
  const monthlyHistoryDefinition = reportsSource.slice(
    reportsSource.indexOf("function buildCountingMonthHistoryDefinition"),
    reportsSource.indexOf("function buildCountingOpenComparisonDefinitions"),
  );
  assert.match(monthlyHistoryDefinition, /countingReportHistoryFrom\(now\)/);
  assert.match(monthlyHistoryDefinition, /Math\.max\(/);
  assert.match(
    reportsSource,
    /buildComparisonDefinition\([\s\S]*?countingReportHistoryFrom\(now\)/,
  );
  const previousDefinition = reportsSource.slice(
    reportsSource.indexOf("function buildComparisonDefinition"),
    reportsSource.indexOf("function previousId"),
  );
  assert.match(previousDefinition, /minimumFrom: Date/);
  assert.match(previousDefinition, /Math\.max\(comparisonFrom\.getTime\(\), minimumFrom\.getTime\(\)\)/);
  assert.doesNotMatch(reportsSource, /Últimos 5 anos|currentYearStart, -4/);

  const entry = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    comparisonDataFrom: new Date(2023, 0, 1),
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2023-01-01", "line-entry", 100),
      aggregateRow("2024-01-01", "line-entry", 200),
      aggregateRow("2025-01-01", "line-entry", 300),
    ],
    now,
    period: {
      from: new Date(2023, 0, 1),
      to: new Date(2026, 0, 1),
    },
    scenarios: [entry],
    scope: { cameraIds: [], name: "Entrada", scenario: entry },
  });
  assert.equal(model.periodValue, 600);
  assert.equal(model.periodComparisonLimited, true);
  assert.equal(model.periodComparisonMonthCount, 24);
  assert.ok(Math.abs(model.periodDelta - 2 / 3) < 1e-12);
});

test("calendário de ocupação expõe uma grade ARIA de sete colunas", () => {
  const picker = readFileSync(
    resolve(projectRoot, "components/app/occupancy-date-range-picker.tsx"),
    "utf8",
  );

  assert.match(
    picker,
    /role="grid"[\s\S]*?aria-labelledby=\{monthLabelId\}[\s\S]*?aria-colcount=\{7\}/,
  );
  assert.match(
    picker,
    /role="grid"[\s\S]*?role="row"[\s\S]*?role="columnheader"/,
    "os cabeçalhos dos dias devem pertencer a uma linha da grade",
  );
  assert.match(
    picker,
    /role="rowgroup"[\s\S]*?Array\.from\(\{ length: 6 \}[\s\S]*?role="row"[\s\S]*?role="gridcell"/,
    "as 42 posições devem estar agrupadas em seis semanas válidas",
  );
  assert.doesNotMatch(
    picker,
    /role="gridcell"\s+aria-hidden/,
    "células vazias não podem desaparecer da estrutura de sete colunas",
  );
});

test("calendário mantém navegação por teclado no mês visível em telas móveis", () => {
  const picker = readFileSync(
    resolve(projectRoot, "components/app/occupancy-date-range-picker.tsx"),
    "utf8",
  );

  assert.match(picker, /calendarRootRef = React\.useRef/);
  assert.match(picker, /window\.matchMedia\("\(min-width: 768px\)"\)\.matches/);
  assert.match(
    picker,
    /desktopCalendar[\s\S]*?: !sameMonth\(nextDate, visibleMonth\)[\s\S]*?setVisibleMonth\(nextMonth\)/,
  );
  assert.match(picker, /focusCalendarDate\(calendarRootRef\.current, nextInput\)/);
  assert.doesNotMatch(picker, /document\s*\.querySelector<HTMLButtonElement>/);
});

test("ocupação histórica usa somente semanas e meses civis já fechados", () => {
  const reference = new Date(2026, 7, 9, 23, 59, 59, 999);
  const week = occupancyAnalysisWindow.buildClosedOccupancyHistoricalRange(
    reference,
    "week",
    8,
  );
  const month = occupancyAnalysisWindow.buildClosedOccupancyHistoricalRange(
    reference,
    "month",
    12,
  );

  assert.deepEqual(localDateParts(week.to), [2026, 8, 3]);
  assert.deepEqual(localDateParts(week.from), [2026, 6, 8]);
  assert.deepEqual(localDateParts(month.to), [2026, 8, 1]);
  assert.deepEqual(localDateParts(month.from), [2025, 8, 1]);
  assert.ok(week.to <= reference);
  assert.ok(month.to <= reference);

  const intervalFrom = new Date(2026, 6, 1, 0, 0, 0, 0);
  const intervalTo = new Date(2026, 8, 1, 0, 0, 0, 0);
  const weeks =
    occupancyAnalysisWindow.listClosedOccupancyBucketsWithinRange(
      intervalFrom,
      intervalTo,
      "week",
    );
  const months =
    occupancyAnalysisWindow.listClosedOccupancyBucketsWithinRange(
      intervalFrom,
      intervalTo,
      "month",
    );
  assert.ok(weeks.length > 0);
  assert.ok(
    weeks.every(
      (bucket) =>
        bucket >= intervalFrom &&
        new Date(
          bucket.getFullYear(),
          bucket.getMonth(),
          bucket.getDate() + 7,
        ) <= intervalTo,
    ),
  );
  assert.deepEqual(months.map(localDateParts), [
    [2026, 7, 1],
    [2026, 8, 1],
  ]);
});

test("intervalo futuro de ocupação é normalizado antes de construir a consulta", () => {
  const clock = new Date(2026, 7, 10, 14, 30, 0, 0);

  assert.equal(
    occupancyAnalysisWindow.normalizeOccupancyAnalysisDateInput(
      "2026-08-11",
      clock,
    ),
    "2026-08-10",
  );
  assert.equal(
    occupancyAnalysisWindow.resolveOccupancyAnalysisReference(
      clock,
      "2026-08-11",
      true,
    ).getTime(),
    clock.getTime(),
  );
  const historical =
    occupancyAnalysisWindow.resolveOccupancyAnalysisReference(
      clock,
      "2026-08-09",
      true,
    );
  assert.deepEqual(localDateParts(historical), [2026, 8, 9]);
  assert.equal(historical.getHours(), 23);
  assert.equal(historical.getMinutes(), 59);
  assert.equal(historical.getSeconds(), 59);
  assert.equal(historical.getMilliseconds(), 999);

  assert.deepEqual(
    occupancyAnalysisWindow.normalizeOccupancyAnalysisDateRangeInput(
      "2026-08-01",
      "2026-08-11",
      "2026-08-10",
    ),
    { endInput: "2026-08-10", startInput: "2026-08-01" },
  );
  const range = occupancyAnalysisWindow.resolveOccupancyAnalysisRange(
    clock,
    "2026-08-01",
    "2026-08-09",
    true,
    "2026-08-10",
  );
  assert.deepEqual(localDateParts(range.from), [2026, 8, 1]);
  assert.deepEqual(localDateParts(range.to), [2026, 8, 10]);
  assert.equal(range.from.getHours(), 0);
  assert.equal(range.to.getHours(), 0);
  assert.equal(range.includesToday, false);
  assert.equal(range.dayCount, 9);
  assert.doesNotThrow(() =>
    occupancyAnalysisWindow.resolveOccupancyAnalysisRange(
      clock,
      "2025-08-10",
      "2026-08-10",
      true,
      "2026-08-10",
    ),
  );
  assert.throws(
    () =>
      occupancyAnalysisWindow.resolveOccupancyAnalysisRange(
        clock,
        "2025-08-09",
        "2026-08-10",
        true,
        "2026-08-10",
      ),
    /não pode exceder 366 dias/,
  );
});

test("intervalo civil preserva DST e bloqueia runtime diferente da empresa", () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const clock = new Date(2026, 2, 9, 12, 0, 0, 0);
    const range = occupancyAnalysisWindow.resolveOccupancyAnalysisRange(
      clock,
      "2026-03-08",
      "2026-03-08",
      true,
      "2026-03-09",
    );
    assert.deepEqual(localDateParts(range.from), [2026, 3, 8]);
    assert.deepEqual(localDateParts(range.to), [2026, 3, 9]);
    assert.equal(
      range.to.getTime() - range.from.getTime(),
      23 * 60 * 60 * 1000,
      "o dia da virada de DST não pode ser forçado para 24 horas",
    );
    assert.equal(
      companyTimeZone.requireRuntimeCompanyTimeZone("America/New_York"),
      "America/New_York",
    );
    assert.throws(
      () => companyTimeZone.requireRuntimeCompanyTimeZone("Asia/Tokyo"),
      /consulta civil foi bloqueada/,
    );
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("seletor de Análises ordena dia, mês fechado e período personalizado", () => {
  const pickerSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-date-range-picker.tsx"),
    "utf8",
  );
  const maximumInput = "2026-09-03";

  assert.equal(
    analysisPeriodSelection.previousClosedCivilDayInput(maximumInput),
    "2026-09-02",
  );
  assert.equal(
    analysisPeriodSelection.previousClosedCivilDayInput("2026-01-01"),
    "2025-12-31",
  );
  assert.deepEqual(
    periodAnalysisWidgets.createDefaultPeriodAnalysisSettings(
      new Date(2026, 8, 3, 12),
    ),
    { from: "2026-09-02", mode: "day", to: "2026-09-02" },
  );
  assert.deepEqual(
    analysisPeriodSelection.lastClosedMonthRange(maximumInput),
    { endInput: "2026-08-31", startInput: "2026-08-01" },
  );
  assert.deepEqual(
    analysisPeriodSelection.lastClosedMonthRange("2026-01-01"),
    { endInput: "2025-12-31", startInput: "2025-12-01" },
  );
  assert.deepEqual(
    analysisPeriodSelection.closedMonthRange(2024, 1),
    { endInput: "2024-02-29", startInput: "2024-02-01" },
  );
  assert.equal(
    analysisPeriodSelection.isClosedMonthAvailable(2026, 7, maximumInput),
    true,
  );
  assert.equal(
    analysisPeriodSelection.isClosedMonthAvailable(2026, 8, maximumInput),
    false,
  );
  assert.equal(
    analysisPeriodSelection.inferAnalysisPeriodSelectionMode(
      { endInput: "2026-09-02", startInput: "2026-09-02" },
      maximumInput,
    ),
    "day",
  );
  assert.equal(
    analysisPeriodSelection.inferAnalysisPeriodSelectionMode(
      { endInput: "2026-08-31", startInput: "2026-08-01" },
      maximumInput,
    ),
    "closed_month",
  );
  assert.equal(
    analysisPeriodSelection.inferAnalysisPeriodSelectionMode(
      { endInput: "2026-08-20", startInput: "2026-08-03" },
      maximumInput,
    ),
    "custom",
  );

  const dayIndex = pickerSource.indexOf('label: "Diário"');
  const monthIndex = pickerSource.indexOf('label: "Mês fechado"');
  const customIndex = pickerSource.indexOf('label: "Personalizado"');
  assert.ok(dayIndex >= 0 && dayIndex < monthIndex);
  assert.ok(monthIndex < customIndex);
  assert.match(pickerSource, /MONTH_LABELS\.map\(\(label, monthIndex\)/);
  assert.match(pickerSource, /grid-cols-3[^"]*sm:grid-cols-4/);
  assert.match(pickerSource, /max=\{closedMaximumInput\}/);
  assert.match(pickerSource, /max=\{safeMaximumInput\}/);
  assert.match(pickerSource, /Analisar dia[\s\S]*?Analisar mês[\s\S]*?Aplicar período/);
});

test("buckets grossos nunca incluem a semana ou o mês corrente de hoje", () => {
  const clock = new Date(2026, 4, 31, 12, 0, 0, 0); // domingo e último dia do mês
  const range = occupancyAnalysisWindow.resolveOccupancyAnalysisRange(
    clock,
    "2026-05-01",
    "2026-05-31",
    true,
    "2026-05-31",
  );
  const closedTo =
    occupancyAnalysisWindow.occupancyAnalysisClosedBucketCutoff(range);
  assert.deepEqual(localDateParts(closedTo), [2026, 5, 31]);
  assert.equal(closedTo.getHours(), 0);

  const weeks =
    occupancyAnalysisWindow.listClosedOccupancyBucketsWithinRange(
      range.from,
      closedTo,
      "week",
    );
  const months =
    occupancyAnalysisWindow.listClosedOccupancyBucketsWithinRange(
      range.from,
      closedTo,
      "month",
    );
  assert.deepEqual(weeks.map(localDateParts), [
    [2026, 5, 4],
    [2026, 5, 11],
    [2026, 5, 18],
  ]);
  assert.deepEqual(months, []);
});

test("intervalo de ocupação persiste isolado por empresa e usuário sem bloquear a UI", () => {
  const originalWindow = globalThis.window;
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  globalThis.window = { localStorage };
  try {
    const rangeA = { endInput: "2026-08-10", startInput: "2026-08-01" };
    const rangeB = { endInput: "2026-08-09", startInput: "2026-08-09" };
    occupancyAnalysisWindow.saveOccupancyAnalysisDateRange(
      rangeA,
      "company-a",
      "user-a",
    );
    occupancyAnalysisWindow.saveOccupancyAnalysisDateRange(
      rangeB,
      "company-b",
      "user-a",
    );
    assert.deepEqual(
      occupancyAnalysisWindow.loadOccupancyAnalysisDateRange(
        "2026-08-10",
        "company-a",
        "user-a",
      ),
      rangeA,
    );
    assert.deepEqual(
      occupancyAnalysisWindow.loadOccupancyAnalysisDateRange(
        "2026-08-10",
        "company-b",
        "user-a",
      ),
      rangeB,
    );

    localStorage.setItem = () => {
      throw new Error("quota indisponível");
    };
    assert.doesNotThrow(() =>
      occupancyAnalysisWindow.saveOccupancyAnalysisDateRange(
        rangeA,
        "company-a",
        "user-b",
      ),
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("foco do dashboard sobrevive ao remount dashboard → manager e prefere cenário ativo", () => {
  const originalWindow = globalThis.window;
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  globalThis.window = { localStorage };

  try {
    const managerOptions = [
      { active: false, id: "inactive-first", mode: "scenario" },
      { active: true, id: "active-second", mode: "scenario" },
    ];
    const withoutPreference = dashboardFocus.resolveDashboardFocus({
      availableModes: ["scenario"],
      current: { scopeMode: "scenario", selectedId: "" },
      getOptions: () => managerOptions,
    });
    assert.deepEqual(withoutPreference, {
      scopeMode: "scenario",
      selectedId: "active-second",
    });

    assert.equal(
      dashboardFocus.saveDashboardFocus(
        { scopeMode: "scenario", selectedId: "active-second" },
        "company-a",
        "user-a",
        "live",
      ),
      true,
    );
    const storedAfterDashboardUnmount = dashboardFocus.loadDashboardFocus(
      "company-a",
      "user-a",
      "live",
    );
    const afterManagerRemount = dashboardFocus.resolveDashboardFocus({
      availableModes: ["scenario"],
      current: { scopeMode: "scenario", selectedId: "" },
      getOptions: () => managerOptions,
      stored: storedAfterDashboardUnmount,
    });
    assert.deepEqual(afterManagerRemount, {
      scopeMode: "scenario",
      selectedId: "active-second",
    });
    assert.equal(
      dashboardFocus.loadDashboardFocus(
        "company-a",
        "other-user",
        "live",
      ),
      null,
      "o foco nunca deve atravessar usuários",
    );
    assert.equal(
      dashboardFocus.loadDashboardFocus(
        "company-a",
        "user-a",
        "reports",
      ),
      null,
      "o foco ao vivo não deve atravessar superfícies",
    );

    const realtimeSource = readFileSync(
      resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
      "utf8",
    );
    assert.match(
      realtimeSource,
      /const personalFocusEnabled =\s*!presentationMode &&\s*initialScopeIdProp === undefined &&\s*initialScopeModeProp === undefined/,
      "props explícitas e presentation mode devem ignorar a preferência pessoal",
    );
    assert.match(
      realtimeSource,
      /if \(!personalFocusEnabled \|\| !selectedScope\) return;[\s\S]*?saveDashboardFocus/,
      "props explícitas e presentation mode nunca devem persistir foco pessoal",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("dataset de ocupação muda com empresa, cenário, intervalo e comparação", () => {
  const base = {
    analysis: true,
    companyScopeId: "company-a",
    endDateInput: "2026-08-09",
    intradayComparison: "yesterday",
    scopeId: "scenario-a",
    showPreviousPeriod: true,
    startDateInput: "2026-08-01",
    timeZone: "America/Sao_Paulo",
  };
  const key = occupancyAnalysisWindow.occupancyAnalysisDatasetKey(base);

  for (const changed of [
    { ...base, companyScopeId: "company-b" },
    { ...base, scopeId: "scenario-b" },
    { ...base, startDateInput: "2026-07-31" },
    { ...base, endDateInput: "2026-08-08" },
    { ...base, intradayComparison: "last_week" },
    { ...base, showPreviousPeriod: false },
    { ...base, timeZone: "Asia/Tokyo" },
  ]) {
    assert.notEqual(
      occupancyAnalysisWindow.occupancyAnalysisDatasetKey(changed),
      key,
    );
  }

  const reports = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  assert.match(reports, /chartDataScopeKey === requestedChartScopeKey/);
  assert.match(reports, /requestScopeKey !== requestedChartScopeKeyRef\.current/);
  assert.match(reports, /chartAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(reports, /if \(windowRetry < 1\) await execute\(windowRetry \+ 1\)/);
  assert.match(
    reports,
    /function summarizeOccupancyRangeMetrics[\s\S]*?const completeCoverage =[\s\S]*?average: completeCoverage \? latest\.average : null[\s\S]*?current: completeCoverage \? latest\.current : null[\s\S]*?minimum: completeMinimum[\s\S]*?peak: completePeak/,
    "média e fechamento só podem ser publicados com cobertura integral; mínimo e máximo preservam seus próprios gates",
  );
  assert.match(
    reports,
    /while \(cursor < end && guard < 500\)[\s\S]*?if \(cursor < end\)[\s\S]*?throw new RangeError/,
  );
});

test("widgets customizados de ocupação normalizam tipos e IDs sem misturar configurações", () => {
  const widgets = occupancyCustomWidgets.normalizeOccupancyCustomWidgets([
    {
      created_at: "2026-08-05T10:00:00.000Z",
      id: "metric-a",
      kind: "kpi",
      metric: "utilization",
      title: "  Utilização  ",
      updated_at: "2026-08-05T10:00:00.000Z",
    },
    {
      created_at: "2026-08-05T10:00:00.000Z",
      granularity: "hour",
      id: "trend-a",
      kind: "trend",
      title: "Tendência",
      updated_at: "2026-08-05T10:00:00.000Z",
    },
    {
      created_at: "2026-08-05T10:00:00.000Z",
      id: "metric-a",
      kind: "metric",
      metric: "current",
      title: "Atual substituído",
      updated_at: "2026-08-05T11:00:00.000Z",
    },
    { id: "invalid", kind: "metric", metric: "unknown" },
  ]);

  assert.equal(widgets.length, 2);
  assert.equal(widgets[0].title, "Atual substituído");
  assert.equal(widgets[0].metric, "current");
  assert.deepEqual(widgets[1].series, {
    average: true,
    minimum: true,
    peak: true,
  });
});

test("configurações de ocupação ficam isoladas por empresa, usuário e cenário", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    occupancyCustomWidgets.upsertOccupancyCustomWidget(
      { kind: "metric", metric: "current", title: "Atual" },
      "company-a",
      { userId: "user-a", viewId: "scenario-a" },
    );
    assert.equal(
      occupancyCustomWidgets.loadOccupancyCustomWidgets("company-a", {
        userId: "user-a",
        viewId: "scenario-a",
      }).length,
      1,
    );
    assert.equal(
      occupancyCustomWidgets.loadOccupancyCustomWidgets("company-a", {
        userId: "user-a",
        viewId: "scenario-b",
      }).length,
      0,
    );

    const legacyWidgetSettings = Object.fromEntries(
      Object.entries(
        occupancyWidgetSettings.DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
      ).filter(
        ([key]) =>
          key !== "hexColorPaletteId" &&
          key !== "hexStatusColors",
      ),
    );
    const legacyStoredSettings = {
      ...legacyWidgetSettings,
      dayCount: 14,
    };
    storage.setItem(
      occupancyWidgetSettings.occupancyWidgetSettingsStorageKey(
        "company-a",
        "user-a",
      ),
      JSON.stringify(legacyStoredSettings),
    );
    assert.equal(
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-a",
      ).dayCount,
      14,
      "a configuração antiga deve ser herdada até o cenário salvar sua própria visão",
    );
    assert.deepEqual(
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-a",
      ).hexStatusColors,
      occupancyWidgetSettings.DEFAULT_OCCUPANCY_STATUS_COLORS,
      "a visão antiga sem cores próprias do hex deve receber o preset neutro",
    );
    assert.equal(
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-a",
      ).hexColorPaletteId,
      occupancyColorPalettes.DEFAULT_OCCUPANCY_COLOR_PALETTE_ID,
      "a visão antiga sem paleta própria do hex deve herdar a paleta compartilhada",
    );
    occupancyWidgetSettings.saveOccupancyWidgetSettings(
      {
        ...legacyStoredSettings,
        colorPaletteId: "aurora",
        hexColorPaletteId: "ocean",
        hexStatusColors:
          occupancyWidgetSettings.occupancyStatusColorsForPreset(
            "availability",
          ),
        dayCount: 30,
      },
      "company-a",
      "user-a",
      "scenario-a",
    );
    assert.equal(
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-a",
      ).dayCount,
      30,
    );
    assert.equal(
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-a",
      ).hexStatusColors.preset,
      "availability",
      "as cores do hex devem persistir de forma independente",
    );
    const separatedPaletteSettings =
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-a",
      );
    assert.equal(separatedPaletteSettings.colorPaletteId, "aurora");
    assert.equal(
      separatedPaletteSettings.hexColorPaletteId,
      "ocean",
      "a paleta do hex deve persistir sem alterar os demais comparativos",
    );
    assert.equal(
      occupancyWidgetSettings.loadOccupancyWidgetSettings(
        "company-a",
        "user-a",
        "scenario-b",
      ).dayCount,
      14,
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("configurações antigas reaparecem por visão sem atravessar usuário ou empresa", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  const scopedKey = (baseKey, companyId, userId, viewId) =>
    masterCompanyScope.getUserViewScopedStorageKey(
      baseKey,
      companyId,
      userId,
      viewId,
    );

  try {
    const precedenceBase = "ipxdata.compatibility-test.v1";
    const precedenceScope = ["company-a", "user-a", "scenario-a"];
    const legacyCompanyKey = masterCompanyScope.getScopedStorageKey(
      precedenceBase,
      precedenceScope[0],
    );
    const companyKey = scopedKey(
      precedenceBase,
      precedenceScope[0],
    );
    const userKey = scopedKey(
      precedenceBase,
      precedenceScope[0],
      precedenceScope[1],
    );
    const viewKey = scopedKey(precedenceBase, ...precedenceScope);
    storage.setItem(legacyCompanyKey, "legacy-company");
    storage.setItem(companyKey, "company");
    storage.setItem(userKey, "user");
    storage.setItem(viewKey, "");

    assert.deepEqual(
      masterCompanyScope.readUserViewScopedStorageEntry(
        precedenceBase,
        ...precedenceScope,
      ),
      { key: viewKey, value: "" },
      "uma chave exata vazia existe e não pode revelar o fallback anterior",
    );
    storage.removeItem(viewKey);
    assert.equal(
      masterCompanyScope.readUserViewScopedStorageEntry(
        precedenceBase,
        ...precedenceScope,
      ).value,
      "user",
    );
    storage.removeItem(userKey);
    assert.equal(
      masterCompanyScope.readUserViewScopedStorageEntry(
        precedenceBase,
        ...precedenceScope,
      ).value,
      "company",
    );
    storage.removeItem(companyKey);
    assert.equal(
      masterCompanyScope.readUserViewScopedStorageEntry(
        precedenceBase,
        ...precedenceScope,
      ).value,
      "company",
      "o fallback legado lido foi materializado no namespace pessoal da visão",
    );
    storage.removeItem(viewKey);
    assert.equal(
      masterCompanyScope.readUserViewScopedStorageEntry(
        precedenceBase,
        ...precedenceScope,
      ).value,
      "legacy-company",
    );
    assert.equal(
      masterCompanyScope.readUserViewScopedStorageEntry(
        precedenceBase,
        "company-b",
        "user-a",
        "scenario-a",
      ),
      null,
    );

    const userOnlyBase = "ipxdata.user-isolation-test.v1";
    storage.setItem(scopedKey(userOnlyBase, "company-a", "user-a"), "a");
    assert.equal(
      masterCompanyScope.readUserViewScopedStorageEntry(
        userOnlyBase,
        "company-a",
        "user-b",
        "scenario-a",
      ),
      null,
    );

    const cardId = "live_intraday_comparison";
    storage.setItem(
      `${viewPreferences.CARD_VIEW_STORAGE_KEY}.company-cards`,
      JSON.stringify({
        live: [{ id: cardId, title: "Layout antigo", visible: false }],
      }),
    );
    assert.equal(
      viewPreferences.loadScopedCardPreferences(
        "live",
        [cardId],
        "company-cards",
        "user-a",
        "scenario-a",
      )[0].visible,
      false,
      "o formato companyId anterior a company.<id> precisa continuar legível",
    );
    storage.setItem(
      viewPreferences.getCardViewStorageKey(
        "company-cards",
        "user-a",
        "scenario-a",
      ),
      JSON.stringify({ live: [] }),
    );
    assert.equal(
      viewPreferences.loadScopedCardPreferences(
        "live",
        [cardId],
        "company-cards",
        "user-a",
        "scenario-a",
      )[0].visible,
      true,
      "a lista exata vazia deve vencer o layout legado",
    );

    const liveOperationalBase = "ipxdata.live-operational-settings.v1";
    storage.setItem(
      scopedKey(liveOperationalBase, "company-live", "user-live"),
      JSON.stringify({ occupancyStartHour: 10 }),
    );
    assert.equal(
      liveOperationalSettings.loadLiveOperationalSettings("company-live", {
        userId: "user-live",
        viewId: "scenario-live",
      }).occupancyStartHour,
      10,
    );
    storage.setItem(
      scopedKey(
        liveOperationalBase,
        "company-live",
        "user-live",
        "scenario-live",
      ),
      JSON.stringify({ occupancyStartHour: 0 }),
    );
    assert.equal(
      liveOperationalSettings.loadLiveOperationalSettings("company-live", {
        userId: "user-live",
        viewId: "scenario-live",
      }).occupancyStartHour,
      0,
      "um objeto default salvo na visão também deve vencer o fallback",
    );

    storage.setItem(
      "ipxdata.live-dashboard-settings.v1.company-dashboard",
      JSON.stringify({
        intradayComparison: "last_week",
        showPreviousPeriod: false,
      }),
    );
    assert.equal(
      liveDashboardSettings.loadLiveDashboardSettings("company-dashboard", {
        userId: "user-dashboard",
        viewId: "scenario-dashboard",
      }).showPreviousPeriod,
      false,
    );

    const realtimeWidget = {
      created_at: "2026-08-24T10:00:00.000Z",
      granularity: "hour",
      id: "live-legacy",
      kind: "scope",
      scopeId: "scenario-a",
      scopeMode: "scenario",
      scopeName: "Cenário A",
      title: "Widget antigo",
      updated_at: "2026-08-24T10:00:00.000Z",
    };
    const realtimeBase = "ipxdata.realtime-custom-widgets.v1";
    storage.setItem(
      scopedKey(realtimeBase, "company-widgets", "user-widgets"),
      JSON.stringify([realtimeWidget]),
    );
    assert.equal(
      realtimeCustomWidgets.loadRealtimeCustomWidgets("company-widgets", {
        userId: "user-widgets",
        viewId: "scenario-a",
      })[0].id,
      "live-legacy",
    );
    storage.setItem(
      scopedKey(
        realtimeBase,
        "company-widgets",
        "user-widgets",
        "scenario-a",
      ),
      "[]",
    );
    assert.deepEqual(
      realtimeCustomWidgets.loadRealtimeCustomWidgets("company-widgets", {
        userId: "user-widgets",
        viewId: "scenario-a",
      }),
      [],
    );

    const reportWidget = {
      ...realtimeWidget,
      id: "report-legacy",
      title: "Relatório antigo",
    };
    storage.setItem(
      "ipxdata.report-custom-widgets.v1.company-reports",
      JSON.stringify([reportWidget]),
    );
    assert.equal(
      reportCustomWidgets.loadReportCustomWidgets("company-reports", {
        userId: "user-reports",
        viewId: "scenario-reports",
      })[0].id,
      "report-legacy",
    );

    const reportSettingsBase =
      "ipxdata.counting-report-view-settings.v1";
    storage.setItem(
      scopedKey(reportSettingsBase, "company-count", "user-count"),
      JSON.stringify({
        includeOpenPeriod: false,
        rankingOrder: "asc",
        rankingScenarioIds: ["scenario-a"],
        rankingSelectionMode: "custom",
      }),
    );
    assert.equal(
      countingReportViewSettings.loadCountingReportViewSettings(
        "company-count",
        { userId: "user-count", viewId: "scenario-a" },
      ).rankingOrder,
      "asc",
    );

    storage.setItem(
      scopedKey(
        "ipxdata.counting-report-period.v1",
        "company-count",
        "user-count",
      ),
      JSON.stringify({ from: "2025-01", to: "2025-03" }),
    );
    assert.deepEqual(
      countingReportPeriod.loadCountingReportPeriod(
        "company-count",
        new Date(2026, 7, 24),
        { userId: "user-count", viewId: "scenario-a" },
      ),
      { from: "2025-01", to: "2025-03" },
    );

    storage.setItem(
      scopedKey(
        occupancyDashboardSettings.OCCUPANCY_DASHBOARD_SETTINGS_KEY,
        "company-occupancy",
        "user-occupancy",
      ),
      JSON.stringify({
        metricVisibility: { average: false, minimum: true, peak: true },
        schemaVersion: 2,
      }),
    );
    assert.equal(
      occupancyDashboardSettings.loadOccupancyDashboardSettings(
        "company-occupancy",
        "user-occupancy",
        "scenario-occupancy",
      ).metricVisibility.average,
      false,
    );
    storage.setItem(
      masterCompanyScope.getScopedStorageKey(
        "ipxdata.occupancy.metric-visibility.v1",
        "company-occupancy",
      ),
      JSON.stringify({ average: false, minimum: false, peak: false }),
    );
    storage.setItem(
      occupancyDashboardSettings.occupancyDashboardSettingsStorageKey(
        "company-occupancy",
        "user-occupancy",
        "scenario-occupancy",
      ),
      "",
    );
    assert.equal(
      occupancyDashboardSettings.loadOccupancyDashboardSettings(
        "company-occupancy",
        "user-occupancy",
        "scenario-occupancy",
      ).metricVisibility.average,
      true,
      "uma chave exata vazia deve usar o default, não outra configuração legada",
    );

    storage.setItem(
      scopedKey(
        occupancyCustomWidgets.OCCUPANCY_CUSTOM_WIDGETS_KEY,
        "company-occupancy",
        "user-occupancy",
      ),
      JSON.stringify([
        {
          created_at: "2026-08-24T10:00:00.000Z",
          id: "occupancy-legacy",
          kind: "metric",
          metric: "current",
          title: "Ocupação antiga",
          updated_at: "2026-08-24T10:00:00.000Z",
        },
      ]),
    );
    assert.equal(
      occupancyCustomWidgets.loadOccupancyCustomWidgets(
        "company-occupancy",
        { userId: "user-occupancy", viewId: "scenario-occupancy" },
      )[0].id,
      "occupancy-legacy",
    );

    storage.setItem(
      scopedKey(
        "ipxdata.occupancy-analysis-range.v1",
        "company-occupancy-range",
      ),
      JSON.stringify({
        endInput: "2026-08-10",
        startInput: "2026-08-01",
      }),
    );
    assert.deepEqual(
      occupancyAnalysisWindow.loadOccupancyAnalysisDateRange(
        "2026-08-24",
        "company-occupancy-range",
        "user-occupancy",
      ),
      { endInput: "2026-08-10", startInput: "2026-08-01" },
    );

    const legacyAnalysisWidget = analysisWidget("ranking", {
      id: "analysis-legacy-custom",
      title: "Análise antiga",
    });
    storage.setItem(
      scopedKey("ipxdata.period-analysis-widgets.v1", "company-analysis"),
      JSON.stringify([legacyAnalysisWidget]),
    );
    assert.equal(
      periodAnalysisWidgets
        .loadPeriodAnalysisWidgets("company-analysis", "user-analysis")
        .some((widget) => widget.id === "analysis-legacy-custom"),
      true,
    );

    const comparisonSource = readFileSync(
      resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
      "utf8",
    );
    assert.match(
      comparisonSource,
      /readUserViewScopedStorageEntry\([\s\S]*?scenarioComparisonStorageBaseKey\(storageKey\)/,
      "comparativos customizados também devem herdar a configuração anterior",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("migração de card views preserva menus, IDs pontuados e exclusões", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    const companyId = "company-card-merge";
    const userId = "admin.card@example.com";
    const viewId = "scenario.main";
    const personalKey = viewPreferences.getCardViewStorageKey(
      companyId,
      userId,
      viewId,
    );
    storage.setItem(
      personalKey,
      JSON.stringify({
        live: [{ id: "live_intraday_comparison", visible: false }],
      }),
    );
    storage.setItem(
      `${viewPreferences.CARD_VIEW_STORAGE_KEY}.${companyId}`,
      JSON.stringify({
        analysis: [{ id: "analysis_summary", visible: false }],
      }),
    );

    assert.equal(
      viewPreferences.loadScopedCardPreferences(
        "analysis",
        ["analysis_summary"],
        companyId,
        userId,
        viewId,
      )[0].visible,
      false,
    );
    const mergedStore = JSON.parse(storage.getItem(personalKey));
    assert.equal(mergedStore.live[0].visible, false);
    assert.equal(mergedStore.analysis[0].visible, false);

    const dottedCompanyId = "company.legacy";
    const dottedUserId = "teste.usuario@teste.com";
    const dottedViewId = "view.main";
    const rawLegacyKey = [
      viewPreferences.CARD_VIEW_STORAGE_KEY,
      `company.${encodeURIComponent(dottedCompanyId)}`,
      `user.${encodeURIComponent(dottedUserId)}`,
      `view.${encodeURIComponent(dottedViewId)}`,
    ].join(".");
    storage.setItem(
      rawLegacyKey,
      JSON.stringify({
        live: [{ id: "live_intraday_comparison", visible: false }],
      }),
    );
    assert.equal(
      viewPreferences.loadScopedCardPreferences(
        "live",
        ["live_intraday_comparison"],
        dottedCompanyId,
        dottedUserId,
        dottedViewId,
      )[0].visible,
      false,
    );
    assert.ok(
      storage.getItem(
        viewPreferences.getCardViewStorageKey(
          dottedCompanyId,
          dottedUserId,
          dottedViewId,
        ),
      ),
      "a chave antiga com pontos deve ser materializada na forma canônica",
    );

    const deletedCompanyId = "company-deleted";
    const deletedUserId = "user-deleted";
    const deletedViewId = "view-deleted";
    const deletedPersonalKey = viewPreferences.getCardViewStorageKey(
      deletedCompanyId,
      deletedUserId,
      deletedViewId,
    );
    storage.setItem(
      `${viewPreferences.CARD_VIEW_STORAGE_KEY}.${deletedCompanyId}`,
      JSON.stringify({
        live: [{ id: "live_intraday_comparison", visible: false }],
      }),
    );
    assert.equal(
      userGridLocal.removeUserGridPreference(deletedPersonalKey),
      true,
    );
    assert.equal(
      viewPreferences.loadScopedCardPreferences(
        "live",
        ["live_intraday_comparison"],
        deletedCompanyId,
        deletedUserId,
        deletedViewId,
      )[0].visible,
      true,
      "um tombstone pessoal não pode reimportar o layout company-wide",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("Visões recupera presets e video walls de namespaces anteriores", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
    location: { origin: "http://localhost" },
  };

  const companyId = "company-legacy-views";
  const userId = "admin-legacy-views";
  const companySuffix = `.company.${companyId}`;
  const userSuffix = `${companySuffix}.user.${userId}`;
  const savedView = {
    createdAt: "2026-08-01T10:00:00.000Z",
    id: "saved-live-a",
    name: "Operação principal",
    path: "/views/dashboard/live?scenario=scenario-a",
    updatedAt: "2026-08-02T10:00:00.000Z",
  };
  const videoWallProfile = {
    createdAt: "2026-08-01T10:00:00.000Z",
    id: "wall-a",
    name: "Sala principal",
    outputs: [],
    updatedAt: "2026-08-02T10:00:00.000Z",
  };
  const preset = {
    createdAt: "2026-08-01T10:00:00.000Z",
    id: "preset-live-a",
    isDefault: true,
    name: "Layout administrativo",
    snapshot: {
      cardIds: [],
      capturedAt: "2026-08-01T10:00:00.000Z",
      menuKey: "live",
      preferences: [],
      sourceScope: null,
      storage: [],
      version: 1,
    },
    updatedAt: "2026-08-02T10:00:00.000Z",
  };

  try {
    storage.setItem(
      `ipxdata.saved-live-views.v1${companySuffix}`,
      JSON.stringify([savedView]),
    );
    storage.setItem(
      `ipxdata.video-walls.v1${companySuffix}`,
      JSON.stringify([videoWallProfile]),
    );
    storage.setItem(
      `ipxdata.widget-view-presets.v1.live${companySuffix}`,
      JSON.stringify([preset]),
    );

    assert.deepEqual(
      videoWall.loadSavedLiveViews(companyId, userId).map((view) => view.id),
      [savedView.id],
    );
    assert.deepEqual(
      videoWall.loadVideoWallProfiles(companyId, userId).map((wall) => wall.id),
      [videoWallProfile.id],
    );
    assert.deepEqual(
      widgetViewPresets
        .loadWidgetViewPresets("live", companyId, userId)
        .map((view) => view.id),
      [preset.id],
    );
    assert.ok(
      storage.getItem(`ipxdata.saved-live-views.v1${userSuffix}`),
      "a visão recuperada deve ser materializada no namespace pessoal",
    );
    assert.ok(
      storage.getItem(`ipxdata.video-walls.v1${userSuffix}`),
      "o video wall recuperado deve ser materializado no namespace pessoal",
    );
    assert.ok(
      storage.getItem(`ipxdata.widget-view-presets.v1.live${userSuffix}`),
      "o preset recuperado deve ser materializado no namespace pessoal",
    );

    storage.setItem(
      `ipxdata.saved-live-views.v1${userSuffix}`,
      "[]",
    );
    assert.deepEqual(
      videoWall.loadSavedLiveViews(companyId, userId),
      [],
      "uma lista pessoal vazia e explícita precisa vencer o legado",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("links de visões publicam somente referência opaca e resolvem a configuração pessoal", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
    location: { origin: "https://painel.example" },
  };

  try {
    const target =
      "/views/live?company_id=company-secret&scenario_ids=scenario-a%2Cscenario-b&widgets=%5B%7B%22scope_id%22%3A%22scenario-a%22%7D%5D";
    const reference = viewLinkReference.saveViewLinkTarget(
      target,
      "user-a",
    );
    assert.match(reference, /^[A-Za-z0-9_-]{16,128}$/);
    assert.equal(reference.length, 24);
    assert.doesNotMatch(
      reference,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const publicUrl = viewLinkReference.buildOpaqueViewUrl(
      "/views/live",
      reference,
      window.location.origin,
    );
    const parsedPublicUrl = new URL(publicUrl);
    assert.deepEqual([...parsedPublicUrl.searchParams.keys()], ["view"]);
    assert.equal(parsedPublicUrl.searchParams.get("view"), reference);
    assert.doesNotMatch(
      publicUrl,
      /company-secret|scenario-a|company_id|scenario_ids|scope_id|widgets/,
    );

    const resolved = viewLinkReference.loadViewLinkTarget(
      reference,
      "user-a",
      "/views/live",
    );
    assert.equal(resolved.pathname, "/views/live");
    const resolvedParams = new URLSearchParams(resolved.search);
    assert.equal(resolvedParams.get("company_id"), "company-secret");
    assert.equal(
      resolvedParams.get("scenario_ids"),
      "scenario-a,scenario-b",
    );
    assert.equal(
      viewLinkReference.loadViewLinkTarget(
        reference,
        "user-b",
        "/views/live",
      ),
      null,
      "a referência não pode atravessar o usuário autenticado",
    );
    assert.equal(
      viewLinkReference.loadViewLinkTarget(
        reference,
        "user-a",
        "/views/dashboard/live",
      ),
      null,
      "a referência não pode ser reutilizada em outra superfície",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("visões salvas legadas migram para links opacos sem perder os parâmetros", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
    location: { origin: "https://painel.example" },
  };

  try {
    const opaquePath = viewLinkReference.ensureOpaqueViewPath(
      "/views/dashboard/live?company_id=company-a&scope_mode=scenario&scope_id=scenario-a",
      "user-a",
    );
    const publicUrl = new URL(opaquePath, window.location.origin);
    assert.equal(publicUrl.pathname, "/views/dashboard/live");
    assert.deepEqual([...publicUrl.searchParams.keys()], ["view"]);
    assert.equal(
      viewLinkReference.ensureOpaqueViewPath(opaquePath, "user-a"),
      opaquePath,
      "carregar novamente uma visão opaca não pode trocar sua referência",
    );

    const resolved = viewLinkReference.loadViewLinkTarget(
      publicUrl.searchParams.get("view"),
      "user-a",
      "/views/dashboard/live",
    );
    const resolvedParams = new URLSearchParams(resolved.search);
    assert.equal(resolvedParams.get("company_id"), "company-a");
    assert.equal(resolvedParams.get("scope_mode"), "scenario");
    assert.equal(resolvedParams.get("scope_id"), "scenario-a");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("visão salva remapeia capacidades junto com o cenário de destino", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    const sourceSettings = {
      ...occupancyWidgetSettings.DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
      capacities: { "scenario-a": 12, "scenario-b": 7 },
      colorPaletteId: "aurora",
      heatmapScenarioId: "scenario-a",
      hexColorPaletteId: "ocean",
      hexLayout: {
        cells: [
          {
            column: 0,
            id: "source-cell",
            label: "Posição principal",
            row: 0,
            scenarioId: "scenario-a",
          },
        ],
        columns: 4,
        preset: "custom",
        rows: 1,
        version: 1,
      },
      scenarioIds: ["scenario-a"],
    };
    const sourceScope = { id: "scenario-a", name: "Cenário A" };
    const targetScope = { id: "scenario-b", name: "Cenário B" };
    widgetViewPresets.applyWidgetViewPreset(
      {
        createdAt: "2026-08-11T12:00:00.000Z",
        id: "occupancy-view-a",
        isDefault: false,
        name: "Operação padrão",
        snapshot: {
          cardIds: [],
          capturedAt: "2026-08-11T12:00:00.000Z",
          menuKey: "occupancy",
          preferences: [],
          sourceScope,
          storage: [
            {
              baseKey:
                occupancyWidgetSettings.OCCUPANCY_WIDGET_SETTINGS_KEY,
              value: JSON.stringify(sourceSettings),
            },
          ],
          version: 1,
        },
        updatedAt: "2026-08-11T12:00:00.000Z",
      },
      {
        companyId: "company-a",
        targetScope,
        userId: "user-a",
      },
    );

    const applied = occupancyWidgetSettings.loadOccupancyWidgetSettings(
      "company-a",
      "user-a",
      "scenario-b",
    );
    assert.deepEqual(applied.capacities, { "scenario-b": 12 });
    assert.deepEqual(applied.scenarioIds, ["scenario-b"]);
    assert.equal(applied.heatmapScenarioId, "scenario-b");
    assert.equal(applied.hexLayout.cells[0].scenarioId, "scenario-b");
    assert.equal(applied.colorPaletteId, "aurora");
    assert.equal(applied.hexColorPaletteId, "ocean");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("presets legados de ocupação migram isolados por superfície", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  const preset = (id, scopeId) => ({
    createdAt: "2026-08-11T12:00:00.000Z",
    id,
    isDefault: false,
    name: id,
    snapshot: {
      cardIds: [`card-${id}`],
      capturedAt: "2026-08-11T12:00:00.000Z",
      menuKey: "occupancy",
      preferences: [],
      sourceScope: { id: scopeId, name: scopeId },
      storage: [],
      version: 1,
    },
    updatedAt: "2026-08-11T12:00:00.000Z",
  });

  try {
    widgetViewPresets.saveWidgetViewPresets(
      "occupancy",
      [
        preset("live", "scenario-a"),
        preset("analysis", "analysis:scenario-a"),
        preset("reports", "reports:scenario-a"),
      ],
      "company-a",
      "user-a",
    );

    assert.deepEqual(
      widgetViewPresets
        .loadWidgetViewPresets(
          "occupancy",
          "company-a",
          "user-a",
          "occupancy-live",
        )
        .map(({ id }) => id),
      ["live"],
    );
    assert.deepEqual(
      widgetViewPresets
        .loadWidgetViewPresets(
          "occupancy",
          "company-a",
          "user-a",
          "occupancy-analysis",
        )
        .map(({ id }) => id),
      ["analysis"],
    );
    assert.deepEqual(
      widgetViewPresets
        .loadWidgetViewPresets(
          "occupancy",
          "company-a",
          "user-a",
          "occupancy-reports",
        )
        .map(({ id }) => id),
      ["reports"],
    );

    widgetViewPresets.deleteWidgetViewPreset(
      "occupancy",
      "analysis",
      "company-a",
      "user-a",
      "occupancy-analysis",
    );
    assert.equal(
      widgetViewPresets.loadWidgetViewPresets(
        "occupancy",
        "company-a",
        "user-a",
        "occupancy-analysis",
      ).length,
      0,
    );
    assert.equal(
      widgetViewPresets.loadWidgetViewPresets(
        "occupancy",
        "company-a",
        "user-a",
        "occupancy-reports",
      ).length,
      1,
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("dashboards de ocupação selecionam o namespace de preset da própria superfície", () => {
  const layoutSource = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    layoutSource,
    /menuKey === "occupancy" \? "occupancy-live" : menuKey/,
  );
  assert.match(
    reportsSource,
    /presetNamespace=\{[\s\S]*?analysis \? "occupancy-analysis" : "occupancy-reports"/,
  );
});

test("preferências operacionais de ocupação normalizam intervalos e séries", () => {
  assert.deepEqual(
    occupancyDashboardSettings.normalizeOccupancyDashboardSettings({
      comparisonRefreshSeconds: 120,
      liveRefreshSeconds: 30,
      metricVisibility: {
        average: false,
        minimum: true,
        peak: false,
      },
      schemaVersion: 99,
    }),
    {
      metricVisibility: {
        average: false,
        minimum: true,
        peak: false,
      },
      schemaVersion: 2,
    },
  );
});

test("bucket horário sem offset preserva o relógio local", () => {
  const bucket = aggregateTime.parseAggregateBucket(
    "2026-07-22T10:15:30.250",
    "hour",
  );

  assert.ok(bucket);
  assert.equal(bucket.getFullYear(), 2026);
  assert.equal(bucket.getMonth(), 6);
  assert.equal(bucket.getDate(), 22);
  assert.equal(bucket.getHours(), 10);
  assert.equal(bucket.getMinutes(), 15);
  assert.equal(bucket.getSeconds(), 30);
  assert.equal(bucket.getMilliseconds(), 250);
});




test("consulta horária envia os limites locais como instantes UTC", () => {
  const localStart = new Date(2026, 6, 22, 0, 0, 0, 0);

  assert.equal(
    aggregateTime.aggregateQueryIso(localStart, "hour"),
    localStart.toISOString(),
  );
});

test("filtros 22 e 23 reutilizam exatamente os mesmos meses horários", () => {
  const throughDay22 = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2026, 5, 2),
      to: new Date(2026, 6, 23),
    },
  ]);
  const throughDay23 = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2026, 5, 2),
      to: new Date(2026, 6, 24),
    },
  ]);

  assert.deepEqual(
    throughDay22.map(({ key, from, to }) => [
      key,
      from.getTime(),
      to.getTime(),
    ]),
    throughDay23.map(({ key, from, to }) => [
      key,
      from.getTime(),
      to.getTime(),
    ]),
  );
});

test("plano horário preserva lacunas e respeita o limite exclusivo mensal", () => {
  const queries = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2025, 6, 22),
      to: new Date(2025, 7, 1),
    },
    {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 1, 1),
    },
  ]);

  assert.deepEqual(
    queries.map((query) => query.key),
    ["2025-07", "2026-01"],
  );
  assert.equal(queries[0].from.getDate(), 1);
  assert.equal(queries[0].to.getMonth(), 7);
  assert.equal(queries[1].to.getMonth(), 1);
});

test("plano horário atravessa dezembro e janeiro sem sobrepor fronteiras", () => {
  const queries = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2025, 11, 31),
      to: new Date(2026, 0, 2),
    },
  ]);

  assert.deepEqual(
    queries.map((query) => query.key),
    ["2025-12", "2026-01"],
  );
  assert.equal(queries[0].to.getTime(), queries[1].from.getTime());
});

test("consulta horária rejeita fan-out histórico excessivo", async () => {
  await assert.rejects(
    aggregateHourQuery.fetchHourlyAggregateRanges({
      cacheScope: "test-company",
      ranges: [
        {
          from: new Date(2000, 0, 1),
          to: new Date(2020, 1, 1),
        },
      ],
    }),
    /excede 240 meses/,
  );
});

test("planejador interrompe fan-out extremo antes de materializar o histórico", () => {
  assert.throws(
    () =>
      aggregateQueryPlan.planHourlyCalendarMonthQueries([
        {
          from: new Date(1_000, 0, 1),
          to: new Date(100_000, 0, 1),
        },
      ]),
    /excede 240 meses/,
  );
});

test("rollup de meses particionados equivale à consulta horária contínua", () => {
  const range = {
    from: new Date(2026, 0, 15),
    to: new Date(2026, 2, 1),
  };
  const source = [
    aggregateRow("2026-01-10T10:00:00", "line-entry", 100),
    aggregateRow("2026-01-22T10:00:00", "line-entry", 2),
    aggregateRow("2026-02-22T10:00:00", "line-entry", 3),
    aggregateRow("2026-03-01T00:00:00", "line-entry", 200),
  ];
  const partitioned = aggregateQueryPlan
    .planHourlyCalendarMonthQueries([range])
    .flatMap((query) =>
      source.filter((row) =>
        aggregateTime.aggregateBucketInRange(
          row.bucket,
          "hour",
          query.from,
          query.to,
        ),
      ),
    );
  const continuousRollup = aggregateReconciliation.rollupAggregateRows(
    source,
    "hour",
    "month",
    range.from,
    range.to,
  );
  const partitionedRollup = aggregateReconciliation.rollupAggregateRows(
    partitioned,
    "hour",
    "month",
    range.from,
    range.to,
  );

  assert.deepEqual(
    normalizeAggregateRows(partitionedRollup),
    normalizeAggregateRows(continuousRollup),
  );
});

test("cache mensal só entrega horas dentro do corte solicitado", () => {
  const rows = aggregateHourQuery.filterHourlyAggregateRowsToRanges(
    [
      aggregateRow("2026-07-10T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 2),
      aggregateRow("2026-07-23T00:00:00", "line-entry", 200),
    ],
    [
      {
        from: new Date(2026, 6, 15),
        to: new Date(2026, 6, 23),
      },
    ],
  );

  assert.deepEqual(
    rows.map((row) => [row.bucket, row.total]),
    [["2026-07-22T10:00:00", 2]],
  );
});

test("cache revalida mês aberto/recém-fechado por hora e histórico por dia", () => {
  const query = {
    from: new Date(2026, 6, 1),
    to: new Date(2026, 7, 1),
  };
  const settling = aggregateHourQuery.hourlyAggregateCacheRevision(
    query,
    new Date(2026, 7, 1, 12),
  );
  const historicalMorning =
    aggregateHourQuery.hourlyAggregateCacheRevision(
      query,
      new Date(2026, 7, 4, 9),
    );
  const historicalAfternoon =
    aggregateHourQuery.hourlyAggregateCacheRevision(
      query,
      new Date(2026, 7, 4, 18),
    );
  const openQuery = {
    from: new Date(2026, 7, 1),
    to: new Date(2026, 8, 1),
  };
  const openMorning = aggregateHourQuery.hourlyAggregateCacheRevision(
    openQuery,
    new Date(2026, 7, 22, 9),
  );
  const openAfternoon = aggregateHourQuery.hourlyAggregateCacheRevision(
    openQuery,
    new Date(2026, 7, 22, 18),
  );

  assert.match(settling, /^hour:/);
  assert.match(historicalMorning, /^day:/);
  assert.equal(historicalAfternoon, historicalMorning);
  assert.match(openMorning, /^hour:/);
  assert.match(openAfternoon, /^hour:/);
  assert.notEqual(openAfternoon, openMorning);
});

test("consultas 22 e 23 reutilizam o mesmo snapshot HTTP do dia 22", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-23T10:00:00", "line-entry", 23),
          aggregateRow("2026-07-24T10:00:00", "line-entry", 24),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const through22 = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 30, 1),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 23),
        },
      ],
    });
    const through23 = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 45, 59),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 24),
        },
      ],
    });
    const day22First = through22.find((row) =>
      row.bucket.startsWith("2026-07-22"),
    );
    const day22Second = through23.find((row) =>
      row.bucket.startsWith("2026-07-22"),
    );

    assert.equal(requests.length, 1);
    assert.deepEqual(day22Second, day22First);
    assert.deepEqual(
      through22.map((row) => row.total),
      [22],
    );
    assert.deepEqual(
      through23.map((row) => row.total),
      [22, 23],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("consultas concorrentes do mesmo mês compartilham uma única resposta HTTP", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let releaseResponse;
  const responseReady = new Promise((resolveResponse) => {
    releaseResponse = resolveResponse;
  });
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    await responseReady;
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-23T10:00:00", "line-entry", 23),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const first = aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 15),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 23),
        },
      ],
    });
    const second = aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 45),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 24),
        },
      ],
    });

    await new Promise((resolveTick) => setImmediate(resolveTick));
    assert.equal(requests.length, 1);
    releaseResponse();
    const [through22, through23] = await Promise.all([first, second]);

    assert.equal(requests.length, 1);
    assert.deepEqual(
      through22.map((row) => row.total),
      [22],
    );
    assert.deepEqual(
      through23.map((row) => row.total),
      [22, 23],
    );
  } finally {
    releaseResponse?.();
    globalThis.fetch = originalFetch;
  }
});

test("limpar o cache impede uma resposta antiga de repovoá-lo", async () => {
  const originalFetch = globalThis.fetch;
  let releaseResponse;
  const responseReady = new Promise((resolveResponse) => {
    releaseResponse = resolveResponse;
  });
  globalThis.fetch = async () => {
    await responseReady;
    return new Response(
      JSON.stringify({
        data: [aggregateRow("2026-07-22T10:00:00", "line-entry", 22)],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const pending = aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 23),
        },
      ],
    });
    await new Promise((resolveTick) => setImmediate(resolveTick));
    aggregateHourQuery.clearHourlyAggregateCache(cache);
    releaseResponse();
    await pending;

    assert.equal(cache.size, 0);
  } finally {
    releaseResponse?.();
    globalThis.fetch = originalFetch;
  }
});

test("dia aberto e fechado conservam o mesmo snapshot mensal", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const request = new URL(String(input), "http://localhost");
    const from = request.searchParams.get("from");
    requests.push({ from, url: String(input) });
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-27T10:00:00", "line-entry", 1),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const range = {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 6, 27, 10, 31),
    };
    const first = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 30),
      ranges: [range],
    });
    const second = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 35),
      ranges: [
        {
          ...range,
          to: new Date(2026, 6, 27, 10, 36),
        },
      ],
    });

    assert.equal(requests.length, 1);
    assert.deepEqual(
      first.map((row) => [row.bucket, row.total]),
      [
        ["2026-07-22T10:00:00", 22],
        ["2026-07-27T10:00:00", 1],
      ],
    );
    assert.deepEqual(second, first);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("virada do dia mantém a mesma consulta mensal para a data encerrada", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const request = new URL(String(input), "http://localhost");
    requests.push({
      from: request.searchParams.get("from"),
      to: request.searchParams.get("to"),
    });
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-31T23:00:00", "line-entry", 31),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const july = {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 7, 1),
    };
    const whileOpen = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 31, 23, 30),
      ranges: [july],
    });
    const afterMidnight =
      await aggregateHourQuery.fetchHourlyAggregateRanges({
        cache,
        cacheScope: "test-company",
        now: new Date(2026, 7, 1, 0, 30),
        ranges: [july],
      });

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(
      requests[0].from,
      aggregateTime.aggregateQueryIso(july.from, "hour"),
    );
    assert.equal(
      requests[0].to,
      aggregateTime.aggregateQueryIso(july.to, "hour"),
    );
    assert.deepEqual(afterMidnight, whileOpen);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resposta com granularidade diferente é rejeitada", () => {
  assert.throws(
    () => aggregateTime.requireAggregateGranularity("day", "hour"),
    /granularidade day.*consulta hour/,
  );
  assert.equal(
    aggregateTime.requireAggregateGranularity("hour", "hour"),
    "hour",
  );
  assert.throws(
    () => aggregateTime.requireAggregateGranularity(undefined, "hour"),
    /granularidade ausente.*consulta hour/,
  );
});

test("payload agregado ausente ou malformado é rejeitado", () => {
  assert.throws(
    () => aggregateTime.requireAggregateRows(undefined, "hour"),
    /sem o campo data/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [aggregateRow("bucket-invalido", "line-entry", 1)],
        "hour",
      ),
    /linha agregada inválida/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [aggregateRow("2026-07-22T10:00:00", "line-entry", Number.NaN)],
        "hour",
      ),
    /linha agregada inválida/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [aggregateRow("2026-07-22T10:00:00", "line-entry", -1)],
        "hour",
      ),
    /linha agregada inválida/,
  );
});

test("payload agregado aceita buckets alinhados em todas as granularidades", () => {
  const alignedBuckets = {
    minute: "2026-07-22T10:15:00",
    hour: "2026-07-22T10:00:00",
    day: "2026-07-22",
    week: "2026-07-20",
    month: "2026-07-01",
    semester: "2026-07-01",
    year: "2026-01-01",
  };

  Object.entries(alignedBuckets).forEach(([granularity, bucket]) => {
    const rows = [
      {
        ...aggregateRow(bucket, "line-entry", 1),
        object_class: "person",
      },
    ];

    assert.equal(
      aggregateTime.requireAggregateRows(rows, granularity),
      rows,
      granularity,
    );
  });

  const omittedOptionalFields = [
    {
      ...aggregateRow("2026-07-22T10:00:00", "line-entry", 1),
      line_count_id: undefined,
    },
  ];
  assert.equal(
    aggregateTime.requireAggregateRows(omittedOptionalFields, "hour"),
    omittedOptionalFields,
  );
});

test("payload agregado rejeita buckets desalinhados da granularidade", () => {
  const misalignedBuckets = {
    minute: "2026-07-22T10:15:30",
    hour: "2026-07-22T10:15:00",
    day: "2026-07-22T10:00:00",
    week: "2026-07-22",
    month: "2026-07-22",
    semester: "2026-02-01",
    year: "2026-07-01",
  };

  Object.entries(misalignedBuckets).forEach(([granularity, bucket]) => {
    assert.throws(
      () =>
        aggregateTime.requireAggregateRows(
          [aggregateRow(bucket, "line-entry", 1)],
          granularity,
        ),
      /linha agregada inválida/,
      granularity,
    );
  });
});

test("payload agregado rejeita tipos inválidos nos campos opcionais", () => {
  const bucket = "2026-07-22T10:00:00";

  [
    {
      ...aggregateRow(bucket, "line-entry", 1),
      line_count_id: 123,
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      object_class: { name: "person" },
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      line_count_id: null,
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      object_class: null,
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      camera_id: "   ",
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      line_count_id: "",
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      object_class: " ",
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      camera_id: " camera",
    },
    {
      ...aggregateRow(bucket, " line-entry", 1),
    },
  ].forEach((row) => {
    assert.throws(
      () => aggregateTime.requireAggregateRows([row], "hour"),
      /linha agregada inválida/,
    );
  });

  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [
          {
            ...aggregateRow(bucket, "line-entry", 1),
            metric_type: "occupancy",
          },
        ],
        "hour",
        "count",
      ),
    /linha agregada inválida/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [
          aggregateRow(
            bucket,
            "line-entry",
            Number.MAX_SAFE_INTEGER + 1,
          ),
        ],
        "hour",
      ),
    /linha agregada inválida/,
  );
});

test("payload agregado rejeita identidades duplicadas no mesmo bucket", () => {
  const row = aggregateRow(
    "2026-07-22T10:00:00",
    "line-entry",
    1,
  );

  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [row, { ...row, total: 2 }],
        "hour",
        "count",
      ),
    /identidade agregada duplicada/,
  );
  assert.doesNotThrow(() =>
    aggregateTime.requireAggregateRows(
      [
        row,
        {
          ...row,
          line_count_id: "line-exit",
          total: 2,
        },
      ],
      "hour",
      "count",
    ),
  );
});

test("range de duração usa somente minutos fechados do dia civil IANA", () => {
  const range = occupancyDuration.buildOccupancyClosedDayMinuteRange(
    new Date("2026-09-02T13:42:37.845Z"),
    "America/Sao_Paulo",
  );

  assert.equal(range.timeZone, "America/Sao_Paulo");
  assert.equal(range.from.toISOString(), "2026-09-02T03:00:00.000Z");
  assert.equal(range.dayEnd.toISOString(), "2026-09-03T03:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-09-02T13:42:00.000Z");
  assert.equal(range.requestedAt.toISOString(), "2026-09-02T13:42:37.845Z");
  assert.equal(range.buckets.length, 642);
  assert.equal(range.buckets[0].toISOString(), range.from.toISOString());
  assert.equal(
    range.buckets.at(-1).toISOString(),
    "2026-09-02T13:41:00.000Z",
  );

  const midnight = occupancyDuration.buildOccupancyClosedDayMinuteRange(
    new Date("2026-09-02T03:00:31Z"),
    "America/Sao_Paulo",
  );
  assert.equal(midnight.buckets.length, 0);
  assert.equal(midnight.from.getTime(), midnight.to.getTime());
});

test("range de duração respeita saltos e repetições do horário civil", () => {
  const springForward = occupancyDuration.buildOccupancyClosedDayMinuteRange(
    new Date("2026-03-08T07:10:45Z"),
    "America/New_York",
  );
  assert.equal(springForward.from.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(springForward.dayEnd.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(springForward.to.toISOString(), "2026-03-08T07:10:00.000Z");
  assert.equal(springForward.buckets.length, 130);

  const fallBack = occupancyDuration.buildOccupancyClosedDayMinuteRange(
    new Date("2026-11-01T07:10:45Z"),
    "America/New_York",
  );
  assert.equal(fallBack.from.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(fallBack.dayEnd.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(fallBack.to.toISOString(), "2026-11-01T07:10:00.000Z");
  assert.equal(fallBack.buckets.length, 190);

  const springNearClose = occupancyDuration.buildOccupancyClosedDayMinuteRange(
    new Date("2026-03-09T03:59:59Z"),
    "America/New_York",
  );
  assert.equal(
    springNearClose.dayEnd.getTime() - springNearClose.from.getTime(),
    23 * 60 * 60_000,
  );
  assert.equal(springNearClose.buckets.length, 23 * 60 - 1);

  const fallNearClose = occupancyDuration.buildOccupancyClosedDayMinuteRange(
    new Date("2026-11-02T04:59:59Z"),
    "America/New_York",
  );
  assert.equal(
    fallNearClose.dayEnd.getTime() - fallNearClose.from.getTime(),
    25 * 60 * 60_000,
  );
  assert.equal(fallNearClose.buckets.length, 25 * 60 - 1);

  assert.throws(
    () =>
      occupancyDuration.buildOccupancyClosedDayMinuteRange(
        new Date("invalid"),
        "America/Sao_Paulo",
      ),
    /instante de referência.*inválido/,
  );
  assert.throws(
    () =>
      occupancyDuration.buildOccupancyClosedDayMinuteRange(
        new Date(),
        "Fuso/Inexistente",
      ),
    /fuso horário da empresa é inválido/,
  );
});

test("duração de ocupação classifica buckets conservadoramente e une segmentos", () => {
  const from = Date.parse("2026-09-02T10:00:00Z");
  const buckets = Array.from(
    { length: 5 },
    (_, index) => new Date(from + index * 60_000),
  );
  const metrics = new Map([
    [from, { average: 2, minimum: 1, peak: 3 }],
    [from + 60_000, { average: 1, minimum: 1, peak: 1 }],
    [from + 2 * 60_000, { average: 1, minimum: 0, peak: 2 }],
    [from + 3 * 60_000, { average: 0, minimum: 0, peak: 0 }],
  ]);

  const summary = occupancyDuration.buildOccupancyDurationSummary(
    buckets,
    metrics,
  );

  assert.equal(summary.bucketCount, 5);
  assert.equal(summary.observedBucketCount, 4);
  assert.equal(summary.expectedSeconds, 300);
  assert.equal(summary.observedSeconds, 240);
  assert.equal(summary.confirmedOccupiedSeconds, 120);
  assert.equal(summary.possibleOccupiedSeconds, 180);
  assert.equal(summary.confirmedFreeSeconds, 60);
  assert.equal(summary.transitionSeconds, 60);
  assert.equal(summary.unknownSeconds, 60);
  assert.equal(summary.longestConfirmedOccupiedSeconds, 120);
  assert.equal(summary.loadUnitSeconds, 240);
  assert.deepEqual(
    summary.segments.map((segment) => ({
      buckets: segment.bucketCount,
      from: segment.from.toISOString(),
      load: segment.loadUnitSeconds,
      seconds: segment.seconds,
      state: segment.state,
      to: segment.to.toISOString(),
    })),
    [
      {
        buckets: 2,
        from: "2026-09-02T10:00:00.000Z",
        load: 180,
        seconds: 120,
        state: "occupied",
        to: "2026-09-02T10:02:00.000Z",
      },
      {
        buckets: 1,
        from: "2026-09-02T10:02:00.000Z",
        load: 60,
        seconds: 60,
        state: "transition",
        to: "2026-09-02T10:03:00.000Z",
      },
      {
        buckets: 1,
        from: "2026-09-02T10:03:00.000Z",
        load: 0,
        seconds: 60,
        state: "free",
        to: "2026-09-02T10:04:00.000Z",
      },
      {
        buckets: 1,
        from: "2026-09-02T10:04:00.000Z",
        load: 0,
        seconds: 60,
        state: "unknown",
        to: "2026-09-02T10:05:00.000Z",
      },
    ],
  );
});

test("duração não inventa precisão em buckets de transição ou ausentes", () => {
  const from = Date.parse("2026-09-02T10:00:00Z");
  const buckets = [new Date(from), new Date(from + 60_000)];
  const summary = occupancyDuration.buildOccupancyDurationSummary(
    buckets,
    new Map([
      [from, { average: 0.01, minimum: 0, peak: 1 }],
    ]),
  );

  assert.equal(summary.confirmedOccupiedSeconds, 0);
  assert.equal(summary.transitionSeconds, 60);
  assert.equal(summary.possibleOccupiedSeconds, 60);
  assert.equal(summary.unknownSeconds, 60);
  assert.equal(summary.loadUnitSeconds, 0.6);
  assert.deepEqual(
    summary.segments.map((segment) => segment.state),
    ["transition", "unknown"],
  );
});

test("reconciliação da duração substitui a sobreposição e preserva lacunas", () => {
  const from = Date.parse("2026-09-02T10:00:00Z");
  const occupied = { average: 1, minimum: 1, peak: 1 };
  const free = { average: 0, minimum: 0, peak: 0 };
  const current = new Map([
    [from, occupied],
    [from + 60_000, occupied],
    [from + 120_000, occupied],
  ]);
  const incoming = new Map([[from + 120_000, free]]);

  const reconciled = occupancyDuration.reconcileOccupancyDurationMetrics(
    current,
    incoming,
    from + 60_000,
    from + 180_000,
  );

  assert.deepEqual(Array.from(reconciled.keys()), [from, from + 120_000]);
  assert.equal(reconciled.get(from + 120_000).peak, 0);
  assert.equal(reconciled.has(from + 60_000), false);
  assert.throws(
    () =>
      occupancyDuration.reconcileOccupancyDurationMetrics(
        current,
        new Map([[from + 180_000, free]]),
        from + 60_000,
        from + 180_000,
      ),
    /fora da janela solicitada/,
  );
});

test("duração rejeita eixo descontínuo e métricas inconsistentes", () => {
  const from = Date.parse("2026-09-02T10:00:00Z");
  assert.throws(
    () =>
      occupancyDuration.buildOccupancyDurationSummary(
        [new Date(from), new Date(from + 2 * 60_000)],
        new Map(),
      ),
    /contínuo e crescente/,
  );
  assert.throws(
    () =>
      occupancyDuration.buildOccupancyDurationSummary(
        [new Date(from + 1)],
        new Map(),
      ),
    /não inicia em um minuto/,
  );
  assert.throws(
    () =>
      occupancyDuration.buildOccupancyDurationSummary(
        [new Date(from)],
        new Map([
          [from, { average: 2, minimum: 0, peak: 1 }],
        ]),
      ),
    /métrica de duração de ocupação é inconsistente/,
  );
  assert.throws(
    () =>
      occupancyDuration.buildOccupancyDurationSummary(
        [new Date(from)],
        new Map([
          [from, { average: Number.POSITIVE_INFINITY, minimum: 0, peak: 1 }],
        ]),
      ),
    /média de ocupação é inválida/,
  );
});

test("resumos temporais unem sequência confirmada entre consultas", () => {
  const from = Date.parse("2026-09-02T10:00:00Z");
  const occupied = { average: 1, minimum: 1, peak: 1 };
  const free = { average: 0, minimum: 0, peak: 0 };
  const first = occupancyDuration.buildOccupancyDurationSummary(
    [new Date(from), new Date(from + 60_000)],
    new Map([
      [from, occupied],
      [from + 60_000, occupied],
    ]),
  );
  const second = occupancyDuration.buildOccupancyDurationSummary(
    [new Date(from + 2 * 60_000), new Date(from + 3 * 60_000)],
    new Map([
      [from + 2 * 60_000, occupied],
      [from + 3 * 60_000, free],
    ]),
  );

  const combined = occupancyDuration.combineOccupancyDurationSummaries([
    second,
    first,
  ]);
  assert.equal(combined.bucketCount, 4);
  assert.equal(combined.expectedSeconds, 240);
  assert.equal(combined.confirmedOccupiedSeconds, 180);
  assert.equal(combined.confirmedFreeSeconds, 60);
  assert.equal(combined.longestConfirmedOccupiedSeconds, 180);
  assert.equal(combined.loadUnitSeconds, 180);
  assert.deepEqual(
    combined.segments.map((segment) => [segment.state, segment.seconds]),
    [
      ["occupied", 180],
      ["free", 60],
    ],
  );
  assert.equal(first.segments[0].seconds, 120);

  assert.throws(
    () =>
      occupancyDuration.combineOccupancyDurationSummaries([first, first]),
    /períodos sobrepostos/,
  );
  assert.deepEqual(
    occupancyDuration.combineOccupancyDurationSummaries([]),
    {
      bucketCount: 0,
      confirmedFreeSeconds: 0,
      confirmedOccupiedSeconds: 0,
      expectedSeconds: 0,
      loadUnitSeconds: 0,
      longestConfirmedOccupiedSeconds: 0,
      observedBucketCount: 0,
      observedSeconds: 0,
      possibleOccupiedSeconds: 0,
      segments: [],
      transitionSeconds: 0,
      unknownSeconds: 0,
    },
  );
});

test("formatador de duração mantém dias, horas, minutos e segundos", () => {
  assert.equal(occupancyDuration.formatOccupancyDuration(0), "0s");
  assert.equal(occupancyDuration.formatOccupancyDuration(59.6), "1min");
  assert.equal(
    occupancyDuration.formatOccupancyDuration(90_061),
    "1d 1h 1min 1s",
  );
  assert.throws(
    () => occupancyDuration.formatOccupancyDuration(-1),
    /duração de ocupação é inválida/,
  );
});

test("agregado de ocupação exige tuplas completas, ordenadas e não negativas", () => {
  const bucket = "2026-07-22T10:00:00-03:00";
  const validRows = [
    {
      area_avg: 5,
      area_id: "area-a",
      area_max: 7,
      area_min: 3,
      bucket,
      camera_id: "camera-a",
    },
    {
      bucket,
      scenario_total_avg: 10,
      scenario_total_max: 14,
      scenario_total_min: 6,
    },
  ];

  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: validRows,
        granularity: "hour",
        scenario_id: "scenario-a",
      },
      "hour",
      "scenario-a",
    ),
    validRows,
  );
  const certifiedRows = [
    {
      ...validRows[0],
      area_final: 5,
      complete: true,
      status: "complete",
    },
    {
      ...validRows[1],
      complete: true,
      scenario_total_final: 10,
      status: "complete",
    },
  ];
  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        as_of: "2026-07-22T13:00:00Z",
        complete: true,
        data: certifiedRows,
        granularity: "hour",
        scenario_id: "scenario-a",
        status: "complete",
        timezone: "America/Sao_Paulo",
      },
      "hour",
      "scenario-a",
      "America/Sao_Paulo",
      { requireCertification: true },
    ),
    certifiedRows,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: certifiedRows,
          granularity: "hour",
          scenario_id: "scenario-a",
        },
        "hour",
        "scenario-a",
        "America/Sao_Paulo",
        { requireCertification: true },
      ),
    /não informou (?:complete|status|as_of|o timezone)/,
    "a UI não deve publicar agregado sem metadados de certificação",
  );
  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        as_of: "2026-07-22T13:00:00Z",
        complete: true,
        data: validRows,
        granularity: "hour",
        scenario_id: "scenario-a",
        status: "complete",
        timezone: "America/Sao_Paulo",
      },
      "hour",
      "scenario-a",
      "America/Sao_Paulo",
    ),
    validRows,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-a",
          timezone: "UTC",
        },
        "hour",
        "scenario-a",
        "America/Sao_Paulo",
      ),
    /API agregou.*UTC.*Dashboard.*America\/Sao_Paulo/,
  );
  for (const metadata of [
    { complete: false },
    { status: "partial" },
    { as_of: "2026-07-22 13:00:00" },
  ]) {
    assert.throws(() =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          ...metadata,
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    );
  }
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-b",
        },
        "hour",
        "scenario-a",
      ),
    /cenário "scenario-b".*"scenario-a"/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          complete: false,
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    /incompleto ou inválido/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          as_of: "2026-07-22 10:30:00",
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    /as_of.*inválido/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-a",
          timezone: "UTC",
        },
        "hour",
        "scenario-a",
        "America/Sao_Paulo",
      ),
    /API agregou.*UTC.*Dashboard.*America\/Sao_Paulo/,
  );

  const invalidRows = [
    {
      bucket,
      scenario_total_avg: 10,
      scenario_total_min: 6,
    },
    {
      area_avg: 5,
      area_max: 7,
      area_min: -1,
      bucket,
    },
    {
      area_avg: 8,
      area_max: 7,
      area_min: 3,
      bucket,
    },
    {
      area_avg: Number.NaN,
      area_max: 7,
      area_min: 3,
      bucket,
    },
    {
      area_avg: 5,
      area_id: " area-a",
      area_max: 7,
      area_min: 3,
      bucket,
    },
    {
      area_avg: 5,
      area_max: 7,
      area_min: 3,
      bucket,
      camera_id: "camera-a ",
    },
    {
      area_avg: 5,
      area_max: 7,
      area_min: 3,
      bucket,
      scenario_total_avg: 10,
    },
    {
      bucket,
      scenario_total_avg: 10,
      scenario_total_final: 15,
      scenario_total_max: 14,
      scenario_total_min: 6,
    },
  ];

  invalidRows.forEach((row) => {
    assert.throws(
      () =>
        occupancyAggregateValidation.requireOccupancyAggregateRows(
          {
            data: [row],
            granularity: "hour",
            scenario_id: "scenario-a",
          },
          "hour",
          "scenario-a",
        ),
      /linha agregada de ocupação inválida/,
    );
  });

  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: [validRows[0]],
          granularity: "hour",
          scenario_id: " scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    /scenario_id/,
  );
});

test("bucket civil de ocupação usa o fuso IANA esperado sem depender do navegador", () => {
  const originalTimeZone = process.env.TZ;
  const sourceRow = {
    bucket: "2026-07-22T10:00:00",
    scenario_total_avg: 4,
    scenario_total_max: 7,
    scenario_total_min: 1,
  };
  const response = {
    data: [sourceRow],
    granularity: "hour",
    scenario_id: "scenario-a",
  };

  try {
    const normalizedBuckets = ["UTC", "Pacific/Honolulu"].map(
      (browserTimeZone) => {
        process.env.TZ = browserTimeZone;
        return occupancyAggregateValidation.requireOccupancyAggregateRows(
          response,
          "hour",
          "scenario-a",
          "America/Sao_Paulo",
        )[0].bucket;
      },
    );

    assert.deepEqual(normalizedBuckets, [
      "2026-07-22T10:00:00-03:00",
      "2026-07-22T10:00:00-03:00",
    ]);
    assert.equal(sourceRow.bucket, "2026-07-22T10:00:00");

    const normalizedRows =
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        response,
        "hour",
        "scenario-a",
        "America/Sao_Paulo",
      );
    const requestedBucket = new Date("2026-07-22T13:00:00Z");
    const coverage =
      occupancyAggregateValidation.aggregateOccupancyRowsForRequestedBuckets(
        normalizedRows,
        "hour",
        [requestedBucket],
      );
    assert.equal(coverage.missingBuckets.length, 0);
    assert.equal(coverage.totals.get(requestedBucket.getTime()).average, 4);
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("normalização IANA preserva offset fracionário e bloqueia horas DST incertas", () => {
  assert.equal(
    occupancyBucketTime.normalizeOccupancyInstantBucketInTimeZone(
      "2026-07-22T10:00:00",
      "hour",
      "Asia/Kolkata",
    ),
    "2026-07-22T10:00:00+05:30",
  );
  assert.equal(
    aggregateTime.isAggregateBucketAligned(
      "2026-07-22T10:00:00+05:30",
      "hour",
    ),
    true,
  );
  assert.equal(
    new Date("2026-07-22T10:00:00+05:30").toISOString(),
    "2026-07-22T04:30:00.000Z",
  );
  assert.equal(
    occupancyBucketTime.normalizeOccupancyInstantBucketInTimeZone(
      "2026-11-01T03:00:00",
      "hour",
      "America/New_York",
    ),
    "2026-11-01T03:00:00-05:00",
  );
  assert.throws(
    () =>
      occupancyBucketTime.normalizeOccupancyInstantBucketInTimeZone(
        "2026-11-01T01:00:00",
        "hour",
        "America/New_York",
      ),
    /bucket local.*ambíguo.*offset RFC3339 explícito/,
  );
  assert.throws(
    () =>
      occupancyBucketTime.normalizeOccupancyInstantBucketInTimeZone(
        "2026-03-08T02:00:00",
        "hour",
        "America/New_York",
      ),
    /bucket local.*não existe.*instante RFC3339 explícito/,
  );
  assert.throws(
    () =>
      occupancyBucketTime.normalizeOccupancyInstantBucketInTimeZone(
        "2026-07-22T10:00:00",
        "hour",
      ),
    /timezone IANA esperado é obrigatório/,
  );
  assert.equal(
    occupancyBucketTime.normalizeOccupancyInstantBucketInTimeZone(
      "2026-11-01T01:00:00-04:00",
      "hour",
      "America/New_York",
    ),
    "2026-11-01T01:00:00-04:00",
    "offset explícito identifica de forma inequívoca a primeira hora repetida",
  );
});

test("compatibilidade legada só relaxa certificação de buckets instantâneos RFC3339", () => {
  const legacyRows = [
    {
      bucket: "2026-07-22T13:00:00Z",
      scenario_total_avg: 4,
      scenario_total_max: 7,
      scenario_total_min: 1,
    },
  ];
  const legacyResponse = {
    data: legacyRows,
    granularity: "hour",
    scenario_id: "scenario-a",
  };
  const compatibility = {
    allowLegacyUncertifiedInstantBuckets: true,
    requireCertification: true,
  };

  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      legacyResponse,
      "hour",
      "scenario-a",
      "America/Sao_Paulo",
      compatibility,
    ),
    legacyRows,
  );
  const totals =
    occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
      legacyRows,
      "hour",
      compatibility,
    );
  const bucketKey = occupancyAggregateValidation.occupancyAggregateBucketKey(
    new Date("2026-07-22T13:00:00Z"),
    "hour",
  );
  assert.deepEqual(totals.get(bucketKey), {
    average: 4,
    minimum: 1,
    peak: 7,
  });
  assert.equal(
    occupancyAggregateValidation.occupancyAggregateMetadataWarning(
      legacyResponse,
      "hour",
    )?.includes("em atualização"),
    true,
  );

  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          ...legacyResponse,
          data: [{ ...legacyRows[0], bucket: "2026-07-22T10:00:00" }],
        },
        "hour",
        "scenario-a",
        "America/Sao_Paulo",
        compatibility,
      ),
    /não informou (?:complete|status|as_of|o timezone)/,
    "timestamp sem offset não pode ativar a compatibilidade legada",
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          ...legacyResponse,
          data: [{ ...legacyRows[0], bucket: "2026-07-22T00:00:00Z" }],
          granularity: "day",
        },
        "day",
        "scenario-a",
        "America/Sao_Paulo",
        compatibility,
      ),
    /não informou (?:complete|status|as_of|o timezone)/,
    "granularidade civil nunca pode usar o relaxamento legado",
  );

  for (const partialMetadata of [
    { timezone: "America/Sao_Paulo" },
    { complete: true },
    { status: "complete" },
    { as_of: "2026-07-22T14:00:00Z" },
  ]) {
    assert.throws(
      () =>
        occupancyAggregateValidation.requireOccupancyAggregateRows(
          { ...legacyResponse, ...partialMetadata },
          "hour",
          "scenario-a",
          "America/Sao_Paulo",
          compatibility,
        ),
      /não informou (?:complete|status|as_of|o timezone)/,
      "migração parcial do envelope deve continuar no contrato estrito",
    );
  }

  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          as_of: "2026-07-22T14:00:00Z",
          complete: true,
          data: legacyRows,
          granularity: "hour",
          scenario_id: "scenario-a",
          status: "complete",
          timezone: "America/Sao_Paulo",
        },
        "hour",
        "scenario-a",
        "America/Sao_Paulo",
        compatibility,
      ),
    /linha agregada de ocupação inválida/,
    "envelope moderno deve continuar exigindo o valor final certificado",
  );

  assert.throws(
    () =>
      occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
        [{ ...legacyRows[0], bucket: "2026-07-22T10:00:00" }],
        "hour",
        compatibility,
      ),
    /timezone IANA esperado é obrigatório/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
        [{ ...legacyRows[0], bucket: "2026-07-22T00:00:00Z" }],
        "day",
        compatibility,
      ),
    /linha agregada de ocupação inválida/,
  );
});

test("falha de uma série de ocupação não derruba o snapshot ao vivo nem libera exportação parcial", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /const occupancyCertificationError = metadataError \|\| dataLoadError;/,
    "somente catálogo ou snapshot principal podem bloquear todo o módulo",
  );
  assert.match(
    source,
    /const hasIncompleteOccupancyCoverage = Object\.values\([\s\S]*?state\.error \|\| state\.warning/,
    "erro ou lacuna de uma série deve permanecer rastreado localmente",
  );
  assert.match(
    source,
    /<ReportExportActions[\s\S]*?disabled=\{[\s\S]*?hasIncompleteOccupancyCoverage/,
    "dados provisórios podem ser vistos, mas não exportados como certificados",
  );
});

test("totais de cenário repetidos precisam ser idênticos no mesmo bucket", () => {
  const bucket = "2026-07-22T10:00:00-03:00";
  const scenarioTotal = {
    bucket,
    scenario_total_avg: 10,
    scenario_total_max: 14,
    scenario_total_min: 6,
  };

  assert.doesNotThrow(() =>
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: [scenarioTotal, { ...scenarioTotal }],
        granularity: "hour",
        scenario_id: "scenario-a",
      },
      "hour",
      "scenario-a",
    ),
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: [
            scenarioTotal,
            { ...scenarioTotal, scenario_total_avg: 11 },
          ],
          granularity: "hour",
          scenario_id: "scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    /totais de cenário divergentes/,
  );
});

test("agregado rejeita soma independente de máximos de várias áreas", () => {
  const bucket = "2026-08-07T13:15:00Z";
  const repeatedWrongTotal = {
    scenario_total_avg: 12.04884,
    scenario_total_max: 34,
    scenario_total_min: 0,
  };
  const rows = [
    {
      area_avg: 5.5,
      area_id: "area-a",
      area_max: 16,
      area_min: 0,
      bucket,
      camera_id: "camera-a",
      ...repeatedWrongTotal,
    },
    {
      area_avg: 6.54884,
      area_id: "area-b",
      area_max: 18,
      area_min: 0,
      bucket,
      camera_id: "camera-b",
      ...repeatedWrongTotal,
    },
  ];

  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: rows,
          granularity: "minute",
          scenario_id: "scenario-a",
        },
        "minute",
        "scenario-a",
      ),
    /soma de AVG\/MIN\/MAX independentes de 2 áreas.*não pode ser certificado/,
  );
});

test("agregado preserva zero certificado em cenários com várias áreas", () => {
  const bucket = "2026-08-07T13:15:00Z";
  const zeroTotal = {
    scenario_total_avg: 0,
    scenario_total_max: 0,
    scenario_total_min: 0,
  };
  const data = ["area-a", "area-b"].map((areaId, index) => ({
    area_avg: 0,
    area_id: areaId,
    area_max: 0,
    area_min: 0,
    bucket,
    camera_id: `camera-${index + 1}`,
    ...zeroTotal,
  }));

  assert.doesNotThrow(() =>
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      { data, granularity: "minute", scenario_id: "scenario-a" },
      "minute",
      "scenario-a",
    ),
  );
});

test("total do cenário prevalece sobre áreas independentemente da ordem", () => {
  const bucket = "2026-07-22T10:00:00-03:00";
  const areaA = {
    area_avg: 2,
    area_id: "area-a",
    area_max: 3,
    area_min: 1,
    bucket,
    camera_id: "camera-a",
  };
  const areaB = {
    area_avg: 4,
    area_id: "area-b",
    area_max: 6,
    area_min: 2,
    bucket,
    camera_id: "camera-a",
  };
  const scenarioTotal = {
    bucket,
    scenario_total_avg: 20,
    scenario_total_final: 18,
    scenario_total_max: 30,
    scenario_total_min: 10,
  };
  const date = aggregateTime.parseAggregateBucket(bucket, "hour");
  assert.ok(date);
  const key = occupancyAggregateValidation.occupancyAggregateBucketKey(
    date,
    "hour",
  );

  for (const rows of [
    [scenarioTotal, areaA, areaB],
    [areaA, scenarioTotal, areaB],
    [areaA, areaB, scenarioTotal],
    [areaA, scenarioTotal, { ...scenarioTotal }, areaB],
  ]) {
    const totals =
      occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
        rows,
        "hour",
      );
    assert.deepEqual(totals.get(key), {
      average: 20,
      final: 18,
      minimum: 10,
      peak: 30,
    });
  }

  assert.throws(
    () =>
      occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
        [areaA, areaB],
        "hour",
      ),
    /scenario_total_\*/,
  );
  assert.doesNotThrow(() =>
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: [
          {
            ...areaA,
            scenario_total_avg: 20,
            scenario_total_max: 30,
            scenario_total_min: 10,
          },
          {
            ...areaB,
            scenario_total_avg: 20,
            scenario_total_max: 30,
            scenario_total_min: 10,
          },
        ],
        granularity: "hour",
        scenario_id: "scenario-a",
      },
      "hour",
      "scenario-a",
    ),
  );
});

test("agregado aceita parcial somente no bucket aberto explicitamente solicitado", () => {
  const openBucket = new Date(2026, 6, 22, 10, 0, 0, 0);
  const openRow = {
    bucket: openBucket.toISOString(),
    complete: false,
    scenario_total_avg: 4,
    scenario_total_max: 7,
    scenario_total_min: 1,
    status: "partial",
  };
  const response = {
    complete: false,
    data: [openRow],
    granularity: "hour",
    scenario_id: "scenario-a",
    status: "partial",
  };

  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      response,
      "hour",
      "scenario-a",
      undefined,
      { openBucket },
    ),
    response.data,
  );
  const openCoverage =
    occupancyAggregateValidation.aggregateOccupancyRowsForRequestedBuckets(
      response.data,
      "hour",
      [openBucket],
      { openBucket },
    );
  assert.equal(openCoverage.missingBuckets.length, 0);
  assert.equal(
    openCoverage.totals.get(
      occupancyAggregateValidation.occupancyAggregateBucketKey(
        openBucket,
        "hour",
      ),
    ).peak,
    7,
    "o contexto parcial precisa sobreviver também à consolidação de cobertura",
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.aggregateOccupancyRowsForRequestedBuckets(
        response.data,
        "hour",
        [openBucket],
      ),
    /incompleto|status incompleto/,
    "sem o bucket aberto explícito, a mesma linha parcial deve continuar bloqueada",
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          ...response,
          data: [
            {
              ...openRow,
              bucket: new Date(openBucket.getTime() - 60 * 60_000).toISOString(),
            },
            openRow,
          ],
        },
        "hour",
        "scenario-a",
        undefined,
        { openBucket },
      ),
    /bucket na posição 0.*incompleto|status incompleto/,
    "um bucket histórico parcial não pode ser liberado junto com o aberto",
  );
});

test("as_of do bucket aberto fica entre o início e o instante solicitado", () => {
  const openBucket = new Date(2026, 6, 22, 10, 0, 0, 0);
  const requestedAt = new Date(openBucket.getTime() + 37 * 60_000);
  const certifiedAt = new Date(openBucket.getTime() + 35 * 60_000);
  const runtimeTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const partialRow = {
    bucket: openBucket.toISOString(),
    complete: false,
    scenario_total_avg: 4,
    scenario_total_final: 5,
    scenario_total_max: 7,
    scenario_total_min: 1,
    status: "partial",
  };
  const partialResponse = {
    as_of: certifiedAt.toISOString(),
    complete: false,
    data: [partialRow],
    granularity: "hour",
    scenario_id: "scenario-a",
    status: "partial",
    timezone: runtimeTimeZone,
  };

  assert.deepEqual(
    occupancyAggregateValidation.requireOccupancyOpenBucketAsOf(
      certifiedAt.toISOString(),
      "hour",
      openBucket,
      requestedAt,
    ),
    certifiedAt,
  );
  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      partialResponse,
      "hour",
      "scenario-a",
      runtimeTimeZone,
      { openBucket, requestedAt, requireCertification: true },
    ),
    partialResponse.data,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          ...partialResponse,
          as_of: new Date(requestedAt.getTime() + 1).toISOString(),
        },
        "hour",
        "scenario-a",
        runtimeTimeZone,
        { openBucket, requestedAt, requireCertification: true },
      ),
    /fora da janela certificável/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyOpenBucketAsOf(
        new Date(openBucket.getTime() - 1).toISOString(),
        "hour",
        openBucket,
        requestedAt,
      ),
    /fora da janela certificável/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyOpenBucketAsOf(
        new Date(requestedAt.getTime() + 1).toISOString(),
        "hour",
        openBucket,
        requestedAt,
      ),
    /fora da janela certificável/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyOpenBucketAsOf(
        certifiedAt.toISOString(),
        "hour",
        openBucket,
        undefined,
      ),
    /instante solicitado é obrigatório/,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyOpenBucketAsOf(
        certifiedAt.toISOString(),
        "hour",
        openBucket,
        new Date(openBucket.getTime() + 60 * 60_000),
      ),
    /não pertence ao bucket aberto/,
  );
});

test("corte do relatório exige as_of RFC3339 em todas as fontes sem erro ou aviso", () => {
  const cutoff =
    occupancyAggregateValidation.resolveCertifiedOccupancyDataCutoff([
      { asOf: "2026-07-22T13:35:00Z" },
      { asOf: "2026-07-22T13:31:00Z" },
      { asOf: "2026-07-22T13:33:00Z" },
    ]);
  assert.deepEqual(cutoff, new Date("2026-07-22T13:31:00Z"));

  for (const sources of [
    [],
    [{ asOf: undefined }],
    [{ asOf: "2026-07-22 13:31:00" }],
    [{ asOf: "2026-02-30T13:31:00Z" }],
    [{ asOf: "2026-07-22T13:31:00Z", error: "falha" }],
    [{ asOf: "2026-07-22T13:31:00Z", warning: "parcial" }],
  ]) {
    assert.equal(
      occupancyAggregateValidation.resolveCertifiedOccupancyDataCutoff(
        sources,
      ),
      null,
    );
  }
});

test("agregado diário mantém buckets certificados e sinaliza lacunas sem inventar zero", () => {
  const requestedBuckets = Array.from({ length: 7 }, (_, index) =>
    new Date(2026, 6, 29 + index),
  );
  const rows = [
    {
      area_avg: 1.775,
      area_id: "aeroporto|3|1|ocupacao1|region",
      area_max: 5,
      area_min: 0,
      bucket: "2026-08-03T00:00:00Z",
      camera_id: "camera-a",
      scenario_total_avg: 1.775,
      scenario_total_max: 5,
      scenario_total_min: 0,
    },
    {
      area_avg: 1.82,
      area_id: "aeroporto|3|1|ocupacao1|region",
      area_max: 5,
      area_min: 0,
      bucket: "2026-08-04T00:00:00Z",
      camera_id: "camera-a",
      scenario_total_avg: 1.82,
      scenario_total_max: 5,
      scenario_total_min: 0,
    },
  ];

  const coverage =
    occupancyAggregateValidation.aggregateOccupancyRowsForRequestedBuckets(
      rows,
      "day",
      requestedBuckets,
    );

  assert.equal(coverage.totals.size, 2);
  assert.deepEqual(
    coverage.missingBuckets.map((bucket) => [
      bucket.getFullYear(),
      bucket.getMonth(),
      bucket.getDate(),
    ]),
    [
      [2026, 6, 29],
      [2026, 6, 30],
      [2026, 6, 31],
      [2026, 7, 1],
      [2026, 7, 2],
    ],
  );
  assert.match(
    occupancyAggregateValidation.occupancyAggregateCoverageWarning(
      coverage.missingBuckets.length,
      requestedBuckets.length,
    ),
    /5 de 7 períodos.*sem dados.*não representa ocupação zero/,
  );
  assert.equal(
    occupancyAggregateValidation.occupancyAggregateCoverageWarning(0, 7),
    undefined,
  );
});

test("agregado sem metadados é explicitamente provisório em qualquer granularidade", () => {
  assert.match(
    occupancyAggregateValidation.occupancyAggregateMetadataWarning(
      {
        data: [],
        granularity: "day",
        scenario_id: "scenario-a",
      },
      "day",
    ),
    /Dados do período em atualização.*valores mais recentes ainda podem mudar/,
  );
  assert.equal(
    occupancyAggregateValidation.occupancyAggregateMetadataWarning(
      {
        as_of: "2026-08-04T13:00:00Z",
        complete: true,
        data: [],
        granularity: "day",
        scenario_id: "scenario-a",
        status: "complete",
        timezone: "America/Sao_Paulo",
      },
      "day",
    ),
    undefined,
  );
  assert.match(
    occupancyAggregateValidation.occupancyAggregateMetadataWarning(
      { data: [], granularity: "hour", scenario_id: "scenario-a" },
      "hour",
    ),
    /Dados recentes em atualização.*valores mais recentes ainda podem mudar/,
  );
});

test("agregado de ocupação rejeita bucket fora do período solicitado", () => {
  assert.throws(
    () =>
      occupancyAggregateValidation.aggregateOccupancyRowsForRequestedBuckets(
        [
          {
            bucket: "2026-08-04T00:00:00Z",
            scenario_total_avg: 2,
            scenario_total_max: 3,
            scenario_total_min: 1,
          },
        ],
        "day",
        [new Date(2026, 7, 3)],
      ),
    /fora do período solicitado/,
  );
});

test("metadados de cenário válidos preservam identidades e multiplicadores", () => {
  const rows = [
    {
      active: true,
      company_id: "company-a",
      id: "scenario-a",
      lines: [
        {
          action_multiplier: 1,
          label: "Entrada",
          line_count_id: "line-a",
        },
        {
          action_multiplier: -1,
          line_count_id: "line-b",
        },
      ],
      name: "Fluxo",
    },
  ];

  assert.deepEqual(scenarioValidation.requireScenarioRows(rows), rows);
});

test("cenário sem company_id só é normalizado pelo escopo autenticado esperado", () => {
  const scenario = {
    active: true,
    id: "scenario-jwt",
    lines: [{ action_multiplier: 1, line_count_id: "line-a" }],
    name: "Fluxo JWT",
  };

  assert.equal(
    scenarioValidation.requireScenarioRows([scenario], "company-a")[0]
      .company_id,
    "company-a",
  );
  assert.throws(
    () => scenarioValidation.requireScenarioRows([scenario]),
    /company_id.*inválido ou ausente/,
  );
  assert.throws(
    () =>
      scenarioValidation.requireScenarioRows(
        [{ ...scenario, company_id: "company-b" }],
        "company-a",
      ),
    /fora da empresa autenticada "company-a"/,
  );
});

test("metadados de cenário rejeitam padding e IDs duplicados", () => {
  const valid = {
    active: true,
    company_id: "company-a",
    id: "scenario-a",
    lines: [{ action_multiplier: 1, line_count_id: "line-a" }],
    name: "Fluxo",
  };

  for (const invalid of [
    [{ ...valid, id: " scenario-a" }],
    [{ ...valid, company_id: "company-a " }],
    [{ ...valid, name: " Fluxo" }],
    [
      valid,
      {
        ...valid,
        name: "Outro fluxo",
      },
    ],
  ]) {
    assert.throws(
      () => scenarioValidation.requireScenarioRows(invalid),
      /inválid|duplicado/i,
    );
  }
});

test("metadados de cenário rejeitam linhas ambíguas ou inválidas", () => {
  const base = {
    active: true,
    company_id: "company-a",
    id: "scenario-a",
    name: "Fluxo",
  };

  for (const lines of [
    [
      { action_multiplier: 1, line_count_id: "line-a" },
      { action_multiplier: -1, line_count_id: "line-a" },
    ],
    [{ action_multiplier: 2, line_count_id: "line-a" }],
    [{ action_multiplier: 1, line_count_id: " line-a" }],
    [{ action_multiplier: 1, label: 123, line_count_id: "line-a" }],
  ]) {
    assert.throws(
      () => scenarioValidation.requireScenarioRows([{ ...base, lines }]),
      /inválid|duplicado|action_multiplier/i,
    );
  }
});

test("metadados de cenário rejeitam opcionais com tipo inseguro", () => {
  const base = {
    active: true,
    company_id: "company-a",
    id: "scenario-a",
    lines: [{ action_multiplier: 1, line_count_id: "line-a" }],
    name: "Fluxo",
  };

  assert.throws(
    () =>
      scenarioValidation.requireScenarioRows([
        { ...base, description: { text: "inválido" } },
      ]),
    /Texto inválido/,
  );
  assert.throws(
    () =>
      scenarioValidation.requireScenarioRows([
        { ...base, config: [1, Number.NaN] },
      ]),
    /números finitos/,
  );
});

test("metadados de infraestrutura exigem identidade e status canônicos", () => {
  const cameras = metadataValidation.requireCameraRows([
    {
      active: true,
      company_id: "company-a",
      id: "camera-a",
      location_id: "location-a",
      name: "Câmera A",
      sub_location_id: "sub-location-a",
    },
    {
      active: true,
      company_id: "company-a",
      id: "camera-without-sub-location",
      location_id: null,
      name: "Câmera sem sublocal",
      sub_location_id: null,
    },
  ]);
  const locations = metadataValidation.requireLocationRows([
    {
      active: true,
      company_id: "company-a",
      id: "location-a",
      name: "Local A",
    },
  ]);
  const subLocations = metadataValidation.requireSubLocationRows([
    {
      active: true,
      company_id: "company-a",
      id: "sub-location-a",
      location_id: "location-a",
      name: "Sublocal A",
    },
  ]);
  const workers = metadataValidation.requireWorkerRows({
    workers: [
      {
        active: true,
        auth_user_id: null,
        company_id: "company-a",
        id: "worker-a",
        name: "Worker A",
        worker_id: null,
      },
    ],
  });

  assert.equal(cameras[0].id, "camera-a");
  assert.equal(cameras[1].location_id, undefined);
  assert.equal(cameras[1].sub_location_id, undefined);
  assert.equal(locations[0].id, "location-a");
  assert.equal(subLocations[0].id, "sub-location-a");
  assert.equal(workers[0].id, "worker-a");
  assert.equal(workers[0].auth_user_id, undefined);
  assert.equal(workers[0].worker_id, undefined);
  assert.doesNotThrow(() =>
    metadataValidation.requireInfrastructureRelations({
      cameras,
      locations,
      subLocations,
    }),
  );
});

test("infraestrutura implícita usa somente o company_id esperado da requisição", () => {
  const cameras = metadataValidation.requireCameraRows(
    [{ active: true, id: "camera-jwt", name: "Câmera JWT" }],
    "company-a",
  );
  const locations = metadataValidation.requireLocationRows(
    [{ active: true, id: "location-jwt", name: "Local JWT" }],
    "company-a",
  );
  const subLocations = metadataValidation.requireSubLocationRows(
    [
      {
        active: true,
        id: "sub-location-jwt",
        location_id: "location-jwt",
        name: "Sublocal JWT",
      },
    ],
    "company-a",
  );
  const workers = metadataValidation.requireWorkerRows(
    { workers: [{ active: true, id: "worker-jwt", name: "Worker JWT" }] },
    "company-a",
  );

  assert.deepEqual(
    [cameras[0], locations[0], subLocations[0], workers[0]].map(
      (row) => row.company_id,
    ),
    ["company-a", "company-a", "company-a", "company-a"],
  );
  assert.throws(
    () =>
      metadataValidation.requireCameraRows(
        [
          {
            active: true,
            company_id: "company-b",
            id: "camera-foreign",
            name: "Câmera estrangeira",
          },
        ],
        "company-a",
      ),
    /fora da empresa autenticada "company-a"/,
  );
  assert.throws(
    () =>
      metadataValidation.requireCameraRows([
        { active: true, id: "camera-unscoped", name: "Sem escopo" },
      ]),
    /company_id.*inválido ou ausente/,
  );
});

test("metadados de infraestrutura rejeitam booleanos, IDs e envelopes ambíguos", () => {
  const camera = {
    active: true,
    company_id: "company-a",
    id: "camera-a",
    location_id: "location-a",
    name: "Câmera A",
  };

  assert.throws(
    () =>
      metadataValidation.requireCameraRows([
        { ...camera, active: "false" },
      ]),
    /active.*inválido/,
  );
  assert.throws(
    () =>
      metadataValidation.requireCameraRows([
        camera,
        { ...camera },
      ]),
    /id duplicado/,
  );
  assert.throws(
    () =>
      metadataValidation.requireLocationRows([
        {
          active: true,
          company_id: "company-a ",
          id: "location-a",
          name: "Local A",
        },
      ]),
    /company_id.*inválido/,
  );
  assert.throws(
    () =>
      metadataValidation.requireWorkerRows({
        data: [],
        workers: [],
      }),
    /envelope ambíguo/,
  );
  assert.throws(
    () => metadataValidation.requireWorkerRows({ payload: [] }),
    /envelope ambíguo ou inválido/,
  );
});

test("relações de infraestrutura inválidas cancelam a certificação", () => {
  const locations = metadataValidation.requireLocationRows([
    {
      active: true,
      company_id: "company-a",
      id: "location-a",
      name: "Local A",
    },
  ]);
  const cameras = metadataValidation.requireCameraRows([
    {
      active: true,
      company_id: "company-a",
      id: "camera-a",
      location_id: "missing-location",
      name: "Câmera A",
    },
  ]);

  assert.throws(
    () =>
      metadataValidation.requireInfrastructureRelations({
        cameras,
        locations,
        subLocations: [],
      }),
    /local inexistente/,
  );
});

test("catálogo de ocupação usa somente rotas autorizadas ao usuário", async () => {
  const from = new Date("2026-08-03T12:00:00.000Z");
  const to = new Date("2026-08-03T13:00:00.000Z");
  const areaId = "camera-a|3|1|ocupacao|region";
  const requestedPaths = [];
  const request = async (path) => {
    requestedPaths.push(path);

    if (path === "/cameras") {
      return [
        {
          active: true,
          company_id: "company-a",
          id: "camera-a",
          name: "Câmera A",
        },
      ];
    }
    if (path === "/cameras/camera-a/line-counts") {
      return [
        {
          active: true,
          camera_id: "camera-a",
          company_id: "company-a",
          id: "line-entry-a",
          line_code: "entrada",
          metric_type: "count",
          name: "Entrada",
        },
      ];
    }
    if (path === "/occupancy/areas") {
      return {
        complete: true,
        data: [
          {
            active: true,
            area_id: areaId,
            area_name: "Ocupação principal",
            camera_id: "camera-a",
            company_id: "company-a",
            last_seen_at: "2026-08-03T12:30:00.000Z",
            object_class: "person",
            source_kind: "region",
          },
          {
            active: true,
            area_id: "area-without-baseline",
            area_name: "Área ainda não medida",
            camera_id: "camera-a",
            company_id: "company-a",
            last_seen_at: null,
            object_class: "person",
            source_kind: "region",
          },
        ],
      };
    }
    if (path.startsWith("/occupancy?")) {
      return {
        data: [
          {
            area: areaId,
            avg: 7,
            camera_id: "camera-a",
            current_at: "2026-08-03T12:30:00.000Z",
            current_value: 7,
            min: 7,
            object_class: "person",
            peak: 7,
          },
        ],
      };
    }

    throw new Error(`Rota inesperada: ${path}`);
  };

  const catalog = await occupancyAreaOptions.fetchOccupancyAreaCatalog({
    companyId: "company-a",
    from,
    request,
    to,
  });
  const options = catalog.options;

  assert.equal(catalog.authoritative, true);
  assert.equal(
    requestedPaths.some((path) => path === "/workers/config"),
    false,
  );
  assert.equal(
    requestedPaths.some((path) => path === "/occupancy/areas"),
    true,
  );
  assert.equal(
    requestedPaths.some(
      (path) =>
        path.startsWith("/occupancy?") || path.endsWith("/line-counts"),
    ),
    false,
  );
  assert.deepEqual(options, [
    {
      area_id: areaId,
      camera_id: "camera-a",
      key: JSON.stringify(["camera-a", areaId]),
      label: "Ocupação principal / Câmera A",
      object_class: "person",
    },
  ]);
  assert.doesNotThrow(() =>
    occupancyAreaOptions.requireOccupancyAreaClassCompatibility({
      authoritative: true,
      areas: [{ area_id: areaId, camera_id: "camera-a" }],
      objectClass: "person",
      options,
    }),
  );
  assert.throws(
    () =>
      occupancyAreaOptions.requireOccupancyAreaClassCompatibility({
        authoritative: true,
        areas: [{ area_id: areaId, camera_id: "camera-a" }],
        objectClass: "vehicle",
        options,
      }),
    /não mede a classe "vehicle"/,
  );
  assert.throws(
    () =>
      occupancyAreaOptions.requireOccupancyAreaClassCompatibility({
        authoritative: true,
        areas: [{ area_id: "unknown-area", camera_id: "camera-a" }],
        objectClass: "person",
        options,
      }),
    /não consta no catálogo ativo/,
  );
  assert.doesNotThrow(() =>
    occupancyAreaOptions.requireOccupancyAreaClassCompatibility({
      authoritative: false,
      areas: [{ area_id: "legacy-area", camera_id: "camera-a" }],
      objectClass: "person",
      options,
    }),
  );
});

test("descoberta de ocupação mantém snapshot como fallback do catálogo novo", async () => {
  const from = new Date("2026-08-03T12:00:00.000Z");
  const to = new Date("2026-08-03T13:00:00.000Z");
  const areaId = "camera-a|3|1|ocupacao|region";
  const request = async (path) => {
    if (path === "/occupancy/areas") {
      const error = new Error("Rota ainda não publicada.");
      error.status = 404;
      throw error;
    }
    if (path === "/cameras") {
      return [
        {
          active: true,
          company_id: "company-a",
          id: "camera-a",
          name: "Câmera A",
        },
      ];
    }
    if (path === "/cameras/camera-a/line-counts") {
      return [
        {
          active: true,
          camera_id: "camera-a",
          company_id: "company-a",
          id: "line-entry-a",
          line_code: "entrada",
          metric_type: "count",
          name: "Entrada",
        },
        {
          active: true,
          camera_id: "camera-a",
          company_id: "company-a",
          id: "legacy-region-a",
          line_code: areaId,
          metric_type: "count",
          name: "Ocupação observada",
        },
      ];
    }
    if (path.startsWith("/occupancy?")) {
      return {
        data: [
          {
            area: areaId,
            area_label: "Ocupação observada",
            avg: 4,
            camera_id: "camera-a",
            current_at: "2026-08-03T12:30:00.000Z",
            current_value: 4,
            min: 4,
            object_class: "person",
            peak: 4,
          },
        ],
      };
    }
    throw new Error(`Rota inesperada: ${path}`);
  };

  const catalog = await occupancyAreaOptions.fetchOccupancyAreaCatalog({
    companyId: "company-a",
    from,
    request,
    to,
  });
  const options = catalog.options;

  assert.equal(catalog.authoritative, false);
  assert.equal(options.length, 1);
  assert.equal(options[0].area_id, areaId);
  assert.equal(options[0].label, "Ocupação observada / Câmera A");
  assert.equal(options[0].object_class, "person");
});

test("fallback de ocupação não perde snapshots quando linhas aninhadas retornam 404", async () => {
  const from = new Date("2026-08-03T12:00:00.000Z");
  const to = new Date("2026-08-03T13:00:00.000Z");
  const areaId = "camera-a|3|1|ocupacao1|region";
  const request = async (path) => {
    if (path === "/occupancy/areas") {
      const error = new Error("Rota ainda não publicada.");
      error.status = 405;
      throw error;
    }
    if (path === "/cameras") {
      return [
        {
          active: true,
          company_id: "company-a",
          id: "camera-a",
          name: "Câmera A",
        },
      ];
    }
    if (path === "/cameras/camera-a/line-counts") {
      const error = new Error("Rota indisponível no escopo selecionado.");
      error.status = 404;
      throw error;
    }
    if (path.startsWith("/occupancy?")) {
      return {
        data: [
          {
            area: areaId,
            avg: 4,
            camera_id: "camera-a",
            current_at: "2026-08-03T12:30:00.000Z",
            current_value: 4,
            min: 4,
            object_class: "person",
            peak: 4,
          },
        ],
      };
    }
    throw new Error(`Rota inesperada: ${path}`);
  };

  const catalog = await occupancyAreaOptions.fetchOccupancyAreaCatalog({
    companyId: "company-a",
    from,
    request,
    to,
  });

  assert.equal(catalog.authoritative, false);
  assert.deepEqual(catalog.options, [
    {
      area_id: areaId,
      camera_id: "camera-a",
      key: JSON.stringify(["camera-a", areaId]),
      label: "ocupacao1 / Câmera A",
      object_class: "person",
    },
  ]);
});

test("identidades opacas de ocupação não colidem e classes conflitantes falham", () => {
  assert.notEqual(
    occupancyAreas.buildOccupancyAreaKey("camera::a", "area"),
    occupancyAreas.buildOccupancyAreaKey("camera", "a::area"),
  );

  const merged = occupancyAreas.buildOccupancyAreaOptions([
    {
      area: "area-a",
      camera_id: "camera-a",
      object_class: undefined,
    },
    {
      area: "area-a",
      camera_id: "camera-a",
      object_class: "person",
    },
  ]);
  assert.equal(merged[0].object_class, "person");
  assert.throws(
    () =>
      occupancyAreas.buildOccupancyAreaOptions([
        {
          area: "area-a",
          camera_id: "camera-a",
          object_class: "person",
        },
        {
          area: "area-a",
          camera_id: "camera-a",
          object_class: "vehicle",
        },
      ]),
    /divergiram sobre a classe/,
  );
});

test("lista de cenários de ocupação exige contrato completo e único", () => {
  const valid = {
    active: true,
    areas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
        label: "Área A",
      },
    ],
    company_id: "company-a",
    id: "occupancy-a",
    max_total: 20,
    min_total: 1,
    name: "Ocupação A",
    object_class: "person",
  };

  assert.equal(
    occupancyValidation.requireOccupancyScenarioRows({ data: [valid] })[0].id,
    "occupancy-a",
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, active: "true" }],
      }),
    /active.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, company_id: undefined }],
      }),
    /company_id.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, object_class: "Person" }],
      }),
    /object_class não normalizado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [
          {
            ...valid,
            areas: [valid.areas[0], { ...valid.areas[0] }],
          },
        ],
      }),
    /área duplicada/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, max_total: 1, min_total: 2 }],
      }),
    /limites invertidos/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, areas: [] }],
      }),
    /sem nenhuma área/,
  );
});

test("cenário de ocupação implícito não atravessa a empresa autenticada", () => {
  const scenario = {
    active: true,
    areas: [{ area_id: "area-a", camera_id: "camera-a" }],
    id: "occupancy-jwt",
    name: "Ocupação JWT",
    object_class: "person",
  };

  assert.equal(
    occupancyValidation.requireOccupancyScenarioRows(
      { data: [scenario] },
      "company-a",
    )[0].company_id,
    "company-a",
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows(
        { data: [{ ...scenario, company_id: "company-b" }] },
        "company-a",
      ),
    /fora da empresa autenticada "company-a"/,
  );
});

test("snapshots de ocupação válidos preservam zero explícito", () => {
  const scope = {
    expectedCameraIds: ["camera-a"],
    from: new Date("2026-07-22T10:00:00Z"),
    to: new Date("2026-07-22T11:00:00Z"),
  };
  const rows = occupancyValidation.requireOccupancySnapshotRows(
    {
      data: [
        {
          area: "area-a",
          avg: 0,
          camera_id: "camera-a",
          current_at: "2026-07-22T10:30:00Z",
          current_value: 0,
          min: 0,
          peak: 0,
        },
      ],
    },
    scope,
  );

  assert.deepEqual(
    {
      average: rows[0].avg,
      current: rows[0].current_value,
      minimum: rows[0].min,
      peak: rows[0].peak,
    },
    { average: 0, current: 0, minimum: 0, peak: 0 },
  );
});

test("descoberta de áreas preserva snapshots quando metadados legados não existem", async () => {
  const from = new Date("2026-07-22T10:00:00Z");
  const to = new Date("2026-07-22T11:00:00Z");
  const areaId = "camera-a|3|1|ocupacao1|region";
  const requestedPaths = [];
  const request = async (path) => {
    requestedPaths.push(path);
    if (path === "/cameras") {
      return [
        {
          active: true,
          company_id: "company-a",
          id: "camera-a",
          name: "Câmera A",
        },
      ];
    }
    if (path === "/cameras/camera-a/line-counts") {
      const error = new Error("not found");
      error.status = 404;
      throw error;
    }
    if (path.startsWith("/occupancy?")) {
      return {
        data: [
          {
            area: areaId,
            avg: 4,
            camera_id: "camera-a",
            current_at: "2026-07-22T10:30:00Z",
            current_value: 5,
            min: 2,
            object_class: "person",
            peak: 8,
          },
        ],
      };
    }
    throw new Error(`Rota inesperada: ${path}`);
  };

  const options = await occupancyAreaOptions.fetchOccupancyAreaOptions({
    companyId: "company-a",
    from,
    request,
    to,
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].area_id, areaId);
  assert.equal(options[0].camera_id, "camera-a");
  assert.equal(options[0].label, "ocupacao1 / Câmera A");
  assert.deepEqual(requestedPaths.sort(), [
    "/cameras",
    "/cameras/camera-a/line-counts",
    "/occupancy?from=2026-07-22T10%3A00%3A00.000Z&to=2026-07-22T11%3A00%3A00.000Z",
  ]);
});

test("descoberta câmera-linha-área aceita escopo JWT implícito e rejeita conflito", async () => {
  const from = new Date("2026-07-22T10:00:00Z");
  const to = new Date("2026-07-22T11:00:00Z");
  let foreignLine = false;
  const request = async (path) => {
    if (path === "/occupancy/areas") {
      const error = new Error("not found");
      error.status = 404;
      throw error;
    }
    if (path === "/cameras") {
      return [{ active: true, id: "camera-jwt", name: "Câmera JWT" }];
    }
    if (path === "/cameras/camera-jwt/line-counts") {
      return [
        {
          active: true,
          camera_id: "camera-jwt",
          ...(foreignLine ? { company_id: "company-b" } : {}),
          id: "line-area-jwt",
          line_code: "camera-jwt|3|1|ocupacao|region",
          metric_type: "occupancy",
          name: "Área JWT",
        },
      ];
    }
    if (path.startsWith("/occupancy?")) return { data: [] };
    throw new Error(`Rota inesperada: ${path}`);
  };

  const options = await occupancyAreaOptions.fetchOccupancyAreaOptions({
    companyId: "company-a",
    from,
    request,
    to,
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].camera_id, "camera-jwt");
  assert.equal(options[0].area_id, "camera-jwt|3|1|ocupacao|region");

  foreignLine = true;
  await assert.rejects(
    occupancyAreaOptions.fetchOccupancyAreaOptions({
      companyId: "company-a",
      from,
      request,
      to,
    }),
    /fora da empresa autenticada "company-a"/,
  );
});

test("snapshots de ocupação rejeitam envelope, valores e identidades ambíguas", () => {
  const scope = {
    expectedCameraIds: ["camera-a"],
    from: new Date("2026-07-22T10:00:00Z"),
    to: new Date("2026-07-22T11:00:00Z"),
  };
  const valid = {
    area: "area-a",
    avg: 4,
    camera_id: "camera-a",
    current_at: "2026-07-22T10:30:00Z",
    current_value: 5,
    min: 2,
    peak: 8,
  };

  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        { payload: [] },
        scope,
      ),
    /envelope ambíguo ou inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        {
          data: [valid],
          snapshots: [valid],
        },
        scope,
      ),
    /envelope ambíguo/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_value: "5" }],
        scope,
      ),
    /current_value.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_value: 9 }],
        scope,
      ),
    /métricas inconsistentes/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [valid, { ...valid }],
        scope,
      ),
    /snapshot de ocupação duplicado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, area: undefined }, valid],
        scope,
      ),
    /soma seria ambígua/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [
          {
            area: "area-a",
            camera_id: "camera-a",
            current_at: "2026-07-22T10:30:00Z",
            people_count: 5,
          },
        ],
        scope,
      ),
    /current_value.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_at: "2026-07-22T11:00:00Z" }],
        scope,
      ),
    /fora do bucket/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_at: "2026-07-22 10:30:00" }],
        scope,
      ),
    /current_at.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_at: "2026-07-22T09:30:00Z" }],
        scope,
      ),
    /fora do bucket/,
    "o limite inferior também deve pertencer ao bucket solicitado",
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows([], scope),
    /cobertura de câmeras.*ausentes: camera-a/i,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [
          valid,
          {
            ...valid,
            area: "area-b",
            camera_id: "camera-b",
          },
        ],
        scope,
      ),
    /extras: camera-b/i,
  );
});

test("snapshot de cenário de ocupação confere cenário e valores", () => {
  const valid = {
    areas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
        snapshot_at: "2026-07-22T10:00:00Z",
        value: 3,
      },
    ],
    as_of: "2026-07-22T10:00:00Z",
    scenario_id: "occupancy-a",
    total: 3,
  };
  const validationScope = {
    expectedAreas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
      },
    ],
    requestedAt: new Date("2026-07-22T10:01:00Z"),
  };

  assert.equal(
    occupancyValidation.requireOccupancyHistoryResponse(
      valid,
      "occupancy-a",
      validationScope,
    ).total,
    3,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, scenario_id: "occupancy-b" },
        "occupancy-a",
        validationScope,
      ),
    /ao consultar "occupancy-a"/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, total: -1 },
        "occupancy-a",
        validationScope,
      ),
    /total.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        {
          ...valid,
          areas: [valid.areas[0], { ...valid.areas[0] }],
        },
        "occupancy-a",
        validationScope,
      ),
    /área duplicada/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, as_of: undefined },
        "occupancy-a",
        validationScope,
      ),
    /as_of.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, as_of: "2026-07-22T10:02:00Z" },
        "occupancy-a",
        validationScope,
      ),
    /posterior ao instante solicitado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        {
          ...valid,
          areas: [{ ...valid.areas[0], snapshot_at: undefined }],
        },
        "occupancy-a",
        validationScope,
      ),
    /snapshot_at.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, total: 4 },
        "occupancy-a",
        validationScope,
      ),
    /diverge da soma das áreas/,
  );
});

test("alertas de ocupação exigem cenário, identidade e valores certificados", () => {
  const valid = {
    id: 1,
    object_class: "person",
    scenario_id: "occupancy-a",
    threshold_kind: "max",
    threshold_value: 10,
    total_value: 12,
    triggered_at: "2026-07-22T10:00:00Z",
  };

  assert.deepEqual(
    occupancyValidation.requireOccupancyAlertRows(
      { data: [valid] },
      "occupancy-a",
      "person",
    ),
    [valid],
  );
  for (const invalid of [
    { ...valid, id: 1.5 },
    { ...valid, scenario_id: "occupancy-b" },
    { ...valid, threshold_kind: "warning" },
    { ...valid, threshold_value: Number.NaN },
    { ...valid, total_value: -1 },
    { ...valid, triggered_at: "inválido" },
    { ...valid, threshold_kind: "min", threshold_value: 10, total_value: 11 },
  ]) {
    assert.throws(
      () =>
        occupancyValidation.requireOccupancyAlertRows(
          [invalid],
          "occupancy-a",
          "person",
        ),
    );
  }
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyAlertRows(
        [valid, { ...valid }],
        "occupancy-a",
        "person",
      ),
    /id duplicado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyAlertRows(
        { data: [valid], items: [valid] },
        "occupancy-a",
        "person",
      ),
    /envelope ambíguo/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyAlertRows(
        [{ ...valid, object_class: "vehicle" }],
        "occupancy-a",
        "person",
      ),
    /alerta da classe "vehicle"/,
  );
});

test("resumo de ocupação preserva zero atual e não certifica ausência", () => {
  const metric = occupancyMetrics.summarizeOccupancyMetrics([
    { average: 4, current: 7, minimum: 2, peak: 8 },
    { average: 0, current: 0, minimum: 0, peak: 0 },
  ]);

  assert.deepEqual(metric, {
    average: 2,
    current: 0,
    minimum: 0,
    peak: 8,
  });
  assert.deepEqual(
    occupancyMetrics.summarizeOccupancyMetrics([
      {
        average: null,
        current: null,
        minimum: null,
        peak: null,
      },
    ]),
    {
      average: null,
      current: null,
      minimum: null,
      peak: null,
    },
  );
});

test("troca de área atualiza o rótulo padrão e preserva rótulo customizado", () => {
  assert.equal(
    occupancyAreas.resolveOccupancyAreaSelectionLabel({
      currentLabel: "ocupacao1 / aeroporto",
      currentOptionLabel: "ocupacao1 / aeroporto",
      nextOptionLabel: "ocupacao2 / aeroporto",
    }),
    "ocupacao2 / aeroporto",
  );
  assert.equal(
    occupancyAreas.resolveOccupancyAreaSelectionLabel({
      currentLabel: "Vitrine principal",
      currentOptionLabel: "ocupacao1 / aeroporto",
      nextOptionLabel: "ocupacao2 / aeroporto",
    }),
    "Vitrine principal",
  );
});

test("indicadores de hoje usam o bucket diário certificado, não a média das horas", () => {
  const dailyMetric = occupancyMetrics.latestOccupancyMetric([
    { average: 6, current: null, minimum: 1, peak: 11 },
    { average: 8.4, current: null, minimum: 2, peak: 14 },
  ]);
  const unsafeHourlySummary = occupancyMetrics.summarizeOccupancyMetrics([
    { average: 6, current: null, minimum: 1, peak: 11 },
    { average: 14, current: null, minimum: 10, peak: 18 },
  ]);

  assert.deepEqual(dailyMetric, {
    average: 8.4,
    current: null,
    minimum: 2,
    peak: 14,
  });
  assert.equal(unsafeHourlySummary.average, 10);
  assert.notEqual(dailyMetric.average, unsafeHourlySummary.average);
});

test("eixo horário de ocupação mantém 24 slots sem inventar futuro", () => {
  const day = new Date(2026, 6, 22);
  const points = occupancyHourAxis.buildFixedOccupancyHourlyPoints(day, [
    {
      average: 2,
      bucket: new Date(2026, 6, 22, 0).toISOString(),
      current: 3,
      label: "00h",
      minimum: 1,
      peak: 4,
    },
    {
      average: 5,
      bucket: new Date(2026, 6, 22, 10).toISOString(),
      current: 6,
      label: "10h",
      minimum: 2,
      peak: 8,
    },
  ]);

  assert.equal(points.length, 24);
  assert.equal(points[0].label, "00h");
  assert.equal(points[23].label, "23h–24h");
  assert.equal(points[10].peak, 8);
  assert.deepEqual(
    points.slice(11).map((point) => [point.average, point.current, point.minimum, point.peak]),
    Array.from({ length: 13 }, () => [null, null, null, null]),
  );
  assert.deepEqual(
    [points[1].average, points[1].current, points[1].minimum, points[1].peak],
    [null, null, null, null],
    "uma hora ausente continua sem valor; o eixo não a converte em zero",
  );
});

test("eixo horário consolida hora DST repetida sem somar nem perder o pico", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const points = occupancyHourAxis.buildFixedOccupancyHourlyPoints(
      new Date("2026-11-01T04:00:00Z"),
      [
        {
          average: 3,
          bucket: "2026-11-01T05:00:00.000Z",
          current: 4,
          label: "01h",
          minimum: 1,
          peak: 7,
        },
        {
          average: 5,
          bucket: "2026-11-01T06:00:00.000Z",
          current: 6,
          label: "01h",
          minimum: 2,
          peak: 9,
        },
      ],
    );

    assert.equal(points.length, 24);
    assert.deepEqual(points[1], {
      average: null,
      bucket: "2026-11-01T06:00:00.000Z",
      current: 6,
      label: "01h",
      minimum: 1,
      peak: 9,
    });
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("Cenário e Relatórios fixam o eixo depois da consulta horária parcial", () => {
  for (const relativePath of [
    "components/app/occupancy-scenario-dashboard.tsx",
    "components/app/occupancy-reports-dashboard.tsx",
  ]) {
    const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
    assert.match(source, /to: hourEnd/);
    assert.match(source, /buildFixedOccupancyHourlyPoints\(definition\.from, points\)/);
  }
});

test("comparativo semanal preserva um bucket temporal exato por semana exibida", () => {
  const currentBuckets = [
    new Date(2026, 3, 20),
    new Date(2026, 3, 27),
    new Date(2026, 4, 4),
    new Date(2026, 4, 11),
  ];
  const comparisonBuckets =
    occupancyReportComparison.occupancyComparisonBucketStarts({
      bucketStarts: currentBuckets,
      granularity: "week",
      intradayComparison: "yesterday",
    });
  const localParts = (date) => [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ];

  assert.equal(comparisonBuckets.length, currentBuckets.length);
  assert.deepEqual(comparisonBuckets.map(localParts), [
    [2026, 2, 23],
    [2026, 2, 30],
    [2026, 3, 6],
    [2026, 3, 13],
  ]);
});

test("comparativo semanal permanece único e monotônico nas viradas de mês", () => {
  const comparisonBuckets =
    occupancyReportComparison.occupancyComparisonBucketStarts({
      bucketStarts: Array.from(
        { length: 60 },
        (_, index) => new Date(2026, 0, 5 + index * 7),
      ),
      granularity: "week",
      intradayComparison: "yesterday",
    });

  assert.equal(new Set(comparisonBuckets.map(Number)).size, 60);
  comparisonBuckets.slice(1).forEach((bucket, index) => {
    const previous = comparisonBuckets[index];
    assert.equal(bucket.getDay(), 1);
    assert.equal(
      Math.round((bucket.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000)),
      7,
    );
  });
});

test("comparativo horário preserva instantes DST repetidos sem duplicar o destino", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const fallbackSource = [
      "2026-11-01T04:00:00Z",
      "2026-11-01T05:00:00Z",
      "2026-11-01T06:00:00Z",
      "2026-11-01T07:00:00Z",
    ].map((value) => new Date(value));
    const normalTarget =
      occupancyReportComparison.occupancyComparisonBucketStarts({
        bucketStarts: fallbackSource,
        granularity: "hour",
        intradayComparison: "yesterday",
      });

    assert.equal(new Set(normalTarget.map(Number)).size, normalTarget.length);
    assert.deepEqual(normalTarget.map((date) => date.getHours()), [0, 1, 2]);

    const normalSource = [
      "2026-11-02T05:00:00Z",
      "2026-11-02T06:00:00Z",
      "2026-11-02T07:00:00Z",
    ].map((value) => new Date(value));
    const fallbackTarget =
      occupancyReportComparison.occupancyComparisonBucketStarts({
        bucketStarts: normalSource,
        granularity: "hour",
        intradayComparison: "yesterday",
      });

    assert.equal(new Set(fallbackTarget.map(Number)).size, fallbackTarget.length);
    assert.deepEqual(fallbackTarget.map((date) => date.getHours()), [0, 1, 1, 2]);
    assert.deepEqual(
      fallbackTarget.map((date) => date.toISOString()),
      [
        "2026-11-01T04:00:00.000Z",
        "2026-11-01T05:00:00.000Z",
        "2026-11-01T06:00:00.000Z",
        "2026-11-01T07:00:00.000Z",
      ],
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("chaves horárias absolutas não colapsam instantes repetidos", () => {
  const first = new Date("2026-11-01T05:00:00Z");
  const second = new Date("2026-11-01T06:00:00Z");

  assert.notEqual(
    occupancyAggregateValidation.occupancyAggregateBucketKey(first, "hour"),
    occupancyAggregateValidation.occupancyAggregateBucketKey(second, "hour"),
  );
});

test("parser não aceita lixo após data nem horário local inválido", () => {
  assert.equal(
    aggregateTime.parseAggregateBucket("2026-07-22garbage", "day"),
    null,
  );
  assert.equal(
    aggregateTime.parseAggregateBucket("2026-02-30T10:00:00", "hour"),
    null,
  );
  assert.equal(
    periodAnalysisModel.resolvePeriodAnalysisRange(
      "2026-02-30",
      "2026-03-01",
    ),
    null,
  );
  assert.equal(
    aggregateTime.isAggregateBucketAligned(
      "2026-07-22T10:00:00.0001Z",
      "hour",
    ),
    false,
  );
  assert.equal(
    aggregateTime.isAggregateBucketAligned(
      "2026-07-22T00:00:00.0001Z",
      "day",
    ),
    false,
  );
});

test("fonte detalhada substitui o agregado mesmo quando o valor é menor", () => {
  const from = new Date(2026, 6, 22);
  const to = new Date(2026, 6, 23);
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 40),
      aggregateRow("2026-07-22T11:00:00", "line-entry", 50),
    ],
    "hour",
    from,
    to,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 90);
});

test("resposta agregada fora do intervalo solicitado é rejeitada", () => {
  assert.throws(
    () =>
      aggregateTime.requireAggregateRowsInRange(
        [
          aggregateRow(
            "2026-07-22T10:31:00",
            "line-entry",
            1,
            "camera-1",
            "count",
          ),
        ],
        "minute",
        new Date(2026, 6, 22, 10),
        new Date(2026, 6, 22, 10, 31),
        "count",
      ),
    /fora do intervalo consultado/,
  );
});

test("snapshot curto de minutos substitui a mesma hora no gráfico minuto", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 2),
      aggregateRow("2026-07-22T10:01:00", "line-entry", 3),
      aggregateRow("2026-07-22T09:59:00", "line-entry", 9),
    ],
    "minute",
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 7),
      aggregateRow("2026-07-22T10:01:00", "line-entry", 8),
    ],
    "minute",
    new Date(2026, 6, 22, 10),
    new Date(2026, 6, 22, 10, 2),
  );

  assert.deepEqual(
    rows
      .map((row) => {
        const bucket = aggregateTime.parseAggregateBucket(
          row.bucket,
          "minute",
        );
        return [bucket?.getHours(), bucket?.getMinutes(), row.total];
      })
      .sort(
        ([leftHour, leftMinute], [rightHour, rightMinute]) =>
          leftHour - rightHour || leftMinute - rightMinute,
      ),
    [
      [9, 59, 9],
      [10, 0, 7],
      [10, 1, 8],
    ],
  );
});

test("bucket detalhado substitui integralmente identidades do agregado", () => {
  const from = new Date(2026, 6, 22);
  const to = new Date(2026, 6, 23);
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [
      aggregateRow("2026-07-22", "line-entry", 60),
      aggregateRow("2026-07-22", "line-exit", 40),
    ],
    "day",
    [aggregateRow("2026-07-22T10:00:00", "line-entry", 60)],
    "hour",
    from,
    to,
  );

  assert.deepEqual(
    rows.map((row) => [row.line_count_id, row.total]),
    [["line-entry", 60]],
  );
});

test("resposta detalhada vazia corrige o bucket agregado para zero", () => {
  const from = new Date(2026, 6, 22);
  const to = new Date(2026, 6, 23);
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    [],
    "hour",
    from,
    to,
  );

  assert.deepEqual(rows, []);
});

test("resposta vazia preserva buckets fora do intervalo corrigido", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [
      aggregateRow("2026-07-21", "line-entry", 80),
      aggregateRow("2026-07-22", "line-entry", 100),
      aggregateRow("2026-07-23", "line-entry", 120),
    ],
    "day",
    [],
    "hour",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.deepEqual(
    rows.map((row) => [row.bucket, row.total]),
    [
      ["2026-07-21", 80],
      ["2026-07-23", 120],
    ],
  );
});

test("zero explícito continua sendo um valor autoritativo", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    [aggregateRow("2026-07-22T10:00:00", "line-entry", 0)],
    "hour",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 0);
});

test("fonte inválida cancela a reconciliação em vez de apagar o total", () => {
  const target = [aggregateRow("2026-07-22", "line-entry", 100)];
  const invalidTotal = [
    aggregateRow("2026-07-22T10:00:00", "line-entry", Number.NaN),
  ];
  const missingIdentity = [
    {
      ...aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
      camera_id: "",
      line_count_id: undefined,
    },
  ];

  assert.throws(
    () =>
      aggregateReconciliation.reconcileAggregateRows(
        target,
        "day",
        invalidTotal,
        "hour",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
      ),
    /reconciliação foi cancelada/,
  );
  assert.throws(
    () =>
      aggregateReconciliation.reconcileAggregateRows(
        target,
        "day",
        missingIdentity,
        "hour",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
      ),
    /reconciliação foi cancelada/,
  );
});

test("identidades com separador não colidem durante o rollup", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [
      {
        ...aggregateRow("2026-07-22T10:00:00", "c", 2),
        camera_id: "a|b",
      },
      {
        ...aggregateRow("2026-07-22T10:00:00", "b|c", 3),
        camera_id: "a",
      },
    ],
    "hour",
    "day",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.total).sort((left, right) => left - right),
    [2, 3],
  );
});

test("intervalo parcial substitui o bucket sobreposto sem duplicar", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22T10:00:00", "line-entry", 100)],
    "hour",
    [aggregateRow("2026-07-22T10:20:00", "line-entry", 5)],
    "minute",
    new Date(2026, 6, 22, 10, 15),
    new Date(2026, 6, 22, 10, 45),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 5);
});

test("rollup horário recompõe cada dia em uma única passagem", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 4),
      aggregateRow("2026-07-22T11:00:00", "line-entry", 5),
      aggregateRow("2026-07-23T10:00:00", "line-entry", 6),
    ],
    "hour",
    "day",
    new Date(2026, 6, 22),
    new Date(2026, 6, 24),
  );

  assert.deepEqual(
    rows
      .map((row) => [row.bucket, row.total])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ["2026-07-22", 9],
      ["2026-07-23", 6],
    ],
  );
});

test("rollup múltiplo equivale às consolidações individuais", () => {
  const source = [
    aggregateRow("2025-12-31T23:00:00", "line-entry", 2),
    aggregateRow("2026-01-01T00:00:00", "line-entry", 3),
    aggregateRow("2026-07-01T00:00:00", "line-entry", 5),
  ];
  const from = new Date(2025, 11, 31);
  const to = new Date(2026, 6, 2);
  const many = aggregateReconciliation.rollupAggregateRowsMany(
    source,
    "hour",
    ["day", "month", "semester", "year"],
    from,
    to,
  );

  for (const granularity of ["day", "month", "semester", "year"]) {
    const individual = aggregateReconciliation.rollupAggregateRows(
      source,
      "hour",
      granularity,
      from,
      to,
    );
    assert.deepEqual(
      normalizeAggregateRows(many.get(granularity) ?? []),
      normalizeAggregateRows(individual),
      granularity,
    );
  }
});

test("horas repetidas no fim do DST permanecem buckets distintos", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-11-01T05:00:00Z", "line-entry", 2),
      aggregateRow("2026-11-01T06:00:00Z", "line-entry", 3),
    ],
    "hour",
    "hour",
    new Date("2026-11-01T00:00:00Z"),
    new Date("2026-11-02T00:00:00Z"),
  );

  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.bucket)).size, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 5);
});

test("agrupamento horário preserva o fuso da empresa e transições DST", () => {
  for (const [timezone, probe] of [
    ["UTC", "company-four-hour-offset"],
    ["America/New_York", "fallback"],
    ["Australia/Lord_Howe", "half-hour-forward"],
    ["America/Sao_Paulo", "midnight-forward"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["tests/timezone-reconciliation-probe.mjs", probe],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...process.env, TZ: timezone },
      },
    );

    assert.equal(
      result.status,
      0,
      `${timezone}: ${result.stderr || result.stdout}`,
    );
  }
});

test("overflow numérico cancela o rollup", () => {
  assert.throws(
    () =>
      aggregateReconciliation.rollupAggregateRows(
        [
          aggregateRow(
            "2026-07-22T10:00:00",
            "line-entry",
            Number.MAX_SAFE_INTEGER - 1,
          ),
          aggregateRow("2026-07-22T11:00:00", "line-entry", 2),
        ],
        "hour",
        "day",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
      ),
    /excedeu o intervalo numérico seguro/,
  );
});

test("fonte mais grossa nunca é projetada como granularidade detalhada", () => {
  const target = [
    aggregateRow("2026-07-22T10:00:00", "line-entry", 4),
    aggregateRow("2026-07-22T11:00:00", "line-entry", 5),
  ];
  const rows = aggregateReconciliation.reconcileAggregateRows(
    target,
    "hour",
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.deepEqual(rows, target);
});

test("semana não é redistribuída diretamente entre meses", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [aggregateRow("2026-01-26", "line-entry", 100)],
    "week",
    "month",
    new Date(2026, 0, 1),
    new Date(2026, 2, 1),
  );

  assert.deepEqual(rows, []);
});

test("eixo horário mantém 24 posições e não projeta horas futuras", () => {
  const values = hourlyAxis.buildFixedHourlyAxisValues([
    { bucket: new Date(2026, 6, 22, 0).toISOString(), total: 2 },
    { bucket: new Date(2026, 6, 22, 2).toISOString(), total: 5 },
  ]);

  assert.equal(hourlyAxis.HOUR_OF_DAY_LABELS.length, 24);
  assert.equal(hourlyAxis.HOUR_OF_DAY_LABELS[0], "00h");
  assert.equal(hourlyAxis.HOUR_OF_DAY_LABELS[23], "23h");
  assert.equal(values.length, 24);
  assert.deepEqual(values.slice(0, 4), [2, 0, 5, null]);
  assert.equal(values[23], null);
});

test("eixo minuto a minuto mantém 00h–23h, zero certificado e futuro vazio", () => {
  const slots = minuteAxis.buildFixedMinuteDayAxis({
    day: new Date("2026-08-24T12:00:00.000Z"),
    points: [
      { bucket: "2026-08-24T03:00:00.000Z", total: 5 },
      { bucket: "2026-08-24T13:42:00.000Z", total: 7 },
      { bucket: "2026-08-24T13:43:00.000Z", total: 999 },
    ],
    referenceTime: new Date("2026-08-24T13:42:30.000Z"),
    timeZone: "America/Sao_Paulo",
  });

  assert.equal(minuteAxis.MINUTE_OF_DAY_LABELS.length, 1_440);
  assert.equal(minuteAxis.MINUTE_OF_DAY_LABELS[0], "00:00");
  assert.equal(minuteAxis.MINUTE_OF_DAY_LABELS[1_439], "23:59");
  assert.equal(minuteAxis.minuteDayHourAxisLabel(0), "00h");
  assert.equal(minuteAxis.minuteDayHourAxisLabel(1_380), "23h");
  assert.equal(slots.length, 1_440);
  assert.deepEqual(slots[0], {
    index: 0,
    label: "00:00",
    status: "elapsed",
    value: 5,
  });
  assert.equal(slots[1].value, 0, "minuto decorrido sem evento permanece zero");
  assert.equal(slots[642].status, "current");
  assert.equal(slots[642].value, 7);
  assert.equal(slots[643].status, "future");
  assert.equal(slots[643].value, null, "dado futuro indevido deve ser mascarado");
  assert.equal(slots[1_439].value, null);
});

test("eixo minuto a minuto trata avanço e repetição DST sem perder totais", () => {
  const spring = minuteAxis.buildFixedMinuteDayAxis({
    day: new Date("2026-03-08T12:00:00.000Z"),
    points: [],
    referenceTime: new Date("2026-03-08T12:00:00.000Z"),
    timeZone: "America/New_York",
  });
  assert.equal(spring[119].value, 0);
  assert.equal(spring[120].status, "unavailable");
  assert.equal(spring[120].value, null);
  assert.equal(spring[179].status, "unavailable");
  assert.equal(spring[180].value, 0);

  const fall = minuteAxis.buildFixedMinuteDayAxis({
    day: new Date("2026-11-01T12:00:00.000Z"),
    points: [
      { bucket: "2026-11-01T05:30:00.000Z", total: 3 },
      { bucket: "2026-11-01T06:30:00.000Z", total: 4 },
    ],
    referenceTime: new Date("2026-11-01T12:00:00.000Z"),
    timeZone: "America/New_York",
  });
  assert.equal(fall[90].label, "01:30");
  assert.equal(fall[90].value, 7, "as duas ocorrências civis devem ser somadas");
});

test("comparativo horário de hoje mantém o dia civil fixo e o futuro vazio", () => {
  const from = new Date(2026, 7, 24, 0, 0, 0, 0);
  const to = new Date(2026, 7, 25, 0, 0, 0, 0);
  const now = new Date(2026, 7, 24, 10, 42, 0, 0);
  const window = hourlyAxis.resolveFixedHourlyDayWindow(from, to, now);

  assert.deepEqual(window, { fromHour: 0, throughHour: 10 });

  const points = Array.from({ length: 11 }, (_, hour) => ({
    bucket: new Date(2026, 7, 24, hour).toISOString(),
    total: hour === 10 ? 7 : 0,
  }));
  points.push({
    bucket: new Date(2026, 7, 24, 14).toISOString(),
    total: 99,
  });
  const values = hourlyAxis.buildFixedHourlyAxisValues(
    points,
    window.throughHour,
    {
      fromHour: window.fromHour,
      missingHourValue: null,
    },
  );

  assert.equal(values.length, 24);
  assert.deepEqual(values.slice(0, 11), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
  assert.deepEqual(values.slice(11), Array.from({ length: 13 }, () => null));
  assert.deepEqual(
    hourlyAxis.resolveFixedHourlyDayWindow(
      new Date(2026, 7, 23, 0),
      new Date(2026, 7, 24, 0),
      now,
    ),
    { fromHour: 0, throughHour: 23 },
  );
  assert.equal(
    hourlyAxis.resolveFixedHourlyDayWindow(
      new Date(2026, 7, 23, 12),
      new Date(2026, 7, 24, 12),
      now,
    ),
    null,
  );

  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  assert.match(comparisonSource, /resolveFixedHourlyDayWindow\(\s*definition\.currentFrom,\s*definition\.currentTo,\s*referenceTime/);
  assert.match(comparisonSource, /fixedHourlyAxis[\s\S]*?interval: 1,[\s\S]*?rotate: 0/);
  assert.match(comparisonSource, /bottom: fixedHourlyAxis \? 6/);
  assert.match(comparisonSource, /missingHourValue: null/);
  assert.match(
    comparisonSource,
    /definition\.granularity === "hour"[\s\S]*?item\.points\.length > 0/,
  );
  assert.doesNotMatch(comparisonSource, /pointsShareOneCalendarDay/);
});

test("preferência do widget preserva título personalizado com limite seguro", () => {
  const [preference] = viewPreferences.normalizeCardPreferences(
    "live",
    [
      {
        id: "live_chart_hour",
        title: `  ${"H".repeat(140)}  `,
        visible: true,
        zoom: 120,
      },
    ],
    ["live_chart_hour"],
  );

  assert.equal(preference.title, "H".repeat(120));
  assert.equal(preference.zoom, 120);

  const [invalidZoom] = viewPreferences.normalizeCardPreferences(
    "live",
    [{ id: "live_chart_hour", visible: true, zoom: 135 }],
    ["live_chart_hour"],
  );
  assert.equal(invalidZoom.zoom, undefined);
});

test("preferências de widget isolam payloads inválidos e consolidam ids duplicados", () => {
  const cardIds = ["widget-a", "widget-b", "widget-c"];

  for (const invalidPayload of [null, "inválido", 42, { widget: true }]) {
    const normalized = viewPreferences.normalizeCardPreferences(
      "occupancy",
      invalidPayload,
      cardIds,
    );
    assert.deepEqual(
      normalized.map(({ id, visible }) => ({ id, visible })),
      cardIds.map((id) => ({ id, visible: true })),
      "um payload não-array deve cair nos padrões sem lançar",
    );
  }

  const normalized = viewPreferences.normalizeCardPreferences(
    "occupancy",
    [
      null,
      [],
      "inválido",
      { visible: false },
      { id: "widget-b", title: "Primeiro título", visible: true },
      { id: "fora-do-catálogo", visible: false },
      { id: "widget-a", visible: true },
      {
        id: "widget-b",
        scenarioIds: ["scenario-b", "scenario-b"],
        scenarioSelectionMode: "custom",
        title: "Último título",
        visible: false,
      },
    ],
    cardIds,
  );

  assert.deepEqual(
    normalized.map(({ id }) => id),
    ["widget-b", "widget-a", "widget-c"],
    "a primeira ocorrência define a posição e cada id aparece uma única vez",
  );
  assert.equal(normalized[0].title, "Último título");
  assert.equal(normalized[0].visible, false);
  assert.deepEqual(normalized[0].scenarioIds, ["scenario-b"]);
  assert.equal(normalized[0].scenarioSelectionMode, "custom");
});


test("preferência por widget normaliza legado, todos e seleção personalizada", () => {
  const preferences = viewPreferences.normalizeCardPreferences(
    "live",
    [
      { id: "widget-legacy", visible: true },
      {
        id: "widget-all",
        scenarioIds: ["scenario-ignored"],
        scenarioSelectionMode: "all",
        visible: true,
      },
      {
        id: "widget-custom",
        scenarioIds: [" scenario-a ", "scenario-a", "", "scenario-b"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
      {
        id: "widget-invalid",
        scenarioIds: ["scenario-a"],
        scenarioSelectionMode: "unknown",
        visible: true,
      },
    ],
    ["widget-legacy", "widget-all", "widget-custom", "widget-invalid"],
  );
  const byId = new Map(preferences.map((preference) => [preference.id, preference]));

  assert.equal(byId.get("widget-legacy").scenarioSelectionMode, undefined);
  assert.equal(byId.get("widget-all").scenarioSelectionMode, "all");
  assert.equal(byId.get("widget-all").scenarioIds, undefined);
  assert.deepEqual(byId.get("widget-custom").scenarioIds, [
    "scenario-a",
    "scenario-b",
  ]);
  assert.equal(byId.get("widget-custom").scenarioSelectionMode, "custom");
  assert.equal(byId.get("widget-invalid").scenarioSelectionMode, undefined);
  assert.equal(byId.get("widget-invalid").scenarioIds, undefined);
});

test("resolver de cenários por widget mantém inherit/all/custom fail-closed", () => {
  const scenarios = [
    scenarioFixture("scenario-a", "Cenário A"),
    scenarioFixture("scenario-b", "Cenário B"),
    scenarioFixture("scenario-c", "Cenário C"),
  ];

  assert.deepEqual(
    widgetScenarioSelection
      .resolveWidgetScenarios(
        scenarios,
        { mode: "inherit", scenarioIds: [] },
        [scenarios[1]],
      )
      .map(({ id }) => id),
    ["scenario-b"],
  );
  assert.deepEqual(
    widgetScenarioSelection
      .resolveWidgetScenarios(scenarios, { mode: "all", scenarioIds: [] })
      .map(({ id }) => id),
    ["scenario-a", "scenario-b", "scenario-c"],
  );
  assert.deepEqual(
    widgetScenarioSelection
      .resolveWidgetScenarios(scenarios, {
        mode: "custom",
        scenarioIds: ["scenario-c", "scenario-foreign", "scenario-a"],
      })
      .map(({ id }) => id),
    ["scenario-a", "scenario-c"],
  );
  assert.deepEqual(
    widgetScenarioSelection.resolveWidgetScenarios(scenarios, {
      mode: "custom",
      scenarioIds: [],
    }),
    [],
  );
  assert.equal(
    widgetScenarioSelection.widgetScenarioSelectionLabel(
      [scenarios[0], scenarios[2]],
      { mode: "custom", scenarioIds: ["scenario-a", "scenario-c"] },
    ),
    "Cenário A + Cenário C",
  );
  assert.equal(
    widgetScenarioSelection.widgetScenarioSelectionLabel(scenarios, {
      mode: "all",
      scenarioIds: [],
    }),
    "Todos os cenários (3)",
  );
});

test("preset faz round-trip da composição de cenários por widget", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = { dispatchEvent() {}, localStorage: storage };

  try {
    const cardIds = ["widget-legacy", "widget-all", "widget-custom"];
    const snapshot = widgetViewPresets.captureWidgetViewSnapshot({
      cardIds,
      companyId: "company-a",
      menuKey: "live",
      preferences: [
        { id: "widget-legacy", visible: true },
        { id: "widget-all", scenarioSelectionMode: "all", visible: true },
        {
          id: "widget-custom",
          scenarioIds: ["scenario-b", "scenario-a", "scenario-b"],
          scenarioSelectionMode: "custom",
          visible: true,
        },
      ],
      userId: "user-a",
    });
    const preset = {
      createdAt: "2026-09-01T10:00:00.000Z",
      id: "preset-scenarios",
      isDefault: false,
      name: "Composição operacional",
      snapshot,
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    widgetViewPresets.saveWidgetViewPresets("live", [preset], "company-a", "user-a");
    const [storedPreset] = widgetViewPresets.loadWidgetViewPresets(
      "live",
      "company-a",
      "user-a",
    );
    const storedById = new Map(
      storedPreset.snapshot.preferences.map((preference) => [
        preference.id,
        preference,
      ]),
    );
    assert.equal(storedById.get("widget-legacy").scenarioSelectionMode, undefined);
    assert.equal(storedById.get("widget-all").scenarioSelectionMode, "all");
    assert.deepEqual(storedById.get("widget-custom").scenarioIds, [
      "scenario-b",
      "scenario-a",
    ]);
    assert.equal(
      widgetViewPresets.applyWidgetViewPreset(storedPreset, {
        companyId: "company-a",
        targetScope: { id: "target-view", name: "Destino" },
        userId: "user-a",
      }),
      true,
    );
    const applied = viewPreferences.loadScopedCardPreferences(
      "live",
      cardIds,
      "company-a",
      "user-a",
      "target-view",
    );
    assert.deepEqual(
      applied.find(({ id }) => id === "widget-custom").scenarioIds,
      ["scenario-b", "scenario-a"],
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("totais e comparativos fixos de Contagem usam composição por widget", () => {
  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const reportSource = readFileSync(
    resolve(projectRoot, "components/app/counting-intelligence-report.tsx"),
    "utf8",
  );
  const reportDashboardSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const importSource = readFileSync(
    resolve(projectRoot, "lib/live-analysis-import.ts"),
    "utf8",
  );

  for (const cardId of [
    "live_intraday_comparison",
    "live_target_progress",
    "live_month_previous_comparison",
    "live_month_year_comparison",
    "live_chart_minute_day",
    "live_chart_hour",
    "live_moving_average_trend",
    "live_current_year_monthly",
    "live_current_year_accumulated",
    "live_operational_month_comparison",
    "live_operational_month_cumulative",
  ]) {
    assert.equal(liveSource.includes(cardId), true);
  }
  assert.match(liveSource, /renderWithRealtimeWidgetModel/);
  assert.match(liveSource, /scenarioConfigurableCardDefaults/);
  assert.match(liveSource, /intradayReportModel/);
  assert.match(liveSource, /annualAccumulatedReportModel/);
  assert.match(reportSource, /scenarioConfigurable: true as const/);
  assert.match(reportDashboardSource, /reportScenarioSelectionByCardId/);
  assert.match(reportDashboardSource, /countingIntelligenceAssets/);
  assert.match(importSource, /sourcePreference\.scenarioSelectionMode === "all"/);
});

test("grade Bento preserva seis níveis e oferece KPI mínimo compacto", () => {
  assert.deepEqual(cardLayoutSizing.CARD_LAYOUT_LEVELS, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    cardLayoutSizing.CARD_LAYOUT_DESKTOP_WIDTH_SPANS,
    [3, 4, 6, 8, 9, 12],
  );
  assert.deepEqual(
    cardLayoutSizing.CARD_LAYOUT_HEIGHT_ROW_SPANS,
    [6, 9, 12, 15, 18, 24],
  );
  assert.deepEqual(
    cardLayoutSizing.CARD_LAYOUT_LEVELS.map((level) =>
      cardLayoutSizing.resolveCardLayoutHeightPixels(level),
    ),
    [164, 254, 344, 434, 524, 704],
  );
  const condensed = cardLayoutSizing.resolveCardLayoutDimensions({
    condensed: true,
    heightLevel: 1,
    tier: "desktop",
    widthLevel: 1,
  });
  assert.equal(condensed.rowSpan, 5);
  assert.equal(condensed.pixelHeight, 134);
  assert.deepEqual(
    cardLayoutSizing.CARD_LAYOUT_LEVELS.map((heightLevel) =>
      cardLayoutSizing.resolveCardLayoutDimensions({
        condensed: true,
        heightLevel,
        tier: "desktop",
        widthLevel: 1,
      }).pixelHeight,
    ),
    [134, 254, 344, 434, 524, 704],
    "somente a altura mínima do KPI deve mudar",
  );

  const cardLayoutSource = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const compactMetricSource = readFileSync(
    resolve(projectRoot, "components/app/compact-metric-card.tsx"),
    "utf8",
  );
  assert.match(cardLayoutSource, /dimensionLabel: `\$\{Math\.round\(dimensions\.widthRatio \* 100\)\}% · \$\{dimensions\.pixelHeight\}px`/);
  assert.match(
    realtimeSource,
    /const metricCards = \[[\s\S]*?\]\.map\(\(card\) => \(\{[\s\S]*?\.\.\.COMPACT_METRIC_LAYOUT_DEFAULTS/,
  );
  assert.match(
    compactMetricSource,
    /COMPACT_METRIC_LAYOUT_DEFAULTS[\s\S]*?condensed: true[\s\S]*?defaultHeight: "short"[\s\S]*?defaultHeightLevel: 1[\s\S]*?defaultSize: "compact"/,
  );
  assert.match(
    compactMetricSource,
    /mt-auto line-clamp-2[\s\S]*?data-compact-metric-description/,
  );
  assert.match(realtimeSource, /function MetricCard\([\s\S]*?<CompactMetricCard/);
  assert.match(occupancySource, /function MetricCard\([\s\S]*?<CompactMetricCard/);

  const legacy = viewPreferences.normalizeCardPreferences(
    "live",
    [
      {
        height: "short",
        id: "a",
        size: "compact",
        visible: true,
      },
      {
        height: "standard",
        id: "b",
        size: "wide",
        visible: true,
      },
      {
        height: "tall",
        id: "c",
        size: "large",
        visible: true,
      },
      { id: "d", size: "full", visible: true },
    ],
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    legacy.map((item) => [item.widthLevel, item.heightLevel]),
    [
      [1, 1],
      [3, 3],
      [5, 5],
      [6, undefined],
    ],
  );

  const [fine] = viewPreferences.normalizeCardPreferences(
    "live",
    [
      {
        height: "short",
        heightLevel: 4,
        id: "fine",
        size: "compact",
        visible: true,
        widthLevel: 2,
      },
    ],
    ["fine"],
  );
  assert.equal(fine.widthLevel, 2, "o nível novo vence o espelho legado");
  assert.equal(fine.heightLevel, 4);
  assert.equal(fine.size, "compact", "o espelho continua legível por versões antigas");
  assert.equal(fine.height, "tall");

  const [invalid] = viewPreferences.normalizeCardPreferences(
    "live",
    [{ heightLevel: 0, id: "invalid", visible: true, widthLevel: 7 }],
    ["invalid"],
  );
  assert.equal(invalid.widthLevel, undefined);
  assert.equal(invalid.heightLevel, undefined);

  const legacyFourByThree = ["compact", "wide", "large", "full"].flatMap(
    (size, widthIndex) =>
      ["short", "standard", "tall"].map((height, heightIndex) => ({
        height,
        id: `legacy-${widthIndex}-${heightIndex}`,
        size,
        visible: heightIndex !== 1,
      })),
  );
  const migratedFourByThree = viewPreferences.normalizeCardPreferences(
    "live",
    legacyFourByThree,
    legacyFourByThree.map((preference) => preference.id),
  );
  const legacyWidthLevels = [1, 3, 5, 6];
  const legacyHeightLevels = [1, 3, 5];
  migratedFourByThree.forEach((preference, index) => {
    const widthIndex = Math.floor(index / 3);
    const heightIndex = index % 3;
    assert.equal(preference.widthLevel, legacyWidthLevels[widthIndex]);
    assert.equal(preference.heightLevel, legacyHeightLevels[heightIndex]);
    assert.equal(preference.size, legacyFourByThree[index].size);
    assert.equal(preference.height, legacyFourByThree[index].height);
    assert.equal(preference.visible, legacyFourByThree[index].visible);

    const dimensions = cardLayoutSizing.resolveCardLayoutDimensions({
      heightLevel: preference.heightLevel,
      tier: "desktop",
      widthLevel: preference.widthLevel,
    });
    assert.equal(dimensions.widthRatio, [0.25, 0.5, 0.75, 1][widthIndex]);
    assert.equal(dimensions.pixelHeight, [164, 344, 524][heightIndex]);
  });
  assert.deepEqual(
    viewPreferences.normalizeCardPreferences(
      "live",
      migratedFourByThree,
      migratedFourByThree.map((preference) => preference.id),
    ),
    migratedFourByThree,
    "a migração legada 4x3 precisa ser idempotente e não deslocar visões já abertas",
  );

  const allDimensionPreferences = cardLayoutSizing.CARD_LAYOUT_LEVELS.flatMap(
    (widthLevel) =>
      cardLayoutSizing.CARD_LAYOUT_LEVELS.map((heightLevel) => ({
        heightLevel,
        id: `dimension-${widthLevel}-${heightLevel}`,
        visible: true,
        widthLevel,
      })),
  );
  const allDimensions = viewPreferences.normalizeCardPreferences(
    "live",
    allDimensionPreferences,
    allDimensionPreferences.map((preference) => preference.id),
  );
  assert.deepEqual(
    allDimensions.map((preference) => [
      preference.widthLevel,
      preference.heightLevel,
    ]),
    allDimensionPreferences.map((preference) => [
      preference.widthLevel,
      preference.heightLevel,
    ]),
    "as 36 combinações finas precisam sobreviver à normalização",
  );
});

test("visões legadas 4x3 migram por armazenamento, preset e API sem mudar o layout", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  const legacyPreferences = ["compact", "wide", "large", "full"].flatMap(
    (size, widthIndex) =>
      ["short", "standard", "tall"].map((height, heightIndex) => ({
        height,
        id: `legacy-roundtrip-${widthIndex}-${heightIndex}`,
        size,
        visible: heightIndex !== 2,
      })),
  );
  const cardIds = legacyPreferences.map((preference) => preference.id);
  const expectedLevels = legacyPreferences.map((_, index) => [
    [1, 3, 5, 6][Math.floor(index / 3)],
    [1, 3, 5][index % 3],
  ]);

  try {
    const sourceKey = viewPreferences.getCardViewStorageKey(
      "company-legacy",
      "user-legacy",
      "view-legacy",
    );
    storage.setItem(sourceKey, JSON.stringify({ live: legacyPreferences }));

    const loaded = viewPreferences.loadScopedCardPreferences(
      "live",
      cardIds,
      "company-legacy",
      "user-legacy",
      "view-legacy",
    );
    assert.deepEqual(
      loaded.map(({ widthLevel, heightLevel }) => [widthLevel, heightLevel]),
      expectedLevels,
    );

    viewPreferences.saveCardPreferences(
      "live",
      loaded,
      cardIds,
      "company-legacy",
      "user-legacy",
      "view-legacy",
    );
    const persisted = JSON.parse(storage.getItem(sourceKey)).live;
    assert.deepEqual(
      persisted.map(({ widthLevel, heightLevel }) => [widthLevel, heightLevel]),
      expectedLevels,
    );
    assert.deepEqual(
      persisted.map(({ size, height }) => [size, height]),
      legacyPreferences.map(({ size, height }) => [size, height]),
      "os espelhos antigos precisam continuar legíveis por clientes anteriores",
    );

    const applied = widgetViewPresets.applyWidgetViewPreset(
      {
        createdAt: "2026-08-24T12:00:00.000Z",
        id: "legacy-dimensions",
        isDefault: false,
        name: "Visão legada",
        snapshot: {
          cardIds,
          capturedAt: "2026-08-24T12:00:00.000Z",
          menuKey: "live",
          preferences: legacyPreferences,
          sourceScope: { id: "view-legacy", name: "Origem" },
          storage: [],
          version: 1,
        },
        updatedAt: "2026-08-24T12:00:00.000Z",
      },
      {
        companyId: "company-legacy",
        targetScope: { id: "view-migrated", name: "Destino" },
        userId: "user-legacy",
      },
    );
    assert.equal(applied, true);
    const presetRoundTrip = viewPreferences.loadScopedCardPreferences(
      "live",
      cardIds,
      "company-legacy",
      "user-legacy",
      "view-migrated",
    );
    assert.deepEqual(
      presetRoundTrip.map(({ widthLevel, heightLevel }) => [
        widthLevel,
        heightLevel,
      ]),
      expectedLevels,
    );

    const routeSource = readFileSync(
      resolve(projectRoot, "app/api/v1/dashboard-views/[menuKey]/route.ts"),
      "utf8",
    );
    assert.match(
      routeSource,
      /const preferences = normalizeCardPreferences\([\s\S]*?payload\?\.preferences/,
      "a API deve aplicar a mesma migração antes de persistir uma visão",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("resolver Bento preserva proporções e expõe seis larguras no desktop útil", () => {
  const expectedSpans = new Map([
    [639, [1, 1, 1, 1, 1, 1]],
    [640, [6, 6, 12, 12, 12, 12]],
    [959, [6, 6, 12, 12, 12, 12]],
    [960, [4, 4, 8, 8, 12, 12]],
    [1039, [4, 4, 8, 8, 12, 12]],
    [1040, [3, 4, 6, 8, 9, 12]],
    [1079, [3, 4, 6, 8, 9, 12]],
    [1200, [3, 4, 6, 8, 9, 12]],
  ]);

  for (const [containerWidth, spans] of expectedSpans) {
    assert.deepEqual(
      cardLayoutSizing.CARD_LAYOUT_LEVELS.map(
        (widthLevel) =>
          cardLayoutSizing.resolveCardLayoutDimensions({
            containerWidth,
            heightLevel: 3,
            widthLevel,
          }).columnSpan,
      ),
      spans,
      `spans incorretos no limite ${containerWidth}px`,
    );
  }

});

test("todos os widgets oferecem livremente as 36 combinações de dimensão", () => {
  for (const widthLevel of cardLayoutSizing.CARD_LAYOUT_LEVELS) {
    for (const heightLevel of cardLayoutSizing.CARD_LAYOUT_LEVELS) {
      for (const tier of ["single", "two-column", "three-column", "desktop"]) {
        const dimensions = cardLayoutSizing.resolveCardLayoutDimensions({
          heightLevel,
          tier,
          widthLevel,
        });
        assert.equal(dimensions.widthLevel, widthLevel);
        assert.equal(dimensions.heightLevel, heightLevel);
      }
    }
  }

  const cardLayoutSource = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );
  const globalSource = readFileSync(
    resolve(projectRoot, "app/globals.css"),
    "utf8",
  );
  const sizingSource = readFileSync(
    resolve(projectRoot, "lib/card-layout-sizing.ts"),
    "utf8",
  );
  const dimensionControls = cardLayoutSource.slice(
    cardLayoutSource.indexOf("function WidgetDimensionControls"),
    cardLayoutSource.indexOf("function WidgetTitleEditor"),
  );
  assert.match(cardLayoutSource, /data-layout-card-dimension-range="1-6"/);
  assert.match(
    dimensionControls,
    /CARD_WIDTH_LEVEL_OPTIONS\.map[\s\S]*?CARD_HEIGHT_LEVEL_OPTIONS\.map/,
  );
  assert.doesNotMatch(
    dimensionControls,
    /\bdisabled\b|indisponível para este widget/,
    "nenhum nível dimensional pode ser desabilitado por tipo de widget",
  );
  assert.doesNotMatch(
    cardLayoutSource,
    /cardDimensionConstraints|inferredMinimumHeightLevel|rowSpanOverrides/,
    "o CardLayout não pode reintroduzir limites implícitos por complexidade",
  );
  assert.doesNotMatch(
    sizingSource,
    /DimensionConstraints|RowSpanOverride|\bconstraints\b|minHeight|maxHeight|minWidth|maxWidth|narrowMin/,
    "o motor Bento precisa manter uma escala universal, sem escape para limites por widget",
  );
  const widthResolver = cardLayoutSource.slice(
    cardLayoutSource.indexOf("function resolveRequestedCardWidthLevel"),
    cardLayoutSource.indexOf("function resolveRequestedCardHeightLevel"),
  );
  const heightResolver = cardLayoutSource.slice(
    cardLayoutSource.indexOf("function resolveRequestedCardHeightLevel"),
    cardLayoutSource.indexOf("function resolveCardDimensions"),
  );
  const savedHeightLevelIndex = heightResolver.indexOf(
    "preference?.heightLevel",
  );
  const savedLegacyHeightIndex = heightResolver.indexOf(
    "preference?.height",
    savedHeightLevelIndex + "preference?.heightLevel".length,
  );
  const defaultHeightLevelIndex = heightResolver.indexOf(
    "card.defaultHeightLevel",
  );
  const defaultLegacyHeightIndex = heightResolver.indexOf(
    "card.defaultHeight",
    defaultHeightLevelIndex + "card.defaultHeightLevel".length,
  );
  assert.ok(
    widthResolver.indexOf("preference?.widthLevel") <
      widthResolver.indexOf("preference?.size") &&
      widthResolver.indexOf("preference?.size") <
        widthResolver.indexOf("card.defaultWidthLevel") &&
      widthResolver.indexOf("card.defaultWidthLevel") <
        widthResolver.indexOf("card.defaultSize"),
    "a visão salva precisa vencer os defaults finos de compatibilidade",
  );
  assert.ok(
    savedHeightLevelIndex < savedLegacyHeightIndex &&
      savedLegacyHeightIndex < defaultHeightLevelIndex &&
      defaultHeightLevelIndex < defaultLegacyHeightIndex,
    "a altura salva precisa vencer o tamanho inicial do widget",
  );
  assert.match(
    cardLayoutSource,
    /group relative h-full min-h-0 min-w-0 overflow-hidden transition/,
    "combinações pequenas não podem estourar a célula Bento",
  );
  assert.match(
    globalSource,
    /data-layout-card-height-level="1"[\s\S]*?data-card-description[\s\S]*?display: none/,
    "a altura mínima deve priorizar conteúdo essencial sem criar rolagem",
  );
  assert.match(globalSource, /@container \(min-width: 640px\)/);
  assert.match(
    globalSource,
    /@container \(min-width: 960px\) and \(max-width: 1039px\)/,
  );
  assert.match(globalSource, /@container \(min-width: 1040px\)/);
  assert.doesNotMatch(globalSource, /@container \(min-width: 1080px\)/);
  assert.match(
    cardLayoutSource,
    /function layoutPreviewLabel[\s\S]*?layoutWidth < 960[\s\S]*?layoutWidth < 1_040[\s\S]*?Intermediário · 3 faixas[\s\S]*?Desktop · 6 níveis de largura/,
  );

  for (const relativePath of [
    "components/app/realtime-dashboard.tsx",
    "components/app/period-analysis-dashboard.tsx",
    "components/app/scenario-reports-dashboard.tsx",
    "components/app/counting-intelligence-report.tsx",
    "components/app/occupancy-scenario-dashboard.tsx",
    "components/app/occupancy-reports-dashboard.tsx",
    "components/app/occupancy-comparison-widgets.tsx",
  ]) {
    const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /\b(?:minWidthLevel|maxWidthLevel|minHeightLevel|maxHeightLevel|narrowMinHeightLevel|minHeightByWidthLevel|minHeight|maxHeight)\s*:/,
      `${relativePath} não pode limitar a personalização dimensional`,
    );
  }
});

test("organizador separa ativos e ocultos e usa a mesma resolução da grade real", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );
  const previewSource = readFileSync(
    resolve(projectRoot, "components/app/widget-bento-preview.tsx"),
    "utf8",
  );
  const globalSource = readFileSync(
    resolve(projectRoot, "app/globals.css"),
    "utf8",
  );

  assert.match(source, /const activeCards = cards\.filter\(/);
  assert.match(source, /const hiddenCards = cards\.filter\(/);
  assert.match(source, /<WidgetBentoPreview[\s\S]*?items=\{previewItems\}/);
  assert.match(source, /data-hidden-widget-section/);
  assert.match(source, /function mergeVisibleOrder\([\s\S]*?visibleIndex\+\+/);
  assert.match(
    source,
    /nextVisibleCards[\s\S]*?persistFullOrder\(mergeVisibleOrder\(next\)\)/,
    "subir, descer e arrastar devem reorganizar somente os widgets ativos",
  );
  assert.match(source, /\.\.\.preference,[\s\S]*?visible: preference\?\.visible/);
  assert.match(source, /CARD_WIDTH_LEVEL_OPTIONS[\s\S]*?CARD_HEIGHT_LEVEL_OPTIONS/);
  assert.match(
    source,
    /function resizeCard\([\s\S]*?resolveCardPreferenceDimensions\([\s\S]*?function resizeCardHeight\([\s\S]*?resolveCardPreferenceDimensions\(/,
    "a adaptação de altura do celular não pode contaminar a preferência persistida",
  );
  assert.match(
    source,
    /function resolveCardPreferenceDimensions\([\s\S]*?tier: "desktop"/,
  );
  assert.match(source, /gridAutoRows: `\$\{CARD_LAYOUT_ROW_HEIGHT\}px`/);
  assert.match(previewSource, /grid-flow-row/);
  assert.match(previewSource, /gridAutoRows: `\$\{geometry\.rowHeight\}px`/);
  assert.match(previewSource, /gap: `\$\{geometry\.gap\}px`/);
  assert.match(previewSource, /width: geometry\.canvasWidth/);
  assert.match(previewSource, /new ResizeObserver/);
  assert.match(source, /sourceWidth=\{layoutWidth\}/);
  assert.match(source, /columnSpan: dimensions\.columnSpan/);
  assert.match(source, /rowSpan: dimensions\.rowSpan/);
  assert.match(source, /packCardsForEveryTier\(orderedCards, preferences\)/);
  assert.match(source, /placementSetForCard\(packedLayouts, placement\.id\)/);
  assert.match(source, /\{packedCards\.map\(\(\{ card, placements \}\) => \(/);
  assert.match(source, /data-layout-card-column-start=\{activePlacement\.columnStart\}/);
  assert.match(source, /data-layout-card-row-start=\{activePlacement\.rowStart\}/);
  assert.match(
    source,
    /const previewColumnCount = resolveCardLayoutDimensions\([\s\S]*?containerWidth: layoutWidth[\s\S]*?\)\.columnCount/,
  );
  assert.doesNotMatch(
    `${source}\n${previewSource}`,
    /grid-flow-row-dense/,
    "a ordem visual do Bento precisa coincidir com a ordem persistida e de teclado",
  );
  assert.match(previewSource, /packCardLayout\(/);
  assert.match(
    previewSource,
    /gridColumn: `\$\{placement\.columnStart\} \/ span \$\{columnSpan\}`/,
  );
  assert.match(
    previewSource,
    /gridRow: `\$\{placement\.rowStart\} \/ span \$\{rowSpan\}`/,
  );
  assert.match(globalSource, /repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(globalSource, /--widget-column-start-desktop/);
  assert.match(globalSource, /--widget-column-span-desktop/);
  assert.match(globalSource, /--widget-row-start-desktop/);
  assert.match(globalSource, /--widget-row-span-multi/);
});

test("miniatura Bento aplica uma única escala à largura, linhas e espaçamento", () => {
  const geometry = widgetBentoPreviewLayout.resolveWidgetBentoPreviewGeometry({
    availableWidth: 600,
    sourceGap: 16,
    sourceRowHeight: 14,
    sourceWidth: 1_200,
  });

  assert.deepEqual(geometry, {
    canvasWidth: 600,
    gap: 8,
    rowHeight: 7,
    scale: 0.5,
  });

  for (const span of [5, 6, 9, 12, 15, 18, 24]) {
    const sourcePixels = widgetBentoPreviewLayout.resolveWidgetBentoSpanPixels(
      span,
      14,
      16,
    );
    const previewPixels = widgetBentoPreviewLayout.resolveWidgetBentoSpanPixels(
      span,
      geometry.rowHeight,
      geometry.gap,
    );
    assert.equal(previewPixels / sourcePixels, geometry.scale);
  }

  const sourceTrack = (1_200 - 11 * 16) / 12;
  const previewTrack = (geometry.canvasWidth - 11 * geometry.gap) / 12;
  for (const span of [3, 4, 6, 8, 9, 12]) {
    const sourcePixels = widgetBentoPreviewLayout.resolveWidgetBentoSpanPixels(
      span,
      sourceTrack,
      16,
    );
    const previewPixels = widgetBentoPreviewLayout.resolveWidgetBentoSpanPixels(
      span,
      previewTrack,
      geometry.gap,
    );
    assert.ok(Math.abs(previewPixels / sourcePixels - geometry.scale) < 1e-12);
  }

  assert.deepEqual(
    widgetBentoPreviewLayout.resolveWidgetBentoPreviewGeometry({
      availableWidth: 800,
      sourceGap: 16,
      sourceRowHeight: 14,
      sourceWidth: 400,
    }),
    {
      canvasWidth: 400,
      gap: 16,
      rowHeight: 14,
      scale: 1,
    },
    "a prévia não deve ampliar uma tela estreita além do tamanho real",
  );

  assert.deepEqual(
    widgetBentoPreviewLayout.resolveWidgetBentoPreviewGeometry({
      availableWidth: 600,
      sourceGap: 16,
      sourceRowHeight: 14,
      sourceWidth: 0,
    }),
    {
      canvasWidth: 600,
      gap: 16,
      rowHeight: 14,
      scale: 1,
    },
    "antes de medir a tela real, a prévia deve manter a proporção natural",
  );
});

test("miniatura Bento representa a configuração visual efetiva de cada widget", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );
  const previewSource = readFileSync(
    resolve(projectRoot, "components/app/widget-bento-preview.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const analysisSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const occupancyComparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );

  for (const configuredField of [
    "chartType",
    "const configuredColor = preference?.color",
    "gradient: card.colorPreview",
    "previewKind: resolveWidgetBentoPreviewKind",
    "zoom: card.zoomEnabled",
  ]) {
    assert.ok(
      source.includes(configuredField),
      `a prévia deve receber ${configuredField}`,
    );
  }

  for (const kind of [
    "metric",
    "heatmap",
    "hex",
    "list",
    "table",
    "ranking",
    "composition",
    "detail",
  ]) {
    assert.match(
      previewSource,
      new RegExp(`kind === ["']${kind}["']`),
      `a miniatura deve possuir representação de ${kind}`,
    );
  }
  assert.match(previewSource, /chartType === "line"/);
  assert.match(previewSource, /chartType === "rose"/);
  assert.match(previewSource, /chartType === "treemap"/);
  assert.match(previewSource, /data-widget-bento-miniature="bar"/);
  assert.match(source, /label: preference\?\.title \?\? card\.label \?\? "Widget"/);
  assert.match(
    realtimeSource,
    /id: LIVE_DAY_MINUTES_ID[\s\S]*?previewChartType: "line"/,
  );
  assert.match(
    realtimeSource,
    /widget\.kind === "scenario_widget"[\s\S]*?previewKind: resolveWidgetBentoPreviewKindFromDataKind\([\s\S]*?widget\.widgetType/,
  );
  assert.match(
    analysisSource,
    /previewKind: resolveWidgetBentoPreviewKindFromDataKind\(widget\.kind\)/,
  );
  assert.match(
    occupancyComparisonSource,
    /id: "occupancy_scenario_half_donut"[\s\S]*?settings\.comparisonChartType === "half_donut"[\s\S]*?"composition"[\s\S]*?"chart"/,
  );
  assert.match(
    occupancyComparisonSource,
    /id: "occupancy_scenario_max_hour"[\s\S]*?previewChartType: "line"/,
  );
  assert.match(
    occupancyComparisonSource,
    /id: "occupancy_hex_layout"[\s\S]*?previewColors: selectedHexColorPalette\.colors[\s\S]*?previewKind: "hex"/,
  );
  assert.match(
    occupancyComparisonSource,
    /id: "occupancy_day_hour_heatmap"[\s\S]*?previewColors: selectedColorPalette\.colors[\s\S]*?previewKind: "heatmap"/,
  );

  const resolveKind = widgetBentoPreviewContent.resolveWidgetBentoPreviewKind;
  const cases = [
    [
      { condensed: true, id: "kpi", label: "Ranking renomeado" },
      "metric",
    ],
    [
      {
        chartTypeEnabled: true,
        id: "live_custom_123",
        label: "Resumo mensal",
      },
      "chart",
    ],
    [{ id: "occupancy_day_hour_heatmap", label: "Movimento" }, "heatmap"],
    [{ chartType: "rose", id: "custom", label: "Composição" }, "composition"],
    [{ id: "analysis_totals_table", label: "Detalhes" }, "table"],
    [{ id: "occupancy_alert_list", label: "Ocorrências" }, "list"],
    [{ id: "occupancy_hex_layout", label: "Operação" }, "hex"],
    [{ id: "unknown", label: "Informações" }, "detail"],
    [
      {
        id: "custom",
        label: "Qualquer título",
        previewKind: "heatmap",
      },
      "heatmap",
    ],
  ];
  for (const [input, expected] of cases) {
    assert.equal(resolveKind(input), expected, JSON.stringify(input));
  }

  const resolveDataKind =
    widgetBentoPreviewContent.resolveWidgetBentoPreviewKindFromDataKind;
  assert.deepEqual(
    [
      "day_total",
      "heatmap",
      "totals_table",
      "ranking",
      "peak_days",
      "rose",
      "summary",
      "timeline",
    ].map((kind) => resolveDataKind(kind)),
    [
      "metric",
      "heatmap",
      "table",
      "ranking",
      "ranking",
      "composition",
      "detail",
      "chart",
    ],
  );
});

test("Contagem mantém somente KPIs compactos na tela e na prévia Bento", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/counting-intelligence-report.tsx"),
    "utf8",
  );
  const cardLayoutSource = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );

  const ids = countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS;
  assert.deepEqual(countingIntelligence.COUNTING_INTELLIGENCE_COMPACT_CARD_IDS, [
    ids.periodTotal,
    ids.endMonth,
    ids.monthlyAverage,
    ids.accessLeader,
  ]);
  for (const [name, cardId] of Object.entries(ids)) {
    assert.equal(
      countingIntelligence.isCountingIntelligenceCompactCard(cardId),
      ["periodTotal", "endMonth", "monthlyAverage", "accessLeader"].includes(
        name,
      ),
      name,
    );
  }
  assert.match(
    source,
    /isCountingIntelligenceCompactCard\(card\.id\)[\s\S]*?COMPACT_METRIC_LAYOUT_DEFAULTS/,
  );
  assert.match(
    source,
    /id: COUNTING_INTELLIGENCE_CARD_IDS\.annualComparison[\s\S]*?defaultHeight: "tall"/,
  );
  assert.match(
    source,
    /id: COUNTING_INTELLIGENCE_CARD_IDS\.annualAccumulatedComparison[\s\S]*?defaultHeight: "tall"/,
  );
  assert.match(
    source,
    /id: COUNTING_INTELLIGENCE_CARD_IDS\.yearOverYearMonth[\s\S]*?defaultHeight: "tall"/,
  );
  assert.match(
    source,
    /id: COUNTING_INTELLIGENCE_CARD_IDS\.directionalFlow[\s\S]*?defaultHeightLevel: 4/,
  );
  assert.match(
    source,
    /id: COUNTING_INTELLIGENCE_CARD_IDS\.accessRanking[\s\S]*?defaultHeight: "tall"/,
  );
  assert.match(cardLayoutSource, /condensed: Boolean\(card\.condensed\)/);
  assert.equal(
    widgetBentoPreviewContent.resolveWidgetBentoPreviewKind({
      condensed: true,
      id: ids.periodTotal,
    }),
    "metric",
  );
});

test("exportação da análise propaga o título personalizado para métricas e tabelas", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /metrics: models\.flatMap\(\(\{ defaultTitle, model, title \}\)[\s\S]*?title === defaultTitle[\s\S]*?metrics\.length === 1 \? title : `\$\{title\} · \$\{metric\.label\}`/,
  );
  assert.match(
    source,
    /tables: models\.flatMap\(\(\{ defaultTitle, model, title \}\)[\s\S]*?title: title === defaultTitle \? model\.table\.title : title/,
  );
});

test("KPIs compactos compartilham shell, preset e miniatura fiel nos seis contextos", () => {
  const compactSource = readFileSync(
    resolve(projectRoot, "components/app/compact-metric-card.tsx"),
    "utf8",
  );
  const analysisSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const previewSource = readFileSync(
    resolve(projectRoot, "components/app/widget-bento-preview.tsx"),
    "utf8",
  );
  const globalSource = readFileSync(
    resolve(projectRoot, "app/globals.css"),
    "utf8",
  );
  const dashboardSources = [
    "components/app/realtime-dashboard.tsx",
    "components/app/period-analysis-dashboard.tsx",
    "components/app/counting-intelligence-report.tsx",
    "components/app/occupancy-scenario-dashboard.tsx",
    "components/app/occupancy-reports-dashboard.tsx",
  ].map((relativePath) =>
    readFileSync(resolve(projectRoot, relativePath), "utf8"),
  );

  assert.match(compactSource, /COMPACT_METRIC_LAYOUT_DEFAULTS/);
  assert.match(compactSource, /data-compact-metric-card/);
  assert.match(compactSource, /data-compact-metric-title/);
  assert.match(compactSource, /data-compact-metric-value/);
  assert.match(compactSource, /data-compact-metric-description/);
  assert.match(compactSource, /<h3[\s\S]*?data-compact-metric-title/);
  assert.match(compactSource, /--compact-metric-accent/);
  assert.match(globalSource, /\.dark \[data-compact-metric-icon\]/);
  for (const source of dashboardSources) {
    assert.match(source, /CompactMetricCard/);
    assert.match(source, /COMPACT_METRIC_LAYOUT_DEFAULTS/);
  }
  assert.match(analysisSource, /const compactLabel =/);
  assert.match(analysisSource, /metric\?\.label \?\? widget\.title/);
  assert.match(previewSource, /data-widget-bento-metric-zone="title"/);
  assert.match(previewSource, /data-widget-bento-metric-zone="value"/);
  assert.match(previewSource, /data-widget-bento-metric-zone="context"/);
  assert.match(previewSource, /flex-col gap-0\.5 p-1/);
  assert.match(
    previewSource,
    /Boolean\(item\.condensed\) && tileHeight < 96\)[\s\S]*?tileHeight < 72 \|\|[\s\S]*?tileWidth < 120/,
  );
  assert.match(previewSource, /tileHeight < 48 \|\| tileWidth < 72/);
});

test("ocupação ignora completamente eventos anteriores ao início configurado", () => {
  const day = new Date(2026, 6, 22);
  const entries = emptyHours();
  const exits = emptyHours();
  entries[9] = 100;
  entries[10] = 5;
  entries[11] = 7;
  exits[9] = 80;
  exits[10] = 1;
  exits[11] = 2;

  const points = occupancySeries.buildHourlyOccupancySeries({
    day,
    entriesByHour: entries,
    exitsByHour: exits,
    startHour: 10,
    through: nextDay(day),
  });

  assert.deepEqual(
    pickOccupancy(points[9]),
    { entries: 0, exits: 0, occupancy: 0 },
  );
  assert.deepEqual(
    pickOccupancy(points[10]),
    { entries: 5, exits: 1, occupancy: 4 },
  );
  assert.deepEqual(
    pickOccupancy(points[11]),
    { entries: 12, exits: 3, occupancy: 9 },
  );
  assert.deepEqual(
    pickOccupancy(points[23]),
    { entries: 12, exits: 3, occupancy: 9 },
  );
});

test("ocupação histórica fecha 23h e a parcial não projeta horas futuras", () => {
  const day = new Date(2026, 6, 22);
  const entries = emptyHours();
  const exits = emptyHours();
  entries[10] = 4;
  entries[11] = 3;
  entries[23] = 2;
  exits[11] = 1;

  const closed = occupancySeries.buildHourlyOccupancySeries({
    day,
    entriesByHour: entries,
    exitsByHour: exits,
    startHour: 10,
    through: nextDay(day),
  });
  const partial = occupancySeries.buildHourlyOccupancySeries({
    day,
    entriesByHour: entries,
    exitsByHour: exits,
    startHour: 10,
    through: new Date(2026, 6, 22, 11, 30),
  });

  assert.equal(closed[23].occupancy, 8);
  assert.equal(partial[11].occupancy, 6);
  assert.equal(partial[12].occupancy, null);
  assert.equal(partial[23].occupancy, null);
});

test("ocupação associa linhas dos cenários e aplica o início no bucket local", () => {
  const day = new Date(2026, 6, 22);
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const repeatedEntryScenario = scenario(
    "entry-copy",
    "Entrada consolidada",
    "line-entry",
    1,
  );
  const exitScenario = scenario("exit", "Saída", "line-exit", -1);
  const rows = [
    aggregateRow("2026-07-22T09:00:00", "line-entry", 100),
    aggregateRow("2026-07-22T09:00:00", "line-exit", 80),
    aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
    aggregateRow("2026-07-22T10:00:00", "line-exit", 2),
    aggregateRow("2026-07-22T11:00:00", "line-entry", 4),
    aggregateRow("2026-07-22T11:00:00", "line-exit", 1),
  ];

  const points = scenarioAnalytics.buildScenarioHourlyOccupancy({
    day,
    entryScenarios: [entryScenario, repeatedEntryScenario],
    exitScenarios: [exitScenario],
    rows,
    sourceGranularity: "hour",
    startHour: 10,
    through: nextDay(day),
  });

  assert.deepEqual(
    pickOccupancy(points[9]),
    { entries: 0, exits: 0, occupancy: 0 },
  );
  assert.deepEqual(
    pickOccupancy(points[10]),
    { entries: 5, exits: 2, occupancy: 3 },
  );
  assert.deepEqual(
    pickOccupancy(points[11]),
    { entries: 9, exits: 3, occupancy: 6 },
  );
});

test("ocupação detecta linhas compartilhadas entre entrada e saída", () => {
  const entryScenario = scenario("entry", "Entrada", "shared-line", 1);
  const exitScenario = scenario("exit", "Saída", "shared-line", -1);

  assert.deepEqual(
    scenarioAnalytics.sharedScenarioLineIds(
      [entryScenario],
      [exitScenario],
    ),
    ["shared-line"],
  );
});

test("composição de Contagem isola A, B, A+B e seleção vazia por widget", () => {
  const first = {
    ...scenario("scenario-a", "Entrada A", "line-a", 1),
    lines: [
      { action_multiplier: 1, line_count_id: "line-a" },
      { action_multiplier: 1, line_count_id: "shared-line" },
    ],
  };
  const second = {
    ...scenario("scenario-b", "Entrada B", "line-b", 1),
    lines: [
      { action_multiplier: 1, line_count_id: "line-b" },
      { action_multiplier: 1, line_count_id: "shared-line" },
    ],
  };
  const monthlyRows = [
    aggregateRow("2026-01-01", "line-a", 10),
    aggregateRow("2026-01-01", "line-b", 20),
    aggregateRow("2026-01-01", "shared-line", 5),
  ];
  const buildModel = (selectedScenarios) =>
    countingIntelligence.buildCountingIntelligenceModel({
      hourlyRows: [],
      includeOpenPeriod: false,
      monthlyRows,
      now: new Date(2026, 2, 1),
      period: { from: new Date(2026, 0, 1), to: new Date(2026, 1, 1) },
      scenarios: selectedScenarios,
      scope: {
        cameraIds: [],
        name: "Composição do widget",
        scenarios: selectedScenarios,
      },
    });
  const onlyA = buildModel([first]);
  const onlyB = buildModel([second]);
  const combined = buildModel([first, second]);

  assert.equal(onlyA.periodValue, 15);
  assert.equal(onlyB.periodValue, 25);
  assert.equal(combined.periodValue, onlyA.periodValue + onlyB.periodValue);
  assert.equal(buildModel([]).periodValue, 0);
  assert.equal(
    scenarioAnalytics.buildCombinedScenarioMultiplierMap([first, second]).get(
      "shared-line",
    ),
    2,
  );
});

test("granularidades minuto, semana e mês preservam o recorte configurado", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const minuteFrom = new Date(2026, 6, 22, 10, 0);
  const minuteTo = new Date(2026, 6, 22, 10, 2);
  const minutePoints = scenarioAnalytics.buildCombinedScenarioPoints({
    from: minuteFrom,
    granularity: "minute",
    rows: [
      aggregateRow(
        new Date(2026, 6, 22, 10, 0).toISOString(),
        "line-entry",
        2,
      ),
      aggregateRow(
        new Date(2026, 6, 22, 10, 1).toISOString(),
        "line-entry",
        3,
      ),
    ],
    scenarios: [entryScenario],
    sourceGranularity: "minute",
    to: minuteTo,
  });
  const weekPoints = scenarioAnalytics.buildCombinedScenarioPoints({
    from: new Date(2026, 6, 22),
    granularity: "week",
    rows: [
      aggregateRow("2026-07-22", "line-entry", 4),
      aggregateRow("2026-07-27", "line-entry", 5),
    ],
    scenarios: [entryScenario],
    sourceGranularity: "day",
    to: new Date(2026, 6, 29),
  });
  const monthPoints = scenarioAnalytics.buildCombinedScenarioPoints({
    from: new Date(2026, 0, 15),
    granularity: "month",
    rows: [
      aggregateRow("2026-01-14", "line-entry", 100),
      aggregateRow("2026-01-20", "line-entry", 6),
      aggregateRow("2026-02-10", "line-entry", 7),
    ],
    scenarios: [entryScenario],
    sourceGranularity: "day",
    to: new Date(2026, 2, 1),
  });

  assert.deepEqual(
    minutePoints.map((point) => point.total),
    [2, 3],
  );
  assert.deepEqual(
    weekPoints.map((point) => point.total),
    [4, 5],
  );
  assert.deepEqual(
    monthPoints.map((point) => point.total),
    [6, 7],
  );
});

test("heatmap de Contagem preserva toda linha selecionada nos dias 1 a 3", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const exitScenario = scenario("exit", "Saída", "line-exit", -1);
  const repeatedExitScenario = scenario(
    "repeated-exit",
    "Saída repetida",
    "line-exit",
    -1,
  );
  const mixedScenario = {
    active: true,
    company_id: "company",
    id: "mixed",
    lines: [
      { action_multiplier: 1, line_count_id: "line-mixed-entry" },
      { action_multiplier: -1, line_count_id: "line-mixed-exit" },
    ],
    name: "Misto",
  };
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 4);
  const points = scenarioAnalytics.buildScenarioCivilHourMagnitudePoints({
    companyTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    from,
    rows: [
      aggregateRow("2026-08-01T10:00:00", "line-exit", 7),
      aggregateRow("2026-08-02T11:00:00", "line-entry", 5),
      aggregateRow("2026-08-02T11:00:00", "line-exit", 5),
      aggregateRow("2026-08-03T08:00:00", "line-exit", 3),
      aggregateRow("2026-08-03T14:00:00", "line-entry", 2),
      aggregateRow("2026-08-03T16:00:00", "line-mixed-entry", 4),
      aggregateRow("2026-08-03T16:00:00", "line-mixed-exit", 4),
    ],
    scenarios: [
      entryScenario,
      exitScenario,
      repeatedExitScenario,
      mixedScenario,
    ],
    sourceGranularity: "hour",
    to,
  });
  const totals = new Map(
    points
      .filter((point) => point.total > 0)
      .map((point) => [`${point.day}-${point.hour}`, point.total]),
  );

  assert.equal(totals.get("1-10"), 7);
  assert.equal(totals.get("2-11"), 10);
  assert.equal(totals.get("3-8"), 3);
  assert.equal(totals.get("3-14"), 2);
  assert.equal(
    totals.get("3-16"),
    8,
    "direções opostas dentro do mesmo cenário representam fluxo, não cancelamento",
  );
});

test("heatmap de Contagem em Análises aplica contorno suave e paleta por tema", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-20",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const widgetColor = "#7C3AED";
  const data = analysisData({
    hourRows: [
      aggregateRow("2026-07-20T10:00:00", "line-entry", 4),
      aggregateRow("2026-07-21T11:00:00", "line-entry", 7),
    ],
  });
  const expectations = {
    dark: {
      activeBorder: "rgba(248, 250, 252, 0.24)",
      border: "rgba(226, 232, 240, 0.12)",
      shadow: "rgba(248, 250, 252, 0.12)",
    },
    light: {
      activeBorder: "rgba(15, 23, 42, 0.20)",
      border: "rgba(15, 23, 42, 0.09)",
      shadow: "rgba(15, 23, 42, 0.14)",
    },
  };

  for (const theme of ["light", "dark"]) {
    const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
      color: widgetColor,
      data,
      period,
      scenarios: [entryScenario],
      theme,
      widget: analysisWidget("heatmap", {
        granularity: "hour",
        scenarioIds: [entryScenario.id],
        selectionMode: "custom",
      }),
    });
    const series = Array.isArray(model.option?.series)
      ? model.option.series[0]
      : model.option?.series;

    assert.equal(model.hasData, true, `${theme}: deve materializar o heatmap`);
    assert.equal(series?.type, "heatmap");
    assert.equal(series?.itemStyle?.borderWidth, 1);
    assert.equal(series?.itemStyle?.borderColor, expectations[theme].border);
    assert.equal(series?.emphasis?.itemStyle?.borderWidth, 1);
    assert.equal(
      series?.emphasis?.itemStyle?.borderColor,
      expectations[theme].activeBorder,
    );
    assert.equal(series?.emphasis?.itemStyle?.shadowBlur, 4);
    assert.equal(
      series?.emphasis?.itemStyle?.shadowColor,
      expectations[theme].shadow,
    );
    assert.deepEqual(
      model.option?.visualMap?.inRange?.color,
      chartPalette.monochromeHeatmapPalette(widgetColor, theme),
      `${theme}: a escala deve usar a paleta adequada ao tema`,
    );
  }
});

test("runtime de Análises passa o tema ao heatmap e a exportação mantém light", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const runtimeStart = source.indexOf("function PeriodAnalysisCardRuntime");
  const runtimeEnd = source.indexOf("function PeriodAnalysisCard", runtimeStart + 1);
  const runtimeSection = source.slice(runtimeStart, runtimeEnd);
  const exportStart = source.indexOf("function buildPeriodAnalysisReportPayload");
  const exportEnd = source.indexOf("async function buildAiPeriodAnalysisPayload", exportStart);
  const exportSection = source.slice(exportStart, exportEnd);

  assert.notEqual(runtimeStart, -1);
  assert.notEqual(runtimeEnd, -1);
  assert.match(runtimeSection, /const \{ effectiveTheme \} = useTheme\(\)/);
  assert.match(
    runtimeSection,
    /buildPeriodAnalysisWidgetModel\(\{[\s\S]*?theme: effectiveTheme,/,
  );
  assert.notEqual(exportStart, -1);
  assert.notEqual(exportEnd, -1);
  assert.match(exportSection, /buildPeriodAnalysisWidgetModel\(\{/);
  assert.doesNotMatch(
    exportSection,
    /theme:\s*effectiveTheme/,
    "o PDF deve conservar o tema light padrão para impressão",
  );
});

test("heatmap de Contagem no Ao Vivo usa tema da tela e light na exportação", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const buildOperationalHeatmapOption = loadStandaloneFunction(
    "components/app/realtime-dashboard.tsx",
    "buildOperationalHeatmapOption",
    {
      DAY_OF_MONTH_AXIS_LABELS: chartCalendarAxis.DAY_OF_MONTH_AXIS_LABELS,
      HOUR_AXIS_LABELS: Array.from(
        { length: 24 },
        (_, hour) =>
          hour === 23 ? "23h–24h" : `${String(hour).padStart(2, "0")}h`,
      ),
      buildCalendarAxisLabel: chartCalendarAxis.buildCalendarAxisLabel,
      buildCalendarMarkAreaForMonth:
        chartCalendarAxis.buildCalendarMarkAreaForMonth,
      formatNumber: (value) => String(value),
      holidayCategoryIndexesForMonth:
        chartCalendarAxis.holidayCategoryIndexesForMonth,
      hourRangeLabel: (hour) => `${hour}h–${hour + 1}h`,
      monochromeHeatmapPalette: chartPalette.monochromeHeatmapPalette,
      saturdayCategoryIndexesForMonth:
        chartCalendarAxis.saturdayCategoryIndexesForMonth,
      sundayCategoryIndexesForMonth:
        chartCalendarAxis.sundayCategoryIndexesForMonth,
    },
  );
  const expectations = {
    dark: {
      activeBorder: "rgba(248, 250, 252, 0.24)",
      border: "rgba(226, 232, 240, 0.12)",
      shadow: "rgba(248, 250, 252, 0.12)",
    },
    light: {
      activeBorder: "rgba(15, 23, 42, 0.20)",
      border: "rgba(15, 23, 42, 0.09)",
      shadow: "rgba(15, 23, 42, 0.14)",
    },
  };
  const widgetColor = "#7C3AED";

  for (const theme of ["light", "dark"]) {
    const option = buildOperationalHeatmapOption(
      [{ day: 1, hour: 10, total: 7 }],
      new Date(2026, 6, 1),
      widgetColor,
      theme,
    );
    const series = option.series[0];

    assert.equal(series.type, "heatmap");
    assert.equal(series.itemStyle.borderWidth, 1);
    assert.equal(series.itemStyle.borderColor, expectations[theme].border);
    assert.equal(series.emphasis.itemStyle.borderWidth, 1);
    assert.equal(
      series.emphasis.itemStyle.borderColor,
      expectations[theme].activeBorder,
    );
    assert.equal(series.emphasis.itemStyle.shadowBlur, 4);
    assert.equal(
      series.emphasis.itemStyle.shadowColor,
      expectations[theme].shadow,
    );
    assert.deepEqual(
      option.visualMap.inRange.color,
      chartPalette.monochromeHeatmapPalette(widgetColor, theme),
    );
  }

  const cardStart = source.indexOf("function OperationalHeatmapCard");
  const cardEnd = source.indexOf("function HourlyOccupancyCard", cardStart);
  const cardSection = source.slice(cardStart, cardEnd);
  const reportStart = source.indexOf(
    "function buildOperationalHeatmapReportChart",
  );
  const reportEnd = source.indexOf(
    "function buildHourlyOccupancyReportChart",
    reportStart,
  );
  const reportSection = source.slice(reportStart, reportEnd);

  assert.notEqual(cardStart, -1);
  assert.notEqual(cardEnd, -1);
  assert.match(cardSection, /const \{ effectiveTheme \} = useTheme\(\)/);
  assert.match(
    cardSection,
    /buildOperationalHeatmapOption\([\s\S]*?widgetColor,[\s\S]*?effectiveTheme,[\s\S]*?\)/,
  );
  assert.notEqual(reportStart, -1);
  assert.notEqual(reportEnd, -1);
  assert.match(
    reportSection,
    /option:\s*buildOperationalHeatmapOption\(points, month, widgetColor\),/,
    "a exportação deve omitir o tema e conservar o padrão light",
  );
  assert.doesNotMatch(reportSection, /effectiveTheme/);
});

test("heatmaps de Ocupação usam contorno suave nas séries presente e ausente", () => {
  const buildHeatmapOption = loadStandaloneFunction(
    "components/app/occupancy-comparison-widgets.tsx",
    "buildHeatmapOption",
    {
      buildOccupancyHeatmapVisualMaps:
        occupancyHeatmapVisual.buildOccupancyHeatmapVisualMaps,
      escapeTooltip: (value) => String(value),
      formatChartNumber: (value) => String(value),
      getOccupancyChartPalette:
        occupancyChartPalette.getOccupancyChartPalette,
      metricLabel: () => "Ocupação",
      truncateLabel: (value) => String(value),
    },
  );
  const expectations = {
    dark: {
      activeBorder: "rgba(248, 250, 252, 0.24)",
      border: "rgba(226, 232, 240, 0.12)",
      shadow: "rgba(248, 250, 252, 0.12)",
    },
    light: {
      activeBorder: "rgba(15, 23, 42, 0.20)",
      border: "rgba(15, 23, 42, 0.09)",
      shadow: "rgba(15, 23, 42, 0.14)",
    },
  };
  const widgetColor = "#0F766E";

  for (const theme of ["light", "dark"]) {
    const option = buildHeatmapOption({
      cells: [
        { value: null, x: 0, y: 0 },
        { value: 37, x: 1, y: 0 },
      ],
      maximum: 37,
      metric: "current",
      theme,
      widgetColor,
      xLabels: ["Cenário A", "Cenário B"],
      yLabels: ["10h"],
    });

    assert.equal(option.series.length, 2);
    for (const series of option.series) {
      assert.equal(series.type, "heatmap");
      assert.equal(series.itemStyle.borderWidth, 1);
      assert.equal(series.itemStyle.borderColor, expectations[theme].border);
      assert.equal(series.emphasis.itemStyle.borderWidth, 1);
      assert.equal(
        series.emphasis.itemStyle.borderColor,
        expectations[theme].activeBorder,
      );
      assert.equal(series.emphasis.itemStyle.shadowBlur, 4);
      assert.equal(
        series.emphasis.itemStyle.shadowColor,
        expectations[theme].shadow,
      );
    }
    assert.deepEqual(
      option.visualMap[1].inRange.color,
      occupancyHeatmapVisual.occupancyHeatmapPalette(widgetColor, theme),
      `${theme}: a escala certificada deve acompanhar o tema`,
    );
  }
});

test("heatmap de Demographics usa tema da tela e light na exportação", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/demographics-dashboard.tsx"),
    "utf8",
  );
  const heatmapColors = [
    "#EFF6FF",
    "#BFDBFE",
    "#60A5FA",
    "#2563EB",
    "#172554",
  ];
  const buildAgeEmotionHeatmapOption = loadStandaloneFunction(
    "components/app/demographics-dashboard.tsx",
    "buildAgeEmotionHeatmapOption",
    {
      HEATMAP_COLORS: heatmapColors,
      heatmapPercentageLabel: () => "",
      heatmapTooltip: () => "",
    },
  );
  const summary = {
    crossings: {
      ageByEmotion: {
        columns: [{ key: "happy", label: "Feliz" }],
        rows: [
          {
            cells: [{ count: 3, percentage: 75 }],
            key: "20-29",
            label: "20–29",
          },
        ],
      },
    },
  };
  const expectations = {
    dark: {
      activeBorder: "rgba(248, 250, 252, 0.24)",
      border: "rgba(226, 232, 240, 0.12)",
      shadow: "rgba(248, 250, 252, 0.12)",
    },
    light: {
      activeBorder: "rgba(15, 23, 42, 0.20)",
      border: "rgba(15, 23, 42, 0.09)",
      shadow: "rgba(15, 23, 42, 0.14)",
    },
  };

  for (const theme of ["light", "dark"]) {
    const option = buildAgeEmotionHeatmapOption(summary, theme);
    const series = option.series[0];

    assert.equal(series.type, "heatmap");
    assert.equal(series.itemStyle.borderWidth, 1);
    assert.equal(series.itemStyle.borderColor, expectations[theme].border);
    assert.equal(series.emphasis.itemStyle.borderWidth, 1);
    assert.equal(
      series.emphasis.itemStyle.borderColor,
      expectations[theme].activeBorder,
    );
    assert.equal(series.emphasis.itemStyle.shadowBlur, 4);
    assert.equal(
      series.emphasis.itemStyle.shadowColor,
      expectations[theme].shadow,
    );
    assert.deepEqual(option.visualMap.inRange.color, heatmapColors);
  }
  assert.equal(
    buildAgeEmotionHeatmapOption(summary).series[0].itemStyle.borderColor,
    expectations.light.border,
    "sem tema explícito, o gráfico exportável deve permanecer light",
  );

  const cardStart = source.indexOf("function AgeEmotionHeatmapCard");
  const cardEnd = source.indexOf("function DemographicChartCard", cardStart);
  const cardSection = source.slice(cardStart, cardEnd);
  const reportStart = source.indexOf("function buildDemographicsReport({");
  const reportEnd = source.indexOf("function distributionReportTable", reportStart);
  const reportSection = source.slice(reportStart, reportEnd);

  assert.notEqual(cardStart, -1);
  assert.notEqual(cardEnd, -1);
  assert.match(cardSection, /const \{ effectiveTheme \} = useTheme\(\)/);
  assert.match(
    cardSection,
    /buildAgeEmotionHeatmapOption\(summary, effectiveTheme\)/,
  );
  assert.notEqual(reportStart, -1);
  assert.notEqual(reportEnd, -1);
  assert.match(
    reportSection,
    /option:\s*buildAgeEmotionHeatmapOption\(summary\),/,
    "a exportação deve omitir o tema e conservar o padrão light",
  );
  assert.doesNotMatch(reportSection, /buildAgeEmotionHeatmapOption\(summary,\s*effectiveTheme/);
});

test("heatmap consolida as duas ocorrências da hora repetida em uma célula", () => {
  const points = scenarioAnalytics.buildScenarioCivilHourMagnitudePoints({
    companyTimeZone: "America/New_York",
    from: new Date("2026-11-01T04:00:00Z"),
    rows: [
      aggregateRow("2026-11-01T05:00:00Z", "line-entry", 2),
      aggregateRow("2026-11-01T06:00:00Z", "line-entry", 3),
    ],
    scenarios: [scenario("entry", "Entrada", "line-entry", 1)],
    sourceGranularity: "hour",
    to: new Date("2026-11-02T05:00:00Z"),
  });
  const repeatedHour = points.filter(
    (point) => point.day === 1 && point.hour === 1,
  );

  assert.equal(repeatedHour.length, 1);
  assert.equal(repeatedHour[0].total, 5);
});

test("Ao Vivo consulta agosto desde o primeiro dia civil, sem janela móvel", () => {
  const from = new Date(2026, 7, 1);
  const throughPartOfDayThree = new Date(2026, 7, 3, 14, 30);
  const queries = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    { from, to: throughPartOfDayThree },
  ]);

  assert.equal(queries.length, 1);
  assert.deepEqual(localDateParts(queries[0].from), [2026, 8, 1]);
  assert.equal(queries[0].from.getHours(), 0);
  assert.deepEqual(localDateParts(queries[0].to), [2026, 9, 1]);

  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    liveSource,
    /buildScenarioCivilHourMagnitudePoints\(\{\s*companyTimeZone,\s*from: startOfMonth\(clock\)/,
  );
});

test("séries individuais em uma passagem equivalem ao cálculo por cenário", () => {
  const scenarios = [
    scenario("entry", "Entrada", "line-entry", 1),
    scenario("exit", "Saída", "line-exit", -1),
  ];
  const range = {
    from: new Date(2026, 0, 1),
    to: new Date(2026, 2, 1),
  };
  const rows = [
    aggregateRow("2026-01-10", "line-entry", 8),
    aggregateRow("2026-01-10", "line-exit", 3),
    aggregateRow("2026-02-10", "line-entry", 5),
    aggregateRow("2026-02-10", "line-exit", 2),
  ];
  const series = scenarioAnalytics.buildIndividualScenarioSeries({
    ...range,
    granularity: "month",
    rows,
    scenarios,
    sourceGranularity: "day",
  });

  scenarios.forEach((item, index) => {
    const legacy = scenarioAnalytics.buildCombinedScenarioPoints({
      ...range,
      granularity: "month",
      rows,
      scenarios: [item],
      sourceGranularity: "day",
    });
    assert.deepEqual(series[index].points, legacy);
  });
});

test("análise de um dia usa somente as horas da data escolhida", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const data = analysisData({
    dayRows: [
      aggregateRow("2026-07-21", "line-entry", 900),
      aggregateRow("2026-07-22", "line-entry", 999),
    ],
    hourRows: [
      aggregateRow("2026-07-22T09:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
      aggregateRow("2026-07-22T11:00:00", "line-entry", 4),
    ],
  });
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("summary", {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(model.metrics?.[0]?.value, 109);
  assert.equal(model.table?.rows[0]?.value, 109);
});

test("período anterior mantém limites em meia-noite ao atravessar DST", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const period = {
      from: new Date(2026, 2, 8),
      to: new Date(2026, 2, 9),
    };
    const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
      period,
      "previous_period",
    );

    assert.equal(period.to.getTime() - period.from.getTime(), 23 * 60 * 60_000);
    assert.equal(baseline.from.getFullYear(), 2026);
    assert.equal(baseline.from.getMonth(), 2);
    assert.equal(baseline.from.getDate(), 7);
    assert.equal(baseline.from.getHours(), 0);
    assert.equal(baseline.to.getDate(), 8);
    assert.equal(baseline.to.getHours(), 0);
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("período anterior parcial termina antes do período atual sem sobrepor", () => {
  const period = {
    from: new Date(2026, 6, 1),
    to: new Date(2026, 6, 27, 12, 35),
  };
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    period,
    "previous_period",
  );

  assert.equal(baseline.to.getTime(), period.from.getTime());
  assert.equal(
    baseline.to.getTime() - baseline.from.getTime(),
    period.to.getTime() - period.from.getTime(),
  );
  assert.equal(baseline.from.getTime(), new Date(2026, 5, 4, 11, 25).getTime());
});

test("comparativo inclui a primeira hora parcial já reconciliada", () => {
  const period = {
    from: new Date(2025, 6, 1),
    to: new Date(2025, 6, 27, 12, 35),
  };
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      baselineComparable: {
        previous_period: {
          granularity: "hour",
          partialBoundariesReconciled: true,
          rows: [
            aggregateRow("2025-06-04T11:00:00", "line-entry", 7),
          ],
        },
      },
      dayRows: [aggregateRow("2025-07-01", "line-entry", 14)],
    }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("cumulative_metric", {
      baseline: "previous_period",
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(model.table?.rows[0]?.baseline, 7);
});

test("mês anterior preserva o último dia com limite exclusivo", () => {
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2026, 2, 1),
      to: new Date(2026, 3, 1),
    },
    "previous_month",
  );

  assert.equal(baseline.from.getTime(), new Date(2026, 1, 1).getTime());
  assert.equal(baseline.to.getTime(), new Date(2026, 2, 1).getTime());
});

test("mês anterior aplica clamp sem avançar um corte parcial", () => {
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2026, 2, 1),
      to: new Date(2026, 2, 31, 15, 30),
    },
    "previous_month",
  );

  assert.equal(baseline.from.getTime(), new Date(2026, 1, 1).getTime());
  assert.equal(
    baseline.to.getTime(),
    new Date(2026, 1, 28, 15, 30).getTime(),
  );
});

test("ano anterior preserva a quantidade comparável no fevereiro bissexto", () => {
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2025, 1, 1),
      to: new Date(2025, 2, 1),
    },
    "last_year",
  );

  assert.equal(baseline.from.getTime(), new Date(2024, 1, 1).getTime());
  assert.equal(baseline.to.getTime(), new Date(2024, 1, 29).getTime());
});

test("Análises consulta e publica uma base comparável com bordas reconciliadas", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /const baselineComparableRanges = new Map/);
  assert.match(
    source,
    /requestedConsolidatedDayRanges[\s\S]*?baselineRange, comparableRange[\s\S]*?fetchAnalysisConsolidatedDayDatasets/,
  );
  assert.match(source, /splitAnalysisRangeAtDayBoundaries/);
  assert.match(source, /analysisPartialHourRanges\(range\)/);
  assert.match(source, /reconcileAnalysisHourlyBoundaries/);
  assert.match(source, /baselineComparable: Object\.fromEntries/);
});

test("total diário respeita 00h–24h locais com buckets RFC3339", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const data = analysisData({
    dayRows: [aggregateRow("2026-07-22", "line-entry", 9_999)],
    hourRows: [
      aggregateRow(
        new Date(2026, 6, 21, 23, 59).toISOString(),
        "line-entry",
        500,
      ),
      aggregateRow(
        new Date(2026, 6, 22, 0).toISOString(),
        "line-entry",
        7,
      ),
      aggregateRow(
        new Date(2026, 6, 22, 23, 59).toISOString(),
        "line-entry",
        5,
      ),
      aggregateRow(
        new Date(2026, 6, 23, 0).toISOString(),
        "line-entry",
        700,
      ),
    ],
  });

  for (const kind of ["day_total", "summary"]) {
    const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
      data,
      period,
      scenarios: [entryScenario],
      widget: analysisWidget(kind, {
        granularity: "hour",
        scenarioIds: [entryScenario.id],
        selectionMode: "custom",
      }),
    });

    assert.equal(
      model.metrics?.[0]?.value,
      12,
      `${kind} deve ignorar tanto o bucket anterior quanto o seguinte`,
    );
  }
});

test("Total do dia e Tendência 7 x 30 usam exatamente a mesma fonte horária", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const legacyDayRows = [
    aggregateRow("2026-07-22", "line-entry", 9_999),
  ];
  const canonicalHourRows = [
    aggregateRow("2026-07-22T09:00:00", "line-entry", 7),
    aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
  ];
  const reconciledDayRows = aggregateReconciliation.reconcileAggregateRows(
    legacyDayRows,
    "day",
    canonicalHourRows,
    "hour",
    period.from,
    period.to,
  );
  const data = analysisData({
    dayRows: reconciledDayRows,
    hourRows: canonicalHourRows,
  });
  const widgetScope = {
    scenarioIds: [entryScenario.id],
    selectionMode: "custom",
  };
  const dayTotal = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("day_total", widgetScope),
  });
  const trend = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("trend", widgetScope),
  });
  const selectedDay = trend.table?.rows.find(
    (row) => row.date === "22/07",
  );

  assert.ok(
    legacyDayRows[0].total > canonicalHourRows.reduce(
      (total, row) => total + row.total,
      0,
    ),
    "o agregado diário legado deve reproduzir a divergência antiga",
  );
  assert.equal(dayTotal.metrics?.[0]?.value, 12);
  assert.equal(selectedDay?.total, 12);
  assert.equal(selectedDay?.total, dayTotal.metrics?.[0]?.value);
});

test("a cor visual de toda linha acompanha o traço sem depender da posição na paleta", () => {
  const sourceOption = {
    color: ["#94A3B8", "#0F766E"],
    series: [
      {
        data: [10, 12],
        itemStyle: { color: "#94A3B8", opacity: 0.5 },
        name: "Volume",
        type: "bar",
      },
      {
        data: [9, 11],
        itemStyle: { color: "#94A3B8", opacity: 0.8 },
        lineStyle: { color: "#0F766E", type: "dashed", width: 2 },
        name: "Média",
        type: "line",
      },
    ],
  };
  const synchronized =
    chartSeriesColors.synchronizeLineSeriesVisualColors(sourceOption);

  assert.notStrictEqual(synchronized, sourceOption);
  assert.equal(sourceOption.series[1].itemStyle.color, "#94A3B8");
  assert.deepEqual(synchronized.series[1].itemStyle, {
    color: "#0F766E",
    opacity: 0.8,
  });
  assert.equal(
    synchronized.series[1].itemStyle.color,
    synchronized.series[1].lineStyle.color,
  );
  assert.strictEqual(
    chartSeriesColors.synchronizeLineSeriesVisualColors(synchronized),
    synchronized,
    "uma opção já coerente não deve gerar novos objetos a cada renderização",
  );
});

test("Tendência 7 x 30 mantém identidade, ordem e legenda idênticas no Ao Vivo e Análises", () => {
  const buildOperationalTrendOption = loadStandaloneFunction(
    "components/app/realtime-dashboard.tsx",
    "buildOperationalTrendOption",
    {
      DAY_OF_MONTH_AXIS_LABELS: chartCalendarAxis.DAY_OF_MONTH_AXIS_LABELS,
      OPERATIONAL_TREND_LEGEND_DATA:
        operationalTrendStyle.OPERATIONAL_TREND_LEGEND_DATA,
      OPERATIONAL_TREND_SERIES:
        operationalTrendStyle.OPERATIONAL_TREND_SERIES,
      buildCalendarAxisLabel: chartCalendarAxis.buildCalendarAxisLabel,
      buildCalendarMarkAreaForMonth:
        chartCalendarAxis.buildCalendarMarkAreaForMonth,
      formatNumber: (value) => String(value),
      holidayCategoryIndexesForMonth:
        chartCalendarAxis.holidayCategoryIndexesForMonth,
      saturdayCategoryIndexesForMonth:
        chartCalendarAxis.saturdayCategoryIndexesForMonth,
      sundayCategoryIndexesForMonth:
        chartCalendarAxis.sundayCategoryIndexesForMonth,
    },
  );
  const liveOption = buildOperationalTrendOption(
    Array.from({ length: 31 }, (_, index) => ({
      average30: 80 + index * 0.5,
      average7: 95 - index * 0.75,
      bucket: new Date(2026, 7, index + 1),
      total: 100 + index,
    })),
    new Date(2026, 7, 15),
    "#1267C4",
  );
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-08-01",
    "2026-08-31",
  );
  assert.ok(period);
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const analysisModel = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      dayRows: Array.from({ length: 31 }, (_, index) =>
        aggregateRow(
          `2026-08-${String(index + 1).padStart(2, "0")}`,
          "line-entry",
          100 + index,
        ),
      ),
    }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("trend", {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });
  assert.ok(analysisModel.option);

  const expectedNames = [
    ...operationalTrendStyle.OPERATIONAL_TREND_LEGEND_DATA,
  ];
  const average7 = operationalTrendStyle.OPERATIONAL_TREND_SERIES.average7;
  const average30 = operationalTrendStyle.OPERATIONAL_TREND_SERIES.average30;
  assert.notEqual(average7.color, average30.color);

  for (const [context, option] of [
    ["Ao Vivo", liveOption],
    ["Análises", analysisModel.option],
  ]) {
    assert.deepEqual(option.legend.data, expectedNames, `${context}: legenda`);
    assert.deepEqual(
      option.series.map((series) => series.name),
      expectedNames,
      `${context}: ordem das séries`,
    );
    assert.deepEqual(
      option.color,
      ["#1267C4", average7.color, average30.color],
      `${context}: ordem da paleta`,
    );

    const chart = echarts.init(null, null, {
      height: 360,
      renderer: "svg",
      ssr: true,
      width: 900,
    });
    try {
      chart.setOption(option);
      for (const trendSeries of [average7, average30]) {
        const rawSeries = option.series.find(
          (series) => series.name === trendSeries.name,
        );
        assert.ok(rawSeries, `${context}: ${trendSeries.name}`);
        assert.equal(rawSeries.itemStyle.color, trendSeries.color);
        assert.equal(rawSeries.lineStyle.color, trendSeries.color);

        const seriesModel = chart.getModel().getSeriesByName(trendSeries.name)[0];
        assert.ok(seriesModel, `${context}: modelo ${trendSeries.name}`);
        const visualColor = seriesModel.getData().getVisual("style")?.fill;
        const strokeColor = seriesModel.getModel("lineStyle").get("color");
        assert.equal(
          String(visualColor).toLowerCase(),
          String(strokeColor).toLowerCase(),
          `${context}: o índice de ${trendSeries.name} deve usar a cor da linha`,
        );
      }
    } finally {
      chart.dispose();
    }
  }
});

test("legendas de Ocupação apontam somente para séries visíveis e com cores canônicas", () => {
  const denseMarkerSize = () => 6;
  const palette = occupancyChartPalette.getOccupancyChartPalette("light");
  const definition = { granularity: "day", resolutionLabel: "Dia" };
  const points = [
    { average: 7, current: 8, label: "01/08", minimum: 3, peak: 12 },
    { average: 8, current: 9, label: "02/08", minimum: 4, peak: 14 },
  ];
  const previousPoints = [
    { average: 6, current: 7, label: "01/07", minimum: 2, peak: 10 },
    { average: 7, current: 8, label: "02/07", minimum: 3, peak: 11 },
  ];
  const visibility = { average: true, minimum: true, peak: true };
  const limits = { maximum: 15, minimum: 2 };
  const buildOccupancyChartOption = loadStandaloneFunction(
    "components/app/occupancy-scenario-dashboard.tsx",
    "buildOccupancyChartOption",
    { denseMarkerSize },
  );
  const buildOccupancyLineChartOption = loadStandaloneFunction(
    "components/app/occupancy-scenario-dashboard.tsx",
    "buildOccupancyLineChartOption",
  );
  const buildOccupancyReportChartOption = loadStandaloneFunction(
    "components/app/occupancy-reports-dashboard.tsx",
    "buildOccupancyReportChartOption",
    { denseMarkerSize },
  );
  const options = [
    buildOccupancyChartOption(
      definition,
      points,
      visibility,
      limits,
      palette,
      "bar",
    ),
    buildOccupancyLineChartOption(
      definition,
      points,
      visibility,
      limits,
      palette,
    ),
    buildOccupancyReportChartOption(
      definition,
      points,
      previousPoints,
      visibility,
      limits,
      palette,
    ),
  ];

  for (const option of options) {
    assert.equal(
      option.legend?.icon,
      undefined,
      "a legenda deve preservar o glifo real de linhas, barras e marcadores",
    );
    for (const series of option.series) {
      if (series.type !== "line" || !series.lineStyle?.color) continue;
      assert.equal(
        series.itemStyle?.color,
        series.lineStyle.color,
        `${series.name}: índice e linha devem compartilhar a mesma cor`,
      );
    }

    const legendNames = (option.legend?.data ?? []).map((item) =>
      typeof item === "string" ? item : item.name,
    );
    for (const name of legendNames) {
      const matchingSeries = option.series.filter(
        (series) => series.name === name,
      );
      assert.equal(
        matchingSeries.length,
        1,
        `${name}: a legenda deve apontar para uma única série`,
      );
      assert.notEqual(
        matchingSeries[0].itemStyle?.color,
        "transparent",
        `${name}: a legenda não pode apontar para uma série técnica invisível`,
      );
    }
  }
});

test("o bucket do dia 22 é invariável ao avançar a âncora para o dia 23", () => {
  const period22 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  const period23 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-23",
    "2026-07-23",
  );
  assert.ok(period22);
  assert.ok(period23);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const dayRows = Array.from({ length: 23 }, (_, index) =>
    aggregateRow(
      `2026-07-${String(index + 1).padStart(2, "0")}`,
      "line-entry",
      index + 1,
    ),
  );
  const data = analysisData({ dayRows });
  const widget = analysisWidget("trend", {
    scenarioIds: [entryScenario.id],
    selectionMode: "custom",
  });
  const anchor22 = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period: period22,
    scenarios: [entryScenario],
    widget,
  });
  const anchor23 = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period: period23,
    scenarios: [entryScenario],
    widget,
  });
  const row22 = anchor22.table?.rows.find((row) => row.date === "22/07");
  const sameRowWithNextAnchor = anchor23.table?.rows.find(
    (row) => row.date === "22/07",
  );

  assert.ok(row22);
  assert.deepEqual(sameRowWithNextAnchor, row22);
});

test("janeiro mantém o mesmo valor ao fechar e avançar para fevereiro", () => {
  const january31 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-01-31",
    "2026-01-31",
  );
  const february1 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-02-01",
    "2026-02-01",
  );
  assert.ok(january31);
  assert.ok(february1);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const data = analysisData({
    dayRows: [
      aggregateRow("2026-01-01", "line-entry", 310),
      aggregateRow("2026-02-01", "line-entry", 10),
    ],
    monthRows: [
      aggregateRow("2026-01-01", "line-entry", 310),
      aggregateRow("2026-02-01", "line-entry", 10),
    ],
  });

  for (const kind of ["year_monthly", "year_accumulated"]) {
    const widget = analysisWidget(kind, {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    });
    const atJanuaryClose =
      periodAnalysisModel.buildPeriodAnalysisWidgetModel({
        data,
        period: january31,
        scenarios: [entryScenario],
        widget,
      });
    const afterFebruaryStarts =
      periodAnalysisModel.buildPeriodAnalysisWidgetModel({
        data,
        period: february1,
        scenarios: [entryScenario],
        widget,
      });
    const closedJanuary = atJanuaryClose.table?.rows.find(
      (row) => row.month === "Jan",
    );
    const sameJanuary = afterFebruaryStarts.table?.rows.find(
      (row) => row.month === "Jan",
    );

    assert.ok(closedJanuary);
    assert.deepEqual(sameJanuary, closedJanuary, kind);
  }
});

test("mês parcial anual ignora horas posteriores à data consultada", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-01-22",
    "2026-01-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const monthRows = aggregateReconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-01-22T10:00:00", "line-entry", 5),
      aggregateRow("2026-01-23T00:00:00", "line-entry", 900),
    ],
    "hour",
    "month",
    new Date(2026, 0, 1),
    new Date(2026, 0, 23),
  );
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      dayRows: [aggregateRow("2026-01-22", "line-entry", 5)],
      monthRows,
    }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("year_monthly", {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(
    model.table?.rows.find((row) => row.month === "Jan")?.value,
    5,
  );
});

test("mês aberto compara somente horas fechadas equivalentes do ano anterior", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T15:00:00", "line-entry", 110),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T15:00:00", "line-entry", 20),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 310),
      aggregateRow("2026-07-01", "line-entry", 220),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const july = model.yearOverYearMonths.find((row) => row.month === 6);
  const comparison =
    countingIntelligence.buildCountingMonthlyComparison(model);
  const accumulatedOption =
    countingIntelligence.buildAnnualAccumulatedComparisonChartOption(model);
  const accumulatedVariationSeries = accumulatedOption.series.find(
    (series) => series.name === "Variação acumulada 2026/2025",
  );
  const reportAssets =
    countingIntelligence.buildCountingIntelligenceReportAssets(model);
  const accumulatedReport = reportAssets.charts.find(
    ({ cardId }) =>
      cardId ===
      countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS
        .annualAccumulatedComparison,
  );

  assert.equal(model.currentMonthValue, 220);
  assert.equal(model.currentMonthDelta, 0);
  assert.equal(model.periodDelta, 0);
  assert.deepEqual(
    {
      current: july?.current,
      delta: july?.delta,
      previous: july?.previous,
    },
    { current: 200, delta: 0, previous: 200 },
  );
  assert.equal(comparison.variation.accumulated, 0);
  assert.ok(accumulatedVariationSeries);
  assert.equal(accumulatedVariationSeries.data[6].delta, 0);
  assert.equal(
    accumulatedReport?.value.table.rows.find(({ month }) => month === "Jul")
      ?.variation,
    countingIntelligence.formatDelta(0),
  );
});

test("comparativo acumulado soma apenas meses cobertos nos dois anos", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2025-02-01", "line-entry", 50),
      aggregateRow("2026-01-01", "line-entry", 100),
      aggregateRow("2026-02-01", "line-entry", 100),
    ],
    now: new Date(2026, 2, 1),
    period: {
      from: new Date(2025, 0, 1),
      to: new Date(2026, 2, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  model.yearOverYearMonths = model.yearOverYearMonths.map((row) =>
    row.month === 0
      ? { ...row, delta: null, previous: null }
      : row,
  );
  const accumulatedOption =
    countingIntelligence.buildAnnualAccumulatedComparisonChartOption(model);
  const variationSeries = accumulatedOption.series.find(
    (series) => series.name === "Variação acumulada 2026/2025",
  );
  const accumulatedReport =
    countingIntelligence
      .buildCountingIntelligenceReportAssets(model)
      .charts.find(
        ({ cardId }) =>
          cardId ===
          countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS
            .annualAccumulatedComparison,
      );

  assert.ok(variationSeries);
  assert.equal(variationSeries.data[0], null);
  assert.equal(variationSeries.data[1].delta, 1);
  assert.equal(
    accumulatedReport?.value.table.rows.find(({ month }) => month === "Fev")
      ?.variation,
    countingIntelligence.formatDelta(1),
  );
});

test("base parcial sobreposta ganha série própria no comparativo anual", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T15:00:00", "line-entry", 110),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T15:00:00", "line-entry", 20),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 310),
      aggregateRow("2026-07-01", "line-entry", 220),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2025, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const comparison =
    countingIntelligence.buildCountingMonthlyComparison(model);
  const selected2025 = comparison.rows.find(
    (row) => row.year === 2025 && !row.baselineOnly,
  );
  const comparable2025 = comparison.rows.find(
    (row) => row.year === 2025 && row.baselineOnly,
  );

  assert.equal(selected2025?.months[6], 310);
  assert.equal(comparable2025?.months[6], 200);
});

test("mês aberto sem eventos aparece como zero comparável", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 100),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const july = model.yearOverYearMonths.find((row) => row.month === 6);
  const currentYear = model.yearRows.find((row) => row.year === 2026);

  assert.equal(model.currentMonthValue, 0);
  assert.equal(model.currentMonthDelta, -1);
  assert.deepEqual(
    {
      current: july?.current,
      delta: july?.delta,
      previous: july?.previous,
    },
    { current: 0, delta: -1, previous: 100 },
  );
  assert.equal(currentYear?.months[6], 0);
});

test("mês fechado sem eventos entra como zero na média certificada", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2025-01-01", "line-entry", 50),
      aggregateRow("2025-02-01", "line-entry", 50),
      aggregateRow("2026-01-01", "line-entry", 100),
    ],
    now: new Date(2026, 2, 1),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 2, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const currentYear = model.yearRows.find((row) => row.year === 2026);
  const february = model.yearOverYearMonths.find((row) => row.month === 1);

  assert.deepEqual(currentYear?.months.slice(0, 2), [100, 0]);
  assert.equal(currentYear?.selectedMonthCount, 2);
  assert.equal(model.periodMonthCount, 2);
  assert.equal(model.periodAverage, 50);
  assert.deepEqual(
    {
      current: february?.current,
      delta: february?.delta,
      previous: february?.previous,
    },
    { current: 0, delta: -1, previous: 50 },
  );
});

test("comparativo anual não injeta meses fora do período selecionado", () => {
  const selected2025Months = [
    null,
    null,
    null,
    null,
    null,
    null,
    7,
    8,
    9,
    10,
    11,
    12,
  ];
  const comparison = countingIntelligence.buildCountingMonthlyComparison({
    currentYear: 2026,
    yearOverYearMonths: Array.from({ length: 12 }, (_, month) => ({
      current: month < 6 ? month + 11 : null,
      delta: null,
      label: "",
      month,
      previous: month < 6 ? month + 1 : null,
    })),
    yearRows: [
      {
        average: 9.5,
        months: selected2025Months,
        monthYoy: Array(12).fill(null),
        selectedMonthCount: 6,
        total: 57,
        year: 2025,
        ytd: 57,
        ytdYoy: null,
      },
      {
        average: 13.5,
        months: [11, 12, 13, 14, 15, 16, ...Array(6).fill(null)],
        monthYoy: Array(12).fill(null),
        selectedMonthCount: 6,
        total: 81,
        year: 2026,
        ytd: 81,
        ytdYoy: null,
      },
    ],
  });
  const selected2025 = comparison.rows.find(
    (row) => row.year === 2025 && !row.baselineOnly,
  );
  const baseline2025 = comparison.rows.find(
    (row) => row.year === 2025 && row.baselineOnly,
  );

  assert.ok(selected2025);
  assert.ok(baseline2025);
  assert.equal(selected2025.baselineOnly, false);
  assert.deepEqual(selected2025.months, selected2025Months);
  assert.equal(selected2025.accumulated, 57);
  assert.deepEqual(
    baseline2025.months.slice(0, 6),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    comparison.comparisonMonths.slice(0, 6),
    [1, 2, 3, 4, 5, 6],
  );

  const monthlyOption =
    countingIntelligence.buildAnnualComparisonChartOption({
      currentYear: 2026,
      yearOverYearMonths: Array.from({ length: 12 }, (_, month) => ({
        current: month < 6 ? month + 11 : null,
        delta: month < 6 ? 1 : null,
        label: "",
        month,
        previous: month < 6 ? month + 1 : null,
      })),
      yearRows: [
        {
          average: 9.5,
          months: selected2025Months,
          monthYoy: Array(12).fill(null),
          selectedMonthCount: 6,
          total: 57,
          year: 2025,
          ytd: 57,
          ytdYoy: null,
        },
        {
          average: 13.5,
          months: [11, 12, 13, 14, 15, 16, ...Array(6).fill(null)],
          monthYoy: Array(12).fill(null),
          selectedMonthCount: 6,
          total: 81,
          year: 2026,
          ytd: 81,
          ytdYoy: null,
        },
      ],
    });
  const variationSeries = monthlyOption.series.find(
    (series) => series.name === "Variação 2026/2025",
  );
  const baselineSeries = monthlyOption.series.find(
    (series) => series.name === "2025 (base comparável)",
  );

  assert.ok(variationSeries);
  assert.ok(baselineSeries);
  assert.equal(baselineSeries.data[0], 1);
  assert.equal(variationSeries.data[0].value, 11);
});

test("detalhes horários do relatório ignoram baseline e horas após o corte", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2026-06-30T08:00:00", "line-entry", 100),
      aggregateRow("2026-07-15T09:00:00", "line-entry", 3),
      aggregateRow("2026-08-01T10:00:00", "line-entry", 200),
    ],
    monthlyRows: [
      aggregateRow("2026-07-01", "line-entry", 3),
    ],
    now: new Date(2026, 8, 1),
    period: {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });

  assert.equal(
    model.directionalHours.reduce((sum, row) => sum + row.total, 0),
    3,
  );
  assert.equal(
    model.accessHours.reduce((sum, row) => sum + row.total, 0),
    3,
  );
  assert.equal(model.directionalHours[9].total, 3);
  assert.equal(model.directionalHours[8].total, 0);
  assert.equal(model.directionalHours[10].total, 0);
});

test("variação anual compara somente meses com cobertura nos dois anos", () => {
  const comparison = countingIntelligence.buildCountingMonthlyComparison({
    currentYear: 2026,
    yearOverYearMonths: [
      {
        current: 100,
        delta: 1,
        label: "Jan",
        month: 0,
        previous: 50,
      },
      {
        current: 100,
        delta: null,
        label: "Fev",
        month: 1,
        previous: null,
      },
    ],
    yearRows: [],
  });

  assert.equal(comparison.variation.accumulated, 1);
  assert.equal(comparison.variation.average, 1);
});

test("totais por local usam as câmeras do escopo sem deslocar o dia", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const withCamera = (bucket, lineId, total, cameraId) => ({
    ...aggregateRow(bucket, lineId, total),
    camera_id: cameraId,
  });
  const data = analysisData({
    hourRows: [
      withCamera("2026-07-21T23:00:00", "line-a", 100, "camera-a"),
      withCamera("2026-07-22T10:00:00", "line-a", 7, "camera-a"),
      withCamera("2026-07-22T10:00:00", "line-b", 4, "camera-b"),
      withCamera("2026-07-23T00:00:00", "line-a", 900, "camera-a"),
    ],
  });
  const scopeOptions = [
    {
      cameraIds: ["camera-a"],
      description: "Portão A",
      id: "location-a",
      mode: "location",
      name: "Portão A",
    },
    {
      cameraIds: ["camera-b"],
      description: "Portão B",
      id: "location-b",
      mode: "location",
      name: "Portão B",
    },
  ];
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [],
    scopeOptions,
    widget: analysisWidget("scope_totals", {
      granularity: "hour",
      scopeMode: "location",
    }),
  });
  const rows = model.table?.rows ?? [];

  assert.equal(rows.find((row) => row.scope === "Portão A")?.total, 7);
  assert.equal(rows.find((row) => row.scope === "Portão B")?.total, 4);
  assert.equal(
    model.insights?.find((item) => item.label === "Total combinado")?.value,
    "11",
  );
});

test("widgets mensais ficam ancorados na data escolhida sem incluir o dia seguinte", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const selectedRows = [
    aggregateRow(
      new Date(2026, 6, 21, 23, 59).toISOString(),
      "line-entry",
      700,
    ),
    aggregateRow(
      new Date(2026, 6, 22, 10).toISOString(),
      "line-entry",
      5,
    ),
    aggregateRow(
      new Date(2026, 6, 22, 18).toISOString(),
      "line-entry",
      4,
    ),
    aggregateRow(
      new Date(2026, 6, 23, 0).toISOString(),
      "line-entry",
      900,
    ),
  ];
  const data = analysisData({
    dayRows: [
      aggregateRow("2026-07-21", "line-entry", 800),
      aggregateRow("2026-07-22", "line-entry", 9),
      aggregateRow("2026-07-23", "line-entry", 1_100),
    ],
    hourRows: selectedRows,
  });

  for (const kind of ["ranking", "rose"]) {
    const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
      data,
      period,
      scenarios: [entryScenario],
      widget: analysisWidget(kind, {
        scenarioIds: [entryScenario.id],
        selectionMode: "custom",
      }),
    });

    assert.equal(
      model.table?.rows.find((row) => row.scenario === entryScenario.name)
        ?.total,
      809,
      `${kind} deve usar o mês até 22/07, sem incluir 23/07`,
    );
  }

  const table = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("totals_table", {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });
  const scenarioRow = table.table?.rows.find(
    (row) => row.scenario === entryScenario.name,
  );

  assert.equal(scenarioRow?.selected, 9);
  assert.equal(scenarioRow?.month, 809);
});

test("acumulado por cenário replica o recorte exato do Ao Vivo", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const exitScenario = scenario("exit", "Saída", "line-exit", -1);
  const data = analysisData({
    dayRows: [
      aggregateRow("2026-07-22", "line-entry", 900),
      aggregateRow("2026-07-22", "line-exit", 800),
    ],
    hourRows: [
      aggregateRow("2026-07-21T23:00:00", "line-entry", 500),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 7),
      aggregateRow("2026-07-22T10:00:00", "line-exit", 4),
      aggregateRow("2026-07-23T00:00:00", "line-entry", 600),
    ],
  });
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario, exitScenario],
    widget: analysisWidget("scenario_cumulative", {
      scenarioIds: [entryScenario.id, exitScenario.id],
      selectionMode: "custom",
    }),
  });
  const rows = model.table?.rows ?? [];

  assert.equal(rows.find((row) => row.scenario === "Entrada")?.total, 7);
  assert.equal(rows.find((row) => row.scenario === "Saída")?.total, 4);
  assert.equal(model.insights?.find((item) => item.label === "Total")?.value, "11");
  assert.equal(model.hasData, true);
});

test("visão antiga de acumulado é migrada sem perder a configuração", () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  const storageKey =
    "ipxdata.period-analysis-widgets.v1.company.company.user.user";
  storage.setItem(
    storageKey,
    JSON.stringify([
      analysisWidget("totals_table", {
        id: "legacy-live-cumulative",
        scenarioIds: ["entry"],
        selectionMode: "custom",
        title: "Acumulado por cenário",
      }),
    ]),
  );

  try {
    const widgets = periodAnalysisWidgets.loadPeriodAnalysisWidgets(
      "company",
      "user",
    );
    const migrated = widgets.find(
      (widget) => widget.id === "legacy-live-cumulative",
    );

    assert.equal(migrated?.kind, "scenario_cumulative");
    assert.deepEqual(migrated?.scenarioIds, ["entry"]);
    assert.equal(migrated?.scopeMode, "scenario");
    assert.ok(
      widgets.some((widget) => widget.kind === "hourly_occupancy"),
      "a migração deve preservar os widgets obrigatórios",
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("catálogo de Análises contém todos os modelos visuais do Ao Vivo", () => {
  const kinds = new Set(
    periodAnalysisWidgets
      .createDefaultPeriodAnalysisWidgets()
      .map((widget) => widget.kind),
  );
  const liveEquivalentKinds = [
    "comparison",
    "cumulative",
    "cumulative_metric",
    "daily_comparison",
    "day_total",
    "heatmap",
    "hourly_occupancy",
    "peak_days",
    "ranking",
    "rose",
    "scenario_cumulative",
    "scope_totals",
    "target_progress",
    "timeline",
    "totals_table",
    "trend",
    "year_accumulated",
    "year_monthly",
  ];

  liveEquivalentKinds.forEach((kind) => {
    assert.equal(kinds.has(kind), true, `modelo ausente: ${kind}`);
  });
});

test("todos os modelos padrão são construídos mesmo sem eventos", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);
  const scenarios = [
    scenario("entry", "Entrada", "line-entry", 1),
    scenario("exit", "Saída", "line-exit", -1),
  ];

  periodAnalysisWidgets
    .createDefaultPeriodAnalysisWidgets()
    .forEach((widget) => {
      const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
        data: analysisData(),
        period,
        scenarios,
        widget,
      });
      assert.equal(typeof model.description, "string", widget.kind);
      assert.equal(typeof model.hasData, "boolean", widget.kind);
    });
});

test("todo widget fixo do Ao Vivo possui conversão para Análises", () => {
  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const preferenceSource = readFileSync(
    resolve(projectRoot, "lib/view-preferences.ts"),
    "utf8",
  );
  const importSource = readFileSync(
    resolve(projectRoot, "lib/live-analysis-import.ts"),
    "utf8",
  );
  const fixedLiveIds = new Set(
    Array.from(
      liveSource.matchAll(/id:\s*"(live_[a-z0-9_]+)"/g),
      (match) => match[1],
    ),
  );
  const mappedIds = new Set(
    Array.from(
      importSource.matchAll(/case\s+"(live_[a-z0-9_]+)"/g),
      (match) => match[1],
    ),
  );
  const unmapped = Array.from(fixedLiveIds)
    .filter((id) => !mappedIds.has(id))
    .sort();

  assert.deepEqual(unmapped, []);
  assert.ok(fixedLiveIds.size >= 24);
  assert.match(
    liveSource,
    /LIVE_DAY_MINUTES_ID = "live_chart_minute_day"/,
  );
  assert.match(
    liveSource,
    /fetchMinuteDayAggregateBootstrap\([\s\S]*?refreshMinuteDayAggregateCache/,
  );
  assert.match(liveSource, /dataZoom: \[\][\s\S]*?sampling: "lttb"/);
  assert.match(preferenceSource, /card\("live_chart_minute_day"/);
  assert.match(importSource, /case "live_chart_minute_day"/);
});

test("ocupação histórica do modelo respeita o início configurado até 23h", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const exitScenario = scenario("exit", "Saída", "line-exit", -1);
  const data = analysisData({
    hourRows: [
      aggregateRow("2026-07-22T09:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T09:00:00", "line-exit", 80),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
      aggregateRow("2026-07-22T10:00:00", "line-exit", 2),
      aggregateRow("2026-07-22T23:00:00", "line-entry", 4),
      aggregateRow("2026-07-22T23:00:00", "line-exit", 1),
    ],
  });
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario, exitScenario],
    widget: analysisWidget("hourly_occupancy", {
      entryScenarioIds: [entryScenario.id],
      exitScenarioIds: [exitScenario.id],
      selectionMode: "custom",
      startHour: 10,
    }),
  });
  const rows = model.table?.rows ?? [];

  assert.equal(rows.length, 24);
  assert.deepEqual(rows[9], {
    entries: 0,
    exits: 0,
    occupancy: 0,
    period: "09h",
  });
  assert.deepEqual(rows[10], {
    entries: 5,
    exits: 2,
    occupancy: 3,
    period: "10h",
  });
  assert.deepEqual(rows[23], {
    entries: 9,
    exits: 3,
    occupancy: 6,
    period: "23h",
  });
});

test("contagem bloqueia fuso divergente com mensagem compacta", () => {
  const runtimeTimeZone = companyTimeZone.canonicalCompanyTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  assert.ok(runtimeTimeZone);
  assert.equal(
    countingTimeZone.requireCountingRuntimeTimeZone(runtimeTimeZone),
    runtimeTimeZone,
  );

  const differentTimeZone = ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]
    .map((candidate) => companyTimeZone.canonicalCompanyTimeZone(candidate))
    .find((candidate) => candidate && candidate !== runtimeTimeZone);
  assert.ok(differentTimeZone);
  assert.throws(
    () => countingTimeZone.requireCountingRuntimeTimeZone(differentTimeZone),
    (error) =>
      error instanceof Error &&
      error.message ===
        "O horário deste Worker não corresponde ao da empresa. Atualize a configuração de data e hora.",
  );
});

test("dashboard bloqueia timezone padrão quando a empresa não o certificou", () => {
  const runtimeTimeZone = companyTimeZone.canonicalCompanyTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  assert.ok(runtimeTimeZone);
  assert.equal(
    companyTimeZone.requireCertifiedCompanyTimeZone({
      fallback: false,
      source: "selected-company",
      timeZone: runtimeTimeZone,
    }),
    runtimeTimeZone,
  );
  assert.throws(
    () =>
      companyTimeZone.requireCertifiedCompanyTimeZone({
        fallback: true,
        source: "fallback",
        timeZone: runtimeTimeZone,
      }),
    /Fuso horário da empresa indisponível/,
  );
});

test("Ao Vivo, Análises, Relatórios e comparativos certificam o fuso antes da consulta", () => {
  const sources = {
    analysis: readFileSync(
      resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
      "utf8",
    ),
    comparison: readFileSync(
      resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
      "utf8",
    ),
    live: readFileSync(
      resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
      "utf8",
    ),
    reports: readFileSync(
      resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
      "utf8",
    ),
  };

  for (const surface of ["analysis", "live", "reports"]) {
    assert.match(
      sources[surface],
      /useEffectiveCompanyTimeZoneResolution\(user\)/,
      `${surface} deve resolver o fuso da empresa selecionada`,
    );
    assert.match(
      sources[surface],
      /Não foi possível carregar (?:a análise|os dados|o relatório): \{[a-zA-Z]+CertificationError\}/,
      `${surface} deve exibir uma mensagem compacta em linguagem de negócio`,
    );
  }

  assert.match(
    sources.live,
    /companyTimeZoneResolution\.fallback/,
    "Ao Vivo deve recusar fallback de timezone antes da consulta",
  );
  for (const surface of ["analysis", "reports"]) {
    assert.match(
      sources[surface],
      /requireCertifiedCountingRuntimeTimeZone\(companyTimeZoneResolution\)/,
      `${surface} deve exigir timezone certificado e compatível`,
    );
  }

  assert.ok(
    sources.reports.match(
      /requireCertifiedCountingRuntimeTimeZone\(companyTimeZoneResolution\)/g,
    )?.length >= 1,
    "relatórios devem certificar a carga explícita antes de consultar",
  );
  assert.match(
    sources.comparison,
    /requireCountingRuntimeTimeZone\(companyTimeZone\);/,
    "comparativos e suas exportações devem certificar o fuso",
  );
});

test("plano horário mantém o mesmo snapshot mensal ao avançar do dia 22 para o 23", () => {
  const through22 = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    { from: new Date(2026, 5, 2), to: new Date(2026, 6, 23) },
  ]);
  const through23 = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    { from: new Date(2026, 5, 2), to: new Date(2026, 6, 24) },
  ]);

  assert.deepEqual(
    through22.map(({ key, from, to }) => [key, from.getTime(), to.getTime()]),
    through23.map(({ key, from, to }) => [key, from.getTime(), to.getTime()]),
  );
});

test("plano horário preserva lacunas e limite superior mensal exclusivo", () => {
  const queries = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    { from: new Date(2025, 6, 22), to: new Date(2025, 7, 1) },
    { from: new Date(2026, 0, 1), to: new Date(2026, 1, 1) },
  ]);

  assert.deepEqual(
    queries.map((query) => query.key),
    ["2025-07", "2026-01"],
  );
  assert.equal(queries[0].to.getMonth(), 7);
  assert.equal(queries[1].to.getMonth(), 1);
});

test("Análises escolhe consolidação e janela horária por dias civis", () => {
  const detailed = countingAnalysisRangePlan.buildCountingAnalysisRangePlan({
    from: new Date(2026, 0, 1),
    to: new Date(2026, 1, 1),
  });
  const consolidated =
    countingAnalysisRangePlan.buildCountingAnalysisRangePlan({
      from: new Date(2026, 0, 1),
      to: new Date(2026, 1, 2),
    });
  const detail = countingAnalysisRangePlan.countingAnalysisHourlyDetailRange({
    from: new Date(2025, 0, 1),
    to: new Date(2026, 0, 1),
  });

  assert.equal(detailed.hourlyDetail, true);
  assert.equal(consolidated.hourlyDetail, false);
  assert.equal(detail.limited, true);
  assert.deepEqual(localDateParts(detail.from), [2025, 12, 1]);
  assert.deepEqual(localDateParts(detail.to), [2026, 1, 1]);
});

test("granularidade visual promove pontos sem alterar o intervalo integral", () => {
  const oneDay = { from: new Date(2026, 6, 22), to: new Date(2026, 6, 23) };
  const oneYear = { from: new Date(2025, 0, 1), to: new Date(2026, 0, 1) };
  const threeYears = {
    from: new Date(2023, 0, 1),
    to: new Date(2026, 0, 1),
  };

  assert.equal(
    countingAnalysisRangePlan.resolveCountingAnalysisVisualGranularity(
      "minute",
      oneDay,
    ),
    "minute",
  );
  assert.equal(
    countingAnalysisRangePlan.resolveCountingAnalysisVisualGranularity(
      "hour",
      { from: new Date(2026, 6, 1), to: new Date(2026, 6, 4) },
    ),
    "day",
  );
  assert.equal(
    countingAnalysisRangePlan.resolveCountingAnalysisVisualGranularity(
      "day",
      oneYear,
    ),
    "week",
  );
  assert.equal(
    countingAnalysisRangePlan.resolveCountingAnalysisVisualGranularity(
      "day",
      threeYears,
    ),
    "month",
  );
  assert.equal(
    countingAnalysisRangePlan.resolveCountingAnalysisVisualGranularity(
      "day",
      oneYear,
      100,
    ),
    "month",
    "o orçamento deve considerar buckets multiplicados pelas séries",
  );
});

test("perfil e saldo horários materializam somente a janela detalhada", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-01-01",
    "2026-04-30",
  );
  assert.ok(period);
  const entry = scenario("entry", "Entrada", "line-entry", 1);
  const exit = scenario("exit", "Saída", "line-exit", -1);
  const data = analysisData({
    hourRows: [
      aggregateRow("2026-01-10T10:00:00", "line-entry", 100),
      aggregateRow("2026-01-10T10:00:00", "line-exit", 80),
      aggregateRow("2026-04-10T10:00:00", "line-entry", 10),
      aggregateRow("2026-04-10T10:00:00", "line-exit", 3),
    ],
  });
  const profile = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entry, exit],
    widget: analysisWidget("hour_profile", {
      scenarioIds: [entry.id],
      selectionMode: "custom",
    }),
  });
  const balance = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entry, exit],
    widget: analysisWidget("hourly_occupancy", {
      entryScenarioIds: [entry.id],
      exitScenarioIds: [exit.id],
      selectionMode: "custom",
      startHour: 0,
    }),
  });

  assert.match(profile.description, /últimos 31 dias/);
  assert.equal(
    profile.table?.rows.find((row) => row.hour === "10h")?.total,
    10,
    "o perfil não pode incluir uma linha horária anterior ao detalhe",
  );
  assert.match(balance.description, /últimos 31 dias/);
  assert.ok((balance.table?.rows.length ?? 0) <= 31 * 24);
  assert.equal(
    balance.table?.rows.some((row) => String(row.period).includes("10/01")),
    false,
  );
});

test("comparação extrema agrupa séries excedentes em Outros sem perder total", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2006-01-01",
    "2025-12-31",
  );
  assert.ok(period);
  const scenarios = Array.from({ length: 100 }, (_, index) =>
    scenario(
      `scenario-${index}`,
      `Cenário ${index}`,
      `line-${index}`,
      1,
    ),
  );
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      dayRows: scenarios.map((item, index) =>
        aggregateRow("2025-12-01", `line-${index}`, 1),
      ),
    }),
    period,
    scenarios,
    widget: analysisWidget("comparison", {
      granularity: "day",
      selectionMode: "all",
    }),
  });
  const series = Array.isArray(model.option?.series)
    ? model.option.series
    : [];

  assert.ok(series.length <= Math.floor(5_000 / 240));
  assert.match(model.description, /reunidos em Outros/);
  assert.equal(
    model.insights?.find((insight) => insight.label === "Total combinado")
      ?.value,
    "100",
  );
});

test("comparação adapta resolução ao volume real retornado pela fonte", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);
  const scenarios = Array.from({ length: 100 }, (_, index) =>
    scenario(
      `scenario-${index}`,
      `Cenário ${index}`,
      `line-${index}`,
      1,
    ),
  );
  const selected = scenarios[0];
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      hourRows: [
        aggregateRow("2026-07-22T10:00:00", "line-0", 3),
      ],
    }),
    period,
    scenarios,
    widget: analysisWidget("comparison", {
      granularity: "minute",
      scenarioIds: [selected.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(model.appliedGranularity, "hour");
  assert.equal(Array.isArray(model.option?.series), true);

  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    source,
    /periodAnalysisEffectiveGranularity\([\s\S]*?Math\.max\(1, scenarioCatalogSize\)/,
    "a resolução deve considerar as séries que a fonte retorna antes do filtro do widget",
  );
  assert.doesNotMatch(source, /Array\.from\(\{ length: catalogSize \}/);
  assert.match(
    source,
    /model\.appliedGranularity \?\?[\s\S]*?periodAnalysisEffectiveGranularity/,
  );
});

test("tendência e acumulado amostram só a visualização e preservam o fechamento", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2022-01-01",
    "2024-12-31",
  );
  assert.ok(period);
  const selected = scenario("entry", "Entrada", "line-entry", 1);
  const dayRows = [];
  let cursor = new Date(period.from);
  while (cursor < period.to) {
    const lastDay =
      cursor.getFullYear() === 2024 &&
      cursor.getMonth() === 11 &&
      cursor.getDate() === 31;
    dayRows.push(
      aggregateRow(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
        "line-entry",
        lastDay ? 9 : 1,
      ),
    );
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    );
  }
  const data = analysisData({ dayRows });
  const trend = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [selected],
    widget: analysisWidget("trend"),
  });
  const cumulative = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [selected],
    widget: analysisWidget("cumulative"),
  });
  const trendSeries = Array.isArray(trend.option?.series)
    ? trend.option.series
    : [];
  const cumulativeSeries = Array.isArray(cumulative.option?.series)
    ? cumulative.option.series
    : [];
  const visualDaily = trendSeries.find(
    (series) => series.name === "Volume diário",
  )?.data;
  const visualCurrent = cumulativeSeries.find(
    (series) => series.name === "Período selecionado",
  )?.data;
  const fullTrendRows = trend.table?.rows ?? [];
  const fullCumulativeRows = cumulative.table?.rows ?? [];

  assert.ok(fullTrendRows.length > 1_000);
  assert.ok(fullCumulativeRows.length > 1_000);
  assert.ok(Array.isArray(visualDaily));
  assert.ok(Array.isArray(visualCurrent));
  assert.ok(visualDaily.length <= 36);
  assert.ok(visualCurrent.length <= 36);
  assert.equal(visualDaily.at(-1), fullTrendRows.at(-1)?.total);
  assert.equal(visualCurrent.at(-1), fullCumulativeRows.at(-1)?.current);
  assert.match(trend.description, /sem alterar os cálculos diários/);
  assert.match(cumulative.description, /fechamento acumulado exato/);
});

test("widgets com muitos cenários limitam a tela e mantêm o detalhamento exportável", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-01",
    "2026-07-31",
  );
  assert.ok(period);
  const scenarios = Array.from({ length: 100 }, (_, index) =>
    scenario(
      `scenario-${index}`,
      `Cenário ${index}`,
      `line-${index}`,
      1,
    ),
  );
  const data = analysisData({
    dayRows: scenarios.map((item, index) =>
      aggregateRow("2026-07-22", `line-${index}`, index + 1),
    ),
  });

  for (const kind of ["ranking", "rose", "scenario_cumulative"]) {
    const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
      data,
      period,
      scenarios,
      widget: analysisWidget(kind),
    });
    const series = Array.isArray(model.option?.series)
      ? model.option.series
      : [];
    const visiblePoints = series[0]?.data;

    assert.ok(Array.isArray(visiblePoints), `${kind} deve publicar uma série`);
    assert.ok(visiblePoints.length <= 20, `${kind} deve limitar a tela`);
    assert.equal(model.table?.rows.length, 100, `${kind} preserva o export`);
    assert.match(model.description, /Outros/);
  }

  const totals = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios,
    widget: analysisWidget("totals_table"),
  });
  assert.equal(totals.table?.rows.length, 101);
  assert.ok((totals.displayTableData?.rows.length ?? 0) <= 21);
  assert.equal(totals.displayTableData?.rows[0]?.selected, 5_050);
});

test("tabela consolidada mantém no mês os mesmos membros agrupados no dia", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);
  const scenarios = Array.from({ length: 21 }, (_, index) =>
    scenario(
      `scenario-${index}`,
      `Cenário ${index}`,
      `line-${index}`,
      1,
    ),
  );
  const hourRows = scenarios.map((item, index) =>
    aggregateRow(
      "2026-07-22T10:00:00",
      `line-${index}`,
      100 - index,
    ),
  );
  const dayRows = scenarios.flatMap((item, index) => [
    aggregateRow(
      "2026-07-01",
      `line-${index}`,
      index === 19 ? 1_000 : index === 20 ? 900 : 1,
    ),
    aggregateRow("2026-07-22", `line-${index}`, 100 - index),
  ]);
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({ dayRows, hourRows }),
    period,
    scenarios,
    widget: analysisWidget("totals_table"),
  });
  const visibleRows = model.displayTableData?.rows ?? [];
  const other = visibleRows.find((row) =>
    String(row.scenario).startsWith("Outros"),
  );

  assert.equal(visibleRows.find((row) => row.scenario === "Cenário 0")?.month, 101);
  assert.equal(other?.selected, 161);
  assert.equal(other?.month, 2_061);
  assert.equal(model.table?.rows.length, 22);
});

test("detalhe horário limitado preserva a segunda hora repetida no DST", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const first = aggregateTime.startOfAggregateBucket(
      new Date("2026-11-01T05:30:00Z"),
      "hour",
    );
    const second = aggregateTime.startOfAggregateBucket(
      new Date("2026-11-01T06:30:00Z"),
      "hour",
    );
    const firstMinute = aggregateTime.startOfAggregateBucket(
      new Date("2026-11-01T05:30:45Z"),
      "minute",
    );
    const secondMinute = aggregateTime.startOfAggregateBucket(
      new Date("2026-11-01T06:30:45Z"),
      "minute",
    );

    assert.equal(first.toISOString(), "2026-11-01T05:00:00.000Z");
    assert.equal(second.toISOString(), "2026-11-01T06:00:00.000Z");
    assert.notEqual(first.getTime(), second.getTime());
    assert.equal(firstMinute.toISOString(), "2026-11-01T05:30:00.000Z");
    assert.equal(secondMinute.toISOString(), "2026-11-01T06:30:00.000Z");
    assert.notEqual(firstMinute.getTime(), secondMinute.getTime());

    const source = readFileSync(
      resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
      "utf8",
    );
    assert.match(
      source,
      /function startOfHour\([\s\S]*?startOfAggregateBucket\(date, "hour"\)/,
    );
    assert.doesNotMatch(
      source,
      /function startOfHour\([\s\S]{0,120}?setMinutes/,
    );
    assert.match(
      source,
      /function startOfMinute\([\s\S]*?startOfAggregateBucket\(date, "minute"\)/,
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("Análises longas consultam dia integral e limitam o detalhe horário", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /requestedConsolidatedDayRanges[\s\S]*?requirements\.day \? \[dayRange\][\s\S]*?fetchAnalysisConsolidatedDayDatasets/,
  );
  assert.match(
    source,
    /const boundedHourlyRange = \{[\s\S]*?hourlyDetailRange\.from[\s\S]*?requiredHourRanges =[\s\S]*?\[boundedHourlyRange\]/,
  );
  assert.doesNotMatch(source, /setInterval|refreshWhenIdle|visibilitychange/);
  assert.match(source, /day: needsDay/);
  assert.match(source, /trendHistory: queryWidgets\.some/);
  assert.match(
    source,
    /const consolidatedDayDatasetsPromise =[\s\S]*?fetchAnalysisConsolidatedDayDatasets/,
  );
  assert.match(
    source,
    /const queryWidgets = React\.useMemo\(\s*\(\) => orderByCardPreferences\(widgets, preferences\)/,
  );
  assert.match(source, /node: \(\) => \(\s*<PeriodAnalysisCardRuntime/);
  assert.match(source, /models: queryWidgets\.flatMap\(\(widget\) => \{/);
  assert.match(
    source,
    /function buildPeriodAnalysisReportPayload\(\)[\s\S]*?const model = buildPeriodAnalysisWidgetModel/,
  );
  assert.doesNotMatch(source, /const modelByWidgetId = React\.useMemo/);
  assert.match(source, /const MAX_ANALYSIS_DAY_CACHE_ENTRIES = 64/);
  assert.match(
    source,
    /while \(cache\.size > MAX_ANALYSIS_DAY_CACHE_ENTRIES\)/,
  );
  assert.match(source, /Consolidação automática ativa/);
  assert.match(source, /Detalhe horário · últimos \{hourlyDetailDayCount\} dias/);
});

test("cache minuto a minuto baixa o dia uma vez e reconcilia a janela móvel", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    const catchUp = requests.length > 1;
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow(
            catchUp
              ? "2026-08-24T14:10:00.000Z"
              : "2026-08-24T13:40:00.000Z",
            "line-entry",
            catchUp ? 6 : 4,
          ),
        ],
        granularity: "minute",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };

  try {
    const cache = new Map();
    const from = new Date("2026-08-24T03:00:00.000Z");
    const first = await aggregateMinuteDayQuery.fetchMinuteDayAggregateBootstrap({
      cache,
      cacheScope: "company-a:America/Sao_Paulo",
      from,
      now: new Date("2026-08-24T13:42:30.000Z"),
      to: new Date("2026-08-24T13:43:00.000Z"),
    });
    const second = await aggregateMinuteDayQuery.fetchMinuteDayAggregateBootstrap({
      cache,
      cacheScope: "company-a:America/Sao_Paulo",
      from,
      now: new Date("2026-08-24T13:43:30.000Z"),
      to: new Date("2026-08-24T13:44:00.000Z"),
    });

    assert.equal(requests.length, 1, "o refresh não deve baixar o dia novamente");
    assert.deepEqual(first, second);

    const reconciled =
      await aggregateMinuteDayQuery.refreshMinuteDayAggregateCache({
        cache,
        cacheScope: "company-a:America/Sao_Paulo",
        from,
        sourceFrom: new Date("2026-08-24T13:40:00.000Z"),
        sourceRows: [
          aggregateRow("2026-08-24T13:40:00.000Z", "line-entry", 9),
        ],
        sourceTo: new Date("2026-08-24T13:41:00.000Z"),
      });
    assert.deepEqual(reconciled.map((row) => row.total), [9]);
    assert.equal(requests.length, 1);

    const caughtUp =
      await aggregateMinuteDayQuery.refreshMinuteDayAggregateCache({
        cache,
        cacheScope: "company-a:America/Sao_Paulo",
        from,
        now: new Date("2026-08-24T14:40:30.000Z"),
        sourceFrom: new Date("2026-08-24T14:40:00.000Z"),
        sourceRows: [
          aggregateRow("2026-08-24T14:40:00.000Z", "line-entry", 2),
        ],
        sourceTo: new Date("2026-08-24T14:41:00.000Z"),
      });
    assert.equal(requests.length, 2, "somente a lacuna deve gerar nova consulta");
    assert.deepEqual(
      caughtUp.map((row) => row.total).sort((left, right) => left - right),
      [2, 6, 9],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bootstrap minuto evita cauda duplicada e subdivide respostas no teto", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    const rows = requests.length === 1
      ? Array.from({ length: 1_000 }, (_, index) =>
          aggregateRow(
            "2026-08-24T03:00:00.000Z",
            `line-${index}`,
            1,
          ),
        )
      : [];
    return new Response(
      JSON.stringify({ data: rows, granularity: "minute" }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };

  try {
    const cache = new Map();
    const from = new Date("2026-08-24T03:00:00.000Z");
    const rows = await aggregateMinuteDayQuery.fetchMinuteDayAggregateBootstrap({
      cache,
      cacheScope: "company-a:America/Sao_Paulo:ceiling",
      from,
      now: new Date("2026-08-24T03:04:30.000Z"),
      to: new Date("2026-08-24T03:04:00.000Z"),
    });
    assert.deepEqual(rows, []);
    assert.equal(
      requests.length,
      3,
      "uma resposta no teto deve ser reconsultada em duas metades certificáveis",
    );

    const requestCount = requests.length;
    const empty = await aggregateMinuteDayQuery.fetchMinuteDayAggregateBootstrap({
      cache: new Map(),
      cacheScope: "company-a:America/Sao_Paulo:empty",
      from,
      now: from,
      to: from,
    });
    assert.deepEqual(empty, []);
    assert.equal(
      requests.length,
      requestCount,
      "a faixa vazia entre o bootstrap e a janela móvel não chama a API",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loader agregado certifica o teto em qualquer granularidade", async () => {
  const requests = [];
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 3);
  const rows = await aggregateRangeQuery.fetchCompleteAggregateRange({
    from,
    granularity: "day",
    request: async (path) => {
      requests.push(path);
      if (requests.length === 1) {
        return {
          data: Array.from({ length: 1_000 }, (_, index) => ({
            bucket: "2026-08-01",
            camera_id: `camera-${index}`,
            metric_type: "count",
            total: 1,
          })),
          granularity: "day",
        };
      }

      const queryFrom = new URL(`http://local${path}`).searchParams.get("from");
      const secondDay = queryFrom?.startsWith("2026-08-02");
      return {
        data: [
          {
            bucket: secondDay ? "2026-08-02" : "2026-08-01",
            camera_id: secondDay ? "camera-day-2" : "camera-day-1",
            metric_type: "count",
            total: secondDay ? 2 : 1,
          },
        ],
        granularity: "day",
      };
    },
    to,
  });

  assert.equal(requests.length, 3);
  assert.deepEqual(rows.map((row) => row.total), [1, 2]);
});

test("loader horário limitado recorta os meses de borda na própria API", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({ data: [], granularity: "hour" }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };

  try {
    const range = {
      from: new Date(2026, 5, 15),
      to: new Date(2026, 6, 16),
    };
    await aggregateHourQuery.fetchBoundedHourlyAggregateRanges({
      cache: new Map(),
      cacheScope: "analysis-bounded",
      now: new Date(2026, 7, 1),
      ranges: [range],
    });

    assert.equal(requests.length, 2);
    const parameters = requests.map((request) => {
      const url = new URL(request, "http://localhost");
      return {
        from: new Date(url.searchParams.get("from")),
        to: new Date(url.searchParams.get("to")),
      };
    });
    assert.equal(parameters[0].from.getTime(), range.from.getTime());
    assert.deepEqual(localDateParts(parameters[0].to), [2026, 7, 1]);
    assert.deepEqual(localDateParts(parameters[1].from), [2026, 7, 1]);
    assert.equal(parameters[1].to.getTime(), range.to.getTime());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filtro do cache mensal entrega somente buckets dentro de [from, to)", () => {
  const rows = aggregateHourQuery.filterHourlyAggregateRowsToRanges(
    [
      aggregateRow("2026-07-10T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 0),
      aggregateRow("2026-07-23T00:00:00", "line-entry", 200),
    ],
    [{ from: new Date(2026, 6, 15), to: new Date(2026, 6, 23) }],
  );

  assert.deepEqual(
    rows.map((row) => [row.bucket, row.total]),
    [["2026-07-22T10:00:00", 0]],
    "zero certificado deve sobreviver ao filtro; buckets externos não",
  );
});

test("validação agregada rejeita resposta fora do intervalo sem confundir zero com ausência", () => {
  const zero = aggregateRow("2026-07-22T10:00:00", "line-entry", 0);
  assert.deepEqual(
    aggregateTime.requireAggregateRowsInRange(
      [zero],
      "hour",
      new Date(2026, 6, 22),
      new Date(2026, 6, 23),
      "count",
    ),
    [zero],
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRowsInRange(
        [aggregateRow("2026-07-23T00:00:00", "line-entry", 1)],
        "hour",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
        "count",
      ),
    /fora do intervalo/,
  );
});

test("cache horário revisa mês aberto por hora e histórico por dia", () => {
  const july = { from: new Date(2026, 6, 1), to: new Date(2026, 7, 1) };
  const historicalMorning = aggregateHourQuery.hourlyAggregateCacheRevision(
    july,
    new Date(2026, 7, 4, 9),
  );
  const historicalAfternoon = aggregateHourQuery.hourlyAggregateCacheRevision(
    july,
    new Date(2026, 7, 4, 18),
  );
  const august = { from: new Date(2026, 7, 1), to: new Date(2026, 8, 1) };
  const openMorning = aggregateHourQuery.hourlyAggregateCacheRevision(
    august,
    new Date(2026, 7, 22, 9),
  );
  const openAfternoon = aggregateHourQuery.hourlyAggregateCacheRevision(
    august,
    new Date(2026, 7, 22, 18),
  );

  assert.match(historicalMorning, /^day:/);
  assert.equal(historicalAfternoon, historicalMorning);
  assert.match(openMorning, /^hour:/);
  assert.notEqual(openAfternoon, openMorning);
});

test("consultas dos dias 22 e 23 reutilizam uma resposta mensal e recortam localmente", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-23T10:00:00", "line-entry", 23),
        ],
        granularity: "hour",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };

  try {
    const cache = new Map();
    const common = {
      cache,
      cacheScope: "company-a:America/Sao_Paulo",
      now: new Date(2026, 6, 27, 10, 30),
    };
    const through22 = await aggregateHourQuery.fetchHourlyAggregateRanges({
      ...common,
      ranges: [{ from: new Date(2026, 6, 1), to: new Date(2026, 6, 23) }],
    });
    const through23 = await aggregateHourQuery.fetchHourlyAggregateRanges({
      ...common,
      ranges: [{ from: new Date(2026, 6, 1), to: new Date(2026, 6, 24) }],
    });

    assert.equal(requests.length, 1);
    assert.deepEqual(through22.map((row) => row.total), [22]);
    assert.deepEqual(through23.map((row) => row.total), [22, 23]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loader horário recupera o início do mês quando a API limita cada resposta a 1.000 linhas", async () => {
  const originalFetch = globalThis.fetch;
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 24, 18);
  const now = new Date(2026, 7, 24, 18, 2);
  const sourceRows = [];
  let cursor = new Date(from);

  while (cursor < to) {
    sourceRows.push(
      aggregateRow(cursor.toISOString(), "line-entry", 1),
      aggregateRow(cursor.toISOString(), "line-exit", 1),
    );
    cursor = new Date(cursor.getTime() + 60 * 60_000);
  }
  assert.equal(sourceRows.length, 1_140);

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    const requestFrom = new Date(url.searchParams.get("from"));
    const requestTo = new Date(url.searchParams.get("to"));
    const matchingRows = sourceRows.filter((row) => {
      const bucket = new Date(row.bucket);
      return bucket >= requestFrom && bucket < requestTo;
    });
    const limitedRows = matchingRows.slice(-1_000);
    requests.push({
      from: requestFrom,
      returned: limitedRows.length,
      source: matchingRows.length,
      to: requestTo,
    });
    return new Response(
      JSON.stringify({ data: limitedRows, granularity: "hour" }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };

  try {
    let completeRows;
    for (const [label, loader] of [
      ["mensal", aggregateHourQuery.fetchHourlyAggregateRanges],
      ["limitado", aggregateHourQuery.fetchBoundedHourlyAggregateRanges],
    ]) {
      requests.length = 0;
      const rows = await loader({
        cache: new Map(),
        cacheScope: `company-a:America/Sao_Paulo:${label}`,
        now,
        ranges: [{ from, to }],
      });

      assert.equal(rows.length, sourceRows.length, label);
      assert.ok(
        requests.some((request) => request.source > request.returned),
        `${label}: o mock precisa reproduzir uma resposta truncada`,
      );
      assert.ok(
        requests.length > 1,
        `${label}: o intervalo precisa ser subdividido para certificar a cobertura`,
      );
      assert.ok(
        rows.some(
          (row) =>
            row.bucket === from.toISOString() &&
            row.line_count_id === "line-entry",
        ),
        `${label}: o primeiro bucket do dia 1 não pode desaparecer`,
      );
      completeRows = rows;
    }

    const dayRows = aggregateReconciliation.rollupAggregateRows(
      completeRows,
      "hour",
      "day",
      from,
      to,
    );
    const dayTotals = new Map(
      dayRows
        .filter((row) => row.line_count_id === "line-entry")
        .map((row) => [row.bucket, row.total]),
    );
    assert.equal(dayTotals.size, 24);
    assert.equal(dayTotals.get("2026-08-01"), 24);
    assert.equal(dayTotals.get("2026-08-24"), 18);

    const heatmap = scenarioAnalytics.buildScenarioCivilHourMagnitudePoints({
      companyTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      from,
      rows: completeRows,
      scenarios: [
        scenario("entry", "Entrada", "line-entry", 1),
        scenario("exit", "Saída", "line-exit", -1),
      ],
      sourceGranularity: "hour",
      to,
    });
    assert.equal(
      heatmap.find((point) => point.day === 1 && point.hour === 0)?.total,
      2,
    );
    assert.deepEqual(
      Array.from(
        new Set(
          heatmap
            .filter((point) => point.total > 0)
            .map((point) => point.day),
        ),
      ),
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("comparativo anual ao vivo limita a consulta a quatro anos civis e divide a janela recente", () => {
  const now = new Date(2026, 6, 22, 10, 35);
  const range = liveAnnualComparison.resolveLiveAnnualComparisonRanges(now);

  assert.equal(liveAnnualComparison.LIVE_ANNUAL_HISTORY_YEARS, 4);
  assert.deepEqual(
    [
      range.historyFrom.getFullYear(),
      range.historyFrom.getMonth(),
      range.historyFrom.getDate(),
    ],
    [2023, 0, 1],
  );
  assert.equal(range.periodFrom.getTime(), range.historyFrom.getTime());
  assert.deepEqual(
    [range.recentFrom.getFullYear(), range.recentFrom.getMonth()],
    [2025, 6],
  );
  assert.equal(range.historyTo.getTime(), range.recentFrom.getTime());
  assert.deepEqual(
    [range.periodTo.getFullYear(), range.periodTo.getMonth(), range.periodTo.getDate()],
    [2026, 7, 1],
  );
  assert.ok(range.historyFrom < range.historyTo);
  assert.ok(range.periodFrom < range.periodTo);
});

test("comparativo anual substitui somente o mês aberto pelas horas fechadas", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const monthlyRows = [
    aggregateRow("2025-07-01", "line-entry", 400),
    aggregateRow("2026-07-01", "line-entry", 999),
  ];
  const model = liveAnnualComparison.buildLiveAnnualComparisonModel({
    historicalMonthRows: monthlyRows,
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 40),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 50),
      aggregateRow("2026-07-22T15:00:00", "line-entry", 800),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    recentMonthRows: monthlyRows,
    scenarios: [entryScenario],
    scope: { cameraIds: [], name: "Entrada", scenario: entryScenario },
  });

  assert.equal(
    model.currentMonthValue,
    150,
    "o monthly diário obsoleto e a hora ainda aberta não podem congelar/inflar julho",
  );
  assert.equal(
    model.yearRows.find((row) => row.year === 2025)?.months[6],
    400,
    "meses históricos devem permanecer na fonte mensal consolidada",
  );
});

test("histórico anual ao vivo só consulta cards visíveis, uma vez por dia e em meses completos", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const annualRequestSection = source.slice(
    source.indexOf("  const annualHistoryRequested ="),
    source.indexOf("  const liveWidgetScenarioContexts ="),
  );
  const annualFetchSection = source.slice(
    source.indexOf("async function fetchLiveAnnualMonthlyHistory"),
    source.indexOf("function hydrateRealtimeOpenBuckets"),
  );
  const recursivePartitionSection = source.slice(
    source.indexOf("async function fetchLiveAnnualMonthlyPartition"),
    source.indexOf("function splitAnnualHistoryMonthPartition"),
  );

  assert.match(
    source,
    /const annualHistoryAttemptDayRef = React\.useRef\(""\)/,
  );
  assert.doesNotMatch(
    source,
    /annualHistoryAttemptMinuteRef|annualHistoryRetryMinuteKey/,
    "falha histórica não pode ser tentada novamente a cada minuto",
  );
  assert.match(
    source,
    /const livePreferencesReady =\s*livePreferencesReadyKey === livePreferencesScopeKey/,
  );
  assert.match(
    source,
    /if \(!livePreferencesReady\) return \[\]/,
    "preferências de outro escopo não podem liberar a consulta anual",
  );
  assert.match(
    annualRequestSection,
    /visibleLiveCardIds\.some\([\s\S]*?live_current_year_monthly[\s\S]*?live_current_year_accumulated/,
  );
  assert.match(
    annualRequestSection,
    /if \(!annualHistoryRequested \|\| !hasLoadedCharts\) return/,
  );
  assert.match(
    annualRequestSection,
    /annualHistoryAttemptDayRef\.current === annualHistoryDayKey/,
  );
  assert.doesNotMatch(annualRequestSection, /getMinutes|getHours|MinuteKey/);

  assert.match(
    annualFetchSection,
    /granularity: "month"/,
    "o histórico longo não deve voltar à granularidade horária",
  );
  assert.match(
    source.slice(
      source.indexOf("  const loadAnnualHistory = React.useCallback"),
      source.indexOf("  const annualHistoryDayKey ="),
    ),
    /to: range\.periodTo/,
    "a fonte mensal deve cobrir também os meses recentes e o mês aberto",
  );
  assert.doesNotMatch(
    source,
    /LIVE_ANNUAL_RECENT_MONTHS_ID|buildLiveAnnualRecentMonthsDefinition/,
    "cards anuais não podem manter uma segunda janela recente",
  );
  assert.match(
    source,
    /if \(annualComparisonSource\)[\s\S]*?currentDayFrom = startOfDay\(now\)[\s\S]*?comparableTo = startOfHour\(now\)[\s\S]*?shiftRealtimeYearClamped/,
    "o detalhe horário anual deve conter somente as bordas diárias equivalentes",
  );
  assert.match(
    source,
    /definitionIds\.add\(CURRENT_MONTH_DAYS_ID\)[\s\S]*?definitionIds\.add\(OPERATIONAL_LAST_YEAR_MONTH_ID\)/,
    "dias fechados do comparativo anual devem permanecer consolidados",
  );
  assert.match(
    annualFetchSection,
    /rows\.length < AGGREGATE_RESPONSE_ROW_CEILING/,
  );
  assert.match(
    recursivePartitionSection,
    /fetchLiveAnnualMonthlyPartition\([\s\S]*?fetchLiveAnnualMonthlyPartition\(/,
    "uma resposta no teto deve ser repartida até ficar comprovadamente completa",
  );
  assert.doesNotMatch(
    recursivePartitionSection,
    /Promise\.all/,
    "a recursão deve respeitar o limite do pool externo",
  );

  const partitionYears = loadStandaloneFunction(
    "components/app/realtime-dashboard.tsx",
    "buildAnnualHistoryYearPartitions",
  );
  const partitions = partitionYears(
    new Date(2018, 0, 1),
    new Date(2021, 6, 1),
  );
  assert.equal(partitions.length, 4);
  assert.equal(partitions[0].from.getTime(), new Date(2018, 0, 1).getTime());
  assert.equal(partitions.at(-1).to.getTime(), new Date(2021, 6, 1).getTime());
  partitions.slice(1).forEach((partition, index) => {
    assert.equal(
      partition.from.getTime(),
      partitions[index].to.getTime(),
      "partições anuais devem ser contíguas e sem sobreposição",
    );
  });
});

test("hora atual reutiliza exclusivamente a janela móvel de minutos", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const loadChartsSection = source.slice(
    source.indexOf("  const loadCharts = React.useCallback"),
    source.indexOf("  const loadAnnualHistory = React.useCallback"),
  );
  const hydrationSection = source.slice(
    source.indexOf("function hydrateRealtimeOpenBuckets"),
    source.indexOf("function buildRealtimeScopeModes"),
  );

  assert.match(
    loadChartsSection,
    /CANONICAL_HOUR_DERIVED_IDS\.has\(definition\.id\) \|\|\s*definition\.id === OPERATIONAL_CURRENT_HOUR_MINUTES_ID/,
    "a definição auxiliar da hora atual não deve disparar uma segunda consulta",
  );
  assert.match(
    hydrationSection,
    /const visibleMinuteState = next\.live_chart_minute/,
  );
  assert.match(
    hydrationSection,
    /minuteState\.rows = visibleMinuteState\.rows\.filter/,
  );
  assert.match(
    hydrationSection,
    /aggregateBucketInRange\([\s\S]*?currentHourStart,[\s\S]*?currentMinuteEnd/,
  );
});

test("planejador do Ao Vivo consulta somente fontes dos widgets visíveis", () => {
  const ids = {
    CURRENT_MONTH_DAYS_ID: "live_current_month_days",
    DAY_REFRESH_MS: 5 * 60_000,
    LIVE_DAY_MINUTES_ID: "live_chart_minute_day",
    MONTH_REFRESH_MS: 60 * 60_000,
    OCCUPANCY_HOURS_ID: "live_hourly_occupancy_data",
    OPERATIONAL_COMPARISON_HOURS_ID:
      "live_operational_comparison_hours",
    OPERATIONAL_LAST_YEAR_MONTH_ID: "live_operational_last_year_month",
    OPERATIONAL_PREVIOUS_MONTH_ID: "live_operational_previous_month",
    OPERATIONAL_TREND_DAYS_ID: "live_operational_trend_days",
    REFRESH_MS: 5_000,
  };
  const buildPlanKey = loadStandaloneFunction(
    "components/app/realtime-dashboard.tsx",
    "buildRealtimeDataPlanKey",
    ids,
  );
  const build = ({
    customWidgets = [],
    monthComparison = "previous_month",
    openScenarioComparisonWidgetIds = [],
    visibleCardIds = [],
  } = {}) => {
    const key = buildPlanKey({
      customWidgets,
      monthComparison,
      openScenarioComparisonWidgetIds,
      visibleCardIds,
    });
    return key ? JSON.parse(key) : null;
  };

  assert.equal(buildPlanKey({
    customWidgets: [],
    monthComparison: "previous_month",
    visibleCardIds: [],
  }), "");
  assert.deepEqual(
    build({ visibleCardIds: ["live_month_access_ranking"] }),
    {
      annualComparisonSource: false,
      comparisonSource: false,
      definitionIds: [ids.CURRENT_MONTH_DAYS_ID],
      heatmapSource: false,
      minuteDay: false,
      refreshIntervalMs: ids.DAY_REFRESH_MS,
      rollingMinute: false,
    },
  );
  assert.deepEqual(
    build({
      monthComparison: "last_year",
      visibleCardIds: ["live_target_progress"],
    }).definitionIds,
    [
      "live_chart_hour",
      ids.CURRENT_MONTH_DAYS_ID,
      ids.OPERATIONAL_LAST_YEAR_MONTH_ID,
    ].sort(),
  );
  assert.deepEqual(
    build({ visibleCardIds: [ids.LIVE_DAY_MINUTES_ID] }),
    {
      annualComparisonSource: false,
      comparisonSource: false,
      definitionIds: ["live_chart_minute"],
      heatmapSource: false,
      minuteDay: true,
      refreshIntervalMs: ids.REFRESH_MS,
      rollingMinute: true,
    },
  );

  const customWidgets = [
    {
      created_at: "2026-09-02T00:00:00.000Z",
      granularity: "minute",
      id: "visible",
      kind: "scope",
      scopeId: "scenario-a",
      scopeMode: "scenario",
      scopeName: "Cenário A",
      title: "Título original",
      updated_at: "2026-09-02T00:00:00.000Z",
    },
    {
      created_at: "2026-09-02T00:00:00.000Z",
      granularity: "month",
      id: "hidden",
      kind: "scope",
      scopeId: "scenario-b",
      scopeMode: "scenario",
      scopeName: "Cenário B",
      title: "Oculto",
      updated_at: "2026-09-02T00:00:00.000Z",
    },
  ];
  const originalKey = buildPlanKey({
    customWidgets,
    monthComparison: "previous_month",
    visibleCardIds: ["live_custom_visible", "live_month_access_ranking"],
  });
  const visualOnlyKey = buildPlanKey({
    customWidgets: [
      { ...customWidgets[0], title: "Título, cor e tamanho alterados" },
      customWidgets[1],
    ],
    monthComparison: "previous_month",
    visibleCardIds: ["live_month_access_ranking", "live_custom_visible"],
  });
  assert.equal(
    visualOnlyKey,
    originalKey,
    "título e ordem visual não podem alterar o plano de rede",
  );
  assert.deepEqual(JSON.parse(originalKey).definitionIds, [
    "live_chart_minute",
    ids.CURRENT_MONTH_DAYS_ID,
  ]);
  assert.equal(JSON.parse(originalKey).rollingMinute, true);
  assert.equal(JSON.parse(originalKey).refreshIntervalMs, ids.REFRESH_MS);

  const comparisonWidget = {
    created_at: "2026-09-02T00:00:00.000Z",
    id: "comparison",
    kind: "scenario_comparison",
    title: "Comparação",
    updated_at: "2026-09-02T00:00:00.000Z",
  };
  const closedComparison = build({
    customWidgets: [comparisonWidget],
    visibleCardIds: ["live_custom_comparison"],
  });
  assert.equal(
    closedComparison,
    null,
    "comparação histórica fechada não deve criar polling no Ao Vivo",
  );

  const comparison = build({
    customWidgets: [
      comparisonWidget,
    ],
    openScenarioComparisonWidgetIds: ["comparison"],
    visibleCardIds: ["live_custom_comparison"],
  });
  assert.equal(comparison.comparisonSource, true);
  assert.deepEqual(comparison.definitionIds, []);
  assert.equal(comparison.rollingMinute, true);

  const annual = build({
    visibleCardIds: ["live_current_year_monthly"],
  });
  assert.equal(annual.annualComparisonSource, true);
  assert.deepEqual(annual.definitionIds, [
    ids.CURRENT_MONTH_DAYS_ID,
    ids.OPERATIONAL_LAST_YEAR_MONTH_ID,
  ].sort());
  assert.equal(annual.rollingMinute, false);
  assert.equal(annual.refreshIntervalMs, ids.MONTH_REFRESH_MS);

  const trend = build({ visibleCardIds: ["live_moving_average_trend"] });
  assert.equal(trend.rollingMinute, false);
  assert.equal(trend.refreshIntervalMs, ids.DAY_REFRESH_MS);
  assert.doesNotMatch(JSON.stringify(trend), /live_chart_minute/);
});

test("Ao Vivo aguarda preferências e aplica o plano semântico ao polling", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const loadSection = source.slice(
    source.indexOf("  const loadCharts = React.useCallback"),
    source.indexOf("  const loadAnnualHistory = React.useCallback"),
  );
  const pollingSection = source.slice(
    source.indexOf("  React.useEffect(() => {\n    if (!realtimeDataPlanKey)"),
    source.indexOf("  const initialLoading =", source.indexOf("  React.useEffect(() => {\n    if (!realtimeDataPlanKey)")),
  );
  const planCallSection = source.slice(
    source.indexOf("  const requestedRealtimeDataPlanKey ="),
    source.indexOf("  const annualHistoryRequested ="),
  );

  assert.match(
    source,
    /realtimeDataPlanState\.scopeKey === realtimeDataPlanScopeKey[\s\S]*?realtimeDataPlanState\.key[\s\S]*?: ""/,
    "um plano pertencente à empresa anterior deve ficar inativo imediatamente",
  );
  assert.match(source, /if \(!livePreferencesReady\) return \[\]/);
  assert.match(
    planCallSection,
    /livePreferencesReady && selectedScope\s*\? buildRealtimeDataPlanKey/,
    "nenhuma consulta pode começar antes da visão e preferências estarem prontas",
  );
  assert.match(
    planCallSection,
    /customWidgets,[\s\S]*?monthComparison: operationalSettings\.monthComparison,[\s\S]*?visibleCardIds: visibleLiveCardIds/,
  );
  assert.doesNotMatch(planCallSection, /liveColorByCardId|liveTitleByCardId|chartType|size/);
  assert.match(loadSection, /if \(!realtimeDataPlanKey\) return/);
  assert.match(
    loadSection,
    /requestedDefinitionIds\.has\(definition\.id\)/,
  );
  assert.match(
    loadSection,
    /realtimeDataPlan\.minuteDay\s*\? fetchMinuteDayAggregateBootstrap/,
  );
  assert.match(
    loadSection,
    /const minuteDayBootstrapTo = rollingMinuteDefinition[\s\S]*?rollingMinuteDefinition\.from\.getTime\(\)[\s\S]*?to: minuteDayBootstrapTo/,
    "o bootstrap do dia deve terminar onde começa a fonte móvel já solicitada",
  );
  assert.match(
    loadSection,
    /refreshMinuteDayAggregateCache\([\s\S]*?sourceFrom: new Date\([\s\S]*?rollingMinuteDefinition\.from\.getTime\(\)/,
    "a cauda do dia deve ser reconciliada com a única fonte móvel",
  );
  assert.match(
    loadSection,
    /ranges: canonicalHourRanges/,
  );
  assert.match(
    loadSection,
    /definition\.id === OPERATIONAL_MONTH_HOURS_ID[\s\S]*?fetchIncrementalRealtimeHourlyRanges\(\{[\s\S]*?ranges: canonicalHourRanges/,
    "a janela canônica deve consultar incrementalmente somente os trechos horários ausentes",
  );
  assert.match(
    loadSection,
    /definition\.granularity === "minute"[\s\S]*?fetchIncrementalRealtimeMinuteWindow/,
    "a janela móvel não pode baixar novamente os 60 minutos completos a cada ciclo",
  );
  assert.match(
    source,
    /function fetchIncrementalRealtimeHourlyRanges[\s\S]*?subtractRealtimeQueryRanges[\s\S]*?includeOpenHour/,
    "horas fechadas devem permanecer cobertas no cache sem nova consulta",
  );
  assert.match(pollingSection, /if \(!realtimeDataPlanKey\)/);
  assert.match(pollingSection, /window\.setInterval/);
  assert.match(
    pollingSection,
    /realtimeDataPlan\.refreshIntervalMs/,
    "a cadência deve seguir o dataset mais urgente do plano visível",
  );
  assert.match(
    loadSection,
    /const needsRollingMinute = realtimeDataPlan\.rollingMinute/,
  );
  assert.doesNotMatch(
    loadSection,
    /canonicalDefinition\s*&&\s*canonicalDefinition\.from[\s\S]*?needsRollingMinute/,
    "uma janela que apenas cruza a hora atual não deve ativar minutos",
  );
  const liveComparisonSource = source.slice(
    source.indexOf("function buildOperationalMonthHoursDefinition"),
    source.indexOf("function buildOperationalCurrentHourMinutesDefinition"),
  );
  assert.match(liveComparisonSource, /from: startOfDay\(now\)/);
  assert.match(
    liveComparisonSource,
    /to: endOfAggregateBucket\(startOfHour\(now\), "hour"\)/,
  );
  assert.doesNotMatch(
    liveComparisonSource,
    /addMonths|startOfMonth/,
    "a fonte compartilhada com comparativos personalizados não pode baixar 13 meses",
  );
});

test("Ao Vivo recorta respostas compartilhadas antes de certificar cada widget", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const filterRows = loadStandaloneFunction(
    "components/app/realtime-dashboard.tsx",
    "filterRealtimeRowsToRanges",
    { aggregateBucketInRange: aggregateTime.aggregateBucketInRange },
  );
  const selectRows = loadStandaloneFunction(
    "components/app/realtime-dashboard.tsx",
    "selectRealtimeNativeDefinitionRows",
    {
      DEFAULT_METRIC_TYPE: "count",
      filterRealtimeRowsToRanges: filterRows,
      requireAggregateRowsInRange: aggregateTime.requireAggregateRowsInRange,
    },
  );
  const sharedRows = [
    aggregateRow("2026-08-31", "line-entry", 10),
    aggregateRow("2026-09-01", "line-entry", 20),
    aggregateRow("2026-09-02", "line-entry", 30),
  ];
  const definition = {
    from: new Date(2026, 8, 1),
    granularity: "day",
    id: "current-month",
    to: new Date(2026, 8, 3),
  };

  assert.throws(
    () =>
      aggregateTime.requireAggregateRowsInRange(
        sharedRows,
        "day",
        definition.from,
        definition.to,
        "count",
      ),
    /fora do intervalo/,
    "a resposta mesclada reproduz a falha anterior",
  );
  assert.deepEqual(
    selectRows(sharedRows, definition, definition.to).map((row) => row.total),
    [20, 30],
  );

  const errorSection = source.slice(
    source.indexOf("  const liveDataCertificationError ="),
    source.indexOf("  const comparisonScopeCertificationError ="),
  );
  assert.doesNotMatch(
    errorSection.slice(
      0,
      errorSection.indexOf("  const liveReportCertificationError ="),
    ),
    /Object\.entries\(chartData\)/,
    "uma falha isolada deve permanecer no card, sem ocultar todo o Ao Vivo",
  );
  assert.match(errorSection, /const liveReportCertificationError/);
});

test("cards comparativos existem antes dos dados e não criam ciclo no plano", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const cardsSection = source.slice(
    source.indexOf("  const comparisonCards ="),
    source.indexOf("  const customWidgetCards ="),
  );

  assert.match(cardsSection, /scenarios\.length > 1/);
  assert.match(cardsSection, /locationTodayComparisonScopes\.length > 1/);
  assert.match(cardsSection, /subLocationTodayComparisonScopes\.length > 1/);
  assert.doesNotMatch(
    cardsSection,
    /some\(\(point\) => point\.total > 0\)/,
    "a existência do card não pode depender da própria resposta horária",
  );
});

test("Ao Vivo materializa modelos pesados somente quando o card entra na janela", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const derivedSection = source.slice(
    source.indexOf("  const initialLoading ="),
    source.indexOf("  function getScopeOptionsForMode"),
  );
  const modelSection = source.slice(
    source.indexOf("  const createRealtimeWidgetModel ="),
    source.indexOf("  const scenarioConfigurableCardDefaults ="),
  );
  const cardsSection = source.slice(
    source.indexOf("  const operationalCards ="),
    source.indexOf("  const customWidgetCards ="),
  );
  const customScenarioWidgetSection = source.slice(
    source.indexOf("function CustomScenarioWidgetCard"),
    source.indexOf("function CustomWidgetActions"),
  );

  assert.match(derivedSection, /getOperationalHeatmapPoints = createRenderLazyValue/);
  assert.match(derivedSection, /getHourlyOccupancyPoints = createRenderLazyValue/);
  assert.match(derivedSection, /getScenarioTableRows = createRenderLazyValue/);
  assert.doesNotMatch(derivedSection, /const operationalHeatmapPoints = React\.useMemo/);
  assert.doesNotMatch(derivedSection, /const hourlyOccupancyPoints = React\.useMemo/);
  assert.match(modelSection, /get liveAnnualComparisonModel\(\)/);
  assert.match(modelSection, /get monthComparisonPoints\(\)/);
  assert.match(modelSection, /get operationalTrendPoints\(\)/);
  assert.match(cardsSection, /node: \(\) => \{/);
  assert.match(customScenarioWidgetSection, /const widgetData = React\.useMemo/);
  assert.doesNotMatch(customScenarioWidgetSection, /const rankingPoints = React\.useMemo/);
  assert.doesNotMatch(customScenarioWidgetSection, /const heatmapPoints = React\.useMemo/);
});

test("comparação por cenário não mantém um segundo auto refresh", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /\bautoRefresh\b/);
  assert.doesNotMatch(source, /\bREFRESH_MS\b/);
  assert.doesNotMatch(source, /setInterval|visibilityState|visibilitychange/);
});

test("Ao Vivo usa histórico multi-ano, cache por empresa e fuso e hora aberta canônica", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /buildLiveAnnualComparisonModel/);
  assert.match(source, /buildAnnualComparisonChartOption/);
  assert.match(source, /buildAnnualAccumulatedComparisonChartOption/);
  assert.match(
    source,
    /cacheScope: `live:\$\{companyScopeId\}:\$\{companyTimeZone\}`/,
  );
  assert.match(source, /requireAggregateRowsInRange/);
  assert.match(source, /OPERATIONAL_CURRENT_HOUR_MINUTES_ID/);
  assert.match(
    source,
    /if \(cursor < end\) \{[\s\S]*?throw new RangeError/,
    "um eixo maior que o limite deve falhar explicitamente, nunca truncar",
  );
  assert.doesNotMatch(source, /function buildCurrentYearMonthPoints/);
});

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return nodeRequire(specifier);
    return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}

function loadStandaloneFunction(relativePath, functionName, bindings = {}) {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, "utf8");
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName,
  );
  assert.ok(declaration, `${functionName} deve existir em ${relativePath}`);

  const output = ts.transpileModule(
    `${declaration.getText(sourceFile)}\nmodule.exports = ${functionName};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    },
  ).outputText;
  const loadedModule = { exports: {} };
  const bindingNames = Object.keys(bindings);
  const execute = new Function(
    "exports",
    "module",
    ...bindingNames,
    output,
  );
  execute(loadedModule.exports, loadedModule, ...Object.values(bindings));
  return loadedModule.exports;
}

function emptyHours() {
  return Array.from({ length: 24 }, () => 0);
}

function nextDay(day) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
}

function localDateParts(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

function pickOccupancy(point) {
  return {
    entries: point.entries,
    exits: point.exits,
    occupancy: point.occupancy,
  };
}

function scenario(id, name, lineCountId, actionMultiplier) {
  return {
    active: true,
    company_id: "company",
    id,
    lines: [
      {
        action_multiplier: actionMultiplier,
        line_count_id: lineCountId,
      },
    ],
    name,
  };
}

function aggregateRow(bucket, lineCountId, total) {
  return {
    bucket,
    camera_id: "camera",
    line_count_id: lineCountId,
    metric_type: "count",
    total,
  };
}

function normalizeAggregateRows(rows) {
  return rows
    .map((row) => ({
      bucket: row.bucket,
      camera_id: row.camera_id,
      line_count_id: row.line_count_id,
      metric_type: row.metric_type,
      object_class: row.object_class,
      total: row.total,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function analysisData({
  baseline = {},
  baselineComparable,
  dayRows = [],
  hourRows = [],
  minuteRows = [],
  monthRows = [],
} = {}) {
  return {
    baseline,
    ...(baselineComparable ? { baselineComparable } : {}),
    contextHour: { granularity: "hour", rows: hourRows },
    day: { granularity: "day", rows: dayRows },
    hour: { granularity: "hour", rows: hourRows },
    minute: { granularity: "minute", rows: minuteRows },
    month: { granularity: "month", rows: monthRows },
  };
}

function analysisWidget(kind, overrides = {}) {
  return {
    baseline: "previous_period",
    createdAt: "2026-07-22T00:00:00.000Z",
    entryScenarioIds: [],
    exitScenarioIds: [],
    granularity: "day",
    id: `test-${kind}`,
    kind,
    scenarioIds: [],
    selectionMode: "all",
    scopeMode: "scenario",
    startHour: 0,
    title: kind,
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

function scenarioFixture(id, name) {
  return {
    active: true,
    company_id: "company-a",
    id,
    lines: [],
    name,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("cenário mantém a mesma cor entre comparativos, ranking e máximos", () => {
  const scenarioIds = ["fila-a", "posto-17", "vaga-204", "vitrine-norte"];
  const widgetColor = "#2563EB";
  const palette = ["#2563EB", "#0F766E", "#B45309", "#7C3AED"];
  const ordered = occupancyScenarioColors.buildOccupancyScenarioColorMap(
    scenarioIds,
    widgetColor,
    palette,
  );
  const reordered = occupancyScenarioColors.buildOccupancyScenarioColorMap(
    [...scenarioIds].reverse(),
    "#DC2626",
    palette,
  );

  scenarioIds.forEach((scenarioId) => {
    assert.equal(ordered.get(scenarioId), reordered.get(scenarioId));
    assert.equal(
      ordered.get(scenarioId),
      occupancyScenarioColors.occupancyScenarioColor(
        scenarioId,
        widgetColor,
        palette,
      ),
    );
  });

  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  assert.match(
    comparisonSource,
    /buildOccupancyScenarioColorMap\([\s\S]*?ensureGraphicContrast\(color, surface, 3\)/,
    "os máximos devem usar o mesmo slot estável e o mesmo contraste por tema",
  );
  assert.equal(
    (comparisonSource.match(/occupancyScenarioColor\(entry\.scenarioId/g) ?? [])
      .length,
    3,
    "meia rosca e as duas orientações de barra devem usar a identidade do cenário",
  );
});

test("todos os gráficos exibem valores permanentes inclinados a 45 graus", () => {
  assert.equal(chartValueLabels.CHART_VALUE_LABEL_ANGLE, 45);
  const valueLabelBindings = {
    CHART_VALUE_LABEL_ANGLE: chartValueLabels.CHART_VALUE_LABEL_ANGLE,
    chartValueLabelRightPadding: chartValueLabels.chartValueLabelRightPadding,
    chartValueLabelTopPadding: chartValueLabels.chartValueLabelTopPadding,
    composeChartValueLabelLayout:
      chartValueLabels.composeChartValueLabelLayout,
  };
  const applyChartTypePreference = loadStandaloneFunction(
    "components/app/echart.tsx",
    "applyChartTypePreference",
    valueLabelBindings,
  );
  const resolveLineValueLabelPresentation = loadStandaloneFunction(
    "components/app/echart.tsx",
    "resolveLineValueLabelPresentation",
    valueLabelBindings,
  );
  const formatChartValueLabel = loadStandaloneFunction(
    "components/app/echart.tsx",
    "formatChartValueLabel",
  );
  const firstAxisType = loadStandaloneFunction(
    "components/app/echart.tsx",
    "firstAxisType",
  );
  const isDecorativeChartSeries = loadStandaloneFunction(
    "components/app/echart.tsx",
    "isDecorativeChartSeries",
  );
  const numericGridOffset = loadStandaloneFunction(
    "components/app/echart.tsx",
    "numericGridOffset",
  );
  const categoryAxisLength = loadStandaloneFunction(
    "components/app/echart.tsx",
    "categoryAxisLength",
  );
  const valueLabelGrid = loadStandaloneFunction(
    "components/app/echart.tsx",
    "valueLabelGrid",
    { ...valueLabelBindings, numericGridOffset },
  );
  const chartPointCount = loadStandaloneFunction(
    "components/app/echart.tsx",
    "chartPointCount",
    { categoryAxisLength },
  );
  const enhanceInteractiveChartOption = loadStandaloneFunction(
    "components/app/echart.tsx",
    "enhanceInteractiveChartOption",
    {
      ...valueLabelBindings,
      categoryAxisLength,
      chartPointCount,
      firstAxisType,
      formatChartValueLabel,
      isDecorativeChartSeries,
      resolveLineValueLabelPresentation,
      valueLabelGrid,
    },
  );
  const cumulativePeriod = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-08-01",
    "2026-08-31",
  );
  assert.ok(cumulativePeriod);
  const cumulativeScenario = scenario(
    "cumulative-entry",
    "Entrada acumulada",
    "line-cumulative-entry",
    1,
  );
  const cumulativeModel = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      baseline: {
        previous_period: {
          granularity: "day",
          rows: Array.from({ length: 31 }, (_, index) =>
            aggregateRow(
              `2026-07-${String(index + 1).padStart(2, "0")}`,
              "line-cumulative-entry",
              index + 10,
            ),
          ),
        },
      },
      dayRows: Array.from({ length: 31 }, (_, index) =>
        aggregateRow(
          `2026-08-${String(index + 1).padStart(2, "0")}`,
          "line-cumulative-entry",
          index + 20,
        ),
      ),
    }),
    period: cumulativePeriod,
    scenarios: [cumulativeScenario],
    widget: analysisWidget("cumulative"),
  });
  assert.equal(cumulativeModel.hasData, true);
  assert.ok(cumulativeModel.option);
  const cumulativeInteractiveOption = enhanceInteractiveChartOption(
    cumulativeModel.option,
    false,
    "always",
  );
  const cumulativeValueSeries = cumulativeInteractiveOption.series.filter(
    (series) => series.type === "bar" && series.silent !== true,
  );
  assert.equal(cumulativeValueSeries.length, 2);
  for (const series of cumulativeValueSeries) {
    assert.equal(series.data.length, 31);
    assert.equal(series.label.show, true);
    assert.equal(typeof series.label.formatter, "function");
    assert.notEqual(
      series.label.formatter({ value: series.data.at(-1) }),
      "",
      `${series.name}: o último acumulado deve nascer visível, sem hover`,
    );
  }
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2025-01-01", "line-entry", 80),
      aggregateRow("2025-02-01", "line-entry", 120),
      aggregateRow("2026-01-01", "line-entry", 100),
      aggregateRow("2026-02-01", "line-entry", 160),
    ],
    now: new Date(2026, 2, 1),
    period: {
      from: new Date(2025, 0, 1),
      to: new Date(2026, 2, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const compactLinePresentation = resolveLineValueLabelPresentation("auto");

  assert.deepEqual(compactLinePresentation, {
    align: "left",
    distance: 7,
    position: "top",
    rotate: 45,
    show: true,
    verticalAlign: "middle",
  });

  const annualOptions = [
    countingIntelligence.buildAnnualComparisonChartOption(model),
    countingIntelligence.buildAnnualAccumulatedComparisonChartOption(model),
  ];
  for (const option of annualOptions) {
    for (const lineSeries of option.series.filter(
      (series) => series.type === "line" && series.lineStyle?.color,
    )) {
      assert.equal(
        lineSeries.itemStyle?.color,
        lineSeries.lineStyle.color,
        `${lineSeries.name}: a legenda anual deve usar a cor do traço`,
      );
    }
    const originalValueSeries = option.series.filter(
      (series) => series.type === "bar" && series.silent !== true,
    );
    assert.ok(originalValueSeries.length >= 2);
    originalValueSeries.forEach((series) => {
      assert.equal(series.label.rotate, 45);
    });

    const converted = applyChartTypePreference(option, "line");
    const valueSeries = converted.series.filter(
      (series) => series.type === "line" && series.silent !== true,
    );

    assert.ok(valueSeries.length >= 2);
    for (const series of valueSeries) {
      assert.equal(series.data.length, 12);
      assert.equal(series.label.rotate, 45);
      assert.equal(series.label.show, true);
      assert.equal(series.labelLayout({ dataIndex: 0 }).hideOverlap, false);
    }
  }

  const preservedLayoutCallback = applyChartTypePreference(
    {
      series: [
        {
          data: [10, 20],
          labelLayout: ({ dataIndex }) => ({ dx: dataIndex + 1 }),
          type: "bar",
        },
      ],
      xAxis: { data: ["A", "B"], type: "category" },
      yAxis: { type: "value" },
    },
    "line",
  ).series[0].labelLayout;
  assert.deepEqual(preservedLayoutCallback({ dataIndex: 0 }), {
    dx: 1,
    hideOverlap: false,
    rotate: 45,
  });
  assert.deepEqual(preservedLayoutCallback({ dataIndex: 1 }), {
    dx: 2,
    hideOverlap: false,
    rotate: 45,
  });

  const currentYearOption = currentYearChart.buildCurrentYearComparisonOption(
    Array.from({ length: 12 }, (_, month) => ({
      accumulated: (month + 1) * 100,
      label: `M${month + 1}`,
      month,
      value: (month + 1) * 10,
    })),
    false,
    2026,
  );
  assert.equal(currentYearOption.series[0].label.rotate, 45);
  const currentYearAverage = currentYearOption.series.find(
    (series) => series.type === "line",
  );
  assert.ok(currentYearAverage);
  assert.equal(
    currentYearAverage.itemStyle.color,
    currentYearAverage.lineStyle.color,
  );

  const interactiveVertical = enhanceInteractiveChartOption(
    {
      grid: { right: 8, top: 8 },
      series: [
        { data: [0, 1_234_567.8], name: "Barras", type: "bar" },
        { data: [0, 1_234_567.8], name: "Linha", type: "line" },
      ],
      xAxis: { data: ["Jan", "Fev"], type: "category" },
      yAxis: { type: "value" },
    },
    false,
    "always",
  );
  assert.equal(interactiveVertical.series[0].label.rotate, 45);
  assert.equal(interactiveVertical.series[0].label.show, true);
  assert.equal(interactiveVertical.series[1].label.rotate, 45);
  assert.equal(interactiveVertical.series[1].label.show, true);
  assert.deepEqual(interactiveVertical.series[0].labelLayout({ dataIndex: 1 }), {
    hideOverlap: true,
    rotate: 45,
  });
  assert.deepEqual(interactiveVertical.series[1].labelLayout({ dataIndex: 1 }), {
    hideOverlap: false,
    rotate: 45,
  });
  assert.deepEqual(interactiveVertical.series[1].labelLayout({ dataIndex: 0 }), {
    hideOverlap: false,
    rotate: 45,
  });
  assert.ok(
    interactiveVertical.grid.top > 56,
    "o maior valor inclinado deve ampliar dinamicamente a margem superior",
  );
  assert.ok(
    interactiveVertical.grid.right > 24,
    "o valor inclinado deve reservar sua projeção também na borda direita",
  );
  const uniformAngledLayout = chartValueLabels.composeChartValueLabelLayout(
    undefined,
    { angled: true, hideOverlap: false },
  );
  assert.deepEqual(uniformAngledLayout({ dataIndex: 0 }), {
    hideOverlap: false,
    rotate: 45,
  });
  assert.deepEqual(uniformAngledLayout({ dataIndex: 1 }), {
    hideOverlap: false,
    rotate: 45,
  });

  const interactiveHorizontal = enhanceInteractiveChartOption(
    {
      grid: { right: 8, top: 8 },
      series: [{ data: [10, 20], name: "Ranking", type: "bar" }],
      xAxis: { type: "value" },
      yAxis: { data: ["A", "B"], type: "category" },
    },
    false,
    "always",
  );
  assert.equal(interactiveHorizontal.series[0].label.rotate, 0);
  assert.equal(interactiveHorizontal.series[0].label.position, "right");
  assert.deepEqual(interactiveHorizontal.series[0].labelLayout({ dataIndex: 1 }), {
    hideOverlap: true,
    moveOverlap: "shiftY",
  });
  assert.equal(interactiveHorizontal.grid.right, 58);
  assert.equal(interactiveHorizontal.grid.top, 8);

  const hiddenLineLabels = enhanceInteractiveChartOption(
    {
      grid: { right: 8, top: 8 },
      series: [
        {
          data: [10, 20],
          label: { show: true },
          name: "Minuto a minuto",
          type: "line",
        },
      ],
      xAxis: { data: ["10:00", "10:01"], type: "category" },
      yAxis: { type: "value" },
    },
    false,
    "none",
  );
  assert.equal(hiddenLineLabels.series[0].label.show, false);
  assert.equal(hiddenLineLabels.grid.top, 8);

  assert.equal(resolveLineValueLabelPresentation("auto").show, true);
  assert.equal(resolveLineValueLabelPresentation("always").show, true);
  assert.equal(resolveLineValueLabelPresentation("none").show, false);
  assert.equal(formatChartValueLabel(0), "0");
  assert.equal(formatChartValueLabel(null), "");
  assert.equal(formatChartValueLabel(undefined), "");
  assert.equal(formatChartValueLabel(""), "");

  const chartSource = readFileSync(
    resolve(projectRoot, "components/app/echart.tsx"),
    "utf8",
  );
  assert.match(
    chartSource,
    /valueLabels\s*=\s*"always"/,
    "o modo público padrão deve renderizar valores sem depender de hover",
  );
  assert.match(chartSource, /hideOverlap: !showEveryLinePoint/);
  assert.match(
    chartSource,
    /composeChartValueLabelLayout\(existingLabelLayout,[\s\S]*?hideOverlap: !showEveryLinePoint/,
  );
  assert.match(chartSource, /chartValueLabelTopPadding\(visibleValueLabelSeries/);
  assert.match(chartSource, /chartValueLabelRightPadding/);

  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const occupancyLiveSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const occupancyReportsSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  assert.match(realtimeSource, /valueLabels="none"/);
  for (const source of [occupancyLiveSource, occupancyReportsSource]) {
    assert.match(
      source,
      /definition\.granularity === "minute" \? "none" : undefined/,
    );
  }

  const exportSource = readFileSync(
    resolve(projectRoot, "lib/report-export.ts"),
    "utf8",
  );
  assert.match(exportSource, /CHART_VALUE_LABEL_ANGLE/);
  assert.match(exportSource, /hideOverlap: !isLine/);
  assert.doesNotMatch(
    exportSource,
    /numericValue === 0[\s\S]{0,80}return ""/,
  );
  const formatBarLabelValue = loadStandaloneFunction(
    "lib/report-export.ts",
    "formatBarLabelValue",
  );
  const isExportReferenceSeries = loadStandaloneFunction(
    "lib/report-export.ts",
    "isExportReferenceSeries",
  );
  const addExportValueLabel = loadStandaloneFunction(
    "lib/report-export.ts",
    "addExportValueLabel",
    {
      ...valueLabelBindings,
      formatBarLabelValue,
      isExportReferenceSeries,
    },
  );
  const exportGridPercentage = loadStandaloneFunction(
    "lib/report-export.ts",
    "exportGridPercentage",
  );
  const exportGridTop = loadStandaloneFunction(
    "lib/report-export.ts",
    "exportGridTop",
    {
      chartValueLabelTopPadding: chartValueLabels.chartValueLabelTopPadding,
      exportGridPercentage,
    },
  );
  const exportGridRight = loadStandaloneFunction(
    "lib/report-export.ts",
    "exportGridRight",
    {
      chartValueLabelRightPadding:
        chartValueLabels.chartValueLabelRightPadding,
      exportGridPercentage,
    },
  );
  const exportedLine = addExportValueLabel(
    { data: [0, 1_234_567.8], type: "line" },
    false,
    false,
  );
  const exportedVerticalBar = addExportValueLabel(
    { data: [0, 1_234_567.8], type: "bar" },
    false,
    false,
  );
  const exportedHorizontalBar = addExportValueLabel(
    { data: [0, 20], type: "bar" },
    false,
    true,
  );
  assert.equal(exportedLine.label.rotate, 45);
  assert.deepEqual(exportedLine.labelLayout({ dataIndex: 1 }), {
    hideOverlap: false,
    rotate: 45,
  });
  assert.equal(exportedVerticalBar.label.rotate, 45);
  assert.deepEqual(exportedVerticalBar.labelLayout({ dataIndex: 1 }), {
    hideOverlap: true,
    rotate: 45,
  });
  assert.equal(exportedHorizontalBar.label.rotate, 0);
  assert.equal(exportedHorizontalBar.label.position, "right");
  assert.equal(exportedLine.label.formatter({ value: 0 }), "0");
  assert.equal(formatBarLabelValue({ value: ["2026-08", 1_234.5] }), "1.234,5");
  const exportedMinuteLine = addExportValueLabel(
    { data: Array.from({ length: 120 }, (_, index) => index), type: "line" },
    true,
    false,
  );
  assert.equal(exportedMinuteLine.label.formatter({ dataIndex: 0, value: 0 }), "0");
  assert.equal(exportedMinuteLine.label.formatter({ dataIndex: 1, value: 1 }), "");
  assert.equal(
    exportedMinuteLine.label.formatter({ dataIndex: 119, value: 119 }),
    "119",
  );
  assert.ok(exportGridTop(8, false, false, [exportedLine]) > 56);
  assert.ok(exportGridRight(8, false, [exportedLine]) > 24);
  assert.equal(exportGridTop("40%", false, false, [exportedLine]), "40%");
  assert.equal(exportGridRight("40%", false, [exportedLine]), "40%");
  const hiddenExportLabel = { label: { show: false }, type: "line" };
  assert.equal(
    addExportValueLabel(hiddenExportLabel, false, false),
    hiddenExportLabel,
  );

  for (const relativePath of [
    "components/app/echart.tsx",
    "lib/chart-value-labels.ts",
    "lib/counting-intelligence.ts",
    "lib/current-year-chart.ts",
    "lib/report-export.ts",
  ]) {
    const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /\brotate:\s*90\b/,
      `${relativePath} não pode reintroduzir rótulos numéricos a 90 graus`,
    );
    assert.doesNotMatch(
      source,
      /\brotate:\s*-\s*CHART_VALUE_LABEL_ANGLE\b/,
      `${relativePath} não pode inclinar o último rótulo para a esquerda`,
    );
    assert.match(
      source,
      /CHART_VALUE_LABEL_ANGLE/,
      `${relativePath} deve usar o ângulo compartilhado`,
    );
  }

  const scenarioComparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  assert.match(
    scenarioComparisonSource,
    /const granularity = fitScenarioGranularityToRange\([\s\S]*?settings\.granularity,[\s\S]*?range\.from,[\s\S]*?range\.to/,
    "intervalos personalizados extensos devem consolidar antes de renderizar rótulos",
  );
  assert.doesNotMatch(
    scenarioComparisonSource,
    /const granularity = periodOverride\s*\?/,
  );
});

test("exportação executiva separa gráficos e dados sem reduzir tabelas extensas", () => {
  const source = readFileSync(
    resolve(projectRoot, "lib/report-export.ts"),
    "utf8",
  );
  const actionsSource = readFileSync(
    resolve(projectRoot, "components/app/report-export-actions.tsx"),
    "utf8",
  );

  assert.match(source, /fitToHeight: 0/);
  assert.match(source, /fitToWidth: 0/);
  assert.match(source, /safeSheetName\(`Gráfico \$\{index \+ 1\}/);
  assert.match(source, /signal\?: AbortSignal/);
  assert.match(source, /options\.signal\?\.throwIfAborted\(\)/);
  assert.match(source, /signal: options\.signal/);
  assert.match(actionsSource, /signal: controller\.signal/);
  assert.match(actionsSource, /if \(isExportAbort\(error, controller\.signal\)\) return;/);
  assert.match(source, /safeSheetName\(`Dados \$\{index \+ 1\}/);
  assert.match(source, /fitToHeight: 1/);
  assert.match(source, /pageSetup\.printTitlesRow/);
  assert.match(source, /pageSetup\.printTitlesColumn = "A:A"/);
  assert.match(source, /buildExcelDataSheetHeader/);
  assert.match(source, /excelNumberFormat\(value\)/);
  assert.match(source, /#,##0\.0########/);
  assert.match(source, /drawPdfPageFooters/);
  assert.match(source, /drawPdfParagraph/);
  assert.match(source, /drawPdfFittedText/);
  assert.match(source, /fontSize: dense \? 9 : 11/);
  assert.match(source, /const tableFontSize = 8\.25/);
  assert.match(source, /if \(mode === "charts"\) return \[\]/);
  assert.match(source, /reportTableDataSignature/);
  assert.match(source, /drawPdfExecutiveAppendices/);
  assert.match(source, /drawPdfContextPages/);
  assert.match(source, /chartExportDensityNote/);
  assert.match(source, /todos os valores permanecem na tabela de dados/);
  assert.match(source, /formatReportDateTime/);
  assert.match(source, /certifiedReportTimeZone/);
  assert.match(source, /width - 42,[\s\S]{0,120}"right"/);
  assert.match(source, /payload\.context\?\.forEach/);
  assert.match(source, /Contexto completo na próxima página/);

  const formatDateTime = loadStandaloneFunction(
    "lib/report-export.ts",
    "formatDateTime",
  );
  const certifiedReportTimeZone = loadStandaloneFunction(
    "lib/report-export.ts",
    "certifiedReportTimeZone",
  );
  const formatReportDateTime = loadStandaloneFunction(
    "lib/report-export.ts",
    "formatReportDateTime",
    { certifiedReportTimeZone, formatDateTime },
  );
  const instant = new Date("2026-08-26T02:30:00.000Z");
  assert.match(
    formatReportDateTime({ timeZone: "America/Sao_Paulo" }, instant),
    /25\/08\/2026.*23:30/,
  );
  assert.match(
    formatReportDateTime({ timeZone: "Asia\/Tokyo" }, instant),
    /26\/08\/2026.*11:30/,
  );

  const reportTableDataSignature = loadStandaloneFunction(
    "lib/report-export.ts",
    "reportTableDataSignature",
  );
  const reportTablesForMode = loadStandaloneFunction(
    "lib/report-export.ts",
    "reportTablesForMode",
    { reportTableDataSignature },
  );
  const sharedTable = {
    columns: [{ key: "period", label: "Período" }],
    rows: [{ period: "Agosto" }],
    title: "Dados",
  };
  assert.deepEqual(
    reportTablesForMode(
      [sharedTable, { ...sharedTable, rows: [{ period: "Setembro" }] }],
      "complete",
      [{ table: sharedTable }],
    ).map((table) => table.rows[0].period),
    ["Setembro"],
  );

  for (const relativePath of [
    "components/app/realtime-dashboard.tsx",
    "components/app/period-analysis-dashboard.tsx",
    "components/app/scenario-reports-dashboard.tsx",
    "components/app/occupancy-scenario-dashboard.tsx",
    "components/app/occupancy-reports-dashboard.tsx",
  ]) {
    const payloadSource = readFileSync(resolve(projectRoot, relativePath), "utf8");
    assert.match(
      payloadSource,
      /timeZone:\s*companyTimeZone|timeZone,\s*\n\s*title:/,
      `${relativePath} deve propagar o fuso IANA ao relatório`,
    );
  }

  const chartPass = source.indexOf('if (mode !== "data")');
  const tablePass = source.indexOf('if (mode !== "charts")', chartPass);
  assert.ok(
    chartPass >= 0 && tablePass > chartPass,
    "o PDF completo deve imprimir todos os gráficos antes das tabelas",
  );

  const pdfTableColumnBand = loadStandaloneFunction(
    "lib/report-export.ts",
    "pdfTableColumnBand",
  );
  const pdfTableColumnMinimumWidth = loadStandaloneFunction(
    "lib/report-export.ts",
    "pdfTableColumnMinimumWidth",
  );
  const splitPdfTableColumns = loadStandaloneFunction(
    "lib/report-export.ts",
    "splitPdfTableColumns",
    { pdfTableColumnBand, pdfTableColumnMinimumWidth },
  );
  const mockDoc = {
    getTextWidth: (text) => String(text).length * 4.2,
    setFont: () => {},
    setFontSize: () => {},
  };
  const columns = [
    { key: "indicator", label: "Indicador" },
    ...Array.from({ length: 14 }, (_, index) => ({
      key: `month_${index}`,
      label: `Mês ${index + 1}`,
      numeric: true,
    })),
  ];
  const bands = splitPdfTableColumns(mockDoc, columns, 758);
  assert.ok(bands.length >= 2, "15 colunas não podem ser espremidas em 6pt");
  assert.ok(bands.every((band) => band.columns[0].key === "indicator"));
  assert.deepEqual(
    bands.flatMap((band) => band.columns.slice(1).map((column) => column.key)),
    columns.slice(1).map((column) => column.key),
  );
});

test("gráficos e modo monitor preservam navegação por teclado", () => {
  const chartSource = readFileSync(
    resolve(projectRoot, "components/app/echart.tsx"),
    "utf8",
  );
  const monitorSource = readFileSync(
    resolve(projectRoot, "components/app/monitor-mode.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );

  assert.match(chartSource, /aria-describedby=\{descriptionId\}/);
  assert.match(chartSource, /aria-label=\{accessibility\.label\}/);
  assert.match(chartSource, /role="group"/);
  assert.match(chartSource, /tabIndex=\{0\}/);
  assert.match(chartSource, /focus-visible:ring-2/);
  assert.match(chartSource, /chartOptionAriaDescription\(option\)/);
  assert.match(monitorSource, /returnFocusRef\.current = activeElement/);
  assert.match(monitorSource, /data-monitor-mode-trigger/);
  assert.match(monitorSource, /focusTarget\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(monitorSource, /buttonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(
    comparisonSource,
    /aria-label="Cenário do mapa de calor por dias e horários"/,
  );
  assert.match(
    comparisonSource,
    /aria-label="Período do mapa de calor por dias e horários"/,
  );
  assert.match(
    comparisonSource,
    /aria-label="Métrica dos mapas de calor de ocupação"/,
  );
});

test("ações individuais dos widgets permanecem no topo direito em qualquer largura", () => {
  const cardLayoutSource = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );
  const compactMetricSource = readFileSync(
    resolve(projectRoot, "components/app/compact-metric-card.tsx"),
    "utf8",
  );
  const actionSource = readFileSync(
    resolve(projectRoot, "components/app/widget-card-actions.tsx"),
    "utf8",
  );
  const periodSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const responsiveGrid = /grid-cols-\[minmax\(0,1fr\)_auto\]/g;

  assert.match(actionSource, /data-widget-actions/);
  assert.match(actionSource, /role="group"/);
  assert.match(
    actionSource,
    /flex shrink-0 flex-nowrap items-center justify-end gap-0\.5 self-start justify-self-end/,
  );
  assert.equal((periodSource.match(responsiveGrid) ?? []).length >= 1, true);
  assert.equal((occupancySource.match(responsiveGrid) ?? []).length >= 3, true);
  assert.equal((realtimeSource.match(responsiveGrid) ?? []).length >= 8, true);
  assert.equal((comparisonSource.match(responsiveGrid) ?? []).length >= 1, true);
  assert.equal((reportsSource.match(responsiveGrid) ?? []).length >= 2, true);
  assert.match(
    periodSource,
    /<WidgetCardActions label=\{`Ações do widget \$\{widget\.title\}`\}>[\s\S]*?title="Configurar widget"[\s\S]*?title="Remover widget"/,
  );
  assert.match(
    occupancySource,
    /<EmptyOccupancyCard action=\{action\} title=\{widget\.title\} \/>/,
  );
  assert.match(comparisonSource, /col-span-full flex min-w-0 flex-wrap/);
  assert.match(reportsSource, /<WidgetCardActions label=\{`Ações do widget/);
  assert.match(cardLayoutSource, /data-layout-card-configure/);
  assert.match(
    cardLayoutSource,
    /configureEnabled && !reorderEnabled[\s\S]*?title="Configurar widget"/,
  );
  assert.match(
    cardLayoutSource,
    /setOrganizerSelectedCardId\(card\.id\);[\s\S]*?setOrganizerOpen\(true\)/,
    "a engrenagem deve abrir diretamente o inspetor do próprio widget",
  );
  assert.match(
    cardLayoutSource,
    /selectedCardId=\{organizerSelectedCardId\}/,
  );
  assert.match(
    compactMetricSource,
    /data-compact-metric-header/,
    "o KPI compacto deve reservar o canto superior direito para a configuração",
  );
  assert.match(realtimeSource, /<CardLayout[\s\S]*?showCardConfigurationActions/);
  assert.match(occupancySource, /<CardLayout[\s\S]*?showCardConfigurationActions/);
});

test("Resumo do período permanece legível com 37 cenários e valores extensos", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-01",
    "2026-07-31",
  );
  assert.ok(period);
  const scenarios = Array.from({ length: 37 }, (_, index) =>
    scenario(
      `scenario-${index}`,
      `Cenario_operacional_com_nome_extenso_${index}`,
      `line-${index}`,
      1,
    ),
  );
  const unit = 9_007_199_000;
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      dayRows: Array.from({ length: scenarios.length }, (_, index) =>
        aggregateRow("2026-07-22", `line-${index}`, (index + 1) * unit),
      ),
    }),
    period,
    scenarios,
    widget: analysisWidget("summary"),
  });
  const expectedTotal =
    unit * ((scenarios.length * (scenarios.length + 1)) / 2);

  assert.equal(model.metrics?.length, 4);
  assert.equal(model.metrics?.[0]?.value, expectedTotal);
  assert.equal(
    model.metrics?.[3]?.value,
    "Cenario_operacional_com_nome_extenso_36",
  );
  assert.equal(
    scenarioAnalytics.scenarioSelectionSummary(scenarios, "all", []),
    "Todos os cenários (37)",
  );

  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const cardSection = source.slice(
    source.indexOf("function PeriodAnalysisCard"),
    source.indexOf("function WidgetDialog"),
  );

  assert.match(cardSection, /data-period-analysis-card/);
  assert.match(cardSection, /data-analysis-card-header/);
  assert.match(cardSection, /data-analysis-card-badges/);
  assert.match(cardSection, /data-analysis-metric-grid/);
  assert.match(
    source,
    /defaultHeight:[\s\S]*?widget\.kind === "summary"[\s\S]*?\? \("standard" as const\)/,
    "o Resumo deve começar em altura standard sem impedir outro ajuste",
  );
  assert.match(
    cardSection,
    /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,8rem\),1fr\)\)\]/,
  );
  assert.match(cardSection, /flex-1 !overflow-hidden/);
  assert.match(cardSection, /self-stretch overflow-hidden rounded-md/);
  assert.doesNotMatch(
    cardSection.slice(
      cardSection.indexOf("function MetricGrid"),
      cardSection.indexOf("function AnalysisTable"),
    ),
    /overflow-(?:auto|scroll|x-auto|y-auto)/,
    "KPIs e resumos devem reflow sem barras de rolagem internas",
  );
  assert.match(cardSection, /\[font-size:clamp\(1rem,6cqi,1\.5rem\)\]/);
  assert.match(cardSection, /compactSummary && "!line-clamp-2"/);
  assert.match(cardSection, /compactWidget && "!line-clamp-1"/);
  assert.match(cardSection, /data-analysis-table/);
  assert.match(cardSection, /role="region"/);
  assert.match(cardSection, /table-auto/);
  assert.match(cardSection, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(
    cardSection,
    /\btruncate\b/,
    "valores e badges essenciais não podem usar truncamento de uma linha",
  );
});

test("widgets do Ao Vivo respondem à largura real sem ocultar texto essencial", () => {
  const compactMetricSource = readFileSync(
    resolve(projectRoot, "components/app/compact-metric-card.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const occupancyComparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const scenarioComparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  const section = (source, from, to) =>
    source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  const countingMetric = section(
    realtimeSource,
    "function MetricCard",
    "function metricComparisonClassName",
  );
  const countingTable = section(
    realtimeSource,
    "function ScenarioTotalsTableCard",
    "function LiveAnnualComparisonCard",
  );
  const hourlyOccupancy = section(
    realtimeSource,
    "function HourlyOccupancyCard",
    "function ScenarioCumulativeTotalsCard",
  );
  const occupancyMetric = section(
    occupancySource,
    "function MetricCard",
    "function OccupancyChartCard",
  );
  const occupancyDetail = section(
    occupancySource,
    "function OccupancyScenarioDetailCard",
    "function OccupancyAlertsCard",
  );
  const occupancyAlerts = section(
    occupancySource,
    "function OccupancyAlertsCard",
    "function CardPagination",
  );
  const currentComparison = section(
    occupancyComparisonSource,
    "function OccupancyHalfDonutCard",
    "export function OccupancyStatusColorsDialog",
  );
  const maximumComparison = section(
    occupancyComparisonSource,
    "function OccupancyScenarioMaximumLineCard",
    "function OccupancyHexLayoutCard",
  );
  const heatmapShell = section(
    occupancyComparisonSource,
    "function OccupancyHeatmapCardShell",
    "function ScenarioScopeDialog",
  );
  const scenarioPicker = section(
    occupancyComparisonSource,
    "function ScenarioScopeDialog",
    "function MetricSelect",
  );

  for (const source of [realtimeSource, occupancySource]) {
    assert.match(
      source,
      /\[&_\[data-card-description\]\]:\[overflow-wrap:anywhere\]/,
    );
    assert.match(
      source,
      /\[&_\[data-card-header\]_h3\]:\[overflow-wrap:anywhere\]/,
    );
  }

  assert.match(compactMetricSource, /@container/);
  assert.match(compactMetricSource, /9cqi/);
  assert.match(compactMetricSource, /break-words/);
  assert.match(compactMetricSource, /line-clamp-2/);
  assert.match(compactMetricSource, /data-compact-metric-title/);
  assert.match(compactMetricSource, /data-compact-metric-value/);
  assert.match(compactMetricSource, /data-compact-metric-description/);
  assert.doesNotMatch(
    compactMetricSource,
    /\btruncate\b|overflow-(?:auto|scroll|x-auto|y-auto)/,
  );
  for (const metric of [countingMetric, occupancyMetric]) {
    assert.match(metric, /<CompactMetricCard/);
  }

  assert.match(countingTable, /scrollRegionLabel=/);
  assert.match(countingTable, /className="min-w-\[640px\]"/);
  assert.match(countingTable, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(countingTable, /block truncate/);

  assert.match(hourlyOccupancy, /@container/);
  assert.match(hourlyOccupancy, /@sm:w-\[240px\]/);
  assert.doesNotMatch(hourlyOccupancy, /(?:^|\s)sm:w-\[240px\]/);

  assert.match(occupancyDetail, /@container/);
  assert.match(occupancyDetail, /@sm:grid-cols-/);
  assert.match(occupancyDetail, /visibleAreas/);
  assert.match(occupancySource, /function CardPagination/);
  assert.doesNotMatch(occupancyDetail, /overflow-y-auto/);
  assert.doesNotMatch(occupancyDetail, /\btruncate\b/);
  assert.match(occupancyAlerts, /visibleAlerts/);
  assert.doesNotMatch(occupancyAlerts, /overflow-y-auto/);

  assert.match(currentComparison, /@2xl:grid-cols-/);
  assert.match(currentComparison, /@sm:w-\[180px\]/);
  assert.match(
    currentComparison,
    /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,8\.5rem\),1fr\)\)\]/,
  );
  assert.match(currentComparison, /line-clamp-2 min-w-0 break-words/);
  assert.doesNotMatch(
    currentComparison,
    /overflow-[xy]-auto|min-w-max|whitespace-nowrap/,
  );
  assert.doesNotMatch(currentComparison, /\btruncate\b/);
  assert.match(maximumComparison, /@container/);
  assert.match(maximumComparison, /@xl:grid-cols-/);
  assert.match(heatmapShell, /@container/);
  assert.match(heatmapShell, /@xl:grid-cols-/);
  assert.doesNotMatch(scenarioPicker, /\btruncate\b/);

  assert.match(scenarioComparisonSource, /@container min-w-0 overflow-hidden/);
  assert.match(
    scenarioComparisonSource,
    /CardTitle className="flex min-w-0 items-start gap-2 \[overflow-wrap:anywhere\]"/,
  );
});

test("widgets ECharts se adaptam ao card sem barras de rolagem permanentes", () => {
  const globalsSource = readFileSync(
    resolve(projectRoot, "app/globals.css"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const intelligenceSource = readFileSync(
    resolve(projectRoot, "components/app/counting-intelligence-report.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const section = (source, from, to) => {
    const start = source.indexOf(from);
    return source.slice(start, source.indexOf(to, start));
  };

  const hourly = section(
    realtimeSource,
    "function HourlyOccupancyCard",
    "function ScenarioCumulativeTotalsCard",
  );
  const ranking = section(
    intelligenceSource,
    "function AccessRankingCard",
    "function YearOverYearMatrixCard",
  );
  const comparison = section(
    comparisonSource,
    "export function ScenarioComparisonCard",
    "export function ScenarioComparisonConfigurator",
  );
  const currentComparison = section(
    occupancySource,
    "function OccupancyHalfDonutCard",
    "export function OccupancyStatusColorsDialog",
  );
  const hex = section(
    occupancySource,
    "function OccupancyHexLayoutCard",
    "function OccupancyDayHourHeatmapCard",
  );

  assert.match(
    globalsSource,
    /\[data-card-content\]:not\(\[data-echart-layout="natural"\]\)/,
  );
  for (const widget of [hourly, ranking, comparison, currentComparison, hex]) {
    assert.match(widget, /data-echart-layout="natural"/);
  }

  assert.match(hourly, /<DialogTitle>Configurar ocupação hora a hora<\/DialogTitle>/);
  assert.match(ranking, /<DialogTitle>Selecionar cenários do ranking<\/DialogTitle>/);
  assert.match(comparison, /<DialogTitle>Configurar comparação por cenário<\/DialogTitle>/);
  assert.doesNotMatch(comparison, /enterprise-horizontal-scroll|min-w-\[720px\]/);
  assert.doesNotMatch(ranking, /max-h-\[640px\]|chartHeight/);

  assert.match(currentComparison, /flex min-h-0 flex-1 flex-col overflow-hidden/);
  assert.match(currentComparison, /const pageSize = 8/);
  assert.doesNotMatch(
    currentComparison,
    /overflow-[xy]-auto|min-w-max|whitespace-nowrap/,
  );
  assert.match(
    hex,
    /grid-rows-\[minmax\(0,1fr\)_auto_auto\][^\"]*overflow-hidden/,
  );
  assert.doesNotMatch(hex, /max-h-\[520px\] overflow-auto|minWidth:/);
});

test("widgets de Ocupação ao vivo respeitam os seis níveis de altura do Bento", () => {
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const section = (source, from, to) => {
    const start = source.indexOf(from);
    assert.notEqual(start, -1, `seção ${from} deve existir`);
    const end = source.indexOf(to, start);
    assert.notEqual(end, -1, `limite ${to} deve existir`);
    return source.slice(start, end);
  };

  const occupancyChart = section(
    occupancySource,
    "function OccupancyChartCard",
    "function MetricVisibilityControls",
  );
  const occupancyEmpty = section(
    occupancySource,
    "function EmptyChartState",
    "function buildOccupancyLiveDataPlan",
  );
  const comparisonCharts = section(
    comparisonSource,
    "function OccupancyBarRaceCard",
    "function OccupancyHexLayoutCard",
  );
  const comparisonHeatmaps = section(
    comparisonSource,
    "function OccupancyDayHourHeatmapCard",
    "function ScenarioScopeDialog",
  );
  const comparisonStates = section(
    comparisonSource,
    "function ChartSkeleton",
    "function buildHalfDonutOption",
  );

  assert.match(
    occupancyChart,
    /CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden"/,
  );
  assert.match(
    occupancyChart,
    /className="h-full min-h-0 min-w-0 flex-1 overflow-hidden"/,
  );
  assert.match(occupancyEmpty, /h-full min-h-0 min-w-0 flex-1/);
  assert.match(comparisonCharts, /h-full min-h-0 w-full flex-1/);
  assert.match(
    comparisonHeatmaps,
    /h-full min-h-0 min-w-0 flex-1 overflow-hidden/,
  );
  assert.match(
    comparisonStates,
    /Skeleton className="h-full min-h-0 w-full flex-1 self-stretch"/,
  );
  assert.match(comparisonStates, /h-full min-h-0 min-w-0 flex-1 self-stretch/);

  for (const responsiveSection of [
    occupancyChart,
    occupancyEmpty,
    comparisonCharts,
    comparisonHeatmaps,
    comparisonStates,
  ]) {
    assert.doesNotMatch(
      responsiveSection,
      /(?:min-)?h-\[(?:150|180|190|210|225|230|260|330|390)px\]/,
    );
  }
});

test("widgets de Contagem preenchem os seis níveis de altura do Bento", () => {
  const periodSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  const intelligenceSource = readFileSync(
    resolve(projectRoot, "components/app/counting-intelligence-report.tsx"),
    "utf8",
  );
  const section = (source, from, to) => {
    const start = source.indexOf(from);
    assert.notEqual(start, -1, `seção ${from} deve existir`);
    const end = source.indexOf(to, start);
    assert.notEqual(end, -1, `limite ${to} deve existir`);
    return source.slice(start, end);
  };

  const periodCard = section(
    periodSource,
    "function PeriodAnalysisCard",
    "function WidgetDialog",
  );
  const periodState = section(
    periodSource,
    "function EmptyState",
    "function emptyWidgetForm",
  );
  const realtimeCards = section(
    realtimeSource,
    "function MinuteDayChartCard",
    "function buildRealtimeChartDefinitions",
  );
  const scenarioCard = section(
    comparisonSource,
    "export function ScenarioComparisonCard",
    "export function ScenarioComparisonConfigurator",
  );
  const scenarioState = section(
    comparisonSource,
    "function ChartState",
    "export async function fetchScenarioComparisonRows",
  );
  const reportCards = section(
    intelligenceSource,
    "function ExecutiveChartCard",
    "function YearComparisonValueRow",
  );

  assert.match(periodCard, /flex h-full min-h-0 min-w-0 flex-col overflow-hidden/);
  assert.match(
    periodCard,
    /flex min-h-0 min-w-0 flex-col flex-1 !overflow-hidden/,
  );
  assert.match(periodCard, /h-full min-h-0 w-full flex-1 self-stretch/);
  assert.match(periodState, /h-full min-h-0 min-w-0 flex-1 self-stretch/);

  assert.match(realtimeCards, /flex h-full min-h-0 min-w-0 flex-col overflow-hidden/);
  assert.match(
    realtimeCards,
    /flex min-h-0 min-w-0 flex-1 flex-col (?:gap-3 )?overflow-hidden/,
  );
  assert.match(realtimeCards, /h-full min-h-0 w-full flex-1 self-stretch/);
  assert.match(
    realtimeCards,
    /min-h-0 min-w-0 flex-1 overflow-auto rounded-md border/,
  );

  assert.match(scenarioCard, /flex h-full min-h-0 flex-col/);
  assert.match(
    scenarioCard,
    /flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden/,
  );
  assert.match(scenarioCard, /h-full min-h-0 w-full flex-1 self-stretch/);
  assert.match(scenarioState, /h-full min-h-0 min-w-0 w-full flex-1 self-stretch/);

  assert.match(reportCards, /flex h-full min-h-0 min-w-0 flex-col overflow-hidden/);
  assert.match(
    reportCards,
    /flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden/,
  );
  assert.match(reportCards, /h-full min-h-0 w-full flex-1 self-stretch/);

  for (const responsiveSection of [
    periodCard,
    periodState,
    realtimeCards,
    scenarioCard,
    scenarioState,
    reportCards,
  ]) {
    assert.doesNotMatch(
      responsiveSection,
      /(?:min-)?h-\[(?:150|160|180|190|200|220|240|250|260|310|320|360)px\]/,
    );
  }
});

test("widgets de Relatórios preservam títulos, métricas e contexto dentro do card", () => {
  const compactMetricSource = readFileSync(
    resolve(projectRoot, "components/app/compact-metric-card.tsx"),
    "utf8",
  );
  const globalsSource = readFileSync(
    resolve(projectRoot, "app/globals.css"),
    "utf8",
  );
  const appearanceSource = readFileSync(
    resolve(projectRoot, "components/app/widget-appearance.tsx"),
    "utf8",
  );
  const cardSource = readFileSync(
    resolve(projectRoot, "components/ui/card.tsx"),
    "utf8",
  );
  const intelligenceSource = readFileSync(
    resolve(projectRoot, "components/app/counting-intelligence-report.tsx"),
    "utf8",
  );
  const occupancyReportsSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const scenarioReportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const section = (source, from, to) =>
    source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  const executiveMetric = section(
    intelligenceSource,
    "function ExecutiveMetricCard",
    "function AnnualComparisonCard",
  );
  const executiveCharts = section(
    intelligenceSource,
    "function ExecutiveChartCard",
    "function YearComparisonValueRow",
  );
  const occupancyMetric = section(
    occupancyReportsSource,
    "function MetricCard",
    "function OccupancyReportChartCard",
  );
  const occupancyChart = section(
    occupancyReportsSource,
    "function OccupancyReportChartCard",
    "function EmptyChartState",
  );

  assert.match(appearanceSource, /title=\{title\}/);
  assert.match(appearanceSource, /line-clamp-2/);
  assert.match(appearanceSource, /\[overflow-wrap:anywhere\]/);
  assert.match(cardSource, /data-card-content[\s\S]*?\[overflow-wrap:anywhere\]/);
  assert.match(
    globalsSource,
    /\[data-layout-card-id\] \[data-card-content\] \{[\s\S]*?overflow: hidden;/,
  );

  assert.match(compactMetricSource, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(compactMetricSource, /1\.625rem/);
  assert.match(compactMetricSource, /data-compact-metric-meta/);
  assert.match(executiveMetric, /<CompactMetricCard/);
  assert.match(executiveMetric, /line-clamp-1/);
  assert.doesNotMatch(executiveMetric, /\btruncate\b/);

  assert.match(executiveCharts, /whitespace-normal break-words/);
  assert.match(executiveCharts, /enterprise-horizontal-scroll/);
  assert.match(executiveCharts, /grid-cols-\[minmax\(0,1fr\)_auto\]/);

  assert.match(occupancyMetric, /<CompactMetricCard/);
  assert.doesNotMatch(occupancyMetric, /\btruncate\b/);
  assert.match(occupancyChart, /grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(occupancyChart, /whitespace-normal break-words/);
  assert.match(
    scenarioReportsSource,
    /CardTitle className="flex min-w-0 items-start gap-2"/,
  );
});

test("réguas principais mantêm filtros e ações na mesma linha compacta", () => {
  const globalsSource = readFileSync(
    resolve(projectRoot, "app/globals.css"),
    "utf8",
  );
  const analysisSource = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const occupancySource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );

  const toolbarSection = (source, label, endMarker) => {
    const labelIndex = source.indexOf(`aria-label="${label}"`);
    assert.notEqual(labelIndex, -1, `régua ausente: ${label}`);
    const start = source.lastIndexOf('<div className="@container', labelIndex);
    const end = source.indexOf(endMarker, labelIndex);
    assert.notEqual(start, -1, `container ausente: ${label}`);
    assert.notEqual(end, -1, `limite ausente: ${label}`);
    return source.slice(start, end);
  };

  const analysisToolbar = toolbarSection(
    analysisSource,
    "Controles da análise de Contagem",
    "{loadingScenarios && !scopeOptions.length",
  );
  const realtimeToolbar = toolbarSection(
    realtimeSource,
    "Controles da visão ao vivo de Contagem",
    "{operationalSettingsOpen ? (",
  );
  const occupancyToolbar = toolbarSection(
    occupancySource,
    "Controles da visão de ocupação",
    "{operationalSettingsOpen ? (",
  );

  for (const toolbar of [analysisToolbar, realtimeToolbar, occupancyToolbar]) {
    assert.match(toolbar, /@container/);
    assert.match(toolbar, /grid[^\"]*grid-cols-\[/);
    assert.match(toolbar, /row-start-1/);
    assert.match(toolbar, /flex-nowrap/);
    assert.doesNotMatch(
      toolbar,
      /enterprise-horizontal-scroll|overflow-x-auto|tabIndex=\{0\}|row-start-2/,
    );
  }

  assert.match(
    realtimeToolbar,
    /grid-cols-\[80px_minmax\(0,104px\)_minmax\(212px,1fr\)\]/,
  );
  assert.match(
    realtimeToolbar,
    /aria-label="Ações da visão ao vivo de Contagem"[\s\S]*?ml-auto flex shrink-0 flex-nowrap/,
  );
  assert.match(
    occupancyToolbar,
    /grid-cols-\[minmax\(0,96px\)_minmax\(0,64px\)_minmax\(248px,1fr\)\]/,
  );
  assert.match(occupancyToolbar, /<OccupancyPaletteSelect[\s\S]*?compact[\s\S]*?fluid/);
  assert.match(
    occupancyToolbar,
    /aria-label="Ações da visão de ocupação"[\s\S]*?ml-auto flex shrink-0 flex-nowrap/,
  );
  assert.match(
    analysisToolbar,
    /grid-cols-\[32px_minmax\(32px,1fr\)_176px\]/,
  );
  assert.match(
    analysisToolbar,
    /aria-label="Ações da análise de Contagem"[\s\S]*?col-start-3 row-start-1[\s\S]*?flex-nowrap/,
  );
  assert.match(
    analysisSource,
    /ANALYSIS_READABLE_BADGE_CLASS_NAME\s*=\s*[\s\S]*?whitespace-normal/,
  );

  assert.match(
    globalsSource,
    /\[data-card-header\] > div\.flex \{/,
  );
  assert.doesNotMatch(
    globalsSource,
    /\[data-card-header\] > \.flex \{/,
  );
});

test("operador carrega Contagem por cenário sem consultar catálogos administrativos", () => {
  const sources = [
    "components/app/realtime-dashboard.tsx",
    "components/app/period-analysis-dashboard.tsx",
    "components/app/scenario-reports-dashboard.tsx",
  ].map((path) => readFileSync(resolve(projectRoot, path), "utf8"));

  for (const source of sources) {
    assert.match(
      source,
      /const infrastructureCatalogsAllowed = canReadInfrastructureCatalogs\(user\)/,
    );
    assert.match(
      source,
      /infrastructureCatalogsAllowed\s*\? apiFetch<unknown>\("\/cameras"/,
    );
    assert.match(
      source,
      /infrastructureCatalogsAllowed\s*\? apiFetch<unknown>\("\/locations"/,
    );
    assert.match(source, /: Promise\.resolve\(\[\]\)/);
  }

  assert.match(
    sources[0],
    /infrastructureCatalogsAllowed\s*\? fetchRealtimeWorkers\(/,
  );
  assert.match(
    sources[0],
    /Promise\.resolve<OptionalWorkerMetadata>\(\{\s*rows: \[\],\s*warning: "",/,
  );
});

test("Relatórios de Contagem usam mês consolidado e somente bordas do mês aberto", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    comparableDailyRows: [
      aggregateRow("2025-07-01", "line-entry", 300),
      aggregateRow("2026-07-01", "line-entry", 400),
    ],
    comparableHourlyRows: [
      aggregateRow("2025-07-22T10:00:00", "line-entry", 40),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 60),
    ],
    hourlyRows: [],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 900),
      aggregateRow("2026-07-01", "line-entry", 1_000),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });

  assert.equal(model.currentMonthValue, 1_000);
  assert.ok(Math.abs(model.currentMonthDelta - (460 / 340 - 1)) < 1e-12);
  assert.ok(Math.abs(model.periodDelta - (460 / 340 - 1)) < 1e-12);

  const directionalModel = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2026-01-10T10:00:00", "line-entry", 900),
      aggregateRow("2026-07-20T10:00:00", "line-entry", 25),
    ],
    hourlyPeriod: {
      from: new Date(2026, 6, 16),
      to: new Date(2026, 6, 23),
    },
    monthlyRows: [],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: { cameraIds: [], name: "Entrada", scenario: entryScenario },
  });
  assert.equal(directionalModel.directionalHours[10].total, 25);
  assert.deepEqual(
    [
      directionalModel.directionalPeriodFrom.getTime(),
      directionalModel.directionalPeriodTo.getTime(),
    ],
    [new Date(2026, 6, 16).getTime(), new Date(2026, 6, 23).getTime()],
  );

  const source = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    source,
    /COUNTING_INTELLIGENCE_HOUR_CARD_ID_SET[\s\S]*?directionalFlow/,
  );
  const hourlyCardSet = source.slice(
    source.indexOf("const COUNTING_INTELLIGENCE_HOUR_CARD_ID_SET"),
    source.indexOf("const COUNTING_INTELLIGENCE_OPEN_COMPARISON_CARD_ID_SET"),
  );
  assert.doesNotMatch(hourlyCardSet, /accessRanking/);
  assert.match(source, /buildCountingMonthHistoryDefinition/);
  assert.match(source, /buildCountingOpenComparisonDefinitions/);
  const directionalDefinition = source.slice(
    source.indexOf("function buildCountingHourHistoryDefinition"),
    source.indexOf("function buildCountingMonthHistoryDefinition"),
  );
  assert.match(directionalDefinition, /COUNTING_DIRECTIONAL_PROFILE_DAYS/);
  assert.match(directionalDefinition, /Math\.max\(period\.from\.getTime\(\), rollingFrom\.getTime\(\)\)/);
  assert.doesNotMatch(directionalDefinition, /startOfYear|includePreviousYear/);
  assert.match(source, /fetchBoundedHourlyAggregateRanges/);
  assert.match(source, /fetchCompleteAggregateRange/);
  assert.match(
    source,
    /cacheScope: `reports:\$\{companyScopeId \?\? "jwt-company"\}:\$\{companyTimeZone\}`/,
  );
});

test("heatmap dias x meses preserva grade civil, zero e escopo do cenário", () => {
  const selectedScenario = scenario(
    "selected",
    "Entrada selecionada",
    "line-selected",
    2,
  );
  const foreignScenario = scenario(
    "foreign",
    "Entrada fora do widget",
    "line-foreign",
    5,
  );
  const model = countingIntelligence.buildCountingIntelligenceModel({
    dailyRows: [
      aggregateRow("2024-01-31", "line-selected", 0),
      aggregateRow("2024-02-29", "line-selected", 5),
      aggregateRow("2024-02-29", "line-foreign", 100),
      aggregateRow("2024-03-01", "line-selected", 900),
    ],
    hourlyRows: [],
    includeOpenPeriod: true,
    monthlyRows: [],
    now: new Date(2024, 2, 1, 10, 30),
    period: {
      from: new Date(2024, 0, 1),
      to: new Date(2024, 3, 1),
    },
    scenarios: [selectedScenario, foreignScenario],
    scope: {
      cameraIds: [],
      name: "Entrada selecionada",
      scenario: selectedScenario,
    },
  });
  const cell = (month, day) =>
    model.dayMonthHeatmapCells.find(
      (item) => item.month === month && item.day === day,
    );

  assert.equal(model.dayMonthHeatmapCells.length, 12 * 31);
  assert.deepEqual(localDateParts(model.dayMonthHeatmapFrom), [2024, 1, 1]);
  assert.deepEqual(localDateParts(model.dayMonthHeatmapTo), [2024, 3, 1]);
  assert.equal(cell(0, 31)?.total, 0, "zero medido deve continuar certificado");
  assert.deepEqual(localDateParts(cell(1, 29)?.date), [2024, 2, 29]);
  assert.equal(
    cell(1, 29)?.total,
    10,
    "29/02 deve aplicar o multiplicador e ignorar cenário fora do escopo",
  );
  assert.equal(cell(1, 30)?.date, null, "30/02 deve ser indisponível");
  assert.equal(cell(1, 30)?.total, null);
  assert.equal(
    cell(2, 1)?.total,
    null,
    "o dia civil ainda em andamento não pode ser publicado como zero",
  );

  const option =
    countingIntelligence.buildCountingDayMonthHeatmapChartOption(model);
  const unavailableSeries = option.series.find(
    (series) => series.name === "Sem dia civil fechado",
  );
  const certifiedSeries = option.series.find(
    (series) => series.name === "Fluxo certificado",
  );
  assert.ok(unavailableSeries);
  assert.ok(certifiedSeries);
  assert.equal(unavailableSeries.itemStyle.borderWidth, 1);
  assert.equal(certifiedSeries.itemStyle.borderWidth, 1);
  assert.equal(certifiedSeries.emphasis.itemStyle.borderWidth, 1);
  assert.equal(
    certifiedSeries.itemStyle.borderColor,
    "rgba(15, 23, 42, 0.09)",
  );
  assert.ok(
    certifiedSeries.data.some(
      ([dayIndex, month, total]) =>
        dayIndex === 30 && month === 0 && total === 0,
    ),
  );
  assert.ok(
    certifiedSeries.data.some(
      ([dayIndex, month, total]) =>
        dayIndex === 28 && month === 1 && total === 10,
    ),
  );
  assert.ok(
    unavailableSeries.data.some(
      ([dayIndex, month, total]) =>
        dayIndex === 29 && month === 1 && total === -1,
    ),
  );
  assert.deepEqual(
    option.visualMap.map(({ seriesIndex }) => seriesIndex),
    [0, 1],
    "ausência e valores certificados precisam de escalas visuais distintas",
  );
  assert.equal(option.xAxis.axisLabel.hideOverlap, true);
  assert.equal(option.yAxis.axisLabel.hideOverlap, true);
  assert.ok(option.visualMap[1].itemHeight <= 120);
  const darkOption =
    countingIntelligence.buildCountingDayMonthHeatmapChartOption(
      model,
      "#1267C4",
      "dark",
    );
  const darkCertifiedSeries = darkOption.series.find(
    (series) => series.name === "Fluxo certificado",
  );
  assert.ok(darkCertifiedSeries);
  assert.equal(
    darkCertifiedSeries.itemStyle.borderColor,
    "rgba(226, 232, 240, 0.12)",
  );
  assert.equal(
    darkCertifiedSeries.emphasis.itemStyle.borderColor,
    "rgba(248, 250, 252, 0.24)",
  );
});

test("heatmap meses x anos limita quatro anos e exporta cobertura legível", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    dailyRows: [],
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2022-01-01", "line-entry", 22),
      aggregateRow("2023-01-01", "line-entry", 23),
      aggregateRow("2024-01-01", "line-entry", 24),
      aggregateRow("2025-01-01", "line-entry", 25),
      aggregateRow("2026-01-01", "line-entry", 26),
      aggregateRow("2026-02-01", "line-entry", 0),
    ],
    now: new Date(2026, 8, 2, 12),
    period: {
      from: new Date(2022, 0, 1),
      to: new Date(2026, 8, 1),
    },
    scenarios: [entryScenario],
    scope: { cameraIds: [], name: "Entrada", scenario: entryScenario },
  });
  const option =
    countingIntelligence.buildCountingMonthYearHeatmapChartOption(model);
  const unavailableSeries = option.series.find(
    (series) => series.name === "Mês fora do período",
  );
  const certifiedSeries = option.series.find(
    (series) => series.name === "Fluxo mensal certificado",
  );

  assert.deepEqual(option.yAxis.data, ["2026", "2025", "2024", "2023"]);
  assert.equal(option.yAxis.inverse, true);
  assert.equal(option.yAxis.data.length, 4);
  assert.equal(unavailableSeries.itemStyle.borderWidth, 1);
  assert.equal(certifiedSeries.itemStyle.borderWidth, 1);
  assert.equal(certifiedSeries.emphasis.itemStyle.borderWidth, 1);
  assert.equal(
    certifiedSeries.itemStyle.borderColor,
    "rgba(15, 23, 42, 0.09)",
  );
  assert.equal(option.xAxis.axisLabel.hideOverlap, true);
  assert.equal(option.yAxis.axisLabel.hideOverlap, true);
  assert.equal(certifiedSeries.labelLayout.hideOverlap, true);
  assert.equal(
    certifiedSeries.data.some(
      ([month, yearIndex, total]) =>
        month === 0 && yearIndex === 0 && total === 26,
    ),
    true,
  );
  assert.equal(
    certifiedSeries.data.some(
      ([month, yearIndex, total]) =>
        month === 1 && yearIndex === 0 && total === 0,
    ),
    true,
    "mês certificado sem fluxo não pode desaparecer",
  );
  assert.equal(
    unavailableSeries.data.some(
      ([month, yearIndex, total]) =>
        month === 8 && yearIndex === 0 && total === -1,
    ),
    true,
  );
  assert.equal(
    [...certifiedSeries.data, ...unavailableSeries.data].some(
      ([, yearIndex]) => yearIndex > 3,
    ),
    false,
  );

  const assets =
    countingIntelligence.buildCountingIntelligenceReportAssets(model);
  const dayMonth = assets.charts.find(
    ({ cardId }) =>
      cardId === countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS.dayMonthHeatmap,
  );
  const monthYear = assets.charts.find(
    ({ cardId }) =>
      cardId === countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS.monthYearHeatmap,
  );
  assert.ok(dayMonth?.value.table);
  assert.ok(monthYear?.value.table);
  assert.equal(
    dayMonth.value.table.rows.length,
    243,
    "a tabela deve listar somente os dias civis do período, sem células estruturais vazias",
  );
  assert.equal(
    dayMonth.value.table.rows.some(({ date }) => date === "-"),
    false,
  );
  assert.equal(monthYear.value.table.rows.length, 4 * 12);
  assert.deepEqual(
    monthYear.value.table.rows.slice(0, 2).map(({ year, month, total, coverage }) => ({
      coverage,
      month,
      total,
      year,
    })),
    [
      { coverage: "Mês certificado", month: "Jan", total: 26, year: 2026 },
      { coverage: "Mês certificado", month: "Fev", total: 0, year: 2026 },
    ],
  );
  assert.deepEqual(
    monthYear.value.table.rows.find(
      ({ month, year }) => month === "Set" && year === 2026,
    ),
    {
      coverage: "Fora do período",
      month: "Set",
      total: "",
      year: 2026,
    },
  );
});

test("fonte diária dos heatmaps de Relatórios é condicional e limitada a um ano", () => {
  const reportsSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const cardsSource = readFileSync(
    resolve(projectRoot, "components/app/counting-intelligence-report.tsx"),
    "utf8",
  );
  const preferencesSource = readFileSync(
    resolve(projectRoot, "lib/view-preferences.ts"),
    "utf8",
  );

  assert.equal(
    countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS.dayMonthHeatmap,
    "report_counting_day_month_heatmap",
  );
  assert.equal(
    countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS.monthYearHeatmap,
    "report_counting_month_year_heatmap",
  );
  assert.match(
    reportsSource,
    /const countingIntelligenceDayRequired = React\.useMemo\([\s\S]*?visibleReportCardIds\.includes\([\s\S]*?COUNTING_INTELLIGENCE_CARD_IDS\.dayMonthHeatmap/,
  );
  assert.match(
    reportsSource,
    /const countingDayHeatmapDefinition = countingIntelligenceDayRequired[\s\S]*?\? buildCountingDayHeatmapDefinition\([\s\S]*?effectivePeriodDates,[\s\S]*?now,[\s\S]*?companyTimeZone,[\s\S]*?\)[\s\S]*?: null/,
  );
  assert.match(
    reportsSource,
    /countingDayHeatmapDefinition && !visibleDayHeatmapSource[\s\S]*?\? \[countingDayHeatmapDefinition\]/,
    "a fonte própria só deve ser consultada quando não houver uma diária visível reutilizável",
  );
  assert.equal(
    (reportsSource.match(/dailyRows: chartData\[COUNTING_DAY_HEATMAP_ID\]\?\.rows \?\? \[\]/g) ?? [])
      .length,
    2,
    "modelo global e composição customizada precisam receber a mesma fonte diária",
  );
  assert.match(
    reportsSource,
    /COUNTING_INTELLIGENCE_MONTH_CARD_ID_SET[\s\S]*?COUNTING_INTELLIGENCE_CARD_IDS\.monthYearHeatmap/,
  );

  const countingDayHeatmapYear = loadStandaloneFunction(
    "components/app/scenario-reports-dashboard.tsx",
    "countingDayHeatmapYear",
  );
  const startOfDay = loadStandaloneFunction(
    "components/app/scenario-reports-dashboard.tsx",
    "startOfDay",
  );
  const buildCountingDayHeatmapDefinition = loadStandaloneFunction(
    "components/app/scenario-reports-dashboard.tsx",
    "buildCountingDayHeatmapDefinition",
    {
      COUNTING_DAY_HEATMAP_ID: "report_counting_day_heatmap_source",
      companyCalendarDate: companyTimeZone.companyCalendarDate,
      countingDayHeatmapYear,
      startOfDay,
    },
  );
  const leapYearDefinition = buildCountingDayHeatmapDefinition(
    {
      from: new Date(2024, 0, 1),
      to: new Date(2025, 0, 1),
    },
    new Date(2026, 8, 4, 14),
  );
  assert.equal(leapYearDefinition.granularity, "day");
  assert.equal(
    (leapYearDefinition.to.getTime() - leapYearDefinition.from.getTime()) /
      (24 * 60 * 60 * 1_000),
    366,
  );
  const openDefinition = buildCountingDayHeatmapDefinition(
    {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 9, 1),
    },
    new Date(2026, 8, 4, 14, 45),
  );
  assert.deepEqual(localDateParts(openDefinition.to), [2026, 9, 4]);
  const companyCivilDefinition = buildCountingDayHeatmapDefinition(
    {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 9, 1),
    },
    new Date("2026-09-04T16:30:00.000Z"),
    "Pacific/Kiritimati",
  );
  assert.deepEqual(
    localDateParts(companyCivilDefinition.to),
    [2026, 9, 5],
    "o corte precisa seguir o dia civil IANA da empresa, não o navegador",
  );
  assert.equal(
    (reportsSource.match(/dayMonthHeatmapPeriod: countingDayHeatmapPeriod/g) ?? [])
      .length,
    2,
    "o modelo global e a composição customizada devem usar o intervalo diário realmente consultado",
  );

  for (const key of ["dayMonthHeatmap", "monthYearHeatmap"]) {
    const start = cardsSource.indexOf(
      `id: COUNTING_INTELLIGENCE_CARD_IDS.${key}`,
    );
    const end = cardsSource.indexOf("    {", start + 8);
    const definition = cardsSource.slice(start, end);
    assert.ok(start >= 0, `${key} deve existir na composição dos cards`);
    assert.match(definition, /colorPreview: "gradient"/);
    assert.match(definition, /previewKind: "heatmap"/);
    assert.match(definition, /defaultHeight: "tall"/);
    assert.match(definition, /defaultSize: "full"/);
    assert.doesNotMatch(definition, /chartTypeEnabled/);
  }
  const comparisonTableSource = cardsSource.slice(
    cardsSource.indexOf("function YearOverYearMatrixCard"),
    cardsSource.indexOf("function YearComparisonValueRow"),
  );
  assert.doesNotMatch(comparisonTableSource, /key=\{row\.year\}/);
  assert.match(
    comparisonTableSource,
    /key=\{`\$\{row\.year\}:\$\{[\s\S]*?row\.baselineOnly[\s\S]*?comparison-baseline[\s\S]*?selected-period/,
  );
  assert.match(preferencesSource, /card\("report_counting_day_month_heatmap"/);
  assert.match(preferencesSource, /card\("report_counting_month_year_heatmap"/);
});

test("card anual usa janeiro até o corte aplicado, não apenas os dias selecionados", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-16",
    "2026-07-31",
  );
  assert.ok(period);
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      dayRows: [aggregateRow("2026-07-16", "line-entry", 25)],
      monthRows: [
        aggregateRow("2026-01-01", "line-entry", 100),
        aggregateRow("2026-07-01", "line-entry", 700),
      ],
    }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("year_monthly", {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(model.table?.rows.find((row) => row.month === "Jan")?.value, 100);
  assert.equal(model.table?.rows.find((row) => row.month === "Jul")?.value, 700);

  const source = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  assert.match(source, /fetchAnalysisConsolidatedDayDatasets/);
  assert.match(source, /mergeAnalysisRanges/);
  assert.match(
    source,
    /widget\.kind === "year_monthly" \|\|[\s\S]*?widget\.kind === "year_accumulated"[\s\S]*?return false/,
  );
  assert.doesNotMatch(source, /window\.setInterval/);
});

test("consultas de relatórios abortam no unmount e deduplicam replay do StrictMode", () => {
  const counting = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const occupancy = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const embedded = readFileSync(
    resolve(projectRoot, "components/app/embedded-live-view.tsx"),
    "utf8",
  );
  const comparison = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );

  for (const source of [counting, occupancy]) {
    assert.match(source, /activeMetadataRequestKeyRef/);
    assert.match(source, /completedMetadataRequestKeyRef/);
    assert.match(source, /metadataAbortControllerRef|metadataRequestControllerRef/);
    assert.match(source, /metadataAbortTimerRef/);
  }
  assert.match(counting, /chartRequestSequenceRef\.current \+= 1[\s\S]*?abortRequest\([\s\S]*?chartRequestControllerRef\.current/);
  assert.match(occupancy, /signal: controller\.signal/);
  assert.match(embedded, /fetchBoundedHourlyAggregateRanges/);
  assert.doesNotMatch(embedded, /fetchHourlyAggregateRanges/);
  assert.match(comparison, /missingHourlyRanges/);
  assert.match(comparison, /sharedAggregateRequests/);
  assert.match(comparison, /subscribers: new Set/);
  assert.match(comparison, /fetchCompleteAggregateRange/);
});

test("Análises iniciam ontem uma vez e históricos preservam deduplicação", () => {
  const countingAnalysis = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  const countingReports = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const occupancyHistorical = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  const demographics = readFileSync(
    resolve(projectRoot, "components/app/demographics-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    countingAnalysis,
    /if \(!analysisRequested\) \{[\s\S]*?setLoadingData\(false\);[\s\S]*?return;/,
  );
  assert.match(
    countingAnalysis,
    /const previousDayInput = shiftOccupancyAnalysisDateInput\([\s\S]*?companyTodayInput,[\s\S]*?-1,[\s\S]*?\);[\s\S]*?setAnalysisRequested\(true\);/,
    "Contagem deve preparar ontem no calendário civil da empresa e liberar uma única consulta inicial",
  );
  assert.match(countingAnalysis, /setAnalysisRequested\(true\);[\s\S]*?setQueryVersion/);

  assert.match(countingReports, /if \(!reportRequested\) return;[\s\S]*?void loadCharts/);
  assert.match(countingReports, /pending=\{!reportRequested \|\| countingPeriodPending\}/);
  assert.match(
    countingReports,
    /setSettingsReadyScopeKey\(reportSettingsScopeKey\);[\s\S]{0,360}?setReportRequested\(true\)/,
    "Relatórios de Contagem deve consultar automaticamente o período restaurado, que usa quatro anos na primeira visita",
  );
  assert.match(
    countingReports,
    /function applyCountingPeriod\([\s\S]{0,120}?setReportRequested\(true\)/,
  );
  assert.match(
    countingReports,
    /const reportDataPending =[\s\S]*?!reportRequested \|\| countingPeriodPending \|\| loadingCharts;/,
    "os widgets não podem apresentar zeros como resultado antes da primeira consulta",
  );
  assert.match(countingReports, /loading: reportDataPending/);
  const primaryCountingModelSection = countingReports.slice(
    countingReports.indexOf("  const countingIntelligenceModel ="),
    countingReports.indexOf("  const reportScenarioSelectionByCardId ="),
  );
  assert.match(
    primaryCountingModelSection,
    /reportRequested && selectedScope && !reportCertificationError[\s\S]*?buildCountingIntelligenceModel\(/,
    "o modelo consolidado não pode ser materializado antes de Aplicar",
  );
  assert.match(
    countingReports,
    /const pendingCountingIntelligenceModel = React\.useMemo\([\s\S]*?!reportRequested && selectedScope[\s\S]*?createPendingCountingIntelligenceModel/,
    "a pré-consulta deve manter os cards em loading com um modelo leve",
  );
  assert.match(
    countingReports,
    /const displayedCountingIntelligenceModel =[\s\S]*?reportRequested[\s\S]*?countingIntelligenceModel[\s\S]*?pendingCountingIntelligenceModel;[\s\S]*?model: displayedCountingIntelligenceModel/,
    "o layout e as configurações dos widgets devem continuar disponíveis antes de Aplicar",
  );
  const selectedCountingModelSection = countingReports.slice(
    countingReports.indexOf("  const buildSelectedCountingIntelligenceModel ="),
    countingReports.indexOf("  const resolveCountingIntelligenceModel ="),
  );
  assert.match(
    selectedCountingModelSection,
    /if \(!countingIntelligenceModel\) \{[\s\S]*?return pendingCountingIntelligenceModel;[\s\S]*?\}[\s\S]*?buildCountingIntelligenceModel\(/,
    "seleções individuais também devem usar o shell leve antes da consulta",
  );
  assert.match(
    countingReports,
    /const resolveCountingIntelligenceModel = React\.useMemo\([\s\S]*?const models = new Map[\s\S]*?const cached = models\.get\(key\)[\s\S]*?models\.set\(key, model\)/,
    "seleções customizadas devem ser materializadas apenas pelo card e reutilizadas por revisão",
  );

  assert.match(occupancyHistorical, /if \(!reportRequested\) return;[\s\S]*?loadCharts\(selectedScope\)/);
  assert.match(
    occupancyHistorical,
    /const previousDayInput = shiftOccupancyAnalysisDateInput\([\s\S]*?companyTodayInput,[\s\S]*?-1,[\s\S]*?\);[\s\S]*?setAnalysisRangeInput\(initialRange\);[\s\S]*?setReportRequested\(analysis\);/,
    "Ocupação deve consultar automaticamente somente na superfície Análises",
  );
  assert.match(
    occupancyHistorical,
    /nextValue\.endInput === analysisRangeInput\.endInput[\s\S]*?setReportRequested\(true\);[\s\S]*?return;/,
  );

  assert.match(demographics, /surface === "live" \|\|[\s\S]*?historicalQueryScopeKey === historicalQueryIdentityKey/);
  assert.match(demographics, /if \(!queryRequested\) \{[\s\S]*?setLoading\(false\);[\s\S]*?return;/);
  assert.match(
    demographics,
    /if \(surface === "analysis"\) \{[\s\S]*?publishRange\(fallbackRange\);[\s\S]*?setHistoricalQueryScopeKey\(historicalQueryIdentityKey\)/,
    "Demographics deve iniciar automaticamente apenas Análises, mantendo Relatórios sob demanda",
  );
  assert.match(
    demographics,
    /surface === "analysis"[\s\S]*?const previousDayInput = shiftCivilDateKey\(todayInput, -1\)/,
  );
});

test("navegação carrega somente o módulo ativo sem ocultar a nova página", () => {
  const wrappers = [
    "live-dashboard-tabs.tsx",
    "analysis-dashboard.tsx",
    "reports-dashboard.tsx",
  ].map((file) =>
    readFileSync(resolve(projectRoot, "components/app", file), "utf8"),
  );
  const shell = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  const motion = readFileSync(
    resolve(projectRoot, "components/app/use-premium-motion.ts"),
    "utf8",
  );
  const routePreload = readFileSync(
    resolve(projectRoot, "lib/app-route-preload.ts"),
    "utf8",
  );
  const moduleTabs = readFileSync(
    resolve(projectRoot, "components/app/dashboard-module-tabs.tsx"),
    "utf8",
  );
  const cardLayout = readFileSync(
    resolve(projectRoot, "components/app/card-layout.tsx"),
    "utf8",
  );

  for (const wrapper of wrappers) {
    assert.match(wrapper, /import dynamic from "next\/dynamic"/);
    assert.match(wrapper, /loading: DashboardPanelLoading/);
    assert.doesNotMatch(
      wrapper,
      /import \{ (?:RealtimeDashboard|PeriodAnalysisDashboard|ScenarioReportsDashboard|OccupancyScenarioDashboard|OccupancyReportsDashboard|DemographicsDashboard) \} from/,
    );
  }
  assert.match(shell, /useLinkStatus/);
  assert.match(shell, /<NavigationPendingIndicator \/>/);
  assert.equal(
    (shell.match(/prefetch=\{false\}/g) ?? []).length,
    2,
    "o menu deve evitar o prefetch automático de todas as rotas e aquecer apenas a intenção ativa",
  );
  assert.match(
    shell,
    /scheduleAppRoutePreload\([\s\S]*?item\.href,[\s\S]*?fallbackDashboardModule,[\s\S]*?\(\) => router\.prefetch\(item\.href\)/,
  );
  assert.match(
    shell,
    /onPointerDown=\{\(\) => \{[\s\S]*?router\.prefetch\(item\.href\);[\s\S]*?preloadAppRoute\(item\.href, fallbackDashboardModule\)/,
  );
  assert.match(routePreload, /const dashboardPanelLoaders:/);
  assert.match(routePreload, /activeDashboardModule\(\) \?\? fallbackDashboardModule/);
  assert.match(routePreload, /setTimeout\(\(\) => \{[\s\S]*?preloadAppRoute/);
  assert.match(moduleTabs, /scheduleDashboardPanelPreload\(pathname, targetModule\)/);
  assert.match(moduleTabs, /preloadDashboardPanel\(pathname, targetModule\)/);
  assert.match(
    cardLayout,
    /scheduleCardMaterialization[\s\S]*?requestAnimationFrame\([\s\S]*?React\.startTransition/,
    "widgets pesados devem ser materializados progressivamente sem bloquear um único frame",
  );
  assert.match(motion, /\[data-premium-content\]/);
  assert.doesNotMatch(motion, /autoAlpha|filter: "blur|stagger:/);
});
