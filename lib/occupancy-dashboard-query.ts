import type { OccupancyMetricVisibility } from "@/lib/occupancy-dashboard-settings";
import type { CardPreference } from "@/lib/view-preferences";

export function buildOccupancyReportResourcePlan({
  definitionIds,
  hasScenario,
  metricVisibility,
  preferences,
}: {
  definitionIds: readonly string[];
  hasScenario: boolean;
  metricVisibility: OccupancyMetricVisibility;
  preferences: readonly CardPreference[];
}) {
  const byId = new Map(preferences.map((preference) => [preference.id, preference]));
  const visible = (id: string) => byId.get(id)?.visible !== false;
  const needsDailyMetrics =
    (!hasScenario && visible("occupancy_report_current")) ||
    (metricVisibility.average && visible("occupancy_report_average")) ||
    (metricVisibility.peak && visible("occupancy_report_peak")) ||
    (metricVisibility.minimum && visible("occupancy_report_minimum"));
  return {
    comparisonDefinitionIds: definitionIds.filter(visible).sort().join("|"),
    currentSnapshot: hasScenario && visible("occupancy_report_current"),
    definitionIds: definitionIds.filter((id) => visible(id) ||
      (id === "occupancy_report_day" && needsDailyMetrics)).sort().join("|"),
  };
}

export type OccupancyQueryScheduler = <T>(
  key: string,
  request: () => Promise<T>,
) => Promise<T>;

/** One batch owns this queue: request identity and results never outlive it. */
export function createOccupancyQueryScheduler(
  signal?: AbortSignal,
  concurrency = 4,
): OccupancyQueryScheduler {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("A concorrência das consultas é inválida.");
  }
  const requests = new Map<string, Promise<unknown>>();
  const queue: Array<() => void> = [];
  let active = 0;

  const pump = () => {
    while (active < concurrency && queue.length) queue.shift()!();
  };

  return <T>(key: string, request: () => Promise<T>): Promise<T> => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const existing = requests.get(key);
    if (existing) return existing as Promise<T>;

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
