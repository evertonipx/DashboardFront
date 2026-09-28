import assert from "node:assert/strict";
import test from "node:test";

import {
  occupancySeriesColors,
  resolveOccupancyChartPaletteFromColors,
} from "../components/app/occupancy-chart-palette.ts";
import { buildOccupancyDurationInsightReport } from "../components/app/occupancy-duration-insights-widgets.tsx";
import {
  OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID,
  OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
  buildOccupancyLoiteringTemporalChartOption,
  buildOccupancyLoiteringTemporalReportChart,
  buildSharedOccupancyLoiteringTemporalModel,
} from "../components/app/occupancy-loitering-temporal-widgets.tsx";
import { OCCUPANCY_COLOR_PALETTES } from "../lib/occupancy-color-palettes.ts";
import { buildOccupancyDurationInsightMonth } from "../lib/occupancy-duration-insights.ts";
import { buildOccupancyLoiteringSummaryModel } from "../lib/occupancy-loitering.ts";
import { occupancyStatusColorsAreDistinct, occupancyStatusColorsFromPalette } from "../lib/occupancy-widget-settings.ts";
import type { OccupancyScenario } from "../lib/types.ts";

test("ocupado e desocupado usam tons distintos da paleta em todas as visões", () => {
  for (const palette of OCCUPANCY_COLOR_PALETTES) {
    const states = occupancyStatusColorsFromPalette(palette.colors);
    assert.ok(occupancyStatusColorsAreDistinct(states), palette.id);
    assert.ok((palette.colors as readonly string[]).includes(states.occupied), palette.id);
    assert.ok((palette.colors as readonly string[]).includes(states.unoccupied), palette.id);
  }
});

test("séries históricas usam a paleta da visão sem alterar os neutros do tema", () => {
  const configured = OCCUPANCY_COLOR_PALETTES.find((entry) => entry.id === "cyber")!;
  for (const theme of ["light", "dark"] as const) {
    const palette = resolveOccupancyChartPaletteFromColors(
      theme,
      configured.colors,
      configured.colors[0],
    );
    const seriesColors = occupancySeriesColors(
      theme,
      configured.colors,
      configured.colors[0],
    );
    assert.equal(palette.current, seriesColors[0]);
    assert.equal(palette.average, seriesColors[1]);
    assert.notEqual(palette.current, palette.average);
  }
});

test("permanência temporal com duas áreas segue a paleta selecionada", () => {
  const scenario: OccupancyScenario = {
    active: true,
    areas: [
      { area_id: "espera", camera_id: "camera-a", label: "Espera" },
      { area_id: "parado", camera_id: "camera-a", label: "Parado" },
    ],
    company_id: "company-a",
    id: "scenario-a",
    name: "Recepção",
    object_class: "person",
  };
  const period = {
    from: new Date("2026-09-19T21:15:00.000Z"),
    to: new Date("2026-09-19T21:20:00.000Z"),
  };
  const model = buildSharedOccupancyLoiteringTemporalModel({
    model: buildOccupancyLoiteringSummaryModel([scenario], []),
    period,
    sessions: [
      { area: "espera", camera_id: "camera-a", duration_seconds: 20, ended_at: "2026-09-19T21:16:00Z", object_class: "person" },
      { area: "parado", camera_id: "camera-a", duration_seconds: 60, ended_at: "2026-09-19T21:17:00Z", object_class: "person" },
    ],
    timeZone: "America/Sao_Paulo",
  });
  const configured = OCCUPANCY_COLOR_PALETTES.find((entry) => entry.id === "cyber")!;
  const expected = occupancySeriesColors("dark", configured.colors, configured.colors[0]);

  const line = buildOccupancyLoiteringTemporalChartOption(
    OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID,
    model,
    "dark",
    configured.colors[0],
    true,
    configured.colors,
  ) as { series: Array<{ itemStyle?: { color?: string } }> };
  assert.equal(line.series[0]?.itemStyle?.color, expected[0]);
  assert.equal(line.series[1]?.itemStyle?.color, expected[1]);

  const percentiles = buildOccupancyLoiteringTemporalChartOption(
    OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
    model,
    "dark",
    configured.colors[0],
    true,
    configured.colors,
  ) as { series: Array<{ itemStyle?: { color?: string } }> };
  assert.equal(percentiles.series[0]?.itemStyle?.color, configured.colors[0]);
  assert.equal(percentiles.series[1]?.itemStyle?.color, expected[1]);

  const report = buildOccupancyLoiteringTemporalReportChart({
    contextLabel: "19/09/2026",
    kind: OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
    model,
    timeZone: "America/Sao_Paulo",
    viewColors: configured.colors,
    widgetColor: configured.colors[0],
  });
  assert.ok(report);
  const reportSeries = (report.option as {
    series: Array<{ itemStyle?: { color?: string } }>;
  }).series;
  assert.equal(reportSeries[1]?.itemStyle?.color, occupancySeriesColors("light", configured.colors, configured.colors[0])[1]);
});

test("PDF de tempo ocupado preserva ocupado/desocupado na paleta da visão", () => {
  const configured = OCCUPANCY_COLOR_PALETTES.find((entry) => entry.id === "cyber")!;
  const month = buildOccupancyDurationInsightMonth(
    new Date("2026-09-02T06:00:00.000Z"),
    "America/Sao_Paulo",
  );
  const report = buildOccupancyDurationInsightReport({
    kind: "occupancy_duration_daily_profile",
    month,
    series: [{
      hours: [{
        confirmedFreeSeconds: 1800,
        confirmedOccupiedSeconds: 1800,
        dateKey: "2026-09-01",
        expectedSeconds: 3600,
        hour: 0,
        transitionSeconds: 0,
        unknownSeconds: 0,
      }],
      name: "Entrada",
      scenarioId: "scenario-a",
    }],
    viewColors: configured.colors,
    widgetColor: configured.colors[0],
  });
  const colors = occupancySeriesColors("light", configured.colors, configured.colors[0]);
  const reportSeries = (report.option as {
    series: Array<{ itemStyle?: { color?: string } }>;
  }).series;
  assert.equal(reportSeries[0]?.itemStyle?.color, colors[0]);
  assert.equal(reportSeries[1]?.itemStyle?.color, colors[1]);
});
