"use client";

import dynamic from "next/dynamic";

import { DashboardPanelLoading } from "@/components/app/dashboard-panel-loading";
import { DashboardModuleTabs } from "@/components/app/dashboard-module-tabs";

const ScenarioReportsDashboard = dynamic(
  () =>
    import("@/components/app/scenario-reports-dashboard").then(
      (module) => module.ScenarioReportsDashboard,
    ),
  { loading: DashboardPanelLoading },
);
const OccupancyReportsDashboard = dynamic(
  () =>
    import("@/components/app/occupancy-reports-dashboard").then(
      (module) => module.OccupancyReportsDashboard,
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

type ReportsDashboardProps = {
  manager?: boolean;
};

export function ReportsDashboard({ manager = false }: ReportsDashboardProps) {
  return (
    <DashboardModuleTabs
      counting={<ScenarioReportsDashboard manager={manager} />}
      demographics={
        <DemographicsDashboard manager={manager} surface="reports" />
      }
      occupancy={<OccupancyReportsDashboard manager={manager} />}
    />
  );
}
