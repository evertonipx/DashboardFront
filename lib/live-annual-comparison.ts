import {
  reconcileAggregateRows,
} from "@/lib/aggregate-reconciliation";
import { reconcileCountingCalendarRows } from "@/lib/counting-aggregate-reconciliation";
import { rollupCountingInstantRowsToCalendar } from "@/lib/counting-aggregate-reconciliation";
import {
  countingAddCalendarMonths,
  countingCalendarRangeToInstants,
  countingCalendarStart,
  countingStartOfDayInstant,
  countingStartOfHourInstant,
} from "@/lib/counting-time-zone";
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
  timeZone: string,
): LiveAnnualComparisonRanges {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("A referência do comparativo anual é inválida.");
  }

  const currentMonthStart = countingCalendarStart(now, timeZone, "month");
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
    periodTo: countingAddCalendarMonths(currentMonthStart, 1),
    recentFrom,
  };
}

export function rollupLiveAnnualHistoryRows(
  hourlyRows: AggregateEventRow[],
  now: Date,
  timeZone: string,
) {
  const range = resolveLiveAnnualComparisonRanges(now, timeZone);
  const instantRange = countingCalendarRangeToInstants(
    { from: range.historyFrom, to: range.historyTo },
    timeZone,
  );
  return rollupCountingInstantRowsToCalendar(
    hourlyRows,
    "hour",
    "month",
    instantRange.from,
    instantRange.to,
    timeZone,
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
  timeZone,
}: {
  comparableDailyRows?: AggregateEventRow[];
  historicalMonthRows: AggregateEventRow[];
  hourlyRows: AggregateEventRow[];
  now: Date;
  recentMonthRows: AggregateEventRow[];
  scenarios: Scenario[];
  scope: CountingIntelligenceScope;
  timeZone: string;
}): CountingIntelligenceModel {
  const range = resolveLiveAnnualComparisonRanges(now, timeZone);
  const consolidatedMonthlyRows = reconcileAggregateRows(
    historicalMonthRows,
    "month",
    recentMonthRows,
    "month",
    range.recentFrom,
    range.periodTo,
  );
  const openMonthFrom = countingCalendarStart(now, timeZone, "month");
  const closedHourTo = countingStartOfHourInstant(now, timeZone);
  const openDayFrom = countingStartOfDayInstant(now, timeZone);
  const reconciledDailyRows = comparableDailyRows
    ? reconcileCountingCalendarRows(
        comparableDailyRows,
        "day",
        hourlyRows,
        "hour",
        openDayFrom,
        closedHourTo,
        timeZone,
      )
    : undefined;
  const openMonthHourlyRows =
    !reconciledDailyRows && openMonthFrom < range.periodTo
      ? rollupCountingInstantRowsToCalendar(
          hourlyRows,
          "hour",
          "month",
          countingCalendarRangeToInstants(
            {
              from: openMonthFrom,
              to: countingAddCalendarMonths(openMonthFrom, 1),
            },
            timeZone,
          ).from,
          closedHourTo,
          timeZone,
        )
      : undefined;
  const openMonthRows = reconciledDailyRows ?? openMonthHourlyRows;
  const monthlyRows =
    openMonthRows
      ? reconcileAggregateRows(
          consolidatedMonthlyRows,
          "month",
          openMonthRows,
          reconciledDailyRows ? "day" : "month",
          openMonthFrom,
          range.periodTo,
        )
      : consolidatedMonthlyRows;

  return buildCountingIntelligenceModel({
    companyTimeZone: timeZone,
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
