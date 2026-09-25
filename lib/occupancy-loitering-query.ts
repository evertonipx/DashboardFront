"use client";

import {
  requireOccupancyLoiteringSessionRows,
  requireOccupancyLoiteringSummaryRows,
  type OccupancyLoiteringExpectedArea,
  type OccupancyLoiteringSessionRow,
  type OccupancyLoiteringSummaryRow,
} from "@/lib/occupancy-loitering";
import { companyDateKey } from "@/lib/company-time-zone";
import {
  occupancyCalendarBoundaryInstant,
  shiftOccupancyCompanyDay,
} from "@/lib/occupancy-calendar";
import { fetchSharedOccupancyQuery } from "@/lib/occupancy-shared-query";

const LIVE_SUMMARY_CACHE_TTL_MS = 4_000;
const HISTORICAL_SUMMARY_CACHE_TTL_MS = 5 * 60_000;
const SESSION_CACHE_TTL_MS = 60_000;
const FULL_SESSION_PERIOD_MAX_MS = 31 * 24 * 60 * 60_000;

type OccupancyLoiteringPeriod = {
  from: Date;
  to: Date;
};

type OccupancyLoiteringQueryScope = OccupancyLoiteringPeriod & {
  companyScopeId: string;
  signal?: AbortSignal;
  timeZone: string;
};

export async function fetchOccupancyLoiteringSummary({
  bypassCache = false,
  companyScopeId,
  expectedAreas,
  from,
  live = false,
  signal,
  timeZone,
  to,
}: OccupancyLoiteringQueryScope & {
  bypassCache?: boolean;
  expectedAreas?: readonly OccupancyLoiteringExpectedArea[];
  live?: boolean;
}): Promise<OccupancyLoiteringSummaryRow[]> {
  const path = occupancyLoiteringPath("summary", {
    from,
    to,
  });
  const response = await fetchSharedOccupancyQuery<unknown>({
    bypassCache,
    cacheTtlMs: live
      ? LIVE_SUMMARY_CACHE_TTL_MS
      : HISTORICAL_SUMMARY_CACHE_TTL_MS,
    companyScopeId,
    path,
    priority: live ? "background" : "normal",
    scenarioId: "occupancy-loitering-summary",
    signal,
    timeZone,
  });
  return requireOccupancyLoiteringSummaryRows(response, expectedAreas);
}

export async function fetchOccupancyLoiteringSessions({
  bypassCache = false,
  companyScopeId,
  expectedAreas,
  from,
  signal,
  timeZone,
  to,
}: OccupancyLoiteringQueryScope & {
  bypassCache?: boolean;
  expectedAreas?: readonly OccupancyLoiteringExpectedArea[];
}): Promise<OccupancyLoiteringSessionRow[]> {
  const path = occupancyLoiteringPath("sessions", {
    from,
    to,
  });
  const response = await fetchSharedOccupancyQuery<unknown>({
    bypassCache,
    cacheTtlMs: SESSION_CACHE_TTL_MS,
    companyScopeId,
    path,
    priority: "foreground",
    scenarioId: "occupancy-loitering-sessions",
    signal,
    timeZone,
  });
  const rows = requireOccupancyLoiteringSessionRows(response, expectedAreas);
  const fromTime = from.getTime();
  const toTime = to.getTime();
  if (
    rows.some((row) => {
      const endedAt = Date.parse(row.ended_at);
      return endedAt < fromTime || endedAt >= toTime;
    })
  ) {
    throw new Error("A API retornou sessões fora do período solicitado.");
  }
  return rows;
}

export function occupancyLoiteringPath(
  resource: "sessions" | "summary",
  { from, to }: OccupancyLoiteringPeriod,
) {
  requireValidPeriod(from, to);
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return `/occupancy/loitering/${resource}?${query.toString()}`;
}

/**
 * Normal operational ranges use the exact selected [from,to) window. Very
 * long analytical ranges use one civil-day preview at a time because the
 * endpoint has no documented server-side pagination and may return one row
 * per completed session. The same range helper powers both the card preview
 * and its detailed browser.
 */
export function occupancyLoiteringSessionsQueryRange({
  dayStart,
  from,
  timeZone,
  to,
}: OccupancyLoiteringPeriod & {
  dayStart: Date;
  timeZone: string;
}): (OccupancyLoiteringPeriod & { slicedByDay: boolean }) | null {
  requireValidPeriod(from, to);
  if (to.getTime() - from.getTime() <= FULL_SESSION_PERIOD_MAX_MS) {
    return {
      from: new Date(from),
      slicedByDay: false,
      to: new Date(to),
    };
  }

  const sliceFrom = new Date(Math.max(dayStart.getTime(), from.getTime()));
  const sliceTo = new Date(
    Math.min(
      shiftOccupancyCompanyDay(dayStart, 1, timeZone).getTime(),
      to.getTime(),
    ),
  );
  return sliceFrom < sliceTo
    ? { from: sliceFrom, slicedByDay: true, to: sliceTo }
    : null;
}

/**
 * Starts the individual-session drill-down at the latest civil day contained
 * in the selected interval. This keeps long analytical ranges bounded without
 * replacing the raw `/sessions` rows with aggregate `/summary` data.
 */
export function initialOccupancyLoiteringSessionDay({
  from,
  timeZone,
  to,
}: OccupancyLoiteringPeriod & { timeZone: string }) {
  requireValidPeriod(from, to);
  const lastInstant = new Date(
    Math.max(
      from.getTime(),
      Math.min(to.getTime() - 1, Date.now()),
    ),
  );
  const [year, month, day] = companyDateKey(lastInstant, timeZone)
    .split("-")
    .map(Number);
  const civil = new Date(0);
  civil.setFullYear(year, month - 1, day);
  civil.setHours(0, 0, 0, 0);
  return occupancyCalendarBoundaryInstant(civil, timeZone);
}

function requireValidPeriod(from: Date, to: Date) {
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from.getTime() >= to.getTime()
  ) {
    throw new Error("O período de permanência selecionado é inválido.");
  }
}
