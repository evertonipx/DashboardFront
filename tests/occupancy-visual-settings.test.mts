import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getOccupancyChartPalette,
  resolveOccupancyChartPalette,
} from "../components/app/occupancy-chart-palette.ts";
import { OCCUPANCY_COLOR_PALETTES } from "../lib/occupancy-color-palettes.ts";
import { contrastRatio } from "../lib/occupancy-hex-palette.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const theme of ["light", "dark"] as const) {
  test(`paletas de Ocupação preservam o tema e mantêm contraste no modo ${theme}`, () => {
    const base = getOccupancyChartPalette(theme);

    for (const option of OCCUPANCY_COLOR_PALETTES) {
      const palette = resolveOccupancyChartPalette(theme, option.id);

      assert.equal(palette.axisLine, base.axisLine, option.id);
      assert.equal(palette.axisText, base.axisText, option.id);
      assert.equal(palette.gridLine, base.gridLine, option.id);
      assert.equal(palette.legendText, base.legendText, option.id);
      assert.equal(palette.surface, base.surface, option.id);
      assert.equal(palette.tooltipBackground, base.tooltipBackground, option.id);
      assert.equal(palette.tooltipBorder, base.tooltipBorder, option.id);
      assert.equal(palette.tooltipText, base.tooltipText, option.id);
      assert.equal(palette.previousAverage, base.previousAverage, option.id);
      assert.equal(palette.previousRangeFill, base.previousRangeFill, option.id);

      for (const color of [
        palette.average,
        palette.current,
        palette.maximumLimit,
        palette.minimumLimit,
        palette.rangeEmphasis,
        palette.rangeEnd,
        palette.rangeStart,
      ]) {
        assert.ok(
          contrastRatio(color, palette.surface) >= 3,
          `${option.id}: ${color} precisa contrastar com ${palette.surface}`,
        );
      }
    }
  });
}

test("cor primária válida prevalece e override inválido volta à paleta", () => {
  const custom = resolveOccupancyChartPalette("light", "cyber", "#7C3CFF");
  const fallback = resolveOccupancyChartPalette("light", "cyber", "invalid");
  const paletteDefault = resolveOccupancyChartPalette("light", "cyber");

  assert.notEqual(custom.current, paletteDefault.current);
  assert.equal(fallback.current, paletteDefault.current);
  assert.ok(contrastRatio(custom.current, custom.surface) >= 3);
});

test("hook visual é sincronizado pelo user-grid e não possui transporte operacional", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/use-occupancy-widget-settings.ts"),
    "utf8",
  );

  assert.match(source, /export function useOccupancyWidgetSettings/);
  assert.match(source, /loadOccupancyWidgetSettings/);
  assert.match(source, /saveOccupancyWidgetSettings/);
  assert.match(source, /OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT/);
  assert.match(source, /USER_GRID_HYDRATED_EVENT/);
  assert.match(source, /window\.addEventListener\("storage"/);
  assert.match(source, /window\.removeEventListener\("storage"/);
  assert.doesNotMatch(source, /apiFetch|fetch\(|XMLHttpRequest|setInterval|setTimeout/);
});
