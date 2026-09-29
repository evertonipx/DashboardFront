import type { OccupancyAlertRow } from "./types";

export const OCCUPANCY_ALERT_NOTIFICATION_WINDOW_MS = 5 * 60_000;
export const MAX_OCCUPANCY_ALERT_NOTIFICATION_IDS_PER_SCOPE = 256;
export const MAX_OCCUPANCY_ALERT_NOTIFICATION_SCOPES = 32;

/**
 * Reconciles an already validated, successful alert response for one live scope.
 * The first response establishes a silent baseline. Later responses return only
 * unseen alerts triggered within the recent notification window.
 *
 * The map and its sets are updated in place. Both scopes and IDs are bounded by
 * insertion order, refreshed when observed again, so active alerts stay tracked.
 */
export function reconcileOccupancyAlertNotifications(
  seenByScope: Map<string, Set<number>>,
  scopeKey: string,
  rows: readonly OccupancyAlertRow[],
  nowMs: number,
): OccupancyAlertRow[] {
  const isBaseline = !seenByScope.has(scopeKey);
  const seenIds = seenByScope.get(scopeKey) ?? new Set<number>();
  const newAlerts: OccupancyAlertRow[] = [];

  for (const row of rows) {
    const unseen = !seenIds.has(row.id);
    if (
      !isBaseline &&
      unseen &&
      isRecentOccupancyAlert(row.triggered_at, nowMs)
    ) {
      newAlerts.push(row);
    }

    // Refresh the retention order even for old alerts, which must never toast.
    seenIds.delete(row.id);
    seenIds.add(row.id);
    if (seenIds.size > MAX_OCCUPANCY_ALERT_NOTIFICATION_IDS_PER_SCOPE) {
      seenIds.delete(seenIds.values().next().value!);
    }
  }

  // Refresh the scope's retention order, including an empty initial response.
  seenByScope.delete(scopeKey);
  seenByScope.set(scopeKey, seenIds);
  if (seenByScope.size > MAX_OCCUPANCY_ALERT_NOTIFICATION_SCOPES) {
    seenByScope.delete(seenByScope.keys().next().value!);
  }

  return newAlerts;
}

function isRecentOccupancyAlert(
  triggeredAt: string | undefined,
  nowMs: number,
): boolean {
  if (typeof triggeredAt !== "string" || !Number.isFinite(nowMs)) {
    return false;
  }
  const triggeredAtMs = Date.parse(triggeredAt);
  const ageMs = nowMs - triggeredAtMs;
  return Number.isFinite(ageMs) &&
    ageMs >= 0 &&
    ageMs <= OCCUPANCY_ALERT_NOTIFICATION_WINDOW_MS;
}
