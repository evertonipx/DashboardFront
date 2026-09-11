import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const modules = new Map();
const raw = load("lib/demographics.ts");
const visible = load("lib/demographics-visible-categories.ts");

test("categorias visíveis excluem unknown sem modificar o contrato bruto", () => {
  assert.deepEqual(visible.DEMOGRAPHIC_VISIBLE_GENDER_KEYS, ["Woman", "Man"]);
  assert.deepEqual(raw.DEMOGRAPHIC_GENDERS, ["Woman", "Man", "unknown"]);
});

test("Mulher 30 / Homem 20 / desconhecido 50 gera composição visível 60% / 40%", () => {
  const summary = aggregate([row("Woman", 30), row("Man", 20), row("unknown", 50)]);
  const before = structuredClone(summary);
  deepFreeze(summary);
  const gender = visible.visibleDemographicDistribution(summary.gender, "gender");
  assert.deepEqual(gender.map(({ key, count, percentage, observed }) => ({ key, count, percentage, observed })), [
    { key: "Woman", count: 30, percentage: 60, observed: true },
    { key: "Man", count: 20, percentage: 40, observed: true },
  ]);
  assert.equal(gender.reduce((sum, item) => sum + item.count, 0), 50);
  assert.equal(summary.total, 100);
  assert.deepEqual(summary, before);
  assert.deepEqual(visible.visibleDemographicDistribution(summary.age, "age"), before.age);
  assert.deepEqual(visible.visibleDemographicDistribution(summary.emotion, "emotion"), before.emotion);
  assert.equal(visible.visibleDemographicCrossing(summary.crossings.ageByEmotion, "age-emotion"), summary.crossings.ageByEmotion);
});

test("arredondamento da composição positiva fecha exatamente em 100% sem alterar contagens", () => {
  for (const [woman, man] of [[1, 2], [1, 6], [7, 17], [1, 99_999], [0, 7], [7, 0], [12_345, 98_765]]) {
    const summary = aggregate([row("Woman", woman), row("Man", man), row("unknown", 999)]);
    const gender = visible.visibleDemographicDistribution(summary.gender, "gender");
    assert.equal(basisPoints(gender), 10_000, `${woman}/${man}`);
    assert.deepEqual(gender.map((item) => item.count), [woman, man]);
    assert.ok(gender.every((item) => item.percentage >= 0 && item.percentage <= 100));
  }
  const third = visible.visibleDemographicDistribution(aggregate([row("Woman", 1), row("Man", 2)]).gender, "gender");
  assert.deepEqual(third.map((item) => item.percentage), [33.33, 66.67]);
});

test("unknown-only e ausência têm base identificada zero, nunca percentuais fabricados", () => {
  for (const rows of [[row("unknown", 40)], []]) {
    const summary = aggregate(rows);
    const gender = visible.visibleDemographicDistribution(summary.gender, "gender");
    assert.deepEqual(gender.map((item) => item.key), ["Woman", "Man"]);
    assert.ok(gender.every((item) => item.count === 0 && item.percentage === null && !item.observed));
    assert.equal(summary.total, rows.length ? 40 : 0);
    if (rows.length) {
      assert.equal(summary.hasData, true, "dados válidos de idade e emoção continuam disponíveis");
      assert.equal(summary.age.find((item) => item.key === "20-29").count, 40);
      assert.equal(summary.emotion.find((item) => item.key === "happy").count, 40);
    }
  }
});

test("zero explicitamente observado continua distinto de categoria nunca observada", () => {
  const summary = aggregate([row("Woman", 0), row("unknown", 40)]);
  const gender = visible.visibleDemographicDistribution(summary.gender, "gender");
  assert.deepEqual(gender.map((item) => [item.key, item.count, item.percentage, item.observed]), [
    ["Woman", 0, null, true], ["Man", 0, null, false],
  ]);
  const crossing = visible.visibleDemographicCrossing(summary.crossings.ageByGender, "age-gender");
  const age = crossing.rows.find((item) => item.key === "20-29");
  assert.equal(crossing.total, 0);
  assert.equal(age.observed, true);
  assert.equal(age.percentage, null);
  assert.deepEqual(age.cells.map((item) => [item.columnKey, item.observed, item.percentage, item.rowPercentage, item.columnPercentage]), [
    ["Woman", true, null, null, null], ["Man", false, null, null, null],
  ]);
  assert.deepEqual(crossing.columnTotals.map((item) => [item.key, item.observed]), [["Woman", true], ["Man", false]]);
});

test("cruzamento remove a coluna e recalcula totais e percentuais de célula, linha e coluna", () => {
  const summary = aggregate([
    row("Woman", 20, "20-29"), row("Man", 10, "20-29"), row("unknown", 40, "20-29"),
    row("Woman", 10, "30-39"), row("Man", 10, "30-39"), row("unknown", 10, "30-39"),
    row("unknown", 12, "70+"),
  ]);
  const before = structuredClone(summary);
  deepFreeze(summary);
  const crossing = visible.visibleDemographicCrossing(summary.crossings.ageByGender, "age-gender");
  assert.deepEqual(crossing.columns.map((column) => column.key), ["Woman", "Man"]);
  assert.equal(crossing.total, 50);
  assert.deepEqual(crossing.columnTotals.map((column) => [column.key, column.count, column.percentage, column.observed]), [
    ["Woman", 30, 60, true], ["Man", 20, 40, true],
  ]);
  const first = crossing.rows.find((item) => item.key === "20-29");
  const second = crossing.rows.find((item) => item.key === "30-39");
  assert.deepEqual([first.count, first.percentage, first.observed], [30, 60, true]);
  assert.deepEqual([second.count, second.percentage, second.observed], [20, 40, true]);
  assert.deepEqual(first.cells.map((cell) => [cell.columnKey, cell.count, cell.percentage, cell.rowPercentage, cell.columnPercentage]), [
    ["Woman", 20, 40, 66.67, 66.67], ["Man", 10, 20, 33.33, 50],
  ]);
  assert.deepEqual(second.cells.map((cell) => [cell.columnKey, cell.count, cell.percentage, cell.rowPercentage, cell.columnPercentage]), [
    ["Woman", 10, 20, 50, 33.33], ["Man", 10, 20, 50, 50],
  ]);
  const unknownOnlyAge = crossing.rows.find((item) => item.key === "70+");
  assert.equal(unknownOnlyAge.count, 0);
  assert.equal(unknownOnlyAge.observed, false);
  assert.ok(unknownOnlyAge.cells.every((cell) => !cell.observed && cell.rowPercentage === null));
  assert.ok(crossing.rows.every((age) => age.cells.length === 2));
  assert.deepEqual(summary, before, "o cruzamento bruto e os demais totais não são alterados");
  assert.equal(summary.total, 112);
});

test("cruzamento unknown-only preserva nove idades com bases nulas e observação conhecida ausente", () => {
  const summary = aggregate([row("unknown", 10)]);
  const crossing = visible.visibleDemographicCrossing(summary.crossings.ageByGender, "age-gender");
  assert.equal(crossing.total, 0);
  assert.deepEqual(crossing.rows.map((item) => item.key), raw.AGE_LABELS);
  assert.ok(crossing.columnTotals.every((item) => item.count === 0 && item.percentage === null && !item.observed));
  assert.ok(crossing.rows.every((item) => item.count === 0 && item.percentage === null && !item.observed));
  assert.ok(crossing.rows.flatMap((item) => item.cells).every((cell) => cell.count === 0 && !cell.observed && cell.percentage === null && cell.rowPercentage === null && cell.columnPercentage === null));
});

test("arredondamento das margens da matriz fecha em 100% com desempate estável", () => {
  const summary = aggregate(raw.AGE_LABELS.flatMap((age, index) => [
    row(index % 2 ? "Man" : "Woman", 1, age), row("unknown", index + 1, age),
  ]));
  const crossing = visible.visibleDemographicCrossing(summary.crossings.ageByGender, "age-gender");
  assert.equal(crossing.total, 9);
  assert.equal(basisPoints(crossing.rows), 10_000);
  assert.equal(basisPoints(crossing.columnTotals), 10_000);
  assert.deepEqual(crossing.rows.map((item) => item.percentage), [11.12, ...Array(8).fill(11.11)]);
  assert.deepEqual(crossing.columnTotals.map((item) => item.percentage), [55.56, 44.44]);
});

test("todos identificados e aplicação repetida preservam contagens, ordem, labels e percentuais", () => {
  const summary = aggregate([row("Woman", 1, "20-29"), row("Man", 2, "30-39")]);
  const gender = visible.visibleDemographicDistribution(summary.gender, "gender");
  assert.deepEqual(gender, summary.gender.filter((item) => item.key !== "unknown"));
  assert.deepEqual(visible.visibleDemographicDistribution(gender, "gender"), gender);
  const crossing = visible.visibleDemographicCrossing(summary.crossings.ageByGender, "age-gender");
  assert.deepEqual(visible.visibleDemographicCrossing(crossing, "age-gender"), crossing);
  assert.deepEqual(crossing.rows.map((item) => [item.key, item.label, item.count, item.percentage]), summary.crossings.ageByGender.rows.map((item) => [item.key, item.label, item.count, item.percentage]));
  assert.deepEqual(crossing.columnTotals, summary.crossings.ageByGender.columnTotals.filter((item) => item.key !== "unknown"));
});

function row(gender, count, age_bucket = "20-29") {
  return { bucket: "2026-09-11T13:00:00Z", camera_id: "fixture-camera", gender, count, age_bucket, emotion: "happy" };
}
function aggregate(rows) { return raw.aggregateDemographicBuckets(rows, { timeZone: "America/Sao_Paulo" }); }
function basisPoints(items) { return items.reduce((sum, item) => sum + Math.round(item.percentage * 100), 0); }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} }; modules.set(path, loaded);
  const javascript = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports, (name) =>
    name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  return loaded.exports;
}
