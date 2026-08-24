"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ApiError,
  apiFetch,
  clearStoredSession,
  currentUserRequest,
  getStoredRefreshToken,
  getStoredSession,
  loginRequest,
  SESSION_EXPIRED_EVENT,
  SESSION_UPDATED_EVENT,
  setAuthenticatedMasterAccess,
} from "@/lib/api";
import {
  accessTokenMatchesUserIdentity,
  reconcileCurrentUserWithAccessToken,
} from "@/lib/access-token-claims";
import { hasDeclaredManagerAccess, hasMasterAccess } from "@/lib/access";
import {
  normalizeCompanyRecord,
  readCachedCompany,
  resolveCompanyRecordTimeZone,
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

  const resolveManagerAccess = React.useCallback(async (currentUser: CurrentUser | null) => {
    if (!currentUser) return false;
    if (hasDeclaredManagerAccess(currentUser)) return true;
    if (hasAnyOperationalPermission(currentUser)) return true;
    return false;
  }, []);

  const refreshUser = React.useCallback(async () => {
    try {
      const currentUser = await hydrateAuthenticatedUser(
        await currentUserRequest(),
        userRef.current,
      );
      const canManage = await resolveManagerAccess(currentUser);
      setUser(currentUser);
      setIsManager(canManage);
      return currentUser;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearStoredSession();
        clearUserGridSync();
        setUser(null);
        setIsManager(false);
        return null;
      }

      // Rede/5xx não invalidam uma sessão previamente autenticada. Preserve o
      // último perfil até que uma nova tentativa consiga revalidá-lo.
      return userRef.current;
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

      const currentUser = await refreshUser();
      if (!mounted) return;

      setUser(currentUser);
      setLoading(false);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [refreshUser]);

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
      const currentUser = userRef.current;
      const accessToken = getStoredSession()?.access_token ?? "";
      if (
        reconciling ||
        !currentUser ||
        !accessTokenMatchesUserIdentity(accessToken, currentUser)
      ) {
        return;
      }

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
    await loginRequest(email, password);
    const currentUser = await hydrateAuthenticatedUser(
      await currentUserRequest(),
    );
    const canManage = await resolveManagerAccess(currentUser);
    setUser(currentUser);
    setIsManager(canManage);
    return currentUser;
  }, [resolveManagerAccess]);

  const logout = React.useCallback(async () => {
    const refreshToken = getStoredRefreshToken();

    if (refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: { refresh_token: refreshToken },
      }).catch(() => undefined);
    }

    clearStoredSession();
    clearUserGridSync();
    setUser(null);
    setIsManager(false);
    router.replace("/login");
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
  fallbackUser: CurrentUser | null = null,
) {
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

  const [permissions, company] = await Promise.all([
    hydrateUserPermissions(
      user,
      fallbackUser?.permissions ?? user.permissions ?? [],
    ),
    hydrateUserCompany(user),
  ]);

  const hydratedUser = {
    ...user,
    permissions,
    company: company ?? user.company,
    company_name: company?.name ?? user.company_name,
    company_timezone:
      company?.timezone ?? user.company_timezone ?? user.company?.timezone,
    company_trade_name: company?.trade_name ?? user.company_trade_name,
  };

  if (hasMasterAccess(hydratedUser)) {
    clearStoredCurrentCompanyScope();
    synchronizeMasterCompanyScope(getUserCompanyScope(hydratedUser));
    await hydrateStoredMasterCompanyScope(hydratedUser);
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
  user: CurrentUser,
  fallbackUser: CurrentUser | null = null,
) {
  const accessToken = getStoredSession()?.access_token ?? "";
  const tokenEnrichedUser = reconcileCurrentUserWithAccessToken(
    user,
    accessToken,
  );
  if (!tokenEnrichedUser) {
    throw new ApiError(
      "A identidade retornada pela API diverge do contexto autenticado no JWT.",
      401,
    );
  }
  setAuthenticatedMasterAccess(tokenEnrichedUser);
  const hydratedUser = await hydrateCurrentUser(tokenEnrichedUser, fallbackUser);
  await hydrateUserGridFromServer(hydratedUser.id);
  const companyId = getEffectiveCompanyScopeId(hydratedUser);
  if (companyId) {
    await migrateLegacyLiveDefault({
      companyId,
      userId: hydratedUser.id,
    }).catch(() => false);
  }
  return hydratedUser;
}

async function hydrateUserPermissions(
  user: CurrentUser,
  fallbackPermissions: UserPermission[],
) {
  if (!user.id) return fallbackPermissions;

  try {
    return await apiFetch<UserPermission[]>(`/users/${user.id}/permissions`, {
      // This request hydrates the authenticated principal itself. The backend
      // derives that identity from the same JWT; a company selected by a
      // superadmin must not leak into this bootstrap request.
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
  if (!companyId) return fallbackCompany;

  try {
    const response = await apiFetch<CurrentUserCompany>(
      `/companies/${companyId}`,
      { jwtCompanyScopeOnly: hasMasterAccess(user) },
    );
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
  } catch {
    return fallbackCompany;
  }
}

function getDeclaredCompany(user: CurrentUser) {
  const companyId = getCurrentUserCompanyId(user);
  const declaredTimeZone =
    resolveCompanyRecordTimeZone(user.company).timeZone ??
    resolveCompanyRecordTimeZone(user).timeZone;
  if (user.company?.name) {
    return {
      ...user.company,
      id: user.company.id || companyId,
      timezone: declaredTimeZone,
    };
  }
  if (!companyId || !user.company_name) return null;

  return {
    id: companyId,
    name: user.company_name,
    timezone: declaredTimeZone,
    trade_name: user.company_trade_name ?? null,
  } satisfies CurrentUserCompany;
}

function getUserCompanyScope(user: CurrentUser) {
  const id = getCurrentUserCompanyId(user);
  if (!id) return null;

  const timeZone =
    resolveCompanyRecordTimeZone(user.company).timeZone ??
    resolveCompanyRecordTimeZone(user).timeZone;

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

async function hydrateStoredMasterCompanyScope(user: CurrentUser) {
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
      { companyScopeId: storedScope.id },
    );
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
  } catch {
    // The dashboards remain fail-closed and surface the certification message.
  }
}
