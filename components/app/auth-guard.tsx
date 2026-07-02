"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/app/auth-provider";
import { hasMasterAccess } from "@/lib/access";

type AuthGuardProps = {
  children: React.ReactNode;
  requireManager?: boolean;
  requireMaster?: boolean;
};

export function AuthGuard({
  children,
  requireManager = false,
  requireMaster = false,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, isManager } = useAuth();
  const isMaster = hasMasterAccess(user);

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
    }
  }, [
    isManager,
    isMaster,
    loading,
    pathname,
    requireManager,
    requireMaster,
    router,
    user,
  ]);

  if (
    loading ||
    !user ||
    (requireManager && !isManager) ||
    (requireMaster && !isMaster)
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
