"use client";

import { getStoredSession } from "@/lib/api";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import { requestUserGridSync } from "@/lib/user-grid";
import {
  loadSavedScopedCardPreferences,
  saveCardPreferences,
  type CardPreference,
} from "@/lib/view-preferences";
import {
  loadWidgetViewPresets,
  saveWidgetViewPresets,
  type WidgetViewPreset,
} from "@/lib/widget-view-presets";

type LegacyDashboardViewResponse = {
  company_id?: string;
  found?: boolean;
  preferences?: CardPreference[];
};

const LEGACY_DEFAULT_PRESET_ID = "legacy-live-default-v1";
const LEGACY_MIGRATION_KEY =
  "ipxdata.legacy-dashboard-default-migration.v1.live";

const legacyLiveCardAliases: Record<string, string> = {
  live_today_total: "live_intraday_comparison",
};

export async function migrateLegacyLiveDefault({
  companyId,
  userId,
}: {
  companyId: string;
  userId: string;
}) {
  if (typeof window === "undefined" || !companyId || !userId) return false;

  const migrationKey = getUserViewScopedStorageKey(
    LEGACY_MIGRATION_KEY,
    companyId,
    userId,
  );
  if (window.localStorage.getItem(migrationKey)) return false;

  const currentPresets = loadWidgetViewPresets("live", companyId, userId);
  if (currentPresets.some((preset) => preset.isDefault)) {
    markMigrationComplete(migrationKey, "existing-default");
    requestUserGridSync();
    return false;
  }

  const legacyView = await fetchLegacyLiveView();
  const responseCompanyId = legacyView?.company_id?.trim() ?? "";
  if (
    !legacyView?.found ||
    !responseCompanyId ||
    responseCompanyId !== companyId ||
    !Array.isArray(legacyView.preferences) ||
    !legacyView.preferences.length
  ) {
    return false;
  }

  const preferences = migrateLegacyPreferences(legacyView.preferences);
  const cardIds = preferences.map((preference) => preference.id);
  if (
    !loadSavedScopedCardPreferences(
      "live",
      cardIds,
      responseCompanyId,
    )
  ) {
    saveCardPreferences(
      "live",
      preferences,
      cardIds,
      responseCompanyId,
    );
  }

  const now = new Date().toISOString();
  const existingMigrationPreset = currentPresets.find(
    (preset) => preset.id === LEGACY_DEFAULT_PRESET_ID,
  );
  const defaultPreset: WidgetViewPreset = {
    createdAt: existingMigrationPreset?.createdAt ?? now,
    id: LEGACY_DEFAULT_PRESET_ID,
    isDefault: true,
    name: "Padrão Ao Vivo",
    snapshot: {
      cardIds,
      capturedAt: now,
      menuKey: "live",
      preferences,
      sourceScope: null,
      storage: [],
      version: 1,
    },
    updatedAt: now,
  };
  saveWidgetViewPresets(
    "live",
    existingMigrationPreset
      ? currentPresets.map((preset) =>
          preset.id === LEGACY_DEFAULT_PRESET_ID ? defaultPreset : preset,
        )
      : [...currentPresets, defaultPreset],
    responseCompanyId,
    userId,
  );
  markMigrationComplete(migrationKey, "imported");
  requestUserGridSync();
  return true;
}

async function fetchLegacyLiveView() {
  const session = getStoredSession();
  if (!session?.access_token) return null;

  const response = await fetch("/api/v1/dashboard-views/live", {
    cache: "no-store",
    headers: {
      Authorization: `${session.token_type || "Bearer"} ${session.access_token}`,
    },
  }).catch(() => null);
  if (!response?.ok) return null;

  return (await response.json().catch(() => null)) as
    | LegacyDashboardViewResponse
    | null;
}

function migrateLegacyPreferences(preferences: CardPreference[]) {
  const migrated = new Map<string, CardPreference>();

  preferences.forEach((preference) => {
    const id = legacyLiveCardAliases[preference.id] ?? preference.id;
    migrated.set(id, { ...preference, id });
  });

  return Array.from(migrated.values());
}

function markMigrationComplete(key: string, result: string) {
  window.localStorage.setItem(
    key,
    JSON.stringify({ migratedAt: new Date().toISOString(), result }),
  );
}
