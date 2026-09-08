import type { AggregateGranularity } from "@/lib/types";

/** Preserve immutable widget references when storage republishes equal JSON. */
export function reconcileCountingHistoryItems<T extends { id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const previousById = new Map(current.map((item) => [item.id, item]));
  const next = incoming.map((item) => {
    const previous = previousById.get(item.id);
    return previous && JSON.stringify(previous) === JSON.stringify(item)
      ? previous
      : item;
  });
  return current.length === next.length &&
    next.every((item, index) => item === current[index])
    ? current
    : next;
}

/** One request generation: deduplicate paths and bound aggregate fan-out. */
export function createCountingHistoryRequestQueue<T>(
  execute: (key: string) => Promise<T>,
  signal: AbortSignal,
  concurrency = 4,
): (key: string) => Promise<T> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("A concorrência deve ser um inteiro positivo.");
  }
  const requests = new Map<string, Promise<T>>();
  const queue: Array<{
    key: string;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }> = [];
  let active = 0;

  function drain() {
    while (active < concurrency && queue.length) {
      const job = queue.shift()!;
      active += 1;
      void Promise.resolve()
        .then(async () => {
          signal.throwIfAborted();
          const result = await execute(job.key);
          signal.throwIfAborted();
          return result;
        })
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  return (key) => {
    if (signal.aborted) return Promise.reject(signal.reason);
    const existing = requests.get(key);
    if (existing) return existing;
    const promise = new Promise<T>((resolve, reject) => {
      queue.push({ key, resolve, reject });
    });
    requests.set(key, promise);
    drain();
    return promise;
  };
}

/** Equivalent widgets share validation and partition assembly, not just HTTP. */
export function createCountingHistoryDatasetLoader<T>(
  execute: (query: {
    granularity: AggregateGranularity;
    from: Date;
    to: Date;
  }) => Promise<T>,
) {
  const requests = new Map<string, Promise<T>>();
  return (query: Parameters<typeof execute>[0]): Promise<T> => {
    const key = JSON.stringify([
      query.granularity,
      query.from.getTime(),
      query.to.getTime(),
    ]);
    const existing = requests.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(() => execute(query));
    requests.set(key, request);
    return request;
  };
}
