"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
  Palette,
  PanelTop,
  RotateCcw,
  Settings2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/app/auth-provider";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { WidgetAppearanceProvider } from "@/components/app/widget-appearance";
import { hasVisualAdminAccess } from "@/lib/access";
import {
  PASTEL_BAR_COLORS,
  monochromeHeatmapPalette,
} from "@/lib/chart-palette";
import { useEffectiveCompanyScopeId } from "@/lib/master-company-scope";
import { cn } from "@/lib/utils";
import {
  orderByCardPreferences,
  saveCardPreferences,
  type CardPreference,
  type CardMenuKey,
  type CardSize,
} from "@/lib/view-preferences";

type LayoutCard = {
  id: string;
  label?: string;
  defaultSize?: CardSize;
  className?: string;
  node: React.ReactNode;
};

type CardLayoutProps = {
  cards: LayoutCard[];
  menuKey: CardMenuKey;
  editActions?: React.ReactNode;
  monitorMode?: boolean;
  onOrganizerOpenChange?: (open: boolean) => void;
  onReorderModeChange?: (enabled: boolean) => void;
  organizerOpen?: boolean;
  preferenceScopeId?: string | null;
  reorderMode?: boolean;
  showOrganizerTrigger?: boolean;
  showReorderTrigger?: boolean;
};

export function CardLayout({
  cards,
  menuKey,
  editActions,
  monitorMode = false,
  onOrganizerOpenChange,
  onReorderModeChange,
  organizerOpen: controlledOrganizerOpen,
  preferenceScopeId,
  reorderMode: controlledReorderMode,
  showOrganizerTrigger = true,
  showReorderTrigger = true,
}: CardLayoutProps) {
  const { user } = useAuth();
  const [organizerDraggingId, setOrganizerDraggingId] = React.useState<string | null>(
    null,
  );
  const [organizerOverId, setOrganizerOverId] = React.useState<string | null>(null);
  const [screenDraggingId, setScreenDraggingId] = React.useState<string | null>(
    null,
  );
  const [screenOverId, setScreenOverId] = React.useState<string | null>(null);
  const [internalReorderMode, setInternalReorderMode] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [internalOrganizerOpen, setInternalOrganizerOpen] = React.useState(false);
  const organizerOpen = controlledOrganizerOpen ?? internalOrganizerOpen;
  const screenReorderEnabled = controlledReorderMode ?? internalReorderMode;
  const setOrganizerOpen = React.useCallback(
    (open: boolean) => {
      if (controlledOrganizerOpen === undefined) {
        setInternalOrganizerOpen(open);
      }
      onOrganizerOpenChange?.(open);
    },
    [controlledOrganizerOpen, onOrganizerOpenChange],
  );
  const setScreenReorderEnabled = React.useCallback(
    (enabled: boolean) => {
      if (controlledReorderMode === undefined) {
        setInternalReorderMode(enabled);
      }
      onReorderModeChange?.(enabled);
    },
    [controlledReorderMode, onReorderModeChange],
  );
  const cardIds = React.useMemo(() => cards.map((card) => card.id), [cards]);
  const companyId = useEffectiveCompanyScopeId(user) || null;
  const preferences = useCardPreferences(menuKey, cardIds, companyId, {
    syncServer: false,
    userId: user?.id,
    viewId: preferenceScopeId,
  });
  const canEditLayout = hasVisualAdminAccess(user) && !monitorMode;
  const orderedCards = orderByCardPreferences(cards, preferences);
  const organizerCards = orderByAllCardPreferences(cards, preferences);

  React.useEffect(() => {
    if (!canEditLayout) {
      setOrganizerOpen(false);
      setScreenReorderEnabled(false);
    }
  }, [canEditLayout, setOrganizerOpen, setScreenReorderEnabled]);

  React.useEffect(() => {
    if (!monitorMode) return;
    setOrganizerOpen(false);
    setScreenReorderEnabled(false);
  }, [monitorMode, setOrganizerOpen, setScreenReorderEnabled]);

  React.useEffect(() => {
    if (screenReorderEnabled) return;
    setScreenDraggingId(null);
    setScreenOverId(null);
  }, [screenReorderEnabled]);

  React.useEffect(() => {
    if (!screenReorderEnabled) return;

    const finishOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScreenReorderEnabled(false);
    };

    window.addEventListener("keydown", finishOnEscape);
    return () => window.removeEventListener("keydown", finishOnEscape);
  }, [screenReorderEnabled, setScreenReorderEnabled]);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function persistPreferences(nextPreferences: CardPreference[]) {
    saveCardPreferences(
      menuKey,
      nextPreferences,
      cardIds,
      companyId,
      user?.id,
      preferenceScopeId,
    );
  }

  function persistFullOrder(nextCards: LayoutCard[]) {
    persistPreferences(
      nextCards.map((card) => {
        const preference = getPreference(preferences, card.id);

        return {
          id: card.id,
          visible: preference?.visible ?? true,
          color: preference?.color,
          size: preference?.size,
        };
      }),
    );
    flashSaved();
  }

  function moveOrganizerCard(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    const sourceIndex = organizerCards.findIndex((card) => card.id === sourceId);
    const targetIndex = organizerCards.findIndex((card) => card.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...organizerCards];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    persistFullOrder(next);
  }

  function moveOrganizerCardTo(cardId: string, targetIndex: number) {
    const sourceIndex = organizerCards.findIndex((card) => card.id === cardId);
    if (sourceIndex === -1) return;

    const next = [...organizerCards];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, moved);
    persistFullOrder(next);
  }

  function toggleCardVisibility(cardId: string) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId
          ? { ...preference, visible: preference.visible === false }
          : preference,
      ),
    );
    flashSaved();
  }

  function restoreDefaultOrder() {
    persistPreferences(cardIds.map((id) => ({ id, visible: true })));
    flashSaved();
  }

  function resizeCard(cardId: string, size: CardSize) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId ? { ...preference, size } : preference,
      ),
    );
    flashSaved();
  }

  function setCardColor(cardId: string, color?: string) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId
          ? { ...preference, color }
          : preference,
      ),
    );
    flashSaved();
  }

  return (
    <div
      className={cn(
        "min-w-0 max-w-full",
        monitorMode ? "space-y-0" : "space-y-4",
      )}
    >
      {canEditLayout && (showReorderTrigger || showOrganizerTrigger) ? (
        <div className="flex justify-end gap-1.5">
          {showReorderTrigger ? (
            <ReorderModeButton
              className="h-8 w-8 bg-card shadow-sm"
              enabled={screenReorderEnabled}
              onChange={setScreenReorderEnabled}
            />
          ) : null}
          {showOrganizerTrigger ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-card shadow-sm"
              onClick={() => setOrganizerOpen(true)}
              aria-label="Configurar widgets"
              title="Configurar widgets"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {monitorMode || !canEditLayout ? null : (
        <WidgetOrganizerDialog
          cards={organizerCards}
          draggingId={organizerDraggingId}
          onDragEnd={() => {
            setOrganizerDraggingId(null);
            setOrganizerOverId(null);
          }}
          onDragLeave={() => setOrganizerOverId(null)}
          onDragOver={(event, cardId) => {
            event.preventDefault();
            setOrganizerOverId(cardId);
          }}
          onDragStart={(event, cardId) => {
            setOrganizerDraggingId(cardId);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", cardId);
          }}
          onDrop={(event, cardId) => {
            event.preventDefault();
            const sourceId =
              event.dataTransfer.getData("text/plain") || organizerDraggingId;
            if (sourceId) moveOrganizerCard(sourceId, cardId);
            setOrganizerDraggingId(null);
            setOrganizerOverId(null);
          }}
          onMoveDown={(cardId, index) => moveOrganizerCardTo(cardId, index + 1)}
          onMoveUp={(cardId, index) => moveOrganizerCardTo(cardId, index - 1)}
          onOpenChange={setOrganizerOpen}
          onColorChange={setCardColor}
          onResize={resizeCard}
          onRestoreDefault={restoreDefaultOrder}
          onToggleVisibility={toggleCardVisibility}
          open={organizerOpen}
          overId={organizerOverId}
          preferences={preferences}
          saved={saved}
          editActions={editActions}
        />
      )}

      <div
        className={cn(
          "grid min-w-0 grid-cols-[minmax(0,1fr)] sm:grid-cols-2 xl:grid-cols-4",
          monitorMode ? "gap-3" : "gap-4",
        )}
      >
        {orderedCards.map((card) => (
          <CardLayoutItem
            key={card.id}
            card={card}
            draggingId={screenDraggingId}
            onDragEnd={() => {
              setScreenDraggingId(null);
              setScreenOverId(null);
            }}
            onDragOver={(event) => {
              if (!screenReorderEnabled) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setScreenOverId(card.id);
            }}
            onDragStart={(event) => {
              if (!screenReorderEnabled) return;
              setScreenDraggingId(card.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", card.id);
            }}
            onDrop={(event) => {
              if (!screenReorderEnabled) return;
              event.preventDefault();
              const sourceId =
                event.dataTransfer.getData("text/plain") || screenDraggingId;
              if (sourceId) moveOrganizerCard(sourceId, card.id);
              setScreenDraggingId(null);
              setScreenOverId(null);
            }}
            overId={screenOverId}
            preference={preferences.find((preference) => preference.id === card.id)}
            reorderEnabled={screenReorderEnabled}
          />
        ))}
      </div>
    </div>
  );
}

export function ReorderModeButton({
  className,
  enabled,
  onChange,
}: {
  className?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant={enabled ? "secondary" : "outline"}
      size="icon"
      className={className}
      onClick={() => onChange(!enabled)}
      aria-label={
        enabled
          ? "Concluir reorganização dos widgets"
          : "Reorganizar widgets na tela"
      }
      aria-pressed={enabled}
      title={enabled ? "Concluir reorganização" : "Reorganizar na tela"}
    >
      {enabled ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <GripVertical className="h-4 w-4" />
      )}
    </Button>
  );
}

function CardLayoutItem({
  card,
  draggingId,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  overId,
  preference,
  reorderEnabled,
}: {
  card: LayoutCard;
  draggingId: string | null;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  overId: string | null;
  preference?: CardPreference;
  reorderEnabled: boolean;
}) {
  const currentSize = preference?.size ?? card.defaultSize;

  return (
    <div
      data-layout-card-id={card.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "group relative min-w-0 transition",
        sizeClassName(currentSize, card.className),
        reorderEnabled &&
          "rounded-md ring-1 ring-primary/25 ring-offset-2 ring-offset-background",
        draggingId === card.id && "opacity-50",
        reorderEnabled &&
          overId === card.id &&
          draggingId !== card.id &&
          "ring-2 ring-primary",
      )}
    >
      {reorderEnabled ? (
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="absolute left-1/2 top-0 z-30 flex h-6 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-md border bg-card/95 text-muted-foreground shadow-sm transition hover:text-foreground active:cursor-grabbing"
          aria-grabbed={draggingId === card.id}
          aria-label={`Mover ${card.label ?? card.id}`}
          title="Arrastar para mover"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <WidgetAppearanceProvider color={preference?.color}>
        {card.node}
      </WidgetAppearanceProvider>
    </div>
  );
}

function WidgetOrganizerDialog({
  cards,
  draggingId,
  editActions,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onMoveDown,
  onMoveUp,
  onOpenChange,
  onColorChange,
  onResize,
  onRestoreDefault,
  onToggleVisibility,
  open,
  overId,
  preferences,
  saved,
}: {
  cards: LayoutCard[];
  draggingId: string | null;
  editActions?: React.ReactNode;
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onMoveDown: (cardId: string, index: number) => void;
  onMoveUp: (cardId: string, index: number) => void;
  onOpenChange: (open: boolean) => void;
  onColorChange: (cardId: string, color?: string) => void;
  onResize: (cardId: string, size: CardSize) => void;
  onRestoreDefault: () => void;
  onToggleVisibility: (cardId: string) => void;
  open: boolean;
  overId: string | null;
  preferences: CardPreference[];
  saved: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <DialogHeader className="min-w-0">
            <DialogTitle>Configurar widgets</DialogTitle>
            <DialogDescription>
              Adicione, reordene e ajuste a aparência dos widgets.
            </DialogDescription>
          </DialogHeader>
          {editActions ? (
            <div
              className="flex shrink-0 items-center gap-2 sm:pr-8"
              onClickCapture={() => onOpenChange(false)}
            >
              {editActions}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {cards.map((card, index) => {
            const preference = getPreference(preferences, card.id);
            const visible = preference?.visible !== false;
            const currentSize = preference?.size ?? card.defaultSize;
            const first = index === 0;
            const last = index === cards.length - 1;

            return (
              <div
                key={card.id}
                draggable
                onDragStart={(event) => onDragStart(event, card.id)}
                onDragOver={(event) => onDragOver(event, card.id)}
                onDragLeave={onDragLeave}
                onDrop={(event) => onDrop(event, card.id)}
                onDragEnd={onDragEnd}
                className={cn(
                  "grid gap-3 rounded-md border bg-card p-3 transition sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center",
                  draggingId === card.id && "opacity-50",
                  overId === card.id &&
                    draggingId !== card.id &&
                    "ring-2 ring-primary ring-offset-2",
                  !visible && "border-dashed bg-muted/20",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md border bg-background text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {card.label ?? card.id}
                    </div>
                    <Badge variant={visible ? "outline" : "secondary"}>
                      {visible ? "Visível" : "Oculto"}
                    </Badge>
                    <Badge variant="outline">{sizeLabel(currentSize)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Posição {formatPosition(index)} de {cards.length}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 sm:pl-12 lg:col-span-1 lg:pl-0 lg:justify-end">
                  <WidgetColorPicker
                    cardId={card.id}
                    color={preference?.color}
                    onChange={onColorChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={first}
                    onClick={() => onMoveUp(card.id, index)}
                    aria-label="Subir"
                    title="Subir"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={last}
                    onClick={() => onMoveDown(card.id, index)}
                    aria-label="Descer"
                    title="Descer"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant={visible ? "outline" : "secondary"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onToggleVisibility(card.id)}
                    aria-label={visible ? "Ocultar" : "Exibir"}
                    title={visible ? "Ocultar" : "Exibir"}
                  >
                    {visible ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <div className="inline-flex rounded-md border bg-background p-1">
                    <SizeButton
                      active={currentSize === "compact" || !currentSize}
                      icon={Minimize2}
                      label="Compacto"
                      onClick={() => onResize(card.id, "compact")}
                    />
                    <SizeButton
                      active={currentSize === "wide"}
                      icon={PanelTop}
                      label="Largo"
                      onClick={() => onResize(card.id, "wide")}
                    />
                    <SizeButton
                      active={currentSize === "full"}
                      icon={Maximize2}
                      label="Largura total"
                      onClick={() => onResize(card.id, "full")}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <div
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground",
              saved && "text-emerald-700 dark:text-emerald-300",
            )}
            aria-live="polite"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {saved ? "Alterações salvas" : "Salvamento automático"}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onRestoreDefault}>
              <RotateCcw className="h-4 w-4" />
              Restaurar padrão
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Concluir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WidgetColorPicker({
  cardId,
  color,
  onChange,
}: {
  cardId: string;
  color?: string;
  onChange: (cardId: string, color?: string) => void;
}) {
  const usesGradient = cardId === "live_month_hour_heatmap";

  return (
    <div
      className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-1.5"
      aria-label={usesGradient ? "Gradiente do mapa de calor" : "Cor do widget"}
    >
      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
      {PASTEL_BAR_COLORS.slice(0, 4).map((swatch) => (
        <button
          key={swatch}
          type="button"
          className={cn(
            "h-4 w-4 rounded-sm border transition",
            color === swatch && "ring-2 ring-primary ring-offset-1",
          )}
          style={widgetColorPreviewStyle(swatch, usesGradient)}
          onClick={() => onChange(cardId, swatch)}
          aria-label={`${usesGradient ? "Usar gradiente" : "Usar cor"} ${swatch}`}
          title={swatch}
        />
      ))}
      <label
        className="relative h-4 w-4 cursor-pointer overflow-hidden rounded-sm border"
        title="Cor personalizada"
      >
        <span
          className="absolute inset-0"
          style={widgetColorPreviewStyle(
            color ?? "#1267C4",
            usesGradient,
          )}
        />
        <input
          type="color"
          value={color ?? "#1267C4"}
          onChange={(event) => onChange(cardId, event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Escolher cor personalizada"
        />
      </label>
      {color ? (
        <button
          type="button"
          className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
          onClick={() => onChange(cardId, undefined)}
          aria-label="Restaurar cor padrão"
          title="Cor padrão"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

function widgetColorPreviewStyle(
  color: string,
  usesGradient: boolean,
): React.CSSProperties {
  if (!usesGradient) return { backgroundColor: color };

  return {
    backgroundImage: `linear-gradient(90deg, ${monochromeHeatmapPalette(color).join(", ")})`,
  };
}

function SizeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

function sizeClassName(size: CardSize | undefined, fallback: string | undefined) {
  if (!size) return fallback;
  if (size === "wide") return "sm:col-span-2 xl:col-span-2";
  if (size === "full") return "sm:col-span-2 xl:col-span-4";
  return undefined;
}

function orderByAllCardPreferences(cards: LayoutCard[], preferences: CardPreference[]) {
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const ordered = preferences
    .map((preference) => cardMap.get(preference.id))
    .filter(Boolean) as LayoutCard[];
  const orderedIds = new Set(ordered.map((card) => card.id));
  const missing = cards.filter((card) => !orderedIds.has(card.id));

  return [...ordered, ...missing];
}

function getPreference(preferences: CardPreference[], cardId: string) {
  return preferences.find((preference) => preference.id === cardId);
}

function sizeLabel(size: CardSize | undefined) {
  if (size === "full") return "Largura total";
  if (size === "wide") return "Largo";
  return "Compacto";
}

function formatPosition(index: number) {
  return new Intl.NumberFormat("pt-BR").format(index + 1);
}
