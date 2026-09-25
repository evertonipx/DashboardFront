// The fixtures below execute selected production closures with injected values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { createModuleLoader } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = createModuleLoader(projectRoot);
const query = load<typeof import("../lib/occupancy-dashboard-query.ts")>(
  "lib/occupancy-dashboard-query.ts",
);

const live = parseSource("components/app/occupancy-scenario-dashboard.tsx");
const reports = parseSource("components/app/occupancy-reports-dashboard.tsx");
const duration = parseSource("components/app/occupancy-duration-widgets.tsx");
const durationInsights = parseSource(
  "components/app/use-occupancy-duration-insights.tsx",
);
const loitering = parseSource("components/app/use-occupancy-loitering.tsx");
const durationInsightWidgets = parseSource(
  "components/app/occupancy-duration-insights-widgets.tsx",
);

const durationCardIds = evaluateExpression<string[]>(
  variable(duration, "OCCUPANCY_DURATION_CARD_IDS").initializer!.getText(
    duration.ast,
  ),
);
const aggregateDurationCardIds = evaluateExpression<string[]>(
  variable(duration, "OCCUPANCY_AGGREGATE_DURATION_CARD_IDS").initializer!.getText(
    duration.ast,
  ),
  { OCCUPANCY_DURATION_CARD_IDS: durationCardIds },
);
const durationInsightCardIds = evaluateExpression<string[]>(
  variable(
    durationInsightWidgets,
    "OCCUPANCY_DURATION_INSIGHT_CARD_IDS",
  ).initializer!.getText(durationInsightWidgets.ast),
);
const chartCardIds = evaluateExpression<string[]>(
  variable(live, "OCCUPANCY_CHART_CARD_IDS").initializer!.getText(live.ast),
);
const temporalLoiteringCardIds = [
  "occupancy_loitering_average_over_time",
  "occupancy_loitering_accumulated_session_time",
  "occupancy_loitering_percentiles_by_area",
  "occupancy_loitering_area_period_heatmap",
] as const;
const retiredSessionCountCardIds = [
  "occupancy_loitering_session_count_by_area",
  "occupancy_loitering_sessions_over_time",
  "occupancy_loitering_duration_distribution",
] as const;
const loiteringConsumerIds = evaluateExpression<string[]>(
  variable(loitering, "LOITERING_DATA_CONSUMER_CARD_IDS").initializer!.getText(
    loitering.ast,
  ),
  {
    OCCUPANCY_DURATION_AVERAGE_CARD_ID: "occupancy_duration_average",
    OCCUPANCY_LOITERING_CARD_IDS: [
      "occupancy_loitering_summary",
      "occupancy_loitering_minimum_by_area",
      "occupancy_loitering_maximum_by_area",
      "occupancy_loitering_range_by_area",
    ],
    OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS: temporalLoiteringCardIds,
  },
);

test("contadores de sessões aposentados não são consumidores de dados", () => {
  retiredSessionCountCardIds.forEach((id) => {
    assert.equal(loiteringConsumerIds.includes(id), false);
  });
  assert.equal(
    loiteringConsumerIds.includes("occupancy_duration_average_by_scenario"),
    false,
    "o tempo médio por cenário agora pertence ao hook de snapshots",
  );
  assert.equal(
    loiteringConsumerIds.includes("occupancy_duration_average"),
    true,
    "o resumo médio visível deve compartilhar a consulta de loitering summary",
  );
  assert.equal(
    aggregateDurationCardIds.includes("occupancy_duration_transitions"),
    false,
    "o estado atual pertence ao snapshot /occupancy, não ao agregado diário",
  );
});

test("exportação de duração resolve todos os cenários visíveis fora da viewport", () => {
  const scenarios = [
    { id: "scenario-a", name: "Entrada" },
    { id: "scenario-b", name: "Espera" },
    { id: "scenario-c", name: "Saída" },
  ];
  const visibleCardId = "occupancy_duration_timeline";
  const preferences = aggregateDurationCardIds.map((id) => ({
    id,
    scenarioIds: id === visibleCardId ? ["scenario-b", "scenario-a"] : [],
    scenarioSelectionMode: id === visibleCardId ? "custom" : "inherit",
    visible: id === visibleCardId,
  }));
  const preferenceByCardId = new Map(
    preferences.map((preference) => [preference.id, preference]),
  );
  const resolveWidgetScenarios = (
    options: RuntimeFixture[],
    selection: RuntimeFixture,
    inherited: RuntimeFixture[],
  ) => {
    const ids = selection.mode === "custom"
      ? selection.scenarioIds
      : inherited.map((scenario) => scenario.id);
    const requested = new Set(ids);
    return options.filter((scenario) => requested.has(scenario.id));
  };
  const scenarioSelectionFromPreference = (preference: RuntimeFixture) => ({
    mode: preference?.scenarioSelectionMode ?? "inherit",
    scenarioIds: preference?.scenarioIds ?? [],
    scenarioOrder: [],
  });

  const liveScenarioKey = evaluateExpression<() => string>(
    memoCallback(duration, "requestedScenarioKey"),
    {
      enabled: true,
      queryEnabled: true,
      inheritedScenarios: [scenarios[2]],
      OCCUPANCY_AGGREGATE_DURATION_CARD_IDS: aggregateDurationCardIds,
      preferenceByCardId,
      requestedCardIds: new Set<string>(),
      resolveWidgetScenarios,
      scenarioOptions: scenarios,
      scenarioSelectionFromPreference,
    },
  )();
  const reportScenarios = evaluateExpression<() => RuntimeFixture[]>(
    memoCallback(duration, "reportScenarios"),
    {
      inheritedScenarios: [scenarios[2]],
      OCCUPANCY_AGGREGATE_DURATION_CARD_IDS: aggregateDurationCardIds,
      preferenceByCardId,
      requestedCardIds: new Set<string>(),
      resolveWidgetScenarios,
      scenarioOptions: scenarios,
      scenarioSelectionFromPreference,
    },
  )();

  assert.equal(liveScenarioKey, "", "sem viewport não deve haver polling");
  assert.deepEqual(
    reportScenarios.map((scenario) => scenario.id),
    ["scenario-a", "scenario-b"],
    "o one-shot deve ignorar a demanda de viewport e preservar todos os cenários do widget visível",
  );
  assert.doesNotMatch(
    memoCallback(duration, "reportScenarios"),
    /requestedCardIds/,
  );
});

test("Análises e Relatórios sem widgets visíveis não planejam endpoint de dados", () => {
  const reportCardIds = [
    "occupancy_report_minute",
    "occupancy_report_hour",
    "occupancy_report_day",
    "occupancy_report_month",
    "occupancy_report_current",
    "occupancy_report_average",
    "occupancy_report_peak",
    "occupancy_report_minimum",
  ];
  const definitionIds = reportCardIds.filter((id) =>
    id.startsWith("occupancy_report_") &&
    ![
      "occupancy_report_current",
      "occupancy_report_average",
      "occupancy_report_peak",
      "occupancy_report_minimum",
    ].includes(id),
  );
  const hiddenPreferences = reportCardIds.map((id) => ({
    id,
    visible: false,
  }));

  assert.deepEqual(
    query.buildOccupancyReportResourcePlan({
      definitionIds,
      hasScenario: true,
      metricVisibility: { average: true, minimum: true, peak: true },
      preferences: hiddenPreferences,
      // Mesmo uma demanda antiga não pode superar visible=false.
      requestedCardIds: new Set(reportCardIds),
    }),
    {
      comparisonDefinitionIds: "",
      currentSnapshot: false,
      definitionIds: "",
    },
  );

  const durationSelection = memoCallback(duration, "requestedScenarioKey");
  const durationSelectionResult = evaluateExpression<() => string>(
    durationSelection,
    {
      enabled: true,
      queryEnabled: true,
      inheritedScenarios: [{ id: "scenario-a", name: "Entrada" }],
      OCCUPANCY_AGGREGATE_DURATION_CARD_IDS: aggregateDurationCardIds,
      preferenceByCardId: new Map(
        aggregateDurationCardIds.map((id) => [id, { id, visible: false }]),
      ),
      requestedCardIds: new Set(aggregateDurationCardIds),
      resolveWidgetScenarios: unexpectedScenarioResolution,
      scenarioOptions: [{ id: "scenario-a", name: "Entrada" }],
      scenarioSelectionFromPreference: unexpectedScenarioResolution,
    },
  )();
  assert.equal(durationSelectionResult, "");

  const insightRequestKey = evaluateExpression<() => string>(
    memoCallback(durationInsights, "requestKey"),
    {
      inherited: [{ id: "scenario-a", name: "Entrada" }],
      OCCUPANCY_DURATION_INSIGHT_CARD_IDS: durationInsightCardIds,
      options: [{ id: "scenario-a", name: "Entrada" }],
      preferenceById: new Map(
        durationInsightCardIds.map((id) => [id, { id, visible: false }]),
      ),
      queryEnabled: true,
      requestedCardIds: new Set(durationInsightCardIds),
      resolveWidgetScenarios: unexpectedScenarioResolution,
      selectionFromPreference: unexpectedScenarioResolution,
    },
  )();
  assert.equal(insightRequestKey, "[]");

  const loiteringScenariosByCard = evaluateExpression<
    () => Map<string, RuntimeFixture[]>
  >(
    memoCallback(loitering, "requestedScenariosByCard"),
    {
      inheritedScenarios: [{ id: "scenario-a" }],
      LOITERING_DATA_CONSUMER_CARD_IDS: loiteringConsumerIds,
      preferenceById: new Map(
        loiteringConsumerIds.map((id) => [id, { id, visible: false }]),
      ),
      requestedCardIds: new Set(loiteringConsumerIds),
      resolveWidgetScenarios: unexpectedScenarioResolution,
      scopedScenarios: [{ areas: [{}], id: "scenario-a" }],
      selectionFromPreference: unexpectedScenarioResolution,
    },
  )();
  assert.deepEqual(
    Array.from(loiteringScenariosByCard.entries()),
    loiteringConsumerIds.map((id) => [id, []]),
  );
  assert.match(
    loitering.source,
    /const summaryQueryEnabled\s*=\s*[\s\S]*?summaryRequestedScenarios\.some/,
    "sem o card médio visível, permanência não pode ativar o summary",
  );
  assert.match(
    loitering.source,
    /const sessionQueryEnabled\s*=\s*[\s\S]*?sessionRequestedScenarios\.some/,
    "sem card individual ou temporal visível, permanência não pode ativar sessions",
  );
});

test("preferências ausentes ou parciais não ativam hooks compartilhados", () => {
  const scenario = { areas: [{}], id: "scenario-a", name: "Entrada" };
  const resolveSelected = (scenarios: RuntimeFixture[]) => scenarios;

  assert.equal(
    evaluateExpression<() => string>(
      memoCallback(duration, "requestedScenarioKey"),
      {
        enabled: true,
        queryEnabled: true,
        inheritedScenarios: [scenario],
        OCCUPANCY_AGGREGATE_DURATION_CARD_IDS: aggregateDurationCardIds,
        preferenceByCardId: new Map(),
        requestedCardIds: new Set(aggregateDurationCardIds),
        resolveWidgetScenarios: unexpectedScenarioResolution,
        scenarioOptions: [scenario],
        scenarioSelectionFromPreference: unexpectedScenarioResolution,
      },
    )(),
    "",
    "duração não pode interpretar preferência ausente como visível",
  );

  assert.equal(
    evaluateExpression<() => string>(
      memoCallback(durationInsights, "requestKey"),
      {
        inherited: [scenario],
        OCCUPANCY_DURATION_INSIGHT_CARD_IDS: durationInsightCardIds,
        options: [scenario],
        preferenceById: new Map(),
        queryEnabled: true,
        requestedCardIds: new Set(durationInsightCardIds),
        resolveWidgetScenarios: unexpectedScenarioResolution,
        selectionFromPreference: unexpectedScenarioResolution,
      },
    )(),
    "[]",
    "insights de duração não podem interpretar preferência ausente como visível",
  );

  assert.deepEqual(
    Array.from(
      evaluateExpression<() => Map<string, RuntimeFixture[]>>(
        memoCallback(loitering, "requestedScenariosByCard"),
        {
          inheritedScenarios: [scenario],
          LOITERING_DATA_CONSUMER_CARD_IDS: loiteringConsumerIds,
          preferenceById: new Map(),
          requestedCardIds: new Set(loiteringConsumerIds),
          resolveWidgetScenarios: unexpectedScenarioResolution,
          scopedScenarios: [scenario],
          selectionFromPreference: unexpectedScenarioResolution,
        },
      )().entries(),
    ),
    loiteringConsumerIds.map((id) => [id, []]),
    "permanência não pode interpretar preferência ausente como visível",
  );

  const visibleDurationCardId = aggregateDurationCardIds[0];
  let durationResolutionCount = 0;
  assert.equal(
    evaluateExpression<() => string>(
      memoCallback(duration, "requestedScenarioKey"),
      {
        enabled: true,
        queryEnabled: true,
        inheritedScenarios: [scenario],
        OCCUPANCY_AGGREGATE_DURATION_CARD_IDS: aggregateDurationCardIds,
        preferenceByCardId: new Map([
          [visibleDurationCardId, { id: visibleDurationCardId, visible: true }],
        ]),
        requestedCardIds: new Set(aggregateDurationCardIds),
        resolveWidgetScenarios: (...args: RuntimeFixture[]) => {
          durationResolutionCount += 1;
          return resolveSelected(args[0]);
        },
        scenarioOptions: [scenario],
        scenarioSelectionFromPreference: () => ({ mode: "inherit" }),
      },
    )(),
    "scenario-a",
  );
  assert.equal(
    durationResolutionCount,
    1,
    "somente a preferência explicitamente visível deve ser resolvida",
  );

  const visibleLoiteringCardId = loiteringConsumerIds[0];
  let loiteringResolutionCount = 0;
  const scenariosByCard = evaluateExpression<
    () => Map<string, RuntimeFixture[]>
  >(
    memoCallback(loitering, "requestedScenariosByCard"),
    {
      inheritedScenarios: [scenario],
      LOITERING_DATA_CONSUMER_CARD_IDS: loiteringConsumerIds,
      preferenceById: new Map([
        [visibleLoiteringCardId, { id: visibleLoiteringCardId, visible: true }],
      ]),
      requestedCardIds: new Set(loiteringConsumerIds),
      resolveWidgetScenarios: (scenarios: RuntimeFixture[]) => {
        loiteringResolutionCount += 1;
        return scenarios;
      },
      scopedScenarios: [scenario],
      selectionFromPreference: () => ({ mode: "inherit" }),
    },
  )();
  assert.deepEqual(
    Array.from(scenariosByCard.entries()),
    loiteringConsumerIds.map((id) => [
      id,
      id === visibleLoiteringCardId ? [scenario] : [],
    ]),
  );
  assert.equal(
    loiteringResolutionCount,
    1,
    "a fonte compartilhada só deve considerar o consumidor explicitamente visível",
  );
});

test("widget customizado oculto não ativa snapshot, agregado nem comparativo", () => {
  const historical = extractFunctions(
    reports,
    [
      "buildOccupancyCustomWidgetResourcePlan",
      "occupancyCustomTrendSourceId",
    ],
  );
  const widgets = [
    { id: "current", kind: "metric", metric: "current" },
    { id: "average", kind: "metric", metric: "average" },
    {
      granularity: "hour",
      id: "trend",
      kind: "trend",
      series: { average: true, minimum: true, peak: true },
    },
  ];
  const cardIds = widgets.map((widget) => `occupancy_custom_${widget.id}`);
  const hidden = cardIds.map((id) => ({ id, visible: false }));
  const emptyPlan = {
    comparisonDefinitionIds: "",
    currentSnapshot: false,
    definitionIds: "",
  };

  assert.deepEqual(
    historical.buildOccupancyCustomWidgetResourcePlan(
      widgets,
      hidden,
      new Set(cardIds),
    ),
    emptyPlan,
    "visible=false deve vencer até uma demanda de viewport obsoleta",
  );
  assert.deepEqual(
    historical.buildOccupancyCustomWidgetResourcePlan(
      widgets,
      cardIds.map((id) => ({ id, visible: true })),
      new Set(),
    ),
    emptyPlan,
    "fora da demanda, o widget visível também não antecipa sua fonte",
  );

  const livePlanHelpers = extractFunctions(
    live,
    ["buildOccupancyLiveDataPlan"],
    {
      OCCUPANCY_CHART_CARD_IDS: chartCardIds,
      occupancyLiveHistoryRequired: query.occupancyLiveHistoryRequired,
    },
  );
  const hiddenLivePlan = livePlanHelpers.buildOccupancyLiveDataPlan(
    hidden,
    widgets,
    new Set(cardIds),
  );
  assert.deepEqual(hiddenLivePlan, {
    alerts: false,
    granularities: [],
    history: false,
    key: JSON.stringify([false, false, []]),
  });
});

test("ocultar o último consumidor aborta o request core já iniciado", () => {
  const plan = extractFunctions(live, ["buildOccupancyLiveDataPlan"], {
    OCCUPANCY_CHART_CARD_IDS: chartCardIds,
    occupancyLiveHistoryRequired: query.occupancyLiveHistoryRequired,
  }).buildOccupancyLiveDataPlan;
  const preference = { id: "occupancy_current_total", visible: true };
  const visiblePlan = plan(
    [preference],
    [],
    new Set([preference.id]),
  );
  const hiddenPlan = plan(
    [{ ...preference, visible: false }],
    [],
    new Set([preference.id]),
  );
  assert.notEqual(visiblePlan.key, hiddenPlan.key);
  assert.equal(hiddenPlan.history, false);

  const effect = findEffect(
    live,
    "secondaryRequestRef.current?.abort()",
    "occupancyDataPlan.key",
  );
  const liveController = new AbortController();
  const secondaryController = new AbortController();
  evaluateExpression<() => void>(effect.callback.getText(live.ast), {
    liveRequestRef: { current: liveController },
    secondaryRequestRef: { current: secondaryController },
  })();

  assert.equal(liveController.signal.aborted, true);
  assert.equal(secondaryController.signal.aborted, true);
});

test("ocultar o último consumidor aborta duração e permanência em voo", () => {
  const durationEffect = findEffect(
    duration,
    "A consulta de duração foi cancelada porque a visão mudou.",
    "requestedScenarioKey",
  );
  assert.match(durationEffect.dependencies.getText(duration.ast), /requestedScenarios/);
  assertCleanupAborts(duration, durationEffect, {
    document: { removeEventListener: () => undefined },
    progressTimer: undefined,
    refreshMode: "poll",
    resume: () => undefined,
    timer: undefined,
    window: {
      clearTimeout: () => undefined,
      removeEventListener: () => undefined,
    },
  });

  const insightEffect = findEffect(
    durationInsights,
    "abortRequest(controller)",
    "requestedScenarios",
  );
  assertCleanupAborts(durationInsights, insightEffect, {
    clearTimeout: () => undefined,
    document: { removeEventListener: () => undefined },
    refreshMode: "poll",
    resume: () => undefined,
    timer: undefined,
    window: { removeEventListener: () => undefined },
  });

  const loiteringSummaryEffect = findEffect(
    loitering,
    "abortRequest(controller)",
    "summaryQueryEnabled",
  );
  assertCleanupAborts(loitering, loiteringSummaryEffect, {
    clearScheduledLoad: () => undefined,
    document: { removeEventListener: () => undefined },
    handleAvailabilityChange: () => undefined,
    window: { removeEventListener: () => undefined },
  });

  const loiteringSessionsEffect = findEffect(
    loitering,
    "abortRequest(controller)",
    "sessionQueryEnabled",
  );
  assertCleanupAborts(loitering, loiteringSessionsEffect, {
    clearScheduledLoad: () => undefined,
    document: { removeEventListener: () => undefined },
    handleAvailabilityChange: () => undefined,
    window: { removeEventListener: () => undefined },
  });
});

function assertCleanupAborts(
  parsed: ParsedSource,
  effect: EffectCall,
  bindings: Record<string, RuntimeFixture>,
) {
  const controller = new AbortController();
  const cleanup = effectCleanup(parsed, effect);
  evaluateExpression<() => void>(cleanup.getText(parsed.ast), {
    abortRequest: (request: AbortController) => request.abort(),
    controller,
    disposed: false,
    ...bindings,
  })();
  assert.equal(controller.signal.aborted, true);
}

function unexpectedScenarioResolution(): never {
  throw new Error("widget oculto tentou resolver cenários para consultar dados");
}

type ParsedSource = {
  ast: ts.SourceFile;
  source: string;
};

type EffectCall = {
  callback: ts.ArrowFunction | ts.FunctionExpression;
  dependencies: ts.Expression;
};

function parseSource(relativePath: string): ParsedSource {
  const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
  return {
    ast: ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
    source,
  };
}

function walk(root: ts.Node) {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

function variable(parsed: ParsedSource, name: string) {
  const declaration = walk(parsed.ast).find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name,
  );
  assert.ok(declaration?.initializer, `variável ausente: ${name}`);
  return declaration as ts.VariableDeclaration & {
    initializer: ts.Expression;
  };
}

function memoCallback(parsed: ParsedSource, name: string) {
  const initializer = variable(parsed, name).initializer;
  assert.ok(ts.isCallExpression(initializer), `${name} não usa useMemo`);
  const callback = initializer.arguments[0];
  assert.ok(callback, `callback de ${name} ausente`);
  return callback.getText(parsed.ast);
}

function extractFunctions(
  parsed: ParsedSource,
  names: string[],
  bindings: Record<string, RuntimeFixture> = {},
) {
  const declarations = parsed.ast.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      Boolean(statement.name && names.includes(statement.name.text)),
  );
  assert.equal(
    declarations.length,
    names.length,
    `helpers ausentes: ${names.join(", ")}`,
  );
  return evaluateCode<Record<string, RuntimeFixture>>(
    `${declarations.map((item) => item.getText(parsed.ast)).join("\n")}
return { ${names.join(", ")} };`,
    bindings,
  );
}

function findEffect(
  parsed: ParsedSource,
  callbackMarker: string,
  dependencyMarker: string,
): EffectCall {
  const candidate = walk(parsed.ast).find((node): node is ts.CallExpression => {
    if (!ts.isCallExpression(node)) return false;
    if (node.expression.getText(parsed.ast) !== "React.useEffect") return false;
    const [callback, dependencies] = node.arguments;
    return Boolean(
      callback &&
        dependencies &&
        callback.getText(parsed.ast).includes(callbackMarker) &&
        dependencies.getText(parsed.ast).includes(dependencyMarker),
    );
  });
  assert.ok(candidate, `useEffect ausente: ${callbackMarker}`);
  const [callback, dependencies] = candidate.arguments;
  assert.ok(
    (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
      dependencies,
  );
  return { callback, dependencies };
}

function effectCleanup(parsed: ParsedSource, effect: EffectCall) {
  assert.ok(ts.isBlock(effect.callback.body), "efeito sem bloco");
  const cleanup = [...effect.callback.body.statements]
    .reverse()
    .find(
      (statement): statement is ts.ReturnStatement =>
        ts.isReturnStatement(statement) &&
        Boolean(
          statement.expression &&
            (ts.isArrowFunction(statement.expression) ||
              ts.isFunctionExpression(statement.expression)),
        ),
    )?.expression;
  assert.ok(cleanup, "cleanup do efeito ausente");
  return cleanup;
}

function evaluateExpression<T>(
  expression: string,
  bindings: Record<string, RuntimeFixture> = {},
) {
  return evaluateCode<T>(`return (${expression});`, bindings);
}

function evaluateCode<T>(
  code: string,
  bindings: Record<string, RuntimeFixture>,
) {
  const javascript = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return new Function(...Object.keys(bindings), javascript)(
    ...Object.values(bindings),
  ) as T;
}
