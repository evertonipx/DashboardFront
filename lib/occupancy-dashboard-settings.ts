"use client";

import {
  getScopedStorageKey,
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";

export type OccupancyMetricVisibility = {
  average: boolean;
  minimum: boolean;
  peak: boolean;
};

export type OccupancyDashboardSettings = {
  metricVisibility: OccupancyMetricVisibility;
  schemaVersion: 2;
};

export const OCCUPANCY_DASHBOARD_SETTINGS_KEY =
  "ipxdata.occupancy-dashboard-settings.v1";
export const OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT =
  "ipxdata:occupancy-dashboard-settings-updated";

const LEGACY_METRIC_VISIBILITY_KEY =
  "ipxdata.occupancy.metric-visibility.v1";

export const DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS: OccupancyDashboardSettings = {
  metricVisibility: {
    average: true,
    minimum: true,
    peak: true,
  },
  schemaVersion: 2,
};

export function normalizeOccupancyDashboardSettings(
  value: unknown,
): OccupancyDashboardSettings {
  const record = isRecord(value) ? value : {};
  return {
    metricVisibility: normalizeMetricVisibility(record.metricVisibility),
    schemaVersion: 2,
  };
}

export function loadOccupancyDashboardSettings(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") {
    return cloneDefaultSettings();
  }
  try {
    const stored = readUserViewScopedStorageEntry(
      OCCUPANCY_DASHBOARD_SETTINGS_KEY,
      companyId,
      userId,
      viewId,
    );
    if (stored) {
      if (!stored.value) return cloneDefaultSettings();
      return normalizeOccupancyDashboardSettings(
        JSON.parse(stored.value) as unknown,
      );
    }

    const legacy = window.localStorage.getItem(
      getScopedStorageKey(LEGACY_METRIC_VISIBILITY_KEY, companyId),
    );
    return legacy
      ? {
          ...cloneDefaultSettings(),
          metricVisibility: normalizeMetricVisibility(
            JSON.parse(legacy) as unknown,
          ),
        }
      : cloneDefaultSettings();
  } catch {
    return cloneDefaultSettings();
  }
}

export function saveOccupancyDashboardSettings(
  settings: OccupancyDashboardSettings,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const normalized = normalizeOccupancyDashboardSettings(settings);
  if (typeof window === "undefined") return normalized;

  window.localStorage.setItem(
    occupancyDashboardSettingsStorageKey(companyId, userId, viewId),
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent(OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT, {
      detail: { companyId, userId, viewId },
    }),
  );
  return normalized;
}

export function occupancyDashboardSettingsStorageKey(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  return getUserViewScopedStorageKey(
    OCCUPANCY_DASHBOARD_SETTINGS_KEY,
    companyId,
    userId,
    viewId,
  );
}

function normalizeMetricVisibility(value: unknown): OccupancyMetricVisibility {
  const record = isRecord(value) ? value : {};
  return {
    average:
      typeof record.average === "boolean" ? record.average : true,
    minimum:
      typeof record.minimum === "boolean" ? record.minimum : true,
    peak: typeof record.peak === "boolean" ? record.peak : true,
  };
}

function cloneDefaultSettings(): OccupancyDashboardSettings {
  return {
    ...DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS,
    metricVisibility: {
      ...DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
