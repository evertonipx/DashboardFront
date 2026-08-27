export const OPERATIONAL_TREND_SERIES = {
  average7: {
    color: "#0F766E",
    name: "Média móvel 7 dias",
  },
  average30: {
    color: "#B45309",
    name: "Média móvel 30 dias",
  },
  volume: {
    name: "Volume diário",
  },
} as const;

export const OPERATIONAL_TREND_LEGEND_DATA = [
  OPERATIONAL_TREND_SERIES.volume.name,
  OPERATIONAL_TREND_SERIES.average7.name,
  OPERATIONAL_TREND_SERIES.average30.name,
] as const;
