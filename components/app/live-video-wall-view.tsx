"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/app/auth-provider";
import { DashboardPanelLoading } from "@/components/app/dashboard-panel-loading";
import { useViewLinkTarget } from "@/lib/view-link-reference";

const RealtimeDashboard = dynamic(
  () =>
    import("@/components/app/realtime-dashboard").then(
      (module) => module.RealtimeDashboard,
    ),
  {
    loading: () => (
      <main className="min-h-screen bg-background p-4 sm:p-6">
        <DashboardPanelLoading />
      </main>
    ),
    ssr: false,
  },
);

export function LiveVideoWallView() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const viewReference = searchParams.get("view")?.trim() ?? "";
  const referencedTarget = useViewLinkTarget(
    viewReference,
    user?.id,
    "/views/dashboard/live",
  );
  const viewSearchParams = React.useMemo(
    () =>
      referencedTarget
        ? new URLSearchParams(referencedTarget.search)
        : searchParams,
    [referencedTarget, searchParams],
  );
  const scopeMode = normalizeScopeMode(viewSearchParams.get("scope_mode"));

  if (viewReference && !referencedTarget) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-6">
        <div className="rounded-md border border-dashed bg-muted/20 px-6 py-8 text-center text-sm text-muted-foreground">
          Esta visão não está disponível para o usuário autenticado.
        </div>
      </main>
    );
  }

  return (
    <RealtimeDashboard
      companyId={viewSearchParams.get("company_id")?.trim() || undefined}
      initialScopeId={viewSearchParams.get("scope_id")?.trim() || undefined}
      initialScopeMode={scopeMode}
      presentationMode
    />
  );
}

function normalizeScopeMode(value: string | null) {
  if (value === "location" || value === "sub_location") return value;
  return "scenario";
}
