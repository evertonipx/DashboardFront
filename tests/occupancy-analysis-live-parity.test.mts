import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { createModuleLoader } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const load = createModuleLoader(projectRoot);
const dashboardSource = source("components/app/occupancy-reports-dashboard.tsx");
const dashboardAst = ts.createSourceFile(
  "occupancy-reports-dashboard.tsx",
  dashboardSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const durationSource = source("components/app/occupancy-duration-widgets.tsx");
const durationAst = ts.createSourceFile(
  "occupancy-duration-widgets.tsx",
  durationSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const comparisonSelection = load<
  typeof import("../lib/occupancy-comparison-selection.ts")
>("lib/occupancy-comparison-selection.ts");
const viewPreferences = load<typeof import("../lib/view-preferences.ts")>(
  "lib/view-preferences.ts",
);

const comparisonCardIds = [
  ...comparisonSelection.OCCUPANCY_COMPARISON_REPORT_CARD_IDS,
];
const durationCardIds = stringArrayConstant(
  durationAst,
  "OCCUPANCY_DURATION_CARD_IDS",
);
const inheritedCardIds = Array.from(
  new Set([...comparisonCardIds, ...durationCardIds]),
);
const additionalHistoricalLiveCardIds = [
  "occupancy_active_areas",
  "occupancy_scenario_detail",
] as const;
const migratedHistoricalCardIds = [
  ...additionalHistoricalLiveCardIds,
  ...inheritedCardIds,
];

const historicalBaseCardIds = [
  "occupancy_report_current",
  "occupancy_report_average",
  "occupancy_report_minimum",
  "occupancy_report_peak",
  "occupancy_report_minute",
  "occupancy_report_hour",
  "occupancy_report_day",
] as const;

const liveBaseEquivalentIds = [
  "occupancy_current_total",
  "occupancy_average",
  "occupancy_minimum",
  "occupancy_peak",
  "occupancy_chart_minute",
  "occupancy_chart_hour",
  "occupancy_chart_day",
  "occupancy_chart_week",
  "occupancy_chart_month",
] as const;

const liveAlertCardIds = [
  "occupancy_alerts",
  "occupancy_alert_list",
] as const;

test("An\u00e1lises incorpora comparativos e dura\u00e7\u00e3o somente em modo hist\u00f3rico manual", () => {
  const comparison = hookContract("useOccupancyComparisonCards");
  const duration = hookContract("useOccupancyDurationCards");

  assert.equal(propertyText(comparison.options, "refreshMode"), '"manual"');
  assert.equal(
    propertyText(comparison.options, "period"),
    "occupancyAnalysisComparisonPeriod",
  );
  assert.equal(propertyText(duration.options, "refreshMode"), '"manual"');
  assert.equal(
    propertyText(duration.options, "period"),
    "occupancyDurationAnalysisPeriod",
  );

  for (const { hookName, options } of [comparison, duration]) {
    const enabled = propertyText(options, "enabled");
    assert.match(enabled, /analysis/,
      `${hookName} deve permanecer desligado fora do An\u00e1lises`);
    assert.match(enabled, /reportRequested/,
      `${hookName} n\u00e3o pode consultar antes da a\u00e7\u00e3o do usu\u00e1rio`);
    assert.match(enabled, /layoutPreferencesReady/,
      `${hookName} precisa aguardar a hidrata\u00e7\u00e3o das prefer\u00eancias`);
    assert.match(enabled, /companyTimeZoneCertified/,
      `${hookName} precisa usar somente o fuso certificado`);
    assert.equal(
      propertyText(options, "requestedCardIds"),
      "requestedHistoricalCardIds",
      `${hookName} deve consultar somente cards vis\u00edveis e materializados`,
    );
  }

  assertCardsAreAnalysisOnly(comparison.cardsExpression);
  assertCardsAreAnalysisOnly(duration.cardsExpression);
});

test("cat\u00e1logo herdado do Ao Vivo tem IDs \u00fanicos e n\u00e3o duplica equivalentes base", () => {
  assert.equal(
    inheritedCardIds.length,
    comparisonCardIds.length + durationCardIds.length,
    "comparativos e dura\u00e7\u00e3o n\u00e3o podem publicar o mesmo card duas vezes",
  );

  const layout = variableInitializer(
    dashboardAst,
    "occupancyReportLayoutCards",
  );
  assert.ok(ts.isArrayLiteralExpression(layout));
  const layoutText = layout.getText(dashboardAst);
  const materializedCards = evaluateExpression<Array<{ id: string }>>(
    layoutText,
    {
      analysis: true,
      chartsPending: false,
      COMPACT_METRIC_LAYOUT_DEFAULTS: {},
      customMetricCards: [],
      customTrendCards: [],
      definitions: [
        { id: "occupancy_report_minute", label: "Minuto" },
        { id: "occupancy_report_hour", label: "Hora" },
        { id: "occupancy_report_day", label: "Dia" },
      ],
      metricCards: [
        { id: "occupancy_report_current", label: "Atual" },
        { id: "occupancy_active_areas", label: "\u00c1reas" },
        { id: "occupancy_report_average", label: "M\u00e9dia" },
        { id: "occupancy_report_minimum", label: "M\u00ednimo" },
        { id: "occupancy_report_peak", label: "M\u00e1ximo" },
      ],
      occupancyAnalysisComparison: {
        cards: comparisonCardIds.map((id) => ({ id })),
      },
      occupancyAnalysisDuration: {
        cards: durationCardIds.map((id) => ({ id })),
      },
      occupancyDurationInsights: { cards: [] },
      occupancyLoitering: { cards: [] },
      selectedScope: { scenario: { id: "scenario-a" } },
    },
  );
  const materializedIds = materializedCards.map(({ id }) => id);
  assert.equal(
    new Set(materializedIds).size,
    materializedIds.length,
    `CardLayout recebeu IDs duplicados: ${duplicateValues(materializedIds).join(", ")}`,
  );
  for (const id of inheritedCardIds) {
    assert.equal(
      materializedIds.filter((candidate) => candidate === id).length,
      1,
      `${id} deve aparecer exatamente uma vez no An\u00e1lises`,
    );
  }
  for (const id of additionalHistoricalLiveCardIds) {
    assert.equal(
      materializedIds.filter((candidate) => candidate === id).length,
      1,
      `${id} deve aparecer exatamente uma vez no An\u00e1lises`,
    );
  }

  for (const id of historicalBaseCardIds) {
    assert.match(
      dashboardSource,
      new RegExp(`(?:id:\\s*|===\\s*)["']${escapeRegExp(id)}["']`),
      `o equivalente hist\u00f3rico ${id} deve permanecer no An\u00e1lises`,
    );
  }
  for (const id of liveBaseEquivalentIds) {
    assert.doesNotMatch(
      layoutText,
      new RegExp(`["']${escapeRegExp(id)}["']`),
      `${id} duplicaria um card occupancy_report_* j\u00e1 existente`,
    );
  }
  for (const id of liveAlertCardIds) {
    assert.doesNotMatch(
      layoutText,
      new RegExp(`["']${escapeRegExp(id)}["']`),
      `${id} \u00e9 um alerta exclusivamente ao vivo e n\u00e3o pertence ao An\u00e1lises`,
    );
  }

  const comparison = hookContract("useOccupancyComparisonCards");
  const duration = hookContract("useOccupancyDurationCards");
  assert.equal(
    analysisOnlySpreadCount(layout, comparison.cardsExpression),
    1,
    "comparativos devem ser inseridos exatamente uma vez",
  );
  assert.equal(
    analysisOnlySpreadCount(layout, duration.cardsExpression),
    1,
    "dura\u00e7\u00e3o deve ser inserida exatamente uma vez",
  );
});

test("vis\u00e3o persistida recebe os novos cards ocultos sem perder prefer\u00eancias", () => {
  const existing = viewPreferences.normalizeCardPreferences(
    "occupancy",
    [
      {
        heightLevel: 5,
        id: "occupancy_report_hour",
        scenarioIds: ["scenario-b", "scenario-a"],
        scenarioOrder: ["scenario-a", "scenario-b"],
        scenarioSelectionMode: "custom",
        title: "Hora executiva",
        visible: true,
        widthLevel: 6,
      },
    ],
    ["occupancy_report_hour", ...migratedHistoricalCardIds],
  );
  const existingById = new Map(existing.map((preference) => [
    preference.id,
    preference,
  ]));

  assert.deepEqual(
    existing[0],
    {
      chartType: undefined,
      color: undefined,
      height: viewPreferences.cardLayoutLevelToCardHeight(5),
      heightLevel: 5,
      id: "occupancy_report_hour",
      scenarioIds: ["scenario-b", "scenario-a"],
      scenarioOrder: ["scenario-a", "scenario-b"],
      scenarioSelectionMode: "custom",
      size: viewPreferences.cardLayoutLevelToCardSize(6),
      title: "Hora executiva",
      visible: true,
      widthLevel: 6,
      zoom: undefined,
    },
    "a migra\u00e7\u00e3o n\u00e3o pode reordenar nem reconfigurar cards existentes",
  );
  for (const id of migratedHistoricalCardIds) {
    assert.equal(
      existingById.get(id)?.visible,
      false,
      `${id} deve nascer oculto numa vis\u00e3o j\u00e1 persistida`,
    );
  }

  const explicitlyEnabled = viewPreferences.normalizeCardPreferences(
    "occupancy",
    [
      { id: "occupancy_report_hour", visible: true },
      { id: inheritedCardIds[0], visible: true },
    ],
    ["occupancy_report_hour", ...migratedHistoricalCardIds],
  );
  assert.equal(
    explicitlyEnabled.find(({ id }) => id === inheritedCardIds[0])?.visible,
    true,
    "uma escolha expl\u00edcita do usu\u00e1rio deve prevalecer sobre a migra\u00e7\u00e3o",
  );

  for (const empty of [undefined, []]) {
    const fresh = viewPreferences.normalizeCardPreferences(
      "occupancy",
      empty,
      ["occupancy_report_hour", ...migratedHistoricalCardIds],
    );
    const freshById = new Map(fresh.map((preference) => [
      preference.id,
      preference,
    ]));
    for (const id of migratedHistoricalCardIds) {
      assert.equal(
        freshById.get(id)?.visible,
        true,
        `${id} deve continuar dispon\u00edvel por padr\u00e3o numa vis\u00e3o nova`,
      );
    }
  }
});

test("modo An\u00e1lises n\u00e3o herda intervalos nem gatilhos autom\u00e1ticos do Ao Vivo", () => {
  const comparison = hookContract("useOccupancyComparisonCards");
  const duration = hookContract("useOccupancyDurationCards");

  for (const { hookName, options } of [comparison, duration]) {
    const text = options.getText(dashboardAst);
    assert.doesNotMatch(text, /snapshotRefreshMs|maximumTrendRefreshMs/,
      `${hookName} hist\u00f3rico n\u00e3o deve receber cad\u00eancia do snapshot ao vivo`);
    assert.doesNotMatch(text, /liveRefreshMs|OCCUPANCY_REFRESH_MS/,
      `${hookName} hist\u00f3rico n\u00e3o deve herdar o pulso de cinco segundos`);
    assert.equal(propertyText(options, "refreshMode"), '"manual"');
  }

  const comparisonPeriod = variableInitializer(
    dashboardAst,
    "occupancyAnalysisComparisonPeriod",
  ).getText(dashboardAst);
  const durationPeriod = variableInitializer(
    dashboardAst,
    "occupancyDurationAnalysisPeriod",
  ).getText(dashboardAst);
  for (const [name, period] of [
    ["comparativos", comparisonPeriod],
    ["dura\u00e7\u00e3o", durationPeriod],
  ] as const) {
    assert.match(period, /analysis/,
      `o per\u00edodo de ${name} deve existir somente no An\u00e1lises`);
    assert.match(period, /reportRange/,
      `o per\u00edodo de ${name} deve nascer do intervalo aplicado`);
  }
});

function source(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function stringArrayConstant(ast: ts.SourceFile, name: string): string[] {
  const initializer = unwrapExpression(variableInitializer(ast, name));
  assert.ok(ts.isArrayLiteralExpression(initializer), `${name} deve ser um array`);
  return initializer.elements.map((element) => {
    assert.ok(
      ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element),
      `${name} deve conter apenas IDs literais`,
    );
    return element.text;
  });
}

function variableInitializer(ast: ts.SourceFile, name: string): ts.Expression {
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      assert.equal(initializer, undefined, `vari\u00e1vel duplicada: ${name}`);
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (initializer) return initializer;
  assert.fail(`vari\u00e1vel ausente: ${name}`);
}

function hookContract(hookName: string) {
  let call: ts.CallExpression | undefined;
  let declaration: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(dashboardAst) === hookName
    ) {
      call = node;
      declaration = findParentVariableDeclaration(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(dashboardAst);
  assert.ok(call, `chamada ausente: ${hookName}`);
  assert.ok(declaration, `${hookName} deve ser atribu\u00eddo a uma vari\u00e1vel`);
  const options = call.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(options), `${hookName} deve receber op\u00e7\u00f5es`);
  let cardsExpression = "";
  if (ts.isIdentifier(declaration.name)) {
    cardsExpression = `${declaration.name.text}.cards`;
  } else {
    assert.ok(ts.isObjectBindingPattern(declaration.name),
      `${hookName} deve nomear explicitamente os cards retornados`);
    const cardsBinding = declaration.name.elements.find(
      (element) =>
        (element.propertyName?.getText(dashboardAst) ?? element.name.getText(dashboardAst)) ===
        "cards",
    );
    assert.ok(cardsBinding, `${hookName} deve consumir a propriedade cards`);
    assert.ok(ts.isIdentifier(cardsBinding.name));
    cardsExpression = cardsBinding.name.text;
  }
  return {
    cardsExpression,
    hookName,
    options,
  };
}

function findParentVariableDeclaration(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isVariableDeclaration(current)) current = current.parent;
  return current && ts.isVariableDeclaration(current) ? current : undefined;
}

function propertyText(object: ts.ObjectLiteralExpression, name: string) {
  const property = object.properties.find((candidate) => {
    if (!ts.isPropertyAssignment(candidate) && !ts.isShorthandPropertyAssignment(candidate)) {
      return false;
    }
    return candidate.name.getText(dashboardAst) === name;
  });
  assert.ok(property, `propriedade ausente: ${name}`);
  if (!property) throw new Error(`propriedade ausente: ${name}`);
  if (ts.isPropertyAssignment(property)) {
    return property.initializer.getText(dashboardAst);
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name.getText(dashboardAst);
  }
  throw new TypeError(`propriedade incompatível: ${name}`);
}

function assertCardsAreAnalysisOnly(cardsExpression: string) {
  const layout = variableInitializer(dashboardAst, "occupancyReportLayoutCards");
  assert.ok(ts.isArrayLiteralExpression(layout));
  assert.equal(
    analysisOnlySpreadCount(layout, cardsExpression),
    1,
    `${cardsExpression} deve entrar exatamente uma vez e somente quando analysis=true`,
  );
  const unconditional = layout.elements.filter(
    (element) =>
      ts.isSpreadElement(element) &&
      element.expression.getText(dashboardAst) === cardsExpression,
  );
  assert.equal(unconditional.length, 0, `${cardsExpression} n\u00e3o pertence a Relat\u00f3rios`);
}

function analysisOnlySpreadCount(
  layout: ts.ArrayLiteralExpression,
  cardsExpression: string,
) {
  return layout.elements.filter((element) => {
    if (!ts.isSpreadElement(element)) return false;
    const expression = unwrapParentheses(element.expression);
    if (!ts.isConditionalExpression(expression)) return false;
    if (!/\banalysis\b/.test(expression.condition.getText(dashboardAst))) return false;
    return (
      expression.whenTrue.getText(dashboardAst) === cardsExpression &&
      isEmptyArray(expression.whenFalse)
    ) || (
      expression.whenFalse.getText(dashboardAst) === cardsExpression &&
      isEmptyArray(expression.whenTrue)
    );
  }).length;
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = unwrapParentheses(expression);
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = unwrapParentheses(current.expression);
  }
  return current;
}

function isEmptyArray(expression: ts.Expression) {
  const unwrapped = unwrapParentheses(expression);
  return ts.isArrayLiteralExpression(unwrapped) && unwrapped.elements.length === 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

function evaluateExpression<T>(
  expression: string,
  bindings: Record<string, unknown>,
): T {
  const compiled = ts.transpileModule(
    `exports.result = (${expression});`,
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports: { result?: T } = {};
  new Function(
    "require",
    "exports",
    ...Object.keys(bindings),
    compiled,
  )(
    (specifier: string) => require(specifier),
    exports,
    ...Object.values(bindings),
  );
  assert.ok(exports.result);
  return exports.result;
}
