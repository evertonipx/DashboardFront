"use client";

import * as React from "react";

import type { CardChartType } from "@/lib/view-preferences";

type WidgetAppearance = {
  chartType: CardChartType;
  color: string | null;
};

const WidgetAppearanceContext = React.createContext<WidgetAppearance>({
  chartType: "bar",
  color: null,
});

export function WidgetAppearanceProvider({
  children,
  chartType = "bar",
  color,
}: {
  children: React.ReactNode;
  chartType?: CardChartType;
  color?: string;
}) {
  return (
    <WidgetAppearanceContext.Provider value={{ chartType, color: color || null }}>
      {children}
    </WidgetAppearanceContext.Provider>
  );
}

export function useWidgetColor(fallback = "#1267C4") {
  return React.useContext(WidgetAppearanceContext).color || fallback;
}

export function useWidgetChartType() {
  return React.useContext(WidgetAppearanceContext).chartType;
}
