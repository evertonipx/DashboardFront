import type { CurrentUser } from "@/lib/types";

export function isMasterUser(user: CurrentUser | null) {
  if (!user) return false;

  if (typeof user.is_master === "boolean") {
    return user.is_master;
  }

  return normalizeRole(user.role) === "super-admin";
}

export function normalizeRole(role: string | undefined) {
  return role
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/^super-?admin$/, "super-admin");
}
