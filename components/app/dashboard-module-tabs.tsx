"use client";

import * as React from "react";

import { useAuth } from "@/components/app/auth-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { canViewCounting, canViewOccupancy } from "@/lib/permissions";

type DashboardModule = "counting" | "occupancy";

const DASHBOARD_MODULE_STORAGE_KEY = "ipxdata.dashboard-module.v1";

export function DashboardModuleTabs({
  counting,
  occupancy,
}: {
  counting: React.ReactNode;
  occupancy: React.ReactNode;
}) {
  const { loading, user } = useAuth();
  const storageKey = dashboardModuleStorageKey(user?.id);
  const availableModules = React.useMemo(
    () => dashboardModulesForUser(user),
    [user],
  );
  const availableModuleKey = availableModules.join(":");
  const [module, setModule] = React.useState<DashboardModule | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (loading) {
      setReady(false);
      return;
    }

    const synchronize = () => {
      const selection = readDashboardModuleSelection(
        storageKey,
        availableModules,
      );
      setModule(selection);
      persistDashboardModuleSelection(storageKey, selection);
      setReady(true);
    };
    const synchronizeStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === DASHBOARD_MODULE_STORAGE_KEY) {
        synchronize();
      }
    };

    synchronize();
    window.addEventListener("popstate", synchronize);
    window.addEventListener("storage", synchronizeStorage);
    return () => {
      window.removeEventListener("popstate", synchronize);
      window.removeEventListener("storage", synchronizeStorage);
    };
  }, [availableModuleKey, availableModules, loading, storageKey]);

  const selectModule = React.useCallback(
    (value: string) => {
      if (!isDashboardModule(value) || !availableModules.includes(value)) return;
      setModule(value);
      persistDashboardModuleSelection(storageKey, value);
    },
    [availableModules, storageKey],
  );

  if (loading || !ready) {
    return (
      <div
        aria-busy="true"
        aria-label="Carregando módulo do dashboard"
        className="space-y-3"
      >
        <Skeleton className="h-10 w-full sm:w-[220px]" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
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
          Seu perfil não possui acesso de visualização a Contagem ou Ocupação.
        </p>
      </div>
    );
  }

  return (
    <Tabs
      data-dashboard-module={selectedModule}
      value={selectedModule}
      onValueChange={selectModule}
    >
      <TabsList
        aria-label="Módulo do dashboard"
        className={`grid w-full ${availableModules.length === 1 ? "grid-cols-1" : "grid-cols-2"} sm:w-fit`}
      >
        {availableModules.includes("counting") ? (
          <TabsTrigger value="counting">Contagem</TabsTrigger>
        ) : null}
        {availableModules.includes("occupancy") ? (
          <TabsTrigger value="occupancy">Ocupação</TabsTrigger>
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
    </Tabs>
  );
}

function isDashboardModule(value: unknown): value is DashboardModule {
  return value === "counting" || value === "occupancy";
}

function readDashboardModuleSelection(
  storageKey: string,
  availableModules: readonly DashboardModule[],
): DashboardModule | null {
  const queryModule = new URLSearchParams(window.location.search).get("module");
  if (isDashboardModule(queryModule) && availableModules.includes(queryModule)) {
    return queryModule;
  }

  try {
    const storedModule =
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem(DASHBOARD_MODULE_STORAGE_KEY);
    if (isDashboardModule(storedModule) && availableModules.includes(storedModule)) {
      return storedModule;
    }
  } catch {
    // The query string and the default remain available without storage.
  }

  return availableModules[0] ?? null;
}

function persistDashboardModuleSelection(
  storageKey: string,
  module: DashboardModule | null,
) {
  try {
    if (module) {
      window.localStorage.setItem(storageKey, module);
    } else {
      window.localStorage.removeItem(storageKey);
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

function dashboardModuleStorageKey(userId?: string | null) {
  const normalizedUserId = userId?.trim();
  return normalizedUserId
    ? `${DASHBOARD_MODULE_STORAGE_KEY}.user.${normalizedUserId}`
    : DASHBOARD_MODULE_STORAGE_KEY;
}

function dashboardModulesForUser(
  user: ReturnType<typeof useAuth>["user"],
): DashboardModule[] {
  const modules: DashboardModule[] = [];
  if (canViewCounting(user)) modules.push("counting");
  if (canViewOccupancy(user)) modules.push("occupancy");
  return modules;
}
