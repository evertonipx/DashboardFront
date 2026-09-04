"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/app/auth-provider";
import { DashboardPanelLoading } from "@/components/app/dashboard-panel-loading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cancelScheduledDashboardPanelPreload,
  preloadDashboardPanel,
  scheduleDashboardPanelPreload,
  type AppDashboardModule,
} from "@/lib/app-route-preload";
import {
  getUserViewScopedStorageKey,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  canViewCounting,
  canViewDemographics,
  canViewOccupancy,
} from "@/lib/permissions";
import {
  claimLegacyUserGridPreference,
  hasUserGridKnownDeletion,
  removeUserGridPreference,
  writeUserGridPreference,
} from "@/lib/user-grid-local";

type DashboardModule = AppDashboardModule;

const DASHBOARD_MODULE_STORAGE_KEY = "ipxdata.dashboard-module.v1";

export function DashboardModuleTabs({
  counting,
  demographics,
  occupancy,
}: {
  counting: React.ReactNode;
  demographics: React.ReactNode;
  occupancy: React.ReactNode;
}) {
  const { loading, user } = useAuth();
  const pathname = usePathname();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const storageKey = dashboardModuleStorageKey(companyScopeId, user?.id);
  const legacyUserStorageKey = dashboardModuleStorageKey(null, user?.id);
  const legacyRawUserStorageKey = legacyDashboardModuleStorageKey(user?.id);
  const availableModules = React.useMemo(
    () => dashboardModulesForUser(user),
    [user],
  );
  const availableModuleKey = availableModules.join(":");
  const [module, setModule] = React.useState<DashboardModule | null>(null);
  const [ready, setReady] = React.useState(false);
  const activeStorageKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (loading) {
      setReady(false);
      return;
    }

    const allowInitialQueryModule = activeStorageKeyRef.current === null;
    activeStorageKeyRef.current = storageKey;

    const synchronize = (allowQueryModule = false) => {
      const selection = readDashboardModuleSelection(
        storageKey,
        [legacyUserStorageKey, legacyRawUserStorageKey],
        availableModules,
        { allowQueryModule, userId: user?.id },
      );
      setModule(selection);
      persistDashboardModuleSelection(storageKey, selection);
      setReady(true);
    };
    const synchronizeStorage = (event: StorageEvent) => {
      if (
        event.key === storageKey ||
        event.key === legacyUserStorageKey ||
        event.key === legacyRawUserStorageKey ||
        event.key === DASHBOARD_MODULE_STORAGE_KEY
      ) {
        synchronize(false);
      }
    };
    const synchronizeNavigation = () => synchronize(true);

    synchronize(allowInitialQueryModule);
    window.addEventListener("popstate", synchronizeNavigation);
    window.addEventListener("storage", synchronizeStorage);
    return () => {
      window.removeEventListener("popstate", synchronizeNavigation);
      window.removeEventListener("storage", synchronizeStorage);
    };
  }, [
    availableModuleKey,
    availableModules,
    legacyRawUserStorageKey,
    legacyUserStorageKey,
    loading,
    storageKey,
    user?.id,
  ]);

  const selectModule = React.useCallback(
    (value: string) => {
      if (!isDashboardModule(value) || !availableModules.includes(value)) return;
      setModule(value);
      persistDashboardModuleSelection(storageKey, value);
    },
    [availableModules, storageKey],
  );

  if (loading || !ready) {
    return <DashboardPanelLoading />;
  }

  const selectedModule =
    module && availableModules.includes(module)
      ? module
      : (availableModules[0] ?? null);

  if (!selectedModule) {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center"
        data-dashboard-module="none"
        role="status"
      >
        <p className="text-sm font-medium text-foreground">
          Nenhum módulo disponível
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Seu perfil não possui acesso de visualização a Contagem, Ocupação ou
          Demographics.
        </p>
      </div>
    );
  }

  const preloadHandlers = (targetModule: DashboardModule) => ({
    onBlur: () =>
      cancelScheduledDashboardPanelPreload(pathname, targetModule),
    onFocus: () => {
      if (targetModule !== selectedModule) {
        scheduleDashboardPanelPreload(pathname, targetModule);
      }
    },
    onPointerDown: () => {
      if (targetModule !== selectedModule) {
        preloadDashboardPanel(pathname, targetModule);
      }
    },
    onPointerEnter: () => {
      if (targetModule !== selectedModule) {
        scheduleDashboardPanelPreload(pathname, targetModule);
      }
    },
    onPointerLeave: () =>
      cancelScheduledDashboardPanelPreload(pathname, targetModule),
  });

  return (
    <Tabs
      data-dashboard-module={selectedModule}
      value={selectedModule}
      onValueChange={selectModule}
    >
      <TabsList
        aria-label="Módulo do painel"
        className={`grid w-full ${dashboardModuleGridClass(availableModules.length)} sm:w-fit`}
      >
        {availableModules.includes("counting") ? (
          <TabsTrigger value="counting" {...preloadHandlers("counting")}>
            Contagem
          </TabsTrigger>
        ) : null}
        {availableModules.includes("occupancy") ? (
          <TabsTrigger value="occupancy" {...preloadHandlers("occupancy")}>
            Ocupação
          </TabsTrigger>
        ) : null}
        {availableModules.includes("demographics") ? (
          <TabsTrigger
            value="demographics"
            {...preloadHandlers("demographics")}
          >
            Demographics
          </TabsTrigger>
        ) : null}
      </TabsList>
      {availableModules.includes("counting") ? (
        <TabsContent className="mt-3" value="counting">
          {counting}
        </TabsContent>
      ) : null}
      {availableModules.includes("occupancy") ? (
        <TabsContent className="mt-3" value="occupancy">
          {occupancy}
        </TabsContent>
      ) : null}
      {availableModules.includes("demographics") ? (
        <TabsContent className="mt-3" value="demographics">
          {demographics}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

function isDashboardModule(value: unknown): value is DashboardModule {
  return (
    value === "counting" ||
    value === "occupancy" ||
    value === "demographics"
  );
}

function dashboardModuleGridClass(moduleCount: number) {
  if (moduleCount <= 1) return "grid-cols-1";
  if (moduleCount === 2) return "grid-cols-2";
  return "grid-cols-3";
}

function readDashboardModuleSelection(
  storageKey: string,
  legacyStorageKeys: string[],
  availableModules: readonly DashboardModule[],
  {
    allowQueryModule,
    userId,
  }: { allowQueryModule: boolean; userId?: string | null },
): DashboardModule | null {
  const queryModule = new URLSearchParams(window.location.search).get("module");
  if (
    allowQueryModule &&
    isDashboardModule(queryModule) &&
    availableModules.includes(queryModule)
  ) {
    return queryModule;
  }

  try {
    const exactModule = window.localStorage.getItem(storageKey);
    if (isDashboardModule(exactModule) && availableModules.includes(exactModule)) {
      return exactModule;
    }

    if (hasUserGridKnownDeletion(storageKey)) {
      return availableModules[0] ?? null;
    }

    const storedModule = legacyStorageKeys
      .map((key) => window.localStorage.getItem(key))
      .find((value) => value !== null);
    if (isDashboardModule(storedModule) && availableModules.includes(storedModule)) {
      return storedModule;
    }

    const globalLegacyModule = userId
      ? claimLegacyUserGridPreference(DASHBOARD_MODULE_STORAGE_KEY, userId)
      : null;
    if (
      isDashboardModule(globalLegacyModule) &&
      availableModules.includes(globalLegacyModule)
    ) {
      return globalLegacyModule;
    }
  } catch {
    // The query string and the default remain available without storage.
  }

  return availableModules[0] ?? null;
}

function legacyDashboardModuleStorageKey(userId?: string | null) {
  const normalizedUserId = userId?.trim();
  return normalizedUserId
    ? `${DASHBOARD_MODULE_STORAGE_KEY}.user.${normalizedUserId}`
    : DASHBOARD_MODULE_STORAGE_KEY;
}

function persistDashboardModuleSelection(
  storageKey: string,
  module: DashboardModule | null,
) {
  try {
    if (module) {
      if (window.localStorage.getItem(storageKey) !== module) {
        writeUserGridPreference(storageKey, module);
      }
    } else if (window.localStorage.getItem(storageKey) !== null) {
      removeUserGridPreference(storageKey);
    }
  } catch {
    // The URL still preserves the selection when storage is unavailable.
  }

  const url = new URL(window.location.href);
  if (module) {
    url.searchParams.set("module", module);
  } else {
    url.searchParams.delete("module");
  }
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, "", url);
  }
}

function dashboardModuleStorageKey(
  companyId?: string | null,
  userId?: string | null,
) {
  return getUserViewScopedStorageKey(
    DASHBOARD_MODULE_STORAGE_KEY,
    companyId,
    userId,
  );
}

function dashboardModulesForUser(
  user: ReturnType<typeof useAuth>["user"],
): DashboardModule[] {
  const modules: DashboardModule[] = [];
  if (canViewCounting(user)) modules.push("counting");
  if (canViewOccupancy(user)) modules.push("occupancy");
  if (canViewDemographics(user)) modules.push("demographics");
  return modules;
}
