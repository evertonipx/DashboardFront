import type { EnterpriseChartOption } from "@/components/app/echart";
import { startOfAggregateBucket } from "@/lib/aggregate-time";
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
import {
  buildCurrentYearComparisonOption,
  type CurrentYearMonthPoint,
} from "@/lib/current-year-chart";
import { buildHourlyOccupancyOption } from "@/lib/hourly-occupancy-chart";
import {
  buildFixedHourlyAxisValues,
  HOUR_OF_DAY_LABELS as HOUR_LABELS,
  latestHourlyPointHour,
} from "@/lib/hourly-axis";
import { buildScenarioCumulativeTotalsOption } from "@/lib/scenario-cumulative-chart";
import {
  OPERATIONAL_TREND_LEGEND_DATA,
  OPERATIONAL_TREND_SERIES,
} from "@/lib/operational-trend-style";
import type { PeriodAnalysisScopeOption } from "@/lib/period-analysis-scope";
import { buildScopeTotalsComparisonOption } from "@/lib/scope-totals-chart";
import type {
  PeriodAnalysisBaseline,
  PeriodAnalysisWidget,
} from "@/lib/period-analysis-widgets";
import type { ReportMetric, ReportTable } from "@/lib/report-export";
import {
  buildCombinedScenarioPoints,
  buildIndividualScenarioSeries,
  buildScenarioCumulativeTotals,
  buildScenarioHourlyOccupancy,
  buildScenarioRanking,
  formatOccupancyStartHour,
  selectScenarios,
  sharedScenarioLineIds,
  sumSelectedScenarioRows,
  type ScenarioAnalyticsGranularity,
  type ScenarioAnalyticsPoint,
  type ScenarioHourlyOccupancyPoint,
} from "@/lib/scenario-analytics";
import {
  buildCountingAnalysisRangePlan,
  countingAnalysisHourlyDetailRange,
  resolveCountingAnalysisVisualGranularity,
} from "@/lib/counting-analysis-range-plan";
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
  partialBoundariesReconciled?: boolean;
  rows: AggregateEventRow[];
};

export type PeriodAnalysisData = {
  baseline: Partial<Record<PeriodAnalysisBaseline, PeriodAnalysisDataset>>;
  baselineComparable?: Partial<
    Record<PeriodAnalysisBaseline, PeriodAnalysisDataset>
  >;
  contextHour: PeriodAnalysisDataset;
  day: PeriodAnalysisDataset;
  hour: PeriodAnalysisDataset;
  minute: PeriodAnalysisDataset;
  month: PeriodAnalysisDataset;
};

export type PeriodAnalysisWidgetModel = {
  appliedGranularity?: ScenarioAnalyticsGranularity;
  description: string;
  displayTable?: boolean;
  displayTableData?: ReportTable;
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

export function buildPeriodAnalysisWidgetModel({
  chartType,
  color = DEFAULT_COLOR,
  companyTimeZone,
  data,
  period,
  scenarios,
  scopeOptions = [],
  sourceSeriesCount = scenarios.length,
  theme = "light",
  widget,
}: {
  chartType?: CardChartType;
  color?: string;
  companyTimeZone?: string;
  data: PeriodAnalysisData;
  period: PeriodAnalysisRange;
  scenarios: Scenario[];
  scopeOptions?: PeriodAnalysisScopeOption[];
  sourceSeriesCount?: number;
  theme?: "light" | "dark";
  widget: PeriodAnalysisWidget;
}): PeriodAnalysisWidgetModel {
  if (widget.kind === "hourly_occupancy") {
    return buildHourlyOccupancyModel(
      widget,
      data,
      period,
      scenarios,
      color,
      companyTimeZone,
    );
  }

  const resolvedScope = resolveWidgetScope(
    widget,
    data,
    scenarios,
    scopeOptions,
  );
  const selectedScenarios = resolvedScope.scenarios;
  const scopedData = resolvedScope.data;

  if (!selectedScenarios.length) {
    return {
      description: widgetDescription(widget),
      emptyText: "Selecione ao menos um cenário para gerar esta análise.",
      hasData: false,
      height: widget.kind === "heatmap" ? 480 : 320,
    };
  }

  if (widget.kind === "day_total") {
    return buildDayTotalModel(scopedData, period, selectedScenarios);
  }
  if (widget.kind === "target_progress") {
    return buildTargetProgressModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
    );
  }
  if (widget.kind === "cumulative_metric") {
    return buildCumulativeMetricModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
    );
  }
  if (widget.kind === "daily_comparison") {
    return buildDailyComparisonModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
      color,
    );
  }
  if (
    widget.kind === "year_monthly" ||
    widget.kind === "year_accumulated"
  ) {
    return buildCurrentYearModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
      color,
    );
  }
  if (widget.kind === "summary") {
    return buildSummaryModel(scopedData, period, selectedScenarios);
  }
  if (widget.kind === "timeline") {
    return buildTimelineModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
      color,
      sourceSeriesCount,
    );
  }
  if (widget.kind === "comparison") {
    return buildComparisonModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
      color,
      sourceSeriesCount,
    );
  }
  if (widget.kind === "ranking") {
    return buildRankingModel(scopedData, period, selectedScenarios, color);
  }
  if (widget.kind === "heatmap") {
    return buildHeatmapModel(
      scopedData,
      period,
      selectedScenarios,
      color,
      theme,
    );
  }
  if (widget.kind === "cumulative") {
    return buildCumulativeModel(
      widget,
      scopedData,
      period,
      selectedScenarios,
      color,
    );
  }
  if (widget.kind === "scenario_cumulative") {
    return buildScenarioCumulativeModel(
      scopedData,
      period,
      selectedScenarios,
      color,
    );
  }
  if (widget.kind === "scope_totals") {
    return buildScopeTotalsModel(
      scopedData,
      period,
      selectedScenarios,
      color,
    );
  }
  if (widget.kind === "trend") {
    return buildTrendModel(scopedData, period, selectedScenarios, color);
  }
  if (widget.kind === "peak_days") {
    return buildPeakDaysModel(scopedData, period, selectedScenarios, color);
  }
  if (widget.kind === "rose") {
    return buildRoseModel(
      scopedData,
      period,
      selectedScenarios,
      color,
      normalizeScenarioCompositionChartType(chartType),
    );
  }
  if (widget.kind === "totals_table") {
    return buildScenarioTotalsModel(scopedData, period, selectedScenarios);
  }

  return buildHourProfileModel(scopedData, period, selectedScenarios, color);
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
    const fromIsDayBoundary =
      civilDayBoundary(period.from).getTime() === period.from.getTime();
    const toIsDayBoundary =
      civilDayBoundary(period.to).getTime() === period.to.getTime();
    const durationInCalendarDays = Math.round(
      (Date.UTC(
        period.to.getFullYear(),
        period.to.getMonth(),
        period.to.getDate(),
      ) -
        Date.UTC(
          period.from.getFullYear(),
          period.from.getMonth(),
          period.from.getDate(),
        )) /
        (24 * 60 * 60 * 1_000),
    );
    const to = new Date(period.from);
    return {
      from:
        fromIsDayBoundary && toIsDayBoundary
          ? addDays(period.from, -durationInCalendarDays)
          : new Date(
              period.from.getTime() -
                (period.to.getTime() - period.from.getTime()),
            ),
      to,
    };
  }

  const amount = baseline === "last_year" ? -12 : -1;
  return {
    from: shiftMonthsClamped(period.from, amount),
    to: shiftExclusiveEndClamped(period.to, amount),
  };
}

export function periodAnalysisBaselineDataRange(
  period: PeriodAnalysisRange,
  baseline: PeriodAnalysisBaseline,
): PeriodAnalysisRange {
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const comparable = periodAnalysisBaselineRange(analysisPeriod, baseline);
  if (
    !isSingleDayAnalysisPeriod(period) ||
    baseline === "previous_period"
  ) {
    return comparable;
  }

  const from = new Date(
    comparable.from.getFullYear(),
    comparable.from.getMonth(),
    1,
  );
  return {
    from,
    to: new Date(from.getFullYear(), from.getMonth() + 1, 1),
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
  period?: PeriodAnalysisRange,
  sourceSeriesCount = 1,
) {
  if (widget.kind === "hourly_occupancy") return "hour";
  if (
    !period ||
    (widget.kind !== "timeline" && widget.kind !== "comparison")
  ) {
    return widget.granularity;
  }
  return resolveCountingAnalysisVisualGranularity(
    widget.granularity,
    period,
    Math.max(1, sourceSeriesCount),
  );
}

function periodRangeThroughNow(period: PeriodAnalysisRange) {
  const now = new Date();
  return now >= period.from && now < period.to
    ? { from: period.from, to: now }
    : period;
}

function buildDayTotalModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
): PeriodAnalysisWidgetModel {
  const singleDay = isSingleDayAnalysisPeriod(period);
  const { dataset, effectivePeriod } = selectedPeriodDataset(data, period);
  const points = combinedPoints(
    dataset,
    scenarios,
    effectivePeriod,
    singleDay ? "hour" : "day",
  );
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const label = singleDay ? "Total do dia" : "Total do período";
  const periodLabel = formatPeriodAnalysisRange(period);

  return {
    description: singleDay
      ? "Total calculado exclusivamente pelas horas da data consultada."
      : "Total consolidado exclusivamente no intervalo consultado.",
    emptyText: "Sem eventos no período e nos cenários selecionados.",
    error: dataset.error,
    hasData: total !== 0,
    height: 130,
    metrics: [{ description: periodLabel, label, value: total }],
    table: {
      columns: [
        { key: "indicator", label: "Indicador", width: 34 },
        { key: "value", label: "Valor", numeric: true, width: 22 },
        { key: "period", label: "Período", width: 30 },
      ],
      description: periodLabel,
      rows: [{ indicator: label, period: periodLabel, value: total }],
      title: label,
    },
  };
}

function buildTargetProgressModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
): PeriodAnalysisWidgetModel {
  const singleDay = isSingleDayAnalysisPeriod(period);
  const { dataset, effectivePeriod } = selectedPeriodDataset(data, period);
  const currentPoints = combinedPoints(
    dataset,
    scenarios,
    effectivePeriod,
    singleDay ? "hour" : "day",
  );
  const currentTotal = currentPoints.reduce(
    (sum, point) => sum + point.total,
    0,
  );
  const currentValue = singleDay
    ? currentTotal
    : currentPoints.length
      ? currentTotal / currentPoints.length
      : 0;
  const baselineDataset =
    data.baseline[widget.baseline] ?? emptyDataset("day");
  const baselinePeriod = periodAnalysisBaselineDataRange(
    period,
    widget.baseline,
  );
  const baselinePoints = combinedPoints(
    baselineDataset,
    scenarios,
    baselinePeriod,
    "day",
  );
  const baselineTotal = baselinePoints.reduce(
    (sum, point) => sum + point.total,
    0,
  );
  const baselineAverage = baselinePoints.length
    ? baselineTotal / baselinePoints.length
    : 0;
  const progress = baselineAverage ? currentValue / baselineAverage : null;
  const baselineLabel = periodAnalysisBaselineLabel(widget.baseline);

  return {
    description: singleDay
      ? `Total do dia contra a média diária de ${baselineLabel.toLowerCase()}.`
      : `Média diária do período contra ${baselineLabel.toLowerCase()}.`,
    emptyText: "Sem histórico suficiente para calcular a média-base.",
    error: dataset.error ?? baselineDataset.error,
    hasData: currentTotal !== 0 || baselineAverage !== 0,
    height: 130,
    metrics: [
      {
        description: baselineAverage
          ? `${formatNumber(Math.round(currentValue))} atual · média-base ${formatNumber(Math.round(baselineAverage))}`
          : "Sem histórico diário na base escolhida",
        label: singleDay ? "Dia x média-base" : "Média x base",
        value: progress === null ? "Sem base" : formatPercent(progress),
      },
    ],
    table: {
      columns: [
        { key: "current", label: "Atual", numeric: true, width: 22 },
        { key: "baseline", label: "Média-base", numeric: true, width: 22 },
        { key: "progress", label: "Atingimento", width: 20 },
      ],
      description: baselineLabel,
      rows: [
        {
          baseline: Math.round(baselineAverage),
          current: Math.round(currentValue),
          progress: progress === null ? "-" : formatPercent(progress),
        },
      ],
      title: widget.title,
    },
  };
}

function buildCumulativeMetricModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
): PeriodAnalysisWidgetModel {
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const effectivePeriod = periodRangeThroughNow(analysisPeriod);
  const baselinePeriod = periodAnalysisBaselineRange(
    effectivePeriod,
    widget.baseline,
  );
  const baselineDataset =
    data.baselineComparable?.[widget.baseline] ??
    data.baseline[widget.baseline] ??
    emptyDataset("day");
  const currentPoints = combinedPoints(
    data.day,
    scenarios,
    effectivePeriod,
    "day",
  );
  const baselinePoints = combinedPoints(
    baselineDataset,
    scenarios,
    baselinePeriod,
    "day",
  );
  const currentTotal = currentPoints.reduce(
    (sum, point) => sum + point.total,
    0,
  );
  const baselineTotal = baselinePoints.reduce(
    (sum, point) => sum + point.total,
    0,
  );
  const variation = ratioVariation(currentTotal, baselineTotal);
  const baselineLabel = periodAnalysisBaselineLabel(widget.baseline);

  return {
    description: `${formatPeriodAnalysisRange(analysisPeriod)} contra ${baselineLabel.toLowerCase()}.`,
    emptyText: "Sem dados acumulados para o período e a base escolhida.",
    error: data.day.error ?? baselineDataset.error,
    hasData: currentTotal !== 0 || baselineTotal !== 0,
    height: 130,
    metrics: [
      {
        description: `${formatNumber(baselineTotal)} na base · ${formatSignedPercent(variation)}`,
        label: "Acumulado atual",
        value: currentTotal,
      },
    ],
    table: {
      columns: [
        { key: "current", label: "Acumulado atual", numeric: true, width: 24 },
        { key: "baseline", label: "Acumulado-base", numeric: true, width: 24 },
        { key: "variation", label: "Variação", width: 20 },
      ],
      description: baselineLabel,
      rows: [
        {
          baseline: baselineTotal,
          current: currentTotal,
          variation: formatSignedPercent(variation),
        },
      ],
      title: widget.title,
    },
  };
}

function buildDailyComparisonModel(
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
  const baselineDataset =
    data.baselineComparable?.[widget.baseline] ??
    data.baseline[widget.baseline] ??
    emptyDataset("day");
  const current = combinedPoints(
    data.day,
    scenarios,
    effectivePeriod,
    "day",
  );
  const baseline = combinedPoints(
    baselineDataset,
    scenarios,
    baselinePeriod,
    "day",
  );
  const baselineAverage = baseline.length
    ? baseline.reduce((sum, point) => sum + point.total, 0) / baseline.length
    : 0;
  const baselineLabel = periodAnalysisBaselineLabel(widget.baseline);
  const currentTotal = current.reduce((sum, point) => sum + point.total, 0);
  const baselineTotal = baseline.reduce((sum, point) => sum + point.total, 0);

  return {
    description: `${baselineLabel} à esquerda e período consultado à direita. Linha tracejada: média diária da base.`,
    emptyText: "Sem dados diários para comparar os períodos.",
    error: data.day.error ?? baselineDataset.error,
    hasData: currentTotal !== 0 || baselineTotal !== 0,
    height: 340,
    insights: [
      {
        label: "Atual",
        tone: "primary",
        value: formatNumber(currentTotal),
      },
      {
        label: "Base",
        tone: "muted",
        value: formatNumber(baselineTotal),
      },
    ],
    option: buildCurrentBaselineBarOption(
      current.map((point) => point.label),
      baseline.map((point) => point.total),
      current.map((point) => point.total),
      baselineLabel,
      "Período selecionado",
      color,
      current.map((point) => point.bucket),
      baselineAverage,
    ),
    table: {
      columns: [
        { key: "date", label: "Data atual", width: 18 },
        { key: "baseline_date", label: "Data-base", width: 18 },
        { key: "baseline", label: "Base", numeric: true, width: 20 },
        { key: "current", label: "Atual", numeric: true, width: 20 },
        { key: "variation", label: "Variação", width: 14 },
      ],
      description: `${formatPeriodAnalysisRange(analysisPeriod)} · ${baselineLabel}`,
      rows: current.map((point, index) => ({
        baseline: baseline[index]?.total ?? 0,
        baseline_date: baseline[index]?.label ?? "-",
        current: point.total,
        date: point.label,
        variation: formatVariation(
          point.total,
          baseline[index]?.total ?? 0,
        ),
      })),
      title: widget.title,
    },
  };
}

function buildCurrentYearModel(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const reference = new Date(period.to.getTime() - 1);
  const year = reference.getFullYear();
  const currentMonth = reference.getMonth();
  const monthLabels = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  let accumulated = 0;
  const points = monthLabels.map<CurrentYearMonthPoint>((label, month) => {
    let value: number | null = null;
    if (month < currentMonth) {
      const from = new Date(year, month, 1);
      value = sumSelectedScenarioRows({
        from,
        rows: data.month.rows,
        scenarios,
        sourceGranularity: data.month.granularity,
        to: new Date(year, month + 1, 1),
      });
    } else if (month === currentMonth) {
      const from = new Date(year, month, 1);
      const to = new Date(
        Math.min(
          periodRangeThroughNow(period).to.getTime(),
          new Date(year, month + 1, 1).getTime(),
        ),
      );
      value = sumSelectedScenarioRows({
        from,
        rows: data.month.rows,
        scenarios,
        sourceGranularity: data.month.granularity,
        to,
      });
    }

    if (value !== null) accumulated += value;
    return {
      accumulated: value === null ? null : accumulated,
      label,
      month,
      value,
    };
  });
  const accumulatedView = widget.kind === "year_accumulated";
  const recorded = points.filter((point) => point.value !== null);
  const latest = recorded.at(-1);

  return {
    description: accumulatedView
      ? `Soma progressiva dos meses de ${year} até a data consultada.`
      : `Valores mensais de ${year} até a data consultada e média mensal tracejada.`,
    emptyText: "Sem dados mensais para o ano da data consultada.",
    error: data.month.error,
    hasData: recorded.some((point) => (point.value ?? 0) !== 0),
    height: 340,
    insights: latest
      ? [
          {
            label: accumulatedView ? "Acumulado" : "Último mês",
            tone: "primary",
            value: formatNumber(
              accumulatedView
                ? latest.accumulated ?? 0
                : latest.value ?? 0,
            ),
          },
        ]
      : undefined,
    option: buildCurrentYearComparisonOption(
      points,
      accumulatedView,
      year,
      color,
    ),
    table: {
      columns: [
        { key: "month", label: "Mês", width: 18 },
        { key: "value", label: "Valor mensal", numeric: true, width: 22 },
        { key: "accumulated", label: "Acumulado", numeric: true, width: 22 },
      ],
      description: String(year),
      rows: recorded.map((point) => ({
        accumulated: point.accumulated ?? 0,
        month: point.label,
        value: point.value ?? 0,
      })),
      title: widget.title,
    },
  };
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
  sourceSeriesCount: number,
): PeriodAnalysisWidgetModel {
  const granularity = periodAnalysisEffectiveGranularity(
    widget,
    period,
    sourceSeriesCount,
  );
  const resolutionAdapted = granularity !== widget.granularity;
  const effectivePeriod = periodRangeThroughNow(period);
  const dataset = analysisDatasetForGranularity(data, granularity);
  const points = combinedPoints(
    dataset,
    scenarios,
    effectivePeriod,
    granularity,
  );
  const option = buildBarTimelineOption(
    points,
    color,
    granularity === "hour" && isSingleDayAnalysisPeriod(period),
  );
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const peak = points.reduce<ScenarioAnalyticsPoint | null>(
    (largest, point) =>
      !largest || point.total > largest.total ? point : largest,
    null,
  );

  return {
    appliedGranularity: granularity,
    description: resolutionAdapted
      ? `Intervalo extenso consolidado automaticamente em ${granularityLabel(granularity).toLowerCase()}, sem alterar o total do período.`
      : `${granularityLabel(granularity)} dos cenários selecionados em ${formatPeriodAnalysisRange(period)}.`,
    emptyText: "Sem fluxo no período e nos cenários selecionados.",
    error: dataset.error,
    hasData: points.some((point) => point.total !== 0),
    height: 330,
    insights: [
      ...(resolutionAdapted
        ? [
            {
              label: "Resolução",
              tone: "muted" as const,
              value: `${granularityLabel(granularity)} · ${points.length} pontos`,
            },
          ]
        : []),
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
  sourceSeriesCount: number,
): PeriodAnalysisWidgetModel {
  const granularity = resolveCountingAnalysisVisualGranularity(
    widget.granularity,
    period,
    Math.max(1, sourceSeriesCount),
  );
  const resolutionAdapted = granularity !== widget.granularity;
  const effectivePeriod = periodRangeThroughNow(period);
  const dataset = analysisDatasetForGranularity(data, granularity);
  const rawSeries = buildIndividualScenarioSeries({
    from: effectivePeriod.from,
    granularity,
    includeOverlappingSourceBuckets:
      dataset.partialBoundariesReconciled === true,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: effectivePeriod.to,
  });
  const comparisonSeries = consolidateComparisonSeries(rawSeries);
  const series = comparisonSeries.series;
  const option = buildMultiScenarioOption(
    series,
    color,
    granularity === "hour" && isSingleDayAnalysisPeriod(period),
  );
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
    appliedGranularity: granularity,
    description: comparisonSeries.groupedCount
      ? `Comparação consolidada em ${granularityLabel(granularity).toLowerCase()}, com os ${comparisonSeries.visibleIndividualCount} maiores cenários e ${comparisonSeries.groupedCount} reunidos em Outros; o total integral foi preservado.`
      : resolutionAdapted
        ? `Comparação consolidada automaticamente em ${granularityLabel(granularity).toLowerCase()}; cada cenário mantém o total integral do intervalo.`
        : `${granularityLabel(granularity)} com uma série para cada cenário escolhido.`,
    emptyText: "Sem dados nos cenários escolhidos para comparar.",
    error: dataset.error,
    hasData: series.some((item) =>
      item.points.some((point) => point.total !== 0),
    ),
    height: 360,
    insights: [
      ...(resolutionAdapted
        ? [
            {
              label: "Resolução",
              tone: "muted" as const,
              value: `${granularityLabel(granularity)} · ${labels.length} pontos por série`,
            },
          ]
        : []),
      ...(comparisonSeries.groupedCount
        ? [
            {
              label: "Séries",
              tone: "muted" as const,
              value: `${comparisonSeries.visibleIndividualCount} + Outros`,
            },
          ]
        : []),
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

function consolidateComparisonSeries<
  Point extends { total: number },
  Series extends { id: string; name: string; points: Point[] },
>(series: Series[]) {
  const pointCount = Math.max(1, series[0]?.points.length ?? 0);
  const maxSeries = Math.max(2, Math.floor(5_000 / pointCount));
  if (series.length <= maxSeries) {
    return {
      groupedCount: 0,
      series,
      visibleIndividualCount: series.length,
    };
  }

  const sorted = [...series].sort(
    (left, right) =>
      right.points.reduce((sum, point) => sum + point.total, 0) -
        left.points.reduce((sum, point) => sum + point.total, 0) ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
  const visibleIndividualCount = maxSeries - 1;
  const visible = sorted.slice(0, visibleIndividualCount);
  const grouped = sorted.slice(visibleIndividualCount);
  const template = grouped[0];
  const other = {
    ...template,
    id: "analysis-comparison-other-scenarios",
    name: `Outros (${grouped.length})`,
    points: template.points.map((point, index) => ({
      ...point,
      total: grouped.reduce(
        (sum, item) => sum + (item.points[index]?.total ?? 0),
        0,
      ),
    })),
  } as Series;

  return {
    groupedCount: grouped.length,
    series: [...visible, other],
    visibleIndividualCount,
  };
}

function consolidateScenarioSummaryPoints<
  Point extends { id: string; name: string; share: number; total: number },
>(points: Point[], limit = 20): Point[] {
  if (points.length <= limit) return points;

  const visible = points.slice(0, limit - 1);
  const grouped = points.slice(limit - 1);
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const groupedTotal = grouped.reduce((sum, point) => sum + point.total, 0);
  return [
    ...visible,
    {
      ...grouped[0],
      id: "analysis-other-scenarios",
      name: `Outros (${grouped.length})`,
      share: total ? groupedTotal / total : 0,
      total: groupedTotal,
    },
  ];
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
  const visualRanking = consolidateScenarioSummaryPoints(ranking);
  const displayed = [...visualRanking].reverse();
  const height = Math.max(290, visualRanking.length * 34 + 60);
  const leader = ranking[0];
  const total = ranking.reduce((sum, point) => sum + point.total, 0);

  return {
    description: isSingleDayAnalysisPeriod(period)
      ? `Volume e representatividade no mês até ${formatDate(period.from)}.`
      : `Volume e representatividade apenas dos cenários escolhidos.${visualRanking.length === ranking.length ? "" : " A visualização reúne a cauda em Outros; a tabela mantém todos os cenários."}`,
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
  const visualRanking = consolidateScenarioSummaryPoints(ranking);
  return {
    description: `${scenarioCompositionDescription(chartType)}${visualRanking.length === ranking.length ? "" : " Os menores cenários foram reunidos em Outros; a tabela preserva o detalhamento integral."}`,
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
      visualRanking.map((point) => ({ name: point.name, value: point.total })),
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
  const singleDay = isSingleDayAnalysisPeriod(period);
  const { dataset, effectivePeriod } = selectedPeriodDataset(data, period);
  const selectedPoints = buildScenarioCumulativeTotals({
    from: effectivePeriod.from,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: effectivePeriod.to,
  }).sort(
    (left, right) =>
      right.total - left.total ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
  const monthPeriod = periodRangeThroughNow(
    singleDay ? periodAnalysisOperationalRange(period) : period,
  );
  const monthPoints = singleDay
    ? buildScenarioCumulativeTotals({
        from: monthPeriod.from,
        rows: data.day.rows,
        scenarios,
        sourceGranularity: data.day.granularity,
        to: monthPeriod.to,
      })
    : selectedPoints;
  const monthById = new Map(monthPoints.map((point) => [point.id, point]));
  const selectedTotal = selectedPoints.reduce(
    (sum, point) => sum + point.total,
    0,
  );
  const monthTotal = monthPoints.reduce((sum, point) => sum + point.total, 0);
  const visualSelectedPoints = consolidateScenarioSummaryPoints(selectedPoints);
  const groupedSelectedIds = new Set(
    selectedPoints
      .slice(Math.max(0, visualSelectedPoints.length - 1))
      .map((point) => point.id),
  );
  const visualMonthById = new Map(
    visualSelectedPoints.map((point) => {
      if (point.id !== "analysis-other-scenarios") {
        return [
          point.id,
          monthById.get(point.id) ?? { ...point, share: 0, total: 0 },
        ] as const;
      }

      const groupedMonthTotal = monthPoints.reduce(
        (sum, monthPoint) =>
          groupedSelectedIds.has(monthPoint.id)
            ? sum + monthPoint.total
            : sum,
        0,
      );
      return [
        point.id,
        {
          ...point,
          share: monthTotal ? groupedMonthTotal / monthTotal : 0,
          total: groupedMonthTotal,
        },
      ] as const;
    }),
  );

  return {
    description: singleDay
      ? "Acumulado individual no dia consultado e no mês até essa data."
      : "Acumulado individual dos cenários no intervalo consultado.",
    displayTable: true,
    emptyText: "Sem totais para os cenários selecionados.",
    error: dataset.error ?? data.day.error,
    hasData:
      selectedPoints.some((point) => point.total > 0) ||
      monthPoints.some((point) => point.total > 0),
    height: Math.max(240, (visualSelectedPoints.length + 2) * 42),
    insights: [
      {
        label: singleDay ? "Total do dia" : "Total do período",
        tone: "primary",
        value: formatNumber(selectedTotal),
      },
      ...(singleDay
        ? [
            {
              label: "Total mensal",
              tone: "muted" as const,
              value: formatNumber(monthTotal),
            },
          ]
        : []),
      {
        label: "Cenários com fluxo",
        tone: "muted",
        value: formatNumber(
          selectedPoints.filter((point) => point.total > 0).length,
        ),
      },
    ],
    displayTableData: {
      columns: [
        { key: "scenario", label: "Cenário", width: 34 },
        {
          key: "selected",
          label: singleDay ? "Dia" : "Período",
          numeric: true,
          width: 18,
        },
        ...(singleDay
          ? [
              {
                key: "month",
                label: "Mês até a data",
                numeric: true,
                width: 20,
              },
            ]
          : []),
        { key: "share", label: "Representatividade", width: 20 },
      ],
      description:
        visualSelectedPoints.length === selectedPoints.length
          ? formatPeriodAnalysisRange(period)
          : `${formatPeriodAnalysisRange(period)} · menores cenários reunidos em Outros`,
      rows: [
        {
          ...(singleDay ? { month: monthTotal } : {}),
          scenario: "Total combinado",
          selected: selectedTotal,
          share: "100,0%",
        },
        ...visualSelectedPoints.map((point) => ({
          ...(singleDay
            ? { month: visualMonthById.get(point.id)?.total ?? 0 }
            : {}),
          scenario: point.name,
          selected: point.total,
          share: formatPercent(
            singleDay ? visualMonthById.get(point.id)?.share ?? 0 : point.share,
          ),
        })),
      ],
      title: "Tabela acumulada por cenário",
    },
    table: {
      columns: [
        { key: "scenario", label: "Cenário", width: 34 },
        {
          key: "selected",
          label: singleDay ? "Dia" : "Período",
          numeric: true,
          width: 18,
        },
        ...(singleDay
          ? [
              {
                key: "month",
                label: "Mês até a data",
                numeric: true,
                width: 20,
              },
            ]
          : []),
        { key: "share", label: "Representatividade", width: 20 },
      ],
      description: formatPeriodAnalysisRange(period),
      rows: [
        {
          ...(singleDay ? { month: monthTotal } : {}),
          scenario: "Total combinado",
          selected: selectedTotal,
          share: "100,0%",
        },
        ...selectedPoints.map((point) => {
          const monthPoint = monthById.get(point.id);
          return {
            ...(singleDay ? { month: monthPoint?.total ?? 0 } : {}),
            scenario: point.name,
            selected: point.total,
            share: formatPercent(
              singleDay ? monthPoint?.share ?? 0 : point.share,
            ),
          };
        }),
      ],
      title: "Tabela acumulada por cenário",
    },
  };
}

function buildScenarioCumulativeModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const { dataset, effectivePeriod } = selectedPeriodDataset(data, period);
  const points = buildScenarioCumulativeTotals({
    from: effectivePeriod.from,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: effectivePeriod.to,
  }).sort(
    (left, right) =>
      right.total - left.total ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const visualPoints = consolidateScenarioSummaryPoints(points);
  const periodLabel = formatPeriodAnalysisRange(period);

  return {
    description: `${isSingleDayAnalysisPeriod(period)
      ? "Total combinado e acumulado individual no dia selecionado."
      : "Total combinado e acumulado individual no intervalo selecionado."}${visualPoints.length === points.length ? "" : " A cauda visual foi reunida em Outros; a tabela mantém todos os cenários."}`,
    emptyText: "Sem totais para os cenários selecionados neste período.",
    error: dataset.error,
    hasData: points.some((point) => point.total > 0),
    height: Math.max(300, visualPoints.length * 34 + 60),
    insights: [
      { label: "Total", tone: "primary", value: formatNumber(total) },
      {
        label: "Cenários",
        tone: "muted",
        value: formatNumber(points.length),
      },
    ],
    option: buildScenarioCumulativeTotalsOption(
      visualPoints,
      color,
      isSingleDayAnalysisPeriod(period)
        ? "Acumulado do dia"
        : "Acumulado do período",
    ),
    table: {
      columns: [
        { key: "scenario", label: "Cenário", width: 40 },
        { key: "total", label: "Acumulado", numeric: true, width: 20 },
        { key: "share", label: "Participação", width: 20 },
      ],
      description: periodLabel,
      rows: points.map((point) => ({
        scenario: point.name,
        share: formatPercent(point.share),
        total: point.total,
      })),
      title: "Acumulado por cenário",
    },
  };
}

function buildScopeTotalsModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
): PeriodAnalysisWidgetModel {
  const { dataset, effectivePeriod } = selectedPeriodDataset(data, period);
  const points = buildScenarioCumulativeTotals({
    from: effectivePeriod.from,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: effectivePeriod.to,
  }).sort(
    (left, right) =>
      right.total - left.total ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const visualPoints = consolidateScenarioSummaryPoints(points);
  const periodLabel = formatPeriodAnalysisRange(period);

  return {
    description: `${isSingleDayAnalysisPeriod(period)
      ? "Comparação dos totais exclusivamente no dia consultado."
      : "Comparação dos totais exclusivamente no intervalo consultado."}${visualPoints.length === points.length ? "" : " A cauda visual foi reunida em Outros; a tabela mantém todas as visões."}`,
    emptyText: "Sem totais nas visões selecionadas para este período.",
    error: dataset.error,
    hasData: points.some((point) => point.total > 0),
    height: 330,
    insights: [
      { label: "Total combinado", tone: "primary", value: formatNumber(total) },
      {
        label: "Visões",
        tone: "muted",
        value: formatNumber(points.length),
      },
    ],
    option: buildScopeTotalsComparisonOption(
      visualPoints,
      color,
      isSingleDayAnalysisPeriod(period) ? "Total do dia" : "Total do período",
    ),
    table: {
      columns: [
        { key: "scope", label: "Visão", width: 40 },
        { key: "total", label: "Total", numeric: true, width: 20 },
        { key: "share", label: "Participação", width: 20 },
      ],
      description: periodLabel,
      rows: points.map((point) => ({
        scope: point.name,
        share: formatPercent(point.share),
        total: point.total,
      })),
      title: "Totais por visão",
    },
  };
}

function buildHeatmapModel(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
  scenarios: Scenario[],
  color: string,
  theme: "light" | "dark" = "light",
): PeriodAnalysisWidgetModel {
  const cellBorderColor =
    theme === "dark"
      ? "rgba(226, 232, 240, 0.12)"
      : "rgba(15, 23, 42, 0.09)";
  const activeCellBorderColor =
    theme === "dark"
      ? "rgba(248, 250, 252, 0.24)"
      : "rgba(15, 23, 42, 0.20)";
  const hourlyDataset = data.contextHour;
  const analysisPeriod = isSingleDayAnalysisPeriod(period)
    ? periodAnalysisOperationalRange(period)
    : period;
  const hourlyDetail = countingAnalysisHourlyDetailRange(analysisPeriod);
  const effectivePeriod = periodRangeThroughNow(hourlyDetail);
  const points = combinedPoints(
    hourlyDataset,
    scenarios,
    effectivePeriod,
    "hour",
  );
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
    description: hourlyDetail.limited
      ? `Detalhe horário limitado aos últimos ${buildCountingAnalysisRangePlan(hourlyDetail).spanDays} dias do intervalo; os consolidados mantêm todo o período.`
      : isSingleDayAnalysisPeriod(period)
      ? `Intensidade por dia e hora no mês até ${formatDate(period.from)}.`
      : "Intensidade combinada dos cenários escolhidos por dia e hora.",
    emptyText: "Sem eventos horários para montar o mapa de calor.",
    error: hourlyDataset.error,
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
              borderColor: activeCellBorderColor,
              borderWidth: 1,
              shadowBlur: 4,
              shadowColor:
                theme === "dark"
                  ? "rgba(248, 250, 252, 0.12)"
                  : "rgba(15, 23, 42, 0.14)",
            },
          },
          itemStyle: {
            borderColor: cellBorderColor,
            borderWidth: 1,
          },
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
        inRange: { color: monochromeHeatmapPalette(color, theme) },
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
  const baselineDataset =
    data.baselineComparable?.[widget.baseline] ??
    data.baseline[widget.baseline] ??
    emptyDataset("day");
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
      bucket: point.bucket,
      current: currentTotal,
      currentDate: point.label,
    };
  });
  const visualGranularity = resolveCountingAnalysisVisualGranularity(
    "day",
    analysisPeriod,
  );
  const visualPoints = samplePeriodAnalysisPoints(
    points,
    visualGranularity,
  );
  const baselineLabel = periodAnalysisBaselineLabel(widget.baseline);
  const latest = points.at(-1);
  const variation = latest
    ? ratioVariation(latest.current, latest.baseline)
    : 0;

  return {
    description: `${isSingleDayAnalysisPeriod(period) ? "Mês até a data escolhida" : "Período selecionado"} contra ${baselineLabel.toLowerCase()}. Base à esquerda e período atual à direita.${visualGranularity === "day" ? "" : ` Exibição amostrada em ${granularityLabel(visualGranularity).toLowerCase()}, mantendo o fechamento acumulado exato.`}`,
    emptyText: "Sem dados diários para o comparativo acumulado.",
    error: data.day.error ?? baselineDataset.error,
    hasData: points.some((point) => point.current !== 0 || point.baseline !== 0),
    height: 340,
    insights: latest
        ? [
          ...(visualGranularity === "day"
            ? []
            : [
                {
                  label: "Resolução",
                  tone: "muted" as const,
                  value: `${granularityLabel(visualGranularity)} · ${visualPoints.length} pontos`,
                },
              ]),
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
      visualPoints.map((point) => point.currentDate),
      visualPoints.map((point) => point.baseline),
      visualPoints.map((point) => point.current),
      baselineLabel,
      "Período selecionado",
      color,
      visualPoints.map((point) => point.bucket),
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
  const visualGranularity = resolveCountingAnalysisVisualGranularity(
    "day",
    analysisPeriod,
  );
  const visualTrendPoints = samplePeriodAnalysisPoints(
    trendPoints,
    visualGranularity,
  );
  const saturdayIndexes = visualTrendPoints.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = visualTrendPoints.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );
  const calendarDates = visualTrendPoints.map((point) => point.bucket);
  const direction7 = seriesDirection(
    trendPoints.map((point) => point.average7),
  );
  const direction30 = seriesDirection(
    trendPoints.map((point) => point.average30),
  );
  const latest = [...trendPoints]
    .reverse()
    .find((point) => point.average7 !== null || point.average30 !== null);
  return {
    description: isSingleDayAnalysisPeriod(period)
      ? `Médias móveis no mês até ${formatDate(period.from)}, com 29 dias anteriores de base.`
      : `Médias móveis calculadas com os 29 dias anteriores ao início do período.${visualGranularity === "day" ? "" : ` Exibição amostrada em ${granularityLabel(visualGranularity).toLowerCase()}, sem alterar os cálculos diários.`}`,
    emptyText: "São necessários ao menos 7 dias com dados para calcular a tendência.",
    error: data.day.error,
    hasData:
      historyPoints.some((point) => point.total !== 0) &&
      trendPoints.some((point) => point.average7 !== null),
    height: 330,
    insights: latest
      ? [
          ...(visualGranularity === "day"
            ? []
            : [
                {
                  label: "Resolução",
                  tone: "muted" as const,
                  value: `${granularityLabel(visualGranularity)} · ${visualTrendPoints.length} pontos`,
                },
              ]),
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
        OPERATIONAL_TREND_SERIES.average7.color,
        OPERATIONAL_TREND_SERIES.average30.color,
      ],
      grid: { bottom: 8, containLabel: true, left: 8, right: 12, top: 52 },
      legend: {
        data: [...OPERATIONAL_TREND_LEGEND_DATA],
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
          data: visualTrendPoints.map((point) => point.total),
          itemStyle: { color, opacity: 0.24 },
          markArea: buildCalendarMarkArea(calendarDates),
          name: OPERATIONAL_TREND_SERIES.volume.name,
          type: "bar",
        },
        {
          connectNulls: false,
          data: visualTrendPoints.map((point) => point.average7),
          itemStyle: { color: OPERATIONAL_TREND_SERIES.average7.color },
          lineStyle: {
            color: OPERATIONAL_TREND_SERIES.average7.color,
            opacity: 0.9,
            type: "solid",
            width: 2.5,
          },
          name: OPERATIONAL_TREND_SERIES.average7.name,
          showSymbol: false,
          smooth: 0.18,
          type: "line",
          z: 4,
        },
        {
          connectNulls: false,
          data: visualTrendPoints.map((point) => point.average30),
          itemStyle: { color: OPERATIONAL_TREND_SERIES.average30.color },
          lineStyle: {
            color: OPERATIONAL_TREND_SERIES.average30.color,
            opacity: 0.8,
            type: "dashed",
            width: 1.5,
          },
          name: OPERATIONAL_TREND_SERIES.average30.name,
          showSymbol: false,
          smooth: 0.18,
          type: "line",
          z: 3,
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
        data: visualTrendPoints.map((point) => point.label),
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
  companyTimeZone?: string,
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

  const sharedLineIds = sharedScenarioLineIds(
    entryScenarios,
    exitScenarios,
  );
  if (sharedLineIds.length) {
    return {
      description: widgetDescription(widget),
      emptyText: `${sharedLineIds.length} linha(s) de contagem estão simultaneamente em cenários de entrada e saída. Use cenários com linhas distintas para evitar dupla contagem.`,
      hasData: false,
      height: 340,
    };
  }

  const hourlyDetail = countingAnalysisHourlyDetailRange(period);
  const effectivePeriod = periodRangeThroughNow(hourlyDetail);
  const singleDay = isSingleDayAnalysisPeriod(period);
  const points = listDayStarts(effectivePeriod.from, effectivePeriod.to).flatMap(
    (day) => {
      const through = new Date(
        Math.min(addDays(day, 1).getTime(), effectivePeriod.to.getTime()),
      );
      return buildScenarioHourlyOccupancy({
        companyTimeZone,
        day,
        entryScenarios,
        exitScenarios,
        rows: data.hour.rows,
        sourceGranularity: data.hour.granularity,
        startHour: widget.startHour,
        through,
      })
        .filter((point) => singleDay || point.occupancy !== null)
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
    description: hourlyDetail.limited
      ? `Detalhe hora a hora dos últimos ${buildCountingAnalysisRangePlan(hourlyDetail).spanDays} dias do intervalo, reiniciado diariamente a partir de ${formatOccupancyStartHour(widget.startHour)}.`
      : singleDay
      ? `Entradas acumuladas menos saídas a partir de ${formatOccupancyStartHour(
          widget.startHour,
        )}; antes desse horário, o saldo é zero.`
      : `Saldo hora a hora reiniciado diariamente, com contagem a partir de ${formatOccupancyStartHour(
          widget.startHour,
        )}.`,
    emptyText: "Sem eventos horários nos cenários de entrada e saída.",
    error: data.hour.error,
    hasData: points.some((point) => point.occupancy !== null),
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
      rows: points
        .filter((point) => point.occupancy !== null)
        .map((point) => ({
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
  const hourlyDetail = countingAnalysisHourlyDetailRange(period);
  const effectivePeriod = periodRangeThroughNow(hourlyDetail);
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
    description: hourlyDetail.limited
      ? `Perfil horário calculado sobre os últimos ${buildCountingAnalysisRangePlan(hourlyDetail).spanDays} dias; os demais widgets mantêm o intervalo integral.`
      : "Média por faixa horária para localizar as horas de maior fluxo.",
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
  fixedHourlyAxis = false,
): EnterpriseChartOption {
  const saturdayIndexes = points.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = points.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );
  const calendarDates = points.map((point) => point.bucket);
  const throughHour = fixedHourlyAxis ? latestHourlyPointHour(points) : -1;
  const labels = fixedHourlyAxis
    ? HOUR_LABELS
    : points.map((point) => point.label);
  const values = fixedHourlyAxis
    ? buildFixedHourlyAxisValues(points, throughHour)
    : points.map((point) => point.total);

  return {
    color: [color],
    grid: { bottom: 8, containLabel: true, left: 8, right: 10, top: 18 },
    series: [
      {
        barCategoryGap: "50%",
        barMaxWidth: 28,
        data: values,
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

function buildMultiScenarioOption(
  series: Array<{
    id: string;
    name: string;
    points: ScenarioAnalyticsPoint[];
  }>,
  color: string,
  fixedHourlyAxis = false,
): EnterpriseChartOption {
  const calendarPoints = series[0]?.points ?? [];
  const saturdayIndexes = calendarPoints.flatMap((point, index) =>
    point.isSaturday ? [index] : [],
  );
  const sundayIndexes = calendarPoints.flatMap((point, index) =>
    point.isSunday ? [index] : [],
  );
  const calendarDates = calendarPoints.map((point) => point.bucket);
  const throughHour = fixedHourlyAxis
    ? latestHourlyPointHour(calendarPoints)
    : -1;
  const labels = fixedHourlyAxis
    ? HOUR_LABELS
    : calendarPoints.map((point) => point.label);

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
      data: fixedHourlyAxis
        ? buildFixedHourlyAxisValues(item.points, throughHour)
        : item.points.map((point) => point.total),
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

function buildCurrentBaselineBarOption(
  labels: string[],
  baseline: number[],
  current: number[],
  baselineLabel: string,
  currentLabel: string,
  color: string,
  calendarDates: Array<Date | string>,
  baselineAverage = 0,
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
        markLine:
          baselineAverage > 0
            ? {
                animation: false,
                data: [{ name: "Média-base", yAxis: baselineAverage }],
                label: {
                  color: "#A46B18",
                  fontSize: 10,
                  formatter: "Média-base",
                  position: "insideEndTop",
                },
                lineStyle: {
                  color: "#C48A38",
                  opacity: 0.72,
                  type: "dashed",
                  width: 1,
                },
                silent: true,
                symbol: "none",
              }
            : undefined,
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
  granularity: ScenarioAnalyticsGranularity,
) {
  return buildCombinedScenarioPoints({
    from: period.from,
    granularity,
    includeOverlappingSourceBuckets:
      dataset.partialBoundariesReconciled === true,
    rows: dataset.rows,
    scenarios,
    sourceGranularity: dataset.granularity,
    to: period.to,
  });
}

function resolveWidgetScope(
  widget: PeriodAnalysisWidget,
  data: PeriodAnalysisData,
  scenarios: Scenario[],
  scopeOptions: PeriodAnalysisScopeOption[],
) {
  if (widget.scopeMode === "scenario") {
    return {
      data,
      scenarios: selectScenarios(
        scenarios,
        widget.selectionMode,
        widget.scenarioIds,
      ),
    };
  }

  const optionsForMode = scopeOptions.filter(
    (option) => option.mode === widget.scopeMode,
  );
  const selectedIdSet = new Set(widget.scenarioIds);
  const selectedOptions =
    widget.selectionMode === "all"
      ? optionsForMode
      : optionsForMode.filter((option) => selectedIdSet.has(option.id));
  const selectedCameraIds = new Set(
    selectedOptions.flatMap((option) => option.cameraIds),
  );
  const lineIdsByCamera = new Map<string, Set<string>>();

  periodAnalysisDatasets(data).forEach((dataset) => {
    dataset.rows.forEach((row) => {
      if (!row.camera_id || !selectedCameraIds.has(row.camera_id)) return;
      const lineId = scopeRowLineId(row);
      const lineIds = lineIdsByCamera.get(row.camera_id) ?? new Set<string>();
      lineIds.add(lineId);
      lineIdsByCamera.set(row.camera_id, lineIds);
    });
  });

  const modeledOptions =
    widget.kind === "scope_totals" || selectedOptions.length <= 1
      ? selectedOptions
      : [
          {
            cameraIds: Array.from(selectedCameraIds),
            description: "Consolidação das visões selecionadas.",
            id: `analysis-${widget.scopeMode}-combined`,
            mode: widget.scopeMode,
            name: `${selectedOptions.length} visões consolidadas`,
          },
        ];
  const syntheticScenarios = modeledOptions.map<Scenario>((option) => {
    const lineIds = new Set(
      option.cameraIds.flatMap((cameraId) =>
        Array.from(lineIdsByCamera.get(cameraId) ?? []),
      ),
    );
    return {
      active: true,
      company_id: "",
      description: option.description,
      id: option.id,
      lines: Array.from(lineIds, (lineId) => ({
        action_multiplier: 1,
        line_count_id: lineId,
      })),
      name: option.name,
      scenario_type: `analysis_${option.mode}`,
    };
  });

  return {
    data: mapPeriodAnalysisDataRows(data, (rows) =>
      rows.flatMap((row) =>
        row.camera_id && selectedCameraIds.has(row.camera_id)
          ? [{ ...row, line_count_id: scopeRowLineId(row) }]
          : [],
      ),
    ),
    scenarios: syntheticScenarios,
  };
}

function periodAnalysisDatasets(data: PeriodAnalysisData) {
  return [
    data.contextHour,
    data.day,
    data.hour,
    data.minute,
    data.month,
    ...Object.values(data.baseline),
    ...Object.values(data.baselineComparable ?? {}),
  ].filter((dataset): dataset is PeriodAnalysisDataset => Boolean(dataset));
}

function mapPeriodAnalysisDataRows(
  data: PeriodAnalysisData,
  mapRows: (rows: AggregateEventRow[]) => AggregateEventRow[],
): PeriodAnalysisData {
  const mapDataset = (
    dataset: PeriodAnalysisDataset,
  ): PeriodAnalysisDataset => ({
    ...dataset,
    rows: mapRows(dataset.rows),
  });

  return {
    baseline: Object.fromEntries(
      Object.entries(data.baseline).map(([baseline, dataset]) => [
        baseline,
        dataset ? mapDataset(dataset) : dataset,
      ]),
    ),
    baselineComparable: data.baselineComparable
      ? Object.fromEntries(
          Object.entries(data.baselineComparable).map(
            ([baseline, dataset]) => [
              baseline,
              dataset ? mapDataset(dataset) : dataset,
            ],
          ),
        )
      : undefined,
    contextHour: mapDataset(data.contextHour),
    day: mapDataset(data.day),
    hour: mapDataset(data.hour),
    minute: mapDataset(data.minute),
    month: mapDataset(data.month),
  };
}

function scopeRowLineId(row: AggregateEventRow) {
  return [
    "analysis-scope",
    row.camera_id ?? "camera",
    row.line_count_id ?? "all-lines",
  ].join(":");
}

function analysisDatasetForGranularity(
  data: PeriodAnalysisData,
  granularity: ScenarioAnalyticsGranularity,
) {
  if (granularity === "minute") return data.minute;
  if (granularity === "hour") return data.hour;
  return data.day;
}

function selectedPeriodDataset(
  data: PeriodAnalysisData,
  period: PeriodAnalysisRange,
) {
  const singleDay = isSingleDayAnalysisPeriod(period);
  return {
    dataset: singleDay ? data.hour : data.day,
    effectivePeriod: periodRangeThroughNow(period),
  };
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
  while (cursor < to) {
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
  const isDayBoundary =
    civilDayBoundary(date).getTime() === date.getTime();
  return new Date(
    first.getFullYear(),
    first.getMonth(),
    Math.min(date.getDate(), lastDay),
    isDayBoundary ? 0 : date.getHours(),
    isDayBoundary ? 0 : date.getMinutes(),
    isDayBoundary ? 0 : date.getSeconds(),
    isDayBoundary ? 0 : date.getMilliseconds(),
  );
}

function samplePeriodAnalysisPoints<T extends { bucket: string }>(
  points: T[],
  granularity: ScenarioAnalyticsGranularity,
) {
  if (granularity === "day") return points;

  const sampled = new Map<number, T>();
  points.forEach((point) => {
    const bucket = new Date(point.bucket);
    if (Number.isNaN(bucket.getTime())) return;
    sampled.set(
      startOfAggregateBucket(bucket, granularity).getTime(),
      point,
    );
  });
  return Array.from(sampled.values());
}

function shiftExclusiveEndClamped(date: Date, amount: number) {
  if (civilDayBoundary(date).getTime() !== date.getTime()) {
    return shiftMonthsClamped(date, amount);
  }

  const lastIncludedDay = addDays(date, -1);
  return addDays(shiftMonthsClamped(lastIncludedDay, amount), 1);
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : null;
}

function addDays(date: Date, amount: number) {
  const isDayBoundary =
    civilDayBoundary(date).getTime() === date.getTime();
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
    isDayBoundary ? 0 : date.getHours(),
    isDayBoundary ? 0 : date.getMinutes(),
    isDayBoundary ? 0 : date.getSeconds(),
    isDayBoundary ? 0 : date.getMilliseconds(),
  );
}

function civilDayBoundary(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

function granularityLabel(granularity: ScenarioAnalyticsGranularity) {
  return (
    {
      day: "Dia a dia",
      hour: "Hora a hora",
      minute: "Minuto a minuto",
      month: "Mês a mês",
      week: "Semana a semana",
    } satisfies Record<ScenarioAnalyticsGranularity, string>
  )[granularity];
}

function widgetDescription(widget: PeriodAnalysisWidget) {
  if (widget.kind === "day_total") {
    return "Total exclusivo da data ou intervalo consultado.";
  }
  if (widget.kind === "target_progress") {
    return "Atingimento contra a média diária da base.";
  }
  if (widget.kind === "cumulative_metric") {
    return "Indicador compacto do acumulado contra a base.";
  }
  if (widget.kind === "daily_comparison") {
    return "Valores diários atuais e da base comparável.";
  }
  if (widget.kind === "year_monthly") {
    return "Valores mensais do ano da data consultada.";
  }
  if (widget.kind === "year_accumulated") {
    return "Soma progressiva dos meses do ano consultado.";
  }
  if (widget.kind === "heatmap") return "Distribuição do fluxo por dia e hora.";
  if (widget.kind === "ranking") return "Ranking e representatividade por cenário.";
  if (widget.kind === "cumulative") return "Acumulado contra uma base comparável.";
  if (widget.kind === "scenario_cumulative") {
    return "Acumulado individual dos cenários no período selecionado.";
  }
  if (widget.kind === "scope_totals") {
    return "Comparação dos totais das visões selecionadas.";
  }
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
