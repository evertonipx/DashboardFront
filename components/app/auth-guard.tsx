"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/app/auth-provider";
import { hasMasterAccess, resolveAuthorizedHomePath } from "@/lib/access";
import {
  canAccessOperationalDashboards,
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
  canViewModuleSurface,
  type DashboardSurface,
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
  requireSurface?: DashboardSurface;
  requireResource?: ManagerResource;
};

export function AuthGuard({
  children,
  requireManager = false,
  requireMaster = false,
  requireModule,
  requireSurface,
  requireResource,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, isManager, logout } = useAuth();
  const isMaster = hasMasterAccess(user);
  const hasRequiredResource = canManageResource(user, requireResource);
  const hasRequiredModule = requireModule && requireSurface
    ? canViewModuleSurface(user, requireModule, requireSurface)
    : canViewModule(user, requireModule);
  const hasRequiredSurface = !requireSurface || canAccessOperationalDashboards(user, requireSurface);
  const denied = (requireMaster && !isMaster) ||
    (requireManager && !isManager) ||
    !hasRequiredModule || !hasRequiredSurface || !hasRequiredResource;
  const authorizedHomePath = resolveAuthorizedHomePath(user);

  React.useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (denied && authorizedHomePath !== pathname) {
      router.replace(authorizedHomePath);
    }
  }, [
    authorizedHomePath,
    denied,
    loading,
    pathname,
    router,
    user,
  ]);

  if (!loading && user && denied && authorizedHomePath === pathname) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 text-center" role="status">
          <h1 className="text-lg font-semibold">Nenhum acesso disponível</h1>
          <p className="text-sm text-muted-foreground">
            Seu perfil não possui acesso a esta tela. Solicite a revisão dos acessos ao administrador.
          </p>
          <Button onClick={() => void logout()}>Sair</Button>
        </div>
      </main>
    );
  }

  if (loading || !user || denied) {
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
