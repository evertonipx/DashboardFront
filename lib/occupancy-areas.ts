import type {
  OccupancyRow,
  OccupancySnapshot,
} from "@/lib/types";

export type OccupancyAreaOption = {
  key: string;
  area_id: string;
  camera_id: string;
  label: string;
  detail?: string;
};

type UnknownRecord = Record<string, unknown>;

const AREA_ID_KEYS = [
  "area",
  "area_id",
  "areaId",
  "areaID",
  "area_key",
  "areaKey",
  "zone",
  "zone_id",
  "zoneId",
  "region",
  "region_id",
  "regionId",
  "workspace",
  "workspace_id",
  "workspaceId",
  "workstation",
  "workstation_id",
  "workstationId",
  "workplace",
  "workplace_id",
  "workplaceId",
  "station",
  "station_id",
  "stationId",
  "posto",
  "posto_id",
  "postoId",
  "desk",
  "desk_id",
  "deskId",
  "seat",
  "seat_id",
  "seatId",
  "location_id",
  "locationId",
] as const;

const AREA_LABEL_KEYS = [
  "area_name",
  "areaName",
  "area_label",
  "areaLabel",
  "zone_name",
  "zoneName",
  "zone_label",
  "zoneLabel",
  "region_name",
  "regionName",
  "region_label",
  "regionLabel",
  "workspace_name",
  "workspaceName",
  "workstation_name",
  "workstationName",
  "workstation_label",
  "workstationLabel",
  "workplace_name",
  "workplaceName",
  "station_name",
  "stationName",
  "posto_nome",
  "postoName",
  "posto_label",
  "postoLabel",
  "desk_name",
  "deskName",
  "seat_name",
  "seatName",
  "location_name",
  "locationName",
  "label",
  "name",
  "display_name",
  "displayName",
] as const;

const CAMERA_ID_KEYS = [
  "camera_id",
  "cameraId",
  "cameraID",
  "camera",
  "camera_key",
  "cameraKey",
  "source_camera_id",
  "sourceCameraId",
  "device_id",
  "deviceId",
] as const;

const CAMERA_LABEL_KEYS = [
  "camera_name",
  "cameraName",
  "camera_label",
  "cameraLabel",
  "device_name",
  "deviceName",
  "source_camera_name",
  "sourceCameraName",
] as const;

const AREA_COLLECTION_KEYS = [
  "areas",
  "occupancy_areas",
  "occupancyAreas",
  "camera_areas",
  "cameraAreas",
  "zones",
  "regions",
  "workspaces",
  "workstations",
  "workplaces",
  "stations",
  "postos",
  "desks",
  "seats",
] as const;

export function normalizeOccupancyRows(response: unknown): OccupancyRow[] {
  return occupancyResponseRows(response).flatMap(normalizeOccupancyRowVariants);
}

export function normalizeOccupancyRow(
  row: OccupancyRow | OccupancySnapshot | UnknownRecord,
): OccupancyRow {
  const root = asRecord(row);
  const records = collectRecords(row);
  const cameraScopedArea = root ? hasEmbeddedAreaDefinition(root) : false;
  const area =
    firstString(records, AREA_ID_KEYS) ??
    nestedEntityString(records, AREA_ENTITY_KEYS, ENTITY_ID_KEYS);
  const areaLabel =
    firstString(records, AREA_LABEL_KEYS) ??
    nestedEntityString(records, AREA_ENTITY_KEYS, ENTITY_LABEL_KEYS);
  const cameraId =
    firstString(records, CAMERA_ID_KEYS) ??
    nestedEntityString(records, CAMERA_ENTITY_KEYS, ENTITY_ID_KEYS) ??
    (cameraScopedArea ? stringFromUnknown(root?.id) : undefined);
  const cameraName =
    firstString(records, CAMERA_LABEL_KEYS) ??
    nestedEntityString(records, CAMERA_ENTITY_KEYS, ENTITY_LABEL_KEYS) ??
    (cameraScopedArea ? stringFromUnknown(root?.name) : undefined);
  const count = readNumber(records, ["people_count", "peopleCount", "count", "value"]);
  const currentAt = firstString(records, [
    "current_at",
    "currentAt",
    "captured_at",
    "capturedAt",
    "received_at",
    "receivedAt",
    "timestamp",
    "created_at",
    "createdAt",
  ]);

  const hasAggregatedMetrics =
    readNumber(records, ["current_value", "currentValue"]) !== undefined ||
    readNumber(records, ["avg", "average"]) !== undefined ||
    readNumber(records, ["peak", "max"]) !== undefined ||
    readNumber(records, ["min", "minimum"]) !== undefined;

  if (hasAggregatedMetrics) {
    return {
      ...(row as OccupancyRow),
      area: area ?? (row as OccupancyRow).area,
      area_label: areaLabel ?? (row as OccupancyRow).area_label,
      avg: readNumber(records, ["avg", "average"]) ?? (row as OccupancyRow).avg,
      camera_id: cameraId ?? (row as OccupancyRow).camera_id,
      camera_name: cameraName ?? (row as OccupancyRow).camera_name,
      current_at: currentAt ?? (row as OccupancyRow).current_at,
      current_value:
        readNumber(records, ["current_value", "currentValue"]) ??
        (row as OccupancyRow).current_value,
      min: readNumber(records, ["min", "minimum"]) ?? (row as OccupancyRow).min,
      object_class:
        firstString(records, ["object_class", "objectClass", "class", "status"]) ??
        (row as OccupancyRow).object_class,
      peak: readNumber(records, ["peak", "max", "maximum"]) ?? (row as OccupancyRow).peak,
    };
  }

  return {
    area: area ?? areaLabel ?? cameraId,
    area_label: areaLabel,
    avg: count,
    camera_id: cameraId,
    camera_name: cameraName,
    current_at: currentAt,
    current_value: count,
    min: count,
    object_class: firstString(records, ["object_class", "objectClass", "class", "status"]),
    peak: count,
  };
}

function normalizeOccupancyRowVariants(
  row: OccupancyRow | OccupancySnapshot | UnknownRecord,
): OccupancyRow[] {
  const areaItems = areaCollectionItems(row);
  if (!areaItems.length) return [normalizeOccupancyRow(row)];

  return areaItems.map((item) => normalizeOccupancyRow(mergeAreaItem(row, item)));
}

export function buildOccupancyAreaOptions(
  rows: OccupancyRow[],
): OccupancyAreaOption[] {
  const options = new Map<string, OccupancyAreaOption>();

  rows.forEach((row) => {
    const areaId = row.area?.trim();
    const cameraId = row.camera_id?.trim();
    if (!areaId || !cameraId) return;

    const key = buildOccupancyAreaKey(cameraId, areaId);
    if (options.has(key)) return;

    const areaLabel = row.area_label?.trim();
    const cameraLabel = row.camera_name?.trim();
    const areaText = areaLabel || areaId;
    const cameraText = cameraLabel || compactOccupancyId(cameraId);
    const detail =
      areaText !== areaId || cameraLabel
        ? `${areaId} / ${compactOccupancyId(cameraId)}`
        : undefined;

    options.set(key, {
      area_id: areaId,
      camera_id: cameraId,
      detail,
      key,
      label: `${areaText} / ${cameraText}`,
    });
  });

  return Array.from(options.values()).sort((first, second) =>
    first.label.localeCompare(second.label, "pt-BR"),
  );
}

export function buildOccupancyAreaKey(cameraId: string, areaId: string) {
  return `${cameraId}::${areaId}`;
}

function occupancyResponseRows(
  response: unknown,
): Array<OccupancyRow | OccupancySnapshot | UnknownRecord> {
  if (Array.isArray(response)) return response;

  const record = asRecord(response);
  if (!record) return [];

  return [
    ...(arrayFromUnknown(record.data) ?? []),
    ...(arrayFromUnknown(record.snapshots) ?? []),
    ...(arrayFromUnknown(record.areas) ?? []),
    ...(arrayFromUnknown(record.occupancy_areas) ?? []),
    ...(arrayFromUnknown(record.occupancyAreas) ?? []),
    ...(arrayFromUnknown(record.cameras) ?? []),
    ...(arrayFromUnknown(record.rows) ?? []),
    ...(arrayFromUnknown(record.results) ?? []),
    ...(arrayFromUnknown(record.items) ?? []),
  ];
}

function areaCollectionItems(value: unknown) {
  const root = asRecord(value);
  if (!root) return [];

  const containers = [
    root,
    asRecord(root.data),
    asRecord(root.payload),
    asRecord(root.metadata),
    asRecord(root.meta),
    asRecord(root.attributes),
  ].filter(Boolean) as UnknownRecord[];

  return containers.flatMap((container) =>
    AREA_COLLECTION_KEYS.flatMap((key) =>
      (arrayFromUnknown(container[key]) ?? [])
        .map(asRecord)
        .filter(Boolean) as UnknownRecord[],
    ),
  );
}

function hasEmbeddedAreaDefinition(record: UnknownRecord) {
  const hasCollection = AREA_COLLECTION_KEYS.some(
    (key) => (arrayFromUnknown(record[key]) ?? []).length > 0,
  );
  if (hasCollection) return true;

  return AREA_ENTITY_KEYS.some((key) => Boolean(asRecord(record[key])));
}

function mergeAreaItem(
  row: OccupancyRow | OccupancySnapshot | UnknownRecord,
  item: UnknownRecord,
): UnknownRecord {
  const root = asRecord(row) ?? {};

  return {
    ...root,
    ...item,
    area:
      stringFromUnknown(item.area) ??
      stringFromUnknown(item.area_id) ??
      stringFromUnknown(item.areaId) ??
      stringFromUnknown(item.id) ??
      stringFromUnknown(item.key) ??
      stringFromUnknown(item.code) ??
      stringFromUnknown(root.area) ??
      item.area ??
      root.area,
    area_label:
      stringFromUnknown(item.area_label) ??
      stringFromUnknown(item.areaLabel) ??
      stringFromUnknown(item.area_name) ??
      stringFromUnknown(item.areaName) ??
      stringFromUnknown(item.label) ??
      stringFromUnknown(item.name),
    camera_id:
      stringFromUnknown(item.camera_id) ??
      stringFromUnknown(item.cameraId) ??
      stringFromUnknown(root.camera_id) ??
      stringFromUnknown(root.cameraId) ??
      stringFromUnknown(root.id),
    camera_name:
      stringFromUnknown(item.camera_name) ??
      stringFromUnknown(item.cameraName) ??
      stringFromUnknown(root.camera_name) ??
      stringFromUnknown(root.cameraName) ??
      stringFromUnknown(root.name),
    object_class:
      stringFromUnknown(item.object_class) ??
      stringFromUnknown(item.objectClass) ??
      stringFromUnknown(root.object_class) ??
      stringFromUnknown(root.objectClass),
  };
}

function collectRecords(value: unknown) {
  const root = asRecord(value);
  if (!root) return [];

  const records: UnknownRecord[] = [];
  const seen = new WeakSet<object>();

  function walk(candidate: UnknownRecord, depth: number) {
    if (seen.has(candidate)) return;
    seen.add(candidate);
    records.push(candidate);

    if (depth <= 0) return;

    Object.values(candidate).forEach((child) => {
      if (Array.isArray(child)) {
        child.forEach((item) => {
          const childRecord = asRecord(item);
          if (childRecord) walk(childRecord, depth - 1);
        });
        return;
      }

      const childRecord = asRecord(child);
      if (childRecord) walk(childRecord, depth - 1);
    });
  }

  walk(root, 2);
  return records;
}

function firstString(records: UnknownRecord[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = stringFromUnknown(record[key]);
      if (value) return value;
    }
  }

  return undefined;
}

const AREA_ENTITY_KEYS = [
  "area",
  "zone",
  "region",
  "workspace",
  "workstation",
  "workplace",
  "station",
  "posto",
  "desk",
  "seat",
  "location",
] as const;

const CAMERA_ENTITY_KEYS = ["camera", "device", "source_camera"] as const;
const ENTITY_ID_KEYS = ["id", "uuid", "key", "code"] as const;
const ENTITY_LABEL_KEYS = ["label", "name", "display_name", "displayName"] as const;

function nestedEntityString(
  records: UnknownRecord[],
  entityKeys: readonly string[],
  valueKeys: readonly string[],
) {
  for (const record of records) {
    for (const entityKey of entityKeys) {
      const entity = asRecord(record[entityKey]);
      if (!entity) continue;

      for (const valueKey of valueKeys) {
        const value = stringFromUnknown(entity[valueKey]);
        if (value) return value;
      }
    }
  }

  return undefined;
}

function readNumber(records: UnknownRecord[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = numberFromUnknown(record[key]);
      if (value !== undefined) return value;
    }
  }

  return undefined;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{")) return null;

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as UnknownRecord;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function arrayFromUnknown(value: unknown) {
  return Array.isArray(value)
    ? (value as Array<OccupancyRow | OccupancySnapshot | UnknownRecord>)
    : undefined;
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactOccupancyId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
