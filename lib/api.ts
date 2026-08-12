"use client";

import type {
  CurrentUser,
  Session,
  TokenResponse,
} from "@/lib/types";
import {
  accessTokenDeclaresMasterAccess,
  accessTokenExpirationMilliseconds,
  accessTokenMatchesUserIdentity,
  accessTokensShareUserIdentity,
  resolveAccessTokenContext,
} from "@/lib/access-token-claims";
import {
  clearStoredCurrentCompanyScope,
  clearStoredMasterCompanyScope,
  getStoredMasterCompanyScope,
} from "@/lib/master-company-scope";
import { isMasterUser } from "@/lib/user-role";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const TOKEN_TYPE_KEY = "token_type";
const EXPIRES_KEY = "expires_in";
const EXPIRES_AT_KEY = "expires_at";
const REFRESH_SKEW_MS = 60_000;

export const SESSION_EXPIRED_EVENT = "ipxdata:session-expired";

type RefreshAttempt = {
  promise: Promise<Session | TokenResponse | null>;
  refreshToken: string;
};

let refreshAttempt: RefreshAttempt | null = null;
let authenticatedMasterAccessToken = "";

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  body?: unknown;
  companyScopeId?: string;
  jwtCompanyScopeOnly?: boolean;
  retry?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function apiBase() {
  return (process.env.NEXT_PUBLIC_IPXDATA_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function getStoredSession(): Session | null {
  if (!isBrowser()) return null;

  const accessToken = window.localStorage.getItem(ACCESS_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_KEY);

  if (!accessToken || !refreshToken) return null;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: window.localStorage.getItem(TOKEN_TYPE_KEY) ?? "Bearer",
    expires_in: Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0),
    expires_at: Number(window.localStorage.getItem(EXPIRES_AT_KEY) ?? 0),
  };
}

export function getStoredRefreshToken() {
  if (!isBrowser()) return "";
  return window.localStorage.getItem(REFRESH_KEY) ?? "";
}

export function setStoredSession(tokens: TokenResponse | Session) {
  if (!isBrowser()) return;

  if (window.localStorage.getItem(ACCESS_KEY) !== tokens.access_token) {
    authenticatedMasterAccessToken = "";
  }

  window.localStorage.setItem(ACCESS_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  window.localStorage.setItem(TOKEN_TYPE_KEY, tokens.token_type ?? "Bearer");

  const expiresIn =
    typeof tokens.expires_in === "number" &&
    Number.isFinite(tokens.expires_in) &&
    tokens.expires_in > 0
      ? tokens.expires_in
      : null;
  const jwtExpiresAt = accessTokenExpirationMilliseconds(tokens.access_token);
  const responseExpiresAt =
    expiresIn !== null ? Date.now() + expiresIn * 1000 : null;
  const expiresAt = [jwtExpiresAt, responseExpiresAt]
    .filter((value): value is number => value !== null)
    .reduce<number | null>(
      (earliest, value) => earliest === null ? value : Math.min(earliest, value),
      null,
    );

  if (expiresIn !== null) {
    window.localStorage.setItem(EXPIRES_KEY, String(expiresIn));
  } else {
    window.localStorage.removeItem(EXPIRES_KEY);
  }
  if (expiresAt !== null) {
    window.localStorage.setItem(
      EXPIRES_AT_KEY,
      String(expiresAt),
    );
  } else {
    window.localStorage.removeItem(EXPIRES_AT_KEY);
  }
}

export function clearStoredSession() {
  authenticatedMasterAccessToken = "";
  if (!isBrowser()) return;

  refreshAttempt = null;

  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(TOKEN_TYPE_KEY);
  window.localStorage.removeItem(EXPIRES_KEY);
  window.localStorage.removeItem(EXPIRES_AT_KEY);
  clearStoredMasterCompanyScope();
  clearStoredCurrentCompanyScope();
}

async function parseResponse(response: Response) {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || undefined;
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const value = record.error ?? record.message ?? record.detail;
    if (typeof value === "string") return value;
  }

  return fallback;
}

function notifySessionExpired() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

function shouldRefreshSoon(session: Session | null) {
  if (!session?.expires_at) return false;
  return session.expires_at - Date.now() <= REFRESH_SKEW_MS;
}

async function performRefresh(capturedRefreshToken: string) {
  const sessionBeforeRefresh = getStoredSession();
  const preserveAuthenticatedMasterAccess = Boolean(
    sessionBeforeRefresh?.access_token &&
      sessionBeforeRefresh.refresh_token === capturedRefreshToken &&
      authenticatedMasterAccessToken === sessionBeforeRefresh.access_token,
  );
  const response = await fetch(`${apiBase()}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: capturedRefreshToken }),
    cache: "no-store",
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    const currentRefreshToken = getStoredRefreshToken();
    if (currentRefreshToken === capturedRefreshToken) {
      clearStoredSession();
      notifySessionExpired();
      return null;
    }
    return getStoredSession();
  }

  // A login can replace the tenant session while this request is in flight.
  // Never let a late response from the previous account overwrite it.
  if (getStoredRefreshToken() !== capturedRefreshToken) {
    return getStoredSession();
  }

  const refreshedTokens = requireTokenResponse(payload, capturedRefreshToken);
  setStoredSession(refreshedTokens);
  if (
    preserveAuthenticatedMasterAccess &&
    sessionBeforeRefresh?.access_token &&
    accessTokensShareUserIdentity(
      sessionBeforeRefresh.access_token,
      refreshedTokens.access_token,
    ) &&
    accessTokenDeclaresMasterAccess(refreshedTokens.access_token)
  ) {
    authenticatedMasterAccessToken = refreshedTokens.access_token;
  }
  return refreshedTokens;
}

async function refreshSession() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  if (!refreshAttempt || refreshAttempt.refreshToken !== refreshToken) {
    const promise = performRefresh(refreshToken).finally(() => {
      if (refreshAttempt?.promise === promise) {
        refreshAttempt = null;
      }
    });
    refreshAttempt = { promise, refreshToken };
  }

  return refreshAttempt.promise;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    auth = true,
    body,
    companyScopeId,
    jwtCompanyScopeOnly = false,
    retry = true,
    headers,
    ...init
  } = options;

  let session = getStoredSession();

  if (auth && shouldRefreshSoon(session)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      session = getStoredSession();
    }
  }

  const requestHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth && session?.access_token) {
    requestHeaders.set("Authorization", `Bearer ${session.access_token}`);
  }

  // Company users remain scoped exclusively by their signed JWT. A master
  // user, however, needs to forward the company selected in the UI to the
  // tenant-aware endpoints. The backend remains the authorization boundary
  // and decides whether the token may use this scope.
  requestHeaders.delete("X-Company-ID");
  const tokenContext = session?.access_token
    ? resolveAccessTokenContext(session.access_token)
    : null;
  const tokenDeclaresMaster = Boolean(
    session?.access_token &&
      accessTokenDeclaresMasterAccess(session.access_token),
  );
  const authMeConfirmedMaster = Boolean(
    session?.access_token &&
      authenticatedMasterAccessToken === session.access_token,
  );
  const requestedCompanyScope = companyScopeId?.trim() ?? "";
  const pathCompanyScope = companyScopeFromAdministrativePath(path);
  if (
    auth &&
    tokenContext?.companyId &&
    !tokenDeclaresMaster &&
    !authMeConfirmedMaster &&
    ((requestedCompanyScope && requestedCompanyScope !== tokenContext.companyId) ||
      (pathCompanyScope && pathCompanyScope !== tokenContext.companyId))
  ) {
    throw new ApiError(
      "A empresa solicitada não corresponde ao escopo autenticado no JWT.",
      403,
    );
  }
  const masterCompanyScope =
    auth &&
    !jwtCompanyScopeOnly &&
    session?.access_token &&
    (tokenDeclaresMaster || authMeConfirmedMaster) &&
    shouldSendMasterCompanyScope(path)
      ? requestedCompanyScope || getStoredMasterCompanyScope()?.id.trim()
      : "";
  if (masterCompanyScope) {
    if (pathCompanyScope && pathCompanyScope !== masterCompanyScope) {
      throw new ApiError(
        "A empresa da rota diverge da empresa selecionada para a operação.",
        403,
      );
    }
    requestHeaders.set("X-Company-ID", masterCompanyScope);
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: requestHeaders,
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
    cache: "no-store",
  });

  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, retry: false });
    }

    notifySessionExpired();
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, `Erro ${response.status} ao consultar a API`),
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function loginRequest(email: string, password: string) {
  const payload = await apiFetch<unknown>("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  const tokens = requireTokenResponse(payload);
  refreshAttempt = null;
  clearStoredMasterCompanyScope();
  clearStoredCurrentCompanyScope();
  setStoredSession(tokens);

  return tokens;
}

export function currentUserRequest() {
  return apiFetch<CurrentUser>("/auth/me");
}

function requireTokenResponse(payload: unknown, fallbackRefreshToken = "") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A API retornou uma sessão inválida.");
  }

  const record = payload as Record<string, unknown>;
  const accessToken = requireNonEmptyToken(record.access_token, "access_token");
  const refreshToken =
    typeof record.refresh_token === "string" && record.refresh_token.trim()
      ? record.refresh_token
      : fallbackRefreshToken;
  const tokenType =
    typeof record.token_type === "string" && record.token_type.trim()
      ? record.token_type.trim()
      : "Bearer";
  const expiresIn = record.expires_in;

  if (!refreshToken || typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("A API retornou uma sessão inválida.");
  }

  return {
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: refreshToken,
    token_type: tokenType,
  } satisfies TokenResponse;
}

function requireNonEmptyToken(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`A API retornou ${field} inválido.`);
  }
  return value;
}

/**
 * Records the authorization returned by /auth/me for the active token.
 * Some backend JWT versions omit role/is_master even though /auth/me confirms
 * master access. The marker is memory-only, token-bound and cleared whenever
 * the authenticated session changes. The backend remains the authority that
 * accepts or rejects a cross-company X-Company-ID header.
 */
export function setAuthenticatedMasterAccess(user: CurrentUser | null) {
  const accessToken = getStoredSession()?.access_token ?? "";
  authenticatedMasterAccessToken =
    accessToken &&
    user &&
    isMasterUser(user) &&
    accessTokenMatchesUserIdentity(accessToken, user)
      ? accessToken
      : "";
}

function shouldSendMasterCompanyScope(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  if (pathname === "/users/me" || pathname.startsWith("/users/me/")) {
    return false;
  }
  if (/^\/companies\/[^/]+(?:\/|$)/.test(pathname)) return true;

  return [
    "/analytics",
    "/cameras",
    "/company/modules",
    "/dashboard-views",
    "/locations",
    "/occupancy",
    "/scenarios",
    "/users",
    "/workers",
  ].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function companyScopeFromAdministrativePath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  const match = /^\/companies\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}
