import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { buildOccupancyAnnualReport } from "../lib/occupancy-annual-report.ts";

const require = createRequire(import.meta.url);
const widgets = require("../components/app/occupancy-annual-report-widgets.tsx") as
  typeof import("../components/app/occupancy-annual-report-widgets.tsx");

const model = buildOccupancyAnnualReport({
  currentAt: new Date("2026-09-29T15:00:00Z"),
  monthlyPoints: [2026, 2025, 2024, 2023].map((year, index) => ({
    average: 8 - index * 2,
    minimum: 0,
    month: 1,
    peak: 12 - index * 2,
    year,
  })),
  selectedYear: 2026,
  timeZone: "America/Sao_Paulo",
});

test("comparativo mostra Jan–Dez e quatro anos no mesmo gráfico, sem empilhar médias", () => {
  const option = widgets.buildAnnualMonthlyComparisonOption(model, {
    axisLine: "#aaaaaa",
    axisText: "#333333",
    gridLine: "#dddddd",
    legendText: "#222222",
    series: ["#111111", "#222222", "#333333", "#444444"],
    surface: "#ffffff",
    tooltipBackground: "#ffffff",
    tooltipBorder: "#dddddd",
    tooltipText: "#111111",
  });
  const categories = option.xAxis as { data: string[] };
  const series = option.series as Array<{
    data: Array<number | null>;
    label?: { rotate?: number; show?: boolean };
    name: string;
    stack?: string;
    type: string;
  }>;
  assert.equal(categories.data.length, 12);
  assert.deepEqual(series.map((item) => item.name), ["2026", "2025", "2024", "2023"]);
  assert.ok(series.every((item) => item.label?.show && item.label.rotate === 45));
  assert.deepEqual(series.map((item) => item.data[0]), [8, 6, 4, 2]);
  assert.ok(series.every((item) => item.type === "bar" && !item.stack));
  assert.ok(series.every((item) => item.data.slice(1).every((value) => value === null)));
});

test("os três widgets exportam gráficos e tabelas com a mesma série mensal", () => {
  const assets = widgets.buildOccupancyAnnualReportAssets({
    colorPaletteId: "enterprise",
    model,
  });
  assert.deepEqual(assets.map((asset) => asset.cardId), [
    "occupancy_annual_monthly_comparison",
    "occupancy_annual_month_heatmap",
    "occupancy_annual_year_summary",
  ]);
  assert.equal(assets[0].chart.table.rows.length, 4);
  assert.equal(assets[1].chart.table.rows.length, 4);
  assert.equal(assets[2].chart.table.rows.length, 4);
  assert.ok(assets[1].chart.option.visualMap, "heatmap exportado precisa do visualMap");
});

test("o comparativo e PDF exibem todos os anos e o mês corrente com indicação parcial", () => {
  const expanded = buildOccupancyAnnualReport({
    currentAt: new Date("2026-09-29T15:00:00Z"),
    monthlyPoints: [
      { average: 3, minimum: 0, month: 8, peak: 5, year: 2019 },
      { average: 11, minimum: 0, month: 9, peak: 15, year: 2026 },
    ],
    selectedYear: 2026,
    startYear: 2019,
    timeZone: "America/Sao_Paulo",
  });
  const assets = widgets.buildOccupancyAnnualReportAssets({ colorPaletteId: "enterprise", model: expanded });
  const option = assets[0].chart.option;
  const series = option.series as Array<{ data: Array<number | null>; itemStyle: { color: string }; label: { formatter: (value: object) => string } }>;
  assert.equal(series.length, 8);
  assert.equal((option.legend as { type: string }).type, "scroll");
  assert.ok(series.every((item) => /^#/.test(item.itemStyle.color)));
  assert.equal(series[0].data[8], 11);
  assert.equal(series[0].label.formatter({ dataIndex: 8, value: 11 }), "11*");
  assert.equal(assets[0].chart.table.rows.length, 2);
  assert.equal(assets[1].chart.table.rows.length, 2);
  assert.equal(assets[2].chart.table.rows.length, 8);
  assert.equal((assets[2].chart.table.rows[0] as { peak: number }).peak, 15);
});
