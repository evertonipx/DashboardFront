import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Dynamic fixtures intentionally exercise declarations extracted from a TSX
// module without mounting React.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const occupancyDuration: typeof import("../lib/occupancy-duration.ts") =
  require("../lib/occupancy-duration.ts");
const occupancyDurationQueryPlan: typeof import("../lib/occupancy-duration-query-plan.ts") =
  require("../lib/occupancy-duration-query-plan.ts");
const occupancyComparisonSelection: typeof import("../lib/occupancy-comparison-selection.ts") =
  require("../lib/occupancy-comparison-selection.ts");
const occupancyComparison: typeof import("../lib/occupancy-comparison.ts") =
  require("../lib/occupancy-comparison.ts");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widgetPath = resolve(
  root,
  "components/app/occupancy-duration-widgets.tsx",
);
const widgetSource = readFileSync(
  widgetPath,
  "utf8",
);
const preferenceSource = readFileSync(
  resolve(root, "lib/view-preferences.ts"),
  "utf8",
);
const comparisonSource = readFileSync(
  resolve(root, "components/app/occupancy-comparison-widgets.tsx"),
  "utf8",
);
const dashboardSource = readFileSync(
  resolve(root, "components/app/occupancy-scenario-dashboard.tsx"),
  "utf8",
);

const stateMetricCards = [
  "occupancy_duration_free",
  "occupancy_duration_average",
  "occupancy_duration_rate",
  "occupancy_duration_transitions",
] as const;
const averageByScenarioCardId =
  "occupancy_duration_average_by_scenario" as const;

test("duração ao vivo consulta horas completas e deixa somente as bordas em minutos", () => {
  const from = Date.parse("2026-09-17T00:30:00.000Z");
  const buckets = Array.from(
    { length: 165 },
    (_, index) => new Date(from + index * 60_000),
  );
  const coarse =
    occupancyDurationQueryPlan.planOccupancyDurationCoarseQuery(buckets);

  assert.deepEqual(
    coarse.hourlyBuckets.map((bucket) => bucket.toISOString()),
    ["2026-09-17T01:00:00.000Z", "2026-09-17T02:00:00.000Z"],
  );
  assert.equal(coarse.minuteBuckets.length, 45);
  assert.equal(coarse.minuteBuckets[0].toISOString(), "2026-09-17T00:30:00.000Z");
  assert.equal(coarse.minuteBuckets.at(-1)?.toISOString(), "2026-09-17T03:14:00.000Z");
});

test("somente hora mista recebe refinamento minuto a minuto", () => {
  const from = Date.parse("2026-09-17T00:00:00.000Z");
  const buckets = Array.from(
    { length: 180 },
    (_, index) => new Date(from + index * 60_000),
  );
  const hourlyMetrics = new Map([
    [from, { average: 3, minimum: 1, peak: 8 }],
    [from + 60 * 60_000, { average: 0, minimum: 0, peak: 0 }],
    [from + 120 * 60_000, { average: 2, minimum: 0, peak: 7 }],
  ]);
  const plan =
    occupancyDurationQueryPlan.resolveOccupancyDurationHourlyPlan({
      buckets,
      hourlyMetrics,
    });

  assert.equal(plan.synthesizedMinuteMetrics.size, 120);
  assert.equal(plan.minuteBuckets.length, 60);
  assert.equal(plan.minuteBuckets[0].toISOString(), "2026-09-17T02:00:00.000Z");
  assert.equal(plan.minuteBuckets.at(-1)?.toISOString(), "2026-09-17T02:59:00.000Z");
});

test("refinamento une borda contígua à hora mista em uma única consulta", () => {
  const from = Date.parse("2026-09-17T00:30:00.000Z");
  const buckets = Array.from(
    { length: 165 },
    (_, index) => new Date(from + index * 60_000),
  );
  const plan = occupancyDurationQueryPlan.resolveOccupancyDurationHourlyPlan({
    buckets,
    hourlyMetrics: new Map([
      [Date.parse("2026-09-17T01:00:00.000Z"), { average: 1, minimum: 1, peak: 1 }],
      [Date.parse("2026-09-17T02:00:00.000Z"), { average: 0.5, minimum: 0, peak: 1 }],
    ]),
  });
  const groups =
    occupancyDurationQueryPlan.groupContiguousOccupancyDurationBuckets(
      plan.minuteBuckets,
    );

  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 30);
  assert.equal(groups[1].length, 75);
  assert.equal(groups[1][0].toISOString(), "2026-09-17T02:00:00.000Z");
  assert.equal(groups[1].at(-1)?.toISOString(), "2026-09-17T03:14:00.000Z");
  assert.doesNotMatch(
    widgetSource,
    /edgeMinuteAggregates|edgeMinuteKeys/,
    "borda e hora mista não devem ser fragmentadas novamente no transporte",
  );
});

test("hora ausente permanece desconhecida sem disparar sessenta consultas substitutas", () => {
  const from = Date.parse("2026-09-17T00:00:00.000Z");
  const buckets = Array.from(
    { length: 60 },
    (_, index) => new Date(from + index * 60_000),
  );
  const plan =
    occupancyDurationQueryPlan.resolveOccupancyDurationHourlyPlan({
      buckets,
      hourlyMetrics: new Map(),
    });

  assert.equal(plan.synthesizedMinuteMetrics.size, 0);
  assert.equal(plan.minuteBuckets.length, 0);
});

test("widget de duração usa agregado de cenário e nunca confunde eventos analíticos com ocupação", () => {
  assert.match(
    widgetSource,
    /granularity: "hour"[\s\S]*?granularity: "minute"/,
    "a carga fria deve começar na granularidade horária e refinar somente o necessário",
  );
  assert.match(widgetSource, /planOccupancyDurationCoarseQuery/);
  assert.doesNotMatch(widgetSource, /\/analytics\/aggregate/);
});

test("indicadores de estado entram no catálogo configurável e no relatório do Ao Vivo", () => {
  for (const cardId of stateMetricCards) {
    assert.match(
      widgetSource,
      new RegExp(`id: "${cardId}"[\\s\\S]*?scenarioSelectionPolicy: "aggregate"`),
      `${cardId} precisa permitir composição individual de cenários`,
    );
    assert.match(
      widgetSource,
      new RegExp(`cardId: "${cardId}"`),
      `${cardId} precisa fazer parte das métricas exportadas`,
    );
    assert.match(
      preferenceSource,
      new RegExp(`card\\("${cardId}"`),
      `${cardId} precisa aparecer no configurador de widgets`,
    );
  }
});

test("estado atual usa o snapshot corrente de toda a composição", () => {
  const { resolveCurrentOccupancyState } = loadCurrentStateResolver();
  assert.equal(
    resolveCurrentOccupancyState([
      currentSnapshot("a", 1),
      currentSnapshot("b", 3),
    ], 2),
    "occupied",
  );
  assert.equal(
    resolveCurrentOccupancyState([
      currentSnapshot("a", 0),
      currentSnapshot("b", 0),
    ], 2),
    "free",
  );
  assert.equal(
    resolveCurrentOccupancyState([
      currentSnapshot("a", 2),
      currentSnapshot("b", 0),
    ], 2),
    "mixed",
  );
  assert.equal(
    resolveCurrentOccupancyState([
      currentSnapshot("a", null, "Leitura indisponível"),
    ], 1),
    "unknown",
  );
  assert.equal(
    resolveCurrentOccupancyState([
      currentSnapshot("a", null),
    ], 1),
    "unknown",
  );
  assert.equal(
    resolveCurrentOccupancyState([
      currentSnapshot("a", 1),
    ], 2),
    "unknown",
    "uma composição parcialmente carregada não pode certificar o estado",
  );
  assert.match(
    widgetSource,
    /occupancy_duration_transitions: "Estado atual confirmado"/,
  );
  assert.match(
    widgetSource,
    /cardId: "occupancy_duration_transitions", kind: "current"/,
  );
  assert.match(
    widgetSource,
    /currentStateCard\s*=\s*kind === "current"[\s\S]*?resolveSelectedCurrentSnapshots/,
    "o card atual deve receber snapshots, não a série agregada do dia",
  );
});

test("estado atual entra no pulso único de /occupancy a cada cinco segundos", () => {
  const plan = occupancyComparisonSelection.buildOccupancyComparisonSelectionPlan({
    hexScenarioIds: [],
    inheritedHeatmapScenarioId: "scenario-a",
    inheritedScenarioIds: ["scenario-a", "scenario-b"],
    preferences: [
      {
        id: "occupancy_duration_transitions",
        visible: true,
      },
    ],
    scenarios: [
      { id: "scenario-a" },
      { id: "scenario-b" },
    ],
  });

  assert.deepEqual(plan.snapshots, ["scenario-a", "scenario-b"]);
  assert.deepEqual(plan.hourly, []);
  assert.deepEqual(plan.currentHour, []);
  assert.deepEqual(plan.trends, []);
  assert.match(
    comparisonSource,
    /OCCUPANCY_HISTORICAL_SNAPSHOT_CARD_IDS = new Set\(\[[\s\S]*?"occupancy_duration_transitions"/,
  );
  assert.match(
    comparisonSource,
    /return \{[\s\S]*?snapshots: certifiedSnapshots,[\s\S]*?snapshotsLoading: snapshotLoading/,
    "o hook comparativo precisa compartilhar o resultado e o loading do mesmo snapshot",
  );
  assert.match(dashboardSource, /const OCCUPANCY_REFRESH_SECONDS = 5/);
  assert.match(
    dashboardSource,
    /useOccupancyComparisonCards\(\{[\s\S]*?snapshotRefreshMs: liveRefreshMs/,
  );
  assert.match(
    dashboardSource,
    /useOccupancyDurationCards\(\{[\s\S]*?currentSnapshots:[\s\S]*?currentSnapshotsLoading:/,
    "o dashboard deve ligar o snapshot comparativo diretamente ao card de estado atual",
  );
});

test("resumo médio deixa médias e maiores períodos visíveis sem criar outra consulta", () => {
  const { durationAverageSummary } = loadDurationAverageSummaryBuilder();
  const summary = durationAverageSummary({
    confirmedFreeSeconds: 30,
    confirmedFreeSequenceCount: 3,
    confirmedOccupiedSeconds: 240,
    confirmedOccupiedSequenceCount: 2,
    errorCount: 0,
    expectedSeconds: 360,
    loadUnitSeconds: 900,
    longestConfirmedFreeSeconds: 20,
    longestConfirmedOccupiedSeconds: 120,
    minimumDetectedTransitions: 2,
    observedSeconds: 300,
    scenarioCount: 1,
    successfulScenarioCount: 1,
    transitionSeconds: 30,
    unknownSeconds: 60,
    warnings: [],
  });
  assert.equal(summary.averageOccupancy, 3);
  assert.equal(summary.averageOccupiedSeconds, 120);
  assert.equal(summary.averageFreeSeconds, 10);
  assert.equal(summary.longestOccupiedSeconds, 120);
  assert.equal(summary.longestFreeSeconds, 20);
  assert.ok(Math.abs(summary.coverage - 5 / 6) < Number.EPSILON);

  const unavailable = durationAverageSummary({
    confirmedFreeSeconds: 0,
    confirmedFreeSequenceCount: 0,
    confirmedOccupiedSeconds: 0,
    confirmedOccupiedSequenceCount: 0,
    errorCount: 0,
    expectedSeconds: 0,
    loadUnitSeconds: 0,
    longestConfirmedFreeSeconds: 0,
    longestConfirmedOccupiedSeconds: 0,
    minimumDetectedTransitions: 0,
    observedSeconds: 0,
    scenarioCount: 1,
    successfulScenarioCount: 0,
    transitionSeconds: 0,
    unknownSeconds: 0,
    warnings: [],
  });
  assert.deepEqual(unavailable, {
    averageFreeSeconds: null,
    averageIndividualDwellSeconds: null,
    averageOccupancy: null,
    averageOccupiedSeconds: null,
    coverage: null,
    longestFreeSeconds: null,
    longestOccupiedSeconds: null,
  });

  const componentSource = widgetSource.slice(
    widgetSource.indexOf("function OccupancyDurationAverageSummaryCard"),
    widgetSource.indexOf("function OccupancyDurationTimelineCard"),
  );
  for (const label of [
    "Média de pessoas",
    "Pessoa · permanência média",
    "Área ocupada · média",
    "Área livre · média",
    "Área ocupada · máximo",
    "Área livre · máximo",
    "Cobertura",
  ]) {
    assert.match(componentSource, new RegExp(label));
  }
  assert.doesNotMatch(componentSource, /fetch|apiFetch/);
  assert.match(
    widgetSource,
    /id: "occupancy_duration_average"[\s\S]*?<OccupancyDurationAverageSummaryCard[\s\S]*?resolveSelectedSeries\(scenarioSelection\)/,
  );
  assert.match(
    preferenceSource,
    /card\("occupancy_duration_average", "Ocupação e permanência"/,
  );
});

test("resumo médio compara o consolidado global com cada cenário selecionado", () => {
  const { buildDurationAverageComparisonRows } =
    loadDurationAverageComparisonBuilder();
  const selectedScenarios = [
    { id: "entrada", name: "Entrada" },
    { id: "espera", name: "Espera" },
    { id: "livre", name: "Livre" },
    { id: "sem-cobertura", name: "Sem cobertura" },
  ];
  const rows = buildDurationAverageComparisonRows(
    selectedScenarios,
    [
      durationSeries("entrada", "Entrada", ["occupied", "occupied", "free"]),
      durationSeries("espera", "Espera", ["occupied", "free", "free"]),
      durationSeries("livre", "Livre", ["free", "free", "free"]),
    ],
    {
      scenarios: [
        {
          scenarioId: "entrada",
          totals: { avgDurationSeconds: 20 },
        },
        {
          scenarioId: "espera",
          totals: { avgDurationSeconds: 40 },
        },
      ],
      totals: { avgDurationSeconds: 32 },
    },
  );

  assert.deepEqual(
    rows.map((row: RuntimeFixture) => [row.kind, row.label]),
    [
      ["global", "Média global · 4 cenários"],
      ["scenario", "Entrada"],
      ["scenario", "Espera"],
      ["scenario", "Livre"],
      ["scenario", "Sem cobertura"],
    ],
  );
  assert.ok(
    Math.abs(rows[0].summary.averageOccupancy - 1 / 3) < Number.EPSILON,
    "a ocupação global calcula a média aritmética apenas dos cenários com valor válido",
  );
  assert.equal(rows[0].summary.averageOccupiedSeconds, 90);
  assert.equal(rows[0].summary.averageIndividualDwellSeconds, 32);
  assert.equal(rows[0].summary.averageFreeSeconds, 120);
  assert.equal(rows[0].summary.longestOccupiedSeconds, 120);
  assert.equal(rows[0].summary.longestFreeSeconds, 180);
  assert.equal(
    rows[0].summary.coverage,
    1,
    "o cenário ausente permanece indisponível sem inventar minutos esperados",
  );
  assert.ok(
    Math.abs(rows[1].summary.averageOccupancy - 2 / 3) < Number.EPSILON,
  );
  assert.ok(
    Math.abs(rows[2].summary.averageOccupancy - 1 / 3) < Number.EPSILON,
  );
  assert.equal(rows[1].summary.averageIndividualDwellSeconds, 20);
  assert.equal(rows[2].summary.averageIndividualDwellSeconds, 40);
  assert.equal(rows[3].summary.averageIndividualDwellSeconds, null);
  assert.equal(
    rows[3].summary.averageOccupancy,
    0,
    "ocupação zero é um valor válido e precisa entrar no divisor",
  );
  assert.deepEqual(rows[4].summary, {
    averageFreeSeconds: null,
    averageIndividualDwellSeconds: null,
    averageOccupancy: null,
    averageOccupiedSeconds: null,
    coverage: null,
    longestFreeSeconds: null,
    longestOccupiedSeconds: null,
  });

  const componentSource = widgetSource.slice(
    widgetSource.indexOf("function OccupancyDurationAverageSummaryCard"),
    widgetSource.indexOf("function OccupancyDurationTimelineCard"),
  );
  assert.match(
    componentSource,
    /Detecção média · durações calculadas separadamente/,
  );
  assert.match(
    componentSource,
    /quantidade de registros é usada somente como denominador interno/,
  );
  assert.match(componentSource, /data-duration-average-row-scope/);
  assert.doesNotMatch(componentSource, /fetch|apiFetch/);

  const reportMetricSource = widgetSource.slice(
    widgetSource.indexOf("function buildDurationReportMetrics"),
    widgetSource.indexOf("function buildDurationReportAssets"),
  );
  assert.match(
    reportMetricSource,
    /cardId === "occupancy_duration_average"[\s\S]*?buildDurationAverageComparisonRows/,
    "o relatório deve reutilizar exatamente a mesma consolidação exibida no widget",
  );
  assert.match(
    reportMetricSource,
    /value:[\s\S]*?globalSummary\?\.averageOccupancy/,
    "a exportação deve publicar a ocupação média, não a soma nem somente a duração",
  );
  assert.match(
    reportMetricSource,
    /média ponderada por registro concluído e deduplica áreas físicas compartilhadas/,
  );
});

test("Tempo por cenário publica médias e índices por linha sem inferir identidade", () => {
  assert.match(
    widgetSource,
    /const state = deriveOccupancyStateMetrics\(scenario\.summary\)/,
  );
  assert.match(widgetSource, /Média ocupado \(min\)/);
  assert.match(widgetSource, /Média desocupado \(min\)/);
  assert.match(widgetSource, /Tempo ocupado \(%\)/);
  assert.match(widgetSource, /Mudanças mín\./);
  assert.match(widgetSource, /não representa permanência individual/);
});

test("Timeline e Tempo por cenário mostram médias e maiores períodos dos snapshots", () => {
  assert.match(
    widgetSource,
    /function durationScenarioAverageLabel[\s\S]*?averageConfirmedOccupiedSequenceSeconds[\s\S]*?averageConfirmedFreeSequenceSeconds/,
  );
  assert.equal(
    (widgetSource.match(/durationScenarioAxisLabel\(scenario, 18\)/g) ?? [])
      .length,
    2,
    "os dois eixos por cenário precisam mostrar as médias de estado sem hover",
  );
  assert.equal(
    (widgetSource.match(/\.\.\.durationScenarioLongestTooltipLines\(scenario\)/g) ?? [])
      .length,
    2,
    "os dois tooltips precisam identificar os maiores períodos ocupado e livre",
  );
  assert.match(widgetSource, /Maior ocupada \(s\)/);
  assert.match(widgetSource, /Maior livre \(s\)/);
  assert.doesNotMatch(widgetSource, /sessionCount|Sessões concluídas/);
});

test("rótulo por cenário distingue médias ocupada, livre e ausência", () => {
  const { durationScenarioAxisLabel } = loadDurationScenarioLabelBuilder();
  const ready: RuntimeFixture = durationSeries("ready", "Entrada principal", [
    "occupied",
    "occupied",
  ]);
  assert.equal(
    durationScenarioAxisLabel(ready, 18),
    "Entrada principal\nMédias O 2min · L —",
  );

  const empty: RuntimeFixture = durationSeries("empty", "Espera", ["free"]);
  assert.equal(
    durationScenarioAxisLabel(empty, 18),
    "Espera\nMédias O — · L 1min",
  );

  const unknown = durationSeries("unknown", "Sem leitura", ["unknown"]);
  assert.equal(
    durationScenarioAxisLabel(unknown, 18),
    "Sem leitura\nMédias O — · L —",
  );
});

test("ausência de sequência permanece indisponível em vez de virar zero minuto", () => {
  const { durationScenarioAxisLabel } = loadDurationScenarioLabelBuilder();
  const { durationAverageSummary } = loadDurationAverageSummaryBuilder();
  const withoutSequences = durationAverageSummary({
    confirmedFreeSeconds: 0,
    confirmedFreeSequenceCount: 0,
    confirmedOccupiedSeconds: 0,
    confirmedOccupiedSequenceCount: 0,
    errorCount: 0,
    expectedSeconds: 60,
    loadUnitSeconds: 0,
    longestConfirmedFreeSeconds: 0,
    longestConfirmedOccupiedSeconds: 0,
    minimumDetectedTransitions: 1,
    observedSeconds: 60,
    scenarioCount: 1,
    successfulScenarioCount: 1,
    transitionSeconds: 60,
    unknownSeconds: 0,
    warnings: [],
  });
  const label = durationScenarioAxisLabel(
    durationSeries("transition", "Em transição", ["transition"]),
    18,
  );

  assert.equal(withoutSequences.averageOccupiedSeconds, null);
  assert.equal(withoutSequences.averageFreeSeconds, null);
  assert.equal(withoutSequences.longestOccupiedSeconds, null);
  assert.equal(withoutSequences.longestFreeSeconds, null);
  assert.equal(label, "Em transição\nMédias O — · L —");
  assert.doesNotMatch(label, /0\s*min/i);
  assert.match(
    widgetSource,
    /averageOccupiedSeconds === null[\s\S]*?"—"[\s\S]*?averageFreeSeconds === null[\s\S]*?"—"/,
    "a apresentação deve testar ausência antes de formatar a duração",
  );
});

test("timeline simplifica a transição somente na apresentação e gradua cada hora", () => {
  const {
    buildOccupancyDurationTimelineSegments,
    occupancyDurationTimelineState,
    occupancyDurationTimelineStateLabel,
  } = loadTimelinePresentationHelpers();
  assert.equal(occupancyDurationTimelineState("transition"), "occupied");
  assert.equal(occupancyDurationTimelineState("occupied"), "occupied");
  assert.equal(occupancyDurationTimelineState("free"), "free");
  assert.equal(occupancyDurationTimelineState("unknown"), "unknown");
  assert.equal(occupancyDurationTimelineStateLabel("occupied"), "Ocupado");
  assert.equal(occupancyDurationTimelineStateLabel("free"), "Desocupado");
  assert.equal(occupancyDurationTimelineStateLabel("unknown"), "Sem dados");

  const start = Date.parse("2026-09-18T00:00:00.000Z");
  const segments = buildOccupancyDurationTimelineSegments([
    timelineSegment("occupied", start, 1),
    timelineSegment("transition", start + 60_000, 1),
    timelineSegment("occupied", start + 120_000, 1),
    timelineSegment("free", start + 180_000, 2),
    timelineSegment("unknown", start + 300_000, 1),
  ]);
  assert.deepEqual(
    segments.map((segment: RuntimeFixture) => ({
      seconds: segment.seconds,
      state: segment.state,
    })),
    [
      { seconds: 180, state: "occupied" },
      { seconds: 120, state: "free" },
      { seconds: 60, state: "unknown" },
    ],
    "transições adjacentes devem se fundir ao trecho ocupado sem deixar emendas visuais",
  );

  const timelineBuilderSource = widgetSource.slice(
    widgetSource.indexOf("function buildOccupancyDurationTimelineOption"),
    widgetSource.indexOf("type TimelineDatum"),
  );
  assert.match(
    timelineBuilderSource,
    /DURATION_TIMELINE_STATE_ORDER\.map\(\(state\) => \(\{/,
    "a timeline deve renderizar apenas os estados visuais simplificados",
  );
  assert.match(timelineBuilderSource, /interval: HOUR_MS/);
  assert.match(timelineBuilderSource, /minInterval: HOUR_MS/);
  assert.match(timelineBuilderSource, /maxInterval: HOUR_MS/);
  assert.match(timelineBuilderSource, /hideOverlap: false/);
  assert.match(timelineBuilderSource, /Média do período ocupado:/);
  assert.match(timelineBuilderSource, /Média do período desocupado:/);
  assert.match(timelineBuilderSource, /Taxa de tempo ocupado:/);
  assert.match(timelineBuilderSource, /Mudanças mínimas:/);
  assert.doesNotMatch(
    widgetSource,
    /Sem sessões concluídas/i,
    "a ausência de amostra não deve dominar a leitura visual",
  );
});

test("duração publica cenários progressivamente e estabiliza o catálogo equivalente", () => {
  assert.match(
    widgetSource,
    /const scenarioOptionsKey = React\.useMemo[\s\S]*?JSON\.parse\(scenarioOptionsKey\)/,
    "uma nova referência equivalente não deve reiniciar a consulta",
  );
  assert.match(
    widgetSource,
    /progressiveSeries[\s\S]*?window\.setTimeout\(publishProgress, 32\)/,
    "respostas devem ser publicadas em pequenos lotes",
  );
  assert.equal(
    (widgetSource.match(/loading=\{loading && selectedSeries\.length === 0\}/g) ?? [])
      .length,
    2,
    "gráficos agregados devem aparecer assim que a primeira linha estiver pronta",
  );
  assert.match(
    widgetSource,
    /const OCCUPANCY_AGGREGATE_DURATION_CARD_IDS =\s*OCCUPANCY_DURATION_CARD_IDS\.filter\([\s\S]*?cardId !== "occupancy_duration_transitions"/,
    "o estado atual não pode baixar o agregado diário usado pelas durações históricas",
  );
  assert.match(
    widgetSource,
    /id: "occupancy_duration_average_by_scenario"[\s\S]*?selectedSeries=\{resolveSelectedSeries\(scenarioSelection\)\}/,
    "o comparativo médio por cenário precisa reutilizar o dataset agregado",
  );
  assert.match(
    widgetSource,
    /!hasDueScenario && publishedRangeEnd === range\.to\.getTime\(\)[\s\S]*?scheduleNext\(\);[\s\S]*?return;/,
    "um pulso sem novo minuto ou auditoria não deve reconstruir o mesmo resumo",
  );
});

test("exportação de duração faz uma carga one-shot completa sem instalar polling", () => {
  const start = widgetSource.indexOf("const loadReportSnapshot = React.useCallback");
  const end = widgetSource.indexOf(
    "const durationDataCompleteUntil",
    start,
  );
  assert.ok(start >= 0 && end > start, "callback one-shot de exportação ausente");
  const callbackSource = widgetSource.slice(start, end);

  assert.match(callbackSource, /reportScenarios\.length > 0/);
  assert.match(
    callbackSource,
    /loadOccupancyDurationReportSeries\(\{[\s\S]*?scenarios: reportScenarios,[\s\S]*?signal: requestSignal/,
    "todos os cenários dos widgets visíveis devem ser certificados na ação de exportar",
  );
  assert.match(
    callbackSource,
    /loadOccupancyDurationCurrentSnapshots\(\{[\s\S]*?scenarios: currentStateScenarios,[\s\S]*?signal: requestSignal/,
    "o estado atual visível também deve receber um snapshot one-shot fora da viewport",
  );
  assert.match(
    callbackSource,
    /resolveSelectedCurrentSnapshots: resolveReportCurrentSnapshots/,
    "a métrica exportada deve usar o snapshot one-shot, não o cache da viewport",
  );
  assert.match(
    callbackSource,
    /const reportNeedsIndividualDwell =\s*averagePreference\?\.visible !== false/,
    "uma preferência ausente deve manter o resumo médio visível e carregar a permanência na exportação",
  );
  assert.match(
    callbackSource,
    /catch \(error\)[\s\S]*?return currentStateScenarioOptions\.map\([\s\S]*?error: message,[\s\S]*?total: null/,
    "falha do snapshot one-shot deve invalidar todos os valores anteriores",
  );
  assert.match(
    callbackSource,
    /const requestedAt = new Date\(\)[\s\S]*?buildOccupancyClosedDayMinuteRange\(requestedAt, timeZone\)[\s\S]*?loadOccupancyDurationCurrentSnapshots\(\{[\s\S]*?requestedAt,[\s\S]*?reportSeries,[\s\S]*?reportCurrentSnapshots,[\s\S]*?reportLoiteringSummary,[\s\S]*?await Promise\.all/,
    "série e estado atual devem partir do mesmo instante e carregar em paralelo",
  );
  assert.match(
    callbackSource,
    /durationReportWarnings\([\s\S]*?selectedSnapshotErrors\(reportCurrentSnapshots\)/,
    "a falha fechada precisa permanecer explícita no relatório",
  );
  assert.match(
    widgetSource,
    /function loadOccupancyDurationCurrentSnapshots[\s\S]*?occupancyLiveSnapshotQuery\(\{ now: requestedAt \}\)[\s\S]*?priority: "normal"[\s\S]*?requireOccupancyCurrentSnapshotRows/,
  );
  assert.match(callbackSource, /signal\?\.throwIfAborted\(\)/);
  assert.match(callbackSource, /requestSignal\.throwIfAborted\(\)/);
  assert.doesNotMatch(
    callbackSource,
    /setTimeout|setInterval|scheduleNext/,
    "o one-shot não pode criar outro relógio de atualização",
  );
  for (const field of [
    "dataCompleteUntil",
    "reportAssets",
    "reportContext",
    "reportMetrics",
    "reportWarnings",
  ]) {
    assert.match(callbackSource, new RegExp(`\\b${field}\\b`), `${field} ausente`);
  }
  assert.match(
    widgetSource,
    /return \{[\s\S]*?loadReportSnapshot,[\s\S]*?reportMetrics,[\s\S]*?reportWarnings/,
    "o snapshot de exportação precisa ser exposto pelo hook",
  );
});

test("corte da exportação inclui o snapshot atual e falha fechado", () => {
  const {
    combineDurationDataCompleteUntil,
    durationCurrentSnapshotsDataCompleteUntil,
  } = loadDurationReportCutoffHelpers();
  const expectedScenarioIds = ["scenario-a", "scenario-b"];
  const completeSnapshots = [
    {
      asOf: "2026-09-21T15:00:05.000Z",
      name: "A",
      occupied: false,
      scenarioId: "scenario-a",
      total: 0,
    },
    {
      asOf: "2026-09-21T15:00:02.000Z",
      name: "B",
      occupied: true,
      scenarioId: "scenario-b",
      total: 3,
    },
  ];

  assert.equal(
    durationCurrentSnapshotsDataCompleteUntil(
      completeSnapshots,
      expectedScenarioIds,
    )?.toISOString(),
    "2026-09-21T15:00:02.000Z",
    "o estado composto deve usar o asOf mais antigo dos cenários certificados",
  );
  assert.equal(
    durationCurrentSnapshotsDataCompleteUntil([], []),
    undefined,
    "card oculto ou sem composição não participa do corte",
  );
  assert.equal(
    durationCurrentSnapshotsDataCompleteUntil(
      completeSnapshots.slice(0, 1),
      expectedScenarioIds,
    ),
    null,
    "composição parcial não pode certificar o corte",
  );
  assert.equal(
    durationCurrentSnapshotsDataCompleteUntil(
      [{ ...completeSnapshots[0], error: "indisponível", total: null }],
      ["scenario-a"],
    ),
    null,
    "erro ou total ausente precisa invalidar o corte",
  );
  assert.equal(
    durationCurrentSnapshotsDataCompleteUntil(
      [{ ...completeSnapshots[0], asOf: "inválido" }],
      ["scenario-a"],
    ),
    null,
    "asOf inválido precisa invalidar o corte",
  );
  assert.equal(
    durationCurrentSnapshotsDataCompleteUntil(
      [{ ...completeSnapshots[0], occupied: null }],
      ["scenario-a"],
    ),
    null,
    "estado atual ausente não pode certificar o corte",
  );

  const aggregateCutoff = new Date("2026-09-21T14:59:00.000Z");
  const snapshotCutoff = new Date("2026-09-21T15:00:02.000Z");
  assert.equal(
    combineDurationDataCompleteUntil(
      aggregateCutoff,
      snapshotCutoff,
    )?.toISOString(),
    aggregateCutoff.toISOString(),
    "o relatório deve publicar o menor corte entre todas as fontes participantes",
  );
  assert.equal(combineDurationDataCompleteUntil(undefined, undefined), undefined);
  assert.equal(combineDurationDataCompleteUntil(aggregateCutoff, null), null);

  const callbackSource = widgetSource.slice(
    widgetSource.indexOf("const loadReportSnapshot = React.useCallback"),
    widgetSource.indexOf("const durationDataCompleteUntil"),
  );
  assert.match(
    callbackSource,
    /dataCompleteUntil = combineDurationDataCompleteUntil\([\s\S]*?durationSeriesDataCompleteUntil\([\s\S]*?durationCurrentSnapshotsDataCompleteUntil\(/,
    "o callback de exportação precisa compor agregado e snapshot atual",
  );
});

test("dashboard aguarda duração e permanência antes de montar o relatório", () => {
  const start = dashboardSource.indexOf(
    "async function getOccupancyReportPayload",
  );
  const end = dashboardSource.indexOf("return (", start);
  assert.ok(start >= 0 && end > start, "montagem do relatório Ao Vivo ausente");
  const exportSource = dashboardSource.slice(start, end);

  assert.match(exportSource, /loadOccupancyDurationReportSnapshot\(signal\)/);
  assert.match(exportSource, /occupancyLoitering\.loadReportAssets\(signal\)/);
  assert.match(
    exportSource,
    /occupancyDurationReportSnapshot\.reportAssets/,
  );
  assert.match(
    exportSource,
    /occupancyDurationReportSnapshot\.reportMetrics/,
  );
  assert.match(
    exportSource,
    /occupancyDurationReportSnapshot\.dataCompleteUntil/,
  );
  assert.match(
    exportSource,
    /occupancyDurationReportSnapshot\.reportWarnings/,
  );
});

test("permanência média por cenário entra no catálogo com composição comparativa", () => {
  assert.match(
    widgetSource,
    new RegExp(
      `OCCUPANCY_DURATION_CARD_IDS[\\s\\S]*?"${averageByScenarioCardId}"`,
    ),
    "o card precisa participar da demanda, persistência e ordenação do Ao Vivo",
  );
  assert.match(
    widgetSource,
    new RegExp(
      `id: "${averageByScenarioCardId}"[\\s\\S]*?scenarioSelectionPolicy: "compare"`,
    ),
    "cada instância precisa permitir escolher e comparar seus próprios cenários",
  );
  assert.match(
    widgetSource,
    /buildOccupancyDurationAverageByScenarioEntries[\s\S]*?preserve the scenario order[\s\S]*?return series\.map/,
    "sem uma chave matemática única, o comparativo deve preservar a ordem escolhida pelo usuário",
  );
  assert.match(
    widgetSource,
    /const commonCardProps = \{[\s\S]*?scenarioConfigurable: true as const/,
  );
  assert.match(
    preferenceSource,
    new RegExp(`card\\("${averageByScenarioCardId}"`),
    "o widget precisa aparecer no configurador e ser persistido no user-grid",
  );
});

test("tempo médio por cenário usa exclusivamente sequências dos snapshots", () => {
  const {
    buildDurationAverageByScenarioReportTable,
    buildOccupancyDurationAverageByScenarioEntries,
  } =
    loadAverageByScenarioBuilders();
  const series = [
    durationSeries("mixed", "Misto", ["occupied", "free", "occupied"]),
    durationSeries("free-only", "Livre", ["free", "free"]),
    durationSeries("occupied-long", "Ocupado", [
      "occupied",
      "occupied",
      "occupied",
      "free",
    ]),
    durationSeries("error", "Indisponível", ["unknown"], {
      error: "Atualização indisponível",
    }),
  ];

  const entries = buildOccupancyDurationAverageByScenarioEntries(series);

  assert.deepEqual(
    entries.map((entry: RuntimeFixture) => entry.scenarioId),
    [
      "mixed",
      "free-only",
      "occupied-long",
      "error",
    ],
    "a composição deve respeitar exatamente a ordem escolhida pelo usuário",
  );
  assert.deepEqual(
    entries.map((entry: RuntimeFixture) => entry.averageOccupiedSeconds),
    [60, null, 180, null],
  );
  assert.equal(entries[0].averageFreeSeconds, 60);
  assert.equal(entries[0].longestOccupiedSeconds, 60);
  assert.equal(entries[0].longestFreeSeconds, 60);
  assert.equal(entries[1].averageFreeSeconds, 120);
  assert.equal(entries[1].longestFreeSeconds, 120);
  assert.equal(entries[3].error, "Atualização indisponível");
  const table = buildDurationAverageByScenarioReportTable(entries);
  assert.deepEqual(
    table.rows.slice(0, 2).map((row: RuntimeFixture) => ({
      averageFree: row.averageFreeSeconds,
      averageOccupied: row.averageOccupiedSeconds,
      longestFree: row.longestFreeSeconds,
      longestOccupied: row.longestOccupiedSeconds,
    })),
    [
      {
        averageFree: 60,
        averageOccupied: 60,
        longestFree: 60,
        longestOccupied: 60,
      },
      {
        averageFree: 120,
        averageOccupied: null,
        longestFree: 120,
        longestOccupied: null,
      },
    ],
    "o relatório deve preservar médias e maiores períodos dos dois estados",
  );
  assert.equal(table.rows[3].averageOccupiedSeconds, null);
  assert.match(
    widgetSource,
    /buildOccupancyDurationAverageByScenarioEntries[\s\S]*?deriveOccupancyStateMetrics\(scenario\.summary\)/,
    "o comparativo deve derivar seus valores do resumo agregado do cenário",
  );
  const entryBuilderSource = widgetSource.slice(
    widgetSource.indexOf(
      "function buildOccupancyDurationAverageByScenarioEntries",
    ),
    widgetSource.indexOf("function durationAverageEntryStatus"),
  );
  assert.match(
    entryBuilderSource,
    /deriveOccupancyStateMetrics|averageConfirmedOccupiedSequenceSeconds/,
    "médias contínuas precisam vir dos estados observados nos snapshots",
  );
  assert.doesNotMatch(entryBuilderSource, /sessionCount|individualDwell/);
});

test("tempo médio diferencia carregamento, erro e ausência de estado confirmado", () => {
  const cardSource = widgetSource.slice(
    widgetSource.indexOf("function OccupancyDurationAverageByScenarioCard"),
    widgetSource.indexOf("function DurationChartCard"),
  );
  assert.match(
    cardSource,
    /const hasStateDuration = entries\.some\([\s\S]*?entry\.averageOccupiedSeconds !== null[\s\S]*?entry\.averageFreeSeconds !== null/,
    "ao menos um estado confirmado deve habilitar o gráfico",
  );
  assert.match(cardSource, /hasData=\{hasStateDuration\}/);
  assert.match(
    cardSource,
    /noDataText="Ainda não há intervalos ocupados ou desocupados confirmados neste período\."/,
  );

  const chartCardSource = widgetSource.slice(
    widgetSource.indexOf("function DurationChartCard"),
    widgetSource.indexOf("function DurationNotice"),
  );
  assert.match(
    chartCardSource,
    /loading \?[\s\S]*?!hasSelection \?[\s\S]*?error && !hasData \?[\s\S]*?!hasData \?[\s\S]*?<EChart/,
    "loading, falta de seleção, erro e ausência de estados devem anteceder o ECharts",
  );
  assert.match(
    chartCardSource,
    /!loading && hasSelection && hasData \? textAlternative : null/,
    "o estado vazio não deve manter uma alternativa textual de gráfico invisível",
  );
});

test("gráfico de duração média mostra os dois estados e zooma mais de oito cenários", () => {
  const { buildOccupancyDurationAverageByScenarioOption } =
    loadAverageByScenarioBuilders();
  const entries = Array.from({ length: 9 }, (_, index) => ({
    averageFreeSeconds: index === 8 ? null : (9 - index) * 8,
    averageOccupiedSeconds: index === 8 ? null : (9 - index) * 10.25,
    error: undefined,
    longestFreeSeconds: index === 8 ? null : (9 - index) * 16,
    longestOccupiedSeconds: index === 8 ? null : (9 - index) * 20,
    name: `Cenário ${index + 1}`,
    scenarioId: `scenario-${index + 1}`,
  }));
  const option = buildOccupancyDurationAverageByScenarioOption({
    entries,
    interactive: true,
    monitorMode: false,
    theme: "light",
    widgetColor: "#1267C4",
  });
  const chartSeries = firstChartSeries(option);
  const yAxis = firstAxis(option.yAxis);

  assert.deepEqual(yAxis.data, entries.map((entry) => entry.name));
  assert.equal(chartSeries.type, "bar");
  assert.equal(chartSeries.label?.show, true);
  assert.equal(
    chartSeries.label?.formatter?.({ dataIndex: 0, value: 92.25 }),
    "1min 32s",
  );
  assert.equal(
    chartSeries.label?.formatter?.({ dataIndex: 8, value: null }),
    "",
    "ausência e zero não devem poluir o gráfico com um rótulo 0",
  );
  assert.ok(Array.isArray(option.dataZoom));
  assert.ok(
    option.dataZoom.some(
      (zoom: RuntimeFixture) =>
        zoom.type === "slider" && zoom.yAxisIndex === 0 && zoom.endValue === 7,
    ),
  );
  const tooltip = option.tooltip?.formatter?.([
    { dataIndex: 0, value: 92.25 },
  ]);
  assert.match(String(tooltip), /Média ocupada: 1min 32s/);
  assert.match(String(tooltip), /Média desocupada: 1min 12s/);
  assert.match(String(tooltip), /Maior período ocupado: 3min/);
  assert.match(String(tooltip), /Maior período desocupado: 2min 24s/);
  assert.doesNotMatch(String(tooltip), /Sessões/);
  assert.equal(option.series.length, 4);
  assert.ok(
    option.dataZoom.some(
      (zoom: RuntimeFixture) =>
        zoom.type === "inside" && zoom.yAxisIndex === 0,
    ),
  );

  const exportOption = buildOccupancyDurationAverageByScenarioOption({
    entries,
    interactive: false,
    monitorMode: false,
    theme: "light",
    widgetColor: "#1267C4",
  });
  assert.equal(exportOption.dataZoom, undefined);
});

test("tempo médio por cenário gera asset e tabela snapshot no relatório", () => {
  const reportBuilderSource = widgetSource.slice(
    widgetSource.indexOf("function buildDurationReportAssets"),
    widgetSource.indexOf("function buildDurationSummaryReportTable"),
  );
  assert.match(
    reportBuilderSource,
    new RegExp(`cardId: "${averageByScenarioCardId}"`),
  );
  assert.match(
    reportBuilderSource,
    /buildOccupancyDurationAverageByScenarioOption\(\{[\s\S]*?interactive: false/,
  );
  assert.match(
    reportBuilderSource,
    /orderedSelectedSeries\(/,
    "a exportação precisa respeitar a composição e a ordem configuradas",
  );
  assert.match(
    widgetSource,
    /averageOccupiedSeconds[\s\S]*?Média ocupada \(s\)[\s\S]*?averageFreeSeconds[\s\S]*?longestOccupiedSeconds[\s\S]*?longestFreeSeconds/,
    "o PDF precisa levar médias e maiores períodos auditáveis dos snapshots",
  );
  assert.doesNotMatch(reportBuilderSource, /sessionCount|individualDwell/);
});

function loadAverageByScenarioBuilders() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const targetNames = new Set([
    "buildOccupancyDurationAverageByScenarioEntries",
    "buildOccupancyDurationAverageByScenarioOption",
    "buildDurationAverageByScenarioReportTable",
    "durationAverageEntryStatus",
    "escapeHtml",
    "formatDecimal",
    "isRecord",
    "numericValue",
    "roundDurationSeconds",
    "truncateLabel",
  ]);
  const declarations = ast.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      targetNames.has(node.name?.text ?? ""),
  );
  const foundNames = new Set(
    declarations.flatMap((node) =>
      ts.isFunctionDeclaration(node) && node.name ? [node.name.text] : [],
    ),
  );
  for (const required of [
    "buildOccupancyDurationAverageByScenarioEntries",
    "buildOccupancyDurationAverageByScenarioOption",
    "buildDurationAverageByScenarioReportTable",
  ]) {
    assert.ok(foundNames.has(required), `${required} precisa existir`);
  }
  const output = ts.transpileModule(
    `${declarations.map((node) => node.getText(ast)).join("\n")}\nreturn { buildDurationAverageByScenarioReportTable, buildOccupancyDurationAverageByScenarioEntries, buildOccupancyDurationAverageByScenarioOption };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  const bindings: Record<string, RuntimeFixture> = {
    CARD_LABELS: {
      occupancy_duration_average_by_scenario:
        "Tempo médio ocupado/livre por cenário",
    },
    deriveOccupancyStateMetrics:
      occupancyDuration.deriveOccupancyStateMetrics,
    formatOccupancyDuration: occupancyDuration.formatOccupancyDuration,
    getOccupancyChartPalette: (theme: "dark" | "light") =>
      theme === "dark"
        ? chartPalette("#A8B3C7", "#273244", "#0F172A", "#E2E8F0")
        : chartPalette("#66758A", "#E8EEF6", "#FFFFFF", "#13233A"),
  };
  return new Function(...Object.keys(bindings), output)(
    ...Object.values(bindings),
  );
}

function loadDurationScenarioLabelBuilder() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const targetNames = new Set([
    "durationScenarioAverageLabel",
    "durationScenarioAxisLabel",
    "truncateLabel",
  ]);
  const declarations = ast.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      targetNames.has(node.name?.text ?? ""),
  );
  const output = ts.transpileModule(
    `${declarations.map((node) => node.getText(ast)).join("\n")}\nreturn { durationScenarioAxisLabel };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  const bindings: Record<string, RuntimeFixture> = {
    deriveOccupancyStateMetrics:
      occupancyDuration.deriveOccupancyStateMetrics,
    formatOccupancyDuration: occupancyDuration.formatOccupancyDuration,
  };
  return new Function(...Object.keys(bindings), output)(
    ...Object.values(bindings),
  );
}

function loadTimelinePresentationHelpers() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const targetNames = new Set([
    "buildOccupancyDurationTimelineSegments",
    "occupancyDurationTimelineState",
    "occupancyDurationTimelineStateLabel",
  ]);
  const declarations = ast.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      targetNames.has(node.name?.text ?? ""),
  );
  assert.equal(declarations.length, targetNames.size);
  const output = ts.transpileModule(
    `${declarations.map((node) => node.getText(ast)).join("\n")}\nreturn { buildOccupancyDurationTimelineSegments, occupancyDurationTimelineState, occupancyDurationTimelineStateLabel };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  return new Function(output)();
}

function timelineSegment(
  state: "free" | "occupied" | "transition" | "unknown",
  from: number,
  minutes: number,
) {
  return {
    from: new Date(from),
    seconds: minutes * 60,
    state,
    to: new Date(from + minutes * 60_000),
  };
}

function loadCurrentStateResolver() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = ast.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "resolveCurrentOccupancyState",
  );
  assert.ok(declaration, "resolveCurrentOccupancyState precisa existir");
  const output = ts.transpileModule(
    `${declaration.getText(ast)}\nreturn { resolveCurrentOccupancyState };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  return new Function(
    "classifyOccupancySnapshot",
    output,
  )(occupancyComparison.classifyOccupancySnapshot);
}

function loadDurationReportCutoffHelpers() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const targetNames = new Set([
    "combineDurationDataCompleteUntil",
    "durationCurrentSnapshotsDataCompleteUntil",
    "earliestDate",
  ]);
  const declarations = ast.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      targetNames.has(node.name?.text ?? ""),
  );
  assert.equal(declarations.length, targetNames.size);
  const output = ts.transpileModule(
    `${declarations.map((node) => node.getText(ast)).join("\n")}\nreturn { combineDurationDataCompleteUntil, durationCurrentSnapshotsDataCompleteUntil };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  return new Function(output)();
}

function loadDurationAverageSummaryBuilder() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = ast.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "durationAverageSummary",
  );
  assert.ok(declaration, "durationAverageSummary precisa existir");
  const output = ts.transpileModule(
    `${declaration.getText(ast)}\nreturn { durationAverageSummary };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  return new Function(output)();
}

function loadDurationAverageComparisonBuilder() {
  const ast = ts.createSourceFile(
    widgetPath,
    widgetSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const targetNames = new Set([
    "buildDurationAverageComparisonRows",
    "durationAverageSummary",
    "summarizeSelectedSeries",
  ]);
  const declarations = ast.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      targetNames.has(node.name?.text ?? ""),
  );
  assert.equal(declarations.length, targetNames.size);
  const output = ts.transpileModule(
    `${declarations.map((node) => node.getText(ast)).join("\n")}\nreturn { buildDurationAverageComparisonRows };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: widgetPath,
    },
  ).outputText;
  const bindings = {
    deriveOccupancyStateMetrics:
      occupancyDuration.deriveOccupancyStateMetrics,
    occupancyAggregatePresentationWarning: (value: unknown) =>
      typeof value === "string" ? value : undefined,
  };
  return new Function(...Object.keys(bindings), output)(
    ...Object.values(bindings),
  );
}

function durationSeries(
  scenarioId: string,
  name: string,
  states: Array<"free" | "occupied" | "transition" | "unknown">,
  annotations: { error?: string; warning?: string } = {},
) {
  const from = Date.parse("2026-09-16T12:00:00.000Z");
  const buckets = states.map(
    (_, index) => new Date(from + index * 60_000),
  );
  const metrics = new Map<number, RuntimeFixture>();
  states.forEach((state, index) => {
    if (state === "unknown") return;
    metrics.set(
      buckets[index].getTime(),
      state === "occupied"
        ? { average: 1, minimum: 1, peak: 1 }
        : state === "free"
          ? { average: 0, minimum: 0, peak: 0 }
          : { average: 0.5, minimum: 0, peak: 1 },
    );
  });
  return {
    ...annotations,
    name,
    scenarioId,
    summary: occupancyDuration.buildOccupancyDurationSummary(buckets, metrics),
  };
}

function currentSnapshot(
  scenarioId: string,
  total: number | null,
  error?: string,
) {
  return {
    error,
    name: scenarioId,
    occupied: total === null ? null : total > 0,
    scenarioId,
    total,
  };
}

function chartPalette(
  axisText: string,
  gridLine: string,
  tooltipBackground: string,
  tooltipText: string,
) {
  return {
    axisLine: gridLine,
    axisText,
    gridLine,
    legendText: axisText,
    surface: tooltipBackground,
    tooltipBackground,
    tooltipBorder: gridLine,
    tooltipText,
  };
}

function firstAxis(axis: RuntimeFixture) {
  return Array.isArray(axis) ? axis[0] : axis;
}

function firstChartSeries(option: RuntimeFixture) {
  assert.ok(Array.isArray(option.series));
  assert.ok(option.series.length > 0);
  return option.series[0];
}
