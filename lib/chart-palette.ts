export const PASTEL_BAR_COLORS = [
  "#8EC5FF",
  "#A7E3B3",
  "#FFD6A5",
  "#FFADAD",
  "#CDB4DB",
  "#BDE0FE",
  "#B8E0D2",
  "#FDE68A",
  "#FBCFE8",
  "#C7D2FE",
  "#A5F3FC",
  "#DDD6FE",
] as const;

export function pastelBarColor(index: number) {
  if (index < PASTEL_BAR_COLORS.length) return PASTEL_BAR_COLORS[index];

  const hue = (index * 137.508) % 360;
  return hslToHex(hue, 66, 78);
}

export function monochromeHeatmapPalette(baseColor: string) {
  const source = parseHexColor(baseColor) ?? [18, 103, 196];
  const white: RgbColor = [255, 255, 255];
  const black: RgbColor = [0, 0, 0];

  return [
    mixRgb(source, white, 0.88),
    mixRgb(source, white, 0.7),
    mixRgb(source, white, 0.48),
    mixRgb(source, white, 0.26),
    mixRgb(source, black, 0.02),
    mixRgb(source, black, 0.2),
    mixRgb(source, black, 0.42),
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

function mixRgb(source: RgbColor, target: RgbColor, targetWeight: number) {
  return source.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * targetWeight),
  ) as RgbColor;
}

function rgbToHex(color: RgbColor) {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = normalizedLightness - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, second, 0]
      : hue < 120
        ? [second, chroma, 0]
        : hue < 180
          ? [0, chroma, second]
          : hue < 240
            ? [0, second, chroma]
            : hue < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];

  return `#${toHex(red + match)}${toHex(green + match)}${toHex(blue + match)}`;
}

function toHex(value: number) {
  return Math.round(value * 255).toString(16).padStart(2, "0");
}
