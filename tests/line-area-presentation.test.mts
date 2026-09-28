import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleLoader, type RuntimeFixture } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const echarts: RuntimeFixture = createRequire(import.meta.url)("echarts");
const { applyLineAreaPresentation } = createModuleLoader(projectRoot)<{
  applyLineAreaPresentation: (option: RuntimeFixture) => RuntimeFixture;
}>("lib/line-area-presentation.ts");

function freezeRecursively<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeRecursively);
    Object.freeze(value);
  }
  return value;
}

function assertVisibleArea(series: RuntimeFixture) {
  assert.ok(series.areaStyle, `${series.name}: toda série de linha deve ter área`);
  assert.equal(typeof series.areaStyle.opacity, "number");
  assert.ok(
    series.areaStyle.opacity > 0 && series.areaStyle.opacity <= 1,
    `${series.name}: o preenchimento deve ser visível`,
  );
  assert.notEqual(series.areaStyle.color, "transparent", `${series.name}: a cor da área deve ser visível`);
  assert.notEqual(series.areaStyle.color, "rgba(0,0,0,0)", `${series.name}: a cor RGBA da área deve ser visível`);
}

test("linha de dados sólida recebe área sem mutar valores, aparência ou opção original", () => {
  const option = {
    color: ["#1267C4"],
    legend: { data: ["Entradas"] },
    series: [{
      data: [null, 0, -3, 7],
      itemStyle: { color: "#1267C4" },
      label: { formatter: "VALOR={c}", position: "top", show: true },
      lineStyle: { color: "#1267C4", type: "solid", width: 2 },
      name: "Entradas",
      type: "line",
    }],
    tooltip: { trigger: "axis" },
    xAxis: { data: ["00h", "01h", "02h", "03h"], type: "category" },
    yAxis: { type: "value" },
  };
  const snapshot = structuredClone(option);
  freezeRecursively(option);

  const result = applyLineAreaPresentation(option);

  assert.notEqual(result, option);
  assert.deepEqual(option, snapshot);
  assertVisibleArea(result.series[0]);
  assert.deepEqual(result.series[0].data, [null, 0, -3, 7]);
  assert.equal(result.series[0].stack, undefined);
  assert.equal(result.series[0].name, "Entradas");
  assert.deepEqual(result.series[0].itemStyle, option.series[0].itemStyle);
  assert.deepEqual(result.series[0].lineStyle, option.series[0].lineStyle);
  assert.deepEqual(result.series[0].label, option.series[0].label);
  assert.deepEqual(result.legend, option.legend);
  assert.deepEqual(result.tooltip, option.tooltip);
  assert.deepEqual(result.xAxis, option.xAxis);
  assert.deepEqual(result.yAxis, option.yAxis);
});

test("séries já empilhadas mantêm o stack e ganham áreas individuais", () => {
  const option = {
    legend: { data: ["Mulher", "Homem"] },
    series: [
      { name: "Mulher", type: "line", stack: "demographic-share", data: [47, 55, 0], itemStyle: { color: "#DB2777" }, lineStyle: { color: "#DB2777" } },
      { name: "Homem", type: "line", stack: "demographic-share", data: [53, 45, 100], itemStyle: { color: "#2563EB" }, lineStyle: { color: "#2563EB" } },
    ],
    xAxis: { type: "category", data: ["Seg", "Ter", "Qua"] },
    yAxis: { type: "value" },
  };

  const result = applyLineAreaPresentation(freezeRecursively(option));

  assert.deepEqual(result.series.map((series: RuntimeFixture) => series.stack), ["demographic-share", "demographic-share"]);
  result.series.forEach(assertVisibleArea);
  assert.deepEqual(result.series.map((series: RuntimeFixture) => series.data), option.series.map((series) => series.data));
  assert.deepEqual(result.legend.data, ["Mulher", "Homem"]);
});

test("comparativos independentes recebem áreas sem stack artificial, inclusive referência tracejada", () => {
  const option = {
    legend: { data: ["Período analisado", "Período de comparação"] },
    series: [
      { name: "Período analisado", type: "line", data: [30, 20], lineStyle: { color: "#475569", type: "solid" } },
      { name: "Período de comparação", type: "line", data: [15, 40], lineStyle: { color: "#94A3B8", type: "dashed" } },
    ],
    xAxis: { type: "category", data: ["Mulher", "Homem"] },
    yAxis: { type: "value" },
  };

  const result = applyLineAreaPresentation(freezeRecursively(option));

  assertVisibleArea(result.series[0]);
  assertVisibleArea(result.series[1]);
  assert.ok(result.series.every((series: RuntimeFixture) => series.stack === undefined));
  assert.deepEqual(result.series.map((series: RuntimeFixture) => series.data), [[30, 20], [15, 40]]);
  assert.deepEqual(result.legend, option.legend);
});

test("nomes Média e Base não excluem séries de dados do preenchimento", () => {
  const combined = applyLineAreaPresentation({
    series: [
      { name: "Valor no período", type: "line", data: [8, 9], lineStyle: { type: "solid" } },
      { name: "Média", type: "line", data: [7, 8], lineStyle: { type: "solid" } },
      { name: "Base", type: "line", data: [6, 7], lineStyle: { type: "solid" } },
    ],
    xAxis: { type: "category", data: ["Seg", "Ter"] },
    yAxis: { type: "value" },
  });
  combined.series.forEach(assertVisibleArea);
  assert.deepEqual(combined.series.map((series: RuntimeFixture) => series.name), ["Valor no período", "Média", "Base"]);

  const solo = applyLineAreaPresentation({
    series: [{ name: "Média", type: "line", data: [7, 8], lineStyle: { type: "solid" } }],
    xAxis: { type: "category", data: ["Seg", "Ter"] },
    yAxis: { type: "value" },
  });
  assertVisibleArea(solo.series[0]);
});

test("linhas silenciosas, pontilhadas e de tendência também recebem área", () => {
  const option = {
    series: [
      { name: "Ocupação", type: "line", data: [8, 12], lineStyle: { type: "solid" } },
      { name: "Limite máximo", type: "line", data: [15, 15], silent: true, lineStyle: { type: "solid" } },
      { name: "Referência", type: "line", data: [6, 6], lineStyle: { type: "dashed" } },
      { name: "Mínimo", type: "line", data: [3, 4], lineStyle: { type: "dotted" } },
      { name: "Tendência linear", type: "line", data: [[1, 8], [2, 12]], silent: true, lineStyle: { type: "dashed" } },
    ],
    xAxis: { type: "category", data: ["Seg", "Ter"] },
    yAxis: { type: "value" },
  };

  const result = applyLineAreaPresentation(freezeRecursively(option));

  result.series.forEach(assertVisibleArea);
  assert.ok(result.series.slice(1).every((series: RuntimeFixture) => series.areaStyle.opacity <= 0.25), "limites e tendência devem ter preenchimento discreto");
  assert.deepEqual(result.series.map((series: RuntimeFixture) => series.data), option.series.map((series) => series.data));
  assert.ok(result.series.every((series: RuntimeFixture) => series.stack === undefined));
  assert.deepEqual(result.series.map((series: RuntimeFixture) => series.lineStyle), option.series.map((series) => series.lineStyle));
  assert.deepEqual(result.series.map((series: RuntimeFixture) => series.silent), option.series.map((series) => series.silent));
});

test("gráfico misto conserva barras e ativa áreas antes desativadas nas linhas", () => {
  const option = {
    color: ["#1267C4", "#DB2777", "#2563EB"],
    legend: { data: ["Volume", "Média 7 dias", "Média 30 dias"] },
    series: [
      { name: "Volume", type: "bar", data: [100, 120], itemStyle: { color: "#1267C4" } },
      { name: "Média 7 dias", type: "line", data: [90, 100], areaStyle: { opacity: 0 }, lineStyle: { color: "#DB2777", type: "solid" } },
      { name: "Média 30 dias", type: "line", data: [80, 85], areaStyle: { opacity: 0 }, lineStyle: { color: "#2563EB", type: "dashed" } },
    ],
    xAxis: { type: "category", data: ["Seg", "Ter"] },
    yAxis: { type: "value" },
  };
  const snapshot = structuredClone(option);

  const result = applyLineAreaPresentation(freezeRecursively(option));

  assert.deepEqual(option, snapshot);
  assert.deepEqual(result.series[0], option.series[0]);
  result.series.slice(1).forEach(assertVisibleArea);
  assert.ok(result.series.slice(1).every((series: RuntimeFixture) => series.areaStyle.opacity <= 0.25), "a área não deve encobrir as barras");
  assert.deepEqual(result.series.slice(1).map((series: RuntimeFixture) => series.data), option.series.slice(1).map((series) => series.data));
  assert.deepEqual(result.series.slice(1).map((series: RuntimeFixture) => series.lineStyle), option.series.slice(1).map((series) => series.lineStyle));
  assert.ok(result.series.slice(1).every((series: RuntimeFixture) => series.stack === undefined));
  assert.deepEqual(result.legend, option.legend);
});

test("área transparente anterior é substituída sem perder as demais opções", () => {
  const option = {
    series: {
      name: "Regressão",
      type: "line",
      data: [2, 4],
      silent: true,
      areaStyle: { color: "transparent", opacity: 0, origin: "start" },
      lineStyle: { color: "#64748B", opacity: 0, type: "dotted" },
    },
  };
  const result = applyLineAreaPresentation(freezeRecursively(option));

  assertVisibleArea(result.series);
  assert.equal(result.series.areaStyle.origin, "start");
  assert.deepEqual(result.series.data, option.series.data);
  assert.deepEqual(result.series.lineStyle, option.series.lineStyle);
  assert.equal(result.series.stack, undefined);
  assert.equal(option.series.areaStyle.opacity, 0);
  assert.equal(option.series.areaStyle.color, "transparent");
});

test("áreas nulas, falsas e zeradas são ativadas; área já visível é preservada", () => {
  for (const [name, areaStyle] of [
    ["Nula", null],
    ["Falsa", false],
    ["Zerada", { color: "#AB12CD", opacity: 0 }],
    ["RGBA transparente", { color: "rgba(0,0,0,0)", opacity: 0.9 }],
  ] as const) {
    const option = freezeRecursively({
      series: { name, type: "line", data: [0, 8], areaStyle },
    });
    const result = applyLineAreaPresentation(option);

    assertVisibleArea(result.series);
    assert.deepEqual(result.series.data, option.series.data);
    assert.equal(result.series.stack, undefined);
    assert.equal(option.series.areaStyle, areaStyle);
    assert.equal(applyLineAreaPresentation(result), result, `${name}: aplicação repetida não deve mudar a opção`);
  }

  const visibleOption = freezeRecursively({
    series: { name: "Área existente", type: "line", data: [2, 4], areaStyle: { color: "#2563EB", opacity: 0.4 } },
  });
  const preserved = applyLineAreaPresentation(visibleOption);
  assert.equal(preserved, visibleOption);
  assertVisibleArea(preserved.series);
  assert.deepEqual(preserved.series.data, [2, 4]);
});

test("aplicação repetida não altera opacidade, séries ou dados", () => {
  const option = {
    series: [
      { name: "Entradas", type: "line", data: [null, 0, 5], lineStyle: { color: "#1267C4" } },
      { name: "Média", type: "line", data: [null, 2, 3], lineStyle: { color: "#64748B" } },
    ],
    xAxis: { type: "category", data: ["00h", "01h", "02h"] },
    yAxis: { type: "value" },
  };

  const first = applyLineAreaPresentation(freezeRecursively(option));
  const firstSnapshot = structuredClone(first);
  const second = applyLineAreaPresentation(freezeRecursively(first));

  assert.deepEqual(first, firstSnapshot);
  assert.deepEqual(second, firstSnapshot);
  assert.equal(second.series.length, option.series.length);
  assertVisibleArea(second.series[0]);
  assertVisibleArea(second.series[1]);
  assert.deepEqual(second.series[0].data, [null, 0, 5]);
  assert.deepEqual(second.series[1].data, [null, 2, 3]);
});

test("SSR ECharts desenha área em todas as linhas e mantém zeros e lacunas no modelo", () => {
  const option = {
    animation: false,
    series: [
      { name: "Entradas", type: "line", data: [5, null, 0, -2, 4], itemStyle: { color: "#1267C4" }, lineStyle: { color: "#1267C4", type: "solid" } },
      { name: "Limite", type: "line", data: [3, 3, 3, 3, 3], silent: true, itemStyle: { color: "#64748B" }, lineStyle: { color: "#64748B", type: "dotted" } },
    ],
    xAxis: { type: "category", data: ["A", "B", "C", "D", "E"] },
    yAxis: { type: "value" },
  };
  const inspect = (chartOption: RuntimeFixture) => {
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 480, height: 260 });
    try {
      chart.setOption(chartOption, { notMerge: true });
      const svg: string = chart.renderToSVGString();
      const series = [0, 1].map((index) => {
        const model = chart.getModel().getSeriesByIndex(index);
        const shapes: Record<string, number> = {};
        chart.getViewOfSeriesModel(model).group.traverse((element: RuntimeFixture) => {
          shapes[element.type] = (shapes[element.type] ?? 0) + 1;
        });
        return {
          count: model.getData().count(),
          rawValues: Array.from({ length: 5 }, (_, dataIndex) => model.getRawValue(dataIndex)),
          shapes,
        };
      });
      return { svg, series };
    } finally {
      chart.dispose();
    }
  };

  const plain = inspect(option);
  const filledOption = applyLineAreaPresentation(option);
  filledOption.series.forEach(assertVisibleArea);
  const filled = inspect(filledOption);

  assert.match(filled.svg, /<svg\b/);
  assert.equal(plain.series[0].shapes["ec-polygon"] ?? 0, 0);
  assert.ok((filled.series[0].shapes["ec-polygon"] ?? 0) > 0, "a área precisa existir no renderer real");
  assert.ok((filled.series[1].shapes["ec-polygon"] ?? 0) > 0, "o limite também precisa ter área no renderer real");
  assert.ok((filled.series[1].shapes["ec-polyline"] ?? 0) > 0, "o limite continua desenhado");
  assert.deepEqual(filled.series.map((series) => series.count), [5, 5]);
  assert.deepEqual(filled.series.map((series) => series.rawValues), plain.series.map((series) => series.rawValues));
  assert.notEqual(filled.series[0].rawValues[1], 0, "lacuna não pode virar zero observado");
  assert.equal(filled.series[0].rawValues[2], 0);
  assert.equal(filled.series[0].rawValues[3], -2);
});
