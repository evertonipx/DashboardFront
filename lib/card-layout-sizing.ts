export const CARD_LAYOUT_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export type CardLayoutLevel = (typeof CARD_LAYOUT_LEVELS)[number];

export type CardLayoutTier =
  | "single"
  | "two-column"
  | "three-column"
  | "desktop";

export type ResolveCardLayoutDimensionsInput = {
  condensed?: boolean;
  containerWidth?: number;
  heightLevel: CardLayoutLevel;
  rowGap?: number;
  rowHeight?: number;
  tier?: CardLayoutTier;
  widthLevel: CardLayoutLevel;
};

export type ResolvedCardLayoutDimensions = {
  columnCount: number;
  columnSpan: number;
  heightLevel: CardLayoutLevel;
  pixelHeight: number;
  rowSpan: number;
  tier: CardLayoutTier;
  widthLevel: CardLayoutLevel;
  widthRatio: number;
};

export const CARD_LAYOUT_DESKTOP_WIDTH_SPANS = [3, 4, 6, 8, 9, 12] as const;
/* A malha fina mantém exatamente as seis alturas históricas e ainda oferece
   um footprint menor, opt-in, para indicadores de conteúdo curto. */
export const CARD_LAYOUT_HEIGHT_ROW_SPANS = [6, 9, 12, 15, 18, 24] as const;
export const CARD_LAYOUT_CONDENSED_ROW_SPAN = 5;
export const CARD_LAYOUT_ROW_HEIGHT = 14;
export const CARD_LAYOUT_ROW_GAP = 16;

const CARD_LAYOUT_TIER_COLUMN_COUNTS: Record<CardLayoutTier, number> = {
  single: 1,
  "two-column": 12,
  "three-column": 12,
  desktop: 12,
};

const CARD_LAYOUT_TIER_WIDTH_SPANS: Record<
  CardLayoutTier,
  readonly [number, number, number, number, number, number]
> = {
  single: [1, 1, 1, 1, 1, 1],
  "two-column": [6, 6, 12, 12, 12, 12],
  "three-column": [4, 4, 8, 8, 12, 12],
  desktop: CARD_LAYOUT_DESKTOP_WIDTH_SPANS,
};

export function isCardLayoutLevel(value: unknown): value is CardLayoutLevel {
  return CARD_LAYOUT_LEVELS.some((level) => level === value);
}

export function normalizeCardLayoutLevel(
  value: unknown,
): CardLayoutLevel | undefined {
  return isCardLayoutLevel(value) ? value : undefined;
}

export function clampCardLayoutLevel(level: CardLayoutLevel): CardLayoutLevel {
  if (level < 1) return 1;
  if (level > 6) return 6;
  return level;
}

export function resolveCardLayoutTier(containerWidth: number): CardLayoutTier {
  if (!Number.isFinite(containerWidth) || containerWidth < 640) return "single";
  if (containerWidth < 960) return "two-column";
  if (containerWidth < 1_040) return "three-column";
  return "desktop";
}

export function resolveCardLayoutWidthSpan(
  level: CardLayoutLevel,
  tier: CardLayoutTier,
) {
  return CARD_LAYOUT_TIER_WIDTH_SPANS[tier][level - 1];
}

export function resolveCardLayoutHeightRowSpan(
  level: CardLayoutLevel,
  condensed = false,
) {
  if (condensed && level === 1) return CARD_LAYOUT_CONDENSED_ROW_SPAN;
  return CARD_LAYOUT_HEIGHT_ROW_SPANS[level - 1];
}

export function resolveCardLayoutHeightPixels(
  level: CardLayoutLevel,
  rowHeight = CARD_LAYOUT_ROW_HEIGHT,
  rowGap = CARD_LAYOUT_ROW_GAP,
) {
  return resolveCardLayoutRowSpanPixels(
    resolveCardLayoutHeightRowSpan(level),
    rowHeight,
    rowGap,
  );
}

export function resolveCardLayoutRowSpanPixels(
  rowSpan: number,
  rowHeight = CARD_LAYOUT_ROW_HEIGHT,
  rowGap = CARD_LAYOUT_ROW_GAP,
) {
  const safeRowSpan = normalizeRowSpan(rowSpan, 1);
  const safeRowHeight = normalizePixelValue(rowHeight, CARD_LAYOUT_ROW_HEIGHT);
  const safeRowGap = normalizePixelValue(rowGap, CARD_LAYOUT_ROW_GAP);
  return safeRowSpan * safeRowHeight + (safeRowSpan - 1) * safeRowGap;
}

export function resolveCardLayoutDimensions({
  condensed = false,
  containerWidth,
  heightLevel,
  rowGap = CARD_LAYOUT_ROW_GAP,
  rowHeight = CARD_LAYOUT_ROW_HEIGHT,
  tier,
  widthLevel,
}: ResolveCardLayoutDimensionsInput): ResolvedCardLayoutDimensions {
  const effectiveTier =
    tier ??
    (containerWidth === undefined
      ? "desktop"
      : resolveCardLayoutTier(containerWidth));
  const columnCount = CARD_LAYOUT_TIER_COLUMN_COUNTS[effectiveTier];
  const columnSpan = resolveCardLayoutWidthSpan(
    widthLevel,
    effectiveTier,
  );
  const rowSpan = resolveCardLayoutHeightRowSpan(heightLevel, condensed);

  return {
    columnCount,
    columnSpan,
    heightLevel,
    pixelHeight: resolveCardLayoutRowSpanPixels(
      rowSpan,
      rowHeight,
      rowGap,
    ),
    rowSpan,
    tier: effectiveTier,
    widthLevel,
    widthRatio: columnSpan / columnCount,
  };
}

function normalizePixelValue(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeRowSpan(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}
