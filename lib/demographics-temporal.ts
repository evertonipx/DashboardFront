import type { DemographicAggregation } from "@/lib/demographics";

export type DemographicTemporalBin = {
  from: string;
  total: number;
  gender: Record<string, number>;
  age: Record<string, number>;
  emotion: Record<string, number>;
};

export type DemographicTemporalAggregation = {
  timeZone: string;
  bins: DemographicTemporalBin[];
};

type TemporalValues = {
  label: string;
  total: number | null;
  gender: Record<string, number> | null;
  age: Record<string, number> | null;
  emotion: Record<string, number> | null;
  percentages: {
    gender: Record<string, number> | null;
    age: Record<string, number> | null;
    emotion: Record<string, number> | null;
  };
  observed: boolean;
  future: boolean;
};

export type DemographicTemporalPoint = TemporalValues & { from: string; to: string };
export type DemographicHourProfilePoint = TemporalValues & { hour: number };
export type DemographicTemporalInterval = "hour" | "day" | "month";
export type DemographicTemporalPlan = {
  available: boolean;
  interval: DemographicTemporalInterval;
  timeZone: string;
  points: DemographicTemporalPoint[];
  hourProfile: DemographicHourProfilePoint[];
};
export type DemographicTemporalPlanOptions = {
  from: Date | string;
  to: Date | string;
  timeZone: string;
  now?: Date | string;
  interval?: "auto" | DemographicTemporalInterval;
  maxPoints?: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const dimensions = ["gender", "age", "emotion"] as const;
const clocks = new Map<string, Clock>();
const boundaryCache = new Map<string, Boundary[]>();

/** One formatter and a per-minute cache per raw partition, never per row. */
export function createDemographicTemporalHourResolver(timeZone: string) {
  const clock = zonedClock(timeZone);
  const minutes = new Map<number, string>();
  return {
    timeZone: clock.timeZone,
    from(value: Date | string) {
      const timestamp = instant(value);
      const minute = Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
      let from = minutes.get(minute);
      if (from === undefined) {
        from = new Date(clock.hourStart(timestamp)).toISOString();
        minutes.set(minute, from);
      }
      return from;
    },
  };
}

/** Linear union by real instant; counts are summed before any percentage. */
export function combineDemographicTemporalAggregations(
  summaries: readonly DemographicAggregation[],
): DemographicTemporalAggregation | undefined {
  const contributing = summaries.filter((summary) => summary.temporal || summary.hasData);
  if (!contributing.length || contributing.some((summary) => !summary.temporal)) return undefined;
  const timeZone = contributing[0].temporal!.timeZone;
  if (contributing.some((summary) => summary.temporal!.timeZone !== timeZone)) return undefined;
  const bins = new Map<string, DemographicTemporalBin>();
  for (const summary of contributing) {
    for (const bin of summary.temporal!.bins) {
      const current = bins.get(bin.from);
      if (current) addBin(current, bin);
      else bins.set(bin.from, copyBin(bin));
    }
  }
  return { timeZone, bins: [...bins.values()].sort((left, right) => left.from.localeCompare(right.from)) };
}

/**
 * Missing hours stay null. The plan never extrapolates raw-minute coverage or
 * treats a missing marginal as proof that an entire hour/day was observed.
 */
export function buildDemographicTemporalPlan(
  summary: DemographicAggregation,
  options: DemographicTemporalPlanOptions,
): DemographicTemporalPlan {
  const clock = zonedClock(options.timeZone);
  const from = instant(options.from);
  const to = instant(options.to);
  const now = options.now === undefined ? Date.now() : instant(options.now);
  if (from >= to) throw new RangeError("O início do período demográfico deve ser anterior ao fim.");
  const maximum = options.maxPoints ?? 366;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10_000) {
    throw new RangeError("O limite temporal deve estar entre 1 e 10000 pontos.");
  }
  if (summary.temporal && summary.temporal.timeZone !== clock.timeZone) {
    throw new Error("O fuso dos dados demográficos difere do fuso do período.");
  }
  const firstDay = clock.parts(from).dateKey;
  const lastDay = clock.parts(to - 1).dateKey;
  const civilDays = Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / DAY_MS) + 1;
  let interval: DemographicTemporalInterval = options.interval && options.interval !== "auto"
    ? options.interval
    : civilDays <= 7 ? "hour" : civilDays <= 366 ? "day" : "month";
  let boundaries = intervalBoundaries(from, to, interval, clock, maximum);
  if (boundaries.length > maximum && interval === "hour") {
    interval = "day";
    boundaries = intervalBoundaries(from, to, interval, clock, maximum);
  }
  if (boundaries.length > maximum && interval === "day") {
    interval = "month";
    boundaries = intervalBoundaries(from, to, interval, clock, maximum);
  }
  if (boundaries.length > maximum) {
    const stride = Math.ceil(boundaries.length / maximum);
    boundaries = boundaries.filter((_, index) => index % stride === 0)
      .map((point, index, selected) => ({ ...point, to: selected[index + 1]?.from ?? boundaries[boundaries.length - 1].to }));
  }
  const totals: Array<DemographicTemporalBin | undefined> = boundaries.map(() => undefined);
  const profile: Array<DemographicTemporalBin | undefined> = Array.from({ length: 24 });
  for (const bin of summary.temporal?.bins ?? []) {
    const timestamp = instant(bin.from);
    if (timestamp >= to || timestamp >= now) continue;
    if (timestamp < from && clock.hourEnd(timestamp) <= from) continue;
    const index = boundaryIndex(boundaries, timestamp);
    if (index < 0) continue;
    totals[index] = mergeBin(totals[index], bin);
    const hour = clock.parts(timestamp).hour;
    profile[hour] = mergeBin(profile[hour], bin);
  }
  const repeatedLabels = new Map<string, number>();
  const labels = boundaries.map((point) => {
    const parts = clock.parts(point.from);
    const date = `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`;
    const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
    const label = interval === "month" ? `${String(parts.month).padStart(2, "0")}/${parts.year}`
      : interval === "day" ? `${date}/${parts.year}` : `${firstDay === lastDay ? "" : `${date} `}${time}`;
    repeatedLabels.set(label, (repeatedLabels.get(label) ?? 0) + 1);
    return label;
  });
  return {
    available: Boolean(summary.temporal),
    interval,
    timeZone: clock.timeZone,
    points: boundaries.map((point, index) => ({
      from: new Date(point.from).toISOString(),
      to: new Date(point.to).toISOString(),
      ...values(totals[index], point.from >= now),
      label: interval === "hour" && repeatedLabels.get(labels[index])! > 1
        ? `${labels[index]} ${offsetLabel(clock.parts(point.from).offset)}` : labels[index],
    })),
    hourProfile: profile.map((bin, hour) => ({
      hour,
      ...values(bin, from >= now),
      label: `${String(hour).padStart(2, "0")}h`,
    })),
  };
}

type Clock = ReturnType<typeof createZonedClock>;
type Boundary = { from: number; to: number };

function intervalBoundaries(from: number, to: number, interval: DemographicTemporalInterval, clock: Clock, maximum: number): Boundary[] {
  const cacheKey = `${clock.timeZone}|${from}|${to}|${interval}|${maximum}`;
  const cached = boundaryCache.get(cacheKey);
  if (cached) return cached;
  const result: Boundary[] = [];
  let cursor = interval === "hour" ? clock.hourStart(from)
    : clock.civilStart(interval === "day" ? clock.parts(from).dateKey : `${clock.parts(from).dateKey.slice(0, 7)}-01`);
  while (cursor < to) {
    const parts = clock.parts(cursor);
    const next = interval === "hour" ? clock.hourEnd(cursor)
      : clock.civilStart(interval === "day" ? shiftDate(parts.dateKey, 1) : shiftMonth(parts.dateKey, 1));
    if (next <= cursor) throw new Error("Não foi possível avançar o intervalo temporal demográfico.");
    result.push({ from: cursor, to: next });
    cursor = next;
    // Hour/day candidates only need to prove they exceed the cap before the
    // caller promotes resolution. Never enumerate years of hourly blanks.
    if (interval !== "month" && result.length > maximum) break;
  }
  if (boundaryCache.size >= 64) boundaryCache.delete(boundaryCache.keys().next().value!);
  boundaryCache.set(cacheKey, result);
  return result;
}

function values(bin: DemographicTemporalBin | undefined, future: boolean): Omit<TemporalValues, "label"> {
  return {
    total: bin?.total ?? null,
    gender: bin ? { ...bin.gender } : null,
    age: bin ? { ...bin.age } : null,
    emotion: bin ? { ...bin.emotion } : null,
    percentages: {
      gender: bin ? percentages(bin.gender, bin.total) : null,
      age: bin ? percentages(bin.age, bin.total) : null,
      emotion: bin ? percentages(bin.emotion, bin.total) : null,
    },
    observed: Boolean(bin),
    future,
  };
}

function percentages(counts: Record<string, number>, total: number) {
  if (total <= 0) return null;
  const keys = Object.keys(counts);
  const raw = keys.map((key) => counts[key] / total * 10_000);
  const points = raw.map(Math.floor);
  const remaining = 10_000 - points.reduce((sum, value) => sum + value, 0);
  const rank = raw.map((value, index) => ({ index, remainder: value - points[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) points[rank[index].index] += 1;
  return Object.fromEntries(keys.map((key, index) => [key, points[index] / 100]));
}

function mergeBin(target: DemographicTemporalBin | undefined, source: DemographicTemporalBin) {
  if (!target) return copyBin(source);
  addBin(target, source);
  return target;
}

function copyBin(bin: DemographicTemporalBin): DemographicTemporalBin {
  return { ...bin, gender: { ...bin.gender }, age: { ...bin.age }, emotion: { ...bin.emotion } };
}

function addBin(target: DemographicTemporalBin, source: DemographicTemporalBin) {
  target.total = safeSum(target.total, source.total);
  for (const dimension of dimensions) {
    for (const [key, count] of Object.entries(source[dimension])) {
      target[dimension][key] = safeSum(target[dimension][key] ?? 0, count);
    }
  }
}

function safeSum(left: number, right: number) {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("A contagem temporal demográfica excedeu o limite seguro.");
  return total;
}

function boundaryIndex(boundaries: Boundary[], timestamp: number) {
  let low = 0;
  let high = boundaries.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const boundary = boundaries[middle];
    if (timestamp < boundary.from) high = middle - 1;
    else if (timestamp >= boundary.to) low = middle + 1;
    else return middle;
  }
  return -1;
}

function instant(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new RangeError("O instante temporal demográfico é inválido.");
  return timestamp;
}

function zonedClock(timeZone: string): Clock {
  const cached = clocks.get(timeZone);
  if (cached) return cached;
  const clock = createZonedClock(timeZone);
  if (clocks.size >= 16) clocks.delete(clocks.keys().next().value!);
  clocks.set(timeZone, clock);
  return clock;
}

function createZonedClock(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZone,
  });
  const parts = (timestamp: number) => {
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(timestamp))) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    const { year, month, day, hour, minute, second } = values;
    const offset = Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(timestamp / 1000) * 1000;
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { year, month, day, hour, minute, second, offset, dateKey, signature: `${dateKey}|${hour}|${offset}` };
  };
  const dayStarts = new Map<string, number>();
  return {
    timeZone: formatter.resolvedOptions().timeZone,
    parts,
    civilStart(dateKey: string) {
      const cached = dayStarts.get(dateKey);
      if (cached !== undefined) return cached;
      const wallMidnight = Date.parse(`${dateKey}T00:00:00Z`);
      let candidate = wallMidnight - parts(wallMidnight).offset;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const local = parts(candidate);
        if (local.dateKey === dateKey && parts(candidate - 1000).dateKey !== dateKey) {
          rememberDayStart(dayStarts, dateKey, candidate);
          return candidate;
        }
        const adjusted = wallMidnight - local.offset;
        if (adjusted === candidate) break;
        candidate = adjusted;
      }
      // Only irregular midnight transitions need a boundary search. Normal
      // civil days resolve with arithmetic and three formatter calls, not a
      // new Intl instance and a minute-by-minute scan for every date.
      const boundary = firstChangedSecond(wallMidnight - 36 * HOUR_MS, wallMidnight + 36 * HOUR_MS,
        (timestamp) => parts(timestamp).dateKey >= dateKey);
      // A skipped dateline date deliberately advances to the next real day;
      // no zero/missing point is fabricated for a date that never existed.
      rememberDayStart(dayStarts, dateKey, boundary);
      return boundary;
    },
    hourStart(timestamp: number) {
      const current = parts(timestamp);
      const nominal = Math.floor(timestamp / 1000) * 1000 - (current.minute * 60 + current.second) * 1000;
      if (parts(nominal).signature === current.signature) return nominal;
      // A 30-minute DST transition can start a civil-hour occurrence at :30.
      return firstChangedSecond(nominal, Math.floor(timestamp / 1000) * 1000, (candidate) => parts(candidate).signature === current.signature);
    },
    hourEnd(timestamp: number) {
      const current = parts(timestamp);
      const nominal = Math.floor(timestamp / 1000) * 1000 + (3600 - current.minute * 60 - current.second) * 1000;
      if (parts(nominal - 1000).signature === current.signature) return nominal;
      return firstChangedSecond(Math.floor(timestamp / 1000) * 1000, nominal, (candidate) => parts(candidate).signature !== current.signature);
    },
  };
}

function firstChangedSecond(from: number, to: number, changed: (timestamp: number) => boolean) {
  let low = from / 1000;
  let high = to / 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (changed(middle * 1000)) high = middle;
    else low = middle + 1;
  }
  return low * 1000;
}

function rememberDayStart(cache: Map<string, number>, key: string, value: number) {
  if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

function shiftDate(dateKey: string, days: number) {
  return new Date(Date.parse(`${dateKey}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function shiftMonth(dateKey: string, months: number) {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

function offsetLabel(offset: number) {
  const minutes = Math.abs(offset) / MINUTE_MS;
  return `UTC${offset >= 0 ? "+" : "-"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
