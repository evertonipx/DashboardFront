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
  PanelTop,
  RotateCcw,
  Settings2,
  X,
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
import { apiFetch } from "@/lib/api";
import { hasVisualAdminAccess } from "@/lib/access";
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
};

export function CardLayout({
  cards,
  menuKey,
  editActions,
  monitorMode = false,
}: CardLayoutProps) {
  const { user } = useAuth();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [organizerDraggingId, setOrganizerDraggingId] = React.useState<string | null>(
    null,
  );
  const [organizerOverId, setOrganizerOverId] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [organizerOpen, setOrganizerOpen] = React.useState(false);
  const cardIds = React.useMemo(() => cards.map((card) => card.id), [cards]);
  const companyId = useEffectiveCompanyScopeId(user) || null;
  const preferences = useCardPreferences(menuKey, cardIds, companyId);
  const canEditLayout = hasVisualAdminAccess(user) && !monitorMode;
  const orderedCards = orderByCardPreferences(cards, preferences);
  const organizerCards = orderByAllCardPreferences(cards, preferences);
  const hiddenCards = cards.filter(
    (card) =>
      preferences.find((preference) => preference.id === card.id)?.visible === false,
  );

  React.useEffect(() => {
    if (!canEditLayout) {
      setEditing(false);
      setOrganizerOpen(false);
    }
  }, [canEditLayout]);

  React.useEffect(() => {
    if (!monitorMode) return;
    setEditing(false);
    setOrganizerOpen(false);
  }, [monitorMode]);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function persistPreferences(nextPreferences: CardPreference[]) {
    saveCardPreferences(menuKey, nextPreferences, cardIds, companyId);

    if (!canEditLayout) return;

    apiFetch(`/dashboard-views/${menuKey}`, {
      method: "PUT",
      body: {
        preferences: nextPreferences,
        card_ids: cardIds,
      },
    }).catch(() => undefined);
  }

  function persistOrder(nextCards: LayoutCard[]) {
    const hiddenPreferences = preferences.filter((preference) => !preference.visible);
    persistPreferences(
      [
        ...nextCards.map((card) => ({
          id: card.id,
          visible: true,
          size: preferences.find((preference) => preference.id === card.id)?.size,
        })),
        ...hiddenPreferences.filter((preference) => cardIds.includes(preference.id)),
      ],
    );
    flashSaved();
  }

  function persistFullOrder(nextCards: LayoutCard[]) {
    persistPreferences(
      nextCards.map((card) => {
        const preference = getPreference(preferences, card.id);

        return {
          id: card.id,
          visible: preference?.visible ?? true,
          size: preference?.size,
        };
      }),
    );
    flashSaved();
  }

  function moveCard(sourceId: string, targetId: string) {
    if (!editing || !canEditLayout) return;
    if (sourceId === targetId) return;

    const sourceIndex = orderedCards.findIndex((card) => card.id === sourceId);
    const targetIndex = orderedCards.findIndex((card) => card.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...orderedCards];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    persistOrder(next);
  }

  function hideCard(cardId: string) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId ? { ...preference, visible: false } : preference,
      ),
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

  function showCard(cardId: string) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId ? { ...preference, visible: true } : preference,
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

  return (
    <div className={cn(monitorMode ? "space-y-0" : "space-y-4")}>
      {canEditLayout ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2",
            editing
              ? "justify-end border-border bg-card"
              : "justify-between border-primary/20 bg-primary/10",
          )}
        >
          {editing ? (
            <>
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground",
                  saved &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saved ? "Visual salvo" : "Arraste, redimensione ou oculte widgets"}
              </div>
              {editActions}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOrganizerOpen(true)}
              >
                <GripVertical className="h-3.5 w-3.5" />
                Organizar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={restoreDefaultOrder}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Padrão
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                <X className="h-3.5 w-3.5" />
                Concluir
              </Button>
            </>
          ) : (
            <>
              <div className="min-w-0 text-sm font-medium text-foreground">
                Visual dos widgets
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditing(true);
                  setOrganizerOpen(true);
                }}
                aria-label="Configurar widgets"
                title="Configurar widgets"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configurar widgets
              </Button>
            </>
          )}
        </div>
      ) : null}

      {editing && hiddenCards.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/20 p-3">
          <span className="text-xs font-medium uppercase text-muted-foreground">
            Ocultos
          </span>
          {hiddenCards.map((card) => (
            <Button
              key={card.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => showCard(card.id)}
            >
              <Eye className="h-3.5 w-3.5" />
              {card.label ?? card.id}
            </Button>
          ))}
        </div>
      ) : null}

      {monitorMode ? null : (
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
          onMoveToBottom={(cardId) =>
            moveOrganizerCardTo(cardId, organizerCards.length - 1)
          }
          onMoveToTop={(cardId) => moveOrganizerCardTo(cardId, 0)}
          onMoveUp={(cardId, index) => moveOrganizerCardTo(cardId, index - 1)}
          onOpenChange={setOrganizerOpen}
          onResize={resizeCard}
          onRestoreDefault={restoreDefaultOrder}
          onToggleVisibility={toggleCardVisibility}
          open={organizerOpen}
          overId={organizerOverId}
          preferences={preferences}
        />
      )}

      <div
        className={cn(
          "grid sm:grid-cols-2 xl:grid-cols-4",
          monitorMode ? "gap-3" : "gap-4",
        )}
      >
        {orderedCards.map((card) => (
          <CardLayoutItem
            key={card.id}
            card={card}
            canEditLayout={canEditLayout}
            draggingId={draggingId}
            editing={editing}
            onDragEnd={() => {
              setDraggingId(null);
              setOverId(null);
            }}
            onDragLeave={() => setOverId(null)}
            onDragOver={(event) => {
              if (!editing || !canEditLayout) return;
              event.preventDefault();
              setOverId(card.id);
            }}
            onDragStart={(event) => {
              if (!editing || !canEditLayout) return;
              setDraggingId(card.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", card.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
              if (sourceId) moveCard(sourceId, card.id);
              setDraggingId(null);
              setOverId(null);
            }}
            onHide={() => hideCard(card.id)}
            onResize={(size) => resizeCard(card.id, size)}
            overId={overId}
            preference={preferences.find((preference) => preference.id === card.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CardLayoutItem({
  card,
  canEditLayout,
  draggingId,
  editing,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onHide,
  onResize,
  overId,
  preference,
}: {
  card: LayoutCard;
  canEditLayout: boolean;
  draggingId: string | null;
  editing: boolean;
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onHide: () => void;
  onResize: (size: CardSize) => void;
  overId: string | null;
  preference?: CardPreference;
}) {
  const currentSize = preference?.size ?? card.defaultSize;

  return (
    <div
      draggable={editing && canEditLayout}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative transition",
        sizeClassName(currentSize, card.className),
        draggingId === card.id && "opacity-50",
        editing &&
          overId === card.id &&
          draggingId !== card.id &&
          "rounded-md ring-2 ring-primary ring-offset-2",
      )}
    >
      {editing ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute left-3 top-3 z-10 h-8 w-8 bg-card/95 text-muted-foreground shadow-sm"
            onClick={onHide}
            aria-label={`Ocultar ${card.label ?? card.id}`}
          >
            <EyeOff className="h-4 w-4" />
          </Button>
          <div className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-md border bg-card/95 text-muted-foreground shadow-sm">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="absolute bottom-3 left-3 z-10 inline-flex rounded-md border bg-card/95 p-1 shadow-sm">
            <SizeButton
              active={currentSize === "compact" || (!currentSize && !card.className)}
              icon={Minimize2}
              label="Compacto"
              onClick={() => onResize("compact")}
            />
            <SizeButton
              active={currentSize === "wide" || (!currentSize && Boolean(card.className))}
              icon={PanelTop}
              label="Largo"
              onClick={() => onResize("wide")}
            />
            <SizeButton
              active={currentSize === "full"}
              icon={Maximize2}
              label="Tela cheia"
              onClick={() => onResize("full")}
            />
          </div>
        </>
      ) : null}
      {card.node}
    </div>
  );
}

function WidgetOrganizerDialog({
  cards,
  draggingId,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onMoveDown,
  onMoveToBottom,
  onMoveToTop,
  onMoveUp,
  onOpenChange,
  onResize,
  onRestoreDefault,
  onToggleVisibility,
  open,
  overId,
  preferences,
}: {
  cards: LayoutCard[];
  draggingId: string | null;
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onMoveDown: (cardId: string, index: number) => void;
  onMoveToBottom: (cardId: string) => void;
  onMoveToTop: (cardId: string) => void;
  onMoveUp: (cardId: string, index: number) => void;
  onOpenChange: (open: boolean) => void;
  onResize: (cardId: string, size: CardSize) => void;
  onRestoreDefault: () => void;
  onToggleVisibility: (cardId: string) => void;
  open: boolean;
  overId: string | null;
  preferences: CardPreference[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Organizar widgets</DialogTitle>
          <DialogDescription>
            Reordene, oculte e ajuste o tamanho dos cards do dashboard.
          </DialogDescription>
        </DialogHeader>

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
                  "grid gap-3 rounded-md border bg-card p-3 transition md:grid-cols-[auto_minmax(0,1fr)_auto]",
                  draggingId === card.id && "opacity-50",
                  overId === card.id &&
                    draggingId !== card.id &&
                    "ring-2 ring-primary ring-offset-2",
                  !visible && "border-dashed bg-muted/20",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md border bg-background text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <WidgetMiniature size={currentSize} visible={visible} />
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

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={first}
                    onClick={() => onMoveToTop(card.id)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Topo
                  </Button>
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
                    variant="outline"
                    size="sm"
                    disabled={last}
                    onClick={() => onMoveToBottom(card.id)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Fim
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
                      label="Tela cheia"
                      onClick={() => onResize(card.id, "full")}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onRestoreDefault}>
            <RotateCcw className="h-4 w-4" />
            Restaurar padrão
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WidgetMiniature({
  size,
  visible,
}: {
  size: CardSize | undefined;
  visible: boolean;
}) {
  const columns = size === "full" ? 4 : size === "wide" ? 2 : 1;

  return (
    <div
      className={cn(
        "grid h-12 shrink-0 gap-1 rounded-md border bg-background p-1",
        size === "full" ? "w-24" : size === "wide" ? "w-20" : "w-14",
        !visible && "opacity-45",
      )}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }).map((_, index) => (
        <div
          key={index}
          className="rounded-sm bg-primary/20 ring-1 ring-primary/20"
        />
      ))}
    </div>
  );
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
  if (size === "full") return "Tela cheia";
  if (size === "wide") return "Largo";
  return "Compacto";
}

function formatPosition(index: number) {
  return new Intl.NumberFormat("pt-BR").format(index + 1);
}
