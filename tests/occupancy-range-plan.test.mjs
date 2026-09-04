import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resolution = loadTypeScriptModule(
  "lib/occupancy-analysis-resolution.ts",
);
const aggregateTime = loadTypeScriptModule("lib/aggregate-time.ts");

test("intervalos curtos permanecem integralmente diários", () => {
  const from = new Date(2026, 0, 1);
  const to = new Date(2026, 2, 4);
  const plan = resolution.buildOccupancyAnalysisResolutionPlan(from, to, 62);

  assert.equal(plan.primaryGranularity, "day");
  assert.equal(plan.pointCount, 62);
  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].granularity, "day");
  assert.equal(plan.segments[0].from.getTime(), from.getTime());
  assert.equal(plan.segments[0].to.getTime(), to.getTime());
});

test("intervalos médios usam semanas completas e preservam bordas diárias", () => {
  const from = new Date(2026, 0, 7); // quarta-feira
  const to = new Date(2026, 3, 8); // exclusivo; último dia é terça-feira
  const plan = resolution.buildOccupancyAnalysisResolutionPlan(from, to, 91);

  assert.equal(plan.primaryGranularity, "week");
  assert.deepEqual(
    plan.segments.map((segment) => segment.granularity),
    ["day", "week", "day"],
  );
  assertPlanIsContinuous(plan, from, to);
  assert.deepEqual(localDateParts(plan.segments[1].from), [2026, 1, 12]);
  assert.equal(plan.segments[1].from.getDay(), 1);
  assert.equal(plan.segments[1].to.getDay(), 1);
  assert.deepEqual(
    localDateParts(plan.segments.at(-1).bucketStarts.at(-1)),
    [2026, 4, 7],
    "o último dia nunca pode ser absorvido por uma semana fechada",
  );
  assert.ok(plan.pointCount < 40);
});

test("intervalos longos usam meses completos sem sair do filtro", () => {
  const from = new Date(2025, 7, 18);
  const to = new Date(2026, 7, 19);
  const plan = resolution.buildOccupancyAnalysisResolutionPlan(from, to, 366);

  assert.equal(plan.primaryGranularity, "month");
  assert.deepEqual(
    plan.segments.map((segment) => segment.granularity),
    ["day", "month", "day"],
  );
  assertPlanIsContinuous(plan, from, to);
  assert.deepEqual(localDateParts(plan.segments[1].from), [2025, 9, 1]);
  assert.deepEqual(localDateParts(plan.segments[1].to), [2026, 8, 1]);
  assert.deepEqual(
    localDateParts(plan.segments.at(-1).bucketStarts.at(-1)),
    [2026, 8, 18],
  );
  assert.ok(
    plan.pointCount <= 73,
    `o plano anual retornou ${plan.pointCount} pontos em vez de no máximo 73`,
  );
});

test("o plano usa dias civis e rejeita dayCount divergente", () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const from = new Date(2026, 2, 1);
    const to = new Date(2026, 8, 2);
    const plan = resolution.buildOccupancyAnalysisResolutionPlan(
      from,
      to,
      185,
    );
    assert.equal(plan.primaryGranularity, "month");
    assertPlanIsContinuous(plan, from, to);
    assert.throws(
      () =>
        resolution.buildOccupancyAnalysisResolutionPlan(from, to, 184),
      /quantidade de dias não corresponde ao intervalo civil/,
    );
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("cache fechado reutiliza refresh curto e revisa dados históricos", () => {
  const recentEnd = new Date("2026-08-18T12:00:00.000Z");
  const recentFirst = new Date("2026-08-18T12:15:00.000Z");
  const recentSameRevision = new Date("2026-08-18T12:15:59.000Z");
  const recentNextRevision = new Date("2026-08-18T12:30:00.000Z");
  assert.equal(
    resolution.occupancyAnalysisClosedSegmentRevision(
      recentEnd,
      recentFirst,
    ),
    resolution.occupancyAnalysisClosedSegmentRevision(
      recentEnd,
      recentSameRevision,
    ),
  );
  assert.notEqual(
    resolution.occupancyAnalysisClosedSegmentRevision(
      recentEnd,
      recentFirst,
    ),
    resolution.occupancyAnalysisClosedSegmentRevision(
      recentEnd,
      recentNextRevision,
    ),
  );

  const historicalEnd = new Date("2026-01-01T00:00:00.000Z");
  const historicalFirst = new Date("2026-08-18T01:00:00.000Z");
  const historicalSameRevision = new Date("2026-08-18T23:59:00.000Z");
  const historicalNextRevision = new Date("2026-08-19T00:00:00.000Z");
  assert.equal(
    resolution.occupancyAnalysisClosedSegmentRevision(
      historicalEnd,
      historicalFirst,
    ),
    resolution.occupancyAnalysisClosedSegmentRevision(
      historicalEnd,
      historicalSameRevision,
    ),
  );
  assert.notEqual(
    resolution.occupancyAnalysisClosedSegmentRevision(
      historicalEnd,
      historicalFirst,
    ),
    resolution.occupancyAnalysisClosedSegmentRevision(
      historicalEnd,
      historicalNextRevision,
    ),
  );
});

test("dashboard consulta segmentos por granularidade e só cacheia cobertura fechada certificada", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /buildOccupancyAnalysisResolutionPlan/);
  assert.match(
    source,
    /comparisonSegments = listDefinitionQuerySegments\(definition\)\.map\([\s\S]*?granularity: segment\.granularity/,
  );
  assert.match(
    source,
    /Meses completos usam o mesmo mês do ano anterior; bordas diárias usam os mesmos dias da semana anterior/,
  );
  assert.match(source, /Base comparativa \(\$\{escapeHtml\(previous\.label\)\}\)/);
  assert.match(
    source,
    /occupancyScenarioAggregatePath\(scope\.scenario!\.id, segmentDefinition\)/,
  );
  assert.match(
    source,
    /listDefinitionBucketDescriptors\(definition\)[\s\S]*?bucketLabel\(bucketStart, granularity\)/,
  );
  assert.match(
    source,
    /segment\.openBucket \|\|[\s\S]*?state\.warning \|\|[\s\S]*?!state\.points\.every/,
    "ausência/parcial nunca deve entrar no cache de segmentos fechados",
  );
  assert.match(
    source,
    /closedSegmentCache\?\.get\(cacheKey\)[\s\S]*?if \(cached\) return cached/,
    "refresh deve reutilizar segmentos históricos certificados",
  );
  assert.match(source, /occupancyAnalysisClosedSegmentRevision/);
  assert.match(source, /startOfCompanyTimeZoneHour\(openAt, companyTimeZone\)/);
  assert.match(source, /endOfCompanyTimeZoneHour\(reference, companyTimeZone\)/);
  assert.match(
    source,
    /function startOfMinute\(date: Date\) \{\s*return startOfAggregateBucket\(date, "minute"\);\s*\}/,
    "o minuto deve ser truncado como instante absoluto para não colapsar a hora DST repetida",
  );
  assert.match(
    source,
    /if \(forceClosedRefresh\) \{[\s\S]*?closedSegmentCacheRef\.current\.clear\(\)/,
    "a atualização manual deve invalidar deliberadamente o cache histórico",
  );
  assert.match(
    source,
    /const completeCoverage =[\s\S]*?average: completeCoverage \? latest\.average : null[\s\S]*?current: completeCoverage \? latest\.current : null/,
    "KPIs não podem publicar final/média do último chunk com lacunas no intervalo",
  );
  assert.match(
    source,
    /function buildScenarioPoints[\s\S]*?return \{\s*\/\/ Os segmentos fechado e aberto[\s\S]*?points,\s*warning:/,
    "cada segmento horário deve permanecer cru até a união final",
  );
  assert.match(
    source,
    /function mergeOccupancyReportSegmentStates[\s\S]*?points: occupancyReportDisplayPoints\([\s\S]*?states\.flatMap/,
    "o eixo fixo de 24 horas deve ser aplicado uma única vez após unir os segmentos",
  );
});

test("minuto aberto preserva a segunda ocorrência da hora repetida", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const first = aggregateTime.startOfAggregateBucket(
      new Date("2026-11-01T05:30:45Z"),
      "minute",
    );
    const second = aggregateTime.startOfAggregateBucket(
      new Date("2026-11-01T06:30:45Z"),
      "minute",
    );

    assert.equal(first.toISOString(), "2026-11-01T05:30:00.000Z");
    assert.equal(second.toISOString(), "2026-11-01T06:30:00.000Z");
    assert.notEqual(first.getTime(), second.getTime());
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

function assertPlanIsContinuous(plan, from, to) {
  assert.equal(plan.segments[0].from.getTime(), from.getTime());
  assert.equal(plan.segments.at(-1).to.getTime(), to.getTime());
  plan.segments.forEach((segment, index) => {
    assert.ok(segment.bucketStarts.length > 0);
    assert.equal(segment.bucketStarts[0].getTime(), segment.from.getTime());
    if (index > 0) {
      assert.equal(
        plan.segments[index - 1].to.getTime(),
        segment.from.getTime(),
      );
    }
  });
}

function localDateParts(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
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
    createRequire(filename),
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
