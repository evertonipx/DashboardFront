import type { EnterpriseChartOption } from "@/components/app/echart";
import type { ScenarioHourlyOccupancyPoint } from "@/lib/scenario-analytics";
import { formatNumber } from "@/lib/utils";

export function buildHourlyOccupancyOption(
  points: ScenarioHourlyOccupancyPoint[],
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  return {
    grid: { bottom: 8, containLabel: true, left: 8, right: 12, top: 18 },
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
          entries?: number;
          exits?: number;
          hourLabel?: string;
          value?: number;
        };

        return [
          `<strong>${point.hourLabel ?? "Hora"}</strong>`,
          `Entradas acumuladas: ${formatNumber(point.entries ?? 0)}`,
          `Saídas acumuladas: ${formatNumber(point.exits ?? 0)}`,
          `Ocupação estimada: ${formatNumber(point.value ?? 0)}`,
        ].join("<br />");
      },
      padding: [10, 12],
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 9,
        hideOverlap: true,
        interval: points.length > 36 ? "auto" : 1,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: points.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "34%",
        barMaxWidth: 30,
        data: points.map((point) =>
          point.occupancy === null
            ? null
            : {
                entries: point.entries,
                exits: point.exits,
                itemStyle: {
                  borderRadius:
                    point.occupancy >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
                  color: point.occupancy >= 0 ? widgetColor : "#D999A2",
                },
                hourLabel: point.label,
                label: {
                  position: point.occupancy >= 0 ? "top" : "bottom",
                },
                value: point.occupancy,
              },
        ),
        label: {
          color: "#526477",
          fontSize: 9,
          formatter: (params: { value?: number }) => {
            const value = Number(params.value ?? 0);
            return value ? formatNumber(value) : "";
          },
          show: true,
        },
        name: "Ocupação estimada",
        type: "bar",
      },
    ],
  };
}
