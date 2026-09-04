import {
  parseOccupancyAnalysisDateInput,
  shiftOccupancyAnalysisDateInput,
  type OccupancyAnalysisDateRangeInput,
} from "@/lib/occupancy-analysis-window";

export type AnalysisPeriodSelectionMode =
  | "day"
  | "closed_month"
  | "custom";

export function previousClosedCivilDayInput(maximumInput: string) {
  requireDateInput(maximumInput);
  return shiftOccupancyAnalysisDateInput(maximumInput, -1);
}

export function lastClosedMonthRange(
  maximumInput: string,
): OccupancyAnalysisDateRangeInput {
  const maximum = requireDateInput(maximumInput);
  const year =
    maximum.getMonth() === 0
      ? maximum.getFullYear() - 1
      : maximum.getFullYear();
  const monthIndex = maximum.getMonth() === 0 ? 11 : maximum.getMonth() - 1;
  return closedMonthRange(year, monthIndex);
}

export function closedMonthRange(
  year: number,
  monthIndex: number,
): OccupancyAnalysisDateRangeInput {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    throw new RangeError("O mês da análise é inválido.");
  }
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    endInput: `${String(year).padStart(4, "0")}-${month}-${String(lastDay).padStart(2, "0")}`,
    startInput: `${String(year).padStart(4, "0")}-${month}-01`,
  };
}

export function isClosedMonthAvailable(
  year: number,
  monthIndex: number,
  maximumInput: string,
) {
  const range = closedMonthRange(year, monthIndex);
  return range.endInput < maximumInput;
}

export function inferAnalysisPeriodSelectionMode(
  range: OccupancyAnalysisDateRangeInput,
  maximumInput: string,
): AnalysisPeriodSelectionMode {
  requireDateInput(maximumInput);
  if (
    range.startInput === range.endInput &&
    range.endInput <= previousClosedCivilDayInput(maximumInput)
  ) {
    return "day";
  }

  const start = parseOccupancyAnalysisDateInput(range.startInput);
  if (start) {
    const month = closedMonthRange(start.getFullYear(), start.getMonth());
    if (
      month.startInput === range.startInput &&
      month.endInput === range.endInput &&
      month.endInput < maximumInput
    ) {
      return "closed_month";
    }
  }

  return "custom";
}

function requireDateInput(value: string) {
  const parsed = parseOccupancyAnalysisDateInput(value);
  if (!parsed) throw new RangeError("A data máxima da análise é inválida.");
  return parsed;
}
