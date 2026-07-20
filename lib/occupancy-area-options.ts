"use client";

import { apiFetch } from "@/lib/api";
import {
  belongsToCompanyScope,
  filterScopedApiRows,
} from "@/lib/master-company-scope";
import {
  buildOccupancyAreaOptions,
  normalizeOccupancyRows,
  type OccupancyAreaOption,
} from "@/lib/occupancy-areas";
import type {
  Camera,
  CameraLineCount,
  OccupancyRow,
  OccupancySnapshotsResponse,
  WorkerConfigCamera,
  WorkerConfigLineCount,
  WorkerConfigResponse,
} from "@/lib/types";

type FetchOccupancyAreaOptionsInput = {
  from: Date;
  to: Date;
  companyId?: string | null;
};

export async function fetchOccupancyAreaOptions({
  companyId,
  from,
  to,
}: FetchOccupancyAreaOptionsInput): Promise<OccupancyAreaOption[]> {
  const responses = await Promise.allSettled([
    apiFetch<OccupancySnapshotsResponse>(occupancyDiscoveryPath(from, to)),
    apiFetch<unknown>("/cameras"),
    apiFetch<unknown>("/workers/config"),
  ]);
  const cameras = filterScopedApiRows(
    normalizeCameraList(settledValue(responses[1])),
    companyId,
  );
  const workerConfig = normalizeWorkerConfig(settledValue(responses[2]));
  const cameraLineRows = await fetchCameraAreaLineRows(cameras, companyId);
  const embeddedCameraRows = cameras.flatMap((camera) =>
    (camera.line_counts ?? []).flatMap((line) => cameraLineCountToAreaRows(camera, line)),
  );
  const workerLineRows =
    !workerConfig ||
    !belongsToCompanyScope(workerConfig, companyId, { allowUnscoped: true })
      ? []
      : workerConfig.cameras?.flatMap(workerCameraAreaRows) ?? [];

  const rows = responses.flatMap((response) =>
    response.status === "fulfilled"
      ? filterScopedApiRows(normalizeOccupancyRows(response.value), companyId)
      : [],
  );

  return buildOccupancyAreaOptions([
    ...rows,
    ...embeddedCameraRows,
    ...cameraLineRows,
    ...workerLineRows,
  ]);
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
  companyId?: string | null,
) {
  const responses = await Promise.allSettled(
    cameras.map(async (camera) => {
      const lines = await apiFetch<CameraLineCount[]>(
        `/cameras/${camera.id}/line-counts`,
      );

      return filterScopedApiRows(normalizeLineCountList(lines), companyId).flatMap(
        (line) => cameraLineCountToAreaRows(camera, line),
      );
    }),
  );

  return responses.flatMap((response) =>
    response.status === "fulfilled" ? response.value : [],
  );
}

function workerCameraAreaRows(camera: WorkerConfigCamera) {
  return (camera.line_counts ?? []).flatMap((line) =>
    workerLineCountToAreaRows(camera, line),
  );
}

function cameraLineCountToAreaRows(
  camera: Camera,
  line: CameraLineCount,
): OccupancyRow[] {
  if (!isOccupancyAreaLineCount(line)) return [];
  const areaCode = areaCodeFromLineCount(line);

  return [
    {
      area: areaCode,
      area_label: displayNameFromLineCount(line) || areaCode,
      camera_id: cameraIdFromLineCount(line) || camera.id,
      camera_name: cameraNameFromLineCount(line) || camera.name,
      object_class: metricFromLineCount(line),
    },
  ];
}

function workerLineCountToAreaRows(
  camera: WorkerConfigCamera,
  line: WorkerConfigLineCount,
): OccupancyRow[] {
  if (!isOccupancyAreaLineCount(line)) return [];
  const areaCode = areaCodeFromLineCount(line);

  return [
    {
      area: areaCode,
      area_label: displayNameFromLineCount(line) || areaCode,
      camera_id: cameraIdFromLineCount(line) || camera.camera_id || camera.id,
      camera_name: camera.name,
      object_class: metricFromLineCount(line),
    },
  ];
}

export function isOccupancyAreaLineCount(
  line: CameraLineCount | WorkerConfigLineCount,
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

function areaCodeFromLineCount(line: CameraLineCount | WorkerConfigLineCount) {
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

function displayNameFromLineCount(line: CameraLineCount | WorkerConfigLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(line.name) ||
    stringValue(record.nome) ||
    stringValue(record.label) ||
    stringValue(record.area_name) ||
    stringValue(record.areaName)
  );
}

function metricFromLineCount(line: CameraLineCount | WorkerConfigLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(line.metric_type) ||
    stringValue(record.metricType) ||
    stringValue(record.metric) ||
    stringValue(record.metrica)
  );
}

function cameraIdFromLineCount(line: CameraLineCount | WorkerConfigLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(record.camera_id) ||
    stringValue(record.cameraId) ||
    stringValue(record.camera)
  );
}

function cameraNameFromLineCount(line: CameraLineCount | WorkerConfigLineCount) {
  const record = line as Record<string, unknown>;

  return (
    stringValue(record.camera_name) ||
    stringValue(record.cameraName) ||
    stringValue(record.camera_label) ||
    stringValue(record.cameraLabel)
  );
}

function normalizeCameraList(value: unknown): Camera[] {
  if (Array.isArray(value)) return value as Camera[];

  const record = asRecord(value);
  return arrayValue<Camera>(record?.data) ?? arrayValue<Camera>(record?.cameras) ?? [];
}

function normalizeLineCountList(value: unknown): CameraLineCount[] {
  if (Array.isArray(value)) return value as CameraLineCount[];

  const record = asRecord(value);
  return (
    arrayValue<CameraLineCount>(record?.data) ??
    arrayValue<CameraLineCount>(record?.line_counts) ??
    arrayValue<CameraLineCount>(record?.lineCounts) ??
    arrayValue<CameraLineCount>(record?.items) ??
    []
  );
}

function normalizeWorkerConfig(value: unknown): WorkerConfigResponse | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const cameras = normalizeCameraList(value) as WorkerConfigCamera[];
  if (cameras.length) {
    return {
      ...(record as WorkerConfigResponse),
      cameras,
    };
  }

  return record as WorkerConfigResponse;
}

function settledValue(result: PromiseSettledResult<unknown>) {
  return result.status === "fulfilled" ? result.value : undefined;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return undefined;
}
