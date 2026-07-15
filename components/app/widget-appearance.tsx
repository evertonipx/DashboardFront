"use client";

import * as React from "react";

const WidgetColorContext = React.createContext<string | null>(null);

export function WidgetAppearanceProvider({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <WidgetColorContext.Provider value={color || null}>
      {children}
    </WidgetColorContext.Provider>
  );
}

export function useWidgetColor(fallback = "#1267C4") {
  return React.useContext(WidgetColorContext) || fallback;
}
