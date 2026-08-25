"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/app/auth-provider";
import { hasMasterAccess } from "@/lib/access";
import {
  canManageCameras,
  canManageLocations,
  canManageOccupancy,
  canManageScenarios,
  canManageViews,
  canManageWorkers,
} from "@/lib/permissions";
import type { CurrentUser } from "@/lib/types";

type ManagerResource =
  | "cameras"
  | "locations"
  | "occupancy"
  | "scenarios"
  | "views"
  | "workers";

type AuthGuardProps = {
  children: React.ReactNode;
  requireManager?: boolean;
  requireMaster?: boolean;
  requireResource?: ManagerResource;
};

export function AuthGuard({
  children,
  requireManager = false,
  requireMaster = false,
  requireResource,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, isManager } = useAuth();
  const isMaster = hasMasterAccess(user);
  const hasRequiredResource = canManageResource(user, requireResource);

  React.useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (requireMaster && !isMaster) {
      router.replace(isManager ? "/manager/live" : "/dashboard/live");
      return;
    }

    if (requireManager && !isManager) {
      router.replace("/dashboard/live");
      return;
    }

    if (requireResource && !hasRequiredResource) {
      router.replace(isManager ? "/manager/live" : "/dashboard/live");
    }
  }, [
    hasRequiredResource,
    isManager,
    isMaster,
    loading,
    pathname,
    requireManager,
    requireMaster,
    requireResource,
    router,
    user,
  ]);

  if (
    loading ||
    !user ||
    (requireManager && !isManager) ||
    (requireMaster && !isMaster) ||
    (Boolean(requireResource) && !hasRequiredResource)
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </main>
    );
  }

  return children;
}

function canManageResource(
  user: CurrentUser | null,
  resource: ManagerResource | undefined,
) {
  if (!resource) return true;

  switch (resource) {
    case "cameras":
      return canManageCameras(user);
    case "locations":
      return canManageLocations(user);
    case "occupancy":
      return canManageOccupancy(user);
    case "scenarios":
      return canManageScenarios(user) || canManageOccupancy(user);
    case "views":
      return canManageViews(user);
    case "workers":
      return canManageWorkers(user);
  }
}
