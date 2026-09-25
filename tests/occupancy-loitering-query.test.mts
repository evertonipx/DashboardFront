import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createModuleLoader,
  type RuntimeFixture,
} from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type LoiteringQueryModule =
  typeof import("../lib/occupancy-loitering-query.ts");

const FROM = new Date("2026-09-14T03:00:00.000Z");
const TO = new Date("2026-09-17T03:00:00.000Z");

test("path preserva o intervalo semiaberto [from,to) em instantes ISO", () => {
  const { query } = createFixture();
  const path = query.occupancyLoiteringPath("summary", {
    from: FROM,
    to: TO,
  });

  assert.equal(
    path,
    "/occupancy/loitering/summary?from=2026-09-14T03%3A00%3A00.000Z&to=2026-09-17T03%3A00%3A00.000Z",
  );
  const parsed = new URL(path, "https://dashboard.invalid");
  assert.equal(parsed.searchParams.get("from"), FROM.toISOString());
  assert.equal(parsed.searchParams.get("to"), TO.toISOString());

  const adjacent = new URL(
    query.occupancyLoiteringPath("summary", {
      from: TO,
      to: new Date("2026-09-18T03:00:00.000Z"),
    }),
    "https://dashboard.invalid",
  );
  assert.equal(
    parsed.searchParams.get("to"),
    adjacent.searchParams.get("from"),
    "intervalos adjacentes devem compartilhar somente a fronteira exclusiva",
  );
});

test("path rejeita períodos vazios, invertidos ou inválidos", () => {
  const { query } = createFixture();

  for (const [from, to] of [
    [FROM, FROM],
    [TO, FROM],
    [new Date("invalid"), TO],
    [FROM, new Date("invalid")],
  ] as const) {
    assert.throws(
      () => query.occupancyLoiteringPath("summary", { from, to }),
      /período de permanência selecionado é inválido/,
    );
  }
});

test("summary e sessions enviam exclusivamente from e to", () => {
  const { query } = createFixture();
  for (const resource of ["summary", "sessions"] as const) {
    const path = query.occupancyLoiteringPath(resource, {
      from: FROM,
      to: TO,
    });
    const parsed = new URL(path, "https://dashboard.invalid");

    assert.equal(parsed.pathname, `/occupancy/loitering/${resource}`);
    assert.deepEqual(
      Array.from(parsed.searchParams.keys()),
      ["from", "to"],
      "o contrato tenant-wide não aceita filtros de câmera, área ou classe",
    );
    assert.equal(parsed.searchParams.get("from"), FROM.toISOString());
    assert.equal(parsed.searchParams.get("to"), TO.toISOString());
    assert.equal(parsed.searchParams.get("camera_id"), null);
    assert.equal(parsed.searchParams.get("area"), null);
    assert.equal(parsed.searchParams.get("object_class"), null);
  }
});

test("sessions preserva exatamente a precisão RFC3339 informada no período", () => {
  const { query } = createFixture();
  const from = new Date("2026-09-14T18:35:57.540Z");
  const to = new Date("2026-09-18T18:35:57.539Z");
  const path = query.occupancyLoiteringPath("sessions", { from, to });
  const parsed = new URL(path, "https://dashboard.invalid");

  assert.equal(parsed.searchParams.get("from"), "2026-09-14T18:35:57.540Z");
  assert.equal(parsed.searchParams.get("to"), "2026-09-18T18:35:57.539Z");
  assert.deepEqual(Array.from(parsed.searchParams.keys()), ["from", "to"]);
});

test("drill-down de sessions usa o período selecionado completo até 31 dias", () => {
  const { query } = createFixture();
  const from = new Date("2026-09-14T18:35:57.540Z");
  const to = new Date("2026-09-18T18:35:57.539Z");
  const range = query.occupancyLoiteringSessionsQueryRange({
    dayStart: new Date("2026-09-18T03:00:00.000Z"),
    from,
    timeZone: "America/Sao_Paulo",
    to,
  });

  assert.deepEqual(range, { from, slicedByDay: false, to });
  assert.equal(
    query.occupancyLoiteringPath("sessions", range!),
    "/occupancy/loitering/sessions?from=2026-09-14T18%3A35%3A57.540Z&to=2026-09-18T18%3A35%3A57.539Z",
  );
});

test("drill-down de sessions pagina intervalos extensos por dia civil", () => {
  const { query } = createFixture();
  const range = query.occupancyLoiteringSessionsQueryRange({
    dayStart: new Date("2026-09-14T03:00:00.000Z"),
    from: new Date("2026-08-01T03:00:00.000Z"),
    timeZone: "America/Sao_Paulo",
    to: new Date("2026-10-01T03:00:00.000Z"),
  });

  assert.deepEqual(range, {
    from: new Date("2026-09-14T03:00:00.000Z"),
    slicedByDay: true,
    to: new Date("2026-09-15T03:00:00.000Z"),
  });
});

test("prévia individual de período extenso começa no último dia civil selecionado", () => {
  const { query } = createFixture();
  const from = new Date("2025-09-17T03:00:00.000Z");
  const to = new Date("2026-09-17T03:00:00.000Z");
  const dayStart = query.initialOccupancyLoiteringSessionDay({
    from,
    timeZone: "America/Sao_Paulo",
    to,
  });
  const range = query.occupancyLoiteringSessionsQueryRange({
    dayStart,
    from,
    timeZone: "America/Sao_Paulo",
    to,
  });

  assert.equal(dayStart.toISOString(), "2026-09-16T03:00:00.000Z");
  assert.equal(range?.slicedByDay, true);
  assert.equal(range?.from.toISOString(), "2026-09-16T03:00:00.000Z");
  assert.equal(range?.to.toISOString(), "2026-09-17T03:00:00.000Z");
});

test("summary usa o transporte compartilhado sem antecipar sessions", async () => {
  const response = {
    data: [
      {
        area: "espera",
        avg_duration_seconds: 24.07,
        camera_id: "camera-a",
        max_duration_seconds: 44,
        min_duration_seconds: 5,
        object_class: "person",
        session_count: 14,
      },
    ],
  };
  const { calls, query } = createFixture(() => response);
  const controller = new AbortController();

  const rows = await query.fetchOccupancyLoiteringSummary({
    bypassCache: true,
    companyScopeId: "company-selected",
    from: FROM,
    live: true,
    signal: controller.signal,
    timeZone: "America/Sao_Paulo",
    to: TO,
  });

  assert.deepEqual(rows, response.data);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bypassCache, true);
  assert.equal(calls[0].companyScopeId, "company-selected");
  assert.equal(calls[0].path, query.occupancyLoiteringPath("summary", {
    from: FROM,
    to: TO,
  }));
  assert.equal(calls[0].priority, "background");
  assert.equal(calls[0].scenarioId, "occupancy-loitering-summary");
  assert.equal(calls[0].signal, controller.signal);
  assert.equal(calls[0].timeZone, "America/Sao_Paulo");
  assert.ok(calls[0].cacheTtlMs > 0);
  assert.ok(
    calls.every((call) => !String(call.path).includes("/sessions")),
    "consultar o resumo não deve carregar o log detalhado",
  );
});

test("summary contextualiza o GET tenant-wide por áreas esperadas em uma requisição", async () => {
  const selectedWithoutClass = {
    area: "espera",
    avg_duration_seconds: 24,
    camera_id: "camera-a",
    max_duration_seconds: 44,
    min_duration_seconds: 5,
    session_count: 14,
  };
  const { calls, query } = createFixture(() => ({
    data: [
      {
        area: "fora-do-escopo",
        camera_id: "camera-foreign",
        session_count: "inválido e irrelevante",
      },
      selectedWithoutClass,
    ],
  }));

  const rows = await query.fetchOccupancyLoiteringSummary({
    companyScopeId: "company-selected",
    expectedAreas: [
      { area: "espera", cameraId: "camera-a", objectClass: "person" },
    ],
    from: FROM,
    timeZone: "America/Sao_Paulo",
    to: TO,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(rows, [{ ...selectedWithoutClass, object_class: "person" }]);
});

test("summary não acrescenta seletores de câmera, área ou classe", async () => {
  const { calls, query } = createFixture(() => ({ data: [] }));

  await query.fetchOccupancyLoiteringSummary({
    companyScopeId: "company-selected",
    expectedAreas: [
      { area: "espera", cameraId: "camera-a", objectClass: "person" },
    ],
    from: FROM,
    timeZone: "America/Sao_Paulo",
    to: TO,
  });

  const parsed = new URL(calls[0].path, "https://dashboard.invalid");
  assert.deepEqual(Array.from(parsed.searchParams.keys()), ["from", "to"]);
});

test("Ao Vivo envia um summary diário civil completo em cada corte", async () => {
  const { calls, query } = createFixture(() => ({ data: [] }));
  const from = new Date("2026-09-17T03:00:00.000Z");
  for (const to of [
    new Date("2026-09-17T15:00:10.000Z"),
    new Date("2026-09-17T15:00:15.000Z"),
  ]) {
    await query.fetchOccupancyLoiteringSummary({
      companyScopeId: "company-selected",
      from,
      live: true,
      timeZone: "America/Sao_Paulo",
      to,
    });
  }

  assert.deepEqual(
    calls.map((call) => queryRange(call.path)),
    [
      ["2026-09-17T03:00:00.000Z", "2026-09-17T15:00:10.000Z"],
      ["2026-09-17T03:00:00.000Z", "2026-09-17T15:00:15.000Z"],
    ],
  );
  assert.ok(calls.every((call) => call.cacheTtlMs === 4_000));
  assert.ok(calls.every((call) => call.priority === "background"));
});

test("sessions consulta o tenant sob demanda somente por período", async () => {
  const response = {
    data: [
      {
        area: "espera & saída/nível + 1%",
        camera_id: "câmera/speed dome?A&B=%",
        duration_seconds: 21,
        ended_at: "2026-09-16T17:14:40Z",
        object_class: "person",
      },
    ],
  };
  const { calls, query } = createFixture(() => response);
  const controller = new AbortController();

  const rows = await query.fetchOccupancyLoiteringSessions({
    bypassCache: true,
    companyScopeId: "company-selected",
    from: FROM,
    signal: controller.signal,
    timeZone: "America/Sao_Paulo",
    to: TO,
  });

  assert.deepEqual(rows, response.data);
  assert.equal(calls.length, 1);
  const parsed = new URL(calls[0].path, "https://dashboard.invalid");
  assert.equal(parsed.searchParams.get("from"), FROM.toISOString());
  assert.equal(parsed.searchParams.get("to"), TO.toISOString());
  assert.deepEqual(Array.from(parsed.searchParams.keys()), ["from", "to"]);
  assert.equal(parsed.searchParams.get("camera_id"), null);
  assert.equal(parsed.searchParams.get("area"), null);
  assert.equal(parsed.searchParams.get("object_class"), null);
  assert.equal(calls[0].bypassCache, true);
  assert.equal(calls[0].companyScopeId, "company-selected");
  assert.equal(calls[0].priority, "foreground");
  assert.equal(calls[0].scenarioId, "occupancy-loitering-sessions");
  assert.equal(calls[0].signal, controller.signal);
  assert.equal(calls[0].timeZone, "America/Sao_Paulo");
});

test("sessions com período inválido falha antes de alcançar o transporte", async () => {
  const { calls, query } = createFixture();
  await assert.rejects(
    query.fetchOccupancyLoiteringSessions({
      companyScopeId: "company-selected",
      from: TO,
      signal: new AbortController().signal,
      timeZone: "America/Sao_Paulo",
      to: FROM,
    }),
    /período de permanência selecionado é inválido/,
  );
  assert.equal(calls.length, 0);
});

test("sessions aceita qualquer câmera e área do tenant e certifica [from,to)", async () => {
  const baseRow = {
    area: "espera",
    camera_id: "camera-a",
    duration_seconds: 21,
    ended_at: "2026-09-16T17:14:40Z",
    object_class: "person",
  };
  const base = {
    companyScopeId: "company-selected",
    from: FROM,
    timeZone: "America/Sao_Paulo",
    to: TO,
  };
  for (const row of [
    { ...baseRow, ended_at: new Date(FROM.getTime() - 1).toISOString() },
    { ...baseRow, ended_at: TO.toISOString() },
  ]) {
    const { query } = createFixture(() => ({ data: [row] }));
    await assert.rejects(
      query.fetchOccupancyLoiteringSessions(base),
      /fora do período solicitado/,
    );
  }
  const { query } = createFixture(() => ({
    data: [
      {
        ...baseRow,
        area: "outra-área",
        camera_id: "camera-b",
        ended_at: FROM.toISOString(),
      },
    ],
  }));
  await assert.doesNotReject(query.fetchOccupancyLoiteringSessions(base));
});

function createFixture(
  respond: (options: RuntimeFixture) => unknown = () => ({ data: [] }),
) {
  const calls: RuntimeFixture[] = [];
  const load = createModuleLoader(projectRoot, {
    mocks: {
      "@/lib/occupancy-shared-query": {
        fetchSharedOccupancyQuery: async (options: RuntimeFixture) => {
          calls.push(options);
          return respond(options);
        },
      },
    },
  });
  return {
    calls,
    query: load<LoiteringQueryModule>("lib/occupancy-loitering-query.ts"),
  };
}

function queryRange(path: string): [string | null, string | null] {
  const query = new URL(path, "https://dashboard.invalid").searchParams;
  return [query.get("from"), query.get("to")];
}
