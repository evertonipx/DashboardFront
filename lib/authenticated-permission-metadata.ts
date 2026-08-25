import type { UserPermission } from "@/lib/types";

/**
 * Enriches permissions already authenticated by the current session with the
 * module metadata exposed by the Swagger catalog endpoints.
 *
 * The first argument is deliberately the only source of grants. Metadata
 * records can neither add a permission nor remove one; ambiguous or
 * cross-company matches are ignored.
 */
export function enrichAuthenticatedPermissionMetadata(
  authenticatedGrants: readonly UserPermission[],
  metadataSources: ReadonlyArray<readonly UserPermission[]>,
  expectedCompanyId = "",
) {
  const metadata = metadataSources.flat();
  if (!authenticatedGrants.length || !metadata.length) {
    return [...authenticatedGrants];
  }

  return authenticatedGrants.map((grant) =>
    enrichAuthenticatedGrant(grant, metadata, clean(expectedCompanyId)),
  );
}

function enrichAuthenticatedGrant(
  grant: UserPermission,
  metadata: readonly UserPermission[],
  expectedCompanyId: string,
) {
  const matches = metadata.filter((candidate) =>
    metadataCorrespondsToGrant(grant, candidate, expectedCompanyId),
  );
  if (!matches.length || hasAmbiguousMetadata(matches)) return grant;

  const metadataModuleId = uniqueValue(
    matches.map((candidate) => stableModuleId(candidate)),
  );
  const metadataModuleSlug = uniqueValue(
    matches.map((candidate) => clean(candidate.module?.slug)),
  );
  const metadataAction = uniqueValue(
    matches.map((candidate) => normalize(candidate.action)),
  );
  if (metadataModuleId.conflict || metadataModuleSlug.conflict) return grant;

  const currentModuleId = stableModuleId(grant);
  const moduleId = currentModuleId || metadataModuleId.value;
  const moduleRecord = selectRichestModule(matches);
  const currentModule = grant.module;
  const moduleSlug = clean(currentModule?.slug) || metadataModuleSlug.value;
  const moduleName =
    clean(currentModule?.name) || clean(moduleRecord?.name) || moduleSlug;

  if (!moduleId && !moduleRecord && !currentModule) return grant;
  if (!moduleSlug || !moduleName) return grant;

  const enrichedModule = {
    id:
      currentModuleId ||
      metadataModuleId.value ||
      clean(currentModule?.id) ||
      `catalog-module:${moduleSlug}`,
    slug: moduleSlug,
    name: moduleName,
    ...(clean(currentModule?.description) || clean(moduleRecord?.description)
      ? {
          description:
            clean(currentModule?.description) ||
            clean(moduleRecord?.description),
        }
      : undefined),
    // A catalog response is metadata, not an authorization revocation
    // channel. Preserve an authenticated active flag, but never import a
    // disabled flag capable of changing the meaning of the JWT grant.
    ...(typeof currentModule?.active === "boolean"
      ? { active: currentModule.active }
      : undefined),
  } satisfies NonNullable<UserPermission["module"]>;

  return {
    ...grant,
    ...(!clean(grant.action) && metadataAction.value
      ? { action: metadataAction.value }
      : undefined),
    ...(moduleId ? { module_id: moduleId } : undefined),
    module: enrichedModule,
  };
}

function metadataCorrespondsToGrant(
  grant: UserPermission,
  candidate: UserPermission,
  expectedCompanyId: string,
) {
  const grantSlug = normalize(grant.slug);
  const candidateSlug = normalize(candidate.slug);
  if (!grantSlug || !candidateSlug) return false;
  if (!companyScopesAreCompatible(grant, candidate, expectedCompanyId)) {
    return false;
  }
  if (!moduleScopesAreCompatible(grant, candidate)) return false;

  if (grantSlug === candidateSlug) {
    const declaredGrantAction = normalize(grant.action);
    const candidateAction = normalize(candidate.action);
    return !(
      declaredGrantAction &&
      candidateAction &&
      declaredGrantAction !== candidateAction
    );
  }

  const grantAction = normalize(grant.action) || grantSlug;
  const candidateAction = normalize(candidate.action);
  return Boolean(
    candidateAction &&
      candidateAction === grantAction &&
      modulesShareIdentity(grant, candidate),
  );
}

function companyScopesAreCompatible(
  grant: UserPermission,
  candidate: UserPermission,
  expectedCompanyId: string,
) {
  const grantCompanyId = clean(grant.company_id);
  const candidateCompanyId = clean(candidate.company_id);
  if (
    expectedCompanyId &&
    ((grantCompanyId && grantCompanyId !== expectedCompanyId) ||
      (candidateCompanyId && candidateCompanyId !== expectedCompanyId))
  ) {
    return false;
  }
  return !(
    grantCompanyId &&
    candidateCompanyId &&
    grantCompanyId !== candidateCompanyId
  );
}

function moduleScopesAreCompatible(
  grant: UserPermission,
  candidate: UserPermission,
) {
  const grantModuleId = stableModuleId(grant);
  const candidateModuleId = stableModuleId(candidate);
  if (
    grantModuleId &&
    candidateModuleId &&
    grantModuleId !== candidateModuleId
  ) {
    return false;
  }

  const grantModuleSlug = normalize(grant.module?.slug);
  const candidateModuleSlug = normalize(candidate.module?.slug);
  return !(
    grantModuleSlug &&
    candidateModuleSlug &&
    grantModuleSlug !== candidateModuleSlug
  );
}

function modulesShareIdentity(
  grant: UserPermission,
  candidate: UserPermission,
) {
  const grantModuleId = stableModuleId(grant);
  const candidateModuleId = stableModuleId(candidate);
  if (grantModuleId && candidateModuleId) {
    return grantModuleId === candidateModuleId;
  }

  const grantModuleSlug = normalize(grant.module?.slug);
  const candidateModuleSlug = normalize(candidate.module?.slug);
  return Boolean(
    grantModuleSlug &&
      candidateModuleSlug &&
      grantModuleSlug === candidateModuleSlug,
  );
}

function hasAmbiguousMetadata(matches: readonly UserPermission[]) {
  return (
    uniqueValue(matches.map((candidate) => stableModuleId(candidate))).conflict ||
    uniqueValue(matches.map((candidate) => clean(candidate.module?.slug))).conflict ||
    uniqueValue(matches.map((candidate) => normalize(candidate.action))).conflict
  );
}

function selectRichestModule(matches: readonly UserPermission[]) {
  return matches
    .map((candidate) => candidate.module)
    .filter(
      (module): module is NonNullable<UserPermission["module"]> =>
        Boolean(module),
    )
    .sort((left, right) => moduleMetadataScore(right) - moduleMetadataScore(left))[0];
}

function moduleMetadataScore(module: NonNullable<UserPermission["module"]>) {
  return [module.id, module.slug, module.name, module.description].filter(
    (value) => clean(value),
  ).length;
}

function stableModuleId(permission: UserPermission) {
  const declaredId = clean(permission.module_id);
  if (declaredId) return declaredId;
  const nestedId = clean(permission.module?.id);
  return nestedId.startsWith("jwt-module:") ? "" : nestedId;
}

function uniqueValue(values: string[]) {
  const unique = new Set(values.filter(Boolean));
  return {
    conflict: unique.size > 1,
    value: unique.size === 1 ? [...unique][0] : "",
  };
}

function normalize(value: unknown) {
  return clean(value).toLowerCase();
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
