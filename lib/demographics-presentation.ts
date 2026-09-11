import {
  AGE_LABELS,
  GENDER_LABELS,
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
    description: "Rosa e azul para gênero; progressão de azuis para faixas etárias.",
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

// Gender is semantic rather than a generic palette position. The first color
// stays in the rose/coral/lilac family, the second in blue/teal/mint. Labels
// remain explicit: colors reinforce identity, never replace it.
const GENDER_PALETTE_ACCENTS = {
  "pink-blue": ["#DB2777", "#2563EB"],
  enterprise: ["#B85C7A", "#486F9E"],
  ocean: ["#E88078", "#008D9A"],
  aurora: ["#AB7DE0", "#159A8C"],
  cyber: ["#EF4FC8", "#00C5E0"],
  sunset: ["#F08D68", "#5C65C6"],
  forest: ["#A16BA9", "#248373"],
  berry: ["#B72E62", "#537BA5"],
  terracotta: ["#CB776D", "#3B7C8D"],
  pastel: ["#D0ACDD", "#8DCEC2"],
  high_contrast: ["#AD1457", "#005EB8"],
  colorblind: ["#CC79A7", "#0072B2"],
} as const satisfies Record<DemographicPaletteId, readonly [string, string]>;

const GENDER_PALETTE_LABELS = {
  "pink-blue": "Rosa e azul",
  enterprise: "Rosé e marinho",
  ocean: "Coral e turquesa",
  aurora: "Lavanda e esmeralda",
  cyber: "Orquídea e ciano",
  sunset: "Pêssego e índigo",
  forest: "Ameixa e verde-petróleo",
  berry: "Framboesa e denim",
  terracotta: "Terracota e petróleo",
  pastel: "Lilás e menta",
  high_contrast: "Magenta e azul intenso",
  colorblind: "Malva e azul",
} as const satisfies Record<DemographicPaletteId, string>;

export function getDemographicGenderPalette(value: unknown) {
  const [Woman, Man] = GENDER_PALETTE_ACCENTS[getDemographicPalette(value).id];
  return { Woman, Man, unknown: "#8A99AF" } as const;
}

// Age is ordinal: each palette uses one continuous light-to-deep family,
// never the unrelated categorical accents used for emotions or genders.
// Every channel decreases, so luminance preserves age order in both themes.
const AGE_PALETTE_ENDPOINTS = {
  "pink-blue": ["#BFD9F5", "#1E40AF"],
  enterprise: ["#B5D3F0", "#1E3A8A"],
  ocean: ["#A5DFEC", "#075985"],
  aurora: ["#D7C9F5", "#5B21B6"],
  cyber: ["#A5F3FC", "#0E7490"],
  sunset: ["#F9D6A5", "#9A3412"],
  forest: ["#BBE4C6", "#166534"],
  berry: ["#ECC7E4", "#86198F"],
  terracotta: ["#E9C9B5", "#7C2D12"],
  pastel: ["#CDDDF7", "#4B63AD"],
  high_contrast: ["#D7EAF8", "#123A6F"],
  colorblind: ["#BCE1F3", "#005580"],
} as const satisfies Record<DemographicPaletteId, readonly [string, string]>;

const AGE_PALETTE_COLORS = Object.fromEntries(
  DEMOGRAPHICS_PALETTES.map(({ id }) => {
    const [light, deep] = AGE_PALETTE_ENDPOINTS[id];
    const stops = AGE_LABELS.map((_, index) => {
      const weight = index / (AGE_LABELS.length - 1);
      return `#${[1, 3, 5].map((offset) => {
        const start = Number.parseInt(light.slice(offset, offset + 2), 16);
        const end = Number.parseInt(deep.slice(offset, offset + 2), 16);
        return Math.round(start + (end - start) * weight).toString(16).padStart(2, "0");
      }).join("")}`;
    });
    return [id, Object.freeze(stops)];
  }),
) as Record<DemographicPaletteId, readonly string[]>;

export function getDemographicAgePalette(value: unknown): readonly string[] {
  return AGE_PALETTE_COLORS[getDemographicPalette(value).id];
}

/** Labels may adapt to the data; persisted palette IDs never change. */
export function demographicPaletteLabel(
  value: unknown,
  dimension: DemographicDimension,
  encoding: "category" | "intensity" | "period" = "category",
) {
  const palette = getDemographicPalette(value);
  if (encoding === "category" && (dimension === "gender" || dimension === "age-gender")) {
    return GENDER_PALETTE_LABELS[palette.id];
  }
  if (palette.id !== "pink-blue") return palette.label;
  if (encoding === "intensity") return "Azul sequencial";
  if (encoding === "period") return dimension === "gender" ? "Neutros" : "Rosa e neutro";
  return dimension === "age" ? "Azul sequencial" : palette.label;
}

/** Swatches reflect the effective colors of the selected dimension. */
export function demographicPalettePreviewColors(
  palette: DemographicPaletteId,
  dimension: DemographicDimension,
): readonly string[] {
  if (dimension === "gender" || dimension === "age-gender") {
    const colors = getDemographicGenderPalette(palette);
    return GENDER_LABELS.map((key) => colors[key]);
  }
  if (dimension === "age") return getDemographicAgePalette(palette);
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
  if (dimension === "age") {
    const canonicalIndex = (AGE_LABELS as readonly string[]).indexOf(key);
    // Missing/unrecognized age must not look like the youngest bracket.
    return canonicalIndex >= 0 ? getDemographicAgePalette(palette)[canonicalIndex] : "#8A99AF";
  }
  const keys: readonly string[] = EMOTION_LABELS;
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
