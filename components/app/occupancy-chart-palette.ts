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
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
};

export function getOccupancyChartPalette(
  theme: OccupancyChartTheme,
): OccupancyChartPalette {
  if (theme === "dark") {
    return {
      average: "#FFFFFF",
      axisLine: "#334155",
      axisText: "#A8B3C7",
      current: "#FFFFFF",
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
      tooltipBackground: "#0F172A",
      tooltipBorder: "#334155",
      tooltipText: "#E2E8F0",
    };
  }

  return {
    average: "#FFFFFF",
    axisLine: "#D8E3F2",
    axisText: "#66758A",
    current: "#FFFFFF",
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
    tooltipBackground: "#FFFFFF",
    tooltipBorder: "#D8E3F2",
    tooltipText: "#13233A",
  };
}
