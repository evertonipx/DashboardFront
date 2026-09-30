import {
  companyZonedDateParts,
  requireCompanyTimeZone,
} from "@/lib/company-time-zone";

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;
const DEFAULT_COMPARISON_YEAR_COUNT = 4;

/**
 * The monthly aggregate reports the number of objects in an area, not the
 * proportion of time that it was occupied. These optional seconds must come
 * from an independent, certified state timeline; they cannot be reconstructed
 * from the monthly average/minimum/peak.
 */
export type OccupancyAnnualTimeInput = {
  confirmedFreeSeconds: number;
  confirmedOccupiedSeconds: number;
  expectedSeconds: number;
  observedSeconds: number;
};

export type OccupancyAnnualMonthlyPoint = {
  /** Civil month of the aggregate; never infer this from a serialized floating Date. */
  month: number;
  year: number;
  average: number | null;
  minimum: number | null;
  peak: number | null;
  /** Explicitly false when the response identifies a partial month. */
  complete?: boolean;
  time?: OccupancyAnnualTimeInput | null;
};

export type OccupancyAnnualTimeMetric = OccupancyAnnualTimeInput & {
  confirmedCoverageShare: number | null;
  coverageShare: number | null;
  freeShareOfConfirmed: number | null;
  occupiedShareOfConfirmed: number | null;
};

export type OccupancyAnnualMonthStatus =
  | "complete"
  | "partial"
  | "missing"
  | "future";

export type OccupancyAnnualMonthCell = {
  average: number | null;
  minimum: number | null;
  month: number;
  peak: number | null;
  status: OccupancyAnnualMonthStatus;
  time: OccupancyAnnualTimeMetric | null;
  year: number;
};

export type OccupancyAnnualMonthComparison = {
  absoluteAverageChange: number | null;
  baselineYear: number;
  percentageAverageChange: number | null;
  selectedYear: number;
};

export type OccupancyAnnualMonthRow = {
  comparisons: OccupancyAnnualMonthComparison[];
  label: string;
  month: number;
  values: OccupancyAnnualMonthCell[];
};

export type OccupancyAnnualYearSummary = {
  completeMonthCount: number;
  isComplete: boolean;
  /** Arithmetic mean of observed monthly means, including a labelled partial month. */
  monthlyAverage: number | null;
  observedMonthCount: number;
  /** Maximum observed so far, including a labelled partial month. */
  peak: number | null;
  year: number;
};

export type OccupancyAnnualComparisonSummary = {
  absoluteMonthlyAverageChange: number | null;
  baselineMonthlyAverage: number | null;
  baselineYear: number;
  matchedMonthCount: number;
  percentageMonthlyAverageChange: number | null;
  selectedMonthlyAverage: number | null;
  selectedYear: number;
};

export type OccupancyAnnualReport = {
  comparisonSummaries: OccupancyAnnualComparisonSummary[];
  rows: OccupancyAnnualMonthRow[];
  selectedYear: number;
  summaries: OccupancyAnnualYearSummary[];
  years: number[];
};

/**
 * Builds a 12-month comparison for every year from startYear to selectedYear.
 * Missing months remain null, including a month whose source query returned
 * no rows. A measured zero is a valid observation and is not converted into
 * missing data. Partial/current months can be displayed but never contribute
 * to a year-over-year comparison.
 */
export function buildOccupancyAnnualReport({
  currentAt = new Date(),
  monthlyPoints,
  selectedYear,
  startYear = selectedYear - (DEFAULT_COMPARISON_YEAR_COUNT - 1),
  timeZone,
}: {
  currentAt?: Date;
  monthlyPoints: readonly OccupancyAnnualMonthlyPoint[];
  selectedYear: number;
  startYear?: number;
  timeZone: string;
}): OccupancyAnnualReport {
  requireYear(selectedYear);
  requireYear(startYear);
  if (startYear > selectedYear) {
    throw new RangeError("O início do histórico de ocupação excede o ano de referência.");
  }
  requireDate(currentAt);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  if (!Array.isArray(monthlyPoints)) {
    throw new TypeError("Os meses do relatório de ocupação são inválidos.");
  }
  const current = companyZonedDateParts(currentAt, canonicalTimeZone);
  const years = Array.from(
    { length: selectedYear - startYear + 1 },
    (_, index) => selectedYear - index,
  );
  const includedYears = new Set(years);
  const points = new Map<string, OccupancyAnnualMonthlyPoint>();

  monthlyPoints.forEach((point, index) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      throw new TypeError(`O mês ${index} do relatório de ocupação é inválido.`);
    }
    const { year, month } = point;
    requireYear(year);
    requireMonth(month);
    if (!includedYears.has(year)) return;
    requirePoint(point, index);
    const key = monthKey(year, month);
    if (points.has(key)) {
      throw new RangeError(`O mês ${key} está duplicado no relatório de ocupação.`);
    }
    points.set(key, point);
  });

  const rows = MONTH_LABELS.map((label, monthIndex) => {
    const month = monthIndex + 1;
    const values = years.map((year): OccupancyAnnualMonthCell => {
      const point = points.get(monthKey(year, month));
      const future = year > current.year ||
        (year === current.year && month > current.month);
      const isOpen = year === current.year && month === current.month;
      if (future && point && hasMetric(point)) {
        throw new RangeError("O relatório de ocupação recebeu dados de um mês futuro.");
      }
      const status: OccupancyAnnualMonthStatus = future
        ? "future"
        : !point || !hasMetric(point)
          ? "missing"
          : isOpen || point.complete === false
            ? "partial"
            : "complete";
      return {
        average: status === "missing" || status === "future" ? null : point!.average,
        minimum: status === "missing" || status === "future" ? null : point!.minimum,
        month,
        peak: status === "missing" || status === "future" ? null : point!.peak,
        status,
        time: status === "missing" || status === "future"
          ? null
          : deriveTime(point!.time),
        year,
      };
    });
    const selected = values[0];
    const comparisons = values.slice(1).map((baseline) => {
      const comparable = selected.status === "complete" && baseline.status === "complete";
      const change = comparable ? selected.average! - baseline.average! : null;
      return {
        absoluteAverageChange: change,
        baselineYear: baseline.year,
        percentageAverageChange: change !== null && baseline.average !== 0
          ? (change / baseline.average!) * 100
          : null,
        selectedYear,
      };
    });
    return { comparisons, label, month, values };
  });

  const summaries = years.map((year): OccupancyAnnualYearSummary => {
    const values = rows.map((row) => row.values.find((value) => value.year === year)!);
    const complete = values.filter((value) => value.status === "complete");
    const observed = values.filter((value) => value.status === "complete" || value.status === "partial");
    return {
      completeMonthCount: complete.length,
      isComplete: complete.length === 12,
      monthlyAverage: mean(observed.map((value) => value.average!)),
      observedMonthCount: observed.length,
      peak: observed.length ? Math.max(...observed.map((value) => value.peak!)) : null,
      year,
    };
  });

  const comparisonSummaries = years.slice(1).map((baselineYear) => {
    const matched = rows.flatMap((row) => {
      const selected = row.values[0];
      const baseline = row.values.find((value) => value.year === baselineYear)!;
      return selected.status === "complete" && baseline.status === "complete"
        ? [{ selected: selected.average!, baseline: baseline.average! }]
        : [];
    });
    const selectedMonthlyAverage = mean(matched.map((item) => item.selected));
    const baselineMonthlyAverage = mean(matched.map((item) => item.baseline));
    const change = selectedMonthlyAverage !== null && baselineMonthlyAverage !== null
      ? selectedMonthlyAverage - baselineMonthlyAverage
      : null;
    return {
      absoluteMonthlyAverageChange: change,
      baselineMonthlyAverage,
      baselineYear,
      matchedMonthCount: matched.length,
      percentageMonthlyAverageChange: change !== null && baselineMonthlyAverage !== 0
        ? (change / baselineMonthlyAverage!) * 100
        : null,
      selectedMonthlyAverage,
      selectedYear,
    };
  });

  return { comparisonSummaries, rows, selectedYear, summaries, years };
}

function requirePoint(point: OccupancyAnnualMonthlyPoint, index: number) {
  if (!point || typeof point !== "object" || Array.isArray(point)) {
    throw new TypeError(`O mês ${index} do relatório de ocupação é inválido.`);
  }
  if (point.complete !== undefined && typeof point.complete !== "boolean") {
    throw new TypeError(`A completude do mês ${index} é inválida.`);
  }
  const values = [point.average, point.minimum, point.peak];
  if (values.every((value) => value === null)) {
    if (point.time !== undefined && point.time !== null) {
      throw new RangeError("Um mês sem métricas não pode declarar tempo ocupado.");
    }
    return;
  }
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    throw new RangeError(`As métricas do mês ${index} são inválidas.`);
  }
  if (point.minimum! > point.average! || point.average! > point.peak!) {
    throw new RangeError(`As métricas do mês ${index} estão fora de ordem.`);
  }
  if (point.time !== undefined && point.time !== null) requireTime(point.time);
}

function hasMetric(point: OccupancyAnnualMonthlyPoint) {
  return point.average !== null;
}

function deriveTime(time?: OccupancyAnnualTimeInput | null): OccupancyAnnualTimeMetric | null {
  if (!time) return null;
  const confirmed = time.confirmedOccupiedSeconds + time.confirmedFreeSeconds;
  return {
    ...time,
    confirmedCoverageShare: share(confirmed, time.expectedSeconds),
    coverageShare: share(time.observedSeconds, time.expectedSeconds),
    freeShareOfConfirmed: share(time.confirmedFreeSeconds, confirmed),
    occupiedShareOfConfirmed: share(time.confirmedOccupiedSeconds, confirmed),
  };
}

function requireTime(time: OccupancyAnnualTimeInput) {
  for (const key of [
    "confirmedFreeSeconds",
    "confirmedOccupiedSeconds",
    "expectedSeconds",
    "observedSeconds",
  ] as const) {
    if (!Number.isFinite(time[key]) || time[key] < 0) {
      throw new RangeError(`O campo temporal ${key} do relatório é inválido.`);
    }
  }
  if (
    time.confirmedFreeSeconds + time.confirmedOccupiedSeconds > time.observedSeconds ||
    time.observedSeconds > time.expectedSeconds
  ) {
    throw new RangeError("A cobertura temporal do relatório é inconsistente.");
  }
}

function share(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function requireYear(value: number) {
  if (!Number.isSafeInteger(value) || value < 1900 || value > 9999) {
    throw new RangeError("O ano do relatório de ocupação é inválido.");
  }
}

function requireMonth(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 12) {
    throw new RangeError("O mês do relatório de ocupação é inválido.");
  }
}

function requireDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError("A data de referência do relatório de ocupação é inválida.");
  }
}
