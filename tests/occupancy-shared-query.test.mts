import assert from "node:assert/strict";
import test from "node:test";

import {
  clearSharedOccupancyQueries,
  createSharedOccupancyQueryClient,
  sharedOccupancyCivilCapabilities,
} from "../lib/occupancy-shared-query.ts";

const HOUR_MS = 3_600_000;
const base = {
  authScope: "session-a",
  cacheTtlMs: 5_000,
  companyScopeId: "company-a",
  path: "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-15T03%3A00%3A00.000Z&granularity=hour&to=2026-09-15T06%3A00%3A00.000Z",
  scenarioId: "scenario-a",
  timeZone: "America/Sao_Paulo",
};

test("capability civil é compartilhada entre consumidores sem cruzar escopos", () => {
  clearSharedOccupancyQueries();
  const first = sharedOccupancyCivilCapabilities(
    "company-a",
    "America/Sao_Paulo",
  );
  assert.equal(
    sharedOccupancyCivilCapabilities("company-a", "America/Sao_Paulo"),
    first,
  );
  assert.notEqual(
    sharedOccupancyCivilCapabilities("company-b", "America/Sao_Paulo"),
    first,
  );
  assert.notEqual(
    sharedOccupancyCivilCapabilities("company-a", "UTC"),
    first,
  );
  clearSharedOccupancyQueries();
});

test("consultas idênticas são coalescidas mesmo com parâmetros em outra ordem", async () => {
  const client = createSharedOccupancyQueryClient();
  const gate = deferred<{ value: number }>();
  let calls = 0;
  const first = client.request({
    ...base,
    execute: async () => {
      calls += 1;
      return gate.promise;
    },
  });
  const second = client.request({
    ...base,
    path: "/occupancy/scenarios/scenario-a/aggregate?to=2026-09-15T06%3A00%3A00.000Z&from=2026-09-15T03%3A00%3A00.000Z&granularity=hour",
    execute: async () => {
      calls += 1;
      return { value: 99 };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  gate.resolve({ value: 42 });
  assert.deepEqual(await Promise.all([first, second]), [
    { value: 42 },
    { value: 42 },
  ]);
});

test("cancelar um consumidor não aborta a consulta ainda usada por outro", async () => {
  const client = createSharedOccupancyQueryClient();
  const gate = deferred<string>();
  const firstController = new AbortController();
  let sharedSignal: AbortSignal | undefined;
  const first = client.request({
    ...base,
    signal: firstController.signal,
    execute: async (signal) => {
      sharedSignal = signal;
      return gate.promise;
    },
  });
  const second = client.request({
    ...base,
    execute: async () => "duplicated",
  });
  await Promise.resolve();
  firstController.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(sharedSignal?.aborted, false);
  gate.resolve("shared");
  assert.equal(await second, "shared");
});

test("remount no mesmo turno reutiliza o transporte abandonado pelo Strict Mode", async () => {
  const client = createSharedOccupancyQueryClient();
  const gate = deferred<string>();
  const firstController = new AbortController();
  let calls = 0;
  const first = client.request({
    ...base,
    signal: firstController.signal,
    execute: async () => {
      calls += 1;
      return gate.promise;
    },
  });
  await drain();
  firstController.abort();
  const remounted = client.request({
    ...base,
    execute: async () => {
      calls += 1;
      return "duplicated";
    },
  });
  await assert.rejects(first, { name: "AbortError" });
  await drain();
  assert.equal(calls, 1, "o remount não deve criar um GET idêntico");
  gate.resolve("shared-after-remount");
  assert.equal(await remounted, "shared-after-remount");
});

test("sem consumidores a fila cancela o transporte antes de atingir a API", async () => {
  const client = createSharedOccupancyQueryClient({ concurrency: 1 });
  const controller = new AbortController();
  let calls = 0;
  const request = client.request({
    ...base,
    signal: controller.signal,
    execute: async () => {
      calls += 1;
      return "unexpected";
    },
  });
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  await Promise.resolve();
  assert.equal(calls, 0);
});

test("uma consulta abortada sem consumidores nunca é reutilizada", async () => {
  const client = createSharedOccupancyQueryClient({ concurrency: 2 });
  const staleGate = deferred<string>();
  const staleController = new AbortController();
  let calls = 0;
  const stale = client.request({
    ...base,
    signal: staleController.signal,
    execute: async () => {
      calls += 1;
      return staleGate.promise;
    },
  });

  await drain();
  assert.equal(calls, 1);
  staleController.abort();
  await assert.rejects(stale, { name: "AbortError" });

  const fresh = client.request({
    ...base,
    execute: async () => {
      calls += 1;
      return "fresh";
    },
  });
  await drain();
  assert.equal(calls, 2, "a nova tela deve abrir um transporte próprio");
  assert.equal(await fresh, "fresh");

  staleGate.resolve("stale");
  await drain();
});

test("TTL reaproveita a resposta e bypass preserva atualização explícita", async () => {
  let now = 1_000;
  const client = createSharedOccupancyQueryClient({ now: () => now });
  let calls = 0;
  const query = (overrides = {}) => client.request({
    ...base,
    ...overrides,
    execute: async () => ({ revision: ++calls }),
  });
  assert.deepEqual(await query(), { revision: 1 });
  now += 4_999;
  assert.deepEqual(await query(), { revision: 1 });
  assert.deepEqual(await query({ bypassCache: true }), { revision: 2 });
  now += 5_001;
  assert.deepEqual(await query(), { revision: 3 });
});

test("uma janela maior certificada atende uma janela interna sem novo GET", async () => {
  const client = createSharedOccupancyQueryClient();
  let calls = 0;
  const broad = await client.request({
    ...base,
    execute: async () => {
      calls += 1;
      return aggregateResponse(3, { complete: true, status: "complete" });
    },
  });
  assert.equal(broad.data.length, 3);
  const subset = await client.request({
    ...base,
    path: "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-15T04%3A00%3A00.000Z&granularity=hour&to=2026-09-15T05%3A00%3A00.000Z",
    execute: async () => {
      calls += 1;
      return aggregateResponse(1);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(subset.data.map((row) => row.bucket), [
    "2026-09-15T04:00:00.000Z",
  ]);
});

test("janela interna aguarda e reutiliza uma consulta maior ainda em andamento", async () => {
  const client = createSharedOccupancyQueryClient();
  const gate = deferred<ReturnType<typeof aggregateResponse>>();
  let calls = 0;
  const broad = client.request({
    ...base,
    execute: async () => {
      calls += 1;
      return gate.promise;
    },
  });
  await drain();

  const subset = client.request({
    ...base,
    path: "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-15T04%3A00%3A00.000Z&granularity=hour&to=2026-09-15T05%3A00%3A00.000Z",
    execute: async () => {
      calls += 1;
      return aggregateResponse(1);
    },
  });
  await drain();
  assert.equal(calls, 1, "a janela interna não deve abrir transporte paralelo");

  gate.resolve(aggregateResponse(3, { complete: true, status: "complete" }));
  await broad;
  assert.deepEqual((await subset).data.map((row) => row.bucket), [
    "2026-09-15T04:00:00.000Z",
  ]);
  assert.equal(calls, 1);
});

test("parâmetros funcionais diferentes nunca compartilham containment", async () => {
  const client = createSharedOccupancyQueryClient();
  let calls = 0;
  await client.request({
    ...base,
    path: `${base.path}&metric=average`,
    execute: async () => {
      calls += 1;
      return aggregateResponse(3, { complete: true, status: "complete" });
    },
  });
  const subset = await client.request({
    ...base,
    path: "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-15T04%3A00%3A00.000Z&granularity=hour&metric=maximum&to=2026-09-15T05%3A00%3A00.000Z",
    execute: async () => {
      calls += 1;
      return { source: "maximum" };
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(subset, { source: "maximum" });
});

test("resposta exata fresca vence uma janela maior previamente armazenada", async () => {
  const client = createSharedOccupancyQueryClient();
  let calls = 0;
  await client.request({
    ...base,
    execute: async () => {
      calls += 1;
      return aggregateResponse(3, { complete: true, status: "complete" });
    },
  });
  const exactPath =
    "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-15T04%3A00%3A00.000Z&granularity=hour&to=2026-09-15T05%3A00%3A00.000Z";
  const exactResponse = {
    ...aggregateResponse(1, { complete: true, status: "complete" }),
    data: [
      {
        bucket: "2026-09-15T04:00:00.000Z",
        scenario_total_avg: 99,
        scenario_total_max: 99,
        scenario_total_min: 99,
      },
    ],
  };
  assert.deepEqual(
    await client.request({
      ...base,
      bypassCache: true,
      path: exactPath,
      execute: async () => {
        calls += 1;
        return exactResponse;
      },
    }),
    exactResponse,
  );
  const cached = await client.request<typeof exactResponse>({
    ...base,
    path: exactPath,
    execute: async () => {
      calls += 1;
      return exactResponse;
    },
  });

  assert.equal(calls, 2);
  assert.equal(cached.data[0].scenario_total_avg, 99);
});

test("agregados civis coarse não usam containment entre datas", async () => {
  const client = createSharedOccupancyQueryClient();
  let calls = 0;
  await client.request({
    ...base,
    path: "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-01&granularity=day&to=2026-09-10",
    execute: async () => {
      calls += 1;
      return {
        complete: true,
        data: [{ bucket: "2026-09-02", scenario_total_avg: 1 }],
        granularity: "day",
        scenario_id: "scenario-a",
        status: "complete",
        timezone: "America/Sao_Paulo",
      };
    },
  });
  const subset = await client.request({
    ...base,
    path: "/occupancy/scenarios/scenario-a/aggregate?from=2026-09-02&granularity=day&to=2026-09-03",
    execute: async () => {
      calls += 1;
      return { source: "exact-day" };
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(subset, { source: "exact-day" });
});

test("escopo autenticado, empresa, cenário e fuso nunca compartilham cache", async () => {
  const client = createSharedOccupancyQueryClient();
  let calls = 0;
  const request = (overrides = {}) => client.request({
    ...base,
    ...overrides,
    execute: async () => ++calls,
  });
  assert.equal(await request(), 1);
  assert.equal(await request({ authScope: "session-b" }), 2);
  assert.equal(await request({ companyScopeId: "company-b" }), 3);
  assert.equal(await request({ scenarioId: "scenario-b" }), 4);
  assert.equal(await request({ timeZone: "America/Manaus" }), 5);
});

test("fila global limita fan-out e prioriza a atualização focal", async () => {
  const client = createSharedOccupancyQueryClient({ concurrency: 1 });
  const order: string[] = [];
  const query = (name: string, priority: "background" | "foreground") =>
    client.request({
      ...base,
      cacheTtlMs: 0,
      path: `${base.path}&request=${name}`,
      priority,
      execute: async () => {
        order.push(name);
        return name;
      },
    });
  const background = query("background", "background");
  const foreground = query("foreground", "foreground");
  assert.deepEqual(await Promise.all([background, foreground]), [
    "background",
    "foreground",
  ]);
  assert.deepEqual(order, ["foreground", "background"]);
});

test("fila reserva uma vaga ao vivo e promove uma consulta histórica idêntica", async () => {
  const client = createSharedOccupancyQueryClient({ concurrency: 4 });
  const gates = new Map<string, ReturnType<typeof deferred<string>>>();
  const started: string[] = [];
  const background = Array.from({ length: 4 }, (_, index) => {
    const name = `background-${index + 1}`;
    const gate = deferred<string>();
    gates.set(name, gate);
    return client.request({
      ...base,
      cacheTtlMs: 0,
      path: `${base.path}&request=${name}`,
      priority: "background",
      execute: async () => {
        started.push(name);
        return gate.promise;
      },
    });
  });

  await drain();
  assert.deepEqual(started, ["background-1", "background-2", "background-3"]);

  let duplicateTransportCalls = 0;
  const promoted = client.request({
    ...base,
    cacheTtlMs: 0,
    path: `${base.path}&request=background-4`,
    priority: "foreground",
    execute: async () => {
      duplicateTransportCalls += 1;
      return "duplicate";
    },
  });
  await drain();
  assert.deepEqual(started, [
    "background-1",
    "background-2",
    "background-3",
    "background-4",
  ]);
  assert.equal(duplicateTransportCalls, 0, "a promoção deve coalescer, não duplicar");

  for (const [name, gate] of gates) gate.resolve(name);
  assert.deepEqual(await Promise.all(background), [
    "background-1",
    "background-2",
    "background-3",
    "background-4",
  ]);
  assert.equal(await promoted, "background-4");
});

test("consultas normais também preservam a vaga do pulso ao vivo", async () => {
  const client = createSharedOccupancyQueryClient({ concurrency: 4 });
  const gates = new Map<string, ReturnType<typeof deferred<string>>>();
  const started: string[] = [];
  const normal = Array.from({ length: 4 }, (_, index) => {
    const name = `normal-${index + 1}`;
    const gate = deferred<string>();
    gates.set(name, gate);
    return client.request({
      ...base,
      cacheTtlMs: 0,
      path: `${base.path}&request=${name}`,
      priority: "normal",
      execute: async () => {
        started.push(name);
        return gate.promise;
      },
    });
  });

  await drain();
  assert.deepEqual(started, ["normal-1", "normal-2", "normal-3"]);

  const liveGate = deferred<string>();
  const live = client.request({
    ...base,
    cacheTtlMs: 0,
    path: `${base.path}&request=live`,
    priority: "foreground",
    execute: async () => {
      started.push("live");
      return liveGate.promise;
    },
  });
  await drain();
  assert.deepEqual(started, ["normal-1", "normal-2", "normal-3", "live"]);

  liveGate.resolve("live");
  for (const [name, gate] of gates) gate.resolve(name);
  assert.deepEqual(await Promise.all(normal), [
    "normal-1",
    "normal-2",
    "normal-3",
    "normal-4",
  ]);
  assert.equal(await live, "live");
});

test("clear sem abortar preserva transportes ativos e a fila concluível", async () => {
  const client = createSharedOccupancyQueryClient({ concurrency: 1 });
  const firstGate = deferred<string>();
  const order: string[] = [];
  const first = client.request({
    ...base,
    cacheTtlMs: 0,
    path: `${base.path}&request=first`,
    execute: async () => {
      order.push("first");
      return firstGate.promise;
    },
  });
  const second = client.request({
    ...base,
    cacheTtlMs: 0,
    path: `${base.path}&request=second`,
    execute: async () => {
      order.push("second");
      return "second";
    },
  });

  await drain();
  assert.deepEqual(order, ["first"]);
  client.clear({ abort: false });
  firstGate.resolve("first");
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(order, ["first", "second"]);
});

function aggregateResponse(
  count: number,
  metadata: { complete?: boolean; status?: string } = {},
) {
  return {
    ...metadata,
    data: Array.from({ length: count }, (_, index) => ({
      bucket: new Date(Date.parse("2026-09-15T03:00:00.000Z") + index * HOUR_MS).toISOString(),
      scenario_total_avg: index + 1,
      scenario_total_max: index + 1,
      scenario_total_min: index + 1,
    })),
    granularity: "hour",
    scenario_id: "scenario-a",
    timezone: "America/Sao_Paulo",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function drain() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
