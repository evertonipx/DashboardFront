import {
  companyZonedDateParts,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";
import type { OccupancyDurationSummary } from "@/lib/occupancy-duration";

const MINUTE_MS = 60_000;
const MINUTE_SECONDS = 60;
const MAX_MONTH_MINUTES = 32 * 25 * 60;
const WEEK_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const expectedHourCache = new Map<string, ReadonlyMap<string, number>>();

export type OccupancyDurationInsightSeconds = {
  confirmedOccupiedSeconds: number;
  confirmedFreeSeconds: number;
  transitionSeconds: number;
  unknownSeconds: number;
  expectedSeconds: number;
};

export type OccupancyDurationInsightHour = OccupancyDurationInsightSeconds & {
  dateKey: string;
  hour: number;
};

export type OccupancyDurationInsightScenario = {
  asOf?: Date;
  scenarioId: string;
  name: string;
  hours: OccupancyDurationInsightHour[];
  error?: string;
};

export type OccupancyDurationInsightMonth = {
  from: Date;
  to: Date;
  monthEnd: Date;
  dateKeys: string[];
  timeZone: string;
};

export type OccupancyDurationInsightCell = OccupancyDurationInsightSeconds & {
  x: number;
  y: number;
  label: string;
};

export type OccupancyDurationInsightDay = OccupancyDurationInsightSeconds & {
  dateKey: string;
};

export type OccupancyDurationInsightModel = {
  dayHours: OccupancyDurationInsightCell[];
  weekHours: OccupancyDurationInsightCell[];
  scenarioHours: OccupancyDurationInsightCell[];
  days: OccupancyDurationInsightDay[];
};

/** A fixed civil-month axis; only fully closed minutes contribute duration. */
export function buildOccupancyDurationInsightMonth(
  now: Date,
  timeZone: string,
): OccupancyDurationInsightMonth {
  requireValidDate(now);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const { month, year } = companyZonedDateParts(now, canonicalTimeZone);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateKeys: string[] = [];
  let from: Date | undefined;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const start = existingCivilDay({ day, month, year }, canonicalTimeZone);
    if (!start) continue;
    from ??= start;
    dateKeys.push(civilDateKey({ day, month, year }));
  }
  if (!from) throw new RangeError("O mês civil não contém dias disponíveis.");

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let monthEnd: Date | null = null;
  for (let day = 1; day <= 3 && !monthEnd; day += 1) {
    monthEnd = existingCivilDay(
      { day, month: nextMonth, year: nextYear },
      canonicalTimeZone,
    );
  }
  if (!monthEnd) throw new RangeError("O fim do mês civil não está disponível.");
  return {
    from,
    to: new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS),
    monthEnd,
    dateKeys,
    timeZone: canonicalTimeZone,
  };
}

/**
 * Duration belongs to the scenario state, never to an individual person.
 * Splitting absolute minutes preserves repeated and skipped civil hours and
 * transitions with fractional UTC offsets. Repeated hours share one cell and
 * carry their full elapsed duration in its denominator.
 */
export function summarizeOccupancyDurationInsightHours(
  summary: OccupancyDurationSummary,
  timeZone: string,
): OccupancyDurationInsightHour[] {
  const readParts = createMinutePartsReader(timeZone);
  const hours = new Map<string, OccupancyDurationInsightHour>();
  let previousEnd = Number.NEGATIVE_INFINITY;
  let expectedSeconds = 0;
  for (const segment of summary.segments) {
    const from = requireMinuteDate(segment.from);
    const to = requireMinuteDate(segment.to);
    if (
      from < previousEnd || to <= from ||
      segment.seconds !== (to - from) / 1_000 ||
      segment.bucketCount !== (to - from) / MINUTE_MS
    ) {
      throw new RangeError("Os segmentos de duração são inconsistentes.");
    }
    previousEnd = to;
    expectedSeconds += segment.seconds;
    const field = durationField(segment.state);
    visitCivilHourSpans(from, to, readParts, ({ dateKey, hour }, seconds) => {
      const key = hourKey(dateKey, hour);
      const value = hours.get(key) ?? { dateKey, hour, ...emptySeconds() };
      value[field] += seconds;
      value.expectedSeconds += seconds;
      hours.set(key, value);
    });
  }
  if (expectedSeconds !== summary.expectedSeconds) {
    throw new RangeError("O resumo de duração não corresponde aos segmentos.");
  }
  return Array.from(hours.values()).sort(
    (left, right) => left.dateKey.localeCompare(right.dateKey) || left.hour - right.hour,
  );
}

/**
 * Every view reuses the same hourly totals. Missing elapsed time is unknown;
 * future cells have a zero denominator and must be rendered empty. Summing
 * scenarios yields scenario-seconds, so intensity is occupied / expected,
 * never occupied / observed and never a sum of individual dwell times.
 */
export function buildOccupancyDurationInsightModel(
  scenarios: readonly OccupancyDurationInsightScenario[],
  month: OccupancyDurationInsightMonth,
): OccupancyDurationInsightModel {
  const from = requireMinuteDate(month.from);
  const to = requireMinuteDate(month.to);
  const monthEnd = requireMinuteDate(month.monthEnd);
  if (to < from || to > monthEnd || monthEnd <= from ||
      (monthEnd - from) / MINUTE_MS > MAX_MONTH_MINUTES) {
    throw new RangeError("O intervalo mensal de duração é inválido.");
  }
  const dateIndexes = new Map<string, number>();
  month.dateKeys.forEach((dateKey, index) => {
    requireDateKey(dateKey);
    if (dateIndexes.has(dateKey) || (index > 0 && month.dateKeys[index - 1] >= dateKey)) {
      throw new RangeError("O calendário mensal possui dias repetidos ou fora de ordem.");
    }
    dateIndexes.set(dateKey, index);
  });

  const expected = expectedMonthHours(from, to, month.timeZone);
  for (const key of expected.keys()) {
    if (!dateIndexes.has(key.split("|")[0])) {
      throw new RangeError("O calendário mensal não contém um dia do intervalo.");
    }
  }

  const dayHours = month.dateKeys.flatMap((dateKey, x) =>
    Array.from({ length: 24 }, (_, y) => ({
      x, y, label: `${shortDate(dateKey)} · ${hourLabel(y)}`, ...emptySeconds(),
    })),
  );
  const weekHours = WEEK_LABELS.flatMap((weekday, x) =>
    Array.from({ length: 24 }, (_, y) => ({
      x, y, label: `${weekday} · ${hourLabel(y)}`, ...emptySeconds(),
    })),
  );
  const days = month.dateKeys.map((dateKey) => ({ dateKey, ...emptySeconds() }));
  const scenarioHours: OccupancyDurationInsightCell[] = [];
  const scenarioIds = new Set<string>();

  scenarios.forEach((scenario, scenarioIndex) => {
    if (!scenario.scenarioId.trim() || scenarioIds.has(scenario.scenarioId)) {
      throw new RangeError("A seleção de cenários possui identidades repetidas ou inválidas.");
    }
    scenarioIds.add(scenario.scenarioId);
    const incoming = new Map<string, OccupancyDurationInsightSeconds>();
    scenario.hours.forEach((hour) => {
      requireDateKey(hour.dateKey);
      if (!Number.isInteger(hour.hour) || hour.hour < 0 || hour.hour > 23) {
        throw new RangeError("A hora civil da duração é inválida.");
      }
      requireSeconds(hour);
      const key = hourKey(hour.dateKey, hour.hour);
      const total = incoming.get(key) ?? emptySeconds();
      addSeconds(total, hour);
      if (total.expectedSeconds > (expected.get(key) ?? 0)) {
        throw new RangeError("A duração excede os minutos fechados do período.");
      }
      incoming.set(key, total);
    });
    const hourlyScenario = Array.from({ length: 24 }, (_, x) => ({
      x, y: scenarioIndex,
      label: `${scenario.name} · ${hourLabel(x)}`,
      ...emptySeconds(),
    }));
    month.dateKeys.forEach((dateKey, dateIndex) => {
      const weekday = (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7;
      for (let hour = 0; hour < 24; hour += 1) {
        const key = hourKey(dateKey, hour);
        const total = { ...(incoming.get(key) ?? emptySeconds()) };
        const missing = (expected.get(key) ?? 0) - total.expectedSeconds;
        total.unknownSeconds += missing;
        total.expectedSeconds += missing;
        addSeconds(dayHours[dateIndex * 24 + hour], total);
        addSeconds(weekHours[weekday * 24 + hour], total);
        addSeconds(hourlyScenario[hour], total);
        addSeconds(days[dateIndex], total);
      }
    });
    scenarioHours.push(...hourlyScenario);
  });
  return { dayHours, weekHours, scenarioHours, days };
}

function emptySeconds(): OccupancyDurationInsightSeconds {
  return {
    confirmedOccupiedSeconds: 0, confirmedFreeSeconds: 0,
    transitionSeconds: 0, unknownSeconds: 0, expectedSeconds: 0,
  };
}

function addSeconds(target: OccupancyDurationInsightSeconds, source: OccupancyDurationInsightSeconds) {
  target.confirmedOccupiedSeconds += source.confirmedOccupiedSeconds;
  target.confirmedFreeSeconds += source.confirmedFreeSeconds;
  target.transitionSeconds += source.transitionSeconds;
  target.unknownSeconds += source.unknownSeconds;
  target.expectedSeconds += source.expectedSeconds;
}

function requireSeconds(value: OccupancyDurationInsightSeconds) {
  const values = [value.confirmedOccupiedSeconds, value.confirmedFreeSeconds,
    value.transitionSeconds, value.unknownSeconds, value.expectedSeconds];
  if (values.some((seconds) => !Number.isSafeInteger(seconds) || seconds < 0 || seconds % 60 !== 0) ||
      value.expectedSeconds !== value.confirmedOccupiedSeconds + value.confirmedFreeSeconds +
        value.transitionSeconds + value.unknownSeconds) {
    throw new RangeError("Os totais horários de duração são inconsistentes.");
  }
}

function durationField(state: string): Exclude<keyof OccupancyDurationInsightSeconds, "expectedSeconds"> {
  if (state === "occupied") return "confirmedOccupiedSeconds";
  if (state === "free") return "confirmedFreeSeconds";
  if (state === "transition") return "transitionSeconds";
  if (state === "unknown") return "unknownSeconds";
  throw new RangeError("O estado de duração é inválido.");
}

function createMinutePartsReader(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: requireCompanyTimeZone(timeZone), year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return (instant: number) => {
    let year = "";
    let month = "";
    let day = "";
    let hour = 0;
    let minute = 0;
    for (const part of formatter.formatToParts(instant)) {
      if (part.type === "year") year = part.value;
      else if (part.type === "month") month = part.value;
      else if (part.type === "day") day = part.value;
      else if (part.type === "hour") hour = Number(part.value);
      else if (part.type === "minute") minute = Number(part.value);
    }
    return { dateKey: `${year.padStart(4, "0")}-${month}-${day}`, hour, minute };
  };
}

function expectedMonthHours(from: number, to: number, timeZone: string) {
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const cacheKey = `${canonicalTimeZone}|${from}|${to}`;
  const cached = expectedHourCache.get(cacheKey);
  if (cached) return cached;

  const expected = new Map<string, number>();
  const readParts = createMinutePartsReader(canonicalTimeZone);
  visitCivilHourSpans(from, to, readParts, ({ dateKey, hour }, seconds) => {
    const key = hourKey(dateKey, hour);
    expected.set(key, (expected.get(key) ?? 0) + seconds);
  });
  // All widget selections share the same civil axis. Keep only a few recent
  // axes so changing a color or scenario never repeats the month projection.
  if (expectedHourCache.size >= 4) {
    expectedHourCache.delete(expectedHourCache.keys().next().value!);
  }
  expectedHourCache.set(cacheKey, expected);
  return expected;
}

type MinuteParts = { dateKey: string; hour: number; minute: number };

function visitCivilHourSpans(
  from: number,
  to: number,
  readParts: (instant: number) => MinuteParts,
  visit: (parts: MinuteParts, seconds: number) => void,
) {
  let cursor = from;
  while (cursor < to) {
    const first = readParts(cursor);
    let end = Math.min(to, cursor + (60 - first.minute) * MINUTE_MS);
    // Stable hours need two timezone projections, not 60. If an offset jump
    // crosses the civil-hour boundary early, locate that exceptional boundary
    // at minute precision. Rollbacks remain separate absolute spans and their
    // durations are later added to the same civil cell.
    const last = readParts(end - MINUTE_MS);
    if (last.dateKey !== first.dateKey || last.hour !== first.hour) {
      end = cursor + MINUTE_MS;
      while (end < to) {
        const next = readParts(end);
        if (next.dateKey !== first.dateKey || next.hour !== first.hour) break;
        end += MINUTE_MS;
      }
    }
    visit(first, ((end - cursor) / MINUTE_MS) * MINUTE_SECONDS);
    cursor = end;
  }
}

function existingCivilDay(parts: { year: number; month: number; day: number }, timeZone: string) {
  try {
    return startOfCompanyTimeZoneCivilDay(parts, timeZone);
  } catch (error) {
    if (error instanceof Error && error.message.includes("não existe no fuso")) return null;
    throw error;
  }
}

function civilDateKey({ year, month, day }: { year: number; month: number; day: number }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function requireDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new RangeError("A data civil da duração é inválida.");
  }
}

function requireValidDate(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new RangeError("O instante da duração é inválido.");
  }
  return value.getTime();
}

function requireMinuteDate(value: Date) {
  const instant = requireValidDate(value);
  if (instant % MINUTE_MS !== 0) {
    throw new RangeError("O instante da duração não corresponde a um minuto fechado.");
  }
  return instant;
}

function hourKey(dateKey: string, hour: number) { return `${dateKey}|${hour}`; }
function hourLabel(hour: number) { return `${String(hour).padStart(2, "0")}h`; }
function shortDate(dateKey: string) { return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`; }
