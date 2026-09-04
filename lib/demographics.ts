import type {
  DemographicAgeBucket,
  DemographicBucketRow,
  DemographicEmotion,
  DemographicGender,
} from "@/lib/types";

export const GENDER_LABELS = ["Woman", "Man"] as const;

export const AGE_LABELS = [
  "0-2",
  "3-9",
  "10-19",
  "20-29",
  "30-39",
  "40-49",
  "50-59",
  "60-69",
  "70+",
] as const;

export const EMOTION_LABELS = [
  "neutral",
  "happy",
  "surprise",
  "sad",
  "angry",
  "disgust",
  "fear",
  "contempt",
] as const;

export const DEMOGRAPHIC_GENDERS = [
  ...GENDER_LABELS,
  "unknown",
] as const satisfies readonly DemographicGender[];

export const DEMOGRAPHIC_GENDER_DISPLAY_LABELS: Readonly<
  Record<DemographicGender, string>
> = {
  Woman: "Mulher",
  Man: "Homem",
  unknown: "Não identificado",
};

export const DEMOGRAPHIC_AGE_DISPLAY_LABELS: Readonly<
  Record<DemographicAgeBucket, string>
> = Object.fromEntries(AGE_LABELS.map((label) => [label, label])) as Record<
  DemographicAgeBucket,
  string
>;

export const DEMOGRAPHIC_EMOTION_DISPLAY_LABELS: Readonly<
  Record<DemographicEmotion, string>
> = {
  neutral: "Neutro",
  happy: "Feliz",
  surprise: "Surpresa",
  sad: "Triste",
  angry: "Raiva",
  disgust: "Nojo",
  fear: "Medo",
  contempt: "Desprezo",
};

export type DemographicValidationOptions = {
  expectedCameraId?: string;
  from?: Date | string;
  to?: Date | string;
};

export type DemographicDistributionItem<Key extends string = string> = {
  count: number;
  key: Key;
  label: string;
  observed: boolean;
  percentage: number | null;
};

export type DemographicCrossingCell<
  RowKey extends string = string,
  ColumnKey extends string = string,
> = {
  columnKey: ColumnKey;
  columnPercentage: number | null;
  count: number;
  observed: boolean;
  percentage: number | null;
  rowKey: RowKey;
  rowPercentage: number | null;
};

export type DemographicCrossingRow<
  RowKey extends string = string,
  ColumnKey extends string = string,
> = DemographicDistributionItem<RowKey> & {
  cells: DemographicCrossingCell<RowKey, ColumnKey>[];
};

export type DemographicCrossing<
  RowKey extends string = string,
  ColumnKey extends string = string,
> = {
  columnTotals: DemographicDistributionItem<ColumnKey>[];
  columns: Array<{ key: ColumnKey; label: string }>;
  rows: DemographicCrossingRow<RowKey, ColumnKey>[];
  total: number;
};

export type DemographicAggregation = {
  age: DemographicDistributionItem<DemographicAgeBucket>[];
  cameraIds: string[];
  crossings: {
    ageByEmotion: DemographicCrossing<
      DemographicAgeBucket,
      DemographicEmotion
    >;
    ageByGender: DemographicCrossing<
      DemographicAgeBucket,
      DemographicGender
    >;
    genderByEmotion: DemographicCrossing<
      DemographicGender,
      DemographicEmotion
    >;
  };
  emotion: DemographicDistributionItem<DemographicEmotion>[];
  gender: DemographicDistributionItem<DemographicGender>[];
  hasData: boolean;
  observedBucketCount: number;
  total: number;
  unit: "detections";
};

export type DemographicMinuteCoverage = {
  allMinutesObserved: boolean;
  missingMinutes: number;
  observedMinutes: number;
  percentage: number | null;
  requestedMinutes: number;
};

export type DemographicTimelineStatus = "observed" | "partial" | "missing";

export type DemographicTimelineBucket = {
  coveragePercentage: number | null;
  expectedMinuteCount: number;
  from: string;
  observedMinuteCount: number;
  status: DemographicTimelineStatus;
  to: string;
  total: number | null;
};

export type DemographicTimelineOptions = {
  from: Date | string;
  maxPoints?: number;
  stepMinutes?: number;
  to: Date | string;
};

type DemographicDimension<Key extends string> = {
  keys: readonly Key[];
  labels: Readonly<Record<Key, string>>;
  read: (row: DemographicBucketRow) => Key;
};

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/;
const MINUTE_MS = 60_000;
const DEFAULT_MAX_TIMELINE_POINTS = 10_000;

const GENDER_DIMENSION: DemographicDimension<DemographicGender> = {
  keys: DEMOGRAPHIC_GENDERS,
  labels: DEMOGRAPHIC_GENDER_DISPLAY_LABELS,
  read: (row) => row.gender,
};

const AGE_DIMENSION: DemographicDimension<DemographicAgeBucket> = {
  keys: AGE_LABELS,
  labels: DEMOGRAPHIC_AGE_DISPLAY_LABELS,
  read: (row) => row.age_bucket,
};

const EMOTION_DIMENSION: DemographicDimension<DemographicEmotion> = {
  keys: EMOTION_LABELS,
  labels: DEMOGRAPHIC_EMOTION_DISPLAY_LABELS,
  read: (row) => row.emotion,
};

/**
 * Validates the exact response exposed by GET /api/v1/demographics/buckets.
 * Returned timestamps are normalized to UTC and rows are placed in a stable,
 * canonical order so charts do not reorder labels as data changes.
 */
export function requireDemographicBucketsResponse(
  response: unknown,
  options: DemographicValidationOptions = {},
): DemographicBucketRow[] {
  return validateDemographicBucketsResponse(response, options, true);
}

function validateDemographicBucketsResponse(
  response: unknown,
  options: DemographicValidationOptions,
  sortRows: boolean,
): DemographicBucketRow[] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    throw new Error(
      "A API retornou uma resposta demográfica sem o campo data.",
    );
  }

  const from = parseOptionalBoundary(options.from, "from");
  const to = parseOptionalBoundary(options.to, "to");
  if (from !== undefined && to !== undefined && from >= to) {
    throw new RangeError(
      "O início do intervalo demográfico deve ser anterior ao fim.",
    );
  }
  const expectedCameraId = options.expectedCameraId?.trim();
  if (options.expectedCameraId !== undefined && !expectedCameraId) {
    throw new Error("O camera_id esperado não pode ser vazio.");
  }

  const duplicateKeys = new Set<string>();
  const rows = response.data.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw invalidRow(index, "não é um objeto");
    }

    const bucket = requireMinuteBucket(candidate.bucket, index);
    const bucketTime = Date.parse(bucket);
    if (from !== undefined && bucketTime < from) {
      throw invalidRow(index, "está antes do intervalo solicitado");
    }
    if (to !== undefined && bucketTime >= to) {
      throw invalidRow(index, "está fora do fim exclusivo solicitado");
    }

    const cameraId = requireNonEmptyString(
      candidate.camera_id,
      index,
      "camera_id",
    );
    if (expectedCameraId && cameraId !== expectedCameraId) {
      throw invalidRow(
        index,
        `pertence à câmera "${cameraId}" em vez de "${expectedCameraId}"`,
      );
    }

    const count = candidate.count;
    if (!Number.isSafeInteger(count) || (count as number) < 0) {
      throw invalidRow(index, "possui count inválido");
    }

    const age = requireEnum(
      candidate.age_bucket,
      AGE_LABELS,
      index,
      "age_bucket",
    );
    const gender = requireEnum(
      candidate.gender,
      DEMOGRAPHIC_GENDERS,
      index,
      "gender",
    );
    const emotion = requireEnum(
      candidate.emotion,
      EMOTION_LABELS,
      index,
      "emotion",
    );
    const duplicateKey = [
      bucket,
      cameraId,
      age,
      gender,
      emotion,
    ].join("\u0000");
    if (duplicateKeys.has(duplicateKey)) {
      throw invalidRow(
        index,
        "duplica a mesma chave de bucket, câmera, idade, gênero e emoção",
      );
    }
    duplicateKeys.add(duplicateKey);

    return {
      age_bucket: age,
      bucket,
      camera_id: cameraId,
      count: count as number,
      emotion,
      gender,
    };
  });

  if (!sortRows) return rows;

  const ageOrder = orderMap(AGE_LABELS);
  const genderOrder = orderMap(DEMOGRAPHIC_GENDERS);
  const emotionOrder = orderMap(EMOTION_LABELS);
  return rows.sort(
    (left, right) =>
      Date.parse(left.bucket) - Date.parse(right.bucket) ||
      left.camera_id.localeCompare(right.camera_id) ||
      ageOrder.get(left.age_bucket)! - ageOrder.get(right.age_bucket)! ||
      genderOrder.get(left.gender)! - genderOrder.get(right.gender)! ||
      emotionOrder.get(left.emotion)! - emotionOrder.get(right.emotion)!,
  );
}

export function aggregateDemographicBuckets(
  rows: readonly DemographicBucketRow[],
): DemographicAggregation {
  const total = sumCounts(rows);
  const gender = buildDistribution(rows, GENDER_DIMENSION, total);
  const age = buildDistribution(rows, AGE_DIMENSION, total);
  const emotion = buildDistribution(rows, EMOTION_DIMENSION, total);

  return {
    age,
    cameraIds: Array.from(
      new Set(rows.map((row) => row.camera_id)),
    ).sort((left, right) => left.localeCompare(right)),
    crossings: {
      ageByEmotion: buildCrossing(
        rows,
        AGE_DIMENSION,
        EMOTION_DIMENSION,
        total,
      ),
      ageByGender: buildCrossing(
        rows,
        AGE_DIMENSION,
        GENDER_DIMENSION,
        total,
      ),
      genderByEmotion: buildCrossing(
        rows,
        GENDER_DIMENSION,
        EMOTION_DIMENSION,
        total,
      ),
    },
    emotion,
    gender,
    hasData: rows.length > 0,
    observedBucketCount: new Set(rows.map((row) => row.bucket)).size,
    total,
    unit: "detections",
  };
}

export function summarizeDemographicBuckets(
  response: unknown,
  options: DemographicValidationOptions = {},
) {
  return aggregateDemographicBuckets(
    validateDemographicBucketsResponse(response, options, false),
  );
}

/**
 * Combines non-overlapping aggregate partitions without retaining their raw
 * rows. This is intended for bounded/chunked API reads over long periods.
 */
export function combineDemographicAggregations(
  summaries: readonly DemographicAggregation[],
): DemographicAggregation {
  const total = summaries.reduce(
    (sum, summary) => safeCountSum(sum, summary.total),
    0,
  );
  const gender = combineDistributions(
    summaries.map((summary) => summary.gender),
    GENDER_DIMENSION,
    total,
  );
  const age = combineDistributions(
    summaries.map((summary) => summary.age),
    AGE_DIMENSION,
    total,
  );
  const emotion = combineDistributions(
    summaries.map((summary) => summary.emotion),
    EMOTION_DIMENSION,
    total,
  );

  return {
    age,
    cameraIds: Array.from(
      new Set(summaries.flatMap((summary) => summary.cameraIds)),
    ).sort((left, right) => left.localeCompare(right)),
    crossings: {
      ageByEmotion: combineCrossings(
        summaries.map((summary) => summary.crossings.ageByEmotion),
        AGE_DIMENSION,
        EMOTION_DIMENSION,
        total,
      ),
      ageByGender: combineCrossings(
        summaries.map((summary) => summary.crossings.ageByGender),
        AGE_DIMENSION,
        GENDER_DIMENSION,
        total,
      ),
      genderByEmotion: combineCrossings(
        summaries.map((summary) => summary.crossings.genderByEmotion),
        GENDER_DIMENSION,
        EMOTION_DIMENSION,
        total,
      ),
    },
    emotion,
    gender,
    hasData: summaries.some((summary) => summary.hasData),
    observedBucketCount: summaries.reduce(
      (sum, summary) => safeCountSum(sum, summary.observedBucketCount),
      0,
    ),
    total,
    unit: "detections",
  };
}

/**
 * Returns explicit data quality coverage for the raw one-minute contract.
 * A minute without any returned row is unknown; it is never coerced to zero.
 */
export function summarizeDemographicMinuteCoverage(
  sourceRows: readonly DemographicBucketRow[],
  range: Pick<DemographicTimelineOptions, "from" | "to">,
): DemographicMinuteCoverage {
  const { from, to } = requireAlignedRange(range.from, range.to);
  const rows = validateDemographicBucketsResponse(
    { data: sourceRows },
    { from: new Date(from), to: new Date(to) },
    false,
  );
  const requestedMinutes = (to - from) / MINUTE_MS;
  const observedMinutes = new Set(rows.map((row) => row.bucket)).size;
  const missingMinutes = requestedMinutes - observedMinutes;

  return {
    allMinutesObserved: missingMinutes === 0,
    missingMinutes,
    observedMinutes,
    percentage: safeDemographicPercentage(
      observedMinutes,
      requestedMinutes,
    ),
    requestedMinutes,
  };
}

/**
 * Builds bounded chart buckets. Fully observed buckets have a numeric total,
 * partial buckets retain their observed subtotal, and wholly absent buckets
 * carry null so ECharts renders a gap instead of a false zero. "Observed" is
 * about row presence only; the GET contract does not certify completeness.
 */
export function buildDemographicMinuteTimeline(
  sourceRows: readonly DemographicBucketRow[],
  options: DemographicTimelineOptions,
): DemographicTimelineBucket[] {
  const { from, to } = requireAlignedRange(options.from, options.to);
  const stepMinutes = options.stepMinutes ?? 1;
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_TIMELINE_POINTS;
  if (!Number.isSafeInteger(stepMinutes) || stepMinutes < 1) {
    throw new RangeError("O passo da série demográfica deve ser positivo.");
  }
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1) {
    throw new RangeError("O limite de pontos demográficos deve ser positivo.");
  }

  const stepMs = stepMinutes * MINUTE_MS;
  const pointCount = Math.ceil((to - from) / stepMs);
  if (pointCount > maxPoints) {
    throw new RangeError(
      `A série demográfica produziria ${pointCount} pontos; aumente o passo para respeitar o limite de ${maxPoints}.`,
    );
  }

  const rows = validateDemographicBucketsResponse(
    { data: sourceRows },
    { from: new Date(from), to: new Date(to) },
    false,
  );
  const totalsByMinute = new Map<number, number>();
  rows.forEach((row) => {
    const minute = Date.parse(row.bucket);
    totalsByMinute.set(
      minute,
      safeCountSum(totalsByMinute.get(minute) ?? 0, row.count),
    );
  });

  const result: DemographicTimelineBucket[] = [];
  for (let start = from; start < to; start += stepMs) {
    const end = Math.min(start + stepMs, to);
    const expectedMinuteCount = (end - start) / MINUTE_MS;
    let observedMinuteCount = 0;
    let total = 0;
    for (let minute = start; minute < end; minute += MINUTE_MS) {
      const minuteTotal = totalsByMinute.get(minute);
      if (minuteTotal === undefined) continue;
      observedMinuteCount += 1;
      total = safeCountSum(total, minuteTotal);
    }

    const status: DemographicTimelineStatus =
      observedMinuteCount === 0
        ? "missing"
        : observedMinuteCount === expectedMinuteCount
          ? "observed"
          : "partial";
    result.push({
      coveragePercentage: safeDemographicPercentage(
        observedMinuteCount,
        expectedMinuteCount,
      ),
      expectedMinuteCount,
      from: new Date(start).toISOString(),
      observedMinuteCount,
      status,
      to: new Date(end).toISOString(),
      total: status === "missing" ? null : total,
    });
  }

  return result;
}

export function safeDemographicPercentage(
  part: number,
  total: number,
): number | null {
  if (
    !Number.isFinite(part) ||
    !Number.isFinite(total) ||
    part < 0 ||
    total <= 0 ||
    part > total
  ) {
    return null;
  }
  return Math.round((part / total) * 10_000) / 100;
}

export function demographicCoverageWarning(
  coverage: DemographicMinuteCoverage,
) {
  if (coverage.missingMinutes === 0) return undefined;
  const minuteLabel = coverage.missingMinutes === 1 ? "minuto" : "minutos";
  return `${coverage.missingMinutes} ${minuteLabel} sem bucket demográfico aparecem sem valor; ausência de dados não é zero.`;
}

function buildDistribution<Key extends string>(
  rows: readonly DemographicBucketRow[],
  dimension: DemographicDimension<Key>,
  total: number,
): DemographicDistributionItem<Key>[] {
  const counts = new Map<Key, number>();
  const observedKeys = new Set<Key>();
  rows.forEach((row) => {
    const key = dimension.read(row);
    observedKeys.add(key);
    counts.set(key, safeCountSum(counts.get(key) ?? 0, row.count));
  });
  return distributionFromCounts(counts, dimension, total, observedKeys);
}

function combineDistributions<Key extends string>(
  distributions: readonly (readonly DemographicDistributionItem<Key>[])[],
  dimension: DemographicDimension<Key>,
  total: number,
) {
  const counts = new Map<Key, number>();
  const observedKeys = new Set<Key>();
  distributions.forEach((distribution) => {
    distribution.forEach((item) => {
      if (!dimension.keys.includes(item.key)) {
        throw new Error(
          `A consolidação demográfica recebeu a categoria desconhecida "${item.key}".`,
        );
      }
      counts.set(
        item.key,
        safeCountSum(counts.get(item.key) ?? 0, item.count),
      );
      if (item.observed) observedKeys.add(item.key);
    });
  });
  return distributionFromCounts(counts, dimension, total, observedKeys);
}

function distributionFromCounts<Key extends string>(
  counts: ReadonlyMap<Key, number>,
  dimension: DemographicDimension<Key>,
  total: number,
  observedKeys: ReadonlySet<Key> = new Set(),
) {
  const percentages = allocatePercentages(
    dimension.keys.map((key) => counts.get(key) ?? 0),
    total,
  );
  return dimension.keys.map((key, index) => {
    const count = counts.get(key) ?? 0;
    return {
      count,
      key,
      label: dimension.labels[key],
      observed: observedKeys.has(key),
      percentage: percentages[index],
    };
  });
}

function combineCrossings<RowKey extends string, ColumnKey extends string>(
  crossings: readonly DemographicCrossing<RowKey, ColumnKey>[],
  rowDimension: DemographicDimension<RowKey>,
  columnDimension: DemographicDimension<ColumnKey>,
  total: number,
) {
  const counts = new Map<string, number>();
  const observedKeys = new Set<string>();
  crossings.forEach((crossing) => {
    crossing.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        if (
          !rowDimension.keys.includes(cell.rowKey) ||
          !columnDimension.keys.includes(cell.columnKey)
        ) {
          throw new Error("A consolidação demográfica recebeu um cruzamento desconhecido.");
        }
        const key = crossingKey(cell.rowKey, cell.columnKey);
        counts.set(key, safeCountSum(counts.get(key) ?? 0, cell.count));
        if (cell.observed) observedKeys.add(key);
      });
    });
  });
  return crossingFromCounts(
    counts,
    rowDimension,
    columnDimension,
    total,
    undefined,
    undefined,
    observedKeys,
  );
}

function buildCrossing<RowKey extends string, ColumnKey extends string>(
  rows: readonly DemographicBucketRow[],
  rowDimension: DemographicDimension<RowKey>,
  columnDimension: DemographicDimension<ColumnKey>,
  total: number,
): DemographicCrossing<RowKey, ColumnKey> {
  const counts = new Map<string, number>();
  const rowTotals = new Map<RowKey, number>();
  const columnTotals = new Map<ColumnKey, number>();
  const observedKeys = new Set<string>();
  rows.forEach((row) => {
    const rowKey = rowDimension.read(row);
    const columnKey = columnDimension.read(row);
    const key = crossingKey(rowKey, columnKey);
    observedKeys.add(key);
    counts.set(key, safeCountSum(counts.get(key) ?? 0, row.count));
    rowTotals.set(
      rowKey,
      safeCountSum(rowTotals.get(rowKey) ?? 0, row.count),
    );
    columnTotals.set(
      columnKey,
      safeCountSum(columnTotals.get(columnKey) ?? 0, row.count),
    );
  });

  return crossingFromCounts(
    counts,
    rowDimension,
    columnDimension,
    total,
    rowTotals,
    columnTotals,
    observedKeys,
  );
}

function crossingFromCounts<RowKey extends string, ColumnKey extends string>(
  counts: ReadonlyMap<string, number>,
  rowDimension: DemographicDimension<RowKey>,
  columnDimension: DemographicDimension<ColumnKey>,
  total: number,
  suppliedRowTotals?: Map<RowKey, number>,
  suppliedColumnTotals?: Map<ColumnKey, number>,
  observedKeys: ReadonlySet<string> = new Set(),
): DemographicCrossing<RowKey, ColumnKey> {
  const rowTotals = suppliedRowTotals ?? new Map<RowKey, number>();
  const columnTotals = suppliedColumnTotals ?? new Map<ColumnKey, number>();
  if (!suppliedRowTotals || !suppliedColumnTotals) {
    rowDimension.keys.forEach((rowKey) => {
      columnDimension.keys.forEach((columnKey) => {
        const count = counts.get(crossingKey(rowKey, columnKey)) ?? 0;
        rowTotals.set(
          rowKey,
          safeCountSum(rowTotals.get(rowKey) ?? 0, count),
        );
        columnTotals.set(
          columnKey,
          safeCountSum(columnTotals.get(columnKey) ?? 0, count),
        );
      });
    });
  }

  const rowPercentages = allocatePercentages(
    rowDimension.keys.map((key) => rowTotals.get(key) ?? 0),
    total,
  );
  const columnPercentages = allocatePercentages(
    columnDimension.keys.map((key) => columnTotals.get(key) ?? 0),
    total,
  );

  return {
    columnTotals: columnDimension.keys.map((key, index) => {
      const count = columnTotals.get(key) ?? 0;
      return {
        count,
        key,
        label: columnDimension.labels[key],
        observed: rowDimension.keys.some((rowKey) =>
          observedKeys.has(crossingKey(rowKey, key)),
        ),
        percentage: columnPercentages[index],
      };
    }),
    columns: columnDimension.keys.map((key) => ({
      key,
      label: columnDimension.labels[key],
    })),
    rows: rowDimension.keys.map((rowKey, index) => {
      const rowTotal = rowTotals.get(rowKey) ?? 0;
      return {
        cells: columnDimension.keys.map((columnKey) => {
          const count = counts.get(crossingKey(rowKey, columnKey)) ?? 0;
          return {
            columnKey,
            columnPercentage: safeDemographicPercentage(
              count,
              columnTotals.get(columnKey) ?? 0,
            ),
            count,
            observed: observedKeys.has(crossingKey(rowKey, columnKey)),
            percentage: safeDemographicPercentage(count, total),
            rowKey,
            rowPercentage: safeDemographicPercentage(count, rowTotal),
          };
        }),
        count: rowTotal,
        key: rowKey,
        label: rowDimension.labels[rowKey],
        observed: columnDimension.keys.some((columnKey) =>
          observedKeys.has(crossingKey(rowKey, columnKey)),
        ),
        percentage: rowPercentages[index],
      };
    }),
    total,
  };
}

/** Allocates hundredths of a percent so every non-empty distribution is 100%. */
function allocatePercentages(counts: readonly number[], total: number) {
  if (total <= 0) return counts.map(() => null);
  const raw = counts.map((count) => (count / total) * 10_000);
  const basisPoints = raw.map(Math.floor);
  const remaining = 10_000 - basisPoints.reduce((sum, value) => sum + value, 0);
  const remainderOrder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index,
    );
  for (let index = 0; index < remaining; index += 1) {
    basisPoints[remainderOrder[index % remainderOrder.length].index] += 1;
  }
  return basisPoints.map((value) => value / 100);
}

function parseOptionalBoundary(
  value: Date | string | undefined,
  label: string,
) {
  if (value === undefined) return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`O limite ${label} da consulta demográfica é inválido.`);
    }
    return value.getTime();
  }
  const parsed = parseRfc3339(value);
  if (parsed === null) {
    throw new Error(`O limite ${label} da consulta demográfica é inválido.`);
  }
  return parsed;
}

function requireAlignedRange(fromValue: Date | string, toValue: Date | string) {
  const from = parseOptionalBoundary(fromValue, "from")!;
  const to = parseOptionalBoundary(toValue, "to")!;
  if (from >= to) {
    throw new RangeError(
      "O início do intervalo demográfico deve ser anterior ao fim.",
    );
  }
  if (from % MINUTE_MS !== 0 || to % MINUTE_MS !== 0) {
    throw new RangeError(
      "A série demográfica exige limites alinhados ao minuto.",
    );
  }
  return { from, to };
}

function requireMinuteBucket(value: unknown, index: number) {
  if (typeof value !== "string") {
    throw invalidRow(index, "não possui bucket RFC3339");
  }
  const match = RFC3339_PATTERN.exec(value);
  const parsed = parseRfc3339(value);
  if (
    !match ||
    parsed === null ||
    Number(match[6]) !== 0 ||
    (match[7] !== undefined && /[1-9]/.test(match[7]))
  ) {
    throw invalidRow(index, "não possui bucket RFC3339 alinhado ao minuto");
  }
  return new Date(parsed).toISOString();
}

function parseRfc3339(value: string) {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function requireNonEmptyString(
  value: unknown,
  index: number,
  field: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw invalidRow(index, `não possui ${field} válido`);
  }
  return value.trim();
}

function requireEnum<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  index: number,
  field: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw invalidRow(index, `possui ${field} fora do contrato`);
  }
  return value as Values[number];
}

function invalidRow(index: number, reason: string) {
  return new Error(`A linha demográfica na posição ${index} ${reason}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function orderMap<const Values extends readonly string[]>(values: Values) {
  return new Map(values.map((value, index) => [value, index] as const));
}

function sumCounts(rows: readonly DemographicBucketRow[]) {
  return rows.reduce((total, row) => safeCountSum(total, row.count), 0);
}

function safeCountSum(left: number, right: number) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw new RangeError("A soma das contagens demográficas excedeu o limite seguro.");
  }
  return sum;
}

function crossingKey(rowKey: string, columnKey: string) {
  return `${rowKey}\u0000${columnKey}`;
}
