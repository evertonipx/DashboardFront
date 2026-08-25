import { monochromeHeatmapPalette } from "@/lib/chart-palette";
import type { OccupancyHexDisplayMode } from "@/lib/occupancy-widget-settings";
import {
  type OccupancyHexVisualEntry,
  type OccupancyHexVisualState,
} from "@/lib/occupancy-hex-visual";
/*
 * The real-value mode deliberately derives color from the shared occupancy
 * domain. Capacity remains an alert/tooltip concern and never changes the
 * gradual comparison between cells.
 */

export const OCCUPANCY_HEX_INNER_MAX_RATIO = 0.84;

export type OccupancyHexSurface = {
  border: string;
  fill: string;
};

export type OccupancyHexPalette = {
  canvas: string;
  labelHalo: string;
  labelText: string;
  occupied: string;
  outerShadow: string;
  overCapacity: string;
  overCapacityBorder: string;
  selectedBorder: string;
  surfaces: Record<OccupancyHexVisualState, OccupancyHexSurface>;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
  valueColors: string[];
  zero: string;
};

export type OccupancyHexSemanticColors = {
  occupied: string;
  unoccupied: string;
};

export function getOccupancyHexPalette(
  theme: "dark" | "light",
  widgetColor: string,
  semanticColors?: OccupancyHexSemanticColors,
): OccupancyHexPalette {
  const occupiedColor =
    normalizeHexColor(semanticColors?.occupied) ??
    normalizeHexColor(widgetColor) ??
    "#1267C4";
  const valueBaseColor = normalizeHexColor(widgetColor) ?? "#1267C4";
  const unoccupiedColor =
    normalizeHexColor(semanticColors?.unoccupied) ?? "#10B981";
  if (theme === "dark") {
    const canvas: RgbColor = [11, 17, 28];
    const canvasHex = rgbToHex(canvas);
    const visibleOccupiedColor = ensureGraphicContrast(
      occupiedColor,
      canvasHex,
    );
    const visibleUnoccupiedColor = ensureGraphicContrast(
      unoccupiedColor,
      canvasHex,
    );
    const visibleValueBaseColor = ensureGraphicContrast(
      valueBaseColor,
      canvasHex,
    );
    return {
      canvas: "#0b111c",
      labelHalo: "#0B111C",
      labelText: "#f8fafc",
      occupied: visibleOccupiedColor,
      outerShadow: "rgba(0, 0, 0, 0.22)",
      overCapacity: "#ef4444",
      overCapacityBorder: "#fca5a5",
      selectedBorder: "#7db8ff",
      surfaces: {
        occupied: {
          border: "rgba(51, 65, 85, 1)",
          fill: "#151D2B",
        },
        unavailable: { border: "rgba(245, 158, 11, 0.34)", fill: "#292216" },
        unlinked: { border: "rgba(148, 163, 184, 0.12)", fill: "#111827" },
        unoccupied: {
          border: "rgba(51, 65, 85, 1)",
          fill: "#151D2B",
        },
        unknown: { border: "rgba(148, 163, 184, 0.22)", fill: "#1b2534" },
      },
      tooltipBackground: "#101827",
      tooltipBorder: "rgba(148, 163, 184, 0.22)",
      tooltipText: "#e5edf7",
      valueColors: buildDarkValuePalette(visibleValueBaseColor),
      zero: visibleUnoccupiedColor,
    };
  }

  const canvasHex = "#F6F8FB";
  const visibleOccupiedColor = ensureGraphicContrast(
    occupiedColor,
    canvasHex,
  );
  const visibleUnoccupiedColor = ensureGraphicContrast(
    unoccupiedColor,
    canvasHex,
  );
  const visibleValueBaseColor = ensureGraphicContrast(
    valueBaseColor,
    canvasHex,
  );
  return {
    canvas: "#f6f8fb",
    labelHalo: "#FFFFFF",
    labelText: "#172033",
    occupied: visibleOccupiedColor,
    outerShadow: "rgba(15, 23, 42, 0.07)",
    overCapacity: "#dc2626",
    overCapacityBorder: "#991b1b",
    selectedBorder: widgetColor,
    surfaces: {
      occupied: {
        border: "#CBD5E1",
        fill: "#F8FAFC",
      },
      unavailable: { border: "rgba(217, 119, 6, 0.28)", fill: "#fff9eb" },
      unlinked: { border: "rgba(148, 163, 184, 0.18)", fill: "#fafbfc" },
      unoccupied: {
        border: "#CBD5E1",
        fill: "#F8FAFC",
      },
      unknown: { border: "rgba(100, 116, 139, 0.20)", fill: "#eef2f7" },
    },
    tooltipBackground: "#ffffff",
    tooltipBorder: "#d8e3f2",
    tooltipText: "#13233a",
    valueColors: monochromeHeatmapPalette(visibleValueBaseColor),
    zero: visibleUnoccupiedColor,
  };
}

export function occupancyHexDisplayRadiusRatio(
  visual: Pick<OccupancyHexVisualEntry, "radiusRatio"> | undefined,
  mode: OccupancyHexDisplayMode = "actual",
) {
  if (
    mode === "status" &&
    visual?.radiusRatio !== null &&
    visual?.radiusRatio !== undefined
  ) {
    return OCCUPANCY_HEX_INNER_MAX_RATIO;
  }
  return visual?.radiusRatio === null || visual?.radiusRatio === undefined
    ? null
    : visual.radiusRatio * OCCUPANCY_HEX_INNER_MAX_RATIO;
}

export function occupancyHexValueColor(
  visual: OccupancyHexVisualEntry | undefined,
  palette: OccupancyHexPalette,
  mode: OccupancyHexDisplayMode = "actual",
) {
  if (!visual || visual.radiusRatio === null) return null;
  if (mode === "status") {
    if (visual.state === "occupied") return palette.occupied;
    if (visual.state === "unoccupied") return palette.zero;
    return null;
  }
  if (visual.state !== "occupied" && visual.state !== "unoccupied") return null;

  const normalized = Math.min(1, Math.max(0, visual.valueRatio ?? 0));
  return interpolatePaletteColor(palette.valueColors, normalized);
}

export function occupancyHexTextColor(
  _visual: OccupancyHexVisualEntry | undefined,
  palette: OccupancyHexPalette,
) {
  return palette.labelText;
}

export function interpolatePaletteColor(colors: readonly string[], ratio: number) {
  if (!colors.length) return "#1267C4";
  if (colors.length === 1) return colors[0];
  const normalized = Math.min(1, Math.max(0, ratio));
  const scaled = normalized * (colors.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(colors.length - 1, Math.ceil(scaled));
  if (lowerIndex === upperIndex) return colors[lowerIndex];
  const lower = parseHexColor(colors[lowerIndex]);
  const upper = parseHexColor(colors[upperIndex]);
  if (!lower || !upper) return colors[lowerIndex];
  return rgbToHex(mixRgb(lower, upper, scaled - lowerIndex));
}

function buildDarkValuePalette(widgetColor: string) {
  const base = parseHexColor(widgetColor) ?? [90, 168, 255];
  const canvas: RgbColor = [11, 17, 28];
  const white: RgbColor = [255, 255, 255];
  return [
    mixRgb(base, canvas, 0.64),
    mixRgb(base, canvas, 0.48),
    mixRgb(base, canvas, 0.32),
    mixRgb(base, canvas, 0.16),
    base,
    mixRgb(base, white, 0.14),
    mixRgb(base, white, 0.28),
  ].map(rgbToHex);
}

type RgbColor = [number, number, number];

function parseHexColor(value: string): RgbColor | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

function normalizeHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : null;
}

function mixRgb(source: RgbColor, target: RgbColor, targetWeight: number) {
  return source.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * targetWeight),
  ) as RgbColor;
}

function rgbToHex(color: RgbColor) {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Keeps semantic colors recognizable while meeting non-text graphic contrast. */
export function ensureGraphicContrast(
  color: string,
  background: string,
  minimumRatio = 3,
) {
  const source = parseHexColor(color);
  const backgroundRgb = parseHexColor(background);
  if (!source || !backgroundRgb) return color;
  if (contrastRatio(color, background) >= minimumRatio) return rgbToHex(source);

  const black: RgbColor = [0, 0, 0];
  const white: RgbColor = [255, 255, 255];
  const candidates: Array<{ color: string; distance: number }> = [];
  for (let step = 1; step <= 20; step += 1) {
    const weight = step / 20;
    [black, white].forEach((target) => {
      const mixed = mixRgb(source, target, weight);
      const mixedHex = rgbToHex(mixed);
      if (contrastRatio(mixedHex, background) >= minimumRatio) {
        candidates.push({ color: mixedHex, distance: step });
      }
    });
    if (candidates.length) break;
  }
  return candidates[0]?.color ?? contrastingEndpoint(backgroundRgb);
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string) {
  const rgb = parseHexColor(color);
  if (!rgb) return 0;
  return rgb.reduce((sum, channel, index) => {
    const normalized = channel / 255;
    const linear =
      normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrastingEndpoint(background: RgbColor) {
  const backgroundHex = rgbToHex(background);
  return contrastRatio("#000000", backgroundHex) >=
    contrastRatio("#FFFFFF", backgroundHex)
    ? "#000000"
    : "#FFFFFF";
}
