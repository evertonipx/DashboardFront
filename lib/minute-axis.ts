import {
  companyZonedDateParts,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MAX_REAL_MINUTES_PER_CIVIL_DAY = 26 * MINUTES_PER_HOUR;
const MAX_CIVIL_MINUTE_MAPS = 8;

type CivilMinuteMap = {
  availableIndexes: ReadonlySet<number>;
  dayEndMs: number;
  dayStartMs: number;
  indexByInstant: ReadonlyMap<number, number>;
};

const civilMinuteMapCache = new Map<string, CivilMinuteMap>();

export type MinuteAxisPoint = {
  bucket: string;
  total: number;
};

export type MinuteDayAxisStatus =
  | "elapsed"
  | "current"
  | "future"
  | "unavailable";

export type MinuteDayAxisSlot = {
  index: number;
  label: string;
  status: MinuteDayAxisStatus;
  value: number | null;
};

export const MINUTE_OF_DAY_LABELS = Array.from(
  { length: MINUTES_PER_DAY },
  (_, index) => {
    const hour = Math.floor(index / MINUTES_PER_HOUR);
    const minute = index % MINUTES_PER_HOUR;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  },
);

export function minuteDayHourAxisLabel(index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MINUTES_PER_DAY) {
    return "";
  }
  return index % MINUTES_PER_HOUR === 0
    ? `${String(index / MINUTES_PER_HOUR).padStart(2, "0")}h`
    : "";
}

/**
 * Projects real minute buckets onto the 1,440 civil positions of one day.
 * Repeated DST minutes are summed into the same position; minutes that do not
 * exist during a forward clock transition remain unavailable instead of zero.
 */
export function buildFixedMinuteDayAxis({
  day,
  points,
  referenceTime,
  timeZone,
}: {
  day: Date;
  points: readonly MinuteAxisPoint[];
  referenceTime: Date;
  timeZone: string;
}): MinuteDayAxisSlot[] {
  requireValidDate(day, "O dia do eixo minuto a minuto é inválido.");
  requireValidDate(
    referenceTime,
    "A referência do eixo minuto a minuto é inválida.",
  );

  const targetParts = companyZonedDateParts(day, timeZone);
  const targetIdentity = civilDateIdentity(targetParts);
  const targetOrdinal = civilDateOrdinal(targetParts);
  const civilMinuteMap = resolveCivilMinuteMap(
    targetParts,
    targetIdentity,
    timeZone,
  );

  const totals = new Map<number, number>();
  points.forEach((point, position) => {
    const bucket = new Date(point.bucket);
    if (Number.isNaN(bucket.getTime())) {
      throw new RangeError(
        `O bucket minuto a minuto na posição ${position} é inválido.`,
      );
    }
    if (!Number.isSafeInteger(point.total)) {
      throw new RangeError(
        `O total minuto a minuto na posição ${position} é inválido.`,
      );
    }

    if (
      bucket.getTime() < civilMinuteMap.dayStartMs ||
      bucket.getTime() >= civilMinuteMap.dayEndMs
    ) {
      return;
    }
    const index = civilMinuteMap.indexByInstant.get(bucket.getTime());
    if (index === undefined) {
      throw new RangeError(
        `O bucket minuto a minuto na posição ${position} não está alinhado ao minuto civil.`,
      );
    }
    const total = (totals.get(index) ?? 0) + point.total;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(
        "A soma minuto a minuto excedeu o intervalo numérico seguro.",
      );
    }
    totals.set(index, total);
  });

  const referenceParts = companyZonedDateParts(referenceTime, timeZone);
  const referenceOrdinal = civilDateOrdinal(referenceParts);
  const throughIndex =
    referenceOrdinal < targetOrdinal
      ? -1
      : referenceOrdinal > targetOrdinal
        ? MINUTES_PER_DAY - 1
        : minuteOfDayIndex(referenceParts.hour, referenceParts.minute);

  return MINUTE_OF_DAY_LABELS.map((label, index) => {
    if (index > throughIndex) {
      return { index, label, status: "future", value: null };
    }
    if (!civilMinuteMap.availableIndexes.has(index)) {
      return { index, label, status: "unavailable", value: null };
    }
    return {
      index,
      label,
      status:
        referenceOrdinal === targetOrdinal && index === throughIndex
          ? "current"
          : "elapsed",
      value: totals.get(index) ?? 0,
    };
  });
}

function resolveCivilMinuteMap(
  targetParts: { day: number; month: number; year: number },
  targetIdentity: string,
  timeZone: string,
): CivilMinuteMap {
  const cacheKey = `${timeZone}|${targetIdentity}`;
  const cached = civilMinuteMapCache.get(cacheKey);
  if (cached) return cached;

  const dayStart = startOfCompanyTimeZoneCivilDay(targetParts, timeZone);
  const nextCivilDate = new Date(
    Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day + 1),
  );
  const dayEnd = startOfCompanyTimeZoneCivilDay(
    {
      day: nextCivilDate.getUTCDate(),
      month: nextCivilDate.getUTCMonth() + 1,
      year: nextCivilDate.getUTCFullYear(),
    },
    timeZone,
  );
  const availableIndexes = new Set<number>();
  const indexByInstant = new Map<number, number>();

  let cursor = dayStart.getTime();
  let realMinuteCount = 0;
  while (cursor < dayEnd.getTime()) {
    const parts = companyZonedDateParts(new Date(cursor), timeZone);
    if (civilDateIdentity(parts) === targetIdentity) {
      const index = minuteOfDayIndex(parts.hour, parts.minute);
      availableIndexes.add(index);
      indexByInstant.set(cursor, index);
    }
    cursor += 60_000;
    realMinuteCount += 1;
    if (realMinuteCount > MAX_REAL_MINUTES_PER_CIVIL_DAY) {
      throw new RangeError(
        "O dia civil excedeu o limite seguro do eixo minuto a minuto.",
      );
    }
  }

  const result = {
    availableIndexes,
    dayEndMs: dayEnd.getTime(),
    dayStartMs: dayStart.getTime(),
    indexByInstant,
  } satisfies CivilMinuteMap;
  civilMinuteMapCache.set(cacheKey, result);
  while (civilMinuteMapCache.size > MAX_CIVIL_MINUTE_MAPS) {
    const oldestKey = civilMinuteMapCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    civilMinuteMapCache.delete(oldestKey);
  }
  return result;
}

function minuteOfDayIndex(hour: number, minute: number) {
  return hour * MINUTES_PER_HOUR + minute;
}

function civilDateIdentity(parts: {
  day: number;
  month: number;
  year: number;
}) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(
    2,
    "0",
  )}-${String(parts.day).padStart(2, "0")}`;
}

function civilDateOrdinal(parts: {
  day: number;
  month: number;
  year: number;
}) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function requireValidDate(value: Date, message: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError(message);
  }
}
