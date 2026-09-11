import type { EnterpriseChartOption } from "@/components/app/echart";
import { heatmapLabelColor } from "@/lib/chart-palette";
import type { DemographicDistributionItem } from "@/lib/demographics";
import { visibleDemographicDistribution } from "@/lib/demographics-visible-categories";
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

/** Gender excludes unclassified detections; other dimensions retain their base. */
export function buildDemographicDistributionOption(
  items: readonly DemographicDistributionItem<string>[],
  settings: DemographicPresentation,
  context: DistributionContext,
): EnterpriseChartOption {
  const presentation = normalizeDemographicPresentation(settings, context.dimension);
  const entries: PresentedItem[] = visibleDemographicDistribution(items, context.dimension).map((item, originalIndex) => ({
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
      description: context.dimension === "gender"
        ? "Distribuição entre gêneros identificados: Mulher e Homem. Detecções, não pessoas únicas."
        : "Distribuição demográfica. Os percentuais são a participação de cada categoria no total de detecções classificadas, não pessoas únicas.",
    },
    color: entries.map((item) => item.color),
    textStyle: { color: textColor },
    tooltip: { formatter: (parameters: unknown) => distributionTooltip(parameters, context.dimension === "gender"), trigger: "item" },
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
      return presentation.type === "stacked" && percentage ? `${name} · ${percentage}` : name;
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
    tooltip: { ...base.tooltip, axisPointer: { type: "none" }, trigger: "axis" },
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
      labelLayout: { hideOverlap: false },
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
        position: "outside",
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

/** Stacked compact cards keep percentages in their aligned legend grid. */
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
  // Circular labels are fitted from real canvas dimensions by the card and
  // export renderer. A media fallback must never hide their percentages.
  if (!stacked) return option;
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

/** Fit compositions to the actual canvas, not the card's outer dimensions. */
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
  if (circular) return fitCircularComposition(option, series[0], entries, size);

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

type CircularDatum = ReturnType<typeof chartDatum>;

/** Percentages belong to their sectors. The legend identifies categories only. */
function fitCircularComposition(
  option: EnterpriseChartOption,
  series: Record<string, unknown>,
  entries: CircularDatum[],
  size: { width: number; height: number },
): EnterpriseChartOption {
  const width = Math.floor(size.width);
  const height = Math.floor(size.height);
  const compact = height < 180 || width < 360;
  const fontSize = compact ? 10 : 11;
  const lineHeight = compact ? 12 : 16;
  const iconWidth = compact ? 8 : 9;
  const nameWidth = compact ? 80 : 110;
  const itemWidth = iconWidth + 5 + nameWidth;
  const gap = compact ? 8 : 20;
  const inset = 4;
  const originalLegend = option.legend!;
  const textColor = String(originalLegend.textStyle?.color ?? "#526477");
  const half = series.startAngle === 180 && series.endAngle === 0;
  const rose = Boolean(series.roseType);
  const ring = Array.isArray(series.radius) && series.radius[0] !== 0;
  const sum = entries.reduce((total, entry) => total + Math.max(0, entry.count), 0);
  const maximum = Math.max(0, ...entries.map((entry) => entry.count));
  const gutter = Math.ceil(Math.max(0, ...entries.map((entry) =>
    percentageTextWidth(positivePercentage(entry.percentage), fontSize))) + 7);
  const sideGap = Math.max(0, Math.min(compact ? 1 : 5,
    Math.floor((height - 4 - entries.length * lineHeight) / Math.max(1, entries.length - 1))));
  const sideHeight = entries.length * lineHeight + (entries.length - 1) * sideGap;
  const columns = Math.max(1, Math.min(3, Math.floor((width - inset * 2) / 95)));
  const columnGap = compact ? 4 : 10;
  const rows = Math.ceil(entries.length / columns);
  const cellWidth = Math.floor((width - inset * 2 - columnGap * (columns - 1)) / columns);
  const bottomHeight = rows * lineHeight + (rows - 1) * columnGap;

  function geometry(radius: number) {
    const inner = ring ? radius * (rose ? 0.14 : 0.48) : 0;
    let angle = half ? -Math.PI : -Math.PI / 2;
    return entries.map((entry) => {
      const start = angle;
      angle += sum > 0 ? Math.max(0, entry.count) / sum * (half ? Math.PI : Math.PI * 2) : 0;
      const outer = rose && maximum > 0 ? inner + (radius - inner) * entry.count / maximum : radius;
      const percentage = positivePercentage(entry.percentage);
      const inside = Boolean(percentage) && entry.count > 0 && percentageFitsSector(
        start, angle, inner, outer, percentageTextWidth(percentage, fontSize), fontSize + 3,
      );
      return { inside, start, end: angle, inner, outer, percentage };
    });
  }

  function candidate(plotWidth: number, plotHeight: number) {
    // First try the full canvas. Only reserve callout gutters when a value
    // cannot fit inside; re-evaluate after the resulting radius changes.
    let radius = Math.max(1, Math.min(180, plotWidth / 2 - 2, plotHeight / (half ? 1 : 2) - 2));
    let slices = geometry(radius);
    const external = slices.some((slice) => slice.percentage && !slice.inside);
    if (external) {
      radius = Math.max(1, Math.min(180, (plotWidth - gutter * 2) / 2,
        (plotHeight - lineHeight * 2) / (half ? 1 : 2)));
      slices = geometry(radius);
    }
    return { radius, slices, external, plotWidth, plotHeight };
  }

  const side = candidate(width - inset * 2 - itemWidth - gap, height - inset * 2);
  const bottom = candidate(width - inset * 2, height - inset * 2 - gap - bottomHeight);
  const oneSided = width < 240 && height < 180 && entries.length > 5;
  const bottomExternalRows = Math.max(...[-1, 1].map((direction) => bottom.slices.filter((slice) =>
    slice.percentage && !slice.inside && (Math.cos((slice.start + slice.end) / 2) < 0 ? -1 : 1) === direction).length));
  const below = !oneSided && bottom.plotHeight >= bottomExternalRows * lineHeight &&
    (bottom.radius > side.radius * 1.2 || (sideHeight > height - 4 && bottom.radius > side.radius));
  const layout = below ? bottom : side;
  if (oneSided) {
    // In the narrowest cards the external values share the legend's rows.
    // One callout column leaves a readable circle instead of a tiny dot.
    layout.radius = Math.max(1, Math.min(180, (layout.plotWidth - gutter) / 2,
      (layout.plotHeight - lineHeight * 2) / (half ? 1 : 2)));
    layout.slices = geometry(layout.radius);
  }
  const plotWidth = Math.max(1, Math.min(layout.plotWidth,
    layout.radius * 2 + (oneSided ? gutter : layout.external ? gutter * 2 : 4)));
  const plotHeight = Math.max(1, layout.plotHeight);
  const plotX = below ? (width - plotWidth) / 2 : (width - plotWidth - gap - itemWidth) / 2;
  const plotY = inset;
  const cx = plotX + (oneSided ? layout.radius : plotWidth / 2);
  const cy = plotY + plotHeight / 2 + (half ? layout.radius / 2 : 0);
  const names = new Map(entries.map((entry) => [entry.name, entry]));
  return {
    ...option,
    media: [],
    legend: {
      ...originalLegend,
      align: "left", bottom: "auto", right: "auto",
      left: below ? inset : plotX + plotWidth + gap,
      top: below ? plotY + plotHeight + gap : Math.max(2, (height - sideHeight) / 2),
      width: below ? width - inset * 2 : itemWidth,
      height: undefined,
      orient: below ? "horizontal" : "vertical",
      itemGap: below ? columnGap : sideGap,
      itemWidth: iconWidth, itemHeight: iconWidth, selectedMode: false,
      formatter: (name: string) => {
        const caption = compact && names.get(name)?.key === "unknown"
          ? name.replace("Não identificado", "Não ident.") : name;
        return `{category|${caption.replace(/[{}|]/g, "")}}`;
      },
      textStyle: {
        color: textColor, fontSize, lineHeight, width: undefined, overflow: "none",
        rich: { category: {
          color: textColor, fontSize, lineHeight, align: "left",
          width: below ? cellWidth - iconWidth - 5 : nameWidth,
        } },
      },
    },
    series: [{
      ...series,
      left: plotX, top: plotY, right: "auto", bottom: "auto",
      width: plotWidth, height: plotHeight,
      center: [cx - plotX, cy - plotY],
      radius: [layout.slices[0]?.inner ?? 0, layout.radius],
      avoidLabelOverlap: true,
      minShowLabelAngle: 0,
      labelLayout: oneSided ? (parameters: { dataIndex: number; labelRect: { width: number } }) => {
        const slice = layout.slices[parameters.dataIndex];
        if (!slice || slice.inside || !slice.percentage) return { hideOverlap: false };
        const middle = (slice.start + slice.end) / 2;
        const labelX = plotX + plotWidth;
        const labelY = Math.max(2, (height - sideHeight) / 2) +
          parameters.dataIndex * (lineHeight + sideGap) + lineHeight / 2;
        const lineEnd = labelX - parameters.labelRect.width - 3;
        return {
          hideOverlap: false, x: labelX, y: labelY, align: "right", verticalAlign: "middle",
          labelLinePoints: [
            [cx + Math.cos(middle) * slice.outer, cy + Math.sin(middle) * slice.outer],
            [lineEnd - 3, labelY], [lineEnd, labelY],
          ],
        };
      } : { hideOverlap: false },
      label: {
        show: true, position: "outside", color: textColor,
        fontSize, fontWeight: 600, lineHeight,
        formatter: percentageLabel, rotate: 0,
        alignTo: "edge", edgeDistance: 0, distanceToLabelLine: 3,
        bleedMargin: 0, overflow: "none",
      },
      labelLine: {
        show: true, length: 6, length2: 4,
        lineStyle: { color: textColor, opacity: 0.45, width: 1 },
      },
      emphasis: { scale: false, label: { show: true } },
      data: entries.map((entry, index) => {
        const slice = layout.slices[index];
        const show = Boolean(slice.percentage) && entry.count > 0;
        return {
          ...entry,
          label: {
            show, position: slice.inside ? "inside" : "outside",
            color: slice.inside ? circularLabelColor(entry.itemStyle.color) : textColor,
          },
          labelLine: { show: show && !slice.inside },
          emphasis: { label: { show } },
        };
      }),
    }],
  } as EnterpriseChartOption;
}

function percentageTextWidth(text: string, fontSize: number) {
  // Conservative width for the numeric, horizontal label in the chart font.
  // Never shrink the type to force a label into a narrow sector.
  return [...text].reduce((width, character) => width +
    (character === "%" ? 0.95 : character === "," || character === "." ? 0.3 : 0.6) * fontSize, 2);
}

function circularLabelColor(color: string) {
  if (!/^#[\da-f]{6}$/i.test(color)) return heatmapLabelColor([color], 0);
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  // Choose the greater WCAG contrast; pure black/white guarantees at least
  // 4.5:1 even for midtone palettes where slate text would fall short.
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}

function percentageFitsSector(
  start: number, end: number, inner: number, outer: number, width: number, height: number,
) {
  if (end <= start || outer <= inner) return false;
  const middle = (start + end) / 2;
  // This is the inside-label anchor used by ECharts' pie label layout.
  const distance = (inner + outer) / 2 + 3;
  const x = Math.cos(middle) * distance;
  const y = Math.sin(middle) * distance;
  const halfWidth = width / 2 + 2;
  const halfHeight = height / 2 + 2;
  // The nearest point on the rectangle must not intersect the donut hole.
  const nearest = Math.hypot(Math.max(0, Math.abs(x) - halfWidth), Math.max(0, Math.abs(y) - halfHeight));
  if (inner > 0 && nearest < inner + 2) return false;
  if (distance <= Math.hypot(halfWidth, halfHeight) && end - start < Math.PI * 2 - 1e-6) return false;
  return [-halfWidth, halfWidth].every((dx) => [-halfHeight, halfHeight].every((dy) => {
    const px = x + dx;
    const py = y + dy;
    if (Math.hypot(px, py) > outer - 2) return false;
    if (end - start >= Math.PI * 2 - 1e-6) return true;
    const delta = ((Math.atan2(py, px) - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return delta <= end - start;
  }));
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

function distributionTooltip(parameters: unknown, identifiedGender = false) {
  const datum = tooltipDatum(parameters);
  if (!datum) return "Sem valor";
  const percentage = datum.percentage === null ? "—" : `${percentFormat.format(datum.percentage)}%`;
  return [
    `<strong>${escapeTooltipHtml(datum.name)}</strong>`,
    `${identifiedGender ? "Participação entre gêneros identificados" : "Participação no total"}: ${percentage}`,
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
