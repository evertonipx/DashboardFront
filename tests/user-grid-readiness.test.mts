import type { RuntimeFixture } from "./helpers/module-loader.mts";

type FixtureRequestOptions = { method?: string; body?: RuntimeFixture };
type FixtureResponder = (path: string, options: FixtureRequestOptions) => unknown | Promise<unknown>;
type FixtureContext = {
  grid: Record<string, RuntimeFixture>;
  load: (path: string, overrides?: Record<string, unknown>) => Record<string, RuntimeFixture>;
  requests: { path: string; options: FixtureRequestOptions }[];
  timers: Map<number, () => void>;
  events: { type: string; detail: RuntimeFixture; readiness: string }[];
  defer: () => { resolve: (value: unknown) => void; reject: (reason: unknown) => void };
  setResponder: (next: FixtureResponder) => void;
  tick: () => Promise<void>;
};
// The readiness harness owns partial DOM globals only for the callback lifetime.
const browserFixture = globalThis as unknown as Record<string, RuntimeFixture>;
import ts from "typescript";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const emptyGrid = () => ({ format: "ipxdata-user-grid", version: 2, updatedAt: "2026-09-11T12:00:00.000Z", entries: {} });

test("prontidão inicial é escopada e só libera após aplicar o grid remoto", async () => {
  await fixture(async ({ grid, events, requests, defer }) => {
    assert.equal(grid.getUserGridReadiness("user-a"), "pending");
    assert.equal(grid.getUserGridReadiness(null), "pending");
    const response = defer();
    const pending = grid.hydrateUserGridFromServer("user-a");
    assert.equal(grid.getUserGridReadiness("user-a"), "pending");
    assert.equal(grid.getUserGridReadiness("user-b"), "pending");
    assert.equal(requests.length, 1);
    response.resolve({ grid: emptyGrid() });
    assert.equal(await pending, true);
    assert.equal(grid.getUserGridReadiness(" user-a "), "ready");
    assert.equal(grid.getUserGridReadiness("user-b"), "pending");
    assert.deepEqual(events.map(({ type, readiness }: RuntimeFixture) => [type, readiness]), [
      [grid.USER_GRID_SYNC_STATUS_EVENT, "pending"],
      [grid.USER_GRID_HYDRATED_EVENT, "ready"],
      [grid.USER_GRID_SYNC_STATUS_EVENT, "ready"],
    ]);
  });
});

test("falha inicial libera fallback e retry não volta a bloquear os padrões locais", async () => {
  await fixture(async ({ grid, defer, requests, timers, events }) => {
    const first = defer();
    const pending = grid.hydrateUserGridFromServer("user-a");
    first.reject(new Error("synthetic unavailable"));
    assert.equal(await pending, false);
    assert.equal(grid.getUserGridReadiness("user-a"), "fallback");
    assert.equal(grid.getUserGridReadiness("user-b"), "pending");
    const timerCount = timers.size;
    for (let index = 0; index < 20; index++) assert.equal(grid.getUserGridReadiness("user-a"), "fallback");
    assert.equal(requests.length, 1, "ler prontidão não solicita dados");
    assert.equal(timers.size, timerCount, "ler prontidão não cria retries");
    const retry = defer();
    const retried = grid.hydrateUserGridFromServer("user-a");
    assert.equal(grid.getUserGridReadiness("user-a"), "fallback");
    retry.resolve({ grid: emptyGrid() });
    assert.equal(await retried, true);
    assert.equal(grid.getUserGridReadiness("user-a"), "ready");
    assert.ok(events.some(({ type, readiness }: RuntimeFixture) => type === grid.USER_GRID_HYDRATED_EVENT && readiness === "ready"));
  });
});

test("documento incompatível permite fallback sem sobrescrever o grid remoto", async () => {
  await fixture(async ({ grid, setResponder, requests }) => {
    setResponder(() => ({ grid: { ...emptyGrid(), version: 99 } }));
    assert.equal(await grid.hydrateUserGridFromServer("user-a"), false);
    assert.equal(grid.getUserGridReadiness("user-a"), "fallback");
    assert.deepEqual(requests.map(({ options }: RuntimeFixture) => options.method ?? "GET"), ["GET"]);
  });
});

test("troca de usuário e logout não reaproveitam prontidão nem resposta antiga", async () => {
  await fixture(async ({ grid, defer }) => {
    await grid.hydrateUserGridFromServer("user-a");
    const next = defer();
    const pending = grid.hydrateUserGridFromServer("user-b");
    assert.equal(grid.getUserGridReadiness("user-a"), "pending");
    assert.equal(grid.getUserGridReadiness("user-b"), "pending");
    grid.clearUserGridSync();
    next.resolve({ grid: emptyGrid() });
    assert.equal(await pending, false);
    assert.equal(grid.getUserGridReadiness("user-a"), "pending");
    assert.equal(grid.getUserGridReadiness("user-b"), "pending");
  });
});

test("nova linhagem do mesmo usuário reinicia prontidão após falha ou sucesso", async () => {
  await fixture(async ({ grid, defer }) => {
    const failed = defer();
    const initial = grid.hydrateUserGridFromServer("user-a", { expectedAccessToken: "synthetic-session-a" });
    failed.reject(new Error("synthetic failure"));
    await initial;
    assert.equal(grid.getUserGridReadiness("user-a"), "fallback");
    for (const session of ["synthetic-session-b", "synthetic-session-c"]) {
      const response = defer();
      const pending = grid.hydrateUserGridFromServer("user-a", { expectedAccessToken: session });
      assert.equal(grid.getUserGridReadiness("user-a"), "pending");
      response.resolve({ grid: emptyGrid() });
      assert.equal(await pending, true);
      assert.equal(grid.getUserGridReadiness("user-a"), "ready");
    }
  });
});

test("reconciliação ou erro posterior não bloqueiam um grid já hidratado", async () => {
  await fixture(async ({ grid, defer, events, tick }) => {
    await grid.hydrateUserGridFromServer("user-a");
    const response = defer();
    await grid.hydrateUserGridFromServer("user-a");
    assert.equal(grid.getUserGridReadiness("user-a"), "ready");
    response.reject(new Error("synthetic reconcile failure"));
    await tick();
    assert.equal(events.at(-1)!.detail.status, "error");
    assert.equal(grid.getUserGridReadiness("user-a"), "ready");
    const restored = defer();
    await grid.hydrateUserGridFromServer("user-a");
    restored.resolve({ grid: emptyGrid() });
    await tick();
    assert.equal(grid.getUserGridReadiness("user-a"), "ready");
  });
});

for (const result of ["response", "abort"]) {
  test(`hidratação inicial obsoleta libera fallback silencioso ao descartar ${result}`, async () => {
    await fixture(async ({ grid, defer, events, timers, requests }) => {
      let current = true;
      const response = defer();
      const pending = grid.hydrateUserGridFromServer("user-a", { shouldApply: () => current });
      current = false;
      if (result === "response") response.resolve({ grid: emptyGrid() });
      else response.reject(Object.assign(new Error("synthetic obsolete request"), { name: "AbortError" }));
      assert.equal(await pending, false);
      assert.equal(grid.getUserGridReadiness("user-a"), "fallback");
      assert.equal(grid.getUserGridReadiness("user-b"), "pending");
      assert.deepEqual(events.map(({ type, detail }: RuntimeFixture) => ({ type, detail })), [
        { type: grid.USER_GRID_SYNC_STATUS_EVENT, detail: { status: "loading", userId: "user-a" } },
        { type: grid.USER_GRID_READINESS_EVENT, detail: { userId: "user-a" } },
      ], "rotação normal não publica hydrated nem status error para o toast");
      assert.equal(await grid.flushUserGridSync(), false, "fallback não habilita escrita sem leitura segura");
      assert.equal(requests.length, 1);
      assert.equal(timers.size, 0);
    });
  });
}

test("resposta obsoleta não libera fallback da nova geração; só a nova leitura libera ready", async () => {
  await fixture(async ({ grid, defer, events }) => {
    const firstResponse = defer();
    const first = grid.hydrateUserGridFromServer("user-a", { expectedAccessToken: "synthetic-session-a" });
    const nextResponse = defer();
    const next = grid.hydrateUserGridFromServer("user-a", { expectedAccessToken: "synthetic-session-b" });
    firstResponse.reject(Object.assign(new Error("synthetic obsolete request"), { name: "AbortError" }));
    assert.equal(await first, false);
    assert.equal(grid.getUserGridReadiness("user-a"), "pending");
    assert.ok(events.every(({ type, detail }: RuntimeFixture) => type === grid.USER_GRID_SYNC_STATUS_EVENT && detail.status === "loading"));
    nextResponse.resolve({ grid: emptyGrid() });
    assert.equal(await next, true);
    assert.equal(grid.getUserGridReadiness("user-a"), "ready");
    assert.equal(events.filter(({ type }: RuntimeFixture) => type === grid.USER_GRID_READINESS_EVENT).length, 0);
    assert.equal(events.filter(({ type }: RuntimeFixture) => type === grid.USER_GRID_HYDRATED_EVENT).length, 1);
  });
});

test("logout não recebe fallback ou evento da hidratação que ficou obsoleta", async () => {
  await fixture(async ({ grid, defer, events }) => {
    let current = true;
    const response = defer();
    const pending = grid.hydrateUserGridFromServer("user-a", { shouldApply: () => current });
    current = false;
    grid.clearUserGridSync();
    const eventCount = events.length;
    response.resolve({ grid: emptyGrid() });
    assert.equal(await pending, false);
    assert.equal(grid.getUserGridReadiness("user-a"), "pending");
    assert.equal(events.length, eventCount);
  });
});

test("salvar preferências mantém ready durante saving e saved", async () => {
  await fixture(async ({ grid, events }) => {
    await grid.hydrateUserGridFromServer("user-a");
    grid.writeUserGridPreference("ipxdata.card-views.v1.company.company-a.user.user-a", "synthetic-layout");
    grid.requestUserGridSync();
    assert.equal(await grid.flushUserGridSync(), true);
    for (const status of ["saving", "saved"]) {
      const event = events.find(({ detail }: RuntimeFixture) => detail.status === status);
      assert.ok(event, status);
      assert.equal(event.readiness, "ready");
    }
  });
});

test("hook observa eventos existentes, atualiza escopo e limpa assinaturas sem rede ou timers", async () => {
  await fixture(async ({ grid, load, requests, timers }) => {
    let store!: {
      subscribe: (listener: () => void) => () => void;
      snapshot: () => string;
      serverSnapshot: () => string;
    };
    const hook = load("components/app/use-user-grid-ready.ts", {
      react: { useCallback: (callback: RuntimeFixture) => callback, useSyncExternalStore: (subscribe: RuntimeFixture, snapshot: RuntimeFixture, serverSnapshot: RuntimeFixture) => { store = { subscribe, snapshot, serverSnapshot }; return snapshot(); } },
    });
    assert.equal(hook.useUserGridReady("user-a"), "pending");
    assert.equal(store.serverSnapshot(), "pending");
    const notices: string[] = [];
    const unsubscribe = store.subscribe(() => notices.push(store.snapshot()));
    const notice = () => window.dispatchEvent(new Event(grid.USER_GRID_HYDRATED_EVENT));
    notice();
    window.dispatchEvent(new Event(grid.USER_GRID_SYNC_STATUS_EVENT));
    window.dispatchEvent(new Event(grid.USER_GRID_READINESS_EVENT));
    assert.deepEqual(notices, ["pending", "pending", "pending"]);
    assert.equal(requests.length, 0);
    assert.equal(timers.size, 0);
    await grid.hydrateUserGridFromServer("user-a");
    assert.equal(store.snapshot(), "ready");
    assert.equal(hook.useUserGridReady("user-b"), "pending");
    assert.equal(store.snapshot(), "pending");
    assert.equal(hook.useUserGridReady("user-a"), "ready");
    grid.clearUserGridSync();
    assert.equal(notices.at(-1), "pending");
    unsubscribe();
    const previousCount = notices.length;
    notice();
    window.dispatchEvent(new Event(grid.USER_GRID_READINESS_EVENT));
    window.dispatchEvent(new Event(grid.USER_GRID_SYNC_STATUS_EVENT));
    assert.equal(notices.length, previousCount);
    assert.equal(requests.length, 1);
  });
});

test("SSR do hook permanece pending mesmo quando o store do cliente já está pronto", async () => {
  await fixture(async ({ grid, load, requests }) => {
    await grid.hydrateUserGridFromServer("user-a");
    const { useUserGridReady } = load("components/app/use-user-grid-ready.ts");
    const React = require("react");
    function Readiness() { return React.createElement("span", null, useUserGridReady("user-a")); }
    const html = require("react-dom/server").renderToStaticMarkup(React.createElement(Readiness));
    assert.equal(html, "<span>pending</span>");
    assert.equal(requests.length, 1);
  });
});

async function fixture(run: (context: FixtureContext) => void | Promise<void>) {
  const previous = Object.fromEntries(["window", "document", "CustomEvent", "StorageEvent"].map((key) => [key, browserFixture[key]]));
  const values = new Map<string, string>();
  const timers: FixtureContext["timers"] = new Map();
  const requests: FixtureContext["requests"] = [];
  const events: FixtureContext["events"] = [];
  const modules = new Map<string, Record<string, RuntimeFixture>>();
  let remote = emptyGrid(), timerId = 0;
  let responder: FixtureResponder = (_path, options) => {
    if (options.method === "PUT") remote = structuredClone(options.body.grid);
    return { grid: structuredClone(remote) };
  };
  const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: RuntimeFixture) => values.set(key, String(value)), removeItem: (key: string) => values.delete(key) };
  const target = new EventTarget();
  browserFixture.window = Object.assign(target, { localStorage: storage, setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id), setInterval: () => { throw new Error("readiness must not start intervals"); }, clearInterval: () => {} });
  browserFixture.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  browserFixture.CustomEvent = class extends Event { detail: unknown; constructor(type: string, options: { detail?: unknown } = {}) { super(type); this.detail = options.detail; } };
  browserFixture.StorageEvent = class extends Event { constructor(type: string, options = {}) { super(type); Object.assign(this, options); } };
  function load(path: string, overrides: Record<string, unknown> = {}): Record<string, RuntimeFixture> {
    if (!Object.keys(overrides).length && modules.has(path)) return modules.get(path)!;
    const loaded: { exports: RuntimeFixture } = { exports: {} };
    const output = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name: string) => {
      if (name in overrides) return overrides[name];
      if (name === "@/lib/api") return { apiFetch: async (requestPath: string, options: FixtureRequestOptions = {}) => { requests.push({ path: requestPath, options }); return responder(requestPath, options); } };
      return name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
    };
    new Function("module", "exports", "require", output)(loaded, loaded.exports, localRequire);
    if (!Object.keys(overrides).length) modules.set(path, loaded.exports);
    return loaded.exports;
  }
  const grid = load("lib/user-grid.ts");
  for (const type of [grid.USER_GRID_HYDRATED_EVENT, grid.USER_GRID_SYNC_STATUS_EVENT, grid.USER_GRID_READINESS_EVENT]) target.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent<RuntimeFixture>).detail, readiness: grid.getUserGridReadiness((event as CustomEvent<RuntimeFixture>).detail?.userId) }));
  const defer = () => {
    let resolvePromise!: (value: unknown) => void;
    let rejectPromise!: (reason: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
    responder = () => promise;
    return { resolve: resolvePromise, reject: rejectPromise };
  };
  try { await run({ grid, load, requests, timers, events, defer, setResponder: (next: FixtureResponder) => { responder = next; }, tick: () => new Promise<void>((resolve) => setImmediate(resolve)) }); }
  finally { grid.clearUserGridSync(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete browserFixture[key]; else browserFixture[key] = value; } }
}
