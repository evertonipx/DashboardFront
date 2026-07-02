import { getScopedStorageKey } from "@/lib/master-company-scope";

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
): LiveDashboardSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const stored = window.localStorage.getItem(
      getLiveDashboardSettingsKey(companyId),
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
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getLiveDashboardSettingsKey(companyId),
    JSON.stringify(settings),
  );
}

function getLiveDashboardSettingsKey(companyId?: string | null) {
  return getScopedStorageKey(LIVE_DASHBOARD_SETTINGS_KEY, companyId);
}

function isIntradayComparisonMode(
  value: unknown,
): value is IntradayComparisonMode {
  return value === "yesterday" || value === "last_week";
}
