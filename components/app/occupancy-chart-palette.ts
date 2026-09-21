import {
  getOccupancyColorPalette,
  type OccupancyColorPaletteId,
} from "@/lib/occupancy-color-palettes";
import { ensureGraphicContrast } from "@/lib/occupancy-hex-palette";

export type OccupancyChartTheme = "light" | "dark";

export type OccupancyChartPalette = {
  average: string;
  axisLine: string;
  axisText: string;
  current: string;
  gridLine: string;
  legendText: string;
  maximumLimit: string;
  minimumLimit: string;
  previousAverage: string;
  previousRangeBorder: string;
  previousRangeFill: string;
  rangeEmphasis: string;
  rangeEnd: string;
  rangeStart: string;
  shadow: string;
  surface: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
};

export function getOccupancyChartPalette(
  theme: OccupancyChartTheme,
): OccupancyChartPalette {
  if (theme === "dark") {
    return {
      average: "#5EEAD4",
      axisLine: "#334155",
      axisText: "#A8B3C7",
      current: "#60A5FA",
      gridLine: "#273244",
      legendText: "#CBD5E1",
      maximumLimit: "#FF6B7D",
      minimumLimit: "#FDA4AF",
      previousAverage: "#CBD5E1",
      previousRangeBorder: "rgba(203, 213, 225, 0.34)",
      previousRangeFill: "rgba(148, 163, 184, 0.17)",
      rangeEmphasis: "#60A5FA",
      rangeEnd: "#7DD3FC",
      rangeStart: "#2563EB",
      shadow: "rgba(96, 165, 250, 0.08)",
      surface: "#131316",
      tooltipBackground: "#0F172A",
      tooltipBorder: "#334155",
      tooltipText: "#E2E8F0",
    };
  }

  return {
    average: "#0F766E",
    axisLine: "#D8E3F2",
    axisText: "#66758A",
    current: "#1267C4",
    gridLine: "#E8EEF6",
    legendText: "#526477",
    maximumLimit: "#9F1D35",
    minimumLimit: "#C94A5F",
    previousAverage: "#667085",
    previousRangeBorder: "rgba(102, 112, 133, 0.34)",
    previousRangeFill: "rgba(102, 112, 133, 0.13)",
    rangeEmphasis: "#0B4A82",
    rangeEnd: "#4C95D9",
    rangeStart: "#124E91",
    shadow: "rgba(18, 78, 145, 0.05)",
    surface: "#FFFFFF",
    tooltipBackground: "#FFFFFF",
    tooltipBorder: "#D8E3F2",
    tooltipText: "#13233A",
  };
}

/**
 * Applies a user-selected categorical palette to the data series while
 * retaining the theme-owned canvas, axes, grid, tooltip and comparison
 * neutrals. Every selected series color is corrected against the chart
 * surface so even dark palettes remain readable in both themes.
 */
export function resolveOccupancyChartPalette(
  theme: OccupancyChartTheme,
  colorPaletteId: OccupancyColorPaletteId,
  primaryOverride?: string | null,
): OccupancyChartPalette {
  const base = getOccupancyChartPalette(theme);
  const colors = getOccupancyColorPalette(colorPaletteId).colors;
  const seriesColor = (index: number) =>
    ensureGraphicContrast(colors[index % colors.length], base.surface);
  const normalizedOverride = normalizeHexColor(primaryOverride);
  const current = ensureGraphicContrast(
    normalizedOverride ?? colors[0],
    base.surface,
  );

  return {
    ...base,
    average: seriesColor(1),
    current,
    maximumLimit: seriesColor(6),
    minimumLimit: seriesColor(5),
    rangeEmphasis: seriesColor(4),
    rangeEnd: seriesColor(3),
    rangeStart: seriesColor(2),
    shadow: colorWithAlpha(current, theme === "dark" ? 0.12 : 0.07),
  };
}

/** @deprecated Use {@link resolveOccupancyChartPalette}. */
export const getConfiguredOccupancyChartPalette =
  resolveOccupancyChartPalette;

function normalizeHexColor(value?: string | null) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : null;
}

function colorWithAlpha(color: string, alpha: number) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return color;
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );
  return `rgba(${channels.join(", ")}, ${alpha})`;
}
