"use client";

import * as React from "react";
import {
  BarChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

import { useTheme } from "@/components/app/theme-provider";
import { cn } from "@/lib/utils";

echarts.use([
  BarChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  LabelLayout,
  CanvasRenderer,
]);

export type EnterpriseChartOption = EChartsCoreOption & {
  grid?: GridComponentOption;
  legend?: LegendComponentOption;
  tooltip?: TooltipComponentOption;
};

type EChartProps = {
  option: EnterpriseChartOption;
  className?: string;
};

export function EChart({ option, className }: EChartProps) {
  const { effectiveTheme } = useTheme();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<EChartsType | null>(null);
  const themedOption = React.useMemo(
    () =>
      applyChartTheme(
        enhanceInteractiveChartOption(option),
        effectiveTheme === "dark",
      ),
    [effectiveTheme, option],
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
  }, []);

  React.useEffect(() => {
    chartRef.current?.setOption(themedOption, {
      lazyUpdate: false,
      notMerge: true,
    });
  }, [themedOption]);

  return <div ref={containerRef} className={cn("h-full w-full", className)} />;
}

function enhanceInteractiveChartOption(
  option: EnterpriseChartOption,
): EnterpriseChartOption {
  const rawSeries = option.series;
  const series = Array.isArray(rawSeries)
    ? rawSeries
    : rawSeries
      ? [rawSeries]
      : [];
  const enhancedSeries = series.map((item) => {
    if (!item || typeof item !== "object") return item;

    const seriesOption = item as Record<string, unknown>;
    const emphasis =
      seriesOption.emphasis && typeof seriesOption.emphasis === "object"
        ? (seriesOption.emphasis as Record<string, unknown>)
        : {};

    return {
      ...seriesOption,
      emphasis: {
        blurScope: "coordinateSystem",
        focus: "series",
        ...emphasis,
      },
    };
  });
  const categoryCount = categoryXAxisLength(option.xAxis);
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

function categoryXAxisLength(xAxis: unknown) {
  const axes = Array.isArray(xAxis) ? xAxis : xAxis ? [xAxis] : [];

  return axes.reduce((largest, axis) => {
    if (!axis || typeof axis !== "object") return largest;
    const data = (axis as { data?: unknown }).data;
    return Array.isArray(data) ? Math.max(largest, data.length) : largest;
  }, 0);
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
    "#B7D7FF": "#35577E",
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

  const chart = echarts.init(container, null, {
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

  const dataUrl = chart.getDataURL({
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    type: "png",
  });

  chart.dispose();
  container.remove();

  return dataUrl;
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
