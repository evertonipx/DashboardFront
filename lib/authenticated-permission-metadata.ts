import type {
  CurrentUserCompanyModule,
  UserPermission,
} from "@/lib/types";

/**
 * Enriches company-module assignments already declared by the authenticated
 * JWT with the richer records exposed by GET /company/modules.
 *
 * The endpoint cannot add an assignment omitted by the JWT. A matching,
 * explicitly disabled endpoint record can only reduce access, while missing or
 * unrelated metadata leaves the signed assignment unchanged.
 */
export function enrichAuthenticatedCompanyModuleMetadata(
  authenticatedAssignments: readonly CurrentUserCompanyModule[],
  metadata: readonly CurrentUserCompanyModule[],
  expectedCompanyId = "",
) {
  const expectedCompany = clean(expectedCompanyId);
  return authenticatedAssignments
    .filter((assignment) =>
      companyModuleBelongsToCompany(assignment, expectedCompany) &&
      !companyModuleHasConflictingIdentity(assignment),
    )
    .map((assignment) => {
      const matches = metadata.filter(
        (candidate) =>
          companyModuleBelongsToCompany(candidate, expectedCompany) &&
          !companyModuleHasConflictingIdentity(candidate) &&
          companyModulesShareIdentity(assignment, candidate),
      );
      if (!matches.length) return assignment;
      if (companyModuleMetadataIsAmbiguous(matches)) {
        return { ...assignment, enabled: false };
      }

      const candidate = selectRichestCompanyModule(matches);
      if (!candidate) return assignment;
      const candidateModuleId = stableCompanyModuleId(candidate);
      const currentModuleId = stableCompanyModuleId(assignment);
      const moduleId = currentModuleId || candidateModuleId || assignment.module_id;
      const enrichedModule = mergeCompanyModuleMetadata(
        assignment,
        candidate,
        moduleId,
      );
      return {
        ...assignment,
        ...(expectedCompany && !clean(assignment.company_id)
          ? { company_id: expectedCompany }
          : undefined),
        // A negative value from either authenticated source wins. This never
        // elevates a disabled JWT assignment when the endpoint says enabled.
        enabled: assignment.enabled && matches.every((match) => match.enabled),
        module_id: moduleId,
        ...(enrichedModule ? { module: enrichedModule } : undefined),
      };
    });
}

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

/**
 * Certifies records returned by the user-specific Swagger assignment route.
 * Unlike the global `/permissions` catalogue, every row from
 * `/users/{id}/permissions` must name the authenticated user before it can be
 * used to enrich a signed grant.
 */
export function certifyAuthenticatedUserPermissionMetadata(
  metadata: readonly UserPermission[],
  expectedUserId: string,
  expectedCompanyId = "",
) {
  const userId = clean(expectedUserId);
  const companyId = clean(expectedCompanyId);
  if (!userId || !Array.isArray(metadata)) return [];

  return metadata.filter((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const record = candidate as UserPermission & Record<string, unknown>;
    const candidateUser = resolveIdentifierAliases(record, [
      "user_id",
      "userId",
    ]);
    const candidateCompany = resolveIdentifierAliases(record, [
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    return Boolean(
      !candidateUser.invalid &&
        candidateUser.value &&
        sameIdentifier(candidateUser.value, userId) &&
        !candidateCompany.invalid &&
        (!companyId ||
          !candidateCompany.value ||
          sameIdentifier(candidateCompany.value, companyId)),
    );
  });
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

function companyModuleBelongsToCompany(
  assignment: CurrentUserCompanyModule,
  expectedCompanyId: string,
) {
  const companyId = clean(assignment.company_id);
  return !expectedCompanyId || !companyId || normalize(companyId) === normalize(expectedCompanyId);
}

function companyModulesShareIdentity(
  left: CurrentUserCompanyModule,
  right: CurrentUserCompanyModule,
) {
  const leftId = stableCompanyModuleId(left);
  const rightId = stableCompanyModuleId(right);
  const leftSlug = normalizeModuleIdentity(left.module?.slug);
  const rightSlug = normalizeModuleIdentity(right.module?.slug);
  if (leftId && rightId) {
    return Boolean(
      normalize(leftId) === normalize(rightId) &&
        (!leftSlug || !rightSlug || leftSlug === rightSlug),
    );
  }
  return Boolean(leftSlug && rightSlug && leftSlug === rightSlug);
}

function companyModuleHasConflictingIdentity(
  assignment: CurrentUserCompanyModule,
) {
  const declaredId = clean(assignment.module_id);
  const nestedId = clean(assignment.module?.id);
  return Boolean(
    declaredId &&
      nestedId &&
      !declaredId.startsWith("jwt-module:") &&
      !nestedId.startsWith("jwt-module:") &&
      normalize(declaredId) !== normalize(nestedId),
  );
}

function companyModuleMetadataIsAmbiguous(
  matches: readonly CurrentUserCompanyModule[],
) {
  return (
    uniqueValue(matches.map(stableCompanyModuleId)).conflict ||
    uniqueValue(
      matches.map((candidate) => normalizeModuleIdentity(candidate.module?.slug)),
    ).conflict
  );
}

function selectRichestCompanyModule(
  matches: readonly CurrentUserCompanyModule[],
) {
  return [...matches].sort(
    (left, right) =>
      companyModuleMetadataScore(right) - companyModuleMetadataScore(left),
  )[0];
}

function companyModuleMetadataScore(assignment: CurrentUserCompanyModule) {
  return [
    stableCompanyModuleId(assignment),
    assignment.module?.slug,
    assignment.module?.name,
    assignment.module?.description,
  ].filter((value) => clean(value)).length;
}

function mergeCompanyModuleMetadata(
  authenticated: CurrentUserCompanyModule,
  candidate: CurrentUserCompanyModule,
  moduleId: string,
): CurrentUserCompanyModule["module"] | undefined {
  const authenticatedModule = authenticated.module;
  const candidateModule = candidate.module;
  const slug = clean(authenticatedModule?.slug) || clean(candidateModule?.slug);
  const name =
    clean(authenticatedModule?.name) || clean(candidateModule?.name) || slug;
  if (!slug || !name) return authenticatedModule;

  const active =
    authenticatedModule?.active === false || candidateModule?.active === false
      ? false
      : authenticatedModule?.active ?? candidateModule?.active;
  const description =
    clean(authenticatedModule?.description) || clean(candidateModule?.description);
  return {
    id:
      stableCompanyModuleId(candidate) ||
      stableCompanyModuleId(authenticated) ||
      moduleId,
    slug,
    name,
    ...(description ? { description } : undefined),
    ...(typeof active === "boolean" ? { active } : undefined),
  };
}

function stableCompanyModuleId(assignment: CurrentUserCompanyModule) {
  const declaredId = clean(assignment.module_id);
  if (declaredId && !declaredId.startsWith("jwt-module:")) return declaredId;
  const nestedId = clean(assignment.module?.id);
  return nestedId.startsWith("jwt-module:") ? "" : nestedId;
}

function normalizeModuleIdentity(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function sameIdentifier(left: string, right: string) {
  if (left === right) return true;
  return isUuid(left) && isUuid(right) && left.toLowerCase() === right.toLowerCase();
}

function resolveIdentifierAliases(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  const values: string[] = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = clean(record[key]);
    if (!value) return { invalid: true, value: "" };
    if (!values.some((candidate) => sameIdentifier(candidate, value))) {
      values.push(value);
    }
  }
  return {
    invalid: values.length > 1,
    value: values.length === 1 ? values[0] : "",
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
