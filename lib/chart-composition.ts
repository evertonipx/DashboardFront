import type { EnterpriseChartOption } from "@/components/app/echart";
import { pastelBarColor } from "@/lib/chart-palette";
import { formatNumber } from "@/lib/utils";

export type ScenarioCompositionItem = {
  name: string;
  value: number;
};

export type ScenarioCompositionChartType = "rose" | "treemap";

export function buildScenarioCompositionOption(
  items: ScenarioCompositionItem[],
  primaryColor: string,
  chartType: ScenarioCompositionChartType = "rose",
): EnterpriseChartOption {
  const orderedItems = [...items]
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort(
      (left, right) =>
        right.value - left.value || left.name.localeCompare(right.name, "pt-BR"),
    );
  const total = orderedItems.reduce((sum, item) => sum + item.value, 0);

  return chartType === "treemap"
    ? buildTreemapOption(orderedItems, total, primaryColor)
    : buildRoseOption(orderedItems, total, primaryColor);
}

export function normalizeScenarioCompositionChartType(
  value: unknown,
): ScenarioCompositionChartType {
  return value === "treemap" ? "treemap" : "rose";
}

export function scenarioCompositionDescription(
  chartType: ScenarioCompositionChartType,
) {
  return chartType === "treemap"
    ? "A área de cada bloco mostra a participação proporcional dos cenários escolhidos."
    : "As pétalas mostram a participação proporcional dos cenários escolhidos.";
}

function buildRoseOption(
  items: ScenarioCompositionItem[],
  total: number,
  primaryColor: string,
): EnterpriseChartOption {
  return {
    legend: {
      bottom: 0,
      itemGap: 12,
      itemHeight: 9,
      itemWidth: 9,
      textStyle: { color: "#526477", fontSize: 10 },
      type: "scroll",
    },
    series: [
      {
        center: ["50%", "43%"],
        data: items.map((item, index) => ({
          itemStyle: {
            color: index === 0 ? primaryColor : pastelBarColor(index),
          },
          name: item.name,
          value: item.value,
        })),
        label: {
          color: "#526477",
          fontSize: 10,
          formatter: (params: { name?: string; value?: number }) =>
            `${params.name ?? ""}\n${formatCompositionValue(
              Number(params.value ?? 0),
              total,
            )}`,
        },
        labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
        labelLine: { length: 7, length2: 5, smooth: 0.15 },
        minAngle: 4,
        radius: ["18%", "67%"],
        roseType: "area",
        type: "pie",
      },
    ],
    tooltip: buildCompositionTooltip(total),
  } as EnterpriseChartOption;
}

function buildTreemapOption(
  items: ScenarioCompositionItem[],
  total: number,
  primaryColor: string,
): EnterpriseChartOption {
  return {
    series: [
      {
        breadcrumb: { show: false },
        data: items.map((item, index) => ({
          itemStyle: {
            color: index === 0 ? primaryColor : pastelBarColor(index),
          },
          name: item.name,
          value: item.value,
        })),
        emphasis: { focus: "self" },
        label: {
          color: "#13233A",
          fontSize: 10,
          formatter: (params: { name?: string; value?: number }) =>
            `${params.name ?? ""}\n${formatCompositionValue(
              Number(params.value ?? 0),
              total,
            )}`,
          lineHeight: 14,
          overflow: "break",
          show: true,
        },
        left: 2,
        nodeClick: false,
        roam: false,
        right: 2,
        top: 2,
        bottom: 2,
        itemStyle: {
          borderColor: "#FFFFFF",
          borderWidth: 2,
          gapWidth: 2,
        },
        type: "treemap",
      },
    ],
    tooltip: buildCompositionTooltip(total),
  } as EnterpriseChartOption;
}

function buildCompositionTooltip(total: number) {
  return {
    backgroundColor: "#ffffff",
    borderColor: "#D8E3F2",
    borderWidth: 1,
    confine: true,
    formatter: (params: unknown) => {
      const record = params as {
        data?: { value?: number };
        name?: string;
        value?: number;
      };
      const value = Number(record.value ?? record.data?.value ?? 0);
      return `${record.name ?? "Cenário"}<br/>${formatNumber(
        value,
      )} eventos · ${formatShare(value, total, 1)}`;
    },
    textStyle: { color: "#13233A", fontSize: 12 },
    trigger: "item",
  };
}

function formatCompositionValue(value: number, total: number) {
  return `${formatNumber(value)} · ${formatShare(value, total, 0)}`;
}

function formatShare(value: number, total: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits,
    style: "percent",
  }).format(total ? value / total : 0);
}
