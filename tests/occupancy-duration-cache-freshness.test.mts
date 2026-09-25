// Dynamic fixtures intentionally cross injected-module and malformed-input boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

import {
  occupancyDurationMinuteTransportTtl,
  occupancyDurationNextMinuteRefreshDelay,
  occupancyDurationReconciliationFrom,
  planOccupancyDurationCacheRefresh,
} from "../lib/occupancy-duration-refresh.ts";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const HOUR = 3_600_000;
const CLOSED_CACHE_TTL = 6 * HOUR;
const liveDurationSource = readFileSync(
  resolve("components/app/occupancy-duration-widgets.tsx"),
  "utf8",
);
const durationInsightQuerySource = readFileSync(
  resolve("lib/occupancy-duration-insights-query.ts"),
  "utf8",
);

test("cards de duração preservam histórico entre remounts e limitam retries", () => {
  assert.match(
    liveDurationSource,
    /const DURATION_FULL_REFRESH_MS = 6 \* 60 \* 60_000/,
  );
  assert.match(
    liveDurationSource,
    /sharedDurationScenarioCaches = new Map/,
  );
  assert.match(
    liveDurationSource,
    /authenticatedUserId[\s\S]*?companyScopeId\.trim\(\)[\s\S]*?timeZone\.trim\(\)/,
    "o cache precisa incluir usuário JWT, empresa e fuso",
  );
  assert.match(
    liveDurationSource,
    /occupancyDurationReconciliationFrom\([\s\S]*?range\.to\.getTime\(\)[\s\S]*?cached\.to/,
    "a atualização incremental deve compartilhar a borda recente canônica",
  );
  assert.match(
    liveDurationSource,
    /occupancyDurationNextMinuteRefreshDelay\(\)/,
    "agregados de minutos devem acordar somente após a próxima borda",
  );
  assert.match(
    liveDurationSource,
    /occupancyDurationMinuteTransportTtl\([\s\S]*?range\.requestedAt\.getTime\(\)/,
    "remounts devem reutilizar a resposta exata até o próximo minuto",
  );
  assert.doesNotMatch(
    liveDurationSource,
    /lastCompletedRangeEnd/,
    "a borda idêntica não pode voltar ao polling de cinco segundos",
  );
  assert.match(
    liveDurationSource,
    /durationFailureBackoffMilliseconds\(attempts, retryBaseMs\)/,
  );
  assert.doesNotMatch(
    liveDurationSource.match(
      /fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>\(\{[\s\S]*?\}\);/,
    )?.[0] ?? "",
    /bypassCache:\s*true/,
    "remount idêntico deve poder reutilizar o transporte curto",
  );
});

test("cadência e reconciliação de duração são alinhadas ao minuto fechado", () => {
  assert.equal(occupancyDurationNextMinuteRefreshDelay(10_000), 51_000);
  assert.equal(occupancyDurationMinuteTransportTtl(59_500), 1_500);
  assert.equal(occupancyDurationNextMinuteRefreshDelay(61_000), 60_000);
  assert.equal(
    occupancyDurationReconciliationFrom(0, 10 * 60_000, 9 * 60_000),
    5 * 60_000,
    "pulso normal relê exatamente os cinco minutos finais",
  );
  assert.equal(
    occupancyDurationReconciliationFrom(0, 10 * 60_000, 2 * 60_000),
    2 * 60_000,
    "retomada cobre a lacuna sem perder minutos",
  );
  assert.throws(
    () => occupancyDurationNextMinuteRefreshDelay(Number.NaN),
    /inválido/,
  );
  assert.match(
    durationInsightQuerySource,
    /occupancyDurationReconciliationFrom\([\s\S]*?span\.from,[\s\S]*?span\.to,[\s\S]*?cached\.to/,
    "timeline e insights precisam construir a mesma borda móvel",
  );
  assert.match(
    durationInsightQuerySource,
    /granularity === "minute"[\s\S]*?occupancyDurationMinuteTransportTtl\(\)/,
    "as duas superfícies precisam compartilhar a validade do GET exato",
  );
});

test("exportação reconcilia somente a borda recente de um cache válido", () => {
  const requestedAt = 20 * 60_000;
  const plan = planOccupancyDurationCacheRefresh({
    cached: {
      from: 0,
      lastFullRefreshAt: requestedAt - 60_000,
      to: 9 * 60_000,
    },
    fullRefreshMs: 6 * HOUR,
    rangeFrom: 0,
    rangeTo: 10 * 60_000,
    requestedAt,
  });

  assert.deepEqual(plan, {
    cacheMatchesDay: true,
    cacheMatchesRange: false,
    needsFullRefresh: false,
    reconciliationFrom: 5 * 60_000,
  });
});

test("exportação só refaz o período completo com cache inválido ou auditoria vencida", () => {
  const requestedAt = 7 * HOUR;
  const base = {
    fullRefreshMs: 6 * HOUR,
    rangeFrom: 0,
    rangeTo: 10 * 60_000,
    requestedAt,
  };
  const expired = planOccupancyDurationCacheRefresh({
    ...base,
    cached: {
      from: 0,
      lastFullRefreshAt: requestedAt - 6 * HOUR,
      to: 9 * 60_000,
    },
  });
  const wrongDay = planOccupancyDurationCacheRefresh({
    ...base,
    cached: {
      from: 60_000,
      lastFullRefreshAt: requestedAt - 60_000,
      to: 9 * 60_000,
    },
  });

  assert.equal(expired.needsFullRefresh, true);
  assert.equal(expired.reconciliationFrom, 0);
  assert.equal(wrongDay.needsFullRefresh, true);
  assert.equal(wrongDay.reconciliationFrom, 0);
});

test("horas fechadas reutilizam e aceitam correção 1→0 no TTL de 6h com período idêntico", async (t) => {
  let now = Date.parse("2026-09-11T05:00:00Z"); t.mock.method(Date, "now", () => now);
  const fixture = createFixture();
  const first = await fixture.fetch();
  assert.equal(total(first, "confirmedOccupiedSeconds"), 3600);
  fixture.setValue(0); now += CLOSED_CACHE_TTL / 2;
  assert.equal(total(await fixture.fetch(), "confirmedOccupiedSeconds"), 3600);
  assert.equal(fixture.calls.length, 1);
  now += CLOSED_CACHE_TTL / 2;
  const refreshed = await fixture.fetch();
  assert.equal(fixture.calls.length, 2);
  assert.equal(total(refreshed, "confirmedOccupiedSeconds"), 0);
  assert.equal(total(refreshed, "confirmedFreeSeconds"), 3600);
  assert.equal(total(refreshed, "expectedSeconds"), total(first, "expectedSeconds"));
});

test("aumento corrigido também substitui cache e nova validade parte da revalidação", async (t) => {
  let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const fixture = createFixture(); fixture.setValue(0);
  await fixture.fetch(); now += CLOSED_CACHE_TTL; fixture.setValue(2);
  assert.equal(total(await fixture.fetch(), "confirmedOccupiedSeconds"), 3600);
  now += CLOSED_CACHE_TTL - 1; await fixture.fetch();
  assert.equal(fixture.calls.length, 2);
});

test("erro ou aborto na revalidação não promove nem altera o cache anterior", async (t) => {
  let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const fixture = createFixture(); await fixture.fetch();
  const before = structuredClone(fixture.cache); now += CLOSED_CACHE_TTL;
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

function total(result: RuntimeFixture, key: string) { return result.hours.reduce((sum: RuntimeFixture, hour: RuntimeFixture) => sum + hour[key], 0); }
function createFixture() {
  const modules = new Map(), calls: RuntimeFixture[] = [], cache = new Map(); let value = 1, failure: RuntimeFixture;
  const query = load("lib/occupancy-duration-insights-query.ts");
  const model = load("lib/occupancy-duration-insights.ts");
  // One hour from the first day avoids unrelated rolling-window changes.
  const month = model.buildOccupancyDurationInsightMonth(new Date("2026-09-01T04:00:00Z"), "America/Sao_Paulo");
  return { calls, cache, setValue: (next: RuntimeFixture) => { value = next; }, setFailure: (next: RuntimeFixture) => { failure = next; }, fetch: (overrides: Record<string, RuntimeFixture> = {}) => query.fetchOccupancyDurationInsightScenario({
    cache, companyScopeId: "company-a", scenarioId: "scenario-a", name: "Entrada", month,
    signal: new AbortController().signal, timeZone: "America/Sao_Paulo", ...overrides,
  }) };
  async function apiFetch(path: string, options: RuntimeFixture) {
    const url = new URL(path, "http://fixture.invalid"); calls.push({ path, options });
    if (failure instanceof Error) throw failure;
    if (typeof failure === "function") failure();
    const from = Date.parse(url.searchParams.get("from")!), to = Date.parse(url.searchParams.get("to")!);
    const granularity = url.searchParams.get("granularity"); const data: RuntimeFixture[] = [];
    for (let bucket = from; bucket < to; bucket += granularity === "hour" ? HOUR : 60_000) data.push({
      bucket: new Date(bucket).toISOString(), scenario_total_avg: value, scenario_total_min: value, scenario_total_max: value,
    });
    return { data, scenario_id: decodeURIComponent(url.pathname.split("/")[3]), granularity };
  }
  function load(path: string): RuntimeFixture {
    if (modules.has(path)) return modules.get(path);
    const loaded: { exports: RuntimeFixture } = { exports: {} }; modules.set(path, loaded.exports);
    const output = ts.transpileModule(readFileSync(resolve(path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("module", "exports", "require", output)(loaded, loaded.exports, (name: RuntimeFixture) => name === "@/lib/api" ? {
      ApiError: class ApiError extends Error { status = 500; },
      apiFetch,
      getStoredSession: () => ({ access_token: "fixture-token" }),
    } : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
    return loaded.exports;
  }
}
