"use client";

import { useSearchParams } from "next/navigation";

import { RealtimeDashboard } from "@/components/app/realtime-dashboard";

export function LiveVideoWallView() {
  const searchParams = useSearchParams();
  const scopeMode = normalizeScopeMode(searchParams.get("scope_mode"));

  return (
    <RealtimeDashboard
      companyId={searchParams.get("company_id")?.trim() || undefined}
      initialScopeId={searchParams.get("scope_id")?.trim() || undefined}
      initialScopeMode={scopeMode}
      presentationMode
    />
  );
}

function normalizeScopeMode(value: string | null) {
  if (value === "location" || value === "sub_location") return value;
  return "scenario";
}
