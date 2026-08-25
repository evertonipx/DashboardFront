import {
  reconcileAggregateRows,
  rollupAggregateRows,
} from "@/lib/aggregate-reconciliation";
import {
  buildCountingIntelligenceModel,
  COUNTING_HISTORY_START_YEAR,
  type CountingIntelligenceModel,
  type CountingIntelligenceScope,
} from "@/lib/counting-intelligence";
import type { AggregateEventRow, Scenario } from "@/lib/types";

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

  return {
    historyFrom: new Date(COUNTING_HISTORY_START_YEAR - 1, 0, 1),
    historyTo: recentFrom,
    periodFrom: new Date(COUNTING_HISTORY_START_YEAR, 0, 1),
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
  historicalMonthRows,
  hourlyRows,
  now,
  recentMonthRows,
  scenarios,
  scope,
}: {
  historicalMonthRows: AggregateEventRow[];
  hourlyRows: AggregateEventRow[];
  now: Date;
  recentMonthRows: AggregateEventRow[];
  scenarios: Scenario[];
  scope: CountingIntelligenceScope;
}): CountingIntelligenceModel {
  const range = resolveLiveAnnualComparisonRanges(now);
  const monthlyRows = reconcileAggregateRows(
    historicalMonthRows,
    "month",
    recentMonthRows,
    "month",
    range.recentFrom,
    range.periodTo,
  );

  return buildCountingIntelligenceModel({
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
