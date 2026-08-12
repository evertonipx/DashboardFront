export const OCCUPANCY_COLOR_PALETTES = [
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Azuis, teal e acentos equilibrados para leitura executiva.",
    colors: [
      "#2563EB",
      "#0F766E",
      "#7C3AED",
      "#C2410C",
      "#0369A1",
      "#A16207",
      "#BE123C",
      "#15803D",
      "#4F46E5",
      "#9333EA",
    ],
  },
  {
    id: "ocean",
    label: "Oceano",
    description: "Azul profundo, ciano e turquesa com progressão serena.",
    colors: [
      "#023E8A",
      "#0077B6",
      "#0096C7",
      "#00B4D8",
      "#48CAE4",
      "#2A9D8F",
      "#264653",
      "#3A86FF",
      "#4361EE",
      "#4CC9F0",
    ],
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Verdes, violetas e azul elétrico para painéis contemporâneos.",
    colors: [
      "#06D6A0",
      "#118AB2",
      "#6C63FF",
      "#8338EC",
      "#3A86FF",
      "#00A896",
      "#5E60CE",
      "#5390D9",
      "#2EC4B6",
      "#7209B7",
    ],
  },
  {
    id: "cyber",
    label: "Cyber",
    description: "Ciano, magenta e neon ácido com estética cyberpunk futurista.",
    colors: [
      "#00E5FF",
      "#FF2A9D",
      "#7C3CFF",
      "#00D68F",
      "#FF6B00",
      "#3D5AFE",
      "#E900FF",
      "#C6FF00",
      "#00B8D9",
      "#FF1744",
    ],
  },
  {
    id: "sunset",
    label: "Pôr do sol",
    description: "Âmbar, coral, rosa e violeta com contraste caloroso.",
    colors: [
      "#F59E0B",
      "#F97316",
      "#EF4444",
      "#E11D48",
      "#DB2777",
      "#9333EA",
      "#7C3AED",
      "#EA580C",
      "#D97706",
      "#BE123C",
    ],
  },
  {
    id: "forest",
    label: "Floresta",
    description: "Verdes naturais, musgo e terra para ambientes e recursos.",
    colors: [
      "#166534",
      "#15803D",
      "#16A34A",
      "#65A30D",
      "#4D7C0F",
      "#0F766E",
      "#115E59",
      "#A16207",
      "#92400E",
      "#3F6212",
    ],
  },
  {
    id: "berry",
    label: "Frutas vermelhas",
    description: "Vinho, magenta e lavanda para comparações expressivas.",
    colors: [
      "#9F1239",
      "#BE123C",
      "#DB2777",
      "#A21CAF",
      "#7E22CE",
      "#6D28D9",
      "#C026D3",
      "#E11D48",
      "#8B5CF6",
      "#D946EF",
    ],
  },
  {
    id: "terracotta",
    label: "Terracota",
    description: "Tons minerais, argila e oliva com aparência editorial.",
    colors: [
      "#9A3412",
      "#C2410C",
      "#B45309",
      "#A16207",
      "#4D7C0F",
      "#0F766E",
      "#B91C1C",
      "#7C2D12",
      "#854D0E",
      "#57534E",
    ],
  },
  {
    id: "pastel",
    label: "Pastel profissional",
    description: "Cores suaves ajustadas automaticamente ao tema do Dashboard.",
    colors: [
      "#5B8DEF",
      "#4FAE9B",
      "#9B72CF",
      "#E28A52",
      "#4A9BC4",
      "#C69A3C",
      "#D46A8C",
      "#73A857",
      "#6E79D6",
      "#B56AC4",
    ],
  },
  {
    id: "high_contrast",
    label: "Alto contraste",
    description: "Separação máxima entre séries para telas densas e operações 24/7.",
    colors: [
      "#0057B8",
      "#00856A",
      "#6F2DBD",
      "#D14900",
      "#00798C",
      "#9C6B00",
      "#C00040",
      "#2E7D32",
      "#3949AB",
      "#8E24AA",
    ],
  },
  {
    id: "colorblind",
    label: "Acessível",
    description: "Combinação diferenciável que evita depender de vermelho e verde.",
    colors: [
      "#0072B2",
      "#E69F00",
      "#56B4E9",
      "#CC79A7",
      "#009E73",
      "#D55E00",
      "#332288",
      "#88CCEE",
      "#AA4499",
      "#DDCC77",
    ],
  },
] as const;

export type OccupancyColorPaletteId =
  (typeof OCCUPANCY_COLOR_PALETTES)[number]["id"];

export const DEFAULT_OCCUPANCY_COLOR_PALETTE_ID: OccupancyColorPaletteId =
  "enterprise";

export function normalizeOccupancyColorPaletteId(
  value: unknown,
): OccupancyColorPaletteId {
  return OCCUPANCY_COLOR_PALETTES.some((palette) => palette.id === value)
    ? (value as OccupancyColorPaletteId)
    : DEFAULT_OCCUPANCY_COLOR_PALETTE_ID;
}

export function getOccupancyColorPalette(value: unknown) {
  const id = normalizeOccupancyColorPaletteId(value);
  return (
    OCCUPANCY_COLOR_PALETTES.find((palette) => palette.id === id) ??
    OCCUPANCY_COLOR_PALETTES[0]
  );
}
