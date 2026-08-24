"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChartPie,
  ChartSpline,
  Eye,
  EyeOff,
  GripVertical,
  LayoutTemplate,
  LayoutGrid,
  Palette,
  RotateCcw,
  Settings2,
  ZoomIn,
  ZoomOut,
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
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/app/auth-provider";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { WidgetBentoPreview } from "@/components/app/widget-bento-preview";
import { WidgetViewPresetsDialog } from "@/components/app/widget-view-presets";
import { WidgetAppearanceProvider } from "@/components/app/widget-appearance";
import { hasVisualAdminAccess } from "@/lib/access";
import {
  PASTEL_BAR_COLORS,
  monochromeHeatmapPalette,
} from "@/lib/chart-palette";
import { useEffectiveCompanyScopeId } from "@/lib/master-company-scope";
import { flushUserGridSync } from "@/lib/user-grid";
import { cn } from "@/lib/utils";
import {
  CARD_LAYOUT_LEVELS,
  clampCardLayoutLevel,
  resolveCardLayoutDimensions,
  resolveCardLayoutHeightPixels,
  type CardLayoutLevel,
  type CardLayoutRowSpanOverrides,
} from "@/lib/card-layout-sizing";
import {
  applyDefaultWidgetViewPresetIfEmpty,
  type WidgetViewPreset,
  type WidgetViewPresetNamespace,
  type WidgetViewScope,
} from "@/lib/widget-view-presets";
import {
  CARD_ZOOM_LEVELS,
  cardHeightToLayoutLevel,
  cardLayoutLevelToCardHeight,
  cardLayoutLevelToCardSize,
  cardSizeToLayoutLevel,
  orderByCardPreferences,
  saveCardPreferences,
  type CardPreference,
  type CardChartType,
  type CardHeight,
  type CardMenuKey,
  type CardSize,
  type CardZoom,
} from "@/lib/view-preferences";

type LayoutCard = {
  chartTypeEnabled?: boolean;
  chartTypes?: readonly CardChartType[];
  colorEditable?: boolean;
  colorPreview?: "gradient" | "solid";
  id: string;
  label?: string;
  defaultHeight?: CardHeight;
  defaultSize?: CardSize;
  minHeight?: CardHeight;
  maxHeight?: CardHeight;
  minWidthLevel?: CardLayoutLevel;
  maxWidthLevel?: CardLayoutLevel;
  minHeightLevel?: CardLayoutLevel;
  maxHeightLevel?: CardLayoutLevel;
  narrowMinHeightLevel?: CardLayoutLevel;
  minHeightByWidthLevel?: Partial<
    Record<CardLayoutLevel, CardLayoutLevel>
  >;
  rowSpanOverrides?: CardLayoutRowSpanOverrides;
  className?: string;
  titleEditable?: boolean;
  zoomEnabled?: boolean;
  node: React.ReactNode;
};

type CardLayoutProps = {
  cards: LayoutCard[];
  menuKey: CardMenuKey;
  editActions?: React.ReactNode;
  monitorMode?: boolean;
  onApplySavedViewSource?: (preset: WidgetViewPreset) => boolean;
  onOrganizerOpenChange?: (open: boolean) => void;
  onPreferencesChange?: (preferences: CardPreference[]) => void;
  onReorderModeChange?: (enabled: boolean) => void;
  organizerOpen?: boolean;
  presetNamespace?: WidgetViewPresetNamespace;
  preferenceScopeId?: string | null;
  reorderMode?: boolean;
  showOrganizerTrigger?: boolean;
  showReorderTrigger?: boolean;
  savedViewSourceMenus?: CardMenuKey[];
  viewScopeName?: string | null;
  viewScopes?: WidgetViewScope[];
};

export function CardLayout({
  cards,
  menuKey,
  editActions,
  monitorMode = false,
  onApplySavedViewSource,
  onOrganizerOpenChange,
  onPreferencesChange,
  onReorderModeChange,
  organizerOpen: controlledOrganizerOpen,
  presetNamespace,
  preferenceScopeId,
  reorderMode: controlledReorderMode,
  showOrganizerTrigger = true,
  showReorderTrigger = true,
  savedViewSourceMenus = [],
  viewScopeName,
  viewScopes = [],
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
  const [savedViewsOpen, setSavedViewsOpen] = React.useState(false);
  const [internalOrganizerOpen, setInternalOrganizerOpen] = React.useState(false);
  const [layoutWidth, setLayoutWidth] = React.useState(0);
  const defaultApplicationRef = React.useRef("");
  const layoutRootRef = React.useRef<HTMLDivElement>(null);
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
  const resolvedPresetNamespace =
    presetNamespace ?? (menuKey === "occupancy" ? "occupancy-live" : menuKey);
  const preferences = useCardPreferences(menuKey, cardIds, companyId, {
    userId: user?.id,
    viewId: preferenceScopeId,
  });
  const canEditLayout = hasVisualAdminAccess(user) && !monitorMode;
  const orderedCards = orderByCardPreferences(cards, preferences);
  const organizerCards = orderByAllCardPreferences(cards, preferences);
  const currentViewScope = preferenceScopeId
    ? {
        id: preferenceScopeId,
        name: viewScopeName?.trim() || "Tela atual",
      }
    : null;

  React.useEffect(() => {
    onPreferencesChange?.(preferences);
  }, [onPreferencesChange, preferences]);

  React.useEffect(() => {
    const root = layoutRootRef.current;
    if (!root) return;

    const updateWidth = () => setLayoutWidth(root.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!preferenceScopeId || !user?.id) return;
    let cancelled = false;
    const applicationKey = [
      menuKey,
      resolvedPresetNamespace,
      companyId ?? "",
      user.id,
      preferenceScopeId,
    ].join("|");
    if (defaultApplicationRef.current === applicationKey) return;
    defaultApplicationRef.current = applicationKey;

    const applied = applyDefaultWidgetViewPresetIfEmpty({
      cardIds,
      companyId,
      menuKey,
      presetNamespace: resolvedPresetNamespace,
      targetScope: {
        id: preferenceScopeId,
        name: viewScopeName?.trim() || "Tela atual",
      },
      userId: user.id,
    });
    if (applied) {
      void flushUserGridSync().then((synchronized) => {
        if (!cancelled && synchronized) window.location.reload();
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    cardIds,
    companyId,
    menuKey,
    preferenceScopeId,
    resolvedPresetNamespace,
    user?.id,
    viewScopeName,
  ]);

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
          ...preference,
          id: card.id,
          visible: preference?.visible ?? true,
        };
      }),
    );
    flashSaved();
  }

  function visibleOrganizerCards() {
    return organizerCards.filter(
      (card) => getPreference(preferences, card.id)?.visible !== false,
    );
  }

  function mergeVisibleOrder(nextVisibleCards: LayoutCard[]) {
    let visibleIndex = 0;
    return organizerCards.map((card) =>
      getPreference(preferences, card.id)?.visible === false
        ? card
        : nextVisibleCards[visibleIndex++] ?? card,
    );
  }

  function moveOrganizerCard(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    const visibleCards = visibleOrganizerCards();
    const sourceIndex = visibleCards.findIndex((card) => card.id === sourceId);
    const targetIndex = visibleCards.findIndex((card) => card.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...visibleCards];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    persistFullOrder(mergeVisibleOrder(next));
  }

  function moveOrganizerCardTo(cardId: string, targetIndex: number) {
    const visibleCards = visibleOrganizerCards();
    const sourceIndex = visibleCards.findIndex((card) => card.id === cardId);
    if (sourceIndex === -1) return;

    const next = [...visibleCards];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, moved);
    persistFullOrder(mergeVisibleOrder(next));
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

  function resizeCard(cardId: string, widthLevel: CardLayoutLevel) {
    const card = cards.find((candidate) => candidate.id === cardId);
    persistPreferences(
      preferences.map((preference) => {
        if (preference.id !== cardId || !card) return preference;
        const currentHeightLevel = resolveRequestedCardHeightLevel(
          card,
          preference,
          widthLevel,
        );
        const resolved = resolveCardPreferenceDimensions(
          card,
          widthLevel,
          currentHeightLevel,
        );

        return {
          ...preference,
          height: cardLayoutLevelToCardHeight(resolved.heightLevel),
          heightLevel: resolved.heightLevel,
          size: cardLayoutLevelToCardSize(resolved.widthLevel),
          widthLevel: resolved.widthLevel,
        };
      }),
    );
    flashSaved();
  }

  function resizeCardHeight(cardId: string, heightLevel: CardLayoutLevel) {
    const card = cards.find((candidate) => candidate.id === cardId);
    const preference = preferences.find((candidate) => candidate.id === cardId);
    const widthLevel = card
      ? resolveRequestedCardWidthLevel(card, preference)
      : 1;
    const resolved = card
      ? resolveCardPreferenceDimensions(
          card,
          widthLevel,
          heightLevel,
        )
      : { heightLevel };

    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId
          ? {
              ...preference,
              height: cardLayoutLevelToCardHeight(resolved.heightLevel),
              heightLevel: resolved.heightLevel,
            }
          : preference,
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

  function setCardChartType(cardId: string, chartType: CardChartType) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId
          ? { ...preference, chartType }
          : preference,
      ),
    );
    flashSaved();
  }

  function setCardTitle(cardId: string, title?: string) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId ? { ...preference, title } : preference,
      ),
    );
    flashSaved();
  }

  function setCardZoom(cardId: string, zoom: CardZoom) {
    persistPreferences(
      preferences.map((preference) =>
        preference.id === cardId
          ? { ...preference, zoom: zoom === 100 ? undefined : zoom }
          : preference,
      ),
    );
    flashSaved();
  }

  return (
    <div
      ref={layoutRootRef}
      data-card-layout-root
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
          layoutWidth={layoutWidth}
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
          onManageSavedViews={() => {
            setOrganizerOpen(false);
            setSavedViewsOpen(true);
          }}
          onOpenChange={setOrganizerOpen}
          onColorChange={setCardColor}
          onChartTypeChange={setCardChartType}
          onHeightChange={resizeCardHeight}
          onResize={resizeCard}
          onRestoreDefault={restoreDefaultOrder}
          onTitleChange={setCardTitle}
          onToggleVisibility={toggleCardVisibility}
          onZoomChange={setCardZoom}
          open={organizerOpen}
          overId={organizerOverId}
          preferences={preferences}
          saved={saved}
          editActions={editActions}
        />
      )}

      {canEditLayout ? (
        <WidgetViewPresetsDialog
          cardIds={cardIds}
          companyId={companyId}
          currentScope={currentViewScope}
          menuKey={menuKey}
          onApplySourcePreset={onApplySavedViewSource}
          onOpenChange={setSavedViewsOpen}
          open={savedViewsOpen}
          preferences={preferences}
          presetNamespace={resolvedPresetNamespace}
          scopes={viewScopes}
          sourceMenuKeys={savedViewSourceMenus}
          userId={user?.id}
        />
      ) : null}

      <div
        data-card-layout-grid
        className={cn(
          "grid min-w-0 grid-flow-row auto-rows-[74px] grid-cols-[minmax(0,1fr)]",
          monitorMode ? "gap-x-3 gap-y-4" : "gap-4",
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
            layoutWidth={layoutWidth}
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
  layoutWidth,
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
  layoutWidth: number;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  overId: string | null;
  preference?: CardPreference;
  reorderEnabled: boolean;
}) {
  const requestedWidthLevel = resolveRequestedCardWidthLevel(card, preference);
  const requestedHeightLevel = resolveRequestedCardHeightLevel(
    card,
    preference,
    requestedWidthLevel,
  );
  const dimensions = resolveCardDimensions(
    card,
    requestedWidthLevel,
    requestedHeightLevel,
    layoutWidth,
  );
  const chartTypes = supportedChartTypes(card);

  return (
    <div
      data-layout-card-id={card.id}
      data-layout-reorder-enabled={reorderEnabled ? "true" : undefined}
      data-layout-card-height={cardLayoutLevelToCardHeight(
        dimensions.heightLevel,
      )}
      data-layout-card-height-level={dimensions.heightLevel}
      data-layout-card-min-height-level={resolveMinimumHeightLevel(
        card,
        dimensions.widthLevel,
        layoutWidth,
      )}
      data-layout-card-max-height-level={resolveMaximumHeightLevel(card)}
      data-layout-card-size={cardLayoutLevelToCardSize(dimensions.widthLevel)}
      data-layout-card-width-level={dimensions.widthLevel}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={cardLayoutItemStyle(
        card,
        dimensions.widthLevel,
        requestedHeightLevel,
      )}
      className={cn(
        "group relative h-full min-h-0 min-w-0 transition",
        card.className,
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
          className="absolute left-1/2 top-0 z-30 flex h-6 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-md border bg-card/95 text-muted-foreground shadow-sm transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing"
          aria-grabbed={draggingId === card.id}
          aria-label={`Mover ${card.label ?? card.id}`}
          title="Arrastar para mover"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <WidgetAppearanceProvider
        chartType={resolveCardChartType(preference?.chartType, chartTypes)}
        color={preference?.color}
        title={preference?.title}
        zoom={preference?.zoom}
      >
        {card.node}
      </WidgetAppearanceProvider>
    </div>
  );
}

function WidgetOrganizerDialog({
  cards,
  draggingId,
  editActions,
  layoutWidth,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onMoveDown,
  onMoveUp,
  onManageSavedViews,
  onOpenChange,
  onColorChange,
  onChartTypeChange,
  onHeightChange,
  onResize,
  onRestoreDefault,
  onTitleChange,
  onToggleVisibility,
  onZoomChange,
  open,
  overId,
  preferences,
  saved,
}: {
  cards: LayoutCard[];
  draggingId: string | null;
  editActions?: React.ReactNode;
  layoutWidth: number;
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>, cardId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLElement>, cardId: string) => void;
  onDrop: (event: React.DragEvent<HTMLElement>, cardId: string) => void;
  onMoveDown: (cardId: string, index: number) => void;
  onMoveUp: (cardId: string, index: number) => void;
  onManageSavedViews: () => void;
  onOpenChange: (open: boolean) => void;
  onColorChange: (cardId: string, color?: string) => void;
  onChartTypeChange: (cardId: string, chartType: CardChartType) => void;
  onHeightChange: (cardId: string, height: CardLayoutLevel) => void;
  onResize: (cardId: string, size: CardLayoutLevel) => void;
  onRestoreDefault: () => void;
  onTitleChange: (cardId: string, title?: string) => void;
  onToggleVisibility: (cardId: string) => void;
  onZoomChange: (cardId: string, zoom: CardZoom) => void;
  open: boolean;
  overId: string | null;
  preferences: CardPreference[];
  saved: boolean;
}) {
  const activeCards = cards.filter(
    (card) => getPreference(preferences, card.id)?.visible !== false,
  );
  const hiddenCards = cards.filter(
    (card) => getPreference(preferences, card.id)?.visible === false,
  );
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (!open) return;
    const selectedExists = cards.some((card) => card.id === selectedCardId);
    if (selectedExists) return;
    setSelectedCardId(activeCards[0]?.id ?? hiddenCards[0]?.id ?? null);
  }, [activeCards, cards, hiddenCards, open, selectedCardId]);

  const selectedCard =
    cards.find((card) => card.id === selectedCardId) ??
    activeCards[0] ??
    hiddenCards[0];
  const selectedPreference = selectedCard
    ? getPreference(preferences, selectedCard.id)
    : undefined;
  const selectedVisible = selectedPreference?.visible !== false;
  const selectedWidthLevel = selectedCard
    ? resolveRequestedCardWidthLevel(selectedCard, selectedPreference)
    : 1;
  const selectedRequestedHeightLevel = selectedCard
    ? resolveRequestedCardHeightLevel(
        selectedCard,
        selectedPreference,
        selectedWidthLevel,
      )
    : 1;
  const selectedDimensions = selectedCard
    ? resolveCardDimensions(
        selectedCard,
        selectedWidthLevel,
        selectedRequestedHeightLevel,
        layoutWidth,
      )
    : null;
  const selectedActiveIndex = selectedCard
    ? activeCards.findIndex((card) => card.id === selectedCard.id)
    : -1;
  const previewItems = activeCards.map((card) => {
    const preference = getPreference(preferences, card.id);
    const widthLevel = resolveRequestedCardWidthLevel(card, preference);
    const heightLevel = resolveRequestedCardHeightLevel(
      card,
      preference,
      widthLevel,
    );
    const dimensions = resolveCardDimensions(
      card,
      widthLevel,
      heightLevel,
      layoutWidth,
    );

    return {
      columnSpan: dimensions.columnSpan,
      dragging: draggingId === card.id,
      id: card.id,
      label: preference?.title ?? card.label ?? card.id,
      over: overId === card.id && draggingId !== card.id,
      rowSpan: dimensions.rowSpan,
      selected: selectedCard?.id === card.id,
    };
  });
  const previewColumnCount =
    previewItems.length && selectedCard
      ? resolveCardDimensions(
          selectedCard,
          selectedWidthLevel,
          selectedRequestedHeightLevel,
          layoutWidth,
        ).columnCount
      : resolveCardLayoutDimensions({
          containerWidth: layoutWidth,
          heightLevel: 1,
          widthLevel: 1,
        }).columnCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[94vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-6xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <DialogHeader className="min-w-0">
            <DialogTitle>Configurar widgets</DialogTitle>
            <DialogDescription>
              Organize o Bento real da tela e ajuste cada widget com precisão.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:shrink-0 lg:pr-8">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onManageSavedViews}
            >
              <LayoutTemplate className="h-4 w-4" />
              Visões salvas
            </Button>
            {editActions ? (
              <div onClickCapture={() => onOpenChange(false)}>
                {editActions}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid min-h-0 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <WidgetBentoPreview
              columnCount={previewColumnCount}
              hiddenCount={hiddenCards.length}
              items={previewItems}
              layoutLabel={layoutPreviewLabel(layoutWidth)}
              onSelect={setSelectedCardId}
              onDragStart={(event, cardId) => {
                setSelectedCardId(cardId);
                onDragStart(event, cardId);
              }}
              onDragOver={(event, cardId) => onDragOver(event, cardId)}
              onDragLeave={() => onDragLeave()}
              onDrop={(event, cardId) => onDrop(event, cardId)}
              onDragEnd={() => onDragEnd()}
            />

            <details
              className="rounded-lg border bg-muted/10"
              data-hidden-widget-section
              open={hiddenCards.length > 0}
            >
              <summary className="cursor-pointer list-none px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Widgets ocultos</span>
                  <Badge variant="secondary">{hiddenCards.length}</Badge>
                </span>
              </summary>
              <div className="space-y-2 border-t p-2">
                {hiddenCards.length ? (
                  hiddenCards.map((card) => {
                    const preference = getPreference(preferences, card.id);
                    const widthLevel = resolveRequestedCardWidthLevel(
                      card,
                      preference,
                    );
                    const heightLevel = resolveRequestedCardHeightLevel(
                      card,
                      preference,
                      widthLevel,
                    );
                    return (
                      <div
                        key={card.id}
                        className={cn(
                          "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-dashed bg-card p-2",
                          selectedCard?.id === card.id &&
                            "border-primary ring-1 ring-primary/30",
                        )}
                        data-hidden-widget-id={card.id}
                      >
                        <button
                          type="button"
                          className="min-w-0 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setSelectedCardId(card.id)}
                          aria-pressed={selectedCard?.id === card.id}
                        >
                          <span className="block truncate text-sm font-medium">
                            {preference?.title ?? card.label ?? card.id}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {widthLevelLabel(widthLevel)} · {heightLevelLabel(heightLevel)}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => {
                            setSelectedCardId(card.id);
                            onToggleVisibility(card.id);
                          }}
                          aria-label={`Exibir ${preference?.title ?? card.label ?? card.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Exibir
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    Todos os widgets estão ativos.
                  </p>
                )}
              </div>
            </details>
          </div>

          <aside
            className="min-h-0 overflow-y-auto rounded-lg border bg-card p-3"
            data-widget-inspector
          >
            {selectedCard && selectedDimensions ? (
              <div className="space-y-4" data-widget-config-id={selectedCard.id}>
                <div className="min-w-0 border-b pb-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                        {selectedPreference?.title ??
                          selectedCard.label ??
                          selectedCard.id}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant={selectedVisible ? "outline" : "secondary"}>
                          {selectedVisible ? "Ativo" : "Oculto"}
                        </Badge>
                        <Badge variant="outline">
                          {widthLevelLabel(selectedDimensions.widthLevel)} · {heightLevelLabel(selectedDimensions.heightLevel)}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={selectedVisible ? "outline" : "secondary"}
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => onToggleVisibility(selectedCard.id)}
                      aria-label={`${selectedVisible ? "Ocultar" : "Exibir"} ${selectedPreference?.title ?? selectedCard.label ?? selectedCard.id}`}
                      title={selectedVisible ? "Ocultar widget" : "Exibir widget"}
                    >
                      {selectedVisible ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  {selectedVisible ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="mr-auto text-xs text-muted-foreground">
                        Ordem {formatPosition(selectedActiveIndex)} de {activeCards.length}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={selectedActiveIndex <= 0}
                        onClick={() =>
                          onMoveUp(selectedCard.id, selectedActiveIndex)
                        }
                        aria-label={`Mover ${selectedPreference?.title ?? selectedCard.label ?? selectedCard.id} para cima`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={
                          selectedActiveIndex < 0 ||
                          selectedActiveIndex === activeCards.length - 1
                        }
                        onClick={() =>
                          onMoveDown(selectedCard.id, selectedActiveIndex)
                        }
                        aria-label={`Mover ${selectedPreference?.title ?? selectedCard.label ?? selectedCard.id} para baixo`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {selectedCard.titleEditable ? (
                  <WidgetTitleEditor
                    cardId={selectedCard.id}
                    defaultTitle={selectedCard.label ?? selectedCard.id}
                    onChange={onTitleChange}
                    title={selectedPreference?.title}
                  />
                ) : null}

                <WidgetDimensionControls
                  card={selectedCard}
                  dimensions={selectedDimensions}
                  layoutWidth={layoutWidth}
                  onHeightChange={onHeightChange}
                  onWidthChange={onResize}
                />

                <div className="flex min-w-0 flex-wrap items-center gap-2 border-t pt-3">
                  {supportedChartTypes(selectedCard).length ? (
                    <WidgetChartTypePicker
                      cardId={selectedCard.id}
                      chartType={resolveCardChartType(
                        selectedPreference?.chartType,
                        supportedChartTypes(selectedCard),
                      )}
                      chartTypes={supportedChartTypes(selectedCard)}
                      onChange={onChartTypeChange}
                    />
                  ) : null}
                  {selectedCard.zoomEnabled ? (
                    <WidgetZoomPicker
                      cardId={selectedCard.id}
                      onChange={onZoomChange}
                      zoom={selectedPreference?.zoom ?? 100}
                    />
                  ) : null}
                  {selectedCard.colorEditable !== false ? (
                    <WidgetColorPicker
                      cardId={selectedCard.id}
                      color={selectedPreference?.color}
                      gradient={selectedCard.colorPreview === "gradient"}
                      onChange={onColorChange}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
                Não há widgets disponíveis para configurar.
              </div>
            )}
          </aside>
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

const CARD_WIDTH_LEVEL_OPTIONS: ReadonlyArray<{
  label: string;
  level: CardLayoutLevel;
  percent: number;
}> = [
  { label: "Compacta", level: 1, percent: 25 },
  { label: "Pequena", level: 2, percent: 33 },
  { label: "Larga", level: 3, percent: 50 },
  { label: "Expandida", level: 4, percent: 67 },
  { label: "Ampla", level: 5, percent: 75 },
  { label: "Total", level: 6, percent: 100 },
];

const CARD_HEIGHT_LEVEL_OPTIONS: ReadonlyArray<{
  label: string;
  level: CardLayoutLevel;
  pixels: number;
}> = CARD_LAYOUT_LEVELS.map((level) => ({
  label: [
    "Baixa",
    "Média-baixa",
    "Padrão",
    "Média-alta",
    "Alta",
    "Extra alta",
  ][level - 1],
  level,
  pixels: resolveCardLayoutHeightPixels(level),
}));

function WidgetDimensionControls({
  card,
  dimensions,
  layoutWidth,
  onHeightChange,
  onWidthChange,
}: {
  card: LayoutCard;
  dimensions: ReturnType<typeof resolveCardLayoutDimensions>;
  layoutWidth: number;
  onHeightChange: (cardId: string, level: CardLayoutLevel) => void;
  onWidthChange: (cardId: string, level: CardLayoutLevel) => void;
}) {
  return (
    <div className="space-y-4 border-t pt-3" data-widget-dimension-controls>
      <fieldset className="min-w-0 space-y-2">
        <legend className="flex w-full items-center justify-between gap-3 text-xs font-medium">
          <span>Largura</span>
          <span className="font-normal text-muted-foreground">
            {widthLevelContextLabel(
              dimensions.widthLevel,
              dimensions.widthRatio,
            )}
          </span>
        </legend>
        <div className="grid grid-cols-6 gap-1 rounded-md border bg-muted/20 p-1">
          {CARD_WIDTH_LEVEL_OPTIONS.map((option) => {
            const candidate = resolveCardDimensions(
              card,
              option.level,
              dimensions.heightLevel,
              layoutWidth,
            );
            const disabled = candidate.widthLevel !== option.level;
            const actualPercent = Math.round(candidate.widthRatio * 100);
            return (
              <DimensionLevelButton
                key={option.level}
                active={dimensions.widthLevel === option.level}
                axis="width"
                disabled={disabled}
                label={`${option.label} · ${option.percent}% no desktop${
                  actualPercent === option.percent
                    ? ""
                    : ` · ${actualPercent}% nesta tela`
                }${
                  disabled ? " · indisponível para este widget" : ""
                }`}
                level={option.level}
                onClick={() => onWidthChange(card.id, option.level)}
                ratio={option.percent}
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-2">
        <legend className="flex w-full items-center justify-between gap-3 text-xs font-medium">
          <span>Altura</span>
          <span className="font-normal text-muted-foreground">
            {heightLevelLabel(dimensions.heightLevel)}
          </span>
        </legend>
        <div className="grid grid-cols-6 gap-1 rounded-md border bg-muted/20 p-1">
          {CARD_HEIGHT_LEVEL_OPTIONS.map((option) => {
            const candidate = resolveCardDimensions(
              card,
              dimensions.widthLevel,
              option.level,
              layoutWidth,
            );
            const disabled = candidate.heightLevel !== option.level;
            return (
              <DimensionLevelButton
                key={option.level}
                active={dimensions.heightLevel === option.level}
                axis="height"
                disabled={disabled}
                label={`${option.label} · ${option.pixels}px${
                  disabled ? " · indisponível para este widget" : ""
                }`}
                level={option.level}
                onClick={() => onHeightChange(card.id, option.level)}
                ratio={Math.round((option.pixels / 704) * 100)}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function DimensionLevelButton({
  active,
  axis,
  disabled,
  label,
  level,
  onClick,
  ratio,
}: {
  active: boolean;
  axis: "height" | "width";
  disabled: boolean;
  label: string;
  level: CardLayoutLevel;
  onClick: () => void;
  ratio: number;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-sm text-[9px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
        disabled && "cursor-not-allowed opacity-35",
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <span
        className="relative flex h-5 w-7 items-center justify-center rounded-sm border border-current/35"
        aria-hidden="true"
      >
        <span
          className="rounded-[1px] bg-current"
          style={
            axis === "width"
              ? { height: "0.3rem", width: `${Math.max(18, ratio)}%` }
              : { height: `${Math.max(18, ratio)}%`, width: "0.45rem" }
          }
        />
      </span>
      <span aria-hidden="true">{level}</span>
    </button>
  );
}

function WidgetTitleEditor({
  cardId,
  defaultTitle,
  onChange,
  title,
}: {
  cardId: string;
  defaultTitle: string;
  onChange: (cardId: string, title?: string) => void;
  title?: string;
}) {
  const [value, setValue] = React.useState(title ?? defaultTitle);

  React.useEffect(() => {
    setValue(title ?? defaultTitle);
  }, [defaultTitle, title]);

  function commit() {
    const normalized = value.trim().slice(0, 120);
    if (!normalized || normalized === defaultTitle) {
      setValue(defaultTitle);
      if (title) onChange(cardId, undefined);
      return;
    }
    setValue(normalized);
    if (normalized !== title) onChange(cardId, normalized);
  }

  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-1.5">
      <Input
        aria-label={`Título de ${defaultTitle}`}
        className="h-8 min-w-0"
        maxLength={120}
        onBlur={commit}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setValue(title ?? defaultTitle);
            event.currentTarget.blur();
          }
        }}
        placeholder={defaultTitle}
        value={value}
      />
      {title ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            setValue(defaultTitle);
            onChange(cardId, undefined);
          }}
          aria-label="Restaurar título padrão"
          title="Restaurar título padrão"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function WidgetZoomPicker({
  cardId,
  onChange,
  zoom,
}: {
  cardId: string;
  onChange: (cardId: string, zoom: CardZoom) => void;
  zoom: CardZoom;
}) {
  const currentIndex = CARD_ZOOM_LEVELS.indexOf(zoom);
  const canZoomOut = currentIndex > 0;
  const canZoomIn = currentIndex < CARD_ZOOM_LEVELS.length - 1;

  return (
    <div
      className="inline-flex h-8 items-center rounded-md border bg-background p-0.5"
      aria-label={`Zoom do gráfico: ${zoom}%`}
      role="group"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!canZoomOut}
        onClick={() => {
          if (canZoomOut) {
            onChange(cardId, CARD_ZOOM_LEVELS[currentIndex - 1]);
          }
        }}
        aria-label="Diminuir zoom do gráfico"
        title="Diminuir zoom"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <span
        className="w-10 text-center text-[11px] font-medium tabular-nums text-muted-foreground"
        aria-hidden="true"
      >
        {zoom}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!canZoomIn}
        onClick={() => {
          if (canZoomIn) {
            onChange(cardId, CARD_ZOOM_LEVELS[currentIndex + 1]);
          }
        }}
        aria-label="Aumentar zoom do gráfico"
        title="Aumentar zoom"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function WidgetChartTypePicker({
  cardId,
  chartType,
  chartTypes,
  onChange,
}: {
  cardId: string;
  chartType: CardChartType;
  chartTypes: readonly CardChartType[];
  onChange: (cardId: string, chartType: CardChartType) => void;
}) {
  return (
    <div
      className="inline-flex h-8 items-center rounded-md border bg-background p-0.5"
      aria-label="Tipo de gráfico"
      role="group"
    >
      {chartTypes.map((type) => {
        const option = WIDGET_CHART_TYPE_OPTIONS[type];
        const Icon = option.icon;

        return (
          <button
            key={type}
            type="button"
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              chartType === type &&
                "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground",
            )}
            onClick={() => onChange(cardId, type)}
            aria-label={option.ariaLabel}
            aria-pressed={chartType === type}
            title={option.label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

const WIDGET_CHART_TYPE_OPTIONS = {
  bar: {
    ariaLabel: "Exibir como barras",
    icon: BarChart3,
    label: "Barras",
  },
  line: {
    ariaLabel: "Exibir como linha",
    icon: ChartSpline,
    label: "Linha",
  },
  rose: {
    ariaLabel: "Exibir como gráfico de rosa",
    icon: ChartPie,
    label: "Rosa",
  },
  treemap: {
    ariaLabel: "Exibir como retângulos",
    icon: LayoutGrid,
    label: "Retângulos",
  },
} satisfies Record<
  CardChartType,
  {
    ariaLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
>;

function WidgetColorPicker({
  cardId,
  color,
  gradient = false,
  onChange,
}: {
  cardId: string;
  color?: string;
  gradient?: boolean;
  onChange: (cardId: string, color?: string) => void;
}) {
  return (
    <div
      className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-1.5"
      aria-label={gradient ? "Gradiente do mapa de calor" : "Cor do widget"}
      role="group"
    >
      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
      {PASTEL_BAR_COLORS.slice(0, 4).map((swatch) => (
        <button
          key={swatch}
          type="button"
          className={cn(
            "h-4 w-4 rounded-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            color === swatch && "ring-2 ring-primary ring-offset-1",
          )}
          style={widgetColorPreviewStyle(swatch, gradient)}
          onClick={() => onChange(cardId, swatch)}
          aria-label={`${gradient ? "Usar gradiente" : "Usar cor"} ${swatch}`}
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
            gradient,
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
          className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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

const CARTESIAN_CHART_TYPES = ["bar", "line"] as const;

function supportedChartTypes(card: LayoutCard): readonly CardChartType[] {
  if (card.chartTypes?.length) return card.chartTypes;
  return card.chartTypeEnabled ? CARTESIAN_CHART_TYPES : [];
}

function resolveCardChartType(
  chartType: CardChartType | undefined,
  supportedTypes: readonly CardChartType[],
): CardChartType {
  if (chartType && supportedTypes.includes(chartType)) return chartType;
  return supportedTypes[0] ?? "bar";
}

function resolveRequestedCardWidthLevel(
  card: LayoutCard,
  preference: CardPreference | undefined,
) {
  const requested =
    preference?.widthLevel ??
    (preference?.size
      ? cardSizeToLayoutLevel(preference.size)
      : card.defaultSize
        ? cardSizeToLayoutLevel(card.defaultSize)
        : 1);
  return clampCardLayoutLevel(
    requested,
    card.minWidthLevel ?? 1,
    card.maxWidthLevel ?? 6,
  );
}

function resolveRequestedCardHeightLevel(
  card: LayoutCard,
  preference: CardPreference | undefined,
  widthLevel: CardLayoutLevel,
) {
  return (
    preference?.heightLevel ??
    (preference?.height
      ? cardHeightToLayoutLevel(preference.height)
      : card.defaultHeight
        ? cardHeightToLayoutLevel(card.defaultHeight)
        : widthLevel <= 2
          ? 1
          : 3)
  );
}

function inferredMinimumHeightLevel(card: LayoutCard): CardLayoutLevel {
  if (card.minHeightLevel) return card.minHeightLevel;
  if (card.minHeight) return cardHeightToLayoutLevel(card.minHeight);
  const isComplexWidget =
    supportedChartTypes(card).length > 0 ||
    (card.defaultSize !== undefined && card.defaultSize !== "compact") ||
    card.className?.includes("col-span");
  return isComplexWidget ? 3 : 1;
}

function resolveMaximumHeightLevel(card: LayoutCard): CardLayoutLevel {
  return (
    card.maxHeightLevel ??
    (card.maxHeight ? cardHeightToLayoutLevel(card.maxHeight) : 6)
  );
}

function cardDimensionConstraints(card: LayoutCard) {
  return {
    maxHeightLevel: resolveMaximumHeightLevel(card),
    maxWidthLevel: card.maxWidthLevel ?? 6,
    minHeightByWidthLevel: card.minHeightByWidthLevel,
    minHeightLevel: inferredMinimumHeightLevel(card),
    minWidthLevel: card.minWidthLevel ?? 1,
    narrowMinHeightLevel: card.narrowMinHeightLevel,
  };
}

function resolveCardDimensions(
  card: LayoutCard,
  widthLevel: CardLayoutLevel,
  heightLevel: CardLayoutLevel,
  layoutWidth: number,
) {
  return resolveCardLayoutDimensions({
    constraints: cardDimensionConstraints(card),
    containerWidth: layoutWidth,
    heightLevel,
    rowSpanOverrides: card.rowSpanOverrides,
    widthLevel,
  });
}

function resolveCardPreferenceDimensions(
  card: LayoutCard,
  widthLevel: CardLayoutLevel,
  heightLevel: CardLayoutLevel,
) {
  return resolveCardLayoutDimensions({
    constraints: cardDimensionConstraints(card),
    heightLevel,
    rowSpanOverrides: card.rowSpanOverrides,
    tier: "desktop",
    widthLevel,
  });
}

function resolveMinimumHeightLevel(
  card: LayoutCard,
  widthLevel: CardLayoutLevel,
  layoutWidth: number,
) {
  return resolveCardDimensions(card, widthLevel, 1, layoutWidth).heightLevel;
}

type CardLayoutItemStyle = React.CSSProperties & {
  "--widget-column-span-desktop": number;
  "--widget-column-span-single": number;
  "--widget-column-span-three": number;
  "--widget-column-span-two": number;
  "--widget-row-span-multi": number;
  "--widget-row-span-single": number;
};

function cardLayoutItemStyle(
  card: LayoutCard,
  widthLevel: CardLayoutLevel,
  heightLevel: CardLayoutLevel,
): CardLayoutItemStyle {
  const dimensionsForTier = (
    tier: "single" | "two-column" | "three-column" | "desktop",
  ) =>
    resolveCardLayoutDimensions({
      constraints: cardDimensionConstraints(card),
      heightLevel,
      rowSpanOverrides: card.rowSpanOverrides,
      tier,
      widthLevel,
    });
  const single = dimensionsForTier("single");
  const two = dimensionsForTier("two-column");
  const three = dimensionsForTier("three-column");
  const desktop = dimensionsForTier("desktop");

  return {
    "--widget-column-span-desktop": desktop.columnSpan,
    "--widget-column-span-single": single.columnSpan,
    "--widget-column-span-three": three.columnSpan,
    "--widget-column-span-two": two.columnSpan,
    "--widget-row-span-multi": two.rowSpan,
    "--widget-row-span-single": single.rowSpan,
  };
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

function widthLevelLabel(level: CardLayoutLevel) {
  const option = CARD_WIDTH_LEVEL_OPTIONS[level - 1];
  return `${option.label} · ${option.percent}%`;
}

function widthLevelContextLabel(level: CardLayoutLevel, widthRatio: number) {
  const option = CARD_WIDTH_LEVEL_OPTIONS[level - 1];
  const actualPercent = Math.round(widthRatio * 100);
  return actualPercent === option.percent
    ? widthLevelLabel(level)
    : `${option.label} · ${actualPercent}% nesta tela`;
}

function heightLevelLabel(level: CardLayoutLevel) {
  const option = CARD_HEIGHT_LEVEL_OPTIONS[level - 1];
  return `${option.label} · ${option.pixels}px`;
}

function layoutPreviewLabel(layoutWidth: number) {
  if (layoutWidth < 640) return "Celular · 1 coluna";
  if (layoutWidth < 960) return "Tablet · 2 faixas";
  if (layoutWidth < 1_200) return "Intermediário · 3 faixas";
  return "Desktop · 4 faixas";
}

function formatPosition(index: number) {
  return new Intl.NumberFormat("pt-BR").format(index + 1);
}
