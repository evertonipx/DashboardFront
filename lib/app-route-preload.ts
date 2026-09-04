"use client";

type RouteModuleLoader = () => Promise<unknown>;
export type AppDashboardModule = "counting" | "occupancy" | "demographics";

const routeModuleLoaders: Record<string, RouteModuleLoader> = {
  "/dashboard/analytics": () => import("@/components/app/analysis-dashboard"),
  "/dashboard/live": () => import("@/components/app/live-dashboard-tabs"),
  "/dashboard/occupancy": () =>
    import("@/components/app/occupancy-scenario-dashboard"),
  "/dashboard/reports": () => import("@/components/app/reports-dashboard"),
  "/manager/analytics": () => import("@/components/app/analysis-dashboard"),
  "/manager/audit": () => import("@/components/app/audit-manager"),
  "/manager/cameras": () =>
    import("@/components/app/infrastructure-manager"),
  "/manager/live": () => import("@/components/app/live-dashboard-tabs"),
  "/manager/locations": () =>
    import("@/components/app/infrastructure-manager"),
  "/manager/master": () =>
    import("@/components/app/super-admin-dashboard"),
  "/manager/occupancy": () =>
    import("@/components/app/occupancy-scenario-dashboard"),
  "/manager/reports": () => import("@/components/app/reports-dashboard"),
  "/manager/scenarios": () => import("@/components/app/scenario-manager"),
  "/manager/views": () => import("@/components/app/views-manager"),
  "/manager/workers": () => import("@/components/app/worker-manager"),
};

const dashboardPanelLoaders: Record<
  string,
  Record<AppDashboardModule, RouteModuleLoader>
> = {
  "/dashboard/analytics": {
    counting: () => import("@/components/app/period-analysis-dashboard"),
    demographics: () => import("@/components/app/demographics-dashboard"),
    occupancy: () => import("@/components/app/occupancy-reports-dashboard"),
  },
  "/dashboard/live": {
    counting: () => import("@/components/app/realtime-dashboard"),
    demographics: () => import("@/components/app/demographics-dashboard"),
    occupancy: () => import("@/components/app/occupancy-scenario-dashboard"),
  },
  "/dashboard/reports": {
    counting: () => import("@/components/app/scenario-reports-dashboard"),
    demographics: () => import("@/components/app/demographics-dashboard"),
    occupancy: () => import("@/components/app/occupancy-reports-dashboard"),
  },
  "/manager/analytics": {
    counting: () => import("@/components/app/period-analysis-dashboard"),
    demographics: () => import("@/components/app/demographics-dashboard"),
    occupancy: () => import("@/components/app/occupancy-reports-dashboard"),
  },
  "/manager/live": {
    counting: () => import("@/components/app/realtime-dashboard"),
    demographics: () => import("@/components/app/demographics-dashboard"),
    occupancy: () => import("@/components/app/occupancy-scenario-dashboard"),
  },
  "/manager/reports": {
    counting: () => import("@/components/app/scenario-reports-dashboard"),
    demographics: () => import("@/components/app/demographics-dashboard"),
    occupancy: () => import("@/components/app/occupancy-reports-dashboard"),
  },
};

const pendingRouteModules = new Map<string, Promise<unknown>>();
const pendingDashboardPanels = new Map<string, Promise<unknown>>();
const scheduledRouteModules = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const scheduledDashboardPanels = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

/** Warms only the client panel the user is pointing at. */
export function preloadAppRoute(
  pathname: string,
  fallbackDashboardModule?: AppDashboardModule,
) {
  const loader = routeModuleLoaders[pathname];
  if (!loader) return;

  cancelScheduledAppRoutePreload(pathname);

  const dashboardModule = activeDashboardModule() ?? fallbackDashboardModule;
  if (dashboardModule) preloadDashboardPanel(pathname, dashboardModule);
  if (pendingRouteModules.has(pathname)) return;

  const request = loader().catch(() => {
    pendingRouteModules.delete(pathname);
  });
  pendingRouteModules.set(pathname, request);
}

export function preloadDashboardPanel(
  pathname: string,
  dashboardModule: AppDashboardModule,
) {
  const loader = dashboardPanelLoaders[pathname]?.[dashboardModule];
  if (!loader) return;
  const key = dashboardPanelKey(pathname, dashboardModule);
  cancelScheduledDashboardPanelPreload(pathname, dashboardModule);
  if (pendingDashboardPanels.has(key)) return;
  const request = loader().catch(() => {
    pendingDashboardPanels.delete(key);
  });
  pendingDashboardPanels.set(key, request);
}

export function scheduleDashboardPanelPreload(
  pathname: string,
  dashboardModule: AppDashboardModule,
  delayMs = 100,
) {
  const key = dashboardPanelKey(pathname, dashboardModule);
  if (
    !dashboardPanelLoaders[pathname]?.[dashboardModule] ||
    pendingDashboardPanels.has(key) ||
    scheduledDashboardPanels.has(key)
  ) {
    return;
  }
  const timer = setTimeout(() => {
    scheduledDashboardPanels.delete(key);
    preloadDashboardPanel(pathname, dashboardModule);
  }, delayMs);
  scheduledDashboardPanels.set(key, timer);
}

export function cancelScheduledDashboardPanelPreload(
  pathname: string,
  dashboardModule: AppDashboardModule,
) {
  const key = dashboardPanelKey(pathname, dashboardModule);
  const timer = scheduledDashboardPanels.get(key);
  if (timer === undefined) return;
  clearTimeout(timer);
  scheduledDashboardPanels.delete(key);
}

/**
 * Preloads only after a short dwell. Crossing the navigation with the pointer
 * must not download every dashboard, while a deliberate hover still overlaps
 * the route request with the user's click.
 */
export function scheduleAppRoutePreload(
  pathname: string,
  fallbackDashboardModule?: AppDashboardModule,
  delayMs = 140,
  preloadRoute?: () => void,
) {
  if (
    !routeModuleLoaders[pathname] ||
    scheduledRouteModules.has(pathname)
  ) {
    return;
  }

  const timer = setTimeout(() => {
    scheduledRouteModules.delete(pathname);
    preloadRoute?.();
    preloadAppRoute(pathname, fallbackDashboardModule);
  }, delayMs);
  scheduledRouteModules.set(pathname, timer);
}

function activeDashboardModule(): AppDashboardModule | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document
    .querySelector<HTMLElement>("[data-dashboard-module]")
    ?.dataset.dashboardModule;
  return value === "counting" ||
    value === "occupancy" ||
    value === "demographics"
    ? value
    : undefined;
}

export function cancelScheduledAppRoutePreload(pathname: string) {
  const timer = scheduledRouteModules.get(pathname);
  if (timer === undefined) return;
  clearTimeout(timer);
  scheduledRouteModules.delete(pathname);
}

function dashboardPanelKey(
  pathname: string,
  dashboardModule: AppDashboardModule,
) {
  return `${pathname}:${dashboardModule}`;
}
