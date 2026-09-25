// Dynamic fixtures intentionally cross injected-module and malformed-input boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const validation = load("lib/occupancy-aggregate-validation.ts");
const civilQuery = load("lib/occupancy-civil-aggregate-query.ts");
const documented = { allowDocumentedAggregateResponse: true, requireCertification: true,
  expectedTimezone: "America/Sao_Paulo" };
process.env.TZ = "UTC";

for (const [granularity, bucket] of [
  ["minute", "2026-09-11T12:01:00Z"],
  ["hour", "2026-09-11T12:00:00Z"],
] as const) {
  test(`contrato Swagger ${granularity} usa instantes explícitos sem inventar certificação`, () => {
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

for (const [granularity, bucket] of [
  ["day", "2026-09-11T03:00:00Z"],
  ["week", "2026-09-07T03:00:00Z"],
  ["month", "2026-09-01T03:00:00Z"],
] as const) {
  test(`agregado civil ${granularity} sem timezone/completude não é aceito diretamente`, () => {
    assert.throws(
      () => validation.requireOccupancyAggregateRows(
        envelope(granularity, [row(bucket, 2)]),
        granularity,
        "scenario-a",
        "America/Sao_Paulo",
        documented,
      ),
      /não informou complete/,
    );
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
  assert.throws(() => validation.requireOccupancyAggregateRows(certifiedEnvelope("day", [row("2026-09-11T00:00:00Z", 1)]),
    "day", "scenario-a", "America/Sao_Paulo", documented), validation.OccupancyCivilBucketAlignmentError);
  assert.throws(() => validation.requireOccupancyAggregateRows(certifiedEnvelope("day", [row("2026-02-30T00:00:00Z", 1)]),
    "day", "scenario-a", "America/Sao_Paulo", documented), /inválido/);
  const rows = validation.requireOccupancyAggregateRows(certifiedEnvelope("day", [row("2026-09-11T03:00:00Z", 1)]),
    "day", "scenario-a", "America/Sao_Paulo", documented);
  assert.equal(rows[0].bucket, "2026-09-11");
  assert.throws(() => validation.aggregateOccupancyRowsForRequestedBuckets(rows, "day",
    [new Date(2026, 8, 12)], documented), /fora do período/);
});

test("horas abertas de offsets 30/45 minutos são independentes do navegador UTC", () => {
  for (const [timeZone, bucket] of [["Asia/Kolkata", "2026-09-10T18:30:00Z"],
    ["Asia/Kathmandu", "2026-09-10T18:15:00Z"]] as const) {
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
  const source = certifiedEnvelope(
    "day",
    [row("2026-09-06T04:00:00Z", 1)],
    {
      as_of: "2026-09-06T04:10:00Z",
      complete: false,
      status: "partial",
      timezone: "America/Santiago",
    },
  );
  source.data = source.data.map((item: RuntimeFixture) => ({
    ...item,
    complete: false,
    status: "partial",
  }));
  assert.doesNotThrow(() => validation.requireOccupancyAggregateRows(source, "day", "scenario-a",
    "America/Santiago", { ...documented, openBucket: new Date(2026, 8, 6), requestedAt: new Date("2026-09-06T04:20:00Z") }));
});

test("bucket aberto aceita as_of entre envio e recebimento, mas nunca depois do recebimento ou do próprio bucket", () => {
  const openBucket = new Date("2026-09-11T04:00:00Z");
  const requestedAt = new Date("2026-09-11T04:17:42Z");
  const receivedAt = new Date("2026-09-11T04:17:44Z");
  const options = { ...documented, openBucket, requestedAt, receivedAt };
  const partial = (asOf: string) => certifiedEnvelope("hour", [row(openBucket.toISOString(), 2)], {
    as_of: asOf,
    complete: false,
    status: "partial",
  });
  const response = partial("2026-09-11T04:17:43Z");
  response.data = response.data.map((item: RuntimeFixture) => ({
    ...item, complete: false, scenario_total_final: undefined, status: "partial",
  }));
  assert.doesNotThrow(() => validation.requireOccupancyAggregateRows(
    response, "hour", "scenario-a", "America/Sao_Paulo", options,
  ));
  assert.throws(() => validation.requireOccupancyAggregateRows(
    response, "hour", "scenario-a", "America/Sao_Paulo", { ...options, receivedAt: undefined },
  ), /fora da janela/);
  assert.throws(() => validation.requireOccupancyAggregateRows(
    { ...response, as_of: "2026-09-11T04:17:45Z" }, "hour", "scenario-a", "America/Sao_Paulo", options,
  ), /fora da janela/);
  assert.throws(() => validation.requireOccupancyAggregateRows(
    { ...response, as_of: "2026-09-11T05:00:00Z" }, "hour", "scenario-a", "America/Sao_Paulo",
    { ...options, receivedAt: new Date("2026-09-11T05:01:00Z") },
  ), /fora da janela/);
});

test("consulta civil aceita resposta recebida após o envio sem certificar bucket parcial", async () => {
  const openBucket = new Date(2026, 8, 11);
  const requestedAt = new Date("2026-09-11T04:17:42Z");
  const receivedAt = new Date("2026-09-11T04:17:44Z");
  const fixture = createFixture((call) => {
    const response = certifiedEnvelope(call.granularity, [row(call.from.toISOString(), 2)], {
      as_of: "2026-09-11T04:17:43Z", complete: false, status: "partial",
    });
    response.data = response.data.map((item: RuntimeFixture) => ({
      ...item, complete: false, scenario_total_final: undefined, status: "partial",
    }));
    return response;
  });
  const result = await fixture.fetch({ openBucket, requestedAt, receivedAt });
  assert.equal(fixture.calls.length, 1);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].scenario_total_avg, 2);
  assert.equal(result.data[0].complete, false);
  assert.equal(result.data[0].status, "partial");
});

for (const [granularity, from, openBucket, to, closedBucket, asOf, requestedAt] of [
  ["day", new Date(2026, 8, 10), new Date(2026, 8, 11), new Date(2026, 8, 12),
    "2026-09-10T03:00:00Z", "2026-09-10T18:00:00Z", "2026-09-11T15:00:00Z"],
  ["week", new Date(2026, 8, 7), new Date(2026, 8, 14), new Date(2026, 8, 21),
    "2026-09-07T03:00:00Z", "2026-09-10T18:00:00Z", "2026-09-16T15:00:00Z"],
  ["month", new Date(2026, 7, 1), new Date(2026, 8, 1), new Date(2026, 9, 1),
    "2026-08-01T03:00:00Z", "2026-08-20T18:00:00Z", "2026-09-11T15:00:00Z"],
] as const) {
  test(`${granularity}: histórico fechado continua visível quando o período atual não tem leitura`, async () => {
    const fixture = createFixture((call) => certifiedEnvelope(
      call.granularity,
      [row(closedBucket, 4)],
      { as_of: asOf, complete: false, status: "partial" },
    ));
    const result = await fixture.fetch({
      from,
      granularity,
      openBucket,
      requestedAt: new Date(requestedAt),
      to,
    });
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(result.data.map((item: RuntimeFixture) => item.bucket), [closedBucket.slice(0, 10)]);
    assert.equal(result.data[0].scenario_total_avg, 4);
  });
}

test("coarse alinhado usa uma consulta e mantém os valores originais", async () => {
  const fixture = createFixture((call) => certifiedEnvelope(
    call.granularity,
    [row("2026-09-11T03:00:00Z", 7)],
    { as_of: call.to.toISOString() },
  ));
  const result = await fixture.fetch();
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].from.toISOString(), "2026-09-11T03:00:00.000Z");
  assert.equal(fixture.calls[0].to.toISOString(), "2026-09-12T03:00:00.000Z");
  assert.equal(result.data[0].scenario_total_avg, 7);
  assert.equal(result.data[0].bucket, "2026-09-11");
});

for (const [granularity, from, to] of [
  ["day", new Date(2026, 8, 11), new Date(2026, 8, 12)],
  ["week", new Date(2026, 8, 7), new Date(2026, 8, 14)],
  ["month", new Date(2026, 8, 1), new Date(2026, 9, 1)],
] as const) {
  test(`agregado civil ${granularity} parcial certificado plota o bucket aberto`, async () => {
    const fixture = createFixture((call) => {
      const response = certifiedEnvelope(
        call.granularity,
        [row(call.from.toISOString(), 7)],
        {
          as_of: "2026-09-11T04:10:00Z",
          complete: false,
          status: "partial",
        },
      );
      response.data = response.data.map((item: RuntimeFixture) => ({
        ...item,
        complete: false,
        scenario_total_final: undefined,
        status: "partial",
      }));
      return response;
    });

    const result = await fixture.fetch({
      from,
      granularity,
      openBucket: from,
      requestedAt: new Date("2026-09-11T04:17:42Z"),
      to,
    });

    assert.equal(fixture.calls.length, 1);
    assert.equal(result.complete, false);
    assert.equal(result.status, "partial");
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].scenario_total_avg, 7);
    assert.equal(result.data[0].scenario_total_final, undefined);
    assert.equal(result.data[0].complete, false);
    assert.equal(result.data[0].status, "partial");
  });
}

test("bucket civil fechado parcial continua inválido e não dispara fallback", async () => {
  const fixture = createFixture((call) => {
    const response = certifiedEnvelope(
      call.granularity,
      [row(call.from.toISOString(), 7)],
      { complete: false, status: "partial" },
    );
    response.data = response.data.map((item: RuntimeFixture) => ({
      ...item,
      complete: false,
      status: "partial",
    }));
    return response;
  });

  await assert.rejects(fixture.fetch(), /incompleto/);
  assert.equal(fixture.calls.length, 1);
});

test("coarse civil alinhado sem certificação é recomposto por horas", async () => {
  const fixture = createFixture((call) =>
    call.granularity === "day"
      ? envelope("day", [row("2026-09-11T03:00:00Z", 7)])
      : responseFor(call),
  );
  const result = await fixture.fetch();
  assert.deepEqual(
    fixture.calls.map((call) => call.granularity),
    ["day", "hour"],
  );
  assert.equal(result.data[0].scenario_total_avg, 1);
  assert.equal(result.timezone, "America/Sao_Paulo");
  assert.equal(result.complete, true);
  assert.equal(result.status, "complete");
  assert.deepEqual([...fixture.capabilities.values()], [false]);
});

test("dia UTC divergente usa fallback horário e identidade de capacidade por tenant", async () => {
  const fixture = createFixture();
  const result = await fixture.fetch();
  assert.equal(fixture.calls.length, 2);
  assert.equal(result.data[0].scenario_total_avg, 1);
  assert.equal(result.data[0].scenario_total_final, undefined);
  assert.equal(result.as_of, "2026-09-12T03:00:00.000Z");
  assert.equal(result.timezone, "America/Sao_Paulo");
  await fixture.fetch();
  assert.equal(fixture.calls.length, 3, "a capacidade do batch evita repetir coarse incompatível");
  await fixture.fetch({ companyScopeId: "company-b" });
  assert.equal(fixture.calls.length, 5, "outra empresa não herda a decisão");
});

test("cenários concorrentes compartilham a descoberta de fallback civil", async () => {
  const fixture = createFixture();
  await Promise.all([
    fixture.fetch({ maximumFallbackRequests: 4, scenarioId: "scenario-a" }),
    fixture.fetch({ maximumFallbackRequests: 4, scenarioId: "scenario-b" }),
  ]);
  assert.equal(
    fixture.calls.filter((call) => call.granularity === "day").length,
    1,
    "somente o primeiro cenário deve sondar a capacidade coarse",
  );
  assert.equal(
    fixture.calls.filter((call) => call.granularity === "hour").length,
    2,
    "cada série ainda mantém sua própria resposta horária",
  );
});

for (const [timeZone, day, expectedHours] of [
  ["America/New_York", [2026, 2, 8], 23], ["America/New_York", [2026, 10, 1], 25],
  ["America/Santiago", [2026, 8, 6], 23], ["Australia/Lord_Howe", [2026, 3, 5], 24.5],
] as const) {
  test(`fallback preserva ${expectedHours} horas reais em ${timeZone}`, async () => {
    const fixture = createFixture();
    const result = await fixture.fetch({ from: new Date(day[0], day[1], day[2]), to: new Date(day[0], day[1], day[2] + 1), timeZone });
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
    complete: true, scenario_total_avg: 0, scenario_total_min: 0,
    scenario_total_max: 0, status: "complete" }]);
});

test("fallback do dia aberto plota unidades disponíveis sem preencher lacunas com zero", async () => {
  const fixture = createFixture((call) => {
    const response = responseFor(call, call.granularity === "minute" ? 4 : 2);
    if (call.granularity === "hour") response.data.splice(1, 1);
    if (call.granularity === "minute") response.data.pop();
    return response;
  });

  const result = await fixture.fetch({
    openBucket: new Date(2026, 8, 11),
    requestedAt: new Date("2026-09-11T06:17:42Z"),
  });

  assert.deepEqual(fixture.calls.map((call) => call.granularity), ["day", "hour", "minute"]);
  assert.equal(result.complete, false);
  assert.equal(result.status, "partial");
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].complete, false);
  assert.equal(result.data[0].status, "partial");
  assert.equal(result.data[0].scenario_total_min, 2);
  assert.equal(result.data[0].scenario_total_max, 4);
  assert.ok(Math.abs(result.data[0].scenario_total_avg - 304 / 136) < 1e-12);
  assert.equal(result.data[0].scenario_total_final, undefined);
});

test("hora em curso usa somente minutos fechados até requestedAt", async () => {
  const fixture = createFixture();
  const result = await fixture.fetch({ openBucket: new Date(2026, 8, 11), requestedAt: new Date("2026-09-11T04:17:42Z") });
  assert.equal(result.data[0].scenario_total_avg, 1);
  const spans = fixture.calls.slice(1);
  assert.equal(spans.reduce((sum, call) => sum + (call.to - call.from), 0), 77 * 60_000);
  assert.equal(spans.at(-1).to.toISOString(), "2026-09-11T04:17:00.000Z");
});

test("fallback ao vivo reutiliza unidades fechadas e busca somente o novo minuto", async () => {
  const fixture = createFixture();
  const unitCache = new Map();
  const live = {
    openBucket: new Date(2026, 8, 11),
    requestedAt: new Date("2026-09-11T04:17:42Z"),
    unitCache,
  };
  await fixture.fetch(live);
  assert.ok(unitCache.size > 1);

  fixture.calls.splice(0);
  await fixture.fetch(live);
  assert.equal(
    fixture.calls.length,
    0,
    "o mesmo minuto fechado não deve ser consultado novamente a cada 5s",
  );

  await fixture.fetch({
    ...live,
    requestedAt: new Date("2026-09-11T04:18:42Z"),
  });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].granularity, "minute");
  assert.equal(fixture.calls[0].to - fixture.calls[0].from, 60_000);

  fixture.calls.splice(0);
  await fixture.fetch({ ...live, bypassUnitCache: true });
  assert.equal(
    fixture.calls.length,
    2,
    "a auditoria explícita deve reler hora fechada e minutos do bucket civil",
  );
});

test("unidade fechada ausente só é revista quando a borda de minuto avança", async () => {
  const fixture = createFixture((call) => {
    const response = responseFor(call, 1);
    if (call.granularity === "minute") response.data.pop();
    return response;
  });
  const unitCache = new Map();
  const live = {
    openBucket: new Date(2026, 8, 11),
    requestedAt: new Date("2026-09-11T04:17:42Z"),
    unitCache,
  };

  const first = await fixture.fetch(live);
  assert.deepEqual(first.data, [{
    bucket: "2026-09-11", complete: false, scenario_total_avg: 1,
    scenario_total_min: 1, scenario_total_max: 1, status: "partial",
  }]);
  fixture.calls.splice(0);
  assert.deepEqual(
    (
      await fixture.fetch({
        ...live,
        requestedAt: new Date("2026-09-11T04:17:47Z"),
      })
    ).data,
    first.data,
  );
  assert.equal(
    fixture.calls.length,
    0,
    "uma ausência já certificada para o cutoff não deve gerar GET a cada pulso",
  );

  await fixture.fetch({
    ...live,
    requestedAt: new Date("2026-09-11T04:18:02Z"),
  });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].granularity, "minute");
  assert.equal(
    fixture.calls[0].to - fixture.calls[0].from,
    2 * 60_000,
    "a nova borda revisa a lacuna anterior junto do minuto recém-fechado",
  );
});

test("média fracionária constante não ultrapassa min/max por arredondamento", async () => {
  const fixture = createFixture((call) => responseFor(call, 0.1));
  const result = await fixture.fetch();
  assert.equal(result.data[0].scenario_total_avg, 0.1);
  assert.doesNotThrow(() => validation.requireOccupancyAggregateRows(result, "day", "scenario-a",
    "America/Sao_Paulo", { ...documented, allowVerifiedCivilAggregateResponse: true }));
});

test("escopo errado, schema inválido e falha de rede não disparam fallback", async () => {
  for (const responder of [
    (call: RuntimeFixture) => ({ ...responseFor(call), scenario_id: "other" }),
    (call: RuntimeFixture) => ({ ...responseFor(call), complete: false }),
    (call: RuntimeFixture) => ({ ...responseFor(call), data: [row("2026-09-11T00:00:00Z", -1)] }),
    () => { throw new Error("network unavailable"); },
  ]) {
    const fixture = createFixture(responder);
    await assert.rejects(fixture.fetch());
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.capabilities.size, 0);
  }
});

test("aborto não publica resultado, mas preserva a incompatibilidade já comprovada", async () => {
  const controller = new AbortController();
  const fixture = createFixture((call) => {
    if (call.granularity === "hour") controller.abort();
    return responseFor(call);
  });
  await assert.rejects(fixture.fetch({ signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual([...fixture.capabilities.values()], [false]);
});

test("fallback longo falha fechado antes de multiplicar chamadas", async () => {
  const fixture = createFixture();
  await assert.rejects(
    fixture.fetch({
      from: new Date(2022, 0, 1),
      granularity: "month",
      maximumFallbackRequests: 0,
      to: new Date(2026, 0, 1),
    }),
    (error: RuntimeFixture) => {
      assert.equal(error.name, "OccupancyCivilFallbackRequestLimitError");
      assert.equal(error.maximumRequests, 0);
      assert.equal(error.plannedRequests, 24);
      return true;
    },
  );
  assert.equal(fixture.calls.length, 1, "somente a sondagem coarse pode chegar à rede");
  assert.equal(fixture.calls[0].granularity, "month");
  assert.deepEqual([...fixture.capabilities.values()], [false]);
});

test("limite de quatro anos é validado antes de consultas e horas são particionadas", async () => {
  const fixture = createFixture();
  await assert.rejects(fixture.fetch({ from: new Date(2020, 0, 1), to: new Date(2026, 0, 1) }), /quatro anos/);
  assert.equal(fixture.calls.length, 0);
  await fixture.fetch({ granularity: "month", from: new Date(2026, 6, 1), to: new Date(2026, 8, 1) });
  const hours = fixture.calls.filter((call) => call.granularity === "hour");
  assert.equal(hours.length, 1);
  assert.ok(hours.every((call) => call.to - call.from <= 62 * 24 * 3_600_000));
});

function checked(response: RuntimeFixture) {
  return validation.requireOccupancyAggregateRows(response, "hour", "scenario-a", "America/Sao_Paulo", documented);
}
function row(bucket: RuntimeFixture, value = 1) {
  return { bucket, scenario_total_avg: value, scenario_total_min: value, scenario_total_max: value };
}
function envelope(granularity: RuntimeFixture, data: RuntimeFixture, scenarioId = "scenario-a"): { granularity: RuntimeFixture; data: RuntimeFixture; scenario_id: string; as_of?: string; timezone?: string } { return { granularity, data, scenario_id: scenarioId }; }
function certifiedEnvelope(
  granularity: RuntimeFixture,
  data: RuntimeFixture,
  overrides: Record<string, RuntimeFixture> = {},
) {
  return {
    ...envelope(
      granularity,
      data.map((item: RuntimeFixture) => ({
        ...item,
        ...(item.area_avg === undefined
          ? {}
          : { area_final: item.area_avg }),
        complete: true,
        ...(item.scenario_total_avg === undefined
          ? {}
          : { scenario_total_final: item.scenario_total_avg }),
        status: "complete",
      })),
    ),
    as_of: "2026-09-12T03:00:00.000Z",
    complete: true,
    status: "complete",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}
function responseFor(call: RuntimeFixture, value = 1) {
  if (call.granularity !== "hour" && call.granularity !== "minute") {
    return envelope(call.granularity, [row(`${call.from.toISOString().slice(0, 10)}T00:00:00Z`, value)], call.scenarioId);
  }
  const data: RuntimeFixture[] = [];
  const step = call.granularity === "hour" ? 3_600_000 : 60_000;
  for (let cursor = call.from.getTime(); cursor < call.to.getTime(); cursor += step) {
    data.push(row(new Date(cursor).toISOString(), value));
  }
  return envelope(call.granularity, data, call.scenarioId);
}
function createFixture(responder = responseFor) {
  const calls: RuntimeFixture[] = [];
  const capabilities = new Map();
  return { calls, capabilities, fetch: (overrides: Record<string, RuntimeFixture> = {}) => civilQuery.fetchOccupancyCivilAggregate({
    scenarioId: "scenario-a", companyScopeId: "company-a", granularity: "day",
    from: new Date(2026, 8, 11), to: new Date(2026, 8, 12), timeZone: "America/Sao_Paulo",
    capabilities, fetchResponse: async (path: string) => {
      const url = new URL(path, "http://fixture.invalid");
      const call = { from: new Date(url.searchParams.get("from")!), to: new Date(url.searchParams.get("to")!),
        granularity: url.searchParams.get("granularity"),
        scenarioId: decodeURIComponent(url.pathname.split("/").at(-2)!) };
      calls.push(call);
      return responder(call);
    }, ...overrides,
  }) };
}
function load(relativePath: string): RuntimeFixture {
  const filename = resolve(projectRoot, relativePath);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded: { exports: RuntimeFixture } = { exports: {} };
  modules.set(filename, loaded);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", source)((id: RuntimeFixture) => id === "@/lib/api"
    ? { apiFetch: () => { throw new Error("Unexpected real API access"); } }
    : id.startsWith("@/") ? load(`${id.slice(2)}.ts`) : require(id), loaded, loaded.exports);
  return loaded.exports;
}
