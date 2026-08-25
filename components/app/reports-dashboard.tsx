"use client";

import { DashboardModuleTabs } from "@/components/app/dashboard-module-tabs";
import { OccupancyReportsDashboard } from "@/components/app/occupancy-reports-dashboard";
import { ScenarioReportsDashboard } from "@/components/app/scenario-reports-dashboard";

type ReportsDashboardProps = {
  manager?: boolean;
};

export function ReportsDashboard({ manager = false }: ReportsDashboardProps) {
  return (
    <DashboardModuleTabs
      counting={<ScenarioReportsDashboard manager={manager} />}
      occupancy={<OccupancyReportsDashboard manager={manager} />}
    />
  );
}
