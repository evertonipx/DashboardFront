import type { CurrentUser } from "@/lib/types";
import { normalizeRole } from "@/lib/user-role";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";

type AccessTokenClaims = Record<string, unknown> & {
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
  tenant_id?: unknown;
  companyTimezone?: unknown;
  company_timezone?: unknown;
  timezone?: unknown;
  tz?: unknown;
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

/**
 * Decodes the authenticated context carried by the access JWT. This is a UI
 * context only: the browser cannot verify the JWT signature and must never use
 * these claims as the API authorization boundary. The backend validates the
 * same token on every request.
 *
 * The snake_case names are the contract currently emitted by IPXData. A small
 * allowlist of aliases is accepted for rolling backend migrations, but
 * conflicting aliases invalidate the whole context instead of guessing.
 */
export function resolveAccessTokenContext(
  accessToken: string,
  nowMilliseconds = Date.now(),
): AccessTokenContext | null {
  const claims = decodeAccessTokenClaims(accessToken);
  if (!claims || !claimsAreActive(claims, nowMilliseconds)) return null;

  const company = resolveStringAliases(claims, [
    "company_id",
    "companyId",
    "tenant_id",
    "tenantId",
  ]);
  const user = resolveStringAliases(claims, ["user_id", "userId", "sub"]);
  const roleClaim = resolveStringAliases(claims, ["role"]);
  const timeZone = resolveStringAliases(claims, [
    "company_timezone",
    "companyTimezone",
    "timezone",
    "tz",
  ]);
  const master = resolveBooleanAliases(claims, ["is_master", "isMaster"]);
  const expiresAt = numericDateClaim(claims, "exp");
  const issuedAt = numericDateClaim(claims, "iat");
  const notBefore = numericDateClaim(claims, "nbf");

  if (
    company.conflict ||
    user.conflict ||
    roleClaim.conflict ||
    timeZone.conflict ||
    master.conflict ||
    expiresAt.invalid ||
    issuedAt.invalid ||
    notBefore.invalid
  ) {
    return null;
  }

  const role = normalizeRole(roleClaim.value) ?? roleClaim.value;
  const canonicalTimeZone = timeZone.value
    ? canonicalCompanyTimeZone(timeZone.value)
    : "";
  if (timeZone.value && !canonicalTimeZone) return null;
  return {
    companyId: company.value,
    expiresAt: expiresAt.value,
    issuedAt: issuedAt.value,
    isMaster: master.value === true || role === "super-admin",
    notBefore: notBefore.value,
    role,
    timeZone: canonicalTimeZone ?? "",
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
  const context = resolveAccessTokenContext(accessToken, nowMilliseconds);
  const userId = cleanString(user.id);
  return Boolean(context?.userId && userId && context.userId === userId);
}

export function accessTokensShareUserIdentity(
  previousAccessToken: string,
  nextAccessToken: string,
  nowMilliseconds = Date.now(),
) {
  const previousClaims = decodeAccessTokenClaims(previousAccessToken);
  const previousUser = previousClaims
    ? resolveStringAliases(previousClaims, ["user_id", "userId", "sub"])
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
  if (!context || !contextMatchesCurrentUser(context, user)) return user;

  const userId = cleanString(user.id) || context.userId;
  const companyId = resolveUserCompanyId(user) || context.companyId;
  const role = cleanString(user.role) || context.role;
  const companyTimeZone =
    cleanString(user.company_timezone) ||
    cleanString(user.company?.timezone) ||
    context.timeZone;
  const isMaster =
    typeof user.is_master === "boolean" ? user.is_master : context.isMaster;

  if (
    userId === cleanString(user.id) &&
    companyId === resolveUserCompanyId(user) &&
    role === cleanString(user.role) &&
    companyTimeZone ===
      (cleanString(user.company_timezone) || cleanString(user.company?.timezone)) &&
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
  const context = resolveAccessTokenContext(accessToken, nowMilliseconds);
  if (!context) return null;
  if (!contextMatchesCurrentUser(context, user)) return null;
  return enrichCurrentUserFromAccessToken(user, accessToken, nowMilliseconds);
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
  user: CurrentUser,
) {
  const userId = cleanString(user.id);
  const userCompanyId = resolveUserCompanyId(user);
  if (userId && (!context.userId || context.userId !== userId)) return false;
  if (
    userCompanyId &&
    context.companyId &&
    context.companyId !== userCompanyId
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
