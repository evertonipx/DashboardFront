import type { EnterpriseChartOption } from "@/components/app/echart";
import { heatmapLabelColor, monochromeHeatmapPalette } from "@/lib/chart-palette";
import type { DemographicAggregation, DemographicCrossing } from "@/lib/demographics";
import {
  demographicCategoryColor,
  demographicCategoryLabel,
  getDemographicPalette,
  normalizeDemographicPresentation,
  type DemographicPaletteId,
  type DemographicPresentation,
} from "@/lib/demographics-presentation";

type CrossingDimension = "age-gender" | "age-emotion";
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat("pt-BR");

/** Configures presentation only. Coordinates follow the sorted rows while
 * percentages and counts remain exactly those supplied by the aggregation. */
export function buildDemographicCrossingOption(
  summary: DemographicAggregation,
  settings: DemographicPresentation,
  dimension: CrossingDimension,
  theme: "light" | "dark" = "light",
): EnterpriseChartOption {
  const presentation = normalizeDemographicPresentation(settings, dimension);
  const crossing: DemographicCrossing = dimension === "age-gender"
    ? summary.crossings.ageByGender : summary.crossings.ageByEmotion;
  const ordered = crossing.rows.map((row, originalIndex) => ({ row, originalIndex }));
  if (presentation.order !== "default") {
    const direction = presentation.order === "ascending" ? 1 : -1;
    ordered.sort((left, right) => direction * (left.row.count - right.row.count) || left.originalIndex - right.originalIndex);
  }
  const rows = ordered.map(({ row }) => row);
  const matrix = dimension === "age-gender";
  const dark = theme === "dark";
  const textColor = dark ? "#CBD5E1" : "#526477";
  const labelColor = dark ? "#E2E8F0" : "#334155";
  const borderColor = matrix
    ? dark ? "#3F3F46" : "#E2E8F0"
    : dark ? "rgba(226, 232, 240, 0.12)" : "rgba(15, 23, 42, 0.09)";
  const columnLabels = crossing.columns.map((column) =>
    demographicCategoryLabel(column.label, column.key, dimension, presentation.emojis));
  const colors = crossing.columns.map((column, index) =>
    demographicCategoryColor(column.key, index, presentation.palette, dimension));
  const tints = colors.map((color) => categoryTint(color, dark));
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
        ? "Faixas etárias nas linhas e gêneros nas colunas. Os percentuais representam a participação no total de detecções; as cores identificam o gênero."
        : "Faixas etárias nas linhas e emoções nas colunas. Os percentuais representam a participação no total de detecções; cores mais intensas indicam maior participação.",
    },
    grid: { bottom: matrix ? 4 : 44, containLabel: false, outerBoundsMode: "same", outerBoundsContain: "axisLabel", left: 4, right: 8, top: 8 },
    legend: { show: false },
    tooltip: {
      formatter: (parameters: unknown) => crossingTooltip(parameters, rows, crossing.columns),
      position: "top",
      trigger: "item",
    },
    visualMap: matrix ? {
      dimension: 0,
      pieces: crossing.columns.map((_, index) => ({ color: tints[index], label: columnLabels[index], value: index })),
      seriesIndex: crossing.columns.map((_, index) => index),
      show: false,
      type: "piecewise",
    } : {
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
        formatter: matrix ? (label: string) => label.replace("Não identificado", "Não\nidentificado") : undefined,
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
      itemStyle: { borderColor, borderWidth: 0.5, color: tints[index] },
      label: { color: labelColor, formatter: percentageLabel, fontSize: 11, fontWeight: 600, show: true },
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
          const contrast = heatmapLabelColor(heatColors, value[2] / maximum) === "#FFFFFF" ? "light" : "dark";
          return `{${contrast}|${percentFormat.format(value[2])}%}`;
        },
        fontSize: 10,
        fontWeight: 600,
        rich: { dark: { color: "#0F172A", fontWeight: 600 }, light: { color: "#FFFFFF", fontWeight: 600 } },
        show: true,
      },
      name: "Participação",
      progressive: 1_000,
      type: "heatmap",
    }],
  } as EnterpriseChartOption;
}

/** Preserve light-to-deep intensity in both themes. Dark cards use a muted
 * slate low end, not a luminous white sheet or a reversed color scale. */
export function demographicHeatmapColors(
  palette: DemographicPaletteId,
  theme: "light" | "dark" = "light",
) {
  const selected = getDemographicPalette(palette);
  const base = selected.id === "pink-blue" ? selected.colors[1] : selected.colors[0];
  const colors = monochromeHeatmapPalette(base, theme);
  if (theme !== "dark") return colors;

  // Composite only the cell fills. Opaque final colors let the label helper
  // calculate actual contrast, and leave axes, numbers and borders crisp.
  // The same blend at every stop preserves the original intensity order.
  const surface = [30, 41, 59];
  const colorStrength = 0.46;
  return colors.map((color) => `#${surface.map((channel, index) => {
    const source = Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(channel + (source - channel) * colorStrength).toString(16).padStart(2, "0");
  }).join("")}`);
}

function categoryTint(color: string, dark: boolean) {
  const background = dark ? [17, 24, 39] : [255, 255, 255];
  const opacity = dark ? 0.23 : 0.10;
  return `#${background.map((channel, index) => {
    const source = Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(channel + (source - channel) * opacity).toString(16).padStart(2, "0");
  }).join("")}`;
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
) {
  const value = parameterValue(parameters);
  if (!value || !Number.isInteger(value[0]) || !Number.isInteger(value[1])) return "Sem valor";
  const row = rows[value[1] as number];
  const column = columns[value[0] as number];
  const cell = row?.cells.find((candidate) => candidate.columnKey === column?.key);
  if (!row || !column || !cell) return "Sem valor";
  return [
    `<strong>${escapeHtml(`${row.label} · ${column.label}`)}</strong>`,
    `Participação: ${cell.percentage === null ? "—" : `${percentFormat.format(cell.percentage)}%`}`,
    `Detecções: ${countFormat.format(cell.count)}`,
  ].join("<br/>");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
