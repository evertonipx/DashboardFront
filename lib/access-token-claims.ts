import type { CurrentUser } from "@/lib/types";
import { normalizeRole } from "@/lib/user-role";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import { resolveCurrentUserCompanyTimeZone } from "@/lib/company-time-zone-record";

type AccessTokenClaims = Record<string, unknown> & {
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
  tenantId?: unknown;
  tenant?: unknown;
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
  settings?: unknown;
  userId?: unknown;
  user_id?: unknown;
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

export type AccessTokenMasterClaimState =
  | "invalid"
  | "master"
  | "non-master"
  | "unknown";

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
 * The snake_case names are the preferred application claims. A small allowlist
 * of aliases is accepted for rolling backend migrations, with canonical fields
 * taking precedence over generic JWT subjects and nested tenant metadata.
 * Timezone is only operational metadata, so an invalid or transitional
 * conflict leaves that field unresolved without invalidating the principal.
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
  const masterState = resolveMasterClaimState(roleClaim, master);
  const expiresAt = numericDateClaim(claims, "exp");
  const issuedAt = numericDateClaim(claims, "iat");
  const notBefore = numericDateClaim(claims, "nbf");

  if (
    company.conflict ||
    user.conflict ||
    roleClaim.conflict ||
    master.conflict ||
    masterState === "invalid" ||
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
    isMaster: masterState === "master",
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

/**
 * Distinguishes an explicit demotion from a token version that simply omits
 * authorization metadata. This is used only to keep a previously certified
 * `/auth/me` scope restrictive while the same refresh session rotates tokens.
 */
export function resolveAccessTokenMasterClaimState(
  accessToken: string,
  nowMilliseconds = Date.now(),
): AccessTokenMasterClaimState {
  const claims = decodeAccessTokenClaims(accessToken);
  if (!claims) return "unknown";
  if (!claimsAreActive(claims, nowMilliseconds)) return "invalid";

  const roleClaim = resolveStringAliases(claims, ["role"]);
  const masterClaim = resolveBooleanAliases(claims, ["is_master", "isMaster"]);
  return resolveMasterClaimState(roleClaim, masterClaim);
}

function resolveMasterClaimState(
  roleClaim: ReturnType<typeof resolveStringAliases>,
  masterClaim: ReturnType<typeof resolveBooleanAliases>,
): AccessTokenMasterClaimState {
  if (roleClaim.conflict || masterClaim.conflict) return "invalid";

  const normalizedRole = normalizeRole(roleClaim.value) ?? roleClaim.value;
  const roleDeclaresMaster = normalizedRole === "super-admin";
  const roleDeclaresNonMaster = Boolean(
    roleClaim.value && !roleDeclaresMaster,
  );
  const booleanDeclaresMaster = masterClaim.value === true;
  const booleanDeclaresNonMaster = masterClaim.value === false;

  if (
    (roleDeclaresMaster || booleanDeclaresMaster) &&
    (roleDeclaresNonMaster || booleanDeclaresNonMaster)
  ) {
    return "invalid";
  }
  if (roleDeclaresMaster || booleanDeclaresMaster) return "master";
  if (roleDeclaresNonMaster || booleanDeclaresNonMaster) return "non-master";
  return "unknown";
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

/**
 * Detects a declared principal that differs from an API-authenticated user.
 * Missing/unknown identity claims are not a mismatch: `/auth/me` remains the
 * authority and token schema migrations must not manufacture a logout.
 */
export function accessTokenExplicitlyMismatchesUserIdentity(
  accessToken: string,
  user: CurrentUser,
  nowMilliseconds = Date.now(),
) {
  const claims = decodeAccessTokenClaims(accessToken);
  if (!claims) return false;
  if (!claimsAreActive(claims, nowMilliseconds)) return true;
  const identity = resolveUserIdentityClaims(claims);
  if (identity.conflict) return true;
  return Boolean(
    identity.value && !tokenIdentityMatchesCurrentUser(identity, user),
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
  return Boolean(previousUserId && nextUserId && sameIdentifier(previousUserId, nextUserId));
}

/** Returns true only when both tokens declare comparable, different users. */
export function accessTokensExplicitlyChangeUserIdentity(
  previousAccessToken: string,
  nextAccessToken: string,
  nowMilliseconds = Date.now(),
) {
  const previousClaims = decodeAccessTokenClaims(previousAccessToken);
  const nextClaims = decodeAccessTokenClaims(nextAccessToken);
  if (
    !previousClaims ||
    !nextClaims ||
    !claimsAreActive(previousClaims, nowMilliseconds) ||
    !claimsAreActive(nextClaims, nowMilliseconds)
  ) {
    return false;
  }

  const previousUser = resolveUserIdentityClaims(previousClaims);
  const nextUser = resolveUserIdentityClaims(nextClaims);
  return Boolean(
    !previousUser.conflict &&
      !nextUser.conflict &&
      previousUser.value &&
      nextUser.value &&
      previousUser.kind === nextUser.kind &&
      !sameIdentifier(previousUser.value, nextUser.value),
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
    !context ||
    !identity ||
    identity.conflict ||
    !contextMatchesCurrentUser(context, identity, user)
  ) {
    return user;
  }

  return enrichCurrentUserFromContext(user, context);
}

function enrichCurrentUserFromContext(
  user: CurrentUser,
  context: AccessTokenContext,
  options: { includeAuthorizationMetadata?: boolean } = {},
) {
  const includeAuthorizationMetadata =
    options.includeAuthorizationMetadata !== false;
  const explicitCompanyId = resolveUserCompanyId(user);
  const contextCompanyIsCompatible = Boolean(
    !explicitCompanyId ||
      !context.companyId ||
      sameIdentifier(explicitCompanyId, context.companyId),
  );

  const userId =
    cleanString(user.id) ||
    (includeAuthorizationMetadata ? context.userId : "");
  const companyId =
    explicitCompanyId ||
    (contextCompanyIsCompatible ? context.companyId : "");
  const role =
    cleanString(user.role) ||
    (includeAuthorizationMetadata ? context.role : "");
  const declaredUserTimeZone =
    resolveCurrentUserCompanyTimeZone(user).timeZone ?? "";
  const companyTimeZone =
    declaredUserTimeZone ||
    (contextCompanyIsCompatible ? context.timeZone : "");
  const isMaster =
    typeof user.is_master === "boolean"
      ? user.is_master
      : includeAuthorizationMetadata
        ? context.isMaster
        : user.is_master;

  if (
    userId === cleanString(user.id) &&
    companyId === resolveUserCompanyId(user) &&
    role === cleanString(user.role) &&
    companyTimeZone === declaredUserTimeZone &&
    isMaster === user.is_master
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
    role: role || user.role,
  };
}

function enrichCurrentUserOperationalMetadata(
  user: CurrentUser,
  claims: AccessTokenClaims,
) {
  const explicitCompanyId = resolveUserCompanyId(user);
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
    explicitCompanyId,
  );
  if (
    !explicitCompanyId ||
    claimedCompany.conflict ||
    (claimedCompany.value &&
      !sameIdentifier(explicitCompanyId, claimedCompany.value)) ||
    !claimedTimeZone
  ) {
    return user;
  }

  // `/auth/me` authenticated this exact Bearer and explicitly identified the
  // tenant. Timezone can therefore complete that company even if unrelated
  // role, subject or NumericDate claims are in a backend schema migration.
  // Authorization metadata is deliberately not copied through this path.
  return { ...user, company_timezone: claimedTimeZone };
}

/**
 * Reconciles `/auth/me` with the JWT that authenticated that exact request.
 * A successful `/auth/me` response is the identity authority because the API
 * has already validated that exact Bearer token. Locally decoded claims are
 * unverified UI metadata: they may fill omissions only when compatible, but a
 * backend claim migration must not reject an authenticated API response.
 */
export function reconcileCurrentUserWithAccessToken(
  user: CurrentUser,
  accessToken: string,
  nowMilliseconds = Date.now(),
): CurrentUser | null {
  if (!user || typeof user !== "object") return null;
  const responseUserId = cleanString(user.id);
  if (!responseUserId) return null;

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
    // The API authenticated this profile, but locally decoded identity claims
    // cannot safely grant role/master metadata. Only a timezone tied to an
    // explicit, identical company may cross this migration boundary.
    return operationallyEnrichedUser;
  }
  return enrichCurrentUserFromContext(user, context);
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
    !sameIdentifier(context.companyId, userCompanyId)
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
  if (notBefore.value !== null && notBefore.value > nowSeconds) return false;

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
  claims: Record<string, unknown>,
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
  // Canonical claims win over migration aliases. `tenant` and nested objects
  // may describe a selected/related scope and are therefore fallbacks, not
  // aliases that must equal the signed `company_id` byte for byte.
  const direct = resolvePreferredStringClaim(claims, [
    "company_id",
    "companyId",
    "tenant_id",
    "tenantId",
  ]);
  if (direct.conflict || direct.value) return direct;

  for (const key of ["company", "tenant"] as const) {
    const record = asRecord(claims[key]);
    if (!record) continue;
    const nested = resolvePreferredStringClaim(record, [
      "id",
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    if (nested.conflict || nested.value) return nested;
  }

  return { conflict: false, value: "" };
}

function resolveUserIdentityClaims(
  claims: AccessTokenClaims,
): UserIdentityResolution {
  // `sub` is the JWT subject. It is commonly an email, username or provider
  // subject and is not contractually the same field as the application's
  // `user_id`. Prefer the explicit application ID and use `sub` only when that
  // ID is absent.
  const applicationId = resolvePreferredStringClaim(claims, [
    "user_id",
    "userId",
  ]);
  if (applicationId.conflict || applicationId.value) {
    return { ...applicationId, kind: "user-id" };
  }
  const subject = resolvePreferredStringClaim(claims, ["sub"]);
  if (subject.conflict || subject.value) {
    return { ...subject, kind: "subject" };
  }
  return { conflict: false, kind: "none", value: "" };
}

function resolvePreferredStringClaim(
  claims: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const raw = claims[key];
    if (raw === undefined || raw === null) continue;
    const value = cleanString(raw);
    return value
      ? { conflict: false, value }
      : { conflict: true, value: "" };
  }
  return { conflict: false, value: "" };
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
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Timezone is operational metadata, not part of the authenticated identity.
 * A token can temporarily carry stale aliases while a company's IANA setting
 * is being changed. In that case the frontend must neither choose one value
 * nor reject an otherwise valid session: it leaves the timezone unresolved so
 * the company record returned by the API remains authoritative.
 */
function resolveCompanyTimeZoneClaims(
  claims: AccessTokenClaims,
  expectedCompanyId: string,
) {
  const companySpecific = resolveCompanyTimeZoneClaimGroup(claims, [
    "company_timezone",
    "companyTimezone",
    "company_time_zone",
    "companyTimeZone",
  ]);
  if (companySpecific.declared) return companySpecific.timeZone;

  const nestedCompany = resolveNestedCompanyTimeZoneClaim(
    claims.company,
    expectedCompanyId,
  );
  if (nestedCompany.declared) return nestedCompany.timeZone;

  const tenantSpecific = resolveCompanyTimeZoneClaimGroup(claims, [
    "tenant_timezone",
    "tenantTimezone",
  ]);
  if (tenantSpecific.declared) return tenantSpecific.timeZone;

  const nestedTenant = resolveNestedCompanyTimeZoneClaim(
    claims.tenant,
    expectedCompanyId,
  );
  if (nestedTenant.declared) return nestedTenant.timeZone;

  for (const value of [claims.settings, claims.metadata]) {
    const nestedMetadata = resolveNestedCompanyTimeZoneClaim(
      value,
      expectedCompanyId,
    );
    if (nestedMetadata.declared) return nestedMetadata.timeZone;
  }

  const generic = resolveCompanyTimeZoneClaimGroup(claims, [
    "timezone",
    "time_zone",
    "timeZone",
    "tz",
  ]);
  if (generic.declared) return generic.timeZone;

  return "";
}

/**
 * Resolves operational metadata after `/auth/me` has authenticated the exact
 * token. Company identity remains fail-closed, while unrelated authorization
 * claim migrations cannot discard a valid same-tenant IANA timezone.
 */
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

function resolveNestedCompanyTimeZoneClaim(
  value: unknown,
  expectedCompanyId: string,
) {
  const record = asRecord(value);
  if (!record) return { declared: false, timeZone: "" } as const;
  const nestedCompany = resolvePreferredStringClaim(record, [
    "id",
    "company_id",
    "companyId",
    "tenant_id",
    "tenantId",
  ]);
  if (
    nestedCompany.conflict ||
    (expectedCompanyId &&
      nestedCompany.value &&
      !sameIdentifier(expectedCompanyId, nestedCompany.value))
  ) {
    // Never attach timezone metadata from an explicitly different tenant.
    return { declared: false, timeZone: "" } as const;
  }

  for (const candidate of [
    record,
    asRecord(record.settings),
    asRecord(record.metadata),
  ]) {
    if (!candidate) continue;
    for (const keys of [
      [
        "company_timezone",
        "companyTimezone",
        "company_time_zone",
        "companyTimeZone",
      ],
      ["tenant_timezone", "tenantTimezone"],
      ["timezone", "time_zone", "timeZone", "tz"],
    ] as const) {
      const resolution = resolveCompanyTimeZoneClaimGroup(candidate, keys);
      if (resolution.declared) return resolution;
    }
  }

  return { declared: false, timeZone: "" } as const;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
