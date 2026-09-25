// Dynamic fixtures intentionally cross injected-module boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const modules = new Map<string, { exports: RuntimeFixture }>();
const source = readFileSync(
  resolve("components/app/occupancy-comparison-widgets.tsx"),
  "utf8",
);
const widgets = load("components/app/occupancy-comparison-widgets.tsx");
const settings = load("lib/occupancy-widget-settings.ts");
const timeZone = "America/Sao_Paulo";

test("período manual preserva exatamente [from,to) e o instante de fechamento", () => {
  const period = {
    contextLabel: "Agosto de 2026",
    from: new Date("2026-08-01T03:00:00.000Z"),
    referenceAt: new Date("2026-09-01T02:59:59.999Z"),
    to: new Date("2026-09-01T03:00:00.000Z"),
  };
  const key = widgets.occupancyComparisonHistoricalPeriodKey(period);
  const restored = widgets.occupancyComparisonHistoricalPeriodFromKey(key);

  assert.equal(restored.from.toISOString(), period.from.toISOString());
  assert.equal(restored.to.toISOString(), period.to.toISOString());
  assert.equal(
    restored.referenceAt.toISOString(),
    period.referenceAt.toISOString(),
  );
  assert.equal(restored.contextLabel, period.contextLabel);
  assert.throws(
    () =>
      widgets.occupancyComparisonHistoricalPeriodKey({
        ...period,
        referenceAt: period.to,
      }),
    /deve pertencer ao período histórico/,
  );
});

test("hora e heatmap ficam no período; máximos usam janelas civis fechadas", () => {
  const period = {
    contextLabel: "15 de setembro de 2026",
    from: new Date("2026-09-15T03:00:00.000Z"),
    referenceAt: new Date("2026-09-16T02:59:59.999Z"),
    to: new Date("2026-09-16T03:00:00.000Z"),
  };
  const ranges = widgets.buildOccupancyHistoricalComparisonRanges({
    dayCount: 30,
    needsAnnualMaximum: true,
    needsHourlyAggregate: true,
    needsHourlyHeatmap: true,
    needsMaximumTrend: true,
    needsScenarioHeatmap: true,
    period,
    scenarioHeatmapGranularity: "day",
    timeZone,
  });
  for (const range of [
    ranges.hourly,
    ranges.scenarioHeatmap,
    ranges.maximumTrend.hourly,
  ]) {
    if (!range) continue;
    assert.ok(range.from.getTime() >= period.from.getTime());
    assert.ok(range.to.getTime() <= period.to.getTime());
  }
  assert.deepEqual(
    ranges.maximumTrend.monthly.buckets.map(civilMonthKey),
    civilMonthKeys("2025-09", 12),
  );
  assert.deepEqual(
    ranges.maximumTrend.annual.buckets.map(civilYearKey),
    ["2022", "2023", "2024", "2025"],
  );
  assert.equal(
    ranges.maximumTrend.monthlySource.buckets.at(-1) &&
      civilMonthKey(ranges.maximumTrend.monthlySource.buckets.at(-1)),
    "2026-08",
  );
  assert.ok(
    ranges.maximumTrend.monthlySource.buckets.every(
      (bucket: Date) =>
        occupancyCivilBucketEndInstant(bucket, "month", timeZone) <= period.to,
    ),
  );

  const monthOnly = widgets.buildOccupancyHistoricalComparisonRanges({
    dayCount: 7,
    needsAnnualMaximum: false,
    needsHourlyAggregate: false,
    needsHourlyHeatmap: false,
    needsMaximumTrend: true,
    needsScenarioHeatmap: false,
    period,
    scenarioHeatmapGranularity: "hour",
    timeZone,
  });
  assert.equal(monthOnly.maximumTrend.monthlySource.buckets.length, 12);

  const closedMonth = widgets.buildOccupancyHistoricalComparisonRanges({
    dayCount: 30,
    needsAnnualMaximum: false,
    needsHourlyAggregate: true,
    needsHourlyHeatmap: true,
    needsMaximumTrend: true,
    needsScenarioHeatmap: true,
    period: {
      contextLabel: "Agosto de 2026",
      from: new Date("2026-08-01T03:00:00.000Z"),
      referenceAt: new Date("2026-09-01T02:59:59.999Z"),
      to: new Date("2026-09-01T03:00:00.000Z"),
    },
    scenarioHeatmapGranularity: "day",
    timeZone,
  });
  assert.equal(
    civilMonthKey(closedMonth.maximumTrend.monthly.buckets.at(-1)),
    "2026-08",
  );
  assert.equal(closedMonth.maximumTrend.monthlySource.buckets.length, 12);
});

test("recorte IANA independe do timezone do runtime e preserva a hora DST repetida", () => {
  const period = {
    contextLabel: "Domingo DST",
    from: new Date("2026-11-01T04:00:00.000Z"),
    referenceAt: new Date("2026-11-02T04:59:59.999Z"),
    to: new Date("2026-11-02T05:00:00.000Z"),
  };
  const fingerprints = ["UTC", "Asia/Tokyo"].map((runtimeTimeZone) =>
    withRuntimeTimeZone(runtimeTimeZone, () => {
      const ranges = widgets.buildOccupancyHistoricalComparisonRanges({
        dayCount: 7,
        needsAnnualMaximum: true,
        needsHourlyAggregate: true,
        needsHourlyHeatmap: false,
        needsMaximumTrend: true,
        needsScenarioHeatmap: false,
        period,
        scenarioHeatmapGranularity: "hour",
        timeZone: "America/New_York",
      });
      return {
        annual: ranges.maximumTrend.annual.buckets.map(civilYearKey),
        hourly: ranges.hourly.buckets.map((bucket: Date) => bucket.toISOString()),
        monthly: ranges.maximumTrend.monthly.buckets.map(civilMonthKey),
      };
    }),
  );
  assert.deepEqual(fingerprints[0], fingerprints[1]);
  assert.equal(fingerprints[0].hourly.length, 25);
  assert.ok(fingerprints[0].hourly.includes("2026-11-01T05:00:00.000Z"));
  assert.ok(fingerprints[0].hourly.includes("2026-11-01T06:00:00.000Z"));
});

test("modo manual não instala polling e snapshot usa somente history?at", () => {
  const manualEffect = source.slice(
    source.indexOf("const historicalRanges = React.useMemo"),
    source.indexOf("const certifiedSnapshots ="),
  );
  assert.match(manualEffect, /loadOccupancyHistoricalComparisonDataset/);
  assert.doesNotMatch(manualEffect, /setTimeout|setInterval/);
  assert.doesNotMatch(manualEffect, /addEventListener/);
  assert.doesNotMatch(manualEffect, /occupancyLiveSnapshotQuery/);

  const historicalSnapshotBranch = source.slice(
    source.indexOf("if (referenceAt) {"),
    source.indexOf("const query = occupancyLiveSnapshotQuery", source.indexOf("if (referenceAt) {")),
  );
  assert.match(historicalSnapshotBranch, /occupancyComparisonHistoryPath/);
  assert.match(
    source,
    /\/occupancy\/scenarios\/\$\{encodeURIComponent\(scenarioId\)\}\/history\?/,
  );
  assert.doesNotMatch(historicalSnapshotBranch, /occupancyLiveSnapshotQuery/);

  const guardedLiveEffects = source.match(
    /if \(!queryEnabled \|\| historicalMode \|\| !needs/g,
  );
  assert.ok(
    (guardedLiveEffects?.length ?? 0) >= 3,
    "todos os ciclos ao vivo devem sair antes de criar timers no modo manual",
  );
  assert.match(
    source,
    /if \(!queryEnabled \|\| historicalMode\) return;\s*if \(!needsCurrentHourMaximum\) return;/,
  );
});

test("modo manual sincroniza paleta/opções sem criar polling", () => {
  const start = source.indexOf("function synchronizeSettings()");
  const end = source.indexOf("React.useEffect(() => {", start);
  const settingsEffect = source.slice(start, end);
  assert.doesNotMatch(settingsEffect, /if \(historicalMode\) return/);
  assert.match(settingsEffect, /OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT/);
  assert.match(settingsEffect, /USER_GRID_HYDRATED_EVENT/);
  assert.match(settingsEffect, /removeEventListener/);
  assert.doesNotMatch(settingsEffect, /setTimeout|setInterval/);
});

test("demanda histórica lê fechamento somente para cards que o consomem", () => {
  const scenarios = [{ id: "a" }, { id: "b" }];
  const byCard = new Map([
    ["occupancy_scenario_max_hour", ["a"]],
    ["occupancy_scenario_max_year", ["b"]],
    ["occupancy_duration_transitions", ["b"]],
  ]);
  const resolveIds = (visibleCardIds: string[]) =>
    widgets.occupancyHistoricalSnapshotScenarioIds({
      byCard,
      hexScenarioIds: [],
      scenarios,
      visibleCardIds: new Set(visibleCardIds),
    });

  assert.deepEqual(resolveIds(["occupancy_scenario_max_hour"]), []);
  assert.deepEqual(resolveIds(["occupancy_scenario_max_year"]), []);
  assert.deepEqual(resolveIds(["occupancy_duration_transitions"]), ["b"]);
});

test("máximo por hora carrega no manual e histórico fechado não marca mês parcial", () => {
  assert.match(
    source,
    /loading=\{aggregateLoading \|\| currentHourMaximumLoading\}/,
  );
  const bucket = new Date(2026, 7, 1);
  const metricKey = load(
    "lib/occupancy-aggregate-validation.ts",
  ).occupancyAggregateBucketKey(bucket, "month");
  const base = {
    buckets: [bucket],
    currentBucket: null,
    currentSnapshots: [],
    currentSeries: [],
    granularity: "month",
    monthlySourceBuckets: [],
    scenarios: [{ id: "a", name: "Entrada" }],
    series: [{
      metrics: new Map([[metricKey, { average: 1, minimum: 0, peak: 4 }]]),
      name: "Entrada",
      scenarioId: "a",
    }],
    timeZone,
  };
  assert.deepEqual(
    widgets.buildMaximumLineSeries({
      ...base,
      markLastBucketPartial: false,
    })[0].partialIndexes,
    [],
  );
  assert.deepEqual(
    widgets.buildMaximumLineSeries({
      ...base,
      markLastBucketPartial: true,
    })[0].partialIndexes,
    [0],
  );

  const closingDay = Array.from(
    { length: 24 },
    (_, hour) => new Date(Date.UTC(2026, 7, 12, 3 + hour)),
  );
  const heatmapWindow = [
    ...Array.from(
      { length: 24 },
      (_, hour) => new Date(Date.UTC(2026, 7, 11, 3 + hour)),
    ),
    ...closingDay,
  ];
  assert.deepEqual(
    widgets
      .occupancyLatestCompanyDayBuckets(heatmapWindow, null, timeZone)
      .map((value: Date) => value.toISOString()),
    widgets
      .occupancyLatestCompanyDayBuckets(closingDay, null, timeZone)
      .map((value: Date) => value.toISOString()),
    "mostrar o heatmap pode ampliar a fonte compartilhada, mas não o resultado do max-hour",
  );
});

test("faixa histórica vazia legítima não bloqueia certificação/exportação", () => {
  assert.equal(
    widgets.occupancyHistoricalAggregateIsComplete({
      granularity: "hour",
      range: null,
      scenarioIds: ["a"],
      series: [],
    }),
    true,
  );
});

test("snapshot one-shot certifica os próprios dados e falha fechado", () => {
  const aggregate = load("lib/occupancy-aggregate-validation.ts");
  const period = {
    contextLabel: "15 de setembro de 2026",
    from: new Date("2026-09-15T03:00:00.000Z"),
    referenceAt: new Date("2026-09-16T02:59:59.999Z"),
    to: new Date("2026-09-16T03:00:00.000Z"),
  };
  const bucket = new Date("2026-09-15T03:00:00.000Z");
  const range = { buckets: [bucket], from: period.from, to: period.to };
  const plan = {
    hourlyScenarioIds: ["a"],
    maximumTrendScenarioIds: [],
    needsHourlyAggregate: true,
    needsMaximumTrend: false,
    needsScenarioHeatmap: false,
    needsSnapshots: false,
    scenarioHeatmapScenarioIds: [],
    snapshotScenarioIds: [],
  };
  const base = {
    dataset: {
      hourlyRange: range,
      hourlySeries: [{
        metrics: new Map([[
          aggregate.occupancyAggregateBucketKey(bucket, "hour"),
          { average: 1, minimum: 0, peak: 2 },
        ]]),
        name: "Entrada",
        scenarioId: "a",
      }],
      maximumTrendRanges: null,
      maximumTrendSeries: [],
      scenarioHeatmapRange: null,
      scenarioHeatmapSeries: [],
      snapshots: [],
    },
    period,
    plan,
    ranges: { hourly: range, maximumTrend: null, scenarioHeatmap: null },
    scenarioHeatmapGranularity: "hour",
    scenarios: [{ id: "a", name: "Entrada" }],
    timeZone,
  };

  assert.equal(
    widgets
      .occupancyHistoricalComparisonDataCompleteUntil(base)
      .toISOString(),
    period.referenceAt.toISOString(),
  );
  assert.equal(
    widgets.occupancyHistoricalComparisonDataCompleteUntil({
      ...base,
      dataset: {
        ...base.dataset,
        hourlySeries: [{
          error: "Falha na origem",
          metrics: new Map(),
          name: "Entrada",
          scenarioId: "a",
        }],
      },
    }),
    null,
  );
  assert.equal(
    widgets.occupancyHistoricalComparisonDataCompleteUntil({
      ...base,
      plan: {
        ...plan,
        hourlyScenarioIds: [],
        needsHourlyAggregate: false,
      },
    }),
    undefined,
  );
  assert.match(
    source,
    /const reportDataCompleteUntil =\s*occupancyHistoricalComparisonDataCompleteUntil\([\s\S]*?if \(reportDataCompleteUntil === null\) \{\s*throw new Error/,
  );
});

test("máximos exigem cobertura somente desde o mês civil de criação do cenário", () => {
  const aggregate = load("lib/occupancy-aggregate-validation.ts");
  const buckets = [
    new Date(2026, 0, 1),
    new Date(2026, 1, 1),
    new Date(2026, 2, 1),
  ];
  const metric = { average: 2, minimum: 0, peak: 5 };
  const metricsFromCoverage = new Map(
    buckets.slice(1).map((bucket) => [
      aggregate.occupancyAggregateBucketKey(bucket, "month"),
      metric,
    ]),
  );
  const input = {
    coverageScenarios: [
      {
        // 28/02 23:30 em São Paulo: a cobertura começa em fevereiro,
        // embora o mesmo instante já seja março em UTC.
        created_at: "2026-03-01T02:30:00.000Z",
        id: "a",
      },
    ],
    granularity: "month",
    range: {
      buckets,
      from: buckets[0],
      to: new Date(2026, 3, 1),
    },
    scenarioIds: ["a"],
    series: [{
      metrics: metricsFromCoverage,
      name: "Entrada",
      scenarioId: "a",
    }],
    timeZone,
  };

  assert.equal(widgets.occupancyHistoricalAggregateIsComplete(input), true);
  assert.equal(
    widgets.occupancyHistoricalAggregateIsComplete({
      ...input,
      coverageScenarios: undefined,
    }),
    false,
    "sem created_at, janeiro continua sendo cobertura obrigatória",
  );
  assert.equal(
    widgets.occupancyHistoricalAggregateIsComplete({
      ...input,
      series: [{
        metrics: new Map([
          [
            aggregate.occupancyAggregateBucketKey(buckets[2], "month"),
            metric,
          ],
        ]),
        name: "Entrada",
        scenarioId: "a",
      }],
    }),
    false,
    "o mês de criação na empresa não pode ser ignorado pelo calendário UTC",
  );
  assert.equal(
    widgets.occupancyHistoricalAggregateIsComplete({
      ...input,
      coverageScenarios: [{ created_at: "2026-05-01T03:00:00.000Z", id: "a" }],
      series: [],
    }),
    true,
    "um cenário ainda inexistente em toda a janela não torna o relatório parcial",
  );
});

test("assets carregados usam os mesmos IDs com linguagem histórica", () => {
  const contextLabel = "Agosto de 2026";
  const reports = widgets.buildOccupancyComparisonReportAssets({
    aggregateBuckets: [],
    aggregateSeries: [],
    currentHourBucket: null,
    currentHourSeries: [],
    heatmapScenarioId: "scenario-a",
    hexSnapshots: [],
    historicalContextLabel: contextLabel,
    hourlyMaximumBuckets: [],
    hourlyMaximumSeries: [],
    maximumTrendRanges: null,
    maximumTrendSeries: [],
    scenarioHeatmapBuckets: [],
    scenarioHeatmapSeries: [],
    scenarioHourHeatmapDateKey: "",
    scenarios: [{ id: "scenario-a", name: "Entrada" }],
    selectedScenarioIds: ["scenario-a"],
    settings: settings.DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
    snapshots: [],
    timeZone,
  });
  const byId = new Map<string, RuntimeFixture>(
    reports.map((report: RuntimeFixture) => [report.cardId, report.chart]),
  );

  assert.equal(byId.size, widgets.OCCUPANCY_COMPARISON_CARD_IDS.length);
  assert.equal(
    byId.get("occupancy_scenario_bar_race").title,
    "Ranking no fechamento por cenário",
  );
  assert.equal(
    byId.get("occupancy_scenario_max_hour").title,
    "Máximo por hora no período",
  );
  assert.equal(
    byId.get("occupancy_scenario_max_month").title,
    "Máximo mensal · 12 meses fechados",
  );
  assert.equal(
    byId.get("occupancy_scenario_max_year").title,
    "Máximo anual · 4 anos fechados",
  );
  assert.match(
    byId.get("occupancy_scenario_max_month").description,
    new RegExp(contextLabel),
  );
  assert.doesNotMatch(
    byId.get("occupancy_scenario_bar_race").description,
    /ao vivo|neste instante/i,
  );
});

test("hook publica contrato completo da análise histórica", () => {
  const returnBlock = source.slice(
    source.indexOf("  return {\n    cards,", source.indexOf("export function useOccupancyComparisonCards")),
    source.indexOf("\n  };\n}", source.indexOf("  return {\n    cards,", source.indexOf("export function useOccupancyComparisonCards"))) + 6,
  );
  for (const field of [
    "dataCompleteUntil",
    "loadReportAssets",
    "loadReportSnapshot",
    "loading",
    "refresh",
    "reportAssets",
  ]) {
    assert.match(returnBlock, new RegExp(`\\b${field}\\b`));
  }
});

function load(path: string): RuntimeFixture {
  const cached = modules.get(path);
  if (cached) return cached.exports;
  let moduleSource = readFileSync(resolve(path), "utf8");
  if (path.endsWith("occupancy-comparison-widgets.tsx")) {
    moduleSource +=
      "\nexport { buildMaximumLineSeries, buildOccupancyComparisonReportAssets, occupancyHistoricalAggregateIsComplete, occupancyHistoricalComparisonDataCompleteUntil, occupancyHistoricalSnapshotScenarioIds, occupancyLatestCompanyDayBuckets };";
  }
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  modules.set(path, loaded);
  const output = ts.transpileModule(moduleSource, {
    fileName: path,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("module", "exports", "require", output)(
    loaded,
    loaded.exports,
    (name: string) => {
      if (!name.startsWith("@/")) return require(name);
      if (name === "@/lib/api") {
        return { apiFetch: () => { throw new Error("Unexpected request"); } };
      }
      if (
        name.startsWith("@/components/") &&
        name !== "@/components/app/occupancy-chart-palette"
      ) {
        return {};
      }
      const base = name.slice(2);
      return load(existsSync(resolve(`${base}.ts`)) ? `${base}.ts` : `${base}.tsx`);
    },
  );
  return loaded.exports;
}

function civilMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function civilYearKey(date: Date) {
  return String(date.getFullYear());
}

function civilMonthKeys(first: string, count: number) {
  const [year, month] = first.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const absoluteMonth = year * 12 + month - 1 + index;
    return `${Math.floor(absoluteMonth / 12)}-${String(
      (absoluteMonth % 12) + 1,
    ).padStart(2, "0")}`;
  });
}

function occupancyCivilBucketEndInstant(
  bucket: Date,
  granularity: "month" | "year",
  companyTimeZone: string,
) {
  const calendar = load("lib/occupancy-calendar.ts");
  const end = calendar.shiftOccupancyCalendarDate(
    bucket,
    0,
    granularity === "month" ? 1 : 0,
    granularity === "year" ? 1 : 0,
  );
  return calendar.occupancyCalendarBoundaryInstant(end, companyTimeZone);
}

function withRuntimeTimeZone<T>(timeZoneValue: string, callback: () => T) {
  const previous = process.env.TZ;
  process.env.TZ = timeZoneValue;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
