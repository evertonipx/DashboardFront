"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AuthGuard } from "@/components/app/auth-guard";
import { useAuth } from "@/components/app/auth-provider";
import { hasMasterAccess } from "@/lib/access";

export default function DashboardInsightsPage() {
  return (
    <AuthGuard>
      <AuthenticatedInsightsRedirect />
    </AuthGuard>
  );
}

function AuthenticatedInsightsRedirect() {
  const router = useRouter();
  const { isManager, user } = useAuth();

  React.useEffect(() => {
    if (!user) return;

    router.replace(
      hasMasterAccess(user)
        ? "/manager/insights"
        : isManager
          ? "/manager/live"
          : "/dashboard/live",
    );
  }, [isManager, router, user]);

  return (
    <div
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground"
      role="status"
    >
      Redirecionando para uma área autorizada...
    </div>
  );
}
