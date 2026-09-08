import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const resources = { exports: {} };
new Function("module", "exports", compile("lib/resource-auto-refresh.ts"))(resources, resources.exports);
const { shouldRefreshResourcesNow, RESOURCE_METADATA_REFRESH_INTERVAL_MS } = resources.exports;

test("foco e visibilidade respeitam frescor do catálogo e não repetem consulta recém-feita", () => {
  const options = { enabled: true, visibilityState: "visible", online: true, intervalMs: 30_000, lastAttemptAt: 10_000 };
  for (const now of [10_000, 10_001, 20_000, 39_999]) {
    assert.equal(shouldRefreshResourcesNow({ ...options, now }), false);
  }
  assert.equal(shouldRefreshResourcesNow({ ...options, now: 40_000 }), true);
  assert.equal(shouldRefreshResourcesNow({ ...options, lastAttemptAt: null, now: 10_000 }), true);
});

test("recursos não consultam offline, em aba oculta ou desabilitados", () => {
  const options = { enabled: true, visibilityState: "visible", intervalMs: 30_000, lastAttemptAt: null, now: 60_000 };
  assert.equal(shouldRefreshResourcesNow({ ...options, online: false }), false);
  assert.equal(shouldRefreshResourcesNow({ ...options, visibilityState: "hidden" }), false);
  assert.equal(shouldRefreshResourcesNow({ ...options, enabled: false }), false);
});

test("intervalo inválido não cria loop e ajuste do relógio não bloqueia atualização", () => {
  const options = { enabled: true, visibilityState: "visible", lastAttemptAt: 10_000, now: 10_001 };
  for (const intervalMs of [0, -1, NaN, Infinity]) {
    assert.equal(shouldRefreshResourcesNow({ ...options, intervalMs }), false);
    assert.equal(shouldRefreshResourcesNow({ ...options, intervalMs, now: 10_000 + RESOURCE_METADATA_REFRESH_INTERVAL_MS }), true);
  }
  assert.equal(shouldRefreshResourcesNow({ ...options, intervalMs: 30_000, now: 9_000 }), true);
});

test("hook consolida focus, visibility e timer sem consultas simultâneas", async () => {
  let complete;
  const fixture = mountRefresh(() => new Promise((resolve) => { complete = resolve; }));
  fixture.focus();
  fixture.visibility();
  await fixture.flush();
  assert.equal(fixture.calls(), 0, "carga inicial é responsabilidade da tela");
  fixture.time(30_000);
  fixture.focus();
  fixture.visibility();
  fixture.tick();
  await fixture.flush();
  assert.equal(fixture.calls(), 1);
  fixture.time(90_000);
  fixture.tick();
  assert.equal(fixture.calls(), 1, "não sobrepõe consulta ainda em curso");
  complete();
  await fixture.flush();
  fixture.tick();
  assert.equal(fixture.calls(), 2);
  complete();
  await fixture.flush();
  fixture.cleanup();
});

test("hook retoma somente quando visível e online e remove listeners ao desmontar", async () => {
  const fixture = mountRefresh(async () => {});
  fixture.time(60_000);
  fixture.document.visibilityState = "hidden";
  fixture.tick();
  fixture.focus();
  assert.equal(fixture.calls(), 0);
  fixture.document.visibilityState = "visible";
  fixture.navigator.onLine = false;
  fixture.visibility();
  assert.equal(fixture.calls(), 0);
  fixture.navigator.onLine = true;
  fixture.online();
  await fixture.flush();
  assert.equal(fixture.calls(), 1);
  fixture.focus();
  fixture.visibility();
  assert.equal(fixture.calls(), 1);
  fixture.cleanup();
  fixture.time(120_000);
  fixture.focus();
  fixture.online();
  fixture.visibility();
  fixture.tick();
  assert.equal(fixture.calls(), 1);
  assert.equal(fixture.timers.size, 0);
});

test("falha de atualização preserva cooldown, sem tempestade de tentativas", async () => {
  const fixture = mountRefresh(async () => { throw new Error("Offline"); });
  fixture.time(30_000);
  fixture.tick();
  await fixture.flush();
  fixture.focus();
  fixture.visibility();
  fixture.online();
  assert.equal(fixture.calls(), 1);
  fixture.time(60_000);
  fixture.tick();
  await fixture.flush();
  assert.equal(fixture.calls(), 2);
  fixture.cleanup();
});

test("catálogo desabilitado não registra timers e intervalo zero usa padrão seguro", () => {
  const disabled = mountRefresh(async () => {}, { enabled: false });
  assert.equal(disabled.timers.size, 0);
  disabled.cleanup();
  const invalid = mountRefresh(async () => {}, { intervalMs: 0 });
  assert.deepEqual([...invalid.timers.values()].map((timer) => timer.delay), [30_000]);
  invalid.cleanup();
});

function mountRefresh(refresh, options) {
  const effects = [];
  const timers = new Map();
  let now = 0;
  let calls = 0;
  const window = Object.assign(new EventTarget(), {
    setInterval(callback, delay) { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const navigator = { onLine: true };
  const React = { useRef: (value) => ({ current: value }), useEffect: (effect) => effects.push(effect) };
  const hookModule = { exports: {} };
  new Function("module", "exports", "require", "window", "document", "navigator", "Date", compile("components/app/use-resource-auto-refresh.ts"))(
    hookModule, hookModule.exports,
    (id) => id === "react" ? React : resources.exports,
    window, document, navigator, { now: () => now },
  );
  hookModule.exports.useResourceAutoRefresh(() => { calls += 1; return refresh(); }, options);
  const cleanups = effects.map((effect) => effect());
  return {
    document, navigator, timers,
    calls: () => calls,
    time: (value) => { now = value; },
    focus: () => window.dispatchEvent(new Event("focus")),
    online: () => window.dispatchEvent(new Event("online")),
    visibility: () => document.dispatchEvent(new Event("visibilitychange")),
    tick: () => { for (const { callback } of timers.values()) callback(); },
    flush: async () => { await Promise.resolve(); await Promise.resolve(); },
    cleanup: () => { for (const cleanup of cleanups) cleanup?.(); },
  };
}
