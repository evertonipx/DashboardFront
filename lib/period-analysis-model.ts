import type { EnterpriseChartOption } from "@/components/app/echart";
import { buildCalendarAxisLabel } from "@/lib/chart-calendar-axis";
import {
  monochromeHeatmapPalette,
  pastelBarColor,
} from "@/lib/chart-palette";
import type {
  PeriodAnalysisBaseline,
  PeriodAnalysisWidget,
} from "@/lib/period-analysis-widgets";
import type { ReportMetric, ReportTable } from "@/lib/report-export";
import {
  buildCombinedScenarioPoints,
  buildScenarioRanking,
  selectScenarios,
  type ScenarioAnalyticsPoint,
} from "@/lib/scenario-analytics";
import type {
  AggregateEventRow,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export type PeriodAnalysisRange = {
  from: Date;
  to: Date;
};

export type PeriodAnalysisDataset = {
  error?: string;
  granularity: AggregateGranularity;
  rows: AggregateEventRow[];
};

export type PeriodAnalysisData = {
  baseline: Partial<Record<PeriodAnalysisBaseline, PeriodAnalysisDataset>>;
  day: PeriodAnalysisDataset;
  hour: PeriodAnalysisDataset;
};

export type PeriodAnalysisWidgetModel = {
  description: string;
  emptyText: string;
  error?: string;
  hasData: boolean;
  height: number;
  metrics?: ReportMetric[];
  minWidth?: number;
  option?: EnterpriseChartOption;
  table?: ReportTable;
};

const DEFAULT_COLOR = "#1267C4";
const MUTED_BASE_COLOR = "#AEB8C6";
const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}h`,
);

export function buildPeriodAnalysisWidgetModel({
  color = DEFAULT_COLOR,
  data,
  period,
  scenarios,
  widget,
}: {
  color?: string;
  data: PeriodAnalysisData;
  period: PeriodAnalysisRange;
  scenarios: Scenario[];
  widget: PeriodAnalysisWidget;
}): PeriodAnalysisWidgetModel {
  const selectedScenarios = selectScenarios(
    scenarios,
    widget.selectionMode,
    widget.scenarioIds,
  );

  if (!selectedScenarios.length) {
    return {
      description: widgetDescription(widget),
      emptyText: "Selecione ao menos um cenário para gerar esta análise.",
      hasData: false,
      height: widget.kind === "heatmap" ? 480 : 320,
    };
  }

  if (widget.kind === "summary") {
    return buildSummaryModel(data, period, selectedScenarios);
  }
  if (widget.kind === "timeline") {
    return buildTimelineModel(widget, data, period, selectedScenarios, color);
  }
  if (widget.kind === "comparison") {
    return buildComparisonModel(widget, data, period, selectedScenarios, color);
  }
  if (widget.kind === "ranking") {
    return buildRankingModel(data, period, selectedScenarios, color);
  }
  if (widget.kind === "heatmap") {
    return buildHeatmapModel(data, period, selectedScenarios, color);
  }
  if (widget.kind === "cumulative") {
    return buildCumulativeModel(widget, data, period, selectedScenarios, color);
  }
  if (widget.kind === "trend") {
    return buildTrendModel(data, period, selectedScenarios, color);
  }

  return buildHourProfileModel(data, period, selectedScenarios, color);
}

export function resolvePeriodAnalysisRange(from: string, to: string) {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);
  if (!fromDate || !toDate) return null;

  const toExclusive = addDays(toDate, 1);
  if (toExclusive <= fromDate) return null;
  return { from: fromDate, to: toExclusive } satisfies PeriodAnalysisRange;
}

export function periodAnalysisBaselineRange(
  period: PeriodAnalysisRange,
  baseline: PeriodAnalysisBaseline,
): PeriodAnalysisRange {
  if (baseline === "previous_period") {
    const duration = period.to.getTime() - period.from.getTime();
    return {
      from: new Date(period.from.getTime() - duration),
      to: new Date(period.to.getTime() - duration),
    };
  }

  const amount = baseline === "last_year" ? -12 : -1;
  return {
    from: shiftMonthsClamped(period.from, amount),
    to: shiftMonthsClamped(period.to, amount),
  };
}

export function periodAnalysisBaselineLabel(baseline: PeriodAnalysisBaseline) {
  if (baseline === "last_year") return "Mesmo período do ano anterior";
  if (baseline === "previous_month") return "Mês anterior";
  return "Período anterior equivalente";
}

export function formatPeriodAnalysisRange(period: PeriodAnalysisRange) {
  const end = addDays(period.to, -1);
  return `${formatDate(period.from)} a ${formatDate(end)}`;
}

function buildSummaryModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
): PeriodAnalysisWidgetModel {
  const points = combinedPoints(data.day, scenarios, period, "day");
  const ranking = buildScenarioRanking({
    from: period.from,
    rows: data.day.rows,
    scenarios,
    sourceGranularity: data.day.granularity,
    to: period.to,
  });
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const average = points.length ? total / points.length : 0;
  const peak = points.reduce<ScenarioAnalyticsPoint | null>(
    (largest, point) => (!largest || point.total > largest.total ? point : largest),
    null,
  );
  const leader = ranking[0];
  const metrics: ReportMetric[] = [
    {
      description: formatPeriodAnalysisRange(period),
      label: "Total do período",
      value: total,
    },
    {
      description: `${points.length} dia(s) consultado(s)`,
      label: "Média diária",
      value: Math.round(average),
    },
    {
      description: peak ? peak.label : "Sem dados",
      label: "Maior fluxo diário",
      value: peak?.total ?? 0,
    },
    {
      description: leader
        ? `${formatPercent(leader.share)} de representatividade`
        : "Sem dados",
      label: "Cenário líder",
      value: leader?.name ?? "-",
    },
  ];

  return {
    description: "Síntese executiva dos cenários escolhidos no intervalo.",
    emptyText: "Sem eventos nos cenários selecionados para este período.",
    error: data.day.error,
    hasData: total !== 0,
    height: 180,
    metrics,
    table: {
      columns: [
        { key: "indicator", label: "Indicador", width: 28 },
        { key: "value", label: "Valor", numeric: true, width: 18 },
        { key: "context", label: "Contexto", width: 42 },
      ],
      description: formatPeriodAnalysisRange(period),
      rows: metrics.map((metric) => ({
        context: metric.description,
        indicator: metric.label,
        value: metric.value,
      })),
      title: "Resumo do período",
    },
  };
}

function buildTimelineModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const dataset = widget.granularity === "hour" ? data.hour : data.day;
  const points = combinedPoints(dataset, scenarios, period, widget.granularity);
  const option = buildBarTimelineOption(points, color);

  return {
    description: `${granularityLabel(widget.granularity)} dos cenários selecionados em ${formatPeriodAnalysisRange(period)}.`,
    emptyText: "Sem fluxo no período e nos cenários selecionados.",
    error: dataset.error,
    hasData: points.some((point) => point.total !== 0),
    height: 330,
    minWidth: points.length > 40 ? Math.min(1600, points.length * 26) : undefined,
    option,
    table: pointsTable(widget.title, points),
  };
}

function buildComparisonModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const dataset = widget.granularity === "hour" ? data.hour : data.day;
  const series = scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    points: combinedPoints(dataset, [scenario], period, widget.granularity),
  }));
  const option = buildMultiScenarioOption(series, color);
  const labels = series[0]?.points.map((point) => point.label) ?? [];

  return {
    description: `${granularityLabel(widget.granularity)} com uma série para cada cenário escolhido.`,
    emptyText: "Sem dados nos cenários escolhidos para comparar.",
    error: dataset.error,
    hasData: series.some((item) =>
      item.points.some((point) => point.total !== 0),
    ),
    height: 360,
    minWidth: labels.length > 40 ? Math.min(1800, labels.length * 28) : undefined,
    option,
    table: {
      columns: [
        { key: "period", label: "Período", width: 20 },
        ...series.map((item) => ({
          key: scenarioColumnKey(item.id),
          label: item.name,
          numeric: true,
          width: 18,
        })),
      ],
      description: formatPeriodAnalysisRange(period),
      rows: labels.map((label, index) => {
        const row: Record<string, string | number> = { period: label };
        series.forEach((item) => {
          row[scenarioColumnKey(item.id)] = item.points[index]?.total ?? 0;
        });
        return row;
      }),
      title: widget.title,
    },
  };
}

function buildRankingModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const ranking = buildScenarioRanking({
    from: period.from,
    rows: data.day.rows,
    scenarios,
    sourceGranularity: data.day.granularity,
    to: period.to,
  });
  const displayed = [...ranking].reverse();
  const height = Math.max(290, ranking.length * 34 + 60);

  return {
    description: "Volume e representatividade apenas dos cenários escolhidos.",
    emptyText: "Sem fluxo para classificar os cenários selecionados.",
    error: data.day.error,
    hasData: ranking.length > 0,
    height,
    option: {
      color: [color],
      grid: { bottom: 24, containLabel: true, left: 16, right: 72, top: 12 },
      series: [
        {
          barMaxWidth: 22,
          data: displayed.map((point) => point.total),
          itemStyle: { borderRadius: [0, 3, 3, 0], color },
          label: {
            color: "#526477",
            formatter: (params: { dataIndex?: number }) => {
              const point = displayed[params.dataIndex ?? 0];
              return point ? `${formatPercent(point.share)}` : "";
            },
            position: "right",
            show: true,
          },
          type: "bar",
        },
      ],
      tooltip: {
        formatter: (params: { dataIndex?: number }) => {
          const point = displayed[params.dataIndex ?? 0];
          return point
            ? `${point.name}<br/><strong>${formatNumber(point.total)}</strong> · ${formatPercent(point.share)}`
            : "";
        },
        trigger: "item",
      },
      xAxis: {
        axisLabel: { color: "#66758A", hideOverlap: true },
        splitNumber: 4,
        splitLine: { lineStyle: { color: "#E8EEF6" } },
        type: "value",
      },
      yAxis: {
        axisLabel: { color: "#526477", width: 180, overflow: "truncate" },
        axisLine: { show: false },
        axisTick: { show: false },
        data: displayed.map((point) => point.name),
        type: "category",
      },
    } as EnterpriseChartOption,
    table: {
      columns: [
        { key: "position", label: "Posição", numeric: true, width: 12 },
        { key: "scenario", label: "Cenário", width: 32 },
        { key: "total", label: "Total", numeric: true, width: 18 },
        { key: "share", label: "Representatividade", width: 20 },
      ],
      description: formatPeriodAnalysisRange(period),
      rows: ranking.map((point, index) => ({
        position: index + 1,
        scenario: point.name,
        share: formatPercent(point.share),
        total: point.total,
      })),
      title: "Ranking de cenários",
    },
  };
}

function buildHeatmapModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const points = combinedPoints(data.hour, scenarios, period, "hour");
  const days = listDayStarts(period.from, period.to);
  const dayIndexes = new Map(
    days.map((day, index) => [calendarDayKey(day), index]),
  );
  const heatmapData = points.map((point) => {
    const bucket = new Date(point.bucket);
    return [
      dayIndexes.get(calendarDayKey(bucket)) ?? 0,
      bucket.getHours(),
      point.total,
    ];
  });
  const max = Math.max(1, ...points.map((point) => point.total));
  const saturdayIndexes = days.flatMap((day, index) =>
    day.getDay() === 6 ? [index] : [],
  );
  const sundayIndexes = days.flatMap((day, index) =>
    day.getDay() === 0 ? [index] : [],
  );
  const labels = days.map(formatShortDate);

  return {
    description: "Intensidade combinada dos cenários escolhidos por dia e hora.",
    emptyText: "Sem eventos horários para montar o mapa de calor.",
    error: data.hour.error,
    hasData: points.some((point) => point.total > 0),
    height: 500,
    minWidth:
      days.length > 45 ? Math.min(2200, days.length * 30) : undefined,
    option: {
      grid: { bottom: 56, containLabel: true, left: 52, right: 18, top: 58 },
      series: [
        {
          data: heatmapData,
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(15, 35, 55, 0.22)" },
          },
          itemStyle: { borderWidth: 0 },
          progressive: 1500,
          type: "heatmap",
        },
      ],
      tooltip: {
        formatter: (params: { data?: [number, number, number] }) => {
          const value = params.data ?? [0, 0, 0];
          return `${labels[value[0]] ?? ""} · ${HOUR_LABELS[value[1]]}<br/><strong>${formatNumber(value[2])}</strong>`;
        },
        position: "top",
      },
      visualMap: {
        calculable: true,
        inRange: { color: monochromeHeatmapPalette(color) },
        left: "center",
        max,
        min: 0,
        orient: "horizontal",
        precision: 0,
        top: 0,
      },
      xAxis: {
        axisLabel: buildCalendarAxisLabel({
          hideOverlap: true,
          interval: 0,
          rotate: days.length > 31 ? 45 : 0,
          saturdayIndexes,
          sundayIndexes,
        }),
        axisLine: { show: false },
        axisTick: { show: false },
        data: labels,
        splitArea: { show: false },
        splitLine: { show: false },
        type: "category",
      },
      yAxis: {
        axisLabel: { color: "#66758A", fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        data: HOUR_LABELS,
        inverse: false,
        splitArea: { show: false },
        splitLine: { show: false },
        type: "category",
      },
    } as EnterpriseChartOption,
    table: {
      columns: [
        { key: "date", label: "Data", width: 16 },
        { key: "hour", label: "Hora", width: 12 },
        { key: "total", label: "Total", numeric: true, width: 18 },
      ],
      description: formatPeriodAnalysisRange(period),
      rows: points.map((point) => {
        const bucket = new Date(point.bucket);
        return {
          date: formatDate(bucket),
          hour: HOUR_LABELS[bucket.getHours()],
          total: point.total,
        };
      }),
      title: "Mapa de calor dia x hora",
    },
  };
}

function buildCumulativeModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const baselinePeriod = periodAnalysisBaselineRange(period, widget.baseline);
  const current = combinedPoints(data.day, scenarios, period, "day");
  const baselineDataset = data.baseline[widget.baseline] ?? emptyDataset("day");
  const baseline = combinedPoints(
    baselineDataset,
    scenarios,
    baselinePeriod,
    "day",
  );
  let currentTotal = 0;
  let baselineTotal = 0;
  const points = current.map((point, index) => {
    currentTotal += point.total;
    baselineTotal += baseline[index]?.total ?? 0;
    return {
      baseline: baselineTotal,
      baselineDate: baseline[index]?.label ?? "-",
      current: currentTotal,
      currentDate: point.label,
    };
  });
  const baselineLabel = periodAnalysisBaselineLabel(widget.baseline);

  return {
    description: `Evolução acumulada contra ${baselineLabel.toLowerCase()}. Base à esquerda e período atual à direita.`,
    emptyText: "Sem dados diários para o comparativo acumulado.",
    error: data.day.error ?? baselineDataset.error,
    hasData: points.some((point) => point.current !== 0 || point.baseline !== 0),
    height: 340,
    minWidth: points.length > 45 ? Math.min(1800, points.length * 28) : undefined,
    option: buildCurrentBaselineBarOption(
      points.map((point) => point.currentDate),
      points.map((point) => point.baseline),
      points.map((point) => point.current),
      baselineLabel,
      "Período selecionado",
      color,
    ),
    table: {
      columns: [
        { key: "date", label: "Data atual", width: 18 },
        { key: "baseline_date", label: "Data-base", width: 18 },
        { key: "baseline", label: "Acumulado base", numeric: true, width: 20 },
        { key: "current", label: "Acumulado atual", numeric: true, width: 20 },
        { key: "variation", label: "Variação", width: 14 },
      ],
      description: `${formatPeriodAnalysisRange(period)} · ${baselineLabel}`,
      rows: points.map((point) => ({
        baseline: point.baseline,
        baseline_date: point.baselineDate,
        current: point.current,
        date: point.currentDate,
        variation: formatVariation(point.current, point.baseline),
      })),
      title: widget.title,
    },
  };
}

function buildTrendModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const historyFrom = addDays(period.from, -29);
  const historyPoints = combinedPoints(
    data.day,
    scenarios,
    { from: historyFrom, to: period.to },
    "day",
  );
  const trendPoints = historyPoints
    .map((point, index) => ({
      ...point,
      average7: movingAverage(historyPoints, index, 7),
      average30: movingAverage(historyPoints, index, 30),
    }))
    .filter((point) => new Date(point.bucket) >= period.from);
  const saturdayIndexes = trendPoints.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = trendPoints.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );

  return {
    description: "Médias móveis calculadas com os 29 dias anteriores ao início do período.",
    emptyText: "São necessários ao menos 7 dias com dados para calcular a tendência.",
    error: data.day.error,
    hasData: trendPoints.some((point) => point.average7 !== null),
    height: 330,
    minWidth: trendPoints.length > 45 ? Math.min(1600, trendPoints.length * 26) : undefined,
    option: {
      color: [color, pastelBarColor(1)],
      grid: { bottom: 30, containLabel: true, left: 48, right: 18, top: 48 },
      legend: { data: ["Média móvel 7 dias", "Média móvel 30 dias"], top: 0 },
      series: [
        {
          connectNulls: false,
          data: trendPoints.map((point) => point.average7),
          lineStyle: { type: "dashed", width: 1.3 },
          name: "Média móvel 7 dias",
          showSymbol: false,
          smooth: 0.2,
          type: "line",
        },
        {
          connectNulls: false,
          data: trendPoints.map((point) => point.average30),
          lineStyle: { width: 2.8 },
          name: "Média móvel 30 dias",
          showSymbol: false,
          smooth: 0.2,
          type: "line",
        },
      ],
      tooltip: { trigger: "axis", valueFormatter: numberTooltip },
      xAxis: {
        axisLabel: buildCalendarAxisLabel({
          hideOverlap: true,
          interval: 0,
          saturdayIndexes,
          sundayIndexes,
        }),
        axisLine: { lineStyle: { color: "#D8E3F2" } },
        axisTick: { show: false },
        data: trendPoints.map((point) => point.label),
        type: "category",
      },
      yAxis: {
        axisLabel: { color: "#66758A" },
        splitLine: { lineStyle: { color: "#E8EEF6" } },
        type: "value",
      },
    } as EnterpriseChartOption,
    table: {
      columns: [
        { key: "date", label: "Data", width: 18 },
        { key: "total", label: "Total diário", numeric: true, width: 18 },
        { key: "average_7", label: "Média 7 dias", numeric: true, width: 18 },
        { key: "average_30", label: "Média 30 dias", numeric: true, width: 18 },
      ],
      description: formatPeriodAnalysisRange(period),
      rows: trendPoints.map((point) => ({
        average_30: nullableRounded(point.average30),
        average_7: nullableRounded(point.average7),
        date: point.label,
        total: point.total,
      })),
      title: "Tendência 7 x 30 dias",
    },
  };
}

function buildHourProfileModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const points = combinedPoints(data.hour, scenarios, period, "hour");
  const totals = Array.from({ length: 24 }, () => 0);
  const dayKeys = new Set<string>();
  points.forEach((point) => {
    const bucket = new Date(point.bucket);
    totals[bucket.getHours()] += point.total;
    dayKeys.add(calendarDayKey(bucket));
  });
  const divisor = Math.max(1, dayKeys.size);
  const averages = totals.map((total) => total / divisor);

  return {
    description: "Média por faixa horária para localizar as horas de maior fluxo.",
    emptyText: "Sem eventos horários para calcular o perfil.",
    error: data.hour.error,
    hasData: totals.some((total) => total !== 0),
    height: 320,
    option: {
      color: [color],
      grid: { bottom: 24, containLabel: true, left: 48, right: 18, top: 22 },
      series: [
        {
          barMaxWidth: 24,
          data: averages,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          name: "Média por dia",
          type: "bar",
        },
      ],
      tooltip: { trigger: "axis", valueFormatter: numberTooltip },
      xAxis: {
        axisLabel: { color: "#66758A", interval: 2 },
        axisLine: { lineStyle: { color: "#D8E3F2" } },
        axisTick: { show: false },
        data: HOUR_LABELS,
        type: "category",
      },
      yAxis: {
        axisLabel: { color: "#66758A" },
        splitLine: { lineStyle: { color: "#E8EEF6" } },
        type: "value",
      },
    } as EnterpriseChartOption,
    table: {
      columns: [
        { key: "hour", label: "Hora", width: 14 },
        { key: "total", label: "Total", numeric: true, width: 18 },
        { key: "daily_average", label: "Média por dia", numeric: true, width: 20 },
      ],
      description: `${formatPeriodAnalysisRange(period)} · ${dayKeys.size} dia(s)`,
      rows: HOUR_LABELS.map((hour, index) => ({
        daily_average: Math.round(averages[index]),
        hour,
        total: totals[index],
      })),
      title: "Perfil horário",
    },
  };
}

function buildBarTimelineOption(
  points: ScenarioAnalyticsPoint[],
  color: string,
): EnterpriseChartOption {
  const saturdayIndexes = points.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = points.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );

  return {
    color: [color],
    grid: { bottom: 30, containLabel: true, left: 48, right: 18, top: 22 },
    series: [
      {
        barMaxWidth: 28,
        data: points.map((point) => point.total),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        name: "Fluxo",
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis", valueFormatter: numberTooltip },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        hideOverlap: true,
        interval: 0,
        rotate: points.length > 48 ? 45 : 0,
        saturdayIndexes,
        sundayIndexes,
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: points.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A" },
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
  } as EnterpriseChartOption;
}

function buildMultiScenarioOption(
  series: Array<{
    id: string;
    name: string;
    points: ScenarioAnalyticsPoint[];
  }>,
  color: string,
): EnterpriseChartOption {
  const calendarPoints = series[0]?.points ?? [];
  const saturdayIndexes = calendarPoints.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = calendarPoints.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );

  return {
    color: series.map((_, index) => (index === 0 ? color : pastelBarColor(index))),
    grid: {
      bottom: 30,
      containLabel: true,
      left: 48,
      right: 18,
      top: series.length > 1 ? 58 : 22,
    },
    legend:
      series.length > 1
        ? { left: 0, right: 0, top: 0, type: "scroll" }
        : undefined,
    series: series.map((item) => ({
      barMaxWidth: 24,
      data: item.points.map((point) => point.total),
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      name: item.name,
      type: "bar",
    })),
    tooltip: { trigger: "axis", valueFormatter: numberTooltip },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        hideOverlap: true,
        interval: 0,
        rotate: calendarPoints.length > 48 ? 45 : 0,
        saturdayIndexes,
        sundayIndexes,
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: calendarPoints.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A" },
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
  } as EnterpriseChartOption;
}

function buildCurrentBaselineBarOption(
  labels: string[],
  baseline: number[],
  current: number[],
  baselineLabel: string,
  currentLabel: string,
  color: string,
): EnterpriseChartOption {
  return {
    color: [MUTED_BASE_COLOR, color],
    grid: { bottom: 30, containLabel: true, left: 48, right: 18, top: 52 },
    legend: { data: [baselineLabel, currentLabel], top: 0 },
    series: [
      {
        barMaxWidth: 22,
        data: baseline,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        name: baselineLabel,
        type: "bar",
      },
      {
        barMaxWidth: 22,
        data: current,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        name: currentLabel,
        type: "bar",
      },
    ],
    tooltip: { trigger: "axis", valueFormatter: numberTooltip },
    xAxis: {
      axisLabel: { color: "#66758A", hideOverlap: true, interval: 0 },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: labels,
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A" },
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
  } as EnterpriseChartOption;
}

function combinedPoints(
  dataset: PeriodAnalysisDataset,
  scenarios: Scenario[],
  period: PeriodAnalysisRange,
  granularity: "hour" | "day",
) {
  return buildCombinedScenarioPoints({
    from: period.from,
    granularity,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: period.to,
  });
}

function pointsTable(title: string, points: ScenarioAnalyticsPoint[]): ReportTable {
  return {
    columns: [
      { key: "period", label: "Período", width: 22 },
      { key: "total", label: "Total", numeric: true, width: 18 },
    ],
    rows: points.map((point) => ({ period: point.label, total: point.total })),
    title,
  };
}

function movingAverage(
  points: ScenarioAnalyticsPoint[],
  index: number,
  windowSize: number,
) {
  if (index + 1 < windowSize) return null;
  const window = points.slice(index + 1 - windowSize, index + 1);
  return window.reduce((sum, point) => sum + point.total, 0) / windowSize;
}

function listDayStarts(from: Date, to: Date) {
  const days: Date[] = [];
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cursor < to && days.length < 10_000) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

function shiftMonthsClamped(date: Date, amount: number) {
  const targetMonth = date.getMonth() + amount;
  const first = new Date(date.getFullYear(), targetMonth, 1);
  const lastDay = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    first.getFullYear(),
    first.getMonth(),
    Math.min(date.getDate(), lastDay),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function calendarDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function formatVariation(current: number, baseline: number) {
  if (!baseline) return current ? "+100,0%" : "0,0%";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    signDisplay: "always",
    style: "percent",
  }).format((current - baseline) / Math.abs(baseline));
}

function numberTooltip(value: unknown) {
  return formatNumber(Number(value ?? 0));
}

function nullableRounded(value: number | null) {
  return value === null ? null : Math.round(value);
}

function scenarioColumnKey(id: string) {
  return `scenario_${id.replace(/[^a-z0-9]+/gi, "_")}`;
}

function granularityLabel(granularity: "hour" | "day") {
  return granularity === "hour" ? "Hora a hora" : "Dia a dia";
}

function widgetDescription(widget: PeriodAnalysisWidget) {
  if (widget.kind === "heatmap") return "Distribuição do fluxo por dia e hora.";
  if (widget.kind === "ranking") return "Ranking e representatividade por cenário.";
  if (widget.kind === "cumulative") return "Acumulado contra uma base comparável.";
  if (widget.kind === "trend") return "Médias móveis de 7 e 30 dias.";
  if (widget.kind === "hour_profile") return "Perfil médio das 24 horas.";
  if (widget.kind === "comparison") return "Comparação dos cenários selecionados.";
  if (widget.kind === "timeline") return "Fluxo agrupado no período.";
  return "Indicadores consolidados do período.";
}

function emptyDataset(
  granularity: AggregateGranularity,
): PeriodAnalysisDataset {
  return { granularity, rows: [] };
}
