import {
  combineDemographicAggregations,
  type DemographicAggregation,
} from "@/lib/demographics";

const COMPARISON_FULL_REFRESH_MS = 6 * 60 * 60 * 1_000;

/** One mounted dashboard owns the reference and its authenticated scope. */
export type DemographicComparisonQueryCache = {
  from: number;
  lastFullRefreshAt: number;
  scopeKey: string;
  summary: DemographicAggregation;
  to: number;
};

type ComparisonCacheRef = { current: DemographicComparisonQueryCache | null };

export type DemographicComparisonRangeLoader = (
  from: Date,
  to: Date,
  signal: AbortSignal,
  options: { revalidate?: boolean },
) => Promise<DemographicAggregation>;

// Only ownership metadata is shared here, never response data or tenant keys.
// Weak references disappear with the mounted dashboard's cache reference.
const generations = new WeakMap<ComparisonCacheRef, number>();

/** Preserve the exact exclusive minute cutoff while reusing the stable prefix.
 * Date boundaries are instants already resolved in the company's timezone. */
export async function loadDemographicComparisonAggregation({
  cacheRef,
  scopeKey,
  from,
  to,
  signal,
  loadRange,
}: {
  cacheRef: ComparisonCacheRef;
  scopeKey: string;
  from: Date;
  to: Date;
  signal: AbortSignal;
  loadRange: DemographicComparisonRangeLoader;
}): Promise<DemographicAggregation> {
  signal.throwIfAborted();
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!scopeKey.trim() || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    throw new RangeError("O escopo ou intervalo da comparação demográfica é inválido.");
  }

  const generation = (generations.get(cacheRef) ?? 0) + 1;
  generations.set(cacheRef, generation);
  const cached = cacheRef.current;
  const now = Date.now();
  const sameIdentity = cached?.scopeKey === scopeKey && cached.from === fromMs;
  const expired = sameIdentity && (
    !Number.isFinite(cached.lastFullRefreshAt) ||
    now < cached.lastFullRefreshAt ||
    now - cached.lastFullRefreshAt >= COMPARISON_FULL_REFRESH_MS
  );
  const fullRange = !sameIdentity || expired || toMs < cached.to;
  if (!fullRange && cached.to === toMs) return cached.summary;

  const received = await loadRange(
    new Date(fullRange ? fromMs : cached.to),
    new Date(toMs),
    signal,
    // Initial/changed ranges can reuse partitions from the main period.
    // Expiry explicitly revisits them; manual refresh clears both caches.
    { revalidate: Boolean(expired) },
  );
  signal.throwIfAborted();
  const summary = fullRange ? received
    : combineDemographicAggregations([cached.summary, received]);
  if (generations.get(cacheRef) === generation && cacheRef.current === cached) {
    cacheRef.current = {
      from: fromMs,
      lastFullRefreshAt: fullRange ? now : cached.lastFullRefreshAt,
      scopeKey,
      summary,
      to: toMs,
    };
  }
  return summary;
}
