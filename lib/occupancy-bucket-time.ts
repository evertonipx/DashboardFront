import { isAggregateBucketAligned } from "@/lib/aggregate-time";
import {
  companyZonedDateParts,
  requireCompanyTimeZone,
} from "@/lib/company-time-zone";
import type { AggregateGranularity } from "@/lib/types";

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const EXPLICIT_OFFSET_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const zonedOffsetCandidatesCache = new Map<string, number[]>();

type DateTimeParts = {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

/**
 * Converts an offset-less occupancy bucket from company wall time to an
 * explicit RFC3339 instant. Repeated or skipped DST wall times are rejected:
 * without an offset, neither one can be certified safely.
 */
export function normalizeOccupancyInstantBucketInTimeZone(
  value: string,
  granularity: Extract<AggregateGranularity, "minute" | "hour">,
  timeZone?: string,
) {
  if (EXPLICIT_OFFSET_SUFFIX_PATTERN.test(value)) {
    return isAggregateBucketAligned(value, granularity) ? value : null;
  }

  const local = parseLocalDateTimeParts(value);
  if (!local || !isInstantBucketPartsAligned(local, granularity)) return null;
  if (!timeZone) {
    throw new Error(
      "O timezone IANA esperado é obrigatório para interpretar um bucket de ocupação sem offset.",
    );
  }

  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const candidates = resolveWallClockCandidates(local, canonicalTimeZone);
  if (!candidates.length) {
    throw new Error(
      `O bucket local "${value}" não existe no fuso ${canonicalTimeZone}; a API deve enviar um instante RFC3339 explícito.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `O bucket local "${value}" é ambíguo no fuso ${canonicalTimeZone}; a API deve enviar o offset RFC3339 explícito.`,
    );
  }

  return formatWallClockWithOffset(local, candidates[0], canonicalTimeZone);
}

function parseLocalDateTimeParts(value: string): DateTimeParts | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match || hasNonZeroFractionalSecond(value)) return null;

  const parts = {
    day: Number(match[3]),
    hour: Number(match[4]),
    millisecond: 0,
    minute: Number(match[5]),
    month: Number(match[2]),
    second: Number(match[6] ?? 0),
    year: Number(match[1]),
  };
  const date = utcDateFromParts(parts);
  return date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day &&
    date.getUTCHours() === parts.hour &&
    date.getUTCMinutes() === parts.minute &&
    date.getUTCSeconds() === parts.second
    ? parts
    : null;
}

function hasNonZeroFractionalSecond(value: string) {
  const fraction = /\.(\d+)/.exec(value)?.[1];
  return Boolean(fraction && /[1-9]/.test(fraction));
}

function isInstantBucketPartsAligned(
  parts: DateTimeParts,
  granularity: "minute" | "hour",
) {
  return (
    parts.second === 0 &&
    parts.millisecond === 0 &&
    (granularity === "minute" || parts.minute === 0)
  );
}

function resolveWallClockCandidates(parts: DateTimeParts, timeZone: string) {
  const nominal = utcDateFromParts(parts).getTime();
  const candidates = candidateTimeZoneOffsets(parts, timeZone).flatMap(
    (offsetSeconds) => {
      const candidate = new Date(nominal - offsetSeconds * 1_000);
      const actual = companyZonedDateParts(candidate, timeZone);
      return sameWallClockParts(actual, parts) ? [candidate] : [];
    },
  );

  return Array.from(
    new Map(candidates.map((candidate) => [candidate.getTime(), candidate])).values(),
  ).sort((left, right) => left.getTime() - right.getTime());
}

function candidateTimeZoneOffsets(parts: DateTimeParts, timeZone: string) {
  const dateKey = `${timeZone}|${parts.year}-${parts.month}-${parts.day}`;
  const cached = zonedOffsetCandidatesCache.get(dateKey);
  if (cached) return cached;

  const nominal = utcDateFromParts(parts).getTime();
  const offsets = new Set<number>();
  for (let hourDelta = -48; hourDelta <= 48; hourDelta += 6) {
    const probe = new Date(nominal + hourDelta * 60 * 60_000);
    const zoned = companyZonedDateParts(probe, timeZone);
    const projected = utcDateFromParts({ ...zoned, millisecond: 0 }).getTime();
    const offsetSeconds = (projected - probe.getTime()) / 1_000;
    if (Number.isInteger(offsetSeconds)) offsets.add(offsetSeconds);
  }

  const result = Array.from(offsets);
  zonedOffsetCandidatesCache.set(dateKey, result);
  if (zonedOffsetCandidatesCache.size > 800) {
    zonedOffsetCandidatesCache.clear();
    zonedOffsetCandidatesCache.set(dateKey, result);
  }
  return result;
}

function formatWallClockWithOffset(
  parts: DateTimeParts,
  instant: Date,
  timeZone: string,
) {
  const nominal = utcDateFromParts(parts).getTime();
  const offsetSeconds = (nominal - instant.getTime()) / 1_000;
  if (!Number.isInteger(offsetSeconds) || offsetSeconds % 60 !== 0) {
    throw new Error(
      `O fuso ${timeZone} usa um offset histórico que não pode ser serializado com segurança em RFC3339.`,
    );
  }

  const offsetMinutes = offsetSeconds / 60;
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHour = Math.floor(absoluteOffset / 60);
  const offsetMinute = absoluteOffset % 60;
  const pad = (number: number, length = 2) =>
    String(number).padStart(length, "0");
  const result = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(
    parts.day,
  )}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${pad(
    offsetHour,
  )}:${pad(offsetMinute)}`;
  if (Date.parse(result) !== instant.getTime()) {
    throw new Error("O bucket local de ocupação não pôde ser normalizado.");
  }
  return result;
}

function sameWallClockParts(
  actual: {
    day: number;
    hour: number;
    minute: number;
    month: number;
    second: number;
    year: number;
  },
  expected: DateTimeParts,
) {
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute &&
    actual.second === expected.second
  );
}

function utcDateFromParts(parts: DateTimeParts) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return date;
}
