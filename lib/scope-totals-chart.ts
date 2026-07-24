import type { EnterpriseChartOption } from "@/components/app/echart";
import { pastelBarColor } from "@/lib/chart-palette";
import { formatNumber } from "@/lib/utils";

export type ScopeTotalPoint = {
  id: string;
  name: string;
  total: number;
};

export function buildScopeTotalsComparisonOption(
  points: ScopeTotalPoint[],
  widgetColor = "#1267C4",
  seriesName = "Total",
): EnterpriseChartOption {
  const dense = points.length > 12;
  const veryDense = points.length > 24;

  return {
    color: [widgetColor],
    grid: {
      bottom: veryDense ? 88 : dense ? 72 : 42,
      containLabel: true,
      left: 36,
      right: 18,
      top: 12,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      padding: [10, 12],
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : `${formatNumber(Number(value))} eventos`,
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
        hideOverlap: true,
        interval: 0,
        overflow: "truncate",
        rotate: veryDense ? 45 : dense ? 28 : 0,
        width: dense ? 92 : undefined,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: points.map((point) => point.name),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 11 },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: veryDense ? "18%" : dense ? "28%" : "36%",
        barMaxWidth: veryDense ? 24 : dense ? 30 : 34,
        data: points.map((point, index) => ({
          itemStyle: {
            color: index === 0 ? widgetColor : pastelBarColor(index),
          },
          value: point.total,
        })),
        emphasis: { itemStyle: { color: widgetColor } },
        itemStyle: { borderRadius: [2, 2, 0, 0] },
        name: seriesName,
        type: "bar",
      },
    ],
  };
}
