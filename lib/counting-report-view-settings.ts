import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export type CountingReportViewSettings = {
  includeOpenPeriod: boolean;
  rankingOrder: "asc" | "desc";
  rankingScenarioIds: string[];
  rankingSelectionMode: "all" | "custom";
};

export type ViewPreferenceScope = {
  userId?: string | null;
  viewId?: string | null;
};

const STORAGE_KEY = "ipxdata.counting-report-view-settings.v1";

const defaultSettings: CountingReportViewSettings = {
  includeOpenPeriod: true,
  rankingOrder: "desc",
  rankingScenarioIds: [],
  rankingSelectionMode: "all",
};

export function loadCountingReportViewSettings(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
): CountingReportViewSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const stored = window.localStorage.getItem(
      getCountingReportViewSettingsKey(companyId, scope),
    );
    if (!stored) return defaultSettings;

    const parsed = JSON.parse(stored) as Partial<CountingReportViewSettings>;
    return normalizeCountingReportViewSettings(parsed);
  } catch {
    return defaultSettings;
  }
}

export function saveCountingReportViewSettings(
  settings: CountingReportViewSettings,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  const normalized = normalizeCountingReportViewSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      getCountingReportViewSettingsKey(companyId, scope),
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

function normalizeCountingReportViewSettings(
  settings: Partial<CountingReportViewSettings>,
): CountingReportViewSettings {
  return {
    includeOpenPeriod:
      typeof settings.includeOpenPeriod === "boolean"
        ? settings.includeOpenPeriod
        : defaultSettings.includeOpenPeriod,
    rankingOrder: settings.rankingOrder === "asc" ? "asc" : "desc",
    rankingScenarioIds: Array.isArray(settings.rankingScenarioIds)
      ? Array.from(
          new Set(
            settings.rankingScenarioIds.filter(
              (id): id is string => typeof id === "string" && Boolean(id.trim()),
            ),
          ),
        )
      : [],
    rankingSelectionMode:
      settings.rankingSelectionMode === "custom"
        ? "custom"
        : defaultSettings.rankingSelectionMode,
  };
}

function getCountingReportViewSettingsKey(
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
