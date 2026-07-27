import {
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
  minimum: number;
  peak: number;
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

export function requireOccupancyAggregateRows(
  response: OccupancyScenarioAggregateResponse,
  requestedGranularity: AggregateGranularity,
  expectedScenarioId: string,
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("A API retornou um agregado de ocupação inválido.");
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
  );
  requireScenarioTotalsForAreaBuckets(rows, requestedGranularity);
  return response.data;
}

export function aggregateOccupancyRowsByBucket(
  rows: OccupancyScenarioBucketRow[],
  granularity: AggregateGranularity,
) {
  if (!Array.isArray(rows)) {
    throw new Error("As linhas agregadas de ocupação são inválidas.");
  }

  const validatedRows = validateOccupancyRows(rows, granularity);
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

function validateOccupancyRows(
  rows: OccupancyScenarioBucketRow[],
  granularity: AggregateGranularity,
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
      index,
    );
    const scenarioTotal = requireMetricTuple(
      row.scenario_total_avg,
      row.scenario_total_min,
      row.scenario_total_max,
      index,
    );
    if (!area && !scenarioTotal) {
      throw invalidRowError(index);
    }
    const bucket = parseAggregateBucket(row.bucket, granularity);
    if (!bucket) {
      throw invalidRowError(index);
    }

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
  rowIndex: number,
) {
  const values = [average, minimum, peak];
  if (values.every((value) => value === undefined)) return null;

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

function sameMetric(
  left: OccupancyAggregateMetric,
  right: OccupancyAggregateMetric,
) {
  return (
    left.average === right.average &&
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
