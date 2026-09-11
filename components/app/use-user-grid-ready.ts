"use client";

import * as React from "react";

import {
  getUserGridReadiness,
  USER_GRID_HYDRATED_EVENT,
  USER_GRID_READINESS_EVENT,
  USER_GRID_SYNC_STATUS_EVENT,
  type UserGridReadiness,
} from "@/lib/user-grid";

function subscribeToUserGridReadiness(onChange: () => void) {
  window.addEventListener(USER_GRID_HYDRATED_EVENT, onChange);
  window.addEventListener(USER_GRID_READINESS_EVENT, onChange);
  window.addEventListener(USER_GRID_SYNC_STATUS_EVENT, onChange);
  return () => {
    window.removeEventListener(USER_GRID_HYDRATED_EVENT, onChange);
    window.removeEventListener(USER_GRID_READINESS_EVENT, onChange);
    window.removeEventListener(USER_GRID_SYNC_STATUS_EVENT, onChange);
  };
}

function getServerReadiness(): UserGridReadiness {
  return "pending";
}

export function useUserGridReady(userId?: string | null): UserGridReadiness {
  const getSnapshot = React.useCallback(
    () => getUserGridReadiness(userId),
    [userId],
  );
  return React.useSyncExternalStore(
    subscribeToUserGridReadiness,
    getSnapshot,
    getServerReadiness,
  );
}
