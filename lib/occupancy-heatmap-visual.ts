import { monochromeHeatmapPalette } from "@/lib/chart-palette";

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

  return [
    {
      pieces: [
        { color: theme === "dark" ? "#273244" : "#E2E8F0", value: -1 },
      ],
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
