"use client";

import { DashboardModuleTabs } from "@/components/app/dashboard-module-tabs";
import { OccupancyReportsDashboard } from "@/components/app/occupancy-reports-dashboard";
import { PeriodAnalysisDashboard } from "@/components/app/period-analysis-dashboard";

type AnalysisDashboardProps = {
  manager?: boolean;
};

export function AnalysisDashboard({ manager = false }: AnalysisDashboardProps) {
  return (
    <DashboardModuleTabs
      counting={<PeriodAnalysisDashboard manager={manager} />}
      occupancy={<OccupancyReportsDashboard analysis manager={manager} />}
    />
  );
}
