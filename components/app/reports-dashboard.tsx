"use client";

import * as React from "react";

import { OccupancyReportsDashboard } from "@/components/app/occupancy-reports-dashboard";
import { ScenarioReportsDashboard } from "@/components/app/scenario-reports-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReportsDashboardProps = {
  manager?: boolean;
};

export function ReportsDashboard({ manager = false }: ReportsDashboardProps) {
  return (
    <Tabs defaultValue="counting" className="space-y-4">
      <TabsList>
        <TabsTrigger value="counting">Contagem</TabsTrigger>
        <TabsTrigger value="occupancy">Ocupação</TabsTrigger>
      </TabsList>
      <TabsContent value="counting">
        <ScenarioReportsDashboard manager={manager} />
      </TabsContent>
      <TabsContent value="occupancy">
        <OccupancyReportsDashboard manager={manager} />
      </TabsContent>
    </Tabs>
  );
}
