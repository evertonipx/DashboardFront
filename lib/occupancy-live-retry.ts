/** Failed resources have their own clock; a failure never makes data fresh. */
export type OccupancyLiveRetryState = {
  failures: number;
  retryAt: number;
};

const INITIAL_RETRY_MS = 15_000;
const MAX_RETRY_MS = 5 * 60_000;

export function occupancyLiveRetryReady(
  state: OccupancyLiveRetryState | undefined,
  now: number,
  force = false,
) {
  return force || !state || now >= state.retryAt;
}

export function nextOccupancyLiveRetry(
  previous: OccupancyLiveRetryState | undefined,
  succeeded: boolean,
  now: number,
): OccupancyLiveRetryState | undefined {
  if (succeeded) return undefined;
  const failures = Math.min((previous?.failures ?? 0) + 1, 10);
  return {
    failures,
    retryAt: now + Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** (failures - 1)),
  };
}
