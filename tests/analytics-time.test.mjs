import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const aggregateTime = loadTypeScriptModule("lib/aggregate-time.ts");
const hourlyAxis = loadTypeScriptModule("lib/hourly-axis.ts");
const occupancySeries = loadTypeScriptModule(
  "lib/hourly-occupancy-series.ts",
);
const periodAnalysisModel = loadTypeScriptModule(
  "lib/period-analysis-model.ts",
);
const periodAnalysisWidgets = loadTypeScriptModule(
  "lib/period-analysis-widgets.ts",
);
const scenarioAnalytics = loadTypeScriptModule("lib/scenario-analytics.ts");
const viewPreferences = loadTypeScriptModule("lib/view-preferences.ts");

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

test("bucket RFC3339 com offset permanece um instante absoluto", () => {
  const bucket = aggregateTime.parseAggregateBucket(
    "2026-07-22T13:15:30Z",
    "hour",
  );

  assert.equal(bucket?.toISOString(), "2026-07-22T13:15:30.000Z");
});

test("consulta horária envia os limites locais como instantes UTC", () => {
  const localStart = new Date(2026, 6, 22, 0, 0, 0, 0);

  assert.equal(
    aggregateTime.aggregateQueryIso(localStart, "hour"),
    localStart.toISOString(),
  );
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

function emptyHours() {
  return Array.from({ length: 24 }, () => 0);
}

function nextDay(day) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
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

function analysisData({
  dayRows = [],
  hourRows = [],
  minuteRows = [],
  monthRows = [],
} = {}) {
  return {
    baseline: {},
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
