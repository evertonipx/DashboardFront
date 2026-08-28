"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ApiError,
  apiFetch,
  clearStoredSession,
  currentUserRequest,
  currentUserSessionIsCurrent,
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
  accessTokenExplicitlyMismatchesUserIdentity,
  accessTokensShareUserIdentity,
  reconcileCurrentUserWithAccessToken,
} from "@/lib/access-token-claims";
import { enrichAuthenticatedPermissionMetadata } from "@/lib/authenticated-permission-metadata";
import { hasDeclaredManagerAccess, hasMasterAccess } from "@/lib/access";
import {
  buildCurrentUserCompanyCacheRecord,
  normalizeCompanyRecord,
  readCachedCompany,
  resolveCurrentUserCompanyTimeZone,
  writeCompanyCache,
} from "@/lib/company-cache";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import {
  clearStoredCurrentCompanyScope,
  clearStoredMasterCompanyScope,
  getCompanyTimeZoneResolutionForScope,
  getCurrentUserCompanyId,
  getStoredMasterCompanyScope,
  setStoredCurrentCompanyScope,
  setStoredMasterCompanyScope,
} from "@/lib/master-company-scope";
import { hasAnyOperationalPermission } from "@/lib/permissions";
import type {
  CurrentUser,
  CurrentUserCompany,
  CurrentUserCompanyModule,
  UserPermission,
} from "@/lib/types";
import {
  clearUserGridSync,
  flushUserGridSync,
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

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [isManager, setIsManager] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const gridSyncErrorShown = React.useRef(false);
  const userRef = React.useRef<CurrentUser | null>(null);

  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  const resolveManagerAccess = React.useCallback((currentUser: CurrentUser | null) => {
    if (!currentUser) return false;
    if (hasDeclaredManagerAccess(currentUser)) return true;
    if (hasAnyOperationalPermission(currentUser)) return true;
    return false;
  }, []);

  const refreshUser = React.useCallback(async () => {
    try {
      const currentUser = await requestAuthenticatedUser(userRef.current);
      setUser(currentUser);
      setIsManager(resolveManagerAccess(currentUser));
      return currentUser;
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403) &&
        !getStoredSession()
      ) {
        clearUserGridSync();
        setUser(null);
        setIsManager(false);
        return null;
      }

      if (error instanceof ApiError && error.status === 409) {
        return null;
      }

      // Rede/5xx não invalidam uma sessão previamente autenticada. Preserve o
      // último perfil somente se o JWT atual ainda certificar exatamente a
      // mesma identidade/empresa. Uma sessão trocada nunca herda o principal
      // publicado pela anterior.
      const fallbackUser = userRef.current;
      const accessToken = getStoredSession()?.access_token ?? "";
      if (
        fallbackUser &&
        accessToken &&
        !accessTokenExplicitlyMismatchesUserIdentity(accessToken, fallbackUser)
      ) {
        return fallbackUser;
      }
      clearUserGridSync();
      userRef.current = null;
      setUser(null);
      setIsManager(false);
      return null;
    }
  }, [resolveManagerAccess]);

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
      const session = getStoredSession();

      clearUserGridSync();
      userRef.current = null;
      setUser(null);
      setIsManager(false);
      if (!session) {
        router.replace("/login");
        return;
      }

      // A cross-tab revision is a distinct session lineage. Hide the previous
      // principal until `/auth/me` is reconciled against the token now stored.
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
  }, [refreshUser, router]);

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
      clearUserGridSync();
      userRef.current = null;
      setUser(null);
      setIsManager(false);
      router.replace("/login");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [router]);

  React.useEffect(() => {
    let reconciling = false;

    function handleSessionUpdated() {
      const accessToken = getStoredSession()?.access_token ?? "";
      if (reconciling || !accessToken) return;

      reconciling = true;
      void refreshUser().finally(() => {
        reconciling = false;
      });
    }

    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, [refreshUser]);

  const login = React.useCallback(async (email: string, password: string) => {
    const issuedSession = await loginRequest(email, password);
    try {
      const currentUser = await requestAuthenticatedUser();
      const canManage = await resolveManagerAccess(currentUser);
      setUser(currentUser);
      setIsManager(canManage);
      return currentUser;
    } catch (error) {
      // Login is transactional from the browser's perspective. Keeping the
      // newly-issued tokens after /auth/me fails or contradicts the JWT would
      // let the bootstrap effect enter later with a session the user was told
      // had failed.
      // If another login replaced this attempt in the meantime, never erase
      // that newer session from this stale catch handler.
      if (
        getStoredSession()?.access_token === issuedSession.access_token
      ) {
        clearStoredSession();
        clearUserGridSync();
        setUser(null);
        setIsManager(false);
      }
      throw error;
    }
  }, [resolveManagerAccess]);

  const logout = React.useCallback(async () => {
    const initialSession = getStoredSession();
    const initialAccessToken = initialSession?.access_token ?? "";
    const principalAtLogout = userRef.current;

    // Give debounced personal preferences a short opportunity to reach the
    // authenticated user-grid before the old token is removed. Failure never
    // blocks logout or lets a later session inherit this sync generation.
    await Promise.race([
      flushUserGridSync().catch(() => false),
      new Promise<false>((resolve) => {
        window.setTimeout(() => resolve(false), 1_500);
      }),
    ]);

    const currentSession = getStoredSession();
    const sessionWasReplaced = Boolean(
      initialAccessToken &&
        currentSession?.access_token &&
        currentSession.access_token !== initialAccessToken &&
        !accessTokensShareUserIdentity(
          initialAccessToken,
          currentSession.access_token,
        ),
    );
    if (
      sessionWasReplaced ||
      (currentSession &&
        principalAtLogout &&
        accessTokenExplicitlyMismatchesUserIdentity(
          currentSession.access_token,
          principalAtLogout,
        ))
    ) {
      // A distinct login won the race while the old grid was flushing. Never
      // clear or revoke the newer principal from this stale logout action.
      return;
    }

    const accessToken = currentSession?.access_token ?? initialAccessToken;
    const refreshToken = currentSession?.refresh_token ?? getStoredRefreshToken();

    // Local logout remains authoritative. The revocation request is pinned to
    // the latest token in the same principal lineage, including a refresh that
    // happened while the personal grid was being flushed.
    clearStoredSession();
    clearUserGridSync();
    userRef.current = null;
    setUser(null);
    setIsManager(false);
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
  }, [router]);

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
  const preliminaryCompanyScope = getUserCompanyScope(user);
  if (hasMasterAccess(user)) {
    clearStoredCurrentCompanyScope();
    synchronizeMasterCompanyScope(preliminaryCompanyScope);
  } else {
    clearStoredMasterCompanyScope();
    if (preliminaryCompanyScope) {
      setStoredCurrentCompanyScope(preliminaryCompanyScope);
    } else {
      clearStoredCurrentCompanyScope();
    }
  }

  const [permissions, company, companyModules] = await Promise.all([
    hydrateUserPermissions(
      user,
      user.permissions ?? fallbackUser?.permissions ?? [],
      authenticatedSession,
    ),
    hydrateUserCompany(user, authenticatedSession),
    hydrateUserCompanyModules(user, authenticatedSession),
  ]);
  assertAuthenticatedSessionCurrent(authenticatedSession);

  const hydratedUser = {
    ...user,
    permissions,
    company_modules: companyModules,
    company: company ?? user.company,
    company_name: company?.name ?? user.company_name,
    company_timezone:
      company?.timezone ?? user.company_timezone ?? user.company?.timezone,
    company_trade_name: company?.trade_name ?? user.company_trade_name,
  };

  if (hasMasterAccess(hydratedUser)) {
    clearStoredCurrentCompanyScope();
    synchronizeMasterCompanyScope(getUserCompanyScope(hydratedUser));
    await hydrateStoredMasterCompanyScope(hydratedUser, authenticatedSession);
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
  const accessToken = authenticatedSession.accessToken;
  const tokenEnrichedUser = reconcileCurrentUserWithAccessToken(
    authenticatedSession.user,
    accessToken,
  );
  if (!tokenEnrichedUser) {
    throw new ApiError(
      "A identidade retornada pela API diverge do contexto autenticado no JWT.",
      401,
    );
  }
  setAuthenticatedMasterAccess(tokenEnrichedUser, accessToken);
  const hydratedUser = await hydrateCurrentUser(
    tokenEnrichedUser,
    authenticatedSession,
    fallbackUser,
  );
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const sessionIsCurrent = () =>
    currentUserSessionIsCurrent(authenticatedSession);
  await hydrateUserGridFromServer(hydratedUser.id, {
    expectedAccessToken: accessToken,
    shouldApply: sessionIsCurrent,
  });
  assertAuthenticatedSessionCurrent(authenticatedSession);
  return hydratedUser;
}

async function requestAuthenticatedUser(
  fallbackUser: CurrentUser | null = null,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const authenticatedSession = await currentUserRequest();
    try {
      assertAuthenticatedSessionCurrent(authenticatedSession);
      return await hydrateAuthenticatedUser(
        authenticatedSession,
        fallbackUser,
      );
    } catch (error) {
      if (!currentUserSessionIsCurrent(authenticatedSession)) continue;
      throw error;
    }
  }

  throw new ApiError(
    "A sessão foi atualizada durante a validação. Tente novamente.",
    409,
  );
}

async function hydrateUserPermissions(
  user: CurrentUser,
  fallbackPermissions: UserPermission[],
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  // When `/auth/me` was reconciled with an explicit JWT permission claim, that
  // list is the authorization source for this session (including an explicit
  // empty list). Swagger catalog responses may describe those grants, but
  // cannot add or remove authorization.
  if (user.permissions !== undefined) {
    if (!user.id || !user.permissions.length) return user.permissions;

    const [assignedMetadata, permissionCatalog] = await Promise.all([
      readAuthenticatedPermissionMetadata(
        `/users/${user.id}/permissions`,
        authenticatedSession,
      ),
      readAuthenticatedPermissionMetadata(
        "/permissions",
        authenticatedSession,
      ),
    ]);
    assertAuthenticatedSessionCurrent(authenticatedSession);
    return enrichAuthenticatedPermissionMetadata(
      user.permissions,
      [assignedMetadata, permissionCatalog],
      getCurrentUserCompanyId(user),
    );
  }
  if (!user.id) return fallbackPermissions;

  try {
    // JWT versions that omit the permission claim use the documented user
    // permission route as their grant source. The global catalogue remains
    // metadata-only even in this compatibility path.
    const assignedPermissions = await apiFetch<UserPermission[]>(
      `/users/${user.id}/permissions`,
      {
        expectedAccessToken: authenticatedSession.accessToken,
        jwtCompanyScopeOnly: true,
      },
    );
    const permissionCatalog = await readAuthenticatedPermissionMetadata(
      "/permissions",
      authenticatedSession,
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
    return enrichAuthenticatedPermissionMetadata(
      assignedPermissions,
      [permissionCatalog],
      getCurrentUserCompanyId(user),
    );
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    // A previous session snapshot must never keep UI authorization alive when
    // the current JWT omits grants and the documented source cannot certify
    // them. Backend enforcement still applies, and the UI fails closed.
    return [];
  }
}

async function hydrateUserCompanyModules(
  user: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  if (hasMasterAccess(user)) return user.company_modules;

  const companyId = getCurrentUserCompanyId(user);
  if (!companyId) return [];
  try {
    const rows = await apiFetch<CurrentUserCompanyModule[]>(
      "/company/modules",
      {
        expectedAccessToken: authenticatedSession.accessToken,
        jwtCompanyScopeOnly: true,
      },
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
    if (!Array.isArray(rows)) return [];

    return rows.filter((assignment) => {
      const assignmentCompanyId = assignment.company_id?.trim();
      const moduleId = assignment.module_id?.trim() || assignment.module?.id?.trim();
      return Boolean(
        moduleId &&
          (!assignmentCompanyId || assignmentCompanyId === companyId),
      );
    });
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    return [];
  }
}

async function readAuthenticatedPermissionMetadata(
  path: string,
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  try {
    const permissions = await apiFetch<UserPermission[]>(path, {
      expectedAccessToken: authenticatedSession.accessToken,
      // This request hydrates the authenticated principal itself. The backend
      // derives that identity from the same JWT; a company selected by a
      // superadmin must not leak into this bootstrap request.
      jwtCompanyScopeOnly: true,
    });
    assertAuthenticatedSessionCurrent(authenticatedSession);
    return permissions;
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    return [];
  }
}

async function hydrateUserCompany(
  user: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
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
  if (!companyId) return fallbackCompany;

  // Swagger marks `/companies/{id}` as super-admin-only. A regular user's
  // company metadata has already been reconciled from the exact JWT and
  // `/auth/me`; probing this administrative route only creates a guaranteed
  // 403 and used to leave every civil dashboard permanently blocked.
  if (!hasMasterAccess(user)) return fallbackCompany;

  try {
    const response = await apiFetch<CurrentUserCompany>(
      `/companies/${companyId}`,
      {
        expectedAccessToken: authenticatedSession.accessToken,
        jwtCompanyScopeOnly: hasMasterAccess(user),
      },
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
    if (response.id?.trim() !== companyId) {
      throw new Error("A API retornou o cadastro de outra empresa.");
    }
    const company = mergeCurrentUserCompanies(
      companyId,
      fallbackCompany,
      normalizeCompanyRecord(response),
    );
    if (!company) return fallbackCompany;
    writeCompanyCache([company]);
    return company;
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    return fallbackCompany;
  }
}

function assertAuthenticatedSessionCurrent(
  authenticatedSession: Pick<
    CurrentUserSessionResponse,
    "accessToken" | "sessionRevision"
  >,
) {
  if (!currentUserSessionIsCurrent(authenticatedSession)) {
    throw new ApiError(
      "A sessão foi atualizada durante a validação. Tente novamente.",
      409,
    );
  }
}

function getDeclaredCompany(user: CurrentUser) {
  return buildCurrentUserCompanyCacheRecord(user);
}

function getUserCompanyScope(user: CurrentUser) {
  const id = getCurrentUserCompanyId(user);
  if (!id) return null;

  const timeZone = resolveCurrentUserCompanyTimeZone(user).timeZone;

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
  if (!resolution.fallback && resolution.source === "current-user-company") {
    if (canonicalCompanyTimeZone(storedScope.timezone) !== resolution.timeZone) {
      setStoredMasterCompanyScope({
        ...storedScope,
        timezone: resolution.timeZone,
      });
    }
    return;
  }

  try {
    const response = await apiFetch<CurrentUserCompany>(
      `/companies/${storedScope.id}`,
      {
        companyScopeId: storedScope.id,
        expectedAccessToken: authenticatedSession.accessToken,
      },
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
    if (response.id?.trim() !== storedScope.id) return;
    const company = normalizeCompanyRecord(response);
    const timeZone = canonicalCompanyTimeZone(company.timezone);
    if (!timeZone) return;
    writeCompanyCache([{ ...company, timezone: timeZone }]);
    setStoredMasterCompanyScope({
      ...storedScope,
      name: company.name || storedScope.name,
      timezone: timeZone,
      trade_name: company.trade_name ?? storedScope.trade_name,
    });
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    // The dashboards remain fail-closed and surface the certification message.
  }
}
