import {
  canAccessOperationalDashboards,
  canManageCameras,
  canManageLocations,
  canManageScenarioCatalogs,
  canManageViews,
  canManageWidgets,
  canManageWorkers,
  canViewAudit,
  canViewModuleSurface,
  hasAnyOperationalPermission,
  type DashboardSurface,
  type OperationalModuleFamily,
} from "@/lib/permissions";
import type { CurrentUser } from "@/lib/types";
import { isMasterUser } from "@/lib/user-role";

export function hasMasterAccess(user: CurrentUser | null) {
  return isMasterUser(user);
}

export function hasDeclaredManagerAccess(user: CurrentUser | null) {
  return canViewAudit(user);
}

export function hasVisualAdminAccess(user: CurrentUser | null) {
  return canManageWidgets(user);
}

export async function resolvePostLoginPath(user: CurrentUser | null) {
  return resolveAuthorizedHomePath(user);
}

export function resolveAuthorizedHomePath(user: CurrentUser | null) {
  if (!user) return "/login";

  if (hasMasterAccess(user)) {
    return "/manager/master";
  }

  if (hasAnyOperationalPermission(user)) {
    for (const surface of ["live", "analytics", "reports"] as const) {
      if (canAccessOperationalDashboards(user, surface)) return `/manager/${surface}`;
    }
    if (canManageViews(user)) return "/manager/views";
    if (canManageWorkers(user)) return "/manager/workers";
    if (canManageCameras(user)) return "/manager/cameras";
    if (canManageLocations(user)) return "/manager/locations";
    if (canManageScenarioCatalogs(user)) return "/manager/scenarios";
  }

  if (canViewAudit(user)) return "/manager/audit";

  for (const surface of ["live", "analytics", "reports"] as const) {
    if (canAccessOperationalDashboards(user, surface)) return `/dashboard/${surface}`;
  }

  return "/dashboard/live";
}

export function dashboardSurfaceForPathname(pathname: string): DashboardSurface | undefined {
  const match = /^\/(?:dashboard|manager)\/(live|analytics|reports|occupancy)$/.exec(pathname);
  if (!match) return undefined;
  return match[1] === "occupancy" ? "live" : match[1] as DashboardSurface;
}

export function resolveAuthorizedDashboardModule(
  user: CurrentUser | null,
  pathname: string,
  preferred?: string,
): OperationalModuleFamily | undefined {
  const surface = dashboardSurfaceForPathname(pathname);
  if (!surface) return undefined;
  const modules: OperationalModuleFamily[] = pathname.endsWith("/occupancy")
    ? ["occupancy"]
    : ["counting", "occupancy", "demographics"];
  const available = modules.filter((module) => canViewModuleSurface(user, module, surface));
  return available.find((module) => module === preferred) ?? available[0];
}
