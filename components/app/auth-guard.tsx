"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/app/auth-provider";
import { hasMasterAccess, resolveAuthorizedHomePath } from "@/lib/access";
import {
  canManageCameras,
  canManageLocations,
  canManageOccupancy,
  canManageScenarioCatalogs,
  canManageViews,
  canManageWorkers,
  canViewAudit,
  canViewCounting,
  canViewDemographics,
  canViewOccupancy,
  type OperationalModuleFamily,
} from "@/lib/permissions";
import type { CurrentUser } from "@/lib/types";

type ManagerResource =
  | "audit"
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
  requireModule?: OperationalModuleFamily;
  requireResource?: ManagerResource;
};

export function AuthGuard({
  children,
  requireManager = false,
  requireMaster = false,
  requireModule,
  requireResource,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, isManager } = useAuth();
  const isMaster = hasMasterAccess(user);
  const hasRequiredResource = canManageResource(user, requireResource);
  const hasRequiredModule = canViewModule(user, requireModule);

  React.useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (requireMaster && !isMaster) {
      router.replace(resolveAuthorizedHomePath(user));
      return;
    }

    if (requireManager && !isManager) {
      router.replace("/dashboard/live");
      return;
    }

    if (requireResource && !hasRequiredResource) {
      router.replace(resolveAuthorizedHomePath(user));
      return;
    }

    if (requireModule && !hasRequiredModule) {
      router.replace(resolveAuthorizedHomePath(user));
    }
  }, [
    hasRequiredModule,
    hasRequiredResource,
    isManager,
    isMaster,
    loading,
    pathname,
    requireManager,
    requireMaster,
    requireModule,
    requireResource,
    router,
    user,
  ]);

  if (
    loading ||
    !user ||
    (requireManager && !isManager) ||
    (requireMaster && !isMaster) ||
    (Boolean(requireModule) && !hasRequiredModule) ||
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
    case "audit":
      return canViewAudit(user);
    case "cameras":
      return canManageCameras(user);
    case "locations":
      return canManageLocations(user);
    case "occupancy":
      return canManageOccupancy(user);
    case "scenarios":
      return canManageScenarioCatalogs(user);
    case "views":
      return canManageViews(user);
    case "workers":
      return canManageWorkers(user);
  }
}

function canViewModule(
  user: CurrentUser | null,
  module: OperationalModuleFamily | undefined,
) {
  if (!module) return true;
  switch (module) {
    case "counting":
      return canViewCounting(user);
    case "occupancy":
      return canViewOccupancy(user);
    case "demographics":
      return canViewDemographics(user);
  }
}
