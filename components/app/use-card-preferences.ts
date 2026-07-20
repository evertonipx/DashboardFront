"use client";

import * as React from "react";

import {
  CARD_VIEW_UPDATED_EVENT,
  getCardViewStorageKey,
  loadScopedCardPreferences,
  type CardMenuKey,
  type CardPreference,
  type CardViewUpdatedDetail,
} from "@/lib/view-preferences";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";

type CardPreferenceScope = {
  userId?: string | null;
  viewId?: string | null;
};

export function useCardPreferences(
  menuKey: CardMenuKey,
  cardIds: string[] = [],
  companyId?: string | null,
  scope: CardPreferenceScope = {},
) {
  const { userId, viewId } = scope;
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
    setPreferences(
      loadScopedCardPreferences(
        menuKey,
        normalizedCardIds,
        companyId,
        userId,
        viewId,
      ),
    );

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
    window.addEventListener(USER_GRID_HYDRATED_EVENT, syncFromCustomEvent);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(CARD_VIEW_UPDATED_EVENT, syncFromCustomEvent);
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, syncFromCustomEvent);
    };
  }, [
    companyId,
    menuKey,
    normalizedCardIds,
    userId,
    viewId,
  ]);

  return preferences;
}
