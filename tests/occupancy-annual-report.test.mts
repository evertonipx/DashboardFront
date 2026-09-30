import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createModuleLoader } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const annual = createModuleLoader(projectRoot)("lib/occupancy-annual-report.ts");
const currentAt = new Date("2026-09-29T12:00:00.000Z");

function point(year: number, month: number, average: number, peak = average, complete = true) {
  return { year, month, average, minimum: 0, peak, complete };
}

function report(monthlyPoints: object[], overrides: Record<string, unknown> = {}) {
  return annual.buildOccupancyAnnualReport({
    currentAt,
    monthlyPoints,
    selectedYear: 2026,
    timeZone: "America/Sao_Paulo",
    ...overrides,
  });
}

test("exibe 12 meses e quatro anos sem transformar ausência de dados em zero", () => {
  const result = report([
    point(2026, 1, 0),
    point(2025, 1, 5),
    point(2026, 8, 10, 14),
    point(2025, 8, 5, 8),
    point(2026, 9, 8, 9),
    point(2025, 9, 4, 7),
  ]);

  assert.deepEqual(result.years, [2026, 2025, 2024, 2023]);
  assert.equal(result.rows.length, 12);
  assert.deepEqual(result.rows.map((row: { label: string }) => row.label), [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ]);
  assert.equal(result.rows[0].values[0].status, "complete");
  assert.equal(result.rows[0].values[0].average, 0);
  assert.equal(result.rows[1].values[0].status, "missing");
  assert.equal(result.rows[1].values[0].average, null);
  assert.equal(result.rows[8].values[0].status, "partial");
  assert.equal(result.rows[9].values[0].status, "future");
  assert.equal(result.rows[0].values[2].status, "missing");
  assert.equal(result.rows[0].values[2].average, null);
});

test("compara apenas o mesmo mês completo e reserva a diferença percentual quando a base é zero", () => {
  const result = report([
    point(2026, 1, 0), point(2025, 1, 5),
    point(2026, 2, 4), point(2025, 2, 0),
    point(2026, 8, 10), point(2025, 8, 5),
    point(2026, 9, 8), point(2025, 9, 4),
    point(2026, 7, 7, 9, false), point(2025, 7, 3),
  ]);

  assert.equal(result.rows[0].comparisons[0].absoluteAverageChange, -5);
  assert.equal(result.rows[0].comparisons[0].percentageAverageChange, -100);
  assert.equal(result.rows[1].comparisons[0].absoluteAverageChange, 4);
  assert.equal(result.rows[1].comparisons[0].percentageAverageChange, null);
  assert.equal(result.rows[6].comparisons[0].absoluteAverageChange, null);
  assert.equal(result.rows[8].comparisons[0].absoluteAverageChange, null);
  assert.equal(result.rows[0].comparisons[1].absoluteAverageChange, null);
});

test("resume mês atual como parcial sem contaminar comparativos por meses fechados pareados", () => {
  const result = report([
    point(2026, 1, 0, 2), point(2025, 1, 5, 7),
    point(2026, 8, 10, 14), point(2025, 8, 5, 8),
    point(2026, 9, 8, 20),
  ]);

  assert.deepEqual(result.summaries[0], {
    completeMonthCount: 2,
    isComplete: false,
    monthlyAverage: 6,
    observedMonthCount: 3,
    peak: 20,
    year: 2026,
  });
  assert.deepEqual(result.comparisonSummaries[0], {
    absoluteMonthlyAverageChange: 0,
    baselineMonthlyAverage: 5,
    baselineYear: 2025,
    matchedMonthCount: 2,
    percentageMonthlyAverageChange: 0,
    selectedMonthlyAverage: 5,
    selectedYear: 2026,
  });
  assert.equal(result.comparisonSummaries[1].matchedMonthCount, 0);
  assert.equal(result.comparisonSummaries[1].selectedMonthlyAverage, null);
  assert.equal(result.comparisonSummaries[1].percentageMonthlyAverageChange, null);
});

test("inclui todo o histórico configurado e preserva o ano e mês atuais", () => {
  const result = report([
    point(2019, 8, 3, 5),
    point(2025, 9, 7, 9),
    point(2026, 9, 11, 15),
  ], { startYear: 2019 });
  assert.deepEqual(result.years, [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  assert.equal(result.rows[7].values.at(-1).average, 3);
  assert.equal(result.rows[8].values[0].status, "partial");
  assert.equal(result.rows[8].values[0].average, 11);
  assert.equal(result.summaries[0].monthlyAverage, 11);
  assert.equal(result.summaries[0].peak, 15);
  assert.equal(result.summaries[0].isComplete, false);
  assert.equal(result.rows[8].comparisons[0].percentageAverageChange, null);
});

test("média/min/max mensal não é convertida em taxa de tempo ocupado", () => {
  const withoutTimeline = report([point(2026, 1, 3, 7)]);
  assert.equal(withoutTimeline.rows[0].values[0].time, null);

  const withTimeline = report([{
    ...point(2026, 1, 3, 7),
    time: {
      confirmedFreeSeconds: 40,
      confirmedOccupiedSeconds: 60,
      expectedSeconds: 200,
      observedSeconds: 120,
    },
  }]);
  assert.deepEqual(withTimeline.rows[0].values[0].time, {
    confirmedFreeSeconds: 40,
    confirmedOccupiedSeconds: 60,
    expectedSeconds: 200,
    observedSeconds: 120,
    confirmedCoverageShare: 0.5,
    coverageShare: 0.6,
    freeShareOfConfirmed: 0.4,
    occupiedShareOfConfirmed: 0.6,
  });
});

test("usa o mês civil da empresa ao marcar período corrente/futuro", () => {
  // Em São Paulo o instante já é 31/dez/2026 às 22h, não janeiro de 2027.
  const result = report([point(2026, 12, 3)], {
    currentAt: new Date("2027-01-01T01:00:00.000Z"),
  });
  assert.equal(result.rows[11].values[0].status, "partial");
  assert.equal(result.rows[10].values[0].status, "missing");
});

test("rejeita duplicatas, métricas impossíveis, dados futuros e duração incoerente", () => {
  assert.throws(() => report([point(2026, 1, 1), point(2026, 1, 2)]), /duplicado/);
  assert.throws(() => report([{ ...point(2026, 1, 2), minimum: 3 }]), /fora de ordem/);
  assert.throws(() => report([point(2026, 10, 1)]), /mês futuro/);
  assert.throws(() => report([{
    ...point(2026, 1, 1),
    time: {
      confirmedFreeSeconds: 20,
      confirmedOccupiedSeconds: 100,
      expectedSeconds: 100,
      observedSeconds: 100,
    },
  }]), /inconsistente/);
});
