"use client";

import dynamic from "next/dynamic";

import { DashboardPanelLoading } from "@/components/app/dashboard-panel-loading";
import { DashboardModuleTabs } from "@/components/app/dashboard-module-tabs";

const RealtimeDashboard = dynamic(
  () =>
    import("@/components/app/realtime-dashboard").then(
      (module) => module.RealtimeDashboard,
    ),
  { loading: DashboardPanelLoading },
);
const OccupancyScenarioDashboard = dynamic(
  () =>
    import("@/components/app/occupancy-scenario-dashboard").then(
      (module) => module.OccupancyScenarioDashboard,
    ),
  { loading: DashboardPanelLoading },
);
const DemographicsDashboard = dynamic(
  () =>
    import("@/components/app/demographics-dashboard").then(
      (module) => module.DemographicsDashboard,
    ),
  { loading: DashboardPanelLoading },
);

type LiveDashboardTabsProps = {
  manager?: boolean;
};

export function LiveDashboardTabs({ manager = false }: LiveDashboardTabsProps) {
  return (
    <DashboardModuleTabs
      counting={<RealtimeDashboard manager={manager} />}
      demographics={
        <DemographicsDashboard manager={manager} surface="live" />
      }
      occupancy={<OccupancyScenarioDashboard />}
    />
  );
}
