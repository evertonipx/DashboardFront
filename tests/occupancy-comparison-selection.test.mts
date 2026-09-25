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
const modules = new Map();
const selection = load("lib/occupancy-comparison-selection.ts");
const comparison = load("lib/occupancy-comparison.ts");
const source = readFileSync(resolve(root, "components/app/occupancy-comparison-widgets.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(root, "components/app/occupancy-scenario-dashboard.tsx"), "utf8");
const scenarios = ["a", "b", "c", "d"].map((id) => ({ id, name: `Cenário ${id}` }));
const ids = selection.OCCUPANCY_COMPARISON_SCENARIO_CARD_IDS;

test("snapshots comparativos mantêm cadência real de cinco segundos por lote", () => {
  const intervalFor = (scenarioCount: number) =>
    selection.occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: 5_000,
      concurrency: 4,
      scenarioCount,
    });

  for (const batchCount of [0, 1, 4, 5, 8, 9, 37, 200]) {
    assert.equal(intervalFor(batchCount), 5_000);
  }
});

test("intervalo focal valida entradas e respeita o piso de cinco segundos", () => {
  assert.equal(
    selection.occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: 3_000,
      concurrency: 2,
      scenarioCount: 3,
    }),
    5_000,
  );
  assert.equal(
    selection.occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: 7_500,
      concurrency: 2,
      scenarioCount: 37,
    }),
    7_500,
  );
  assert.throws(
    () => selection.occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: 0,
      concurrency: 4,
      scenarioCount: 1,
    }),
    RangeError,
  );
  assert.throws(
    () => selection.occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: 5_000,
      concurrency: 0,
      scenarioCount: 1,
    }),
    RangeError,
  );
  assert.throws(
    () => selection.occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: 5_000,
      concurrency: 4,
      scenarioCount: -1,
    }),
    RangeError,
  );
});

test("snapshot mantém 5s e agregados não são artificialmente limitados por ele", () => {
  assert.match(
    source,
    /effectiveSnapshotRefreshMs\s*=\s*occupancyComparisonSnapshotRefreshIntervalMs\(/,
  );
  assert.match(
    source,
    /function scheduleNext\(delayMs = effectiveSnapshotRefreshMs\)/,
  );
  assert.match(source, /refreshMs: effectiveSnapshotRefreshMs/);
  assert.match(
    source,
    /function scheduleAfterSnapshotCycle\(startedAt: Date\)[\s\S]*?effectiveSnapshotRefreshMs - \(Date\.now\(\) - startedAt\.getTime\(\)\)/,
    "a latência do lote deve ser descontada do próximo pulso",
  );
  assert.match(
    source,
    /cached\.completedAt <= oldestFreshSnapshot/,
    "um snapshot deve vencer exatamente no limite de cinco segundos",
  );
  assert.match(
    source,
    /requestedAt\.getTime\(\) - candidateFocusSnapshot\.requestedAt\.getTime\(\) <\s*effectiveSnapshotRefreshMs/,
    "a leitura compartilhada do cenário focal também deve respeitar o limite estrito",
  );
  assert.match(
    source,
    /const snapshotQuery = occupancyLiveSnapshotQuery\(\{ now: requestedAt \}\)[\s\S]*?cacheTtlMs: OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS/,
    "o snapshot ao vivo deve compartilhar a mesma janela quantizada entre consumidores",
  );
  assert.match(
    source,
    /completeOccupancyComparisonResource\([\s\S]*?snapshotScopeKey,[\s\S]*?snapshotScopeKey,[\s\S]*?requestedAt\.getTime\(\)/,
    "o frescor comparativo deve ser contado desde o início da rodada",
  );
  assert.doesNotMatch(
    source,
    /Math\.min\(delayMs, effectiveSnapshotRefreshMs\)/,
    "agregados fechados não devem repetir a mesma janela a cada pulso",
  );
  assert.equal(
    (source.match(/Math\.round\(effectiveSnapshotRefreshMs \/ 1_000\)/g) ?? [])
      .length,
    1,
  );
  assert.match(source, /Math\.round\(aggregateRefreshMs \/ 1_000\)/);
});

test("máximos limitam o histórico a quatro anos e avançam pela hora aberta", () => {
  const ranges = comparison.buildOccupancyMaximumTrendRanges(
    new Date("2026-09-15T15:00:00.000Z"),
    "America/Sao_Paulo",
  );
  assert.equal(ranges.annual.buckets.length, 4);
  assert.deepEqual(
    ranges.annual.buckets.map((bucket: Date) => bucket.getFullYear()),
    [2023, 2024, 2025, 2026],
  );
  assert.equal(ranges.monthlySource.from.getFullYear(), 2023);
  assert.equal(ranges.monthlySource.buckets.at(-1).getFullYear(), 2026);
  assert.equal(ranges.monthlySource.buckets.at(-1).getMonth(), 8);

  assert.match(
    source,
    /const MAXIMUM_TREND_FULL_REFRESH_MS = 24 \* 60 \* 60_000/,
  );
  assert.match(
    source,
    /const retained = maximumTrendSeriesCacheRef\.current\.get\(cacheKey\)[\s\S]*?const previous =[\s\S]*?const fullRefresh =[\s\S]*?requestedAt\.getTime\(\) - lastFullRefreshAt >=\s*MAXIMUM_TREND_FULL_REFRESH_MS/,
    "o histórico completo deve ser auditado no máximo uma vez por dia",
  );
  assert.match(
    source,
    /if \(fullRefresh\) \{\s*setBoundedComparisonCacheEntry\(\s*maximumTrendFullRefreshRef\.current,[\s\S]*?requestedAt\.getTime\(\)/,
    "lacunas legítimas não devem provocar um novo backfill de quatro anos a cada hora",
  );
  assert.match(
    source,
    /if \(fullRefresh\) \{[\s\S]*?fetchOccupancyCivilAggregate\(\{[\s\S]*?from: ranges\.monthlySource\.from,[\s\S]*?to: ranges\.monthlySource\.to,[\s\S]*?\} else \{[\s\S]*?currentHourMaximumDatasetRef\.current[\s\S]*?mergeOccupancyMaximumTrendOpenPeak\(\{/,
    "só a auditoria consulta o histórico; o pulso deve reutilizar a hora aberta",
  );
  assert.match(
    source,
    /OCCUPANCY_CURRENT_HOUR_MAXIMUM_CARD_IDS = new Set\(\[[\s\S]*?"occupancy_scenario_max_month"/,
    "o widget mensal deve materializar a fonte de hora aberta que ele reutiliza",
  );
  assert.doesNotMatch(
    source,
    /from: currentMonthBucket,[\s\S]{0,160}to: ranges\.monthlySource\.to/,
    "o fallback civil não pode recompor o mês corrente a cada 5s",
  );
  assert.match(
    source,
    /refreshVersion: 0,\s*scopeKey: maximumTrendScopeKey/,
    "atualização manual não deve repetir quatro anos de agregados",
  );
});

test("merge da borda mantém meses fechados e máximo mensal monotônico", () => {
  const february = new Date(2026, 1, 1);
  const januaryKey = Date.UTC(2026, 0, 1);
  const februaryKey = Date.UTC(2026, 1, 1);
  const baseline = new Map([
    [januaryKey, { average: 4, minimum: 1, peak: 12 }],
    [februaryKey, { average: 6, minimum: 2, peak: 18 }],
  ]);

  const raised = comparison.mergeOccupancyMaximumTrendOpenPeak({
    currentMonth: february,
    metrics: baseline,
    openPeak: 23,
  });
  assert.deepEqual(raised.get(januaryKey), baseline.get(januaryKey));
  assert.deepEqual(raised.get(februaryKey), {
    average: 6,
    minimum: 2,
    peak: 23,
  });
  assert.equal(baseline.get(februaryKey)?.peak, 18);

  const lowerEdge = comparison.mergeOccupancyMaximumTrendOpenPeak({
    currentMonth: february,
    metrics: raised,
    openPeak: 7,
  });
  assert.equal(lowerEdge.get(februaryKey)?.peak, 23);
  assert.throws(
    () => comparison.mergeOccupancyMaximumTrendOpenPeak({
      currentMonth: february,
      metrics: raised,
      openPeak: Number.NaN,
    }),
    RangeError,
  );
});

test("máximo mensal combina agregado, hora e leitura atual sem regredir nem cruzar mês civil", () => {
  const august = new Date(2026, 7, 1);
  const september = new Date(2026, 8, 1);
  const buckets = [august, september];
  const metrics = new Map([
    [Date.UTC(2026, 7, 1), { average: 4, minimum: 1, peak: 18 }],
    [Date.UTC(2026, 8, 1), { average: 3, minimum: 0, peak: 10 }],
  ]);
  const liveBucket = new Date("2026-09-15T15:00:00.000Z");
  const monthly = (livePeak: number | null, source = metrics) =>
    comparison.buildOccupancyMonthlyMaximumValues({
      buckets, liveBucket, livePeak, metrics: source,
      timeZone: "America/Sao_Paulo",
    });
  assert.deepEqual(monthly(14), [18, 14]);
  assert.deepEqual(monthly(7), [18, 10]);
  assert.deepEqual(monthly(14, new Map([[Date.UTC(2026, 7, 1), metrics.get(Date.UTC(2026, 7, 1))!]])), [18, 14]);
  assert.deepEqual(comparison.buildOccupancyMonthlyMaximumValues({
    buckets, liveBucket: null, livePeak: 14, metrics,
    timeZone: "America/Sao_Paulo",
  }), [18, 10], "um relatório histórico não incorpora leitura ao vivo");
  assert.deepEqual(comparison.buildOccupancyMonthlyMaximumValues({
    buckets: [new Date(2025, 11, 1), new Date(2026, 0, 1)],
    liveBucket: new Date("2026-01-01T01:15:00.000Z"),
    livePeak: 99,
    metrics: new Map([[Date.UTC(2025, 11, 1), { average: 2, minimum: 0, peak: 11 }]]),
    timeZone: "America/Sao_Paulo",
  }), [11, null], "01:15Z ainda pertence a dezembro em São Paulo");
});

test("a borda anual usa o maior valor certificado da hora ou do snapshot", () => {
  const bucket = new Date("2026-09-15T15:00:00.000Z");
  const current = { peaks: new Map([[bucket.getTime(), 12]]) };
  const snapshot = { asOf: "2026-09-15T15:00:30.000Z", total: 14 };
  const peak = comparison.occupancyLiveScenarioPeak({
    bucket, current, snapshot, timeZone: "America/Sao_Paulo",
  });
  assert.equal(peak, 14);
  assert.equal(comparison.occupancyLiveScenarioPeak({
    bucket, current,
    snapshot: { asOf: "2026-09-15T14:59:59.000Z", total: 40 },
    timeZone: "America/Sao_Paulo",
  }), 12, "leitura da hora anterior não contamina o pico atual");
  assert.deepEqual(comparison.buildOccupancyAnnualMaximumPoints({
    annualBuckets: [new Date(2026, 0, 1)],
    liveBucket: bucket,
    livePeak: peak,
    metrics: new Map([[Date.UTC(2026, 8, 1), { average: 3, minimum: 0, peak: 10 }]]),
    monthlyBuckets: [new Date(2026, 8, 1)],
    timeZone: "America/Sao_Paulo",
  }), [{ partial: true, value: 14 }]);
  assert.deepEqual(comparison.buildOccupancyAnnualMaximumPoints({
    annualBuckets: [new Date(2025, 0, 1)],
    metrics: new Map([[Date.UTC(2025, 0, 1), { average: 3, minimum: 0, peak: 10 }]]),
    monthlyBuckets: [new Date(2025, 0, 1), new Date(2025, 1, 1)],
    openYear: null,
  }), [{ partial: false, value: null }], "ano fechado com mês ausente não é certificado pelo PDF");
  assert.deepEqual(comparison.buildOccupancyAnnualMaximumPoints({
    annualBuckets: [new Date(2025, 0, 1), new Date(2026, 0, 1)],
    liveBucket: new Date("2026-01-01T01:15:00.000Z"),
    livePeak: 99,
    metrics: new Map([
      [Date.UTC(2025, 11, 1), { average: 3, minimum: 0, peak: 12 }],
      [Date.UTC(2026, 0, 1), { average: 3, minimum: 0, peak: 5 }],
    ]),
    monthlyBuckets: [new Date(2025, 11, 1), new Date(2026, 0, 1)],
    openYear: 2026,
    timeZone: "America/Sao_Paulo",
  }), [{ partial: false, value: 12 }, { partial: true, value: 5 }],
  "hora ainda em dezembro civil não deve inflar janeiro nem reabrir o ano fechado");
});

test("novo pico do mês permanece após a ocupação cair e não atravessa a virada civil", () => {
  const currentMonth = new Date(2026, 8, 1);
  const liveBucket = new Date("2026-09-15T15:00:00.000Z");
  const scenarios = [{ scenarioId: "a", name: "Entrada", metrics: new Map([
    [Date.UTC(2026, 8, 1), { average: 3, minimum: 0, peak: 10 }],
  ]) }];
  const advance = (previous: RuntimeFixture, value: number, bucket = liveBucket) =>
    comparison.advanceOccupancyMaximumTrendLivePeaks({
      currentMonth,
      currentSeries: [],
      liveBucket: bucket,
      scenarios: previous,
      snapshots: [{ scenarioId: "a", name: "Entrada", occupied: value > 0,
        total: value, asOf: new Date(bucket.getTime() + 30_000).toISOString() }],
      timeZone: "America/Sao_Paulo",
    });
  const raised = advance(scenarios, 14);
  assert.equal(raised[0].metrics.get(Date.UTC(2026, 8, 1))?.peak, 14);
  const lowered = advance(raised, 3);
  assert.strictEqual(lowered, raised, "leitura menor não cria novo estado nem reduz o máximo");
  assert.deepEqual(comparison.buildOccupancyMonthlyMaximumValues({
    buckets: [currentMonth], liveBucket, livePeak: 3,
    metrics: lowered[0].metrics, timeZone: "America/Sao_Paulo",
  }), [14]);
  const previousMonthHour = new Date("2026-09-01T02:00:00.000Z");
  assert.strictEqual(advance(raised, 99, previousMonthHour), raised,
    "leitura de agosto não contamina o máximo de setembro");
});

test("os três gráficos de máximo usam o mesmo pico ao vivo e o PDF mantém a borda mensal", () => {
  const syntax = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = syntax.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "buildMaximumLineSeries");
  assert.ok(declaration);
  const helpers = {
    ...comparison,
    joinMessages: (...messages: Array<string | undefined>) => messages.filter(Boolean).join(" ") || undefined,
    occupancyScenarioCoverageStart: () => null,
    occupancyAggregateBucketKey: load("lib/occupancy-aggregate-validation.ts").occupancyAggregateBucketKey,
    companyTimeZoneHour: load("lib/company-time-zone.ts").companyTimeZoneHour,
  };
  const compiled = ts.transpileModule(`${declaration.getText(syntax)}\nmodule.exports = buildMaximumLineSeries;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("module", ...Object.keys(helpers), compiled)(loaded, ...Object.values(helpers));

  const hourBucket = new Date("2026-09-15T15:00:00.000Z");
  const scenario = { id: "a", name: "Entrada" };
  const snapshot = { scenarioId: "a", name: "Entrada", asOf: "2026-09-15T15:00:30.000Z", total: 14, occupied: true };
  const openHour = { scenarioId: "a", name: "Entrada", peaks: new Map([[hourBucket.getTime(), 12]]), source: "hour" };
  const monthlyMetric = { average: 3, minimum: 0, peak: 10 };
  const common = {
    timeZone: "America/Sao_Paulo",
    currentBucket: hourBucket,
    currentSnapshots: [snapshot],
    currentSeries: [openHour],
    scenarios: [scenario],
  };
  const monthly = loaded.exports({
    ...common,
    buckets: [new Date(2026, 8, 1)],
    granularity: "month",
    monthlySourceBuckets: [],
    series: [{ scenarioId: "a", name: "Entrada", metrics: new Map([[Date.UTC(2026, 8, 1), monthlyMetric]]) }],
  });
  assert.deepEqual(monthly[0].values, [14]);
  assert.deepEqual(monthly[0].partialIndexes, [0]);

  const annual = loaded.exports({
    ...common,
    buckets: [new Date(2026, 0, 1)],
    granularity: "year",
    monthlySourceBuckets: [new Date(2026, 8, 1)],
    series: [{ scenarioId: "a", name: "Entrada", metrics: new Map([[Date.UTC(2026, 8, 1), monthlyMetric]]) }],
  });
  assert.deepEqual(annual[0].values, [14]);
  assert.deepEqual(annual[0].partialIndexes, [0]);

  const hourly = loaded.exports({
    ...common,
    buckets: [hourBucket],
    granularity: "hour",
    monthlySourceBuckets: [],
    series: [{ scenarioId: "a", name: "Entrada", metrics: new Map([[hourBucket.getTime(), monthlyMetric]]) }],
  });
  assert.equal(hourly[0].values[12], 14);

  const reportStart = source.indexOf("const monthlyMaximum = buildMaximumLineSeries({");
  const reportEnd = source.indexOf("const annualBuckets", reportStart);
  const reportMonth = source.slice(reportStart, reportEnd);
  assert.match(reportMonth, /currentBucket: historicalContextLabel \? null : currentHourBucket/);
  assert.match(reportMonth, /filterForCard\("occupancy_scenario_max_month", snapshots\)/);
  assert.match(reportMonth, /filterForCard\("occupancy_scenario_max_month", currentHourSeries\)/);
});

test("heatmaps horários preservam dias fechados e consultam somente a borda nova", () => {
  assert.match(
    source,
    /const HOURLY_AGGREGATE_FULL_REFRESH_MS = 24 \* 60 \* 60_000/,
  );
  assert.match(
    source,
    /const firstUnattemptedBucket = range\.buckets\.find\([\s\S]*?cached\?\.attemptedBucketKeys\.has/,
    "a cobertura já consultada deve sobreviver às atualizações do minuto",
  );
  assert.match(
    source,
    /const sourceFrom = fullRefresh\s*\? range\.from\s*: \(firstUnattemptedBucket \?\? range\.buckets\.at\(-1\)!\)/,
    "sem lacunas históricas, apenas a hora aberta deve ser solicitada",
  );
  assert.match(
    source,
    /const aggregatePath = occupancyAggregatePath\(\s*scenario\.id,\s*sourceFrom,\s*range\.to,?\s*\)[\s\S]*?path: aggregatePath/,
  );
  assert.match(
    source,
    /updateOccupancyScenarioHeatmapAttemptedBuckets\(\{[\s\S]*?granularity: "hour",[\s\S]*?missingBuckets: coverage\.missingBuckets,[\s\S]*?refreshedBuckets: sourceBuckets\.filter/,
    "a hora aberta deve usar a mesma reconciliação de cobertura e rollover das demais granularidades",
  );
  assert.match(
    source,
    /coverageRetryBucketKeys:\s*coverageState\.coverageRetryBucketKeys/,
    "uma omissão recém-fechada deve receber uma única retentativa controlada",
  );
});

test("mapa por cenários consulta somente a granularidade visível e não refaz GET por aparência", () => {
  const start = source.indexOf(
    "const granularity = settings.scenarioHeatmapGranularity;",
  );
  const end = source.indexOf(
    "if (!needsCurrentHourMaximum) return;",
    start,
  );
  assert.ok(start >= 0 && end > start);
  const effect = source.slice(start, end);

  assert.match(
    effect,
    /if \(!scenarioHeatmapVisible \|\| granularity === "hour"\) return/,
    "widget oculto e modo hora não podem criar uma consulta paralela",
  );
  assert.match(
    effect,
    /granularity === "minute"[\s\S]*?occupancyAggregatePath\([\s\S]*?granularity[\s\S]*?: await fetchOccupancyCivilAggregate\(\{/,
    "minuto usa o agregado instantâneo; dia, semana e mês usam o caminho civil certificado",
  );
  assert.match(effect, /unitCache: scenarioHeatmapCivilUnitCacheRef\.current/);
  assert.match(
    effect,
    /missingBuckets: coverage\.missingBuckets,[\s\S]*?previousRetry:[\s\S]*?coverageRetryBucketKeys[\s\S]*?refreshedBuckets: sourceBuckets\.filter/,
    "somente buckets realmente cobertos podem concluir a borda recém-fechada",
  );
  assert.match(
    effect,
    /bypassCache: fullRefresh && Boolean\(cached\)[\s\S]*?bypassUnitCache: fullRefresh && Boolean\(cached\)/,
    "auditorias diárias ou manuais devem revalidar também as unidades fechadas",
  );
  assert.match(
    effect,
    /lastFullAttemptAt: cached\?\.lastFullAttemptAt \?\? 0,[\s\S]*?refreshVersion: cached\?\.refreshVersion \?\? -1/,
    "uma auditoria com falha não pode ser marcada como concluída",
  );
  assert.match(
    effect,
    /loading: warmSeries\.length !== requestedScenarios\.length/,
    "cache parcial não pode apresentar um subconjunto como carga concluída",
  );
  assert.match(
    effect,
    /cached\.refreshVersion === manualRefreshVersion &&[\s\S]*?cached\.retryAt > requestedAt\.getTime\(\)/,
    "atualização manual deve ignorar o backoff de uma tentativa anterior",
  );
  assert.match(
    source,
    /MAX_SCENARIO_HEATMAP_CIVIL_UNIT_CACHE_ENTRIES = 100_000[\s\S]*?scenarioHeatmapCivilUnitCacheRef\.current\.clear\(\)[\s\S]*?trimOldestMapEntries\([\s\S]*?MAX_SCENARIO_HEATMAP_CIVIL_UNIT_CACHE_ENTRIES/,
    "o cache civil deve ser isolado por escopo e possuir teto de memória",
  );
  assert.match(
    source,
    /const scenarioHeatmapRangeDayCount =[\s\S]*?settings\.scenarioHeatmapGranularity === "hour"[\s\S]*?settings\.scenarioHeatmapGranularity === "day"[\s\S]*?\? settings\.dayCount\s*: 7;[\s\S]*?scenarioHeatmapScopeKey = `\$\{companyScopeId\}\|\$\{timeZone\}\|\$\{comparisonWindowKey\}\|\$\{settings\.scenarioHeatmapGranularity\}\|\$\{scenarioHeatmapRangeDayCount\}\|\$\{scenarioHeatmapSelectionKey\}`/,
    "minute/week/month devem manter uma chave estável por janela quando outro widget altera dayCount",
  );
  assert.doesNotMatch(effect, /settings\.(?:metric|colorPaletteId)/);
});

test("máximo da hora recompõe somente a borda recente dos minutos", () => {
  assert.match(
    source,
    /const CURRENT_HOUR_MAXIMUM_OVERLAP_MS = 5 \* 60_000/,
  );
  assert.match(
    source,
    /const sourceFrom = observedCache[\s\S]*?observedCache\.through - CURRENT_HOUR_MAXIMUM_OVERLAP_MS/,
    "a hora aberta não deve ser relida integralmente a cada minuto",
  );
  assert.match(
    source,
    /const minutePath = occupancyAggregatePath\(\s*scenario\.id,\s*sourceFrom,\s*minuteRange\.to,\s*"minute",?\s*\)[\s\S]*?path: minutePath/,
  );
  assert.match(
    source,
    /CURRENT_HOUR_MAXIMUM_RETRY_DELAYS_MS[\s\S]*?retryAt:/,
    "falhas da borda aberta precisam de backoff",
  );
});

test("falha fria dos máximos restaura auditoria e agenda backoff", () => {
  assert.match(
    source,
    /else if \(fullRefresh\) \{\s*maximumTrendFullRefreshRef\.current\.delete\(cacheKey\)/,
    "falha não pode certificar uma tentativa vazia por 24 horas",
  );
  assert.match(
    source,
    /SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES[\s\S]*?MAXIMUM_TREND_RETRY_DELAYS_MS/,
  );
});

test("comparativos sem seleção explícita preservam todos os cenários ativos", () => {
  const manyScenarios = Array.from({ length: 37 }, (_, index) => ({
    active: true,
    id: `scenario-${index + 1}`,
  }));
  assert.deepEqual(
    selection.resolveOccupancyComparisonInheritedScenarioIds({
      configuredScenarioIds: [],
      focusScenarioId: "scenario-19",
      scenarios: manyScenarios,
    }),
    manyScenarios.map((scenario) => scenario.id),
  );
  assert.deepEqual(
    selection.resolveOccupancyComparisonInheritedScenarioIds({
      configuredScenarioIds: ["scenario-3", "scenario-7"],
      focusScenarioId: "scenario-19",
      scenarios: manyScenarios,
    }),
    ["scenario-3", "scenario-7"],
  );
  assert.deepEqual(
    selection.resolveOccupancyComparisonInheritedScenarioIds({
      configuredScenarioIds: [],
      focusScenarioId: "removed",
      scenarios: [
        { active: false, id: "inactive" },
        { active: true, id: "active" },
      ],
    }),
    ["active"],
  );
});

function preference(id: RuntimeFixture, scenarioIds: RuntimeFixture, visible = true) {
  return { id, visible, scenarioSelectionMode: "custom", scenarioIds };
}
function plan(preferences: RuntimeFixture, overrides: Record<string, RuntimeFixture> = {}) {
  return selection.buildOccupancyComparisonSelectionPlan({
    scenarios,
    preferences,
    inheritedScenarioIds: ["b", "a"],
    inheritedHeatmapScenarioId: "a",
    hexScenarioIds: ["d"],
    ...overrides,
  });
}

test("cada comparativo preserva sua composição sem modificar os demais", () => {
  const result = plan([
    preference(ids[0], ["c"]), preference(ids[1], ["a", "b"]),
    preference(ids[2], ["d"]), preference(ids[3], ["b"]),
    preference(ids[4], ["c"]), preference(ids[5], ["a"]),
    preference(ids[6], ["b", "d"]),
  ]);
  assert.deepEqual(result.byCard.get(ids[0]), ["c"]);
  assert.deepEqual(result.byCard.get(ids[1]), ["a", "b"]);
  assert.deepEqual(result.byCard.get(ids[2]), ["d"]);
  assert.deepEqual(result.byCard.get(ids[3]), ["b"]);
  assert.deepEqual(result.byCard.get(ids[4]), ["c"]);
  assert.deepEqual(result.byCard.get(ids[5]), ["a"]);
  assert.deepEqual(result.byCard.get(ids[6]), ["b", "d"]);
});

test("ordem manual é independente da composição e não amplia as consultas", () => {
  const result = plan([
    {
      id: "occupancy_scenario_half_donut",
      scenarioOrder: ["c", "a"],
      scenarioSelectionMode: "all",
      visible: true,
    },
    {
      id: "occupancy_scenario_max_hour",
      scenarioIds: ["a", "c"],
      scenarioOrder: ["c", "a"],
      scenarioSelectionMode: "custom",
      visible: true,
    },
  ]);
  assert.deepEqual(result.byCard.get("occupancy_scenario_half_donut"), [
    "c",
    "a",
    "b",
    "d",
  ]);
  assert.deepEqual(result.byCard.get("occupancy_scenario_max_hour"), [
    "c",
    "a",
  ]);
  assert.deepEqual(result.snapshots, ["a", "b", "c", "d"]);
  assert.deepEqual(result.hourly, ["a", "c"]);
});

test("visões antigas herdam a seleção salva e o cenário legado do heatmap diário", () => {
  const result = plan(ids.map((id: RuntimeFixture) => ({ id, visible: true })));
  for (const id of ids.filter((id: RuntimeFixture) => id !== "occupancy_day_hour_heatmap")) {
    assert.deepEqual(result.byCard.get(id), ["b", "a"]);
  }
  assert.deepEqual(result.byCard.get("occupancy_day_hour_heatmap"), ["a"]);
});

test("seleção vazia explícita não volta a todos nem consulta fontes", () => {
  const result = plan(ids.map((id: RuntimeFixture) => preference(id, [])));
  for (const id of ids) assert.deepEqual(result.byCard.get(id), []);
  for (const family of ["snapshots", "hourly", "currentHour", "trends"]) {
    assert.deepEqual(result[family], []);
  }
});

test("requisições são deduplicadas e limitadas à família de widgets visíveis", () => {
  const result = plan([
    preference("occupancy_scenario_half_donut", ["a"]),
    preference("occupancy_scenario_bar_race", ["a"]),
    preference("occupancy_day_hour_heatmap", ["b"]),
    preference("occupancy_scenario_max_month", ["c"]),
    preference("occupancy_scenario_max_year", ["d"], false),
    preference("occupancy_scenario_max_hour", ["d"], false),
  ]);
  assert.deepEqual(result.snapshots, ["a", "c"]);
  assert.deepEqual(result.hourly, ["b"]);
  assert.deepEqual(result.currentHour, ["c"]);
  assert.deepEqual(result.trends, ["c"]);
  const monthOnly = plan([preference("occupancy_scenario_max_month", ["c"])]);
  assert.deepEqual(monthOnly.snapshots, ["c"]);
  assert.deepEqual(monthOnly.currentHour, ["c"]);
  assert.deepEqual(monthOnly.trends, ["c"]);
});

test("mapa por cenários reutiliza a fonte horária somente na granularidade hora", () => {
  const preferences = [
    preference("occupancy_scenario_hour_heatmap", ["c"]),
  ];
  const hourly = plan(preferences, { scenarioHeatmapGranularity: "hour" });
  assert.deepEqual(hourly.byCard.get("occupancy_scenario_hour_heatmap"), [
    "c",
  ]);
  assert.deepEqual(hourly.hourly, ["c"]);

  for (const granularity of ["minute", "day", "week", "month"]) {
    const independent = plan(preferences, {
      scenarioHeatmapGranularity: granularity,
    });
    assert.deepEqual(
      independent.byCard.get("occupancy_scenario_hour_heatmap"),
      ["c"],
    );
    assert.deepEqual(
      independent.hourly,
      [],
      `${granularity}: a fonte horária não pode ser consultada sem demanda`,
    );
  }
});

test("máximo anual não amplia consultas horárias de outro widget", () => {
  const result = plan([
    preference("occupancy_scenario_max_year", ["c"]),
    preference("occupancy_scenario_max_hour", ["b"]),
  ]);
  assert.deepEqual(result.hourly, ["b"]);
  assert.deepEqual(result.currentHour, ["b", "c"]);
  assert.deepEqual(result.trends, ["c"]);
  assert.deepEqual(result.snapshots, ["b", "c"]);
});

test("hexágonos preservam vínculos próprios e não ampliam séries históricas", () => {
  const result = plan([{ id: "occupancy_hex_layout", visible: true }]);
  assert.deepEqual(result.snapshots, ["d"]);
  assert.deepEqual(result.hourly, []);
  assert.deepEqual(result.currentHour, []);
  assert.deepEqual(result.trends, []);
});

test("exportação inclui card visível fora da viewport e preserva sua seleção e ordem", () => {
  const report = selection.buildOccupancyComparisonReportSelectionPlan({
    scenarios,
    preferences: [
      {
        id: "occupancy_scenario_half_donut",
        scenarioIds: ["a"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
      {
        id: "occupancy_scenario_max_month",
        scenarioIds: ["c", "a"],
        scenarioOrder: ["c", "a"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
      {
        id: "occupancy_scenario_max_year",
        scenarioIds: ["d"],
        scenarioSelectionMode: "custom",
        visible: false,
      },
    ],
    inheritedScenarioIds: ["b", "a"],
    inheritedHeatmapScenarioId: "a",
    hexScenarioIds: ["d"],
  });

  assert.deepEqual(report.visibleCardIds, [
    "occupancy_scenario_half_donut",
    "occupancy_scenario_max_month",
  ]);
  assert.deepEqual(
    report.byCard.get("occupancy_scenario_max_month"),
    ["c", "a"],
    "a ordem salva do card offscreen deve chegar intacta à exportação",
  );
  assert.deepEqual(report.snapshots, ["a", "c"]);
  assert.deepEqual(report.trends, ["a", "c"]);
  assert.ok(!report.trends.includes("d"), "card oculto não pode solicitar rede");
});

test("loader explícito do relatório não herda viewport nem cria polling", () => {
  const start = source.indexOf(
    "const loadReportSnapshot = React.useCallback",
  );
  const end = source.indexOf("\n  return {\n    cards,", start);
  assert.ok(start >= 0 && end > start);
  const loader = source.slice(start, end);

  assert.match(
    loader,
    /buildOccupancyComparisonReportSelectionPlan\(\{[\s\S]*?preferences: reportPreferences,/,
    "o relatório deve partir das preferências completas, não da demanda virtualizada",
  );
  assert.doesNotMatch(loader, /requestedPreferences|requestedCardIds/);
  assert.match(loader, /await Promise\.all\(\[/);
  assert.match(loader, /loadOccupancyComparisonReportSnapshots\(/);
  assert.match(loader, /loadOccupancyComparisonReportAggregate\(/);
  assert.doesNotMatch(loader, /setTimeout|setInterval|scheduleNext/);
  assert.match(
    dashboardSource,
    /preferences: secondaryOccupancyPreferences,[\s\S]*?reportPreferences: hydratedOccupancyPreferences/,
    "a exportação deve receber preferências completas mesmo antes de um card entrar na viewport",
  );
  assert.match(
    dashboardSource,
    /loadOccupancyComparisonReportAssets\(signal\)[\s\S]*?occupancyLoitering\.loadReportAssets\(signal\)[\s\S]*?loadOccupancyDurationReportSnapshot\(signal\)/,
    "a exportação deve aguardar o snapshot explícito dos comparativos",
  );
  assert.match(
    source,
    /scenarioId: OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID,[\s\S]*?signal,[\s\S]*?timeZone/,
    "o snapshot de exportação deve compartilhar a mesma identidade de transporte dos demais consumidores",
  );
});

test("IDs de outra empresa, removidos ou duplicados não entram na seleção", () => {
  const result = plan([preference(ids[0], ["foreign", "c", "c", "a"])]);
  assert.deepEqual(result.byCard.get(ids[0]), ["c", "a"]);
  assert.deepEqual(result.snapshots, ["a", "c"]);
});

test("todos respeita cenários disponíveis; mapa diário mantém apenas um cenário", () => {
  const result = plan([
    { id: ids[0], visible: true, scenarioSelectionMode: "all" },
    preference("occupancy_day_hour_heatmap", ["c", "b"]),
  ]);
  assert.deepEqual(result.byCard.get(ids[0]), ["a", "b", "c", "d"]);
  assert.deepEqual(result.byCard.get("occupancy_day_hour_heatmap"), ["c"]);
});

test("filtro preserva ordem e zeros sem introduzir linhas de outro widget", () => {
  const rows = [{ scenarioId: "a", total: 9 }, { scenarioId: "b", total: 0 }, { scenarioId: "c", total: 7 }];
  assert.deepEqual(selection.filterOccupancyComparisonRows(rows, ["b", "a"]), [rows[1], rows[0]]);
  assert.deepEqual(selection.filterOccupancyComparisonRows(rows, []), []);
  assert.deepEqual(rows.map((row) => row.total), [9, 0, 7]);
});

test("comparativos usam o inspetor comum, sem segundo seletor compartilhado no cabeçalho", () => {
  assert.doesNotMatch(source, /ScenarioScopeDialog|onScenarioIdsChange|commonScopeProps/);
  assert.equal((source.match(/\.\.\.scenarioCardDefaults/g) ?? []).length, 7);
  assert.equal((source.match(/node: \(context\) =>/g) ?? []).length, 7);
  assert.match(source, /scenarioConfigurable: true/);
  assert.match(source, /scenarioSelectionPolicy: "single"/);
  assert.match(
    source,
    /id: "occupancy_scenario_bar_race"[\s\S]*?scenarioOrderingDisabled: true/,
  );
  assert.equal((source.match(/configurationContent: !monitorMode/g) ?? []).length, 4);
});

test("foco pendente fora da seleção não bloqueia nem contamina séries horárias", () => {
  const declarations = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = declarations.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "resolveSharedOccupancyHourlyAggregate");
  assert.ok(declaration, "a função real deve continuar disponível para o teste");
  const compiled = ts.transpileModule(`${declaration.getText(declarations)}\nmodule.exports = resolveSharedOccupancyHourlyAggregate;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("module", "sameOccupancyRange", "occupancyAggregateBucketKey", compiled)(loaded,
    (a: RuntimeFixture, b: RuntimeFixture) => a.from.getTime() === b.from.getTime() && a.to.getTime() === b.to.getTime(),
    (date: RuntimeFixture) => date.getTime(),
  );
  const range = { buckets: [], from: new Date("2026-09-04T03:00:00Z"), to: new Date("2026-09-04T15:00:00Z") };
  const pendingSource = { ...range, series: null };
  assert.deepEqual(loaded.exports(pendingSource, "a", range, new Set(["b"])), { covered: false, series: null });
  assert.deepEqual(loaded.exports(pendingSource, "a", range, new Set(["a"])), { covered: true, series: null });
  const series = { scenarioId: "a", name: "Foco", metrics: new Map() };
  assert.deepEqual(loaded.exports({ ...range, series }, "a", range, new Set(["b"])), { covered: false, series: null });
  assert.equal(loaded.exports({ ...range, series }, "a", range, new Set(["a", "b"])).series, series);
  assert.match(source, /resolveSharedOccupancyHourlyAggregate\(\s*focusHourlyAggregateRef\.current,\s*focusScenarioId,\s*range,\s*requestedIds,/);
});

test("comparativo só permite bucket parcial enquanto o instante solicitado está dentro dele", () => {
  const declarations = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = declarations.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "occupancyComparisonOpenBucket");
  assert.ok(declaration, "o contrato da borda aberta deve continuar explícito");
  const compiled = ts.transpileModule(
    `${declaration.getText(declarations)}\nmodule.exports = occupancyComparisonOpenBucket;`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  const from = new Date("2026-09-11T03:00:00Z");
  const to = new Date("2026-09-12T03:00:00Z");
  new Function("module", "occupancyHistoricalBucketBounds", compiled)(
    loaded,
    () => ({ from, to }),
  );

  const bucket = new Date(2026, 8, 11);
  assert.equal(loaded.exports(bucket, "day", new Date("2026-09-11T15:00:00Z"), "America/Sao_Paulo"), bucket);
  assert.equal(loaded.exports(bucket, "day", new Date(to.getTime() - 1), "America/Sao_Paulo"), undefined,
    "o último milissegundo do histórico é um fechamento, não cobertura parcial certificada");
  assert.equal(loaded.exports(bucket, "day", to, "America/Sao_Paulo"), undefined);
  assert.equal(loaded.exports(bucket, "day", new Date(from.getTime() - 1), "America/Sao_Paulo"), undefined);
  assert.equal((source.match(/requestedAt: openBucket \? requestedAt : undefined/g) ?? []).length, 2,
    "a consulta e a validação só usam o instante parcial quando há bucket aberto");
});

test("comparativo exibe bucket aberto sem certificar a exportação", () => {
  const declarations = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = declarations.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "occupancyHistoricalAggregateIsComplete");
  assert.ok(declaration);
  const compiled = ts.transpileModule(
    `${declaration.getText(declarations)}\nmodule.exports = occupancyHistoricalAggregateIsComplete;`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("module", "occupancyAggregateBucketKey", "occupancyScenarioCoverageStart", "companyCalendarDate", compiled)(
    loaded,
    (bucket: Date) => bucket.getTime(),
    () => null,
    () => null,
  );
  const bucket = new Date("2026-09-11T03:00:00Z");
  const shared = {
    granularity: "day",
    range: { buckets: [bucket] },
    scenarioIds: ["scenario-a"],
  };
  const series = {
    metrics: new Map([[bucket.getTime(), { average: 3, minimum: 1, peak: 5 }]]),
    name: "Cenário A",
    scenarioId: "scenario-a",
  };
  assert.equal(loaded.exports({ ...shared, series: [series] }), true);
  assert.equal(loaded.exports({ ...shared, series: [{ ...series, provisional: true }] }), false);
});

test("consulta independente não reutiliza data antiga da leitura de outro cenário", () => {
  const snapshot = { scenarioId: "a", requestedAt: new Date("2026-09-01T03:00:00Z") };
  assert.equal(selection.selectOccupancyComparisonSharedSource(snapshot, "a", new Set(["b"])), null);
  assert.equal(selection.selectOccupancyComparisonSharedSource(snapshot, "b", new Set(["b"])), null);
  assert.equal(selection.selectOccupancyComparisonSharedSource(snapshot, "a", new Set(["a"])), snapshot);
  assert.equal(selection.selectOccupancyComparisonSharedSource(null, "a", new Set(["a"])), null);
  assert.match(
    source,
    /const candidateFocusSnapshot = selectOccupancyComparisonSharedSource\(\s*focusSnapshotRef\.current,\s*focusScenarioId,\s*requestedIds,/,
  );
  assert.match(source, /const requestedAt = new Date\(\)/);
  assert.match(
    source,
    /const sharedFocusSnapshot =[\s\S]*?candidateFocusSnapshot\.requestedAt\.getTime\(\) <\s*effectiveSnapshotRefreshMs/,
    "o comparativo só pode reutilizar a leitura focal ainda dentro do pulso atual",
  );
});

test("exportação usa os mesmos cenários independentes, inclusive seleção vazia", () => {
  const declarations = ts.createSourceFile("comparison.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = declarations.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildOccupancyComparisonReportAssets");
  assert.ok(declaration, "a função real de exportação deve continuar disponível");
  const helpers = {
    ...load("lib/occupancy-comparison.ts"),
    ...load("lib/occupancy-aggregate-validation.ts"),
    ...load("lib/occupancy-color-palettes.ts"),
    ...load("lib/occupancy-widget-settings.ts"),
    ...load("lib/occupancy-hex-layout.ts"),
    ...load("lib/occupancy-hex-palette.ts"),
    ...load("lib/occupancy-hex-visual.ts"),
    ...load("lib/occupancy-scenario-heatmap.ts"),
    ...selection,
    buildCurrentComparisonBarOption: () => ({}),
    buildCurrentComparisonVerticalBarOption: () => ({}),
    buildHalfDonutOption: () => ({}),
    buildLiveBarRaceOption: () => ({}),
    buildMaximumLineSeries: ({ series }: RuntimeFixture) => series,
    buildMaximumReportAsset: ({ cardId, series }: RuntimeFixture) => ({ cardId, chart: { table: { rows: series.map((item: RuntimeFixture) => ({ scenario: item.name })) } } }),
    buildHexLayoutOption: () => ({}),
    buildHeatmapOption: () => ({}),
    heatmapCellsMaximum: () => 1,
    joinMessages: (...messages: Array<string | undefined>) =>
      messages.filter(Boolean).join(" ") || undefined,
    sharedHeatmapMaximum: () => 1,
    scenarioHeatmapCertificationLabel: (value: RuntimeFixture) =>
      value === null ? "Sem dados" : "Disponível",
    formatHeatmapDateKey: (value: RuntimeFixture) => value,
    formatDateTime: (value: RuntimeFixture) => value,
    metricLabel: (value: RuntimeFixture) => value,
    comparisonStateLabel: (value: RuntimeFixture) => value,
    occupancyStateLabel: (value: RuntimeFixture) => value,
  };
  const compiled = ts.transpileModule(`${declaration.getText(declarations)}\nmodule.exports = buildOccupancyComparisonReportAssets;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  new Function("module", ...Object.keys(helpers), compiled)(loaded, ...Object.values(helpers));
  const series = scenarios.map((scenario) => ({ scenarioId: scenario.id, name: scenario.name, metrics: new Map() }));
  const selectionsByCard = new Map(ids.map((id: RuntimeFixture) => [id, []]));
  selectionsByCard.set(ids[0], ["c", "a", "b"]);
  selectionsByCard.set(ids[1], ["c"]);
  selectionsByCard.set(ids[3], ["b"]);
  const reports = loaded.exports({
    aggregateBuckets: [], aggregateSeries: series, currentHourBucket: null,
    currentHourSeries: [], heatmapScenarioId: "a", hexSnapshots: [],
    hourlyMaximumBuckets: [], hourlyMaximumSeries: series,
    maximumTrendRanges: null, maximumTrendSeries: series,
    scenarioHeatmapBuckets: [], scenarioHeatmapSeries: series,
    scenarioHourHeatmapDateKey: "",
    scenarios, selectionsByCard, selectedScenarioIds: ["a", "b", "c", "d"],
    settings: load("lib/occupancy-widget-settings.ts").DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
    snapshots: scenarios.map((scenario, index) => ({
      scenarioId: scenario.id,
      name: scenario.name,
      occupied: true,
      total: index + 1,
    })),
  });
  const byId = new Map<string, RuntimeFixture>(reports.map((report: RuntimeFixture) => [report.cardId, report.chart.table.rows]));
  assert.deepEqual(byId.get(ids[0]).map((row: RuntimeFixture) => row.scenario), [
    "Cenário c",
    "Cenário a",
    "Cenário b",
  ]);
  assert.deepEqual(byId.get(ids[1]).map((row: RuntimeFixture) => row.scenario), ["Cenário c"]);
  assert.deepEqual(byId.get(ids[2]), []);
  assert.deepEqual(byId.get(ids[3]).map((row: RuntimeFixture) => row.scenario), ["Cenário b"]);
  assert.deepEqual(byId.get(ids[4]), []);
  assert.deepEqual(byId.get(ids[5]), []);
  assert.deepEqual(byId.get(ids[6]), []);
});

function load(path: string): RuntimeFixture {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  modules.set(path, loaded);
  const output = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: path }).outputText;
  new Function("exports", "require", "module", output)(loaded.exports, (specifier: string) => specifier.startsWith("@/") ? load(`${specifier.slice(2)}.ts`) : require(specifier), loaded);
  return loaded.exports;
}
