import type { CurrentUser, UserPermission } from "@/lib/types";
import { isMasterUser, normalizeRole } from "@/lib/user-role";

export type OperationalPermissionDefinition = {
  slug: string;
  label: string;
  description: string;
  aliases?: readonly string[];
  grantAliases?: readonly string[];
  terms: readonly string[];
};

export const OPERATIONAL_PERMISSIONS = [
  {
    slug: "dashboard_widgets_manage",
    label: "Widgets do painel",
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
    ],
    grantAliases: [
      "widget_manage",
      "widgets_manage",
      "dashboard_manage",
      "dashboard_layout_manage",
      "dashboard_view_manage",
      "dashboard_widgets_edit",
      "counting_manage_widgets",
      "counting_widgets_manage",
    ],
    terms: ["dashboard", "widget", "visual", "view", "layout"],
  },
  {
    slug: "views_manage",
    label: "Visões",
    description: "Criar e configurar visões para exibição em outros monitores.",
    aliases: [
      "view_manage",
      "views_create",
      "views_edit",
      "dashboard_views_manage",
      "dashboard_view_manage",
      "dashboard_views_edit",
      "display_views_manage",
      "counting_manage_views",
      "counting_views_manage",
      "counting_create_view",
      "counting_edit_view",
    ],
    grantAliases: [
      "view_manage",
      "views_create",
      "views_edit",
      "dashboard_views_manage",
      "dashboard_view_manage",
      "dashboard_views_edit",
      "display_views_manage",
      "counting_manage_views",
      "counting_views_manage",
      "counting_create_view",
      "counting_edit_view",
    ],
    terms: ["views", "view", "visao", "visoes", "visualizacao", "url"],
  },
  {
    slug: "occupancy_manage",
    label: "Ocupação",
    description: "Acessar e configurar áreas e cenários de ocupação.",
    aliases: [
      "occupancy_create",
      "occupancy_edit",
      "occupancy_area_manage",
      "occupancy_areas_manage",
      "area_occupancy_manage",
      "people_occupancy_manage",
      "counting_manage_occupancy",
      "counting_occupancy_manage",
      "occupancy_create_scenario",
      "occupancy_edit_scenario",
      "occupancy_delete_scenario",
    ],
    grantAliases: [
      "occupancy_create",
      "occupancy_edit",
      "occupancy_area_manage",
      "occupancy_areas_manage",
      "area_occupancy_manage",
      "people_occupancy_manage",
      "counting_manage_occupancy",
      "counting_occupancy_manage",
      "occupancy_create_scenario",
      "occupancy_edit_scenario",
      "occupancy_delete_scenario",
    ],
    terms: ["occupancy", "ocupacao", "ocupação", "area occupancy", "area"],
  },
  {
    slug: "locations_manage",
    label: "Locais",
    description: "Criar e editar locais e sublocais operacionais.",
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
    ],
    grantAliases: [
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
    ],
    terms: ["location", "locations", "sub location", "local", "locais", "place"],
  },
  {
    slug: "scenarios_manage",
    label: "Cenários",
    description: "Criar e editar regras usadas nos relatórios.",
    aliases: [
      "scenarios_create",
      "scenarios_edit",
      "scenarios_delete",
      "counting_manage_scenarios",
      "counting_scenarios_manage",
      "counting_create_scenario",
      "counting_edit_scenario",
      "counting_delete_scenario",
    ],
    grantAliases: [
      "scenarios_create",
      "scenarios_edit",
      "scenarios_delete",
      "counting_manage_scenarios",
      "counting_scenarios_manage",
      "counting_create_scenario",
      "counting_edit_scenario",
      "counting_delete_scenario",
    ],
    terms: ["scenario", "scenarios", "cenario", "cenarios"],
  },
  {
    slug: "cameras_manage",
    label: "Câmeras",
    description: "Criar e editar câmeras e linhas de contagem.",
    aliases: [
      "cameras_create",
      "cameras_edit",
      "cameras_delete",
      "line_counts_manage",
      "counting_manage_cameras",
      "counting_cameras_manage",
      "counting_create_camera",
      "counting_edit_camera",
      "counting_delete_camera",
    ],
    grantAliases: [
      "cameras_create",
      "cameras_edit",
      "cameras_delete",
      "line_counts_manage",
      "counting_manage_cameras",
      "counting_cameras_manage",
      "counting_create_camera",
      "counting_edit_camera",
      "counting_delete_camera",
    ],
    terms: ["camera", "cameras", "line count", "line counts", "linha"],
  },
  {
    slug: "workers_manage",
    label: "Workers",
    description: "Cadastrar Workers, renovar credenciais e acompanhar a comunicação.",
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
    grantAliases: [
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
  if (isMasterUser(user)) return true;
  if (!isOperationalAdmin(user)) return false;

  // Widget layout is part of administering the operational dashboard itself.
  // Some API/JWT versions publish a dedicated widget grant, while others only
  // expose a write-capable grant for one of the operational modules. Accept
  // either representation without widening access to infrastructure resources.
  return (
    permissionsAllowWidgetManagement(user?.permissions, user) ||
    userHasModuleManagementPermission(user, "counting") ||
    userHasModuleManagementPermission(user, "occupancy") ||
    userHasModuleManagementPermission(user, "demographics")
  );
}

export function canManageLocations(user: CurrentUser | null) {
  return canManage(user, "locations_manage");
}

export function canManageOccupancy(user: CurrentUser | null) {
  return canManage(user, "occupancy_manage");
}

export function canManageScenarios(user: CurrentUser | null) {
  return canManage(user, "scenarios_manage");
}

/**
 * Access to the shared scenario catalogue route. Keep the two product
 * capabilities independent after the route is open: callers must still use
 * `canManageScenarios` for Counting and `canManageOccupancy` for Occupancy.
 */
export function canManageScenarioCatalogs(user: CurrentUser | null) {
  return canManageScenarios(user) || canManageOccupancy(user);
}

export function canManageCameras(user: CurrentUser | null) {
  return canManage(user, "cameras_manage");
}

export function canManageWorkers(user: CurrentUser | null) {
  return canManage(user, "workers_manage");
}

export function canManageViews(user: CurrentUser | null) {
  return canManage(user, "views_manage");
}

/**
 * The audit endpoints are protected by the tenant role itself in the API,
 * not by a module permission. Keep this capability separate from operational
 * grants so an operator never gains access through a read-only module claim.
 */
export function canViewAudit(user: CurrentUser | null) {
  return isMasterUser(user) || isOperationalAdmin(user);
}

export function hasAnyOperationalPermission(user: CurrentUser | null) {
  if (isMasterUser(user)) return true;
  if (!isOperationalAdmin(user)) return false;

  return OPERATIONAL_PERMISSIONS.some((permission) =>
    userHasPermission(user, permission),
  ) ||
    userHasModuleManagementPermission(user, "counting") ||
    userHasModuleManagementPermission(user, "occupancy") ||
    userHasModuleManagementPermission(user, "demographics");
}

/**
 * The catalog endpoints are read-only for this caller, but the API still
 * protects them with the signed `admin` role. Keep that transport capability
 * separate from resource-management grants: an Admin may read the catalogs
 * needed by analytics without gaining edit access to every resource.
 */
export function canReadInfrastructureCatalogs(user: CurrentUser | null) {
  return isMasterUser(user) || isOperationalAdmin(user);
}

export function permissionsAllowWidgetManagement(
  permissions: UserPermission[] = [],
  user?: CurrentUser | null,
) {
  const widgetPermission = OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === "dashboard_widgets_manage",
  );

  return Boolean(
    widgetPermission &&
      permissions.some(
        (permission) =>
          (!user ||
            (permissionBelongsToUserCompany(user, permission) &&
              companyEnablesExplicitPermissionModule(user, permission))) &&
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

export function permissionMatchesExplicitGrant(
  permission: Pick<UserPermission, "slug">,
  definition: OperationalPermissionDefinition,
) {
  const normalizedSlug = normalizePermissionText(permission.slug);
  return (
    normalizedSlug === normalizePermissionText(definition.slug) ||
    Boolean(
      definition.grantAliases?.some(
        (alias) => normalizePermissionText(alias) === normalizedSlug,
      ),
    )
  );
}

/**
 * Returns presentation metadata only when one catalog slug maps unambiguously
 * to a resource known by this frontend. The grant itself always remains the
 * exact permission record returned by `/permissions`.
 */
export function operationalPermissionDefinitionForGrant(
  permission: Pick<UserPermission, "slug">,
) {
  const matches = OPERATIONAL_PERMISSIONS.filter((definition) =>
    permissionMatchesExplicitGrant(permission, definition),
  );
  return matches.length === 1 ? matches[0] : null;
}

export function getPermissionRecordId(permission: UserPermission) {
  return permission.permission_id ?? permission.id;
}

function canManage(user: CurrentUser | null, slug: string) {
  if (isMasterUser(user)) return true;
  if (!isOperationalAdmin(user)) return false;

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
    user?.permissions?.some(
      (permission) =>
        permissionBelongsToUserCompany(user, permission) &&
        companyEnablesExplicitPermissionModule(user, permission) &&
        userPermissionMatchesDefinition(permission, definition),
    ),
  );
}

function userPermissionMatchesDefinition(
  permission: UserPermission,
  definition: OperationalPermissionDefinition,
) {
  if (!permissionAllowsManagement(permission)) return false;

  // A write decision must be tied to an explicit, known slug. Descriptive
  // module/action text is useful for display, but is too broad to authorize a
  // different resource (for example `counting_create_view` as widgets).
  return permissionMatchesSlug(permission, definition);
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

function permissionAllowsManagement(permission: UserPermission) {
  const capabilities = [
    permission.can_view,
    permission.can_create,
    permission.can_edit,
    permission.can_delete,
    permission.can_export,
  ];
  const hasExplicitCapabilities = capabilities.some(
    (capability) => typeof capability === "boolean",
  );

  if (permission.can_create || permission.can_edit || permission.can_delete) {
    return true;
  }

  const action = normalizePermissionText(permission.action);
  if (actionIncludesAny(action, MODULE_MUTATING_ACTIONS)) {
    return true;
  }
  if (
    actionIncludesAny(action, [
      ...MODULE_READ_ACTIONS,
      "get",
      "report",
      "analytics",
    ])
  ) {
    return false;
  }

  if (hasExplicitCapabilities || action) return false;

  // Compact JWTs may omit `action`. Only an explicitly mutating action token
  // in the slug is accepted as a safe fallback; `*_view` and opaque slugs fail
  // closed until the Swagger catalogue enriches them.
  return permissionSlugHasAction(permission.slug, MODULE_MUTATING_ACTIONS);
}

function normalizePermissionText(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isOperationalAdmin(user: CurrentUser | null) {
  return normalizeRole(user?.role) === "admin";
}

export type OperationalModuleFamily =
  | "counting"
  | "occupancy"
  | "demographics";

const MODULE_FAMILY_TERMS = {
  counting: ["counting", "contagem", "people counting", "people count"],
  occupancy: ["occupancy", "ocupacao", "people occupancy"],
  demographics: [
    "demographics",
    "demographic",
    "demografia",
    "demografico",
    "people demographics",
  ],
} as const satisfies Record<OperationalModuleFamily, readonly string[]>;

const MODULE_READ_ACTIONS = ["view", "read", "list", "export"] as const;
const MODULE_MUTATING_ACTIONS = [
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
] as const;
const MODULE_WIDE_MUTATING_ACTIONS = [
  "manage",
  "admin",
  "configure",
  "config",
] as const;

/**
 * Resolves the product module represented by a permission returned by the API.
 *
 * The permission catalogue is the source of truth, so this deliberately does
 * not enumerate permission slugs. The embedded module is authoritative when
 * present; JWTs that contain only permission slugs remain compatible through
 * the module prefix (`counting_*`, `occupancy_*` or `demographics_*`).
 * Contradictory declarations fail closed instead of leaking one module through
 * a grant for another.
 */
export function permissionModuleFamily(
  permission: Pick<UserPermission, "slug" | "module">,
): OperationalModuleFamily | null {
  if (permission.module?.active === false) return null;

  const declaredFamily = moduleFamilyFromText(
    [permission.module?.slug, permission.module?.name].join(" "),
  );
  const slugFamily = moduleFamilyFromPermissionSlug(permission.slug);

  if (declaredFamily && slugFamily && declaredFamily !== slugFamily) {
    return null;
  }

  return declaredFamily ?? slugFamily;
}

export function canViewCounting(user: CurrentUser | null) {
  return userCanViewModule(user, "counting");
}

export function canViewOccupancy(user: CurrentUser | null) {
  return userCanViewModule(user, "occupancy");
}

export function canViewDemographics(user: CurrentUser | null) {
  return userCanViewModule(user, "demographics");
}

/** Ao Vivo, Análises e Relatórios formam o pacote de leitura dos módulos. */
export function canAccessOperationalDashboards(user: CurrentUser | null) {
  return (
    canViewCounting(user) ||
    canViewOccupancy(user) ||
    canViewDemographics(user)
  );
}

/**
 * Module-wide write access used to derive an Admin's management capabilities
 * from the same Swagger permission records used for dashboard visibility.
 * Operators never receive mutation authority from a stray write-shaped grant.
 */
export function userHasModuleManagementPermission(
  user: CurrentUser | null,
  family: OperationalModuleFamily,
) {
  if (isMasterUser(user)) return true;
  if (!isOperationalAdmin(user)) return false;

  return Boolean(
    user?.permissions?.some(
      (permission) =>
        permissionBelongsToUserCompany(user, permission) &&
        permissionModuleFamily(permission) === family &&
        companyEnablesPermissionModule(user, permission, family) &&
        permissionAllowsModuleManagement(permission),
    ),
  );
}

function userCanViewModule(
  user: CurrentUser | null,
  family: OperationalModuleFamily,
) {
  if (isMasterUser(user)) return true;

  return Boolean(
    user?.permissions?.some(
      (permission) =>
        permissionBelongsToUserCompany(user, permission) &&
        permissionModuleFamily(permission) === family &&
        companyEnablesPermissionModule(user, permission, family) &&
        permissionAllowsModuleVisibility(permission),
    ),
  );
}

function companyEnablesPermissionModule(
  user: CurrentUser,
  permission: UserPermission,
  family: OperationalModuleFamily,
) {
  const assignments = user.company_modules;
  if (assignments === undefined) return true;

  const rawPermissionModuleId =
    permission.module_id?.trim() || permission.module?.id?.trim();
  const permissionModuleId = rawPermissionModuleId?.startsWith("jwt-module:")
    ? ""
    : rawPermissionModuleId;
  return assignments.some((assignment) => {
    if (!assignment.enabled || assignment.module?.active === false) return false;
    if (
      assignment.company_id?.trim() &&
      user.company_id?.trim() &&
      assignment.company_id.trim() !== user.company_id.trim()
    ) {
      return false;
    }

    const assignmentModuleId =
      assignment.module_id?.trim() || assignment.module?.id?.trim();
    if (permissionModuleId && assignmentModuleId) {
      return permissionModuleId === assignmentModuleId;
    }

    return moduleFamilyFromText(
      [assignment.module?.slug, assignment.module?.name].join(" "),
    ) === family;
  });
}

function companyEnablesExplicitPermissionModule(
  user: CurrentUser,
  permission: UserPermission,
) {
  if (permission.module?.active === false) return false;

  const assignments = user.company_modules;
  // The JWT permission remains authoritative when an older backend does not
  // publish module assignments. Once the JWT explicitly publishes the list,
  // absence of a corresponding enabled assignment is authoritative too.
  if (assignments === undefined) return true;
  if (!assignments.length) return false;

  const rawModuleId =
    permission.module_id?.trim() || permission.module?.id?.trim() || "";
  const moduleId = rawModuleId.startsWith("jwt-module:") ? "" : rawModuleId;
  const moduleSlug = normalizePermissionText(permission.module?.slug);
  const moduleName = normalizePermissionText(permission.module?.name);
  const matchingAssignments = assignments.filter((assignment) => {
    const assignmentModuleId =
      assignment.module_id?.trim() || assignment.module?.id?.trim() || "";
    if (moduleId && assignmentModuleId) return moduleId === assignmentModuleId;

    const assignmentSlug = normalizePermissionText(assignment.module?.slug);
    const assignmentName = normalizePermissionText(assignment.module?.name);
    return Boolean(
      (moduleSlug && assignmentSlug && moduleSlug === assignmentSlug) ||
        (moduleName && assignmentName && moduleName === assignmentName),
    );
  });

  if (!matchingAssignments.length) return false;
  return matchingAssignments.some(
    (assignment) => assignment.enabled && assignment.module?.active !== false,
  );
}

function permissionBelongsToUserCompany(
  user: CurrentUser,
  permission: UserPermission,
) {
  const userCompanyId = user.company_id?.trim();
  const permissionCompanyId = permission.company_id?.trim();
  return (
    !userCompanyId ||
    !permissionCompanyId ||
    userCompanyId === permissionCompanyId
  );
}

function permissionAllowsModuleVisibility(permission: UserPermission) {
  const capabilities = permissionCapabilities(permission);
  if (capabilities.declared) {
    return capabilities.read || capabilities.mutate;
  }

  const declaredAction = normalizePermissionText(permission.action);
  if (declaredAction) return isReadableOrMutatingAction(declaredAction);

  return permissionSlugHasAction(permission.slug, [
    ...MODULE_READ_ACTIONS,
    ...MODULE_MUTATING_ACTIONS,
  ]);
}

function permissionAllowsModuleManagement(permission: UserPermission) {
  const capabilities = permissionCapabilities(permission);
  if (capabilities.declared) return capabilities.mutate;

  const declaredAction = normalizePermissionText(permission.action);
  if (declaredAction) {
    return actionIncludesAny(declaredAction, MODULE_MUTATING_ACTIONS);
  }

  // With no action/capabilities, only the compact module-wide form is safe.
  // A resource-shaped slug such as `counting_create_view` must not elevate the
  // entire Counting module while catalogue metadata is unavailable.
  return permissionSlugDeclaresModuleWideManagement(permission.slug);
}

function permissionCapabilities(permission: UserPermission) {
  const declared = [
    permission.can_view,
    permission.can_create,
    permission.can_edit,
    permission.can_delete,
    permission.can_export,
  ].some((capability) => typeof capability === "boolean");

  return {
    declared,
    mutate: Boolean(
      permission.can_create || permission.can_edit || permission.can_delete,
    ),
    read: Boolean(permission.can_view || permission.can_export),
  };
}

function isReadableOrMutatingAction(action: string) {
  return actionIncludesAny(action, [
    ...MODULE_READ_ACTIONS,
    ...MODULE_MUTATING_ACTIONS,
  ]);
}

function permissionSlugHasAction(
  slug: string,
  actions: readonly string[],
) {
  const normalizedSlug = normalizePermissionText(slug);
  return actionIncludesAny(normalizedSlug, actions);
}

function permissionSlugDeclaresModuleWideManagement(slug: string) {
  const normalizedSlug = normalizePermissionText(slug);
  if (!normalizedSlug) return false;
  const tokens = normalizedSlug.split(" ");
  const actionIndex = tokens.findIndex((token) =>
    MODULE_WIDE_MUTATING_ACTIONS.includes(
      token as (typeof MODULE_WIDE_MUTATING_ACTIONS)[number],
    ),
  );
  if (actionIndex < 1) return false;

  const moduleText = tokens.slice(0, actionIndex).join(" ");
  const trailingTokens = tokens.slice(actionIndex + 1);
  return trailingTokens.length === 0 && Boolean(moduleFamilyFromText(moduleText));
}

function actionIncludesAny(action: string, candidates: readonly string[]) {
  const tokens = new Set(action.split(" ").filter(Boolean));
  return candidates.some((candidate) => tokens.has(candidate));
}

function moduleFamilyFromPermissionSlug(slug: string) {
  const normalizedSlug = normalizePermissionText(slug);
  if (!normalizedSlug) return null;

  const tokens = normalizedSlug.split(" ");
  const actionIndex = tokens.findIndex((token) =>
    [...MODULE_READ_ACTIONS, ...MODULE_MUTATING_ACTIONS].includes(
      token as (typeof MODULE_READ_ACTIONS)[number],
    ),
  );
  const moduleText = tokens
    .slice(0, actionIndex < 0 ? tokens.length : actionIndex)
    .join(" ");

  return moduleFamilyFromText(moduleText);
}

function moduleFamilyFromText(value: string) {
  const text = normalizePermissionText(value);
  if (!text) return null;

  const matches = (Object.keys(MODULE_FAMILY_TERMS) as OperationalModuleFamily[])
    .filter((family) =>
      MODULE_FAMILY_TERMS[family].some((term) =>
        normalizedTextContainsTerm(text, normalizePermissionText(term)),
      ),
    );

  return matches.length === 1 ? matches[0] : null;
}

function normalizedTextContainsTerm(text: string, term: string) {
  return ` ${text} `.includes(` ${term} `);
}
