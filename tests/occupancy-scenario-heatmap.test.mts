import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createModuleLoader,
  type RuntimeFixture,
} from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = createModuleLoader(projectRoot);
const heatmap = load<
  typeof import("../lib/occupancy-scenario-heatmap.ts")
>("lib/occupancy-scenario-heatmap.ts");
const aggregate = load<
  typeof import("../lib/occupancy-aggregate-validation.ts")
>("lib/occupancy-aggregate-validation.ts");

const companyTimeZone = "America/Sao_Paulo";
const now = new Date("2026-09-16T15:42:37.000Z");

test("rótulos descrevem claramente cada granularidade e janela", () => {
  const expected = {
    day: ["dias", "dias do mês"],
    hour: ["horários", "horários de 16/09/2026"],
    minute: ["minutos", "minutos do dia, de 00h a 24h"],
    month: ["meses", "meses do ano"],
    week: ["semanas", "semanas do ano"],
  } as const;
  for (const [granularity, [label, description]] of Object.entries(expected)) {
    assert.equal(
      heatmap.occupancyScenarioHeatmapGranularityLabel(
        granularity as keyof typeof expected,
      ),
      label,
    );
    assert.equal(
      heatmap.occupancyScenarioHeatmapPeriodDescription(
        granularity as keyof typeof expected,
        14,
        "2026-09-16",
      ),
      description,
    );
  }
});

test("intervalos por granularidade consultam só o decorrido no dia, mês e ano civis IANA", () => {
  withBrowserZone("Asia/Kolkata", () => {
    const minute = heatmap.buildOccupancyScenarioHeatmapRange(
      now,
      "minute",
      7,
      companyTimeZone,
    );
    assert.equal(minute.from.toISOString(), "2026-09-16T03:00:00.000Z");
    assert.equal(minute.to.toISOString(), "2026-09-16T15:43:00.000Z");
    assert.equal(minute.buckets.length, 763);
    assert.equal(minute.buckets[0].toISOString(), minute.from.toISOString());
    assert.equal(
      minute.buckets.at(-1)?.toISOString(),
      "2026-09-16T15:42:00.000Z",
    );

    const hour = heatmap.buildOccupancyScenarioHeatmapRange(
      now,
      "hour",
      7,
      companyTimeZone,
    );
    assert.equal(hour.from.toISOString(), "2026-09-10T03:00:00.000Z");
    assert.equal(hour.to.toISOString(), "2026-09-16T16:00:00.000Z");
    assert.equal(hour.buckets.length, 6 * 24 + 13);

    const day = heatmap.buildOccupancyScenarioHeatmapRange(
      now,
      "day",
      7,
      companyTimeZone,
    );
    assert.deepEqual(
      day.buckets.map(calendarKey),
      Array.from({ length: 16 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`),
    );
    assert.equal(calendarKey(day.from), "2026-09-01");
    assert.equal(calendarKey(day.to), "2026-09-17");

    const week = heatmap.buildOccupancyScenarioHeatmapRange(
      now,
      "week",
      30,
      companyTimeZone,
    );
    assert.equal(calendarKey(week.from), "2025-12-29");
    assert.equal(calendarKey(week.to), "2026-09-21");
    assert.equal(calendarKey(week.buckets.at(-1)!), "2026-09-14");
    assert.ok(
      week.buckets.every((bucket) => bucket.getDay() === 1),
      "todas as semanas civis devem iniciar na segunda-feira",
    );

    const month = heatmap.buildOccupancyScenarioHeatmapRange(
      now,
      "month",
      14,
      companyTimeZone,
    );
    assert.equal(month.buckets.length, 9);
    assert.equal(calendarKey(month.from), "2026-01-01");
    assert.equal(calendarKey(month.to), "2026-10-01");
  });
});

test("eixos fixos mostram períodos futuros sem requisitá-los ou inventar zero", () => {
  withBrowserZone("UTC", () => {
    for (const [granularity, expectedAxisLength] of [
      ["minute", 1440],
      ["day", 30],
      ["week", 53],
      ["month", 12],
    ] as const) {
      const range = heatmap.buildOccupancyScenarioHeatmapRange(
        now,
        granularity,
        7,
        companyTimeZone,
      );
      const axisBuckets = heatmap.buildOccupancyScenarioHeatmapAxisBuckets(
        now,
        granularity,
        companyTimeZone,
      );
      assert.equal(axisBuckets.length, expectedAxisLength);
      assert.ok(range.buckets.length < axisBuckets.length);
      const latest = range.buckets.at(-1)!;
      const key = aggregate.occupancyAggregateBucketKey(latest, granularity);
      const matrix = heatmap.buildOccupancyScenarioPeriodHeatmap({
        axisBuckets,
        buckets: range.buckets,
        granularity,
        metric: "peak",
        series: [{
          metrics: new Map([[key, { average: 3, minimum: 0, peak: 7 }]]),
          name: "Entrada",
          scenarioId: "scenario-a",
        }],
        timeZone: companyTimeZone,
      });
      assert.equal(matrix.labels.length, expectedAxisLength);
      assert.equal(matrix.cells.length, range.buckets.length);
      assert.equal(matrix.cells.at(-1)?.value, 7);
      assert.ok(matrix.cells.every((cell) => cell.y < range.buckets.length));
      assert.equal(matrix.cells.some((cell) => cell.y >= range.buckets.length), false);
    }
  });
});

test("eixo diário de minutos preserva as 23 ou 25 horas em mudanças de fuso", () => {
  withBrowserZone("UTC", () => {
    const timeZone = "America/New_York";
    const spring = new Date("2026-03-08T17:00:00.000Z");
    const fall = new Date("2026-11-01T17:00:00.000Z");
    const springAxis = heatmap.buildOccupancyScenarioHeatmapAxisBuckets(
      spring,
      "minute",
      timeZone,
    );
    const fallAxis = heatmap.buildOccupancyScenarioHeatmapAxisBuckets(
      fall,
      "minute",
      timeZone,
    );
    assert.equal(springAxis.length, 1_380);
    assert.equal(fallAxis.length, 1_500);
    const matrix = heatmap.buildOccupancyScenarioPeriodHeatmap({
      axisBuckets: fallAxis,
      buckets: heatmap.buildOccupancyScenarioHeatmapRange(
        fall,
        "minute",
        7,
        timeZone,
      ).buckets,
      granularity: "minute",
      metric: "peak",
      series: [],
      timeZone,
    });
    const repeated = matrix.labels.filter((label) => label.startsWith("01:30 ("));
    assert.equal(repeated.length, 2);
    assert.notEqual(repeated[0], repeated[1]);
  });
});

test("matriz por cenários suporta minuto, hora, dia, semana e mês sem confundir zero e ausência", () => {
  withBrowserZone("UTC", () => {
    const fixtures = [
      {
        buckets: [
          new Date("2026-09-16T15:41:00.000Z"),
          new Date("2026-09-16T15:42:00.000Z"),
        ],
        expectedLabels: ["12:41", "12:42"],
        granularity: "minute",
      },
      {
        buckets: [
          new Date("2026-09-16T03:00:00.000Z"),
          new Date("2026-09-16T04:00:00.000Z"),
        ],
        dateKey: "2026-09-16",
        expectedLabels: Array.from(
          { length: 24 },
          (_, hour) =>
            hour === 23 ? "23h–24h" : `${String(hour).padStart(2, "0")}h`,
        ),
        granularity: "hour",
      },
      {
        buckets: [new Date(2026, 8, 15), new Date(2026, 8, 16)],
        expectedLabels: ["ter. 15/09", "qua. 16/09"],
        granularity: "day",
      },
      {
        buckets: [new Date(2026, 8, 7), new Date(2026, 8, 14)],
        expectedLabels: ["Sem. 07/09", "Sem. 14/09"],
        granularity: "week",
      },
      {
        buckets: [new Date(2026, 7, 1), new Date(2026, 8, 1)],
        expectedLabels: ["ago./26", "set./26"],
        granularity: "month",
      },
    ] as const;

    for (const fixture of fixtures) {
      const [firstBucket, secondBucket] = fixture.buckets;
      const firstKey = aggregate.occupancyAggregateBucketKey(
        firstBucket,
        fixture.granularity,
      );
      const secondKey = aggregate.occupancyAggregateBucketKey(
        secondBucket,
        fixture.granularity,
      );
      const matrix = heatmap.buildOccupancyScenarioPeriodHeatmap({
        buckets: fixture.buckets,
        dateKey: "dateKey" in fixture ? fixture.dateKey : undefined,
        granularity: fixture.granularity,
        metric: "average",
        series: [
          {
            metrics: new Map([
              [firstKey, { average: 0, minimum: 0, peak: 3 }],
            ]),
            name: "Entrada",
            scenarioId: "scenario-a",
          },
          {
            metrics: new Map([
              [firstKey, { average: 4, minimum: 2, peak: 7 }],
              [secondKey, { average: 6, minimum: 5, peak: 9 }],
            ]),
            name: "Praça",
            scenarioId: "scenario-b",
          },
        ],
        timeZone: companyTimeZone,
      });

      assert.deepEqual(matrix.labels, fixture.expectedLabels);
      assert.deepEqual(matrix.scenarioNames, ["Entrada", "Praça"]);
      assert.deepEqual(
        matrix.cells.map(({ scenarioId, value, x, y }) => ({
          scenarioId,
          value,
          x,
          y,
        })),
        [
          { scenarioId: "scenario-a", value: 0, x: 0, y: 0 },
          { scenarioId: "scenario-a", value: null, x: 0, y: 1 },
          { scenarioId: "scenario-b", value: 4, x: 1, y: 0 },
          { scenarioId: "scenario-b", value: 6, x: 1, y: 1 },
        ],
        `${fixture.granularity}: a matriz deve preservar ordem, zero e lacuna`,
      );
    }
  });
});

test("métrica de pico usa diretamente o bucket certificado sem consolidar médias", () => {
  withBrowserZone("UTC", () => {
    const bucket = new Date(2026, 8, 16);
    const key = aggregate.occupancyAggregateBucketKey(bucket, "day");
    const matrix = heatmap.buildOccupancyScenarioPeriodHeatmap({
      buckets: [bucket],
      granularity: "day",
      metric: "peak",
      series: [
        {
          metrics: new Map([
            [key, { average: 2.5, minimum: 0, peak: 11 }],
          ]),
          name: "Entrada",
          scenarioId: "scenario-a",
        },
      ],
      timeZone: companyTimeZone,
    });
    assert.equal(matrix.cells[0].value, 11);
  });
});

test("virada de minuto finaliza o bucket anterior e mantém somente o minuto corrente aberto", () => {
  const firstRange = heatmap.buildOccupancyScenarioHeatmapRange(
    new Date("2026-09-16T15:42:37.000Z"),
    "minute",
    7,
    companyTimeZone,
  );
  const firstState =
    heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
      fullRefresh: true,
      granularity: "minute",
      previous: new Set<number>(),
      refreshedBuckets: firstRange.buckets,
      requestedBuckets: firstRange.buckets,
    });
  const firstOpenKey = aggregate.occupancyAggregateBucketKey(
    firstRange.buckets.at(-1)!,
    "minute",
  );
  assert.equal(firstState.attemptedBucketKeys.has(firstOpenKey), false);

  const nextRange = heatmap.buildOccupancyScenarioHeatmapRange(
    new Date("2026-09-16T15:43:02.000Z"),
    "minute",
    7,
    companyTimeZone,
  );
  const firstUnattemptedBucket = nextRange.buckets.find(
    (bucket) =>
      !firstState.attemptedBucketKeys.has(
        aggregate.occupancyAggregateBucketKey(bucket, "minute"),
      ),
  );
  assert.equal(firstUnattemptedBucket?.getTime(), firstRange.buckets.at(-1)?.getTime());
  const sourceBuckets = nextRange.buckets.filter(
    (bucket) => bucket.getTime() >= firstUnattemptedBucket!.getTime(),
  );
  assert.deepEqual(
    sourceBuckets.map((bucket) => bucket.toISOString()),
    nextRange.buckets.slice(-2).map((bucket) => bucket.toISOString()),
  );
  const nextState =
    heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
      fullRefresh: false,
      granularity: "minute",
      previous: firstState.attemptedBucketKeys,
      previousRetry: firstState.coverageRetryBucketKeys,
      refreshedBuckets: sourceBuckets,
      requestedBuckets: nextRange.buckets,
    });
  const nextOpenKey = aggregate.occupancyAggregateBucketKey(
    nextRange.buckets.at(-1)!,
    "minute",
  );
  assert.equal(nextState.attemptedBucketKeys.has(firstOpenKey), true);
  assert.equal(nextState.attemptedBucketKeys.has(nextOpenKey), false);
});

test("virada do dia civil finaliza ontem sem certificar o dia ainda aberto", () => {
  const firstRange = heatmap.buildOccupancyScenarioHeatmapRange(
    new Date("2026-09-16T23:59:30.000-03:00"),
    "day",
    7,
    companyTimeZone,
  );
  const firstState =
    heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
      fullRefresh: true,
      granularity: "day",
      previous: new Set<number>(),
      refreshedBuckets: firstRange.buckets,
      requestedBuckets: firstRange.buckets,
    });
  const previousOpenKey = aggregate.occupancyAggregateBucketKey(
    firstRange.buckets.at(-1)!,
    "day",
  );
  assert.equal(firstState.attemptedBucketKeys.has(previousOpenKey), false);

  const nextRange = heatmap.buildOccupancyScenarioHeatmapRange(
    new Date("2026-09-17T00:00:10.000-03:00"),
    "day",
    7,
    companyTimeZone,
  );
  const firstUnattemptedBucket = nextRange.buckets.find(
    (bucket) =>
      !firstState.attemptedBucketKeys.has(
        aggregate.occupancyAggregateBucketKey(bucket, "day"),
      ),
  );
  assert.equal(calendarKey(firstUnattemptedBucket!), "2026-09-16");
  const sourceBuckets = nextRange.buckets.filter(
    (bucket) => bucket.getTime() >= firstUnattemptedBucket!.getTime(),
  );
  assert.deepEqual(sourceBuckets.map(calendarKey), ["2026-09-16", "2026-09-17"]);
  const nextState =
    heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
      fullRefresh: false,
      granularity: "day",
      previous: firstState.attemptedBucketKeys,
      previousRetry: firstState.coverageRetryBucketKeys,
      refreshedBuckets: sourceBuckets,
      requestedBuckets: nextRange.buckets,
    });
  const nextOpenKey = aggregate.occupancyAggregateBucketKey(
    nextRange.buckets.at(-1)!,
    "day",
  );
  assert.equal(nextState.attemptedBucketKeys.has(previousOpenKey), true);
  assert.equal(nextState.attemptedBucketKeys.has(nextOpenKey), false);
});

test("virada da hora finaliza a hora anterior e conserva a hora corrente mutável", () => {
  const firstRange = heatmap.buildOccupancyScenarioHeatmapRange(
    new Date("2026-09-16T15:59:57.000Z"),
    "hour",
    7,
    companyTimeZone,
  );
  const firstState = heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
    fullRefresh: true,
    granularity: "hour",
    previous: new Set<number>(),
    refreshedBuckets: firstRange.buckets,
    requestedBuckets: firstRange.buckets,
  });
  const previousOpen = firstRange.buckets.at(-1)!;
  const previousOpenKey = aggregate.occupancyAggregateBucketKey(
    previousOpen,
    "hour",
  );
  assert.equal(firstState.attemptedBucketKeys.has(previousOpenKey), false);

  const nextRange = heatmap.buildOccupancyScenarioHeatmapRange(
    new Date("2026-09-16T16:00:03.000Z"),
    "hour",
    7,
    companyTimeZone,
  );
  const firstUnattemptedBucket = nextRange.buckets.find(
    (bucket) =>
      !firstState.attemptedBucketKeys.has(
        aggregate.occupancyAggregateBucketKey(bucket, "hour"),
      ),
  );
  assert.equal(firstUnattemptedBucket?.getTime(), previousOpen.getTime());
  const sourceBuckets = nextRange.buckets.filter(
    (bucket) => bucket.getTime() >= firstUnattemptedBucket!.getTime(),
  );
  const nextState = heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
    fullRefresh: false,
    granularity: "hour",
    previous: firstState.attemptedBucketKeys,
    previousRetry: firstState.coverageRetryBucketKeys,
    refreshedBuckets: sourceBuckets,
    requestedBuckets: nextRange.buckets,
  });
  assert.equal(nextState.attemptedBucketKeys.has(previousOpenKey), true);
  assert.equal(
    nextState.attemptedBucketKeys.has(
      aggregate.occupancyAggregateBucketKey(nextRange.buckets.at(-1)!, "hour"),
    ),
    false,
  );
});

test("último período fechado ausente recebe uma única retentativa controlada", () => {
  const requestedBuckets = [
    new Date("2026-09-16T15:41:00.000Z"),
    new Date("2026-09-16T15:42:00.000Z"),
    new Date("2026-09-16T15:43:00.000Z"),
  ];
  const latestClosed = requestedBuckets[1];
  const latestClosedKey = aggregate.occupancyAggregateBucketKey(
    latestClosed,
    "minute",
  );
  const firstState = heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
    fullRefresh: true,
    granularity: "minute",
    missingBuckets: [latestClosed],
    previous: new Set<number>(),
    refreshedBuckets: [requestedBuckets[0], requestedBuckets[2]],
    requestedBuckets,
  });
  assert.equal(firstState.attemptedBucketKeys.has(latestClosedKey), false);
  assert.equal(firstState.coverageRetryBucketKeys.has(latestClosedKey), true);

  const secondState = heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
    fullRefresh: false,
    granularity: "minute",
    missingBuckets: [latestClosed],
    previous: firstState.attemptedBucketKeys,
    previousRetry: firstState.coverageRetryBucketKeys,
    refreshedBuckets: [requestedBuckets[2]],
    requestedBuckets,
  });
  assert.equal(secondState.attemptedBucketKeys.has(latestClosedKey), true);
  assert.equal(secondState.coverageRetryBucketKeys.has(latestClosedKey), false);
});

test("estado de cobertura nunca conserva buckets fora da janela solicitada", () => {
  const requestedBuckets = [
    new Date("2026-09-16T15:42:00.000Z"),
    new Date("2026-09-16T15:43:00.000Z"),
  ];
  const outside = new Date("2026-09-16T15:41:00.000Z");
  const outsideKey = aggregate.occupancyAggregateBucketKey(outside, "minute");
  const state = heatmap.updateOccupancyScenarioHeatmapAttemptedBuckets({
    fullRefresh: false,
    granularity: "minute",
    previous: new Set([outsideKey]),
    previousRetry: new Set([outsideKey]),
    refreshedBuckets: [outside],
    requestedBuckets,
  });
  assert.equal(state.attemptedBucketKeys.has(outsideKey), false);
  assert.equal(state.coverageRetryBucketKeys.has(outsideKey), false);
});

test("minutos repetidos no DST recebem offset e continuam sendo buckets distintos", () => {
  const buckets = [
    new Date("2026-11-01T05:30:00.000Z"),
    new Date("2026-11-01T06:30:00.000Z"),
  ];
  const matrix = heatmap.buildOccupancyScenarioPeriodHeatmap({
    buckets,
    granularity: "minute",
    metric: "average",
    series: [
      {
        metrics: new Map(
          buckets.map((bucket, index) => [
            bucket.getTime(),
            { average: index + 1, minimum: index + 1, peak: index + 1 },
          ]),
        ),
        name: "Entrada",
        scenarioId: "scenario-a",
      },
    ],
    timeZone: "America/New_York",
  });
  assert.deepEqual(matrix.labels, ["01:30 (UTC-04)", "01:30 (UTC-05)"]);
  assert.deepEqual(
    matrix.cells.map((cell) => cell.value),
    [1, 2],
  );
});

test("helper rejeita configurações fora do contrato da API", () => {
  assert.throws(
    () =>
      heatmap.buildOccupancyScenarioHeatmapRange(
        now,
        "year" as RuntimeFixture,
        7,
        companyTimeZone,
      ),
    /granularidade year é inválida/i,
  );
  assert.throws(
    () =>
      heatmap.buildOccupancyScenarioHeatmapRange(
        now,
        "day",
        15 as RuntimeFixture,
        companyTimeZone,
      ),
    /7, 14 ou 30 dias/i,
  );
  assert.throws(
    () =>
      heatmap.buildOccupancyScenarioHeatmapRange(
        now,
        "day",
        7,
        "Not/A_Timezone",
      ),
    /fuso horário da empresa é inválido/i,
  );
});

function calendarKey(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function withBrowserZone(zone: string, callback: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    callback();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
