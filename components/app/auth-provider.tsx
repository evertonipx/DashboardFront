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
  accessTokenExplicitlyMismatchesUserContext,
  accessTokenExplicitlyMismatchesUserIdentity,
  accessTokensShareUserIdentity,
  reconcileCurrentUserWithAccessToken,
} from "@/lib/access-token-claims";
import {
  certifyAuthenticatedUserPermissionMetadata,
  enrichAuthenticatedCompanyModuleMetadata,
  enrichAuthenticatedPermissionMetadata,
} from "@/lib/authenticated-permission-metadata";
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

type CertifiedAuthenticatedUser = {
  authenticatedSession: CurrentUserSessionResponse;
  companyModulesHydrated: boolean;
  permissionAssignmentsHydrated: boolean;
  user: CurrentUser;
};

type CertifiedUserPublication = {
  companyModulesHydrated: boolean;
  permissionAssignmentsHydrated: boolean;
  user: CurrentUser;
};

type BackgroundHydrationAttempt = {
  accessToken: string;
  promise: Promise<CurrentUser>;
  sessionRevision: number;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [isManager, setIsManager] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [gridReadyAccessToken, setGridReadyAccessToken] = React.useState("");
  const backgroundHydrationRef = React.useRef<BackgroundHydrationAttempt | null>(
    null,
  );
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

  const publishAuthenticatedUser = React.useCallback(
    (
      currentUser: CurrentUser,
      authenticatedSession: CurrentUserSessionResponse,
    ) => {
      if (!currentUserSessionIsCurrent(authenticatedSession)) return false;
      userRef.current = currentUser;
      setUser(currentUser);
      setIsManager(resolveManagerAccess(currentUser));
      return true;
    },
    [resolveManagerAccess],
  );

  const hydrateAuthenticatedUserInBackground = React.useCallback(
    ({
      authenticatedSession,
      companyModulesHydrated,
      permissionAssignmentsHydrated,
      user: certifiedUser,
    }: CertifiedAuthenticatedUser) => {
      const accessToken = authenticatedSession.accessToken;
      const currentAttempt = backgroundHydrationRef.current;
      if (
        currentAttempt?.accessToken === accessToken &&
        currentAttempt.sessionRevision === authenticatedSession.sessionRevision
      ) {
        return currentAttempt.promise;
      }

      const metadataPromise = hydrateAuthenticatedUser(
        certifiedUser,
        authenticatedSession,
        { companyModulesHydrated, permissionAssignmentsHydrated },
      )
        .then((hydratedUser) => {
          publishAuthenticatedUser(hydratedUser, authenticatedSession);
          return hydratedUser;
        })
        .catch(() => {
          // Every optional metadata source already falls back locally. A
          // rejection here therefore means that this session lineage was
          // superseded; the winning refresh/login owns the published state.
          return certifiedUser;
        });
      const gridPromise = hydrateAuthenticatedUserGrid(
        certifiedUser,
        authenticatedSession,
      )
        .then(() => {
          if (currentUserSessionIsCurrent(authenticatedSession)) {
            setGridReadyAccessToken(accessToken);
          }
        })
        .catch(() => undefined);
      const promise = Promise.all([metadataPromise, gridPromise])
        .then(([hydratedUser]) => hydratedUser)
        .finally(() => {
          if (backgroundHydrationRef.current?.promise === promise) {
            backgroundHydrationRef.current = null;
          }
        });
      backgroundHydrationRef.current = {
        accessToken,
        promise,
        sessionRevision: authenticatedSession.sessionRevision,
      };
      return promise;
    },
    [publishAuthenticatedUser],
  );

  const refreshUser = React.useCallback(async () => {
    try {
      const certified = await requestAuthenticatedUser();
      if (!publishAuthenticatedUser(certified.user, certified.authenticatedSession)) {
        return null;
      }
      setGridReadyAccessToken((current) =>
        current === certified.authenticatedSession.accessToken ? current : "",
      );
      void hydrateAuthenticatedUserInBackground(certified);
      return certified.user;
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403) &&
        !getStoredSession()
      ) {
        clearUserGridSync();
        setGridReadyAccessToken("");
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
        !accessTokenExplicitlyMismatchesUserContext(accessToken, fallbackUser)
      ) {
        return fallbackUser;
      }
      clearUserGridSync();
      setGridReadyAccessToken("");
      userRef.current = null;
      setUser(null);
      setIsManager(false);
      return null;
    }
  }, [hydrateAuthenticatedUserInBackground, publishAuthenticatedUser]);

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
      setGridReadyAccessToken("");
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
    if (
      !user?.id ||
      !gridReadyAccessToken ||
      getStoredSession()?.access_token !== gridReadyAccessToken
    ) {
      return;
    }
    return startUserGridSync(user.id);
  }, [gridReadyAccessToken, user?.id]);

  React.useEffect(() => {
    function handleGridSyncStatus(event: Event) {
      const detail = (event as CustomEvent<UserGridSyncStatusDetail>).detail;
      if (detail?.status === "error" && !gridSyncErrorShown.current) {
        gridSyncErrorShown.current = true;
        toast.error(
          "Não foi possível sincronizar as configurações agora. As alterações foram preservadas e serão reenviadas automaticamente.",
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
      setGridReadyAccessToken("");
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
      const certified = await requestAuthenticatedUser();
      if (!publishAuthenticatedUser(certified.user, certified.authenticatedSession)) {
        throw new ApiError(
          "A sessão foi atualizada durante a validação. Tente novamente.",
          409,
        );
      }
      setGridReadyAccessToken("");
      void hydrateAuthenticatedUserInBackground(certified);
      return certified.user;
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
        setGridReadyAccessToken("");
        userRef.current = null;
        setUser(null);
        setIsManager(false);
      }
      throw error;
    }
  }, [hydrateAuthenticatedUserInBackground, publishAuthenticatedUser]);

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
    setGridReadyAccessToken("");
    backgroundHydrationRef.current = null;
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
  {
    companyModulesHydrated = false,
    permissionAssignmentsHydrated = false,
  }: {
    companyModulesHydrated?: boolean;
    permissionAssignmentsHydrated?: boolean;
  } = {},
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  synchronizeAuthenticatedCompanyScope(user);

  const [permissions, company, companyModules] = await Promise.all([
    hydrateUserPermissions(
      user,
      user.permissions ?? fallbackUser?.permissions ?? [],
      authenticatedSession,
      { assignmentsHydrated: permissionAssignmentsHydrated },
    ),
    hydrateUserCompany(user, authenticatedSession),
    companyModulesHydrated
      ? Promise.resolve(user.company_modules ?? [])
      : hydrateUserCompanyModules(user, authenticatedSession),
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
  certifiedUser: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
  options: {
    companyModulesHydrated?: boolean;
    permissionAssignmentsHydrated?: boolean;
  } = {},
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const hydratedUser = await hydrateCurrentUser(
    certifiedUser,
    authenticatedSession,
    null,
    options,
  );
  assertAuthenticatedSessionCurrent(authenticatedSession);
  return hydratedUser;
}

async function hydrateAuthenticatedUserGrid(
  certifiedUser: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  await hydrateUserGridFromServer(certifiedUser.id, {
    expectedAccessToken: authenticatedSession.accessToken,
    shouldApply: () => currentUserSessionIsCurrent(authenticatedSession),
  });
  assertAuthenticatedSessionCurrent(authenticatedSession);
}

async function requestAuthenticatedUser(): Promise<CertifiedAuthenticatedUser> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const authenticatedSession = await currentUserRequest();
    try {
      assertAuthenticatedSessionCurrent(authenticatedSession);
      const user = await certifyAuthenticatedUserForPublication(
        authenticatedSession,
      );
      assertAuthenticatedSessionCurrent(authenticatedSession);
      return { authenticatedSession, ...user };
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
  { assignmentsHydrated = false }: { assignmentsHydrated?: boolean } = {},
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  // When `/auth/me` was reconciled with an explicit JWT permission claim, that
  // list is the authorization source for this session (including an explicit
  // empty list). Swagger catalog responses may describe those grants, but
  // cannot add or remove authorization.
  if (user.permissions !== undefined) {
    if (!user.id || !user.permissions.length) return user.permissions;

    const [assignedMetadata, permissionCatalog] = await Promise.all([
      assignmentsHydrated
        ? Promise.resolve([])
        : readAuthenticatedPermissionMetadata(
            `/users/${user.id}/permissions`,
            authenticatedSession,
          ),
      readAuthenticatedPermissionMetadata(
        "/permissions",
        authenticatedSession,
      ),
    ]);
    assertAuthenticatedSessionCurrent(authenticatedSession);
    const certifiedAssignedMetadata =
      certifyAuthenticatedUserPermissionMetadata(
        assignedMetadata,
        user.id,
        getCurrentUserCompanyId(user),
      );
    return enrichAuthenticatedPermissionMetadata(
      user.permissions,
      [certifiedAssignedMetadata, permissionCatalog],
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
    const certifiedAssignedPermissions =
      certifyAuthenticatedUserPermissionMetadata(
        assignedPermissions,
        user.id,
        getCurrentUserCompanyId(user),
      );
    return enrichAuthenticatedPermissionMetadata(
      certifiedAssignedPermissions,
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
  const authenticatedAssignments =
    user.company_modules === undefined
      ? undefined
      : certifyCompanyModuleAssignments(user.company_modules, companyId);
  try {
    const rows = await apiFetch<CurrentUserCompanyModule[]>(
      "/company/modules",
      {
        expectedAccessToken: authenticatedSession.accessToken,
        jwtCompanyScopeOnly: true,
      },
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
    const certifiedRows = certifyCompanyModuleAssignments(rows, companyId);
    // An explicit JWT list is the assignment authority for this session. The
    // Swagger endpoint can enrich matching records (and explicitly restrict an
    // enabled claim), but an extra endpoint row cannot manufacture module
    // access omitted by the accepted token.
    return authenticatedAssignments !== undefined
      ? enrichAuthenticatedCompanyModuleMetadata(
          authenticatedAssignments,
          certifiedRows,
          companyId,
        )
      : certifiedRows;
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    // If the accepted JWT explicitly carries assignments, a transient metadata
    // failure must not erase them. JWT omission still fails closed because the
    // documented endpoint is then the only assignment source.
    return authenticatedAssignments !== undefined
      ? [...authenticatedAssignments]
      : [];
  }
}

function certifyCompanyModuleAssignments(
  value: unknown,
  expectedCompanyId: string,
): CurrentUserCompanyModule[] {
  if (!Array.isArray(value)) return [];
  const assignments = new Map<string, CurrentUserCompanyModule>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const assignment = candidate as Record<string, unknown>;
    const company = resolveRuntimeIdentifierAliases(assignment, [
      "company_id",
      "companyId",
      "tenant_id",
      "tenantId",
    ]);
    if (company.invalid) return [];
    if (
      company.value &&
      !runtimeIdentifiersMatch(company.value, expectedCompanyId)
    ) {
      continue;
    }
    if (typeof assignment.enabled !== "boolean") return [];

    const moduleRecord =
      assignment.module &&
      typeof assignment.module === "object" &&
      !Array.isArray(assignment.module)
        ? (assignment.module as Record<string, unknown>)
        : null;
    if (assignment.module !== undefined && assignment.module !== null && !moduleRecord) {
      return [];
    }
    const declaredModule = resolveRuntimeIdentifierAliases(assignment, [
      "module_id",
      "moduleId",
    ]);
    if (declaredModule.invalid) return [];
    const declaredModuleId = declaredModule.value;
    const nestedModuleId =
      typeof moduleRecord?.id === "string" ? moduleRecord.id.trim() : "";
    if (
      (moduleRecord?.id !== undefined && !nestedModuleId) ||
      (declaredModuleId &&
        nestedModuleId &&
        !runtimeIdentifiersMatch(declaredModuleId, nestedModuleId))
    ) {
      return [];
    }
    const moduleId = declaredModuleId || nestedModuleId;
    if (!moduleId) return [];
    if (
      moduleRecord?.active !== undefined &&
      moduleRecord.active !== null &&
      typeof moduleRecord.active !== "boolean"
    ) {
      return [];
    }
    const moduleSlug =
      typeof moduleRecord?.slug === "string" ? moduleRecord.slug.trim() : "";
    const moduleName =
      typeof moduleRecord?.name === "string" ? moduleRecord.name.trim() : "";
    if (
      (moduleRecord?.slug !== undefined && !moduleSlug) ||
      (moduleRecord?.name !== undefined && !moduleName)
    ) {
      return [];
    }

    const certifiedAssignment: CurrentUserCompanyModule = {
      ...(typeof assignment.id === "string" && assignment.id.trim()
        ? { id: assignment.id.trim() }
        : undefined),
      company_id: expectedCompanyId,
      enabled: assignment.enabled,
      module_id: moduleId,
      ...(moduleRecord && moduleSlug && moduleName
        ? {
            module: {
              id: nestedModuleId || moduleId,
              slug: moduleSlug,
              name: moduleName,
              ...(typeof moduleRecord.description === "string"
                ? { description: moduleRecord.description }
                : undefined),
              ...(typeof moduleRecord.active === "boolean"
                ? { active: moduleRecord.active }
                : undefined),
            },
          }
        : undefined),
    };
    const identity = moduleId.toLowerCase();
    const previous = assignments.get(identity);
    if (!previous) {
      assignments.set(identity, certifiedAssignment);
      continue;
    }

    const previousSlug = previous.module?.slug.trim().toLowerCase() ?? "";
    const currentSlug = certifiedAssignment.module?.slug.trim().toLowerCase() ?? "";
    const ambiguousIdentity = Boolean(
      previousSlug && currentSlug && previousSlug !== currentSlug,
    );
    const richerModule = previous.module ?? certifiedAssignment.module;
    assignments.set(identity, {
      ...previous,
      company_id: expectedCompanyId,
      // Duplicate endpoint rows are one assertion. Any explicit negative or
      // incompatible identity must win instead of leaving a truthy sibling
      // that `.some()` could use to grant the module.
      enabled:
        !ambiguousIdentity &&
        previous.enabled &&
        certifiedAssignment.enabled,
      ...(richerModule
        ? {
            module: {
              ...richerModule,
              ...(previous.module?.active === false ||
              certifiedAssignment.module?.active === false
                ? { active: false }
                : undefined),
            },
          }
        : undefined),
    });
  }
  return [...assignments.values()];
}

function resolveRuntimeIdentifierAliases(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  const values: string[] = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const rawValue = record[key];
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return { invalid: true, value: "" };
    }
    const value = rawValue.trim();
    if (!values.some((candidate) => runtimeIdentifiersMatch(candidate, value))) {
      values.push(value);
    }
  }
  return {
    invalid: values.length > 1,
    value: values.length === 1 ? values[0] : "",
  };
}

function runtimeIdentifiersMatch(left: string, right: string) {
  if (left === right) return true;
  const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  return (
    uuidPattern.test(left) &&
    uuidPattern.test(right) &&
    left.toLowerCase() === right.toLowerCase()
  );
}

/**
 * Resolves only the security-critical principal used by route guards. The
 * Bearer has already been accepted by `/auth/me`; JWT claims may fill fields
 * omitted by that response, but explicit identity/company conflicts remain
 * fail-closed in `reconcileCurrentUserWithAccessToken`.
 *
 * Compatibility requests can delay this stage only when the accepted
 * principal omitted security-critical grants/modules, or when a master scope
 * still needs an authoritative timezone. Descriptions, catalog enrichment and
 * user-grid hydration deliberately run after publication.
 */
async function certifyAuthenticatedUserForPublication(
  authenticatedSession: CurrentUserSessionResponse,
): Promise<CertifiedUserPublication> {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const accessToken = authenticatedSession.accessToken;
  const tokenEnrichedUser = reconcileCurrentUserWithAccessToken(
    authenticatedSession.user,
    accessToken,
  );
  if (!tokenEnrichedUser) {
    throw new ApiError(
      "Não foi possível validar sua sessão. Entre novamente.",
      401,
    );
  }

  setAuthenticatedMasterAccess(tokenEnrichedUser, accessToken);
  const declaredCompanyModules = certifyUserCompanyModulesForPublication(
    tokenEnrichedUser,
  );
  const companyModulesHydrated = Boolean(
    !hasMasterAccess(tokenEnrichedUser) &&
      tokenEnrichedUser.company_modules === undefined,
  );
  const permissionAssignmentsHydrated = Boolean(
    !hasMasterAccess(tokenEnrichedUser) &&
      tokenEnrichedUser.permissions === undefined &&
      tokenEnrichedUser.id,
  );
  const [permissions, companyModules] = await Promise.all([
    certifyUserPermissionsForPublication(
      tokenEnrichedUser,
      authenticatedSession,
    ),
    companyModulesHydrated
      ? hydrateUserCompanyModules(tokenEnrichedUser, authenticatedSession)
      : Promise.resolve(declaredCompanyModules),
  ]);
  assertAuthenticatedSessionCurrent(authenticatedSession);
  const certifiedUser: CurrentUser = {
    ...tokenEnrichedUser,
    ...(permissions === undefined ? undefined : { permissions }),
    ...(companyModules === undefined
      ? undefined
      : { company_modules: companyModules }),
  };
  synchronizeAuthenticatedCompanyScope(certifiedUser);
  setAuthenticatedMasterAccess(certifiedUser, accessToken);
  if (hasMasterAccess(certifiedUser)) {
    await hydrateStoredMasterCompanyScope(certifiedUser, authenticatedSession);
    assertAuthenticatedSessionCurrent(authenticatedSession);
  }
  return {
    companyModulesHydrated,
    permissionAssignmentsHydrated,
    user: certifiedUser,
  };
}

async function certifyUserPermissionsForPublication(
  user: CurrentUser,
  authenticatedSession: CurrentUserSessionResponse,
) {
  assertAuthenticatedSessionCurrent(authenticatedSession);
  if (user.permissions !== undefined) return user.permissions;
  // Master access is already certified by `/auth/me` and/or the accepted JWT.
  // Keep an omitted list omitted so background hydration can still enrich it.
  if (hasMasterAccess(user)) return undefined;
  if (!user.id) return [];

  try {
    const assignedPermissions = await apiFetch<UserPermission[]>(
      `/users/${user.id}/permissions`,
      {
        expectedAccessToken: authenticatedSession.accessToken,
        jwtCompanyScopeOnly: true,
      },
    );
    assertAuthenticatedSessionCurrent(authenticatedSession);
    return certifyAuthenticatedUserPermissionMetadata(
      assignedPermissions,
      user.id,
      getCurrentUserCompanyId(user),
    );
  } catch (error) {
    if (!currentUserSessionIsCurrent(authenticatedSession)) throw error;
    // No accepted claim and no certified assignment response means no grant.
    return [];
  }
}

function certifyUserCompanyModulesForPublication(user: CurrentUser) {
  if (hasMasterAccess(user)) return user.company_modules;
  const companyId = getCurrentUserCompanyId(user);
  if (!companyId) return [];
  if (user.company_modules === undefined) return undefined;
  return certifyCompanyModuleAssignments(user.company_modules, companyId);
}

function synchronizeAuthenticatedCompanyScope(user: CurrentUser) {
  const companyScope = getUserCompanyScope(user);
  if (hasMasterAccess(user)) {
    clearStoredCurrentCompanyScope();
    synchronizeMasterCompanyScope(companyScope);
    return;
  }

  clearStoredMasterCompanyScope();
  if (companyScope) {
    setStoredCurrentCompanyScope(companyScope);
  } else {
    clearStoredCurrentCompanyScope();
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
      throw new Error("Não foi possível validar os dados da empresa selecionada.");
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
      "Empresa",
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
    name: merged.name || "Empresa",
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
