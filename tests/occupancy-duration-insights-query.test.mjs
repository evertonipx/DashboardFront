import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

test("mês inteiro estável usa uma consulta horária e nenhum refinamento minuto", async () => {
  const fixture = createFixture();
  const month = fixture.month("2026-08-31T12:00:00Z");
  month.to = month.monthEnd;
  const result = await fixture.fetch({ month });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].granularity, "hour");
  assert.equal(fixture.calls[0].from.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(fixture.calls[0].to.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(result.hours.length, 31 * 24);
  assert.equal(total(result, "confirmedOccupiedSeconds"), 31 * 24 * 3_600);
  assert.equal(total(result, "unknownSeconds"), 0);
  assert.equal(result.asOf, undefined, "retorno legado não inventa certificação");
});

test("mínimo zero com pico positivo refina em lotes de até 480 minutos", async () => {
  const fixture = createFixture((call) => reply(call, (bucket) => call.granularity === "hour"
    ? { minimum: 0, average: 0.5, peak: 1 }
    : new Date(bucket).getUTCMinutes() < 30
      ? { minimum: 1, average: 1, peak: 1 }
      : { minimum: 0, average: 0, peak: 0 }));
  const result = await fixture.fetch({ month: fixture.month("2026-09-01T13:00:00Z") });
  assert.equal(fixture.calls.filter((call) => call.granularity === "hour").length, 1);
  const minuteCalls = fixture.calls.filter((call) => call.granularity === "minute");
  assert.equal(minuteCalls.length, 2);
  assert.ok(minuteCalls.every((call) => call.to - call.from <= 480 * MINUTE));
  assert.equal(total(result, "confirmedOccupiedSeconds"), 10 * 30 * 60);
  assert.equal(total(result, "confirmedFreeSeconds"), 10 * 30 * 60);
  assert.equal(total(result, "transitionSeconds"), 0);
});

test("somente horas de transição são refinadas; minutos mistos permanecem transição", async () => {
  const fixture = createFixture((call) => reply(call, (bucket) => {
    if (call.granularity === "minute") return { minimum: 0, average: 0.4, peak: 2 };
    return new Date(bucket).getUTCHours() === 4
      ? { minimum: 0, average: 0.4, peak: 2 }
      : { minimum: 0, average: 0, peak: 0 };
  }));
  const result = await fixture.fetch({ month: fixture.month("2026-09-01T06:00:00Z") });
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[1].from.toISOString(), "2026-09-01T04:00:00.000Z");
  assert.equal(fixture.calls[1].to.toISOString(), "2026-09-01T05:00:00.000Z");
  assert.equal(total(result, "confirmedFreeSeconds"), 2 * 3_600);
  assert.equal(total(result, "transitionSeconds"), 3_600);
});

test("ausência de bucket permanece desconhecida, não vira zero nem solicita minutos", async () => {
  const fixture = createFixture((call) => {
    const response = reply(call, () => ({ minimum: 0, average: 0, peak: 0 }));
    response.data = response.data.slice(1);
    return response;
  });
  const result = await fixture.fetch({ month: fixture.month("2026-09-01T05:00:00Z") });
  assert.equal(fixture.calls.length, 1);
  assert.equal(total(result, "unknownSeconds"), 3_600);
  assert.equal(total(result, "confirmedFreeSeconds"), 3_600);
  assert.equal(total(result, "confirmedOccupiedSeconds"), 0);
});

test("métricas null são rejeitadas e não envenenam o cache", async () => {
  const fixture = createFixture((call) => reply(call, () => ({ minimum: null, average: null, peak: null })));
  await assert.rejects(fixture.fetch({ month: fixture.month("2026-09-01T04:00:00Z") }), /inválida/);
  assert.equal(fixture.cache.size, 0);
});

test("resposta com 1.000 linhas é subdividida até obter intervalos completos", async () => {
  const fixture = createFixture((call) => {
    const response = reply(call);
    if (call.to - call.from > 4 * HOUR) {
      response.data = Array.from({ length: 1_000 }, () => response.data[0]);
    }
    return response;
  });
  const result = await fixture.fetch({ month: fixture.month("2026-09-01T19:00:00Z") });
  assert.equal(fixture.calls.length, 7);
  assert.equal(result.hours.length, 16);
  assert.equal(total(result, "confirmedOccupiedSeconds"), 16 * 3_600);
});

test("limite de linhas em um único bucket falha sem publicar duração truncada", async () => {
  const fixture = createFixture((call) => {
    const response = reply(call);
    response.data = Array.from({ length: 1_000 }, () => response.data[0]);
    return response;
  });
  await assert.rejects(fixture.fetch({ month: fixture.month("2026-09-01T04:00:00Z") }), /volume de dados/);
  assert.equal(fixture.cache.size, 0);
});

test("dias encerrados reutilizam o cache e a hora aberta consulta somente minutos fechados", async () => {
  const fixture = createFixture();
  const first = await fixture.fetch({ month: fixture.month("2026-09-03T12:07:42Z") });
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[1].to.toISOString(), "2026-09-03T12:07:00.000Z");
  assert.equal(total(first, "expectedSeconds"), (2 * 24 + 9) * 3_600 + 7 * 60);
  const second = await fixture.fetch({ month: fixture.month("2026-09-03T12:08:59Z") });
  assert.equal(fixture.calls.length, 3);
  assert.equal(fixture.calls[2].granularity, "minute");
  assert.equal(fixture.calls[2].from.toISOString(), "2026-09-03T12:02:00.000Z");
  assert.equal(fixture.calls[2].to.toISOString(), "2026-09-03T12:08:00.000Z");
  assert.equal(total(second, "expectedSeconds"), total(first, "expectedSeconds") + 60);
  await fixture.fetch({ month: fixture.month("2026-09-03T12:08:59Z") });
  assert.equal(fixture.calls.length, 3, "mesmo minuto fechado não dispara outra consulta");
  assert.ok([...fixture.cache.values()].filter((day) => day.to <= Date.parse("2026-09-03T03:00:00Z"))
    .every((day) => [...day.spans.values()].every((span) => span.final && !span.minuteMetrics)));
});

test("hora atual se reconcilia a cada quinze minutos sem reler os dias anteriores", async () => {
  const fixture = createFixture();
  await fixture.fetch({ month: fixture.month("2026-09-03T12:05:00Z") });
  await fixture.fetch({ month: fixture.month("2026-09-03T12:20:00Z") });
  const last = fixture.calls.at(-1);
  assert.equal(fixture.calls.length, 3);
  assert.equal(last.granularity, "minute");
  assert.equal(last.from.toISOString(), "2026-09-03T12:00:00.000Z");
  assert.equal(last.to.toISOString(), "2026-09-03T12:20:00.000Z");
});

test("nova hora fecha a anterior uma vez e preserva totais sem duplicação", async () => {
  const fixture = createFixture();
  await fixture.fetch({ month: fixture.month("2026-09-03T12:59:00Z") });
  const result = await fixture.fetch({ month: fixture.month("2026-09-03T13:01:00Z") });
  assert.equal(fixture.calls.length, 4);
  assert.equal(fixture.calls[2].from.toISOString(), "2026-09-03T12:00:00.000Z");
  assert.equal(fixture.calls[2].granularity, "hour");
  assert.equal(fixture.calls[3].from.toISOString(), "2026-09-03T13:00:00.000Z");
  assert.equal(total(result, "expectedSeconds"), (2 * 24 + 10) * 3_600 + 60);
});

test("lacuna recém-fechada é revista após quinze minutos sem repetir histórico completo", async () => {
  let missing = true;
  const fixture = createFixture((call) => {
    const response = reply(call);
    if (missing && call.granularity === "hour") response.data = [];
    return response;
  });
  const first = await fixture.fetch({ month: fixture.month("2026-09-01T04:00:00Z") });
  assert.equal(total(first, "unknownSeconds"), 3_600);
  await fixture.fetch({ month: fixture.month("2026-09-01T04:05:00Z") });
  assert.equal(fixture.calls.length, 2);
  missing = false;
  const reconciled = await fixture.fetch({ month: fixture.month("2026-09-01T04:15:00Z") });
  assert.equal(fixture.calls.length, 4);
  assert.equal(fixture.calls[2].from.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(fixture.calls[2].to.toISOString(), "2026-09-01T04:00:00.000Z");
  assert.equal(total(reconciled, "unknownSeconds"), 0);
});

test("escopo e cancelamento são propagados e um cancelamento não grava cache", async () => {
  const controller = new AbortController();
  const fixture = createFixture((call) => {
    assert.equal(call.options.companyScopeId, "company-selected");
    assert.equal(call.options.signal, controller.signal);
    controller.abort();
    return reply(call);
  });
  await assert.rejects(fixture.fetch({ signal: controller.signal }), { name: "AbortError" });
  assert.equal(fixture.cache.size, 0);
  await assert.rejects(fixture.fetch({ signal: controller.signal }), { name: "AbortError" });
  assert.equal(fixture.calls.length, 1, "sinal abortado não abre nova requisição");
});

test("cache nunca cruza empresa, cenário ou fuso", async () => {
  const fixture = createFixture();
  await fixture.fetch();
  await fixture.fetch();
  assert.equal(fixture.calls.length, 1);
  await fixture.fetch({ companyScopeId: "another-company" });
  await fixture.fetch({ scenarioId: "another-scenario" });
  await fixture.fetch({ month: fixture.month("2026-09-01T04:00:00Z", "UTC"), timeZone: "UTC" });
  assert.equal(fixture.calls.length, 4);
});

test("cenário, fuso e buckets fora do filtro são recusados", async () => {
  for (const tamper of [
    (response) => { response.scenario_id = "outside-scope"; },
    (response) => { response.timezone = "America/New_York"; },
    (response) => { response.data[0].bucket = "2020-09-01T00:00:00Z"; },
  ]) {
    const fixture = createFixture((call) => {
      const response = reply(call, undefined, { certified: true });
      tamper(response);
      return response;
    });
    await assert.rejects(fixture.fetch());
    assert.equal(fixture.cache.size, 0);
  }
});

test("retorno certificado preserva o as_of mais conservador das fontes", async () => {
  const fixture = createFixture((call) => reply(call, undefined, {
    certified: true,
    asOf: call.granularity === "hour" ? "2026-09-03T12:00:00Z" : "2026-09-03T12:07:00Z",
  }));
  const result = await fixture.fetch({ month: fixture.month("2026-09-03T12:07:00Z") });
  assert.equal(result.asOf.toISOString(), "2026-09-03T12:00:00.000Z");
});

test("fuso fracionário preserva início civil e divide bordas em minutos", async () => {
  const fixture = createFixture();
  const result = await fixture.fetch({
    month: fixture.month("2026-09-01T20:00:00Z", "Asia/Kolkata"),
    timeZone: "Asia/Kolkata",
  });
  assert.equal(total(result, "expectedSeconds"), 25.5 * 3_600);
  assert.ok(result.hours.every((hour) => hour.dateKey === "2026-09-01" || hour.dateKey === "2026-09-02"));
  assert.equal(result.hours.filter((hour) => hour.dateKey === "2026-09-01" && hour.hour === 0)
    .reduce((sum, hour) => sum + hour.expectedSeconds, 0), 3_600);
});

test("dia de transição DST mantém as duas ocorrências da hora civil", async () => {
  const fixture = createFixture();
  const result = await fixture.fetch({
    month: fixture.month("2026-11-02T05:00:00Z", "America/New_York"),
    timeZone: "America/New_York",
  });
  assert.equal(fixture.calls.length, 1);
  assert.equal(total(result, "expectedSeconds"), 25 * 3_600);
  assert.equal(result.hours.filter((hour) => hour.hour === 1)
    .reduce((sum, hour) => sum + hour.expectedSeconds, 0), 2 * 3_600);
});

test("fuso do navegador diferente não desalinha os buckets da empresa", async () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = "Asia/Kolkata";
    const fixture = createFixture();
    const result = await fixture.fetch({ month: fixture.month("2026-09-01T06:00:00Z") });
    assert.equal(total(result, "confirmedOccupiedSeconds"), 3 * 3_600);
    assert.deepEqual(result.hours.map((hour) => hour.hour), [0, 1, 2]);
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

function total(scenario, field) {
  return scenario.hours.reduce((sum, hour) => sum + hour[field], 0);
}

function reply(call, metric = () => ({ minimum: 1, average: 1, peak: 1 }), options = {}) {
  const step = call.granularity === "hour" ? HOUR : MINUTE;
  const data = [];
  for (let bucket = call.from.getTime(); bucket < call.to.getTime(); bucket += step) {
    const value = metric(bucket);
    data.push({
      bucket: new Date(bucket).toISOString(),
      scenario_total_avg: value.average,
      scenario_total_min: value.minimum,
      scenario_total_max: value.peak,
      ...(options.certified ? { scenario_total_final: value.average, complete: true, status: "complete" } : {}),
    });
  }
  return {
    data,
    scenario_id: call.scenarioId,
    granularity: call.granularity,
    ...(options.certified ? {
      as_of: options.asOf ?? call.to.toISOString(),
      complete: true,
      status: "complete",
      timezone: "America/Sao_Paulo",
    } : {}),
  };
}

function createFixture(responder = reply) {
  const calls = [];
  const modules = new Map();
  const apiFetch = async (path, options) => {
    const url = new URL(path, "http://localhost");
    const call = {
      from: new Date(url.searchParams.get("from")),
      granularity: url.searchParams.get("granularity"),
      options,
      scenarioId: decodeURIComponent(url.pathname.split("/")[3]),
      to: new Date(url.searchParams.get("to")),
    };
    calls.push(call);
    return responder(call);
  };
  const query = load("lib/occupancy-duration-insights-query.ts");
  const model = load("lib/occupancy-duration-insights.ts");
  const cache = new Map();
  const month = (date, zone = "America/Sao_Paulo") => model.buildOccupancyDurationInsightMonth(new Date(date), zone);
  return {
    cache,
    calls,
    fetch: (overrides = {}) => query.fetchOccupancyDurationInsightScenario({
      cache,
      companyScopeId: "company-selected",
      month: month("2026-09-01T04:00:00Z"),
      name: "Praça de alimentação",
      scenarioId: "scenario-selected",
      signal: new AbortController().signal,
      timeZone: "America/Sao_Paulo",
      ...overrides,
    }),
    month,
  };

  function load(relativePath) {
    const filename = resolve(projectRoot, relativePath);
    if (modules.has(filename)) return modules.get(filename).exports;
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    const loaded = { exports: {} };
    modules.set(filename, loaded);
    const nodeRequire = createRequire(filename);
    const localRequire = (specifier) => specifier === "@/lib/api"
      ? { apiFetch }
      : specifier.startsWith("@/") ? load(`${specifier.slice(2)}.ts`) : nodeRequire(specifier);
    new Function("exports", "require", "module", "__filename", "__dirname", output)(
      loaded.exports, localRequire, loaded, filename, dirname(filename),
    );
    return loaded.exports;
  }
}
