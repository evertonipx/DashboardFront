const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * Duration charts are built from fully closed minute buckets. Their aggregate
 * source cannot acquire a new bucket during the minute, so unlike the raw
 * camera snapshot it must not poll every five seconds.
 */
export const OCCUPANCY_DURATION_MINUTE_REFRESH_GRACE_MS = SECOND_MS;
export const OCCUPANCY_DURATION_RECONCILIATION_MINUTES = 5;

export type OccupancyDurationCacheWindow = {
  from: number;
  lastFullRefreshAt: number;
  to: number;
};

export type OccupancyDurationCacheRefreshPlan = {
  cacheMatchesDay: boolean;
  cacheMatchesRange: boolean;
  needsFullRefresh: boolean;
  reconciliationFrom: number;
};

/** Align every duration consumer to the same post-boundary pulse. */
export function occupancyDurationNextMinuteRefreshDelay(
  now = Date.now(),
  graceMs = OCCUPANCY_DURATION_MINUTE_REFRESH_GRACE_MS,
) {
  if (!Number.isFinite(now) || !Number.isFinite(graceMs) || graceMs < 0) {
    throw new RangeError("O instante de atualização da duração é inválido.");
  }
  const nextBoundary =
    Math.floor(now / MINUTE_MS) * MINUTE_MS + MINUTE_MS + graceMs;
  return Math.max(250, Math.round(nextBoundary - now));
}

/**
 * Both live duration surfaces reread the same rolling five-minute closed
 * edge. If a tab missed one or more pulses, the range expands just enough to
 * cover that gap. Keeping this identity canonical lets the shared transport
 * collapse normal pulses to one GET per scenario and minute.
 */
export function occupancyDurationReconciliationFrom(
  rangeFrom: number,
  rangeTo: number,
  previousTo = rangeTo,
  minutes = OCCUPANCY_DURATION_RECONCILIATION_MINUTES,
) {
  if (
    !Number.isFinite(rangeFrom) ||
    !Number.isFinite(rangeTo) ||
    !Number.isFinite(previousTo) ||
    rangeFrom > rangeTo ||
    previousTo < rangeFrom ||
    previousTo > rangeTo ||
    !Number.isSafeInteger(minutes) ||
    minutes < 1
  ) {
    throw new RangeError("A janela de reconciliação da duração é inválida.");
  }
  return Math.max(
    rangeFrom,
    Math.min(previousTo, rangeTo - minutes * MINUTE_MS),
  );
}

/**
 * Chooses between a complete audit and the small rolling edge shared by live
 * duration and explicit report exports. A cache from another civil day, a
 * clock rollback, or an expired audit is never reconciled incrementally.
 */
export function planOccupancyDurationCacheRefresh({
  cached,
  fullRefreshMs,
  rangeFrom,
  rangeTo,
  requestedAt,
}: {
  cached?: OccupancyDurationCacheWindow | null;
  fullRefreshMs: number;
  rangeFrom: number;
  rangeTo: number;
  requestedAt: number;
}): OccupancyDurationCacheRefreshPlan {
  if (
    !Number.isFinite(rangeFrom) ||
    !Number.isFinite(rangeTo) ||
    rangeFrom > rangeTo ||
    !Number.isFinite(requestedAt) ||
    !Number.isFinite(fullRefreshMs) ||
    fullRefreshMs <= 0
  ) {
    throw new RangeError("A janela de atualização da duração é inválida.");
  }

  const cacheIsFinite = Boolean(
    cached &&
      Number.isFinite(cached.from) &&
      Number.isFinite(cached.to) &&
      Number.isFinite(cached.lastFullRefreshAt),
  );
  const cacheMatchesDay = Boolean(
    cacheIsFinite &&
      cached!.from === rangeFrom &&
      cached!.to >= rangeFrom &&
      cached!.to <= rangeTo,
  );
  const needsFullRefresh =
    !cacheMatchesDay ||
    requestedAt < cached!.lastFullRefreshAt ||
    requestedAt - cached!.lastFullRefreshAt >= fullRefreshMs;

  return {
    cacheMatchesDay,
    cacheMatchesRange: cacheMatchesDay && cached!.to === rangeTo,
    needsFullRefresh,
    reconciliationFrom: needsFullRefresh
      ? rangeFrom
      : occupancyDurationReconciliationFrom(
          rangeFrom,
          rangeTo,
          cached!.to,
        ),
  };
}

/** Cache an exact closed-edge response through the next aligned pulse. */
export function occupancyDurationMinuteTransportTtl(now = Date.now()) {
  return occupancyDurationNextMinuteRefreshDelay(now);
}
