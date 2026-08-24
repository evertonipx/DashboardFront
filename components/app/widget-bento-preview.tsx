"use client";

import * as React from "react";
import { EyeOff, LayoutGrid } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WidgetBentoPreviewItem = {
  columnSpan: number;
  dragging?: boolean;
  id: string;
  label: string;
  over?: boolean;
  rowSpan: number;
  selected?: boolean;
};

export type WidgetBentoPreviewDragHandler = (
  event: React.DragEvent<HTMLButtonElement>,
  itemId: string,
) => void;

export type WidgetBentoPreviewProps = {
  className?: string;
  columnCount: number;
  hiddenCount: number;
  items: readonly WidgetBentoPreviewItem[];
  layoutLabel?: string;
  onDragEnd?: WidgetBentoPreviewDragHandler;
  onDragLeave?: WidgetBentoPreviewDragHandler;
  onDragOver?: WidgetBentoPreviewDragHandler;
  onDragStart?: WidgetBentoPreviewDragHandler;
  onDrop?: WidgetBentoPreviewDragHandler;
  onSelect?: (itemId: string) => void;
};

export function WidgetBentoPreview({
  className,
  columnCount,
  hiddenCount,
  items,
  layoutLabel,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onSelect,
}: WidgetBentoPreviewProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const resolvedColumnCount = normalizePositiveInteger(columnCount);
  const resolvedHiddenCount = normalizeNonNegativeInteger(hiddenCount);
  const interactive = Boolean(
    onSelect ||
      onDragStart ||
      onDragOver ||
      onDragLeave ||
      onDrop ||
      onDragEnd,
  );

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
        <ol
          className="mt-3 grid max-h-[min(52vh,30rem)] min-w-0 grid-flow-row gap-1 overflow-y-auto rounded-md border bg-background/70 p-2"
          style={{
            gridAutoRows: "1.25rem",
            gridTemplateColumns: `repeat(${resolvedColumnCount}, minmax(0, 1fr))`,
          }}
          aria-label="Widgets ativos na ordem da tela"
          data-widget-bento-grid
        >
          {items.map((item, index) => {
            const columnSpan = Math.min(
              normalizePositiveInteger(item.columnSpan),
              resolvedColumnCount,
            );
            const rowSpan = normalizePositiveInteger(item.rowSpan);
            const label = item.label.trim() || item.id;
            const tileContent = (
              <>
                <span className="flex min-w-0 items-center justify-between gap-1 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                  <span className="truncate">{formatOrder(index + 1)}</span>
                  <span className="shrink-0 tabular-nums" aria-hidden="true">
                    {columnSpan}×{rowSpan}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1 min-w-0 break-words text-left text-[11px] font-medium leading-tight text-foreground",
                    rowSpan === 1 ? "line-clamp-1" : "line-clamp-2",
                  )}
                >
                  {label}
                </span>
              </>
            );
            const tileClassName = cn(
              "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card p-2 text-left shadow-sm transition-colors motion-reduce:transition-none",
              interactive &&
                "cursor-pointer hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              item.selected && "border-primary bg-primary/[0.08] ring-1 ring-primary/30",
              item.dragging && "cursor-grabbing opacity-50",
              item.over &&
                !item.dragging &&
                "border-primary ring-2 ring-primary ring-offset-1",
            );
            const accessibleLabel = `${onSelect ? "Configurar" : "Mover"} ${label}. Ordem ${index + 1} de ${items.length}. ${formatDimensions(columnSpan, rowSpan)}${item.dragging ? ". Em movimento" : ""}`;

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
      )}

      {resolvedHiddenCount > 0 && items.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {formatCount(resolvedHiddenCount, "oculto")} fora da miniatura.
        </p>
      ) : null}
    </section>
  );
}

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
