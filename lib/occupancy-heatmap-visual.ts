import { monochromeHeatmapPalette } from "@/lib/chart-palette";

export type OccupancyHeatmapStateColors = {
  future: string;
  noData: string;
  outline: string;
  transition: string;
};

/**
 * Semantic heatmap states stay independent from the user-selected data
 * palette. In particular, missing coverage must never inherit an amber or
 * orange widget color and be mistaken for an operational transition.
 */
export function occupancyHeatmapStateColors(
  theme: "light" | "dark" = "light",
): OccupancyHeatmapStateColors {
  return theme === "dark"
    ? {
        future: "#151B24",
        noData: "#293445",
        outline: "rgba(148, 163, 184, 0.18)",
        transition: "#A16207",
      }
    : {
        future: "#F8FAFC",
        noData: "#E8EDF3",
        outline: "rgba(100, 116, 139, 0.20)",
        transition: "#EAB308",
      };
}

export function buildOccupancyHeatmapVisualMaps(
  widgetColor: string,
  maximum: number,
  theme: "light" | "dark" = "light",
) {
  if (typeof widgetColor !== "string" || !widgetColor.trim()) {
    throw new TypeError("A cor do heatmap de ocupação é inválida.");
  }
  if (typeof maximum !== "number" || !Number.isFinite(maximum) || maximum < 0) {
    throw new RangeError("A escala do heatmap de ocupação é inválida.");
  }
  const stateColors = occupancyHeatmapStateColors(theme);

  return [
    {
      pieces: [{ color: stateColors.noData, value: -1 }],
      seriesIndex: 0,
      show: false,
      type: "piecewise" as const,
    },
    {
      calculable: true,
      inRange: { color: occupancyHeatmapPalette(widgetColor, theme) },
      itemHeight: 210,
      itemWidth: 10,
      left: "center",
      max: Math.max(1, maximum),
      min: 0,
      orient: "horizontal" as const,
      precision: 1,
      seriesIndex: 1,
      text: ["Maior ocupação", "Menor ocupação"],
      textGap: 8,
      textStyle: {
        color: theme === "dark" ? "#CBD5E1" : "#526477",
        fontSize: 10,
      },
      bottom: 4,
    },
  ];
}

export function occupancyHeatmapPalette(
  widgetColor: string,
  theme: "light" | "dark" = "light",
) {
  return monochromeHeatmapPalette(widgetColor, theme);
}
