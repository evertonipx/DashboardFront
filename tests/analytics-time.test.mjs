import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const aggregateTime = loadTypeScriptModule("lib/aggregate-time.ts");
const aggregateHourQuery = loadTypeScriptModule(
  "lib/aggregate-hour-query.ts",
);
const aggregateReconciliation = loadTypeScriptModule(
  "lib/aggregate-reconciliation.ts",
);
const aggregateQueryPlan = loadTypeScriptModule(
  "lib/aggregate-query-plan.ts",
);
const countingIntelligence = loadTypeScriptModule(
  "lib/counting-intelligence.ts",
);
const hourlyAxis = loadTypeScriptModule("lib/hourly-axis.ts");
const metadataValidation = loadTypeScriptModule(
  "lib/metadata-validation.ts",
);
const occupancyAggregateValidation = loadTypeScriptModule(
  "lib/occupancy-aggregate-validation.ts",
);
const occupancyMetrics = loadTypeScriptModule(
  "lib/occupancy-metrics.ts",
);
const occupancyValidation = loadTypeScriptModule(
  "lib/occupancy-validation.ts",
);
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
const scenarioValidation = loadTypeScriptModule(
  "lib/scenario-validation.ts",
);
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

test("filtros 22 e 23 reutilizam exatamente os mesmos meses horários", () => {
  const throughDay22 = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2026, 5, 2),
      to: new Date(2026, 6, 23),
    },
  ]);
  const throughDay23 = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2026, 5, 2),
      to: new Date(2026, 6, 24),
    },
  ]);

  assert.deepEqual(
    throughDay22.map(({ key, from, to }) => [
      key,
      from.getTime(),
      to.getTime(),
    ]),
    throughDay23.map(({ key, from, to }) => [
      key,
      from.getTime(),
      to.getTime(),
    ]),
  );
});

test("plano horário preserva lacunas e respeita o limite exclusivo mensal", () => {
  const queries = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2025, 6, 22),
      to: new Date(2025, 7, 1),
    },
    {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 1, 1),
    },
  ]);

  assert.deepEqual(
    queries.map((query) => query.key),
    ["2025-07", "2026-01"],
  );
  assert.equal(queries[0].from.getDate(), 1);
  assert.equal(queries[0].to.getMonth(), 7);
  assert.equal(queries[1].to.getMonth(), 1);
});

test("plano horário atravessa dezembro e janeiro sem sobrepor fronteiras", () => {
  const queries = aggregateQueryPlan.planHourlyCalendarMonthQueries([
    {
      from: new Date(2025, 11, 31),
      to: new Date(2026, 0, 2),
    },
  ]);

  assert.deepEqual(
    queries.map((query) => query.key),
    ["2025-12", "2026-01"],
  );
  assert.equal(queries[0].to.getTime(), queries[1].from.getTime());
});

test("consulta horária rejeita fan-out histórico excessivo", async () => {
  await assert.rejects(
    aggregateHourQuery.fetchHourlyAggregateRanges({
      cacheScope: "test-company",
      ranges: [
        {
          from: new Date(2000, 0, 1),
          to: new Date(2020, 1, 1),
        },
      ],
    }),
    /excede 240 meses/,
  );
});

test("planejador interrompe fan-out extremo antes de materializar o histórico", () => {
  assert.throws(
    () =>
      aggregateQueryPlan.planHourlyCalendarMonthQueries([
        {
          from: new Date(1_000, 0, 1),
          to: new Date(100_000, 0, 1),
        },
      ]),
    /excede 240 meses/,
  );
});

test("rollup de meses particionados equivale à consulta horária contínua", () => {
  const range = {
    from: new Date(2026, 0, 15),
    to: new Date(2026, 2, 1),
  };
  const source = [
    aggregateRow("2026-01-10T10:00:00", "line-entry", 100),
    aggregateRow("2026-01-22T10:00:00", "line-entry", 2),
    aggregateRow("2026-02-22T10:00:00", "line-entry", 3),
    aggregateRow("2026-03-01T00:00:00", "line-entry", 200),
  ];
  const partitioned = aggregateQueryPlan
    .planHourlyCalendarMonthQueries([range])
    .flatMap((query) =>
      source.filter((row) =>
        aggregateTime.aggregateBucketInRange(
          row.bucket,
          "hour",
          query.from,
          query.to,
        ),
      ),
    );
  const continuousRollup = aggregateReconciliation.rollupAggregateRows(
    source,
    "hour",
    "month",
    range.from,
    range.to,
  );
  const partitionedRollup = aggregateReconciliation.rollupAggregateRows(
    partitioned,
    "hour",
    "month",
    range.from,
    range.to,
  );

  assert.deepEqual(
    normalizeAggregateRows(partitionedRollup),
    normalizeAggregateRows(continuousRollup),
  );
});

test("cache mensal só entrega horas dentro do corte solicitado", () => {
  const rows = aggregateHourQuery.filterHourlyAggregateRowsToRanges(
    [
      aggregateRow("2026-07-10T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T10:00:00", "line-entry", 2),
      aggregateRow("2026-07-23T00:00:00", "line-entry", 200),
    ],
    [
      {
        from: new Date(2026, 6, 15),
        to: new Date(2026, 6, 23),
      },
    ],
  );

  assert.deepEqual(
    rows.map((row) => [row.bucket, row.total]),
    [["2026-07-22T10:00:00", 2]],
  );
});

test("cache revalida mês aberto/recém-fechado por hora e histórico por dia", () => {
  const query = {
    from: new Date(2026, 6, 1),
    to: new Date(2026, 7, 1),
  };
  const settling = aggregateHourQuery.hourlyAggregateCacheRevision(
    query,
    new Date(2026, 7, 1, 12),
  );
  const historicalMorning =
    aggregateHourQuery.hourlyAggregateCacheRevision(
      query,
      new Date(2026, 7, 4, 9),
    );
  const historicalAfternoon =
    aggregateHourQuery.hourlyAggregateCacheRevision(
      query,
      new Date(2026, 7, 4, 18),
    );
  const openQuery = {
    from: new Date(2026, 7, 1),
    to: new Date(2026, 8, 1),
  };
  const openMorning = aggregateHourQuery.hourlyAggregateCacheRevision(
    openQuery,
    new Date(2026, 7, 22, 9),
  );
  const openAfternoon = aggregateHourQuery.hourlyAggregateCacheRevision(
    openQuery,
    new Date(2026, 7, 22, 18),
  );

  assert.match(settling, /^hour:/);
  assert.match(historicalMorning, /^day:/);
  assert.equal(historicalAfternoon, historicalMorning);
  assert.match(openMorning, /^hour:/);
  assert.match(openAfternoon, /^hour:/);
  assert.notEqual(openAfternoon, openMorning);
});

test("consultas 22 e 23 reutilizam o mesmo snapshot HTTP do dia 22", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-23T10:00:00", "line-entry", 23),
          aggregateRow("2026-07-24T10:00:00", "line-entry", 24),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const through22 = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 30, 1),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 23),
        },
      ],
    });
    const through23 = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 45, 59),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 24),
        },
      ],
    });
    const day22First = through22.find((row) =>
      row.bucket.startsWith("2026-07-22"),
    );
    const day22Second = through23.find((row) =>
      row.bucket.startsWith("2026-07-22"),
    );

    assert.equal(requests.length, 1);
    assert.deepEqual(day22Second, day22First);
    assert.deepEqual(
      through22.map((row) => row.total),
      [22],
    );
    assert.deepEqual(
      through23.map((row) => row.total),
      [22, 23],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("consultas concorrentes do mesmo mês compartilham uma única resposta HTTP", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let releaseResponse;
  const responseReady = new Promise((resolveResponse) => {
    releaseResponse = resolveResponse;
  });
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    await responseReady;
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-23T10:00:00", "line-entry", 23),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const first = aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 15),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 23),
        },
      ],
    });
    const second = aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 45),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 24),
        },
      ],
    });

    await new Promise((resolveTick) => setImmediate(resolveTick));
    assert.equal(requests.length, 1);
    releaseResponse();
    const [through22, through23] = await Promise.all([first, second]);

    assert.equal(requests.length, 1);
    assert.deepEqual(
      through22.map((row) => row.total),
      [22],
    );
    assert.deepEqual(
      through23.map((row) => row.total),
      [22, 23],
    );
  } finally {
    releaseResponse?.();
    globalThis.fetch = originalFetch;
  }
});

test("limpar o cache impede uma resposta antiga de repovoá-lo", async () => {
  const originalFetch = globalThis.fetch;
  let releaseResponse;
  const responseReady = new Promise((resolveResponse) => {
    releaseResponse = resolveResponse;
  });
  globalThis.fetch = async () => {
    await responseReady;
    return new Response(
      JSON.stringify({
        data: [aggregateRow("2026-07-22T10:00:00", "line-entry", 22)],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const pending = aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10),
      ranges: [
        {
          from: new Date(2026, 6, 1),
          to: new Date(2026, 6, 23),
        },
      ],
    });
    await new Promise((resolveTick) => setImmediate(resolveTick));
    aggregateHourQuery.clearHourlyAggregateCache(cache);
    releaseResponse();
    await pending;

    assert.equal(cache.size, 0);
  } finally {
    releaseResponse?.();
    globalThis.fetch = originalFetch;
  }
});

test("dia aberto e fechado conservam o mesmo snapshot mensal", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const request = new URL(String(input), "http://localhost");
    const from = request.searchParams.get("from");
    requests.push({ from, url: String(input) });
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-22T10:00:00", "line-entry", 22),
          aggregateRow("2026-07-27T10:00:00", "line-entry", 1),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const range = {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 6, 27, 10, 31),
    };
    const first = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 30),
      ranges: [range],
    });
    const second = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 27, 10, 35),
      ranges: [
        {
          ...range,
          to: new Date(2026, 6, 27, 10, 36),
        },
      ],
    });

    assert.equal(requests.length, 1);
    assert.deepEqual(
      first.map((row) => [row.bucket, row.total]),
      [
        ["2026-07-22T10:00:00", 22],
        ["2026-07-27T10:00:00", 1],
      ],
    );
    assert.deepEqual(second, first);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("virada do dia mantém a mesma consulta mensal para a data encerrada", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const request = new URL(String(input), "http://localhost");
    requests.push({
      from: request.searchParams.get("from"),
      to: request.searchParams.get("to"),
    });
    return new Response(
      JSON.stringify({
        data: [
          aggregateRow("2026-07-31T23:00:00", "line-entry", 31),
        ],
        granularity: "hour",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const cache = new Map();
    const july = {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 7, 1),
    };
    const whileOpen = await aggregateHourQuery.fetchHourlyAggregateRanges({
      cache,
      cacheScope: "test-company",
      now: new Date(2026, 6, 31, 23, 30),
      ranges: [july],
    });
    const afterMidnight =
      await aggregateHourQuery.fetchHourlyAggregateRanges({
        cache,
        cacheScope: "test-company",
        now: new Date(2026, 7, 1, 0, 30),
        ranges: [july],
      });

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(
      requests[0].from,
      aggregateTime.aggregateQueryIso(july.from, "hour"),
    );
    assert.equal(
      requests[0].to,
      aggregateTime.aggregateQueryIso(july.to, "hour"),
    );
    assert.deepEqual(afterMidnight, whileOpen);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resposta com granularidade diferente é rejeitada", () => {
  assert.throws(
    () => aggregateTime.requireAggregateGranularity("day", "hour"),
    /granularidade day.*consulta hour/,
  );
  assert.equal(
    aggregateTime.requireAggregateGranularity("hour", "hour"),
    "hour",
  );
  assert.throws(
    () => aggregateTime.requireAggregateGranularity(undefined, "hour"),
    /granularidade ausente.*consulta hour/,
  );
});

test("payload agregado ausente ou malformado é rejeitado", () => {
  assert.throws(
    () => aggregateTime.requireAggregateRows(undefined, "hour"),
    /sem o campo data/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [aggregateRow("bucket-invalido", "line-entry", 1)],
        "hour",
      ),
    /linha agregada inválida/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [aggregateRow("2026-07-22T10:00:00", "line-entry", Number.NaN)],
        "hour",
      ),
    /linha agregada inválida/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [aggregateRow("2026-07-22T10:00:00", "line-entry", -1)],
        "hour",
      ),
    /linha agregada inválida/,
  );
});

test("payload agregado aceita buckets alinhados em todas as granularidades", () => {
  const alignedBuckets = {
    minute: "2026-07-22T10:15:00",
    hour: "2026-07-22T10:00:00",
    day: "2026-07-22",
    week: "2026-07-20",
    month: "2026-07-01",
    semester: "2026-07-01",
    year: "2026-01-01",
  };

  Object.entries(alignedBuckets).forEach(([granularity, bucket]) => {
    const rows = [
      {
        ...aggregateRow(bucket, "line-entry", 1),
        object_class: "person",
      },
    ];

    assert.equal(
      aggregateTime.requireAggregateRows(rows, granularity),
      rows,
      granularity,
    );
  });

  const omittedOptionalFields = [
    {
      ...aggregateRow("2026-07-22T10:00:00", "line-entry", 1),
      line_count_id: undefined,
    },
  ];
  assert.equal(
    aggregateTime.requireAggregateRows(omittedOptionalFields, "hour"),
    omittedOptionalFields,
  );
});

test("payload agregado rejeita buckets desalinhados da granularidade", () => {
  const misalignedBuckets = {
    minute: "2026-07-22T10:15:30",
    hour: "2026-07-22T10:15:00",
    day: "2026-07-22T10:00:00",
    week: "2026-07-22",
    month: "2026-07-22",
    semester: "2026-02-01",
    year: "2026-07-01",
  };

  Object.entries(misalignedBuckets).forEach(([granularity, bucket]) => {
    assert.throws(
      () =>
        aggregateTime.requireAggregateRows(
          [aggregateRow(bucket, "line-entry", 1)],
          granularity,
        ),
      /linha agregada inválida/,
      granularity,
    );
  });
});

test("payload agregado rejeita tipos inválidos nos campos opcionais", () => {
  const bucket = "2026-07-22T10:00:00";

  [
    {
      ...aggregateRow(bucket, "line-entry", 1),
      line_count_id: 123,
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      object_class: { name: "person" },
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      line_count_id: null,
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      object_class: null,
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      camera_id: "   ",
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      line_count_id: "",
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      object_class: " ",
    },
    {
      ...aggregateRow(bucket, "line-entry", 1),
      camera_id: " camera",
    },
    {
      ...aggregateRow(bucket, " line-entry", 1),
    },
  ].forEach((row) => {
    assert.throws(
      () => aggregateTime.requireAggregateRows([row], "hour"),
      /linha agregada inválida/,
    );
  });

  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [
          {
            ...aggregateRow(bucket, "line-entry", 1),
            metric_type: "occupancy",
          },
        ],
        "hour",
        "count",
      ),
    /linha agregada inválida/,
  );
  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [
          aggregateRow(
            bucket,
            "line-entry",
            Number.MAX_SAFE_INTEGER + 1,
          ),
        ],
        "hour",
      ),
    /linha agregada inválida/,
  );
});

test("payload agregado rejeita identidades duplicadas no mesmo bucket", () => {
  const row = aggregateRow(
    "2026-07-22T10:00:00",
    "line-entry",
    1,
  );

  assert.throws(
    () =>
      aggregateTime.requireAggregateRows(
        [row, { ...row, total: 2 }],
        "hour",
        "count",
      ),
    /identidade agregada duplicada/,
  );
  assert.doesNotThrow(() =>
    aggregateTime.requireAggregateRows(
      [
        row,
        {
          ...row,
          line_count_id: "line-exit",
          total: 2,
        },
      ],
      "hour",
      "count",
    ),
  );
});

test("agregado de ocupação exige tuplas completas, ordenadas e não negativas", () => {
  const bucket = "2026-07-22T10:00:00";
  const validRows = [
    {
      area_avg: 5,
      area_id: "area-a",
      area_max: 7,
      area_min: 3,
      bucket,
      camera_id: "camera-a",
    },
    {
      bucket,
      scenario_total_avg: 10,
      scenario_total_max: 14,
      scenario_total_min: 6,
    },
  ];

  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: validRows,
        granularity: "hour",
        scenario_id: "scenario-a",
      },
      "hour",
      "scenario-a",
    ),
    validRows,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: validRows,
          granularity: "hour",
          scenario_id: "scenario-b",
        },
        "hour",
        "scenario-a",
      ),
    /cenário "scenario-b".*"scenario-a"/,
  );

  const invalidRows = [
    {
      bucket,
      scenario_total_avg: 10,
      scenario_total_min: 6,
    },
    {
      area_avg: 5,
      area_max: 7,
      area_min: -1,
      bucket,
    },
    {
      area_avg: 8,
      area_max: 7,
      area_min: 3,
      bucket,
    },
    {
      area_avg: Number.NaN,
      area_max: 7,
      area_min: 3,
      bucket,
    },
    {
      area_avg: 5,
      area_id: " area-a",
      area_max: 7,
      area_min: 3,
      bucket,
    },
    {
      area_avg: 5,
      area_max: 7,
      area_min: 3,
      bucket,
      camera_id: "camera-a ",
    },
    {
      area_avg: 5,
      area_max: 7,
      area_min: 3,
      bucket,
      scenario_total_avg: 10,
    },
  ];

  invalidRows.forEach((row) => {
    assert.throws(
      () =>
        occupancyAggregateValidation.requireOccupancyAggregateRows(
          {
            data: [row],
            granularity: "hour",
            scenario_id: "scenario-a",
          },
          "hour",
          "scenario-a",
        ),
      /linha agregada de ocupação inválida/,
    );
  });

  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: [validRows[0]],
          granularity: "hour",
          scenario_id: " scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    /scenario_id/,
  );
});

test("totais de cenário repetidos precisam ser idênticos no mesmo bucket", () => {
  const bucket = "2026-07-22T10:00:00";
  const scenarioTotal = {
    bucket,
    scenario_total_avg: 10,
    scenario_total_max: 14,
    scenario_total_min: 6,
  };

  assert.doesNotThrow(() =>
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: [scenarioTotal, { ...scenarioTotal }],
        granularity: "hour",
        scenario_id: "scenario-a",
      },
      "hour",
      "scenario-a",
    ),
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: [
            scenarioTotal,
            { ...scenarioTotal, scenario_total_avg: 11 },
          ],
          granularity: "hour",
          scenario_id: "scenario-a",
        },
        "hour",
        "scenario-a",
      ),
    /totais de cenário divergentes/,
  );
});

test("total do cenário prevalece sobre áreas independentemente da ordem", () => {
  const bucket = "2026-07-22T10:00:00";
  const areaA = {
    area_avg: 2,
    area_id: "area-a",
    area_max: 3,
    area_min: 1,
    bucket,
    camera_id: "camera-a",
  };
  const areaB = {
    area_avg: 4,
    area_id: "area-b",
    area_max: 6,
    area_min: 2,
    bucket,
    camera_id: "camera-a",
  };
  const scenarioTotal = {
    bucket,
    scenario_total_avg: 20,
    scenario_total_max: 30,
    scenario_total_min: 10,
  };
  const date = aggregateTime.parseAggregateBucket(bucket, "hour");
  assert.ok(date);
  const key = occupancyAggregateValidation.occupancyAggregateBucketKey(
    date,
    "hour",
  );

  for (const rows of [
    [scenarioTotal, areaA, areaB],
    [areaA, scenarioTotal, areaB],
    [areaA, areaB, scenarioTotal],
    [areaA, scenarioTotal, { ...scenarioTotal }, areaB],
  ]) {
    const totals =
      occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
        rows,
        "hour",
      );
    assert.deepEqual(totals.get(key), {
      average: 20,
      minimum: 10,
      peak: 30,
    });
  }

  assert.throws(
    () =>
      occupancyAggregateValidation.aggregateOccupancyRowsByBucket(
        [areaA, areaB],
        "hour",
      ),
    /scenario_total_\*/,
  );
  assert.doesNotThrow(() =>
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: [
          {
            ...areaA,
            scenario_total_avg: 20,
            scenario_total_max: 30,
            scenario_total_min: 10,
          },
          {
            ...areaB,
            scenario_total_avg: 20,
            scenario_total_max: 30,
            scenario_total_min: 10,
          },
        ],
        granularity: "hour",
        scenario_id: "scenario-a",
      },
      "hour",
      "scenario-a",
    ),
  );
});

test("metadados de cenário válidos preservam identidades e multiplicadores", () => {
  const rows = [
    {
      active: true,
      company_id: "company-a",
      id: "scenario-a",
      lines: [
        {
          action_multiplier: 1,
          label: "Entrada",
          line_count_id: "line-a",
        },
        {
          action_multiplier: -1,
          line_count_id: "line-b",
        },
      ],
      name: "Fluxo",
    },
  ];

  assert.deepEqual(scenarioValidation.requireScenarioRows(rows), rows);
});

test("metadados de cenário rejeitam padding e IDs duplicados", () => {
  const valid = {
    active: true,
    company_id: "company-a",
    id: "scenario-a",
    lines: [{ action_multiplier: 1, line_count_id: "line-a" }],
    name: "Fluxo",
  };

  for (const invalid of [
    [{ ...valid, id: " scenario-a" }],
    [{ ...valid, company_id: "company-a " }],
    [{ ...valid, name: " Fluxo" }],
    [
      valid,
      {
        ...valid,
        name: "Outro fluxo",
      },
    ],
  ]) {
    assert.throws(
      () => scenarioValidation.requireScenarioRows(invalid),
      /inválid|duplicado/i,
    );
  }
});

test("metadados de cenário rejeitam linhas ambíguas ou inválidas", () => {
  const base = {
    active: true,
    company_id: "company-a",
    id: "scenario-a",
    name: "Fluxo",
  };

  for (const lines of [
    [
      { action_multiplier: 1, line_count_id: "line-a" },
      { action_multiplier: -1, line_count_id: "line-a" },
    ],
    [{ action_multiplier: 2, line_count_id: "line-a" }],
    [{ action_multiplier: 1, line_count_id: " line-a" }],
    [{ action_multiplier: 1, label: 123, line_count_id: "line-a" }],
  ]) {
    assert.throws(
      () => scenarioValidation.requireScenarioRows([{ ...base, lines }]),
      /inválid|duplicado|action_multiplier/i,
    );
  }
});

test("metadados de cenário rejeitam opcionais com tipo inseguro", () => {
  const base = {
    active: true,
    company_id: "company-a",
    id: "scenario-a",
    lines: [{ action_multiplier: 1, line_count_id: "line-a" }],
    name: "Fluxo",
  };

  assert.throws(
    () =>
      scenarioValidation.requireScenarioRows([
        { ...base, description: { text: "inválido" } },
      ]),
    /Texto inválido/,
  );
  assert.throws(
    () =>
      scenarioValidation.requireScenarioRows([
        { ...base, config: [1, Number.NaN] },
      ]),
    /números finitos/,
  );
});

test("metadados de infraestrutura exigem identidade e status canônicos", () => {
  const cameras = metadataValidation.requireCameraRows([
    {
      active: true,
      company_id: "company-a",
      id: "camera-a",
      location_id: "location-a",
      name: "Câmera A",
      sub_location_id: "sub-location-a",
    },
  ]);
  const locations = metadataValidation.requireLocationRows([
    {
      active: true,
      company_id: "company-a",
      id: "location-a",
      name: "Local A",
    },
  ]);
  const subLocations = metadataValidation.requireSubLocationRows([
    {
      active: true,
      company_id: "company-a",
      id: "sub-location-a",
      location_id: "location-a",
      name: "Sublocal A",
    },
  ]);
  const workers = metadataValidation.requireWorkerRows({
    workers: [
      {
        active: true,
        company_id: "company-a",
        id: "worker-a",
        name: "Worker A",
      },
    ],
  });

  assert.equal(cameras[0].id, "camera-a");
  assert.equal(locations[0].id, "location-a");
  assert.equal(subLocations[0].id, "sub-location-a");
  assert.equal(workers[0].id, "worker-a");
  assert.doesNotThrow(() =>
    metadataValidation.requireInfrastructureRelations({
      cameras,
      locations,
      subLocations,
    }),
  );
});

test("metadados de infraestrutura rejeitam booleanos, IDs e envelopes ambíguos", () => {
  const camera = {
    active: true,
    company_id: "company-a",
    id: "camera-a",
    location_id: "location-a",
    name: "Câmera A",
  };

  assert.throws(
    () =>
      metadataValidation.requireCameraRows([
        { ...camera, active: "false" },
      ]),
    /active.*inválido/,
  );
  assert.throws(
    () =>
      metadataValidation.requireCameraRows([
        camera,
        { ...camera },
      ]),
    /id duplicado/,
  );
  assert.throws(
    () =>
      metadataValidation.requireLocationRows([
        {
          active: true,
          company_id: "company-a ",
          id: "location-a",
          name: "Local A",
        },
      ]),
    /company_id.*inválido/,
  );
  assert.throws(
    () =>
      metadataValidation.requireWorkerRows({
        data: [],
        workers: [],
      }),
    /envelope ambíguo/,
  );
  assert.throws(
    () => metadataValidation.requireWorkerRows({ payload: [] }),
    /envelope ambíguo ou inválido/,
  );
});

test("relações de infraestrutura inválidas cancelam a certificação", () => {
  const locations = metadataValidation.requireLocationRows([
    {
      active: true,
      company_id: "company-a",
      id: "location-a",
      name: "Local A",
    },
  ]);
  const cameras = metadataValidation.requireCameraRows([
    {
      active: true,
      company_id: "company-a",
      id: "camera-a",
      location_id: "missing-location",
      name: "Câmera A",
    },
  ]);

  assert.throws(
    () =>
      metadataValidation.requireInfrastructureRelations({
        cameras,
        locations,
        subLocations: [],
      }),
    /local inexistente/,
  );
});

test("lista de cenários de ocupação exige contrato completo e único", () => {
  const valid = {
    active: true,
    areas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
        label: "Área A",
      },
    ],
    company_id: "company-a",
    id: "occupancy-a",
    max_total: 20,
    min_total: 1,
    name: "Ocupação A",
    object_class: "person",
  };

  assert.equal(
    occupancyValidation.requireOccupancyScenarioRows({ data: [valid] })[0].id,
    "occupancy-a",
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, active: "true" }],
      }),
    /active.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, company_id: undefined }],
      }),
    /company_id.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [
          {
            ...valid,
            areas: [valid.areas[0], { ...valid.areas[0] }],
          },
        ],
      }),
    /área duplicada/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, max_total: 1, min_total: 2 }],
      }),
    /limites invertidos/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyScenarioRows({
        data: [{ ...valid, areas: [] }],
      }),
    /sem nenhuma área/,
  );
});

test("snapshots de ocupação válidos preservam zero explícito", () => {
  const scope = {
    expectedCameraIds: ["camera-a"],
    from: new Date("2026-07-22T10:00:00Z"),
    to: new Date("2026-07-22T11:00:00Z"),
  };
  const rows = occupancyValidation.requireOccupancySnapshotRows(
    {
      data: [
        {
          area: "area-a",
          avg: 0,
          camera_id: "camera-a",
          current_at: "2026-07-22T10:30:00Z",
          current_value: 0,
          min: 0,
          peak: 0,
        },
      ],
    },
    scope,
  );

  assert.deepEqual(
    {
      average: rows[0].avg,
      current: rows[0].current_value,
      minimum: rows[0].min,
      peak: rows[0].peak,
    },
    { average: 0, current: 0, minimum: 0, peak: 0 },
  );
});

test("snapshots de ocupação rejeitam envelope, valores e identidades ambíguas", () => {
  const scope = {
    expectedCameraIds: ["camera-a"],
    from: new Date("2026-07-22T10:00:00Z"),
    to: new Date("2026-07-22T11:00:00Z"),
  };
  const valid = {
    area: "area-a",
    avg: 4,
    camera_id: "camera-a",
    current_at: "2026-07-22T10:30:00Z",
    current_value: 5,
    min: 2,
    peak: 8,
  };

  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        { payload: [] },
        scope,
      ),
    /envelope ambíguo ou inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        {
          data: [valid],
          snapshots: [valid],
        },
        scope,
      ),
    /envelope ambíguo/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_value: "5" }],
        scope,
      ),
    /current_value.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_value: 9 }],
        scope,
      ),
    /métricas inconsistentes/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [valid, { ...valid }],
        scope,
      ),
    /snapshot de ocupação duplicado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, area: undefined }, valid],
        scope,
      ),
    /soma seria ambígua/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [
          {
            area: "area-a",
            camera_id: "camera-a",
            current_at: "2026-07-22T10:30:00Z",
            people_count: 5,
          },
        ],
        scope,
      ),
    /current_value.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [{ ...valid, current_at: "2026-07-22T11:00:00Z" }],
        scope,
      ),
    /fora do bucket/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows([], scope),
    /cobertura de câmeras.*ausentes: camera-a/i,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancySnapshotRows(
        [
          valid,
          {
            ...valid,
            area: "area-b",
            camera_id: "camera-b",
          },
        ],
        scope,
      ),
    /extras: camera-b/i,
  );
});

test("snapshot de cenário de ocupação confere cenário e valores", () => {
  const valid = {
    areas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
        snapshot_at: "2026-07-22T10:00:00Z",
        value: 3,
      },
    ],
    as_of: "2026-07-22T10:00:00Z",
    scenario_id: "occupancy-a",
    total: 3,
  };
  const validationScope = {
    expectedAreas: [
      {
        area_id: "area-a",
        camera_id: "camera-a",
      },
    ],
    requestedAt: new Date("2026-07-22T10:01:00Z"),
  };

  assert.equal(
    occupancyValidation.requireOccupancyHistoryResponse(
      valid,
      "occupancy-a",
      validationScope,
    ).total,
    3,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, scenario_id: "occupancy-b" },
        "occupancy-a",
        validationScope,
      ),
    /ao consultar "occupancy-a"/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, total: -1 },
        "occupancy-a",
        validationScope,
      ),
    /total.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        {
          ...valid,
          areas: [valid.areas[0], { ...valid.areas[0] }],
        },
        "occupancy-a",
        validationScope,
      ),
    /área duplicada/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, as_of: undefined },
        "occupancy-a",
        validationScope,
      ),
    /as_of.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, as_of: "2026-07-22T10:02:00Z" },
        "occupancy-a",
        validationScope,
      ),
    /posterior ao instante solicitado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        {
          ...valid,
          areas: [{ ...valid.areas[0], snapshot_at: undefined }],
        },
        "occupancy-a",
        validationScope,
      ),
    /snapshot_at.*inválido/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyHistoryResponse(
        { ...valid, total: 4 },
        "occupancy-a",
        validationScope,
      ),
    /diverge da soma das áreas/,
  );
});

test("alertas de ocupação exigem cenário, identidade e valores certificados", () => {
  const valid = {
    id: 1,
    object_class: "person",
    scenario_id: "occupancy-a",
    threshold_kind: "max",
    threshold_value: 10,
    total_value: 12,
    triggered_at: "2026-07-22T10:00:00Z",
  };

  assert.deepEqual(
    occupancyValidation.requireOccupancyAlertRows(
      { data: [valid] },
      "occupancy-a",
      "person",
    ),
    [valid],
  );
  for (const invalid of [
    { ...valid, id: 1.5 },
    { ...valid, scenario_id: "occupancy-b" },
    { ...valid, threshold_kind: "warning" },
    { ...valid, threshold_value: Number.NaN },
    { ...valid, total_value: -1 },
    { ...valid, triggered_at: "inválido" },
    { ...valid, threshold_kind: "min", threshold_value: 10, total_value: 11 },
  ]) {
    assert.throws(
      () =>
        occupancyValidation.requireOccupancyAlertRows(
          [invalid],
          "occupancy-a",
          "person",
        ),
    );
  }
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyAlertRows(
        [valid, { ...valid }],
        "occupancy-a",
        "person",
      ),
    /id duplicado/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyAlertRows(
        { data: [valid], items: [valid] },
        "occupancy-a",
        "person",
      ),
    /envelope ambíguo/,
  );
  assert.throws(
    () =>
      occupancyValidation.requireOccupancyAlertRows(
        [{ ...valid, object_class: "vehicle" }],
        "occupancy-a",
        "person",
      ),
    /alerta da classe "vehicle"/,
  );
});

test("resumo de ocupação preserva zero atual e não certifica ausência", () => {
  const metric = occupancyMetrics.summarizeOccupancyMetrics([
    { average: 4, current: 7, minimum: 2, peak: 8 },
    { average: 0, current: 0, minimum: 0, peak: 0 },
  ]);

  assert.deepEqual(metric, {
    average: 2,
    current: 0,
    minimum: 0,
    peak: 8,
  });
  assert.deepEqual(
    occupancyMetrics.summarizeOccupancyMetrics([
      {
        average: null,
        current: null,
        minimum: null,
        peak: null,
      },
    ]),
    {
      average: null,
      current: null,
      minimum: null,
      peak: null,
    },
  );
});

test("chaves horárias absolutas não colapsam instantes repetidos", () => {
  const first = new Date("2026-11-01T05:00:00Z");
  const second = new Date("2026-11-01T06:00:00Z");

  assert.notEqual(
    occupancyAggregateValidation.occupancyAggregateBucketKey(first, "hour"),
    occupancyAggregateValidation.occupancyAggregateBucketKey(second, "hour"),
  );
});

test("parser não aceita lixo após data nem horário local inválido", () => {
  assert.equal(
    aggregateTime.parseAggregateBucket("2026-07-22garbage", "day"),
    null,
  );
  assert.equal(
    aggregateTime.parseAggregateBucket("2026-02-30T10:00:00", "hour"),
    null,
  );
  assert.equal(
    periodAnalysisModel.resolvePeriodAnalysisRange(
      "2026-02-30",
      "2026-03-01",
    ),
    null,
  );
  assert.equal(
    aggregateTime.isAggregateBucketAligned(
      "2026-07-22T10:00:00.0001Z",
      "hour",
    ),
    false,
  );
  assert.equal(
    aggregateTime.isAggregateBucketAligned(
      "2026-07-22T00:00:00.0001Z",
      "day",
    ),
    false,
  );
});

test("fonte detalhada substitui o agregado mesmo quando o valor é menor", () => {
  const from = new Date(2026, 6, 22);
  const to = new Date(2026, 6, 23);
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 40),
      aggregateRow("2026-07-22T11:00:00", "line-entry", 50),
    ],
    "hour",
    from,
    to,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 90);
});

test("resposta agregada fora do intervalo solicitado é rejeitada", () => {
  assert.throws(
    () =>
      aggregateTime.requireAggregateRowsInRange(
        [
          aggregateRow(
            "2026-07-22T10:31:00",
            "line-entry",
            1,
            "camera-1",
            "count",
          ),
        ],
        "minute",
        new Date(2026, 6, 22, 10),
        new Date(2026, 6, 22, 10, 31),
        "count",
      ),
    /fora do intervalo consultado/,
  );
});

test("snapshot curto de minutos substitui a mesma hora no gráfico minuto", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 2),
      aggregateRow("2026-07-22T10:01:00", "line-entry", 3),
      aggregateRow("2026-07-22T09:59:00", "line-entry", 9),
    ],
    "minute",
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 7),
      aggregateRow("2026-07-22T10:01:00", "line-entry", 8),
    ],
    "minute",
    new Date(2026, 6, 22, 10),
    new Date(2026, 6, 22, 10, 2),
  );

  assert.deepEqual(
    rows
      .map((row) => {
        const bucket = aggregateTime.parseAggregateBucket(
          row.bucket,
          "minute",
        );
        return [bucket?.getHours(), bucket?.getMinutes(), row.total];
      })
      .sort(
        ([leftHour, leftMinute], [rightHour, rightMinute]) =>
          leftHour - rightHour || leftMinute - rightMinute,
      ),
    [
      [9, 59, 9],
      [10, 0, 7],
      [10, 1, 8],
    ],
  );
});

test("bucket detalhado substitui integralmente identidades do agregado", () => {
  const from = new Date(2026, 6, 22);
  const to = new Date(2026, 6, 23);
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [
      aggregateRow("2026-07-22", "line-entry", 60),
      aggregateRow("2026-07-22", "line-exit", 40),
    ],
    "day",
    [aggregateRow("2026-07-22T10:00:00", "line-entry", 60)],
    "hour",
    from,
    to,
  );

  assert.deepEqual(
    rows.map((row) => [row.line_count_id, row.total]),
    [["line-entry", 60]],
  );
});

test("resposta detalhada vazia corrige o bucket agregado para zero", () => {
  const from = new Date(2026, 6, 22);
  const to = new Date(2026, 6, 23);
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    [],
    "hour",
    from,
    to,
  );

  assert.deepEqual(rows, []);
});

test("resposta vazia preserva buckets fora do intervalo corrigido", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [
      aggregateRow("2026-07-21", "line-entry", 80),
      aggregateRow("2026-07-22", "line-entry", 100),
      aggregateRow("2026-07-23", "line-entry", 120),
    ],
    "day",
    [],
    "hour",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.deepEqual(
    rows.map((row) => [row.bucket, row.total]),
    [
      ["2026-07-21", 80],
      ["2026-07-23", 120],
    ],
  );
});

test("zero explícito continua sendo um valor autoritativo", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    [aggregateRow("2026-07-22T10:00:00", "line-entry", 0)],
    "hour",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 0);
});

test("fonte inválida cancela a reconciliação em vez de apagar o total", () => {
  const target = [aggregateRow("2026-07-22", "line-entry", 100)];
  const invalidTotal = [
    aggregateRow("2026-07-22T10:00:00", "line-entry", Number.NaN),
  ];
  const missingIdentity = [
    {
      ...aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
      camera_id: "",
      line_count_id: undefined,
    },
  ];

  assert.throws(
    () =>
      aggregateReconciliation.reconcileAggregateRows(
        target,
        "day",
        invalidTotal,
        "hour",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
      ),
    /reconciliação foi cancelada/,
  );
  assert.throws(
    () =>
      aggregateReconciliation.reconcileAggregateRows(
        target,
        "day",
        missingIdentity,
        "hour",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
      ),
    /reconciliação foi cancelada/,
  );
});

test("identidades com separador não colidem durante o rollup", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [
      {
        ...aggregateRow("2026-07-22T10:00:00", "c", 2),
        camera_id: "a|b",
      },
      {
        ...aggregateRow("2026-07-22T10:00:00", "b|c", 3),
        camera_id: "a",
      },
    ],
    "hour",
    "day",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.total).sort((left, right) => left - right),
    [2, 3],
  );
});

test("intervalo parcial substitui o bucket sobreposto sem duplicar", () => {
  const rows = aggregateReconciliation.reconcileAggregateRows(
    [aggregateRow("2026-07-22T10:00:00", "line-entry", 100)],
    "hour",
    [aggregateRow("2026-07-22T10:20:00", "line-entry", 5)],
    "minute",
    new Date(2026, 6, 22, 10, 15),
    new Date(2026, 6, 22, 10, 45),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 5);
});

test("rollup horário recompõe cada dia em uma única passagem", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 4),
      aggregateRow("2026-07-22T11:00:00", "line-entry", 5),
      aggregateRow("2026-07-23T10:00:00", "line-entry", 6),
    ],
    "hour",
    "day",
    new Date(2026, 6, 22),
    new Date(2026, 6, 24),
  );

  assert.deepEqual(
    rows
      .map((row) => [row.bucket, row.total])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ["2026-07-22", 9],
      ["2026-07-23", 6],
    ],
  );
});

test("rollup múltiplo equivale às consolidações individuais", () => {
  const source = [
    aggregateRow("2025-12-31T23:00:00", "line-entry", 2),
    aggregateRow("2026-01-01T00:00:00", "line-entry", 3),
    aggregateRow("2026-07-01T00:00:00", "line-entry", 5),
  ];
  const from = new Date(2025, 11, 31);
  const to = new Date(2026, 6, 2);
  const many = aggregateReconciliation.rollupAggregateRowsMany(
    source,
    "hour",
    ["day", "month", "semester", "year"],
    from,
    to,
  );

  for (const granularity of ["day", "month", "semester", "year"]) {
    const individual = aggregateReconciliation.rollupAggregateRows(
      source,
      "hour",
      granularity,
      from,
      to,
    );
    assert.deepEqual(
      normalizeAggregateRows(many.get(granularity) ?? []),
      normalizeAggregateRows(individual),
      granularity,
    );
  }
});

test("horas repetidas no fim do DST permanecem buckets distintos", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-11-01T05:00:00Z", "line-entry", 2),
      aggregateRow("2026-11-01T06:00:00Z", "line-entry", 3),
    ],
    "hour",
    "hour",
    new Date("2026-11-01T00:00:00Z"),
    new Date("2026-11-02T00:00:00Z"),
  );

  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.bucket)).size, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 5);
});

test("limites preservam transições IANA de uma hora, trinta minutos e meia-noite", () => {
  for (const [timezone, probe] of [
    ["America/New_York", "fallback"],
    ["Australia/Lord_Howe", "half-hour-forward"],
    ["America/Sao_Paulo", "midnight-forward"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["tests/timezone-reconciliation-probe.mjs", probe],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...process.env, TZ: timezone },
      },
    );

    assert.equal(
      result.status,
      0,
      `${timezone}: ${result.stderr || result.stdout}`,
    );
  }
});

test("overflow numérico cancela o rollup", () => {
  assert.throws(
    () =>
      aggregateReconciliation.rollupAggregateRows(
        [
          aggregateRow(
            "2026-07-22T10:00:00",
            "line-entry",
            Number.MAX_SAFE_INTEGER - 1,
          ),
          aggregateRow("2026-07-22T11:00:00", "line-entry", 2),
        ],
        "hour",
        "day",
        new Date(2026, 6, 22),
        new Date(2026, 6, 23),
      ),
    /excedeu o intervalo numérico seguro/,
  );
});

test("fonte mais grossa nunca é projetada como granularidade detalhada", () => {
  const target = [
    aggregateRow("2026-07-22T10:00:00", "line-entry", 4),
    aggregateRow("2026-07-22T11:00:00", "line-entry", 5),
  ];
  const rows = aggregateReconciliation.reconcileAggregateRows(
    target,
    "hour",
    [aggregateRow("2026-07-22", "line-entry", 100)],
    "day",
    new Date(2026, 6, 22),
    new Date(2026, 6, 23),
  );

  assert.deepEqual(rows, target);
});

test("semana não é redistribuída diretamente entre meses", () => {
  const rows = aggregateReconciliation.rollupAggregateRows(
    [aggregateRow("2026-01-26", "line-entry", 100)],
    "week",
    "month",
    new Date(2026, 0, 1),
    new Date(2026, 2, 1),
  );

  assert.deepEqual(rows, []);
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

test("período anterior mantém limites em meia-noite ao atravessar DST", () => {
  const period = {
    from: new Date(2026, 2, 8),
    to: new Date(2026, 2, 9),
  };
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    period,
    "previous_period",
  );

  assert.equal(baseline.from.getFullYear(), 2026);
  assert.equal(baseline.from.getMonth(), 2);
  assert.equal(baseline.from.getDate(), 7);
  assert.equal(baseline.from.getHours(), 0);
  assert.equal(baseline.to.getDate(), 8);
  assert.equal(baseline.to.getHours(), 0);
});

test("período anterior parcial termina antes do período atual sem sobrepor", () => {
  const period = {
    from: new Date(2026, 6, 1),
    to: new Date(2026, 6, 27, 12, 35),
  };
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    period,
    "previous_period",
  );

  assert.equal(baseline.to.getTime(), period.from.getTime());
  assert.equal(
    baseline.to.getTime() - baseline.from.getTime(),
    period.to.getTime() - period.from.getTime(),
  );
  assert.equal(baseline.from.getTime(), new Date(2026, 5, 4, 11, 25).getTime());
});

test("comparativo inclui a primeira hora parcial já reconciliada", () => {
  const period = {
    from: new Date(2025, 6, 1),
    to: new Date(2025, 6, 27, 12, 35),
  };
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({
      baselineComparable: {
        previous_period: {
          granularity: "hour",
          partialBoundariesReconciled: true,
          rows: [
            aggregateRow(
              "2025-06-04T11:00:00",
              "line-entry",
              7,
            ),
          ],
        },
      },
      dayRows: [
        aggregateRow("2025-07-01", "line-entry", 14),
      ],
    }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("cumulative_metric", {
      baseline: "previous_period",
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(model.table?.rows[0]?.baseline, 7);
});

test("mês anterior preserva o último dia com limite exclusivo", () => {
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2026, 2, 1),
      to: new Date(2026, 2, 31),
    },
    "previous_month",
  );

  assert.equal(baseline.from.getTime(), new Date(2026, 1, 1).getTime());
  assert.equal(baseline.to.getTime(), new Date(2026, 2, 1).getTime());
});

test("mês anterior aplica clamp sem avançar um corte parcial", () => {
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2026, 2, 1),
      to: new Date(2026, 2, 31, 15, 30),
    },
    "previous_month",
  );

  assert.equal(baseline.from.getTime(), new Date(2026, 1, 1).getTime());
  assert.equal(
    baseline.to.getTime(),
    new Date(2026, 1, 28, 15, 30).getTime(),
  );
});

test("ano anterior preserva a quantidade comparável no fevereiro bissexto", () => {
  const baseline = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2025, 1, 1),
      to: new Date(2025, 2, 1),
    },
    "last_year",
  );

  assert.equal(baseline.from.getTime(), new Date(2024, 1, 1).getTime());
  assert.equal(baseline.to.getTime(), new Date(2024, 1, 29).getTime());
});

test("ano anterior faz clamp de 29 de fevereiro sem invadir março", () => {
  const leapMonth = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2024, 1, 1),
      to: new Date(2024, 2, 1),
    },
    "last_year",
  );
  const leapDay = periodAnalysisModel.periodAnalysisBaselineRange(
    {
      from: new Date(2024, 1, 29),
      to: new Date(2024, 2, 1),
    },
    "last_year",
  );

  assert.equal(leapMonth.from.getTime(), new Date(2023, 1, 1).getTime());
  assert.equal(leapMonth.to.getTime(), new Date(2023, 2, 1).getTime());
  assert.equal(leapDay.from.getTime(), new Date(2023, 1, 28).getTime());
  assert.equal(leapDay.to.getTime(), new Date(2023, 2, 1).getTime());
});

test("Análises separa média-base completa do comparativo até o corte", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const baseline = {
    granularity: "day",
    rows: [
      aggregateRow("2026-06-01", "line-entry", 10),
      aggregateRow("2026-06-22", "line-entry", 20),
      aggregateRow("2026-06-30", "line-entry", 270),
    ],
  };
  const baselineComparable = {
    granularity: "day",
    rows: [
      aggregateRow("2026-06-01", "line-entry", 10),
      aggregateRow("2026-06-22", "line-entry", 20),
    ],
  };
  const data = analysisData({
    baseline: { previous_month: baseline },
    baselineComparable: { previous_month: baselineComparable },
    dayRows: [
      aggregateRow("2026-07-01", "line-entry", 30),
      aggregateRow("2026-07-22", "line-entry", 30),
    ],
    hourRows: [
      aggregateRow("2026-07-22T10:00:00", "line-entry", 30),
    ],
  });
  const commonWidget = {
    baseline: "previous_month",
    scenarioIds: [entryScenario.id],
    selectionMode: "custom",
  };
  const targetProgress = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("target_progress", commonWidget),
  });
  const cumulativeMetric =
    periodAnalysisModel.buildPeriodAnalysisWidgetModel({
      data,
      period,
      scenarios: [entryScenario],
      widget: analysisWidget("cumulative_metric", commonWidget),
    });

  assert.equal(targetProgress.table?.rows[0]?.baseline, 10);
  assert.equal(cumulativeMetric.table?.rows[0]?.baseline, 30);
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

test("Total do dia e Tendência 7 x 30 usam exatamente a mesma fonte horária", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const legacyDayRows = [
    aggregateRow("2026-07-22", "line-entry", 9_999),
  ];
  const canonicalHourRows = [
    aggregateRow("2026-07-22T09:00:00", "line-entry", 7),
    aggregateRow("2026-07-22T10:00:00", "line-entry", 5),
  ];
  const reconciledDayRows = aggregateReconciliation.reconcileAggregateRows(
    legacyDayRows,
    "day",
    canonicalHourRows,
    "hour",
    period.from,
    period.to,
  );
  const data = analysisData({
    dayRows: reconciledDayRows,
    hourRows: canonicalHourRows,
  });
  const widgetScope = {
    scenarioIds: [entryScenario.id],
    selectionMode: "custom",
  };
  const dayTotal = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("day_total", widgetScope),
  });
  const trend = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("trend", widgetScope),
  });
  const selectedDay = trend.table?.rows.find(
    (row) => row.date === "22/07",
  );

  assert.ok(
    legacyDayRows[0].total > canonicalHourRows.reduce(
      (total, row) => total + row.total,
      0,
    ),
    "o agregado diário legado deve reproduzir a divergência antiga",
  );
  assert.equal(dayTotal.metrics?.[0]?.value, 12);
  assert.equal(selectedDay?.total, 12);
  assert.equal(selectedDay?.total, dayTotal.metrics?.[0]?.value);
});

test("o bucket do dia 22 é invariável ao avançar a âncora para o dia 23", () => {
  const period22 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-22",
    "2026-07-22",
  );
  const period23 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-07-23",
    "2026-07-23",
  );
  assert.ok(period22);
  assert.ok(period23);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const dayRows = Array.from({ length: 23 }, (_, index) =>
    aggregateRow(
      `2026-07-${String(index + 1).padStart(2, "0")}`,
      "line-entry",
      index + 1,
    ),
  );
  const data = analysisData({ dayRows });
  const widget = analysisWidget("trend", {
    scenarioIds: [entryScenario.id],
    selectionMode: "custom",
  });
  const anchor22 = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period: period22,
    scenarios: [entryScenario],
    widget,
  });
  const anchor23 = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data,
    period: period23,
    scenarios: [entryScenario],
    widget,
  });
  const row22 = anchor22.table?.rows.find((row) => row.date === "22/07");
  const sameRowWithNextAnchor = anchor23.table?.rows.find(
    (row) => row.date === "22/07",
  );

  assert.ok(row22);
  assert.deepEqual(sameRowWithNextAnchor, row22);
});

test("janeiro mantém o mesmo valor ao fechar e avançar para fevereiro", () => {
  const january31 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-01-31",
    "2026-01-31",
  );
  const february1 = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-02-01",
    "2026-02-01",
  );
  assert.ok(january31);
  assert.ok(february1);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const data = analysisData({
    monthRows: [
      aggregateRow("2026-01-01", "line-entry", 310),
      aggregateRow("2026-02-01", "line-entry", 10),
    ],
  });

  for (const kind of ["year_monthly", "year_accumulated"]) {
    const widget = analysisWidget(kind, {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    });
    const atJanuaryClose =
      periodAnalysisModel.buildPeriodAnalysisWidgetModel({
        data,
        period: january31,
        scenarios: [entryScenario],
        widget,
      });
    const afterFebruaryStarts =
      periodAnalysisModel.buildPeriodAnalysisWidgetModel({
        data,
        period: february1,
        scenarios: [entryScenario],
        widget,
      });
    const closedJanuary = atJanuaryClose.table?.rows.find(
      (row) => row.month === "Jan",
    );
    const sameJanuary = afterFebruaryStarts.table?.rows.find(
      (row) => row.month === "Jan",
    );

    assert.ok(closedJanuary);
    assert.deepEqual(sameJanuary, closedJanuary, kind);
  }
});

test("mês parcial anual ignora horas posteriores à data consultada", () => {
  const period = periodAnalysisModel.resolvePeriodAnalysisRange(
    "2026-01-22",
    "2026-01-22",
  );
  assert.ok(period);

  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const monthRows = aggregateReconciliation.rollupAggregateRows(
    [
      aggregateRow("2026-01-22T10:00:00", "line-entry", 5),
      aggregateRow("2026-01-23T00:00:00", "line-entry", 900),
    ],
    "hour",
    "month",
    new Date(2026, 0, 1),
    new Date(2026, 0, 23),
  );
  const model = periodAnalysisModel.buildPeriodAnalysisWidgetModel({
    data: analysisData({ monthRows }),
    period,
    scenarios: [entryScenario],
    widget: analysisWidget("year_monthly", {
      scenarioIds: [entryScenario.id],
      selectionMode: "custom",
    }),
  });

  assert.equal(
    model.table?.rows.find((row) => row.month === "Jan")?.value,
    5,
  );
});

test("mês aberto compara somente horas fechadas equivalentes do ano anterior", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T15:00:00", "line-entry", 110),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T15:00:00", "line-entry", 20),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 310),
      aggregateRow("2026-07-01", "line-entry", 220),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const july = model.yearOverYearMonths.find((row) => row.month === 6);
  const comparison =
    countingIntelligence.buildCountingMonthlyComparison(model);
  const accumulatedOption =
    countingIntelligence.buildAnnualAccumulatedComparisonChartOption(model);
  const accumulatedVariationSeries = accumulatedOption.series.find(
    (series) => series.name === "Variação acumulada 2026/2025",
  );
  const reportAssets =
    countingIntelligence.buildCountingIntelligenceReportAssets(model);
  const accumulatedReport = reportAssets.charts.find(
    ({ cardId }) =>
      cardId ===
      countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS
        .annualAccumulatedComparison,
  );

  assert.equal(model.currentMonthValue, 220);
  assert.equal(model.currentMonthDelta, 0);
  assert.equal(model.periodDelta, 0);
  assert.deepEqual(
    {
      current: july?.current,
      delta: july?.delta,
      previous: july?.previous,
    },
    { current: 200, delta: 0, previous: 200 },
  );
  assert.equal(comparison.variation.accumulated, 0);
  assert.ok(accumulatedVariationSeries);
  assert.equal(accumulatedVariationSeries.data[6].delta, 0);
  assert.equal(
    accumulatedReport?.value.table.rows.find(({ month }) => month === "Jul")
      ?.variation,
    countingIntelligence.formatDelta(0),
  );
});

test("comparativo acumulado soma apenas meses cobertos nos dois anos", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2025-02-01", "line-entry", 50),
      aggregateRow("2026-01-01", "line-entry", 100),
      aggregateRow("2026-02-01", "line-entry", 100),
    ],
    now: new Date(2026, 2, 1),
    period: {
      from: new Date(2025, 0, 1),
      to: new Date(2026, 2, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  model.yearOverYearMonths = model.yearOverYearMonths.map((row) =>
    row.month === 0
      ? { ...row, delta: null, previous: null }
      : row,
  );
  const accumulatedOption =
    countingIntelligence.buildAnnualAccumulatedComparisonChartOption(model);
  const variationSeries = accumulatedOption.series.find(
    (series) => series.name === "Variação acumulada 2026/2025",
  );
  const accumulatedReport =
    countingIntelligence
      .buildCountingIntelligenceReportAssets(model)
      .charts.find(
        ({ cardId }) =>
          cardId ===
          countingIntelligence.COUNTING_INTELLIGENCE_CARD_IDS
            .annualAccumulatedComparison,
      );

  assert.ok(variationSeries);
  assert.equal(variationSeries.data[0], null);
  assert.equal(variationSeries.data[1].delta, 1);
  assert.equal(
    accumulatedReport?.value.table.rows.find(({ month }) => month === "Fev")
      ?.variation,
    countingIntelligence.formatDelta(1),
  );
});

test("base parcial sobreposta ganha série própria no comparativo anual", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2025-07-22T15:00:00", "line-entry", 110),
      aggregateRow("2026-07-01T10:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T14:00:00", "line-entry", 100),
      aggregateRow("2026-07-22T15:00:00", "line-entry", 20),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 310),
      aggregateRow("2026-07-01", "line-entry", 220),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2025, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const comparison =
    countingIntelligence.buildCountingMonthlyComparison(model);
  const selected2025 = comparison.rows.find(
    (row) => row.year === 2025 && !row.baselineOnly,
  );
  const comparable2025 = comparison.rows.find(
    (row) => row.year === 2025 && row.baselineOnly,
  );

  assert.equal(selected2025?.months[6], 310);
  assert.equal(comparable2025?.months[6], 200);
});

test("mês aberto sem eventos aparece como zero comparável", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2025-07-01T10:00:00", "line-entry", 100),
    ],
    includeOpenPeriod: true,
    monthlyRows: [
      aggregateRow("2025-07-01", "line-entry", 100),
    ],
    now: new Date(2026, 6, 22, 15, 30),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const july = model.yearOverYearMonths.find((row) => row.month === 6);
  const currentYear = model.yearRows.find((row) => row.year === 2026);

  assert.equal(model.currentMonthValue, 0);
  assert.equal(model.currentMonthDelta, -1);
  assert.deepEqual(
    {
      current: july?.current,
      delta: july?.delta,
      previous: july?.previous,
    },
    { current: 0, delta: -1, previous: 100 },
  );
  assert.equal(currentYear?.months[6], 0);
});

test("mês fechado sem eventos entra como zero na média certificada", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [],
    includeOpenPeriod: false,
    monthlyRows: [
      aggregateRow("2025-01-01", "line-entry", 50),
      aggregateRow("2025-02-01", "line-entry", 50),
      aggregateRow("2026-01-01", "line-entry", 100),
    ],
    now: new Date(2026, 2, 1),
    period: {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 2, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });
  const currentYear = model.yearRows.find((row) => row.year === 2026);
  const february = model.yearOverYearMonths.find((row) => row.month === 1);

  assert.deepEqual(currentYear?.months.slice(0, 2), [100, 0]);
  assert.equal(currentYear?.selectedMonthCount, 2);
  assert.equal(model.periodMonthCount, 2);
  assert.equal(model.periodAverage, 50);
  assert.deepEqual(
    {
      current: february?.current,
      delta: february?.delta,
      previous: february?.previous,
    },
    { current: 0, delta: -1, previous: 50 },
  );
});

test("comparativo anual não injeta meses fora do período selecionado", () => {
  const selected2025Months = [
    null,
    null,
    null,
    null,
    null,
    null,
    7,
    8,
    9,
    10,
    11,
    12,
  ];
  const comparison = countingIntelligence.buildCountingMonthlyComparison({
    currentYear: 2026,
    yearOverYearMonths: Array.from({ length: 12 }, (_, month) => ({
      current: month < 6 ? month + 11 : null,
      delta: null,
      label: "",
      month,
      previous: month < 6 ? month + 1 : null,
    })),
    yearRows: [
      {
        average: 9.5,
        months: selected2025Months,
        monthYoy: Array(12).fill(null),
        selectedMonthCount: 6,
        total: 57,
        year: 2025,
        ytd: 57,
        ytdYoy: null,
      },
      {
        average: 13.5,
        months: [11, 12, 13, 14, 15, 16, ...Array(6).fill(null)],
        monthYoy: Array(12).fill(null),
        selectedMonthCount: 6,
        total: 81,
        year: 2026,
        ytd: 81,
        ytdYoy: null,
      },
    ],
  });
  const selected2025 = comparison.rows.find(
    (row) => row.year === 2025 && !row.baselineOnly,
  );
  const baseline2025 = comparison.rows.find(
    (row) => row.year === 2025 && row.baselineOnly,
  );

  assert.ok(selected2025);
  assert.ok(baseline2025);
  assert.equal(selected2025.baselineOnly, false);
  assert.deepEqual(selected2025.months, selected2025Months);
  assert.equal(selected2025.accumulated, 57);
  assert.deepEqual(
    baseline2025.months.slice(0, 6),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    comparison.comparisonMonths.slice(0, 6),
    [1, 2, 3, 4, 5, 6],
  );

  const monthlyOption =
    countingIntelligence.buildAnnualComparisonChartOption({
      currentYear: 2026,
      yearOverYearMonths: Array.from({ length: 12 }, (_, month) => ({
        current: month < 6 ? month + 11 : null,
        delta: month < 6 ? 1 : null,
        label: "",
        month,
        previous: month < 6 ? month + 1 : null,
      })),
      yearRows: [
        {
          average: 9.5,
          months: selected2025Months,
          monthYoy: Array(12).fill(null),
          selectedMonthCount: 6,
          total: 57,
          year: 2025,
          ytd: 57,
          ytdYoy: null,
        },
        {
          average: 13.5,
          months: [11, 12, 13, 14, 15, 16, ...Array(6).fill(null)],
          monthYoy: Array(12).fill(null),
          selectedMonthCount: 6,
          total: 81,
          year: 2026,
          ytd: 81,
          ytdYoy: null,
        },
      ],
    });
  const variationSeries = monthlyOption.series.find(
    (series) => series.name === "Variação 2026/2025",
  );
  const baselineSeries = monthlyOption.series.find(
    (series) => series.name === "2025 (base comparável)",
  );

  assert.ok(variationSeries);
  assert.ok(baselineSeries);
  assert.equal(baselineSeries.data[0], 1);
  assert.equal(variationSeries.data[0].value, 11);
});

test("detalhes horários do relatório ignoram baseline e horas após o corte", () => {
  const entryScenario = scenario("entry", "Entrada", "line-entry", 1);
  const model = countingIntelligence.buildCountingIntelligenceModel({
    hourlyRows: [
      aggregateRow("2026-06-30T08:00:00", "line-entry", 100),
      aggregateRow("2026-07-15T09:00:00", "line-entry", 3),
      aggregateRow("2026-08-01T10:00:00", "line-entry", 200),
    ],
    monthlyRows: [
      aggregateRow("2026-07-01", "line-entry", 3),
    ],
    now: new Date(2026, 8, 1),
    period: {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 7, 1),
    },
    scenarios: [entryScenario],
    scope: {
      cameraIds: [],
      name: "Entrada",
      scenario: entryScenario,
    },
  });

  assert.equal(
    model.directionalHours.reduce((sum, row) => sum + row.total, 0),
    3,
  );
  assert.equal(
    model.accessHours.reduce((sum, row) => sum + row.total, 0),
    3,
  );
  assert.equal(model.directionalHours[9].total, 3);
  assert.equal(model.directionalHours[8].total, 0);
  assert.equal(model.directionalHours[10].total, 0);
});

test("variação anual compara somente meses com cobertura nos dois anos", () => {
  const comparison = countingIntelligence.buildCountingMonthlyComparison({
    currentYear: 2026,
    yearOverYearMonths: [
      {
        current: 100,
        delta: 1,
        label: "Jan",
        month: 0,
        previous: 50,
      },
      {
        current: 100,
        delta: null,
        label: "Fev",
        month: 1,
        previous: null,
      },
    ],
    yearRows: [],
  });

  assert.equal(comparison.variation.accumulated, 1);
  assert.equal(comparison.variation.average, 1);
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

function normalizeAggregateRows(rows) {
  return rows
    .map((row) => ({
      bucket: row.bucket,
      camera_id: row.camera_id,
      line_count_id: row.line_count_id,
      metric_type: row.metric_type,
      object_class: row.object_class,
      total: row.total,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function analysisData({
  baseline = {},
  baselineComparable,
  dayRows = [],
  hourRows = [],
  minuteRows = [],
  monthRows = [],
} = {}) {
  return {
    baseline,
    ...(baselineComparable ? { baselineComparable } : {}),
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
