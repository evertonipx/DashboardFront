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
  setAuthenticatedMasterAccess,
} from "@/lib/api";
import { reconcileCurrentUserWithAccessToken } from "@/lib/access-token-claims";
import { hasDeclaredManagerAccess, hasMasterAccess } from "@/lib/access";
import { readCachedCompany, writeCompanyCache } from "@/lib/company-cache";
import { migrateLegacyLiveDefault } from "@/lib/legacy-dashboard-view-migration";
import {
  clearStoredCurrentCompanyScope,
  clearStoredMasterCompanyScope,
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
    if (preliminaryCompanyScope && !getStoredMasterCompanyScope()) {
      setStoredMasterCompanyScope(preliminaryCompanyScope);
    }
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
    if (!getStoredMasterCompanyScope()) {
      const companyScope = getUserCompanyScope(hydratedUser);
      if (companyScope) {
        setStoredMasterCompanyScope(companyScope);
      }
    }
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
  const declaredCompany = getDeclaredCompany(user);
  if (declaredCompany) {
    writeCompanyCache([declaredCompany]);
    return declaredCompany;
  }

  if (hasMasterAccess(user)) return null;
  const companyId = getCurrentUserCompanyId(user);
  if (!companyId) return null;

  const cachedCompany = readCachedCompany(companyId);
  if (!hasDeclaredManagerAccess(user)) return cachedCompany;

  try {
    const company = await apiFetch<CurrentUserCompany>(
      `/companies/${companyId}`,
    );
    writeCompanyCache([company]);
    return company;
  } catch {
    return cachedCompany;
  }
}

function getDeclaredCompany(user: CurrentUser) {
  const companyId = getCurrentUserCompanyId(user);
  if (user.company?.name) {
    return {
      ...user.company,
      id: user.company.id || companyId,
      timezone: user.company.timezone ?? user.company_timezone ?? null,
    };
  }
  if (!companyId || !user.company_name) return null;

  return {
    id: companyId,
    name: user.company_name,
    timezone: user.company_timezone ?? null,
    trade_name: user.company_trade_name ?? null,
  } satisfies CurrentUserCompany;
}

function getUserCompanyScope(user: CurrentUser) {
  const id = getCurrentUserCompanyId(user);
  if (!id) return null;

  return {
    id,
    name:
      user.company?.name ||
      user.company_name ||
      user.company?.trade_name ||
      user.company_trade_name ||
      id,
    timezone: user.company?.timezone ?? user.company_timezone ?? null,
    trade_name: user.company?.trade_name ?? user.company_trade_name ?? null,
  };
}
