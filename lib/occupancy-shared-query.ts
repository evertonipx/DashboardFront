"use client";

import { accessTokensShareUserIdentity } from "@/lib/access-token-claims";
import { ApiError, apiFetch, getStoredSession } from "@/lib/api";
import {
  selectOccupancyAggregateRowsInInterval,
} from "@/lib/occupancy-aggregate-validation";
import type {
  AggregateGranularity,
  OccupancyScenarioAggregateResponse,
} from "@/lib/types";

const DEFAULT_CACHE_TTL_MS = 1_000;
// Four background slots keep independent widgets moving while the fifth slot
// remains available to the focused live snapshot.
const DEFAULT_CONCURRENCY = 5;
const MAX_CACHE_ENTRIES = 160;
const MAX_CONTAINMENT_ROWS = 999;
const MAX_CACHE_TTL_MS = 6 * 60 * 60_000;

export type OccupancyQueryPriority = "background" | "foreground" | "normal";

export type SharedOccupancyQuery = {
  /** A force refresh still joins an identical in-flight GET, but skips settled cache. */
  bypassCache?: boolean;
  cacheTtlMs?: number;
  companyScopeId: string;
  path: string;
  priority?: OccupancyQueryPriority;
  scenarioId: string;
  signal?: AbortSignal;
  timeZone: string;
};

type AggregateIdentity = {
  from: number;
  granularity: AggregateGranularity;
  to: number;
  variant: string;
};

type QueryIdentity = {
  aggregate: AggregateIdentity | null;
  authScope: string;
  canonicalPath: string;
  companyScopeId: string;
  scenarioId: string;
  timeZone: string;
};

type QueryEntry = {
  cacheTtlMs: number;
  controller: AbortController;
  createdAt: number;
  execute: (signal: AbortSignal) => Promise<unknown>;
  identity: QueryIdentity;
  key: string;
  priority: number;
  promise: Promise<unknown>;
  reject: (reason?: unknown) => void;
  resolve: (value: unknown) => void;
  settledAt: number;
  state: "fulfilled" | "pending" | "rejected";
  subscribers: Set<symbol>;
  value?: unknown;
};

type RequestInput<T> = SharedOccupancyQuery & {
  authScope: string;
  execute: (signal: AbortSignal) => Promise<T>;
};

/**
 * Page-wide occupancy transport. It coalesces equivalent GETs across React
 * hooks, gives the focused live panel precedence over background widgets and
 * can serve a narrower aggregate window from one wider certified response.
 */
export function createSharedOccupancyQueryClient({
  concurrency = DEFAULT_CONCURRENCY,
  now = () => Date.now(),
}: {
  concurrency?: number;
  now?: () => number;
} = {}) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("A concorrência das consultas de ocupação é inválida.");
  }

  const entries = new Map<string, QueryEntry>();
  const queue: QueryEntry[] = [];
  let active = 0;
  let activeNonForeground = 0;
  let pumpScheduled = false;
  const nonForegroundConcurrency = Math.max(1, concurrency - 1);
  const effectivePriority = (entry: QueryEntry) => {
    const waitedMs = Math.max(0, now() - entry.createdAt);
    // A consulta histórica nunca fica abandonada atrás do pulso ao vivo: após
    // trinta segundos na fila ela progride como prioridade normal.
    return entry.priority === priorityValue("background") && waitedMs >= 30_000
      ? priorityValue("normal")
      : entry.priority;
  };

  function schedulePump() {
    if (pumpScheduled) return;
    pumpScheduled = true;
    queueMicrotask(() => {
      pumpScheduled = false;
      pump();
    });
  }

  function pump() {
    queue.sort(
      (left, right) =>
        effectivePriority(left) - effectivePriority(right) ||
        left.createdAt - right.createdAt,
    );
    while (active < concurrency && queue.length) {
      const runnableIndex = queue.findIndex(
        (candidate) =>
          effectivePriority(candidate) === priorityValue("foreground") ||
          activeNonForeground < nonForegroundConcurrency,
      );
      if (runnableIndex < 0) break;
      const [entry] = queue.splice(runnableIndex, 1);
      if (entry.state !== "pending") continue;
      if (entry.controller.signal.aborted || entry.subscribers.size === 0) {
        rejectEntry(entry, abortReason(entry.controller.signal));
        continue;
      }
      const beganAsNonForeground =
        effectivePriority(entry) !== priorityValue("foreground");
      active += 1;
      if (beganAsNonForeground) activeNonForeground += 1;
      let slotReleased = false;
      const releaseSlot = () => {
        if (slotReleased) return;
        slotReleased = true;
        active -= 1;
        if (beganAsNonForeground) activeNonForeground -= 1;
        schedulePump();
      };
      const releaseAbortedSlot = () => releaseSlot();
      entry.controller.signal.addEventListener("abort", releaseAbortedSlot, {
        once: true,
      });
      void Promise.resolve()
        .then(() => {
          entry.controller.signal.throwIfAborted();
          return entry.execute(entry.controller.signal);
        })
        .then((value) => {
          entry.controller.signal.throwIfAborted();
          return value;
        })
        .then(
          (value) => fulfillEntry(entry, value),
          (error) => rejectEntry(entry, error),
        )
        .finally(() => {
          entry.controller.signal.removeEventListener(
            "abort",
            releaseAbortedSlot,
          );
          releaseSlot();
        });
    }
  }

  function fulfillEntry(entry: QueryEntry, value: unknown) {
    if (entry.state !== "pending") return;
    entry.state = "fulfilled";
    entry.value = value;
    entry.settledAt = now();
    entry.resolve(value);
    if (entry.cacheTtlMs === 0 && entries.get(entry.key) === entry) {
      entries.delete(entry.key);
    }
    prune();
  }

  function rejectEntry(entry: QueryEntry, reason: unknown) {
    if (entry.state !== "pending") return;
    entry.state = "rejected";
    entry.settledAt = now();
    entry.reject(reason);
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
  }

  function prune() {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (
        entry.state !== "pending" &&
        currentTime - entry.settledAt > entry.cacheTtlMs
      ) {
        entries.delete(key);
      }
    }
    if (entries.size <= MAX_CACHE_ENTRIES) return;
    const removable = Array.from(entries.values())
      .filter((entry) => entry.state !== "pending")
      .sort((left, right) => left.settledAt - right.settledAt);
    while (entries.size > MAX_CACHE_ENTRIES && removable.length) {
      const entry = removable.shift()!;
      if (entries.get(entry.key) === entry) entries.delete(entry.key);
    }
  }

  function createEntry<T>(input: RequestInput<T>, identity: QueryIdentity) {
    let resolve!: (value: unknown) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<unknown>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    // Every consumer has an independently abortable wrapper. If they all
    // leave, this handler prevents an unobserved transport rejection.
    void promise.catch(() => undefined);
    const entry: QueryEntry = {
      cacheTtlMs: normalizeCacheTtl(input.cacheTtlMs),
      controller: new AbortController(),
      createdAt: now(),
      execute: input.execute,
      identity,
      key: queryKey(identity),
      priority: priorityValue(input.priority),
      promise,
      reject,
      resolve,
      settledAt: 0,
      state: "pending",
      subscribers: new Set(),
    };
    entries.set(entry.key, entry);
    queue.push(entry);
    schedulePump();
    return entry;
  }

  function findCoveringEntry(
    identity: QueryIdentity,
    cacheTtlMs: number,
    bypassCache: boolean,
  ) {
    const requested = identity.aggregate;
    if (
      !requested ||
      (requested.granularity !== "minute" &&
        requested.granularity !== "hour")
    ) {
      return null;
    }
    const currentTime = now();
    let best: QueryEntry | null = null;
    for (const entry of entries.values()) {
      const candidate = entry.identity.aggregate;
      if (
        !candidate ||
        (entry.state !== "pending" && entry.state !== "fulfilled") ||
        entry.controller.signal.aborted ||
        entry.identity.authScope !== identity.authScope ||
        entry.identity.companyScopeId !== identity.companyScopeId ||
        entry.identity.scenarioId !== identity.scenarioId ||
        entry.identity.timeZone !== identity.timeZone ||
        candidate.granularity !== requested.granularity ||
        candidate.variant !== requested.variant ||
        candidate.from > requested.from ||
        candidate.to < requested.to ||
        (candidate.from === requested.from && candidate.to === requested.to) ||
        (entry.state === "pending" && bypassCache) ||
        (entry.state === "fulfilled" &&
          (bypassCache ||
            currentTime - entry.settledAt >
              Math.min(cacheTtlMs, entry.cacheTtlMs)))
      ) {
        continue;
      }
      const candidateSpan = candidate.to - candidate.from;
      const bestSpan = best?.identity.aggregate
        ? best.identity.aggregate.to - best.identity.aggregate.from
        : Number.POSITIVE_INFINITY;
      if (candidateSpan < bestSpan) best = entry;
    }
    return best;
  }

  function subscribe<T>(entry: QueryEntry, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (entry.state === "fulfilled") return Promise.resolve(entry.value as T);
    if (entry.state === "rejected") return Promise.reject(new Error("Consulta encerrada."));

    const subscriber = Symbol("occupancy-query-subscriber");
    entry.subscribers.add(subscriber);
    return new Promise<T>((resolve, reject) => {
      let activeSubscriber = true;
      const finish = () => {
        if (!activeSubscriber) return false;
        activeSubscriber = false;
        signal?.removeEventListener("abort", handleAbort);
        entry.subscribers.delete(subscriber);
        return true;
      };
      const handleAbort = () => {
        if (!finish()) return;
        reject(abortReason(signal!));
        scheduleUnusedAbort(entry, signal!);
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      entry.promise.then(
        (value) => {
          if (finish()) resolve(value as T);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }

  function scheduleUnusedAbort(entry: QueryEntry, signal: AbortSignal) {
    // React development Strict Mode tears an effect down and mounts it again
    // in the same turn. Give that replacement subscriber one microtask to
    // rejoin the exact GET instead of aborting a real transport and creating
    // an identical one immediately afterwards.
    queueMicrotask(() => {
      if (
        entry.state !== "pending" ||
        entry.subscribers.size > 0 ||
        entry.controller.signal.aborted
      ) {
        return;
      }
      const reason = abortReason(signal);
      entry.controller.abort(reason);
      if (queue.includes(entry)) rejectEntry(entry, reason);
    });
  }

  async function requestExact<T>(
    input: RequestInput<T>,
    identity: QueryIdentity,
  ): Promise<T> {
    prune();
    const key = queryKey(identity);
    const cacheTtlMs = normalizeCacheTtl(input.cacheTtlMs);
    const currentTime = now();
    const existing = entries.get(key);
    if (
      existing?.state === "pending" &&
      !existing.controller.signal.aborted
    ) {
      existing.cacheTtlMs = Math.max(existing.cacheTtlMs, cacheTtlMs);
      existing.priority = Math.min(existing.priority, priorityValue(input.priority));
      schedulePump();
      return subscribe<T>(existing, input.signal);
    }
    if (
      existing?.state === "fulfilled" &&
      !input.bypassCache &&
      currentTime - existing.settledAt <= cacheTtlMs
    ) {
      return subscribe<T>(existing, input.signal);
    }
    if (existing && entries.get(key) === existing) entries.delete(key);
    return subscribe<T>(createEntry(input, identity), input.signal);
  }

  async function request<T>(input: RequestInput<T>): Promise<T> {
    if (input.signal?.aborted) throw abortReason(input.signal);
    prune();
    const identity = buildQueryIdentity(input);
    const exact = entries.get(queryKey(identity));
    const cacheTtlMs = normalizeCacheTtl(input.cacheTtlMs);
    const currentTime = now();
    if (
      exact?.state === "pending" &&
      !exact.controller.signal.aborted
    ) {
      return requestExact(input, identity);
    }
    if (
      exact?.state === "fulfilled" &&
      !input.bypassCache &&
      currentTime - exact.settledAt <= cacheTtlMs
    ) {
      return subscribe<T>(exact, input.signal);
    }
    if (exact && entries.get(exact.key) === exact) entries.delete(exact.key);
    const covering = findCoveringEntry(
      identity,
      cacheTtlMs,
      Boolean(input.bypassCache),
    );
    if (covering) {
      try {
        const response = await subscribe<unknown>(covering, input.signal);
        if (canServeAggregateSubset(response)) {
          return sliceAggregateResponse(
            response as OccupancyScenarioAggregateResponse,
            identity.aggregate!,
            identity.timeZone,
          ) as T;
        }
      } catch (error) {
        if (input.signal?.aborted) throw error;
        // A wider request may fail independently; the exact request remains a
        // valid fallback and retains its own error semantics.
      }
    }
    return requestExact(input, identity);
  }

  function clear({ abort = true }: { abort?: boolean } = {}) {
    if (!abort) {
      for (const [key, entry] of entries) {
        if (entry.state !== "pending") entries.delete(key);
      }
      return;
    }
    entries.forEach((entry) => {
      if (entry.state === "pending") {
        entry.controller.abort(new DOMException("Sessão de ocupação encerrada.", "AbortError"));
        rejectEntry(entry, abortReason(entry.controller.signal));
      }
    });
    entries.clear();
    queue.length = 0;
  }

  function invalidate({
    companyScopeId,
    scenarioId,
    timeZone,
  }: Partial<Pick<SharedOccupancyQuery, "companyScopeId" | "scenarioId" | "timeZone">> = {}) {
    for (const [key, entry] of entries) {
      if (
        (companyScopeId === undefined || entry.identity.companyScopeId === companyScopeId.trim()) &&
        (scenarioId === undefined || entry.identity.scenarioId === scenarioId.trim()) &&
        (timeZone === undefined || entry.identity.timeZone === timeZone.trim())
      ) {
        // Do not disrupt another mounted consumer; removing the entry is
        // enough to ensure the next explicit refresh reaches the API.
        entries.delete(key);
      }
    }
  }

  return { clear, invalidate, request };
}

const sharedClient = createSharedOccupancyQueryClient();
let civilCapabilityAuthScope = "";
const sharedCivilCapabilities = new Map<string, Map<string, boolean>>();

export function fetchSharedOccupancyQuery<T>({
  bypassCache,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  companyScopeId,
  path,
  priority,
  scenarioId,
  signal,
  timeZone,
}: SharedOccupancyQuery): Promise<T> {
  const authScope = getStoredSession?.()?.access_token ?? "";
  const expectedIdentity = buildQueryIdentity({
    authScope,
    companyScopeId,
    path,
    scenarioId,
    timeZone,
  });
  const requestWithToken = async (
    expectedAccessToken: string,
    sharedSignal: AbortSignal,
  ) => {
    const response = await apiFetch<T>(path, {
      companyScopeId,
      expectedAccessToken,
      signal: sharedSignal,
    });
    if (!responseMatchesIdentity(response, expectedIdentity)) {
      throw new Error("A resposta de ocupação diverge do escopo solicitado.");
    }
    return response;
  };
  return sharedClient.request<T>({
    authScope,
    bypassCache,
    cacheTtlMs,
    companyScopeId,
    execute: async (sharedSignal) => {
      try {
        return await requestWithToken(authScope, sharedSignal);
      } catch (error) {
        const refreshedAccessToken = getStoredSession?.()?.access_token ?? "";
        if (
          !(error instanceof ApiError) ||
          error.status !== 409 ||
          !authScope ||
          !refreshedAccessToken ||
          refreshedAccessToken === authScope ||
          !accessTokensShareUserIdentity(authScope, refreshedAccessToken)
        ) {
          throw error;
        }
        // apiFetch may legitimately rotate an expiring JWT before putting a
        // request on the wire. Retry only when both tokens declare the same
        // user; a principal switch remains fail-closed.
        return requestWithToken(refreshedAccessToken, sharedSignal);
      }
    },
    path,
    priority,
    scenarioId,
    signal,
    timeZone,
  });
}

export function invalidateSharedOccupancyQueries(
  scope?: Partial<Pick<SharedOccupancyQuery, "companyScopeId" | "scenarioId" | "timeZone">>,
) {
  sharedClient.invalidate(scope);
}

export function clearSharedOccupancyQueries() {
  sharedClient.clear();
  sharedCivilCapabilities.clear();
  civilCapabilityAuthScope = "";
}

/** The civil fallback capability is API-wide, so mounted widgets share it. */
export function sharedOccupancyCivilCapabilities(
  companyScopeId: string,
  timeZone: string,
) {
  const authScope = getStoredSession?.()?.access_token ?? "";
  if (authScope !== civilCapabilityAuthScope) {
    sharedCivilCapabilities.clear();
    civilCapabilityAuthScope = authScope;
  }
  const scopeKey = JSON.stringify([companyScopeId.trim(), timeZone.trim()]);
  let capabilities = sharedCivilCapabilities.get(scopeKey);
  if (!capabilities) {
    capabilities = new Map();
    sharedCivilCapabilities.set(scopeKey, capabilities);
  }
  return capabilities;
}

function buildQueryIdentity(input: Pick<RequestInput<unknown>,
  "authScope" | "companyScopeId" | "path" | "scenarioId" | "timeZone">): QueryIdentity {
  const canonicalPath = canonicalizePath(input.path);
  return {
    aggregate: aggregateIdentity(canonicalPath),
    authScope: input.authScope,
    canonicalPath,
    companyScopeId: input.companyScopeId.trim(),
    scenarioId: input.scenarioId.trim(),
    timeZone: input.timeZone.trim(),
  };
}

function queryKey(identity: QueryIdentity) {
  return JSON.stringify([
    identity.authScope,
    identity.companyScopeId,
    identity.scenarioId,
    identity.timeZone,
    identity.canonicalPath,
  ]);
}

function canonicalizePath(path: string) {
  const url = new URL(path, "http://occupancy.local");
  const params = Array.from(url.searchParams.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const search = new URLSearchParams(params).toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

function aggregateIdentity(path: string): AggregateIdentity | null {
  const url = new URL(path, "http://occupancy.local");
  if (!/\/occupancy\/scenarios\/[^/]+\/aggregate$/.test(url.pathname)) return null;
  const granularity = url.searchParams.get("granularity") as AggregateGranularity | null;
  const from = Date.parse(url.searchParams.get("from") ?? "");
  const to = Date.parse(url.searchParams.get("to") ?? "");
  if (
    !granularity ||
    !["minute", "hour", "day", "week", "month", "semester", "year"].includes(granularity) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to
  ) {
    return null;
  }
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  const variantSearch = new URLSearchParams(
    Array.from(url.searchParams.entries()).sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    ),
  ).toString();
  return {
    from,
    granularity,
    to,
    variant: `${url.pathname}${variantSearch ? `?${variantSearch}` : ""}`,
  };
}

function canServeAggregateSubset(
  response: unknown,
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const aggregate = response as OccupancyScenarioAggregateResponse;
  if (!Array.isArray(aggregate.data) || aggregate.data.length > MAX_CONTAINMENT_ROWS) return false;
  // Open/partial envelopes need the original open-bucket and as_of validation.
  // Only a fully certified closed response can safely cover another window.
  return aggregate.complete === true && aggregate.status === "complete";
}

function responseMatchesIdentity(response: unknown, identity: QueryIdentity) {
  if (!identity.aggregate) return true;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return false;
  }
  const envelope = response as OccupancyScenarioAggregateResponse;
  return (
    (envelope.scenario_id === undefined ||
      envelope.scenario_id === identity.scenarioId) &&
    (envelope.granularity === undefined ||
      envelope.granularity === identity.aggregate.granularity) &&
    (envelope.timezone === undefined ||
      !identity.timeZone ||
      envelope.timezone === identity.timeZone)
  );
}

function sliceAggregateResponse(
  response: OccupancyScenarioAggregateResponse,
  requested: AggregateIdentity,
  timeZone: string,
): OccupancyScenarioAggregateResponse {
  return {
    ...response,
    data: selectOccupancyAggregateRowsInInterval(
      response.data!,
      requested.granularity,
      new Date(requested.from),
      new Date(requested.to),
      timeZone,
    ),
  };
}

function normalizeCacheTtl(value?: number) {
  if (value === undefined) return DEFAULT_CACHE_TTL_MS;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("A validade do cache de ocupação é inválida.");
  }
  return Math.min(MAX_CACHE_TTL_MS, Math.round(value));
}

function priorityValue(priority: OccupancyQueryPriority | undefined) {
  if (priority === "foreground") return 0;
  if (priority === "background") return 2;
  return 1;
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Consulta cancelada.", "AbortError");
}
