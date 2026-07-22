import type { EnterpriseChartOption } from "@/components/app/echart";
import {
  buildCalendarAxisLabel,
  buildCalendarMarkArea,
  holidayCategoryIndexes,
} from "@/lib/chart-calendar-axis";
import {
  monochromeHeatmapPalette,
  pastelBarColor,
} from "@/lib/chart-palette";
import {
  buildScenarioCompositionOption,
  normalizeScenarioCompositionChartType,
  scenarioCompositionDescription,
  type ScenarioCompositionChartType,
} from "@/lib/chart-composition";
import { buildHourlyOccupancyOption } from "@/lib/hourly-occupancy-chart";
import type {
  PeriodAnalysisBaseline,
  PeriodAnalysisWidget,
} from "@/lib/period-analysis-widgets";
import type { ReportMetric, ReportTable } from "@/lib/report-export";
import {
  buildCombinedScenarioPoints,
  buildScenarioHourlyOccupancy,
  buildScenarioRanking,
  formatOccupancyStartHour,
  selectScenarios,
  type ScenarioAnalyticsPoint,
  type ScenarioHourlyOccupancyPoint,
} from "@/lib/scenario-analytics";
import { inferOccupancyScenarios } from "@/lib/scenario-direction";
import type {
  AggregateEventRow,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import type { CardChartType } from "@/lib/view-preferences";

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
  insights?: PeriodAnalysisInsight[];
  metrics?: ReportMetric[];
  option?: EnterpriseChartOption;
  table?: ReportTable;
};

export type PeriodAnalysisInsight = {
  label: string;
  tone?: "default" | "muted" | "positive" | "negative" | "primary";
  value: string;
};

const DEFAULT_COLOR = "#1267C4";
const MUTED_BASE_COLOR = "#A3AFBF";
const POSITIVE_COLOR = "#0F766E";
const NEGATIVE_COLOR = "#C2410C";
const NEUTRAL_COLOR = "#64748B";
const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}h`,
);

export function buildPeriodAnalysisWidgetModel({
  chartType,
  color = DEFAULT_COLOR,
  data,
  period,
  scenarios,
  widget,
}: {
  chartType?: CardChartType;
  color?: string;
  data: PeriodAnalysisData;
  period: PeriodAnalysisRange;
  scenarios: Scenario[];
  widget: PeriodAnalysisWidget;
}): PeriodAnalysisWidgetModel {
  if (widget.kind === "hourly_occupancy") {
    return buildHourlyOccupancyModel(widget, data, period, scenarios, color);
  }

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
  if (widget.kind === "peak_days") {
    return buildPeakDaysModel(data, period, selectedScenarios, color);
  }
  if (widget.kind === "rose") {
    return buildRoseModel(
      data,
      period,
      selectedScenarios,
      color,
      normalizeScenarioCompositionChartType(chartType),
    );
  }
  if (widget.kind === "totals_table") {
    return buildScenarioTotalsModel(data, period, selectedScenarios);
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
  if (isSingleDayAnalysisPeriod(period)) return formatDate(period.from);
  return `${formatDate(period.from)} a ${formatDate(end)}`;
}

export function isSingleDayAnalysisPeriod(period: PeriodAnalysisRange) {
  return addDays(period.from, 1).getTime() === period.to.getTime();
}

export function periodAnalysisOperationalRange(
  period: PeriodAnalysisRange,
): PeriodAnalysisRange {
  if (!isSingleDayAnalysisPeriod(period)) return period;

  return {
    from: new Date(period.from.getFullYear(), period.from.getMonth(), 1),
    to: period.to,
  };
}

export function periodAnalysisEffectiveGranularity(
  widget: PeriodAnalysisWidget,
  period: PeriodAnalysisRange,
) {
  if (widget.kind === "hourly_occupancy") return "hour";
  return isSingleDayAnalysisPeriod(period) &&
    (widget.kind === "timeline" || widget.kind === "comparison")
    ? "hour"
    : widget.granularity;
}

function periodRangeThroughNow(period: PeriodAnalysisRange) {
  const now = new Date();
  return now >= period.from && now < period.to
    ? { from: period.from, to: now }
    : period;
}

function buildSummaryModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
): PeriodAnalysisWidgetModel {
  const singleDay = isSingleDayAnalysisPeriod(period);
  const effectivePeriod = periodRangeThroughNow(period);
  const granularity = singleDay ? "hour" : "day";
  const dataset = singleDay ? data.hour : data.day;
  const points = combinedPoints(
    dataset,
    scenarios,
    effectivePeriod,
    granularity,
  );
  const ranking = buildScenarioRanking({
    from: effectivePeriod.from,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: effectivePeriod.to,
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
      label: singleDay ? "Total do dia" : "Total do período",
      value: total,
    },
    {
      description: `${points.length} ${singleDay ? "hora(s)" : "dia(s)"} consultada(s)`,
      label: singleDay ? "Média por hora" : "Média diária",
      value: Math.round(average),
    },
    {
      description: peak ? peak.label : "Sem dados",
      label: singleDay ? "Maior fluxo horário" : "Maior fluxo diário",
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
    description: singleDay
      ? "Síntese operacional dos cenários escolhidos no dia."
      : "Síntese executiva dos cenários escolhidos no intervalo.",
    emptyText: "Sem eventos nos cenários selecionados para este período.",
    error: dataset.error,
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
      title: singleDay ? "Resumo do dia" : "Resumo do período",
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
  const granularity = periodAnalysisEffectiveGranularity(widget, period);
  const effectivePeriod = periodRangeThroughNow(period);
  const dataset = granularity === "hour" ? data.hour : data.day;
  const points = combinedPoints(
    dataset,
    scenarios,
    effectivePeriod,
    granularity,
  );
  const option = buildBarTimelineOption(points, color);
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const peak = points.reduce<ScenarioAnalyticsPoint | null>(
    (largest, point) =>
      !largest || point.total > largest.total ? point : largest,
    null,
  );

  return {
    description: `${granularityLabel(granularity)} dos cenários selecionados em ${formatPeriodAnalysisRange(period)}.`,
    emptyText: "Sem fluxo no período e nos cenários selecionados.",
    error: dataset.error,
    hasData: points.some((point) => point.total !== 0),
    height: 330,
    insights: [
      { label: "Total", tone: "primary", value: formatNumber(total) },
      ...(peak && peak.total
        ? [
            {
              label: "Pico",
              tone: "muted" as const,
              value: `${peak.label} · ${formatNumber(peak.total)}`,
            },
          ]
        : []),
    ],
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
  const granularity = periodAnalysisEffectiveGranularity(widget, period);
  const effectivePeriod = periodRangeThroughNow(period);
  const dataset = granularity === "hour" ? data.hour : data.day;
  const series = scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    points: combinedPoints(dataset, [scenario], effectivePeriod, granularity),
  }));
  const option = buildMultiScenarioOption(series, color);
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  const scenarioTotals = series
    .map((item) => ({
      name: item.name,
      total: item.points.reduce((sum, point) => sum + point.total, 0),
    }))
    .sort((left, right) => right.total - left.total);
  const combinedTotal = scenarioTotals.reduce(
    (sum, item) => sum + item.total,
    0,
  );
  const leader = scenarioTotals[0];

  return {
    description: `${granularityLabel(granularity)} com uma série para cada cenário escolhido.`,
    emptyText: "Sem dados nos cenários escolhidos para comparar.",
    error: dataset.error,
    hasData: series.some((item) =>
      item.points.some((point) => point.total !== 0),
    ),
    height: 360,
    insights: [
      {
        label: "Total combinado",
        tone: "primary",
        value: formatNumber(combinedTotal),
      },
      ...(leader?.total
        ? [
            {
              label: "Maior volume",
              tone: "muted" as const,
              value: `${leader.name} · ${formatNumber(leader.total)}`,
            },
          ]
        : []),
    ],
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
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const ranking = buildScenarioRanking({
    from: effectivePeriod.from,
    rows: data.day.rows,
    scenarios,
    sourceGranularity: data.day.granularity,
    to: effectivePeriod.to,
  });
  const displayed = [...ranking].reverse();
  const height = Math.max(290, ranking.length * 34 + 60);
  const leader = ranking[0];
  const total = ranking.reduce((sum, point) => sum + point.total, 0);

  return {
    description: isSingleDayAnalysisPeriod(period)
      ? `Volume e representatividade no mês até ${formatDate(period.from)}.`
      : "Volume e representatividade apenas dos cenários escolhidos.",
    emptyText: "Sem fluxo para classificar os cenários selecionados.",
    error: data.day.error,
    hasData: ranking.length > 0,
    height,
    insights: [
      { label: "Total", tone: "primary", value: formatNumber(total) },
      ...(leader
        ? [
            {
              label: "Líder",
              tone: "muted" as const,
              value: `${leader.name} · ${formatPercent(leader.share)}`,
            },
          ]
        : []),
    ],
    option: {
      grid: { bottom: 8, containLabel: true, left: 8, right: 112, top: 8 },
      series: [
        {
          barCategoryGap: "28%",
          barMaxWidth: 24,
          data: displayed.map((point, index) => ({
            itemStyle: {
              borderRadius: [0, 3, 3, 0],
              color:
                index === displayed.length - 1
                  ? color
                  : pastelBarColor(displayed.length - index),
            },
            value: point.total,
          })),
          label: {
            color: "#526477",
            distance: 6,
            fontSize: 10,
            formatter: (params: { dataIndex?: number; value?: number }) => {
              const point = displayed[params.dataIndex ?? 0];
              return point
                ? `${formatPercent(point.share)} · ${formatNumber(Number(params.value ?? 0))}`
                : "";
            },
            position: "right",
            show: true,
          },
          type: "bar",
        },
      ],
      tooltip: {
        ...operationalTooltip(),
        formatter: (params: { dataIndex?: number }) => {
          const point = displayed[params.dataIndex ?? 0];
          return point
            ? `${point.name}<br/><strong>${formatNumber(point.total)}</strong> · ${formatPercent(point.share)}`
            : "";
        },
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
          fontSize: 10,
          overflow: "truncate",
          width: 150,
        },
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
      description: formatPeriodAnalysisRange(analysisPeriod),
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

function buildPeakDaysModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const ranked = combinedPoints(
    data.day,
    scenarios,
    effectivePeriod,
    "day",
  )
    .filter((point) => point.total !== 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);
  const displayed = [...ranked].reverse();
  const peak = ranked[0];

  return {
    description: `Cinco dias com maior fluxo em ${formatPeriodAnalysisRange(
      analysisPeriod,
    )}.`,
    emptyText: "Sem dados diários para identificar os dias de pico.",
    error: data.day.error,
    hasData: ranked.length > 0,
    height: 300,
    insights: peak
      ? [
          {
            label: "Maior pico",
            tone: "primary",
            value: `${peak.label} · ${formatNumber(peak.total)}`,
          },
        ]
      : undefined,
    option: {
      grid: { bottom: 8, containLabel: true, left: 8, right: 72, top: 8 },
      series: [
        {
          barCategoryGap: "34%",
          barMaxWidth: 28,
          data: displayed.map((point, index) => ({
            itemStyle: {
              borderRadius: [0, 3, 3, 0],
              color:
                index === displayed.length - 1
                  ? color
                  : pastelBarColor(displayed.length - index + 1),
            },
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
          type: "bar",
        },
      ],
      tooltip: {
        ...operationalTooltip(),
        trigger: "axis",
        valueFormatter: numberTooltip,
      },
      xAxis: {
        axisLabel: { color: "#66758A", fontSize: 10 },
        minInterval: 1,
        splitLine: { lineStyle: { color: "#E8EEF6" } },
        type: "value",
      },
      yAxis: {
        axisLabel: { color: "#526477", fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        data: displayed.map((point) => point.label),
        type: "category",
      },
    } as EnterpriseChartOption,
    table: {
      columns: [
        { key: "position", label: "Posição", numeric: true, width: 12 },
        { key: "date", label: "Data", width: 24 },
        { key: "total", label: "Total", numeric: true, width: 20 },
      ],
      description: formatPeriodAnalysisRange(analysisPeriod),
      rows: ranked.map((point, index) => ({
        date: point.label,
        position: index + 1,
        total: point.total,
      })),
      title: "Top 5 dias de pico",
    },
  };
}

function buildRoseModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
  chartType: ScenarioCompositionChartType,
): PeriodAnalysisWidgetModel {
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const ranking = buildScenarioRanking({
    from: effectivePeriod.from,
    rows: data.day.rows,
    scenarios,
    sourceGranularity: data.day.granularity,
    to: effectivePeriod.to,
  });
  const total = ranking.reduce((sum, point) => sum + point.total, 0);
  const leader = ranking[0];
  return {
    description: scenarioCompositionDescription(chartType),
    emptyText: "Sem fluxo para calcular a distribuição dos cenários.",
    error: data.day.error,
    hasData: ranking.length > 0,
    height: 340,
    insights: [
      { label: "Total", tone: "primary", value: formatNumber(total) },
      ...(leader
        ? [
            {
              label: "Maior participação",
              tone: "muted" as const,
              value: `${leader.name} · ${formatPercent(leader.share)}`,
            },
          ]
        : []),
    ],
    option: buildScenarioCompositionOption(
      ranking.map((point) => ({ name: point.name, value: point.total })),
      color,
      chartType,
    ),
    table: {
      columns: [
        { key: "scenario", label: "Cenário", width: 34 },
        { key: "total", label: "Total", numeric: true, width: 20 },
        { key: "share", label: "Representatividade", width: 20 },
      ],
      description: formatPeriodAnalysisRange(analysisPeriod),
      rows: ranking.map((point) => ({
        scenario: point.name,
        share: formatPercent(point.share),
        total: point.total,
      })),
      title: "Composição por cenário",
    },
  };
}

function buildScenarioTotalsModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
): PeriodAnalysisWidgetModel {
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const ranking = buildScenarioRanking({
    from: effectivePeriod.from,
    rows: data.day.rows,
    scenarios,
    sourceGranularity: data.day.granularity,
    to: effectivePeriod.to,
  });
  const total = ranking.reduce((sum, point) => sum + point.total, 0);
  const metrics: ReportMetric[] = [
    {
      description: formatPeriodAnalysisRange(analysisPeriod),
      label: "Total combinado",
      value: total,
    },
    ...ranking.map((point) => ({
      description: `${formatPercent(point.share)} de representatividade`,
      label: point.name,
      value: point.total,
    })),
  ];

  return {
    description: "Total combinado e acumulado individual dos cenários escolhidos.",
    emptyText: "Sem totais para os cenários selecionados.",
    error: data.day.error,
    hasData: ranking.length > 0,
    height: Math.max(180, Math.ceil(metrics.length / 4) * 110),
    insights: [
      { label: "Total", tone: "primary", value: formatNumber(total) },
      {
        label: "Cenários com fluxo",
        tone: "muted",
        value: formatNumber(ranking.length),
      },
    ],
    metrics,
    table: {
      columns: [
        { key: "scenario", label: "Cenário", width: 34 },
        { key: "total", label: "Total", numeric: true, width: 20 },
        { key: "share", label: "Representatividade", width: 20 },
      ],
      description: formatPeriodAnalysisRange(analysisPeriod),
      rows: [
        { scenario: "Total combinado", share: "100,0%", total },
        ...ranking.map((point) => ({
          scenario: point.name,
          share: formatPercent(point.share),
          total: point.total,
        })),
      ],
      title: "Totais por cenário",
    },
  };
}

function buildHeatmapModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const points = combinedPoints(data.hour, scenarios, effectivePeriod, "hour");
  const days = listDayStarts(effectivePeriod.from, effectivePeriod.to);
  const dayIndexes = new Map(
    days.map((day, index) => [calendarDayKey(day), index]),
  );
  const heatmapData = points
    .filter((point) => point.total > 0)
    .map((point) => {
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
  const peak = points.reduce<ScenarioAnalyticsPoint | null>(
    (largest, point) =>
      !largest || point.total > largest.total ? point : largest,
    null,
  );
  const peakDate = peak ? new Date(peak.bucket) : null;

  return {
    description: isSingleDayAnalysisPeriod(period)
      ? `Intensidade por dia e hora no mês até ${formatDate(period.from)}.`
      : "Intensidade combinada dos cenários escolhidos por dia e hora.",
    emptyText: "Sem eventos horários para montar o mapa de calor.",
    error: data.hour.error,
    hasData: points.some((point) => point.total > 0),
    height: 500,
    insights:
      peak && peakDate && peak.total
        ? [
            {
              label: "Maior intensidade",
              tone: "primary",
              value: `${formatShortDate(peakDate)} ${HOUR_LABELS[peakDate.getHours()]} · ${formatNumber(peak.total)}`,
            },
          ]
        : undefined,
    option: {
      grid: { bottom: 72, containLabel: true, left: 18, right: 18, top: 18 },
      series: [
        {
          data: heatmapData,
          emphasis: {
            itemStyle: {
              borderColor: "#13233A",
              borderWidth: 1,
              shadowBlur: 8,
              shadowColor: "rgba(18, 35, 58, 0.24)",
            },
          },
          itemStyle: { borderWidth: 0 },
          markArea: buildCalendarMarkArea(days),
          name: "Intensidade horária",
          progressive: 1_000,
          type: "heatmap",
        },
      ],
      tooltip: {
        ...operationalTooltip(),
        formatter: (params: { data?: [number, number, number] }) => {
          const value = params.data ?? [0, 0, 0];
          const intensity = max ? value[2] / max : 0;
          return [
            `<strong>${labels[value[0]] ?? ""} · ${HOUR_LABELS[value[1]]}</strong>`,
            `${formatNumber(value[2])} eventos`,
            `${new Intl.NumberFormat("pt-BR", {
              maximumFractionDigits: 0,
              style: "percent",
            }).format(intensity)} do maior pico`,
          ].join("<br />");
        },
        position: "top",
        trigger: "item",
      },
      visualMap: {
        calculable: true,
        inRange: { color: monochromeHeatmapPalette(color) },
        itemHeight: 210,
        itemWidth: 10,
        left: "center",
        max,
        min: 0,
        orient: "horizontal",
        precision: 0,
        seriesIndex: 0,
        text: ["Maior fluxo", "Menor fluxo"],
        textGap: 8,
        textStyle: { color: "#526477", fontSize: 10 },
        bottom: 4,
      },
      xAxis: {
        axisLabel: buildCalendarAxisLabel({
          fontSize: 9,
          hideOverlap: true,
          holidayIndexes: holidayCategoryIndexes(days),
          interval: 0,
          saturdayIndexes,
          sundayIndexes,
        }),
        axisLine: { lineStyle: { color: "#D8E3F2" } },
        axisTick: { show: false },
        data: labels,
        splitArea: { show: false },
        splitLine: { show: false },
        type: "category",
      },
      yAxis: {
        axisLabel: { color: "#66758A", fontSize: 9, interval: 0 },
        axisLine: { lineStyle: { color: "#D8E3F2" } },
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
      description: formatPeriodAnalysisRange(analysisPeriod),
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
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const baselinePeriod = periodAnalysisBaselineRange(
    effectivePeriod,
    widget.baseline,
  );
  const current = combinedPoints(
    data.day,
    scenarios,
    effectivePeriod,
    "day",
  );
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
  const latest = points.at(-1);
  const variation = latest
    ? ratioVariation(latest.current, latest.baseline)
    : 0;

  return {
    description: `${isSingleDayAnalysisPeriod(period) ? "Mês até a data escolhida" : "Período selecionado"} contra ${baselineLabel.toLowerCase()}. Base à esquerda e período atual à direita.`,
    emptyText: "Sem dados diários para o comparativo acumulado.",
    error: data.day.error ?? baselineDataset.error,
    hasData: points.some((point) => point.current !== 0 || point.baseline !== 0),
    height: 340,
    insights: latest
      ? [
          {
            label: "Acumulado atual",
            tone: "primary",
            value: formatNumber(latest.current),
          },
          {
            label: "Acumulado-base",
            tone: "muted",
            value: formatNumber(latest.baseline),
          },
          {
            label: "Variação",
            tone:
              variation > 0
                ? "positive"
                : variation < 0
                  ? "negative"
                  : "default",
            value: formatSignedPercent(variation),
          },
        ]
      : undefined,
    option: buildCurrentBaselineBarOption(
      points.map((point) => point.currentDate),
      points.map((point) => point.baseline),
      points.map((point) => point.current),
      baselineLabel,
      "Período selecionado",
      color,
      current.map((point) => point.bucket),
    ),
    table: {
      columns: [
        { key: "date", label: "Data atual", width: 18 },
        { key: "baseline_date", label: "Data-base", width: 18 },
        { key: "baseline", label: "Acumulado base", numeric: true, width: 20 },
        { key: "current", label: "Acumulado atual", numeric: true, width: 20 },
        { key: "variation", label: "Variação", width: 14 },
      ],
      description: `${formatPeriodAnalysisRange(analysisPeriod)} · ${baselineLabel}`,
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
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const historyFrom = addDays(analysisPeriod.from, -29);
  const historyPoints = combinedPoints(
    data.day,
    scenarios,
    { from: historyFrom, to: effectivePeriod.to },
    "day",
  );
  const trendPoints = historyPoints
    .map((point, index) => ({
      ...point,
      average7: movingAverage(historyPoints, index, 7),
      average30: movingAverage(historyPoints, index, 30),
    }))
    .filter((point) => new Date(point.bucket) >= analysisPeriod.from);
  const saturdayIndexes = trendPoints.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = trendPoints.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );
  const calendarDates = trendPoints.map((point) => point.bucket);
  const direction7 = seriesDirection(
    trendPoints.map((point) => point.average7),
  );
  const direction30 = seriesDirection(
    trendPoints.map((point) => point.average30),
  );
  const latest = [...trendPoints]
    .reverse()
    .find((point) => point.average7 !== null || point.average30 !== null);
  const directionColor = (direction: number) =>
    direction > 0
      ? POSITIVE_COLOR
      : direction < 0
        ? NEGATIVE_COLOR
        : NEUTRAL_COLOR;

  return {
    description: isSingleDayAnalysisPeriod(period)
      ? `Médias móveis no mês até ${formatDate(period.from)}, com 29 dias anteriores de base.`
      : "Médias móveis calculadas com os 29 dias anteriores ao início do período.",
    emptyText: "São necessários ao menos 7 dias com dados para calcular a tendência.",
    error: data.day.error,
    hasData:
      historyPoints.some((point) => point.total !== 0) &&
      trendPoints.some((point) => point.average7 !== null),
    height: 330,
    insights: latest
      ? [
          {
            label: "MM7",
            tone: trendTone(direction7),
            value: formatOptionalNumber(latest.average7),
          },
          {
            label: "MM30",
            tone: trendTone(direction30),
            value: formatOptionalNumber(latest.average30),
          },
        ]
      : undefined,
    option: {
      color: [
        color,
        directionColor(direction30),
        directionColor(direction7),
      ],
      grid: { bottom: 8, containLabel: true, left: 8, right: 12, top: 52 },
      legend: {
        itemGap: 14,
        itemHeight: 9,
        itemWidth: 14,
        left: 0,
        textStyle: { color: "#526477", fontSize: 11 },
        top: 0,
      },
      series: [
        {
          barMaxWidth: 14,
          data: trendPoints.map((point) => point.total),
          itemStyle: { color, opacity: 0.24 },
          markArea: buildCalendarMarkArea(calendarDates),
          name: "Volume diário",
          type: "bar",
        },
        {
          connectNulls: false,
          data: trendPoints.map((point) => point.average30),
          lineStyle: {
            color: directionColor(direction30),
            opacity: 0.9,
            type: "solid",
            width: 2.5,
          },
          name: "Média móvel 30 dias",
          showSymbol: false,
          smooth: 0.18,
          type: "line",
        },
        {
          connectNulls: false,
          data: trendPoints.map((point) => point.average7),
          lineStyle: {
            color: directionColor(direction7),
            opacity: 0.76,
            type: "dashed",
            width: 1.25,
          },
          name: "Média móvel 7 dias",
          showSymbol: false,
          smooth: 0.18,
          type: "line",
        },
      ],
      tooltip: {
        ...operationalTooltip(),
        trigger: "axis",
        valueFormatter: numberTooltip,
      },
      xAxis: {
        axisLabel: buildCalendarAxisLabel({
          fontSize: 9,
          hideOverlap: true,
          holidayIndexes: holidayCategoryIndexes(calendarDates),
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
        axisLabel: { color: "#66758A", fontSize: 10 },
        minInterval: 1,
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
      description: formatPeriodAnalysisRange(analysisPeriod),
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

function buildHourlyOccupancyModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const availableById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const automatic = inferOccupancyScenarios(scenarios);
  const entryScenarios =
    widget.selectionMode === "custom"
      ? widget.entryScenarioIds.flatMap((scenarioId) => {
          const scenario = availableById.get(scenarioId);
          return scenario ? [scenario] : [];
        })
      : automatic.entries;
  const entryIds = new Set(entryScenarios.map((scenario) => scenario.id));
  const exitScenarios = (
    widget.selectionMode === "custom"
      ? widget.exitScenarioIds.flatMap((scenarioId) => {
          const scenario = availableById.get(scenarioId);
          return scenario ? [scenario] : [];
        })
      : automatic.exits
  ).filter((scenario) => !entryIds.has(scenario.id));

  if (!entryScenarios.length || !exitScenarios.length) {
    return {
      description: widgetDescription(widget),
      emptyText:
        "Configure ao menos um cenário de entrada e um cenário de saída.",
      error: data.hour.error,
      hasData: false,
      height: 340,
    };
  }

  const effectivePeriod = periodRangeThroughNow(period);
  const singleDay = isSingleDayAnalysisPeriod(period);
  const points = listDayStarts(effectivePeriod.from, effectivePeriod.to).flatMap(
    (day) => {
      const through = new Date(
        Math.min(addDays(day, 1).getTime(), effectivePeriod.to.getTime()),
      );
      return buildScenarioHourlyOccupancy({
        day,
        entryScenarios,
        exitScenarios,
        rows: data.hour.rows,
        sourceGranularity: data.hour.granularity,
        startHour: widget.startHour,
        through,
      })
        .filter((point) => point.occupancy !== null)
        .map<ScenarioHourlyOccupancyPoint>((point) => ({
          ...point,
          label: singleDay
            ? point.label
            : `${formatShortDate(day)} ${point.label}`,
        }));
    },
  );
  const latest = [...points]
    .reverse()
    .find((point) => point.occupancy !== null);

  return {
    description: singleDay
      ? `Entradas acumuladas menos saídas a partir de ${formatOccupancyStartHour(
          widget.startHour,
        )}; antes desse horário, o saldo é zero.`
      : `Saldo hora a hora reiniciado diariamente, com contagem a partir de ${formatOccupancyStartHour(
          widget.startHour,
        )}.`,
    emptyText: "Sem eventos horários nos cenários de entrada e saída.",
    error: data.hour.error,
    hasData: points.length > 0,
    height: 340,
    insights: latest
      ? [
          {
            label: "Entradas",
            tone: "muted",
            value: formatNumber(latest.entries),
          },
          {
            label: "Saídas",
            tone: "muted",
            value: formatNumber(latest.exits),
          },
          {
            label: "Saldo",
            tone:
              (latest.occupancy ?? 0) > 0
                ? "positive"
                : (latest.occupancy ?? 0) < 0
                  ? "negative"
                  : "default",
            value: formatNumber(latest.occupancy ?? 0),
          },
        ]
      : undefined,
    option: buildHourlyOccupancyOption(points, color),
    table: {
      columns: [
        { key: "period", label: singleDay ? "Hora" : "Data e hora", width: 20 },
        {
          key: "entries",
          label: "Entradas acumuladas",
          numeric: true,
          width: 22,
        },
        {
          key: "exits",
          label: "Saídas acumuladas",
          numeric: true,
          width: 22,
        },
        {
          key: "occupancy",
          label: "Ocupação estimada",
          numeric: true,
          width: 22,
        },
      ],
      description: formatPeriodAnalysisRange(period),
      rows: points.map((point) => ({
        entries: point.entries,
        exits: point.exits,
        occupancy: point.occupancy ?? 0,
        period: point.label,
      })),
      title: widget.title,
    },
  };
}

function buildHourProfileModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const effectivePeriod = periodRangeThroughNow(period);
  const points = combinedPoints(data.hour, scenarios, effectivePeriod, "hour");
  const totals = Array.from({ length: 24 }, () => 0);
  const dayKeys = new Set<string>();
  points.forEach((point) => {
    const bucket = new Date(point.bucket);
    totals[bucket.getHours()] += point.total;
    dayKeys.add(calendarDayKey(bucket));
  });
  const divisor = Math.max(1, dayKeys.size);
  const averages = totals.map((total) => total / divisor);
  const peakIndex = averages.reduce(
    (largest, value, index) =>
      value > averages[largest] ? index : largest,
    0,
  );
  const averageTotal = averages.reduce((sum, value) => sum + value, 0);

  return {
    description: "Média por faixa horária para localizar as horas de maior fluxo.",
    emptyText: "Sem eventos horários para calcular o perfil.",
    error: data.hour.error,
    hasData: totals.some((total) => total !== 0),
    height: 320,
    insights: [
      {
        label: "Média diária",
        tone: "primary",
        value: formatNumber(Math.round(averageTotal)),
      },
      ...(averages[peakIndex]
        ? [
            {
              label: "Hora mais intensa",
              tone: "muted" as const,
              value: `${HOUR_LABELS[peakIndex]} · ${formatNumber(Math.round(averages[peakIndex]))}`,
            },
          ]
        : []),
    ],
    option: {
      color: [color],
      grid: { bottom: 8, containLabel: true, left: 8, right: 10, top: 18 },
      series: [
        {
          barCategoryGap: "42%",
          barMaxWidth: 24,
          data: averages,
          itemStyle: { borderRadius: [2, 2, 0, 0], color },
          name: "Média por dia",
          type: "bar",
        },
      ],
      tooltip: {
        ...operationalTooltip(),
        axisPointer: { type: "shadow" },
        trigger: "axis",
        valueFormatter: numberTooltip,
      },
      xAxis: {
        axisLabel: {
          color: "#66758A",
          fontSize: 10,
          hideOverlap: true,
          interval: 1,
        },
        axisLine: { lineStyle: { color: "#D8E3F2" } },
        axisTick: { show: false },
        data: HOUR_LABELS,
        type: "category",
      },
      yAxis: {
        axisLabel: { color: "#66758A", fontSize: 10 },
        minInterval: 1,
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
  const calendarDates = points.map((point) => point.bucket);

  return {
    color: [color],
    grid: { bottom: 8, containLabel: true, left: 8, right: 10, top: 18 },
    series: [
      {
        barCategoryGap: "50%",
        barMaxWidth: 28,
        data: points.map((point) => point.total),
        itemStyle: { borderRadius: [2, 2, 0, 0], color },
        markArea: buildCalendarMarkArea(calendarDates),
        name: "Fluxo",
        type: "bar",
      },
    ],
    tooltip: {
      ...operationalTooltip(),
      axisPointer: {
        shadowStyle: { color: "rgba(18, 103, 196, 0.06)" },
        type: "shadow",
      },
      trigger: "axis",
      valueFormatter: (value) =>
        `${formatNumber(Number(value ?? 0))} eventos`,
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 10,
        hideOverlap: true,
        holidayIndexes: holidayCategoryIndexes(calendarDates),
        interval: 0,
        saturdayIndexes,
        sundayIndexes,
      }),
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
  const calendarDates = calendarPoints.map((point) => point.bucket);

  return {
    color: series.map((_, index) =>
      index === 0 ? color : pastelBarColor(index + 1),
    ),
    grid: {
      bottom: 8,
      containLabel: true,
      left: 8,
      right: 10,
      top: series.length > 1 ? 52 : 18,
    },
    legend:
      series.length > 1
        ? {
            itemGap: 12,
            itemHeight: 9,
            itemWidth: 12,
            left: 0,
            right: 0,
            textStyle: { color: "#526477", fontSize: 11 },
            top: 0,
            type: "scroll",
          }
        : undefined,
    series: series.map((item, index) => ({
      barCategoryGap: "42%",
      barMaxWidth: 24,
      data: item.points.map((point) => point.total),
      itemStyle: {
        borderRadius: [2, 2, 0, 0],
        color: index === 0 ? color : pastelBarColor(index + 1),
      },
      markArea: index === 0 ? buildCalendarMarkArea(calendarDates) : undefined,
      name: item.name,
      type: "bar",
    })),
    tooltip: {
      ...operationalTooltip(),
      axisPointer: { type: "shadow" },
      trigger: "axis",
      valueFormatter: (value) =>
        `${formatNumber(Number(value ?? 0))} eventos`,
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 10,
        hideOverlap: true,
        holidayIndexes: holidayCategoryIndexes(calendarDates),
        interval: 0,
        saturdayIndexes,
        sundayIndexes,
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: calendarPoints.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
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
  calendarDates: Array<Date | string>,
): EnterpriseChartOption {
  const saturdayIndexes = calendarDates.flatMap((rawDate, index) => {
    const date = new Date(rawDate);
    return !Number.isNaN(date.getTime()) && date.getDay() === 6 ? [index] : [];
  });
  const sundayIndexes = calendarDates.flatMap((rawDate, index) => {
    const date = new Date(rawDate);
    return !Number.isNaN(date.getTime()) && date.getDay() === 0 ? [index] : [];
  });

  return {
    color: [MUTED_BASE_COLOR, color],
    grid: { bottom: 8, containLabel: true, left: 8, right: 10, top: 52 },
    legend: {
      data: [baselineLabel, currentLabel],
      itemGap: 14,
      itemHeight: 9,
      itemWidth: 12,
      left: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
    },
    series: [
      {
        barCategoryGap: "40%",
        barMaxWidth: 22,
        data: baseline,
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: MUTED_BASE_COLOR,
          opacity: 0.78,
        },
        markArea: buildCalendarMarkArea(calendarDates),
        name: baselineLabel,
        type: "bar",
      },
      {
        barGap: "8%",
        barMaxWidth: 22,
        data: current,
        itemStyle: { borderRadius: [2, 2, 0, 0], color },
        name: currentLabel,
        type: "bar",
      },
    ],
    tooltip: {
      ...operationalTooltip(),
      axisPointer: { type: "shadow" },
      trigger: "axis",
      valueFormatter: numberTooltip,
    },
    xAxis: {
      axisLabel: buildCalendarAxisLabel({
        fontSize: 9,
        hideOverlap: true,
        holidayIndexes: holidayCategoryIndexes(calendarDates),
        interval: 0,
        saturdayIndexes,
        sundayIndexes,
      }),
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: labels,
      type: "category",
    },
    yAxis: {
      axisLabel: { color: "#66758A", fontSize: 10 },
      minInterval: 1,
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

function seriesDirection(values: Array<number | null>) {
  const comparable = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (comparable.length < 2) return 0;
  return comparable[comparable.length - 1] - comparable[comparable.length - 2];
}

function trendTone(direction: number): PeriodAnalysisInsight["tone"] {
  if (direction > 0) return "positive";
  if (direction < 0) return "negative";
  return "default";
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

function ratioVariation(current: number, baseline: number) {
  if (!baseline) return current ? 1 : 0;
  return (current - baseline) / Math.abs(baseline);
}

function formatSignedPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    signDisplay: "always",
    style: "percent",
  }).format(value);
}

function formatOptionalNumber(value: number | null) {
  return value === null ? "-" : formatNumber(Math.round(value));
}

function operationalTooltip() {
  return {
    backgroundColor: "#ffffff",
    borderColor: "#D8E3F2",
    borderWidth: 1,
    confine: true,
    padding: [10, 12],
    textStyle: { color: "#13233A", fontSize: 12 },
  };
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
  if (widget.kind === "hourly_occupancy") {
    return "Saldo acumulado entre cenários de entrada e saída.";
  }
  if (widget.kind === "peak_days") return "Dias com os maiores picos do período.";
  if (widget.kind === "rose") return "Distribuição proporcional por cenário.";
  if (widget.kind === "totals_table") return "Totais individuais por cenário.";
  if (widget.kind === "comparison") return "Comparação dos cenários selecionados.";
  if (widget.kind === "timeline") return "Fluxo agrupado no período.";
  return "Indicadores consolidados do período.";
}

function emptyDataset(
  granularity: AggregateGranularity,
): PeriodAnalysisDataset {
  return { granularity, rows: [] };
}
