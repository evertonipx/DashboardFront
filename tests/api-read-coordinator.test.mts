import assert from "node:assert/strict";
import test from "node:test";

import { createApiReadCoordinator } from "../lib/api-read-coordinator.ts";

test("leituras idênticas compartilham um transporte e preservam cada consumidor", async () => {
  const coordinator = createApiReadCoordinator();
  let calls = 0;
  let finish!: (value: string) => void;
  const execute = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  };

  const first = coordinator.request({ execute, key: "tenant-a:/cameras" });
  const second = coordinator.request({ execute, key: "tenant-a:/cameras" });
  await Promise.resolve();
  assert.equal(calls, 1);
  finish("ok");
  assert.deepEqual(await Promise.all([first, second]), ["ok", "ok"]);
});

test("cancelar um consumidor não cancela a leitura que ainda possui assinante", async () => {
  const coordinator = createApiReadCoordinator();
  const firstController = new AbortController();
  let upstreamSignal!: AbortSignal;
  let finish!: (value: number) => void;
  const execute = (signal: AbortSignal) => {
    upstreamSignal = signal;
    return new Promise<number>((resolve) => {
      finish = resolve;
    });
  };
  const first = coordinator.request({
    execute,
    key: "shared",
    signal: firstController.signal,
  });
  const second = coordinator.request({ execute, key: "shared" });
  await Promise.resolve();
  firstController.abort(new DOMException("saiu", "AbortError"));
  await assert.rejects(first, { name: "AbortError" });
  await Promise.resolve();
  assert.equal(upstreamSignal.aborted, false);
  finish(42);
  assert.equal(await second, 42);
});

test("Strict Mode pode remontar no mesmo turno sem repetir o GET", async () => {
  const coordinator = createApiReadCoordinator();
  const firstController = new AbortController();
  let calls = 0;
  let finish!: (value: string) => void;
  const execute = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  };
  const first = coordinator.request({
    execute,
    key: "strict-mode",
    signal: firstController.signal,
  });
  firstController.abort(new DOMException("cleanup", "AbortError"));
  const replacement = coordinator.request({ execute, key: "strict-mode" });
  await assert.rejects(first, { name: "AbortError" });
  await Promise.resolve();
  assert.equal(calls, 1);
  finish("mounted");
  assert.equal(await replacement, "mounted");
});

test("sem consumidores o transporte é abortado e a tentativa seguinte é nova", async () => {
  const coordinator = createApiReadCoordinator();
  const controller = new AbortController();
  let calls = 0;
  const execute = (signal: AbortSignal) => {
    calls += 1;
    return new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  };
  const abandoned = coordinator.request({
    execute,
    key: "abandoned",
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort(new DOMException("saiu", "AbortError"));
  await assert.rejects(abandoned, { name: "AbortError" });
  await Promise.resolve();
  await Promise.resolve();

  const nextController = new AbortController();
  const next = coordinator.request({
    execute,
    key: "abandoned",
    signal: nextController.signal,
  });
  await Promise.resolve();
  assert.equal(calls, 2);
  nextController.abort(new DOMException("fim", "AbortError"));
  await assert.rejects(next, { name: "AbortError" });
});

test("TTL reutiliza catálogo, bypass força leitura e clear invalida o valor", async () => {
  let now = 1_000;
  const coordinator = createApiReadCoordinator({ now: () => now });
  let calls = 0;
  const execute = async () => ++calls;

  assert.equal(
    await coordinator.request({ execute, key: "catalog", ttlMs: 3_000 }),
    1,
  );
  now = 3_999;
  assert.equal(
    await coordinator.request({ execute, key: "catalog", ttlMs: 3_000 }),
    1,
  );
  assert.equal(
    await coordinator.request({
      bypassCache: true,
      execute,
      key: "catalog",
      ttlMs: 3_000,
    }),
    2,
  );
  coordinator.clear();
  assert.equal(
    await coordinator.request({ execute, key: "catalog", ttlMs: 3_000 }),
    3,
  );
});

test("resultado recusado pelo contrato é coalescido em voo, mas nunca armazenado", async () => {
  const coordinator = createApiReadCoordinator();
  let calls = 0;
  const execute = async () => ({ ok: false, attempt: ++calls });
  const options = {
    cacheResult: (value: { ok: boolean }) => value.ok,
    execute,
    key: "catalog-error",
    ttlMs: 30_000,
  };
  const [first, joined] = await Promise.all([
    coordinator.request(options),
    coordinator.request(options),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.attempt, 1);
  assert.equal(joined.attempt, 1);
  assert.equal((await coordinator.request(options)).attempt, 2);
});

test("catálogo compartilhado entrega cópias independentes e conserva o cache-base", async () => {
  const coordinator = createApiReadCoordinator();
  let calls = 0;
  const options = {
    cloneResult: (value: { values: number[] }) => structuredClone(value),
    execute: async () => ({ values: [++calls] }),
    key: "immutable-catalog",
    ttlMs: 30_000,
  };
  const [first, second] = await Promise.all([
    coordinator.request<{ values: number[] }>(options),
    coordinator.request<{ values: number[] }>(options),
  ]);
  assert.notEqual(first, second);
  first.values.push(99);
  assert.deepEqual(second.values, [1]);
  assert.deepEqual(
    (await coordinator.request<{ values: number[] }>(options)).values,
    [1],
  );
  assert.equal(calls, 1);
});

test("rajada pendente é aparada assim que respostas assentam", async () => {
  const coordinator = createApiReadCoordinator({ maximumEntries: 2 });
  const resolvers = new Map<string, (value: string) => void>();
  let calls = 0;
  const request = (key: string) =>
    coordinator.request({
      execute: () => {
        calls += 1;
        return new Promise<string>((resolve) => resolvers.set(key, resolve));
      },
      key,
      ttlMs: 30_000,
    });
  const pending = [request("a"), request("b"), request("c")];
  await Promise.resolve();
  resolvers.get("a")!("a");
  resolvers.get("b")!("b");
  resolvers.get("c")!("c");
  await Promise.all(pending);

  assert.equal(await request("b"), "b");
  const reloaded = request("a");
  await Promise.resolve();
  assert.equal(calls, 4);
  resolvers.get("a")!("a-new");
  assert.equal(await reloaded, "a-new");
});

test("invalidação de CRUD aborta uma leitura anterior que poderia publicar dado obsoleto", async () => {
  const coordinator = createApiReadCoordinator();
  const pending = coordinator.request({
    execute: (signal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
    key: "catalog-before-mutation",
    ttlMs: 30_000,
  });
  await Promise.resolve();
  coordinator.clear({ abortPending: true });
  await assert.rejects(pending, { name: "AbortError" });
});

test("chaves e TTLs inválidos falham antes de chamar o transporte", async () => {
  const coordinator = createApiReadCoordinator();
  let calls = 0;
  const execute = async () => ++calls;
  await assert.rejects(
    coordinator.request({ execute, key: "", ttlMs: 0 }),
    /chave da leitura/i,
  );
  assert.throws(
    () => coordinator.request({ execute, key: "valid", ttlMs: -1 }),
    /validade da leitura/i,
  );
  assert.equal(calls, 0);
});
