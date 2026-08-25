import type {
  Camera,
  Location,
  SubLocation,
  Worker,
} from "@/lib/types";
import { createTenantCompanyIdResolver } from "@/lib/tenant-scope-validation";

type UnknownRecord = Record<string, unknown>;

export type ValidatedWorker = Worker & {
  __duplicate_record_count?: number;
  __identity_alias_ids?: string[];
};

export function requireCameraRows(
  value: unknown,
  expectedCompanyId?: string | null,
): Camera[] {
  const resolveCompanyId = createTenantCompanyIdResolver(expectedCompanyId);
  return requireEntityRows(value, "câmeras", (row, index) => ({
    ...row,
    id: requireId(row.id, `id da câmera na posição ${index}`),
    company_id: resolveCompanyId(
      row.company_id,
      `company_id da câmera na posição ${index}`,
    ),
    location_id: requireOptionalId(
      row.location_id,
      `location_id da câmera na posição ${index}`,
    ),
    sub_location_id: requireOptionalId(
      row.sub_location_id,
      `sub_location_id da câmera na posição ${index}`,
    ),
    name: requireText(row.name, `nome da câmera na posição ${index}`),
    active: requireBoolean(
      row.active,
      `active da câmera na posição ${index}`,
    ),
  })) as Camera[];
}

export function requireLocationRows(
  value: unknown,
  expectedCompanyId?: string | null,
): Location[] {
  const resolveCompanyId = createTenantCompanyIdResolver(expectedCompanyId);
  return requireEntityRows(value, "locais", (row, index) => ({
    ...row,
    id: requireId(row.id, `id do local na posição ${index}`),
    company_id: resolveCompanyId(
      row.company_id,
      `company_id do local na posição ${index}`,
    ),
    name: requireText(row.name, `nome do local na posição ${index}`),
    active: requireBoolean(
      row.active,
      `active do local na posição ${index}`,
    ),
  })) as Location[];
}

export function requireSubLocationRows(
  value: unknown,
  expectedCompanyId?: string | null,
): SubLocation[] {
  const resolveCompanyId = createTenantCompanyIdResolver(expectedCompanyId);
  return requireEntityRows(value, "sublocais", (row, index) => ({
    ...row,
    id: requireId(row.id, `id do sublocal na posição ${index}`),
    company_id: resolveCompanyId(
      row.company_id,
      `company_id do sublocal na posição ${index}`,
    ),
    location_id: requireId(
      row.location_id,
      `location_id do sublocal na posição ${index}`,
    ),
    name: requireText(row.name, `nome do sublocal na posição ${index}`),
    active: requireBoolean(
      row.active,
      `active do sublocal na posição ${index}`,
    ),
  })) as SubLocation[];
}

export function requireWorkerRows(
  value: unknown,
  expectedCompanyId?: string | null,
): ValidatedWorker[] {
  const resolveCompanyId = createTenantCompanyIdResolver(expectedCompanyId);
  const rows = requireSingleArrayEnvelope(
    value,
    ["data", "workers", "items", "results"],
    "workers",
  );

  return requireEntityRows(rows, "workers", (row, index) => ({
    ...row,
    id: requireId(row.id, `id do worker na posição ${index}`),
    company_id: resolveCompanyId(
      row.company_id,
      `company_id do worker na posição ${index}`,
    ),
    name: requireText(row.name, `nome do worker na posição ${index}`),
    active: requireBoolean(
      row.active,
      `active do worker na posição ${index}`,
    ),
    user_id: requireOptionalId(
      row.user_id,
      `user_id do worker na posição ${index}`,
    ),
    auth_user_id: requireOptionalId(
      row.auth_user_id,
      `auth_user_id do worker na posição ${index}`,
    ),
    created_by_user_id: requireOptionalId(
      row.created_by_user_id,
      `created_by_user_id do worker na posição ${index}`,
    ),
    worker_id: requireOptionalId(
      row.worker_id,
      `worker_id do worker na posição ${index}`,
    ),
    local_worker_id: requireOptionalId(
      row.local_worker_id,
      `local_worker_id do worker na posição ${index}`,
    ),
    client_id: requireOptionalId(
      row.client_id,
      `client_id do worker na posição ${index}`,
    ),
  })) as ValidatedWorker[];
}

export function requireInfrastructureRelations({
  cameras,
  locations,
  subLocations,
}: {
  cameras: Camera[];
  locations: Location[];
  subLocations?: SubLocation[];
}) {
  const locationsById = new Map(
    locations.map((location) => [location.id, location] as const),
  );
  const subLocationsById = new Map(
    (subLocations ?? []).map(
      (subLocation) => [subLocation.id, subLocation] as const,
    ),
  );

  subLocations?.forEach((subLocation) => {
    const location = locationsById.get(subLocation.location_id);
    if (!location) {
      throw new Error(
        `O sublocal "${subLocation.id}" referencia o local inexistente "${subLocation.location_id}".`,
      );
    }
    if (location.company_id !== subLocation.company_id) {
      throw new Error(
        `O sublocal "${subLocation.id}" e o local "${location.id}" pertencem a empresas diferentes.`,
      );
    }
  });

  cameras.forEach((camera) => {
    const location = camera.location_id
      ? locationsById.get(camera.location_id)
      : undefined;
    if (camera.location_id && !location) {
      throw new Error(
        `A câmera "${camera.id}" referencia o local inexistente "${camera.location_id}".`,
      );
    }
    if (location && location.company_id !== camera.company_id) {
      throw new Error(
        `A câmera "${camera.id}" e o local "${location.id}" pertencem a empresas diferentes.`,
      );
    }

    const subLocation = camera.sub_location_id && subLocations
      ? subLocationsById.get(camera.sub_location_id)
      : undefined;
    if (camera.sub_location_id && subLocations && !subLocation) {
      throw new Error(
        `A câmera "${camera.id}" referencia o sublocal inexistente "${camera.sub_location_id}".`,
      );
    }
    if (subLocation && subLocation.company_id !== camera.company_id) {
      throw new Error(
        `A câmera "${camera.id}" e o sublocal "${subLocation.id}" pertencem a empresas diferentes.`,
      );
    }
    if (
      location &&
      subLocation &&
      subLocation.location_id !== location.id
    ) {
      throw new Error(
        `A câmera "${camera.id}" referencia um local incompatível com o sublocal "${subLocation.id}".`,
      );
    }
  });
}

function requireEntityRows(
  value: unknown,
  label: string,
  normalize: (row: UnknownRecord, index: number) => UnknownRecord,
) {
  if (!Array.isArray(value)) {
    throw new Error(`A API retornou uma lista de ${label} inválida.`);
  }

  const ids = new Set<string>();
  return Array.from(value, (candidate, index) => {
    if (!isRecord(candidate)) {
      throw new Error(
        `A API retornou um item inválido na lista de ${label}, posição ${index}.`,
      );
    }

    const row = normalize(candidate, index);
    const id = row.id as string;
    if (ids.has(id)) {
      throw new Error(
        `A API retornou o id duplicado "${id}" na lista de ${label}.`,
      );
    }
    ids.add(id);
    return row;
  });
}

function requireSingleArrayEnvelope(
  value: unknown,
  keys: readonly string[],
  label: string,
) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) {
    throw new Error(`A API retornou uma lista de ${label} inválida.`);
  }

  const presentKeys = keys.filter((key) => value[key] !== undefined);
  if (presentKeys.length !== 1 || !Array.isArray(value[presentKeys[0]])) {
    throw new Error(
      `A API retornou um envelope ambíguo ou inválido para ${label}.`,
    );
  }

  return value[presentKeys[0]] as unknown[];
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

function requireText(value: unknown, context: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim()
  ) {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireBoolean(value: unknown, context: string) {
  if (typeof value !== "boolean") {
    throw new Error(`A API retornou ${context} inválido.`);
  }
  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
