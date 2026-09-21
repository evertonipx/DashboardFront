import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatOccupancyCount,
  formatOccupancyIntegerAxisTick,
  growOccupancyComparisonAxisMaximum,
  occupancyComparisonAxisScopeKey,
  updateOccupancyComparisonAxisMemory,
} from "../lib/occupancy-current-comparison-axis.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("teto da comparação atual é inteiro, monotônico e cresce somente com um pico maior", () => {
  const firstPeak = growOccupancyComparisonAxisMaximum(1, [0, 4, 2, null]);
  const lowerRefresh = growOccupancyComparisonAxisMaximum(firstPeak, [0, 1, 3]);
  const higherRefresh = growOccupancyComparisonAxisMaximum(lowerRefresh, [7]);

  assert.equal(firstPeak, 4);
  assert.equal(lowerRefresh, 4);
  assert.equal(higherRefresh, 7);
  assert.equal(
    growOccupancyComparisonAxisMaximum(higherRefresh, [Number.NaN, -1]),
    7,
  );
  assert.equal(growOccupancyComparisonAxisMaximum(1, [4.2]), 5);
});

test("memória preserva o pico no mesmo conjunto e reinicia ao trocar o escopo", () => {
  const firstScope = occupancyComparisonAxisScopeKey(["scenario-b", "scenario-a"]);
  const reorderedScope = occupancyComparisonAxisScopeKey([
    "scenario-a",
    "scenario-b",
  ]);
  const otherScope = occupancyComparisonAxisScopeKey(["scenario-c"]);
  const initial = updateOccupancyComparisonAxisMemory(
    { maximum: 1, scopeKey: "" },
    firstScope,
    [9, 2],
  );
  const lowerRefresh = updateOccupancyComparisonAxisMemory(
    initial,
    reorderedScope,
    [3],
  );
  const switchedScope = updateOccupancyComparisonAxisMemory(
    lowerRefresh,
    otherScope,
    [2],
  );

  assert.equal(firstScope, reorderedScope);
  assert.equal(initial.maximum, 9);
  assert.strictEqual(lowerRefresh, initial);
  assert.deepEqual(switchedScope, { maximum: 2, scopeKey: otherScope });
});

test("ocupação é apresentada como contagem inteira e o eixo rejeita ticks fracionários", () => {
  assert.equal(formatOccupancyCount(0), "0");
  assert.equal(formatOccupancyCount(12), "12");
  assert.equal(formatOccupancyIntegerAxisTick(0), "0");
  assert.equal(formatOccupancyIntegerAxisTick(5), "5");
  assert.equal(formatOccupancyIntegerAxisTick(0.5), "");
  assert.equal(formatOccupancyIntegerAxisTick("2.5"), "");
});

test("barras horizontal e vertical usam escala discreta estável sem perder o zero certificado", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const horizontalStart = source.indexOf(
    "function buildCurrentComparisonBarOption",
  );
  const verticalStart = source.indexOf(
    "function buildCurrentComparisonVerticalBarOption",
  );
  const buildersEnd = source.indexOf("function halfDonutEntryColor", verticalStart);
  const horizontal = source.slice(horizontalStart, verticalStart);
  const vertical = source.slice(verticalStart, buildersEnd);

  assert.ok(horizontalStart >= 0 && verticalStart > horizontalStart);
  assert.ok(buildersEnd > verticalStart);
  for (const builder of [horizontal, vertical]) {
    assert.match(builder, /growOccupancyComparisonAxisMaximum/);
    assert.match(builder, /formatter: formatOccupancyIntegerAxisTick/);
    assert.match(builder, /minInterval: 1/);
    assert.match(builder, /filter\(\(entry\) => entry\.chartValue === 0\)/);
  }
  assert.match(source, /const \[rememberedAxisMemory, setRememberedAxisMemory\]/);
  assert.match(source, /rememberedAxisMemory\.scopeKey === axisScopeKey/);
  assert.match(source, /Todos desocupados · 0/);
});

test("ranking ao vivo usa somente rótulos, tooltips e ticks inteiros", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const start = source.indexOf("function buildLiveBarRaceOption");
  const end = source.indexOf("function buildMaximumLineSeries", start);
  const builder = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(builder, /formatOccupancyCount\(value\)/);
  assert.match(builder, /formatter: formatOccupancyIntegerAxisTick/);
  assert.match(builder, /minInterval: 1/);
  assert.doesNotMatch(builder, /formatChartNumber\(value\)/);
});
