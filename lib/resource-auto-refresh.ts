export const PROVISIONED_RESOURCE_REFRESH_INTERVAL_MS = 15_000;
export const RESOURCE_METADATA_REFRESH_INTERVAL_MS = 30_000;

export function shouldAutoRefreshResources({
  enabled,
  online = true,
  visibilityState,
}: {
  enabled: boolean;
  online?: boolean;
  visibilityState?: string;
}) {
  return enabled && online && visibilityState === "visible";
}

/** Focus, visibility and timer events share the same freshness window. */
export function shouldRefreshResourcesNow({
  enabled,
  intervalMs,
  lastAttemptAt,
  now,
  online,
  visibilityState,
}: {
  enabled: boolean;
  intervalMs: number;
  lastAttemptAt: number | null;
  now: number;
  online?: boolean;
  visibilityState?: string;
}) {
  if (!shouldAutoRefreshResources({ enabled, online, visibilityState })) return false;
  if (!Number.isFinite(now)) return false;
  const minimumInterval = Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : RESOURCE_METADATA_REFRESH_INTERVAL_MS;
  return lastAttemptAt === null || !Number.isFinite(lastAttemptAt) ||
    now < lastAttemptAt || now - lastAttemptAt >= minimumInterval;
}
