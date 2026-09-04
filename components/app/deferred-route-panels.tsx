"use client";

import dynamic from "next/dynamic";

import { DashboardPanelLoading } from "@/components/app/dashboard-panel-loading";

export const DeferredAuditManager = dynamic(
  () =>
    import("@/components/app/audit-manager").then(
      (module) => module.AuditManager,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredAiInsightsDashboard = dynamic(
  () =>
    import("@/components/app/ai-insights-dashboard").then(
      (module) => module.AiInsightsDashboard,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredInfrastructureManager = dynamic<{
  view: "cameras" | "locations";
}>(
  () =>
    import("@/components/app/infrastructure-manager").then(
      (module) => module.InfrastructureManager,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredOccupancyScenarioDashboard = dynamic(
  () =>
    import("@/components/app/occupancy-scenario-dashboard").then(
      (module) => module.OccupancyScenarioDashboard,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredScenarioManager = dynamic(
  () =>
    import("@/components/app/scenario-manager").then(
      (module) => module.ScenarioManager,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredSuperAdminDashboard = dynamic(
  () =>
    import("@/components/app/super-admin-dashboard").then(
      (module) => module.SuperAdminDashboard,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredViewsManager = dynamic(
  () =>
    import("@/components/app/views-manager").then(
      (module) => module.ViewsManager,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);

export const DeferredWorkerManager = dynamic(
  () =>
    import("@/components/app/worker-manager").then(
      (module) => module.WorkerManager,
    ),
  { loading: DashboardPanelLoading, ssr: false },
);
