import {
  operationalPermissionDefinitionForGrant,
  permissionDashboardSurface,
  permissionModuleFamily,
  permissionUsesOpaqueModuleReadMetadata,
  type DashboardSurface,
  type OperationalModuleFamily,
} from "@/lib/permissions";
import type { Permission, UserPermission } from "@/lib/types";

export type UserAccessCatalogModule = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

export type UserAccessCatalogOption = {
  category: "product" | "administrative";
  group_key: string;
  group_name: string;
  id: string;
  module_id: string;
  module_name: string;
  module_slug: string;
  /** Stable UI identity, never a slug to send to the permission API. */
  slug: string;
  capability: string;
  family: OperationalModuleFamily | null;
  surface: DashboardSurface | null;
  action: "manage" | "view";
  label: string;
  description: string;
  /** Exact backend slugs. Aliases only group their presentation. */
  slugs: string[];
  grants: { id: string; module_id: string; slug: string }[];
  unavailable?: boolean;
};

type Presentation = Pick<
  UserAccessCatalogOption,
  "action" | "capability" | "category" | "description" | "group_key" |
    "group_name" | "label" | "surface"
>;

const PRODUCT_LABELS = {
  counting: "Contagem",
  occupancy: "Ocupação",
  demographics: "Demográfico",
} as const satisfies Record<OperationalModuleFamily, string>;

const PRODUCT_ALIASES = {
  counting: ["counting", "count", "people counting", "people count", "person counting", "person count", "contagem", "contagem pessoas", "contagem de pessoas"],
  occupancy: ["occupancy", "people occupancy", "area occupancy", "ocupacao", "ocupacao pessoas", "ocupacao de pessoas", "ocupacao por area"],
  demographics: ["demographics", "demographic", "people demographics", "demografia", "demografico"],
} as const satisfies Record<OperationalModuleFamily, readonly string[]>;

const SURFACE_LABELS = {
  live: "Ao Vivo",
  analytics: "Análises",
  reports: "Relatórios",
} as const satisfies Record<DashboardSurface, string>;

/**
 * Presentation of the actual catalog, not a grant generator. Products and
 * capabilities in different modules always keep independent form identities.
 * Generic read permissions stay one linked bundle; they are never split into
 * three fabricated permissions for the dashboard surfaces.
 */
export function resolveUserAccessCatalog(
  catalog: Permission[],
  modules: UserAccessCatalogModule[],
): UserAccessCatalogOption[] {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const optionsByKey = new Map<string, UserAccessCatalogOption>();
  const ambiguousSlugs = ambiguousCatalogSlugs(catalog);

  for (const permission of catalog) {
    const id = cleanIdentifier(permission.id);
    const slug = cleanIdentifier(permission.slug);
    const explicitModuleId = cleanIdentifier(permission.module_id);
    const embeddedModuleId = cleanIdentifier(permission.module?.id);
    const moduleId = explicitModuleId || embeddedModuleId;
    if (!id || !slug || !moduleId || ambiguousSlugs.has(slug)) continue;
    if (explicitModuleId && embeddedModuleId && explicitModuleId !== embeddedModuleId) continue;

    const resolvedModule = modulesById.get(moduleId) ?? permission.module;
    if (
      !resolvedModule || resolvedModule.id !== moduleId || resolvedModule.active === false ||
      permission.module?.active === false ||
      !cleanIdentifier(resolvedModule.slug) || !cleanIdentifier(resolvedModule.name) ||
      hasContradictoryModuleFamily(resolvedModule) ||
      (permission.module && hasContradictoryModuleFamily(permission.module))
    ) continue;

    const family = permissionModuleFamily({ slug: "", module: resolvedModule });
    const embeddedFamily = permission.module
      ? permissionModuleFamily({ slug: "", module: permission.module })
      : null;
    const slugFamily = permissionModuleFamily({ slug });
    if (
      (family && embeddedFamily && family !== embeddedFamily) ||
      (family && slugFamily && family !== slugFamily)
    ) continue;

    const enrichedPermission = { ...permission, module: resolvedModule };
    const presentation = resolvePresentation(enrichedPermission, family);
    if (!presentation) continue;

    const key = `access:${encodeURIComponent(moduleId)}:${presentation.capability}`;
    const grant = { id, module_id: moduleId, slug };
    const current = optionsByKey.get(key);
    if (current) {
      if (!current.grants.some((existing) => existing.id === id && existing.slug === slug)) {
        current.grants.push(grant);
      }
      if (!current.slugs.includes(slug)) current.slugs.push(slug);
      continue;
    }

    optionsByKey.set(key, {
      ...presentation,
      family,
      id,
      module_id: moduleId,
      module_name: family ? PRODUCT_LABELS[family] : resolvedModule.name,
      module_slug: resolvedModule.slug,
      slug: key,
      slugs: [slug],
      grants: [grant],
    });
  }

  return [...optionsByKey.values()];
}

/** A disabled capability record is not selected, even when its slug matches. */
export function createUserAccessPermissionState(
  permissions: UserPermission[],
  options: readonly UserAccessCatalogOption[],
): Record<string, boolean> {
  const enabledPermissions = permissions.filter(permissionIsEnabled);
  return Object.fromEntries(options.map((option) => [
    option.slug,
    !option.unavailable && enabledPermissions.some((permission) =>
      userAccessPermissionMatchesOption(permission, option),
    ),
  ]));
}

/**
 * Exact catalog membership within the same declared module. Activation is
 * deliberately separate: revocation must also find an existing disabled grant.
 */
export function userAccessPermissionMatchesOption(
  permission: UserPermission,
  option: Pick<UserAccessCatalogOption, "module_id" | "grants">,
) {
  const explicitModuleId = cleanIdentifier(permission.module_id);
  const embeddedModuleId = cleanIdentifier(permission.module?.id);
  if (explicitModuleId && embeddedModuleId && explicitModuleId !== embeddedModuleId) return false;
  const moduleId = explicitModuleId || embeddedModuleId;
  if (moduleId && moduleId !== option.module_id) return false;
  const permissionId = permission.permission_id ?? permission.id;
  return option.grants.some((grant) =>
    grant.module_id === option.module_id &&
    (grant.id === permissionId || grant.slug === permission.slug),
  );
}

function ambiguousCatalogSlugs(catalog: readonly Permission[]) {
  const identitiesBySlug = new Map<string, string>();
  const ambiguousSlugs = new Set<string>();
  for (const permission of catalog) {
    const slug = cleanIdentifier(permission.slug);
    const id = cleanIdentifier(permission.id);
    const moduleId = cleanIdentifier(permission.module_id) || cleanIdentifier(permission.module?.id);
    if (!slug || !id || !moduleId) continue;
    const identity = JSON.stringify([moduleId, id]);
    const previous = identitiesBySlug.get(slug);
    if (previous && previous !== identity) ambiguousSlugs.add(slug);
    else identitiesBySlug.set(slug, identity);
  }
  return ambiguousSlugs;
}

function resolvePresentation(
  permission: Permission,
  family: OperationalModuleFamily | null,
): Presentation | null {
  const known = operationalPermissionDefinitionForGrant(permission);
  if (known) {
    const action = normalizeText(permission.action);
    // A read-only action must never be presented as an administrative grant.
    if (action && !action.split(" ").some((token) =>
      ["manage", "admin", "create", "edit", "update", "delete", "write", "configure", "config", "rotate"].includes(token),
    )) return null;
    const workspace = known.slug === "dashboard_widgets_manage" || known.slug === "views_manage";
    return {
      action: "manage",
      capability: known.slug,
      category: "administrative",
      description: known.description,
      group_key: workspace ? "capability:workspace" : "capability:operation",
      group_name: workspace ? "Painéis e visões" : "Configuração operacional",
      label: known.label,
      surface: null,
    };
  }

  if (!family) return null;
  const surface = permissionDashboardSurface(permission);
  const mode = surface ? "view" : genericProductMode(permission, family);
  if (!mode) return null;
  const name = PRODUCT_LABELS[family];
  return {
    action: mode,
    capability: surface ? `${family}_${surface}_view` : `${family}_${mode}`,
    category: "product",
    description: surface
      ? `Consultar ${SURFACE_LABELS[surface]} de ${name}.`
      : mode === "view"
        ? `Consultar os painéis de ${name}.`
        : `Configurar o módulo ${name} e seus recursos.`,
    group_key: `product:${family}`,
    group_name: name,
    label: surface ? SURFACE_LABELS[surface] : mode === "view" ? "Visualização" : "Gestão",
    surface,
  };
}

function genericProductMode(
  permission: Permission,
  family: OperationalModuleFamily,
): "manage" | "view" | null {
  const slug = normalizeText(permission.slug);
  const prefix = [...PRODUCT_ALIASES[family]]
    .sort((left, right) => right.length - left.length)
    .find((alias) => slug === alias || slug.startsWith(`${alias} `));
  if (!prefix) return permissionUsesOpaqueModuleReadMetadata(permission) ? "view" : null;
  const suffix = slug.slice(prefix.length).trim();
  const suffixMode = productActionMode(suffix);
  const action = normalizeText(permission.action);
  const declaredMode = productActionMode(action);
  if ((suffix && !suffixMode) || (action && !declaredMode)) return null;
  if (suffixMode && declaredMode && suffixMode !== declaredMode) return null;
  return declaredMode ?? suffixMode;
}

function productActionMode(value: string) {
  if (["manage", "admin"].includes(value)) return "manage";
  if (["view", "read", "list", "export"].includes(value)) return "view";
  return null;
}

function permissionIsEnabled(permission: UserPermission) {
  if (permission.module?.active === false) return false;
  const flags = [permission.can_view, permission.can_create, permission.can_edit, permission.can_delete, permission.can_export]
    .filter((flag): flag is boolean => typeof flag === "boolean");
  return !flags.length || flags.some(Boolean);
}

function hasContradictoryModuleFamily(module: NonNullable<Permission["module"]>) {
  const slugFamily = permissionModuleFamily({ slug: "", module: { ...module, name: "" } });
  const nameFamily = permissionModuleFamily({ slug: "", module: { ...module, slug: "" } });
  return Boolean(slugFamily && nameFamily && slugFamily !== nameFamily);
}

function cleanIdentifier(value: string | undefined) {
  return value && value === value.trim() ? value : "";
}

function normalizeText(value: string | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
