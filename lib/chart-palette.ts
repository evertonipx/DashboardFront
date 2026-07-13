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
