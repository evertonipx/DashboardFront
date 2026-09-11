import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HOUR = 3_600_000;

test("horas fechadas reutilizam em 30min e aceitam correção 1→0 no TTL de 1h com período idêntico", async (t) => {
  let now = Date.parse("2026-09-11T05:00:00Z"); t.mock.method(Date, "now", () => now);
  const fixture = createFixture();
  const first = await fixture.fetch();
  assert.equal(total(first, "confirmedOccupiedSeconds"), 3600);
  fixture.setValue(0); now += HOUR / 2;
  assert.equal(total(await fixture.fetch(), "confirmedOccupiedSeconds"), 3600);
  assert.equal(fixture.calls.length, 1);
  now += HOUR / 2;
  const refreshed = await fixture.fetch();
  assert.equal(fixture.calls.length, 2);
  assert.equal(total(refreshed, "confirmedOccupiedSeconds"), 0);
  assert.equal(total(refreshed, "confirmedFreeSeconds"), 3600);
  assert.equal(total(refreshed, "expectedSeconds"), total(first, "expectedSeconds"));
});

test("aumento corrigido também substitui cache e nova validade parte da revalidação", async (t) => {
  let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const fixture = createFixture(); fixture.setValue(0);
  await fixture.fetch(); now += HOUR; fixture.setValue(2);
  assert.equal(total(await fixture.fetch(), "confirmedOccupiedSeconds"), 3600);
  now += HOUR - 1; await fixture.fetch();
  assert.equal(fixture.calls.length, 2);
});

test("erro ou aborto na revalidação não promove nem altera o cache anterior", async (t) => {
  let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const fixture = createFixture(); await fixture.fetch();
  const before = structuredClone(fixture.cache); now += HOUR;
  fixture.setFailure(new Error("temporarily unavailable"));
  await assert.rejects(fixture.fetch(), /temporarily unavailable/);
  assert.deepEqual(fixture.cache, before);
  const controller = new AbortController(); fixture.setFailure(() => controller.abort());
  await assert.rejects(fixture.fetch({ signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(fixture.cache, before);
  fixture.setFailure(null); fixture.setValue(0);
  assert.equal(total(await fixture.fetch(), "confirmedFreeSeconds"), 3600);
});

test("cache.clear continua forçando consulta imediata e escopos não se misturam", async () => {
  const fixture = createFixture(); await fixture.fetch();
  fixture.setValue(0); fixture.cache.clear();
  assert.equal(total(await fixture.fetch(), "confirmedFreeSeconds"), 3600);
  await fixture.fetch({ companyScopeId: "company-b" });
  await fixture.fetch({ scenarioId: "scenario-b" });
  assert.equal(fixture.calls.length, 4);
});

test("timestamp legado ou retrocesso do relógio provoca revalidação segura", async (t) => {
  let now = 2 * HOUR; t.mock.method(Date, "now", () => now);
  const fixture = createFixture(); await fixture.fetch();
  for (const day of fixture.cache.values()) for (const span of day.spans.values()) delete span.cachedAt;
  await fixture.fetch(); assert.equal(fixture.calls.length, 2);
  now -= 1; await fixture.fetch(); assert.equal(fixture.calls.length, 3);
});

function total(result, key) { return result.hours.reduce((sum, hour) => sum + hour[key], 0); }
function createFixture() {
  const modules = new Map(), calls = [], cache = new Map(); let value = 1, failure;
  const query = load("lib/occupancy-duration-insights-query.ts");
  const model = load("lib/occupancy-duration-insights.ts");
  // One hour from the first day avoids unrelated rolling-window changes.
  const month = model.buildOccupancyDurationInsightMonth(new Date("2026-09-01T04:00:00Z"), "America/Sao_Paulo");
  return { calls, cache, setValue: (next) => { value = next; }, setFailure: (next) => { failure = next; }, fetch: (overrides = {}) => query.fetchOccupancyDurationInsightScenario({
    cache, companyScopeId: "company-a", scenarioId: "scenario-a", name: "Entrada", month,
    signal: new AbortController().signal, timeZone: "America/Sao_Paulo", ...overrides,
  }) };
  async function apiFetch(path, options) {
    const url = new URL(path, "http://fixture.invalid"); calls.push({ path, options });
    if (failure instanceof Error) throw failure;
    if (typeof failure === "function") failure();
    const from = Date.parse(url.searchParams.get("from")), to = Date.parse(url.searchParams.get("to"));
    const granularity = url.searchParams.get("granularity"); const data = [];
    for (let bucket = from; bucket < to; bucket += granularity === "hour" ? HOUR : 60_000) data.push({
      bucket: new Date(bucket).toISOString(), scenario_total_avg: value, scenario_total_min: value, scenario_total_max: value,
    });
    return { data, scenario_id: decodeURIComponent(url.pathname.split("/")[3]), granularity };
  }
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const loaded = { exports: {} }; modules.set(path, loaded.exports);
    const output = ts.transpileModule(readFileSync(resolve(path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("module", "exports", "require", output)(loaded, loaded.exports, (name) => name === "@/lib/api" ? { apiFetch } : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
    return loaded.exports;
  }
}
