import type { EnterpriseChartOption } from "@/components/app/echart";
import { heatmapLabelColor } from "@/lib/chart-palette";
import type { DemographicDistributionItem } from "@/lib/demographics";
import {
  demographicCategoryColor,
  demographicCategoryLabel,
  normalizeDemographicPresentation,
  type DemographicPresentation,
} from "@/lib/demographics-presentation";

type DistributionContext = {
  dimension: "gender" | "age" | "emotion";
  theme?: "light" | "dark";
  showLegend?: boolean;
};

type PresentedItem = DemographicDistributionItem<string> & {
  color: string;
  name: string;
  originalIndex: number;
};

const percentFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});
const countFormat = new Intl.NumberFormat("pt-BR");

/** Changes presentation only; the supplied counts and total percentages win. */
export function buildDemographicDistributionOption(
  items: readonly DemographicDistributionItem<string>[],
  settings: DemographicPresentation,
  context: DistributionContext,
): EnterpriseChartOption {
  const presentation = normalizeDemographicPresentation(settings, context.dimension);
  const entries: PresentedItem[] = items.map((item, originalIndex) => ({
    ...item,
    color: demographicCategoryColor(
      item.key, originalIndex, presentation.palette, context.dimension,
    ),
    name: demographicCategoryLabel(
      item.label, item.key, context.dimension, presentation.emojis,
    ),
    originalIndex,
  }));
  if (presentation.order !== "default") {
    const direction = presentation.order === "ascending" ? 1 : -1;
    entries.sort((left, right) =>
      direction * (left.count - right.count) || left.originalIndex - right.originalIndex,
    );
  }

  const textColor = context.theme === "dark" ? "#CBD5E1" : "#526477";
  const base: EnterpriseChartOption = {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: false },
      description: "Distribuição demográfica. Os percentuais são a participação de cada categoria no total de detecções classificadas, não pessoas únicas.",
    },
    color: entries.map((item) => item.color),
    textStyle: { color: textColor },
    tooltip: { formatter: distributionTooltip, trigger: "item" },
  };
  if (presentation.type === "bar") {
    return buildBars(entries, presentation, base, textColor);
  }
  const showLegend = context.showLegend ?? true;
  const legendHeight = showLegend ? (entries.length > 5 ? 72 : 38) : 0;
  const legend = {
    bottom: 0,
    data: entries.map((item) => ({ name: item.name, itemStyle: { color: item.color } })),
    formatter: (name: string) => {
      const entry = entries.find((item) => item.name === name);
      const percentage = positivePercentage(entry?.percentage);
      return percentage ? `${name} · ${percentage}` : name;
    },
    icon: "roundRect",
    itemGap: 12,
    itemHeight: 9,
    itemWidth: 9,
    left: "center",
    padding: 0,
    selectedMode: false,
    show: showLegend,
    // Media options are merged by ECharts, including nested text styles.
    // Explicit resets prevent a compact legend from truncating after resize.
    textStyle: { color: textColor, fontSize: 11, lineHeight: 16, width: null, overflow: null },
    top: "auto",
    type: "plain",
    width: "96%",
  };
  const option = presentation.type === "stacked"
    ? buildStacked(entries, presentation, base, legend, legendHeight)
    : buildCircular(entries, presentation, base, legend, legendHeight, textColor);
  return responsiveDistributionOption(option, entries, presentation, legend, textColor, showLegend);
}

function buildBars(
  entries: PresentedItem[],
  settings: DemographicPresentation,
  base: EnterpriseChartOption,
  textColor: string,
): EnterpriseChartOption {
  const horizontal = settings.orientation === "horizontal";
  const largest = Math.max(0, ...entries.map((item) => item.percentage ?? 0));
  const maximum = Math.min(100, Math.max(10, Math.ceil(largest * 1.15 / 10) * 10));
  const categoryAxis = {
    axisLabel: {
      color: textColor,
      fontSize: 11,
      interval: 0,
      margin: 10,
      ...(horizontal ? { overflow: "truncate", width: 110 } : {
        hideOverlap: false,
        rotate: entries.length > 5 ? 30 : 0,
      }),
    },
    axisLine: { show: false },
    axisTick: { show: false },
    data: entries.map((item) => item.name),
    inverse: horizontal,
    type: "category",
  };
  const valueAxis = {
    axisLabel: {
      color: textColor,
      fontSize: 10,
      formatter: "{value}%",
      hideOverlap: true,
      showMaxLabel: true,
      showMinLabel: true,
    },
    axisLine: { show: false },
    axisTick: { show: false },
    max: maximum,
    min: 0,
    splitLine: { lineStyle: { color: textColor, opacity: 0.12, type: "dashed" } },
    splitNumber: 4,
    type: "value",
  };
  return {
    ...base,
    grid: {
      // Use rendered label bounds, not the legacy text-width estimate, which
      // can differ from the actual font on Windows and clip the first glyph.
      bottom: 10, containLabel: false, outerBoundsMode: "same",
      outerBoundsContain: "axisLabel", left: 4,
      right: horizontal ? 48 : 12, top: horizontal ? 8 : 28,
    },
    // A bar category is identified by its axis, not by a one-series legend.
    legend: { show: false },
    tooltip: { axisPointer: { type: "none" }, formatter: distributionTooltip, trigger: "axis" },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [{
      barMaxWidth: horizontal ? 22 : 42,
      data: entries.map((item) => chartDatum(item, item.percentage ?? 0)),
      itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      label: {
        align: horizontal ? "left" : "center",
        color: textColor,
        distance: 7,
        fontSize: 11,
        fontWeight: 600,
        formatter: percentageLabel,
        position: horizontal ? "right" : "top",
        rotate: 0,
        show: true,
      },
      name: "Participação no total",
      type: "bar",
    }],
  } as EnterpriseChartOption;
}

function buildStacked(
  entries: PresentedItem[],
  settings: DemographicPresentation,
  base: EnterpriseChartOption,
  legend: Record<string, unknown>,
  legendHeight: number,
): EnterpriseChartOption {
  const horizontal = settings.orientation === "horizontal";
  const visible = entries.filter((entry) => (entry.percentage ?? 0) > 0);
  const categoryAxis = { data: ["Detecções"], show: false, type: "category" };
  const valueAxis = { max: 100, min: 0, show: false, splitLine: { show: false }, type: "value" };
  return {
    ...base,
    grid: { bottom: legendHeight + 4, containLabel: false, left: 4, right: 4, top: 4 },
    legend,
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: entries.map((item) => {
      const first = item === visible[0];
      const last = item === visible[visible.length - 1];
      const contrast = heatmapLabelColor([item.color], 0);
      return {
        barMaxWidth: horizontal ? 34 : 64,
        data: [chartDatum(item, item.percentage ?? 0)],
        itemStyle: {
          borderRadius: horizontal
            ? [first ? 5 : 0, last ? 5 : 0, last ? 5 : 0, first ? 5 : 0]
            : [last ? 5 : 0, last ? 5 : 0, first ? 5 : 0, first ? 5 : 0],
          color: item.color,
        },
        label: {
          align: "center",
          color: contrast === "#FFFFFF" ? "#F9FAFB" : contrast,
          fontSize: 11,
          fontWeight: 600,
          formatter: percentageLabel,
          position: "inside",
          rotate: 0,
          show: true,
          verticalAlign: "middle",
        },
        name: item.name,
        emphasis: { label: { show: true } },
        stack: "demographics-total",
        type: "bar",
      };
    }),
  } as EnterpriseChartOption;
}

function buildCircular(
  entries: PresentedItem[],
  settings: DemographicPresentation,
  base: EnterpriseChartOption,
  legend: Record<string, unknown>,
  legendHeight: number,
  textColor: string,
): EnterpriseChartOption {
  const half = settings.type === "half-donut";
  const donut = settings.type === "donut" || half;
  return {
    ...base,
    legend,
    series: [{
      avoidLabelOverlap: true,
      bottom: legendHeight + 4,
      center: ["50%", half ? "75%" : "50%"],
      clockwise: true,
      // ECharts 6 supports a real half-circle range. Never add an invisible
      // balancing slice: it would alter total percentages and hit targets.
      ...(half ? { startAngle: 180, endAngle: 0 } : {}),
      data: entries.map((item) => chartDatum(item, item.count)),
      emphasis: { scale: false, label: { show: true } },
      itemStyle: { borderRadius: 2, borderWidth: 0 },
      label: {
        alignTo: "edge",
        color: textColor,
        distanceToLabelLine: 4,
        edgeDistance: 8,
        fontSize: 11,
        fontWeight: 600,
        formatter: (parameters: unknown) => {
          const percentage = percentageLabel(parameters);
          if (!percentage) return "";
          const datum = tooltipDatum(parameters);
          return legend.show || !datum ? percentage : `${datum.name}\n${percentage}`;
        },
        show: true,
      },
      labelLine: { show: true, length: 10, length2: 6, lineStyle: { color: textColor, opacity: 0.4 } },
      left: 0,
      name: "Participação no total",
      radius: half ? ["48%", "88%"] : donut ? ["38%", "64%"] : [settings.type === "rose" ? "10%" : 0, "64%"],
      ...(settings.type === "rose" ? { roseType: "radius" } : {}),
      showEmptyCircle: false,
      right: 0,
      stillShowZeroSum: false,
      top: 4,
      type: "pie",
    }],
  } as EnterpriseChartOption;
}

/** Compact cards read their exact percentages in a fixed-width legend grid. */
function responsiveDistributionOption(
  option: EnterpriseChartOption,
  entries: PresentedItem[],
  settings: DemographicPresentation,
  legend: Record<string, unknown>,
  textColor: string,
  showLegend: boolean,
): EnterpriseChartOption {
  // A caller that supplies its own legend must retain the chart's labels.
  if (!showLegend) return option;
  const stacked = settings.type === "stacked";
  const legendHeight = Math.ceil(entries.length / 3) * 24;
  const compactLegend = {
    ...legend,
    formatter: (name: string) => {
      const entry = entries.find((item) => item.name === name);
      const label = entry?.key === "unknown"
        ? name.replace("Não identificado", "Não ident.")
        : name;
      const percentage = positivePercentage(entry?.percentage);
      return percentage ? `${label}\n${percentage}` : label;
    },
    itemGap: 0,
    itemHeight: 8,
    itemWidth: 8,
    textStyle: {
      color: textColor,
      fontSize: 10,
      lineHeight: 12,
      overflow: "truncate",
      width: 62,
    },
  };
  const labelOverrides = {
    // Percentages stay permanently visible in the matching legend items.
    // Do not paint a second, colliding copy around a tiny circle/segment.
    label: { show: false },
    labelLine: { show: false },
    emphasis: { label: { show: false } },
  };
  const narrowSeries = stacked
    ? entries.map(() => ({ ...labelOverrides }))
    : [{ ...labelOverrides, bottom: legendHeight + 2, left: 0, right: 0, top: 2 }];
  const wideSeries = stacked
    ? entries.map(() => ({ ...labelOverrides }))
    : [{ ...labelOverrides, bottom: 2, left: 0, right: "66%", top: 2 }];
  return {
    ...option,
    media: [
      {
        query: { maxWidth: 400 },
        option: {
          ...(stacked ? { grid: { bottom: legendHeight + 4, left: 2, right: 2, top: 2 } } : {}),
          legend: { ...compactLegend, bottom: 0, left: 0, right: 0, top: "auto", width: "100%" },
          series: narrowSeries,
        },
      },
      {
        query: { maxHeight: 160, minWidth: 401 },
        option: {
          ...(stacked ? { grid: { bottom: 4, left: 2, right: "66%", top: 4 } } : {}),
          legend: { ...compactLegend, bottom: "auto", left: "auto", right: 0, top: "center", width: "62%" },
          series: wideSeries,
        },
      },
      // ECharts merges media overrides. Reset fields explicitly so increasing
      // the card again restores labels and the original chart/legend bounds.
      {
        option: {
          ...(stacked ? { grid: option.grid } : {}),
          legend,
          series: option.series,
        },
      },
    ],
  } as EnterpriseChartOption;
}

function chartDatum(item: PresentedItem, value: number) {
  return {
    categoryLabel: item.label,
    count: item.count,
    itemStyle: { color: item.color },
    key: item.key,
    name: item.name,
    observed: item.observed,
    percentage: item.percentage,
    value,
  };
}

/** Fit compositions to the actual canvas, not the card's outer dimensions.
 * Names, swatches and canonical percentages share one aligned legend; tiny
 * sectors never have to compete with a second set of outside labels.
 */
export function fitDemographicCompositionOption(
  option: EnterpriseChartOption,
  size: { width: number; height: number },
): EnterpriseChartOption {
  const series = (Array.isArray(option.series) ? option.series : [option.series])
    .filter(isRecord);
  const circular = series.length === 1 && series[0].type === "pie";
  const stacked = series.length > 0 && series.every((item) => item.type === "bar" && item.stack === "demographics-total");
  const originalLegend = option.legend;
  if ((!circular && !stacked) || !originalLegend || originalLegend.show === false ||
    size.width <= 0 || size.height <= 0) return option;
  const entries = series.flatMap((item) => Array.isArray(item.data) ? item.data : []) as ReturnType<typeof chartDatum>[];
  if (!entries.length) return option;

  const width = Math.floor(size.width);
  const height = Math.floor(size.height);
  const compact = height < 180 || width < 360;
  const fontSize = compact ? 10 : 11;
  const lineHeight = compact ? 12 : 16;
  const iconWidth = compact ? 8 : 9;
  const inset = 4;
  const verticalInset = 2;
  const gap = compact ? 12 : 24;
  const textColor = originalLegend.textStyle?.color ?? "#526477";
  const half = circular && series[0].startAngle === 180 && series[0].endAngle === 0;
  const nameWidth = compact ? 80 : 110;
  const valueWidth = compact ? 42 : 50;
  const itemWidth = iconWidth + 5 + nameWidth + valueWidth;
  const sideGap = Math.max(0, Math.min(compact ? 1 : 5,
    Math.floor((height - verticalInset * 2 - entries.length * lineHeight) / Math.max(1, entries.length - 1))));
  const sideHeight = entries.length * lineHeight + (entries.length - 1) * sideGap;
  const sideWidth = Math.max(0, width - inset * 2 - itemWidth - gap);
  const sideDiameter = Math.min(sideWidth, (height - inset * 2) * (half ? 2 : 1));

  // A taller/narrower card can give the circle more space above a small grid.
  // Reserve the real number of rows, including unknown and zero categories.
  const columns = Math.max(1, Math.min(3, Math.floor((width - inset * 2) / 110)));
  const columnGap = 10;
  const cellWidth = Math.floor((width - inset * 2 - columnGap * (columns - 1)) / columns);
  const rows = Math.ceil(entries.length / columns);
  const bottomHeight = rows * lineHeight * 2 + (rows - 1) * columnGap;
  const bottomPlotHeight = height - inset * 2 - gap - bottomHeight;
  const bottomDiameter = Math.min(width - inset * 2, bottomPlotHeight * (half ? 2 : 1));
  const below = bottomDiameter > sideDiameter * 1.2 ||
    (sideHeight > height - verticalInset * 2 && bottomDiameter >= 48);
  const diameter = Math.max(8, Math.min(360, below ? bottomDiameter : sideDiameter));
  const plotHeight = half ? diameter / 2 : diameter;
  const contentHeight = below ? plotHeight + gap + bottomHeight : Math.max(plotHeight, sideHeight);
  const contentWidth = below ? width - inset * 2 : diameter + gap + itemWidth;
  const startX = Math.max(inset, (width - contentWidth) / 2);
  const startY = Math.max(verticalInset, (height - contentHeight) / 2);
  const plotX = below ? (width - diameter) / 2 : startX;
  const plotY = below ? startY : startY + (contentHeight - plotHeight) / 2;
  const legendX = below ? inset : startX + diameter + gap;
  const legendY = below ? startY + plotHeight + gap : startY + (contentHeight - sideHeight) / 2;
  const names = new Map(entries.map((entry) => [entry.name, entry]));
  const legend = {
    ...originalLegend,
    align: "left",
    bottom: "auto",
    right: "auto",
    left: legendX,
    top: legendY,
    width: below ? width - inset * 2 : itemWidth,
    height: undefined,
    orient: below ? "horizontal" : "vertical",
    itemGap: below ? columnGap : sideGap,
    itemWidth: iconWidth,
    itemHeight: iconWidth,
    selectedMode: false,
    formatter: (name: string) => {
      const entry = names.get(name);
      // Only abbreviate the long fallback caption, never a named category or
      // its trailing emoji. Full captions remain in the sector tooltip.
      const caption = compact && entry?.key === "unknown"
        ? name.replace("Não identificado", "Não ident.") : name;
      const safeCaption = caption.replace(/[{}|]/g, "");
      const percentage = positivePercentage(entry?.percentage);
      return below
        ? `{category|${safeCaption}}\n{percentage|${percentage}}`
        : `{category|${safeCaption}}{percentage|${percentage}}`;
    },
    textStyle: {
      color: textColor, fontSize, lineHeight, width: undefined, overflow: "none",
      rich: {
        category: {
          color: textColor, fontSize, lineHeight, align: "left",
          width: below ? cellWidth - iconWidth - 5 : nameWidth,
          overflow: "truncate",
        },
        percentage: {
          color: textColor, fontSize, fontWeight: 600, lineHeight,
          align: below ? "left" : "right",
          width: below ? cellWidth - iconWidth - 5 : valueWidth,
        },
      },
    },
  };
  const fittedSeries = series.map((item) => ({
    ...item,
    label: { ...(isRecord(item.label) ? item.label : {}), show: false },
    labelLine: { ...(isRecord(item.labelLine) ? item.labelLine : {}), show: false },
    emphasis: {
      ...(isRecord(item.emphasis) ? item.emphasis : {}),
      label: { show: false },
    },
    ...(circular ? {
      left: plotX, right: "auto", top: plotY, bottom: "auto",
      width: diameter, height: plotHeight,
      center: ["50%", half ? "100%" : "50%"],
      radius: [
        Array.isArray(item.radius) && item.radius[0] !== 0
          ? diameter * (item.roseType ? 0.07 : 0.29) : 0,
        Math.max(1, diameter / 2 - 2),
      ],
    } : {}),
  }));
  return {
    ...option,
    // No merging media overrides: every resize is recomputed from the source.
    media: [],
    legend,
    series: fittedSeries,
    ...(stacked ? { grid: {
      ...option.grid, containLabel: false,
      left: plotX, right: "auto", top: plotY, bottom: "auto",
      width: diameter, height: plotHeight,
    } } : {}),
  } as EnterpriseChartOption;
}

function positivePercentage(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${percentFormat.format(value)}%`
    : "";
}

function percentageLabel(parameters: unknown) {
  const datum = tooltipDatum(parameters);
  return positivePercentage(datum?.percentage);
}

function distributionTooltip(parameters: unknown) {
  const datum = tooltipDatum(parameters);
  if (!datum) return "Sem valor";
  const percentage = datum.percentage === null ? "—" : `${percentFormat.format(datum.percentage)}%`;
  return [
    `<strong>${escapeTooltipHtml(datum.name)}</strong>`,
    `Participação no total: ${percentage}`,
    `Detecções: ${countFormat.format(datum.count)}`,
  ].join("<br/>");
}

function tooltipDatum(parameters: unknown): {
  count: number;
  name: string;
  percentage: number | null;
} | null {
  const parameter = Array.isArray(parameters) ? parameters[0] : parameters;
  if (!isRecord(parameter) || !isRecord(parameter.data)) return null;
  const datum = parameter.data;
  if (typeof datum.name !== "string" || typeof datum.count !== "number") return null;
  return {
    count: datum.count,
    name: datum.name,
    percentage: typeof datum.percentage === "number" && Number.isFinite(datum.percentage)
      ? datum.percentage : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function escapeTooltipHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
