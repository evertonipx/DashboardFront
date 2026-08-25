import type { CurrentUser } from "@/lib/types";

export function isMasterUser(user: CurrentUser | null) {
  if (!user) return false;

  // During JWT migrations `/auth/me` may still expose a stale `false` while
  // the role already authenticated by the API is `super-admin`. Master is an
  // additive authority signal: either canonical declaration is sufficient;
  // ordinary `admin` never is.
  return user.is_master === true || normalizeRole(user.role) === "super-admin";
}

export function normalizeRole(role: string | undefined) {
  return role
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/^super-?admin$/, "super-admin");
}
