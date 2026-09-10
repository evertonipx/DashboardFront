import { companyDateKey, companyZonedDateParts, startOfCompanyTimeZoneCivilDay } from "@/lib/company-time-zone";

export type DemographicComparisonMode = "previous-period" | "previous-week" | "previous-month";

/** Calendar comparisons follow the company's clock, never browser time or
 * fixed 24-hour subtraction. A live day compares only the matching civil cut. */
export function buildDemographicComparisonWindow({ startInput, endInput, mode, timeZone, cutoff }: {
  startInput: string;
  endInput: string;
  mode: DemographicComparisonMode;
  timeZone: string;
  cutoff: Date;
}) {
  const start = civilDate(startInput);
  const end = civilDate(endInput);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 366 || !Number.isFinite(cutoff.getTime())) throw new RangeError("Período de comparação inválido.");
  const shift = (date: Date) => mode === "previous-month" ? previousMonth(date)
    : new Date(date.getTime() - (mode === "previous-week" ? 7 : days) * 86_400_000);
  const baselineStart = key(shift(start));
  const closesMonth = end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const baselineEnd = key(mode === "previous-month" && start.getUTCDate() === 1 && closesMonth
    ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)) : shift(end));
  const from = dayStart(baselineStart, timeZone);
  const completeEnd = dayStart(key(new Date(civilDate(baselineEnd).getTime() + 86_400_000)), timeZone);
  const selectedEnd = dayStart(key(new Date(end.getTime() + 86_400_000)), timeZone);
  const partial = cutoff < selectedEnd;
  let to = completeEnd;
  if (partial) {
    const currentDay = companyDateKey(cutoff, timeZone);
    const elapsedDays = Math.max(0, Math.round((civilDate(currentDay).getTime() - start.getTime()) / 86_400_000));
    const targetDay = mode === "previous-month" ? key(previousMonth(civilDate(currentDay)))
      : key(new Date(civilDate(baselineStart).getTime() + elapsedDays * 86_400_000));
    to = civilClockCutoff(targetDay, cutoff, timeZone);
    if (to > completeEnd) to = completeEnd;
    if (to < from) to = from;
  }
  return {
    from,
    to,
    startInput: baselineStart,
    endInput: baselineEnd,
    partial,
    label: `${formatDate(baselineStart)}${baselineStart === baselineEnd ? "" : ` a ${formatDate(baselineEnd)}`}${partial ? " · até o mesmo horário" : ""}`,
  };
}

function civilClockCutoff(dateKey: string, reference: Date, timeZone: string) {
  const parts = companyZonedDateParts(reference, timeZone);
  const desiredMinute = parts.hour * 60 + parts.minute;
  const start = dayStart(dateKey, timeZone);
  const end = dayStart(key(new Date(civilDate(dateKey).getTime() + 86_400_000)), timeZone);
  // Locate the earliest matching civil minute; if DST skips it, use the first
  // available minute after the gap. No device timezone enters the calculation.
  for (let instant = start.getTime(); instant < end.getTime(); instant += 60_000) {
    const candidate = new Date(instant);
    const local = companyZonedDateParts(candidate, timeZone);
    if (local.hour * 60 + local.minute >= desiredMinute) return candidate;
  }
  return end;
}

function previousMonth(date: Date) {
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
  return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(date.getUTCDate(), last.getUTCDate())));
}

function civilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Data civil inválida.");
  const result = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || key(result) !== value) throw new RangeError("Data civil inválida.");
  return result;
}

function dayStart(value: string, timeZone: string) {
  const date = civilDate(value);
  return startOfCompanyTimeZoneCivilDay({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, timeZone);
}

function key(date: Date) { return date.toISOString().slice(0, 10); }
function formatDate(value: string) { return value.split("-").reverse().join("/"); }
