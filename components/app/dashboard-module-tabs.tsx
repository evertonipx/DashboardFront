"use client";

import * as React from "react";

import { useAuth } from "@/components/app/auth-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardModule = "counting" | "occupancy";

const DASHBOARD_MODULE_STORAGE_KEY = "ipxdata.dashboard-module.v1";

export function DashboardModuleTabs({
  counting,
  occupancy,
}: {
  counting: React.ReactNode;
  occupancy: React.ReactNode;
}) {
  const { user } = useAuth();
  const storageKey = dashboardModuleStorageKey(user?.id);
  const [module, setModule] = React.useState<DashboardModule>("counting");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const synchronize = () => {
      setModule(readDashboardModuleSelection(storageKey));
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
  }, [storageKey]);

  const selectModule = React.useCallback((value: string) => {
    if (!isDashboardModule(value)) return;
    setModule(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // The URL still preserves the selection when storage is unavailable.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("module", value);
    window.history.replaceState(window.history.state, "", url);
  }, [storageKey]);

  if (!ready) {
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

  return (
    <Tabs
      data-dashboard-module={module}
      value={module}
      onValueChange={selectModule}
    >
      <TabsList
        aria-label="Módulo do dashboard"
        className="grid w-full grid-cols-2 sm:w-fit"
      >
        <TabsTrigger value="counting">Contagem</TabsTrigger>
        <TabsTrigger value="occupancy">Ocupação</TabsTrigger>
      </TabsList>
      <TabsContent className="mt-3" value="counting">
        {counting}
      </TabsContent>
      <TabsContent className="mt-3" value="occupancy">
        {occupancy}
      </TabsContent>
    </Tabs>
  );
}

function isDashboardModule(value: unknown): value is DashboardModule {
  return value === "counting" || value === "occupancy";
}

function readDashboardModuleSelection(storageKey: string): DashboardModule {
  const queryModule = new URLSearchParams(window.location.search).get("module");
  if (isDashboardModule(queryModule)) return queryModule;

  try {
    const storedModule =
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem(DASHBOARD_MODULE_STORAGE_KEY);
    if (isDashboardModule(storedModule)) return storedModule;
  } catch {
    // The query string and the default remain available without storage.
  }

  return "counting";
}

function dashboardModuleStorageKey(userId?: string | null) {
  const normalizedUserId = userId?.trim();
  return normalizedUserId
    ? `${DASHBOARD_MODULE_STORAGE_KEY}.user.${normalizedUserId}`
    : DASHBOARD_MODULE_STORAGE_KEY;
}
