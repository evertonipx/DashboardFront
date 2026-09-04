"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";

type ManagerResource =
  | "audit"
  | "cameras"
  | "locations"
  | "occupancy"
  | "scenarios"
  | "views"
  | "workers";

const MANAGER_RESOURCE_BY_PATH: Partial<Record<string, ManagerResource>> = {
  "/manager/audit": "audit",
  "/manager/cameras": "cameras",
  "/manager/locations": "locations",
  "/manager/occupancy": "occupancy",
  "/manager/scenarios": "scenarios",
  "/manager/views": "views",
  "/manager/workers": "workers",
};

export function ManagerRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const requireMaster = pathname === "/manager/master";

  return (
    <AuthGuard
      requireManager
      requireMaster={requireMaster}
      requireResource={MANAGER_RESOURCE_BY_PATH[pathname]}
    >
      <AppShell mode="manager">{children}</AppShell>
    </AuthGuard>
  );
}

export function DashboardRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard
      requireModule={pathname === "/dashboard/occupancy" ? "occupancy" : undefined}
    >
      <AppShell mode="client">{children}</AppShell>
    </AuthGuard>
  );
}
