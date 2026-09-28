import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleLoader, type RuntimeFixture } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { applyCountingViewPalette } = createModuleLoader(projectRoot)<{
  applyCountingViewPalette: (
    option: RuntimeFixture,
    colors: readonly string[] | null,
    primary: string,
  ) => RuntimeFixture;
}>("lib/counting-view-palette.ts");

const palette = ["#2563EB", "#0F766E", "#7C3AED", "#C2410C"];

test("uma visão legada sem paleta conserva a opção original", () => {
  const option = { series: [{ data: [1], itemStyle: { color: "#FFADAD" }, type: "bar" }] };
  assert.equal(applyCountingViewPalette(option, null, "#1267C4"), option);
});

test("comparativo anual preserva o destaque da série atual e alinha a legenda", () => {
  const option = {
    color: ["#A7E3B3", "#1267C4"],
    series: [
      { data: [10], itemStyle: { color: "#A7E3B3" }, name: "2025", type: "bar" },
      { data: [20], itemStyle: { color: "#7C3AED" }, name: "2026", type: "bar" },
    ],
    tooltip: { backgroundColor: "#FFFFFF" },
    xAxis: { axisLabel: { color: "#66758A" } },
  };
  const snapshot = structuredClone(option);
  const result = applyCountingViewPalette(option, palette, "#7C3AED");

  assert.deepEqual(option, snapshot, "a opção de origem não deve ser mutada");
  assert.equal(result.series[1].itemStyle.color, "#7C3AED");
  assert.equal(result.series[0].itemStyle.color, "#C2410C");
  assert.deepEqual(result.color, ["#C2410C", "#7C3AED"]);
  assert.deepEqual(result.tooltip, option.tooltip);
  assert.deepEqual(result.xAxis, option.xAxis);
});

test("barras categóricas e setores de pizza usam apenas cores da visão", () => {
  const bar = applyCountingViewPalette({
    series: [{
      data: [
        { itemStyle: { color: "#FFADAD" }, value: 5 },
        { itemStyle: { color: "#CDB4DB" }, value: 7 },
        { itemStyle: { color: "#0F766E" }, value: 12 },
      ],
      type: "bar",
    }],
  }, palette, "#0F766E");
  assert.deepEqual(
    bar.series[0].data.map((point: RuntimeFixture) => point.itemStyle.color),
    ["#7C3AED", "#C2410C", "#0F766E"],
  );
  assert.deepEqual(bar.color, ["#0F766E", "#7C3AED", "#C2410C", "#2563EB"]);

  const pie = applyCountingViewPalette({
    color: ["#FFADAD", "#CDB4DB"],
    series: [{
      data: [{ name: "A", value: 1 }, { name: "B", value: 2 }],
      itemStyle: { borderWidth: 1, color: "#FFADAD" },
      type: "pie",
    }],
  }, palette, "#0F766E");
  assert.deepEqual(pie.color, ["#0F766E", "#7C3AED", "#C2410C", "#2563EB"]);
  assert.deepEqual(pie.series[0].itemStyle, { borderWidth: 1 });
});

test("heatmap mantém ausência de dados e gradiente suave na nova cor", () => {
  const option = {
    series: [{
      data: [{ itemStyle: { color: "#EEF2F6" }, value: [0, 0, null] }],
      type: "heatmap",
    }],
    visualMap: [{
      inRange: { color: ["#FFFFFF", "#1267C4"] },
      outOfRange: { color: ["#EEF2F6"] },
    }],
  };
  const result = applyCountingViewPalette(option, palette, "#0F766E");
  assert.equal(result.series[0], option.series[0]);
  assert.equal(result.visualMap[0].inRange.color.length, 7);
  assert.notEqual(result.visualMap[0].inRange.color.at(-1), "#1267C4");
  assert.deepEqual(result.visualMap[0].outOfRange, option.visualMap[0].outOfRange);
});

test("anotação invisível não consome cor nem fica visível", () => {
  const result = applyCountingViewPalette({
    series: [
      { data: [1], itemStyle: { color: "#A7E3B3" }, type: "bar" },
      { data: [{ value: 2 }], itemStyle: { color: "rgba(0,0,0,0)" }, type: "scatter" },
      { data: [3], itemStyle: { color: "#CDB4DB" }, type: "line" },
    ],
  }, palette, "#2563EB");
  assert.equal(result.series[0].itemStyle.color, "#2563EB");
  assert.equal(result.series[1].itemStyle.color, "rgba(0,0,0,0)");
  assert.equal(result.series[2].itemStyle.color, "#0F766E");
});
