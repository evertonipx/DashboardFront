import type { CurrentUser, UserPermission } from "@/lib/types";
import { isMasterUser, normalizeRole } from "@/lib/user-role";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import { resolveCurrentUserCompanyTimeZone } from "@/lib/company-time-zone-record";

const JWT_CLOCK_SKEW_SECONDS = 60;

type AccessTokenClaims = Record<string, unknown> & {
  access?: unknown;
  authorization?: unknown;
  company?: unknown;
  companyId?: unknown;
  company_id?: unknown;
  exp?: unknown;
  iat?: unknown;
  isMaster?: unknown;
  is_master?: unknown;
  nbf?: unknown;
  role?: unknown;
  sub?: unknown;
  tenant?: unknown;
  tenantId?: unknown;
  tenant_id?: unknown;
  companyTimeZone?: unknown;
  companyTimezone?: unknown;
  company_time_zone?: unknown;
  company_timezone?: unknown;
  tenantTimezone?: unknown;
  tenant_timezone?: unknown;
  timeZone?: unknown;
  time_zone?: unknown;
  timezone?: unknown;
  tz?: unknown;
  metadata?: unknown;
  permissionSlugs?: unknown;
  permission_slugs?: unknown;
  permissions?: unknown;
  settings?: unknown;
  userId?: unknown;
  user_id?: unknown;
  user?: unknown;
};

export type AccessTokenContext = {
  companyId: string;
  expiresAt: number | null;
  issuedAt: number | null;
  isMaster: boolean;
  notBefore: number | null;
  role: string;
  timeZone: string;
  userId: string;
};

type UserIdentityClaimKind = "none" | "subject" | "user-id";

type UserIdentityResolution = {
  conflict: boolean;
  kind: UserIdentityClaimKind;
  value: string;
};

/**
 * Decodes the authenticated context carried by the access JWT. This is a UI
 * context only: the browser cannot verify the JWT signature and must never use
 * these claims as the API authorization boundary. The backend validates the
 * same token on every request.
 *
 * The snake_case names are the contract currently emitted by IPXData. A small
 * allowlist of aliases is accepted for rolling backend migrations. Conflicts
 * in identity/authorization claims invalidate the context. Timezone is only
 * operational metadata, so an invalid value leaves that field unresolved
 * without invalidating the authenticated identity.
 */
export function resolveAccessTokenContext(
  accessToken: string,
  nowMilliseconds = Date.now(),
): AccessTokenContext | null {
  const claims = decodeAccessTokenClaims(accessToken);
  if (!claims || !claimsAreActive(claims, nowMilliseconds)) return null;

  const company = resolveCompanyIdentityClaims(claims);
  const user = resolveUserIdentityClaims(claims);
  const roleClaim = resolveStringAliases(claims, ["role"]);
  const timeZone = resolveCompanyTimeZoneClaims(claims, company.value);
  const master = resolveBooleanAliases(claims, ["is_master", "isMaster"]);
  const expiresAt = numericDateClaim(claims, "exp");
  const issuedAt = numericDateClaim(claims, "iat");
  const notBefore = numericDateClaim(claims, "nbf");

  if (
    company.conflict ||
    user.conflict ||
    roleClaim.conflict ||
    master.conflict ||
    expiresAt.invalid ||
    issuedAt.invalid ||
    notBefore.invalid
  ) {
    return null;
  }

  const role = normalizeRole(roleClaim.value) ?? roleClaim.value;
  return {
    companyId: company.value,
    expiresAt: expiresAt.value,
    issuedAt: issuedAt.value,
    isMaster: master.value === true || role === "super-admin",
    notBefore: notBefore.value,
    role,
    timeZone,
    userId: user.value,
  };
}

export function accessTokenExpirationMilliseconds(accessToken: string) {
  const claims = decodeAccessTokenClaims(accessToken);
  const expiration = claims ? numericDateClaim(claims, "exp") : null;
  return expiration && !expiration.invalid && expiration.value !== null
    ? expiration.value * 1000
    : null;
}

export function accessTokenDeclaresMasterAccess(
  accessToken: string,
  nowMilliseconds = Date.now(),
) {
  return resolveAccessTokenContext(accessToken, nowMilliseconds)?.isMaster ?? false;
}

export function accessTokenMatchesUserIdentity(
  accessToken: string,
  user: CurrentUser,
  nowMilliseconds = Date.now(),
) {
  const claims = decodeAccessTokenClaims(accessToken);
  if (!claims || !claimsAreActive(claims, nowMilliseconds)) return false;
  const identity = resolveUserIdentityClaims(claims);
  return Boolean(
    !identity.conflict &&
      identity.value &&
      tokenIdentityMatchesCurrentUser(identity, user),
  );
}

export function accessTokensShareUserIdentity(
  previousAccessToken: string,
  nextAccessToken: string,
  nowMilliseconds = Date.now(),
) {
  const previousClaims = decodeAccessTokenClaims(previousAccessToken);
  const previousUser = previousClaims
    ? resolveUserIdentityClaims(previousClaims)
    : null;
  const previousUserId = previousUser && !previousUser.conflict
    ? previousUser.value
    : "";
  const nextUserId = resolveAccessTokenContext(
    nextAccessToken,
    nowMilliseconds,
  )?.userId;
  return Boolean(
    previousUserId &&
      nextUserId &&
      previousUserId === nextUserId,
  );
}

/**
 * Complements metadata omitted by /auth/me with claims from the same access
 * token that authenticated that request. This only controls frontend
 * navigation; every API operation remains authorized by the backend.
 */
export function enrichCurrentUserFromAccessToken(
  user: CurrentUser,
  accessToken: string,
  nowMilliseconds = Date.now(),
): CurrentUser {
  const context = resolveAccessTokenContext(accessToken, nowMilliseconds);
  const claims = decodeAccessTokenClaims(accessToken);
  const identity = claims ? resolveUserIdentityClaims(claims) : null;
  if (
    !claims ||
    !context ||
    !identity ||
    identity.conflict ||
    !contextMatchesCurrentUser(context, identity, user)
  ) {
    return user;
  }

  const userId = cleanString(user.id) || context.userId;
  const companyId = resolveUserCompanyId(user) || context.companyId;
  // `/auth/me` in the documented backend contract does not expose `role`.
  // When the same accepted JWT declares it, that signed session role must not
  // be masked by a stale compatibility field or a previous local snapshot.
  const role = context.role || cleanString(user.role);
  const declaredUserTimeZone =
    resolveCurrentUserCompanyTimeZone(user).timeZone ?? "";
  const companyTimeZone =
    declaredUserTimeZone ||
    (companyId && context.companyId && companyId !== context.companyId
      ? ""
      : context.timeZone);
  const permissionClaims = resolvePermissionClaims(
    claims,
    companyId || context.companyId,
  );
  // A declared list (including []) is authoritative for the accepted JWT.
  // Invalid/conflicting declarations fail closed instead of falling through
  // to an endpoint or `/auth/me` list that could manufacture session access.
  const claimedPermissions = permissionClaims.declared
    ? permissionClaims.invalid
      ? []
      : permissionClaims.permissions
    : null;
  // Authorization metadata may be split during a backend rollout: older
  // /auth/me payloads can still report `is_master: false` while the signed JWT
  // already carries `role: super-admin` (and the API authorizes it as such).
  // Use the additive rule shared by the server routes; the backend remains the
  // authorization boundary for every privileged operation.
  const isMaster = user.is_master === true || context.isMaster;

  if (
    userId === cleanString(user.id) &&
    companyId === resolveUserCompanyId(user) &&
    role === cleanString(user.role) &&
    companyTimeZone === declaredUserTimeZone &&
    isMaster === user.is_master &&
    claimedPermissions === null
  ) {
    return user;
  }

  return {
    ...user,
    id: userId,
    company_id: companyId || user.company_id,
    company:
      user.company && !cleanString(user.company.id) && companyId
        ? { ...user.company, id: companyId }
        : user.company,
    company_timezone: companyTimeZone || user.company_timezone,
    is_master: isMaster,
    ...(claimedPermissions !== null
      ? { permissions: claimedPermissions }
      : undefined),
    role: role || user.role,
  };
}

/**
 * Preserves same-tenant operational metadata even while unrelated JWT claims
 * are being migrated. `/auth/me` has authenticated this exact token and binds
 * the timezone to its explicit company_id; authorization still comes from the
 * backend and is deliberately not inferred by this compatibility path.
 */
function enrichCurrentUserOperationalMetadata(
  user: CurrentUser,
  claims: AccessTokenClaims,
) {
  const companyId = resolveUserCompanyId(user);
  const existingTimeZone =
    resolveCurrentUserCompanyTimeZone(user).timeZone ?? "";
  if (existingTimeZone) {
    return cleanString(user.company_timezone) === existingTimeZone
      ? user
      : { ...user, company_timezone: existingTimeZone };
  }

  const claimedCompany = resolveCompanyIdentityClaims(claims);
  const claimedTimeZone = resolveAuthenticatedCompanyTimeZoneClaims(
    claims,
    companyId,
  );
  if (
    !companyId ||
    claimedCompany.conflict ||
    (claimedCompany.value &&
      !sameIdentifier(companyId, claimedCompany.value)) ||
    !claimedTimeZone
  ) {
    return user;
  }

  return { ...user, company_timezone: claimedTimeZone };
}

/**
 * Reconciles `/auth/me` with the JWT that authenticated that exact request.
 * Explicit fields from `/auth/me` win; claims only fill omissions. A declared
 * identity/company conflict invalidates the response instead of switching the
 * active tenant in the browser.
 */
export function reconcileCurrentUserWithAccessToken(
  user: CurrentUser,
  accessToken: string,
  nowMilliseconds = Date.now(),
): CurrentUser | null {
  if (!user || typeof user !== "object" || !cleanString(user.id)) return null;
  const claims = decodeAccessTokenClaims(accessToken);
  if (!claims) return user;
  const operationallyEnrichedUser = enrichCurrentUserOperationalMetadata(
    user,
    claims,
  );
  const context = resolveAccessTokenContext(accessToken, nowMilliseconds);
  if (!context) return operationallyEnrichedUser;
  const identity = resolveUserIdentityClaims(claims);
  if (
    identity.conflict ||
    !contextMatchesCurrentUser(context, identity, user)
  ) {
    // `/auth/me` authenticated this exact Bearer. A JWT schema migration must
    // not manufacture a logout; incompatible local claims simply cannot add
    // role, tenant or master metadata to the response.
    return operationallyEnrichedUser;
  }
  return enrichCurrentUserFromAccessToken(
    operationallyEnrichedUser,
    accessToken,
    nowMilliseconds,
  );
}

export function decodeAccessTokenClaims(
  accessToken: string,
): AccessTokenClaims | null {
  const parts = accessToken.trim().split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const decoded = decodeBase64Url(parts[1]);
    const claims = JSON.parse(decoded) as unknown;
    return isRecord(claims) ? (claims as AccessTokenClaims) : null;
  } catch {
    return null;
  }
}

function contextMatchesCurrentUser(
  context: AccessTokenContext,
  identity: UserIdentityResolution,
  user: CurrentUser,
) {
  const userId = cleanString(user.id);
  const userCompanyId = resolveUserCompanyId(user);
  if (
    userId &&
    (!context.userId || !tokenIdentityMatchesCurrentUser(identity, user))
  ) {
    return false;
  }
  if (
    userCompanyId &&
    context.companyId &&
    context.companyId !== userCompanyId &&
    !context.isMaster &&
    !isMasterUser(user)
  ) {
    return false;
  }
  return Boolean(userId || context.userId);
}

function claimsAreActive(
  claims: AccessTokenClaims,
  nowMilliseconds: number,
) {
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  const expiresAt = numericDateClaim(claims, "exp");
  if (expiresAt.invalid) return false;
  if (expiresAt.value !== null && expiresAt.value <= nowSeconds) return false;

  const notBefore = numericDateClaim(claims, "nbf");
  if (notBefore.invalid) return false;
  if (
    notBefore.value !== null &&
    notBefore.value > nowSeconds + JWT_CLOCK_SKEW_SECONDS
  ) {
    return false;
  }

  const issuedAt = numericDateClaim(claims, "iat");
  if (issuedAt.invalid) return false;

  return true;
}

function resolveUserCompanyId(user: CurrentUser) {
  return cleanString(user.company_id) || cleanString(user.company?.id);
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error("Payload JWT inválido.");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function resolveStringAliases(
  claims: AccessTokenClaims,
  keys: readonly string[],
) {
  const values = new Set<string>();
  for (const key of keys) {
    const raw = claims[key];
    if (raw === undefined || raw === null) continue;
    const value = cleanString(raw);
    if (!value) return { conflict: true, value: "" };
    values.add(value);
  }
  return {
    conflict: values.size > 1,
    value: values.size === 1 ? [...values][0] : "",
  };
}

function resolveCompanyIdentityClaims(claims: AccessTokenClaims) {
  const direct = resolveStringAliases(claims, [
    "company_id",
    "companyId",
    "tenant_id",
    "tenantId",
  ]);
  if (direct.conflict) return direct;
  const values = new Set<string>();
  if (direct.value) values.add(direct.value);

  for (const key of ["company", "tenant"] as const) {
    const nested = asRecord(claims[key]);
    if (!nested) continue;
    const resolution = resolveStringAliases(nested, [
      "id",
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    if (resolution.conflict) return resolution;
    if (resolution.value) values.add(resolution.value);
  }

  return {
    conflict: values.size > 1,
    value: values.size === 1 ? [...values][0] : "",
  };
}

function resolveUserIdentityClaims(
  claims: AccessTokenClaims,
): UserIdentityResolution {
  // `user_id` is the application identity. `sub` is the generic JWT subject
  // and may legitimately be an e-mail, username or identity-provider key.
  const applicationId = resolveStringAliases(claims, ["user_id", "userId"]);
  if (applicationId.conflict || applicationId.value) {
    return { ...applicationId, kind: "user-id" };
  }

  const subject = resolveStringAliases(claims, ["sub"]);
  if (subject.conflict || subject.value) {
    return { ...subject, kind: "subject" };
  }

  return { conflict: false, kind: "none", value: "" };
}

function tokenIdentityMatchesCurrentUser(
  identity: UserIdentityResolution,
  user: CurrentUser,
) {
  const userId = cleanString(user.id);
  if (userId && sameIdentifier(identity.value, userId)) return true;
  if (identity.kind !== "subject") return false;

  const email = cleanString(user.email);
  return Boolean(email && identity.value.toLowerCase() === email.toLowerCase());
}

function sameIdentifier(left: string, right: string) {
  if (left === right) return true;
  return isUuid(left) && isUuid(right) && left.toLowerCase() === right.toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function resolvePermissionClaims(
  claims: AccessTokenClaims,
  expectedCompanyId: string,
): {
  declared: boolean;
  invalid: boolean;
  permissions: UserPermission[];
} {
  const sources = [
    claims,
    asRecord(claims.authorization),
    asRecord(claims.access),
    asRecord(claims.user),
  ].filter((source): source is Record<string, unknown> => Boolean(source));
  const declarations: UserPermission[][] = [];
  let declared = false;

  for (const source of sources) {
    const declaredKeys = [
      "permissions",
      "permission_slugs",
      "permissionSlugs",
    ].filter((key) => Object.prototype.hasOwnProperty.call(source, key));
    if (!declaredKeys.length) continue;
    declared = true;

    const sourceCompany = resolveStringAliases(source, [
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    if (
      sourceCompany.conflict ||
      (sourceCompany.value &&
        expectedCompanyId &&
        sourceCompany.value !== expectedCompanyId)
    ) {
      return { declared: true, invalid: true, permissions: [] };
    }
    for (const key of declaredKeys) {
      const parsed = parsePermissionClaimList(source[key], expectedCompanyId);
      if (!parsed) {
        return { declared: true, invalid: true, permissions: [] };
      }
      declarations.push(parsed);
    }
  }

  if (!declared || !declarations.length) {
    return { declared: false, invalid: false, permissions: [] };
  }
  const expectedSlugs = permissionClaimSignature(declarations[0]);
  if (
    declarations.some(
      (permissions) => permissionClaimSignature(permissions) !== expectedSlugs,
    )
  ) {
    return { declared: true, invalid: true, permissions: [] };
  }

  return {
    declared: true,
    invalid: false,
    permissions: declarations[0],
  };
}

function parsePermissionClaimList(
  value: unknown,
  expectedCompanyId: string,
): UserPermission[] | null {
  if (!Array.isArray(value)) return null;

  const permissions = new Map<string, UserPermission>();
  for (const item of value) {
    if (typeof item === "string") {
      const slug = cleanString(item);
      if (!slug) return null;
      const permission = { id: `jwt:${slug}`, slug };
      permissions.set(permissionClaimGrantSignature(permission), permission);
      continue;
    }

    const record = asRecord(item);
    const slug = cleanString(record?.slug);
    if (!record || !slug) return null;
    const permissionCompany = resolveStringAliases(record, [
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    if (
      permissionCompany.conflict ||
      (permissionCompany.value &&
        expectedCompanyId &&
        permissionCompany.value !== expectedCompanyId)
    ) {
      return null;
    }
    if (permissionClaimIsDenied(record)) continue;

    const permissionModule = resolvePermissionModuleClaim(record);
    if (permissionModule.invalid) return null;

    const permission: UserPermission = {
      id: cleanString(record.id) || `jwt:${slug}`,
      slug,
      ...(permissionModule.moduleId
        ? { module_id: permissionModule.moduleId }
        : undefined),
      ...(permissionModule.module
        ? { module: permissionModule.module }
        : undefined),
      ...(typeof record.action === "string"
        ? { action: record.action }
        : undefined),
      ...(typeof record.can_view === "boolean"
        ? { can_view: record.can_view }
        : undefined),
      ...(typeof record.can_create === "boolean"
        ? { can_create: record.can_create }
        : undefined),
      ...(typeof record.can_edit === "boolean"
        ? { can_edit: record.can_edit }
        : undefined),
      ...(typeof record.can_delete === "boolean"
        ? { can_delete: record.can_delete }
        : undefined),
      ...(typeof record.can_export === "boolean"
        ? { can_export: record.can_export }
        : undefined),
    };
    permissions.set(permissionClaimGrantSignature(permission), permission);
  }

  return [...permissions.values()];
}

function resolvePermissionModuleClaim(record: Record<string, unknown>): {
  invalid: boolean;
  module?: UserPermission["module"];
  moduleId?: string;
} {
  const declaredModuleId = resolveStringAliases(record, [
    "module_id",
    "moduleId",
  ]);
  if (declaredModuleId.conflict) return { invalid: true };

  const rawModule = record.module;
  if (rawModule === undefined || rawModule === null) {
    return {
      invalid: false,
      ...(declaredModuleId.value
        ? { moduleId: declaredModuleId.value }
        : undefined),
    };
  }

  const moduleRecord = asRecord(rawModule);
  if (!moduleRecord) return { invalid: true };

  const nestedModuleId = resolveStringAliases(moduleRecord, [
    "id",
    "module_id",
    "moduleId",
  ]);
  const nestedModuleSlug = resolveStringAliases(moduleRecord, ["slug"]);
  const nestedModuleName = resolveStringAliases(moduleRecord, ["name"]);
  if (
    nestedModuleId.conflict ||
    nestedModuleSlug.conflict ||
    nestedModuleName.conflict ||
    !nestedModuleSlug.value ||
    (declaredModuleId.value &&
      nestedModuleId.value &&
      declaredModuleId.value !== nestedModuleId.value)
  ) {
    return { invalid: true };
  }

  if (
    Object.prototype.hasOwnProperty.call(moduleRecord, "active") &&
    moduleRecord.active !== undefined &&
    moduleRecord.active !== null &&
    typeof moduleRecord.active !== "boolean"
  ) {
    return { invalid: true };
  }
  if (
    Object.prototype.hasOwnProperty.call(moduleRecord, "description") &&
    moduleRecord.description !== undefined &&
    moduleRecord.description !== null &&
    typeof moduleRecord.description !== "string"
  ) {
    return { invalid: true };
  }

  const moduleId = declaredModuleId.value || nestedModuleId.value;
  const moduleSlug = nestedModuleSlug.value;
  const moduleName = nestedModuleName.value || moduleSlug;
  return {
    invalid: false,
    ...(moduleId ? { moduleId } : undefined),
    module: {
      id: moduleId || `jwt-module:${moduleSlug}`,
      slug: moduleSlug,
      name: moduleName,
      ...(typeof moduleRecord.description === "string"
        ? { description: moduleRecord.description }
        : undefined),
      ...(typeof moduleRecord.active === "boolean"
        ? { active: moduleRecord.active }
        : undefined),
    },
  };
}

function permissionClaimIsDenied(record: Record<string, unknown>) {
  if (record.denied === true) return true;
  const effect = cleanString(record.effect).toLowerCase();
  if (effect === "deny" || effect === "denied") return true;
  if (
    ["granted", "allowed", "enabled", "active"].some(
      (key) => record[key] === false,
    )
  ) {
    return true;
  }

  const permissionModule = asRecord(record.module);
  if (permissionModule?.active === false) return true;

  const capabilities = [
    record.can_view,
    record.can_create,
    record.can_edit,
    record.can_delete,
    record.can_export,
  ].filter((capability): capability is boolean =>
    typeof capability === "boolean"
  );
  return capabilities.length > 0 && !capabilities.some(Boolean);
}

function permissionClaimSignature(permissions: UserPermission[]) {
  return permissions
    .map(permissionClaimGrantSignature)
    .sort((left, right) => left.localeCompare(right))
    .join("\u0000");
}

function permissionClaimGrantSignature(permission: UserPermission) {
  return JSON.stringify([
    permission.slug,
    permission.action ?? null,
    permission.module_id ?? null,
    permission.module?.id ?? null,
    permission.module?.slug ?? null,
    permission.module?.name ?? null,
    permission.module?.active ?? null,
    permission.can_view ?? null,
    permission.can_create ?? null,
    permission.can_edit ?? null,
    permission.can_delete ?? null,
    permission.can_export ?? null,
  ]);
}

/**
 * Company-specific claims are authoritative for civil data. Generic
 * `timezone`/`tz` claims are migration fallbacks only, so a stale generic
 * alias cannot erase a valid `company_timezone` emitted by the backend.
 */
function resolveCompanyTimeZoneClaims(
  claims: AccessTokenClaims,
  expectedCompanyId = "",
) {
  const companyIdentity = resolveCompanyIdentityClaims(claims);
  const companyId = expectedCompanyId || companyIdentity.value;
  if (
    companyIdentity.conflict ||
    !companyId ||
    (companyIdentity.value &&
      !sameIdentifier(companyIdentity.value, companyId))
  ) {
    return "";
  }

  const sources: Record<string, unknown>[] = [
    claims,
    asRecord(claims.settings),
    asRecord(claims.metadata),
  ].filter((source): source is Record<string, unknown> => Boolean(source));

  const user = asRecord(claims.user);
  for (const nestedValue of [
    claims.company,
    claims.tenant,
    user?.company,
    user?.tenant,
  ]) {
    const nested = asRecord(nestedValue);
    if (!nested) continue;
    const nestedIdentity = resolveStringAliases(nested, [
      "id",
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    if (
      nestedIdentity.conflict ||
      (nestedIdentity.value &&
        !sameIdentifier(nestedIdentity.value, companyId))
    ) {
      continue;
    }
    sources.push(nested);
    const settings = asRecord(nested.settings);
    const metadata = asRecord(nested.metadata);
    if (settings) sources.push(settings);
    if (metadata) sources.push(metadata);
  }

  for (const keys of [
    [
      "company_timezone",
      "companyTimezone",
      "company_time_zone",
      "companyTimeZone",
    ],
    ["tenant_timezone", "tenantTimezone"],
    ["timezone", "timeZone", "time_zone", "tz"],
  ] as const) {
    const values = new Set<string>();
    let declared = false;
    for (const source of sources) {
      const resolution = resolveCompanyTimeZoneClaimGroup(source, keys);
      if (!resolution.declared) continue;
      declared = true;
      if (!resolution.timeZone) return "";
      values.add(resolution.timeZone);
    }
    if (declared) return values.size === 1 ? [...values][0] : "";
  }
  return "";
}

function resolveAuthenticatedCompanyTimeZoneClaims(
  claims: AccessTokenClaims,
  expectedCompanyId: string,
) {
  const claimedCompany = resolveCompanyIdentityClaims(claims);
  if (
    claimedCompany.conflict ||
    (claimedCompany.value &&
      expectedCompanyId &&
      !sameIdentifier(claimedCompany.value, expectedCompanyId))
  ) {
    return "";
  }
  return resolveCompanyTimeZoneClaims(
    claims,
    expectedCompanyId || claimedCompany.value,
  );
}

function resolveCompanyTimeZoneClaimGroup(
  claims: Record<string, unknown>,
  keys: readonly string[],
) {
  const values = new Set<string>();
  let declared = false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(claims, key)) continue;
    const raw = claims[key];
    declared = true;
    if (raw === undefined || raw === null) continue;
    const timeZone = canonicalCompanyTimeZone(raw);
    if (!timeZone) return { declared: true, timeZone: "" } as const;
    values.add(timeZone);
  }
  return {
    declared,
    timeZone: values.size === 1 ? [...values][0] : "",
  } as const;
}

function resolveBooleanAliases(
  claims: AccessTokenClaims,
  keys: readonly string[],
) {
  const values = new Set<boolean>();
  for (const key of keys) {
    const raw = claims[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "boolean") return { conflict: true, value: null };
    values.add(raw);
  }
  return {
    conflict: values.size > 1,
    value: values.size === 1 ? [...values][0] : null,
  };
}

function numericDateClaim(claims: AccessTokenClaims, key: "exp" | "iat" | "nbf") {
  const value = claims[key];
  if (value === undefined || value === null) {
    return { invalid: false, value: null };
  }
  return typeof value === "number" && Number.isFinite(value)
    ? { invalid: false, value }
    : { invalid: true, value: null };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
