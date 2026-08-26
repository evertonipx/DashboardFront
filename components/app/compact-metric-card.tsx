"use client";

import * as React from "react";

import {
  useWidgetColor,
  useWidgetTitle,
} from "@/components/app/widget-appearance";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CompactMetricCardProps = {
  action?: React.ReactNode;
  className?: string;
  comparison?: React.ReactNode;
  comparisonClassName?: string;
  description?: React.ReactNode;
  descriptionClassName?: string;
  descriptionTitle?: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  loading?: boolean;
  meta?: React.ReactNode;
  metaTitle?: string;
  toneColor?: string;
  value: React.ReactNode;
  valueClassName?: string;
  valueTitle?: string;
};

export const COMPACT_METRIC_LAYOUT_DEFAULTS = {
  condensed: true,
  defaultHeight: "short",
  defaultHeightLevel: 1,
  defaultSize: "compact",
} as const;

/**
 * Shared visual grammar for the small KPI widgets used by Live, Analysis and
 * Reports. Keeping the whole card in one flex column prevents sparse metrics
 * from inheriting chart-sized whitespace while preserving room for two lines
 * of operational context.
 */
export function CompactMetricCard({
  action,
  className,
  comparison,
  comparisonClassName,
  description,
  descriptionClassName,
  descriptionTitle,
  icon: Icon,
  label,
  loading = false,
  meta,
  metaTitle,
  toneColor = "#1267C4",
  value,
  valueClassName,
  valueTitle,
}: CompactMetricCardProps) {
  const resolvedTitle = useWidgetTitle(label);
  const widgetColor = useWidgetColor(toneColor);

  return (
    <Card
      className={cn("@container h-full min-w-0 overflow-hidden", className)}
      data-compact-metric-card
    >
      <CardContent className="flex h-full min-h-0 min-w-0 flex-col p-2.5">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <h3
            className="flex min-w-0 items-start gap-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.025em] text-muted-foreground"
            data-compact-metric-title
            title={resolvedTitle}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              data-compact-metric-icon
              style={
                {
                  "--compact-metric-accent": widgetColor,
                } as React.CSSProperties
              }
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="line-clamp-2 min-w-0 break-words pt-1 [overflow-wrap:anywhere]">
              {resolvedTitle}
            </span>
          </h3>
          {action ? (
            <div className="flex shrink-0 items-start justify-end">{action}</div>
          ) : null}
        </div>

        <div className="min-h-0 min-w-0" data-compact-metric-body>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <div
                className={cn(
                  "line-clamp-2 min-w-0 max-w-full break-words text-[clamp(1.25rem,9cqi,1.625rem)] font-semibold leading-none tabular-nums tracking-[-0.02em] [overflow-wrap:anywhere]",
                  valueClassName,
                )}
                data-compact-metric-value
                title={valueTitle}
              >
                {value}
              </div>
              {comparison ? (
                <div
                  className={cn(
                    "min-w-0 max-w-full break-words text-xs font-semibold leading-4 tabular-nums [overflow-wrap:anywhere]",
                    comparisonClassName,
                  )}
                  data-compact-metric-comparison
                >
                  {comparison}
                </div>
              ) : null}
            </div>
          )}

          {meta ? (
            <div
              className="mt-1 line-clamp-1 min-w-0 break-words text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]"
              data-compact-metric-meta
              title={metaTitle}
            >
              {meta}
            </div>
          ) : null}
        </div>

        {description ? (
          <div
            className={cn(
              "mt-auto line-clamp-2 min-w-0 break-words pt-1 text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]",
              descriptionClassName,
            )}
            data-compact-metric-description
            title={descriptionTitle}
          >
            {description}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
