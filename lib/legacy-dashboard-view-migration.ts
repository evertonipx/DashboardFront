"use client";

import { apiFetch } from "@/lib/api";
import {
  getStoredCurrentCompanyScope,
  getStoredMasterCompanyScope,
  getUserViewScopedStorageKey,
} from "@/lib/master-company-scope";
import { requestUserGridSync } from "@/lib/user-grid";
import { writeUserGridPreference } from "@/lib/user-grid-local";
import {
  loadSavedScopedCardPreferences,
  saveCardPreferences,
  type CardMenuKey,
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

type LegacyDashboardMigrationDefinition = {
  aliases?: Record<string, string>;
  menuKey: CardMenuKey;
  presetName: string;
};

const LEGACY_MIGRATION_KEY =
  "ipxdata.legacy-dashboard-default-migration.v2";

const LEGACY_DASHBOARD_MIGRATIONS: LegacyDashboardMigrationDefinition[] = [
  {
    aliases: { live_today_total: "live_intraday_comparison" },
    menuKey: "live",
    presetName: "Padrão Ao Vivo",
  },
  { menuKey: "analysis", presetName: "Padrão Análises" },
  { menuKey: "reports", presetName: "Padrão Relatórios" },
  { menuKey: "occupancy", presetName: "Padrão Ocupação" },
];

export async function migrateLegacyLiveDefault({
  companyId,
  expectedAccessToken,
  shouldApply = () => true,
  userId,
}: {
  companyId: string;
  expectedAccessToken?: string;
  shouldApply?: () => boolean;
  userId: string;
}) {
  return migrateLegacyDashboardDefault(
    LEGACY_DASHBOARD_MIGRATIONS[0],
    { companyId, expectedAccessToken, shouldApply, userId },
  );
}

export async function migrateLegacyDashboardDefaults({
  companyId,
  expectedAccessToken,
  shouldApply = () => true,
  userId,
}: {
  companyId: string;
  expectedAccessToken?: string;
  shouldApply?: () => boolean;
  userId: string;
}) {
  let imported = false;
  for (const definition of LEGACY_DASHBOARD_MIGRATIONS) {
    if (!shouldApply()) return imported;
    imported =
      (await migrateLegacyDashboardDefault(definition, {
        companyId,
        expectedAccessToken,
        shouldApply,
        userId,
      })) || imported;
  }
  return imported;
}

async function migrateLegacyDashboardDefault(
  definition: LegacyDashboardMigrationDefinition,
  {
    companyId,
    expectedAccessToken,
    shouldApply,
    userId,
  }: {
    companyId: string;
    expectedAccessToken?: string;
    shouldApply: () => boolean;
    userId: string;
  },
) {
  const requestedCompanyId = companyId.trim();
  const requestedUserId = userId.trim();
  if (
    typeof window === "undefined" ||
    !requestedCompanyId ||
    !requestedUserId ||
    !shouldApply()
  ) {
    return false;
  }

  const initialStoredCompanyId = currentStoredCompanyScopeId();
  if (initialStoredCompanyId && initialStoredCompanyId !== requestedCompanyId) {
    return false;
  }

  const migrationKey = getUserViewScopedStorageKey(
    LEGACY_MIGRATION_KEY,
    requestedCompanyId,
    requestedUserId,
    definition.menuKey,
  );
  if (window.localStorage.getItem(migrationKey)) return false;

  const currentPresets = loadWidgetViewPresets(
    definition.menuKey,
    requestedCompanyId,
    requestedUserId,
  );
  const currentDefault = currentPresets.find((preset) => preset.isDefault);
  if (currentDefault) {
    const { cardIds, preferences } = currentDefault.snapshot;
    const repaired = Boolean(
      preferences.length &&
      !loadSavedScopedCardPreferences(
        definition.menuKey,
        cardIds,
        requestedCompanyId,
        requestedUserId,
      ),
    );
    if (repaired) {
      saveCardPreferences(
        definition.menuKey,
        preferences,
        cardIds,
        requestedCompanyId,
        requestedUserId,
      );
    }
    markMigrationComplete(
      migrationKey,
      repaired ? "repaired-personal-scope" : "existing-default",
    );
    requestUserGridSync();
    return repaired;
  }

  const legacyView = await fetchLegacyDashboardView(
    definition.menuKey,
    requestedCompanyId,
    expectedAccessToken,
  );
  if (
    !shouldApply() ||
    currentStoredCompanyScopeId() !== initialStoredCompanyId
  ) {
    return false;
  }

  if (!legacyView) return false;

  const responseCompanyId = legacyView.company_id?.trim() ?? "";
  if (
    !responseCompanyId ||
    responseCompanyId !== requestedCompanyId
  ) {
    return false;
  }
  if (
    !legacyView.found ||
    !Array.isArray(legacyView.preferences) ||
    !legacyView.preferences.length
  ) {
    markMigrationComplete(migrationKey, "not-found");
    return false;
  }

  const preferences = migrateLegacyPreferences(
    legacyView.preferences,
    definition.aliases,
  );
  const cardIds = preferences.map((preference) => preference.id);
  if (
    !loadSavedScopedCardPreferences(
      definition.menuKey,
      cardIds,
      responseCompanyId,
      requestedUserId,
    )
  ) {
    saveCardPreferences(
      definition.menuKey,
      preferences,
      cardIds,
      responseCompanyId,
      requestedUserId,
    );
  }

  const presetId = `legacy-${definition.menuKey}-default-v2`;
  const now = new Date().toISOString();
  const existingMigrationPreset = currentPresets.find(
    (preset) => preset.id === presetId,
  );
  const defaultPreset: WidgetViewPreset = {
    createdAt: existingMigrationPreset?.createdAt ?? now,
    id: presetId,
    isDefault: true,
    name: definition.presetName,
    snapshot: {
      cardIds,
      capturedAt: now,
      menuKey: definition.menuKey,
      preferences,
      sourceScope: null,
      storage: [],
      version: 1,
    },
    updatedAt: now,
  };
  saveWidgetViewPresets(
    definition.menuKey,
    existingMigrationPreset
      ? currentPresets.map((preset) =>
          preset.id === presetId ? defaultPreset : preset,
        )
      : [...currentPresets, defaultPreset],
    responseCompanyId,
    requestedUserId,
  );
  markMigrationComplete(migrationKey, "imported");
  requestUserGridSync();
  return true;
}

async function fetchLegacyDashboardView(
  menuKey: CardMenuKey,
  companyScopeId: string,
  expectedAccessToken?: string,
) {
  return apiFetch<LegacyDashboardViewResponse>(
    `/dashboard-views/${menuKey}`,
    { companyScopeId, expectedAccessToken },
  ).catch(() => null);
}

function currentStoredCompanyScopeId() {
  return (
    getStoredMasterCompanyScope()?.id.trim() ||
    getStoredCurrentCompanyScope()?.id.trim() ||
    ""
  );
}

function migrateLegacyPreferences(
  preferences: CardPreference[],
  aliases: Record<string, string> = {},
) {
  const migrated = new Map<string, CardPreference>();

  preferences.forEach((preference) => {
    const id = aliases[preference.id] ?? preference.id;
    migrated.set(id, { ...preference, id });
  });

  return Array.from(migrated.values());
}

function markMigrationComplete(key: string, result: string) {
  writeUserGridPreference(
    key,
    JSON.stringify({ migratedAt: new Date().toISOString(), result }),
  );
}
