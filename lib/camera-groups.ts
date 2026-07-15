"use client";

import { getEffectiveCompanyScopeId } from "@/lib/master-company-scope";
import type {
  Camera,
  CurrentUser,
  Location,
  SubLocation,
  Worker,
} from "@/lib/types";
import { workerIdentityIds } from "@/lib/worker-scope";

export type CameraGroupScopeType = "location" | "sub_location" | "worker";

export type CameraWorkerAssignments = Record<string, string>;
export type WorkerLocationAssignments = Record<string, string>;

export type CameraGroup = {
  camera_ids: string[];
  company_scope_id: string;
  created_at: string;
  id: string;
  name: string;
  scope_id: string;
  scope_type: CameraGroupScopeType;
  updated_at: string;
};

export type CameraGroupOption = {
  cameraIds: string[];
  description: string;
  group?: CameraGroup;
  id: string;
  location?: Location;
  name: string;
  parentName: string;
  scopeType: CameraGroupScopeType;
  subLocation?: SubLocation;
};

export const CAMERA_GROUPS_UPDATED_EVENT = "ipxdata:camera-groups-updated";

const CAMERA_GROUP_STORAGE_KEY = "ipxdata.camera-groups.v1";
const CAMERA_WORKER_ASSIGNMENT_STORAGE_KEY =
  "ipxdata.camera-worker-assignments.v1";
const WORKER_LOCATION_ASSIGNMENT_STORAGE_KEY =
  "ipxdata.worker-location-assignments.v1";
const DEFAULT_COMPANY_SCOPE = "default";

type CameraGroupStore = Record<string, CameraGroup[]>;
type CameraWorkerAssignmentStore = Record<string, CameraWorkerAssignments>;
type WorkerLocationAssignmentStore = Record<string, WorkerLocationAssignments>;

export function resolveCameraGroupCompanyScope(user: CurrentUser | null) {
  return getEffectiveCompanyScopeId(user) || DEFAULT_COMPANY_SCOPE;
}

export function readCameraGroups(companyScopeId: string | null | undefined) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  return normalizeCameraGroups(readStore()[scopeId] ?? [], scopeId);
}

export function writeCameraGroups(
  companyScopeId: string | null | undefined,
  groups: CameraGroup[],
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  const store = readStore();
  store[scopeId] = normalizeCameraGroups(groups, scopeId);
  writeStore(store);
  dispatchCameraGroupsUpdated();
  return store[scopeId];
}

export function upsertCameraGroup(
  companyScopeId: string | null | undefined,
  group: Partial<CameraGroup> & {
    camera_ids: string[];
    name: string;
    scope_id: string;
    scope_type: CameraGroupScopeType;
  },
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  const now = new Date().toISOString();
  const groups = readCameraGroups(scopeId);
  const nextGroup: CameraGroup = {
    camera_ids: uniqueStringList(group.camera_ids),
    company_scope_id: scopeId,
    created_at: group.created_at || now,
    id: group.id || createCameraGroupId(),
    name: group.name.trim(),
    scope_id: group.scope_id,
    scope_type: group.scope_type,
    updated_at: now,
  };
  const nextGroups = groups.some((item) => item.id === nextGroup.id)
    ? groups.map((item) => (item.id === nextGroup.id ? nextGroup : item))
    : [...groups, nextGroup];

  return writeCameraGroups(scopeId, nextGroups);
}

export function deleteCameraGroup(
  companyScopeId: string | null | undefined,
  groupId: string,
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  return writeCameraGroups(
    scopeId,
    readCameraGroups(scopeId).filter((group) => group.id !== groupId),
  );
}

export function readCameraWorkerAssignments(
  companyScopeId: string | null | undefined,
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  return normalizeCameraWorkerAssignments(readAssignmentStore()[scopeId] ?? {});
}

export function writeCameraWorkerAssignments(
  companyScopeId: string | null | undefined,
  assignments: CameraWorkerAssignments,
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  const store = readAssignmentStore();
  store[scopeId] = normalizeCameraWorkerAssignments(assignments);
  writeAssignmentStore(store);
  dispatchCameraGroupsUpdated();
  return store[scopeId];
}

export function setWorkerCameraAssignments(
  companyScopeId: string | null | undefined,
  workerId: string,
  cameraIds: string[],
) {
  const assignments = readCameraWorkerAssignments(companyScopeId);
  Object.entries(assignments).forEach(([cameraId, assignedWorkerId]) => {
    if (assignedWorkerId === workerId) delete assignments[cameraId];
  });
  uniqueStringList(cameraIds).forEach((cameraId) => {
    assignments[cameraId] = workerId;
  });
  return writeCameraWorkerAssignments(companyScopeId, assignments);
}

export function readWorkerLocationAssignments(
  companyScopeId: string | null | undefined,
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  return normalizeWorkerLocationAssignments(
    readWorkerLocationAssignmentStore()[scopeId] ?? {},
  );
}

export function writeWorkerLocationAssignments(
  companyScopeId: string | null | undefined,
  assignments: WorkerLocationAssignments,
) {
  const scopeId = companyScopeId || DEFAULT_COMPANY_SCOPE;
  const store = readWorkerLocationAssignmentStore();
  store[scopeId] = normalizeWorkerLocationAssignments(assignments);
  writeWorkerLocationAssignmentStore(store);
  dispatchCameraGroupsUpdated();
  return store[scopeId];
}

export function setWorkerLocationAssignment(
  companyScopeId: string | null | undefined,
  locationId: string,
  workerId: string,
) {
  const cleanLocationId = locationId.trim();
  if (!cleanLocationId) return readWorkerLocationAssignments(companyScopeId);

  const assignments = readWorkerLocationAssignments(companyScopeId);
  const cleanWorkerId = workerId.trim();
  if (cleanWorkerId) {
    assignments[cleanLocationId] = cleanWorkerId;
  } else {
    delete assignments[cleanLocationId];
  }

  return writeWorkerLocationAssignments(companyScopeId, assignments);
}

export function assignedCameraIdsForWorker({
  assignments,
  cameras,
  workerId,
}: {
  assignments: CameraWorkerAssignments;
  cameras: Camera[];
  workerId: string;
}) {
  return cameras
    .filter(
      (camera) => camera.active !== false && assignments[camera.id] === workerId,
    )
    .map((camera) => camera.id);
}

export function buildWorkerLocationOptions({
  assignments,
  cameras,
  manager,
  workers,
}: {
  assignments: CameraWorkerAssignments;
  cameras: Camera[];
  manager: boolean;
  workers: Worker[];
}) {
  return workers
    .filter((worker) => manager || worker.active)
    .map((worker) => ({
      cameraIds: assignedCameraIdsForWorker({
        assignments,
        cameras,
        workerId: worker.id,
      }),
      description: worker.description || "Location formada pelas câmeras do worker.",
      id: worker.id,
      name: worker.name,
      worker,
    }))
    .filter((option) => option.cameraIds.length > 0);
}

export function buildWorkerBackedLocationOptions({
  assignments,
  cameras,
  locations,
  manager,
  workers,
}: {
  assignments: WorkerLocationAssignments;
  cameras: Camera[];
  locations: Location[];
  manager: boolean;
  workers: Worker[];
}) {
  const workersById = new Map(
    workers.flatMap((worker) =>
      workerIdentityIds(worker).map((workerId) => [workerId, worker] as const),
    ),
  );

  return buildLocationCameraOptions({
    cameras,
    locations,
    manager,
  }).map((option) => {
    const workerId = assignments[option.id] ?? "";
    const worker = workerId ? workersById.get(workerId) : undefined;
    const workerDescription = worker
      ? `Worker vinculado: ${worker.name}.`
      : workerId
        ? "Worker vinculado não foi retornado pela API."
        : "Worker ainda não vinculado.";

    return {
      ...option,
      description: `${option.description} ${workerDescription}`,
      worker,
      workerId,
    };
  });
}

export function buildLocationCameraOptions({
  cameras,
  locations,
  manager,
}: {
  cameras: Camera[];
  locations: Location[];
  manager: boolean;
}) {
  return locations
    .filter((location) => manager || location.active)
    .map((location) => {
      const cameraIds = cameras
        .filter(
          (camera) =>
            camera.active !== false && camera.location_id === location.id,
        )
        .map((camera) => camera.id);

      return {
        cameraIds,
        description:
          location.description || "Location formada pelas câmeras vinculadas.",
        id: location.id,
        location,
        name: location.name,
      };
    })
    .filter((option) => option.cameraIds.length > 0);
}

export function buildSubLocationCameraOptions({
  cameras,
  groups,
  locations,
  manager,
  subLocations,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  subLocations: SubLocation[];
}) {
  const groupsBySubLocation = new Map(
    groups
      .filter((group) => group.scope_type === "sub_location")
      .map((group) => [group.scope_id, group]),
  );
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  return subLocations
    .filter((subLocation) => manager || subLocation.active)
    .map<CameraGroupOption | null>((subLocation) => {
      const location = locationsById.get(subLocation.location_id);
      if (!location || (!manager && location.active === false)) return null;

      const group = groupsBySubLocation.get(subLocation.id);
      const configuredCameraIds = group?.camera_ids ?? [];
      const cameraIds = configuredCameraIds.length
        ? configuredCameraIds.filter((cameraId) => {
            const camera = cameras.find((item) => item.id === cameraId);
            return Boolean(
              camera &&
                camera.active !== false &&
                camera.location_id === subLocation.location_id,
            );
          })
        : cameras
            .filter(
              (camera) =>
                camera.active !== false &&
                camera.sub_location_id === subLocation.id,
            )
            .map((camera) => camera.id);

      if (!cameraIds.length) return null;

      return {
        cameraIds,
        description: `Sub-location de ${location.name}.`,
        group,
        id: group ? cameraGroupOptionId(group.id) : `sub-location:${subLocation.id}`,
        location,
        name: group?.name || subLocation.name,
        parentName: location.name,
        scopeType: "sub_location",
        subLocation,
      };
    })
    .filter((option): option is CameraGroupOption => Boolean(option));
}

export function buildWorkerCameraGroupOptions({
  assignments,
  cameras,
  groups,
  manager,
  workers,
}: {
  assignments: CameraWorkerAssignments;
  cameras: Camera[];
  groups: CameraGroup[];
  manager: boolean;
  workers: Worker[];
}) {
  const workersById = new Map(workers.map((worker) => [worker.id, worker]));
  const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));

  return groups
    .filter((group) => group.scope_type === "worker")
    .map<CameraGroupOption | null>((group) => {
      const worker = workersById.get(group.scope_id);
      if (!worker || (!manager && worker.active === false)) return null;

      const cameraIds = group.camera_ids.filter((cameraId) => {
        const camera = camerasById.get(cameraId);
        return Boolean(
          camera &&
            camera.active !== false &&
            assignments[cameraId] === worker.id,
        );
      });

      if (!cameraIds.length) return null;

      return {
        cameraIds,
        description: `Sub-location personalizada do worker ${worker.name}.`,
        group,
        id: cameraGroupOptionId(group.id),
        name: group.name,
        parentName: worker.name,
        scopeType: "worker",
      };
    })
    .filter((option): option is CameraGroupOption => Boolean(option));
}

export function buildCameraGroupOptions({
  cameras,
  groups,
  locations,
  manager,
  scopeType,
  subLocations,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  scopeType: CameraGroupScopeType;
  subLocations: SubLocation[];
}) {
  const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const subLocationsById = new Map(
    subLocations.map((subLocation) => [subLocation.id, subLocation]),
  );

  return groups
    .filter((group) => group.scope_type === scopeType)
    .map<CameraGroupOption | null>((group) => {
      if (scopeType === "worker") return null;

      const parent =
        scopeType === "location"
          ? locationsById.get(group.scope_id)
          : subLocationsById.get(group.scope_id);
      if (!parent || (!manager && parent.active === false)) return null;

      const cameraIds = group.camera_ids.filter((cameraId) => {
        const camera = camerasById.get(cameraId);
        if (!camera || camera.active === false) return false;
        return scopeType === "location"
          ? camera.location_id === group.scope_id
          : camera.sub_location_id === group.scope_id;
      });

      if (!cameraIds.length) return null;

      const parentName = parent.name;
      return {
        cameraIds,
        description: `Grupo personalizado em ${parentName}.`,
        group,
        id: cameraGroupOptionId(group.id),
        name: group.name,
        parentName,
        scopeType,
      };
    })
    .filter((option): option is CameraGroupOption => Boolean(option));
}

export function cameraGroupOptionId(groupId: string) {
  return `camera-group:${groupId}`;
}

function readStore(): CameraGroupStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(CAMERA_GROUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CameraGroupStore;
  } catch {
    return {};
  }
}

function writeStore(store: CameraGroupStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CAMERA_GROUP_STORAGE_KEY, JSON.stringify(store));
}

function normalizeCameraGroups(groups: CameraGroup[], companyScopeId: string) {
  return groups
    .map((group) => ({
      ...group,
      camera_ids: uniqueStringList(group.camera_ids),
      company_scope_id: group.company_scope_id || companyScopeId,
      name: String(group.name || "").trim(),
      scope_id: String(group.scope_id || ""),
      scope_type: normalizeScopeType(group.scope_type),
    }))
    .filter((group) => group.name && group.scope_id);
}

function normalizeScopeType(value: unknown): CameraGroupScopeType {
  if (value === "worker") return "worker";
  return value === "sub_location" ? "sub_location" : "location";
}

function readAssignmentStore(): CameraWorkerAssignmentStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(CAMERA_WORKER_ASSIGNMENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CameraWorkerAssignmentStore;
  } catch {
    return {};
  }
}

function writeAssignmentStore(store: CameraWorkerAssignmentStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CAMERA_WORKER_ASSIGNMENT_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function readWorkerLocationAssignmentStore(): WorkerLocationAssignmentStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(
      WORKER_LOCATION_ASSIGNMENT_STORAGE_KEY,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as WorkerLocationAssignmentStore;
  } catch {
    return {};
  }
}

function writeWorkerLocationAssignmentStore(
  store: WorkerLocationAssignmentStore,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    WORKER_LOCATION_ASSIGNMENT_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function normalizeCameraWorkerAssignments(assignments: CameraWorkerAssignments) {
  return Object.fromEntries(
    Object.entries(assignments)
      .map(([cameraId, workerId]) => [cameraId.trim(), workerId.trim()])
      .filter(([cameraId, workerId]) => cameraId && workerId),
  ) as CameraWorkerAssignments;
}

function normalizeWorkerLocationAssignments(
  assignments: WorkerLocationAssignments,
) {
  return Object.fromEntries(
    Object.entries(assignments)
      .map(([locationId, workerId]) => [locationId.trim(), workerId.trim()])
      .filter(([locationId, workerId]) => locationId && workerId),
  ) as WorkerLocationAssignments;
}

function uniqueStringList(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function createCameraGroupId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `camera-group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dispatchCameraGroupsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CAMERA_GROUPS_UPDATED_EVENT));
}
