"use client";

import { DashboardModuleTabs } from "@/components/app/dashboard-module-tabs";
import { OccupancyScenarioDashboard } from "@/components/app/occupancy-scenario-dashboard";
import { RealtimeDashboard } from "@/components/app/realtime-dashboard";

type LiveDashboardTabsProps = {
  manager?: boolean;
};

export function LiveDashboardTabs({ manager = false }: LiveDashboardTabsProps) {
  return (
    <DashboardModuleTabs
      counting={<RealtimeDashboard manager={manager} />}
      occupancy={<OccupancyScenarioDashboard />}
    />
  );
}
