import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export type LiveDashboardSettings = {
  showPreviousPeriod: boolean;
  intradayComparison: IntradayComparisonMode;
};

export type IntradayComparisonMode = "yesterday" | "last_week";

const LIVE_DASHBOARD_SETTINGS_KEY = "ipxdata.live-dashboard-settings.v1";

const defaultSettings: LiveDashboardSettings = {
  intradayComparison: "yesterday",
  showPreviousPeriod: true,
};

export function loadLiveDashboardSettings(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
): LiveDashboardSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const stored = window.localStorage.getItem(
      getLiveDashboardSettingsKey(companyId, scope),
    );
    if (!stored) return defaultSettings;

    const parsed = JSON.parse(stored) as Partial<LiveDashboardSettings>;
    return {
      intradayComparison: isIntradayComparisonMode(parsed.intradayComparison)
        ? parsed.intradayComparison
        : defaultSettings.intradayComparison,
      showPreviousPeriod:
        typeof parsed.showPreviousPeriod === "boolean"
          ? parsed.showPreviousPeriod
          : defaultSettings.showPreviousPeriod,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveLiveDashboardSettings(
  settings: LiveDashboardSettings,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getLiveDashboardSettingsKey(companyId, scope),
    JSON.stringify(settings),
  );
}

function getLiveDashboardSettingsKey(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return getUserViewScopedStorageKey(
    LIVE_DASHBOARD_SETTINGS_KEY,
    companyId,
    scope.userId,
    scope.viewId,
  );
}

function isIntradayComparisonMode(
  value: unknown,
): value is IntradayComparisonMode {
  return value === "yesterday" || value === "last_week";
}
