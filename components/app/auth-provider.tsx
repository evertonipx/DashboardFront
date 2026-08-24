"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ApiError,
  apiFetch,
  clearStoredSession,
  currentUserSessionIsCurrent,
  currentUserRequest,
  currentUserRequestIsInFlight,
  getStoredRefreshToken,
  getStoredSession,
  loginRequest,
  SESSION_EXPIRED_EVENT,
  SESSION_SYNC_STORAGE_KEY,
  SESSION_UPDATED_EVENT,
  setAuthenticatedMasterAccess,
  synchronizeExternalSessionUpdate,
  type CurrentUserSessionResponse,
} from "@/lib/api";
import {
  reconcileCurrentUserWithAccessToken,
} from "@/lib/access-token-claims";
import { hasDeclaredManagerAccess, hasMasterAccess } from "@/lib/access";
import {
  buildCurrentUserCompanyCacheRecord,
  normalizeCompanyRecord,
  readCachedCompany,
  resolveCompanyRecordTimeZone,
  resolveCurrentUserCompanyTimeZone,
  writeCompanyCache,
} from "@/lib/company-cache";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import { migrateLegacyLiveDefault } from "@/lib/legacy-dashboard-view-migration";
import {
  clearStoredCurrentCompanyScope,
  clearStoredMasterCompanyScope,
  getCompanyTimeZoneResolutionForScope,
  getCurrentUserCompanyId,
  getEffectiveCompanyScopeId,
  getStoredMasterCompanyScope,
  setStoredCurrentCompanyScope,
  setStoredMasterCompanyScope,
} from "@/lib/master-company-scope";
import { hasAnyOperationalPermission } from "@/lib/permissions";
import type { CurrentUser, CurrentUserCompany, UserPermission } from "@/lib/types";
import {
  clearUserGridSync,
  hydrateUserGridFromServer,
  startUserGridSync,
  USER_GRID_SYNC_STATUS_EVENT,
  type UserGridSyncStatusDetail,
} from "@/lib/user-grid";

type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  isManager: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<CurrentUser | null>;
};

type PublishedPrincipal = Pick<
  CurrentUserSessionResponse,
  "accessToken" | "sessionRevision"
> & {
  user: CurrentUser;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [isManager, setIsManager] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const gridSyncErrorShown = React.useRef(false);
  const publishedPrincipalRef = React.useRef<PublishedPrincipal | null>(null);
  const refreshUserAttemptRef = React.useRef<
    Promise<CurrentUser | null> | null
  >(null);

  const resolveManagerAccess = React.useCallback((currentUser: CurrentUser | null) => {
    if (!currentUser) return false;
    if (hasDeclaredManagerAccess(currentUser)) return true;
    if (hasAnyOperationalPermission(currentUser)) return true;
    return false;
  }, []);

  const clearPublishedPrincipal = React.useCallback(() => {
    publishedPrincipalRef.current = null;
    clearUserGridSync();
    setUser(null);
    setIsManager(false);
  }, []);

  const publishAuthenticatedPrincipal = React.useCallback(
    (
      currentUser: CurrentUser,
      authenticatedSession: CurrentUserSessionResponse,
    ) => {
      assertAuthenticatedSessionCurrent(authenticatedSession);
      publishedPrincipalRef.current = {
        accessToken: authenticatedSession.accessToken,
        sessionRevision: authenticatedSession.sessionRevision,
        user: currentUser,
      };
      setUser(currentUser);
      setIsManager(resolveManagerAccess(currentUser));
      return currentUser;
    },
    [resolveManagerAccess],
  );

  const refreshUser = React.useCallback(() => {
    if (refreshUserAttemptRef.current) return refreshUserAttemptRef.current;

    const fallbackPrincipal = publishedPrincipalRef.current;
    const promise = (async () => {
      try {
        return await hydrateCurrentAuthenticatedSession(
          fallbackPrincipal,
          publishAuthenticatedPrincipal,
        );
      } catch {
        // Network/5xx failures may preserve only the profile certified for the
        // exact token and revision that still own the browser. Current 401/403
        // failures clear storage in the request layer and therefore fail this
        // check. No JWT guess can carry profile A into session B.
        const publishedPrincipal = publishedPrincipalRef.current;
        if (
          publishedPrincipal &&
          currentUserSessionIsCurrent(publishedPrincipal)
        ) {
          return publishedPrincipal.user;
        }
        clearPublishedPrincipal();
        return null;
      }
    })();

    refreshUserAttemptRef.current = promise;
    void promise.finally(() => {
      if (refreshUserAttemptRef.current === promise) {
        refreshUserAttemptRef.current = null;
      }
    });
    return promise;
  }, [clearPublishedPrincipal, publishAuthenticatedPrincipal]);

  React.useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const session = getStoredSession();
      if (!session) {
        if (mounted) setLoading(false);
        return;
      }

      await refreshUser();
      if (!mounted) return;

      setLoading(false);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [refreshUser]);

  React.useEffect(() => {
    let reconciliationTimer: number | null = null;

    function reconcileExternalSession() {
      reconciliationTimer = null;
      synchronizeExternalSessionUpdate();
      // A cross-tab revision is a distinct session lineage. Do not reuse a
      // hydration promise that started before the storage signal.
      refreshUserAttemptRef.current = null;
      const session = getStoredSession();

      if (!session) {
        clearPublishedPrincipal();
        router.replace("/login");
        return;
      }

      // synchronizeExternalSessionUpdate advances the local revision. Never
      // leave a principal from the previous tab/session rendered while the new
      // exact snapshot is being certified by `/auth/me`.
      clearPublishedPrincipal();
      void refreshUser();
    }

    function handleSessionStorage(event: StorageEvent) {
      if (event.key !== SESSION_SYNC_STORAGE_KEY) return;
      if (reconciliationTimer !== null) {
        window.clearTimeout(reconciliationTimer);
      }
      // The sync marker is written after every token field, so one queued turn
      // is enough to coalesce consecutive cross-tab session changes.
      reconciliationTimer = window.setTimeout(reconcileExternalSession, 0);
    }

    window.addEventListener("storage", handleSessionStorage);
    return () => {
      window.removeEventListener("storage", handleSessionStorage);
      if (reconciliationTimer !== null) {
        window.clearTimeout(reconciliationTimer);
      }
    };
  }, [clearPublishedPrincipal, refreshUser, router]);

  React.useEffect(() => {
    if (!user?.id) return;
    return startUserGridSync(user.id);
  }, [user?.id]);

  React.useEffect(() => {
    function handleGridSyncStatus(event: Event) {
      const detail = (event as CustomEvent<UserGridSyncStatusDetail>).detail;
      if (detail?.status === "error" && !gridSyncErrorShown.current) {
        gridSyncErrorShown.current = true;
        toast.error(
          "Não foi possível sincronizar as configurações com o servidor. As alterações continuam disponíveis neste navegador e serão reenviadas automaticamente.",
        );
        return;
      }

      if (detail?.status === "ready" || detail?.status === "saved") {
        gridSyncErrorShown.current = false;
      }
    }

    window.addEventListener(USER_GRID_SYNC_STATUS_EVENT, handleGridSyncStatus);
    return () => {
      window.removeEventListener(
        USER_GRID_SYNC_STATUS_EVENT,
        handleGridSyncStatus,
      );
    };
  }, []);

  React.useEffect(() => {
    function handleSessionExpired() {
      clearStoredSession();
      refreshUserAttemptRef.current = null;
      clearPublishedPrincipal();
      router.replace("/login");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [clearPublishedPrincipal, router]);

  React.useEffect(() => {
    let reconciling = false;

    function handleSessionUpdated() {
      const accessToken = getStoredSession()?.access_token ?? "";
      if (reconciling || !accessToken) return;

      const publishedPrincipal = publishedPrincipalRef.current;
      // During bootstrap/login, the request that caused a proactive refresh is
      // already responsible for publishing `/auth/me`; starting another chain
      // here would duplicate the GET. A published old revision is hidden
      // immediately, then either that in-flight request or this handler wins.
      if (!publishedPrincipal) return;
      clearPublishedPrincipal();
      if (currentUserRequestIsInFlight()) return;

      reconciling = true;
      void refreshUser().finally(() => {
        reconciling = false;
      });
    }

    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, [clearPublishedPrincipal, refreshUser]);

  const login = React.useCallback(async (email: string, password: string) => {
    await loginRequest(email, password);
    refreshUserAttemptRef.current = null;
    clearPublishedPrincipal();
    return hydrateCurrentAuthenticatedSession(
      null,
      publishAuthenticatedPrincipal,
    );
  }, [clearPublishedPrincipal, publishAuthenticatedPrincipal]);

  const logout = React.useCallback(async () => {
    const accessToken = getStoredSession()?.access_token ?? "";
    const refreshToken = getStoredRefreshToken();

    // Local logout is immediate. The revocation request is pinned to the old
    // credentials so its late completion can never clear a newer login.
    clearStoredSession();
    refreshUserAttemptRef.current = null;
    clearPublishedPrincipal();
    router.replace("/login");

    if (refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        auth: false,
        body: { refresh_token: refreshToken },
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
      }).catch(() => undefined);
    }
  }, [clearPublishedPrincipal, router]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isManager,
      login,
      logout,
      refreshUser,
    }),
    [isManager, loading, login, logout, refreshUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

async function hydrateCurrentUser(
  user: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
  fallbackUser: CurrentUser | null = null,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const [permissions, company] = await Promise.all([
    hydrateUserPermissions(
      user,
      fallbackUser?.permissions ?? user.permissions ?? [],
      authenticatedSession,
    ),
    hydrateUserCompany(user),
  ]);
  assertAuthenticatedSessionCurrent(authenticatedSession);

  const declaredUserTimeZone =
    resolveCurrentUserCompanyTimeZone(user).timeZone;

  const hydratedUser = {
    ...user,
    permissions,
    company: company ?? user.company,
    company_name: company?.name ?? user.company_name,
    company_timezone:
      company?.timezone ?? declaredUserTimeZone,
    company_trade_name: company?.trade_name ?? user.company_trade_name,
  };

  if (hasMasterAccess(hydratedUser)) {
    clearStoredCurrentCompanyScope();
    synchronizeMasterCompanyScope(getUserCompanyScope(hydratedUser));
    await hydrateStoredMasterCompanyScope(
      hydratedUser,
      authenticatedSession,
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
  } else {
    clearStoredMasterCompanyScope();
    const companyScope = getUserCompanyScope(hydratedUser);
    if (companyScope) {
      setStoredCurrentCompanyScope(companyScope);
    } else {
      clearStoredCurrentCompanyScope();
    }
  }

  return hydratedUser;
}

async function hydrateAuthenticatedUser(
  authenticatedSession: CurrentUserSessionResponse,
  fallbackUser: CurrentUser | null = null,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const tokenEnrichedUser = reconcileCurrentUserWithAccessToken(
    authenticatedSession.user,
    authenticatedSession.accessToken,
  );
  if (!tokenEnrichedUser) {
    // A 200 without any usable principal is a malformed API response. Claim
    // aliases never reject a profile that `/auth/me` authenticated itself.
    assertAuthenticatedSessionCurrent(authenticatedSession);
    clearStoredSession();
    throw new Error(
      "A API não retornou uma identidade autenticada utilizável.",
    );
  }
  setAuthenticatedMasterAccess(
    tokenEnrichedUser,
    authenticatedSession.accessToken,
  );
  const hydratedUser = await hydrateCurrentUser(
    tokenEnrichedUser,
    authenticatedSession,
    fallbackUser,
  );
  assertAuthenticatedSessionCurrent(authenticatedSession);
  await hydrateUserGridFromServer(hydratedUser.id, {
    expectedAccessToken: authenticatedSession.accessToken,
    shouldApply: () => currentUserSessionIsCurrent(authenticatedSession),
  });
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const companyId = getEffectiveCompanyScopeId(hydratedUser);
  if (companyId) {
    await migrateLegacyLiveDefault({
      companyId,
      expectedAccessToken: authenticatedSession.accessToken,
      shouldApply: () => currentUserSessionIsCurrent(authenticatedSession),
      userId: hydratedUser.id,
    }).catch(() => false);
    assertAuthenticatedSessionCurrent(authenticatedSession);
  }
  return hydratedUser;
}

async function hydrateCurrentAuthenticatedSession<T>(
  fallbackPrincipal: PublishedPrincipal | null,
  commit: (
    user: CurrentUser,
    authenticatedSession: CurrentUserSessionResponse,
  ) => T,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sessionResponse = await currentUserRequest();
    try {
      assertAuthenticatedSessionCurrent(sessionResponse);
      const exactFallbackUser =
        fallbackPrincipal &&
        fallbackPrincipal.accessToken === sessionResponse.accessToken &&
        fallbackPrincipal.sessionRevision === sessionResponse.sessionRevision &&
        currentUserSessionIsCurrent(fallbackPrincipal)
          ? fallbackPrincipal.user
        : null;
      const reconciledSessionUser = reconcileCurrentUserWithAccessToken(
        sessionResponse.user,
        sessionResponse.accessToken,
      );
      const compatibleFallbackUser =
        exactFallbackUser &&
        reconciledSessionUser &&
        currentUsersShareIdentityAndCompany(
          exactFallbackUser,
          reconciledSessionUser,
        )
          ? exactFallbackUser
          : null;
      const hydratedUser = await hydrateAuthenticatedUser(
        sessionResponse,
        compatibleFallbackUser,
      );
      assertAuthenticatedSessionCurrent(sessionResponse);
      // Commit while the snapshot check and React state updates still share
      // the same synchronous turn. A stale user is never published.
      return commit(hydratedUser, sessionResponse);
    } catch (error) {
      if (error instanceof AuthenticatedSessionChangedError) continue;
      throw error;
    }
  }

  throw new ApiError(
    "A sessão foi atualizada durante a autenticação. Tente novamente.",
    409,
  );
}

class AuthenticatedSessionChangedError extends Error {
  constructor() {
    super("A sessão autenticada foi substituída durante a hidratação.");
    this.name = "AuthenticatedSessionChangedError";
  }
}

function assertAuthenticatedSessionCurrent(
  authenticatedSession: CurrentUserSessionResponse,
) {
  if (!currentUserSessionIsCurrent(authenticatedSession)) {
    throw new AuthenticatedSessionChangedError();
  }
}

function currentUsersShareIdentityAndCompany(
  left: CurrentUser,
  right: CurrentUser,
) {
  const leftUserId = left.id?.trim() ?? "";
  const rightUserId = right.id?.trim() ?? "";
  if (!leftUserId || leftUserId !== rightUserId) return false;

  const leftCompanyId = getCurrentUserCompanyId(left).trim();
  const rightCompanyId = getCurrentUserCompanyId(right).trim();
  if (leftCompanyId || rightCompanyId) {
    return Boolean(
      leftCompanyId &&
        rightCompanyId &&
        leftCompanyId === rightCompanyId,
    );
  }
  return true;
}

async function hydrateUserPermissions(
  user: CurrentUser,
  fallbackPermissions: UserPermission[],
  authenticatedSession: CurrentUserSessionResponse,
) {
  if (!user.id) return fallbackPermissions;

  try {
    return await apiFetch<UserPermission[]>(`/users/${user.id}/permissions`, {
      // This request hydrates the authenticated principal itself. The backend
      // derives that identity from the same JWT; a company selected by a
      // superadmin must not leak into this bootstrap request.
      expectedAccessToken: authenticatedSession.accessToken,
      jwtCompanyScopeOnly: true,
    });
  } catch {
    return fallbackPermissions;
  }
}

async function hydrateUserCompany(user: CurrentUser) {
  const companyId = getCurrentUserCompanyId(user);
  const declaredCompany = getDeclaredCompany(user);
  const cachedCompany = readCachedCompany(companyId);
  const fallbackCompany = mergeCurrentUserCompanies(
    companyId,
    cachedCompany,
    declaredCompany,
  );
  if (canonicalCompanyTimeZone(fallbackCompany?.timezone)) {
    writeCompanyCache([fallbackCompany!]);
    return fallbackCompany;
  }
  // `/companies/{id}` is an administrative endpoint in the live API and
  // returns 403 for a regular user. Its own company metadata must come from
  // the authenticated JWT and `/auth/me`; if neither certifies the timezone,
  // dashboards stay fail-closed instead of probing a forbidden route.
  return fallbackCompany;
}

function getDeclaredCompany(user: CurrentUser) {
  return buildCurrentUserCompanyCacheRecord(user);
}

function getUserCompanyScope(user: CurrentUser) {
  const id = getCurrentUserCompanyId(user);
  if (!id) return null;

  const timeZone =
    resolveCurrentUserCompanyTimeZone(user).timeZone;

  return {
    id,
    name:
      user.company?.name ||
      user.company_name ||
      user.company?.trade_name ||
      user.company_trade_name ||
      id,
    timezone: timeZone,
    trade_name: user.company?.trade_name ?? user.company_trade_name ?? null,
  };
}

function mergeCurrentUserCompanies(
  companyId: string,
  ...sources: Array<CurrentUserCompany | null | undefined>
) {
  const companies = sources.filter(
    (company): company is CurrentUserCompany => Boolean(company),
  );
  if (!companyId || !companies.length) return null;

  const merged = Object.assign({}, ...companies) as CurrentUserCompany;
  const timeZone = companies.reduce<string | null>((current, company) => {
    return canonicalCompanyTimeZone(company.timezone) ?? current;
  }, null);
  return {
    ...merged,
    id: companyId,
    name: merged.name || companyId,
    timezone: timeZone,
  };
}

function synchronizeMasterCompanyScope(
  companyScope: ReturnType<typeof getUserCompanyScope>,
) {
  if (!companyScope) return;
  const storedScope = getStoredMasterCompanyScope();
  if (!storedScope) {
    setStoredMasterCompanyScope(companyScope);
    return;
  }
  if (storedScope.id !== companyScope.id) return;

  const timeZone = canonicalCompanyTimeZone(companyScope.timezone);
  if (!timeZone || canonicalCompanyTimeZone(storedScope.timezone) === timeZone) {
    return;
  }
  setStoredMasterCompanyScope({
    ...storedScope,
    name: companyScope.name || storedScope.name,
    timezone: timeZone,
    trade_name: companyScope.trade_name ?? storedScope.trade_name,
  });
}

async function hydrateStoredMasterCompanyScope(
  user: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const storedScope = getStoredMasterCompanyScope();
  if (!storedScope) return;
  const resolution = getCompanyTimeZoneResolutionForScope(user, storedScope.id);
  if (!resolution.fallback) {
    if (canonicalCompanyTimeZone(storedScope.timezone) !== resolution.timeZone) {
      setStoredMasterCompanyScope({
        ...storedScope,
        timezone: resolution.timeZone,
      });
    }
    return;
  }

  try {
    const response = await apiFetch<CurrentUserCompany[]>("/companies", {
      expectedAccessToken: authenticatedSession.accessToken,
      jwtCompanyScopeOnly: true,
    });
    assertAuthenticatedSessionCurrent(authenticatedSession);
    if (!Array.isArray(response)) return;
    const companies = response.map(normalizeCompanyRecord);
    writeCompanyCache(companies);
    const company = companies.find(
      (row) => row.id?.trim() === storedScope.id,
    );
    if (!company) return;
    const timeZone = resolveCompanyRecordTimeZone(company).timeZone;
    if (!timeZone) {
      if (storedScope.timezone) {
        setStoredMasterCompanyScope({ ...storedScope, timezone: null });
      }
      return;
    }
    setStoredMasterCompanyScope({
      ...storedScope,
      name: company.name || storedScope.name,
      timezone: timeZone,
      trade_name: company.trade_name ?? storedScope.trade_name,
    });
  } catch {
    // The dashboards remain fail-closed and surface the certification message.
  }
}
