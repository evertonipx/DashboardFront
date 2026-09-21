"use client";

import * as React from "react";

import {
  getUserViewScopedStorageReadKeys,
} from "@/lib/master-company-scope";
import {
  DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
  loadOccupancyWidgetSettings,
  OCCUPANCY_WIDGET_SETTINGS_KEY,
  OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
  OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
  saveOccupancyWidgetSettings,
  type OccupancyWidgetSettings,
} from "@/lib/occupancy-widget-settings";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";

type OccupancyWidgetSettingsScope = {
  companyScopeId?: string | null;
  userId?: string | null;
  viewId?: string | null;
};

type OccupancyWidgetSettingsUpdate =
  | Partial<OccupancyWidgetSettings>
  | ((current: OccupancyWidgetSettings) => Partial<OccupancyWidgetSettings>);

type SettingsState = {
  scopeKey: string;
  settings: OccupancyWidgetSettings;
};

type SettingsUpdatedDetail = {
  companyId?: string | null;
  userId?: string | null;
  viewId?: string | null;
};

type UserGridHydratedDetail = {
  userId?: string | null;
};

/**
 * Synchronizes the visual settings of Occupancy without owning operational
 * data. In particular, changing a palette cannot start or refresh a dashboard
 * query; the hook only reads the browser cache and writes through user-grid.
 */
export function useOccupancyWidgetSettings({
  companyScopeId,
  userId,
  viewId,
}: OccupancyWidgetSettingsScope) {
  const normalizedCompanyId = companyScopeId?.trim() || null;
  const normalizedUserId = userId?.trim() || null;
  const normalizedViewId = viewId?.trim() || null;
  const scopeKey = JSON.stringify([
    normalizedCompanyId,
    normalizedUserId,
    normalizedViewId,
  ]);
  const storageKeys = React.useMemo(
    () =>
      new Set(
        getUserViewScopedStorageReadKeys(
          OCCUPANCY_WIDGET_SETTINGS_KEY,
          normalizedCompanyId,
          normalizedUserId,
          normalizedViewId,
        ),
      ),
    [normalizedCompanyId, normalizedUserId, normalizedViewId],
  );
  const [state, setState] = React.useState<SettingsState>({
    scopeKey: "",
    settings: DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
  });
  const ready = state.scopeKey === scopeKey;
  const settings = ready
    ? state.settings
    : DEFAULT_OCCUPANCY_WIDGET_SETTINGS;

  const synchronize = React.useCallback(() => {
    setState({
      scopeKey,
      settings: loadOccupancyWidgetSettings(
        normalizedCompanyId,
        normalizedUserId,
        normalizedViewId,
      ),
    });
  }, [normalizedCompanyId, normalizedUserId, normalizedViewId, scopeKey]);

  React.useEffect(() => {
    function synchronizeFromStorage(event: StorageEvent) {
      if (event.key && !storageKeys.has(event.key)) return;
      synchronize();
    }

    function synchronizeFromSettingsEvent(event: Event) {
      const detail = (event as CustomEvent<SettingsUpdatedDetail>).detail;
      if (
        detail?.companyId != null &&
        detail.companyId !== normalizedCompanyId
      ) {
        return;
      }
      if (detail?.userId != null && detail.userId !== normalizedUserId) return;
      if (detail?.viewId != null && detail.viewId !== normalizedViewId) return;
      synchronize();
    }

    function synchronizeFromUserGrid(event: Event) {
      const detail = (event as CustomEvent<UserGridHydratedDetail>).detail;
      if (detail?.userId != null && detail.userId !== normalizedUserId) return;
      synchronize();
    }

    synchronize();
    window.addEventListener("storage", synchronizeFromStorage);
    window.addEventListener(
      OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
      synchronizeFromSettingsEvent,
    );
    window.addEventListener(
      USER_GRID_HYDRATED_EVENT,
      synchronizeFromUserGrid,
    );

    return () => {
      window.removeEventListener("storage", synchronizeFromStorage);
      window.removeEventListener(
        OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
        synchronizeFromSettingsEvent,
      );
      window.removeEventListener(
        USER_GRID_HYDRATED_EVENT,
        synchronizeFromUserGrid,
      );
    };
  }, [
    normalizedCompanyId,
    normalizedUserId,
    normalizedViewId,
    storageKeys,
    synchronize,
  ]);

  const updateSettings = React.useCallback(
    (update: OccupancyWidgetSettingsUpdate) => {
      const current =
        state.scopeKey === scopeKey
          ? state.settings
          : loadOccupancyWidgetSettings(
              normalizedCompanyId,
              normalizedUserId,
              normalizedViewId,
            );
      const patch = typeof update === "function" ? update(current) : update;

      try {
        const next = saveOccupancyWidgetSettings(
          {
            ...current,
            ...patch,
            schemaVersion: OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
          },
          normalizedCompanyId,
          normalizedUserId,
          normalizedViewId,
        );
        setState({ scopeKey, settings: next });
        return true;
      } catch {
        return false;
      }
    },
    [
      normalizedCompanyId,
      normalizedUserId,
      normalizedViewId,
      scopeKey,
      state,
    ],
  );

  return React.useMemo(
    () => ({ ready, settings, updateSettings }),
    [ready, settings, updateSettings],
  );
}
