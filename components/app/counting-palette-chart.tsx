"use client";

import * as React from "react";

import {
  EChart as DeferredEChart,
  type EnterpriseChartOption,
} from "@/components/app/deferred-echart";
import {
  useWidgetColor,
  useWidgetPalette,
} from "@/components/app/widget-appearance";
import { applyCountingViewPalette } from "@/lib/counting-view-palette";

export function EChart(props: React.ComponentProps<typeof DeferredEChart>) {
  const palette = useWidgetPalette();
  const color = useWidgetColor();
  const option = React.useMemo(
    () => applyCountingViewPalette(props.option, palette, color),
    [color, palette, props.option],
  );

  return <DeferredEChart {...props} option={option} />;
}

export type { EnterpriseChartOption };
