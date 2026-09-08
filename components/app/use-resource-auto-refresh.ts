"use client";

import * as React from "react";

import {
  RESOURCE_METADATA_REFRESH_INTERVAL_MS,
  shouldRefreshResourcesNow,
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
    // Screens already load their catalog on mount. A focus/visibility event
    // immediately afterward must not repeat that initial request.
    let lastAttemptAt = Date.now();
    const refreshInterval = Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : RESOURCE_METADATA_REFRESH_INTERVAL_MS;
    async function refreshWhenVisible() {
      if (
        !active ||
        refreshRunningRef.current ||
        !shouldRefreshResourcesNow({
          enabled,
          intervalMs: refreshInterval,
          lastAttemptAt,
          now: Date.now(),
          online: navigator.onLine,
          visibilityState: document.visibilityState,
        })
      ) {
        return;
      }

      lastAttemptAt = Date.now();
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
    }, refreshInterval);
    const handleFocus = () => void refreshWhenVisible();
    const handleVisibilityChange = () => void refreshWhenVisible();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [enabled, intervalMs]);
}
