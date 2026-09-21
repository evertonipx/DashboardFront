import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOccupancyLoiteringSummaryModel,
  combineOccupancyLoiteringSummaryRows,
  formatOccupancyLoiteringDuration,
  occupancyLoiteringKey,
  requireOccupancyLoiteringSessionRows,
  requireOccupancyLoiteringSummaryRows,
  selectOccupancyLoiteringSessions,
  summarizeOccupancyLoiteringSessions,
  type OccupancyLoiteringSessionRow,
  type OccupancyLoiteringSummaryRow,
} from "../lib/occupancy-loitering.ts";
import type { OccupancyScenario } from "../lib/types.ts";

function scenario(
  id: string,
  name: string,
  areas: OccupancyScenario["areas"],
  objectClass = "person",
): OccupancyScenario {
  return {
    active: true,
    areas,
    company_id: "company-private",
    id,
    name,
    object_class: objectClass,
  };
}

function summary(
  cameraId: string,
  area: string,
  count: number,
  average: number,
  minimum: number,
  maximum: number,
  objectClass = "person",
): OccupancyLoiteringSummaryRow {
  return {
    area,
    avg_duration_seconds: average,
    camera_id: cameraId,
    max_duration_seconds: maximum,
    min_duration_seconds: minimum,
    object_class: objectClass,
    session_count: count,
  };
}

function session(
  cameraId: string,
  area: string,
  duration: number,
  endedAt: string,
  objectClass = "person",
): OccupancyLoiteringSessionRow {
  return {
    area,
    camera_id: cameraId,
    duration_seconds: duration,
    ended_at: endedAt,
    object_class: objectClass,
  };
}

test("formatação da permanência preserva a precisão útil do summary", () => {
  assert.equal(formatOccupancyLoiteringDuration(0), "0 s");
  assert.equal(formatOccupancyLoiteringDuration(24.07), "24,1 s");
  assert.equal(formatOccupancyLoiteringDuration(24.07, true), "24,07 s");
  assert.equal(formatOccupancyLoiteringDuration(85), "1 min 25 s");
  assert.equal(formatOccupancyLoiteringDuration(3_660), "1 h 1 min");
  assert.equal(formatOccupancyLoiteringDuration(90_000), "1 dia 1 h");
  assert.equal(formatOccupancyLoiteringDuration(31_536_000), "1 ano");
  assert.equal(
    formatOccupancyLoiteringDuration(32_910_546.625),
    "1 ano 15 dias",
  );
  assert.equal(
    formatOccupancyLoiteringDuration(789_852_803),
    "25 anos 16 dias",
  );
  assert.equal(formatOccupancyLoiteringDuration(null), "—");
  assert.equal(formatOccupancyLoiteringDuration(-1), "—");
});

test("a chave composta preserva camera, área e classe sem colisão", () => {
  assert.notEqual(
    occupancyLoiteringKey("camera|a", "area", "person"),
    occupancyLoiteringKey("camera", "a|area", "person"),
  );
  assert.notEqual(
    occupancyLoiteringKey("camera", "area", "person"),
    occupancyLoiteringKey("camera", "area", "vehicle"),
  );
});

test("valida os campos documentados do summary e aceita extensões do Swagger", () => {
  const valid = summary("camera-a", "espera", 14, 24.07, 5, 44);
  assert.deepEqual(requireOccupancyLoiteringSummaryRows({ data: [valid] }), [
    valid,
  ]);

  assert.deepEqual(
    requireOccupancyLoiteringSummaryRows({
      data: [{ ...valid, metadata: "future-extension" }],
      total: 1,
    }),
    [valid],
  );
  const mixedCaseObjectClass = { ...valid, object_class: "Person" };
  assert.deepEqual(
    requireOccupancyLoiteringSummaryRows({ data: [mixedCaseObjectClass] }),
    [mixedCaseObjectClass],
    "object_class é uma string livre e deve preservar a capitalização da API",
  );
  for (const value of [
    [valid],
    { data: [{ ...valid, camera_id: undefined }] },
    { data: [{ ...valid, session_count: 1.5 }] },
    { data: [{ ...valid, avg_duration_seconds: Number.NaN }] },
    { data: [{ ...valid, min_duration_seconds: 30 }] },
    { data: [{ ...valid, object_class: 42 }] },
    { data: [{ ...valid, object_class: "" }] },
    { data: [{ ...valid, object_class: " person " }] },
  ]) {
    assert.throws(() => requireOccupancyLoiteringSummaryRows(value));
  }
  assert.throws(
    () =>
      requireOccupancyLoiteringSummaryRows({ data: [valid, { ...valid }] }),
    /área repetida/,
  );
});

test("summary infere object_class somente para um par esperado unívoco", () => {
  const rowWithoutClass = {
    area: "espera",
    avg_duration_seconds: 24.07,
    camera_id: "camera-a",
    max_duration_seconds: 44,
    min_duration_seconds: 5,
    session_count: 14,
  };

  assert.deepEqual(
    requireOccupancyLoiteringSummaryRows(
      { data: [rowWithoutClass] },
      [{ area: "espera", cameraId: "camera-a", objectClass: "Person" }],
    ),
    [{ ...rowWithoutClass, object_class: "Person" }],
    "a classe configurada deve ser preservada sem normalização",
  );

  assert.throws(
    () => requireOccupancyLoiteringSummaryRows(
      { data: [rowWithoutClass] },
      [
        { area: "espera", cameraId: "camera-a", objectClass: "person" },
        { area: "espera", cameraId: "camera-a", objectClass: "vehicle" },
      ],
    ),
    /ambígua/,
  );
});

test("summary sem object_class alimenta a permanência média do cenário", () => {
  const expectedAreas = [
    { area: "espera", cameraId: "camera-a", objectClass: "person" },
  ];
  const rows = requireOccupancyLoiteringSummaryRows(
    {
      data: [
        {
          area: "espera",
          avg_duration_seconds: 24.07,
          camera_id: "camera-a",
          max_duration_seconds: 44,
          min_duration_seconds: 5,
          session_count: 14,
        },
      ],
    },
    expectedAreas,
  );
  const model = buildOccupancyLoiteringSummaryModel(
    [
      scenario("scenario-a", "Espera", [
        { area_id: "espera", camera_id: "camera-a", label: "Espera" },
      ]),
    ],
    rows,
  );

  assert.deepEqual(model.scenarios[0].totals, {
    avgDurationSeconds: 24.07,
    maxDurationSeconds: 44,
    minDurationSeconds: 5,
    sessionCount: 14,
  });
});

test("summary tenant-wide ignora pares e classes não esperados sem contaminar o resultado", () => {
  const selected = summary("Camera-A", "Espera", 2, 30, 20, 40, "Person");
  const irrelevantMalformedMetrics = {
    area: "foreign-area",
    avg_duration_seconds: Number.NaN,
    camera_id: "foreign-camera",
  };
  const divergentClass = {
    ...selected,
    avg_duration_seconds: Number.NaN,
    object_class: "person",
  };

  assert.deepEqual(
    requireOccupancyLoiteringSummaryRows(
      { data: [irrelevantMalformedMetrics, divergentClass, selected] },
      [{ area: "Espera", cameraId: "Camera-A", objectClass: "Person" }],
    ),
    [selected],
    "IDs e classes devem ser comparados exatamente, sem lowercase ou label",
  );
  assert.throws(
    () => requireOccupancyLoiteringSummaryRows(
      { data: [{ ...irrelevantMalformedMetrics, camera_id: " foreign " }] },
      [{ area: "Espera", cameraId: "Camera-A", objectClass: "Person" }],
    ),
    /camera_id/,
    "até uma linha fora do escopo deve possuir identidade básica válida",
  );
});

test("summary contextualizado mantém ponderação ao combinar intervalos", () => {
  const expectedAreas = [
    { area: "espera", cameraId: "camera-a", objectClass: "person" },
  ];
  const parse = (sessionCount: number, average: number, minimum: number, maximum: number) =>
    requireOccupancyLoiteringSummaryRows(
      {
        data: [{
          area: "espera",
          avg_duration_seconds: average,
          camera_id: "camera-a",
          max_duration_seconds: maximum,
          min_duration_seconds: minimum,
          session_count: sessionCount,
        }],
      },
      expectedAreas,
    );
  const [combined] = combineOccupancyLoiteringSummaryRows([
    parse(2, 10, 5, 15),
    parse(6, 30, 20, 40),
  ]);

  assert.equal(combined.object_class, "person");
  assert.equal(combined.session_count, 8);
  assert.equal(combined.avg_duration_seconds, 25);
  assert.equal(combined.min_duration_seconds, 5);
  assert.equal(combined.max_duration_seconds, 40);
});

test("summary seleciona o superset do tenant e pondera por sessões", () => {
  const waiting = { area_id: "espera", camera_id: "camera-a", label: "Espera" };
  const stopped = { area_id: "parado", camera_id: "camera-a", label: "Parado" };
  const missing = { area_id: "sem-eventos", camera_id: "camera-b", label: "Sem eventos" };
  const scenarios = [
    scenario("scenario-a", "Recepção", [waiting, stopped, missing]),
    scenario("scenario-b", "Fila", [stopped]),
  ];
  const rows = [
    summary("camera-a", "espera", 14, 24.07, 5, 44),
    summary("camera-a", "parado", 28, 46.5, 7, 85),
    summary("camera-foreign", "outra-area", 900, 999, 999, 999),
  ];

  const model = buildOccupancyLoiteringSummaryModel(scenarios, rows);
  assert.equal(model.areas.length, 3, "a área compartilhada deve ser física e única");
  assert.equal(model.scenarios[0].areas.length, 3);
  assert.equal(model.scenarios[1].areas.length, 1);
  assert.equal(model.areas.find((area) => area.area === "sem-eventos")?.summary, null);
  assert.deepEqual(model.totals, {
    avgDurationSeconds: (14 * 24.07 + 28 * 46.5) / 42,
    maxDurationSeconds: 85,
    minDurationSeconds: 5,
    sessionCount: 42,
  });
  assert.deepEqual(model.scenarios[1].totals, {
    avgDurationSeconds: 46.5,
    maxDurationSeconds: 85,
    minDurationSeconds: 7,
    sessionCount: 28,
  });
  assert.ok(!model.areas.some((area) => area.area === "outra-area"));
});

test("totais vazios são nulos e linhas de contagem zero não inventam duração", () => {
  const selected = scenario("scenario-a", "Recepção", [
    { area_id: "espera", camera_id: "camera-a", label: "Espera" },
  ]);
  const model = buildOccupancyLoiteringSummaryModel(
    [selected],
    [summary("camera-a", "espera", 0, 0, 0, 0)],
  );
  assert.deepEqual(model.totals, {
    avgDurationSeconds: null,
    maxDurationSeconds: null,
    minDurationSeconds: null,
    sessionCount: 0,
  });
});

test("labels de fallback e erros não revelam IDs técnicos", () => {
  const privateScenarioId = "scenario-private-123";
  const privateCameraId = "camera-private-456";
  const privateAreaId = "area-private-789";
  const configured = scenario(privateScenarioId, privateScenarioId, [
    {
      area_id: privateAreaId,
      camera_id: privateCameraId,
      label: privateAreaId,
    },
  ]);
  const model = buildOccupancyLoiteringSummaryModel([configured], []);
  assert.equal(model.scenarios[0].label, "Cenário 1");
  assert.equal(model.areas[0].label, "Área 1");
  assert.ok(!model.scenarios[0].label.includes(privateScenarioId));
  assert.ok(!model.areas[0].label.includes(privateAreaId));
  assert.ok(!model.areas[0].label.includes(privateCameraId));

  let message = "";
  try {
    buildOccupancyLoiteringSummaryModel(
      [
        configured,
        scenario(privateScenarioId, "Outro", [
          { area_id: "outra", camera_id: "outra" },
        ]),
      ],
      [],
    );
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.ok(message);
  assert.ok(!message.includes(privateScenarioId));
  assert.ok(!message.includes(privateCameraId));
  assert.ok(!message.includes(privateAreaId));
});

test("labels de fallback humanizam nomes de área sem revelar identificadores opacos", () => {
  const configured = scenario("scenario-a", "Recepção", [
    { area_id: "parado", camera_id: "camera-a" },
    { area_id: "fila_de_espera", camera_id: "camera-b" },
    { area_id: "entrada-principal", camera_id: "camera-c" },
    { area_id: "tempoMedioVIP", camera_id: "camera-d" },
    {
      area_id: "6c0a1124-8b1d-4560-a359-76d54bd5347a",
      camera_id: "camera-e",
    },
    { area_id: "abcdefabcdefabcdefabcdef", camera_id: "camera-f" },
  ]);

  const model = buildOccupancyLoiteringSummaryModel([configured], []);
  assert.deepEqual(
    model.areas.map((area) => area.label),
    [
      "Parado",
      "Fila de Espera",
      "Entrada Principal",
      "Tempo Medio VIP",
      "Área 5",
      "Área 6",
    ],
  );
});

test("sessions preserva empates e ordena ended_at DESC de forma estável", () => {
  const sameTimeFirst = session(
    "camera-a",
    "parado",
    21,
    "2026-09-16T17:14:40Z",
  );
  const sameTimeSecond = session(
    "camera-a",
    "parado",
    7,
    "2026-09-16T17:14:40Z",
  );
  const older = session(
    "camera-a",
    "parado",
    18,
    "2026-09-15T17:14:40-03:00",
  );
  const latest = session(
    "camera-a",
    "parado",
    30,
    "2026-09-17T01:00:00Z",
  );
  assert.deepEqual(
    requireOccupancyLoiteringSessionRows({
      data: [older, sameTimeFirst, latest, sameTimeSecond],
    }),
    [latest, sameTimeFirst, sameTimeSecond, older],
  );
});

test("sessions filtra pelas chaves esperadas sem deduplicar ended_at", () => {
  const configured = scenario("scenario-a", "Recepção", [
    { area_id: "parado", camera_id: "camera-a", label: "Parado" },
  ]);
  const first = session(
    "camera-a",
    "parado",
    21,
    "2026-09-16T17:14:40Z",
  );
  const second = session(
    "camera-a",
    "parado",
    7,
    "2026-09-16T17:14:40Z",
  );
  const foreign = session(
    "camera-b",
    "outra-area",
    90,
    "2026-09-17T18:00:00Z",
  );
  assert.deepEqual(
    selectOccupancyLoiteringSessions(
      [configured],
      [second, foreign, first],
    ),
    [second, first],
  );
});

test("sessions aceita extensões e rejeita números ou timestamps inválidos", () => {
  const valid = session(
    "camera-a",
    "parado",
    21,
    "2026-09-16T17:14:40Z",
  );
  assert.deepEqual(
    requireOccupancyLoiteringSessionRows({
      data: [{ ...valid, session_id: "future-id" }],
      next_cursor: null,
    }),
    [valid],
  );
  const mixedCaseObjectClass = { ...valid, object_class: "Vehicle" };
  assert.deepEqual(
    requireOccupancyLoiteringSessionRows({ data: [mixedCaseObjectClass] }),
    [mixedCaseObjectClass],
    "sessions também devem preservar qualquer object_class textual válido",
  );
  for (const value of [
    [valid],
    { data: [{ ...valid, area: undefined }] },
    { data: [{ ...valid, duration_seconds: -1 }] },
    { data: [{ ...valid, duration_seconds: Number.NaN }] },
    { data: [{ ...valid, object_class: null }] },
    { data: [{ ...valid, object_class: "" }] },
    { data: [{ ...valid, object_class: "person " }] },
    { data: [{ ...valid, ended_at: "2026-09-16 17:14:40" }] },
    { data: [{ ...valid, ended_at: "2026-02-30T17:14:40Z" }] },
    { data: [{ ...valid, ended_at: "2026-09-16T25:14:40Z" }] },
  ]) {
    assert.throws(() => requireOccupancyLoiteringSessionRows(value));
  }
});

test("sessions são resumidas por câmera, área e classe sem perder multiplicidade", () => {
  const duplicate = session(
    "camera-a",
    "parado",
    7,
    "2026-09-16T17:14:40Z",
  );
  const rows = [
    duplicate,
    { ...duplicate },
    session("camera-a", "parado", 21, "2026-09-16T18:14:40Z"),
    session("camera-a", "parado", 99, "2026-09-16T19:14:40Z", "vehicle"),
    session("camera-b", "parado", 30, "2026-09-16T20:14:40Z"),
    session("camera-a", "espera", 12, "2026-09-16T21:14:40Z"),
  ];

  const summaries = summarizeOccupancyLoiteringSessions(rows);
  const stoppedPeople = summaries.find(
    (row) =>
      row.camera_id === "camera-a" &&
      row.area === "parado" &&
      row.object_class === "person",
  );

  assert.deepEqual(stoppedPeople, summary("camera-a", "parado", 3, 35 / 3, 7, 21));
  assert.equal(summaries.length, 4);
  assert.equal(
    summaries.reduce((total, row) => total + row.session_count, 0),
    rows.length,
    "sessões iguais representam ocorrências distintas e não podem ser deduplicadas",
  );
});

test("resumo de sessions usa identidade sem colisão e preserva capitalização", () => {
  const summaries = summarizeOccupancyLoiteringSessions([
    session("camera|a", "area", 10, "2026-09-16T17:00:00Z", "Person"),
    session("camera", "a|area", 20, "2026-09-16T18:00:00Z", "Person"),
    session("camera|a", "area", 30, "2026-09-16T19:00:00Z", "person"),
  ]);

  assert.deepEqual(
    summaries.map((row) => [
      row.camera_id,
      row.area,
      row.object_class,
      row.session_count,
    ]),
    [
      ["camera|a", "area", "person", 1],
      ["camera", "a|area", "Person", 1],
      ["camera|a", "area", "Person", 1],
    ],
    "a ordem dos grupos acompanha a primeira sessão na ordenação ended_at DESC",
  );
});

test("resumo de sessions valida a entrada e não modifica a lista recebida", () => {
  const older = session(
    "camera-a",
    "parado",
    5,
    "2026-09-15T17:14:40Z",
  );
  const latest = session(
    "camera-a",
    "parado",
    15,
    "2026-09-17T17:14:40Z",
  );
  const rows = [older, latest];

  assert.deepEqual(summarizeOccupancyLoiteringSessions(rows), [
    summary("camera-a", "parado", 2, 10, 5, 15),
  ]);
  assert.deepEqual(rows, [older, latest]);
  assert.throws(
    () =>
      summarizeOccupancyLoiteringSessions([
        { ...older, duration_seconds: -1 },
      ]),
    /duration_seconds/,
  );
});

test("resumo de sessions vazio é vazio e médias finitas não transbordam", () => {
  assert.deepEqual(summarizeOccupancyLoiteringSessions([]), []);

  const [extreme] = summarizeOccupancyLoiteringSessions([
    session("camera-a", "parado", Number.MAX_VALUE, "2026-09-17T17:14:40Z"),
    session("camera-a", "parado", Number.MAX_VALUE, "2026-09-16T17:14:40Z"),
  ]);
  assert.equal(extreme.session_count, 2);
  assert.equal(extreme.avg_duration_seconds, Number.MAX_VALUE);
  assert.equal(extreme.min_duration_seconds, Number.MAX_VALUE);
  assert.equal(extreme.max_duration_seconds, Number.MAX_VALUE);
});

test("intervalos disjuntos combinam contagem, média ponderada e extremos", () => {
  const combined = combineOccupancyLoiteringSummaryRows([
    [summary("camera-a", "parado", 14, 24.07, 5, 44)],
    [summary("camera-a", "parado", 28, 46.5, 7, 85)],
    [summary("camera-b", "espera", 3, 10, 8, 12)],
  ]);
  assert.equal(combined.length, 2);
  const parado = combined.find((row) => row.area === "parado");
  assert.ok(parado);
  assert.equal(parado.session_count, 42);
  assert.equal(
    parado.avg_duration_seconds,
    (14 * 24.07 + 28 * 46.5) / 42,
  );
  assert.equal(parado.min_duration_seconds, 5);
  assert.equal(parado.max_duration_seconds, 85);
});

test("intervalo sem sessões não dilui estatísticas confirmadas", () => {
  const [combined] = combineOccupancyLoiteringSummaryRows([
    [summary("camera-a", "parado", 0, 0, 0, 0)],
    [summary("camera-a", "parado", 2, 30, 20, 40)],
  ]);
  assert.equal(combined.session_count, 2);
  assert.equal(combined.avg_duration_seconds, 30);
  assert.equal(combined.min_duration_seconds, 20);
  assert.equal(combined.max_duration_seconds, 40);
});
