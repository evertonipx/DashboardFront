import {
  endOfAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  occupancyAggregateBucketKey,
  type OccupancyAggregateMetric,
} from "@/lib/occupancy-aggregate-validation";
import {
  createDefaultOccupancyHexLayout,
  OCCUPANCY_HEX_MAX_COLUMNS,
  OCCUPANCY_HEX_MIN_COLUMNS,
  type OccupancyHexLayout,
  type OccupancyLayoutPreset,
} from "@/lib/occupancy-hex-layout";
import type { OccupancyScenario } from "@/lib/types";

const OCCUPANCY_MONTH_SHORT_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export { OCCUPANCY_FIXED_HOUR_LABELS } from "@/lib/occupancy-hour-axis";

export type OccupancyComparisonMetricKey = "average" | "peak";
export type OccupancyComparisonFilter = "occupied" | "unoccupied";
export type OccupancyHalfDonutMode = "status" | "actual";
export type { OccupancyLayoutPreset } from "@/lib/occupancy-hex-layout";
export type OccupancyCertificationState =
  | "occupied"
  | "unoccupied"
  | "unknown";

export type OccupancyScenarioSnapshot = {
  asOf?: string;
  error?: string;
  name: string;
  scenarioId: string;
  total: number | null;
};

export type OccupancyScenarioHourlySeries = {
  error?: string;
  metrics: Map<number, OccupancyAggregateMetric>;
  name: string;
  scenarioId: string;
  warning?: string;
};

export type OccupancyMaximumTrendRange = {
  buckets: Date[];
  from: Date;
  to: Date;
};

export type OccupancyMaximumTrendRanges = {
  annual: OccupancyMaximumTrendRange;
  hourly: OccupancyMaximumTrendRange;
  monthly: OccupancyMaximumTrendRange;
  monthlySource: OccupancyMaximumTrendRange;
};

export type OccupancyAnnualMaximumPoint = {
  partial: boolean;
  value: number | null;
};

export type OccupancyHeatmapCell = {
  bucket: Date;
  scenarioId: string;
  value: number | null;
  x: number;
  y: number;
};

export type OccupancyHexPosition = {
  capacity: number | null;
  cellId: string;
  column: number;
  name: string;
  row: number;
  scenarioId: string | null;
  state: OccupancyCertificationState | "unavailable" | "unlinked";
  total: number | null;
  utilization: number | null;
  x: number;
  y: number;
};

export type OccupancyHalfDonutEntry = {
  chartValue: number;
  name: string;
  scenarioId: string;
  state: Exclude<OccupancyCertificationState, "unknown">;
  total: number;
};

export type OccupancyComparisonBarEntry = {
  chartValue: number;
  name: string;
  scenarioId: string;
  state: OccupancyCertificationState;
  total: number | null;
};

export type OccupancyLiveRaceEntry = {
  name: string;
  scenarioId: string;
  value: number | null;
};

export function buildOccupancyHourlyRange(now: Date, dayCount: number) {
  requireValidDate(now, "instante da comparação");
  if (!Number.isSafeInteger(dayCount) || dayCount < 1 || dayCount > 31) {
    throw new RangeError("A comparação aceita de 1 a 31 dias.");
  }

  const currentHour = startOfAggregateBucket(now, "hour");
  const to = endOfAggregateBucket(currentHour, "hour");
  const from = startOfAggregateBucket(now, "day");
  from.setDate(from.getDate() - (dayCount - 1));

  return {
    buckets: listOccupancyHourBuckets(from, to),
    from,
    to,
  };
}

export function buildOccupancyCurrentHourRange(
  now: Date,
): OccupancyMaximumTrendRange {
  requireValidDate(now, "instante da hora aberta");
  const from = startOfAggregateBucket(now, "hour");
  const to = endOfAggregateBucket(from, "hour");
  return { buckets: [from], from, to };
}

export function buildOccupancyClosedMinuteRange(
  now: Date,
): OccupancyMaximumTrendRange {
  requireValidDate(now, "instante dos minutos fechados");
  const from = startOfAggregateBucket(now, "hour");
  const to = startOfAggregateBucket(now, "minute");
  const buckets: Date[] = [];
  let cursor = new Date(from);
  while (cursor < to) {
    buckets.push(new Date(cursor));
    cursor = endOfAggregateBucket(cursor, "minute");
  }
  return { buckets, from, to };
}

export function buildOccupancyMaximumTrendRanges(
  now: Date,
): OccupancyMaximumTrendRanges {
  requireValidDate(now, "instante dos máximos por cenário");

  const currentHour = startOfAggregateBucket(now, "hour");
  const hourlyFrom = startOfAggregateBucket(now, "day");
  const hourlyTo = endOfAggregateBucket(currentHour, "hour");
  const currentMonth = startOfAggregateBucket(now, "month");
  const monthlyTo = endOfAggregateBucket(currentMonth, "month");
  const monthlyFrom = new Date(currentMonth);
  monthlyFrom.setMonth(monthlyFrom.getMonth() - 11);
  const annualFrom = new Date(now.getFullYear() - 4, 0, 1);
  const annualTo = new Date(now.getFullYear() + 1, 0, 1);

  return {
    annual: {
      buckets: listOccupancyCalendarBuckets(annualFrom, annualTo, "year"),
      from: annualFrom,
      to: annualTo,
    },
    hourly: {
      buckets: listOccupancyHourBuckets(hourlyFrom, hourlyTo),
      from: hourlyFrom,
      to: hourlyTo,
    },
    monthly: {
      buckets: listOccupancyCalendarBuckets(monthlyFrom, monthlyTo, "month"),
      from: monthlyFrom,
      to: monthlyTo,
    },
    monthlySource: {
      buckets: listOccupancyCalendarBuckets(annualFrom, monthlyTo, "month"),
      from: annualFrom,
      to: monthlyTo,
    },
  };
}

export function buildOccupancyPeakValues(
  buckets: readonly Date[],
  metrics: ReadonlyMap<number, OccupancyAggregateMetric>,
  granularity: "hour" | "month",
) {
  return buckets.map(
    (bucket) =>
      metrics.get(occupancyAggregateBucketKey(bucket, granularity))?.peak ??
      null,
  );
}

export function buildOccupancyFixedHourlyPeakValues({
  buckets,
  metrics,
  openBucket,
  openMetric,
  openPeak,
  openPeakMode = "replace",
}: {
  buckets: readonly Date[];
  metrics: ReadonlyMap<number, OccupancyAggregateMetric>;
  openBucket?: Date | null;
  openMetric?: OccupancyAggregateMetric | null;
  openPeak?: number | null;
  openPeakMode?: "maximum" | "replace";
}) {
  if (
    openPeak !== undefined &&
    openPeak !== null &&
    (!Number.isFinite(openPeak) || openPeak < 0)
  ) {
    throw new RangeError("O pico da hora aberta é inválido.");
  }
  if (openPeakMode !== "maximum" && openPeakMode !== "replace") {
    throw new RangeError("O modo do pico da hora aberta é inválido.");
  }
  const effectivePeaks = new Map(
    Array.from(metrics, ([key, metric]) => [key, metric.peak]),
  );
  const bucketsByKey = new Map<number, Date>();

  buckets.forEach((bucket) => {
    requireValidDate(bucket, "bucket horário exibido");
    bucketsByKey.set(occupancyAggregateBucketKey(bucket, "hour"), bucket);
  });

  if (openBucket) {
    requireValidDate(openBucket, "bucket da hora aberta");
    const openKey = occupancyAggregateBucketKey(openBucket, "hour");
    bucketsByKey.set(openKey, openBucket);
    // A resposta dedicada da hora aberta é autoritativa. `null` remove um
    // valor anterior; isso evita manter um pico obsoleto quando a API corrige
    // ou deixa de certificar o bucket ainda em andamento.
    const resolvedOpenPeak =
      openPeak !== undefined
        ? openPeak
        : openMetric === null
          ? null
          : openMetric?.peak;
    if (openPeakMode === "maximum") {
      if (resolvedOpenPeak !== undefined && resolvedOpenPeak !== null) {
        effectivePeaks.set(
          openKey,
          Math.max(effectivePeaks.get(openKey) ?? 0, resolvedOpenPeak),
        );
      }
    } else if (resolvedOpenPeak === null) {
      effectivePeaks.delete(openKey);
    } else if (resolvedOpenPeak !== undefined) {
      effectivePeaks.set(openKey, resolvedOpenPeak);
    }
  }

  const expectedByCivilHour = new Map<number, Date[]>();
  bucketsByKey.forEach((bucket) => {
    const hour = bucket.getHours();
    const expected = expectedByCivilHour.get(hour) ?? [];
    expected.push(bucket);
    expectedByCivilHour.set(hour, expected);
  });

  return Array.from({ length: 24 }, (_, hour): number | null => {
    const expected = expectedByCivilHour.get(hour);
    // A hora pode ser futura ou inexistente em uma virada DST. Em ambos os
    // casos ela fica visualmente vazia, sem ser convertida em zero.
    if (!expected?.length) return null;

    let maximum = 0;
    for (const bucket of expected) {
      const peak = effectivePeaks.get(
        occupancyAggregateBucketKey(bucket, "hour"),
      );
      // Em uma hora repetida pelo DST, as duas ocorrências são necessárias:
      // ignorar uma delas poderia publicar um máximo menor que o real.
      if (peak === undefined) return null;
      maximum = Math.max(maximum, peak);
    }
    return maximum;
  });
}

export function buildOccupancyAnnualMaximumValues({
  annualBuckets,
  coverageFrom,
  liveBucket,
  livePeak,
  metrics,
  monthlyBuckets,
}: {
  annualBuckets: readonly Date[];
  coverageFrom?: Date | null;
  liveBucket?: Date | null;
  livePeak?: number | null;
  metrics: ReadonlyMap<number, OccupancyAggregateMetric>;
  monthlyBuckets: readonly Date[];
}) {
  return buildOccupancyAnnualMaximumPoints({
    annualBuckets,
    coverageFrom,
    liveBucket,
    livePeak,
    metrics,
    monthlyBuckets,
  }).map((point) => point.value);
}

export function buildOccupancyAnnualMaximumPoints({
  annualBuckets,
  coverageFrom,
  liveBucket,
  livePeak,
  metrics,
  monthlyBuckets,
}: {
  annualBuckets: readonly Date[];
  coverageFrom?: Date | null;
  liveBucket?: Date | null;
  livePeak?: number | null;
  metrics: ReadonlyMap<number, OccupancyAggregateMetric>;
  monthlyBuckets: readonly Date[];
}): OccupancyAnnualMaximumPoint[] {
  annualBuckets.forEach((bucket) =>
    requireValidDate(bucket, "bucket anual exibido"),
  );
  monthlyBuckets.forEach((bucket) =>
    requireValidDate(bucket, "bucket mensal de origem"),
  );
  if (coverageFrom !== undefined && coverageFrom !== null) {
    requireValidDate(coverageFrom, "início da cobertura do cenário");
  }
  if (liveBucket !== undefined && liveBucket !== null) {
    requireValidDate(liveBucket, "bucket ao vivo do máximo anual");
  }
  if (
    livePeak !== undefined &&
    livePeak !== null &&
    (!Number.isFinite(livePeak) || livePeak < 0)
  ) {
    throw new RangeError("O pico ao vivo do máximo anual é inválido.");
  }

  const coverageMonth = coverageFrom
    ? startOfAggregateBucket(coverageFrom, "month")
    : null;
  const openYear =
    liveBucket?.getFullYear() ?? monthlyBuckets.at(-1)?.getFullYear();

  return annualBuckets.map((yearBucket) => {
    const year = yearBucket.getFullYear();
    const months = monthlyBuckets.filter(
      (monthBucket) =>
        monthBucket.getFullYear() === year &&
        (!coverageMonth || monthBucket >= coverageMonth),
    );
    const observedPeaks = months.flatMap((month) => {
      const metric = metrics.get(
        occupancyAggregateBucketKey(month, "month"),
      );
      return metric ? [metric.peak] : [];
    });
    if (
      liveBucket?.getFullYear() === year &&
      livePeak !== undefined &&
      livePeak !== null
    ) {
      observedPeaks.push(livePeak);
    }

    if (!observedPeaks.length) return { partial: false, value: null };
    const maximum = Math.max(...observedPeaks);
    if (year === openYear) {
      // O ano aberto pode ser publicado com a melhor observação disponível,
      // desde que continue explicitamente parcial. Meses ausentes não viram 0.
      return { partial: true, value: maximum };
    }
    if (!months.length || observedPeaks.length !== months.length) {
      return { partial: false, value: null };
    }
    return { partial: false, value: maximum };
  });
}

export function occupancyMaximumTrendBucketLabel(
  bucket: Date,
  granularity: "hour" | "month" | "year",
) {
  requireValidDate(bucket, "bucket do máximo por cenário");
  if (granularity === "hour") {
    return `${String(bucket.getHours()).padStart(2, "0")}h`;
  }
  if (granularity === "month") {
    return `${OCCUPANCY_MONTH_SHORT_LABELS[bucket.getMonth()]}/${String(
      bucket.getFullYear(),
    ).slice(-2)}`;
  }
  return String(bucket.getFullYear());
}

export function occupancyMaximumTrendBucketLabels(
  buckets: readonly Date[],
  granularity: "hour" | "month" | "year",
) {
  const labels = buckets.map((bucket) =>
    occupancyMaximumTrendBucketLabel(bucket, granularity),
  );
  if (granularity !== "hour") return labels;

  const occurrences = new Map<string, number>();
  labels.forEach((label) =>
    occurrences.set(label, (occurrences.get(label) ?? 0) + 1),
  );
  return labels.map((label, index) =>
    (occurrences.get(label) ?? 0) > 1
      ? `${label} (${utcOffsetLabel(buckets[index])})`
      : label,
  );
}

export function listOccupancyHourBuckets(from: Date, to: Date) {
  requireValidDate(from, "início da série horária");
  requireValidDate(to, "fim da série horária");
  if (
    startOfAggregateBucket(from, "hour").getTime() !== from.getTime() ||
    startOfAggregateBucket(to, "hour").getTime() !== to.getTime() ||
    from >= to
  ) {
    throw new RangeError("O intervalo horário da ocupação é inválido.");
  }

  const buckets: Date[] = [];
  let cursor = new Date(from);
  while (cursor < to) {
    buckets.push(new Date(cursor));
    const next = endOfAggregateBucket(cursor, "hour");
    if (next <= cursor) {
      throw new Error("Não foi possível avançar a série horária de ocupação.");
    }
    cursor = next;
    if (buckets.length > 31 * 25) {
      throw new RangeError("A série horária de ocupação excedeu o limite.");
    }
  }
  if (cursor.getTime() !== to.getTime()) {
    throw new RangeError("O fim da série horária não coincide com um bucket.");
  }
  return buckets;
}

function listOccupancyCalendarBuckets(
  from: Date,
  to: Date,
  granularity: "month" | "year",
) {
  requireValidDate(from, "início da série civil de ocupação");
  requireValidDate(to, "fim da série civil de ocupação");
  if (
    startOfAggregateBucket(from, granularity).getTime() !== from.getTime() ||
    startOfAggregateBucket(to, granularity).getTime() !== to.getTime() ||
    from >= to
  ) {
    throw new RangeError("O intervalo civil da ocupação é inválido.");
  }

  const buckets: Date[] = [];
  let cursor = new Date(from);
  while (cursor < to) {
    buckets.push(new Date(cursor));
    cursor = endOfAggregateBucket(cursor, granularity);
    if (buckets.length > 120) {
      throw new RangeError("A série civil de ocupação excedeu o limite.");
    }
  }
  if (cursor.getTime() !== to.getTime()) {
    throw new RangeError("O fim da série civil não coincide com um bucket.");
  }
  return buckets;
}

function utcOffsetLabel(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${
    minutes ? `:${String(minutes).padStart(2, "0")}` : ""
  }`;
}

export function occupancyMetricValue(
  metric: OccupancyAggregateMetric | undefined,
  key: OccupancyComparisonMetricKey,
) {
  if (!metric) return null;
  return key === "peak" ? metric.peak : metric.average;
}

export function classifyOccupancyTotal(
  total: number | null,
): OccupancyCertificationState {
  if (total === null) return "unknown";
  if (!Number.isFinite(total) || total < 0) {
    throw new RangeError("O total de ocupação comparado é inválido.");
  }
  return total === 0 ? "unoccupied" : "occupied";
}

export function occupancySnapshotTotalWithinHour(
  snapshot: Pick<OccupancyScenarioSnapshot, "asOf" | "total">,
  bucket: Date,
) {
  requireValidDate(bucket, "bucket horário do snapshot");
  if (
    snapshot.total === null ||
    !Number.isFinite(snapshot.total) ||
    snapshot.total < 0 ||
    !snapshot.asOf
  ) {
    return undefined;
  }
  const asOf = new Date(snapshot.asOf);
  const to = endOfAggregateBucket(bucket, "hour");
  if (Number.isNaN(asOf.getTime()) || asOf < bucket || asOf >= to) {
    return undefined;
  }
  return snapshot.total;
}

export function filterOccupancySnapshots(
  snapshots: readonly OccupancyScenarioSnapshot[],
  filter: OccupancyComparisonFilter,
) {
  return snapshots.filter(
    (snapshot) => classifyOccupancyTotal(snapshot.total) === filter,
  );
}

export function buildOccupancyLiveRaceEntries(
  snapshots: readonly OccupancyScenarioSnapshot[],
): OccupancyLiveRaceEntry[] {
  return snapshots.map((snapshot) => {
    classifyOccupancyTotal(snapshot.total);
    return {
      name: snapshot.name,
      scenarioId: snapshot.scenarioId,
      value: snapshot.total,
    };
  });
}

export function buildOccupancyHalfDonutEntries(
  snapshots: readonly OccupancyScenarioSnapshot[],
  mode: OccupancyHalfDonutMode,
): OccupancyHalfDonutEntry[] {
  if (mode !== "status" && mode !== "actual") {
    throw new RangeError("O modo da comparação atual é inválido.");
  }
  return snapshots.flatMap((snapshot) => {
    const state = classifyOccupancyTotal(snapshot.total);
    if (state === "unknown" || snapshot.total === null) return [];
    return [
      {
        chartValue: mode === "status" ? 1 : snapshot.total,
        name: snapshot.name,
        scenarioId: snapshot.scenarioId,
        state,
        total: snapshot.total,
      },
    ];
  });
}

export function buildOccupancyComparisonBarEntries(
  snapshots: readonly OccupancyScenarioSnapshot[],
  mode: OccupancyHalfDonutMode,
): OccupancyComparisonBarEntry[] {
  if (mode !== "status" && mode !== "actual") {
    throw new RangeError("O modo da comparação atual é inválido.");
  }
  return snapshots.map((snapshot) => {
    const state = classifyOccupancyTotal(snapshot.total);
    return {
      chartValue:
        mode === "status"
          ? state === "unknown"
            ? 0
            : 1
          : snapshot.total ?? 0,
      name: snapshot.name,
      scenarioId: snapshot.scenarioId,
      state,
      total: snapshot.total,
    };
  });
}

export function occupancyHalfDonutMinimumAngle(mode: OccupancyHalfDonutMode) {
  if (mode !== "status" && mode !== "actual") {
    throw new RangeError("O modo da comparação atual é inválido.");
  }
  return mode === "status" ? 3 : 0;
}

export function buildDaysHoursOccupancyCells({
  buckets,
  metric,
  scenario,
}: {
  buckets: readonly Date[];
  metric: OccupancyComparisonMetricKey;
  scenario: OccupancyScenarioHourlySeries;
}) {
  const dayKeys: string[] = [];
  const dayIndexByKey = new Map<string, number>();
  buckets.forEach((bucket) => {
    const key = localDateKey(bucket);
    if (dayIndexByKey.has(key)) return;
    dayIndexByKey.set(key, dayKeys.length);
    dayKeys.push(key);
  });

  const cells: OccupancyHeatmapCell[] = buckets.map((bucket) => {
    const key = occupancyAggregateBucketKey(bucket, "hour");
    return {
      bucket: new Date(bucket),
      scenarioId: scenario.scenarioId,
      value: occupancyMetricValue(scenario.metrics.get(key), metric),
      x: dayIndexByKey.get(localDateKey(bucket))!,
      y: bucket.getHours(),
    };
  });

  return { cells: collapseRepeatedHourCells(cells, metric), dayKeys };
}

export function buildScenariosHoursOccupancyCells({
  buckets,
  dateKey,
  metric,
  series,
}: {
  buckets: readonly Date[];
  dateKey: string;
  metric: OccupancyComparisonMetricKey;
  series: readonly OccupancyScenarioHourlySeries[];
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError("A data do mapa de calor é inválida.");
  }
  const selectedBuckets = buckets.filter(
    (bucket) => localDateKey(bucket) === dateKey,
  );
  const cells = series.flatMap((scenario, scenarioIndex) =>
    selectedBuckets.map((bucket): OccupancyHeatmapCell => {
      const key = occupancyAggregateBucketKey(bucket, "hour");
      return {
        bucket: new Date(bucket),
        scenarioId: scenario.scenarioId,
        value: occupancyMetricValue(scenario.metrics.get(key), metric),
        x: scenarioIndex,
        y: bucket.getHours(),
      };
    }),
  );

  return {
    cells: collapseRepeatedHourCells(cells, metric),
    scenarioNames: series.map((scenario) => scenario.name),
  };
}

export function buildOccupancyHexLayout({
  capacities,
  columns,
  layout,
  preset,
  scenarios,
  snapshots,
}: {
  capacities: Readonly<Record<string, number | undefined>>;
  columns: number;
  layout?: OccupancyHexLayout | null;
  preset: OccupancyLayoutPreset;
  scenarios: readonly OccupancyScenario[];
  snapshots: readonly OccupancyScenarioSnapshot[];
}): OccupancyHexPosition[] {
  if (
    !Number.isSafeInteger(columns) ||
    columns < OCCUPANCY_HEX_MIN_COLUMNS ||
    columns > OCCUPANCY_HEX_MAX_COLUMNS
  ) {
    throw new RangeError(
      `O simulador aceita de ${OCCUPANCY_HEX_MIN_COLUMNS} a ${OCCUPANCY_HEX_MAX_COLUMNS} colunas.`,
    );
  }
  const snapshotById = new Map(
    snapshots.map((snapshot) => [snapshot.scenarioId, snapshot]),
  );
  const scenarioById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const resolvedLayout =
    layout ??
    createDefaultOccupancyHexLayout({
      columns,
      preset,
      scenarioIds: scenarios.map((scenario) => scenario.id),
    });

  return resolvedLayout.cells.map((cell) => {
    const scenario = cell.scenarioId
      ? scenarioById.get(cell.scenarioId)
      : undefined;
    const snapshot = cell.scenarioId
      ? snapshotById.get(cell.scenarioId)
      : undefined;
    const total = scenario ? snapshot?.total ?? null : null;
    const capacity = scenario
      ? normalizeOccupancyCapacity(capacities[scenario.id], scenario)
      : null;
    const position = occupancyHexCoordinates(
      cell.column,
      cell.row,
      resolvedLayout.preset,
    );
    return {
      ...position,
      capacity,
      cellId: cell.id,
      column: cell.column,
      name:
        cell.label ||
        scenario?.name ||
        (cell.scenarioId ? "Cenário indisponível" : "Sem vínculo"),
      row: cell.row,
      scenarioId: cell.scenarioId,
      state:
        cell.scenarioId === null
          ? "unlinked"
          : scenario
            ? classifyOccupancyTotal(total)
            : "unavailable",
      total,
      utilization:
        total === null || capacity === null ? null : total / capacity,
    };
  });
}

export function normalizeOccupancyCapacity(
  requested: number | undefined,
  scenario: Pick<OccupancyScenario, "max_total">,
) {
  if (
    typeof requested === "number" &&
    Number.isSafeInteger(requested) &&
    requested > 0
  ) {
    return requested;
  }
  const threshold = scenario.max_total;
  if (
    typeof threshold === "number" &&
    Number.isSafeInteger(threshold) &&
    threshold > 0
  ) {
    return threshold;
  }
  return null;
}

export function localDateKey(date: Date) {
  requireValidDate(date, "data local");
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function occupancyHexCoordinates(
  column: number,
  row: number,
  preset: OccupancyLayoutPreset,
) {
  if (preset === "queue") {
    return { x: column, y: row * 1.15 };
  }
  if (preset === "showcase" || preset === "custom") {
    return { x: column + (row % 2 ? 0.5 : 0), y: row * 0.9 };
  }
  const islandGap = Math.floor(column / 2) * 0.35;
  return { x: column + islandGap, y: row * 1.2 };
}

function collapseRepeatedHourCells(
  cells: OccupancyHeatmapCell[],
  metric: OccupancyComparisonMetricKey,
) {
  const accumulators = new Map<
    string,
    {
      cell: OccupancyHeatmapCell;
      count: number;
      missing: boolean;
      sum: number;
    }
  >();
  cells.forEach((cell) => {
    const key = JSON.stringify([cell.scenarioId, cell.x, cell.y]);
    const existing = accumulators.get(key) ?? {
      cell: { ...cell },
      count: 0,
      missing: false,
      sum: 0,
    };
    if (cell.value === null) {
      existing.missing = true;
    } else if (metric === "peak") {
      existing.sum = existing.count
        ? Math.max(existing.sum, cell.value)
        : cell.value;
      existing.count += 1;
    } else {
      existing.sum += cell.value;
      existing.count += 1;
    }
    accumulators.set(key, existing);
  });

  return Array.from(accumulators.values(), ({ cell, count, missing, sum }) => ({
    ...cell,
    value:
      missing || count === 0
        ? null
        : metric === "average"
          ? sum / count
          : sum,
  }));
}

function requireValidDate(date: Date, label: string) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError(`O ${label} é inválido.`);
  }
}
