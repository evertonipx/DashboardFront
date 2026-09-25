import type { OccupancyMetricVisibility } from "@/lib/occupancy-dashboard-settings";
import type { CardPreference } from "@/lib/view-preferences";

const OCCUPANCY_LIVE_SNAPSHOT_WINDOW_MS = 10 * 60_000;
const OCCUPANCY_LIVE_SNAPSHOT_CLOCK_SKEW_MS = 2 * 60_000;

export const OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID =
  "__occupancy_current_snapshot__";
export const OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS = 5_000;

/**
 * Every consumer of the tenant-wide current snapshot uses the same five-second
 * transport window. This lets the page-wide query broker coalesce the focused
 * card and comparison widgets into one GET instead of issuing equivalent
 * requests a few milliseconds apart.
 */
export function occupancyLiveSnapshotQuery({
  now,
  refreshMs = 5_000,
}: {
  now: Date;
  refreshMs?: number;
}) {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) {
    throw new TypeError("O instante da fotografia de ocupação é inválido.");
  }
  if (!Number.isSafeInteger(refreshMs) || refreshMs < 1) {
    throw new RangeError("A frequência da fotografia de ocupação é inválida.");
  }
  const requestedAt = new Date(Math.floor(instant / refreshMs) * refreshMs);
  const from = new Date(
    requestedAt.getTime() - OCCUPANCY_LIVE_SNAPSHOT_WINDOW_MS,
  );
  const to = new Date(
    requestedAt.getTime() + OCCUPANCY_LIVE_SNAPSHOT_CLOCK_SKEW_MS,
  );
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return {
    from,
    path: `/occupancy?${params.toString()}`,
    requestedAt,
    to,
  };
}

export function mergeOccupancyCardDemand(
  currentIds: string[],
  changes: ReadonlyMap<string, boolean>,
) {
  const next = new Set(currentIds);
  changes.forEach((demanded, id) => {
    if (demanded) next.add(id);
    else next.delete(id);
  });

  if (
    next.size === currentIds.length &&
    currentIds.every((id) => next.has(id))
  ) {
    return currentIds;
  }
  return Array.from(next).sort();
}

export function buildOccupancyCardDemandKey({
  eagerCardIds = [],
  materializedCardIds,
  preferences,
}: {
  eagerCardIds?: readonly string[];
  materializedCardIds: readonly string[];
  preferences: readonly CardPreference[];
}) {
  const requested = new Set([...eagerCardIds, ...materializedCardIds]);
  return preferences
    .filter(
      (preference) =>
        preference.visible === true && requested.has(preference.id),
    )
    .map((preference) => preference.id)
    .sort()
    .join("|");
}

const OCCUPANCY_LIVE_HISTORY_CARD_IDS = new Set([
  "occupancy_current_total",
  "occupancy_active_areas",
  "occupancy_scenario_detail",
  "occupancy_duration_transitions",
]);

const OCCUPANCY_LIVE_HISTORY_CUSTOM_METRICS = new Set([
  "current",
  "active_areas",
  "utilization",
]);

/**
 * The focused camera snapshot is a widget resource, not a page heartbeat.
 * Keep it alive only while a demanded, visible card consumes its current
 * value. Comparison widgets own their separate shared snapshot source.
 */
export function occupancyLiveHistoryRequired(
  visibleCardIds: ReadonlySet<string>,
  customWidgets: ReadonlyArray<{
    id: string;
    kind: string;
    metric?: string;
  }>,
) {
  if (
    Array.from(OCCUPANCY_LIVE_HISTORY_CARD_IDS).some((cardId) =>
      visibleCardIds.has(cardId),
    )
  ) {
    return true;
  }

  return customWidgets.some(
    (widget) =>
      widget.kind === "metric" &&
      visibleCardIds.has(`occupancy_custom_${widget.id}`) &&
      widget.metric !== undefined &&
      OCCUPANCY_LIVE_HISTORY_CUSTOM_METRICS.has(widget.metric),
  );
}

export function buildOccupancyReportResourcePlan({
  definitionIds,
  hasScenario,
  preferences,
  requestedCardIds,
}: {
  definitionIds: readonly string[];
  hasScenario: boolean;
  metricVisibility: OccupancyMetricVisibility;
  preferences: readonly CardPreference[];
  requestedCardIds?: ReadonlySet<string>;
}) {
  const byId = new Map(preferences.map((preference) => [preference.id, preference]));
  const visible = (id: string) =>
    (!requestedCardIds || requestedCardIds.has(id)) &&
    byId.get(id)?.visible === true;
  const needsDailyMetrics =
    (!hasScenario && visible("occupancy_report_current")) ||
    visible("occupancy_report_average") ||
    visible("occupancy_report_peak") ||
    visible("occupancy_report_minimum");
  return {
    comparisonDefinitionIds: definitionIds.filter(visible).sort().join("|"),
    currentSnapshot:
      hasScenario &&
      (visible("occupancy_report_current") ||
        visible("occupancy_active_areas") ||
        visible("occupancy_scenario_detail")),
    definitionIds: definitionIds.filter((id) => visible(id) ||
      (id === "occupancy_report_day" && needsDailyMetrics)).sort().join("|"),
  };
}

export type OccupancyQueryScheduler = <T>(
  key: string,
  request: () => Promise<T>,
) => Promise<T>;

/** Absolute transport budget for one live comparison refresh cycle. */
export const OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT = 32;

/**
 * Civil fallbacks remain within the absolute page-wide request budget. The
 * civil adapter batches up to 62 days of hourly buckets, so even a four-year
 * monthly source needs at most 24 requests for whole-hour IANA offsets.
 * Fractional-offset ranges that would exceed this ceiling fail closed.
 */
export function occupancyLiveCivilFallbackRequestLimit(
  granularity: "day" | "week" | "month",
) {
  return granularity === "month" ? 32 : 4;
}

/** One batch owns this queue: request identity and results never outlive it. */
export function createOccupancyQueryScheduler(
  signal?: AbortSignal,
  concurrency = 4,
  maximumRequests = Number.POSITIVE_INFINITY,
): OccupancyQueryScheduler {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("A concorrência das consultas é inválida.");
  }
  if (
    maximumRequests !== Number.POSITIVE_INFINITY &&
    (!Number.isSafeInteger(maximumRequests) || maximumRequests < 1)
  ) {
    throw new RangeError("O limite de consultas é inválido.");
  }
  const requests = new Map<string, Promise<unknown>>();
  const queue: Array<() => void> = [];
  let active = 0;
  let scheduledRequests = 0;

  const pump = () => {
    while (active < concurrency && queue.length) queue.shift()!();
  };

  return <T>(key: string, request: () => Promise<T>): Promise<T> => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const existing = requests.get(key);
    if (existing) return existing as Promise<T>;
    if (scheduledRequests >= maximumRequests) {
      return Promise.reject(
        new RangeError(
          "Esta visão ao vivo atingiu o limite seguro de atualização.",
        ),
      );
    }
    scheduledRequests += 1;

    const promise = new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        void Promise.resolve()
          .then(() => {
            signal?.throwIfAborted();
            return request();
          })
          .then((value) => {
            signal?.throwIfAborted();
            resolve(value);
          })
          .catch(reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      });
    });
    requests.set(key, promise);
    // Failures can be retried by a later explicit caller in this batch.
    void promise.catch(() => {
      if (requests.get(key) === promise) requests.delete(key);
    });
    pump();
    return promise;
  };
}
