import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const validation = load("lib/occupancy-aggregate-validation.ts");
const civilQuery = load("lib/occupancy-civil-aggregate-query.ts");
const documented = { allowDocumentedAggregateResponse: true, requireCertification: true,
  expectedTimezone: "America/Sao_Paulo" };
process.env.TZ = "UTC";

for (const [granularity, bucket] of [
  ["minute", "2026-09-11T12:01:00Z"], ["hour", "2026-09-11T12:00:00Z"],
  ["day", "2026-09-11T03:00:00Z"], ["week", "2026-09-07T03:00:00Z"],
  ["month", "2026-09-01T03:00:00Z"],
]) {
  test(`contrato Swagger ${granularity} dispensa extensões de certificação sem inventá-las`, () => {
    const source = envelope(granularity, [row(bucket, 2)]);
    const copy = structuredClone(source);
    const rows = validation.requireOccupancyAggregateRows(source, granularity, "scenario-a",
      "America/Sao_Paulo", documented);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scenario_total_avg, 2);
    assert.equal(rows[0].scenario_total_final, undefined);
    assert.equal(rows[0].complete, undefined);
    assert.equal(rows[0].status, undefined);
    assert.equal(source.as_of, undefined);
    assert.equal(source.timezone, undefined);
    assert.deepEqual(source, copy);
    assert.ok(validation.occupancyAggregateMetadataWarning(source, granularity));
    assert.equal(validation.resolveCertifiedOccupancyDataCutoff([{ asOf: source.as_of }]), null);
    assert.deepEqual(validation.requireOccupancyAggregateRows(envelope(granularity, []),
      granularity, "scenario-a", "America/Sao_Paulo", documented), []);
  });
}

test("extensões presentes são validadas mesmo se outras estiverem ausentes", () => {
  const source = envelope("hour", [row("2026-09-11T12:00:00Z", 2)]);
  assert.doesNotThrow(() => checked({ ...source, complete: true }));
  assert.doesNotThrow(() => checked({ ...source, timezone: "America/Sao_Paulo" }));
  for (const patch of [{ complete: false }, { complete: "true" }, { status: "partial" },
    { as_of: "bad" }, { timezone: "UTC" }, { scenario_id: "other" }, { granularity: "day" }]) {
    assert.throws(() => checked({ ...source, ...patch }));
  }
  assert.throws(() => checked({ ...source, data: [{ ...source.data[0], scenario_total_final: 3 }] }));
  assert.throws(() => checked({ ...source, data: [{ ...source.data[0], complete: false }] }));
});

test("modo estrito e granularidades não documentadas não são relaxados", () => {
  const source = envelope("hour", [row("2026-09-11T12:00:00Z", 2)]);
  assert.throws(() => validation.requireOccupancyAggregateRows(source, "hour", "scenario-a",
    "America/Sao_Paulo", { requireCertification: true }), /não informou/);
  assert.throws(() => validation.requireOccupancyAggregateRows(envelope("year", [row("2026-01-01", 2)]),
    "year", "scenario-a", "America/Sao_Paulo", documented), /não informou/);
});

test("total de áreas constantes ou sincronizadas é aceito sem somar os máximos no frontend", () => {
  for (const varying of [false, true]) {
    const data = [2, 3].map((count, index) => ({
      bucket: "2026-09-11T12:00:00Z", camera_id: `camera-${index}`, area_id: `area-${index}`,
      area_avg: varying ? count / 2 : count, area_min: varying ? 0 : count, area_max: count,
      scenario_total_avg: varying ? 2.5 : 5, scenario_total_min: varying ? 0 : 5, scenario_total_max: 5,
    }));
    const rows = checked(envelope("hour", data));
    const metrics = validation.aggregateOccupancyRowsByBucket(rows, "hour", documented);
    assert.equal(metrics.size, 1);
    assert.deepEqual([...metrics.values()][0], { average: varying ? 2.5 : 5, minimum: varying ? 0 : 5, peak: 5 });
    assert.throws(() => checked(envelope("hour", data.map((item) => ({
      bucket: item.bucket, camera_id: item.camera_id, area_id: item.area_id,
      area_avg: item.area_avg, area_min: item.area_min, area_max: item.area_max,
    })))), /scenario_total/);
    assert.throws(() => checked(envelope("hour", [...data, data[0]])), /duplicada/);
    assert.throws(() => checked(envelope("hour", [data[0], { ...data[1], scenario_total_max: 6 }])), /divergentes/);
  }
});

test("coarse RFC3339 é instante, não uma data civil rebatizada", () => {
  assert.throws(() => validation.requireOccupancyAggregateRows(envelope("day", [row("2026-09-11T00:00:00Z", 1)]),
    "day", "scenario-a", "America/Sao_Paulo", documented), validation.OccupancyCivilBucketAlignmentError);
  assert.throws(() => validation.requireOccupancyAggregateRows(envelope("day", [row("2026-02-30T00:00:00Z", 1)]),
    "day", "scenario-a", "America/Sao_Paulo", documented), /inválido/);
  const rows = validation.requireOccupancyAggregateRows(envelope("day", [row("2026-09-11T03:00:00Z", 1)]),
    "day", "scenario-a", "America/Sao_Paulo", documented);
  assert.equal(rows[0].bucket, "2026-09-11");
  assert.throws(() => validation.aggregateOccupancyRowsForRequestedBuckets(rows, "day",
    [new Date(2026, 8, 12)], documented), /fora do período/);
});

test("horas abertas de offsets 30/45 minutos são independentes do navegador UTC", () => {
  for (const [timeZone, bucket] of [["Asia/Kolkata", "2026-09-10T18:30:00Z"],
    ["Asia/Kathmandu", "2026-09-10T18:15:00Z"]]) {
    const options = { ...documented, expectedTimezone: timeZone, openBucket: new Date(bucket),
      requestedAt: new Date(Date.parse(bucket) + 20 * 60_000) };
    const source = { ...envelope("hour", [row(bucket, 1)]),
      as_of: new Date(Date.parse(bucket) + 10 * 60_000).toISOString() };
    const rows = validation.requireOccupancyAggregateRows(source, "hour", "scenario-a", timeZone, options);
    assert.equal(validation.aggregateOccupancyRowsForRequestedBuckets(rows, "hour", [options.openBucket], options).totals.size, 1);
    assert.throws(() => validation.requireOccupancyAggregateRows({ ...source,
      as_of: new Date(Date.parse(bucket) + 25 * 60_000).toISOString() }, "hour", "scenario-a", timeZone, options), /fora da janela/);
  }
});

test("as_of do dia aberto usa o início civil da empresa, inclusive DST à meia-noite", () => {
  const source = { ...envelope("day", [row("2026-09-06T04:00:00Z", 1)]), as_of: "2026-09-06T04:10:00Z" };
  assert.doesNotThrow(() => validation.requireOccupancyAggregateRows(source, "day", "scenario-a",
    "America/Santiago", { ...documented, openBucket: new Date(2026, 8, 6), requestedAt: new Date("2026-09-06T04:20:00Z") }));
});

test("coarse alinhado usa uma consulta e mantém os valores originais", async () => {
  const fixture = createFixture((call) => envelope(call.granularity, [row("2026-09-11T03:00:00Z", 7)]));
  const result = await fixture.fetch();
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].from.toISOString(), "2026-09-11T03:00:00.000Z");
  assert.equal(fixture.calls[0].to.toISOString(), "2026-09-12T03:00:00.000Z");
  assert.equal(result.data[0].scenario_total_avg, 7);
  assert.equal(result.data[0].bucket, "2026-09-11");
});

test("dia UTC divergente usa fallback horário e identidade de capacidade por tenant", async () => {
  const fixture = createFixture();
  const result = await fixture.fetch();
  assert.equal(fixture.calls.length, 2);
  assert.equal(result.data[0].scenario_total_avg, 1);
  assert.equal(result.data[0].scenario_total_final, undefined);
  assert.equal(result.as_of, undefined);
  await fixture.fetch();
  assert.equal(fixture.calls.length, 3, "a capacidade do batch evita repetir coarse incompatível");
  await fixture.fetch({ companyScopeId: "company-b" });
  assert.equal(fixture.calls.length, 5, "outra empresa não herda a decisão");
});

for (const [timeZone, day, expectedHours] of [
  ["America/New_York", [2026, 2, 8], 23], ["America/New_York", [2026, 10, 1], 25],
  ["America/Santiago", [2026, 8, 6], 23], ["Australia/Lord_Howe", [2026, 3, 5], 24.5],
]) {
  test(`fallback preserva ${expectedHours} horas reais em ${timeZone}`, async () => {
    const fixture = createFixture();
    const result = await fixture.fetch({ from: new Date(...day), to: new Date(day[0], day[1], day[2] + 1), timeZone });
    assert.equal(result.data[0].scenario_total_avg, 1);
    const spans = fixture.calls.filter((call) => call.granularity === "hour" || call.granularity === "minute");
    assert.equal(spans.reduce((sum, call) => sum + (call.to - call.from), 0), expectedHours * 3_600_000);
  });
}

for (const timeZone of ["Asia/Kolkata", "Asia/Kathmandu"]) {
  test(`bordas fracionárias ${timeZone} usam minutos e média ponderada real`, async () => {
    const fixture = createFixture((call) => responseFor(call, call.granularity === "minute" ? 2 : 1));
    const result = await fixture.fetch({ timeZone });
    assert.equal(result.data[0].scenario_total_avg, 25 / 24);
    assert.equal(result.data[0].scenario_total_min, 1);
    assert.equal(result.data[0].scenario_total_max, 2);
    assert.equal(fixture.calls.filter((call) => call.granularity === "minute").length, 2);
  });
}

test("fallback não converte ausência em zero nem soma picos de áreas", async () => {
  const missing = createFixture((call) => {
    const response = responseFor(call, 0);
    if (call.granularity === "hour") response.data.pop();
    return response;
  });
  assert.deepEqual((await missing.fetch()).data, []);
  const zero = createFixture((call) => responseFor(call, 0));
  assert.deepEqual((await zero.fetch()).data, [{ bucket: "2026-09-11",
    scenario_total_avg: 0, scenario_total_min: 0, scenario_total_max: 0 }]);
});

test("hora em curso usa somente minutos fechados até requestedAt", async () => {
  const fixture = createFixture();
  const result = await fixture.fetch({ openBucket: new Date(2026, 8, 11), requestedAt: new Date("2026-09-11T04:17:42Z") });
  assert.equal(result.data[0].scenario_total_avg, 1);
  const spans = fixture.calls.slice(1);
  assert.equal(spans.reduce((sum, call) => sum + (call.to - call.from), 0), 77 * 60_000);
  assert.equal(spans.at(-1).to.toISOString(), "2026-09-11T04:17:00.000Z");
});

test("média fracionária constante não ultrapassa min/max por arredondamento", async () => {
  const fixture = createFixture((call) => responseFor(call, 0.1));
  const result = await fixture.fetch();
  assert.equal(result.data[0].scenario_total_avg, 0.1);
  assert.doesNotThrow(() => validation.requireOccupancyAggregateRows(result, "day", "scenario-a",
    "America/Sao_Paulo", documented));
});

test("escopo errado, schema inválido e falha de rede não disparam fallback", async () => {
  for (const responder of [
    (call) => ({ ...responseFor(call), scenario_id: "other" }),
    (call) => ({ ...responseFor(call), complete: false }),
    (call) => ({ ...responseFor(call), data: [row("2026-09-11T00:00:00Z", -1)] }),
    () => { throw new Error("network unavailable"); },
  ]) {
    const fixture = createFixture(responder);
    await assert.rejects(fixture.fetch());
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.capabilities.size, 0);
  }
});

test("aborto não publica resultado nem registra capacidade", async () => {
  const controller = new AbortController();
  const fixture = createFixture((call) => {
    if (call.granularity === "hour") controller.abort();
    return responseFor(call);
  });
  await assert.rejects(fixture.fetch({ signal: controller.signal }), { name: "AbortError" });
  assert.equal(fixture.capabilities.size, 0);
});

test("limite de quatro anos é validado antes de consultas e horas são particionadas", async () => {
  const fixture = createFixture();
  await assert.rejects(fixture.fetch({ from: new Date(2020, 0, 1), to: new Date(2026, 0, 1) }), /quatro anos/);
  assert.equal(fixture.calls.length, 0);
  await fixture.fetch({ granularity: "month", from: new Date(2026, 6, 1), to: new Date(2026, 8, 1) });
  const hours = fixture.calls.filter((call) => call.granularity === "hour");
  assert.equal(hours.length, 2);
  assert.ok(hours.every((call) => call.to - call.from <= 31 * 24 * 3_600_000));
});

function checked(response) {
  return validation.requireOccupancyAggregateRows(response, "hour", "scenario-a", "America/Sao_Paulo", documented);
}
function row(bucket, value = 1) {
  return { bucket, scenario_total_avg: value, scenario_total_min: value, scenario_total_max: value };
}
function envelope(granularity, data) { return { granularity, data, scenario_id: "scenario-a" }; }
function responseFor(call, value = 1) {
  if (call.granularity !== "hour" && call.granularity !== "minute") {
    return envelope(call.granularity, [row(`${call.from.toISOString().slice(0, 10)}T00:00:00Z`, value)]);
  }
  const data = [];
  const step = call.granularity === "hour" ? 3_600_000 : 60_000;
  for (let cursor = call.from.getTime(); cursor < call.to.getTime(); cursor += step) {
    data.push(row(new Date(cursor).toISOString(), value));
  }
  return envelope(call.granularity, data);
}
function createFixture(responder = responseFor) {
  const calls = [];
  const capabilities = new Map();
  return { calls, capabilities, fetch: (overrides = {}) => civilQuery.fetchOccupancyCivilAggregate({
    scenarioId: "scenario-a", companyScopeId: "company-a", granularity: "day",
    from: new Date(2026, 8, 11), to: new Date(2026, 8, 12), timeZone: "America/Sao_Paulo",
    capabilities, fetchResponse: async (path) => {
      const url = new URL(path, "http://fixture.invalid");
      const call = { from: new Date(url.searchParams.get("from")), to: new Date(url.searchParams.get("to")),
        granularity: url.searchParams.get("granularity") };
      calls.push(call);
      return responder(call);
    }, ...overrides,
  }) };
}
function load(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", source)((id) => id === "@/lib/api"
    ? { apiFetch: () => { throw new Error("Unexpected real API access"); } }
    : id.startsWith("@/") ? load(`${id.slice(2)}.ts`) : require(id), loaded, loaded.exports);
  return loaded.exports;
}
