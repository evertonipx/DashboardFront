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

export function useCardPreferences(
  menuKey: CardMenuKey,
  cardIds: string[] = [],
  companyId?: string | null,
) {
  const cardIdsKey = cardIds.join("|");
  const normalizedCardIds = React.useMemo(
    () => (cardIdsKey ? cardIdsKey.split("|") : []),
    [cardIdsKey],
  );
  const [preferences, setPreferences] = React.useState<CardPreference[]>(() =>
    loadScopedCardPreferences(menuKey, normalizedCardIds, companyId),
  );

  React.useEffect(() => {
    let cancelled = false;

    setPreferences(loadScopedCardPreferences(menuKey, normalizedCardIds, companyId));

    apiFetch<CardViewResponse>(`/dashboard-views/${menuKey}`)
      .then((response) => {
        if (cancelled) return;
        if (!response.found && !response.preferences.length) return;

        saveCardPreferences(
          menuKey,
          response.preferences,
          normalizedCardIds,
          companyId,
        );
        setPreferences(
          loadScopedCardPreferences(menuKey, normalizedCardIds, companyId),
        );
      })
      .catch(() => undefined);

    function syncFromStorage(event: StorageEvent) {
      const scopedStorageKey = getCardViewStorageKey(companyId);
      if (event.key && event.key !== scopedStorageKey) {
        return;
      }

      setPreferences(loadScopedCardPreferences(menuKey, normalizedCardIds, companyId));
    }

    function syncFromCustomEvent(event: Event) {
      const detail = (event as CustomEvent<CardViewUpdatedDetail>).detail;
      if (detail?.menuKey && detail.menuKey !== menuKey) return;
      if (detail && (detail.companyId ?? null) !== (companyId ?? null)) return;
      setPreferences(loadScopedCardPreferences(menuKey, normalizedCardIds, companyId));
    }

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(CARD_VIEW_UPDATED_EVENT, syncFromCustomEvent);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(CARD_VIEW_UPDATED_EVENT, syncFromCustomEvent);
    };
  }, [menuKey, normalizedCardIds, companyId]);

  return preferences;
}
