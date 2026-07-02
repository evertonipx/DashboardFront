"use client";

import type {
  CurrentUser,
  Session,
  TokenResponse,
} from "@/lib/types";
import {
  clearStoredCurrentCompanyScope,
  clearStoredMasterCompanyScope,
  getStoredApiCompanyScope,
} from "@/lib/master-company-scope";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const TOKEN_TYPE_KEY = "token_type";
const EXPIRES_KEY = "expires_in";
const EXPIRES_AT_KEY = "expires_at";
const REFRESH_SKEW_MS = 60_000;

export const SESSION_EXPIRED_EVENT = "ipxdata:session-expired";

let refreshPromise: Promise<Session | TokenResponse | null> | null = null;

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  body?: unknown;
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

  window.localStorage.setItem(ACCESS_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  window.localStorage.setItem(TOKEN_TYPE_KEY, tokens.token_type ?? "Bearer");

  if (tokens.expires_in) {
    window.localStorage.setItem(EXPIRES_KEY, String(tokens.expires_in));
    window.localStorage.setItem(
      EXPIRES_AT_KEY,
      String(Date.now() + tokens.expires_in * 1000),
    );
  }
}

export function clearStoredSession() {
  if (!isBrowser()) return;

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

  setStoredSession(payload as TokenResponse);
  return payload as TokenResponse;
}

async function refreshSession() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = performRefresh(refreshToken).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    auth = true,
    body,
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

  const apiCompanyScope = getStoredApiCompanyScope();
  const hasExplicitCompanyScope = auth && requestHeaders.has("X-Company-ID");
  const pathSupportsCompanyScope =
    auth && (hasExplicitCompanyScope || shouldSendMasterCompanyScope(path));
  if (
    pathSupportsCompanyScope &&
    apiCompanyScope &&
    !requestHeaders.has("X-Company-ID")
  ) {
    requestHeaders.set("X-Company-ID", apiCompanyScope.id);
  }
  const scopedCompanyId = pathSupportsCompanyScope
    ? requestHeaders.get("X-Company-ID") ?? apiCompanyScope?.id ?? ""
    : "";
  const requestPath =
    pathSupportsCompanyScope && scopedCompanyId
      ? withMasterCompanyScopeQuery(path, scopedCompanyId)
      : path;

  const response = await fetch(`${apiBase()}${requestPath}`, {
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
  const tokens = await apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  clearStoredMasterCompanyScope();
  clearStoredCurrentCompanyScope();
  setStoredSession(tokens);

  return tokens;
}

export function currentUserRequest() {
  return apiFetch<CurrentUser>("/auth/me");
}

function shouldSendMasterCompanyScope(path: string) {
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
  ].some((prefix) => path.startsWith(prefix));
}

function withMasterCompanyScopeQuery(path: string, companyId: string) {
  if (!companyId) return path;

  const [pathname, hashFragment = ""] = path.split("#", 2);
  const [basePath, queryString = ""] = pathname.split("?", 2);
  const params = new URLSearchParams(queryString);
  if (!params.has("company_id")) {
    params.set("company_id", companyId);
  }

  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}${hashFragment ? `#${hashFragment}` : ""}`;
}
