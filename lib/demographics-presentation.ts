import {
  AGE_LABELS,
  DEMOGRAPHIC_GENDERS,
  EMOTION_LABELS,
} from "@/lib/demographics";
import { OCCUPANCY_COLOR_PALETTES } from "@/lib/occupancy-color-palettes";

export type DemographicDimension =
  | "gender"
  | "age"
  | "emotion"
  | "age-gender"
  | "age-emotion";

export const DEMOGRAPHICS_PALETTES = [
  {
    id: "pink-blue",
    label: "Rosa e azul",
    description: "Rosa, azul e neutro para gênero, com tons complementares nas demais categorias.",
    colors: [
      "#DB2777", "#2563EB", "#8A99AF", "#9D174D", "#1D4ED8",
      "#EC4899", "#0284C7", "#BE185D", "#6366F1", "#0E7490",
    ],
  },
  ...OCCUPANCY_COLOR_PALETTES,
] as const;

export type DemographicPaletteId =
  (typeof DEMOGRAPHICS_PALETTES)[number]["id"];

export type DemographicPresentation = {
  type: "bar" | "stacked" | "pie" | "donut" | "half-donut" | "rose" | "matrix" | "heatmap";
  orientation: "horizontal" | "vertical";
  order: "default" | "ascending" | "descending";
  emojis: boolean;
  palette: DemographicPaletteId;
};

const CARD_DIMENSIONS = {
  demographics_gender_mix: "gender",
  demographics_age_distribution: "age",
  demographics_emotion_distribution: "emotion",
  demographics_age_gender_pyramid: "age-gender",
  demographics_age_emotion_heatmap: "age-emotion",
} as const satisfies Record<string, DemographicDimension>;

export function demographicDimensionForCard(
  id: string,
): DemographicDimension | undefined {
  return Object.prototype.hasOwnProperty.call(CARD_DIMENSIONS, id)
    ? CARD_DIMENSIONS[id as keyof typeof CARD_DIMENSIONS]
    : undefined;
}

export function defaultDemographicPresentation(
  dimension: DemographicDimension,
): DemographicPresentation {
  return {
    type: dimension === "gender"
      ? "stacked"
      : dimension === "age-gender"
        ? "matrix"
        : dimension === "age-emotion"
          ? "heatmap"
          : "bar",
    orientation: "horizontal",
    // Age keeps the canonical youngest-to-oldest sequence; the ranking of
    // emotions keeps its existing largest-to-smallest presentation.
    order: dimension === "emotion" ? "descending" : "default",
    emojis: false,
    palette: "pink-blue",
  };
}

export function getDemographicPalette(value: unknown) {
  return DEMOGRAPHICS_PALETTES.find((palette) => palette.id === value) ??
    DEMOGRAPHICS_PALETTES[0];
}

export function normalizeDemographicPresentation(
  value: unknown,
  dimension: DemographicDimension,
): DemographicPresentation {
  const defaults = defaultDemographicPresentation(dimension);
  const stored = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const distributionType = stored.type === "bar" ||
    stored.type === "stacked" || stored.type === "pie" ||
    stored.type === "donut" || stored.type === "half-donut" ||
    stored.type === "rose";
  return {
    type: dimension === "age-gender" || dimension === "age-emotion"
      ? defaults.type
      : distributionType ? stored.type as DemographicPresentation["type"] : defaults.type,
    orientation: stored.orientation === "horizontal" || stored.orientation === "vertical"
      ? stored.orientation : defaults.orientation,
    order: stored.order === "default" || stored.order === "ascending" || stored.order === "descending"
      ? stored.order : defaults.order,
    emojis: typeof stored.emojis === "boolean" ? stored.emojis : defaults.emojis,
    palette: getDemographicPalette(stored.palette).id,
  };
}

// Gender is semantic rather than a generic palette position. Each theme may
// vary its accents, but never swaps the pink/magenta and blue/cyan meanings.
const GENDER_PALETTE_ACCENTS = {
  "pink-blue": ["#DB2777", "#2563EB"],
  enterprise: ["#BE185D", "#2563EB"],
  ocean: ["#DB2777", "#0077B6"],
  aurora: ["#C026D3", "#118AB2"],
  cyber: ["#FF2A9D", "#00E5FF"],
  sunset: ["#E11D48", "#2563EB"],
  forest: ["#BE185D", "#0369A1"],
  berry: ["#A21CAF", "#2563EB"],
  terracotta: ["#9D174D", "#075985"],
  pastel: ["#D46A8C", "#5B8DEF"],
  high_contrast: ["#C00070", "#0057B8"],
  colorblind: ["#CC79A7", "#0072B2"],
} as const satisfies Record<DemographicPaletteId, readonly [string, string]>;

export function getDemographicGenderPalette(value: unknown) {
  const [Woman, Man] = GENDER_PALETTE_ACCENTS[getDemographicPalette(value).id];
  return { Woman, Man, unknown: "#8A99AF" } as const;
}

/** Swatches reflect the effective colors of the selected dimension. */
export function demographicPalettePreviewColors(
  palette: DemographicPaletteId,
  dimension: DemographicDimension,
): readonly string[] {
  if (dimension === "gender" || dimension === "age-gender") {
    const colors = getDemographicGenderPalette(palette);
    return DEMOGRAPHIC_GENDERS.map((key) => colors[key]);
  }
  return getDemographicPalette(palette).colors;
}

/** Canonical category identity wins over position in a sorted chart. */
export function demographicCategoryColor(
  key: string,
  index: number,
  palette: DemographicPaletteId,
  dimension: DemographicDimension,
) {
  if (dimension === "gender" || dimension === "age-gender") {
    const colors = getDemographicGenderPalette(palette);
    return key === "Woman" ? colors.Woman : key === "Man" ? colors.Man : colors.unknown;
  }
  const keys: readonly string[] = dimension === "age" ? AGE_LABELS : EMOTION_LABELS;
  const canonicalIndex = keys.indexOf(key);
  const originalIndex = canonicalIndex >= 0
    ? canonicalIndex
    : Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  const { colors } = getDemographicPalette(palette);
  return colors[originalIndex % colors.length];
}

const CATEGORY_EMOJIS: Readonly<Record<"gender" | "age" | "emotion", Readonly<Record<string, string>>>> = {
  gender: { Woman: "👩", Man: "👨", unknown: "👤" },
  age: {
    "0-2": "👶", "3-9": "🧒", "10-19": "🧑", "20-29": "🧑",
    "30-39": "🧑", "40-49": "🧑", "50-59": "🧑", "60-69": "🧓", "70+": "🧓",
  },
  emotion: {
    neutral: "😐", happy: "🙂", surprise: "😮", sad: "😢",
    angry: "😠", disgust: "🤢", fear: "😨", contempt: "😒",
  },
};

/** Put optional decoration after the label so right-aligned chart axes keep
 * the symbols aligned and category names remain the first thing to read. */
export function demographicCategoryLabel(
  label: string,
  key: string,
  dimension: DemographicDimension,
  emojis: boolean,
) {
  if (!emojis) return label;
  const category = dimension === "age-gender" ? "gender"
    : dimension === "age-emotion" ? "emotion" : dimension;
  const symbols = CATEGORY_EMOJIS[category];
  const emoji = Object.prototype.hasOwnProperty.call(symbols, key) ? symbols[key] : undefined;
  return emoji ? `${label} ${emoji}` : label;
}
