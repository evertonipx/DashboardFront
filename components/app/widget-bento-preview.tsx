"use client";

import * as React from "react";
import { EyeOff, LayoutGrid } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CARD_LAYOUT_ROW_GAP,
  CARD_LAYOUT_ROW_HEIGHT,
} from "@/lib/card-layout-sizing";
import { cn } from "@/lib/utils";
import {
  resolveWidgetBentoPreviewGeometry,
  resolveWidgetBentoSpanPixels,
} from "@/lib/widget-bento-preview-layout";
import type {
  WidgetBentoPreviewChartType,
  WidgetBentoPreviewKind,
} from "@/lib/widget-bento-preview-content";

export type {
  WidgetBentoPreviewChartType,
  WidgetBentoPreviewKind,
} from "@/lib/widget-bento-preview-content";

export type WidgetBentoPreviewItem = {
  chartType?: WidgetBentoPreviewChartType;
  columnSpan: number;
  color?: string;
  colors?: readonly string[];
  condensed?: boolean;
  dimensionLabel?: string;
  dragging?: boolean;
  gradient?: boolean;
  id: string;
  label: string;
  over?: boolean;
  previewKind?: WidgetBentoPreviewKind;
  previewOrientation?: "horizontal" | "vertical";
  previewOrder?: "asc" | "desc";
  rowSpan: number;
  selected?: boolean;
  zoom?: 80 | 90 | 100 | 110 | 120;
};

export type WidgetBentoPreviewDragHandler = (
  event: React.DragEvent<HTMLButtonElement>,
  itemId: string,
) => void;

export type WidgetBentoPreviewProps = {
  className?: string;
  columnCount: number;
  hiddenCount: number;
  inspectorId?: string;
  items: readonly WidgetBentoPreviewItem[];
  layoutLabel?: string;
  onDragEnd?: WidgetBentoPreviewDragHandler;
  onDragLeave?: WidgetBentoPreviewDragHandler;
  onDragOver?: WidgetBentoPreviewDragHandler;
  onDragStart?: WidgetBentoPreviewDragHandler;
  onDrop?: WidgetBentoPreviewDragHandler;
  onSelect?: (itemId: string) => void;
  sourceGap?: number;
  sourceRowHeight?: number;
  sourceWidth: number;
};

export function WidgetBentoPreview({
  className,
  columnCount,
  hiddenCount,
  inspectorId,
  items,
  layoutLabel,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onSelect,
  sourceGap = CARD_LAYOUT_ROW_GAP,
  sourceRowHeight = CARD_LAYOUT_ROW_HEIGHT,
  sourceWidth,
}: WidgetBentoPreviewProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const previewStageRef = React.useRef<HTMLDivElement>(null);
  const previousOrderRef = React.useRef<string[]>([]);
  const [availableWidth, setAvailableWidth] = React.useState(0);
  const [reorderAnnouncement, setReorderAnnouncement] = React.useState("");
  const resolvedColumnCount = normalizePositiveInteger(columnCount);
  const resolvedHiddenCount = normalizeNonNegativeInteger(hiddenCount);
  const geometry = resolveWidgetBentoPreviewGeometry({
    availableWidth,
    sourceGap,
    sourceRowHeight,
    sourceWidth,
  });
  const interactive = Boolean(
    onSelect ||
      onDragStart ||
      onDragOver ||
      onDragLeave ||
      onDrop ||
      onDragEnd,
  );

  React.useLayoutEffect(() => {
    const stage = previewStageRef.current;
    if (!stage) return;

    const updateWidth = (width: number) => {
      const nextWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
      setAvailableWidth((current) =>
        Math.abs(current - nextWidth) < 0.5 ? current : nextWidth,
      );
    };
    updateWidth(stage.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => updateWidth(stage.getBoundingClientRect().width);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width ?? stage.getBoundingClientRect().width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [items.length]);

  React.useEffect(() => {
    const nextOrder = items.map((item) => item.id);
    const previousOrder = previousOrderRef.current;
    const sameMembers =
      previousOrder.length === nextOrder.length &&
      previousOrder.every((itemId) => nextOrder.includes(itemId));

    if (
      sameMembers &&
      previousOrder.some((itemId, index) => itemId !== nextOrder[index])
    ) {
      const changedIds = new Set(
        nextOrder.filter((itemId, index) => itemId !== previousOrder[index]),
      );
      const movedItem =
        items.find((item) => item.selected && changedIds.has(item.id)) ??
        items.find((item) => changedIds.has(item.id));
      const position = movedItem ? nextOrder.indexOf(movedItem.id) + 1 : 0;
      setReorderAnnouncement(
        movedItem && position > 0
          ? `${movedItem.label} movido para a posição ${position}.`
          : "Ordem dos widgets atualizada.",
      );
    }

    previousOrderRef.current = nextOrder;
  }, [items]);

  return (
    <section
      className={cn("min-w-0 rounded-lg border bg-muted/20 p-3", className)}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-widget-bento-preview
      data-widget-bento-columns={resolvedColumnCount}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <LayoutGrid
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 id={titleId} className="truncate text-sm font-semibold">
              Prévia do layout
            </h3>
          </div>
          <p
            id={descriptionId}
            className="mt-1 text-xs text-muted-foreground"
          >
            {layoutLabel ?? layoutModeLabel(resolvedColumnCount)} · ordem e proporções da tela
            atual
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Badge variant="outline">{formatCount(items.length, "ativo")}</Badge>
          {resolvedHiddenCount > 0 ? (
            <Badge variant="secondary">
              {formatCount(resolvedHiddenCount, "oculto")}
            </Badge>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="mt-3 flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed bg-background/70 px-4 py-6 text-center"
          role="status"
        >
          <EyeOff
            className="mb-2 h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">Nenhum widget ativo</p>
          <p className="mt-1 max-w-64 text-xs text-muted-foreground">
            {resolvedHiddenCount > 0
              ? "Restaure um widget na seção de ocultos para incluí-lo no layout."
              : "Não há widgets disponíveis para esta tela."}
          </p>
        </div>
      ) : (
        <div
          className="mt-3 min-w-0 rounded-md border bg-background/70 p-2 lg:max-h-[min(52dvh,34rem)] lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
          data-widget-bento-viewport
        >
          <div ref={previewStageRef} className="w-full min-w-0">
            <ol
              className="mx-auto grid min-w-0 list-none grid-flow-row p-0"
              style={{
                gap: `${geometry.gap}px`,
                gridAutoRows: `${geometry.rowHeight}px`,
                gridTemplateColumns: `repeat(${resolvedColumnCount}, minmax(0, 1fr))`,
                width: geometry.canvasWidth > 0 ? `${geometry.canvasWidth}px` : "100%",
              }}
              aria-label="Widgets ativos na ordem da tela"
              data-widget-bento-grid
              data-widget-bento-scale={geometry.scale.toFixed(4)}
            >
              {items.map((item, index) => {
                const columnSpan = Math.min(
                  normalizePositiveInteger(item.columnSpan),
                  resolvedColumnCount,
                );
                const rowSpan = normalizePositiveInteger(item.rowSpan);
                const label = item.label.trim() || item.id;
                const dimensionLabel =
                  item.dimensionLabel?.trim() || `${columnSpan}×${rowSpan}`;
                const columnTrackWidth =
                  geometry.canvasWidth > 0
                    ? Math.max(
                        0,
                        (geometry.canvasWidth -
                          (resolvedColumnCount - 1) * geometry.gap) /
                          resolvedColumnCount,
                      )
                    : 0;
                const tileWidth = resolveWidgetBentoSpanPixels(
                  columnSpan,
                  columnTrackWidth,
                  geometry.gap,
                );
                const tileHeight = resolveWidgetBentoSpanPixels(
                  rowSpan,
                  geometry.rowHeight,
                  geometry.gap,
                );
                const compactTile = tileHeight < 52 || tileWidth < 96;
                const tinyTile = tileHeight < 32 || tileWidth < 64;
                const tileContent = (
                  <WidgetBentoTileContent
                    compact={compactTile}
                    dimensionLabel={dimensionLabel}
                    index={index}
                    item={item}
                    label={label}
                    tiny={tinyTile}
                  />
                );
                const tileClassName = cn(
                  "flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-md border bg-card text-left shadow-sm transition-colors motion-reduce:transition-none",
                  compactTile ? "p-1" : "p-1.5",
                  interactive &&
                    "cursor-pointer hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  item.selected &&
                    "border-primary bg-primary/[0.08] ring-1 ring-primary/30",
                  item.dragging && "cursor-grabbing opacity-50",
                  item.over &&
                    !item.dragging &&
                    "border-primary ring-2 ring-primary ring-offset-1",
                );
                const accessibleLabel = `${onSelect ? "Configurar" : "Mover"} ${label}. Ordem ${index + 1} de ${items.length}. ${item.dimensionLabel?.trim() || formatDimensions(columnSpan, rowSpan)}${item.dragging ? ". Em movimento" : ""}`;

                return (
                  <li
                    key={item.id}
                    className="min-h-0 min-w-0 list-none"
                    style={{
                      gridColumn: `span ${columnSpan} / span ${columnSpan}`,
                      gridRow: `span ${rowSpan} / span ${rowSpan}`,
                    }}
                    data-widget-bento-item={item.id}
                    data-widget-bento-column-span={columnSpan}
                    data-widget-bento-compact={compactTile ? "true" : "false"}
                    data-widget-bento-kind={item.previewKind ?? "chart"}
                    data-widget-bento-row-span={rowSpan}
                  >
                    {interactive ? (
                      <button
                        type="button"
                        className={tileClassName}
                        draggable={Boolean(onDragStart)}
                        onClick={onSelect ? () => onSelect(item.id) : undefined}
                        onDragStart={
                          onDragStart
                            ? (event) => onDragStart(event, item.id)
                            : undefined
                        }
                        onDragOver={
                          onDragOver
                            ? (event) => onDragOver(event, item.id)
                            : undefined
                        }
                        onDragLeave={
                          onDragLeave
                            ? (event) => onDragLeave(event, item.id)
                            : undefined
                        }
                        onDrop={
                          onDrop ? (event) => onDrop(event, item.id) : undefined
                        }
                        onDragEnd={
                          onDragEnd
                            ? (event) => onDragEnd(event, item.id)
                            : undefined
                        }
                        aria-label={accessibleLabel}
                        aria-controls={onSelect ? inspectorId : undefined}
                        aria-grabbed={item.dragging || undefined}
                        aria-pressed={onSelect ? Boolean(item.selected) : undefined}
                        title={label}
                      >
                        {tileContent}
                      </button>
                    ) : (
                      <div className={tileClassName} title={label}>
                        {tileContent}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {resolvedHiddenCount > 0 && items.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {formatCount(resolvedHiddenCount, "oculto")} fora da miniatura.
        </p>
      ) : null}
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {reorderAnnouncement}
      </span>
    </section>
  );
}

function WidgetBentoTileContent({
  compact,
  dimensionLabel,
  index,
  item,
  label,
  tiny,
}: {
  compact: boolean;
  dimensionLabel: string;
  index: number;
  item: WidgetBentoPreviewItem;
  label: string;
  tiny: boolean;
}) {
  if (tiny) {
    return (
      <span className="flex h-full min-h-0 min-w-0 items-center gap-1">
        <span
          className="h-2 w-2 shrink-0 rounded-[2px] bg-primary"
          style={
            item.color || item.colors?.[0]
              ? { backgroundColor: item.color ?? item.colors?.[0] }
              : undefined
          }
          aria-hidden="true"
        />
        <span className="line-clamp-1 min-w-0 text-[9px] font-medium leading-none text-foreground">
          {label}
        </span>
        <span className="sr-only">
          {formatOrder(index + 1)} · {dimensionLabel}
        </span>
      </span>
    );
  }

  if (compact) {
    return (
      <>
        <span className="flex min-w-0 items-center gap-1 text-[8px] font-semibold leading-none text-muted-foreground">
          <span className="shrink-0">{formatOrder(index + 1)}</span>
          <span className="line-clamp-1 min-w-0 text-[9px] font-medium normal-case text-foreground">
            {label}
          </span>
        </span>
        <WidgetBentoMiniature className="mt-1 flex-1" item={item} />
        <span className="sr-only">{dimensionLabel}</span>
      </>
    );
  }

  return (
    <>
      <span className="flex min-w-0 items-center justify-between gap-1 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
        <span className="truncate">{formatOrder(index + 1)}</span>
        <span className="shrink-0 tabular-nums" aria-hidden="true">
          {dimensionLabel}
        </span>
      </span>
      <WidgetBentoMiniature className="my-1 flex-1" item={item} />
      <span className="line-clamp-1 min-w-0 break-words text-left text-[10px] font-medium leading-tight text-foreground">
        {label}
      </span>
    </>
  );
}

function WidgetBentoMiniature({
  className,
  item,
}: {
  className?: string;
  item: WidgetBentoPreviewItem;
}) {
  const kind = item.previewKind ?? (item.condensed ? "metric" : "chart");
  const chartType = item.chartType ?? "bar";
  const zoom = item.zoom ?? 100;
  const palette = item.colors?.filter((entry) => entry.trim()) ?? [];
  const color = item.color ?? palette[0] ?? "hsl(var(--primary))";
  const miniatureColor = (index: number) =>
    palette.length ? palette[index % palette.length] : color;
  const sharedClassName = cn(
    "relative flex min-h-0 min-w-0 overflow-hidden rounded-[3px] bg-muted/45",
    className,
  );
  const contentStyle: React.CSSProperties = {
    color,
    transform: `scale(${zoom / 100})`,
    transformOrigin: "center",
  };
  const backgroundStyle: React.CSSProperties | undefined = item.gradient
    ? {
        backgroundImage:
          palette.length > 1
            ? `linear-gradient(90deg, ${palette.join(", ")})`
            : `linear-gradient(90deg, transparent, ${color})`,
      }
    : undefined;

  if (kind === "metric") {
    return (
      <span
        className={cn(sharedClassName, "flex-col justify-center gap-1 px-1.5")}
        style={backgroundStyle}
        aria-hidden="true"
        data-widget-bento-miniature={kind}
      >
        <span className="h-1.5 w-2/5 rounded-full bg-current" style={contentStyle} />
        <span className="h-1 w-3/4 rounded-full bg-foreground/15" />
      </span>
    );
  }

  if (kind === "heatmap") {
    return (
      <span
        className={cn(sharedClassName, "grid grid-cols-6 gap-px p-1")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature={kind}
      >
        {HEATMAP_CELLS.map((opacity, index) => (
          <span
            key={index}
            className="min-h-1 rounded-[1px]"
            style={{ backgroundColor: miniatureColor(index), opacity }}
          />
        ))}
      </span>
    );
  }

  if (kind === "table" || kind === "ranking" || kind === "list") {
    return (
      <span
        className={cn(sharedClassName, "flex-col justify-center gap-1 px-1")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature={kind}
      >
        {(item.previewOrder === "asc"
          ? [0.48, 0.66, 0.86]
          : [0.86, 0.66, 0.48]
        ).map((width, index) => (
          <span key={width} className="flex items-center gap-1">
            {kind === "ranking" ? (
              <span className="w-2 text-[6px] font-semibold leading-none text-muted-foreground">
                {index + 1}
              </span>
            ) : kind === "list" ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: miniatureColor(index) }}
              />
            ) : null}
            <span className="h-px flex-1 bg-foreground/15" />
            <span
              className="h-1 rounded-full"
              style={{
                backgroundColor: miniatureColor(index),
                opacity: 0.8 - index * 0.18,
                width: `${width * 35}%`,
              }}
            />
          </span>
        ))}
      </span>
    );
  }

  if (kind === "composition") {
    if (chartType === "treemap") {
      return (
        <span
          className={cn(sharedClassName, "grid grid-cols-3 grid-rows-2 gap-px p-1")}
          style={contentStyle}
          aria-hidden="true"
          data-widget-bento-miniature="treemap"
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                "rounded-[1px]",
                index === 0 && "row-span-2",
                index === 1 && "col-span-2",
              )}
              style={{
                backgroundColor: miniatureColor(index),
                opacity: 0.9 - index * 0.18,
              }}
            />
          ))}
        </span>
      );
    }

    if (chartType === "rose") {
      return (
        <span
          className={cn(sharedClassName, "items-center justify-center p-0.5")}
          style={contentStyle}
          aria-hidden="true"
          data-widget-bento-miniature="rose"
        >
          <svg viewBox="0 0 40 40" className="h-full max-h-9 w-full max-w-9">
            {ROSE_PETALS.map((path, index) => (
              <path
                key={path}
                d={path}
                fill={miniatureColor(index)}
                opacity={0.92 - index * 0.12}
              />
            ))}
            <circle cx="20" cy="20" fill="hsl(var(--card))" r="2.5" />
          </svg>
        </span>
      );
    }

    return (
      <span
        className={cn(sharedClassName, "items-center justify-center")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature="composition"
      >
        <span className="relative h-4 w-8 max-w-[80%] overflow-hidden">
          <span
            className="absolute inset-x-0 top-0 aspect-square rounded-full"
            style={{
              background: `conic-gradient(from 270deg, ${miniatureColor(0)} 0 42%, ${miniatureColor(1)} 42% 72%, ${miniatureColor(2)} 72%)`,
            }}
          />
          <span className="absolute left-1/2 top-2 h-2.5 w-4 -translate-x-1/2 rounded-t-full bg-muted" />
        </span>
      </span>
    );
  }

  if (kind === "hex") {
    return (
      <span
        className={cn(sharedClassName, "grid grid-cols-4 place-items-center gap-px p-1")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature={kind}
      >
        {HEX_CELLS.map((offset, index) => (
          <span
            key={index}
            className={cn(
              "aspect-square w-full max-w-3",
              offset && "translate-x-1/2",
            )}
            style={{
              backgroundColor: miniatureColor(index),
              clipPath: "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0 50%)",
              opacity: 0.45 + (index % 4) * 0.15,
            }}
          />
        ))}
      </span>
    );
  }

  if (kind === "detail") {
    return (
      <span
        className={cn(sharedClassName, "grid grid-cols-2 gap-1 p-1")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature={kind}
      >
        <span className="rounded-[2px] bg-current opacity-70" />
        <span className="rounded-[2px] bg-current opacity-35" />
        <span className="col-span-2 rounded-[2px] bg-foreground/10" />
      </span>
    );
  }

  if (chartType === "line") {
    return (
      <span
        className={cn(sharedClassName, "p-1")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature="line"
      >
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full">
          <path
            d="M1 26 L18 18 L34 22 L50 8 L66 13 L82 5 L99 10"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
      </span>
    );
  }

  if (item.previewOrientation === "horizontal") {
    return (
      <span
        className={cn(sharedClassName, "flex-col justify-center gap-1 px-1.5 py-1")}
        style={contentStyle}
        aria-hidden="true"
        data-widget-bento-miniature="horizontal-bar"
      >
        {[78, 52, 90, 64].map((width, index) => (
          <span
            key={`${width}-${index}`}
            className="h-1 rounded-r-[2px]"
            style={{
              backgroundColor: miniatureColor(index),
              opacity: 0.55 + index * 0.1,
              width: `${width}%`,
            }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      className={cn(sharedClassName, "items-end justify-around gap-1 px-1.5 pb-1 pt-1")}
      style={contentStyle}
      aria-hidden="true"
      data-widget-bento-miniature="bar"
    >
      {[42, 72, 55, 88, 64].map((height, index) => (
        <span
          key={`${height}-${index}`}
          className="min-w-px flex-1 rounded-t-[2px]"
          style={{
            backgroundColor: miniatureColor(index),
            height: `${height}%`,
            opacity: 0.45 + index * 0.1,
          }}
        />
      ))}
    </span>
  );
}

const HEATMAP_CELLS = [
  0.18, 0.28, 0.48, 0.72, 0.42, 0.24, 0.32, 0.62, 0.86, 0.52, 0.3, 0.16,
  0.22, 0.42, 0.68, 0.92, 0.58, 0.34,
] as const;

const HEX_CELLS = [false, false, false, false, true, true, true, false] as const;

const ROSE_PETALS = [
  "M20 20 L20 2 A18 18 0 0 1 38 20 Z",
  "M20 20 L34 20 A14 14 0 0 1 20 34 Z",
  "M20 20 L20 30 A10 10 0 0 1 10 20 Z",
  "M20 20 L5 20 A15 15 0 0 1 20 5 Z",
] as const;

function normalizePositiveInteger(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function normalizeNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function layoutModeLabel(columnCount: number) {
  if (columnCount === 1) return "Celular · 1 coluna";
  if (columnCount === 2) return "Tablet · 2 colunas";
  if (columnCount === 3) return "Intermediário · 3 colunas";
  if (columnCount === 4) return "Desktop · 4 colunas";
  return `Grade proporcional · ${columnCount} colunas`;
}

function formatCount(count: number, singular: "ativo" | "oculto") {
  const plural = singular === "ativo" ? "ativos" : "ocultos";
  return `${new Intl.NumberFormat("pt-BR").format(count)} ${
    count === 1 ? singular : plural
  }`;
}

function formatOrder(position: number) {
  return `${new Intl.NumberFormat("pt-BR").format(position)}º`;
}

function formatDimensions(columnSpan: number, rowSpan: number) {
  const columns = columnSpan === 1 ? "1 coluna" : `${columnSpan} colunas`;
  const rows = rowSpan === 1 ? "1 linha" : `${rowSpan} linhas`;
  return `${columns} por ${rows}`;
}
