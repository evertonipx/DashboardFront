"use client";

import * as React from "react";

import { OccupancyScenarioDashboard } from "@/components/app/occupancy-scenario-dashboard";
import { RealtimeDashboard } from "@/components/app/realtime-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LiveDashboardTabsProps = {
  manager?: boolean;
};

export function LiveDashboardTabs({ manager = false }: LiveDashboardTabsProps) {
  return (
    <Tabs defaultValue="counting" className="space-y-4">
      <TabsList>
        <TabsTrigger value="counting">Contagem</TabsTrigger>
        <TabsTrigger value="occupancy">Ocupação</TabsTrigger>
      </TabsList>
      <TabsContent value="counting">
        <RealtimeDashboard manager={manager} />
      </TabsContent>
      <TabsContent value="occupancy">
        <OccupancyScenarioDashboard />
      </TabsContent>
    </Tabs>
  );
}
