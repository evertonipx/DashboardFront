"use client";

import dynamic from "next/dynamic";

import { DashboardPanelLoading } from "@/components/app/dashboard-panel-loading";
import { DashboardModuleTabs } from "@/components/app/dashboard-module-tabs";

const PeriodAnalysisDashboard = dynamic(
  () =>
    import("@/components/app/period-analysis-dashboard").then(
      (module) => module.PeriodAnalysisDashboard,
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

type AnalysisDashboardProps = {
  manager?: boolean;
};

export function AnalysisDashboard({ manager = false }: AnalysisDashboardProps) {
  return (
    <DashboardModuleTabs
      counting={<PeriodAnalysisDashboard manager={manager} />}
      demographics={
        <DemographicsDashboard manager={manager} surface="analysis" />
      }
      occupancy={<OccupancyReportsDashboard analysis manager={manager} />}
    />
  );
}
