import {
  reconcileAggregateRows,
  rollupAggregateRows,
} from "@/lib/aggregate-reconciliation";
import { startOfAggregateBucket } from "@/lib/aggregate-time";
import {
  buildCountingIntelligenceModel,
  type CountingIntelligenceModel,
  type CountingIntelligenceScope,
} from "@/lib/counting-intelligence";
import type { AggregateEventRow, Scenario } from "@/lib/types";

export const LIVE_ANNUAL_HISTORY_YEARS = 4;

export type LiveAnnualComparisonRanges = {
  historyFrom: Date;
  historyTo: Date;
  periodFrom: Date;
  periodTo: Date;
  recentFrom: Date;
};

export function resolveLiveAnnualComparisonRanges(
  now: Date,
): LiveAnnualComparisonRanges {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("A referência do comparativo anual é inválida.");
  }

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );
  const recentFrom = new Date(
    currentMonthStart.getFullYear() - 1,
    currentMonthStart.getMonth(),
    1,
  );
  const periodFrom = new Date(
    currentMonthStart.getFullYear() - (LIVE_ANNUAL_HISTORY_YEARS - 1),
    0,
    1,
  );

  return {
    historyFrom: periodFrom,
    historyTo: recentFrom,
    periodFrom,
    periodTo: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    recentFrom,
  };
}

export function rollupLiveAnnualHistoryRows(
  hourlyRows: AggregateEventRow[],
  now: Date,
) {
  const range = resolveLiveAnnualComparisonRanges(now);
  return rollupAggregateRows(
    hourlyRows,
    "hour",
    "month",
    range.historyFrom,
    range.historyTo,
  );
}

export function buildLiveAnnualComparisonModel({
  comparableDailyRows,
  historicalMonthRows,
  hourlyRows,
  now,
  recentMonthRows,
  scenarios,
  scope,
}: {
  comparableDailyRows?: AggregateEventRow[];
  historicalMonthRows: AggregateEventRow[];
  hourlyRows: AggregateEventRow[];
  now: Date;
  recentMonthRows: AggregateEventRow[];
  scenarios: Scenario[];
  scope: CountingIntelligenceScope;
}): CountingIntelligenceModel {
  const range = resolveLiveAnnualComparisonRanges(now);
  const consolidatedMonthlyRows = reconcileAggregateRows(
    historicalMonthRows,
    "month",
    recentMonthRows,
    "month",
    range.recentFrom,
    range.periodTo,
  );
  const openMonthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const closedHourTo = startOfAggregateBucket(now, "hour");
  const openDayFrom = startOfAggregateBucket(now, "day");
  const reconciledDailyRows = comparableDailyRows
    ? reconcileAggregateRows(
        comparableDailyRows,
        "day",
        hourlyRows,
        "hour",
        openDayFrom,
        closedHourTo,
      )
    : undefined;
  const monthlyRows =
    openMonthFrom < closedHourTo
      ? reconcileAggregateRows(
          consolidatedMonthlyRows,
          "month",
          reconciledDailyRows ?? hourlyRows,
          reconciledDailyRows ? "day" : "hour",
          openMonthFrom,
          closedHourTo,
        )
      : consolidatedMonthlyRows;

  return buildCountingIntelligenceModel({
    comparisonDataFrom: range.historyFrom,
    comparableDailyRows,
    comparableHourlyRows: comparableDailyRows ? hourlyRows : undefined,
    hourlyRows,
    includeOpenPeriod: true,
    monthlyRows,
    now,
    period: {
      from: range.periodFrom,
      to: range.periodTo,
    },
    scenarios,
    scope,
  });
}
