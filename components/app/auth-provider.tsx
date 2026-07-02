"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  apiFetch,
  clearStoredSession,
  currentUserRequest,
  getStoredRefreshToken,
  getStoredSession,
  loginRequest,
  SESSION_EXPIRED_EVENT,
} from "@/lib/api";
import { hasDeclaredManagerAccess, hasMasterAccess } from "@/lib/access";
import { readCachedCompany, writeCompanyCache } from "@/lib/company-cache";
import {
  clearStoredCurrentCompanyScope,
  clearStoredMasterCompanyScope,
  getCurrentUserCompanyId,
  getStoredMasterCompanyScope,
  setStoredCurrentCompanyScope,
  setStoredMasterCompanyScope,
} from "@/lib/master-company-scope";
import { hasAnyOperationalPermission } from "@/lib/permissions";
import type { CurrentUser, CurrentUserCompany, UserPermission } from "@/lib/types";

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

  const resolveManagerAccess = React.useCallback(async (currentUser: CurrentUser | null) => {
    if (!currentUser) return false;
    if (hasDeclaredManagerAccess(currentUser)) return true;
    if (hasAnyOperationalPermission(currentUser)) return true;
    return false;
  }, []);

  const refreshUser = React.useCallback(async () => {
    try {
      const currentUser = await hydrateCurrentUser(
        await currentUserRequest(),
      );
      const canManage = await resolveManagerAccess(currentUser);
      setUser(currentUser);
      setIsManager(canManage);
      return currentUser;
    } catch {
      clearStoredSession();
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
    function handleSessionExpired() {
      clearStoredSession();
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
    const currentUser = await hydrateCurrentUser(
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

async function hydrateCurrentUser(user: CurrentUser) {
  const [permissions, company] = await Promise.all([
    hydrateUserPermissions(user),
    hydrateUserCompany(user),
  ]);

  const hydratedUser = {
    ...user,
    permissions,
    company: company ?? user.company,
    company_name: company?.name ?? user.company_name,
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

async function hydrateUserPermissions(user: CurrentUser) {
  if (!user.id) return [];

  try {
    return await apiFetch<UserPermission[]>(`/users/${user.id}/permissions`);
  } catch {
    return [];
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
    };
  }
  if (!companyId || !user.company_name) return null;

  return {
    id: companyId,
    name: user.company_name,
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
    trade_name: user.company?.trade_name ?? user.company_trade_name ?? null,
  };
}
