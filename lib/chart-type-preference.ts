import type { EnterpriseChartOption } from "@/components/app/echart";
import {
  CHART_VALUE_LABEL_ANGLE,
  composeChartValueLabelLayout,
} from "@/lib/chart-value-labels";
import type { CardChartType } from "@/lib/view-preferences";

export function applyChartTypePreference(
  option: EnterpriseChartOption,
  chartType: CardChartType | undefined,
): EnterpriseChartOption {
  if (chartType !== "line") return option;

  const xAxes = Array.isArray(option.xAxis)
    ? option.xAxis
    : option.xAxis
      ? [option.xAxis]
      : [];
  const rawSeries = Array.isArray(option.series)
    ? option.series
    : option.series
      ? [option.series]
      : [];
  let converted = false;
  const categoryCounts = xAxes.map((axis) => {
    if (!axis || typeof axis !== "object") return 0;
    const data = (axis as { data?: unknown }).data;
    return Array.isArray(data) ? data.length : 0;
  });
  const markAreaCarriers: Record<string, unknown>[] = [];
  const series = rawSeries.map((item) => {
    if (!item || typeof item !== "object") return item;
    const seriesOption = item as Record<string, unknown>;
    if (seriesOption.type !== "bar") return item;

    const axisIndex =
      typeof seriesOption.xAxisIndex === "number" ? seriesOption.xAxisIndex : 0;
    const axis = xAxes[axisIndex];
    if (
      !axis ||
      typeof axis !== "object" ||
      (axis as { type?: unknown }).type !== "category"
    ) {
      return item;
    }

    converted = true;
    const lineSeries = { ...seriesOption };
    [
      "barCategoryGap",
      "barGap",
      "barMaxWidth",
      "barMinHeight",
      "barMinWidth",
      "barWidth",
    ].forEach((key) => delete lineSeries[key]);
    const originalItemStyle =
      lineSeries.itemStyle && typeof lineSeries.itemStyle === "object"
        ? (lineSeries.itemStyle as Record<string, unknown>)
        : {};
    const itemStyle = { ...originalItemStyle };
    delete itemStyle.borderRadius;
    const originalLineStyle =
      lineSeries.lineStyle && typeof lineSeries.lineStyle === "object"
        ? (lineSeries.lineStyle as Record<string, unknown>)
        : {};
    const originalLabel =
      lineSeries.label && typeof lineSeries.label === "object"
        ? (lineSeries.label as Record<string, unknown>)
        : {};
    const originalLabelLayout = lineSeries.labelLayout;
    const categoryCount = categoryCounts[axisIndex] ?? 0;
    const seriesColor =
      typeof itemStyle.color === "string" ? itemStyle.color : undefined;
    const markArea = lineSeries.markArea;

    if (markArea && typeof markArea === "object") {
      markAreaCarriers.push({
        animation: false,
        data: Array.isArray(seriesOption.data)
          ? seriesOption.data.map(() => 0)
          : Array.from({ length: categoryCount }, () => 0),
        emphasis: { disabled: true },
        itemStyle: { color: "transparent", opacity: 0 },
        markArea,
        name: "",
        silent: true,
        tooltip: { show: false },
        type: "bar",
        xAxisIndex: axisIndex,
        yAxisIndex:
          typeof seriesOption.yAxisIndex === "number"
            ? seriesOption.yAxisIndex
            : 0,
        z: -10,
      });
      delete lineSeries.markArea;
    }

    return {
      ...lineSeries,
      connectNulls: false,
      itemStyle: seriesColor ? { color: seriesColor } : undefined,
      label: {
        ...originalLabel,
        align: "left",
        distance: 7,
        position: "top",
        rotate: CHART_VALUE_LABEL_ANGLE,
        show: true,
        verticalAlign: "middle",
      },
      labelLayout: composeChartValueLabelLayout(originalLabelLayout, {
        angled: true,
        hideOverlap: false,
      }),
      lineStyle: {
        ...(seriesColor ? { color: seriesColor } : {}),
        opacity:
          typeof itemStyle.opacity === "number" ? itemStyle.opacity : 0.96,
        width: 2.25,
        ...originalLineStyle,
      },
      showSymbol: categoryCount <= 31,
      smooth: categoryCount <= 31 ? 0.16 : false,
      symbol: "circle",
      symbolSize: categoryCount > 31 ? 3 : 5,
      type: "line",
    };
  });

  if (!converted) return option;

  const xAxis = Array.isArray(option.xAxis)
    ? option.xAxis.map((axis) =>
        axis && typeof axis === "object" && axis.type === "category"
          ? { ...axis, boundaryGap: false }
          : axis,
      )
    : option.xAxis && typeof option.xAxis === "object"
      ? { ...option.xAxis, boundaryGap: false }
      : option.xAxis;
  const tooltip =
    option.tooltip &&
    !Array.isArray(option.tooltip) &&
    typeof option.tooltip === "object"
      ? {
          ...option.tooltip,
          axisPointer: {
            ...(option.tooltip.axisPointer &&
            typeof option.tooltip.axisPointer === "object"
              ? option.tooltip.axisPointer
              : {}),
            type: "line",
          },
        }
      : option.tooltip;

  return {
    ...option,
    series: markAreaCarriers.length ? [...markAreaCarriers, ...series] : series,
    tooltip,
    xAxis,
  } as EnterpriseChartOption;
}
