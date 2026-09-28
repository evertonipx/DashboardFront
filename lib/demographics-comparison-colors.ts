import { getDemographicPalette, type DemographicPaletteId } from "@/lib/demographics-presentation";

/** Comparison series identify periods, not demographic categories. */
export function demographicComparisonColors(
  palette: DemographicPaletteId,
  _dimension: "gender" | "age" | "emotion",
  _theme: "light" | "dark" = "light",
): readonly [string, string] {
  void _theme;
  const colors = getDemographicPalette(palette).colors;
  return [colors[0], colors[1]];
}
