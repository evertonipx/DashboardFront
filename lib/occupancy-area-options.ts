"use client";

import { apiFetch } from "@/lib/api";
import { filterScopedApiRows } from "@/lib/master-company-scope";
import { requireCameraRows } from "@/lib/metadata-validation";
import {
  buildOccupancyAreaOptions,
  type OccupancyAreaOption,
} from "@/lib/occupancy-areas";
import { requireOccupancySnapshotRows } from "@/lib/occupancy-validation";
import { createTenantCompanyIdResolver } from "@/lib/tenant-scope-validation";
import type {
  Camera,
  CameraArea,
  CameraLineCount,
  OccupancyRow,
} from "@/lib/types";

type FetchOccupancyAreaOptionsInput = {
  companyId: string;
  from: Date;
  request?: OccupancyAreaRequest;
  to: Date;
};

type OccupancyAreaRequest = <T>(path: string) => Promise<T>;

export type OccupancyAreaCatalogResult = {
  authoritative: boolean;
  options: OccupancyAreaOption[];
};

type UnknownRecord = Record<string, unknown>;

const OCCUPANCY_DISCOVERY_COLLECTION_KEYS = [
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

const OCCUPANCY_AREA_CATALOG_COLLECTION_KEYS = [
  "data",
  "areas",
  "occupancy_areas",
] as const;

const RFC3339_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export async function fetchOccupancyAreaOptions({
  companyId,
  from,
  request = apiFetch,
  to,
}: FetchOccupancyAreaOptionsInput): Promise<OccupancyAreaOption[]> {
  const expectedCompanyId = requireId(
    companyId,
    "empresa ativa para descobrir áreas de ocupação",
  );
  requireValidRange(from, to);

  const cameraPayload = await request<unknown>("/cameras");
  const cameras = filterScopedApiRows(
    requireCameraRows(cameraPayload, expectedCompanyId),
    expectedCompanyId,
  );

  return fetchFallbackOccupancyAreaOptions({
    cameras,
    companyId: expectedCompanyId,
    from,
    request,
    to,
  });
}

export function requireOccupancyAreaClassCompatibility({
  authoritative,
  areas,
  objectClass,
  options,
}: {
  authoritative: boolean;
  areas: Array<{ area_id: string; camera_id: string }>;
  objectClass: string;
  options: readonly OccupancyAreaOption[];
}) {
  const expectedClass = objectClass.trim();

  areas.forEach((area) => {
    const candidates = options.filter(
      (option) =>
        option.area_id === area.area_id &&
        option.camera_id === area.camera_id,
    );
    if (!candidates.length && authoritative) {
      throw new Error(
        `A área "${area.area_id}" da câmera "${area.camera_id}" não consta no catálogo ativo de ocupação.`,
      );
    }
    if (
      candidates.length &&
      candidates.every(
        (option) =>
          option.object_class !== undefined &&
          option.object_class !== expectedClass,
      )
    ) {
      throw new Error(
        `A área "${area.area_id}" da câmera "${area.camera_id}" não mede a classe "${expectedClass}".`,
      );
    }
  });
}

export async function fetchOccupancyAreaCatalog({
  companyId,
  from,
  request = apiFetch,
  to,
}: FetchOccupancyAreaOptionsInput): Promise<OccupancyAreaCatalogResult> {
  const expectedCompanyId = requireId(
    companyId,
    "empresa ativa para descobrir áreas de ocupação",
  );
  requireValidRange(from, to);

  const [cameraPayload, areaCatalogPayload] = await Promise.all([
    request<unknown>("/cameras"),
    fetchOptionalOccupancyAreaCatalog(request),
  ]);
  const cameras = filterScopedApiRows(
    requireCameraRows(cameraPayload, expectedCompanyId),
    expectedCompanyId,
  );
  if (areaCatalogPayload !== null) {
    return {
      authoritative: true,
      options: buildOccupancyAreaOptions(
        requireOccupancyAreaCatalogRows(
          areaCatalogPayload,
          expectedCompanyId,
          cameras,
        ),
      ),
    };
  }

  // Compatibilidade temporária: snapshots e metadados legados podem omitir
  // regiões estáveis. O catálogo autorizado acima é a única fonte completa.
  return {
    authoritative: false,
    options: await fetchFallbackOccupancyAreaOptions({
      cameras,
      companyId: expectedCompanyId,
      from,
      request,
      to,
    }),
  };
}

async function fetchFallbackOccupancyAreaOptions({
  cameras,
  companyId,
  from,
  request,
  to,
}: {
  cameras: Camera[];
  companyId: string;
  from: Date;
  request: OccupancyAreaRequest;
  to: Date;
}) {
  const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
  const cameraIds = new Set(cameras.map((camera) => camera.id));
  const [snapshotPayload, cameraLineRows] = await Promise.all([
    request<unknown>(occupancyDiscoveryPath(from, to)),
    fetchCameraAreaLineRows(cameras, companyId, request),
  ]);
  const snapshotCameraIds = requireSnapshotCameraIds(
    snapshotPayload,
    cameraIds,
  );
  const snapshotRows = requireOccupancySnapshotRows(snapshotPayload, {
    expectedCameraIds: snapshotCameraIds,
    from,
    to,
  }).map((row) => ({
    ...row,
    camera_name: camerasById.get(row.camera_id)!.name,
  }));
  const embeddedCameraRows = cameras.flatMap((camera) =>
    requireEmbeddedCameraLineRows(camera, companyId).flatMap((line) =>
      cameraLineCountToAreaRows(camera, line),
    ),
  );
  const embeddedCameraAreaRows = cameras.flatMap((camera) =>
    embeddedAreaRows(camera, camera.id, companyId),
  );

  return buildOccupancyAreaOptions([
    ...snapshotRows,
    ...embeddedCameraRows,
    ...embeddedCameraAreaRows,
    ...cameraLineRows,
  ]);
}

async function fetchOptionalOccupancyAreaCatalog(
  request: OccupancyAreaRequest,
) {
  try {
    return await request<unknown>("/occupancy/areas");
  } catch (error) {
    if (isMissingApiRoute(error)) return null;
    throw error;
  }
}

function requireOccupancyAreaCatalogRows(
  value: unknown,
  companyId: string,
  cameras: Camera[],
): OccupancyRow[] {
  const resolveCompanyId = createTenantCompanyIdResolver(companyId);
  const response = requireRecord(value, "catálogo de áreas de ocupação");
  const complete = requireBoolean(
    response.complete,
    "complete do catálogo de áreas de ocupação",
  );
  if (!complete) {
    throw new Error(
      "A API ainda não concluiu o catálogo de áreas de ocupação.",
    );
  }
  const rows = requireSingleArrayEnvelope(
    response,
    OCCUPANCY_AREA_CATALOG_COLLECTION_KEYS,
    "catálogo de áreas de ocupação",
  );
  const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
  const identities = new Set<string>();

  return rows.flatMap((candidate, index) => {
    const context = `área na posição ${index} do catálogo de ocupação`;
    const row = requireRecord(candidate, context);
    resolveCompanyId(row.company_id, `company_id da ${context}`);

    const cameraId = requireId(row.camera_id, `camera_id da ${context}`);
    const camera = camerasById.get(cameraId);
    if (!camera) {
      throw new Error(
        `A ${context} referencia a câmera desconhecida "${cameraId}".`,
      );
    }
    const areaId = requireId(row.area_id, `area_id da ${context}`);
    const objectClass = requireId(
      row.object_class,
      `object_class da ${context}`,
    );
    if (objectClass !== objectClass.toLowerCase()) {
      throw new Error(
        `A ${context} possui object_class não normalizado em lowercase.`,
      );
    }
    const identity = JSON.stringify([cameraId, areaId]);
    if (identities.has(identity)) {
      throw new Error(
        `O catálogo retornou a área duplicada "${areaId}" da câmera "${cameraId}".`,
      );
    }
    identities.add(identity);

    const active = requireBoolean(row.active, `active da ${context}`);
    const label = requireId(
      row.area_name ?? row.area_label ?? row.label ?? row.name,
      `nome da ${context}`,
    );
    const sourceKind = requireId(
      row.source_kind,
      `source_kind da ${context}`,
    );
    if (sourceKind !== "region") {
      throw new Error(
        `A ${context} possui source_kind "${sourceKind}", não "region".`,
      );
    }
    requireOptionalTimestamp(row.last_seen, `last_seen da ${context}`);
    requireOptionalTimestamp(row.last_seen_at, `last_seen_at da ${context}`);
    const hasBaseline =
      (row.last_seen !== null && row.last_seen !== undefined) ||
      (row.last_seen_at !== null && row.last_seen_at !== undefined);

    if (!active || camera.active === false || !hasBaseline) return [];
    return [
      {
        area: areaId,
        area_label: label,
        camera_id: cameraId,
        camera_name: camera.name,
        object_class: objectClass,
      },
    ];
  });
}

function requireOptionalTimestamp(value: unknown, context: string) {
  if (value === undefined || value === null) return;
  const timestamp = requireId(value, context);
  if (
    !RFC3339_TIMESTAMP_PATTERN.test(timestamp) ||
    Number.isNaN(Date.parse(timestamp))
  ) {
    throw new Error(`A API retornou ${context} inválido.`);
  }
}

function occupancyDiscoveryPath(from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });

  return `/occupancy?${params.toString()}`;
}

async function fetchCameraAreaLineRows(
  cameras: Camera[],
  companyId: string,
  request: OccupancyAreaRequest,
) {
  const rows = await Promise.all(
    cameras.map(async (camera) => {
      let payload: unknown;
      try {
        payload = await request<unknown>(
          `/cameras/${camera.id}/line-counts`,
        );
      } catch (error) {
        if (isMissingApiRoute(error)) return [];
        throw error;
      }
      return requireCameraLineCountRows(
        payload,
        camera,
        companyId,
        `linhas da câmera "${camera.id}"`,
      ).flatMap((line) => cameraLineCountToAreaRows(camera, line));
    }),
  );

  return rows.flat();
}

function isMissingApiRoute(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  return status === 404 || status === 405;
}

function cameraLineCountToAreaRows(
  camera: Camera,
  line: CameraLineCount,
): OccupancyRow[] {
  if (!line.active || !isOccupancyAreaLineCount(line)) return [];
  const areaCode = areaCodeFromLineCount(line);

  return [
    {
      area: areaCode,
      area_label: displayNameFromLineCount(line) || areaCode,
      camera_id: cameraIdFromLineCount(line) || camera.id,
      camera_name: cameraNameFromLineCount(line) || camera.name,
      object_class: objectClassFromLineCount(line),
    },
  ];
}

export function isOccupancyAreaLineCount(
  line: CameraLineCount,
) {
  const record = line as Record<string, unknown>;
  const code = areaCodeFromLineCount(line).toLowerCase();
  const values = [
    metricFromLineCount(line),
    line.type,
    line.kind,
    line.target_type,
    line.object_type,
    stringValue(record.category),
    stringValue(record.categoria),
    stringValue(record.tipo),
    stringValue(record.metric),
    stringValue(record.metrica),
    stringValue(record.metricType),
    stringValue(record.item_type),
    stringValue(record.itemType),
    stringValue(record.line_type),
    stringValue(record.lineType),
    stringValue(record.resource_type),
    stringValue(record.resourceType),
    stringValue(record.event_type),
    stringValue(record.eventType),
    stringValue(record.measurement_type),
    stringValue(record.measurementType),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return (
    isRegionCode(code) ||
    values.some((value) =>
      ["area", "region", "quantity", "occupancy", "ocupacao", "ocupação"].includes(
        value,
      ),
    )
  );
}

function isRegionCode(code: string) {
  const normalized = code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|_:/.\\\s]+/g, "-");

  return (
    normalized.endsWith("-region") ||
    normalized.includes("-region-") ||
    normalized.includes("-ocupacao") ||
    normalized.includes("-occupancy") ||
    normalized.includes("-area")
  );
}

function areaCodeFromLineCount(line: CameraLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(line.line_code) ||
    stringValue(record.lineCode) ||
    stringValue(record.code) ||
    stringValue(record.codigo) ||
    stringValue(record.key) ||
    stringValue(record.external_id) ||
    stringValue(record.externalId) ||
    stringValue(record.external_code) ||
    stringValue(record.externalCode) ||
    line.id
  ).trim();
}

function displayNameFromLineCount(line: CameraLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(line.name) ||
    stringValue(record.nome) ||
    stringValue(record.label) ||
    stringValue(record.area_name) ||
    stringValue(record.areaName)
  );
}

function metricFromLineCount(line: CameraLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(line.metric_type) ||
    stringValue(record.metricType) ||
    stringValue(record.metric) ||
    stringValue(record.metrica)
  );
}

function objectClassFromLineCount(line: CameraLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(record.object_class) ||
    stringValue(record.objectClass) ||
    stringValue(line.object_type) ||
    stringValue(record.objectType) ||
    stringValue(record.target_class) ||
    stringValue(record.targetClass)
  );
}

function cameraIdFromLineCount(line: CameraLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(record.camera_id) ||
    stringValue(record.cameraId) ||
    stringValue(record.camera)
  );
}

function cameraNameFromLineCount(line: CameraLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(record.camera_name) ||
    stringValue(record.cameraName) ||
    stringValue(record.camera_label) ||
    stringValue(record.cameraLabel)
  );
}

const LINE_OPTIONAL_TEXT_KEYS = [
  "metric_type",
  "metricType",
  "metric",
  "metrica",
  "type",
  "kind",
  "target_type",
  "object_type",
  "category",
  "categoria",
  "tipo",
  "item_type",
  "itemType",
  "line_type",
  "lineType",
  "resource_type",
  "resourceType",
  "event_type",
  "eventType",
  "measurement_type",
  "measurementType",
  "lineCode",
  "code",
  "codigo",
  "key",
  "external_id",
  "externalId",
  "external_code",
  "externalCode",
  "nome",
  "label",
  "area_name",
  "areaName",
  "camera_id",
  "cameraId",
  "camera",
  "camera_name",
  "cameraName",
  "camera_label",
  "cameraLabel",
] as const;

function requireValidRange(from: Date, to: Date) {
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    throw new Error(
      "O intervalo para descobrir áreas de ocupação é inválido.",
    );
  }
}

function requireSnapshotCameraIds(
  value: unknown,
  knownCameraIds: ReadonlySet<string>,
) {
  const rows = requireSingleArrayEnvelope(
    value,
    OCCUPANCY_DISCOVERY_COLLECTION_KEYS,
    "snapshots usados para descobrir áreas de ocupação",
  );
  const cameraIds = new Set<string>();

  rows.forEach((candidate, index) => {
    const row = requireRecord(
      candidate,
      `snapshot usado para descobrir áreas de ocupação na posição ${index}`,
    );
    const cameraId = requireId(
      row.camera_id,
      `camera_id do snapshot usado para descobrir áreas de ocupação na posição ${index}`,
    );
    if (!knownCameraIds.has(cameraId)) {
      throw new Error(
        `O snapshot de ocupação referencia a câmera desconhecida "${cameraId}".`,
      );
    }
    cameraIds.add(cameraId);
  });

  return Array.from(cameraIds);
}

function requireEmbeddedCameraLineRows(
  camera: Camera,
  companyId: string,
) {
  if (camera.line_counts === undefined) return [];
  return requireCameraLineCountRows(
    camera.line_counts,
    camera,
    companyId,
    `linhas embutidas da câmera "${camera.id}"`,
  );
}

function requireCameraLineCountRows(
  value: unknown,
  camera: Camera,
  companyId: string,
  context: string,
): CameraLineCount[] {
  const rows = requireArray(value, context);
  const resolveCompanyId = createTenantCompanyIdResolver(companyId);
  const ids = new Set<string>();

  return rows.map((candidate, index) => {
    const row = requireRecord(candidate, `${context}, posição ${index}`);
    const id = requireId(row.id, `id de ${context}, posição ${index}`);
    if (ids.has(id)) {
      throw new Error(`A API retornou a linha duplicada "${id}" em ${context}.`);
    }
    ids.add(id);

    const cameraId = requireId(
      row.camera_id,
      `camera_id de ${context}, posição ${index}`,
    );
    if (cameraId !== camera.id) {
      throw new Error(
        `A linha "${id}" referencia a câmera "${cameraId}", mas foi consultada em "${camera.id}".`,
      );
    }
    const rowCompanyId = resolveCompanyId(
      row.company_id,
      `company_id de ${context}, posição ${index}`,
    );
    if (rowCompanyId !== companyId || camera.company_id !== companyId) {
      throw new Error(
        `A linha "${id}" não pertence à empresa ativa "${companyId}".`,
      );
    }

    const name = requireId(row.name, `nome de ${context}, posição ${index}`);
    const lineCode = requireId(
      row.line_code,
      `line_code de ${context}, posição ${index}`,
    );
    const active = requireBoolean(
      row.active,
      `active de ${context}, posição ${index}`,
    );
    requireOptionalTextFields(row, LINE_OPTIONAL_TEXT_KEYS, context, index, [
      "camera_id",
    ]);
    requireMatchingCameraReferences(row, camera.id, context);
    requireOptionalObjectFields(row, context, index);

    return {
      ...row,
      id,
      camera_id: cameraId,
      company_id: rowCompanyId,
      name,
      line_code: lineCode,
      active,
    } as CameraLineCount;
  });
}

function embeddedAreaRows(
  source: Camera,
  cameraId: string,
  companyId: string,
): OccupancyRow[] {
  const areas = requireAreaCollections(
    source as UnknownRecord,
    cameraId,
    companyId,
  );
  const unique = new Map<string, OccupancyRow>();

  areas.forEach((area) => {
    if (area.active === false) return;
    const areaId = requireAreaId(area, cameraId);
    if (unique.has(areaId)) return;
    const label =
      area.area_label ??
      area.area_name ??
      area.label ??
      area.name ??
      area.code ??
      areaId;
    unique.set(areaId, {
      area: areaId,
      area_label: label,
      camera_id: cameraId,
      camera_name: source.name,
    });
  });

  return Array.from(unique.values());
}

function requireAreaCollections(
  source: UnknownRecord,
  cameraId: string,
  companyId: string,
) {
  const result: CameraArea[] = [];
  (["areas", "occupancy_areas"] as const).forEach((key) => {
    const value = source[key];
    if (value === undefined) return;
    const rows = requireArray(
      value,
      `${key} da câmera "${cameraId}"`,
    );
    rows.forEach((candidate, index) => {
      const area = requireRecord(
        candidate,
        `${key} da câmera "${cameraId}", posição ${index}`,
      );
      const declaredCameraId = requireOptionalId(
        area.camera_id,
        `camera_id de ${key} da câmera "${cameraId}", posição ${index}`,
      );
      if (declaredCameraId && declaredCameraId !== cameraId) {
        throw new Error(
          `A área na posição ${index} de ${key} referencia a câmera "${declaredCameraId}", não "${cameraId}".`,
        );
      }
      const declaredCompanyId = requireOptionalId(
        area.company_id,
        `company_id de ${key} da câmera "${cameraId}", posição ${index}`,
      );
      if (declaredCompanyId && declaredCompanyId !== companyId) {
        throw new Error(
          `A área na posição ${index} de ${key} não pertence à empresa ativa "${companyId}".`,
        );
      }
      requireAreaId(area, cameraId);
      ([
        "area_name",
        "area_label",
        "name",
        "label",
        "code",
      ] as const).forEach((field) => {
        requireOptionalId(
          area[field],
          `${field} de ${key} da câmera "${cameraId}", posição ${index}`,
        );
      });
      requireOptionalBoolean(
        area.active,
        `active de ${key} da câmera "${cameraId}", posição ${index}`,
      );
      if (
        area.config !== undefined &&
        (!Array.isArray(area.config) ||
          area.config.some(
            (item) => typeof item !== "number" || !Number.isFinite(item),
          ))
      ) {
        throw new Error(
          `A API retornou config inválido em ${key} da câmera "${cameraId}", posição ${index}.`,
        );
      }
      result.push(area as CameraArea);
    });
  });
  return result;
}

function requireAreaId(area: UnknownRecord, cameraId: string) {
  const value = area.area_id ?? area.id ?? area.code;
  return requireId(value, `id de área da câmera "${cameraId}"`);
}

function requireOptionalTextFields(
  record: UnknownRecord,
  keys: readonly string[],
  context: string,
  index: number,
  excluded: readonly string[] = [],
) {
  keys.forEach((key) => {
    if (excluded.includes(key) || record[key] === undefined) return;
    requireId(record[key], `${key} de ${context}, posição ${index}`);
  });
}

function requireOptionalObjectFields(
  record: UnknownRecord,
  context: string,
  index: number,
) {
  (["data", "metadata", "payload"] as const).forEach((key) => {
    const value = record[key];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "object" || Array.isArray(value))
    ) {
      throw new Error(
        `A API retornou ${key} inválido em ${context}, posição ${index}.`,
      );
    }
  });
}

function requireMatchingCameraReferences(
  record: UnknownRecord,
  cameraId: string,
  context: string,
) {
  (["camera_id", "cameraId", "camera"] as const).forEach((key) => {
    const value = requireOptionalId(record[key], `${key} de ${context}`);
    if (value && value !== cameraId) {
      throw new Error(
        `${context} referencia a câmera "${value}" em ${key}, não "${cameraId}".`,
      );
    }
  });
}

function requireSingleArrayEnvelope(
  value: unknown,
  keys: readonly string[],
  context: string,
) {
  if (Array.isArray(value)) return value;
  const record = requireRecord(value, `lista de ${context}`);
  const presentKeys = keys.filter((key) => record[key] !== undefined);
  if (
    presentKeys.length !== 1 ||
    !Array.isArray(record[presentKeys[0]])
  ) {
    throw new Error(
      `A API retornou um envelope ambíguo ou inválido para ${context}.`,
    );
  }
  return record[presentKeys[0]] as unknown[];
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`A API retornou ${context} inválido ou ausente.`);
  }
  return value;
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
  if (value === undefined || value === null) return undefined;
  return requireId(value, context);
}

function requireBoolean(value: unknown, context: string) {
  if (typeof value !== "boolean") {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireOptionalBoolean(value: unknown, context: string) {
  if (value === undefined || value === null) return undefined;
  return requireBoolean(value, context);
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  return undefined;
}
