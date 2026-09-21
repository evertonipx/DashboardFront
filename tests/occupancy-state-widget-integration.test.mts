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
const occupancyLoitering: typeof import("../lib/occupancy-loitering.ts") =
  require("../lib/occupancy-loitering.ts");
const occupancyDurationQueryPlan: typeof import("../lib/occupancy-duration-query-plan.ts") =
  require("../lib/occupancy-duration-query-plan.ts");
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

test("resumo médio deixa quatro leituras visíveis sem criar outra consulta", () => {
  const { durationAverageSummary } = loadDurationAverageSummaryBuilder();
  const summary = durationAverageSummary({
    confirmedFreeSeconds: 30,
    confirmedFreeSequenceCount: 3,
    confirmedOccupiedSeconds: 240,
    confirmedOccupiedSequenceCount: 2,
    errorCount: 0,
    expectedSeconds: 360,
    loadUnitSeconds: 900,
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
  assert.ok(Math.abs(summary.coverage - 5 / 6) < Number.EPSILON);

  const unavailable = durationAverageSummary({
    confirmedFreeSeconds: 0,
    confirmedFreeSequenceCount: 0,
    confirmedOccupiedSeconds: 0,
    confirmedOccupiedSequenceCount: 0,
    errorCount: 0,
    expectedSeconds: 0,
    loadUnitSeconds: 0,
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
    averageOccupancy: null,
    averageOccupiedSeconds: null,
    coverage: null,
  });

  const componentSource = widgetSource.slice(
    widgetSource.indexOf("function OccupancyDurationAverageSummaryCard"),
    widgetSource.indexOf("function OccupancyDurationTimelineCard"),
  );
  for (const label of [
    "Ocupação média",
    "Tempo médio ocupado",
    "Tempo médio livre",
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
    /card\("occupancy_duration_average", "Resumo médio de ocupação"/,
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
  const rows = buildDurationAverageComparisonRows(selectedScenarios, [
    durationSeries("entrada", "Entrada", ["occupied", "occupied", "free"]),
    durationSeries("espera", "Espera", ["occupied", "free", "free"]),
    durationSeries("livre", "Livre", ["free", "free", "free"]),
  ]);

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
  assert.equal(rows[0].summary.averageFreeSeconds, 120);
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
  assert.equal(
    rows[3].summary.averageOccupancy,
    0,
    "ocupação zero é um valor válido e precisa entrar no divisor",
  );
  assert.deepEqual(rows[4].summary, {
    averageFreeSeconds: null,
    averageOccupancy: null,
    averageOccupiedSeconds: null,
    coverage: null,
  });

  const componentSource = widgetSource.slice(
    widgetSource.indexOf("function OccupancyDurationAverageSummaryCard"),
    widgetSource.indexOf("function OccupancyDurationTimelineCard"),
  );
  assert.match(componentSource, /Média entre cenários · tempos médios ponderados/);
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

test("Timeline e Tempo por cenário deixam a permanência média visível em cada linha", () => {
  assert.match(
    widgetSource,
    /function durationScenarioAverageLabel[\s\S]*?individualDwell[\s\S]*?Permanência[\s\S]*?sessionCount/,
  );
  assert.equal(
    (widgetSource.match(/durationScenarioAxisLabel\(scenario, 18\)/g) ?? [])
      .length,
    2,
    "os dois eixos por cenário precisam mostrar a permanência sem hover",
  );
  assert.equal(
    (widgetSource.match(/\.\.\.durationScenarioDwellTooltipLines\(scenario\)/g) ?? [])
      .length,
    2,
    "os dois tooltips precisam identificar média e quantidade de sessões",
  );
  assert.match(widgetSource, /Permanência média \(s\)/);
  assert.match(widgetSource, /Sessões concluídas/);
});

test("rótulo por cenário distingue permanência, ausência e carregamento", () => {
  const { durationScenarioAxisLabel } = loadDurationScenarioLabelBuilder();
  const ready: RuntimeFixture = durationSeries("ready", "Entrada principal", [
    "occupied",
    "occupied",
  ]);
  ready.individualDwell = {
    loading: false,
    totals: {
      avgDurationSeconds: 24.07,
      maxDurationSeconds: 44,
      minDurationSeconds: 5,
      sessionCount: 14,
    },
  };
  assert.equal(
    durationScenarioAxisLabel(ready, 18),
    "Entrada principal\nMédia 24,1 s · 14 sess.",
  );

  const empty: RuntimeFixture = durationSeries("empty", "Espera", ["free"]);
  empty.individualDwell = {
    loading: false,
    totals: {
      avgDurationSeconds: null,
      maxDurationSeconds: null,
      minDurationSeconds: null,
      sessionCount: 0,
    },
  };
  assert.equal(
    durationScenarioAxisLabel(empty, 18),
    "Espera\nMédia —",
  );

  empty.individualDwell.loading = true;
  assert.equal(
    durationScenarioAxisLabel(empty, 18),
    "Espera\nMédia carregando…",
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
    /loading=\{individualDwellLoading\}[\s\S]*?selectedSeries=\{resolveSelectedIndividualDwellSeries/,
    "o ranking de permanência deve carregar separadamente do agregado de estados",
  );
  assert.match(
    widgetSource,
    /totals: individualDwellLoading\s*\? undefined\s*: individualDwellTotalsByScenarioId\?\.get/,
    "uma resposta ainda pendente não pode ser apresentada como zero sessão",
  );
  assert.match(
    widgetSource,
    /!hasDueScenario && publishedRangeEnd === range\.to\.getTime\(\)[\s\S]*?scheduleNext\(\);[\s\S]*?return;/,
    "um pulso sem novo minuto ou auditoria não deve reconstruir o mesmo resumo",
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
    new RegExp(
      `id: "${averageByScenarioCardId}"[\\s\\S]*?scenarioOrderingDisabled: true`,
    ),
    "a ordem deste ranking deve continuar automática pelo valor médio",
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

test("permanência média por cenário usa somente o summary individual real", () => {
  const {
    buildDurationAverageByScenarioReportTable,
    buildOccupancyDurationAverageByScenarioEntries,
  } =
    loadAverageByScenarioBuilders();
  const series = [
    individualDwellSeries("empty-first", "Sem sessões A", {
      avgDurationSeconds: null,
      maxDurationSeconds: null,
      minDurationSeconds: null,
      sessionCount: 0,
    }),
    individualDwellSeries("average-24", "Espera", {
      avgDurationSeconds: 24.07,
      maxDurationSeconds: 44,
      minDurationSeconds: 5,
      sessionCount: 14,
    }),
    individualDwellSeries("loading", "Carregando", undefined, {
      loading: true,
    }),
    individualDwellSeries("average-46", "Parado", {
      avgDurationSeconds: 46.5,
      maxDurationSeconds: 85,
      minDurationSeconds: 7,
      sessionCount: 28,
    }),
    individualDwellSeries("error", "Indisponível", undefined, {
      error: "Atualização indisponível",
    }),
  ];

  const entries = buildOccupancyDurationAverageByScenarioEntries(series);

  assert.deepEqual(
    entries.map((entry: RuntimeFixture) => entry.scenarioId),
    [
      "average-46",
      "average-24",
      "empty-first",
      "loading",
      "error",
    ],
    "médias reais descem; ausências ficam no fim na ordem original",
  );
  assert.deepEqual(
    entries.map((entry: RuntimeFixture) => entry.averageDurationSeconds),
    [46.5, 24.07, null, null, null],
    "cenário sem sessão concluída deve continuar sem duração, nunca zero",
  );
  assert.equal(entries[0].sessionCount, 28);
  assert.equal(entries[0].minimumDurationSeconds, 7);
  assert.equal(entries[0].maximumDurationSeconds, 85);
  assert.equal(entries[4].error, "Atualização indisponível");
  assert.equal(entries[2].sessionCount, 0);
  assert.equal(entries[2].minimumDurationSeconds, null);
  assert.equal(entries[2].maximumDurationSeconds, null);
  const table = buildDurationAverageByScenarioReportTable(entries);
  assert.deepEqual(
    table.rows.slice(0, 2).map((row: RuntimeFixture) => ({
      average: row.averageDurationSeconds,
      maximum: row.maximumDurationSeconds,
      minimum: row.minimumDurationSeconds,
      sessions: row.sessionCount,
    })),
    [
      { average: 46.5, maximum: 85, minimum: 7, sessions: 28 },
      { average: 24.07, maximum: 44, minimum: 5, sessions: 14 },
    ],
    "o relatório deve preservar média, mínimo, máximo e contagem documentados",
  );
  assert.equal(table.rows[2].averageDurationSeconds, null);
  assert.match(
    widgetSource,
    /const dwell = scenario\.individualDwell;[\s\S]*?const totals = dwell\.totals;/,
    "o ranking deve ler o resultado de /loitering/summary",
  );
  const entryBuilderSource = widgetSource.slice(
    widgetSource.indexOf(
      "function buildOccupancyDurationAverageByScenarioEntries",
    ),
    widgetSource.indexOf("function durationAverageEntryStatus"),
  );
  assert.doesNotMatch(
    entryBuilderSource,
    /deriveOccupancyStateMetrics|averageConfirmedOccupiedSequenceSeconds/,
    "o fallback não pode inventar permanência a partir de sequências de estado",
  );
});

test("permanência média diferencia carregamento, erro e período sem sessões", () => {
  const cardSource = widgetSource.slice(
    widgetSource.indexOf("function OccupancyDurationAverageByScenarioCard"),
    widgetSource.indexOf("function DurationChartCard"),
  );
  assert.match(
    cardSource,
    /const hasCompletedSessions = entries\.some\([\s\S]*?entry\.sessionCount !== null && entry\.sessionCount > 0/,
    "somente uma sessão realmente concluída deve habilitar o gráfico",
  );
  assert.match(cardSource, /hasData=\{hasCompletedSessions\}/);
  assert.match(
    cardSource,
    /noDataText="Nenhuma sessão de permanência foi concluída neste período\."/,
  );

  const chartCardSource = widgetSource.slice(
    widgetSource.indexOf("function DurationChartCard"),
    widgetSource.indexOf("function DurationNotice"),
  );
  assert.match(
    chartCardSource,
    /loading \?[\s\S]*?!hasSelection \?[\s\S]*?error && !hasData \?[\s\S]*?!hasData \?[\s\S]*?<EChart/,
    "loading, falta de seleção, erro e zero sessões devem anteceder o ECharts",
  );
  assert.match(
    chartCardSource,
    /!loading && hasSelection && hasData \? textAlternative : null/,
    "o estado vazio não deve manter uma alternativa textual de gráfico invisível",
  );
});

test("gráfico da permanência média mantém rótulos reais e zooma mais de oito cenários", () => {
  const { buildOccupancyDurationAverageByScenarioOption } =
    loadAverageByScenarioBuilders();
  const entries = Array.from({ length: 9 }, (_, index) => ({
    averageDurationSeconds: index === 8 ? null : (9 - index) * 10.25,
    error: undefined,
    loading: false,
    maximumDurationSeconds: index === 8 ? null : (9 - index) * 20,
    minimumDurationSeconds: index === 8 ? null : 5,
    name: `Cenário ${index + 1}`,
    scenarioId: `scenario-${index + 1}`,
    sessionCount: index === 8 ? 0 : index + 1,
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
    "1 min 32,25 s",
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
  assert.match(String(tooltip), /Permanência média: 1 min 32,25 s/);
  assert.match(String(tooltip), /Menor permanência: 5 s/);
  assert.match(String(tooltip), /Maior permanência: 3 min/);
  assert.match(String(tooltip), /Sessões concluídas: 1/);
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

test("permanência média por cenário gera asset e tabela exata no relatório", () => {
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
    /averageDurationSeconds[\s\S]*?Permanência média \(s\)[\s\S]*?minimumDurationSeconds[\s\S]*?maximumDurationSeconds[\s\S]*?sessionCount/,
    "o PDF precisa levar média, mínimo, máximo e sessões auditáveis",
  );
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
    "roundLoiteringSeconds",
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
      occupancy_duration_average_by_scenario: "Permanência média por cenário",
    },
    formatOccupancyDuration: occupancyDuration.formatOccupancyDuration,
    formatOccupancyLoiteringDuration:
      occupancyLoitering.formatOccupancyLoiteringDuration,
    getOccupancyChartPalette: (theme: "dark" | "light") =>
      theme === "dark"
        ? chartPalette("#A8B3C7", "#273244", "#0F172A", "#E2E8F0")
        : chartPalette("#66758A", "#E8EEF6", "#FFFFFF", "#13233A"),
  };
  return new Function(...Object.keys(bindings), output)(
    ...Object.values(bindings),
  );
}

function individualDwellSeries(
  scenarioId: string,
  name: string,
  totals?: {
    avgDurationSeconds: number | null;
    maxDurationSeconds: number | null;
    minDurationSeconds: number | null;
    sessionCount: number;
  },
  annotations: { error?: string; loading?: boolean } = {},
) {
  return {
    individualDwell: {
      ...annotations,
      loading: annotations.loading ?? false,
      totals,
    },
    name,
    scenarioId,
  };
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
    formatOccupancyLoiteringDuration:
      occupancyLoitering.formatOccupancyLoiteringDuration,
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
