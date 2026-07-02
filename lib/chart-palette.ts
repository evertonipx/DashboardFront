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
  return PASTEL_BAR_COLORS[index % PASTEL_BAR_COLORS.length];
}
