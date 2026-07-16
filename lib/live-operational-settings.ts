import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export type LiveOperationalSettings = {
  heatmapScenarioIds: string[];
  heatmapSelectionMode: "all" | "custom";
  intradayComparison: "yesterday" | "last_week";
  monthComparison: "previous_month" | "last_year";
  rankingScenarioIds: string[];
  rankingSelectionMode: "all" | "custom";
};

const STORAGE_KEY = "ipxdata.live-operational-settings.v1";

const defaultSettings: LiveOperationalSettings = {
  heatmapScenarioIds: [],
  heatmapSelectionMode: "all",
  intradayComparison: "yesterday",
  monthComparison: "previous_month",
  rankingScenarioIds: [],
  rankingSelectionMode: "all",
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
    heatmapScenarioIds: normalizeIds(settings.heatmapScenarioIds),
    heatmapSelectionMode:
      settings.heatmapSelectionMode === "custom" ? "custom" : "all",
    intradayComparison:
      settings.intradayComparison === "last_week"
        ? "last_week"
        : "yesterday",
    monthComparison:
      settings.monthComparison === "last_year"
        ? "last_year"
        : "previous_month",
    rankingScenarioIds: normalizeIds(settings.rankingScenarioIds),
    rankingSelectionMode:
      settings.rankingSelectionMode === "custom" ? "custom" : "all",
  };
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (id): id is string => typeof id === "string" && Boolean(id.trim()),
          ),
        ),
      )
    : [];
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
