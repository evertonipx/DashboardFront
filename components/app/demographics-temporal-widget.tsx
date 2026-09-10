"use client";

import * as React from "react";

import { EChart } from "@/components/app/echart";
import { WidgetTitleText } from "@/components/app/widget-appearance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { demographicTemporalValueLabels, fitDemographicTemporalOption, type DemographicTemporalModel } from "@/lib/demographics-temporal-chart-options";
import { cn } from "@/lib/utils";

export function DemographicsTemporalWidget({ model, loading, error }: {
  model: DemographicTemporalModel;
  loading: boolean;
  error?: string | null;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 640, height: 280, cardHeight: 340 });
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const plot = plotRef.current;
    if (!root || !plot) return;
    const synchronize = () => {
      const bounds = plot.getBoundingClientRect();
      const next = { width: Math.round(bounds.width), height: Math.round(bounds.height), cardHeight: Math.round(root.getBoundingClientRect().height) };
      setSize((current) => current.width === next.width && current.height === next.height && current.cardHeight === next.cardHeight ? current : next);
    };
    synchronize();
    const observer = new ResizeObserver(synchronize);
    observer.observe(root);
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);
  const compact = size.cardHeight < 220;
  const option = React.useMemo(() => fitDemographicTemporalOption(model, size), [model, size]);
  // Dense temporal series retain precise values in their tooltip and export
  // table, without printing hundreds of colliding labels into a small card.
  const valueLabels = demographicTemporalValueLabels(model, size);
  return (
    <Card ref={rootRef} className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden" data-demographics-temporal data-demographics-density={compact ? "compact" : "regular"}>
      <CardHeader className={cn("min-w-0 gap-0.5", compact ? "p-2 pb-0.5" : "p-3 pb-1")}>
        <CardTitle className={cn("line-clamp-2 leading-5", compact ? "text-xs" : "text-sm")}>
          <WidgetTitleText fallback={model.title} />
        </CardTitle>
        <CardDescription className={cn("line-clamp-2 text-xs leading-4", compact && "sr-only")}>{model.description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("flex min-h-0 min-w-0 flex-1 flex-col", compact ? "p-2 pt-0" : "p-3 pt-0")}>
        <div ref={plotRef} className="min-h-0 min-w-0 flex-1">
          {loading ? <Skeleton className="h-full min-h-0 w-full" />
            : error ? <p role="status" className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">{error}</p>
              : !model.hasData ? <p className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">Sem dados demográficos no intervalo.</p>
                : <EChart ariaLabel={model.title} ariaDescription={model.description} className="h-full min-h-0 w-full" option={option} themeMode="explicit" valueLabels={valueLabels} />}
        </div>
      </CardContent>
    </Card>
  );
}
