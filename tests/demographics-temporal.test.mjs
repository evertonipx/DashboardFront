import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const { aggregateDemographicBuckets: aggregate, summarizeDemographicBuckets: summarize, combineDemographicAggregations: combine } = load("lib/demographics.ts");
const { buildDemographicTemporalPlan: plan } = load("lib/demographics-temporal.ts");
const zone = "America/Sao_Paulo";
const day = { from: "2026-09-10T03:00:00Z", to: "2026-09-11T03:00:00Z", now: "2026-09-10T15:30:00Z", timeZone: zone };

function row(bucket, count, overrides = {}) {
  return { bucket, count, camera_id: "550e8400-e29b-41d4-a716-446655440000", gender: "Man", age_bucket: "20-29", emotion: "happy", ...overrides };
}

test("agregação horária é opt-in e mantém apenas os totais/marginais de cada hora observada", () => {
  const rows = [row("2026-09-10T03:01:00Z", 4, { gender: "Woman" }), row("2026-09-10T03:59:00Z", 6), row("2026-09-10T04:15:00Z", 0)];
  const original = structuredClone(rows);
  assert.equal(aggregate(rows).temporal, undefined);
  const summary = aggregate(rows, { timeZone: zone });
  assert.equal(summary.total, 10);
  assert.equal(summary.temporal.timeZone, zone);
  assert.equal(summary.temporal.bins.length, 2);
  const [first, zero] = summary.temporal.bins;
  assert.deepEqual(Object.keys(first).sort(), ["age", "emotion", "from", "gender", "total"]);
  assert.equal(first.from, "2026-09-10T03:00:00.000Z");
  assert.equal(first.total, 10);
  assert.deepEqual(first.gender, { Woman: 4, Man: 6, unknown: 0 });
  assert.equal(first.age["20-29"], 10);
  assert.equal(first.emotion.happy, 10);
  assert.equal(zero.total, 0);
  assert.deepEqual(rows, original);
  for (const bin of summary.temporal.bins) {
    for (const dimension of ["gender", "age", "emotion"]) {
      assert.equal(Object.values(bin[dimension]).reduce((sum, value) => sum + value, 0), bin.total);
    }
  }
});

test("summarizer preserva validação no segundo argumento e usa o terceiro para fuso", () => {
  const response = { data: [row("2026-09-10T03:15:00Z", 3)] };
  const summary = summarize(response, { from: day.from, to: day.to }, { timeZone: zone });
  assert.equal(summary.temporal.bins[0].from, "2026-09-10T03:00:00.000Z");
  assert.throws(() => summarize(response, { from: "2026-09-11T03:00:00Z", to: "2026-09-12T03:00:00Z" }, { timeZone: zone }));
});

test("partições disjuntas na mesma hora somam sem mutação; seed vazio legado é identidade", () => {
  const leftRows = [row("2026-09-10T03:01:00Z", 4, { gender: "Woman" })];
  const rightRows = [row("2026-09-10T03:50:00Z", 6), row("2026-09-10T04:10:00Z", 0)];
  const left = aggregate(leftRows, { timeZone: zone });
  const right = aggregate(rightRows, { timeZone: zone });
  const original = structuredClone([left, right]);
  freeze(left);
  freeze(right);
  const merged = combine([aggregate([]), left, right]);
  assert.equal(merged.total, 10);
  assert.deepEqual(merged.temporal, aggregate([...leftRows, ...rightRows], { timeZone: zone }).temporal);
  assert.deepEqual([left, right], original);
  merged.temporal.bins[0].gender.Woman = 999;
  assert.equal(left.temporal.bins[0].gender.Woman, 4);
});

test("legado com dados ou fusos diferentes não fabrica uma série temporal parcial", () => {
  const rows = [row("2026-09-10T03:00:00Z", 5)];
  const zoned = aggregate(rows, { timeZone: zone });
  assert.equal(combine([zoned, aggregate(rows)]).temporal, undefined);
  assert.equal(combine([zoned, aggregate(rows, { timeZone: "Asia/Kathmandu" })]).temporal, undefined);
  assert.ok(combine([aggregate([], { timeZone: zone }), zoned]).temporal);
  assert.throws(() => plan(zoned, { ...day, timeZone: "UTC" }), /fuso/);
  assert.equal(plan(aggregate(rows), day).available, false);
});

test("dia possui 24 horas, diferencia zero observado/ausência e mantém futuros vazios", () => {
  const summary = aggregate([row("2026-09-10T03:01:00Z", 4, { gender: "Woman" }), row("2026-09-10T03:59:00Z", 6), row("2026-09-10T04:15:00Z", 0)], { timeZone: zone });
  const result = plan(summary, day);
  assert.equal(result.interval, "hour");
  assert.equal(result.points.length, 24);
  assert.deepEqual(result.points.map((point) => point.label), Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`));
  assert.equal(result.points[0].total, 10);
  assert.deepEqual(result.points[0].percentages.gender, { Woman: 40, Man: 60, unknown: 0 });
  assert.equal(result.points[1].total, 0);
  assert.equal(result.points[1].observed, true);
  assert.equal(result.points[1].gender.Man, 0);
  assert.equal(result.points[1].percentages.gender, null);
  assert.equal(result.points[2].total, null);
  assert.equal(result.points[2].gender, null);
  assert.equal(result.points[2].observed, false);
  assert.equal(result.points[12].future, false);
  assert.equal(result.points[13].future, true);
  assert.equal(result.hourProfile.length, 24);
  assert.equal(result.hourProfile[0].total, 10);
  assert.equal(result.hourProfile[2].total, null);
});

for (const [timeZone, bucket, expected] of [
  ["Asia/Kolkata", "2026-09-10T04:45:00Z", "2026-09-10T04:30:00.000Z"],
  ["Asia/Kathmandu", "2026-09-10T04:30:00Z", "2026-09-10T04:15:00.000Z"],
  ["Australia/Eucla", "2026-09-10T01:30:00Z", "2026-09-10T01:15:00.000Z"],
]) {
  test(`${timeZone}: hora civil preserva deslocamento de 30/45 minutos`, () => {
    const summary = aggregate([row(bucket, 7)], { timeZone });
    assert.equal(summary.temporal.bins[0].from, expected);
    const result = plan(summary, { from: bucket, to: new Date(Date.parse(bucket) + 2 * 3_600_000), now: "2027-01-01T00:00:00Z", timeZone });
    assert.equal(result.points[0].label, "10:00");
    assert.equal(result.points[0].total, 7);
    assert.equal(result.hourProfile[10].total, 7);
  });
}

test("DST de Nova York: primavera tem 23 horas sem hora inexistente", () => {
  const timeZone = "America/New_York";
  const summary = aggregate([row("2026-03-08T06:15:00Z", 2), row("2026-03-08T07:15:00Z", 3)], { timeZone });
  const result = plan(summary, { from: "2026-03-08T05:00:00Z", to: "2026-03-09T04:00:00Z", now: "2027-01-01T00:00:00Z", timeZone });
  assert.equal(result.points.length, 23);
  assert.ok(!result.points.some((point) => point.label.startsWith("02:")));
  assert.equal(result.points.reduce((sum, point) => sum + (point.total ?? 0), 0), 5);
  assert.equal(result.hourProfile[2].total, null);
});

test("DST de Nova York: outono mantém duas ocorrências da 01h e perfil soma ambas", () => {
  const timeZone = "America/New_York";
  const summary = aggregate([row("2026-11-01T05:30:00Z", 4, { gender: "Woman" }), row("2026-11-01T06:30:00Z", 6)], { timeZone });
  assert.deepEqual(summary.temporal.bins.map((bin) => bin.from), ["2026-11-01T05:00:00.000Z", "2026-11-01T06:00:00.000Z"]);
  const result = plan(summary, { from: "2026-11-01T04:00:00Z", to: "2026-11-02T05:00:00Z", now: "2027-01-01T00:00:00Z", timeZone });
  assert.equal(result.points.length, 25);
  assert.deepEqual(result.points.filter((point) => point.label.startsWith("01:")).map((point) => point.label), ["01:00 UTC-04:00", "01:00 UTC-05:00"]);
  assert.equal(result.hourProfile[1].total, 10);
  assert.deepEqual(result.hourProfile[1].percentages.gender, { Woman: 40, Man: 60, unknown: 0 });
});

test("Lord Howe: transição de 30 minutos usa fronteiras reais sem misturar ocorrências", () => {
  const timeZone = "Australia/Lord_Howe";
  const summary = aggregate([row("2026-04-04T14:45:00Z", 4), row("2026-04-04T15:15:00Z", 6)], { timeZone });
  assert.deepEqual(summary.temporal.bins.map((bin) => bin.from), ["2026-04-04T14:00:00.000Z", "2026-04-04T15:00:00.000Z"]);
  const result = plan(summary, { from: "2026-04-04T13:00:00Z", to: "2026-04-05T13:30:00Z", now: "2027-01-01T00:00:00Z", timeZone });
  assert.equal(result.points.length, 25);
  assert.equal(result.points[2].label, "01:30");
  assert.equal(result.hourProfile[1].total, 10);
  const spring = aggregate([row("2026-10-03T15:45:00Z", 3)], { timeZone });
  assert.equal(spring.temporal.bins[0].from, "2026-10-03T15:30:00.000Z");
  const springPlan = plan(spring, { from: "2026-10-03T13:30:00Z", to: "2026-10-04T13:00:00Z", now: "2027-01-01T00:00:00Z", timeZone });
  assert.equal(springPlan.points.length, 24);
  assert.equal(springPlan.points[2].label, "02:30");
  assert.equal(springPlan.hourProfile[2].total, 3);
});

test("fronteira diária rápida preserva DST à meia-noite e datas puladas da IANA", () => {
  for (const [timeZone, from, to, expected] of [
    [zone, "2018-11-03T03:00:00Z", "2018-11-06T02:00:00Z", ["2018-11-03T03:00:00.000Z", "2018-11-04T03:00:00.000Z", "2018-11-05T02:00:00.000Z"]],
    [zone, "2018-02-17T02:00:00Z", "2018-02-19T03:00:00Z", ["2018-02-17T02:00:00.000Z", "2018-02-18T03:00:00.000Z"]],
    ["Asia/Amman", "2015-10-29T21:00:00Z", "2015-10-31T22:00:00Z", ["2015-10-29T21:00:00.000Z", "2015-10-30T22:00:00.000Z"]],
    ["Pacific/Apia", "2011-12-29T10:00:00Z", "2011-12-31T10:00:00Z", ["2011-12-29T10:00:00.000Z", "2011-12-30T10:00:00.000Z"]],
  ]) {
    const result = plan(aggregate([], { timeZone }), { from, to, timeZone, now: "2027-01-01T00:00:00Z", interval: "day" });
    assert.deepEqual(result.points.map((point) => point.from), expected, timeZone);
  }
});

test("perfil horário e agregação mensal calculam percentuais ponderados pelas contagens", () => {
  const rows = [row("2026-09-10T13:00:00Z", 2, { gender: "Woman" }), row("2026-09-11T13:00:00Z", 98)];
  const summary = aggregate(rows, { timeZone: zone });
  const result = plan(summary, { from: "2026-09-10T03:00:00Z", to: "2026-09-12T03:00:00Z", now: "2027-01-01T00:00:00Z", timeZone: zone, interval: "month" });
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].total, 100);
  assert.deepEqual(result.points[0].percentages.gender, { Woman: 2, Man: 98, unknown: 0 });
  assert.equal(result.hourProfile[10].total, 100);
  assert.equal(result.hourProfile[10].percentages.gender.Woman, 2);
});

test("arredondamento de marginais por bin soma 100 e não usa média de percentuais", () => {
  const summary = aggregate([row("2026-09-10T03:00:00Z", 1, { gender: "Woman" }), row("2026-09-10T03:01:00Z", 1), row("2026-09-10T03:02:00Z", 1, { gender: "unknown" })], { timeZone: zone });
  const percentages = plan(summary, day).points[0].percentages.gender;
  assert.deepEqual(percentages, { Woman: 33.34, Man: 33.33, unknown: 33.33 });
  assert.equal(Object.values(percentages).reduce((sum, value) => sum + Math.round(value * 100), 0), 10_000);
});

test("intervalo automático e limite de pontos promovem hora/dia/mês sem enumerar anos em horas", () => {
  const summary = aggregate([], { timeZone: "UTC" });
  const base = { from: "2024-01-01T00:00:00Z", now: "2027-01-01T00:00:00Z", timeZone: "UTC" };
  assert.equal(plan(summary, { ...base, to: "2024-01-08T00:00:00Z" }).points.length, 168);
  assert.equal(plan(summary, { ...base, to: "2024-01-09T00:00:00Z" }).interval, "day");
  const leap = plan(summary, { ...base, to: "2025-01-01T00:00:00Z" });
  assert.equal(leap.interval, "day");
  assert.equal(leap.points.length, 366);
  const longer = plan(summary, { ...base, to: "2025-01-02T00:00:00Z" });
  assert.equal(longer.interval, "month");
  assert.equal(longer.points.length, 13);
  const promoted = plan(summary, { ...base, to: "2025-01-01T00:00:00Z", interval: "hour", maxPoints: 10 });
  assert.equal(promoted.interval, "month");
  assert.ok(promoted.points.length <= 10);
  const monthHours = plan(summary, { ...base, to: "2024-02-01T00:00:00Z", interval: "hour", maxPoints: 744 });
  assert.equal(monthHours.interval, "hour");
  assert.equal(monthHours.points.length, 744);
});

test("dias sem dados ficam null, zeros observados ficam zero e nenhuma hora do fim exclusivo entra", () => {
  const summary = aggregate([row("2026-09-10T03:05:00Z", 0), row("2026-09-12T03:05:00Z", 5)], { timeZone: zone });
  const result = plan(summary, { ...day, to: "2026-09-13T03:00:00Z", now: "2027-01-01T00:00:00Z", interval: "day" });
  assert.deepEqual(result.points.map((point) => point.total), [0, null, 5]);
  const cropped = plan(summary, { ...day, to: "2026-09-12T03:00:00Z", now: "2027-01-01T00:00:00Z", interval: "day" });
  assert.deepEqual(cropped.points.map((point) => point.total), [0, null]);
});

test("datas e perfil não dependem do fuso do processo/navegador", () => {
  const previous = process.env.TZ;
  const rows = [row("2026-09-10T03:05:00Z", 3)];
  try {
    const snapshots = [];
    for (const hostZone of ["UTC", "Pacific/Honolulu", "Asia/Tokyo"]) {
      process.env.TZ = hostZone;
      snapshots.push(plan(aggregate(rows, { timeZone: zone }), day));
    }
    assert.deepEqual(snapshots[0], snapshots[1]);
    assert.deepEqual(snapshots[0], snapshots[2]);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("muitas linhas do mesmo minuto reutilizam um formatter e não fazem trabalho de fuso por linha", () => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  let created = 0;
  let formatted = 0;
  Intl.DateTimeFormat = function (...args) {
    created += 1;
    const formatter = new NativeDateTimeFormat(...args);
    const formatToParts = formatter.formatToParts.bind(formatter);
    formatter.formatToParts = (...values) => { formatted += 1; return formatToParts(...values); };
    return formatter;
  };
  try {
    const rows = Array.from({ length: 5_000 }, () => row("2026-09-10T03:12:00Z", 1));
    const summary = aggregate(rows, { timeZone: "America/Argentina/Salta" });
    assert.equal(summary.temporal.bins.length, 1);
    assert.equal(summary.temporal.bins[0].total, 5_000);
    assert.equal(created, 1);
    assert.ok(formatted <= 3, `formatToParts executou ${formatted} vezes`);
  } finally { Intl.DateTimeFormat = NativeDateTimeFormat; }
});

test("plano anual frio usa milhares, não dezenas de milhares, de formatações; resolução efetiva reaproveita fronteiras", (context) => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  let formatted = 0;
  Intl.DateTimeFormat = function (...args) {
    const formatter = new NativeDateTimeFormat(...args);
    const formatToParts = formatter.formatToParts.bind(formatter);
    formatter.formatToParts = (...values) => { formatted += 1; return formatToParts(...values); };
    return formatter;
  };
  try {
    const timeZone = "Asia/Taipei";
    const summary = aggregate([], { timeZone });
    const options = { from: "2025-09-10T16:00:00Z", to: "2026-09-10T16:00:00Z", now: "2027-01-01T00:00:00Z", timeZone, maxPoints: 744 };
    const started = performance.now();
    const hourly = plan(summary, { ...options, interval: "hour" });
    const elapsed = performance.now() - started;
    assert.equal(hourly.interval, "day");
    assert.equal(hourly.points.length, 365);
    assert.ok(formatted < 6_000, `primeiro plano: ${formatted} formatações`);
    const before = formatted;
    const daily = plan(summary, { ...options, interval: "day" });
    assert.deepEqual(daily, hourly);
    assert.ok(formatted - before < 400, `fronteiras repetidas: ${formatted - before} formatações`);
    context.diagnostic(`Plano anual frio: ${elapsed.toFixed(1)}ms; reuso hour→day: ${formatted - before} formatações.`);
  } finally { Intl.DateTimeFormat = NativeDateTimeFormat; }
});

function freeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function load(path) {
  if (modules.has(path)) return modules.get(path);
  const loaded = { exports: {} };
  const javascript = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports, (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  modules.set(path, loaded.exports);
  return loaded.exports;
}
