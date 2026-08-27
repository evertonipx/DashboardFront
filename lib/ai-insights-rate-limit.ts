export const AI_INSIGHTS_REQUESTS_PER_MINUTE = 3;
export const AI_INSIGHTS_REQUESTS_PER_HOUR = 20;
export const AI_INSIGHTS_GLOBAL_CONCURRENCY = 4;
export const AI_INSIGHTS_USER_CONCURRENCY = 1;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_TRACKED_KEYS = 5_000;

type RateEntry = {
  inFlight: number;
  lastSeen: number;
  timestamps: number[];
};

export type AiInsightsCapacityResult =
  | {
      allowed: false;
      reason: "global_concurrency" | "rate" | "user_concurrency";
      retryAfterSeconds: number;
    }
  | {
      allowed: true;
      release: () => void;
    };

export class AiInsightsRateLimiter {
  private readonly entries = new Map<string, RateEntry>();
  private globalInFlight = 0;

  acquire(key: string, now = Date.now()): AiInsightsCapacityResult {
    this.cleanup(now);
    const entry = this.entries.get(key) ?? {
      inFlight: 0,
      lastSeen: now,
      timestamps: [],
    };
    entry.lastSeen = now;
    entry.timestamps = entry.timestamps.filter(
      (timestamp) => timestamp > now - HOUR_MS,
    );

    if (entry.inFlight >= AI_INSIGHTS_USER_CONCURRENCY) {
      this.entries.set(key, entry);
      return {
        allowed: false,
        reason: "user_concurrency",
        retryAfterSeconds: 2,
      };
    }
    if (this.globalInFlight >= AI_INSIGHTS_GLOBAL_CONCURRENCY) {
      this.entries.set(key, entry);
      return {
        allowed: false,
        reason: "global_concurrency",
        retryAfterSeconds: 2,
      };
    }

    const minuteTimestamps = entry.timestamps.filter(
      (timestamp) => timestamp > now - MINUTE_MS,
    );
    if (minuteTimestamps.length >= AI_INSIGHTS_REQUESTS_PER_MINUTE) {
      this.entries.set(key, entry);
      return {
        allowed: false,
        reason: "rate",
        retryAfterSeconds: retryAfter(
          minuteTimestamps[0] + MINUTE_MS,
          now,
        ),
      };
    }
    if (entry.timestamps.length >= AI_INSIGHTS_REQUESTS_PER_HOUR) {
      this.entries.set(key, entry);
      return {
        allowed: false,
        reason: "rate",
        retryAfterSeconds: retryAfter(entry.timestamps[0] + HOUR_MS, now),
      };
    }

    entry.timestamps.push(now);
    entry.inFlight += 1;
    this.globalInFlight += 1;
    this.entries.set(key, entry);

    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        entry.inFlight = Math.max(0, entry.inFlight - 1);
        entry.lastSeen = Date.now();
        this.globalInFlight = Math.max(0, this.globalInFlight - 1);
      },
    };
  }

  private cleanup(now: number) {
    for (const [key, entry] of this.entries) {
      entry.timestamps = entry.timestamps.filter(
        (timestamp) => timestamp > now - HOUR_MS,
      );
      if (
        entry.inFlight === 0 &&
        entry.timestamps.length === 0 &&
        entry.lastSeen <= now - HOUR_MS
      ) {
        this.entries.delete(key);
      }
    }

    if (this.entries.size < MAX_TRACKED_KEYS) return;
    const removable = [...this.entries.entries()]
      .filter(([, entry]) => entry.inFlight === 0)
      .sort((left, right) => left[1].lastSeen - right[1].lastSeen);
    const amount = this.entries.size - MAX_TRACKED_KEYS + 1;
    removable.slice(0, amount).forEach(([key]) => this.entries.delete(key));
  }
}

export const aiInsightsRateLimiter = new AiInsightsRateLimiter();

function retryAfter(availableAt: number, now: number) {
  return Math.max(1, Math.ceil((availableAt - now) / 1_000));
}
