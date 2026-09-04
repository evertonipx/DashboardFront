"use client";

import dynamic from "next/dynamic";

import type {
  EChartProps,
  EnterpriseChartOption,
} from "@/components/app/echart";

const DeferredEChart = dynamic<EChartProps>(
  () =>
    import("@/components/app/echart").then((module) => module.EChart),
  {
    loading: () => (
      <div
        aria-label="Preparando visualização"
        className="h-full min-h-0 w-full animate-pulse rounded-sm bg-muted/20"
        data-echart
        data-echart-loading
        role="status"
      />
    ),
    ssr: false,
  },
);

export function EChart(props: EChartProps) {
  return <DeferredEChart {...props} />;
}

export type { EnterpriseChartOption };
