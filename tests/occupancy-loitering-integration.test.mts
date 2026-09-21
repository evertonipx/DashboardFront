import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  createModuleLoader,
  type RuntimeFixture,
} from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const echarts: typeof import("echarts") = require("echarts");
const cardId = "occupancy_loitering_summary";
const averageCardId = "occupancy_duration_average_by_scenario";
const sessionCountCardId = "occupancy_loitering_session_count_by_area";
const minimumCardId = "occupancy_loitering_minimum_by_area";
const maximumCardId = "occupancy_loitering_maximum_by_area";
const rangeCardId = "occupancy_loitering_range_by_area";
const sessionsOverTimeCardId = "occupancy_loitering_sessions_over_time";
const averageOverTimeCardId = "occupancy_loitering_average_over_time";
const accumulatedSessionTimeCardId =
  "occupancy_loitering_accumulated_session_time";
const percentilesByAreaCardId = "occupancy_loitering_percentiles_by_area";
const durationDistributionCardId =
  "occupancy_loitering_duration_distribution";
const areaPeriodHeatmapCardId =
  "occupancy_loitering_area_period_heatmap";
const summaryCardIds = [
  averageCardId,
  sessionCountCardId,
  minimumCardId,
  maximumCardId,
  rangeCardId,
] as const;
const temporalCardIds = [
  sessionsOverTimeCardId,
  averageOverTimeCardId,
  accumulatedSessionTimeCardId,
  percentilesByAreaCardId,
  durationDistributionCardId,
  areaPeriodHeatmapCardId,
] as const;
const baseLoiteringCardIds = [cardId, ...summaryCardIds] as const;
const sessionCardIds = [cardId, ...temporalCardIds] as const;
const loiteringCardIds = [
  ...baseLoiteringCardIds,
  ...temporalCardIds,
] as const;
function loiteringPreferencesWithVisible(...visibleIds: string[]) {
  const visible = new Set(visibleIds);
  return loiteringCardIds.map((id) => ({ id, visible: visible.has(id) }));
}
const certifiedSessionRows = [
  {
    area: "area-a",
    camera_id: "camera-a",
    duration_seconds: 24,
    ended_at: "2026-09-17T14:59:40.000Z",
    object_class: "person",
  },
] as const;
const selectableSessionRows = [
  ...certifiedSessionRows,
  {
    area: "area-b",
    camera_id: "camera-b",
    duration_seconds: 46,
    ended_at: "2026-09-17T14:59:45.000Z",
    object_class: "person",
  },
] as const;
const productionLoader = createModuleLoader(projectRoot);
const occupancyLoiteringModel = productionLoader<
  typeof import("../lib/occupancy-loitering.ts")
>("lib/occupancy-loitering.ts");

function source(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

const hookSource = source("components/app/use-occupancy-loitering.tsx");
const widgetSource = source("components/app/occupancy-loitering-widgets.tsx");
const temporalWidgetSource = source(
  "components/app/occupancy-loitering-temporal-widgets.tsx",
);
const liveSource = source("components/app/occupancy-scenario-dashboard.tsx");
const reportsSource = source("components/app/occupancy-reports-dashboard.tsx");

test("os doze cards de permanência estão registrados no catálogo, Ao Vivo, Análises e Relatórios", () => {
  const load = createModuleLoader(projectRoot);
  const preferences = load<typeof import("../lib/view-preferences.ts")>(
    "lib/view-preferences.ts",
  );
  const occupancyMenu = preferences.getCardMenuDefinition("occupancy");

  loiteringCardIds.forEach((id) => {
    assert.ok(
      occupancyMenu.cards.some((card) => card.id === id),
      `o organizador precisa persistir a preferência de ${id}`,
    );
  });
  assert.match(
    liveSource,
    /occupancyCardIds[\s\S]*?OCCUPANCY_LOITERING_CARD_IDS/,
  );
  assert.match(
    liveSource,
    /occupancyCardIds[\s\S]*?OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS/,
  );
  assert.match(
    liveSource,
    /const occupancyLoitering = useOccupancyLoitering\([\s\S]*?requestedCardIds: requestedOccupancyLoiteringCardIds/,
  );
  assert.match(
    liveSource,
    /occupancyLayoutCards[\s\S]*?\.\.\.occupancyLoitering\.cards/,
  );
  assert.match(
    reportsSource,
    /const occupancyLoitering = useOccupancyLoitering\([\s\S]*?refreshMode: "manual",[\s\S]*?requestedCardIds: requestedHistoricalCardIds/,
  );
  assert.match(reportsSource, /const userGridReadiness = useUserGridReady\(userId\)/);
  assert.match(
    reportsSource,
    /const layoutPreferencesReady = Boolean\(\s*userGridReadiness !== "pending"/,
  );
  assert.match(
    reportsSource,
    /occupancyReportLayoutCards[\s\S]*?\.\.\.occupancyLoitering\.cards/,
  );
  assert.doesNotMatch(
    temporalWidgetSource,
    /fetchOccupancy|apiFetch|useEffect\(/,
    "os widgets temporais devem apenas projetar a fonte sessions compartilhada pelo hook",
  );
});

test("visões antigas de Ocupação recebem os doze cards de permanência ocultos sem alterar os defaults novos", () => {
  const load = createModuleLoader(projectRoot);
  const preferences = load<typeof import("../lib/view-preferences.ts")>(
    "lib/view-preferences.ts",
  );

  const legacy = preferences.normalizeCardPreferences("occupancy", [
    { id: "occupancy_current_total", visible: true },
  ]);
  const legacyById = new Map(legacy.map((preference) => [preference.id, preference]));

  loiteringCardIds.forEach((id) => {
    assert.equal(
      legacyById.get(id)?.visible,
      false,
      `${id} precisa nascer oculto numa visão anterior à sua inclusão`,
    );
  });
  assert.equal(
    legacyById.get("occupancy_chart_hour")?.visible,
    true,
    "cards antigos ausentes mantêm o comportamento histórico",
  );

  const explicitlyEnabled = preferences.normalizeCardPreferences("occupancy", [
    { id: "occupancy_current_total", visible: true },
    { id: sessionsOverTimeCardId, visible: true },
  ]);
  assert.equal(
    explicitlyEnabled.find(({ id }) => id === sessionsOverTimeCardId)?.visible,
    true,
    "uma preferência explícita nunca pode ser sobrescrita pela migração",
  );

  for (const emptyPreference of [undefined, []]) {
    const fresh = preferences.normalizeCardPreferences(
      "occupancy",
      emptyPreference,
    );
    const freshById = new Map(fresh.map((preference) => [preference.id, preference]));
    loiteringCardIds.forEach((id) => {
      assert.equal(
        freshById.get(id)?.visible,
        true,
        `${id} deve continuar visível numa visão nova`,
      );
    });
  }

  assert.deepEqual(
    preferences
      .normalizeCardPreferences(
        "occupancy",
        [{ id: "custom-a", visible: false }],
        ["custom-a", "custom-b"],
      )
      .map(({ id, visible }) => ({ id, visible })),
    [
      { id: "custom-a", visible: false },
      { id: "custom-b", visible: true },
    ],
    "cards dinâmicos continuam usando o comportamento geral de defaults",
  );
});

test("hidratação histórica pendente não abre o summary de permanência", async () => {
  const fixture = createLoiteringHookFixture({
    refreshMode: "manual",
    requestedCardIds: new Set<string>(),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
  } finally {
    fixture.cleanup();
  }
});

test("widget temporal isolado consulta sessions uma vez sem abrir summary", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: sessionsOverTimeCardId,
        scenarioIds: ["scenario-b"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
    ],
    requestedCardIds: new Set([sessionsOverTimeCardId]),
  });
  try {
    await fixture.flush();
    assert.deepEqual(
      fixture.requests.map((request) => request.resource),
      ["sessions"],
    );
    assert.equal(fixture.timers.size, 1);

    const temporalCard = fixture.result.cards.find(
      (candidate: RuntimeFixture) => candidate.id === sessionsOverTimeCardId,
    );
    assert.ok(temporalCard);
    const rendered = temporalCard.node({
      scenarioSelection: {
        mode: "custom",
        scenarioIds: ["scenario-b"],
      },
    });
    assert.deepEqual(rendered.props.model.selectedScenarioIds, ["scenario-b"]);
  } finally {
    fixture.cleanup();
  }
});

test("Permanência individual e os seis temporais compartilham uma sessions e um timer", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: sessionCardIds.map((id) => ({
      id,
      scenarioSelectionMode: "all",
      visible: true,
    })),
    requestedCardIds: new Set(sessionCardIds),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "sessions");
    assert.equal(fixture.timers.size, 1);
    assert.deepEqual(
      fixture.result.cards
        .filter((candidate: RuntimeFixture) => sessionCardIds.includes(candidate.id))
        .map((candidate: RuntimeFixture) => candidate.id),
      sessionCardIds,
    );
  } finally {
    fixture.cleanup();
  }
});

test("widget temporal e widget de summary usam somente dois recursos compartilhados", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: averageCardId,
        scenarioSelectionMode: "all",
        visible: true,
      },
      {
        id: averageOverTimeCardId,
        scenarioSelectionMode: "all",
        visible: true,
      },
    ],
    requestedCardIds: new Set([averageCardId, averageOverTimeCardId]),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(
      fixture.requests.map((request) => request.resource).sort(),
      ["sessions", "summary"],
    );
    assert.equal(fixture.timers.size, 2);
  } finally {
    fixture.cleanup();
  }
});

test("todos os cards de permanência ocultos não consultam sessions nem summary", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: loiteringCardIds.map((id) => ({ id, visible: false })),
    requestedCardIds: new Set(loiteringCardIds),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
    assert.deepEqual(await fixture.result.loadReportAssets(), []);
    assert.equal(fixture.requests.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("exportação explícita carrega todos os cards visíveis fora da viewport com somente sessions e summary", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: loiteringPreferencesWithVisible(
      averageCardId,
      sessionsOverTimeCardId,
    ),
    requestedCardIds: new Set<string>(),
  });
  fixture.setSessionResponseRows([...certifiedSessionRows]);
  fixture.setSummaryResponseRows([
    {
      area: "area-a",
      avg_duration_seconds: 24,
      camera_id: "camera-a",
      max_duration_seconds: 24,
      min_duration_seconds: 24,
      object_class: "person",
      session_count: 1,
    },
  ]);
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);

    const controller = new AbortController();
    const assets = await fixture.result.loadReportAssets(controller.signal);

    assert.deepEqual(
      fixture.requests.map((request) => request.resource).sort(),
      ["sessions", "summary"],
    );
    assert.ok(
      fixture.requests.every(
        (request) =>
          request.bypassCache === true && request.signal === controller.signal,
      ),
    );
    assert.equal(
      fixture.timers.size,
      0,
      "a ação de exportar não pode instalar um ciclo de polling",
    );
    assert.deepEqual(
      assets.map((asset: RuntimeFixture) => asset.cardId).sort(),
      [averageCardId, sessionsOverTimeCardId].sort(),
    );
  } finally {
    fixture.cleanup();
  }
});

test("exportação extensa limita sessions à prévia civil diária e mantém summary compacto no período completo", async () => {
  const period = {
    contextLabel: "últimos 12 meses",
    from: new Date("2025-09-17T03:00:00.000Z"),
    to: new Date("2026-09-17T03:00:00.000Z"),
  };
  const fixture = createLoiteringHookFixture({
    period,
    preferences: loiteringPreferencesWithVisible(
      averageCardId,
      areaPeriodHeatmapCardId,
    ),
    refreshMode: "manual",
    requestedCardIds: new Set<string>(),
  });
  fixture.setSessionResponseRows([...certifiedSessionRows]);
  fixture.setSummaryResponseRows([
    {
      area: "area-a",
      avg_duration_seconds: 24,
      camera_id: "camera-a",
      max_duration_seconds: 24,
      min_duration_seconds: 24,
      object_class: "person",
      session_count: 1,
    },
  ]);
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);

    const assets = await fixture.result.loadReportAssets();
    const sessionRequest = fixture.requests.find(
      (request) => request.resource === "sessions",
    );
    const summaryRequest = fixture.requests.find(
      (request) => request.resource === "summary",
    );
    assert.ok(sessionRequest);
    assert.ok(summaryRequest);
    assert.equal(sessionRequest.from.toISOString(), "2026-09-16T03:00:00.000Z");
    assert.equal(sessionRequest.to.toISOString(), "2026-09-17T03:00:00.000Z");
    assert.equal(summaryRequest.from.toISOString(), period.from.toISOString());
    assert.equal(summaryRequest.to.toISOString(), period.to.toISOString());

    const temporalAsset = assets.find(
      (asset: RuntimeFixture) => asset.cardId === areaPeriodHeatmapCardId,
    );
    const summaryAsset = assets.find(
      (asset: RuntimeFixture) => asset.cardId === averageCardId,
    );
    assert.match(temporalAsset?.titleSuffix ?? "", /prévia de/i);
    assert.equal(summaryAsset?.titleSuffix, undefined);
  } finally {
    fixture.cleanup();
  }
});

test("exportação explícita propaga falha de loitering em vez de omitir o widget", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: loiteringPreferencesWithVisible(sessionsOverTimeCardId),
    requestedCardIds: new Set<string>(),
  });
  try {
    await fixture.flush();
    fixture.failNextRequest(502);
    await assert.rejects(
      fixture.result.loadReportAssets(),
      (error: RuntimeFixture) => error?.status === 502,
    );
    assert.deepEqual(
      fixture.requests.map((request) => request.resource),
      ["sessions"],
    );
  } finally {
    fixture.cleanup();
  }
});

test("exportação explícita aceita resposta vazia certificada sem inventar falha", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: loiteringPreferencesWithVisible(sessionsOverTimeCardId),
    requestedCardIds: new Set<string>(),
  });
  try {
    await fixture.flush();
    assert.deepEqual(await fixture.result.loadReportAssets(), []);
    assert.deepEqual(
      fixture.requests.map((request) => request.resource),
      ["sessions"],
    );
  } finally {
    fixture.cleanup();
  }
});

test("Permanência individual usa sessions e permanência média usa summary", () => {
  const consumerSection = hookSource.slice(
    hookSource.indexOf("const LOITERING_DATA_CONSUMER_CARD_IDS"),
    hookSource.indexOf("type OccupancyLoiteringRefreshMode"),
  );
  assert.match(
    consumerSection,
    /OCCUPANCY_LOITERING_CARD_IDS/,
    "todos os consumidores precisam continuar configuráveis de forma independente",
  );
  assert.match(
    consumerSection,
    /OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS/,
    "os widgets temporais precisam participar do mesmo plano explícito de demanda",
  );
  assert.doesNotMatch(
    consumerSection,
    /occupancy_duration_(?:timeline|by_scenario)/,
    "timeline e duração total não podem iniciar implicitamente outro polling",
  );
  assert.match(
    hookSource,
    /const sessionRequestedScenarios =[\s\S]*?const summaryRequestedScenarios =/,
    "o hook precisa separar a demanda compartilhada de sessions da demanda agregada",
  );
  assert.match(
    hookSource,
    /fetchOccupancyLoiteringSessions\(\{[\s\S]*?from: requestFrom,[\s\S]*?to: sessionRequestRange\.to/,
    "o card individual precisa consultar as sessões concluídas",
  );
  assert.match(
    hookSource,
    /summarizeOccupancyLoiteringSessions\(currentSessions\.rows\)/,
    "as sessões precisam ser agregadas localmente antes de compor o card",
  );
  assert.match(
    hookSource,
    /resolveSummaryModel[\s\S]*?buildOccupancyLoiteringSummaryModel\(selected, current\.rows\)/,
    "o card médio deve continuar usando o endpoint summary",
  );
  assert.match(
    liveSource,
    /individualDwellTotalsByScenarioId:\s*occupancyLoitering\.scenarioTotalsById/,
  );
  assert.match(
    liveSource,
    /individualDwellLoading: occupancyLoitering\.loading/,
    "a permanência pode completar depois sem bloquear o gráfico principal",
  );
});

test("Permanência média isolada demanda somente sua seleção no summary", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: "occupancy_duration_average_by_scenario",
        scenarioIds: ["scenario-b"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
    ],
    requestedCardIds: new Set([
      "occupancy_duration_average_by_scenario",
    ]),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(
      Array.from(fixture.result.scenarioTotalsById.keys()),
      ["scenario-b"],
    );
  } finally {
    fixture.cleanup();
  }
});

test("hook individual preserva exatamente from/to na URL de loitering sessions", async () => {
  const fixture = createLoiteringHookFixture({
    period: {
      contextLabel: "14/09/2026 a 18/09/2026",
      from: new Date("2026-09-14T18:35:57.540Z"),
      to: new Date("2026-09-18T18:35:57.539Z"),
    },
    refreshMode: "manual",
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "sessions");
    assert.equal(
      fixture.requests[0].url,
      "/api/v1/occupancy/loitering/sessions?from=2026-09-14T18%3A35%3A57.540Z&to=2026-09-18T18%3A35%3A57.539Z",
    );
    assert.equal(
      fixture.requests[0].from.toISOString(),
      "2026-09-14T18:35:57.540Z",
    );
    assert.equal(
      fixture.requests[0].to.toISOString(),
      "2026-09-18T18:35:57.539Z",
    );
  } finally {
    fixture.cleanup();
  }
});

test("período extenso mantém Permanência individual em sessions com prévia diária", async () => {
  const fixture = createLoiteringHookFixture({
    period: {
      contextLabel: "últimos 12 meses",
      from: new Date("2025-09-17T03:00:00.000Z"),
      to: new Date("2026-09-17T03:00:00.000Z"),
    },
    refreshMode: "manual",
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "sessions");
    assert.equal(
      fixture.requests[0].from.toISOString(),
      "2026-09-16T03:00:00.000Z",
    );
    assert.equal(
      fixture.requests[0].to.toISOString(),
      "2026-09-17T03:00:00.000Z",
    );
    const rendered = fixture.result.cards[0].node({
      scenarioSelection: { mode: "inherit", scenarioIds: [] },
    });
    assert.equal(rendered.props.sessionsSlicedByDay, true);
  } finally {
    fixture.cleanup();
  }
});

test("período acima de 31 dias rotula a janela efetivamente carregada nos temporais e no relatório", async () => {
  const fixture = createLoiteringHookFixture({
    period: {
      contextLabel: "últimos 12 meses",
      from: new Date("2025-09-17T03:00:00.000Z"),
      to: new Date("2026-09-17T03:00:00.000Z"),
    },
    preferences: [
      { id: cardId, visible: false },
      {
        id: areaPeriodHeatmapCardId,
        scenarioSelectionMode: "all",
        visible: true,
      },
    ],
    refreshMode: "manual",
    requestedCardIds: new Set([areaPeriodHeatmapCardId]),
  });
  fixture.setSessionResponseRows([...certifiedSessionRows]);
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "sessions");
    const temporalCard = fixture.result.cards.find(
      (candidate: RuntimeFixture) => candidate.id === areaPeriodHeatmapCardId,
    );
    assert.ok(temporalCard);
    const rendered = temporalCard.node({
      scenarioSelection: { mode: "all", scenarioIds: [] },
    });
    assert.equal(rendered.props.sessionsSlicedByDay, true);
    assert.equal(
      rendered.props.dataPeriod.from.toISOString(),
      "2026-09-16T03:00:00.000Z",
    );
    assert.equal(
      rendered.props.dataPeriod.to.toISOString(),
      "2026-09-17T03:00:00.000Z",
    );

    const reportAsset = fixture.result.reportAssets.find(
      (candidate: RuntimeFixture) => candidate.cardId === areaPeriodHeatmapCardId,
    );
    assert.ok(reportAsset, "o relatório deve manter o widget temporal visível");
    assert.match(reportAsset.titleSuffix, /prévia de/i);
    assert.match(reportAsset.chart.description, /prévia efetivamente carregada/i);
    assert.match(reportAsset.chart.description, /não todo o período selecionado/i);
  } finally {
    fixture.cleanup();
  }
});

test("sair da viewport pausa a permanência sem apagar o último dataset", async () => {
  const fixture = createLoiteringHookFixture();
  fixture.setSessionResponseRows([...certifiedSessionRows]);
  const renderCard = () =>
    fixture.result.cards[0].node({
      scenarioSelection: { mode: "inherit", scenarioIds: [] },
    });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(renderCard().props.model.rows.length, 1);

    await fixture.render({ requestedCardIds: new Set<string>() });

    assert.equal(
      fixture.requests.length,
      1,
      "a ausência de demanda da viewport deve apenas parar o polling",
    );
    assert.equal(
      renderCard().props.model.rows.length,
      1,
      "o snapshot certificado deve permanecer pronto para a reentrada",
    );
    assert.equal(renderCard().props.loading, false);
  } finally {
    fixture.cleanup();
  }

  const scopeDefinition = hookSource.slice(
    hookSource.indexOf("const scopeKey = React.useMemo"),
    hookSource.indexOf("const liveCacheScopeKey"),
  );
  assert.doesNotMatch(
    scopeDefinition,
    /queryEnabled/,
    "demanda de viewport não pode fazer parte da identidade semântica do dataset",
  );
  assert.doesNotMatch(
    scopeDefinition,
    /configuredScenarioKey|requestedScenarios|scenarioSelection|scenarioIds/,
    "o summary tenant-wide não pode reiniciar por uma projeção local de cenários",
  );
  assert.match(
    hookSource,
    /loading: keepRows \? current\.loading : true/,
    "uma resposta vazia já certificada não deve piscar como carga a cada poll",
  );
});

test("reentrar no poll preserva as sessions publicadas enquanto a cauda de 5 s está em voo", async () => {
  const fixture = createLoiteringHookFixture();
  fixture.setSessionResponseRows([...certifiedSessionRows]);
  const renderCard = () =>
    fixture.result.cards[0].node({
      scenarioSelection: { mode: "inherit", scenarioIds: [] },
    });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    const published = renderCard();
    assert.equal(published.props.model.rows.length, 1);
    assert.equal(published.props.sessions.length, 1);
    assert.equal(published.props.loading, false);

    await fixture.render({ requestedCardIds: new Set<string>() });
    fixture.advanceTime(5_000);
    fixture.deferNextSessionRequest();
    await fixture.render({ requestedCardIds: new Set([cardId]) });

    assert.equal(fixture.requests.length, 2);
    assert.equal(fixture.requests[1].resource, "sessions");
    assert.equal(
      fixture.requests[1].to.getTime() - fixture.requests[0].to.getTime(),
      5_000,
      "a reentrada deve consultar o novo corte do poll",
    );
    assert.ok(
      fixture.requests[1].from.getTime() > fixture.requests[0].from.getTime(),
      "a segunda consulta deve buscar apenas a cauda mutável",
    );

    const whileTailIsLoading = renderCard();
    assert.equal(
      whileTailIsLoading.props.previewPeriod.from.getTime(),
      published.props.previewPeriod.from.getTime(),
      "o início civil do dataset deve conservar a mesma identidade",
    );
    assert.equal(
      whileTailIsLoading.props.previewPeriod.to.getTime() -
        published.props.previewPeriod.to.getTime(),
      5_000,
    );
    assert.equal(
      whileTailIsLoading.props.model.rows.length,
      1,
      "as linhas certificadas não podem sumir durante a atualização da cauda",
    );
    assert.equal(whileTailIsLoading.props.sessions.length, 1);
    assert.equal(
      whileTailIsLoading.props.loading,
      false,
      "a reentrada com o mesmo escopo não pode voltar ao skeleton",
    );

    fixture.resolvePendingSessionRequest([...certifiedSessionRows]);
    await fixture.flush();
    assert.equal(renderCard().props.model.rows.length, 1);
    assert.equal(renderCard().props.loading, false);
  } finally {
    fixture.cleanup();
  }
});

test("Timeline isolada não inicia o recurso separado de permanência", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: "occupancy_duration_timeline",
        scenarioIds: ["scenario-b"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
    ],
    requestedCardIds: new Set(["occupancy_duration_timeline"]),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.deepEqual(Array.from(fixture.result.scenarioTotalsById.keys()), []);
  } finally {
    fixture.cleanup();
  }
});

test("summary consulta uma vez por empresa e filtra os cenários localmente", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: "occupancy_duration_average_by_scenario",
        scenarioSelectionMode: "all",
        visible: true,
      },
    ],
    requestedCardIds: new Set(["occupancy_duration_average_by_scenario"]),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "summary");
    assert.equal(fixture.requests[0].cameraId, undefined);
    assert.equal(fixture.requests[0].area, undefined);
    assert.deepEqual(fixture.requests[0].expectedAreas, [
      { area: "area-a", cameraId: "camera-a", objectClass: "person" },
      { area: "area-b", cameraId: "camera-b", objectClass: "person" },
    ]);
    assert.deepEqual(
      Array.from(fixture.result.scenarioTotalsById.keys()),
      ["scenario-a", "scenario-b"],
      "o superset certificado do tenant deve ser composto por cenário no cliente",
    );
  } finally {
    fixture.cleanup();
  }
});

test("cinco widgets agregados reutilizam uma única consulta summary", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      ...summaryCardIds.map((id, index) => ({
        id,
        scenarioIds: [index % 2 === 0 ? "scenario-a" : "scenario-b"],
        scenarioSelectionMode: "custom",
        visible: true,
      })),
    ],
    requestedCardIds: new Set(summaryCardIds),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "summary");
    assert.equal(fixture.timers.size, 1);
    assert.deepEqual(
      fixture.result.cards.map((card: RuntimeFixture) => card.id),
      loiteringCardIds,
    );

    await fixture.render({ requestedCardIds: new Set<string>() });
    assert.equal(
      fixture.requests.length,
      1,
      "ocultar todos os agregados não pode criar outra requisição",
    );
    assert.equal(fixture.timers.size, 0);
  } finally {
    fixture.cleanup();
  }
});

test("áreas da mesma câmera reutilizam o único summary tenant-wide", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: "occupancy_duration_average_by_scenario",
        scenarioSelectionMode: "all",
        visible: true,
      },
    ],
    requestedCardIds: new Set(["occupancy_duration_average_by_scenario"]),
    scenarios: [
      {
        areas: [{ area_id: "area-a", camera_id: "shared-camera" }],
        company_id: "company-a",
        id: "scenario-a",
        name: "Entrada",
        object_class: "person",
      },
      {
        areas: [{ area_id: "area-b", camera_id: "shared-camera" }],
        company_id: "company-a",
        id: "scenario-b",
        name: "Saída",
        object_class: "person",
      },
    ],
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "summary");
    assert.equal(fixture.requests[0].cameraId, undefined);
    assert.equal(
      fixture.requests[0].area,
      undefined,
      "o endpoint documentado entrega o superset do tenant sem filtros físicos",
    );
  } finally {
    fixture.cleanup();
  }
});

test("cenário sem área válida não dispara summary irrestrito", async () => {
  const fixture = createLoiteringHookFixture({
    scenarios: [
      {
        areas: [],
        company_id: "company-a",
        id: "scenario-a",
        name: "Sem área",
        object_class: "person",
      },
    ],
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
  } finally {
    fixture.cleanup();
  }
});

test("fuso IANA inválido falha de forma controlada sem disparar request", async () => {
  const fixture = createLoiteringHookFixture({ timeZone: "Invalid/Zone" });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
    assert.match(
      fixture.result.cards[0].node({
        scenarioSelection: { mode: "inherit", scenarioIds: [] },
      }).props.error,
      /período civil da empresa/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("fuso IANA inválido também bloqueia Análises e Relatórios", async () => {
  const fixture = createLoiteringHookFixture({
    period: {
      contextLabel: "14/09/2026 a 16/09/2026",
      from: new Date("2026-09-14T03:00:00.000Z"),
      to: new Date("2026-09-17T03:00:00.000Z"),
    },
    refreshMode: "manual",
    timeZone: "Invalid/Zone",
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.timers.size, 0);
    assert.match(
      fixture.result.cards[0].node({
        scenarioSelection: { mode: "inherit", scenarioIds: [] },
      }).props.error,
      /período civil da empresa/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("hook individual consulta sessions a cada 5 s e pausa enquanto a aba está oculta", async () => {
  assert.match(
    hookSource,
    /function scheduleAfterCycle\(startedAt: number\)[\s\S]*?LIVE_REFRESH_MS - \(Date\.now\(\) - startedAt\)/,
    "a permanência deve descontar a latência da API do próximo pulso",
  );
  const fixture = createLoiteringHookFixture();
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.nextTimerDelay(), 5_000);
    assert.equal(fixture.visibilityListeners.size, 1);
    assert.ok(
      fixture.requests.every((request) => request.resource === "sessions"),
      "o card individual deve usar somente o log de sessões concluídas",
    );

    await fixture.emitVisibilityChange();
    assert.equal(
      fixture.requests.length,
      1,
      "retomar no mesmo corte de 5 s não deve repetir uma consulta idêntica",
    );

    fixture.document.visibilityState = "hidden";
    await fixture.runNextTimer();
    assert.equal(
      fixture.requests.length,
      1,
      "o timer não consulta enquanto o documento está oculto",
    );
    assert.equal(
      fixture.nextTimerDelay(),
      undefined,
      "a aba oculta não deve manter um timer acordando sem necessidade",
    );

    fixture.document.visibilityState = "visible";
    await fixture.emitVisibilityChange();
    assert.equal(fixture.requests.length, 2);
    assert.equal(fixture.nextTimerDelay(), 5_000);
    assert.equal(
      fixture.requests[1].to.getTime() - fixture.requests[0].to.getTime(),
      5_000,
      "a janela ao vivo deve avançar na cadência do polling, sem ficar congelada no minuto fechado",
    );
  } finally {
    fixture.cleanup();
  }
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.visibilityListeners.size, 0);
});

test("Atualizar reconcilia sessions e os polls seguintes consultam somente a cauda", async () => {
  const fixture = createLoiteringHookFixture();
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "sessions");
    assert.equal(fixture.requests[0].bypassCache, false);
    assert.equal(
      fixture.requests[0].from.toISOString(),
      "2026-09-17T03:00:00.000Z",
    );

    fixture.result.refresh();
    await fixture.flush();
    assert.equal(fixture.requests.length, 2);
    assert.equal(
      fixture.requests[1].bypassCache,
      true,
      "a intenção explícita deve ignorar o cache uma única vez",
    );
    assert.equal(
      fixture.requests[1].from.toISOString(),
      "2026-09-17T03:00:00.000Z",
      "a atualização explícita precisa reconciliar o período ao vivo completo",
    );

    await fixture.runNextTimer();
    assert.equal(fixture.requests.length, 3);
    assert.equal(
      fixture.requests[2].bypassCache,
      false,
      "refreshVersion não pode invalidar todos os polls futuros",
    );
    assert.ok(
      fixture.requests[2].from.getTime() > fixture.requests[1].from.getTime(),
      "o poll posterior deve reler somente a cauda mutável de sessions",
    );
    assert.ok(
      fixture.requests.every((request) => request.resource === "sessions"),
      "a permanência individual não pode regressar para /summary",
    );

    await fixture.render({ timeZone: "UTC" });
    assert.equal(fixture.requests.length, 4);
    assert.equal(
      fixture.requests[3].bypassCache,
      false,
      "mudar o escopo depois do refresh não pode reutilizar a intenção já consumida",
    );
    assert.equal(
      fixture.requests[3].from.toISOString(),
      "2026-09-17T03:00:00.000Z",
      "o fixture certifica uma nova carga completa ao trocar o escopo",
    );
  } finally {
    fixture.cleanup();
  }
});

test("alterar a composição reutiliza as sessions tenant-wide já carregadas", async () => {
  const fixture = createLoiteringHookFixture();
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);

    await fixture.render({
      preferences: [
        { id: cardId, scenarioSelectionMode: "all", visible: true },
      ],
    });

    const changedScopeRequests = fixture.requests.slice(1);
    assert.equal(
      changedScopeRequests.length,
      0,
      "selecionar outro cenário deve apenas refiltrar o superset local",
    );
    assert.deepEqual(
      fixture.result.cards[0].node({
        scenarioSelection: { mode: "all", scenarioIds: [] },
      }).props.model.selectedScenarioIds,
      ["scenario-a", "scenario-b"],
      "a nova composição deve refiltrar as sessões no cliente",
    );
  } finally {
    fixture.cleanup();
  }
});

test("cada temporal refiltra cenários localmente sem repetir sessions", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: averageOverTimeCardId,
        scenarioIds: ["scenario-a"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
    ],
    requestedCardIds: new Set([averageOverTimeCardId]),
  });
  fixture.setSessionResponseRows([...selectableSessionRows]);
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);

    await fixture.render({
      preferences: [
        { id: cardId, visible: false },
        {
          id: averageOverTimeCardId,
          scenarioIds: ["scenario-b"],
          scenarioSelectionMode: "custom",
          visible: true,
        },
      ],
    });
    assert.equal(
      fixture.requests.length,
      1,
      "trocar a composição temporal deve apenas reprojetar o superset local",
    );

    const temporalCard = fixture.result.cards.find(
      (candidate: RuntimeFixture) => candidate.id === averageOverTimeCardId,
    );
    assert.ok(temporalCard);
    const rendered = temporalCard.node({
      scenarioSelection: {
        mode: "custom",
        scenarioIds: ["scenario-b"],
      },
    });
    assert.deepEqual(rendered.props.model.selectedScenarioIds, ["scenario-b"]);
  } finally {
    fixture.cleanup();
  }
});

test("alternar consumidores mantém sessions e summary independentes", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      {
        id: cardId,
        scenarioIds: ["scenario-a"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
      {
        id: averageCardId,
        scenarioIds: ["scenario-b"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
    ],
    requestedCardIds: new Set([cardId, averageCardId]),
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(
      fixture.requests.map((request) => request.resource).sort(),
      ["sessions", "summary"],
    );
    assert.equal(fixture.timers.size, 2);

    await fixture.render({
      preferences: [
        { id: cardId, visible: false },
        {
          id: averageCardId,
          scenarioIds: ["scenario-b"],
          scenarioSelectionMode: "custom",
          visible: true,
        },
      ],
    });
    assert.equal(fixture.requests.length, 2);
    assert.equal(
      fixture.timers.size,
      1,
      "o summary remanescente deve conservar somente seu polling",
    );
    assert.deepEqual(
      Array.from(fixture.result.scenarioTotalsById.keys()),
      ["scenario-b"],
      "trocar o consumidor deve apenas reprojetar o dataset local",
    );

    await fixture.render({
      preferences: [
        {
          id: cardId,
          scenarioIds: ["scenario-a"],
          scenarioSelectionMode: "custom",
          visible: true,
        },
        { id: averageCardId, visible: false },
      ],
    });
    assert.equal(fixture.requests.length, 2);
    assert.equal(fixture.timers.size, 1);
    assert.deepEqual(
      Array.from(fixture.result.scenarioTotalsById.keys()),
      [],
      "sem o card médio, scenarioTotalsById não deve projetar sessions como summary",
    );

    await fixture.render({
      preferences: [
        { id: cardId, visible: false },
        { id: averageCardId, visible: false },
      ],
    });
    assert.equal(fixture.requests.length, 2);
    assert.equal(
      fixture.timers.size,
      0,
      "sem consumidor demandado não pode permanecer timer nem polling",
    );
  } finally {
    fixture.cleanup();
  }
});

test("401 ou 403 remove dados certificados e invalida o estado incremental", async () => {
  const fixture = createLoiteringHookFixture();
  fixture.setSessionResponseRows([...certifiedSessionRows]);
  const renderCard = () =>
    fixture.result.cards[0].node({
      scenarioSelection: { mode: "inherit", scenarioIds: [] },
    });
  try {
    await fixture.flush();
    assert.equal(renderCard().props.model.rows.length, 1);

    fixture.failNextRequest(403);
    await fixture.runNextTimer();
    assert.equal(renderCard().props.model.rows.length, 0);
    assert.match(renderCard().props.error, /Não foi possível carregar/);
    assert.equal(
      fixture.timers.size,
      0,
      "uma autorização negada não pode repetir o lote a cada cinco segundos",
    );

    fixture.setSessionResponseRows([]);
    fixture.result.refresh();
    await fixture.flush();
    const retry = fixture.requests.at(-1);
    assert.equal(retry?.resource, "sessions");
    assert.equal(retry?.bypassCache, true);
    assert.equal(
      retry?.from.toISOString(),
      "2026-09-17T03:00:00.000Z",
      "uma nova tentativa explícita não pode reutilizar a cauda autorizada antes do 403",
    );
  } finally {
    fixture.cleanup();
  }
});

test("403 no summary tenant-wide encerra somente seu polling", async () => {
  const fixture = createLoiteringHookFixture({
    preferences: [
      { id: cardId, visible: false },
      {
        id: "occupancy_duration_average_by_scenario",
        scenarioSelectionMode: "all",
        visible: true,
      },
    ],
    requestedCardIds: new Set(["occupancy_duration_average_by_scenario"]),
  });
  fixture.setSummaryResponseRows([{ marker: "certified" }]);
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "summary");

    fixture.failNextRequest(403);
    await fixture.runNextTimer();

    assert.match(fixture.result.error, /Não foi possível carregar/);
    assert.equal(
      fixture.timers.size,
      0,
      "a autorização negada no summary tenant-wide não pode provocar tempestade de retry",
    );
  } finally {
    fixture.cleanup();
  }
});

test("modo manual individual consulta sessions uma vez e não instala timer", async () => {
  const fixture = createLoiteringHookFixture({
    period: {
      contextLabel: "14/09/2026 a 16/09/2026",
      from: new Date("2026-09-14T03:00:00.000Z"),
      to: new Date("2026-09-17T03:00:00.000Z"),
    },
    refreshMode: "manual",
  });
  try {
    await fixture.flush();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].resource, "sessions");
    assert.deepEqual(
      fixture.result.cards.map((card: RuntimeFixture) => card.id),
      loiteringCardIds,
      "Análises e Relatórios devem expor os doze cards configuráveis",
    );
    assert.equal(fixture.requests[0].bypassCache, false);
    assert.equal(fixture.timers.size, 0);

    await fixture.render({});
    assert.equal(
      fixture.requests.length,
      1,
      "render sem nova intenção não repete a consulta histórica",
    );
    fixture.result.refresh();
    await fixture.flush();
    assert.equal(fixture.requests.length, 2);
    assert.equal(
      fixture.requests[1].bypassCache,
      true,
      "a atualização manual deve ignorar o cache somente na carga solicitada",
    );
    assert.equal(fixture.timers.size, 0);

    await fixture.render({});
    assert.equal(
      fixture.requests.length,
      2,
      "o bypass explícito não deve provocar novas consultas após a carga concluir",
    );

    await fixture.render({
      period: {
        contextLabel: "15/09/2026 a 16/09/2026",
        from: new Date("2026-09-15T03:00:00.000Z"),
        to: new Date("2026-09-17T03:00:00.000Z"),
      },
    });
    assert.equal(fixture.requests.length, 3);
    assert.equal(
      fixture.requests[2].bypassCache,
      false,
      "um novo período não deve herdar o bypass de uma atualização anterior",
    );
  } finally {
    fixture.cleanup();
  }
});

test("composição configurável entrega ao card somente os cenários selecionados", async () => {
  const fixture = createLoiteringHookFixture();
  fixture.setSessionResponseRows([...selectableSessionRows]);
  try {
    await fixture.flush();
    const [card, averageCard] = fixture.result.cards;
    assert.equal(
      fixture.result.cards.length,
      loiteringCardIds.length,
      "Ao Vivo, Análises e Relatórios devem expor todo o catálogo de permanência",
    );
    assert.equal(card.id, cardId);
    assert.equal(averageCard.id, averageCardId);
    assert.equal(card.scenarioConfigurable, true);
    assert.equal(averageCard.scenarioConfigurable, true);
    assert.equal(card.scenarioOrderingDisabled, true);
    assert.equal(card.scenarioSelectionPolicy, "compare");
    assert.deepEqual(card.inheritedScenarioIds, ["scenario-a"]);

    const rendered = card.node({
      scenarioSelection: {
        mode: "custom",
        scenarioIds: ["scenario-b"],
      },
    });
    assert.deepEqual(rendered.props.model.selectedScenarioIds, ["scenario-b"]);
    assert.deepEqual(
      rendered.props.sessions.map((session: RuntimeFixture) => session.area),
      ["area-b"],
      "a lista individual deve respeitar a seleção do próprio card",
    );
    assert.ok(
      !rendered.props.model.selectedScenarioIds.includes("foreign-scenario"),
      "cenário de outra empresa nunca participa da composição",
    );
  } finally {
    fixture.cleanup();
  }
});

test("card individual usa sessions e o diálogo mantém seu detalhamento sob demanda", () => {
  assert.match(
    hookSource,
    /const fetchedRows = await fetchOccupancyLoiteringSessions\(\{[\s\S]*?from: requestFrom,[\s\S]*?to: sessionRequestRange\.to/,
    "o card individual precisa carregar /loitering/sessions no hook",
  );
  assert.match(
    hookSource,
    /const sessionSummaryRows = React\.useMemo\([\s\S]*?summarizeOccupancyLoiteringSessions\(currentSessions\.rows\)/,
    "o modelo visual individual deve ser calculado a partir das sessões",
  );
  assert.match(
    hookSource,
    /const resolveSummaryModel =[\s\S]*?buildOccupancyLoiteringSummaryModel\(selected, current\.rows\)/,
    "o card médio precisa permanecer vinculado ao summary",
  );

  const dialogStart = widgetSource.indexOf(
    "function OccupancyLoiteringSessionsDialog",
  );
  const reportStart = widgetSource.indexOf(
    "export function occupancyLoiteringChartEntries",
  );
  assert.ok(dialogStart >= 0 && reportStart > dialogStart);
  const dialogSource = widgetSource.slice(dialogStart, reportStart);
  assert.match(dialogSource, /if \(!open\) return/);
  assert.match(
    dialogSource,
    /if \(\s*!open \|\|[\s\S]*?!sessionQueryRange \|\|\s*!scopeKey\s*\) \{\s*return;/,
  );
  assert.match(
    dialogSource,
    /occupancyLoiteringSessionsQueryRange\(\{[\s\S]*?from: period\.from,[\s\S]*?to: period\.to/,
    "o detalhamento deve preservar o período completo quando ele é seguro",
  );
  const sessionsCallStart = dialogSource.indexOf(
    "fetchOccupancyLoiteringSessions({",
  );
  const sessionsCallEnd = dialogSource.indexOf("})\n      .then", sessionsCallStart);
  assert.ok(sessionsCallStart >= 0 && sessionsCallEnd > sessionsCallStart);
  const sessionsCall = dialogSource.slice(sessionsCallStart, sessionsCallEnd);
  assert.doesNotMatch(
    sessionsCall,
    /\b(?:area|cameraId):/,
    "sessions deve consultar o período tenant-wide somente com from/to",
  );
  assert.match(
    dialogSource,
    /const selectedRows = React\.useMemo\([\s\S]*?occupancyLoiteringKey\([\s\S]*?=== selectedAreaKey/,
    "a área escolhida deve ser filtrada localmente após a única consulta do período",
  );
  const scopeStart = dialogSource.indexOf("const scopeKey =");
  const scopeEnd = dialogSource.indexOf("React.useEffect", scopeStart);
  assert.ok(scopeStart >= 0 && scopeEnd > scopeStart);
  assert.doesNotMatch(
    dialogSource.slice(scopeStart, scopeEnd),
    /selectedAreaKey/,
    "trocar a área não deve repetir a mesma consulta tenant-wide",
  );
  assert.equal(
    widgetSource.match(/fetchOccupancyLoiteringSessions\(\{/g)?.length,
    1,
    "o diálogo deve manter uma única consulta adicional, somente ao ser aberto",
  );
});

test("gráfico individual preserva uma sessão por ponto no horário e duração reais", () => {
  const widgets = loadLoiteringWidgets();
  const endedAt = "2026-09-16T17:14:40.000Z";
  const option = widgets.buildOccupancyLoiteringSessionsChartOption(
    [
      {
        areaLabel: "Parado & espera",
        durationSeconds: 21,
        endedAt,
        key: "first",
        scenarioLabel: "<Entrada>",
      },
      {
        areaLabel: "Parado & espera",
        durationSeconds: 7,
        endedAt,
        key: "second",
        scenarioLabel: "<Entrada>",
      },
      {
        areaLabel: "Fila",
        durationSeconds: 46.5,
        endedAt: "2026-09-16T17:15:40.000Z",
        key: "third",
        scenarioLabel: "Saída",
      },
    ],
    "light",
    "#1267C4",
    "America/Sao_Paulo",
  ) as RuntimeFixture;
  const series = option.series as RuntimeFixture[];
  const points = series.flatMap((candidate) => candidate.data);

  assert.equal(option.xAxis.type, "time");
  assert.equal(option.yAxis.type, "value");
  assert.deepEqual(series.map((candidate) => candidate.type), ["scatter", "scatter"]);
  assert.equal(points.length, 3, "sessões simultâneas não podem ser deduplicadas");
  assert.deepEqual(
    points
      .filter((point) => point.endedAt === endedAt)
      .map((point) => point.value[1]),
    [21, 7],
  );
  const tooltip = option.tooltip.formatter({ data: points[0] });
  assert.match(tooltip, /&lt;Entrada&gt;/);
  assert.match(tooltip, /Parado &amp; espera/);
  assert.match(tooltip, /21 s/);
  assert.ok(!tooltip.includes("camera_id"));
});

test("gráfico médio representa mínimo, máximo, média e quantidade do summary", () => {
  const widgets = loadLoiteringWidgets();
  const entries = widgets.occupancyLoiteringChartEntries({
    areas: [],
    scenarios: [
      {
        areas: [],
        label: "Parado",
        scenarioId: "scenario-a",
        totals: {
          avgDurationSeconds: 46.5,
          maxDurationSeconds: 85,
          minDurationSeconds: 7,
          sessionCount: 28,
        },
      },
    ],
    totals: {
      avgDurationSeconds: 46.5,
      maxDurationSeconds: 85,
      minDurationSeconds: 7,
      sessionCount: 28,
    },
  });
  const option = widgets.buildOccupancyLoiteringChartOption(
    entries,
    "dark",
    "#0F766E",
  ) as RuntimeFixture;

  assert.equal(option.series[0].type, "custom");
  assert.equal(option.series[1].type, "scatter");
  assert.deepEqual(option.series[0].data[0].value, [7, 85, 46.5, 0]);
  assert.deepEqual(option.series[1].data[0], [46.5, 0]);
  const tooltip = option.tooltip.formatter({ dataIndex: 0 });
  assert.match(tooltip, /28/);
  assert.match(tooltip, /46,5 s/);
  assert.match(tooltip, /7 s/);
  assert.match(tooltip, /1 min 25 s/);
});

test("payload real do summary vira uma área e usa escala adaptativa sem perder segundos", () => {
  const widgets = loadLoiteringWidgets();
  const model = occupancyLoiteringModel.buildOccupancyLoiteringSummaryModel(
    [
      {
        active: true,
        areas: [
          {
            area_id: "parado",
            camera_id: "6c0a1124-8b1d-4560-a359-76d54bd5347a",
          },
        ],
        company_id: "company-a",
        id: "scenario-private",
        name: "Operação",
        object_class: "person",
      },
    ],
    [
      {
        area: "parado",
        avg_duration_seconds: 32_910_546.625,
        camera_id: "6c0a1124-8b1d-4560-a359-76d54bd5347a",
        max_duration_seconds: 789_852_803,
        min_duration_seconds: 0,
        object_class: "person",
        session_count: 24,
      },
    ],
  );
  const entries = widgets.occupancyLoiteringChartEntries(model);

  assert.deepEqual(entries, [
    {
      areaLabel: "Parado",
      average: 32_910_546.625,
      label: "Operação · Parado",
      maximum: 789_852_803,
      minimum: 0,
      scenarioLabel: "Operação",
      sessions: 24,
    },
  ]);

  const scale = widgets.buildOccupancyLoiteringDurationScale([
    0,
    32_910_546.625,
    789_852_803,
  ]);
  assert.equal(scale.logarithmic, true);
  assert.equal(scale.toAxis(0), 0);
  assert.ok(Number.isFinite(scale.toAxis(789_852_803)));

  const option = widgets.buildOccupancyLoiteringChartOption(
    entries,
    "dark",
    "#1267C4",
  ) as RuntimeFixture;
  assert.match(option.xAxis.name, /escala log adaptativa/);
  const tooltip = option.tooltip.formatter({ dataIndex: 0 });
  assert.match(tooltip, /24/);
  assert.match(tooltip, /32\.910\.546,625 s/);
  assert.match(tooltip, /789\.852\.803 s/);
  assert.match(tooltip, /25 anos/);
  assert.ok(!tooltip.includes("6c0a1124"));
});

test("quantidade, média, mínimo, máximo e faixa usam campos distintos do summary", () => {
  const widgets = loadLoiteringWidgets();
  const entries = [
    {
      areaLabel: "Parado",
      average: 32_910_546.625,
      label: "Operação · Parado",
      maximum: 789_852_803,
      minimum: 0,
      scenarioLabel: "Operação",
      sessions: 24,
    },
  ];
  const expected = {
    average: 32_910_546.625,
    maximum: 789_852_803,
    minimum: 0,
    sessions: 24,
  } as const;

  for (const metric of Object.keys(expected) as Array<keyof typeof expected>) {
    const option = widgets.buildOccupancyLoiteringSummaryMetricChartOption(
      entries,
      "light",
      metric,
      "#1267C4",
    ) as RuntimeFixture;
    assert.equal(option.series[0].type, "bar");
    assert.equal(option.series[0].data[0].rawValue, expected[metric]);
  }

  const range = widgets.buildOccupancyLoiteringChartOption(
    entries,
    "light",
    "#1267C4",
  ) as RuntimeFixture;
  assert.equal(range.series[0].data[0].minimumSeconds, 0);
  assert.equal(range.series[0].data[0].averageSeconds, 32_910_546.625);
  assert.equal(range.series[0].data[0].maximumSeconds, 789_852_803);
});

test("payload individual preserva zero, empate e valor extremo em uma série Cenário · Área", () => {
  const widgets = loadLoiteringWidgets();
  const durations = [
    9, 18, 6, 0, 30, 7, 22, 1, 19, 3, 34, 1,
    28, 7, 25, 789_852_493, 9, 17, 11, 1, 18, 3, 33, 0,
  ];
  const entries = durations.map((durationSeconds, index) => ({
    areaLabel: "Parado",
    durationSeconds,
    endedAt:
      index === 9 || index === 10
        ? "2026-09-19T21:16:11.000Z"
        : new Date(Date.parse("2026-09-19T21:13:33.000Z") + index * 1_000)
            .toISOString(),
    key: `session-${index}`,
    scenarioLabel: "Operação",
  }));
  const option = widgets.buildOccupancyLoiteringSessionsChartOption(
    entries,
    "light",
    "#1267C4",
    "America/Sao_Paulo",
  ) as RuntimeFixture;
  const points = option.series.flatMap(
    (series: RuntimeFixture) => series.data,
  );

  assert.equal(option.series.length, 1);
  assert.equal(option.series[0].name, "Operação · Parado");
  assert.equal(points.length, 24);
  assert.equal(points.filter((point: RuntimeFixture) => point.durationSeconds === 0).length, 2);
  assert.equal(
    points.filter(
      (point: RuntimeFixture) =>
        point.endedAt === "2026-09-19T21:16:11.000Z",
    ).length,
    2,
  );
  assert.match(option.yAxis.name, /escala log adaptativa/);
  const outlier = points.find(
    (point: RuntimeFixture) => point.durationSeconds === 789_852_493,
  );
  assert.ok(outlier);
  assert.ok(Number.isFinite(outlier.value[1]));
  const tooltip = option.tooltip.formatter({ data: outlier });
  assert.match(tooltip, /789\.852\.493 s/);
  assert.match(tooltip, /25 anos/);
});

test("gráficos de sessions e summary renderizam no primeiro frame em light e dark", () => {
  const widgets = loadLoiteringWidgets();
  const sessionEntries = [
    {
      areaLabel: "Parado",
      durationSeconds: 21,
      endedAt: "2026-09-16T17:14:40.000Z",
      key: "first",
      scenarioLabel: "Entrada",
    },
    {
      areaLabel: "Espera",
      durationSeconds: 46.5,
      endedAt: "2026-09-16T18:15:40.000Z",
      key: "second",
      scenarioLabel: "Saída",
    },
  ];
  const summaryEntries = [
    {
      average: 46.5,
      label: "Parado",
      maximum: 85,
      minimum: 7,
      sessions: 28,
    },
  ];

  for (const theme of ["light", "dark"] as const) {
    const options = [
      widgets.buildOccupancyLoiteringSessionsChartOption(
        sessionEntries,
        theme,
        "#1267C4",
        "America/Sao_Paulo",
      ),
      widgets.buildOccupancyLoiteringChartOption(
        summaryEntries,
        theme,
        "#0F766E",
      ),
    ];
    for (const option of options) {
      for (const width of [320, 900]) {
        const chart = echarts.init(null, null, {
          height: 260,
          renderer: "svg",
          ssr: true,
          width,
        });
        try {
          chart.setOption(option, { lazyUpdate: false, notMerge: true });
          const svg = chart.renderToSVGString();
          assert.match(svg, /<svg/);
          assert.doesNotMatch(svg, /\bNaN\b|\bInfinity\b/);
        } finally {
          chart.dispose();
        }
      }
    }
  }
});

test("exportação individual preserva uma linha e um ponto por sessão real", () => {
  const widgets = loadLoiteringWidgets();
  const sessions = [
    {
      area: "area-a",
      camera_id: "camera-a",
      duration_seconds: 21,
      ended_at: "2026-09-16T17:14:40.000Z",
      object_class: "person",
    },
    {
      area: "area-a",
      camera_id: "camera-a",
      duration_seconds: 7,
      ended_at: "2026-09-16T17:14:40.000Z",
      object_class: "person",
    },
    {
      area: "area-b",
      camera_id: "camera-b",
      duration_seconds: 46.5,
      ended_at: "2026-09-16T17:15:40.000Z",
      object_class: "person",
    },
  ];
  const model = occupancyLoiteringModel.buildOccupancyLoiteringSummaryModel(
    [
      {
        active: true,
        areas: [
          { area_id: "area-a", camera_id: "camera-a", label: "Parado" },
        ],
        company_id: "company-a",
        id: "technical-scenario-id",
        name: "Entrada",
        object_class: "person",
      },
      {
        active: true,
        areas: [
          { area_id: "area-b", camera_id: "camera-b", label: "Espera" },
        ],
        company_id: "company-a",
        id: "second-technical-id",
        name: "Saída",
        object_class: "person",
      },
    ],
    occupancyLoiteringModel.summarizeOccupancyLoiteringSessions(sessions),
  );
  const chart = widgets.buildOccupancyLoiteringReport(
    model,
    sessions,
    "14/09/2026 a 16/09/2026",
    "America/Sao_Paulo",
    "#1267C4",
  );

  assert.ok(chart);
  const option = chart.option as RuntimeFixture;
  assert.equal(chart.title, "Permanência individual");
  assert.equal(
    option.series.flatMap((series: RuntimeFixture) => series.data).length,
    3,
    "a exportação não pode consolidar nem deduplicar sessões simultâneas",
  );
  assert.deepEqual(
    chart.table.rows.map((row: RuntimeFixture) => ({
      area: row.area,
      duration: row.duration,
      endedAt: row.endedAt,
      scenario: row.scenario,
    })),
    [
      {
        area: "Parado",
        duration: "21 s",
        endedAt: "2026-09-16T17:14:40.000Z",
        scenario: "Entrada",
      },
      {
        area: "Parado",
        duration: "7 s",
        endedAt: "2026-09-16T17:14:40.000Z",
        scenario: "Entrada",
      },
      {
        area: "Espera",
        duration: "46,5 s",
        endedAt: "2026-09-16T17:15:40.000Z",
        scenario: "Saída",
      },
    ],
    "a tabela auditável precisa manter cada sessão carregada",
  );
  assert.match(chart.description ?? "", /Cada ponto representa uma sessão real/);
  assert.match(
    liveSource,
    /async function getOccupancyReportPayload\(signal\?: AbortSignal\)[\s\S]*?await occupancyLoitering\.loadReportAssets\(signal\)[\s\S]*?occupancyLoiteringReportAssets,/,
  );
  assert.match(
    reportsSource,
    /async function getOccupancyReportPayload\([\s\S]*?await occupancyLoitering\.loadReportAssets\(signal\)[\s\S]*?buildOccupancyReportPayload\(loiteringReportAssets\)/,
    "Relatórios históricos precisam falhar antes de montar o arquivo se a fonte demandada falhar",
  );
  assert.match(
    reportsSource,
    /const occupancyReportPayload = await getOccupancyReportPayload\(signal\)/,
    "a IA precisa usar a mesma barreira fail-closed da exportação",
  );
  assert.match(
    reportsSource,
    /<ReportExportActions[\s\S]*?getPayload=\{getOccupancyReportPayload\}/,
  );

  const serialized = JSON.stringify(chart);
  assert.ok(!serialized.includes("technical-scenario-id"));
  assert.ok(!serialized.includes("second-technical-id"));
});

test("exportação média preserva a área, os segundos brutos e a quantidade do summary", () => {
  const widgets = loadLoiteringWidgets();
  const chart = widgets.buildOccupancyLoiteringAverageReport(
    {
      areas: [],
      scenarios: [
        {
          areas: [],
          label: "Parado",
          scenarioId: "technical-scenario-id",
          totals: {
            avgDurationSeconds: 46.5,
            maxDurationSeconds: 85,
            minDurationSeconds: 7,
            sessionCount: 28,
          },
        },
      ],
      totals: {
        avgDurationSeconds: 46.5,
        maxDurationSeconds: 85,
        minDurationSeconds: 7,
        sessionCount: 28,
      },
    },
    "14/09/2026 a 16/09/2026",
    "#0F766E",
  );

  assert.ok(chart);
  const option = chart.option as RuntimeFixture;
  assert.equal(chart.title, "Permanência média por área");
  assert.equal(option.series[0].type, "bar");
  assert.deepEqual(chart.table.rows, [
    {
      area: "Parado",
      average: "46,5 s",
      averageSeconds: 46.5,
      maximum: "1 min 25 s",
      maximumSeconds: 85,
      minimum: "7 s",
      minimumSeconds: 7,
      scenario: "Parado",
      sessions: 28,
    },
  ]);
  assert.ok(!JSON.stringify(chart).includes("technical-scenario-id"));
});

test("textos não prometem pessoas únicas, não dizem quem e não exibem IDs técnicos", () => {
  assert.match(
    widgetSource,
    /Não representa pessoas únicas|não equivale necessariamente a uma pessoa única/i,
  );
  assert.doesNotMatch(
    widgetSource,
    /(?:total|quantidade|número) de pessoas únicas/i,
  );
  assert.doesNotMatch(widgetSource, /["'`][^"'`]*\bquem\b[^"'`]*["'`]/i);

  const tableStart = widgetSource.indexOf(
    '<Table scrollRegionLabel="Sessões de permanência do período">',
  );
  const tableEnd = widgetSource.indexOf("</Table>", tableStart);
  assert.ok(tableStart >= 0 && tableEnd > tableStart);
  const tableSource = widgetSource.slice(tableStart, tableEnd);
  assert.doesNotMatch(
    tableSource,
    /camera_id|object_class|area_id|scenarioId/,
    "a tabela mostra somente informações úteis ao cliente",
  );
  assert.match(widgetSource, /<SelectItem key=\{area\.key\}[\s\S]*?\{area\.label\}/);
  assert.doesNotMatch(widgetSource, />\s*(?:camera_id|area_id|object_class|ID)\s*</i);
});

function createLoiteringHookFixture(
  overrides: Record<string, RuntimeFixture> = {},
) {
  type Slot = {
    cleanup?: () => void;
    dependencies?: readonly unknown[];
    value?: RuntimeFixture;
  };
  const slots: Slot[] = [];
  const queuedEffects: Array<() => void> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const visibilityListeners = new Set<() => void>();
  const requests: RuntimeFixture[] = [];
  const documentFixture = {
    visibilityState: "visible",
    addEventListener(event: string, callback: () => void) {
      if (event === "visibilitychange") visibilityListeners.add(callback);
    },
    removeEventListener(event: string, callback: () => void) {
      if (event === "visibilitychange") visibilityListeners.delete(callback);
    },
  };
  const NativeDate = Date;
  let nowMs = NativeDate.parse("2026-09-17T15:00:12.000Z");
  class FixtureDate extends NativeDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? nowMs : value);
    }

    static override now() {
      return nowMs;
    }
  }
  let cursor = 0;
  let timerId = 0;
  let dirty = true;
  let result: RuntimeFixture;
  let nextRequestError: Error | null = null;
  let deferNextSessionResponse = false;
  let pendingSessionResponse:
    | ((rows: RuntimeFixture[]) => void)
    | null = null;
  let sessionResponseRows: RuntimeFixture[] = [];
  let summaryResponseRows: RuntimeFixture[] = [];
  class FixtureApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  const props: Record<string, RuntimeFixture> = {
    companyScopeId: "company-a",
    enabled: true,
    focusScenarioId: "scenario-a",
    monitorMode: false,
    preferences: [{ id: cardId, visible: true }],
    scenarios: [
      {
        areas: [
          { area_id: "area-a", camera_id: "camera-a", label: "Entrada" },
        ],
        company_id: "company-a",
        id: "scenario-a",
        name: "Entrada",
        object_class: "person",
      },
      {
        areas: [
          { area_id: "area-b", camera_id: "camera-b", label: "Saída" },
        ],
        company_id: "company-a",
        id: "scenario-b",
        name: "Saída",
        object_class: "person",
      },
      {
        areas: [
          {
            area_id: "foreign-area",
            camera_id: "foreign-camera",
            label: "Outra empresa",
          },
        ],
        company_id: "company-b",
        id: "foreign-scenario",
        name: "Outra empresa",
        object_class: "person",
      },
    ],
    timeZone: "America/Sao_Paulo",
    userId: "user-a",
    ...overrides,
  };

  function takeRequestError(request: RuntimeFixture) {
    void request;
    const error = nextRequestError;
    nextRequestError = null;
    return error;
  }

  function sameDependencies(
    left: readonly unknown[] | undefined,
    right: readonly unknown[],
  ) {
    return Boolean(
      left &&
        left.length === right.length &&
        left.every((value, index) => Object.is(value, right[index])),
    );
  }

  const react = {
    useCallback(callback: RuntimeFixture, dependencies: readonly unknown[]) {
      return react.useMemo(() => callback, dependencies);
    },
    useEffect(
      effect: () => (() => void) | undefined,
      dependencies: readonly unknown[],
    ) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && sameDependencies(previous.dependencies, dependencies)) {
        return;
      }
      const slot: Slot = { dependencies };
      slots[index] = slot;
      queuedEffects.push(() => {
        previous?.cleanup?.();
        slot.cleanup = effect();
      });
    },
    useMemo(factory: () => RuntimeFixture, dependencies: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && sameDependencies(previous.dependencies, dependencies)) {
        return previous.value;
      }
      const value = factory();
      slots[index] = { dependencies, value };
      return value;
    },
    useRef(initial: RuntimeFixture) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useState(initial: RuntimeFixture) {
      const index = cursor++;
      slots[index] ??= {
        value: typeof initial === "function" ? initial() : initial,
      };
      return [
        slots[index].value,
        (update: RuntimeFixture) => {
          const next =
            typeof update === "function" ? update(slots[index].value) : update;
          if (!Object.is(next, slots[index].value)) {
            slots[index].value = next;
            dirty = true;
          }
        },
      ];
    },
  };
  const jsx = (type: RuntimeFixture, elementProps: RuntimeFixture) => ({
    props: elementProps,
    type,
  });
  const widgetMock = {
    OCCUPANCY_LOITERING_AVERAGE_CARD_ID: averageCardId,
    OCCUPANCY_LOITERING_CARD_ID: cardId,
    OCCUPANCY_LOITERING_CARD_IDS: baseLoiteringCardIds,
    OCCUPANCY_LOITERING_MAXIMUM_CARD_ID: maximumCardId,
    OCCUPANCY_LOITERING_MINIMUM_CARD_ID: minimumCardId,
    OCCUPANCY_LOITERING_RANGE_CARD_ID: rangeCardId,
    OCCUPANCY_LOITERING_SESSION_COUNT_CARD_ID: sessionCountCardId,
    OCCUPANCY_LOITERING_SUMMARY_CARD_IDS: summaryCardIds,
    OccupancyLoiteringAverageByScenarioCard:
      "OccupancyLoiteringAverageByScenarioCard",
    OccupancyLoiteringRangeCard: "OccupancyLoiteringRangeCard",
    OccupancyLoiteringSummaryCard: "OccupancyLoiteringSummaryCard",
    OccupancyLoiteringSummaryMetricCard:
      "OccupancyLoiteringSummaryMetricCard",
    buildOccupancyLoiteringReport: (model: RuntimeFixture) => ({ model }),
    buildOccupancyLoiteringRangeReport: (model: RuntimeFixture) => ({ model }),
    buildOccupancyLoiteringSummaryMetricReport:
      (model: RuntimeFixture) => ({ model }),
  };
  const temporalLabels = Object.fromEntries(
    temporalCardIds.map((id) => [id, id]),
  );
  const temporalWidgetMock = {
    OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID:
      accumulatedSessionTimeCardId,
    OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID: areaPeriodHeatmapCardId,
    OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID: averageOverTimeCardId,
    OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID:
      durationDistributionCardId,
    OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID: percentilesByAreaCardId,
    OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID: sessionsOverTimeCardId,
    OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS: temporalCardIds,
    OCCUPANCY_LOITERING_TEMPORAL_LABELS: temporalLabels,
    OccupancyLoiteringTemporalCard: "OccupancyLoiteringTemporalCard",
    buildOccupancyLoiteringTemporalReportChart: ({
      contextLabel,
      dataContextLabel,
      kind,
      model,
      sessionsSlicedByDay,
    }: RuntimeFixture) =>
      model.totals.count > 0
        ? {
            description: sessionsSlicedByDay
              ? `Esta visualização usa somente a prévia efetivamente carregada (${dataContextLabel}), e não todo o período selecionado (${contextLabel}).`
              : `Intervalo analisado: ${dataContextLabel ?? contextLabel}.`,
            option: {},
            table: { columns: [], rows: [], title: kind },
            title: kind,
          }
        : null,
    buildSharedOccupancyLoiteringTemporalModel: ({
      model,
      sessions,
    }: RuntimeFixture) => ({
      context: model,
      totals: { count: sessions.length },
    }),
  };
  const compiled = ts.transpileModule(hookSource, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "use-occupancy-loitering.tsx",
  }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function(
    "module",
    "exports",
    "require",
    "document",
    "window",
    "navigator",
    "setTimeout",
    "clearTimeout",
    "Date",
    compiled,
  )(
    loaded,
    loaded.exports,
    (specifier: string) => {
      if (specifier === "react") return react;
      if (specifier === "react/jsx-runtime") {
        return { Fragment: Symbol("Fragment"), jsx, jsxs: jsx };
      }
      if (specifier === "@/components/app/occupancy-loitering-widgets") {
        return widgetMock;
      }
      if (
        specifier ===
        "@/components/app/occupancy-loitering-temporal-widgets"
      ) {
        return temporalWidgetMock;
      }
      if (specifier === "@/lib/company-time-zone") {
        return {
          startOfCompanyTimeZoneDay: (
            _now: Date,
            requestedTimeZone: string,
          ) => {
            if (requestedTimeZone === "Invalid/Zone") {
              throw new RangeError("invalid timezone");
            }
            return new FixtureDate("2026-09-17T03:00:00.000Z");
          },
        };
      }
      if (specifier === "@/lib/occupancy-loitering") {
        return {
          buildOccupancyLoiteringSummaryModel: (
            selectedScenarios: RuntimeFixture[],
            rows: RuntimeFixture[],
          ) => ({
            areas: [],
            rows,
            scenarios: selectedScenarios.map((scenario) => ({
              areas: [],
              label: scenario.name,
              scenarioId: scenario.id,
              totals: {
                avgDurationSeconds: null,
                maxDurationSeconds: null,
                minDurationSeconds: null,
                sessionCount: 0,
              },
            })),
            selectedScenarioIds: selectedScenarios.map((scenario) => scenario.id),
            totals: {
              avgDurationSeconds: null,
              maxDurationSeconds: null,
              minDurationSeconds: null,
              sessionCount: 0,
            },
          }),
          combineOccupancyLoiteringSummaryRows: (
            groups: RuntimeFixture[][],
          ) => groups.flat(),
          selectOccupancyLoiteringSessions:
            occupancyLoiteringModel.selectOccupancyLoiteringSessions,
          summarizeOccupancyLoiteringSessions: (
            rows: RuntimeFixture[],
          ) => rows.map((row) => ({ ...row, summarizedFromSession: true })),
        };
      }
      if (specifier === "@/lib/api") {
        return { ApiError: FixtureApiError };
      }
      if (specifier === "@/lib/occupancy-loitering-query") {
        return {
          fetchLiveOccupancyLoiteringSummary: async (request: RuntimeFixture) => {
            requests.push({ ...request, resource: "summary" });
            const error = takeRequestError(request);
            if (error) throw error;
            return {
              rows: summaryResponseRows,
              state: request.previous ?? {
                identity: "live",
                reconciledAt: request.to.getTime(),
                stableRows: [],
                stableTo: request.from.getTime(),
              },
            };
          },
          fetchOccupancyLoiteringSummary: async (request: RuntimeFixture) => {
            requests.push({ ...request, resource: "summary" });
            const error = takeRequestError(request);
            if (error) throw error;
            return summaryResponseRows;
          },
          fetchOccupancyLoiteringSessions: async (request: RuntimeFixture) => {
            const url =
              `/api/v1/occupancy/loitering/sessions?from=${encodeURIComponent(request.from.toISOString())}` +
              `&to=${encodeURIComponent(request.to.toISOString())}`;
            requests.push({ ...request, resource: "sessions", url });
            const error = takeRequestError(request);
            if (error) throw error;
            if (deferNextSessionResponse) {
              deferNextSessionResponse = false;
              return await new Promise<RuntimeFixture[]>((resolve) => {
                pendingSessionResponse = resolve;
              });
            }
            return sessionResponseRows;
          },
          initialOccupancyLoiteringSessionDay: ({
            from,
            to,
          }: {
            from: Date;
            to: Date;
          }) =>
            new FixtureDate(
              Math.max(from.getTime(), to.getTime() - 24 * 60 * 60_000),
            ),
          occupancyLoiteringSessionsQueryRange: ({
            dayStart,
            from,
            to,
          }: {
            dayStart: Date;
            from: Date;
            to: Date;
          }) => {
            const slicedByDay =
              to.getTime() - from.getTime() > 31 * 24 * 60 * 60_000;
            return {
              from: new FixtureDate(slicedByDay ? dayStart : from),
              slicedByDay,
              to: new FixtureDate(
                slicedByDay
                  ? Math.min(to.getTime(), dayStart.getTime() + 24 * 60 * 60_000)
                  : to,
              ),
            };
          },
        };
      }
      if (specifier === "@/lib/request-cancellation") {
        return {
          abortRequest: (controller: AbortController) => controller.abort(),
          isAbortError: () => false,
        };
      }
      if (specifier === "@/lib/widget-scenario-selection") {
        return {
          resolveWidgetScenarios: (
            scenarios: RuntimeFixture[],
            selection: RuntimeFixture,
            inherited: RuntimeFixture[],
          ) => {
            if (selection.mode === "inherit") return inherited;
            if (selection.mode === "all") return scenarios;
            const selectedIds = new Set(selection.scenarioIds);
            return scenarios.filter((scenario) => selectedIds.has(scenario.id));
          },
        };
      }
      return require(specifier);
    },
    documentFixture,
    {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    { onLine: true },
    (callback: () => void, delay = 0) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    (id: number) => timers.delete(id),
    FixtureDate,
  );

  async function flush() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (dirty) {
        dirty = false;
        cursor = 0;
        result = loaded.exports.useOccupancyLoitering(props);
        queuedEffects.splice(0).forEach((effect) => effect());
      }
      await new Promise<void>((done) => setImmediate(done));
      if (!dirty) return;
    }
    assert.fail("o hook de permanência não estabilizou após 20 renders");
  }

  return {
    cleanup() {
      slots.forEach((slot) => slot.cleanup?.());
    },
    document: documentFixture,
    deferNextSessionRequest() {
      assert.equal(
        pendingSessionResponse,
        null,
        "não pode haver outra resposta de sessions pendente",
      );
      deferNextSessionResponse = true;
    },
    async emitVisibilityChange() {
      visibilityListeners.forEach((listener) => listener());
      await flush();
    },
    failNextRequest(status: number) {
      nextRequestError = new FixtureApiError("request failed", status);
    },
    flush,
    nextTimerDelay() {
      return timers.values().next().value?.delay;
    },
    async render(changes: Record<string, RuntimeFixture>) {
      Object.assign(props, changes);
      dirty = true;
      await flush();
    },
    requests,
    resolvePendingSessionRequest(rows = sessionResponseRows) {
      assert.ok(pendingSessionResponse, "resposta de sessions pendente esperada");
      const resolve = pendingSessionResponse;
      pendingSessionResponse = null;
      resolve(rows);
    },
    setSessionResponseRows(rows: RuntimeFixture[]) {
      sessionResponseRows = rows;
    },
    setSummaryResponseRows(rows: RuntimeFixture[]) {
      summaryResponseRows = rows;
    },
    advanceTime(milliseconds: number) {
      nowMs += milliseconds;
    },
    get result() {
      return result;
    },
    async runNextTimer() {
      const entry = timers.entries().next().value;
      assert.ok(entry, "timer esperado");
      const [id, timer] = entry;
      timers.delete(id);
      nowMs += timer.delay;
      timer.callback();
      await flush();
    },
    timers,
    visibilityListeners,
  };
}

function loadLoiteringWidgets() {
  const palette = {
    axisLine: "#CBD5E1",
    axisText: "#334155",
    gridLine: "#E2E8F0",
    legendText: "#475569",
    surface: "#FFFFFF",
    tooltipBackground: "#FFFFFF",
    tooltipBorder: "#CBD5E1",
    tooltipText: "#0F172A",
  };
  const load = createModuleLoader(projectRoot, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
    mocks: {
      "@/components/app/deferred-echart": {},
      "@/components/app/occupancy-chart-palette": {
        getOccupancyChartPalette: () => palette,
      },
      "@/components/app/theme-provider": {},
      "@/components/app/widget-appearance": {},
      "@/components/ui/button": {},
      "@/components/ui/card": {},
      "@/components/ui/dialog": {},
      "@/components/ui/select": {},
      "@/components/ui/skeleton": {},
      "@/components/ui/table": {},
      "@/lib/company-time-zone": {},
      "@/lib/occupancy-calendar": {},
      "@/lib/occupancy-loitering-query": {},
      "@/lib/request-cancellation": {},
      "@/lib/utils": { formatDateTime: (value: string) => value },
    },
  });
  return load<typeof import("../components/app/occupancy-loitering-widgets.tsx")>(
    "components/app/occupancy-loitering-widgets.tsx",
  );
}
