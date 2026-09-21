import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOccupancyLoiteringTemporalModel,
  type OccupancyLoiteringTemporalGranularity,
} from "../lib/occupancy-loitering-temporal.ts";
import {
  buildOccupancyLoiteringSummaryModel,
  type OccupancyLoiteringSessionRow,
} from "../lib/occupancy-loitering.ts";
import type { OccupancyScenario } from "../lib/types.ts";

function scenario(
  id: string,
  name: string,
  areas: OccupancyScenario["areas"],
): OccupancyScenario {
  return {
    active: true,
    areas,
    company_id: "company-private",
    id,
    name,
    object_class: "person",
  };
}

function session(
  area: string,
  duration: number,
  endedAt: string,
  cameraId = "camera-a",
): OccupancyLoiteringSessionRow {
  return {
    area,
    camera_id: cameraId,
    duration_seconds: duration,
    ended_at: endedAt,
    object_class: "person",
  };
}

function model(
  sessions: readonly OccupancyLoiteringSessionRow[],
  options: {
    from?: string;
    granularity?: "auto" | OccupancyLoiteringTemporalGranularity;
    maxBuckets?: number;
    scenarios?: OccupancyScenario[];
    timeZone?: string;
    to?: string;
  } = {},
) {
  const scenarios = options.scenarios ?? [
    scenario("scenario-a", "Recepção", [
      { area_id: "parado", camera_id: "camera-a", label: "Parado" },
      { area_id: "espera", camera_id: "camera-a", label: "Espera" },
    ]),
  ];
  return buildOccupancyLoiteringTemporalModel({
    context: buildOccupancyLoiteringSummaryModel(scenarios, []),
    from: options.from ?? "2026-09-19T21:15:00.000Z",
    granularity: options.granularity,
    maxBuckets: options.maxBuckets,
    sessions,
    timeZone: options.timeZone ?? "America/Sao_Paulo",
    to: options.to ?? "2026-09-19T21:20:00.000Z",
  });
}

test("agrega sessões concluídas em minutos civis sem perder zeros ou duplicatas", () => {
  const temporal = model([
    session("parado", 0, "2026-09-19T21:15:00.000Z"),
    session("parado", 10, "2026-09-19T21:15:20.000Z"),
    session("parado", 30, "2026-09-19T21:15:20.000Z"),
    session("espera", 20, "2026-09-19T21:16:00.000Z"),
    session("parado", 999, "2026-09-19T21:20:00.000Z"),
    session("parado", 999, "2026-09-19T21:14:59.999Z"),
  ], { maxBuckets: 10 });

  assert.equal(temporal.granularity, "minute");
  assert.equal(temporal.buckets.length, 5);
  assert.deepEqual(temporal.totals, {
    avgDurationSeconds: 15,
    count: 4,
    maxDurationSeconds: 30,
    medianDurationSeconds: 15,
    minDurationSeconds: 0,
    p90DurationSeconds: 30,
    sumDurationSeconds: 60,
  });
  assert.equal(temporal.buckets[0].count, 3);
  assert.equal(temporal.buckets[0].sumDurationSeconds, 40);
  assert.equal(temporal.buckets[1].count, 1);
  assert.equal(temporal.buckets[2].count, 0);
  assert.equal(temporal.buckets[2].observed, true);
  assert.equal(temporal.buckets[2].hasSessions, false);

  const parado = temporal.areas.find((area) => area.label === "Parado");
  assert.ok(parado);
  assert.equal(parado.stats.count, 3);
  assert.equal(parado.stats.sumDurationSeconds, 40);
  assert.equal(parado.stats.medianDurationSeconds, 10);
  assert.equal(parado.buckets[0].count, 3);
  assert.equal(parado.buckets[1].count, 0);
  assert.equal(temporal.matrix.length, 2 * 5);
  assert.equal(
    temporal.matrix.filter((cell) => cell.hasSessions).length,
    2,
  );
});

test("histograma global e por área preserva zero, segundos decimais e extremo", () => {
  const extreme = 789_852_803;
  const temporal = model([
    session("parado", 0, "2026-09-19T21:15:01.000Z"),
    session("parado", 4.5, "2026-09-19T21:15:02.000Z"),
    session("parado", 5, "2026-09-19T21:15:03.000Z"),
    session("espera", extreme, "2026-09-19T21:15:04.000Z"),
  ]);

  assert.equal(temporal.histogram[0].count, 2);
  assert.equal(temporal.histogram[1].count, 1);
  assert.equal(temporal.histogram.at(-1)?.count, 1);
  assert.equal(temporal.histogram.at(-1)?.sumDurationSeconds, extreme);
  assert.equal(
    temporal.histogram.reduce((sum, bin) => sum + bin.count, 0),
    4,
  );
  assert.equal(
    temporal.histogram.reduce((sum, bin) => sum + bin.percentage, 0),
    100,
  );
  assert.equal(temporal.totals.maxDurationSeconds, extreme);
  assert.equal(temporal.totals.p90DurationSeconds, extreme);
  assert.ok(Number.isFinite(temporal.totals.sumDurationSeconds));
  const espera = temporal.areas.find((area) => area.label === "Espera");
  assert.equal(espera?.histogram.at(-1)?.count, 1);
});

test("área física compartilhada não duplica sessões entre cenários", () => {
  const sharedArea = {
    area_id: "parado",
    camera_id: "camera-a",
    label: "Parado",
  };
  const temporal = model(
    [session("parado", 21, "2026-09-19T21:15:30.000Z")],
    {
      scenarios: [
        scenario("scenario-a", "Fila", [sharedArea]),
        scenario("scenario-b", "Atendimento", [sharedArea]),
      ],
    },
  );

  assert.equal(temporal.areas.length, 1);
  assert.deepEqual(temporal.areas[0].scenarioIds, ["scenario-a", "scenario-b"]);
  assert.deepEqual(temporal.areas[0].scenarioLabels, ["Fila", "Atendimento"]);
  assert.equal(temporal.areas[0].stats.count, 1);
  assert.equal(temporal.totals.count, 1);
});

test("granularidade solicitada é promovida até respeitar o máximo", () => {
  const temporal = model([], {
    from: "2026-09-19T21:15:00.000Z",
    granularity: "minute",
    maxBuckets: 2,
    to: "2026-09-19T23:15:00.000Z",
  });

  assert.equal(temporal.requestedGranularity, "minute");
  assert.equal(temporal.granularity, "day");
  assert.equal(temporal.buckets.length, 1);
});

test("ranges longos consolidam meses civis com stride sem exceder o limite", () => {
  const temporal = model([], {
    from: "2020-01-01T03:00:00.000Z",
    maxBuckets: 12,
    to: "2030-01-01T03:00:00.000Z",
  });

  assert.equal(temporal.granularity, "month");
  assert.equal(temporal.stride, 10);
  assert.equal(temporal.buckets.length, 12);
  assert.match(temporal.buckets[0].label, /^01\/2020–10\/2020$/);
  assert.equal(temporal.buckets.at(-1)?.to, "2030-01-01T03:00:00.000Z");
});

test("dia curto de DST contém 23 horas civis e não fabrica 02h", () => {
  const temporal = model([], {
    from: "2026-03-08T05:00:00.000Z",
    maxBuckets: 30,
    timeZone: "America/New_York",
    to: "2026-03-09T04:00:00.000Z",
  });

  assert.equal(temporal.granularity, "hour");
  assert.equal(temporal.buckets.length, 23);
  assert.ok(temporal.buckets.every((bucket) => bucket.label !== "02h"));
});

test("dia longo de DST mantém as duas ocorrências de 01h com offset", () => {
  const temporal = model([], {
    from: "2026-11-01T04:00:00.000Z",
    maxBuckets: 30,
    timeZone: "America/New_York",
    to: "2026-11-02T05:00:00.000Z",
  });

  assert.equal(temporal.granularity, "hour");
  assert.equal(temporal.buckets.length, 25);
  const repeated = temporal.buckets.filter((bucket) => bucket.label.startsWith("01h"));
  assert.deepEqual(
    repeated.map((bucket) => bucket.label),
    ["01h UTC-04", "01h UTC-05"],
  );
  assert.notEqual(repeated[0].key, repeated[1].key);
});

test("buckets diários preservam dias IANA de 24, 23 e 24 horas", () => {
  const temporal = model([], {
    from: "2026-03-07T05:00:00.000Z",
    granularity: "day",
    maxBuckets: 5,
    timeZone: "America/New_York",
    to: "2026-03-10T04:00:00.000Z",
  });

  assert.equal(temporal.granularity, "day");
  assert.deepEqual(
    temporal.buckets.map(
      (bucket) =>
        (Date.parse(bucket.to) - Date.parse(bucket.from)) / (60 * 60_000),
    ),
    [24, 23, 24],
  );
  assert.deepEqual(
    temporal.buckets.map((bucket) => bucket.label),
    ["07/03/2026", "08/03/2026", "09/03/2026"],
  );
});

test("semana civil começa na segunda-feira e mantém pontas parciais", () => {
  const temporal = model([
    session("parado", 12, "2026-09-16T15:00:00.000Z"),
    session("parado", 18, "2026-09-21T15:00:00.000Z"),
  ], {
    from: "2026-09-16T03:00:00.000Z",
    granularity: "week",
    maxBuckets: 3,
    to: "2026-09-30T03:00:00.000Z",
  });

  assert.equal(temporal.granularity, "week");
  assert.equal(temporal.buckets.length, 3);
  assert.equal(temporal.buckets[0].from, "2026-09-16T03:00:00.000Z");
  assert.equal(temporal.buckets[0].to, "2026-09-21T03:00:00.000Z");
  assert.equal(temporal.buckets[0].count, 1);
  assert.equal(temporal.buckets[1].count, 1);
  assert.equal(temporal.buckets[2].to, "2026-09-30T03:00:00.000Z");
});

test("buckets parciais respeitam exatamente o intervalo semiaberto", () => {
  const temporal = model([
    session("parado", 1, "2026-09-19T21:15:15.250Z"),
    session("parado", 2, "2026-09-19T21:16:45.499Z"),
    session("parado", 3, "2026-09-19T21:16:45.500Z"),
  ], {
    from: "2026-09-19T21:15:15.250Z",
    maxBuckets: 10,
    to: "2026-09-19T21:16:45.500Z",
  });

  assert.equal(temporal.buckets.length, 2);
  assert.equal(temporal.buckets[0].from, "2026-09-19T21:15:15.250Z");
  assert.equal(temporal.buckets[1].to, "2026-09-19T21:16:45.500Z");
  assert.equal(temporal.totals.count, 2);
  assert.equal(temporal.totals.sumDurationSeconds, 3);
});

test("rejeita fuso, intervalo, limite e histograma inválidos", () => {
  const context = buildOccupancyLoiteringSummaryModel([], []);
  const base = {
    context,
    from: "2026-09-19T21:15:00.000Z",
    sessions: [] as OccupancyLoiteringSessionRow[],
    timeZone: "UTC",
    to: "2026-09-19T21:20:00.000Z",
  };
  assert.throws(
    () => buildOccupancyLoiteringTemporalModel({ ...base, timeZone: "Mars/Olympus" }),
    /fuso horário da empresa é inválido/i,
  );
  assert.throws(
    () => buildOccupancyLoiteringTemporalModel({ ...base, from: base.to }),
    /início.*anterior/i,
  );
  assert.throws(
    () => buildOccupancyLoiteringTemporalModel({ ...base, maxBuckets: 0 }),
    /limite temporal/i,
  );
  assert.throws(
    () => buildOccupancyLoiteringTemporalModel({
      ...base,
      histogramEdgesSeconds: [1, 2],
    }),
    /começar em zero/i,
  );
  assert.throws(
    () => buildOccupancyLoiteringTemporalModel({
      ...base,
      histogramEdgesSeconds: [0, 5, 5],
    }),
    /crescentes/i,
  );
});
