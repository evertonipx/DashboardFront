import {
  canAccessOperationalDashboards,
  canManageCameras,
  canManageLocations,
  canManageScenarioCatalogs,
  canManageViews,
  canManageWidgets,
  canManageWorkers,
  hasAnyOperationalPermission,
} from "@/lib/permissions";
import type { CurrentUser } from "@/lib/types";
import { isMasterUser } from "@/lib/user-role";

export function hasMasterAccess(user: CurrentUser | null) {
  return isMasterUser(user);
}

export function hasDeclaredManagerAccess(user: CurrentUser | null) {
  return hasMasterAccess(user);
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
    if (canAccessOperationalDashboards(user)) return "/manager/live";
    if (canManageViews(user)) return "/manager/views";
    if (canManageWorkers(user)) return "/manager/workers";
    if (canManageCameras(user)) return "/manager/cameras";
    if (canManageLocations(user)) return "/manager/locations";
    if (canManageScenarioCatalogs(user)) return "/manager/scenarios";
  }

  return "/dashboard/live";
}
