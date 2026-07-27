import type {
  OccupancyAlertRow,
  OccupancyRow,
  OccupancyScenario,
  OccupancyScenarioHistoryResponse,
} from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

export type CertifiedOccupancyRow = OccupancyRow & {
  avg: number;
  camera_id: string;
  current_value: number;
  min: number;
  peak: number;
};

export type OccupancySnapshotValidationScope = {
  expectedCameraIds: readonly string[];
  expectedObjectClass?: string;
  from: Date;
  to: Date;
};

export type OccupancyHistoryValidationScope = {
  expectedAreas?: ReadonlyArray<{
    area_id: string;
    camera_id: string;
  }>;
  requestedAt: Date;
};

const OCCUPANCY_ROW_COLLECTION_KEYS = [
  "data",
  "snapshots",
  "areas",
  "occupancy_areas",
  "occupancyAreas",
  "cameras",
  "rows",
  "results",
  "items",
] as const;

export function requireOccupancyScenarioRows(value: unknown): OccupancyScenario[] {
  const rows = requireSingleArrayEnvelope(
    value,
    ["data"],
    "cenários de ocupação",
  );
  const scenarioIds = new Set<string>();

  return Array.from(rows, (candidate, scenarioIndex) => {
    const row = requireRecord(
      candidate,
      `cenário de ocupação na posição ${scenarioIndex}`,
    );
    const id = requireId(
      row.id,
      `id do cenário de ocupação na posição ${scenarioIndex}`,
    );
    if (scenarioIds.has(id)) {
      throw new Error(
        `A API retornou o id duplicado "${id}" na lista de cenários de ocupação.`,
      );
    }
    scenarioIds.add(id);

    const companyId = requireId(
      row.company_id,
      `company_id do cenário de ocupação "${id}"`,
    );
    const name = requireText(
      row.name,
      `nome do cenário de ocupação "${id}"`,
    );
    const objectClass = requireId(
      row.object_class,
      `object_class do cenário de ocupação "${id}"`,
    );
    const active = requireBoolean(
      row.active,
      `active do cenário de ocupação "${id}"`,
    );
    if (!Array.isArray(row.areas)) {
      throw new Error(
        `A API retornou areas inválido no cenário de ocupação "${id}".`,
      );
    }
    if (row.areas.length === 0) {
      throw new Error(
        `A API retornou o cenário de ocupação "${id}" sem nenhuma área.`,
      );
    }

    const areaIds = new Set<string>();
    const areas = Array.from(row.areas, (candidateArea, areaIndex) => {
      const area = requireRecord(
        candidateArea,
        `área ${areaIndex} do cenário de ocupação "${id}"`,
      );
      const cameraId = requireId(
        area.camera_id,
        `camera_id da área ${areaIndex} do cenário de ocupação "${id}"`,
      );
      const areaId = requireId(
        area.area_id,
        `area_id da área ${areaIndex} do cenário de ocupação "${id}"`,
      );
      const identity = JSON.stringify([cameraId, areaId]);
      if (areaIds.has(identity)) {
        throw new Error(
          `A API retornou a área duplicada "${areaId}" da câmera "${cameraId}" no cenário de ocupação "${id}".`,
        );
      }
      areaIds.add(identity);

      if (area.label !== undefined) {
        requireText(
          area.label,
          `label da área ${areaIndex} do cenário de ocupação "${id}"`,
        );
      }
      return {
        ...area,
        area_id: areaId,
        camera_id: cameraId,
      };
    });

    const minimum = requireOptionalNonNegativeNumber(
      row.min_total,
      `min_total do cenário de ocupação "${id}"`,
    );
    const maximum = requireOptionalNonNegativeNumber(
      row.max_total,
      `max_total do cenário de ocupação "${id}"`,
    );
    if (
      minimum !== undefined &&
      minimum !== null &&
      maximum !== undefined &&
      maximum !== null &&
      minimum > maximum
    ) {
      throw new Error(
        `A API retornou limites invertidos no cenário de ocupação "${id}".`,
      );
    }
    if (
      row.config !== undefined &&
      (!Array.isArray(row.config) ||
        Array.from(row.config).some(
          (item) => typeof item !== "number" || !Number.isFinite(item),
        ))
    ) {
      throw new Error(
        `A API retornou config inválido no cenário de ocupação "${id}".`,
      );
    }
    requireOptionalText(
      row.created_at,
      `created_at do cenário de ocupação "${id}"`,
    );
    requireOptionalText(
      row.updated_at,
      `updated_at do cenário de ocupação "${id}"`,
    );

    return {
      ...row,
      id,
      company_id: companyId,
      name,
      object_class: objectClass,
      active,
      areas,
      min_total: minimum,
      max_total: maximum,
    } as OccupancyScenario;
  });
}

export function requireOccupancySnapshotRows(
  value: unknown,
  scope: OccupancySnapshotValidationScope,
): CertifiedOccupancyRow[] {
  const rawRows = requireSingleArrayEnvelope(
    value,
    OCCUPANCY_ROW_COLLECTION_KEYS,
    "snapshots de ocupação",
  );
  const fromTime = requireDate(scope.from, "início do bucket de ocupação");
  const toTime = requireDate(scope.to, "fim do bucket de ocupação");
  if (fromTime >= toTime) {
    throw new Error(
      "O intervalo usado para certificar os snapshots de ocupação é inválido.",
    );
  }
  const expectedCameraIds = requireUniqueIds(
    scope.expectedCameraIds,
    "câmeras esperadas do snapshot de ocupação",
  );
  const identities = new Set<string>();
  const returnedCameraIds = new Set<string>();
  const cameraLevels = new Map<
    string,
    { hasCameraTotal: boolean; hasAreas: boolean }
  >();

  const rows = Array.from(
    rawRows,
    (candidate, index): CertifiedOccupancyRow => {
    const row = requireRecord(
      candidate,
      `snapshot de ocupação na posição ${index}`,
    );
    if (
      row.area_id !== undefined ||
      row.areaId !== undefined ||
      row.cameraId !== undefined ||
      row.currentValue !== undefined ||
      row.average !== undefined ||
      row.minimum !== undefined ||
      row.maximum !== undefined
    ) {
      throw new Error(
        `A API retornou aliases não certificados no snapshot de ocupação na posição ${index}.`,
      );
    }
    const cameraId = requireId(
      row.camera_id,
      `camera_id do snapshot de ocupação na posição ${index}`,
    );
    const areaId = requireOptionalId(
      row.area,
      `area do snapshot de ocupação na posição ${index}`,
    );
    const current = requireNonNegativeNumber(
      row.current_value,
      `current_value do snapshot de ocupação na posição ${index}`,
    );
    const average = requireNonNegativeNumber(
      row.avg,
      `avg do snapshot de ocupação na posição ${index}`,
    );
    const minimum = requireNonNegativeNumber(
      row.min,
      `min do snapshot de ocupação na posição ${index}`,
    );
    const peak = requireNonNegativeNumber(
      row.peak,
      `peak do snapshot de ocupação na posição ${index}`,
    );
    if (
      minimum > average ||
      average > peak ||
      current < minimum ||
      current > peak
    ) {
      throw new Error(
        `A API retornou métricas inconsistentes no snapshot de ocupação na posição ${index}.`,
      );
    }
    const currentAt = requireTimestamp(
      row.current_at,
      `current_at do snapshot de ocupação na posição ${index}`,
    );
    if (currentAt < fromTime || currentAt >= toTime) {
      throw new Error(
        `A API retornou current_at fora do bucket no snapshot de ocupação na posição ${index}.`,
      );
    }

    const identity = JSON.stringify([cameraId, areaId ?? ""]);
    if (identities.has(identity)) {
      throw new Error(
        `A API retornou um snapshot de ocupação duplicado para a câmera "${cameraId}"${
          areaId ? ` e área "${areaId}"` : ""
        }.`,
      );
    }
    identities.add(identity);

    const levels = cameraLevels.get(cameraId) ?? {
      hasCameraTotal: false,
      hasAreas: false,
    };
    levels.hasCameraTotal ||= areaId === undefined;
    levels.hasAreas ||= areaId !== undefined;
    if (levels.hasCameraTotal && levels.hasAreas) {
      throw new Error(
        `A API retornou simultaneamente total da câmera "${cameraId}" e suas áreas; a soma seria ambígua.`,
      );
    }
    cameraLevels.set(cameraId, levels);
    returnedCameraIds.add(cameraId);

    const objectClass = scope.expectedObjectClass
      ? requireId(
          row.object_class,
          `object_class do snapshot de ocupação na posição ${index}`,
        )
      : requireOptionalText(
          row.object_class,
          `object_class do snapshot de ocupação na posição ${index}`,
        );
    if (
      scope.expectedObjectClass &&
      objectClass !== scope.expectedObjectClass
    ) {
      throw new Error(
        `A API retornou object_class "${objectClass}" ao consultar "${scope.expectedObjectClass}".`,
      );
    }

    return {
      ...row,
      camera_id: cameraId,
      area: areaId,
      current_at: row.current_at as string,
      current_value: current,
      avg: average,
      min: minimum,
      object_class: objectClass,
      peak,
    } as CertifiedOccupancyRow;
  });

  const missingCameraIds = Array.from(expectedCameraIds).filter(
    (cameraId) => !returnedCameraIds.has(cameraId),
  );
  const extraCameraIds = Array.from(returnedCameraIds).filter(
    (cameraId) => !expectedCameraIds.has(cameraId),
  );
  if (missingCameraIds.length || extraCameraIds.length) {
    throw new Error(
      `A cobertura de câmeras do snapshot de ocupação é inválida (ausentes: ${
        missingCameraIds.join(", ") || "nenhuma"
      }; extras: ${extraCameraIds.join(", ") || "nenhuma"}).`,
    );
  }

  return rows;
}

export function requireOccupancyAlertRows(
  value: unknown,
  expectedScenarioId: string,
  expectedObjectClass: string,
): OccupancyAlertRow[] {
  const scenarioId = requireId(
    expectedScenarioId,
    "cenário esperado da lista de alertas de ocupação",
  );
  const objectClass = requireId(
    expectedObjectClass,
    "object_class esperado da lista de alertas de ocupação",
  );
  const rows = requireSingleArrayEnvelope(
    value,
    ["data", "alerts", "items", "results"],
    "alertas de ocupação",
  );
  const alertIds = new Set<number>();

  return Array.from(rows, (candidate, index) => {
    const row = requireRecord(
      candidate,
      `alerta de ocupação na posição ${index}`,
    );
    if (
      typeof row.id !== "number" ||
      !Number.isSafeInteger(row.id) ||
      row.id < 0
    ) {
      throw new Error(
        `A API retornou id inválido no alerta de ocupação na posição ${index}.`,
      );
    }
    if (alertIds.has(row.id)) {
      throw new Error(
        `A API retornou o id duplicado "${row.id}" na lista de alertas de ocupação.`,
      );
    }
    alertIds.add(row.id);

    const returnedScenarioId = requireId(
      row.scenario_id,
      `scenario_id do alerta de ocupação na posição ${index}`,
    );
    if (returnedScenarioId !== scenarioId) {
      throw new Error(
        `A API retornou um alerta do cenário "${returnedScenarioId}" ao consultar "${scenarioId}".`,
      );
    }
    if (row.threshold_kind !== "min" && row.threshold_kind !== "max") {
      throw new Error(
        `A API retornou threshold_kind inválido no alerta de ocupação na posição ${index}.`,
      );
    }
    const thresholdValue = requireNonNegativeNumber(
      row.threshold_value,
      `threshold_value do alerta de ocupação na posição ${index}`,
    );
    const totalValue = requireNonNegativeNumber(
      row.total_value,
      `total_value do alerta de ocupação na posição ${index}`,
    );
    if (
      (row.threshold_kind === "min" && totalValue > thresholdValue) ||
      (row.threshold_kind === "max" && totalValue < thresholdValue)
    ) {
      throw new Error(
        `A API retornou valores incoerentes no alerta de ocupação na posição ${index}.`,
      );
    }
    requireTimestamp(
      row.triggered_at,
      `triggered_at do alerta de ocupação na posição ${index}`,
    );
    const returnedObjectClass = requireText(
      row.object_class,
      `object_class do alerta de ocupação na posição ${index}`,
    );
    if (returnedObjectClass !== objectClass) {
      throw new Error(
        `A API retornou um alerta da classe "${returnedObjectClass}" ao consultar "${objectClass}".`,
      );
    }

    return {
      ...row,
      id: row.id,
      object_class: returnedObjectClass,
      scenario_id: returnedScenarioId,
      threshold_kind: row.threshold_kind,
      threshold_value: thresholdValue,
      total_value: totalValue,
      triggered_at: row.triggered_at as string,
    } as OccupancyAlertRow;
  });
}

export function requireOccupancyHistoryResponse(
  value: unknown,
  expectedScenarioId: string,
  scope: OccupancyHistoryValidationScope,
): OccupancyScenarioHistoryResponse {
  const response = requireRecord(value, "snapshot do cenário de ocupação");
  const requestedAt = requireDate(
    scope.requestedAt,
    "instante solicitado do snapshot do cenário de ocupação",
  );
  const scenarioId = requireId(
    response.scenario_id,
    "scenario_id do snapshot do cenário de ocupação",
  );
  if (scenarioId !== expectedScenarioId) {
    throw new Error(
      `A API retornou o snapshot do cenário "${scenarioId}" ao consultar "${expectedScenarioId}".`,
    );
  }
  const total = requireNonNegativeNumber(
    response.total,
    "total do snapshot do cenário de ocupação",
  );
  const asOf = requireTimestamp(
    response.as_of,
    "as_of do snapshot do cenário de ocupação",
  );
  if (asOf > requestedAt) {
    throw new Error(
      "A API retornou as_of posterior ao instante solicitado no snapshot do cenário de ocupação.",
    );
  }

  let areas:
    | OccupancyScenarioHistoryResponse["areas"]
    | undefined;
  if (response.areas !== undefined || scope.expectedAreas !== undefined) {
    if (!Array.isArray(response.areas)) {
      throw new Error(
        "A API retornou areas inválido no snapshot do cenário de ocupação.",
      );
    }
    const identities = new Set<string>();
    areas = Array.from(response.areas, (candidate, index) => {
      const area = requireRecord(
        candidate,
        `área na posição ${index} do snapshot de ocupação`,
      );
      const cameraId = requireId(
        area.camera_id,
        `camera_id da área na posição ${index} do snapshot de ocupação`,
      );
      const areaId = requireId(
        area.area_id,
        `area_id da área na posição ${index} do snapshot de ocupação`,
      );
      const identity = JSON.stringify([cameraId, areaId]);
      if (identities.has(identity)) {
        throw new Error(
          `A API retornou a área duplicada "${areaId}" da câmera "${cameraId}" no snapshot de ocupação.`,
        );
      }
      identities.add(identity);
      const areaValue = requireNonNegativeNumber(
        area.value,
        `value da área na posição ${index} do snapshot de ocupação`,
      );
      const snapshotAt = requireTimestamp(
        area.snapshot_at,
        `snapshot_at da área na posição ${index} do snapshot de ocupação`,
      );
      if (snapshotAt > asOf || snapshotAt > requestedAt) {
        throw new Error(
          `A API retornou snapshot_at posterior ao snapshot certificado na área da posição ${index}.`,
        );
      }
      return {
        ...area,
        area_id: areaId,
        camera_id: cameraId,
        value: areaValue,
      };
    });

    if (scope.expectedAreas) {
      const expectedIdentities = requireAreaIdentities(
        scope.expectedAreas,
        "áreas esperadas do snapshot do cenário de ocupação",
      );
      const missingIdentities = Array.from(expectedIdentities).filter(
        (identity) => !identities.has(identity),
      );
      const extraIdentities = Array.from(identities).filter(
        (identity) => !expectedIdentities.has(identity),
      );
      if (missingIdentities.length || extraIdentities.length) {
        throw new Error(
          "A cobertura de áreas do snapshot do cenário de ocupação é inválida.",
        );
      }
    }

    const areaTotal = areas.reduce((sum, area) => sum + area.value, 0);
    if (
      !Number.isFinite(areaTotal) ||
      !numbersNearlyEqual(areaTotal, total)
    ) {
      throw new Error(
        `O total do snapshot de ocupação (${total}) diverge da soma das áreas (${areaTotal}).`,
      );
    }
  }

  return {
    ...response,
    as_of: response.as_of as string,
    scenario_id: scenarioId,
    total,
    areas,
  } as OccupancyScenarioHistoryResponse;
}

function requireSingleArrayEnvelope(
  value: unknown,
  keys: readonly string[],
  label: string,
) {
  if (Array.isArray(value)) return value;
  const record = requireRecord(value, `lista de ${label}`);
  const presentKeys = keys.filter((key) => record[key] !== undefined);
  if (presentKeys.length !== 1 || !Array.isArray(record[presentKeys[0]])) {
    throw new Error(
      `A API retornou um envelope ambíguo ou inválido para ${label}.`,
    );
  }
  return record[presentKeys[0]] as unknown[];
}

function requireRecord(value: unknown, context: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value as UnknownRecord;
}

function requireId(value: unknown, context: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim()
  ) {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireOptionalId(value: unknown, context: string) {
  if (value === undefined) return undefined;
  return requireId(value, context);
}

function requireText(value: unknown, context: string) {
  return requireId(value, context);
}

function requireOptionalText(value: unknown, context: string) {
  if (value === undefined) return;
  requireText(value, context);
}

function requireBoolean(value: unknown, context: string) {
  if (typeof value !== "boolean") {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, context: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireOptionalNonNegativeNumber(
  value: unknown,
  context: string,
) {
  if (value === undefined || value === null) return value;
  return requireNonNegativeNumber(value, context);
}

function requireTimestamp(value: unknown, context: string) {
  const timestamp = requireText(value, context);
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return parsed;
}

function requireDate(value: unknown, context: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`A API recebeu ${context} inválido.`);
  }
  return value.getTime();
}

function numbersNearlyEqual(left: number, right: number) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 8;
}

function requireUniqueIds(values: readonly string[], context: string) {
  if (!Array.isArray(values)) {
    throw new Error(`A API recebeu ${context} inválidas.`);
  }
  const ids = new Set<string>();
  values.forEach((value, index) => {
    const id = requireId(value, `${context}, posição ${index}`);
    if (ids.has(id)) {
      throw new Error(`A API recebeu o id duplicado "${id}" em ${context}.`);
    }
    ids.add(id);
  });
  return ids;
}

function requireAreaIdentities(
  values: ReadonlyArray<{ area_id: string; camera_id: string }>,
  context: string,
) {
  if (!Array.isArray(values)) {
    throw new Error(`A API recebeu ${context} inválidas.`);
  }
  const identities = new Set<string>();
  values.forEach((value, index) => {
    const row = requireRecord(value, `${context}, posição ${index}`);
    const cameraId = requireId(
      row.camera_id,
      `camera_id em ${context}, posição ${index}`,
    );
    const areaId = requireId(
      row.area_id,
      `area_id em ${context}, posição ${index}`,
    );
    const identity = JSON.stringify([cameraId, areaId]);
    if (identities.has(identity)) {
      throw new Error(`A API recebeu uma identidade duplicada em ${context}.`);
    }
    identities.add(identity);
  });
  return identities;
}
