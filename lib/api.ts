"use client";

import type {
  CurrentUser,
  Session,
  TokenResponse,
} from "@/lib/types";
import {
  accessTokenExpirationMilliseconds,
  accessTokenExplicitlyMismatchesUserIdentity,
  accessTokensShareUserIdentity,
  resolveAccessTokenContext,
  resolveAccessTokenMasterClaimState,
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
export const SESSION_SYNC_STORAGE_KEY = "ipxdata.auth-session-sync.v1";
const REFRESH_SKEW_MS = 60_000;

export const SESSION_EXPIRED_EVENT = "ipxdata:session-expired";
export const SESSION_UPDATED_EVENT = "ipxdata:session-updated";

type RefreshAttempt = {
  accessToken: string;
  promise: Promise<RefreshResult>;
  refreshToken: string;
  sessionRevision: number;
};

type CurrentUserAttempt = {
  accessToken: string;
  promise: Promise<CurrentUserSessionResponse>;
  sessionRevision: number;
};

type RefreshResult =
  | { status: "failed" }
  | { status: "superseded" }
  | {
      session: Session | TokenResponse;
      sessionRevision: number;
      status: "refreshed";
    };

type AuthenticatedPrincipal = {
  accessToken: string;
  user: CurrentUser;
};

export type CurrentUserSessionResponse = {
  accessToken: string;
  sessionRevision: number;
  user: CurrentUser;
};

let refreshAttempt: RefreshAttempt | null = null;
let currentUserAttempt: CurrentUserAttempt | null = null;
let authenticatedPrincipal: AuthenticatedPrincipal | null = null;
let authenticatedMasterAccess: AuthenticatedPrincipal | null = null;
let storedSessionRevision = 0;
let loginAttemptRevision = 0;

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  authSnapshot?: { accessToken: string };
  body?: unknown;
  captureAccessToken?: (accessToken: string) => void;
  companyScopeId?: string;
  expectedAccessToken?: string;
  expectedStatus?: number;
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

export function setStoredSession(
  tokens: TokenResponse | Session,
  options: { notifySessionUpdate?: boolean } = {},
) {
  if (!isBrowser()) return;

  const previousAccessToken = window.localStorage.getItem(ACCESS_KEY) ?? "";
  const accessTokenChanged = previousAccessToken !== tokens.access_token;
  if (accessTokenChanged) {
    authenticatedPrincipal = null;
    authenticatedMasterAccess = null;
  }
  storedSessionRevision += 1;

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
  if (
    options.notifySessionUpdate !== false &&
    previousAccessToken
  ) {
    window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
  }
  writeSessionSyncSignal();
}

export function clearStoredSession() {
  authenticatedPrincipal = null;
  authenticatedMasterAccess = null;
  currentUserAttempt = null;
  storedSessionRevision += 1;
  if (!isBrowser()) return;

  refreshAttempt = null;

  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(TOKEN_TYPE_KEY);
  window.localStorage.removeItem(EXPIRES_KEY);
  window.localStorage.removeItem(EXPIRES_AT_KEY);
  clearStoredMasterCompanyScope();
  clearStoredCurrentCompanyScope();
  writeSessionSyncSignal();
}

export function synchronizeExternalSessionUpdate() {
  authenticatedPrincipal = null;
  authenticatedMasterAccess = null;
  currentUserAttempt = null;
  refreshAttempt = null;
  storedSessionRevision += 1;
  loginAttemptRevision += 1;
}

function writeSessionSyncSignal() {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    SESSION_SYNC_STORAGE_KEY,
    `${Date.now()}:${storedSessionRevision}:${Math.random()}`,
  );
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

async function performRefresh(
  capturedRefreshToken: string,
  capturedAccessToken: string,
  capturedSessionRevision: number,
): Promise<RefreshResult> {
  const sessionBeforeRefresh = getStoredSession();
  const confirmedPrincipalBeforeRefresh =
    sessionBeforeRefresh?.access_token &&
    sessionBeforeRefresh.refresh_token === capturedRefreshToken &&
    authenticatedPrincipal?.accessToken === sessionBeforeRefresh.access_token
      ? authenticatedPrincipal
      : null;
  const confirmedMasterBeforeRefresh =
    sessionBeforeRefresh?.access_token &&
    sessionBeforeRefresh.refresh_token === capturedRefreshToken &&
    authenticatedMasterAccess?.accessToken === sessionBeforeRefresh.access_token
      ? authenticatedMasterAccess
      : null;
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
    const currentSession = getStoredSession();
    if (
      currentSession?.refresh_token === capturedRefreshToken &&
      currentSession.access_token === capturedAccessToken &&
      storedSessionRevision === capturedSessionRevision
    ) {
      clearStoredSession();
      return { status: "failed" };
    }
    return { status: "superseded" };
  }

  // A login can replace the tenant session while this request is in flight.
  // Never let a late response from the previous account overwrite it.
  const currentSession = getStoredSession();
  if (
    currentSession?.refresh_token !== capturedRefreshToken ||
    currentSession.access_token !== capturedAccessToken ||
    storedSessionRevision !== capturedSessionRevision
  ) {
    return { status: "superseded" };
  }

  const refreshedTokens = requireTokenResponse(payload, capturedRefreshToken);
  if (
    accessTokensExplicitlyChangeIdentity(
      capturedAccessToken,
      refreshedTokens.access_token,
    ) ||
    (confirmedPrincipalBeforeRefresh &&
      accessTokenExplicitlyMismatchesUserIdentity(
        refreshedTokens.access_token,
        confirmedPrincipalBeforeRefresh.user,
      ))
  ) {
    clearStoredSession();
    return { status: "failed" };
  }

  setStoredSession(refreshedTokens);
  if (confirmedPrincipalBeforeRefresh) {
    authenticatedPrincipal = {
      accessToken: refreshedTokens.access_token,
      user: confirmedPrincipalBeforeRefresh.user,
    };
  }
  const refreshedMasterState = resolveAccessTokenMasterClaimState(
    refreshedTokens.access_token,
  );
  if (
    confirmedMasterBeforeRefresh &&
    (refreshedMasterState === "master" || refreshedMasterState === "unknown")
  ) {
    authenticatedMasterAccess = {
      accessToken: refreshedTokens.access_token,
      user: confirmedMasterBeforeRefresh.user,
    };
  } else if (
    refreshedMasterState === "non-master" ||
    refreshedMasterState === "invalid"
  ) {
    clearStoredMasterCompanyScope();
  }
  return {
    session: refreshedTokens,
    sessionRevision: storedSessionRevision,
    status: "refreshed",
  };
}

async function refreshSession() {
  const session = getStoredSession();
  const refreshToken = session?.refresh_token ?? "";
  const accessToken = session?.access_token ?? "";
  const sessionRevision = storedSessionRevision;
  if (!refreshToken || !accessToken) {
    return { status: "failed" } satisfies RefreshResult;
  }

  if (
    !refreshAttempt ||
    refreshAttempt.refreshToken !== refreshToken ||
    refreshAttempt.accessToken !== accessToken ||
    refreshAttempt.sessionRevision !== sessionRevision
  ) {
    const promise = performRefresh(
      refreshToken,
      accessToken,
      sessionRevision,
    ).finally(() => {
      if (refreshAttempt?.promise === promise) {
        refreshAttempt = null;
      }
    });
    refreshAttempt = {
      accessToken,
      promise,
      refreshToken,
      sessionRevision,
    };
  }

  return refreshAttempt!.promise;
}

function accessTokensExplicitlyChangeIdentity(
  previousAccessToken: string,
  nextAccessToken: string,
) {
  if (accessTokensShareUserIdentity(previousAccessToken, nextAccessToken)) {
    return false;
  }
  const previousUserId = resolveAccessTokenContext(previousAccessToken)?.userId;
  const nextUserId = resolveAccessTokenContext(nextAccessToken)?.userId;
  if (!previousUserId || !nextUserId) return false;

  // A rolling JWT schema can move the same identity between an e-mail `sub`
  // and an opaque `user_id`. Only comparable identifiers prove a change.
  const previousIsEmail = previousUserId.includes("@");
  const nextIsEmail = nextUserId.includes("@");
  return (
    previousIsEmail === nextIsEmail &&
    previousUserId.trim().toLocaleLowerCase("en-US") !==
      nextUserId.trim().toLocaleLowerCase("en-US")
  );
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    auth = true,
    authSnapshot,
    body,
    captureAccessToken,
    companyScopeId,
    expectedAccessToken,
    expectedStatus,
    jwtCompanyScopeOnly = false,
    retry = true,
    headers,
    ...init
  } = options;

  let session = getStoredSession();

  if (auth && shouldRefreshSoon(session)) {
    const refreshResult = await refreshSession();
    if (refreshResult.status === "superseded") {
      throw new ApiError(
        "A sessão foi substituída antes de concluir a operação.",
        409,
      );
    }
    if (refreshResult.status === "failed") {
      notifySessionExpired();
      throw new ApiError("Não foi possível renovar a sessão.", 401);
    }
    if (
      refreshResult.sessionRevision !== storedSessionRevision ||
      getStoredSession()?.access_token !== refreshResult.session.access_token
    ) {
      throw new ApiError(
        "A sessão foi substituída antes de concluir a operação.",
        409,
      );
    }
    session = getStoredSession();
  }

  const requestHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth && session?.access_token) {
    requestHeaders.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (
    auth &&
    expectedAccessToken &&
    session?.access_token !== expectedAccessToken
  ) {
    throw new ApiError(
      "A sessão foi atualizada antes de concluir a operação.",
      409,
    );
  }
  if (authSnapshot) {
    // Per-request mutable snapshot used only by the authentication bootstrap.
    // It records the token that apiFetch actually put on the wire after any
    // proactive refresh; no token value is logged or exposed to the UI.
    authSnapshot.accessToken = auth && session?.access_token
      ? session.access_token
      : "";
  }
  captureAccessToken?.(auth ? session?.access_token ?? "" : "");
  const requestSessionRevision = storedSessionRevision;
  const returnsBoundAuthenticationSnapshot = Boolean(
    authSnapshot && (path.split(/[?#]/, 1)[0] ?? path) === "/auth/me",
  );

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
      resolveAccessTokenMasterClaimState(session.access_token) === "master",
  );
  const authMeConfirmedMaster = Boolean(
    session?.access_token &&
      authenticatedMasterAccess?.accessToken === session.access_token,
  );
  const requestedCompanyScope = companyScopeId?.trim() ?? "";
  const pathCompanyScope = companyScopeFromAdministrativePath(path);
  if (
    requestedCompanyScope &&
    pathCompanyScope &&
    requestedCompanyScope !== pathCompanyScope
  ) {
    throw new ApiError(
      "A empresa da rota diverge da empresa selecionada para a operação.",
      403,
    );
  }
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
    requestHeaders.set("X-Company-ID", masterCompanyScope);
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: requestHeaders,
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
    cache: "no-store",
  });

  if (
    auth &&
    !returnsBoundAuthenticationSnapshot &&
    (requestSessionRevision !== storedSessionRevision ||
      (getStoredSession()?.access_token ?? "") !==
        (session?.access_token ?? ""))
  ) {
    // The response belongs to a session that no longer owns the browser.
    // Never publish it, and never replay mutations with the replacement token.
    throw new ApiError(
      "A sessão foi atualizada durante a operação.",
      409,
    );
  }

  const payload = await parseResponse(response);
  if (
    auth &&
    !returnsBoundAuthenticationSnapshot &&
    (requestSessionRevision !== storedSessionRevision ||
      (getStoredSession()?.access_token ?? "") !==
        (session?.access_token ?? ""))
  ) {
    // Fetch resolves when headers arrive; the session can still change while
    // a streamed JSON body is being consumed.
    throw new ApiError(
      "A sessão foi atualizada durante a operação.",
      409,
    );
  }

  if (response.status === 401 && auth && retry) {
    const activeSession = getStoredSession();
    const requestSessionIsCurrent = Boolean(
      session?.access_token &&
        requestSessionRevision === storedSessionRevision &&
        activeSession?.access_token === session.access_token,
    );
    if (!requestSessionIsCurrent) {
      if (activeSession) {
        throw new ApiError(
          "A sessão foi atualizada durante a operação.",
          409,
        );
      }
    } else {
      const refreshResult = await refreshSession();
      if (refreshResult.status === "superseded") {
        throw new ApiError(
          "A sessão foi substituída antes de concluir a operação.",
          409,
        );
      }
      if (
        refreshResult.status === "refreshed" &&
        refreshResult.sessionRevision === storedSessionRevision &&
        getStoredSession()?.access_token ===
          refreshResult.session.access_token
      ) {
        return apiFetch<T>(path, { ...options, retry: false });
      }

      notifySessionExpired();
    }
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, `Erro ${response.status} ao consultar a API`),
      response.status,
      payload,
    );
  }

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new ApiError(
      `A API retornou status ${response.status}; era esperado ${expectedStatus}.`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function loginRequest(email: string, password: string) {
  const loginAttempt = ++loginAttemptRevision;
  const payload = await apiFetch<unknown>("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  if (loginAttempt !== loginAttemptRevision) {
    throw new Error(
      "Esta tentativa de login foi substituída por uma tentativa mais recente.",
    );
  }
  const tokens = requireTokenResponse(payload);
  refreshAttempt = null;
  clearStoredMasterCompanyScope();
  clearStoredCurrentCompanyScope();
  // An explicit login hydrates `/auth/me` itself. Emitting the silent-refresh
  // event here would start a competing reconciliation with the same token.
  setStoredSession(tokens, { notifySessionUpdate: false });

  return tokens;
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

export async function currentUserRequest() {
  const session = getStoredSession();
  const accessToken = session?.access_token ?? "";
  const sessionRevision = storedSessionRevision;
  if (
    currentUserAttempt &&
    currentUserAttempt.accessToken === accessToken &&
    currentUserAttempt.sessionRevision === sessionRevision
  ) {
    return currentUserAttempt.promise;
  }

  const promise = performCurrentUserRequest().finally(() => {
    if (currentUserAttempt?.promise === promise) {
      currentUserAttempt = null;
    }
  });
  currentUserAttempt = { accessToken, promise, sessionRevision };
  return promise;
}

export function currentUserRequestIsInFlight() {
  return currentUserAttempt !== null;
}

async function performCurrentUserRequest() {
  // Bind `/auth/me` to the exact session lineage that authenticated it. A
  // refresh or another tab may rotate storage while the response is pending;
  // only the winning session may be published.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let requestAccessToken = "";
    let requestSessionRevision = -1;
    let user: CurrentUser;
    try {
      user = await apiFetch<CurrentUser>("/auth/me", {
        captureAccessToken(accessToken) {
          requestAccessToken = accessToken;
          requestSessionRevision = storedSessionRevision;
        },
      });
    } catch (error) {
      const requestSession = {
        accessToken: requestAccessToken,
        sessionRevision: requestSessionRevision,
      };
      if (
        requestAccessToken &&
        getStoredSession() &&
        !currentUserSessionIsCurrent(requestSession)
      ) {
        continue;
      }
      if (
        requestAccessToken &&
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403) &&
        currentUserSessionIsCurrent(requestSession)
      ) {
        clearStoredSession();
        notifySessionExpired();
      }
      throw error;
    }

    const authenticatedSession = {
      accessToken: requestAccessToken,
      sessionRevision: requestSessionRevision,
    };
    if (
      requestAccessToken &&
      currentUserSessionIsCurrent(authenticatedSession)
    ) {
      return {
        ...authenticatedSession,
        user,
      } satisfies CurrentUserSessionResponse;
    }
  }

  throw new ApiError(
    "A sessão foi atualizada durante a identificação. Tente novamente.",
    409,
  );
}

export function currentUserSessionIsCurrent(
  session: Pick<CurrentUserSessionResponse, "accessToken" | "sessionRevision">,
) {
  return Boolean(
    session.accessToken &&
      session.sessionRevision === storedSessionRevision &&
      getStoredSession()?.access_token === session.accessToken,
  );
}

/**
 * Compatibility helper for callers that certify the returned user against
 * the exact token snapshot themselves. Unlike `currentUserRequest`, the pair
 * may describe a superseded request, but the user and token always belong to
 * the same HTTP exchange and must be checked before publication.
 */
export async function currentUserRequestWithAccessToken() {
  const authSnapshot = { accessToken: "" };
  const user = await apiFetch<CurrentUser>("/auth/me", { authSnapshot });
  return { accessToken: authSnapshot.accessToken, user };
}

/**
 * Records the authorization returned by /auth/me for the active token.
 * Some backend JWT versions omit role/is_master even though /auth/me confirms
 * master access. The marker is memory-only, token-bound and cleared whenever
 * the authenticated session changes. The backend remains the authority that
 * accepts or rejects a cross-company X-Company-ID header.
 */
export function setAuthenticatedMasterAccess(
  user: CurrentUser | null,
  authenticatedAccessToken = getStoredSession()?.access_token ?? "",
) {
  const accessToken = getStoredSession()?.access_token ?? "";
  const authenticatedUser = Boolean(
    accessToken &&
      accessToken === authenticatedAccessToken &&
      user &&
      !accessTokenExplicitlyMismatchesUserIdentity(accessToken, user),
  );
  authenticatedPrincipal = authenticatedUser && user
    ? { accessToken, user }
    : null;
  authenticatedMasterAccess =
    authenticatedUser &&
    user &&
    isMasterUser(user)
      ? { accessToken, user }
      : null;
}

function shouldSendMasterCompanyScope(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  if (pathname === "/users/me" || pathname.startsWith("/users/me/")) {
    return false;
  }
  // Administrative company routes are already scoped by their path. Sending
  // the selected tenant again makes some backend versions reinterpret a
  // valid Master request as a regular tenant request and return 403.
  if (/^\/companies\/[^/]+(?:\/|$)/.test(pathname)) return false;

  return [
    "/ai",
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
