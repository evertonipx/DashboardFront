"use client";

import * as React from "react";

import { EChart } from "@/components/app/echart";
import { WidgetTitleText } from "@/components/app/widget-appearance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { demographicTemporalValueLabels, fitDemographicTemporalOption, type DemographicTemporalModel } from "@/lib/demographics-temporal-chart-options";
import { cn } from "@/lib/utils";

export function DemographicsTemporalWidget({ model, loading, error, settled = false, snapshotScopeKey }: {
  model: DemographicTemporalModel;
  loading: boolean;
  error?: string | null;
  settled?: boolean;
  snapshotScopeKey?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 640, height: 280, cardHeight: 340 });
  const [lastCompleted, setLastCompleted] = React.useState<{ scopeKey: string; model: DemographicTemporalModel } | null>(null);
  React.useEffect(() => {
    if (!snapshotScopeKey || !settled || loading || error || !model.hasData) return;
    setLastCompleted((current) => current?.scopeKey === snapshotScopeKey && current.model === model
      ? current : { scopeKey: snapshotScopeKey, model });
  }, [error, loading, model, settled, snapshotScopeKey]);
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
  const retainedModel = error ? null : retainedDemographicTemporalModel(lastCompleted, snapshotScopeKey, loading);
  const displayModel = retainedModel ?? model;
  const option = React.useMemo(() => fitDemographicTemporalOption(displayModel, size), [displayModel, size]);
  // Dense temporal series retain precise values in their tooltip and export
  // table, without printing hundreds of colliding labels into a small card.
  const valueLabels = demographicTemporalValueLabels(displayModel, size);
  return (
    <Card ref={rootRef} aria-busy={loading} className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden" data-demographics-temporal data-demographics-density={compact ? "compact" : "regular"}>
      <CardHeader className={cn("min-w-0 gap-0.5", compact ? "p-2 pb-0.5" : "p-3 pb-1")}>
        <CardTitle className={cn("line-clamp-2 leading-5", compact ? "text-xs" : "text-sm")}>
          <WidgetTitleText fallback={displayModel.title} />
        </CardTitle>
        <CardDescription className={cn("line-clamp-2 text-xs leading-4", compact && "sr-only")}>{displayModel.description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("flex min-h-0 min-w-0 flex-1 flex-col", compact ? "p-2 pt-0" : "p-3 pt-0")}>
        <div ref={plotRef} className="relative min-h-0 min-w-0 flex-1">
          {loading && !retainedModel ? <Skeleton className="h-full min-h-0 w-full" />
            : error ? <p role="status" className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">{error}</p>
              : !displayModel.hasData ? <p className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">Sem dados demográficos no intervalo.</p>
                : <EChart ariaLabel={displayModel.title} ariaDescription={displayModel.description} className="h-full min-h-0 w-full" option={option} themeMode="explicit" valueLabels={valueLabels} />}
          {retainedModel ? <span className="pointer-events-none absolute right-2 top-1 rounded border bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground" role="status">Atualizando</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function retainedDemographicTemporalModel(
  completed: { scopeKey: string; model: DemographicTemporalModel } | null,
  scopeKey: string | undefined,
  loading: boolean,
) {
  return loading && scopeKey && completed?.scopeKey === scopeKey ? completed.model : null;
}
