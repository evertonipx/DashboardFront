import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export type LiveOperationalSettings = {
  intradayComparison: "yesterday" | "last_week";
  monthComparison: "previous_month" | "last_year";
};

const STORAGE_KEY = "ipxdata.live-operational-settings.v1";

const defaultSettings: LiveOperationalSettings = {
  intradayComparison: "yesterday",
  monthComparison: "previous_month",
};

export function loadLiveOperationalSettings(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
): LiveOperationalSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const stored = window.localStorage.getItem(storageKey(companyId, scope));
    if (!stored) return defaultSettings;
    const normalized = normalizeSettings(
      JSON.parse(stored) as Partial<LiveOperationalSettings>,
    );
    window.localStorage.setItem(
      storageKey(companyId, scope),
      JSON.stringify(normalized),
    );
    return normalized;
  } catch {
    return defaultSettings;
  }
}

export function saveLiveOperationalSettings(
  settings: LiveOperationalSettings,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  const normalized = normalizeSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      storageKey(companyId, scope),
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

function normalizeSettings(
  settings: Partial<LiveOperationalSettings>,
): LiveOperationalSettings {
  return {
    intradayComparison:
      settings.intradayComparison === "last_week"
        ? "last_week"
        : "yesterday",
    monthComparison:
      settings.monthComparison === "last_year"
        ? "last_year"
        : "previous_month",
  };
}

function storageKey(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return getUserViewScopedStorageKey(
    STORAGE_KEY,
    companyId,
    scope.userId,
    scope.viewId,
  );
}
