import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import {
  init,
  use as registerECharts,
  type EChartsInitOpts,
  type EChartsType,
} from "echarts/core";
import { LabelLayout, LegacyGridContainLabel } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

registerECharts([
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LabelLayout,
  LegacyGridContainLabel,
  CanvasRenderer,
]);

const CAPABILITY_LOADERS: Record<string, () => Promise<unknown>> = {
  aria: () => import("@/components/app/echarts-runtime/register-aria"),
  bar: () => import("@/components/app/echarts-runtime/register-bar"),
  custom: () => import("@/components/app/echarts-runtime/register-custom"),
  dataZoom: () => import("@/components/app/echarts-runtime/register-data-zoom"),
  effectScatter: () =>
    import("@/components/app/echarts-runtime/register-effect-scatter"),
  heatmap: () => import("@/components/app/echarts-runtime/register-heatmap"),
  line: () => import("@/components/app/echarts-runtime/register-line"),
  markArea: () => import("@/components/app/echarts-runtime/register-mark-area"),
  markLine: () => import("@/components/app/echarts-runtime/register-mark-line"),
  pie: () => import("@/components/app/echarts-runtime/register-pie"),
  scatter: () => import("@/components/app/echarts-runtime/register-scatter"),
  treemap: () => import("@/components/app/echarts-runtime/register-treemap"),
  visualMap: () => import("@/components/app/echarts-runtime/register-visual-map"),
};

const capabilityPromises = new Map<string, Promise<unknown>>();

export async function ensureEChartCapabilities(capabilities: readonly string[]) {
  await Promise.all(
    capabilities.map((capability) => {
      const existing = capabilityPromises.get(capability);
      if (existing) return existing;
      const loader = CAPABILITY_LOADERS[capability];
      if (!loader) return Promise.resolve();
      const promise = loader().catch((error: unknown) => {
        capabilityPromises.delete(capability);
        throw error;
      });
      capabilityPromises.set(capability, promise);
      return promise;
    }),
  );
}

export function initEChart(
  container: HTMLElement,
  options?: EChartsInitOpts,
): EChartsType {
  return init(container, null, options);
}
