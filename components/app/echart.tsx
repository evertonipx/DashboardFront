"use client";

import * as React from "react";
import {
  BarChart,
  CustomChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
} from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { LabelLayout, LegacyGridContainLabel } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

import { useTheme } from "@/components/app/theme-provider";
import {
  useWidgetChartType,
  useWidgetZoom,
} from "@/components/app/widget-appearance";
import type { CardChartType } from "@/lib/view-preferences";
import { cn } from "@/lib/utils";

echarts.use([
  BarChart,
  CustomChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  LabelLayout,
  LegacyGridContainLabel,
  CanvasRenderer,
]);

export type EnterpriseChartOption = EChartsCoreOption & {
  grid?: GridComponentOption;
  legend?: LegendComponentOption;
  tooltip?: TooltipComponentOption;
};

type EChartProps = {
  option: EnterpriseChartOption;
  ariaDescription?: string;
  ariaLabel?: string;
  className?: string;
  mergeUpdates?: boolean;
  themeMode?: "auto" | "explicit";
  valueLabels?: "auto" | "always" | "none";
};

export function EChart({
  option,
  ariaDescription,
  ariaLabel,
  className,
  mergeUpdates = false,
  themeMode = "auto",
  valueLabels = "auto",
}: EChartProps) {
  const { effectiveTheme } = useTheme();
  const chartType = useWidgetChartType();
  const zoom = useWidgetZoom();
  const prefersReducedMotion = usePrefersReducedMotion();
  const descriptionId = React.useId();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<EChartsType | null>(null);
  const themedOption = React.useMemo(() => {
    const interactiveOption = enhanceInteractiveChartOption(
      applyChartTypePreference(option, chartType),
      effectiveTheme === "dark",
      valueLabels,
    );
    const visualOption = themeMode === "explicit"
      ? interactiveOption
      : applyChartTheme(interactiveOption, effectiveTheme === "dark");
    return prefersReducedMotion
      ? disableChartMotion(visualOption)
      : visualOption;
  }, [
    chartType,
    effectiveTheme,
    option,
    prefersReducedMotion,
    themeMode,
    valueLabels,
  ]);
  const accessibility = React.useMemo(
    () => resolveChartAccessibility(option, ariaLabel, ariaDescription),
    [ariaDescription, ariaLabel, option],
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, null, {
      renderer: "canvas",
    });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [chartType, prefersReducedMotion]);

  React.useEffect(() => {
    const chart = chartRef.current;
    chart?.setOption(themedOption, {
      lazyUpdate: false,
      notMerge: !mergeUpdates,
    });
  }, [mergeUpdates, themedOption]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      chartRef.current?.resize();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [zoom]);

  return (
    <div
      aria-describedby={descriptionId}
      aria-label={accessibility.label}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
      data-echart
      data-chart-type={chartType}
      data-chart-theme-mode={themeMode}
      data-chart-update-mode={mergeUpdates ? "merge" : "replace"}
      data-chart-value-labels={valueLabels}
      data-chart-zoom={Math.round(zoom * 100)}
      role="group"
      tabIndex={0}
    >
      <span id={descriptionId} className="sr-only">
        {accessibility.description}
      </span>
      <div
        ref={containerRef}
        className="absolute left-1/2 top-1/2"
        style={{
          height: `${100 / zoom}%`,
          transform: `translate(-50%, -50%) scale(${zoom})`,
          transformOrigin: "center",
          width: `${100 / zoom}%`,
        }}
      />
    </div>
  );
}

function resolveChartAccessibility(
  option: EnterpriseChartOption,
  explicitLabel?: string,
  explicitDescription?: string,
) {
  const series = chartSeriesRecords(option);
  const seriesNames = Array.from(
    new Set(
      series.flatMap((item) =>
        typeof item.name === "string" && item.name.trim()
          ? [item.name.trim()]
          : [],
      ),
    ),
  );
  const title = chartOptionTitle(option);
  const label =
    nonEmptyText(explicitLabel) ??
    title ??
    (seriesNames.length === 1
      ? `Gráfico de ${seriesNames[0]}`
      : seriesNames.length > 1
        ? `Gráfico com ${seriesNames.length} séries`
        : "Gráfico de dados");
  const description =
    nonEmptyText(explicitDescription) ??
    chartOptionAriaDescription(option) ??
    (seriesNames.length
      ? `${label}. Séries apresentadas: ${seriesNames.join(", ")}.`
      : `${label}. A descrição detalhada dos dados está disponível no contexto deste widget.`);

  return { description, label };
}

function chartSeriesRecords(option: EnterpriseChartOption) {
  const rawSeries = option.series;
  const series = Array.isArray(rawSeries)
    ? rawSeries
    : rawSeries
      ? [rawSeries]
      : [];
  return series.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}

function chartOptionTitle(option: EnterpriseChartOption) {
  const rawTitle = option.title;
  const titles = Array.isArray(rawTitle) ? rawTitle : rawTitle ? [rawTitle] : [];
  for (const title of titles) {
    if (!title || typeof title !== "object") continue;
    const text = nonEmptyText((title as { text?: unknown }).text);
    if (text) return text;
  }
  return undefined;
}

function chartOptionAriaDescription(option: EnterpriseChartOption) {
  if (!option.aria || typeof option.aria !== "object") return undefined;
  const label = (option.aria as { label?: unknown }).label;
  if (!label || typeof label !== "object") return undefined;
  return nonEmptyText((label as { description?: unknown }).description);
}

function nonEmptyText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return prefersReducedMotion;
}

function disableChartMotion(
  option: EnterpriseChartOption,
): EnterpriseChartOption {
  const disableSeriesMotion = (series: unknown) => {
    if (!series || typeof series !== "object") return series;
    return {
      ...(series as Record<string, unknown>),
      animation: false,
      animationDelay: 0,
      animationDelayUpdate: 0,
      animationDuration: 0,
      animationDurationUpdate: 0,
      universalTransition: false,
    };
  };
  const tooltip =
    option.tooltip &&
    !Array.isArray(option.tooltip) &&
    typeof option.tooltip === "object"
      ? { ...option.tooltip, transitionDuration: 0 }
      : option.tooltip;
  const stateAnimation =
    option.stateAnimation && typeof option.stateAnimation === "object"
      ? option.stateAnimation
      : {};

  return {
    ...option,
    animation: false,
    animationDelay: 0,
    animationDelayUpdate: 0,
    animationDuration: 0,
    animationDurationUpdate: 0,
    series: Array.isArray(option.series)
      ? option.series.map(disableSeriesMotion)
      : disableSeriesMotion(option.series),
    stateAnimation: {
      ...stateAnimation,
      duration: 0,
    },
    tooltip,
  } as EnterpriseChartOption;
}

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
    const originalLabelLayout =
      lineSeries.labelLayout && typeof lineSeries.labelLayout === "object"
        ? (lineSeries.labelLayout as Record<string, unknown>)
        : {};
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
        rotate: 90,
        show: true,
        verticalAlign: "middle",
      },
      labelLayout: {
        ...originalLabelLayout,
        hideOverlap: false,
      },
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

function resolveLineValueLabelPresentation(
  valueLabels: "auto" | "always" | "none",
) {
  const showEveryPoint = valueLabels !== "none";

  return {
    align: "left" as const,
    distance: 7,
    position: "top" as const,
    rotate: 90,
    verticalAlign: "middle" as const,
    ...(showEveryPoint ? { show: true } : {}),
    ...(valueLabels === "none" ? { show: false } : {}),
  };
}

function enhanceInteractiveChartOption(
  option: EnterpriseChartOption,
  dark = false,
  valueLabels: "auto" | "always" | "none" = "auto",
): EnterpriseChartOption {
  const rawSeries = option.series;
  const series = Array.isArray(rawSeries)
    ? rawSeries
    : rawSeries
      ? [rawSeries]
      : [];
  const pointCount = chartPointCount(option, series);
  const showAutomaticValueLabels =
    valueLabels === "always" ||
    (valueLabels === "auto" && pointCount > 0 && pointCount <= 24);
  const horizontal =
    firstAxisType(option.xAxis) === "value" &&
    firstAxisType(option.yAxis) === "category";
  const enhancedSeries = series.map((item) => {
    if (!item || typeof item !== "object") return item;

    const seriesOption = item as Record<string, unknown>;
    const emphasis =
      seriesOption.emphasis && typeof seriesOption.emphasis === "object"
        ? (seriesOption.emphasis as Record<string, unknown>)
        : {};

    const existingLabel =
      seriesOption.label && typeof seriesOption.label === "object"
        ? (seriesOption.label as Record<string, unknown>)
        : null;
    const supportsValueLabels =
      (seriesOption.type === "bar" || seriesOption.type === "line") &&
      !isDecorativeChartSeries(seriesOption);
    const verticalBarLabel = seriesOption.type === "bar" && !horizontal;
    const lineValueLabel = seriesOption.type === "line";
    const lineValueLabelPresentation = lineValueLabel
      ? resolveLineValueLabelPresentation(valueLabels)
      : null;
    const showEveryLinePoint = lineValueLabelPresentation?.show === true;
    const anchoredValueLabel = verticalBarLabel || lineValueLabel;
    const valueLabel = supportsValueLabels &&
      (existingLabel || showAutomaticValueLabels || showEveryLinePoint)
      ? {
          // A 90-degree label needs a left anchor: after rotation its whole
          // height grows upward from the bar top instead of crossing it.
          align: horizontal || verticalBarLabel ? "left" : "center",
          color: dark ? "#D4D4D8" : "#334155",
          distance: horizontal ? 6 : verticalBarLabel ? 5 : 6,
          fontSize: 10,
          fontWeight: 600,
          formatter: (params: { value?: unknown }) =>
            formatChartValueLabel(params.value),
          position: horizontal ? "right" : "top",
          rotate: verticalBarLabel ? 90 : 0,
          show: true,
          verticalAlign:
            horizontal || verticalBarLabel ? "middle" : "bottom",
          ...(existingLabel ?? {}),
          ...(valueLabels === "none" ? { show: false } : {}),
          // Line charts keep one vertical value anchored to every point,
          // including labels inherited from a bar chart preference.
          ...(lineValueLabelPresentation ?? {}),
        }
      : existingLabel;
    const existingLabelLayout =
      seriesOption.labelLayout && typeof seriesOption.labelLayout === "object"
        ? (seriesOption.labelLayout as Record<string, unknown>)
        : {};

    return {
      ...seriesOption,
      emphasis: {
        blurScope: "coordinateSystem",
        focus: "series",
        ...emphasis,
      },
      ...(valueLabel ? { label: valueLabel } : {}),
      ...(supportsValueLabels
        ? {
            labelLayout: {
              ...existingLabelLayout,
              // Every line point remains visible. Exceptionally dense widgets
              // opt out explicitly with valueLabels="none".
              hideOverlap: !showEveryLinePoint,
              // Keep bar and point labels centered on their own data item.
              // Dense charts may hide a collision instead of shifting the
              // value away from the bar or point it describes.
              ...(anchoredValueLabel
                ? {}
                : { moveOverlap: horizontal ? "shiftY" : "shiftX" }),
            },
          }
        : {}),
    };
  });
  const categoryCount = categoryAxisLength(option.xAxis);
  const tooltip =
    option.tooltip &&
    !Array.isArray(option.tooltip) &&
    typeof option.tooltip === "object"
      ? {
          enterable: true,
          hideDelay: 80,
          transitionDuration: 0.16,
          triggerOn: "mousemove|click",
          ...option.tooltip,
        }
      : option.tooltip;
  const aria =
    option.aria && typeof option.aria === "object"
      ? (option.aria as Record<string, unknown>)
      : {};
  const ariaLabel =
    aria.label && typeof aria.label === "object"
      ? (aria.label as Record<string, unknown>)
      : {};

  return {
    ...option,
    animationDuration: option.animationDuration ?? 360,
    animationDurationUpdate: option.animationDurationUpdate ?? 460,
    animationEasing: option.animationEasing ?? "cubicOut",
    animationEasingUpdate: option.animationEasingUpdate ?? "cubicOut",
    animationThreshold: option.animationThreshold ?? 2_000,
    aria: {
      ...aria,
      enabled: true,
      label: {
        data: {
          allData: " Os dados são: ",
          partialData: " Os primeiros {displayCnt} itens são: ",
          separator: { end: ". ", middle: ", " },
          withName: "o valor de {name} é {value}",
          withoutName: "{value}",
        },
        enabled: true,
        general: {
          withTitle: 'Este é um gráfico intitulado "{title}".',
          withoutTitle: "Este é um gráfico.",
        },
        series: {
          multiple: {
            prefix: " Ele possui {seriesCount} séries.",
            separator: { end: "", middle: "" },
            withName:
              " A série {seriesId} é do tipo {seriesType} e representa {seriesName}.",
            withoutName: " A série {seriesId} é do tipo {seriesType}.",
          },
          single: {
            prefix: "",
            withName: " Série do tipo {seriesType}, representando {seriesName}.",
            withoutName: " Série do tipo {seriesType}.",
          },
        },
        ...ariaLabel,
      },
    },
    dataZoom:
      option.dataZoom ??
      (categoryCount > 31
        ? [
            {
              filterMode: "none",
              moveOnMouseMove: true,
              moveOnMouseWheel: "shift",
              preventDefaultMouseMove: false,
              throttle: 50,
              type: "inside",
              xAxisIndex: 0,
              zoomOnMouseWheel: "ctrl",
            },
          ]
        : undefined),
    grid: valueLabelGrid(option.grid, enhancedSeries, horizontal),
    series: enhancedSeries.length ? enhancedSeries : rawSeries,
    stateAnimation: {
      duration: 180,
      easing: "cubicOut",
      ...(option.stateAnimation && typeof option.stateAnimation === "object"
        ? option.stateAnimation
        : {}),
    },
    tooltip,
  } as EnterpriseChartOption;
}

function firstAxisType(axis: unknown) {
  const first = Array.isArray(axis) ? axis[0] : axis;
  return first && typeof first === "object"
    ? (first as { type?: unknown }).type
    : undefined;
}

function isDecorativeChartSeries(series: Record<string, unknown>) {
  const name = typeof series.name === "string" ? series.name.toLowerCase() : "";
  const itemStyle =
    series.itemStyle && typeof series.itemStyle === "object"
      ? (series.itemStyle as Record<string, unknown>)
      : {};
  const color = typeof itemStyle.color === "string" ? itemStyle.color : "";

  return (
    series.silent === true ||
    itemStyle.opacity === 0 ||
    color === "transparent" ||
    color.includes("rgba(0,0,0,0)") ||
    name.includes("média-base") ||
    name.includes("média móvel") ||
    name.includes("meta") ||
    name.includes("limiar") ||
    name.includes("limite ") ||
    name === "base" ||
    name === "intervalo"
  );
}

function formatChartValueLabel(value: unknown) {
  const rawValue = Array.isArray(value) ? value[value.length - 1] : value;
  if (rawValue === null || rawValue === undefined || rawValue === "") return "";
  const numericValue =
    typeof rawValue === "number" ? rawValue : Number(String(rawValue));

  if (!Number.isFinite(numericValue)) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
    numericValue,
  );
}

function valueLabelGrid(
  grid: EnterpriseChartOption["grid"],
  series: unknown[],
  horizontal: boolean,
) {
  if (!grid || Array.isArray(grid) || typeof grid !== "object") return grid;
  const visibleValueLabelSeries = series.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const seriesOption = item as {
      label?: unknown;
      type?: unknown;
    };
    if (seriesOption.type !== "bar" && seriesOption.type !== "line") {
      return false;
    }
    if (!seriesOption.label || typeof seriesOption.label !== "object") {
      return false;
    }
    return (seriesOption.label as { show?: unknown }).show !== false;
  });
  if (!visibleValueLabelSeries.length) return grid;
  const hasVerticalValueLabels = visibleValueLabelSeries.some((item) => {
    const rotate = (item as { label?: { rotate?: unknown } }).label?.rotate;
    return typeof rotate === "number" && Math.abs(rotate % 180) === 90;
  });

  return {
    ...grid,
    right: horizontal
      ? numericGridOffset(grid.right, 58)
      : grid.right,
    top: horizontal
      ? grid.top
      : numericGridOffset(grid.top, hasVerticalValueLabels ? 56 : 38),
  };
}

function numericGridOffset(value: unknown, minimum: number) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(numeric) ? Math.max(numeric, minimum) : minimum;
}

function categoryAxisLength(axis: unknown) {
  const axes = Array.isArray(axis) ? axis : axis ? [axis] : [];

  return axes.reduce((largest, axis) => {
    if (!axis || typeof axis !== "object") return largest;
    const data = (axis as { data?: unknown }).data;
    return Array.isArray(data) ? Math.max(largest, data.length) : largest;
  }, 0);
}

function chartPointCount(
  option: EnterpriseChartOption,
  series: unknown[],
) {
  const axisCount = Math.max(
    categoryAxisLength(option.xAxis),
    categoryAxisLength(option.yAxis),
  );
  const seriesCount = series.reduce<number>((largest, item) => {
    if (!item || typeof item !== "object") return largest;
    const data = (item as { data?: unknown }).data;
    return Array.isArray(data) ? Math.max(largest, data.length) : largest;
  }, 0);
  return Math.max(axisCount, seriesCount);
}

function applyChartTheme(option: EnterpriseChartOption, dark: boolean) {
  if (!dark) return option;

  return mapChartValue(option, {
    "#ffffff": "#18181b",
    "#FFFFFF": "#18181b",
    "#F8FBFF": "#141416",
    "#082F49": "#0f172a",
    "#1267C4": "#5aa8ff",
    "#5AA8F5": "#8fc6ff",
    "#0B4EA2": "#9bd0ff",
    "#EAF3FF": "#172033",
    "#EAF8F4": "#142422",
    "#FFF7E8": "#2B2418",
    "#B7D7FF": "#35577E",
    "#E8C98E": "#6A5530",
    "#F3F8FF": "#141B2A",
    "#D8E9FF": "#263E5D",
    "#0F766E": "#2dd4bf",
    "#2DD4BF": "#5eead4",
    "#778699": "#a8b3c1",
    "#64748B": "#94a3b8",
    "#94A3B8": "#cbd5e1",
    "#A16207": "#f6c453",
    "#B45309": "#fbbf24",
    "#C2410C": "#fb923c",
    "#F59E0B": "#fcd34d",
    "#F97316": "#9a3412",
    "#8EC5FF": "#93c5fd",
    "#A7E3B3": "#86efac",
    "#FFD6A5": "#fdba74",
    "#FFADAD": "#fca5a5",
    "#CDB4DB": "#d8b4fe",
    "#BDE0FE": "#bae6fd",
    "#B8E0D2": "#99f6e4",
    "#FDE68A": "#fde68a",
    "#FBCFE8": "#f9a8d4",
    "#C7D2FE": "#c7d2fe",
    "#A5F3FC": "#67e8f9",
    "#DDD6FE": "#ddd6fe",
    "#FDE047": "#854d0e",
    "#A855F7": "#581c87",
    "#FB7185": "#881337",
    "#DC2626": "#7f1d1d",
    "#334155": "#d4d4d8",
    "#B7C7DA": "#64748b",
    "#8FA5BE": "#94a3b8",
    "#526477": "#d4d4d8",
    "#D8E3F2": "#2a2a30",
    "#13233A": "#f4f4f5",
    "#66758A": "#a1a1aa",
    "#E8EEF6": "#232328",
    "rgba(18, 103, 196, 0.06)": "rgba(90, 168, 255, 0.14)",
    "rgba(18, 103, 196, 0.05)": "rgba(90, 168, 255, 0.12)",
    "rgba(18, 103, 196, 0.032)": "rgba(90, 168, 255, 0.055)",
    "rgba(15, 118, 110, 0.045)": "rgba(45, 212, 191, 0.06)",
    "rgba(196, 138, 56, 0.075)": "rgba(246, 196, 83, 0.085)",
    "rgba(196, 138, 56, 0.18)": "rgba(246, 196, 83, 0.22)",
  }) as EnterpriseChartOption;
}

function mapChartValue(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === "string") {
    return replacements[value] ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mapChartValue(item, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        mapChartValue(item, replacements),
      ]),
    );
  }

  return value;
}

export async function renderEChartToDataUrl(
  option: EnterpriseChartOption,
  {
    width = 980,
    height = 360,
  }: {
    width?: number;
    height?: number;
  } = {},
) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.pointerEvents = "none";
  container.style.background = "#ffffff";
  document.body.appendChild(container);
  let chart: EChartsType | null = null;

  try {
    chart = echarts.init(container, null, {
      height,
      renderer: "canvas",
      width,
    });

    chart.setOption(
      {
        ...option,
        animation: false,
        animationDuration: 0,
        animationDurationUpdate: 0,
      },
      true,
    );
    chart.resize({ height, width });
    await waitForChartRender(chart);
    flushChartRenderer(chart);

    return chart.getDataURL({
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      type: "png",
    });
  } finally {
    chart?.dispose();
    container.remove();
  }
}

async function waitForChartRender(chart: EChartsType) {
  await new Promise<void>((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(finish, 300);

    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      chart.off("finished", finish);
      resolve();
    }

    chart.on("finished", finish);
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
  });
}

function flushChartRenderer(chart: EChartsType) {
  const renderer = chart.getZr() as {
    flush?: () => void;
    refreshImmediately?: () => void;
  };

  renderer.refreshImmediately?.();
  renderer.flush?.();
}
