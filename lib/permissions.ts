import type { CurrentUser, UserPermission } from "@/lib/types";
import { isMasterUser, normalizeRole } from "@/lib/user-role";

export type OperationalPermissionDefinition = {
  slug: string;
  label: string;
  description: string;
  aliases?: readonly string[];
  terms: readonly string[];
};

export const OPERATIONAL_PERMISSIONS = [
  {
    slug: "dashboard_widgets_manage",
    label: "Widgets do dashboard",
    description: "Configurar, mover, ocultar e criar widgets personalizados.",
    aliases: [
      "widget_manage",
      "widgets_manage",
      "dashboard_manage",
      "dashboard_layout_manage",
      "dashboard_view_manage",
      "dashboard_widgets_edit",
      "counting_manage_widgets",
      "counting_widgets_manage",
      "counting_create_scenario",
      "counting_edit_scenario",
      "counting_delete_scenario",
      "counting_create_camera",
      "counting_edit_camera",
      "counting_delete_camera",
      "occupancy_create_scenario",
      "occupancy_edit_scenario",
      "occupancy_delete_scenario",
    ],
    terms: ["dashboard", "widget", "visual", "view", "layout"],
  },
  {
    slug: "occupancy_manage",
    label: "Ocupação",
    description: "Acessar e configurar áreas de ocupação por fotografia.",
    aliases: [
      "occupancy_create",
      "occupancy_edit",
      "occupancy_area_manage",
      "occupancy_areas_manage",
      "area_occupancy_manage",
      "people_occupancy_manage",
      "counting_manage_occupancy",
      "counting_occupancy_manage",
    ],
    terms: ["occupancy", "ocupacao", "ocupação", "area occupancy", "area"],
  },
  {
    slug: "locations_manage",
    label: "Locais",
    description: "Criar e editar locais e sub-locais operacionais.",
    aliases: [
      "location_manage",
      "locations_create",
      "locations_edit",
      "location_create",
      "location_edit",
      "sub_locations_manage",
      "sub_location_manage",
      "places_manage",
      "counting_manage_locations",
      "counting_locations_manage",
      "counting_create_location",
      "counting_edit_location",
      "counting_create_scenario",
      "counting_edit_scenario",
      "counting_delete_scenario",
      "occupancy_create_scenario",
      "occupancy_edit_scenario",
      "occupancy_delete_scenario",
      "counting_create_camera",
      "counting_edit_camera",
      "counting_delete_camera",
    ],
    terms: ["location", "locations", "sub location", "local", "locais", "place"],
  },
  {
    slug: "scenarios_manage",
    label: "Cenários",
    description: "Criar e editar regras usadas nos relatórios.",
    aliases: ["scenarios_create", "scenarios_edit"],
    terms: ["scenario", "scenarios", "cenario", "cenarios"],
  },
  {
    slug: "cameras_manage",
    label: "Câmeras",
    description: "Criar e editar câmeras e linhas de contagem.",
    aliases: ["cameras_create", "cameras_edit", "line_counts_manage"],
    terms: ["camera", "cameras", "line count", "line counts", "linha"],
  },
  {
    slug: "workers_manage",
    label: "Workers",
    description: "Criar workers, rotacionar chaves e acompanhar heartbeats.",
    aliases: [
      "worker_manage",
      "workers_create",
      "workers_edit",
      "workers_rotate_key",
      "worker_create",
      "worker_edit",
      "worker_rotate_key",
      "counting_manage_workers",
      "counting_workers_manage",
      "counting_create_worker",
      "counting_edit_worker",
    ],
    terms: ["worker", "workers"],
  },
] as const satisfies readonly OperationalPermissionDefinition[];

export const OPERATIONAL_PERMISSION_SLUGS = OPERATIONAL_PERMISSIONS.map(
  (permission) => permission.slug,
);

export type OperationalPermissionState = Record<string, boolean>;

export function createOperationalPermissionState(
  permissions: UserPermission[] = [],
) {
  return Object.fromEntries(
    OPERATIONAL_PERMISSIONS.map((permission) => [
      permission.slug,
      permissions.some((userPermission) =>
        userPermissionMatchesDefinition(userPermission, permission),
      ),
    ]),
  ) as OperationalPermissionState;
}

export function canManageWidgets(user: CurrentUser | null) {
  if (isPrivilegedUser(user)) return true;
  return permissionsAllowWidgetManagement(user?.permissions);
}

export function canManageLocations(user: CurrentUser | null) {
  if (isPrivilegedUser(user)) return true;
  return hasAnyOperationalPermission(user);
}

export function canManageOccupancy(user: CurrentUser | null) {
  return canManage(user, "occupancy_manage");
}

export function canManageScenarios(user: CurrentUser | null) {
  return canManage(user, "scenarios_manage");
}

export function canManageCameras(user: CurrentUser | null) {
  return canManage(user, "cameras_manage");
}

export function canManageWorkers(user: CurrentUser | null) {
  return canManage(user, "workers_manage");
}

export function hasAnyOperationalPermission(user: CurrentUser | null) {
  if (isPrivilegedUser(user)) return true;

  return OPERATIONAL_PERMISSIONS.some((permission) =>
    userHasPermission(user, permission),
  );
}

export function permissionsAllowWidgetManagement(
  permissions: UserPermission[] = [],
) {
  const widgetPermission = OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === "dashboard_widgets_manage",
  );

  return Boolean(
    widgetPermission &&
      permissions.some((permission) =>
        userPermissionMatchesDefinition(permission, widgetPermission),
      ),
  );
}

export function permissionMatchesSlug(
  permission: UserPermission,
  definition: OperationalPermissionDefinition,
) {
  return matchesSlug(permission.slug, definition);
}

export function getPermissionRecordId(permission: UserPermission) {
  return permission.permission_id ?? permission.id;
}

function canManage(user: CurrentUser | null, slug: string) {
  if (isPrivilegedUser(user)) return true;

  const definition = OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === slug,
  );

  return definition ? userHasPermission(user, definition) : false;
}

function userHasPermission(
  user: CurrentUser | null,
  definition: OperationalPermissionDefinition,
) {
  return Boolean(
    user?.permissions?.some((permission) =>
      userPermissionMatchesDefinition(permission, definition),
    ),
  );
}

function userPermissionMatchesDefinition(
  permission: UserPermission,
  definition: OperationalPermissionDefinition,
) {
  return (
    permissionMatchesSlug(permission, definition) ||
    permissionLooksLike(permission, definition)
  );
}

function matchesSlug(
  slug: string,
  definition: OperationalPermissionDefinition,
) {
  const normalizedSlug = normalizePermissionText(slug);
  return (
    normalizedSlug === normalizePermissionText(definition.slug) ||
    Boolean(
      definition.aliases?.some(
        (alias) => normalizePermissionText(alias) === normalizedSlug,
      ),
    )
  );
}

function permissionLooksLike(
  permission: UserPermission,
  definition: OperationalPermissionDefinition,
) {
  const moduleText = normalizePermissionText(
    [
      permission.module?.slug,
      permission.module?.name,
      permission.slug,
      permission.action,
    ].join(" "),
  );

  return (
    definition.terms.some((term) =>
      moduleText.includes(normalizePermissionText(term)),
    ) && isMutatingPermission(permission)
  );
}

function isMutatingPermission(permission: UserPermission) {
  if (
    permission.can_create ||
    permission.can_edit ||
    permission.can_delete ||
    permission.can_export
  ) {
    return true;
  }

  const text = normalizePermissionText([permission.slug, permission.action].join(" "));

  return [
    "manage",
    "admin",
    "create",
    "edit",
    "update",
    "delete",
    "write",
    "configure",
    "config",
    "rotate",
  ].some((term) => text.includes(term));
}

function normalizePermissionText(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPrivilegedUser(user: CurrentUser | null) {
  return isMasterUser(user) || normalizeRole(user?.role) === "admin";
}
