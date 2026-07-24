import type { EnterpriseChartOption } from "@/components/app/echart";
import { pastelBarColor } from "@/lib/chart-palette";
import type { ScenarioCumulativeTotalPoint } from "@/lib/scenario-analytics";
import { formatNumber } from "@/lib/utils";

export function buildScenarioCumulativeTotalsOption(
  points: ScenarioCumulativeTotalPoint[],
  widgetColor = "#1267C4",
  seriesName = "Acumulado no período",
): EnterpriseChartOption {
  return {
    grid: { bottom: 8, containLabel: true, left: 8, right: 82, top: 8 },
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        if (!params || typeof params !== "object") return "";
        const data = (params as { data?: unknown }).data;
        if (!data || typeof data !== "object") return "";
        const point = data as {
          scenarioName?: string;
          share?: number;
          value?: number;
        };

        return [
          `<strong>${point.scenarioName ?? "Cenário"}</strong>`,
          `Acumulado: ${formatNumber(point.value ?? 0)}`,
          `Participação: ${new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 1,
            style: "percent",
          }).format(point.share ?? 0)}`,
        ].join("<br />");
      },
      padding: [10, 12],
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: "#526477",
        fontSize: 11,
        overflow: "truncate",
        width: 220,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: points.map((point) => point.name),
      inverse: true,
      type: "category",
    },
    series: [
      {
        barCategoryGap: "34%",
        barMaxWidth: 28,
        data: points.map((point, index) => ({
          itemStyle: {
            borderRadius: [0, 3, 3, 0],
            color: index === 0 ? widgetColor : pastelBarColor(index + 2),
          },
          scenarioName: point.name,
          share: point.share,
          value: point.total,
        })),
        label: {
          color: "#526477",
          distance: 6,
          fontSize: 10,
          formatter: (params: { value?: number }) =>
            formatNumber(Number(params.value ?? 0)),
          position: "right",
          show: true,
        },
        name: seriesName,
        type: "bar",
      },
    ],
  };
}
