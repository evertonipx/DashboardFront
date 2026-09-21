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
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
const retry = load("lib/occupancy-live-retry.ts");
const source = readFileSync(
  resolve(root, "components/app/occupancy-scenario-dashboard.tsx"),
  "utf8",
);
const ast = ts.createSourceFile(
  "live.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const names = [
  "buildOccupancyChartDefinitions",
  "listBucketStarts",
  "alignToGranularity",
  "alignEndToGranularity",
  "addGranularity",
  "bucketLabel",
  "weekdayShortName",
  "weekOfMonthLabel",
  "startOfMinute",
  "startOfHour",
  "startOfDay",
  "startOfWeek",
  "startOfMonth",
  "addMinutes",
  "addDays",
  "addMonths",
  "buildOccupancyChartState",
  "buildOccupancyPoints",
  "occupancyDisplayPoints",
  "joinOccupancyWarnings",
  "buildOccupancyChartQueryPlan",
  "mergeOccupancyChartRows",
  "occupancyChartRowBucketKey",
  "occupancyLiveResourceIsDue",
];
const bindings: Record<string, RuntimeFixture> = {
  ...load("lib/company-time-zone.ts"),
  ...load("lib/aggregate-time.ts"),
  ...load("lib/occupancy-calendar.ts"),
  ...load("lib/utils.ts"),
  ...load("lib/occupancy-aggregate-validation.ts"),
  ...load("lib/occupancy-hour-axis.ts"),
  MINUTE_MS: 60_000,
  HOUR_MS: 3_600_000,
  DAY_MS: 86_400_000,
};
const declarations = ast.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""),
);
assert.equal(declarations.length, names.length);
const output = ts.transpileModule(
  declarations.map((node) => node.getText(ast)).join("\n") +
    "\nreturn {buildOccupancyChartDefinitions,listBucketStarts,bucketLabel,buildOccupancyChartState,buildOccupancyChartQueryPlan,mergeOccupancyChartRows,occupancyLiveResourceIsDue};",
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const live = new Function(...Object.keys(bindings), output)(
  ...Object.values(bindings),
);

test("falhas usam espera progressiva limitada, sem novas tentativas a cada 5 segundos", () => {
  let state: RuntimeFixture;
  let now = 1_000_000;
  for (const delay of [
    15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000,
  ]) {
    state = retry.nextOccupancyLiveRetry(state, false, now);
    assert.equal(state.retryAt - now, delay);
    assert.equal(retry.occupancyLiveRetryReady(state, now + 5_000), false);
    assert.equal(
      retry.occupancyLiveRetryReady(state, state.retryAt - 1),
      false,
    );
    assert.equal(retry.occupancyLiveRetryReady(state, state.retryAt), true);
    now = state.retryAt;
  }
});

test("atualização manual ignora espera e sucesso reinicia o contador", () => {
  const state = retry.nextOccupancyLiveRetry(undefined, false, 1_000);
  assert.equal(retry.occupancyLiveRetryReady(state, 1_001, true), true);
  assert.equal(retry.nextOccupancyLiveRetry(state, true, 1_002), undefined);
  assert.equal(retry.occupancyLiveRetryReady(undefined, 1_002), true);
});

test("controle de tentativas precede mudança de janela e só sucesso atualiza frescor", () => {
  assert.match(
    source,
    /const liveMutableEdge =[\s\S]*?if \(\s*!liveMutableEdge &&\s*!occupancyLiveRetryReady\([\s\S]*?\)\s*\)\s*return false;[\s\S]*?const windowKey/,
  );
  assert.match(
    source,
    /if \(!entry.succeeded\) return;[\s\S]*?nextFreshness\.chartAt/,
  );
  assert.match(source, /retries\?\.history/);
  assert.match(source, /retries\?\.alerts/);
});

test("frescor iniciado na requisição mantém pulsos início-a-início em 5s", () => {
  const requestStartedAt = 1_000;
  const completedAt = 2_000;
  const nextPulse = new Date(6_000);

  assert.equal(
    live.occupancyLiveResourceIsDue(
      requestStartedAt,
      5_000,
      nextPulse,
    ),
    true,
  );
  assert.equal(
    live.occupancyLiveResourceIsDue(completedAt, 5_000, nextPulse),
    false,
    "usar a conclusão repetiria o antigo salto de aproximadamente 5s para 10s",
  );
});

for (const browserZone of ["UTC", "America/Sao_Paulo", "America/Santiago"]) {
  test(`Ao Vivo respeita dia da empresa com navegador ${browserZone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = browserZone;
    try {
      const definitions = live.buildOccupancyChartDefinitions(
        new Date("2026-09-11T02:30:00Z"),
        "America/Sao_Paulo",
      );
      const hourly = definitions.find(
        (item: RuntimeFixture) => item.granularity === "hour",
      );
      assert.equal(hourly.from.toISOString(), "2026-09-10T03:00:00.000Z");
      assert.equal(hourly.to.toISOString(), "2026-09-11T03:00:00.000Z");
      const buckets = live.listBucketStarts(hourly);
      assert.equal(buckets.length, 24);
      assert.equal(
        live.bucketLabel(buckets[0], "hour", hourly.timeZone),
        "00h",
      );
      assert.equal(
        live.bucketLabel(buckets.at(-1), "hour", hourly.timeZone),
        "23h",
      );
      const daily = definitions.find(
        (item: RuntimeFixture) => item.granularity === "day",
      );
      assert.equal(bindings.occupancyCalendarDateKey(daily.from), "2026-09-04");
      assert.equal(bindings.occupancyCalendarDateKey(daily.to), "2026-09-11");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}

test("intervalo civil não carrega 01h do avanço DST para o próximo dia", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Santiago";
  try {
    const definitions = live.buildOccupancyChartDefinitions(
      new Date("2026-09-06T12:00:00Z"),
      "America/Santiago",
    );
    const daily = definitions.find(
      (item: RuntimeFixture) => item.granularity === "day",
    );
    assert.equal(daily.to.getHours(), 0);
    assert.equal(live.listBucketStarts(daily).length, 7);
    const hourly = definitions.find(
      (item: RuntimeFixture) => item.granularity === "hour",
    );
    assert.equal(hourly.from.toISOString(), "2026-09-06T04:00:00.000Z");
    assert.equal(live.bucketLabel(hourly.from, "hour", hourly.timeZone), "01h");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("configurações persistidas e controles visuais respeitam o acesso de edição", () => {
  assert.match(
    source,
    /const updateDashboardSettings[\s\S]*?if \(!canEditVisual\) return;/,
  );
  assert.match(source, /canEditVisual && operationalSettingsOpen/);
  assert.match(
    source,
    /canEditVisual\s*\?\s*\(\s*<div\s+aria-label="Aparência/,
  );
  assert.match(
    source,
    /masterCrossCompanyScope\s*\?\s*selectExplicitCompanyScopedRows\(\s*response,\s*companyScopeId/,
  );
});

test("Ao Vivo prioriza a leitura essencial e só monta relatórios sob demanda", () => {
  assert.match(source, /const userGridReadiness = useUserGridReady\(userId\)/);
  assert.match(
    source,
    /const occupancyPreferencesReady =\s*userGridReadiness !== "pending"/,
  );
  assert.match(
    source,
    /const secondaryOccupancyPreferences = secondaryOccupancyQueriesEnabled\s*\? hydratedOccupancyPreferences\s*: EMPTY_OCCUPANCY_PREFERENCES/,
  );
  assert.equal(
    (
      source.match(
        /enabled: secondaryOccupancyQueriesEnabled/g,
      ) ?? []
    ).length,
    3,
    "duração diária, insights mensais e permanência individual devem compartilhar o mesmo gate de demanda",
  );
  assert.match(
    source,
    /const secondaryOccupancyQueriesEnabled =\s*companyTimeZoneCertified &&\s*occupancyPreferencesReady &&\s*Boolean\(selectedScenario\) &&\s*\(!primaryOccupancyDataRequested \|\| hasLoadedSelectedScenario\)/,
    "fontes secundárias visíveis não podem depender de um widget primário oculto",
  );
  assert.match(
    source,
    /async function getOccupancyReportPayload\(signal\?: AbortSignal\)/,
  );
  assert.match(
    source,
    /await occupancyLoitering\.loadReportAssets\(signal\)/,
    "exportação e IA devem aguardar os dados de permanência solicitados explicitamente",
  );
  assert.doesNotMatch(
    source,
    /const occupancyReportPayload = buildOccupancyDashboardReport/,
  );
  assert.equal(
    (source.match(/getPayload=\{getOccupancyReportPayload\}/g) ?? []).length,
    2,
    "exportação e IA devem compartilhar o relatório lazy",
  );
  assert.match(
    source,
    /occupancyComparisonReportAssets:\s*getOccupancyComparisonReportAssets\(\)/,
  );
  assert.match(
    source,
    /occupancyDurationReportAssets:\s*getOccupancyDurationReportAssets\(\)/,
  );
  assert.match(source, /occupancyDurationInsights\.getReportAssets\(\)/);
});

test("Ao Vivo ativa fontes pesadas somente quando o widget se aproxima da viewport", () => {
  assert.match(source, /cardDemandRootMargin="160px 0px"/);
  assert.match(source, /cardDemandScopeKey=\{activeDataScopeKey\}/);
  assert.match(source, /onCardDemand=\{registerDemandedOccupancyCard\}/);
  assert.match(
    source,
    /buildOccupancyCardDemandKey\(\{[\s\S]*?materializedCardIds: demandedOccupancyCardIds/,
  );
  assert.equal(
    (source.match(/requestedCardIds: requestedOccupancyCardIds/g) ?? []).length,
    3,
    "comparativos, duração diária e insights mensais devem usar a mesma demanda",
  );
  assert.match(
    source,
    /requestedCardIds: requestedOccupancyLoiteringCardIds/,
    "permanência individual deve receber somente consumidores explícitos desse recurso",
  );
  assert.match(
    source,
    /OCCUPANCY_LOITERING_NETWORK_CARD_IDS = new Set<string>\(\s*\[\s*\.\.\.OCCUPANCY_LOITERING_CARD_IDS,\s*\.\.\.OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,?\s*\],?\s*\)/,
    "somente os catálogos explícitos de permanência base e temporal devem iniciar sessions ou summary",
  );
  assert.match(
    source,
    /preference\.visible === true &&\s*\(!requestedCardIds \|\| requestedCardIds\.has\(preference\.id\)\)/,
  );
  assert.match(
    source,
    /pendingDemandedCardIdsRef[\s\S]*?window\.setTimeout\([\s\S]*?120\)/,
    "a primeira viewport deve expandir o plano em um único lote",
  );
  assert.match(source, /onCardMaterialize=\{registerMaterializedOccupancyCard\}/);
  assert.match(
    source,
    /if \(!materializedCardIdsRef\.current\.has\(cardId\)\) return;/,
    "um placeholder distante não deve abrir fonte de rede antes de materializar",
  );
  assert.match(
    source,
    /mergeOccupancyCardDemand\(currentIds, pending\)/,
    "widgets fora da viewport devem sair do plano de rede",
  );
  assert.match(
    source,
    /pendingDemandedCardIdsRef\.current\.get\(cardId\) === true[\s\S]*?!activeDemandedCardIdsRef\.current\.has\(cardId\)[\s\S]*?scheduleFlush\(0\)/,
    "um card que apenas cruzou a viewport não deve iniciar consulta pesada",
  );
  assert.match(
    source,
    /demandedOccupancyCards\.scopeKey === activeDataScopeKey\s*\? demandedOccupancyCards\.ids\s*: EMPTY_OCCUPANCY_CARD_IDS/,
    "demanda da empresa/cenário anterior não pode atravessar o escopo",
  );
  assert.match(
    source,
    /React\.useEffect\(\(\) => \{\s*activeDemandedCardIdsRef\.current\.clear\(\);\s*pendingDemandedCardIdsRef\.current\.clear\(\)[\s\S]*?}, \[activeDataScopeKey\]\)/,
    "trocar o escopo também deve descartar eventos pendentes da viewport anterior",
  );
});

test("pulso instantâneo fica em 5s e agregados respeitam sua granularidade", () => {
  assert.match(
    source,
    /const OCCUPANCY_ALERTS_REFRESH_MS = 30_000/,
  );
  assert.match(
    source,
    /minute: OCCUPANCY_REFRESH_MS,[\s\S]*?hour: MINUTE_MS,[\s\S]*?day: 5 \* MINUTE_MS,[\s\S]*?week: 15 \* MINUTE_MS,[\s\S]*?month: HOUR_MS/,
  );
  assert.match(
    source,
    /useOccupancyDurationCards\(\{[\s\S]*?aggregateRefreshMs: MINUTE_MS/,
  );
  assert.match(
    source,
    /const OCCUPANCY_COMPARISON_AGGREGATE_REFRESH_MS = MINUTE_MS/,
  );
  assert.match(
    source,
    /const dueAlerts =\s*resourceGroup !== "secondary"/,
    "alertas demandados devem acompanhar a lane do pulso ao vivo",
  );
  assert.match(
    source,
    /definition\.granularity === "minute" \|\|\s*definition\.granularity === "hour"\s*\? 0\s*:\s*OCCUPANCY_CHART_REFRESH_MS/,
    "a borda mutável não pode reutilizar uma resposta settled do pulso anterior",
  );
  assert.match(
    source,
    /occupancyTemporalRefreshDelay\(liveRefreshMs\) -\s*\(Date\.now\(\) - startedAt\)/,
    "a latência deve ser descontada para preservar início-a-início em cinco segundos",
  );
});

test("carga fria lê a janela integral e ciclos quentes leem somente a borda mutável", () => {
  const definition = {
    id: "occupancy_chart_minute",
    label: "Minuto a minuto",
    description: "",
    granularity: "minute",
    from: new Date("2026-09-15T12:00:00Z"),
    to: new Date("2026-09-15T13:00:00Z"),
  };
  const buckets = live.listBucketStarts(definition);
  const mutable = buckets.at(-1).getTime();

  const cold = live.buildOccupancyChartQueryPlan(
    definition,
    undefined,
    true,
  );
  assert.equal(cold.fullAudit, true);
  assert.equal(cold.queryDefinition.from.getTime(), definition.from.getTime());

  const hot = live.buildOccupancyChartQueryPlan(definition, mutable, false);
  assert.equal(hot.fullAudit, false);
  assert.equal(hot.queryDefinition.from.getTime(), mutable);
  assert.equal(live.listBucketStarts(hot.queryDefinition).length, 1);

  const rolled = {
    ...definition,
    from: new Date("2026-09-15T12:01:00Z"),
    to: new Date("2026-09-15T13:01:00Z"),
  };
  const rollover = live.buildOccupancyChartQueryPlan(rolled, mutable, false);
  assert.equal(rollover.fullAudit, false);
  assert.equal(rollover.queryDefinition.from.getTime(), mutable);
  assert.equal(live.listBucketStarts(rollover.queryDefinition).length, 2);

  const expired = live.buildOccupancyChartQueryPlan(
    rolled,
    new Date("2026-09-14T12:00:00Z").getTime(),
    false,
  );
  assert.equal(expired.fullAudit, true);
  assert.equal(expired.queryDefinition.from.getTime(), rolled.from.getTime());
});

test("merge da borda substitui correções e preserva somente buckets da janela atual", () => {
  const definition = {
    id: "occupancy_chart_minute",
    label: "Minuto a minuto",
    description: "",
    granularity: "minute",
    from: new Date("2026-09-15T12:01:00Z"),
    to: new Date("2026-09-15T12:04:00Z"),
  };
  const queryDefinition = {
    ...definition,
    from: new Date("2026-09-15T12:02:00Z"),
  };
  const previous = [
    metricRow("2026-09-15T12:00:00Z", 0),
    metricRow("2026-09-15T12:01:00Z", 1),
    metricRow("2026-09-15T12:02:00Z", 2),
  ];
  const next = [
    metricRow("2026-09-15T12:02:00Z", 20),
    metricRow("2026-09-15T12:03:00Z", 3),
  ];
  const merged = live.mergeOccupancyChartRows(
    definition,
    queryDefinition,
    previous,
    next,
  );
  assert.deepEqual(
    merged.map((row: RuntimeFixture) => [row.bucket, row.scenario_total_avg]),
    [
      ["2026-09-15T12:01:00Z", 1],
      ["2026-09-15T12:02:00Z", 20],
      ["2026-09-15T12:03:00Z", 3],
    ],
  );
  assert.throws(
    () =>
      live.mergeOccupancyChartRows(definition, queryDefinition, previous, [
        metricRow("2026-09-15T12:01:00Z", 9),
      ]),
    /fora da borda/,
  );
});

test("pulso ao vivo e histórico usam lanes independentes sem apagar frescor", () => {
  assert.match(source, /const liveRequestRef = React\.useRef/);
  assert.match(source, /const secondaryRequestRef = React\.useRef/);
  assert.match(
    source,
    /const activeRequestRef = ownsLiveLane\s*\? liveRequestRef\s*: secondaryRequestRef/,
  );

  const cycleStart = source.indexOf("const loadScenarioCycle = React.useCallback");
  const cycleEnd = source.indexOf(
    "const refreshOccupancyDashboard = React.useCallback",
    cycleStart,
  );
  const cycle = source.slice(cycleStart, cycleEnd);
  assert.match(
    cycle,
    /const livePulse = loadScenarioData\(scenario, \{\s*resourceGroup: "live-pulse"[\s\S]*?void loadScenarioData\(scenario, \{\s*resourceGroup: "secondary"[\s\S]*?await livePulse/,
    "históricos devem iniciar sem bloquear a publicação do pulso focal",
  );

  const completedAt = source.indexOf("const completedAt = Date.now()");
  const freshnessCommit = source.slice(
    completedAt,
    source.indexOf("dataFreshnessRef.current = nextFreshness", completedAt) +
      "dataFreshnessRef.current = nextFreshness".length,
  );
  assert.match(
    freshnessCommit,
    /const latestFreshness =\s*dataFreshnessRef\.current\.scopeKey === requestedScopeKey\s*\? dataFreshnessRef\.current/,
    "cada lane deve mesclar o resultado sobre o frescor mais recente",
  );
  assert.match(freshnessCommit, /chartAt: \{ \.\.\.latestFreshness\.chartAt \}/);
  assert.match(
    freshnessCommit,
    /chartWindowKeys: \{ \.\.\.latestFreshness\.chartWindowKeys \}/,
  );
  assert.match(
    freshnessCommit,
    /historyAt: historyResult\.succeeded\s*\? requestStartedAt\s*: latestFreshness\.historyAt/,
  );
  assert.match(
    freshnessCommit,
    /alertsAt: alertResult\.succeeded\s*\? requestStartedAt\s*: latestFreshness\.alertsAt/,
  );
  assert.match(
    freshnessCommit,
    /nextFreshness\.chartAuditAt\[entry\.definition\.granularity\] =\s*requestStartedAt/,
  );
  assert.match(
    freshnessCommit,
    /nextFreshness\.chartAt\[entry\.definition\.granularity\] =\s*requestStartedAt/,
    "o frescor da borda mutável deve usar o início da rodada para não pular o próximo pulso",
  );
});

test("atualização manual preserva históricos fechados e a capacidade civil", () => {
  assert.match(
    source,
    /function occupancyLiveManualRefreshGranularity[\s\S]*?granularity === "minute"[\s\S]*?granularity === "hour"[\s\S]*?granularity === "day"/,
  );
  assert.doesNotMatch(source, /civilAggregateCapabilities\.clear\(\)/);
  const refreshStart = source.indexOf(
    "const refreshOccupancyDashboard = React.useCallback",
  );
  const refreshEnd = source.indexOf(
    "const retryOccupancyData = React.useCallback",
    refreshStart,
  );
  const refresh = source.slice(refreshStart, refreshEnd);
  assert.match(
    refresh,
    /loadScenarioData\(selectedScenario, \{\s*force: true,\s*resourceGroup: "live-pulse"/,
    "o botão deve forçar apenas a leitura instantânea",
  );
  assert.doesNotMatch(refresh, /resourceGroup: "secondary"|loadScenarioCycle/);
  assert.doesNotMatch(refresh, /refreshOccupancyComparisons\(\)/);
  assert.doesNotMatch(refresh, /refreshOccupancyDurationInsights/);
});

test("catálogo visual permanece estável entre atualizações sem mudança estrutural", () => {
  for (const name of [
    "metricCards",
    "chartCards",
    "customWidgetCards",
    "detailCards",
    "occupancyLayoutCards",
    "occupancyViewScopes",
    "occupancyScenarioOptions",
  ]) {
    assert.match(
      source,
      new RegExp(`const ${name} = React\\.useMemo\\(`),
      `${name} deve preservar a identidade entre renders equivalentes`,
    );
  }

  assert.match(source, /viewScopes=\{occupancyViewScopes\}/);
  assert.match(source, /scenarios=\{occupancyScenarioOptions\}/);
  assert.doesNotMatch(source, /viewScopes=\{visibleScenarios\.map/);
  assert.doesNotMatch(source, /scenarios=\{visibleScenarios\.map/);
  assert.match(
    source,
    /const definition = sourceDefinition\s*\? \{\s*\.\.\.sourceDefinition,\s*id: `occupancy_custom_\$\{widget\.id\}`/,
    "a tendência personalizada deve clonar a definição sem alterar o catálogo-base",
  );
});

test("metadados opcionais não bloqueiam dados válidos; lacunas reais permanecem identificadas", () => {
  const definition = {
    from: new Date("2026-09-10T13:00:00Z"),
    to: new Date("2026-09-10T14:00:00Z"),
    granularity: "hour",
    timeZone: "America/Sao_Paulo",
  };
  const rows = [
    {
      bucket: "2026-09-10T13:00:00Z",
      scenario_total_avg: 8,
      scenario_total_min: 1,
      scenario_total_max: 12,
    },
  ];
  const state = live.buildOccupancyChartState(
    definition,
    rows,
    "A fonte não informa metadados adicionais.",
  );
  assert.equal(state.incomplete, false);
  assert.equal(state.points[10].average, 8);
  assert.equal(state.points[10].current, null);
  assert.equal(state.points[11].average, null);
  assert.equal(live.buildOccupancyChartState(definition, []).incomplete, true);
  assert.match(
    source,
    /const hasIncompleteOccupancyCoverage\s*=\s*occupancyDataPlan\.granularities\.some/,
  );
  assert.match(
    source,
    /return !state \|\| Boolean\(state.error \|\| state.incomplete\)/,
  );
  assert.match(
    source,
    /loading=\{initialLoading \|\| !certifiedChartData\[definition.id\]\}/,
  );
});

function metricRow(bucket: string, value: number) {
  return {
    bucket,
    scenario_total_avg: value,
    scenario_total_max: value,
    scenario_total_min: value,
  };
}

function load(path: string): RuntimeFixture {
  const filename = resolve(root, path);
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  cache.set(filename, loaded);
  const localRequire = createRequire(filename);
  new Function("exports", "require", "module", output)(
    loaded.exports,
    (name: RuntimeFixture) =>
      name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : localRequire(name),
    loaded,
  );
  return loaded.exports;
}
