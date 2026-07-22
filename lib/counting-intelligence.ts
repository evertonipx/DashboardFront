import type { EnterpriseChartOption } from "@/components/app/echart";
import { parseAggregateBucket } from "@/lib/aggregate-time";
import { pastelBarColor } from "@/lib/chart-palette";
import {
  inferDirectionFromText,
  type ScenarioDirection,
} from "@/lib/scenario-direction";
import type {
  ReportChart,
  ReportMetric,
  ReportTable,
} from "@/lib/report-export";
import type { AggregateEventRow, Scenario } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const configuredHistoryStartYear = Number(
  process.env.NEXT_PUBLIC_REPORT_HISTORY_START_YEAR,
);

export const COUNTING_HISTORY_START_YEAR =
  Number.isInteger(configuredHistoryStartYear) &&
  configuredHistoryStartYear >= 2000
    ? configuredHistoryStartYear
    : 2020;

export const COUNTING_MONTH_LABELS = [
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
] as const;

export const COUNTING_INTELLIGENCE_CARD_IDS = {
  periodTotal: "report_counting_period_total",
  endMonth: "report_counting_end_month",
  monthlyAverage: "report_counting_monthly_average",
  accessLeader: "report_counting_access_leader",
  yearOverYearMonth: "report_counting_year_over_year_month",
  annualComparison: "report_counting_annual_comparison",
  annualAccumulatedComparison:
    "report_counting_annual_accumulated_comparison",
  directionalFlow: "report_counting_directional_flow",
  accessRanking: "report_counting_access_ranking",
} as const;

export type CountingIntelligenceCardId =
  (typeof COUNTING_INTELLIGENCE_CARD_IDS)[keyof typeof COUNTING_INTELLIGENCE_CARD_IDS];

export type CountingIntelligenceScope = {
  cameraIds: string[];
  name: string;
  scenario?: Scenario;
};

export type CountingYearRow = {
  average: number;
  months: Array<number | null>;
  monthYoy: Array<number | null>;
  selectedMonthCount: number;
  total: number;
  year: number;
  ytd: number;
  ytdYoy: number | null;
};

export type CountingAccessRow = {
  entry: number;
  entryPeakHour: number | null;
  entryPeakValue: number;
  entryRank: number;
  exit: number;
  exitPeakHour: number | null;
  exitPeakValue: number;
  exitRank: number;
  flow: number;
  flowPeakHour: number | null;
  flowPeakValue: number;
  flowRank: number;
  id: string;
  name: string;
  share: number;
};

export type CountingDirectionalHour = {
  entry: number;
  exit: number;
  hour: number;
  total: number;
};

export type CountingYearOverYearMonth = {
  current: number | null;
  delta: number | null;
  label: string;
  month: number;
  previous: number | null;
};

export type CountingMonthlyComparisonYearRow = {
  accumulated: number;
  average: number;
  baselineOnly: boolean;
  months: Array<number | null>;
  year: number;
};

export type CountingMonthlyComparison = {
  comparisonYear: number;
  latestYear: number;
  rows: CountingMonthlyComparisonYearRow[];
  variation: {
    accumulated: number | null;
    average: number | null;
    months: Array<number | null>;
  };
};

export type CountingAccessHour = CountingDirectionalHour & {
  accessId: string;
  accessName: string;
};

export type CountingIntelligenceModel = {
  accesses: CountingAccessRow[];
  accessHours: CountingAccessHour[];
  currentMonth: number;
  currentMonthDelta: number | null;
  currentMonthValue: number;
  currentYear: number;
  directionalHours: CountingDirectionalHour[];
  periodAverage: number;
  periodDelta: number | null;
  periodFrom: Date;
  periodMonthCount: number;
  periodTo: Date;
  periodValue: number;
  previousPeriodAverage: number;
  previousYearAverage: number;
  scopeName: string;
  yearOverYearMonths: CountingYearOverYearMonth[];
  yearRows: CountingYearRow[];
  ytdDelta: number | null;
  ytdValue: number;
};

type BuildCountingIntelligenceInput = {
  hourlyRows: AggregateEventRow[];
  includeOpenPeriod?: boolean;
  monthlyRows: AggregateEventRow[];
  now: Date;
  period?: {
    from: Date;
    to: Date;
  };
  scenarios: Scenario[];
  rankingScenarioIds?: string[];
  rankingOrder?: "asc" | "desc";
  rankingSelectionMode?: "all" | "custom";
  scope: CountingIntelligenceScope;
};

type Direction = ScenarioDirection;

type ScenarioDirectionTotals = {
  entry: number;
  exit: number;
};

type ScenarioLineBinding = {
  direction: Direction;
  scenarioId: string;
  weight: number;
};

export function buildCountingIntelligenceModel({
  hourlyRows,
  includeOpenPeriod = true,
  monthlyRows,
  now,
  period,
  rankingScenarioIds = [],
  rankingOrder = "desc",
  rankingSelectionMode = "all",
  scenarios,
  scope,
}: BuildCountingIntelligenceInput): CountingIntelligenceModel {
  const normalizedPeriod = normalizeModelPeriod(period, now, includeOpenPeriod);
  const periodFrom = normalizedPeriod.from;
  const periodTo = normalizedPeriod.to;
  const periodEnd = new Date(
    periodTo > periodFrom ? periodTo.getTime() - 1 : periodFrom.getTime(),
  );
  const currentYear = periodEnd.getFullYear();
  const currentMonth = periodEnd.getMonth();
  const selectedMonthTotals = aggregateScopeMonths(monthlyRows, scope);
  const firstYear = periodFrom.getFullYear();
  const yearRows: CountingYearRow[] = Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => firstYear + index,
  ).map((year) => {
    const months = COUNTING_MONTH_LABELS.map((_, month) => {
      const bucket = new Date(year, month, 1);
      if (bucket < periodFrom || bucket >= periodTo) return null;
      const key = monthKey(year, month);
      return selectedMonthTotals.has(key) ? selectedMonthTotals.get(key) ?? 0 : null;
    });
    const selectedMonthIndexes = months.flatMap((value, month) =>
      value === null ? [] : [month],
    );
    const recordedMonthIndexes = selectedMonthIndexes.filter((month) =>
      selectedMonthTotals.has(monthKey(year, month)),
    );
    const selectedTotal = sumValues(months);
    const previousComparable = selectedMonthIndexes.reduce(
      (sum, month) =>
        sum + (selectedMonthTotals.get(monthKey(year - 1, month)) ?? 0),
      0,
    );

    return {
      average: recordedMonthIndexes.length
        ? selectedTotal / recordedMonthIndexes.length
        : 0,
      months,
      monthYoy: months.map((value, month) =>
        value === null
          ? null
          : percentageDelta(
              value,
              selectedMonthTotals.get(monthKey(year - 1, month)) ?? 0,
            ),
      ),
      selectedMonthCount: recordedMonthIndexes.length,
      total: selectedTotal,
      year,
      ytd: selectedTotal,
      ytdYoy: percentageDelta(selectedTotal, previousComparable),
    } satisfies CountingYearRow;
  }).filter((row) => row.selectedMonthCount > 0 || row.year === currentYear);

  const periodValue = sumMonthRange(
    selectedMonthTotals,
    periodFrom,
    periodTo,
  );
  const previousPeriodFrom = addCalendarYears(periodFrom, -1);
  const previousPeriodTo = addCalendarYears(periodTo, -1);
  const previousPeriodValue = sumMonthRange(
    selectedMonthTotals,
    previousPeriodFrom,
    previousPeriodTo,
  );
  const periodMonthCount = countRecordedMonths(
    selectedMonthTotals,
    periodFrom,
    periodTo,
  );
  const previousPeriodMonthCount = countRecordedMonths(
    selectedMonthTotals,
    previousPeriodFrom,
    previousPeriodTo,
  );
  const currentMonthValue =
    selectedMonthTotals.get(monthKey(currentYear, currentMonth)) ?? 0;
  const previousCurrentMonthValue =
    selectedMonthTotals.get(monthKey(currentYear - 1, currentMonth)) ?? 0;
  const monthlyScenarioTotals = aggregateScenarioDirections(
    monthlyRows.filter((row) =>
      isMonthlyBucketInRange(row.bucket, periodFrom, periodTo),
    ),
    scenarios,
  );
  const hourlyScenarioTotals = aggregateScenarioDirections(hourlyRows, scenarios);
  const accesses = filterAndRankAccessRows(
    buildAccessRows(scenarios, monthlyScenarioTotals, hourlyScenarioTotals),
    rankingSelectionMode,
    rankingScenarioIds,
    rankingOrder,
  );
  const accessHours = buildAccessHours(scenarios, hourlyScenarioTotals);
  const directionalHours = Array.from({ length: 24 }, (_, hour) => {
    const values = accessHours.filter((item) => item.hour === hour);
    const entry = values.reduce((sum, item) => sum + item.entry, 0);
    const exit = values.reduce((sum, item) => sum + item.exit, 0);

    return { entry, exit, hour, total: entry + exit };
  });
  const yearOverYearMonths = COUNTING_MONTH_LABELS.flatMap((label, month) => {
    const bucket = new Date(currentYear, month, 1);
    if (bucket < periodFrom || bucket >= periodTo) return [];

    const currentKey = monthKey(currentYear, month);
    const previousKey = monthKey(currentYear - 1, month);
    const current = selectedMonthTotals.has(currentKey)
      ? selectedMonthTotals.get(currentKey) ?? 0
      : null;
    const previous = selectedMonthTotals.has(previousKey)
      ? selectedMonthTotals.get(previousKey) ?? 0
      : null;
    return [
      {
        current,
        delta:
          current === null || previous === null
            ? null
            : percentageDelta(current, previous),
        label,
        month,
        previous,
      } satisfies CountingYearOverYearMonth,
    ];
  });

  return {
    accesses,
    accessHours,
    currentMonth,
    currentMonthDelta: percentageDelta(
      currentMonthValue,
      previousCurrentMonthValue,
    ),
    currentMonthValue,
    currentYear,
    directionalHours,
    periodAverage: periodMonthCount ? periodValue / periodMonthCount : 0,
    periodDelta: percentageDelta(periodValue, previousPeriodValue),
    periodFrom,
    periodMonthCount,
    periodTo,
    periodValue,
    previousPeriodAverage: previousPeriodMonthCount
      ? previousPeriodValue / previousPeriodMonthCount
      : 0,
    previousYearAverage: previousPeriodMonthCount
      ? previousPeriodValue / previousPeriodMonthCount
      : 0,
    scopeName: scope.name,
    yearOverYearMonths,
    yearRows,
    ytdDelta: percentageDelta(periodValue, previousPeriodValue),
    ytdValue: periodValue,
  };
}

export function buildCountingIntelligenceReportAssets(
  model: CountingIntelligenceModel,
  colors: Partial<Record<CountingIntelligenceCardId, string>> = {},
): {
  charts: Array<{
    cardId: CountingIntelligenceCardId;
    value: ReportChart;
  }>;
  metrics: Array<{
    cardId: CountingIntelligenceCardId;
    value: ReportMetric;
  }>;
  tables: Array<{
    cardId: CountingIntelligenceCardId;
    value: ReportTable;
  }>;
} {
  const currentMonthLabel = COUNTING_MONTH_LABELS[model.currentMonth];
  const leader = model.accesses[0];
  const monthlyComparisonTable = buildMonthlyComparisonReportTable(model);
  const annualAccumulatedTable = buildAnnualAccumulatedReportTable(model);
  const accessTable = buildAccessRankingReportTable(model);
  const directionalTable = buildDirectionalHourlyReportTable(model);
  const periodLabel = formatCountingIntelligencePeriod(model);
  const charts: Array<{
    cardId: CountingIntelligenceCardId;
    value: ReportChart;
  }> = [
    {
      cardId: COUNTING_INTELLIGENCE_CARD_IDS.annualComparison,
      value: {
        description: `Comparação mensal da visão selecionada em ${periodLabel}.`,
        option: buildAnnualComparisonChartOption(
          model,
          colors[COUNTING_INTELLIGENCE_CARD_IDS.annualComparison],
        ),
        table: monthlyComparisonTable,
        title: "Comparativo mensal por ano",
      },
    },
    {
      cardId: COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison,
      value: {
        description: `Evolução acumulada mês a mês da visão selecionada em ${periodLabel}.`,
        option: buildAnnualAccumulatedComparisonChartOption(
          model,
          colors[
            COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison
          ],
        ),
        table: annualAccumulatedTable,
        title: "Comparativo acumulado por ano",
      },
    },
  ];

  if (model.accesses.length) {
    charts.push({
      cardId: COUNTING_INTELLIGENCE_CARD_IDS.accessRanking,
      value: {
        description: `Participação acumulada em ${periodLabel}; cada acesso corresponde a um cenário.`,
        option: buildAccessShareChartOption(
          model,
          colors[COUNTING_INTELLIGENCE_CARD_IDS.accessRanking],
        ),
        table: accessTable,
        title: "Ranking e representatividade dos acessos",
      },
    });
  }

  if (model.directionalHours.some((item) => item.total > 0)) {
    charts.push({
      cardId: COUNTING_INTELLIGENCE_CARD_IDS.directionalFlow,
      value: {
        description: `Entradas e saídas consolidadas por hora nos cenários de acesso em ${periodLabel}.`,
        option: buildDirectionalHourlyChartOption(
          model,
          colors[COUNTING_INTELLIGENCE_CARD_IDS.directionalFlow],
        ),
        table: directionalTable,
        title: "Fluxo direcional por hora",
      },
    });
  }

  return {
    charts,
    metrics: [
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.periodTotal,
        value: {
          description: deltaDescription(
            model.periodDelta,
            "o mesmo intervalo deslocado em um ano",
          ),
          label: "Total do período",
          value: formatNumber(model.periodValue),
        },
      },
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.endMonth,
        value: {
          description: deltaDescription(
            model.currentMonthDelta,
            `${currentMonthLabel}/${model.currentYear - 1}`,
          ),
          label: `${currentMonthLabel}/${model.currentYear}`,
          value: formatNumber(model.currentMonthValue),
        },
      },
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.monthlyAverage,
        value: {
          description: `Base anterior: ${formatNumber(
            model.previousPeriodAverage,
          )} por mês`,
          label: "Média mensal",
          value: formatNumber(model.periodAverage),
        },
      },
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.accessLeader,
        value: {
          description: leader
            ? `${formatPercentage(leader.share)} do fluxo no período`
            : "Sem fluxo direcional no período",
          label: "Acesso líder",
          value: leader?.name ?? "-",
        },
      },
    ],
    tables: [
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.yearOverYearMonth,
        value: monthlyComparisonTable,
      },
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.accessRanking,
        value: buildAccessPeakReportTable(model),
      },
      {
        cardId: COUNTING_INTELLIGENCE_CARD_IDS.directionalFlow,
        value: buildAccessHourlyDetailReportTable(model),
      },
    ].filter((entry) => entry.value.rows.length),
  };
}

export function formatCountingIntelligencePeriod(
  model: Pick<CountingIntelligenceModel, "periodFrom" | "periodTo">,
) {
  if (model.periodTo <= model.periodFrom) {
    return "Nenhum mês fechado no período";
  }
  const end = new Date(model.periodTo.getTime() - 1);
  return `${formatMonthYear(model.periodFrom)} a ${formatMonthYear(end)}`;
}

export function buildCountingMonthlyComparison(
  model: CountingIntelligenceModel,
): CountingMonthlyComparison {
  const latestYear = model.currentYear;
  const comparisonYear = latestYear - 1;
  const rowsByYear = new Map<number, CountingMonthlyComparisonYearRow>();

  model.yearRows.forEach((row) => {
    const values = [...row.months];
    const stats = summarizeMonthValues(values);
    rowsByYear.set(row.year, {
      accumulated: stats.total,
      average: stats.average,
      baselineOnly: false,
      months: values,
      year: row.year,
    });
  });

  const comparisonMonths = COUNTING_MONTH_LABELS.map(
    (_, month) =>
      model.yearOverYearMonths.find((row) => row.month === month)?.previous ??
      null,
  );
  const existingComparison = rowsByYear.get(comparisonYear);
  const mergedComparisonMonths = comparisonMonths.map(
    (value, month) => existingComparison?.months[month] ?? value,
  );

  if (mergedComparisonMonths.some((value) => value !== null)) {
    const stats = summarizeMonthValues(mergedComparisonMonths);
    rowsByYear.set(comparisonYear, {
      accumulated: stats.total,
      average: stats.average,
      baselineOnly: !existingComparison,
      months: mergedComparisonMonths,
      year: comparisonYear,
    });
  }

  const currentValues = COUNTING_MONTH_LABELS.map(
    (_, month) =>
      model.yearOverYearMonths.find((row) => row.month === month)?.current ??
      null,
  );
  const currentStats = summarizeMonthValues(currentValues);
  const previousStats = summarizeMonthValues(comparisonMonths);

  return {
    comparisonYear,
    latestYear,
    rows: Array.from(rowsByYear.values()).sort(
      (left, right) => right.year - left.year,
    ),
    variation: {
      accumulated:
        currentStats.count && previousStats.count
          ? percentageDelta(currentStats.total, previousStats.total)
          : null,
      average:
        currentStats.count && previousStats.count
          ? percentageDelta(currentStats.average, previousStats.average)
          : null,
      months: COUNTING_MONTH_LABELS.map(
        (_, month) =>
          model.yearOverYearMonths.find((row) => row.month === month)?.delta ??
          null,
      ),
    },
  };
}

function summarizeMonthValues(values: Array<number | null>) {
  const recorded = values.filter((value): value is number => value !== null);
  const total = recorded.reduce((sum, value) => sum + value, 0);

  return {
    average: recorded.length ? total / recorded.length : 0,
    count: recorded.length,
    total,
  };
}

export function buildAnnualComparisonChartOption(
  model: CountingIntelligenceModel,
  primaryColor?: string,
): EnterpriseChartOption {
  const rows = annualComparisonRows(model);
  const comparisonYear = model.currentYear - 1;
  const comparisonRow = rows.find((row) => row.year === comparisonYear);
  const latestRow = rows.find((row) => row.year === model.currentYear);
  const comparisonAverage = comparisonRow?.average ?? 0;
  const comparison = buildCountingMonthlyComparison(model);
  const variationSeriesName = `Variação ${model.currentYear}/${comparisonYear}`;
  const variationData = COUNTING_MONTH_LABELS.map((_, month) => {
    const delta = comparison.variation.months[month];
    const current = latestRow?.months[month];
    const previous = comparisonRow?.months[month];
    if (delta === null || current == null || previous == null) return null;

    return {
      delta,
      deltaLabel: formatDelta(delta),
      value: Math.max(current, previous),
    };
  });
  const showVariation = variationData.some((value) => value !== null);
  const thresholdName = `Média-base · média mensal de ${comparisonYear}`;

  return {
    color: [
      ...rows.map((row, index) =>
        row.year === model.currentYear
          ? primaryColor ?? "#4F8FCB"
          : pastelBarColor(index + 1),
      ),
      "#D49A45",
    ],
    grid: {
      bottom: 8,
      containLabel: true,
      left: 8,
      right: 10,
      top: showVariation ? 82 : 70,
    },
    legend: {
      data: [
        ...rows.map((row) => String(row.year)),
        ...(comparisonAverage > 0 ? [thresholdName] : []),
      ],
      itemGap: 12,
      itemHeight: 9,
      itemWidth: 9,
      left: 0,
      right: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
      type: "scroll",
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
      data: [...COUNTING_MONTH_LABELS],
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: number) => compactNumber(value),
      },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      ...rows.map((row, index) => ({
        barCategoryGap: "28%",
        barGap: "5%",
        barMaxWidth: 18,
        data: row.months,
        emphasis: { focus: "series" },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color:
            row.year === model.currentYear
              ? primaryColor ?? "#4F8FCB"
              : pastelBarColor(index + 1),
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
              : compactNumber(value);
          },
          position: "top",
          rotate: 90,
          show: rows.length <= 5,
          verticalAlign: "middle",
        },
        name: String(row.year),
        type: "bar",
      })),
      ...(comparisonAverage > 0
        ? [
            {
              animation: false,
              data: COUNTING_MONTH_LABELS.map(() => comparisonAverage),
              itemStyle: { color: "#D49A45" },
              lineStyle: {
                color: "#C48A38",
                opacity: 0.72,
                type: "dashed",
                width: 1,
              },
              name: thresholdName,
              showSymbol: false,
              silent: true,
              symbol: "none",
              type: "line",
            },
          ]
        : []),
      ...(showVariation
        ? [
            {
              animation: false,
              data: variationData,
              itemStyle: { color: "rgba(0,0,0,0)" },
              label: {
                distance: 20,
                formatter: (params: {
                  data?: { delta?: number; deltaLabel?: string };
                }) => {
                  const delta = params.data?.delta;
                  const label = params.data?.deltaLabel;
                  if (delta === undefined || !label) return "";
                  return delta >= 0 ? `{up|${label}}` : `{down|${label}}`;
                },
                position: "top",
                rich: {
                  down: {
                    backgroundColor: "#FFFFFF",
                    borderColor: "#D8E3F2",
                    borderRadius: 2,
                    borderWidth: 1,
                    color: "#C2410C",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: [2, 3],
                  },
                  up: {
                    backgroundColor: "#FFFFFF",
                    borderColor: "#D8E3F2",
                    borderRadius: 2,
                    borderWidth: 1,
                    color: "#0F766E",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: [2, 3],
                  },
                },
                show: true,
              },
              name: variationSeriesName,
              silent: true,
              symbolSize: 1,
              tooltip: { show: false },
              type: "scatter",
              z: 20,
            },
          ]
        : []),
    ],
  };
}

export function buildAnnualAccumulatedComparisonChartOption(
  model: CountingIntelligenceModel,
  primaryColor?: string,
): EnterpriseChartOption {
  const rows = annualComparisonRows(model).map((row) => ({
    ...row,
    accumulatedMonths: cumulativeMonthValues(row.months),
  }));
  const latestRow = rows.find((row) => row.year === model.currentYear);
  const comparisonYear = model.currentYear - 1;
  const comparisonRow = rows.find((row) => row.year === comparisonYear);
  const variationSeriesName = `Variação acumulada ${model.currentYear}/${comparisonYear}`;
  const variationData = COUNTING_MONTH_LABELS.map((_, month) => {
    const current = latestRow?.accumulatedMonths[month];
    const previous = comparisonRow?.accumulatedMonths[month];
    if (current == null || previous == null) return null;
    const delta = percentageDelta(current, previous);
    if (delta === null) return null;

    return {
      delta,
      deltaLabel: formatDelta(delta),
      value: Math.max(current, previous),
    };
  });
  const showVariation = variationData.some((value) => value !== null);

  return {
    color: rows.map((row, index) =>
      row.year === model.currentYear
        ? primaryColor ?? "#4F8FCB"
        : pastelBarColor(index + 1),
    ),
    grid: {
      bottom: 8,
      containLabel: true,
      left: 8,
      right: 10,
      top: showVariation ? 82 : 70,
    },
    legend: {
      data: rows.map((row) => String(row.year)),
      itemGap: 12,
      itemHeight: 9,
      itemWidth: 9,
      left: 0,
      right: 0,
      textStyle: { color: "#526477", fontSize: 11 },
      top: 0,
      type: "scroll",
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
      data: [...COUNTING_MONTH_LABELS],
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: number) => compactNumber(value),
      },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      ...rows.map((row, index) => ({
        barCategoryGap: "28%",
        barGap: "5%",
        barMaxWidth: 18,
        data: row.accumulatedMonths,
        emphasis: { focus: "series" },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color:
            row.year === model.currentYear
              ? primaryColor ?? "#4F8FCB"
              : pastelBarColor(index + 1),
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
              : compactNumber(value);
          },
          position: "top",
          rotate: 90,
          show: rows.length <= 5,
          verticalAlign: "middle",
        },
        name: String(row.year),
        type: "bar",
      })),
      ...(showVariation
        ? [
            {
              animation: false,
              data: variationData,
              itemStyle: { color: "rgba(0,0,0,0)" },
              label: {
                distance: 20,
                formatter: (params: {
                  data?: { delta?: number; deltaLabel?: string };
                }) => {
                  const delta = params.data?.delta;
                  const label = params.data?.deltaLabel;
                  if (delta === undefined || !label) return "";
                  return delta >= 0 ? `{up|${label}}` : `{down|${label}}`;
                },
                position: "top",
                rich: {
                  down: {
                    backgroundColor: "#FFFFFF",
                    borderColor: "#D8E3F2",
                    borderRadius: 2,
                    borderWidth: 1,
                    color: "#C2410C",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: [2, 3],
                  },
                  up: {
                    backgroundColor: "#FFFFFF",
                    borderColor: "#D8E3F2",
                    borderRadius: 2,
                    borderWidth: 1,
                    color: "#0F766E",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: [2, 3],
                  },
                },
                show: true,
              },
              name: variationSeriesName,
              silent: true,
              symbolSize: 1,
              tooltip: { show: false },
              type: "scatter",
              z: 20,
            },
          ]
        : []),
    ],
  };
}

function annualComparisonRows(model: CountingIntelligenceModel) {
  const rows = buildCountingMonthlyComparison(model).rows.map((row) => ({
    average: row.average,
    months: row.months,
    year: row.year,
  }));

  return rows.sort((left, right) => left.year - right.year);
}

function cumulativeMonthValues(months: Array<number | null>) {
  let accumulated = 0;

  return months.map((value) => {
    if (value === null) return null;
    accumulated += value;
    return accumulated;
  });
}

export function buildDirectionalHourlyChartOption(
  model: CountingIntelligenceModel,
  primaryColor?: string,
): EnterpriseChartOption {
  const entryColor = primaryColor ?? "#79B996";

  return {
    color: [entryColor, "#D999A2"],
    grid: {
      bottom: 6,
      containLabel: true,
      left: 8,
      right: 8,
      top: 48,
    },
    legend: {
      itemGap: 14,
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
      valueFormatter: (value) => formatNumber(Number(value ?? 0)),
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: string) =>
          Number.parseInt(value, 10) % 2 === 0 ? value : "",
        interval: 0,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: model.directionalHours.map((item) => hourLabel(item.hour)),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: number) => compactNumber(value),
      },
      minInterval: 1,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "38%",
        barGap: "8%",
        barMaxWidth: 14,
        data: model.directionalHours.map((item) => item.entry),
        itemStyle: { borderRadius: [2, 2, 0, 0], color: entryColor },
        name: "Entradas",
        type: "bar",
      },
      {
        barMaxWidth: 14,
        data: model.directionalHours.map((item) => item.exit),
        itemStyle: { borderRadius: [2, 2, 0, 0], color: "#D999A2" },
        name: "Saídas",
        type: "bar",
      },
    ],
  };
}

export function buildAccessShareChartOption(
  model: CountingIntelligenceModel,
  primaryColor?: string,
): EnterpriseChartOption {
  const rows = model.accesses;

  return {
    grid: {
      bottom: 8,
      containLabel: true,
      left: 10,
      right: 52,
      top: 8,
    },
    tooltip: {
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      textStyle: { color: "#13233A", fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value) => formatPercentage(Number(value ?? 0) / 100),
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        formatter: (value: number) => `${value}%`,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      max: 100,
      min: 0,
      splitLine: { lineStyle: { color: "#E8EEF6" } },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 10,
        overflow: "truncate",
        width: 180,
      },
      axisLine: { lineStyle: { color: "#D8E3F2" } },
      axisTick: { show: false },
      data: rows.map((row) => row.name),
      inverse: true,
      type: "category",
    },
    series: [
      {
        barCategoryGap: "30%",
        barMaxWidth: 24,
        data: rows.map((row, index) => ({
          itemStyle: {
            color:
              index === 0 && primaryColor
                ? primaryColor
                : pastelBarColor(index),
          },
          value: Number((row.share * 100).toFixed(2)),
        })),
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: {
          color: "#526477",
          distance: 5,
          fontSize: 10,
          formatter: (params: { value?: number }) =>
            `${Number(params.value ?? 0).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}%`,
          position: "right",
          show: true,
        },
        name: "Participação",
        type: "bar",
      },
    ],
  };
}

function aggregateScopeMonths(
  rows: AggregateEventRow[],
  scope: CountingIntelligenceScope,
) {
  const totals = new Map<string, number>();
  const cameraIds = new Set(scope.cameraIds);
  const multipliers = new Map(
    scope.scenario?.lines
      .filter((line) => line.action_multiplier !== 0)
      .map((line) => [line.line_count_id, line.action_multiplier]) ?? [],
  );

  rows.forEach((row) => {
    const key = monthlyBucketKey(row.bucket);
    if (!key) return;

    let value = 0;
    if (scope.scenario) {
      if (!row.line_count_id) return;
      const multiplier = multipliers.get(row.line_count_id);
      if (multiplier === undefined) return;
      value = finiteTotal(row.total) * multiplier;
    } else {
      if (!row.camera_id || !cameraIds.has(row.camera_id)) return;
      value = finiteTotal(row.total);
    }

    totals.set(key, (totals.get(key) ?? 0) + value);
  });

  return totals;
}

function aggregateScenarioDirections(
  rows: AggregateEventRow[],
  scenarios: Scenario[],
) {
  const bindings = buildScenarioLineBindings(scenarios);
  const totals = new Map<string, ScenarioDirectionTotals>();
  const hourly = new Map<string, ScenarioDirectionTotals>();

  scenarios.forEach((scenario) => {
    totals.set(scenario.id, { entry: 0, exit: 0 });
    for (let hour = 0; hour < 24; hour += 1) {
      hourly.set(accessHourKey(scenario.id, hour), { entry: 0, exit: 0 });
    }
  });

  rows.forEach((row) => {
    if (!row.line_count_id) return;
    const rowBindings = bindings.get(row.line_count_id);
    if (!rowBindings?.length) return;

    const date = parseAggregateBucket(row.bucket, "hour");
    if (!date) return;
    const rawTotal = Math.abs(finiteTotal(row.total));

    rowBindings.forEach((binding) => {
      const value = rawTotal * binding.weight;
      const scenarioTotal = totals.get(binding.scenarioId);
      const hourTotal = hourly.get(
        accessHourKey(binding.scenarioId, date.getHours()),
      );
      if (!scenarioTotal || !hourTotal) return;

      scenarioTotal[binding.direction] += value;
      hourTotal[binding.direction] += value;
    });
  });

  return { hourly, totals };
}

function buildScenarioLineBindings(scenarios: Scenario[]) {
  const bindings = new Map<string, ScenarioLineBinding[]>();

  scenarios.forEach((scenario) => {
    const scenarioDirection = inferDirectionFromText(
      `${scenario.name} ${scenario.description ?? ""}`,
    );
    const seen = new Set<string>();

    scenario.lines?.forEach((line) => {
      if (line.action_multiplier === 0 || seen.has(line.line_count_id)) return;
      seen.add(line.line_count_id);
      const direction =
        inferDirectionFromText(line.label ?? "") ??
        scenarioDirection ??
        (line.action_multiplier < 0 ? "exit" : "entry");
      const current = bindings.get(line.line_count_id) ?? [];
      current.push({
        direction,
        scenarioId: scenario.id,
        weight: Math.abs(line.action_multiplier),
      });
      bindings.set(line.line_count_id, current);
    });
  });

  return bindings;
}

function buildAccessRows(
  scenarios: Scenario[],
  monthly: ReturnType<typeof aggregateScenarioDirections>,
  hourly: ReturnType<typeof aggregateScenarioDirections>,
) {
  const baseRows = scenarios
    .map((scenario) => {
      const totals = monthly.totals.get(scenario.id) ?? { entry: 0, exit: 0 };
      const hours = Array.from({ length: 24 }, (_, hour) => ({
        ...(hourly.hourly.get(accessHourKey(scenario.id, hour)) ?? {
          entry: 0,
          exit: 0,
        }),
        hour,
      }));
      const entryPeak = peakHour(hours, "entry");
      const exitPeak = peakHour(hours, "exit");
      const flowPeak = peakFlowHour(hours);

      return {
        entry: totals.entry,
        entryPeakHour: entryPeak.hour,
        entryPeakValue: entryPeak.value,
        entryRank: 0,
        exit: totals.exit,
        exitPeakHour: exitPeak.hour,
        exitPeakValue: exitPeak.value,
        exitRank: 0,
        flow: totals.entry + totals.exit,
        flowPeakHour: flowPeak.hour,
        flowPeakValue: flowPeak.value,
        flowRank: 0,
        id: scenario.id,
        name: scenario.name,
        share: 0,
      } satisfies CountingAccessRow;
    })
    .filter((row) => row.flow > 0 || row.flowPeakValue > 0);
  const totalFlow = baseRows.reduce((sum, row) => sum + row.flow, 0);
  const entryRanks = rankValues(baseRows, "entry");
  const exitRanks = rankValues(baseRows, "exit");
  const flowRanks = rankValues(baseRows, "flow");

  return baseRows
    .map((row) => ({
      ...row,
      entryRank: entryRanks.get(row.id) ?? 0,
      exitRank: exitRanks.get(row.id) ?? 0,
      flowRank: flowRanks.get(row.id) ?? 0,
      share: totalFlow ? row.flow / totalFlow : 0,
    }))
    .sort((left, right) => right.flow - left.flow || left.name.localeCompare(right.name));
}

function filterAndRankAccessRows(
  rows: CountingAccessRow[],
  selectionMode: "all" | "custom",
  selectedScenarioIds: string[],
  order: "asc" | "desc",
) {
  const selectedIds = new Set(selectedScenarioIds);
  const selectedRows =
    selectionMode === "custom"
      ? rows.filter((row) => selectedIds.has(row.id))
      : rows;
  const totalFlow = selectedRows.reduce((sum, row) => sum + row.flow, 0);
  const entryRanks = rankValues(selectedRows, "entry");
  const exitRanks = rankValues(selectedRows, "exit");
  const flowRanks = rankValues(selectedRows, "flow");

  return selectedRows
    .map((row) => ({
      ...row,
      entryRank: entryRanks.get(row.id) ?? 0,
      exitRank: exitRanks.get(row.id) ?? 0,
      flowRank: flowRanks.get(row.id) ?? 0,
      share: totalFlow ? row.flow / totalFlow : 0,
    }))
    .sort(
      (left, right) =>
        (order === "asc" ? left.flow - right.flow : right.flow - left.flow) ||
        left.name.localeCompare(right.name),
    );
}

function buildAccessHours(
  scenarios: Scenario[],
  hourly: ReturnType<typeof aggregateScenarioDirections>,
) {
  return scenarios.flatMap((scenario) =>
    Array.from({ length: 24 }, (_, hour) => {
      const values = hourly.hourly.get(accessHourKey(scenario.id, hour)) ?? {
        entry: 0,
        exit: 0,
      };

      return {
        accessId: scenario.id,
        accessName: scenario.name,
        entry: values.entry,
        exit: values.exit,
        hour,
        total: values.entry + values.exit,
      } satisfies CountingAccessHour;
    }),
  );
}

function buildMonthlyComparisonReportTable(
  model: CountingIntelligenceModel,
): ReportTable {
  const comparison = buildCountingMonthlyComparison(model);
  const columns = [
    { key: "year", label: "Ano", width: 13 },
    ...COUNTING_MONTH_LABELS.map((month, index) => ({
      key: `month_${index}`,
      label: month,
      numeric: true,
      width: 11,
    })),
    {
      key: "accumulated",
      label: "Acumulado",
      numeric: true,
      width: 16,
    },
    { key: "average", label: "Média", numeric: true, width: 14 },
  ];
  const rows: ReportTable["rows"] = comparison.rows.map((row) => ({
    accumulated: Math.round(row.accumulated),
    average: Math.round(row.average),
    year: row.baselineOnly ? `${row.year} (base)` : String(row.year),
    ...Object.fromEntries(
      row.months.map((value, month) => [
        `month_${month}`,
        value === null ? "" : Math.round(value),
      ]),
    ),
  }));

  rows.push({
    accumulated: formatDelta(comparison.variation.accumulated),
    average: formatDelta(comparison.variation.average),
    year: `Var. ${comparison.latestYear}/${comparison.comparisonYear}`,
    ...Object.fromEntries(
      comparison.variation.months.map((value, month) => [
        `month_${month}`,
        formatDelta(value),
      ]),
    ),
  });

  return {
    columns,
    description: `Anos, meses, acumulado e média em ${formatCountingIntelligencePeriod(
      model,
    )}. A variação compara sempre o ano mais recente com o anterior.`,
    includeInCharts: true,
    rows,
    title: "Tabela mensal comparativa",
  };
}

function buildAnnualAccumulatedReportTable(
  model: CountingIntelligenceModel,
): ReportTable {
  const rows = annualComparisonRows(model).map((row) => ({
    ...row,
    accumulatedMonths: cumulativeMonthValues(row.months),
  }));
  const latest = rows.find((row) => row.year === model.currentYear);
  const previous = rows.find((row) => row.year === model.currentYear - 1);

  return {
    columns: [
      { key: "month", label: "Mês", width: 14 },
      ...rows.map((row) => ({
        key: `year_${row.year}`,
        label: String(row.year),
        numeric: true,
        width: 18,
      })),
      {
        key: "variation",
        label: `Var. ${model.currentYear}/${model.currentYear - 1}`,
        width: 18,
      },
    ],
    description: `Soma progressiva dos meses incluídos em ${formatCountingIntelligencePeriod(
      model,
    )}. A variação compara o acumulado do ano mais recente com o anterior.`,
    rows: COUNTING_MONTH_LABELS.map((month, monthIndex) => {
      const currentValue = latest?.accumulatedMonths[monthIndex] ?? null;
      const previousValue = previous?.accumulatedMonths[monthIndex] ?? null;

      return {
        month,
        variation:
          currentValue === null || previousValue === null
            ? "-"
            : formatDelta(percentageDelta(currentValue, previousValue)),
        ...Object.fromEntries(
          rows.map((row) => [
            `year_${row.year}`,
            row.accumulatedMonths[monthIndex] === null
              ? ""
              : Math.round(row.accumulatedMonths[monthIndex] ?? 0),
          ]),
        ),
      };
    }),
    title: "Dados - Comparativo acumulado por ano",
  };
}

function buildAccessRankingReportTable(model: CountingIntelligenceModel): ReportTable {
  return {
    columns: [
      { key: "flow_rank", label: "Rank", width: 10, numeric: true },
      { key: "access", label: "Acesso (cenário)", width: 30 },
      { key: "entry", label: "Entradas", width: 15, numeric: true },
      { key: "entry_rank", label: "Rank E", width: 11, numeric: true },
      { key: "exit", label: "Saídas", width: 15, numeric: true },
      { key: "exit_rank", label: "Rank S", width: 11, numeric: true },
      { key: "flow", label: "Fluxo", width: 15, numeric: true },
      { key: "share", label: "Participação", width: 16 },
    ],
    description: `Participação acumulada em ${formatCountingIntelligencePeriod(
      model,
    )}. Cada acesso corresponde a um cenário configurado.`,
    rows: model.accesses.map((row) => ({
      access: row.name,
      entry: Math.round(row.entry),
      entry_rank: row.entryRank || "-",
      exit: Math.round(row.exit),
      exit_rank: row.exitRank || "-",
      flow: Math.round(row.flow),
      flow_rank: row.flowRank,
      share: formatPercentage(row.share),
    })),
    title: "Ranking e representatividade dos acessos",
  };
}

function buildDirectionalHourlyReportTable(
  model: CountingIntelligenceModel,
): ReportTable {
  return {
    columns: [
      { key: "hour", label: "Hora", width: 14 },
      { key: "entry", label: "Entradas", width: 18, numeric: true },
      { key: "exit", label: "Saídas", width: 18, numeric: true },
      { key: "flow", label: "Fluxo total", width: 18, numeric: true },
      { key: "balance", label: "Saldo E-S", width: 18, numeric: true },
    ],
    rows: model.directionalHours.map((row) => ({
      balance: Math.round(row.entry - row.exit),
      entry: Math.round(row.entry),
      exit: Math.round(row.exit),
      flow: Math.round(row.total),
      hour: hourRangeLabel(row.hour),
    })),
    title: "Fluxo direcional consolidado por hora",
  };
}

function buildAccessPeakReportTable(model: CountingIntelligenceModel): ReportTable {
  return {
    columns: [
      { key: "access", label: "Acesso (cenário)", width: 30 },
      { key: "entry_hour", label: "Pico entrada", width: 16 },
      { key: "entry", label: "Qtd. entrada", width: 16, numeric: true },
      { key: "exit_hour", label: "Pico saída", width: 16 },
      { key: "exit", label: "Qtd. saída", width: 16, numeric: true },
      { key: "flow_hour", label: "Pico fluxo", width: 16 },
      { key: "flow", label: "Fluxo no pico", width: 16, numeric: true },
    ],
    description: `Picos calculados separadamente para cada cenário de acesso em ${formatCountingIntelligencePeriod(
      model,
    )}.`,
    rows: model.accesses.map((row) => ({
      access: row.name,
      entry: Math.round(row.entryPeakValue),
      entry_hour: optionalHourRangeLabel(row.entryPeakHour),
      exit: Math.round(row.exitPeakValue),
      exit_hour: optionalHourRangeLabel(row.exitPeakHour),
      flow: Math.round(row.flowPeakValue),
      flow_hour: optionalHourRangeLabel(row.flowPeakHour),
    })),
    title: "Picos direcionais por acesso",
  };
}

function buildAccessHourlyDetailReportTable(
  model: CountingIntelligenceModel,
): ReportTable {
  return {
    columns: [
      { key: "access", label: "Acesso (cenário)", width: 30 },
      { key: "hour", label: "Hora", width: 14 },
      { key: "entry", label: "Entradas", width: 17, numeric: true },
      { key: "exit", label: "Saídas", width: 17, numeric: true },
      { key: "flow", label: "Fluxo", width: 17, numeric: true },
      { key: "balance", label: "Saldo E-S", width: 17, numeric: true },
    ],
    description:
      "Detalhamento horário completo para auditoria e comparação dos cenários de acesso.",
    rows: model.accessHours
      .filter((row) => row.total > 0)
      .map((row) => ({
        access: row.accessName,
        balance: Math.round(row.entry - row.exit),
        entry: Math.round(row.entry),
        exit: Math.round(row.exit),
        flow: Math.round(row.total),
        hour: hourRangeLabel(row.hour),
      })),
    title: "Fluxo por hora e por acesso",
  };
}

function rankValues(rows: CountingAccessRow[], key: "entry" | "exit" | "flow") {
  return new Map(
    [...rows]
      .sort((left, right) => right[key] - left[key] || left.name.localeCompare(right.name))
      .map((row, index) => [row.id, row[key] > 0 ? index + 1 : 0]),
  );
}

function peakHour(
  rows: Array<{ entry: number; exit: number; hour: number }>,
  direction: Direction,
) {
  const peak = rows.reduce(
    (best, row) => (row[direction] > best.value ? { hour: row.hour, value: row[direction] } : best),
    { hour: null as number | null, value: 0 },
  );
  return peak;
}

function peakFlowHour(rows: Array<{ entry: number; exit: number; hour: number }>) {
  return rows.reduce(
    (best, row) => {
      const value = row.entry + row.exit;
      return value > best.value ? { hour: row.hour, value } : best;
    },
    { hour: null as number | null, value: 0 },
  );
}

function normalizeModelPeriod(
  period: BuildCountingIntelligenceInput["period"],
  now: Date,
  includeOpenPeriod: boolean,
) {
  const minimum = new Date(COUNTING_HISTORY_START_YEAR, 0, 1);
  const maximum = includeOpenPeriod
    ? startOfNextMonth(now)
    : startOfCalendarMonth(now);
  const candidateFrom = period?.from && isValidDate(period.from)
    ? startOfCalendarMonth(period.from)
    : minimum;
  const candidateTo = period?.to && isValidDate(period.to)
    ? startOfCalendarMonth(period.to)
    : maximum;
  let from = new Date(
    Math.max(minimum.getTime(), Math.min(candidateFrom.getTime(), maximum.getTime())),
  );
  const to = new Date(
    Math.max(minimum.getTime(), Math.min(candidateTo.getTime(), maximum.getTime())),
  );

  if (to < from) from = new Date(to);

  return { from, to };
}

function sumMonthRange(
  totals: Map<string, number>,
  from: Date,
  to: Date,
) {
  let total = 0;
  for (
    let cursor = startOfCalendarMonth(from);
    cursor < to;
    cursor = addCalendarMonths(cursor, 1)
  ) {
    total += totals.get(monthKey(cursor.getFullYear(), cursor.getMonth())) ?? 0;
  }
  return total;
}

function countRecordedMonths(
  totals: Map<string, number>,
  from: Date,
  to: Date,
) {
  let count = 0;
  for (
    let cursor = startOfCalendarMonth(from);
    cursor < to;
    cursor = addCalendarMonths(cursor, 1)
  ) {
    if (totals.has(monthKey(cursor.getFullYear(), cursor.getMonth()))) {
      count += 1;
    }
  }
  return count;
}

function startOfCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function addCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addCalendarYears(date: Date, amount: number) {
  return new Date(date.getFullYear() + amount, date.getMonth(), 1);
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function monthlyBucketKey(value: string) {
  const date = parseAggregateBucket(value, "month");
  return date ? monthKey(date.getFullYear(), date.getMonth()) : null;
}

function isMonthlyBucketInRange(value: string, from: Date, to: Date) {
  const key = monthlyBucketKey(value);
  if (!key) return false;

  return (
    key >= monthKey(from.getFullYear(), from.getMonth()) &&
    key < monthKey(to.getFullYear(), to.getMonth())
  );
}

function finiteTotal(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function sumValues(values: Array<number | null>) {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function accessHourKey(accessId: string, hour: number) {
  return `${accessId}:${hour}`;
}

function percentageDelta(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return (current - previous) / Math.abs(previous);
}

export function formatPercentage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

export function formatDelta(value: number | null) {
  if (value === null) return "-";
  const formatted = formatPercentage(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatted}`;
}

function deltaDescription(value: number | null, reference: string) {
  if (value === null) return `Sem base comparável em ${reference}`;
  return `${formatDelta(value)} em relação a ${reference}`;
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(" de ", "/")
    .replace(".", "");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}h`;
}

function hourRangeLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(
    2,
    "0",
  )}:00`;
}

export function optionalHourRangeLabel(hour: number | null) {
  return hour === null ? "-" : hourRangeLabel(hour);
}
