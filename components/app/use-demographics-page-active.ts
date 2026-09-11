"use client";

import { useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    document.removeEventListener("visibilitychange", notify);
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

function activeSnapshot() {
  return document.visibilityState === "visible" && navigator.onLine !== false;
}

/** No timer or request: background/offline screens cannot start data work. */
export function useDemographicsPageActive() {
  return useSyncExternalStore(subscribe, activeSnapshot, () => false);
}
