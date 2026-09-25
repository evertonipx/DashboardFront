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
const comparisonSource = readFileSync(
  resolve(root, "components/app/occupancy-comparison-widgets.tsx"),
  "utf8",
);
const durationSource = readFileSync(
  resolve(root, "components/app/occupancy-duration-widgets.tsx"),
  "utf8",
);
const durationInsightSource = readFileSync(
  resolve(root, "components/app/use-occupancy-duration-insights.tsx"),
  "utf8",
);
const liveDashboardSource = readFileSync(
  resolve(root, "components/app/occupancy-scenario-dashboard.tsx"),
  "utf8",
);
const query: typeof import("../lib/occupancy-dashboard-query.ts") = loadModule("lib/occupancy-dashboard-query.ts");
const scenarioSnapshots: typeof import("../lib/occupancy-scenario-snapshots.ts") = loadModule("lib/occupancy-scenario-snapshots.ts");
const definitionIds = ["occupancy_report_hour", "occupancy_report_day", "occupancy_report_month"];
const metricVisibility = { average: true, minimum: true, peak: true };
const cardIds = [
  ...definitionIds,
  "occupancy_report_current",
  "occupancy_active_areas",
  "occupancy_scenario_detail",
  "occupancy_report_average",
  "occupancy_report_peak",
  "occupancy_report_minimum",
];
const preferencesFor = (...visibleIds: string[]) => cardIds.map((id) => ({ id, visible: visibleIds.includes(id) }));

test("plano de demanda não consulta widget visível antes de sua materialização", () => {
  const preferences = [
    { id: "metric", visible: true, color: "#123456" },
    { id: "heatmap", visible: true, title: "Mapa" },
    { id: "hidden", visible: false },
  ];
  assert.equal(query.buildOccupancyCardDemandKey({
    eagerCardIds: ["metric", "hidden"],
    materializedCardIds: [],
    preferences,
  }), "metric");
  assert.equal(query.buildOccupancyCardDemandKey({
    eagerCardIds: ["metric"],
    materializedCardIds: ["heatmap", "hidden"],
    preferences,
  }), "heatmap|metric");
  assert.equal(query.buildOccupancyCardDemandKey({
    eagerCardIds: ["metric"],
    materializedCardIds: ["heatmap"],
    preferences: preferences.map((preference) => ({
      ...preference,
      color: "#abcdef",
      title: "Aparência alterada",
    })),
  }), "heatmap|metric", "aparência não reinicia consultas");
});

test("snapshot atual existe somente enquanto um widget demandado o consome", () => {
  const hidden = new Set<string>();
  assert.equal(query.occupancyLiveHistoryRequired(hidden, []), false);

  for (const cardId of [
    "occupancy_current_total",
    "occupancy_active_areas",
    "occupancy_scenario_detail",
    "occupancy_duration_transitions",
  ]) {
    assert.equal(
      query.occupancyLiveHistoryRequired(new Set([cardId]), []),
      true,
      cardId,
    );
  }

  const customWidgets = [
    { id: "current", kind: "metric", metric: "current" },
    { id: "average", kind: "metric", metric: "average" },
  ];
  assert.equal(
    query.occupancyLiveHistoryRequired(
      new Set(["occupancy_custom_current"]),
      customWidgets,
    ),
    true,
  );
  assert.equal(
    query.occupancyLiveHistoryRequired(
      new Set(["occupancy_custom_average"]),
      customWidgets,
    ),
    false,
    "média usa o agregado diário, não o snapshot atual",
  );
});

test("troca de widgets na viewport atualiza a demanda com a mesma cardinalidade", () => {
  const current = ["widget-a"];
  const next = query.mergeOccupancyCardDemand(
    current,
    new Map([
      ["widget-a", false],
      ["widget-b", true],
    ]),
  );
  assert.deepEqual(next, ["widget-b"]);
  assert.notEqual(next, current);

  const unchanged = query.mergeOccupancyCardDemand(
    next,
    new Map([["widget-b", true]]),
  );
  assert.equal(unchanged, next, "demanda idêntica preserva a referência");
});

test("snapshot consolidado compõe vários cenários com a leitura mais antiga", () => {
  const scenario = {
    active: true,
    areas: [
      { area_id: "area-a", camera_id: "camera-a" },
      { area_id: "area-b", camera_id: "camera-b" },
    ],
    company_id: "company-a",
    id: "scenario-a",
    name: "Praça",
    object_class: "person",
  };
  const rows = [
    {
      area: "area-a",
      avg: 2,
      camera_id: "camera-a",
      current_at: "2026-09-15T12:00:00Z",
      current_value: 3,
      min: 1,
      object_class: "person",
      occupied: true,
      peak: 4,
    },
    {
      area: "area-b",
      avg: 4,
      camera_id: "camera-b",
      current_at: "2026-09-15T12:00:01Z",
      current_value: 5,
      min: 2,
      object_class: "person",
      occupied: true,
      peak: 6,
    },
  ];
  assert.deepEqual(
    scenarioSnapshots.buildOccupancyScenarioSnapshotValue(scenario, rows),
    {
      asOf: "2026-09-15T12:00:00Z",
      name: "Praça",
      occupied: true,
      scenarioId: "scenario-a",
      total: 8,
    },
  );
  assert.deepEqual(
    scenarioSnapshots.buildOccupancyScenarioCurrentHistory(scenario, rows),
    {
      areas: [
        {
          area_id: "area-a",
          camera_id: "camera-a",
          occupied: true,
          snapshot_at: "2026-09-15T12:00:00Z",
          value: 3,
        },
        {
          area_id: "area-b",
          camera_id: "camera-b",
          occupied: true,
          snapshot_at: "2026-09-15T12:00:01Z",
          value: 5,
        },
      ],
      as_of: "2026-09-15T12:00:00Z",
      occupied: true,
      scenario_id: "scenario-a",
      total: 8,
    },
    "o cenário focado deve usar exatamente as mesmas linhas brutas da câmera",
  );
  assert.throws(
    () =>
      scenarioSnapshots.buildOccupancyScenarioSnapshotValue(
        scenario,
        rows.slice(0, 1),
    ),
    /area-b.*não está disponível/,
  );
  const baseline = {
    areas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
        occupied: true,
        snapshot_at: "2026-09-15T11:59:00Z",
        value: 2,
      },
      {
        area_id: "area-b",
        camera_id: "camera-b",
        occupied: true,
        snapshot_at: "2026-09-15T11:58:00Z",
        value: 5,
      },
    ],
    as_of: "2026-09-15T11:58:00Z",
    occupied: true,
    scenario_id: "scenario-a",
    total: 7,
  };
  assert.deepEqual(
    scenarioSnapshots.mergeOccupancyScenarioCurrentHistory(
      scenario,
      baseline,
      [
        {
          ...rows[0],
          avg: 0,
          current_at: "2026-09-15T12:00:00Z",
          current_value: 0,
          min: 0,
          occupied: false,
          peak: 0,
        },
      ],
    ),
    {
      areas: [
        {
          area_id: "area-a",
          camera_id: "camera-a",
          occupied: false,
          snapshot_at: "2026-09-15T12:00:00Z",
          value: 0,
        },
        baseline.areas[1],
      ],
      as_of: "2026-09-15T11:58:00Z",
      occupied: true,
      scenario_id: "scenario-a",
      total: 5,
    },
    "uma resposta raw parcial deve atualizar somente a área recebida e preservar o baseline certificado",
  );
  assert.equal(
    scenarioSnapshots.mergeOccupancyScenarioCurrentHistory(
      scenario,
      null,
      rows.slice(0, 1),
    ),
    null,
    "sem baseline completo o caller deve fazer um único bootstrap em /history",
  );
  assert.equal(
    scenarioSnapshots.buildOccupancyScenarioSnapshotValue(scenario, [
      {
        ...rows[0],
        avg: 0,
        current_value: 0,
        min: 0,
        occupied: false,
        peak: 0,
      },
      rows[1],
    ]).occupied,
    true,
    "uma área ocupada torna ocupado o cenário multiárea",
  );
  assert.equal(
    scenarioSnapshots.buildOccupancyScenarioSnapshotValue(
      scenario,
      rows.map((row) => ({
        ...row,
        avg: 0,
        current_value: 0,
        min: 0,
        occupied: false,
        peak: 0,
      })),
    ).occupied,
    false,
    "o cenário só fica livre quando todas as áreas certificadas estão livres",
  );
  assert.match(
    comparisonSource,
    /const snapshotQuery = occupancyLiveSnapshotQuery\(\{ now: requestedAt \}\)[\s\S]*?const path = snapshotQuery\.path[\s\S]*?fetchSharedOccupancyQuery<unknown>\(\{[\s\S]*?\bpath,/,
    "o lote atual deve usar a rota raw única construída para o ciclo",
  );
  assert.match(
    comparisonSource,
    /type SnapshotCacheEntry = \{[\s\S]*?history\?: OccupancyScenarioHistoryResponse[\s\S]*?snapshot: OccupancyScenarioSnapshot/,
    "o cache comparativo deve preservar o baseline por área junto da fotografia projetada",
  );
  assert.match(
    comparisonSource,
    /const merged = mergeOccupancyScenarioCurrentHistory\([\s\S]*?cached\?\.history,[\s\S]*?rows,[\s\S]*?if \(merged\) \{[\s\S]*?commitSnapshot\([\s\S]*?merged,[\s\S]*?\);[\s\S]*?return;[\s\S]*?const historyPath = occupancyComparisonHistoryPath\(/,
    "respostas raw parciais devem reutilizar o baseline antes de considerar um bootstrap",
  );
  assert.match(
    comparisonSource,
    /const historyPath = occupancyComparisonHistoryPath\([\s\S]*?requireOccupancyHistoryResponse\([\s\S]*?expectedAreas: scenario\.areas,[\s\S]*?requireAreaSnapshots: true,[\s\S]*?commitSnapshot\([\s\S]*?history[\s\S]*?history[\s\S]*?function commitSnapshot\([\s\S]*?history: history \?\? cached\?\.history/,
    "a ausência de baseline deve fazer um bootstrap certificado e persistente, não um fan-out recorrente",
  );
  assert.match(
    liveDashboardSource,
    /loadFocusedLiveSnapshot\(\{[\s\S]*?previousHistory:[\s\S]*?historyRef\.current\.value[\s\S]*?async function loadFocusedLiveSnapshot\(\{[\s\S]*?previousHistory[\s\S]*?const merged = mergeOccupancyScenarioCurrentHistory\([\s\S]*?previousHistory,[\s\S]*?rows,[\s\S]*?return merged \?\? loadHistoryFallback\(\)/,
    "a leitura focal deve mesclar o pulso parcial e consultar history somente para inicializar o baseline",
  );
  assert.match(
    liveDashboardSource,
    /catch \(snapshotError\)[\s\S]*?snapshotError\.status !== 404 && snapshotError\.status !== 405[\s\S]*?loadHistoryFallback/,
    "erros estruturais não podem ser mascarados pelo fallback de rota",
  );
  assert.match(
    liveDashboardSource,
    /occupancyLiveRetryReady\([\s\S]*?freshness\.retries\?\.history[\s\S]*?requireAreaSnapshots: true/,
    "o único fallback focal deve exigir prova por área e recuar depois de falhar",
  );
});

test("detalhe do cenário apresenta estado explícito e horário certificado por área", () => {
  const detailStart = liveDashboardSource.indexOf(
    "function OccupancyScenarioDetailCard",
  );
  const detailEnd = liveDashboardSource.indexOf(
    "function occupancyAreaStatePresentation",
    detailStart,
  );
  const stateEnd = liveDashboardSource.indexOf(
    "function OccupancyAlertsCard",
    detailEnd,
  );
  const detailSource = liveDashboardSource.slice(detailStart, detailEnd);
  const stateSource = liveDashboardSource.slice(detailEnd, stateEnd);
  const exportStart = liveDashboardSource.indexOf(
    'if (scenario && visible.has("occupancy_scenario_detail"))',
  );
  const exportEnd = liveDashboardSource.indexOf(
    'if (visible.has("occupancy_alert_list")',
    exportStart,
  );
  const exportSource = liveDashboardSource.slice(exportStart, exportEnd);

  assert.ok(detailStart >= 0 && detailEnd > detailStart && stateEnd > detailEnd);
  assert.match(detailSource, /occupancyAreaStatePresentation\(currentArea\)/);
  assert.match(detailSource, /currentArea\?\.snapshot_at/);
  assert.match(
    detailSource,
    /formatDateTime\(currentArea\.snapshot_at, timeZone\)/,
  );
  assert.match(stateSource, /area\.occupied === true/);
  assert.match(stateSource, /area\.occupied === false/);
  assert.match(stateSource, /label: "Sem leitura"/);
  assert.match(stateSource, /label: "Estado não certificado"/);
  assert.doesNotMatch(
    stateSource,
    /\.value|current_value/,
    "o estado não pode ser inferido pelo valor numérico",
  );

  assert.ok(exportStart >= 0 && exportEnd > exportStart);
  assert.match(exportSource, /key: "state", label: "Estado"/);
  assert.match(exportSource, /key: "snapshotAt", label: "Leitura em"/);
  assert.match(exportSource, /occupancyAreaStatePresentation\(snapshot\)\.label/);
  assert.match(exportSource, /formatDateTime\(snapshot\.snapshot_at, timeZone\)/);
});

test("todos os loaders secundários respeitam a mesma demanda do layout", () => {
  assert.match(
    comparisonSource,
    /requestedCardIds\s*\?\s*preferences\.filter\([\s\S]*?requestedCardIds\.has\(preference\.id\)/,
  );
  assert.match(
    durationSource,
    /if \(requestedCardIds && !requestedCardIds\.has\(cardId\)\) return;/,
  );
  assert.match(
    durationInsightSource,
    /if \(requestedCardIds && !requestedCardIds\.has\(id\)\) return;/,
  );
  assert.match(
    durationSource,
    /if \(requestedScenarios\.length === 0\) \{[\s\S]*?Preserve a última série certificada[\s\S]*?return;/,
    "sem widget em demanda, duração deve parar o polling sem apagar o último quadro",
  );
  assert.match(
    durationInsightSource,
    /const RETRY_DELAYS_MS = \[60_000, 120_000, 240_000, 480_000, 900_000\]/,
    "falha de um cenário não deve repetir o mês inteiro a cada minuto",
  );
  assert.match(
    durationInsightSource,
    /occupancyDurationNextMinuteRefreshDelay/,
    "agregados de duração devem aguardar o fechamento do próximo minuto",
  );
  assert.match(
    liveDashboardSource,
    /React\.useEffect\(\(\) => \{[\s\S]*?liveRequestRef\.current\?\.abort\(\);[\s\S]*?secondaryRequestRef\.current\?\.abort\(\);[\s\S]*?\}, \[occupancyDataPlan\.key\]\)/,
    "ocultar o último consumidor deve cancelar também a consulta já iniciada",
  );
  assert.doesNotMatch(
    liveDashboardSource,
    /let history = true/,
    "o snapshot atual não pode funcionar como heartbeat invisível da página",
  );
  assert.doesNotMatch(
    durationInsightSource,
    /lastLoadedMinute/,
    "o mesmo minuto deve poder receber dados atrasados sem esperar virar a borda",
  );
});

test("saída da viewport pausa a rede sem descartar o último quadro certificado", () => {
  assert.match(
    comparisonSource,
    /snapshotDataset\.scopeKey === snapshotScopeKey \|\| !needsSnapshots/,
    "o comparativo atual deve manter o snapshot pintado enquanto não há demanda",
  );
  assert.match(
    comparisonSource,
    /aggregateDataset\.scopeKey === aggregateScopeKey \|\| !needsHourlyAggregate/,
    "os comparativos horários devem manter o agregado pintado enquanto não há demanda",
  );
  assert.match(
    comparisonSource,
    /needsMaximumTrend &&[\s\S]*?maximumTrendDataset\.scopeKey !== maximumTrendScopeKey/,
    "um recurso pausado fora da viewport não pode voltar artificialmente ao estado de loading",
  );
  assert.match(
    durationInsightSource,
    /requestedScenarios\.length === 0 &&[\s\S]*?dataset\.dataIdentityKey === dataIdentityKey[\s\S]*?\? dataset/,
    "os insights devem reutilizar o quadro anterior somente dentro da mesma empresa, fuso, período e seleção",
  );
  assert.match(
    durationInsightSource,
    /return \(\) => \{[\s\S]*?abortRequest\(controller\)/,
    "retirar a demanda ainda deve abortar o transporte e o timer ativos",
  );
});

test("loader de duração captura falhas terminais sem apagar o quadro certificado", () => {
  assert.match(
    durationSource,
    /const runLoad = async \(\) => \{[\s\S]*?await load\(\);[\s\S]*?catch \(error\) \{[\s\S]*?disposed \|\| isAbortError\(error, controller\?\.signal\)[\s\S]*?current\.scopeKey === scopeKey[\s\S]*?\? current[\s\S]*?loading: false[\s\S]*?scheduleNext\(\);/,
    "uma falha fora do try interno deve preservar a série do mesmo escopo e reagendar sem rejection solta",
  );
  assert.match(
    durationSource,
    /window\.setTimeout\(\(\) => \{\s*void runLoad\(\);\s*\}, occupancyDurationNextMinuteRefreshDelay\(\)\)/,
    "o disparo do timer deve passar pela captura terminal",
  );
  assert.equal(
    durationSource.match(/void runLoad\(\);/g)?.length,
    3,
    "timer, retomada e carga inicial devem usar o mesmo invólucro seguro",
  );
  assert.doesNotMatch(
    durationSource,
    /void load\(\)|setTimeout\(load\s*,/,
    "nenhum disparo de load pode deixar uma rejeição sem observador",
  );
});

test("pulso de 5s não repete histórico estável nem multiplica commits React", () => {
  assert.match(
    liveDashboardSource,
    /minute: OCCUPANCY_REFRESH_MS,[\s\S]*?hour: MINUTE_MS,[\s\S]*?day: 5 \* MINUTE_MS,[\s\S]*?week: 15 \* MINUTE_MS,[\s\S]*?month: HOUR_MS/,
    "somente a borda minuto deve acompanhar o pulso da câmera",
  );
  assert.match(
    liveDashboardSource,
    /OCCUPANCY_CARD_DEMAND_RELEASE_MS = 1_000/,
    "cards fora da viewport devem sair antes do próximo pulso",
  );
  assert.match(
    liveDashboardSource,
    /silentLoad && force\) setRefreshing\(true\)/,
    "poll automático não deve alternar o spinner global",
  );
  assert.match(
    liveDashboardSource,
    /sameScenarioLoaded && chartEntries\.length > 0[\s\S]*?setChartData\(next\)/,
    "granularidades quentes devem publicar um único merge",
  );
  const firstSnapshot = query.occupancyLiveSnapshotQuery({
    now: new Date("2026-09-18T20:09:07.176Z"),
  });
  const samePulseSnapshot = query.occupancyLiveSnapshotQuery({
    now: new Date("2026-09-18T20:09:09.999Z"),
  });
  assert.equal(firstSnapshot.path, samePulseSnapshot.path);
  assert.equal(firstSnapshot.from.toISOString(), "2026-09-18T19:59:05.000Z");
  assert.equal(firstSnapshot.to.toISOString(), "2026-09-18T20:11:05.000Z");
  assert.equal(
    (comparisonSource.match(/publishSnapshots\(/g) ?? []).length,
    3,
    "um lote deve publicar apenas início, fallback e conclusão, nunca por cenário",
  );
  assert.match(
    durationSource,
    /cached\.to < range\.to\.getTime\(\)[\s\S]*?return false/,
    "duração só deve consultar novamente quando a borda minuto avançar",
  );
  assert.match(
    durationInsightSource,
    /pollEdge\.through === month\.to\.getTime\(\)/,
    "insights mensais não devem confirmar repetidamente a mesma borda",
  );
  assert.doesNotMatch(durationSource + durationInsightSource, /stableConfirmations/);
});

test("somente leitura atual do cenário não consulta agregados diários nem comparativos", () => {
  const plan = query.buildOccupancyReportResourcePlan({
    definitionIds, metricVisibility, hasScenario: true,
    preferences: preferencesFor("occupancy_report_current"),
  });
  assert.deepEqual(plan, { definitionIds: "", comparisonDefinitionIds: "", currentSnapshot: true });
});

test("áreas e detalhe histórico compartilham exclusivamente o snapshot de fechamento", () => {
  for (const cardId of ["occupancy_active_areas", "occupancy_scenario_detail"]) {
    const plan = query.buildOccupancyReportResourcePlan({
      definitionIds,
      metricVisibility,
      hasScenario: true,
      preferences: preferencesFor(cardId),
    });
    assert.deepEqual(
      plan,
      {
        definitionIds: "",
        comparisonDefinitionIds: "",
        currentSnapshot: true,
      },
      cardId,
    );
  }
});

test("média, pico e mínimo reutilizam uma fonte diária; ocultos não pedem rede", () => {
  const plan = query.buildOccupancyReportResourcePlan({
    definitionIds, metricVisibility, hasScenario: true,
    preferences: preferencesFor("occupancy_report_average", "occupancy_report_peak", "occupancy_report_minimum"),
  });
  assert.deepEqual(plan, { definitionIds: "occupancy_report_day", comparisonDefinitionIds: "", currentSnapshot: false });
  const hidden = query.buildOccupancyReportResourcePlan({
    definitionIds, metricVisibility, hasScenario: true, preferences: preferencesFor(),
  });
  assert.deepEqual(hidden, { definitionIds: "", comparisonDefinitionIds: "", currentSnapshot: false });
});

test("plano histórico falha fechado com preferências ausentes ou parciais", () => {
  const emptyPlan = {
    comparisonDefinitionIds: "",
    currentSnapshot: false,
    definitionIds: "",
  };
  assert.deepEqual(
    query.buildOccupancyReportResourcePlan({
      definitionIds,
      hasScenario: true,
      metricVisibility,
      preferences: [],
      requestedCardIds: new Set(cardIds),
    }),
    emptyPlan,
    "demanda de viewport não pode substituir uma preferência ainda não normalizada",
  );
  assert.deepEqual(
    query.buildOccupancyReportResourcePlan({
      definitionIds,
      hasScenario: true,
      metricVisibility,
      preferences: [{ id: "occupancy_report_hour", visible: true }],
      requestedCardIds: new Set(cardIds),
    }),
    {
      comparisonDefinitionIds: "occupancy_report_hour",
      currentSnapshot: false,
      definitionIds: "occupancy_report_hour",
    },
    "somente o card explicitamente visível pode ativar sua fonte",
  );
});

test("plano histórico respeita a demanda explícita dos cards não ocultos", () => {
  const preferences = preferencesFor(
    "occupancy_report_current",
    "occupancy_report_hour",
    "occupancy_report_day",
  );
  const requestedCardIds = new Set(["occupancy_report_hour"]);
  assert.deepEqual(
    query.buildOccupancyReportResourcePlan({
      definitionIds,
      hasScenario: true,
      metricVisibility,
      preferences,
      requestedCardIds,
    }),
    {
      comparisonDefinitionIds: "occupancy_report_hour",
      currentSnapshot: false,
      definitionIds: "occupancy_report_hour",
    },
  );
});

test("seletor de séries não oculta KPIs nem remove sua única fonte diária", () => {
  const plan = query.buildOccupancyReportResourcePlan({
    definitionIds,
    hasScenario: true,
    metricVisibility: { average: false, minimum: false, peak: false },
    preferences: preferencesFor("occupancy_report_average"),
  });
  assert.deepEqual(plan, {
    comparisonDefinitionIds: "",
    currentSnapshot: false,
    definitionIds: "occupancy_report_day",
  });
});

test("fonte sem cenário conserva leitura derivada diária e configuração visual não altera consultas", () => {
  const input = {
    definitionIds, metricVisibility, hasScenario: false,
    preferences: preferencesFor("occupancy_report_current", "occupancy_report_hour"),
  };
  const plan = query.buildOccupancyReportResourcePlan(input);
  assert.equal(plan.definitionIds, "occupancy_report_day|occupancy_report_hour");
  assert.equal(plan.comparisonDefinitionIds, "occupancy_report_hour");
  assert.equal(plan.currentSnapshot, false);
  assert.deepEqual(query.buildOccupancyReportResourcePlan({ ...input,
    preferences: [...input.preferences].reverse().map((preference: RuntimeFixture) => ({
      ...preference, color: "#6633ff", title: "Título alterado", size: "full", heightLevel: 6,
    })),
  }), plan);
});

test("a fila impõe um limite global mesmo com muitas definições e segmentos", async () => {
  const schedule = query.createOccupancyQueryScheduler(undefined, 3);
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const pending = Array.from({ length: 21 }, (_, index) => schedule(`segment:${index}`, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    return index;
  }));
  for (let offset = 0; offset < 21; offset += 3) {
    await drain();
    assert.equal(active, 3);
    releases.splice(0).forEach((release) => release());
  }
  assert.deepEqual(await Promise.all(pending), Array.from({ length: 21 }, (_, index) => index));
  assert.equal(peak, 3);
});

test("widgets da mesma execução compartilham consulta idêntica sem compartilhar entre execuções", async () => {
  const schedule = query.createOccupancyQueryScheduler();
  let calls = 0;
  const load = async () => ({ total: ++calls });
  const first = schedule("/scenario/a/hour", load);
  const duplicate = schedule("/scenario/a/hour", load);
  assert.equal(first, duplicate);
  assert.deepEqual(await first, { total: 1 });
  assert.deepEqual(await schedule("/scenario/a/hour", load), { total: 1 });
  assert.equal(calls, 1);
  const anotherBatch = query.createOccupancyQueryScheduler();
  assert.deepEqual(await anotherBatch("/scenario/a/hour", load), { total: 2 });
});

test("atualização ao vivo tem teto absoluto de 32 transportes", async () => {
  const limit = query.OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT;
  assert.equal(limit, 32);
  assert.equal(query.occupancyLiveCivilFallbackRequestLimit("day"), 4);
  assert.equal(query.occupancyLiveCivilFallbackRequestLimit("week"), 4);
  assert.equal(query.occupancyLiveCivilFallbackRequestLimit("month"), 32);

  const schedule = query.createOccupancyQueryScheduler(undefined, 4, limit);
  let calls = 0;
  await Promise.all(
    Array.from({ length: limit }, (_, index) =>
      schedule(`request:${index}`, async () => ++calls),
    ),
  );
  await assert.rejects(
    schedule("request:overflow", async () => ++calls),
    /limite seguro/,
  );
  assert.equal(calls, limit);
  assert.match(
    comparisonSource,
    /createOccupancyQueryScheduler\([\s\S]*?OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT/,
  );
  assert.match(
    comparisonSource,
    /maximumFallbackRequests:\s*occupancyLiveCivilFallbackRequestLimit/,
  );
  assert.equal(
    comparisonSource.match(
      /createOccupancyQueryScheduler\(\s*requestController\.signal,\s*MAX_PARALLEL_REQUESTS,\s*OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,?\s*\)/g,
    )?.length,
    5,
    "snapshot, hora, heatmap civil, máximo aberto e tendência devem compartilhar o mesmo teto por ciclo",
  );
});

test("falha e nova tentativa consomem o mesmo orçamento rígido", async () => {
  const schedule = query.createOccupancyQueryScheduler(undefined, 1, 1);
  let calls = 0;
  await assert.rejects(
    schedule("same", async () => {
      calls += 1;
      throw new Error("temporário");
    }),
    /temporário/,
  );
  await assert.rejects(
    schedule("same", async () => {
      calls += 1;
      return 42;
    }),
    /limite seguro/,
  );
  assert.equal(calls, 1);
  assert.throws(
    () => query.createOccupancyQueryScheduler(undefined, 1, 0),
    /limite de consultas/,
  );
});

test("abortamento impede consultas enfileiradas e rejeita resultados de execução substituída", async () => {
  const controller = new AbortController();
  const schedule = query.createOccupancyQueryScheduler(controller.signal, 1);
  let release!: () => void;
  let calls = 0;
  const requests = Array.from({ length: 6 }, (_, index) => schedule(`request:${index}`, async () => {
    calls += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    return index;
  }));
  const settled = Promise.allSettled(requests);
  await drain();
  controller.abort(new DOMException("Visão alterada", "AbortError"));
  release();
  const results = await settled;
  assert.equal(calls, 1);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason.name === "AbortError"));
  await assert.rejects(schedule("new", async () => { calls += 1; }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("uma falha libera a fila e permite uma nova tentativa explícita", async () => {
  const schedule = query.createOccupancyQueryScheduler(undefined, 1);
  await assert.rejects(schedule("same", async () => { throw new Error("temporário"); }), /temporário/);
  assert.equal(await schedule("same", async () => 42), 42);
  assert.equal(await schedule("next", async () => 7), 7);
  assert.throws(() => query.createOccupancyQueryScheduler(undefined, 0), /concorrência/);
});

test("snapshot ao vivo não invalida heatmaps nem recompõe seus rótulos diários", () => {
  const independentStart = comparisonSource.indexOf(
    "const snapshotIndependentCards = React.useMemo",
  );
  const cardsStart = comparisonSource.indexOf(
    "const cards = React.useMemo",
    independentStart,
  );
  assert.ok(independentStart >= 0 && cardsStart > independentStart);

  const independentCards = comparisonSource.slice(
    independentStart,
    cardsStart,
  );
  assert.match(independentCards, /id: "occupancy_scenario_max_month"/);
  assert.match(independentCards, /id: "occupancy_day_hour_heatmap"/);
  assert.match(independentCards, /id: "occupancy_scenario_hour_heatmap"/);
  assert.doesNotMatch(
    independentCards,
    /certifiedSnapshots|snapshotDataset|snapshotLoading/,
  );

  const dayHeatmapStart = comparisonSource.indexOf(
    "function OccupancyDayHourHeatmapCard",
  );
  const scenarioHeatmapStart = comparisonSource.indexOf(
    "function OccupancyScenarioHourHeatmapCard",
    dayHeatmapStart,
  );
  const dayHeatmap = comparisonSource.slice(
    dayHeatmapStart,
    scenarioHeatmapStart,
  );
  assert.match(
    dayHeatmap,
    /const dayLabels = React\.useMemo\([\s\S]*?matrix\.dayKeys\.map\(formatHeatmapDateKey\)[\s\S]*?\[matrix\.dayKeys\]/,
  );
});

function drain() { return new Promise<void>((resolve) => setImmediate(resolve)); }

function loadModule(relativePath: string): RuntimeFixture {
  const filename = resolve(root, relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("exports", "require", "module", output)(loaded.exports, createRequire(filename), loaded);
  return loaded.exports;
}
