export type ApiReadCoordinatorOptions = {
  maximumEntries?: number;
  now?: () => number;
};

export type CoordinatedApiRead<T> = {
  bypassCache?: boolean;
  cacheResult?: (value: T) => boolean;
  cloneResult?: (value: T) => T;
  execute: (signal: AbortSignal) => Promise<T>;
  key: string;
  signal?: AbortSignal;
  ttlMs?: number;
};

type ReadEntry = {
  cloneValue?: (value: unknown) => unknown;
  controller: AbortController;
  key: string;
  promise: Promise<unknown>;
  settledAt: number;
  state: "fulfilled" | "pending" | "rejected";
  subscribers: Set<symbol>;
  ttlMs: number;
  value?: unknown;
};

const DEFAULT_MAXIMUM_ENTRIES = 96;
const MAXIMUM_TTL_MS = 5 * 60_000;

/**
 * Browser-wide GET coordinator used below apiFetch. Identical reads share one
 * transport, but every caller keeps its own AbortSignal. The upstream request
 * is cancelled only after the final subscriber leaves; the microtask grace is
 * intentional so React Strict Mode can remount and rejoin the same request.
 */
export function createApiReadCoordinator({
  maximumEntries = DEFAULT_MAXIMUM_ENTRIES,
  now = () => Date.now(),
}: ApiReadCoordinatorOptions = {}) {
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1) {
    throw new RangeError("O limite do coordenador de leituras é inválido.");
  }

  const entries = new Map<string, ReadEntry>();

  function request<T>({
    bypassCache = false,
    cacheResult,
    cloneResult,
    execute,
    key,
    signal,
    ttlMs = 0,
  }: CoordinatedApiRead<T>): Promise<T> {
    if (!key.trim()) {
      return Promise.reject(new TypeError("A chave da leitura é obrigatória."));
    }
    if (signal?.aborted) return Promise.reject(abortReason(signal));

    prune();
    const normalizedTtl = normalizeTtl(ttlMs);
    const existing = entries.get(key);
    if (
      existing?.state === "pending" &&
      !existing.controller.signal.aborted
    ) {
      existing.ttlMs = Math.max(existing.ttlMs, normalizedTtl);
      if (!existing.cloneValue && cloneResult) {
        existing.cloneValue = cloneResult as (value: unknown) => unknown;
      }
      return subscribe<T>(existing, signal);
    }
    if (
      existing?.state === "fulfilled" &&
      !bypassCache &&
      now() - existing.settledAt <= Math.min(existing.ttlMs, normalizedTtl)
    ) {
      return Promise.resolve().then(() => cloneEntryValue<T>(existing));
    }
    if (existing && entries.get(key) === existing) entries.delete(key);

    const entry = createEntry(
      key,
      normalizedTtl,
      execute,
      cacheResult,
      cloneResult,
    );
    entries.set(key, entry);
    trim();
    return subscribe<T>(entry, signal);
  }

  function createEntry<T>(
    key: string,
    ttlMs: number,
    execute: (signal: AbortSignal) => Promise<T>,
    cacheResult?: (value: T) => boolean,
    cloneResult?: (value: T) => T,
  ): ReadEntry {
    const controller = new AbortController();
    const entry: ReadEntry = {
      controller,
      cloneValue: cloneResult as ((value: unknown) => unknown) | undefined,
      key,
      promise: Promise.resolve(),
      settledAt: 0,
      state: "pending",
      subscribers: new Set(),
      ttlMs,
    };
    entry.promise = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return execute(controller.signal);
      })
      .then((value) => {
        controller.signal.throwIfAborted();
        if (entry.state !== "pending") return value;
        entry.state = "fulfilled";
        entry.value = value;
        entry.settledAt = now();
        if (cacheResult && !cacheResult(value)) entry.ttlMs = 0;
        if (entry.ttlMs === 0 && entries.get(key) === entry) {
          entries.delete(key);
        }
        trim();
        return value;
      })
      .catch((error: unknown) => {
        entry.state = "rejected";
        entry.settledAt = now();
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
    // The per-subscriber promises below surface failures. This guard prevents
    // an unhandled rejection if every subscriber leaves before the transport.
    void entry.promise.catch(() => undefined);
    return entry;
  }

  function subscribe<T>(entry: ReadEntry, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (entry.state === "fulfilled") {
      return Promise.resolve().then(() => cloneEntryValue<T>(entry));
    }
    if (entry.state === "rejected") {
      return Promise.reject(new Error("A leitura compartilhada foi encerrada."));
    }

    const subscriber = Symbol("api-read-subscriber");
    entry.subscribers.add(subscriber);
    return new Promise<T>((resolve, reject) => {
      let active = true;
      const finish = () => {
        if (!active) return false;
        active = false;
        signal?.removeEventListener("abort", handleAbort);
        entry.subscribers.delete(subscriber);
        return true;
      };
      const handleAbort = () => {
        if (!finish()) return;
        reject(abortReason(signal!));
        scheduleUnusedAbort(entry);
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      entry.promise.then(
        (value) => {
          if (finish()) {
            resolve(
              entry.cloneValue
                ? (entry.cloneValue(value) as T)
                : (value as T),
            );
          }
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }

  function scheduleUnusedAbort(entry: ReadEntry) {
    queueMicrotask(() => {
      if (
        entry.state === "pending" &&
        entry.subscribers.size === 0 &&
        !entry.controller.signal.aborted
      ) {
        entry.controller.abort(
          new DOMException("Consulta sem consumidores.", "AbortError"),
        );
      }
    });
  }

  function clear({ abortPending = false }: { abortPending?: boolean } = {}) {
    for (const entry of entries.values()) {
      if (entry.state === "pending" && abortPending) {
        entry.controller.abort(
          new DOMException("Sessão de leitura encerrada.", "AbortError"),
        );
      }
    }
    entries.clear();
    // A non-aborting clear detaches pending readers from future coalescing but
    // lets them finish for the subscribers that already own them.
  }

  function prune() {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (
        entry.state !== "pending" &&
        (entry.state === "rejected" ||
          currentTime - entry.settledAt > entry.ttlMs)
      ) {
        entries.delete(key);
      }
    }
  }

  function trim() {
    if (entries.size <= maximumEntries) return;
    const settled = Array.from(entries.values())
      .filter((entry) => entry.state !== "pending")
      .sort((left, right) => left.settledAt - right.settledAt);
    while (entries.size > maximumEntries && settled.length) {
      const entry = settled.shift()!;
      if (entries.get(entry.key) === entry) entries.delete(entry.key);
    }
  }

  return { clear, request };
}

function cloneEntryValue<T>(entry: ReadEntry) {
  return entry.cloneValue
    ? (entry.cloneValue(entry.value) as T)
    : (entry.value as T);
}

function normalizeTtl(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("A validade da leitura é inválida.");
  }
  return Math.min(MAXIMUM_TTL_MS, Math.round(value));
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Consulta cancelada.", "AbortError");
}
