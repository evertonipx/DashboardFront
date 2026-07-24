import type { EnterpriseChartOption } from "@/components/app/echart";
import { formatNumber } from "@/lib/utils";

export type CurrentYearMonthPoint = {
  accumulated: number | null;
  label: string;
  month: number;
  value: number | null;
};

export function buildCurrentYearComparisonOption(
  points: CurrentYearMonthPoint[],
  accumulated: boolean,
  year: number,
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  const values = points.map((point) =>
    accumulated ? point.accumulated : point.value,
  );
  const recordedValues = points.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  const average = recordedValues.length
    ? recordedValues.reduce((sum, value) => sum + value, 0) /
      recordedValues.length
    : 0;
  const averageName = `Média mensal de ${year}`;

  return {
    color: [widgetColor, "#C48A38"],
    grid: { bottom: 8, containLabel: true, left: 8, right: 10, top: 58 },
    legend: {
      data: [String(year), ...(!accumulated && average ? [averageName] : [])],
      itemGap: 12,
      itemHeight: 9,
      itemWidth: 9,
      left: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : formatNumber(Number(value)),
    },
    xAxis: {
      axisLabel: { color: "#66758A", fontSize: 10, interval: 0 },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: points.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: number) => compactChartNumber(value),
      },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "30%",
        barMaxWidth: 28,
        data: values,
        emphasis: { focus: "series" },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: widgetColor,
        },
        label: {
          align: "left",
          color: "#526477",
          distance: 7,
          fontSize: 9,
          formatter: (params: { value?: number | null }) => {
            const value = params.value;
            return value === null || value === undefined || value === 0
              ? ""
              : compactChartNumber(value);
          },
          position: "top",
          rotate: 90,
          show: true,
          verticalAlign: "middle",
        },
        name: String(year),
        type: "bar",
      },
      ...(!accumulated && average
        ? [
            {
              animation: false,
              data: points.map((point) =>
                point.value === null ? null : average,
              ),
              itemStyle: { color: "#D49A45" },
              lineStyle: {
                color: "#C48A38",
                opacity: 0.72,
                type: "dashed",
                width: 1,
              },
              name: averageName,
              showSymbol: false,
              silent: true,
              symbol: "none",
              type: "line",
            },
          ]
        : []),
    ],
  };
}

function compactChartNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}
