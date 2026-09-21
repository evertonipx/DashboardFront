import {
  companyDateTimeLocalInstant,
  companyZonedDateParts,
} from "@/lib/company-time-zone";
import type { AggregateEventRow, AggregateGranularity } from "@/lib/types";

const FLOATING_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

/**
 * The legacy aggregate contract may return SQL wall-clock buckets without an
 * offset. Convert those buckets to explicit instants at the fetch boundary so
 * all downstream filters remain independent from the browser timezone.
 */
export function normalizeCountingAggregateRowsTimeZone(
  rows: readonly AggregateEventRow[],
  granularity: AggregateGranularity,
  timeZone?: string,
): AggregateEventRow[] {
  if (!timeZone || (granularity !== "minute" && granularity !== "hour")) {
    return rows.map((row) => ({ ...row }));
  }

  const normalizedBuckets = new Map<string, string>();
  return rows.map((row, index) => {
    const match = FLOATING_DATE_TIME.exec(row.bucket);
    if (!match) return { ...row };
    const cached = normalizedBuckets.get(row.bucket);
    if (cached) return { ...row, bucket: cached };
    const localValue = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${
      match[5]
    }:${match[6] ?? "00"}`;
    const instant = companyDateTimeLocalInstant(localValue, timeZone);
    if (!instant) {
      throw new Error(
        `A API retornou um bucket civil inexistente no fuso da empresa na posição ${index}.`,
      );
    }
    const milliseconds = Number(
      (match[7] ?? "").padEnd(3, "0").slice(0, 3),
    );
    if (hasLaterRepeatedWallClockInstant(instant, timeZone)) {
      throw new Error(
        `A API retornou um bucket civil ambíguo no fuso da empresa na posição ${index}; o backend deve enviar um instante RFC 3339 com offset.`,
      );
    }
    const normalized = new Date(
      instant.getTime() + milliseconds,
    ).toISOString();
    normalizedBuckets.set(row.bucket, normalized);
    return {
      ...row,
      bucket: normalized,
    };
  });
}

function hasLaterRepeatedWallClockInstant(first: Date, timeZone: string) {
  const expected = companyZonedDateParts(first, timeZone);
  // Repeated civil buckets occur only around a backward offset transition.
  // Probe the possible post-transition offsets, then certify an exact match.
  for (let hours = 1; hours <= 6; hours += 1) {
    const probe = new Date(first.getTime() + hours * 60 * 60_000);
    const probeParts = companyZonedDateParts(probe, timeZone);
    const firstOffset = zonedOffsetMinutes(first, expected);
    const probeOffset = zonedOffsetMinutes(probe, probeParts);
    if (probeOffset === firstOffset) continue;
    const wallClockAsUtc = Date.UTC(
      expected.year,
      expected.month - 1,
      expected.day,
      expected.hour,
      expected.minute,
      expected.second,
    );
    const candidate = new Date(wallClockAsUtc - probeOffset * 60_000);
    if (candidate <= first) continue;
    const parts = companyZonedDateParts(candidate, timeZone);
    if (
      parts.year === expected.year &&
      parts.month === expected.month &&
      parts.day === expected.day &&
      parts.hour === expected.hour &&
      parts.minute === expected.minute &&
      parts.second === expected.second
    ) {
      return true;
    }
  }
  return false;
}

function zonedOffsetMinutes(
  instant: Date,
  parts: ReturnType<typeof companyZonedDateParts>,
) {
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - instant.getTime()
  ) / 60_000;
}
