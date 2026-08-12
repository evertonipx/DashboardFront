export const PROVISIONED_RESOURCE_REFRESH_INTERVAL_MS = 15_000;
export const RESOURCE_METADATA_REFRESH_INTERVAL_MS = 30_000;

export function shouldAutoRefreshResources({
  enabled,
  visibilityState,
}: {
  enabled: boolean;
  visibilityState?: string;
}) {
  return enabled && visibilityState === "visible";
}
