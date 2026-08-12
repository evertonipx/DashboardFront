"use client";

import * as React from "react";

import {
  RESOURCE_METADATA_REFRESH_INTERVAL_MS,
  shouldAutoRefreshResources,
} from "@/lib/resource-auto-refresh";

export function useResourceAutoRefresh(
  refresh: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs = RESOURCE_METADATA_REFRESH_INTERVAL_MS,
  }: {
    enabled?: boolean;
    intervalMs?: number;
  } = {},
) {
  const refreshRef = React.useRef(refresh);
  const refreshRunningRef = React.useRef(false);

  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  React.useEffect(() => {
    if (!enabled) return;

    let active = true;
    async function refreshWhenVisible() {
      if (
        !active ||
        refreshRunningRef.current ||
        !shouldAutoRefreshResources({
          enabled,
          visibilityState: document.visibilityState,
        })
      ) {
        return;
      }

      refreshRunningRef.current = true;
      try {
        await refreshRef.current();
      } catch {
        // Background refreshes preserve the last valid resource catalog.
      } finally {
        refreshRunningRef.current = false;
      }
    }

    const interval = window.setInterval(() => {
      void refreshWhenVisible();
    }, intervalMs);
    const handleFocus = () => void refreshWhenVisible();
    const handleVisibilityChange = () => void refreshWhenVisible();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [enabled, intervalMs]);
}
