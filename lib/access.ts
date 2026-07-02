import { canManageWidgets, hasAnyOperationalPermission } from "@/lib/permissions";
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
  if (!user) return "/login";

  if (hasMasterAccess(user)) {
    return "/manager/master";
  }

  if (hasAnyOperationalPermission(user)) {
    return "/manager/live";
  }

  return "/dashboard/live";
}
