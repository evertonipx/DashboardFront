import {
  endOfAggregateBucket,
  isAggregateBucketAligned,
  parseAggregateBucket,
  requireAggregateGranularity,
} from "@/lib/aggregate-time";
import type {
  AggregateGranularity,
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioBucketRow,
} from "@/lib/types";

export type OccupancyAggregateMetric = {
  average: number;
  final?: number;
  minimum: number;
  peak: number;
};

export type OccupancyAggregateBucketCoverage = {
  missingBuckets: Date[];
  totals: Map<number, OccupancyAggregateMetric>;
};

export type OccupancyCertifiedCutoffSource = {
  asOf?: unknown;
  error?: unknown;
  warning?: unknown;
};

export type OccupancyAggregateValidationOptions = {
  allowLegacyUncertifiedInstantBuckets?: boolean;
  openBucket?: Date;
  requestedAt?: Date;
  requireCertification?: boolean;
};

type ValidatedOccupancyRow = {
  area: OccupancyAggregateMetric | null;
  bucket: Date;
  scenarioTotal: OccupancyAggregateMetric | null;
};

type OccupancyBucketAccumulator = {
  hasAreaRows: boolean;
  scenarioTotal: OccupancyAggregateMetric | null;
};

const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export function requireOccupancyAggregateRows(
  response: OccupancyScenarioAggregateResponse,
  requestedGranularity: AggregateGranularity,
  expectedScenarioId: string,
  expectedTimezone?: string,
  options: OccupancyAggregateValidationOptions = {},
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("A API retornou um agregado de ocupação inválido.");
  }

  const openBucket = options.openBucket;
  if (
    openBucket !== undefined &&
    (!(openBucket instanceof Date) ||
      Number.isNaN(openBucket.getTime()) ||
      !isAggregateBucketAligned(openBucket, requestedGranularity))
  ) {
    throw new Error("O bucket aberto esperado de ocupação é inválido.");
  }
  const validationOptions = resolveResponseValidationOptions(
    response,
    requestedGranularity,
    options,
  );
  const allowsOpenBucket = openBucket !== undefined;
  requireOptionalComplete(
    response.complete,
    "resposta agregada de ocupação",
    allowsOpenBucket,
    validationOptions.requireCertification,
  );
  requireOptionalCompleteStatus(
    response.status,
    "resposta agregada de ocupação",
    allowsOpenBucket,
    validationOptions.requireCertification,
  );
  const responseAsOf = requireOptionalRfc3339(
    response.as_of,
    "as_of da resposta agregada de ocupação",
    validationOptions.requireCertification,
  );
  if (openBucket !== undefined && validationOptions.requireCertification) {
    requireOccupancyOpenBucketAsOf(
      responseAsOf,
      requestedGranularity,
      openBucket,
      options.requestedAt,
    );
  }
  const returnedTimezone = requireOptionalTimeZone(
    response.timezone,
    validationOptions.requireCertification,
  );
  if (validationOptions.requireCertification && !expectedTimezone) {
    throw new Error(
      "O timezone esperado é obrigatório para certificar o agregado de ocupação.",
    );
  }
  if (
    returnedTimezone &&
    expectedTimezone &&
    returnedTimezone !== requireTimeZone(expectedTimezone, "esperado")
  ) {
    throw new Error(
      `A API agregou a ocupação no fuso "${returnedTimezone}", mas o Dashboard está operando em "${expectedTimezone}".`,
    );
  }

  requireAggregateGranularity(
    response.granularity as AggregateGranularity | null | undefined,
    requestedGranularity,
  );
  const returnedScenarioId = requireTrimmedId(
    response.scenario_id,
    "scenario_id",
  );
  const requestedScenarioId = requireTrimmedId(
    expectedScenarioId,
    "scenario_id esperado",
  );
  if (returnedScenarioId !== requestedScenarioId) {
    throw new Error(
      `A API retornou o agregado do cenário "${returnedScenarioId}" ao consultar "${requestedScenarioId}".`,
    );
  }

  if (!Array.isArray(response.data)) {
    throw new Error(
      "A API retornou um agregado de ocupação sem o campo data.",
    );
  }

  const rows = validateOccupancyRows(
    response.data,
    requestedGranularity,
    validationOptions,
  );
  requireScenarioTotalsForAreaBuckets(rows, requestedGranularity);
  rejectIndependentlySummedAreaAggregates(rows, requestedGranularity);
  return response.data;
}

export function aggregateOccupancyRowsByBucket(
  rows: OccupancyScenarioBucketRow[],
  granularity: AggregateGranularity,
  options: OccupancyAggregateValidationOptions = {},
) {
  if (!Array.isArray(rows)) {
    throw new Error("As linhas agregadas de ocupação são inválidas.");
  }

  const validatedRows = validateOccupancyRows(
    rows,
    granularity,
    resolveRowValidationOptions(rows, granularity, options),
  );
  requireScenarioTotalsForAreaBuckets(validatedRows, granularity);
  const accumulators = new Map<number, OccupancyBucketAccumulator>();

  validatedRows.forEach((row) => {
    const key = occupancyAggregateBucketKey(row.bucket, granularity);
    const existing = accumulators.get(key) ?? {
      hasAreaRows: false,
      scenarioTotal: null,
    };

    if (row.scenarioTotal) {
      if (
        existing.scenarioTotal &&
        !sameMetric(existing.scenarioTotal, row.scenarioTotal)
      ) {
        throw conflictingScenarioTotalError(row.bucket);
      }
      existing.scenarioTotal ??= row.scenarioTotal;
    }

    if (row.area) {
      existing.hasAreaRows = true;
    }
    if (!row.area && !row.scenarioTotal) {
      throw new Error("A linha agregada de ocupação não contém métricas.");
    }

    accumulators.set(key, existing);
  });

  return new Map(
    Array.from(accumulators, ([key, value]) => [
      key,
      value.scenarioTotal!,
    ]),
  );
}

export function aggregateOccupancyRowsForRequestedBuckets(
  rows: OccupancyScenarioBucketRow[],
  granularity: AggregateGranularity,
  requestedBuckets: readonly Date[],
  options: OccupancyAggregateValidationOptions = {},
): OccupancyAggregateBucketCoverage {
  if (!Array.isArray(requestedBuckets)) {
    throw new Error("Os buckets solicitados de ocupação são inválidos.");
  }

  const requestedByKey = new Map<number, Date>();
  requestedBuckets.forEach((bucket, index) => {
    if (
      !(bucket instanceof Date) ||
      Number.isNaN(bucket.getTime()) ||
      !isAggregateBucketAligned(bucket, granularity)
    ) {
      throw new Error(
        `O bucket solicitado de ocupação na posição ${index} é inválido.`,
      );
    }

    const key = occupancyAggregateBucketKey(bucket, granularity);
    if (requestedByKey.has(key)) {
      throw new Error(
        `O bucket solicitado de ocupação na posição ${index} está duplicado.`,
      );
    }
    requestedByKey.set(key, new Date(bucket));
  });

  const totals = aggregateOccupancyRowsByBucket(rows, granularity, options);
  for (const key of totals.keys()) {
    if (!requestedByKey.has(key)) {
      throw new Error(
        `A API retornou o bucket de ocupação ${new Date(
          key,
        ).toISOString()} fora do período solicitado.`,
      );
    }
  }

  return {
    missingBuckets: Array.from(requestedByKey, ([key, bucket]) =>
      totals.has(key) ? null : bucket,
    ).filter((bucket): bucket is Date => bucket !== null),
    totals,
  };
}

export function occupancyAggregateCoverageWarning(
  missingBucketCount: number,
  requestedBucketCount: number,
) {
  if (
    !Number.isSafeInteger(missingBucketCount) ||
    missingBucketCount < 0 ||
    !Number.isSafeInteger(requestedBucketCount) ||
    requestedBucketCount < 0 ||
    missingBucketCount > requestedBucketCount
  ) {
    throw new RangeError("A cobertura do agregado de ocupação é inválida.");
  }
  if (missingBucketCount === 0) return undefined;

  const periodLabel = requestedBucketCount === 1 ? "período" : "períodos";
  const missingLabel = missingBucketCount === 1 ? "não foi retornado" : "não foram retornados";
  const displayLabel = missingBucketCount === 1 ? "aparece" : "aparecem";
  return `${missingBucketCount} de ${requestedBucketCount} ${periodLabel} ${missingLabel} pela API e ${displayLabel} sem valor; ausência de dados não é ocupação zero.`;
}

export function occupancyAggregateMetadataWarning(
  response: OccupancyScenarioAggregateResponse,
  granularity: AggregateGranularity,
) {
  const missing = [
    response.timezone === undefined ? "timezone" : null,
    response.complete === undefined ? "complete" : null,
    response.status === undefined ? "status" : null,
    response.as_of === undefined ? "as_of" : null,
  ].filter((field): field is string => field !== null);
  if (!missing.length) return undefined;

  const kind =
    granularity === "minute" || granularity === "hour"
      ? "Agregado intradiário provisório"
      : "Agregado civil provisório";
  return `${kind}: a API não informou ${missing.join(", ")}; o fuso e o corte temporal ainda não podem ser certificados.`;
}

/**
 * Returns the oldest certified source cut-off. Any missing timestamp, warning
 * or error invalidates the whole report instead of silently replacing the
 * missing cut-off with the browser clock.
 */
export function resolveCertifiedOccupancyDataCutoff(
  sources: readonly OccupancyCertifiedCutoffSource[],
) {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  let oldest = Number.POSITIVE_INFINITY;
  for (const source of sources) {
    if (
      !source ||
      typeof source !== "object" ||
      Boolean(source.error) ||
      Boolean(source.warning)
    ) {
      return null;
    }

    try {
      const asOf = requireOptionalRfc3339(
        source.asOf,
        "as_of da fonte de ocupação",
        true,
      )!;
      oldest = Math.min(oldest, asOf.getTime());
    } catch {
      return null;
    }
  }

  return Number.isFinite(oldest) ? new Date(oldest) : null;
}

export function occupancyAggregateBucketKey(
  date: Date,
  granularity: AggregateGranularity,
) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("O bucket agregado de ocupação é inválido.");
  }

  if (granularity === "minute" || granularity === "hour") {
    // An absolute key keeps both occurrences of a repeated DST hour distinct.
    return date.getTime();
  }
  if (granularity === "day" || granularity === "week") {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (granularity === "month") {
    return Date.UTC(date.getFullYear(), date.getMonth(), 1);
  }
  if (granularity === "semester") {
    return Date.UTC(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
  }
  return Date.UTC(date.getFullYear(), 0, 1);
}

function resolveResponseValidationOptions(
  response: OccupancyScenarioAggregateResponse,
  granularity: AggregateGranularity,
  options: OccupancyAggregateValidationOptions,
): OccupancyAggregateValidationOptions {
  if (
    !canRelaxLegacyInstantCertification(
      response.data,
      granularity,
      options,
    ) ||
    response.timezone !== undefined ||
    response.complete !== undefined ||
    response.status !== undefined ||
    response.as_of !== undefined
  ) {
    return options;
  }

  return { ...options, requireCertification: false };
}

function resolveRowValidationOptions(
  rows: OccupancyScenarioBucketRow[],
  granularity: AggregateGranularity,
  options: OccupancyAggregateValidationOptions,
): OccupancyAggregateValidationOptions {
  return canRelaxLegacyInstantCertification(rows, granularity, options)
    ? { ...options, requireCertification: false }
    : options;
}

function canRelaxLegacyInstantCertification(
  rows: unknown,
  granularity: AggregateGranularity,
  options: OccupancyAggregateValidationOptions,
) {
  return (
    options.requireCertification === true &&
    options.allowLegacyUncertifiedInstantBuckets === true &&
    (granularity === "minute" || granularity === "hour") &&
    Array.isArray(rows) &&
    rows.every(
      (row) =>
        Boolean(row) &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        (row as OccupancyScenarioBucketRow).complete === undefined &&
        (row as OccupancyScenarioBucketRow).status === undefined &&
        isExplicitRfc3339Bucket(
          (row as OccupancyScenarioBucketRow).bucket,
        ),
    )
  );
}

function isExplicitRfc3339Bucket(value: unknown) {
  if (typeof value !== "string") return false;
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  return Boolean(
    match && isRealRfc3339Date(match) && !Number.isNaN(Date.parse(value)),
  );
}

function validateOccupancyRows(
  rows: OccupancyScenarioBucketRow[],
  granularity: AggregateGranularity,
  options: OccupancyAggregateValidationOptions = {},
) {
  const scenarioTotals = new Map<number, OccupancyAggregateMetric>();
  const areaIdentities = new Set<string>();

  return rows.map((row, index): ValidatedOccupancyRow => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw invalidRowError(index);
    }

    if (
      typeof row.bucket !== "string" ||
      !isAggregateBucketAligned(row.bucket, granularity)
    ) {
      throw invalidRowError(index);
    }

    requireOptionalTrimmedId(row.area_id, "area_id", index);
    requireOptionalTrimmedId(row.camera_id, "camera_id", index);

    const area = requireMetricTuple(
      row.area_avg,
      row.area_min,
      row.area_max,
      row.area_final,
      index,
      options.requireCertification,
    );
    const scenarioTotal = requireMetricTuple(
      row.scenario_total_avg,
      row.scenario_total_min,
      row.scenario_total_max,
      row.scenario_total_final,
      index,
      options.requireCertification,
    );
    if (!area && !scenarioTotal) {
      throw invalidRowError(index);
    }
    const bucket = parseAggregateBucket(row.bucket, granularity);
    if (!bucket) {
      throw invalidRowError(index);
    }
    const isExpectedOpenBucket =
      options.openBucket !== undefined &&
      occupancyAggregateBucketKey(bucket, granularity) ===
        occupancyAggregateBucketKey(options.openBucket, granularity);
    requireOptionalComplete(
      row.complete,
      `bucket na posição ${index}`,
      isExpectedOpenBucket,
      options.requireCertification,
    );
    requireOptionalCompleteStatus(
      row.status,
      `bucket na posição ${index}`,
      isExpectedOpenBucket,
      options.requireCertification,
    );

    if (area) {
      if (!row.area_id || !row.camera_id) {
        throw invalidRowError(index);
      }
      const identity = JSON.stringify([
        occupancyAggregateBucketKey(bucket, granularity),
        row.camera_id,
        row.area_id,
      ]);
      if (areaIdentities.has(identity)) {
        throw new Error(
          `A API retornou uma área de ocupação duplicada na posição ${index}.`,
        );
      }
      areaIdentities.add(identity);
    }

    if (scenarioTotal) {
      const key = occupancyAggregateBucketKey(bucket, granularity);
      const existing = scenarioTotals.get(key);
      if (existing && !sameMetric(existing, scenarioTotal)) {
        throw conflictingScenarioTotalError(bucket, index);
      }
      scenarioTotals.set(key, scenarioTotal);
    }

    return { area, bucket, scenarioTotal };
  });
}

function requireMetricTuple(
  average: unknown,
  minimum: unknown,
  peak: unknown,
  final: unknown,
  rowIndex: number,
  requireCertification = false,
) {
  const values = [average, minimum, peak];
  if (values.every((value) => value === undefined)) {
    if (final === undefined) return null;
    throw invalidRowError(rowIndex);
  }

  if (
    !values.every(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0,
    )
  ) {
    throw invalidRowError(rowIndex);
  }

  const metric: OccupancyAggregateMetric = {
    average: average as number,
    minimum: minimum as number,
    peak: peak as number,
  };
  if (metric.minimum > metric.average || metric.average > metric.peak) {
    throw invalidRowError(rowIndex);
  }
  if (requireCertification && final === undefined) {
    throw invalidRowError(rowIndex);
  }
  if (final !== undefined) {
    if (
      typeof final !== "number" ||
      !Number.isFinite(final) ||
      final < metric.minimum ||
      final > metric.peak
    ) {
      throw invalidRowError(rowIndex);
    }
    metric.final = final;
  }

  return metric;
}

function requireOptionalTrimmedId(
  value: unknown,
  field: string,
  rowIndex?: number,
) {
  if (value === undefined) return;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    if (rowIndex !== undefined) throw invalidRowError(rowIndex);
    throw new Error(`A API retornou um ${field} de ocupação inválido.`);
  }
}

function requireOptionalComplete(
  value: unknown,
  context: string,
  allowOpenBucket = false,
  required = false,
) {
  if (value === undefined) {
    if (required) {
      throw new Error(`A API não informou complete em ${context}.`);
    }
    return;
  }
  if (allowOpenBucket && value === false) return;
  if (value !== true) {
    throw new Error(`A API retornou ${context} incompleto ou inválido.`);
  }
}

function requireOptionalCompleteStatus(
  value: unknown,
  context: string,
  allowOpenBucket = false,
  required = false,
) {
  if (value === undefined) {
    if (required) {
      throw new Error(`A API não informou status em ${context}.`);
    }
    return;
  }
  if (allowOpenBucket && value === "partial") return;
  if (value !== "complete") {
    throw new Error(`A API retornou status incompleto ou inválido em ${context}.`);
  }
}

function requireOptionalRfc3339(
  value: unknown,
  context: string,
  required = false,
) {
  if (value === undefined) {
    if (required) throw new Error(`A API não informou ${context}.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  if (
    !match ||
    !isRealRfc3339Date(match) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(`A API retornou ${context} inválido.`);
  }

  return new Date(value);
}

function isRealRfc3339Date(match: RegExpExecArray) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const maximumDay =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;

  return (
    day >= 1 &&
    day <= maximumDay &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    offsetHour >= 0 &&
    offsetHour <= 23 &&
    offsetMinute >= 0 &&
    offsetMinute <= 59
  );
}

/**
 * Certifies the temporal cut-off of an aggregate that contains an open
 * bucket. Closed buckets may legitimately be recomputed later, but an open
 * bucket can only describe observations made between its start and the exact
 * instant requested by the client.
 */
export function requireOccupancyOpenBucketAsOf(
  value: unknown,
  granularity: AggregateGranularity,
  openBucket: Date,
  requestedAt: Date | undefined,
) {
  const asOf =
    value instanceof Date
      ? requireValidDate(value, "as_of do agregado de ocupação")
      : requireOptionalRfc3339(
          value,
          "as_of da resposta agregada de ocupação",
          true,
        )!;
  const bucketStart = requireValidDate(
    openBucket,
    "início do bucket aberto de ocupação",
  );
  if (!isAggregateBucketAligned(bucketStart, granularity)) {
    throw new Error("O bucket aberto esperado de ocupação é inválido.");
  }
  if (requestedAt === undefined) {
    throw new Error(
      "O instante solicitado é obrigatório para certificar o bucket aberto de ocupação.",
    );
  }
  const requestCutoff = requireValidDate(
    requestedAt,
    "instante solicitado do agregado de ocupação",
  );
  const bucketEnd = endOfAggregateBucket(bucketStart, granularity);
  if (requestCutoff < bucketStart || requestCutoff >= bucketEnd) {
    throw new Error(
      "O instante solicitado não pertence ao bucket aberto de ocupação.",
    );
  }
  if (asOf < bucketStart || asOf > requestCutoff) {
    throw new Error(
      "A API retornou as_of fora da janela certificável do bucket aberto de ocupação.",
    );
  }

  return asOf;
}

function requireValidDate(value: Date, context: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`O ${context} é inválido.`);
  }
  return new Date(value);
}

function requireOptionalTimeZone(value: unknown, required = false) {
  if (value === undefined) {
    if (required) {
      throw new Error("A API não informou o timezone do agregado de ocupação.");
    }
    return undefined;
  }
  return requireTimeZone(value, "retornado");
}

function requireTimeZone(value: unknown, source: "esperado" | "retornado") {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`O timezone ${source} do agregado de ocupação é inválido.`);
  }
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`O timezone ${source} do agregado de ocupação é inválido.`);
  }
}

function requireTrimmedId(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`A API retornou um ${field} de ocupação inválido.`);
  }
  return value;
}

function requireScenarioTotalsForAreaBuckets(
  rows: ValidatedOccupancyRow[],
  granularity: AggregateGranularity,
) {
  const bucketsWithArea = new Set<number>();
  const bucketsWithScenarioTotal = new Set<number>();

  rows.forEach((row) => {
    const key = occupancyAggregateBucketKey(row.bucket, granularity);
    if (row.area) bucketsWithArea.add(key);
    if (row.scenarioTotal) bucketsWithScenarioTotal.add(key);
  });

  const missingScenarioTotal = Array.from(bucketsWithArea).find(
    (key) => !bucketsWithScenarioTotal.has(key),
  );
  if (missingScenarioTotal !== undefined) {
    throw new Error(
      `A API não retornou scenario_total_* para o bucket ${new Date(
        missingScenarioTotal,
      ).toISOString()}; mínimos e máximos das áreas não podem ser somados com segurança.`,
    );
  }
}

/**
 * Detects the formula used by the current remote API for multi-area scenarios:
 * it adds AVG/MIN/MAX calculated independently for each area. Peaks and
 * minimums from different instants cannot be added, so publishing that tuple
 * as the scenario total would be mathematically incorrect. A future backend
 * that rebuilds the simultaneous scenario timeline will normally return a
 * tuple different from this component-wise sum and will pass this guard.
 */
function rejectIndependentlySummedAreaAggregates(
  rows: ValidatedOccupancyRow[],
  granularity: AggregateGranularity,
) {
  const buckets = new Map<
    number,
    {
      areaCount: number;
      areaSum: OccupancyAggregateMetric;
      bucket: Date;
      scenarioTotal: OccupancyAggregateMetric | null;
    }
  >();

  rows.forEach((row) => {
    const key = occupancyAggregateBucketKey(row.bucket, granularity);
    const bucket = buckets.get(key) ?? {
      areaCount: 0,
      areaSum: { average: 0, minimum: 0, peak: 0 },
      bucket: row.bucket,
      scenarioTotal: null,
    };

    if (row.area) {
      bucket.areaCount += 1;
      bucket.areaSum.average += row.area.average;
      bucket.areaSum.minimum += row.area.minimum;
      bucket.areaSum.peak += row.area.peak;
    }
    bucket.scenarioTotal ??= row.scenarioTotal;
    buckets.set(key, bucket);
  });

  for (const bucket of buckets.values()) {
    if (
      bucket.areaCount > 1 &&
      bucket.scenarioTotal &&
      !isZeroMetric(bucket.scenarioTotal) &&
      sameMetricWithinTolerance(bucket.areaSum, bucket.scenarioTotal)
    ) {
      throw new Error(
        `A API retornou scenario_total_* do bucket ${bucket.bucket.toISOString()} como soma de AVG/MIN/MAX independentes de ${bucket.areaCount} áreas; o total simultâneo do cenário não pode ser certificado.`,
      );
    }
  }
}

function isZeroMetric(metric: OccupancyAggregateMetric) {
  return metric.average === 0 && metric.minimum === 0 && metric.peak === 0;
}

function sameMetricWithinTolerance(
  left: OccupancyAggregateMetric,
  right: OccupancyAggregateMetric,
) {
  return (
    nearlyEqual(left.average, right.average) &&
    nearlyEqual(left.minimum, right.minimum) &&
    nearlyEqual(left.peak, right.peak)
  );
}

function nearlyEqual(left: number, right: number) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
}

function sameMetric(
  left: OccupancyAggregateMetric,
  right: OccupancyAggregateMetric,
) {
  return (
    left.average === right.average &&
    left.final === right.final &&
    left.minimum === right.minimum &&
    left.peak === right.peak
  );
}

function invalidRowError(index: number) {
  return new Error(
    `A API retornou uma linha agregada de ocupação inválida na posição ${index}.`,
  );
}

function conflictingScenarioTotalError(bucket: Date, rowIndex?: number) {
  const position =
    rowIndex === undefined ? "" : ` na posição ${rowIndex}`;
  return new Error(
    `A API retornou totais de cenário divergentes${position} para o bucket ${bucket.toISOString()}.`,
  );
}
