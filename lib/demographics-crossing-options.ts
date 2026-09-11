import type { EnterpriseChartOption } from "@/components/app/echart";
import type { DemographicAggregation, DemographicCrossing } from "@/lib/demographics";
import {
  demographicCategoryColor,
  demographicCategoryLabel,
  getDemographicPalette,
  normalizeDemographicPresentation,
  type DemographicPaletteId,
  type DemographicPresentation,
} from "@/lib/demographics-presentation";
import { visibleDemographicCrossing } from "@/lib/demographics-visible-categories";

type CrossingDimension = "age-gender" | "age-emotion";
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat("pt-BR");

/** Configures presentation without mutating the aggregation. Gender shares
 * use identified detections; emotion shares preserve the complete population. */
export function buildDemographicCrossingOption(
  summary: DemographicAggregation,
  settings: DemographicPresentation,
  dimension: CrossingDimension,
  theme: "light" | "dark" = "light",
): EnterpriseChartOption {
  const presentation = normalizeDemographicPresentation(settings, dimension);
  const crossing = visibleDemographicCrossing(dimension === "age-gender"
    ? summary.crossings.ageByGender : summary.crossings.ageByEmotion, dimension);
  const ordered = crossing.rows.map((row, originalIndex) => ({ row, originalIndex }));
  if (presentation.order !== "default") {
    const direction = presentation.order === "ascending" ? 1 : -1;
    ordered.sort((left, right) => direction * (left.row.count - right.row.count) || left.originalIndex - right.originalIndex);
  }
  const rows = ordered.map(({ row }) => row);
  const matrix = dimension === "age-gender";
  const dark = theme === "dark";
  const textColor = dark ? "#CBD5E1" : "#526477";
  const borderColor = dark ? "rgba(226, 232, 240, 0.12)" : "rgba(15, 23, 42, 0.09)";
  const columnLabels = crossing.columns.map((column) =>
    demographicCategoryLabel(column.label, column.key, dimension, presentation.emojis));
  const colors = crossing.columns.map((column, index) =>
    demographicCategoryColor(column.key, index, presentation.palette, dimension));
  const dataForColumn = (columnIndex: number) => rows.map((row, rowIndex) => {
    const cell = row.cells.find((candidate) => candidate.columnKey === crossing.columns[columnIndex].key);
    return [columnIndex, rowIndex, cell?.percentage ?? null, cell?.count ?? null];
  });
  const data = crossing.columns.flatMap((_, index) => dataForColumn(index));
  const maximum = Math.max(1, ...data.map((cell) => typeof cell[2] === "number" ? cell[2] : 0));
  const heatColors = demographicHeatmapColors(presentation.palette, theme);
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: false },
      description: matrix
        ? "Faixas etárias nas linhas e gêneros nas colunas. Os percentuais representam a participação entre gêneros identificados; as cores identificam o gênero."
        : "Faixas etárias nas linhas e emoções nas colunas. Os percentuais representam a participação no total de detecções; cores mais intensas indicam maior participação.",
    },
    grid: { bottom: matrix ? 4 : 44, containLabel: false, outerBoundsMode: "same", outerBoundsContain: "axisLabel", left: 4, right: 8, top: 8 },
    legend: { show: false },
    tooltip: {
      formatter: (parameters: unknown) => crossingTooltip(parameters, rows, crossing.columns, dimension),
      position: "top",
      trigger: "item",
    },
    visualMap: matrix ? crossing.columns.map((_, index) => ({
      dimension: 2,
      pieces: [{ lte: 0, color: "transparent" }, { gt: 0, color: colors[index] }],
      seriesIndex: index,
      outOfRange: { color: "transparent" },
      show: false,
      type: "piecewise",
    })) : {
      calculable: false,
      bottom: 0,
      dimension: 2,
      inRange: { color: heatColors },
      itemHeight: 120,
      itemWidth: 8,
      left: "center",
      max: maximum,
      min: 0,
      orient: "horizontal",
      seriesIndex: 0,
      text: [`${percentFormat.format(maximum)}%`, "0%"],
      textGap: 8,
      textStyle: { color: textColor, fontSize: 10 },
    },
    xAxis: {
      axisLabel: {
        color: textColor, fontSize: 11, interval: 0, lineHeight: 14,
        margin: matrix ? 10 : 8,
        rotate: matrix ? 0 : 38,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: columnLabels,
      position: matrix ? "top" : "bottom",
      splitArea: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: textColor, fontSize: 11, interval: 0, margin: 10, width: 80, overflow: "truncate" },
      axisLine: { show: false },
      axisTick: { show: false },
      data: rows.map((row) => demographicCategoryLabel(row.label, row.key, "age", presentation.emojis)),
      inverse: true,
      splitArea: { show: false },
      type: "category",
    },
    series: matrix ? crossing.columns.map((_, index) => ({
      data: dataForColumn(index),
      emphasis: { focus: "none", itemStyle: { borderColor: colors[index], borderWidth: 1 } },
      itemStyle: { borderColor, borderWidth: 0.5, color: colors[index] },
      label: { color: demographicHeatmapLabelColor([colors[index]], 0), formatter: percentageLabel, fontSize: 11, fontWeight: 600, show: true },
      name: columnLabels[index],
      type: "heatmap",
    })) : [{
      data,
      emphasis: { itemStyle: {
        borderColor: dark ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.20)",
        borderWidth: 1,
        shadowBlur: 4,
        shadowColor: dark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.14)",
      } },
      itemStyle: { borderColor, borderWidth: 0.5 },
      label: {
        formatter: (parameters: unknown) => {
          const value = parameterValue(parameters);
          if (typeof value?.[2] !== "number" || value[2] <= 0 || !Number.isFinite(value[2])) return "";
          const contrast = demographicHeatmapLabelColor(heatColors, value[2] / maximum) === "#FFFFFF" ? "light" : "dark";
          return `{${contrast}|${percentFormat.format(value[2])}%}`;
        },
        fontSize: 10,
        fontWeight: 600,
        rich: { dark: { color: "#000000", fontWeight: 600 }, light: { color: "#FFFFFF", fontWeight: 600 } },
        show: true,
      },
      name: "Participação",
      progressive: 1_000,
      type: "heatmap",
    }],
  } as EnterpriseChartOption;
}

/** Low values begin in the selected hue rather than gray or white. Both
 * themes deepen monotonically; dark remains chromatic without bright sheets. */
export function demographicHeatmapColors(
  palette: DemographicPaletteId,
  theme: "light" | "dark" = "light",
) {
  const selected = getDemographicPalette(palette);
  const base = selected.id === "pink-blue" ? selected.colors[1] : selected.colors[0];
  const source = hexChannels(base);
  const maximumChannel = Math.max(1, ...source);
  const low = theme === "dark"
    ? source.map((channel) => 16 + channel / maximumChannel * 104)
    : source.map((channel) => 255 + (channel - 255) * 0.20);
  const deep = theme === "dark"
    ? source.map((channel) => 4 + channel / maximumChannel * 44)
    : source.map((channel) => channel * 0.68);
  return [0, 0.16, 0.34, 0.52, 0.7, 0.86, 1].map((weight) =>
    channelsHex(low.map((channel, index) => channel + (deep[index] - channel) * weight)));
}

/** ECharts interpolates opaque RGB stops. Black/white retain at least 4.5:1
 * contrast even through mid-tones where navy/white cannot provide that ratio. */
export function demographicHeatmapLabelColor(colors: readonly string[], ratio: number) {
  const position = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * Math.max(0, colors.length - 1);
  const index = Math.floor(position);
  const start = hexChannels(colors[index] ?? "#FFFFFF");
  const end = hexChannels(colors[Math.min(index + 1, colors.length - 1)] ?? colors[index] ?? "#FFFFFF");
  const linear = start.map((channel, offset) => {
    const value = Math.round(channel + (end[offset] - channel) * (position - index)) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? "#FFFFFF" : "#000000";
}

function hexChannels(color: string) {
  return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
}

function channelsHex(channels: number[]) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function parameterValue(parameters: unknown): unknown[] | null {
  const parameter = Array.isArray(parameters) ? parameters[0] : parameters;
  if (!parameter || typeof parameter !== "object") return null;
  const value = (parameter as { value?: unknown }).value;
  return Array.isArray(value) ? value : null;
}

function percentageLabel(parameters: unknown) {
  const value = parameterValue(parameters)?.[2];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${percentFormat.format(value)}%` : "";
}

function crossingTooltip(
  parameters: unknown,
  rows: DemographicCrossing["rows"],
  columns: DemographicCrossing["columns"],
  dimension: CrossingDimension,
) {
  const value = parameterValue(parameters);
  if (!value || !Number.isInteger(value[0]) || !Number.isInteger(value[1])) return "Sem valor";
  const row = rows[value[1] as number];
  const column = columns[value[0] as number];
  const cell = row?.cells.find((candidate) => candidate.columnKey === column?.key);
  if (!row || !column || !cell) return "Sem valor";
  return [
    `<strong>${escapeHtml(`${row.label} · ${column.label}`)}</strong>`,
    `Participação${dimension === "age-gender" ? " entre gêneros identificados" : ""}: ${cell.percentage === null ? "—" : `${percentFormat.format(cell.percentage)}%`}`,
    `Detecções: ${countFormat.format(cell.count)}`,
  ].join("<br/>");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
