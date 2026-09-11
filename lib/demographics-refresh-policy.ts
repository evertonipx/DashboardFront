const MINUTE_MS = 60_000;
const MAX_RETRY_MS = 5 * MINUTE_MS;

export type DemographicRetryState = { failures: number; retryAt: number };

export function nextDemographicRetry(previous: DemographicRetryState | null, now: number): DemographicRetryState {
  const failures = Math.min(10, (previous?.failures ?? 0) + 1);
  return { failures, retryAt: now + Math.min(MAX_RETRY_MS, MINUTE_MS * 2 ** (failures - 1)) };
}

/** One wake-up per closed minute, allowing a short ingestion grace period. */
export function demographicRefreshDelay(now: number, retryAt = 0) {
  const nextMinute = (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS + 2_000;
  return Math.max(1, Math.max(nextMinute, retryAt) - now);
}

export function shouldAdvanceDemographicClock({ now, previous, busy, retryAt = 0 }: {
  now: number; previous: number; busy: boolean; retryAt?: number;
}) {
  return !busy && now >= retryAt && Math.floor(now / MINUTE_MS) > Math.floor(previous / MINUTE_MS);
}
