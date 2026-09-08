import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const insights = loadModule("lib/occupancy-duration-insights.ts");
const duration = loadModule("lib/occupancy-duration.ts");

test("mês de permanência começa no dia 1 IANA, inclui futuro e termina no minuto fechado", () => {
  const month = insights.buildOccupancyDurationInsightMonth(
    new Date("2026-08-02T02:42:37.100Z"), "America/Sao_Paulo",
  );
  assert.equal(month.from.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(month.to.toISOString(), "2026-08-02T02:42:00.000Z");
  assert.equal(month.monthEnd.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(month.dateKeys.length, 31);
  assert.equal(month.dateKeys[0], "2026-08-01");
  assert.equal(month.dateKeys.at(-1), "2026-08-31");
  assert.equal(month.timeZone, "America/Sao_Paulo");
  const leap = insights.buildOccupancyDurationInsightMonth(
    new Date("2024-02-15T12:00:00Z"), "UTC",
  );
  assert.equal(leap.dateKeys.length, 29);
});

test("calendário exclui data civil inexistente e preserva virada de ano", () => {
  const month = insights.buildOccupancyDurationInsightMonth(
    new Date("2011-12-31T04:00:00Z"), "Pacific/Apia",
  );
  assert.equal(month.dateKeys.length, 30);
  assert.equal(month.dateKeys.includes("2011-12-30"), false);
  assert.equal(month.dateKeys.at(-1), "2011-12-31");
  assert.equal(month.monthEnd.toISOString(), "2011-12-31T10:00:00.000Z");
});

test("segmentos cruzando hora e dia mantêm seus estados e segundos", () => {
  const from = Date.parse("2026-09-02T02:58:00Z");
  const summary = minuteSummary(from, ["occupied", "occupied", "transition", "free", "unknown"]);
  const hours = insights.summarizeOccupancyDurationInsightHours(summary, "America/Sao_Paulo");
  assert.equal(hours.length, 2);
  assert.deepEqual(hours[0], {
    dateKey: "2026-09-01", hour: 23, confirmedOccupiedSeconds: 120,
    confirmedFreeSeconds: 0, transitionSeconds: 0, unknownSeconds: 0, expectedSeconds: 120,
  });
  assert.deepEqual(hours[1], {
    dateKey: "2026-09-02", hour: 0, confirmedOccupiedSeconds: 0,
    confirmedFreeSeconds: 60, transitionSeconds: 60, unknownSeconds: 60, expectedSeconds: 180,
  });
  assert.equal(hours.reduce((sum, hour) => sum + hour.expectedSeconds, 0), summary.expectedSeconds);
});

test("hora DST repetida recebe 120 minutos reais e não duplica intensidade", () => {
  const month = insights.buildOccupancyDurationInsightMonth(
    new Date("2026-11-01T08:00:00Z"), "America/New_York",
  );
  const summary = minuteSummary(Date.parse("2026-11-01T04:00:00Z"), Array(240).fill("occupied"));
  const hours = insights.summarizeOccupancyDurationInsightHours(summary, month.timeZone);
  const repeated = hours.find((hour) => hour.hour === 1);
  assert.equal(repeated.expectedSeconds, 7_200);
  assert.equal(repeated.confirmedOccupiedSeconds, 7_200);
  const model = insights.buildOccupancyDurationInsightModel([{ scenarioId: "a", name: "A", hours }], month);
  const cell = model.dayHours.find((cell) => cell.x === 0 && cell.y === 1);
  assert.equal(cell.confirmedOccupiedSeconds / cell.expectedSeconds, 1);
  assert.equal(model.weekHours.find((cell) => cell.x === 6 && cell.y === 1).expectedSeconds, 7_200);
  assert.equal(model.days[0].expectedSeconds, 14_400);
});

test("hora DST pulada não gera duração desconhecida fictícia", () => {
  const month = insights.buildOccupancyDurationInsightMonth(
    new Date("2026-03-08T08:00:00Z"), "America/New_York",
  );
  const summary = minuteSummary(Date.parse("2026-03-08T05:00:00Z"), Array(180).fill("occupied"));
  const hours = insights.summarizeOccupancyDurationInsightHours(summary, month.timeZone);
  assert.deepEqual(hours.map((hour) => hour.hour), [0, 1, 3]);
  const model = insights.buildOccupancyDurationInsightModel([{ scenarioId: "a", name: "A", hours }], month);
  const skipped = model.dayHours.find((cell) => cell.x === 7 && cell.y === 2);
  assert.equal(skipped.expectedSeconds, 0);
  assert.equal(skipped.unknownSeconds, 0);
  assert.equal(model.days[7].expectedSeconds, 10_800);
});

test("mudança DST de meia hora conserva denominador de 90 minutos", () => {
  const summary = minuteSummary(Date.parse("2026-04-04T14:00:00Z"), Array(90).fill("occupied"));
  const hours = insights.summarizeOccupancyDurationInsightHours(summary, "Australia/Lord_Howe");
  assert.equal(hours.length, 1);
  assert.equal(hours[0].dateKey, "2026-04-05");
  assert.equal(hours[0].hour, 1);
  assert.equal(hours[0].expectedSeconds, 5_400);
});

test("partição horária otimizada equivale à projeção de cada minuto em transições IANA", () => {
  const cases = [
    ["America/New_York", "2026-03-08T04:00:00Z", 480],
    ["America/New_York", "2026-11-01T03:00:00Z", 480],
    ["Australia/Lord_Howe", "2026-10-03T13:00:00Z", 360],
    ["Antarctica/Troll", "2026-10-25T00:00:00Z", 360],
    ["Pacific/Apia", "2011-12-30T08:00:00Z", 360],
    ["Asia/Kathmandu", "2026-09-01T00:00:00Z", 180],
  ];
  for (const [timeZone, fromIso, minuteCount] of cases) {
    const from = Date.parse(fromIso);
    const summary = minuteSummary(from, Array(minuteCount).fill("occupied"));
    const actual = insights.summarizeOccupancyDurationInsightHours(summary, timeZone);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    });
    const expected = new Map();
    for (let minute = 0; minute < minuteCount; minute += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(from + minute * 60_000)
        .filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
      const key = `${parts.year}-${parts.month}-${parts.day}|${Number(parts.hour)}`;
      expected.set(key, (expected.get(key) ?? 0) + 60);
    }
    const actualTotals = new Map(actual.map((hour) => [`${hour.dateKey}|${hour.hour}`, hour.expectedSeconds]));
    assert.deepEqual(actualTotals, expected, `${timeZone}: cada minuto pertence à mesma célula civil`);
  }
});

test("ausência, ocupação zero e futuro permanecem distinguíveis", () => {
  const month = insights.buildOccupancyDurationInsightMonth(new Date("2026-09-01T02:30:00Z"), "UTC");
  const summary = minuteSummary(Date.parse("2026-09-01T00:00:00Z"), Array(60).fill("free"));
  const hours = insights.summarizeOccupancyDurationInsightHours(summary, "UTC");
  const model = insights.buildOccupancyDurationInsightModel([{ scenarioId: "a", name: "A", hours }], month);
  const zero = model.dayHours.find((cell) => cell.x === 0 && cell.y === 0);
  const missing = model.dayHours.find((cell) => cell.x === 0 && cell.y === 1);
  const partial = model.dayHours.find((cell) => cell.x === 0 && cell.y === 2);
  const future = model.dayHours.find((cell) => cell.x === 0 && cell.y === 3);
  assert.equal(zero.confirmedFreeSeconds, 3_600);
  assert.equal(zero.unknownSeconds, 0);
  assert.equal(missing.unknownSeconds, 3_600);
  assert.equal(missing.confirmedFreeSeconds, 0);
  assert.equal(partial.unknownSeconds, 1_800);
  assert.equal(future.expectedSeconds, 0);
  assert.equal(future.unknownSeconds, 0);
  assert.equal(model.days[1].expectedSeconds, 0);
  assert.equal(model.dayHours.length, 30 * 24);
  assert.equal(model.weekHours.length, 7 * 24);
  assert.equal(model.scenarioHours.length, 24);
});

test("composições por cenário somam segundos sem confundir transição com permanência", () => {
  const month = insights.buildOccupancyDurationInsightMonth(new Date("2026-09-01T01:00:00Z"), "UTC");
  const from = Date.parse("2026-09-01T00:00:00Z");
  const first = insights.summarizeOccupancyDurationInsightHours(minuteSummary(from, Array(60).fill("occupied")), "UTC");
  const second = insights.summarizeOccupancyDurationInsightHours(minuteSummary(from,
    [...Array(30).fill("transition"), ...Array(30).fill("unknown")]), "UTC");
  const model = insights.buildOccupancyDurationInsightModel([
    { scenarioId: "a", name: "A", hours: first }, { scenarioId: "b", name: "B", hours: second },
  ], month);
  const cell = model.dayHours[0];
  assert.equal(cell.expectedSeconds, 7_200);
  assert.equal(cell.confirmedOccupiedSeconds, 3_600);
  assert.equal(cell.transitionSeconds, 1_800);
  assert.equal(cell.unknownSeconds, 1_800);
  assert.equal(cell.confirmedOccupiedSeconds / cell.expectedSeconds, 0.5);
  assert.equal(model.scenarioHours[0].confirmedOccupiedSeconds, 3_600);
  assert.equal(model.scenarioHours[24].confirmedOccupiedSeconds, 0);
  for (const collection of [model.dayHours, model.weekHours, model.scenarioHours, model.days]) {
    assert.equal(collection.reduce((sum, item) => sum + item.expectedSeconds, 0), 7_200);
    assert.equal(collection.reduce((sum, item) => sum + item.confirmedOccupiedSeconds, 0), 3_600);
  }
});

test("partições da mesma hora se juntam sem perder minutos e excesso é rejeitado", () => {
  const month = insights.buildOccupancyDurationInsightMonth(new Date("2026-09-01T01:00:00Z"), "UTC");
  const from = Date.parse("2026-09-01T00:00:00Z");
  const first = insights.summarizeOccupancyDurationInsightHours(minuteSummary(from, Array(30).fill("occupied")), "UTC");
  const second = insights.summarizeOccupancyDurationInsightHours(minuteSummary(from + 30 * 60_000, Array(30).fill("free")), "UTC");
  const model = insights.buildOccupancyDurationInsightModel([{ scenarioId: "a", name: "A", hours: [...first, ...second] }], month);
  assert.equal(model.dayHours[0].confirmedOccupiedSeconds, 1_800);
  assert.equal(model.dayHours[0].confirmedFreeSeconds, 1_800);
  assert.equal(model.dayHours[0].expectedSeconds, 3_600);
  assert.throws(() => insights.buildOccupancyDurationInsightModel([
    { scenarioId: "a", name: "A", hours: [...first, ...second, ...first] },
  ], month), /excede os minutos fechados/);
});

test("cenário com falha mantém ausência no denominador e nenhuma presença inventada", () => {
  const month = insights.buildOccupancyDurationInsightMonth(new Date("2026-09-01T01:00:00Z"), "UTC");
  const model = insights.buildOccupancyDurationInsightModel([{ scenarioId: "a", name: "A", hours: [], error: "Indisponível" }], month);
  assert.equal(model.dayHours[0].unknownSeconds, 3_600);
  assert.equal(model.dayHours[0].confirmedOccupiedSeconds, 0);
  const empty = insights.buildOccupancyDurationInsightModel([], month);
  assert.ok(empty.dayHours.every((cell) => cell.expectedSeconds === 0));
  assert.equal(empty.scenarioHours.length, 0);
});

test("entradas fora do período, duplicadas ou com estado inválido são rejeitadas", () => {
  const month = insights.buildOccupancyDurationInsightMonth(new Date("2026-09-01T01:00:00Z"), "UTC");
  const hours = insights.summarizeOccupancyDurationInsightHours(
    minuteSummary(Date.parse("2026-09-01T02:00:00Z"), ["occupied"]), "UTC",
  );
  assert.throws(() => insights.buildOccupancyDurationInsightModel([{ scenarioId: "a", name: "A", hours }], month), /excede/);
  assert.throws(() => insights.buildOccupancyDurationInsightModel([
    { scenarioId: "a", name: "A", hours: [] }, { scenarioId: "a", name: "A", hours: [] },
  ], month), /identidades repetidas/);
  assert.throws(() => insights.buildOccupancyDurationInsightMonth(new Date("invalid"), "UTC"), /instante/);
  const summary = minuteSummary(Date.parse("2026-09-01T00:00:00Z"), ["occupied"]);
  summary.segments[0].state = "other";
  assert.throws(() => insights.summarizeOccupancyDurationInsightHours(summary, "UTC"), /estado/);
});

function minuteSummary(from, states) {
  const values = {
    occupied: { average: 2, minimum: 1, peak: 3 },
    free: { average: 0, minimum: 0, peak: 0 },
    transition: { average: 0.5, minimum: 0, peak: 1 },
  };
  const buckets = states.map((_, index) => new Date(from + index * 60_000));
  const metrics = new Map(states.flatMap((state, index) => values[state]
    ? [[from + index * 60_000, values[state]]] : []));
  return duration.buildOccupancyDurationSummary(buckets, metrics);
}

function loadModule(relativePath) {
  if (moduleCache.has(relativePath)) return moduleCache.get(relativePath);
  const filename = resolve(projectRoot, relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const moduleRequire = createRequire(filename);
  const localRequire = (specifier) => specifier.startsWith("@/")
    ? loadModule(`${specifier.slice(2)}.ts`) : moduleRequire(specifier);
  new Function("exports", "require", "module", output)(loadedModule.exports, localRequire, loadedModule);
  moduleCache.set(relativePath, loadedModule.exports);
  return loadedModule.exports;
}
