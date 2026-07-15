"use client";

import * as React from "react";

import { apiFetch } from "@/lib/api";
import {
  CARD_VIEW_UPDATED_EVENT,
  getCardViewStorageKey,
  loadScopedCardPreferences,
  saveCardPreferences,
  type CardMenuKey,
  type CardPreference,
  type CardViewUpdatedDetail,
} from "@/lib/view-preferences";

type CardViewResponse = {
  menuKey: CardMenuKey;
  found?: boolean;
  preferences: CardPreference[];
};

type CardPreferenceScope = {
  syncServer?: boolean;
  userId?: string | null;
  viewId?: string | null;
};

export function useCardPreferences(
  menuKey: CardMenuKey,
  cardIds: string[] = [],
  companyId?: string | null,
  scope: CardPreferenceScope = {},
) {
  const { syncServer = true, userId, viewId } = scope;
  const cardIdsKey = cardIds.join("|");
  const normalizedCardIds = React.useMemo(
    () => (cardIdsKey ? cardIdsKey.split("|") : []),
    [cardIdsKey],
  );
  const [preferences, setPreferences] = React.useState<CardPreference[]>(() =>
    loadScopedCardPreferences(
      menuKey,
      normalizedCardIds,
      companyId,
      userId,
      viewId,
    ),
  );

  React.useEffect(() => {
    let cancelled = false;

    setPreferences(
      loadScopedCardPreferences(
        menuKey,
        normalizedCardIds,
        companyId,
        userId,
        viewId,
      ),
    );

    const serverRequest = syncServer
      ? apiFetch<CardViewResponse>(`/dashboard-views/${menuKey}`)
      .then((response) => {
        if (cancelled) return;
        if (!response.found && !response.preferences.length) return;

        saveCardPreferences(
          menuKey,
          response.preferences,
          normalizedCardIds,
          companyId,
          userId,
          viewId,
        );
        setPreferences(
          loadScopedCardPreferences(
            menuKey,
            normalizedCardIds,
            companyId,
            userId,
            viewId,
          ),
        );
      })
      .catch(() => undefined)
      : Promise.resolve();

    function syncFromStorage(event: StorageEvent) {
      const scopedStorageKey = getCardViewStorageKey(
        companyId,
        userId,
        viewId,
      );
      if (event.key && event.key !== scopedStorageKey) {
        return;
      }

      setPreferences(
        loadScopedCardPreferences(
          menuKey,
          normalizedCardIds,
          companyId,
          userId,
          viewId,
        ),
      );
    }

    function syncFromCustomEvent(event: Event) {
      const detail = (event as CustomEvent<CardViewUpdatedDetail>).detail;
      if (detail?.menuKey && detail.menuKey !== menuKey) return;
      if (detail && (detail.companyId ?? null) !== (companyId ?? null)) return;
      if (detail && (detail.userId ?? null) !== (userId ?? null)) return;
      if (detail && (detail.viewId ?? null) !== (viewId ?? null)) return;
      setPreferences(
        loadScopedCardPreferences(
          menuKey,
          normalizedCardIds,
          companyId,
          userId,
          viewId,
        ),
      );
    }

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(CARD_VIEW_UPDATED_EVENT, syncFromCustomEvent);

    return () => {
      cancelled = true;
      void serverRequest;
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(CARD_VIEW_UPDATED_EVENT, syncFromCustomEvent);
    };
  }, [
    companyId,
    menuKey,
    normalizedCardIds,
    syncServer,
    userId,
    viewId,
  ]);

  return preferences;
}
