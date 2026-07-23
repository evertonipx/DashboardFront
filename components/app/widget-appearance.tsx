"use client";

import * as React from "react";

import type { CardChartType, CardZoom } from "@/lib/view-preferences";

type WidgetAppearance = {
  chartType: CardChartType;
  color: string | null;
  title: string | null;
  zoom: CardZoom;
};

const WidgetAppearanceContext = React.createContext<WidgetAppearance>({
  chartType: "bar",
  color: null,
  title: null,
  zoom: 100,
});

export function WidgetAppearanceProvider({
  children,
  chartType = "bar",
  color,
  title,
  zoom = 100,
}: {
  children: React.ReactNode;
  chartType?: CardChartType;
  color?: string;
  title?: string;
  zoom?: CardZoom;
}) {
  return (
    <WidgetAppearanceContext.Provider
      value={{
        chartType,
        color: color || null,
        title: title?.trim() || null,
        zoom,
      }}
    >
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

export function useWidgetTitle(fallback: string) {
  return React.useContext(WidgetAppearanceContext).title || fallback;
}

export function useWidgetZoom() {
  return React.useContext(WidgetAppearanceContext).zoom / 100;
}
