import { getDemographicPalette, type DemographicPaletteId } from "@/lib/demographics-presentation";

/** Comparison series identify periods, not demographic categories. */
export function demographicComparisonColors(
  palette: DemographicPaletteId,
  dimension: "gender" | "age" | "emotion",
  theme: "light" | "dark" = "light",
): readonly [string, string] {
  if (dimension === "gender") {
    return theme === "dark" ? ["#CBD5E1", "#64748B"] : ["#475569", "#CBD5E1"];
  }
  return [getDemographicPalette(palette).colors[0], "#94A3B8"];
}
