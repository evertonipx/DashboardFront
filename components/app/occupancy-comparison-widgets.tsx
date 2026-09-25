"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Grid3X3,
  Hexagon,
  LineChart,
  Palette,
  RotateCcw,
  Trophy,
} from "lucide-react";

import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import type { LayoutCard, LayoutCardRenderContext } from "@/components/app/card-layout";
import { getOccupancyChartPalette } from "@/components/app/occupancy-chart-palette";
import { OccupancyHexLayoutEditor } from "@/components/app/deferred-occupancy-hex-layout-editor";
import { OccupancyPaletteSelect } from "@/components/app/occupancy-palette-select";
import { useTheme } from "@/components/app/theme-provider";
import {
  WidgetTitleText,
  useWidgetColor,
} from "@/components/app/widget-appearance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aggregateQueryIso,
  endOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  companyCalendarDate,
  companyTimeZoneHour,
  endOfCompanyTimeZoneHour,
  requireCompanyTimeZone,
} from "@/lib/company-time-zone";
import {
  fetchOccupancyCivilAggregate,
  type OccupancyCivilAggregateUnitCache,
} from "@/lib/occupancy-civil-aggregate-query";
import {
  createOccupancyQueryScheduler,
  OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS,
  OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID,
  OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,
  occupancyLiveCivilFallbackRequestLimit,
  occupancyLiveSnapshotQuery,
} from "@/lib/occupancy-dashboard-query";
import {
  fetchSharedOccupancyQuery,
  sharedOccupancyCivilCapabilities,
} from "@/lib/occupancy-shared-query";
import {
  occupancyCalendarBoundaryInstant,
  shiftOccupancyCalendarDate,
} from "@/lib/occupancy-calendar";
import { getOccupancyColorPalette } from "@/lib/occupancy-color-palettes";
import {
  formatOccupancyCount,
  formatOccupancyIntegerAxisTick,
  growOccupancyComparisonAxisMaximum,
  occupancyComparisonAxisScopeKey,
  updateOccupancyComparisonAxisMemory,
} from "@/lib/occupancy-current-comparison-axis";
import {
  buildOccupancyHeatmapVisualMaps,
  occupancyHeatmapStateColors,
  occupancyHeatmapPalette,
} from "@/lib/occupancy-heatmap-visual";
import {
  getOccupancyHexPalette,
  ensureGraphicContrast,
  occupancyHexDisplayRadiusRatio,
  occupancyHexTextColor,
  occupancyHexValueColor,
  type OccupancyHexPalette,
} from "@/lib/occupancy-hex-palette";
import {
  buildOccupancyHexVisualScale,
  type OccupancyHexVisualScale,
} from "@/lib/occupancy-hex-visual";
import {
  createDefaultOccupancyHexLayout,
  occupancyHexShouldAnimate,
  occupancyHexViewportMetrics,
  type OccupancyHexDensity,
} from "@/lib/occupancy-hex-layout";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  occupancyAggregateBucketKey,
  occupancyAggregateCoverageWarning,
  occupancyAggregateMetadataWarning,
  occupancyAggregatePresentationWarning,
  requireOccupancyAggregateRows,
  type OccupancyAggregateMetric,
} from "@/lib/occupancy-aggregate-validation";
import {
  buildOccupancyAnnualMaximumPoints,
  buildOccupancyClosedMinuteRange,
  buildOccupancyComparisonBarEntries,
  buildOccupancyCurrentHourRange,
  buildDaysHoursOccupancyCells,
  buildOccupancyFixedHourlyPeakValues,
  buildOccupancyHalfDonutEntries,
  buildOccupancyHexLayout,
  buildOccupancyHourlyRange,
  buildOccupancyLiveRaceEntries,
  buildOccupancyMaximumTrendRanges,
  buildOccupancyPeakValues,
  localDateKey,
  mergeOccupancyMaximumTrendOpenPeak,
  OCCUPANCY_FIXED_HOUR_LABELS,
  occupancySnapshotTotalWithinHour,
  occupancyMaximumTrendBucketLabels,
  occupancyHalfDonutMinimumAngle,
  type OccupancyComparisonBarEntry,
  type OccupancyHalfDonutEntry,
  type OccupancyHalfDonutMode,
  type OccupancyLiveRaceEntry,
  type OccupancyComparisonMetricKey,
  type OccupancyHeatmapCell,
  type OccupancyHexPosition,
  type OccupancyMaximumTrendRange,
  type OccupancyMaximumTrendRanges,
  type OccupancyScenarioHourlySeries,
  type OccupancyScenarioSnapshot,
} from "@/lib/occupancy-comparison";
import {
  buildOccupancyScenarioColorMap,
  occupancyScenarioColor,
} from "@/lib/occupancy-scenario-color";
import {
  buildOccupancyScenarioCurrentHistory,
  buildOccupancyScenarioSnapshotValue,
  mergeOccupancyScenarioCurrentHistory,
  occupancyScenarioSnapshotHasCompleteCoverage,
} from "@/lib/occupancy-scenario-snapshots";
import {
  buildOccupancyScenarioHeatmapRange,
  buildOccupancyScenarioPeriodHeatmap,
  occupancyScenarioHeatmapGranularityLabel,
  occupancyScenarioHeatmapPeriodDescription,
  updateOccupancyScenarioHeatmapAttemptedBuckets,
  type OccupancyScenarioHeatmapGranularity,
} from "@/lib/occupancy-scenario-heatmap";
import {
  DEFAULT_OCCUPANCY_STATUS_COLORS,
  DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
  loadOccupancyWidgetSettings,
  OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
  OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
  OCCUPANCY_STATUS_COLOR_PRESETS,
  occupancyStatusColorsAreDistinct,
  occupancyStatusColorsForPreset,
  saveOccupancyWidgetSettings,
  type OccupancyStatusColors,
  type OccupancyWidgetSettings,
} from "@/lib/occupancy-widget-settings";
import {
  requireOccupancyCurrentSnapshotRows,
  requireOccupancyHistoryResponse,
} from "@/lib/occupancy-validation";
import {
  OCCUPANCY_COMPARISON_REPORT_CARD_IDS,
  buildOccupancyComparisonSelectionPlan,
  buildOccupancyComparisonReportSelectionPlan,
  filterOccupancyComparisonRows,
  occupancyComparisonSnapshotRefreshIntervalMs,
  resolveOccupancyComparisonInheritedScenarioIds,
  resolveOccupancyComparisonScenarioIds,
  selectOccupancyComparisonSharedSource,
} from "@/lib/occupancy-comparison-selection";
import type {
  AggregateGranularity,
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioHistoryResponse,
} from "@/lib/types";
import type { ReportChart } from "@/lib/report-export";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { CardPreference } from "@/lib/view-preferences";

const DEFAULT_SNAPSHOT_REFRESH_MS = 5_000;
const DEFAULT_AGGREGATE_REFRESH_MS = 60_000;
const DEFAULT_MAXIMUM_TREND_REFRESH_MS = 60 * 60_000;
const MAXIMUM_TREND_FULL_REFRESH_MS = 24 * 60 * 60_000;
const HOURLY_AGGREGATE_FULL_REFRESH_MS = 24 * 60 * 60_000;
const HOURLY_AGGREGATE_RETRY_MS = 5 * 60_000;
const SCENARIO_HEATMAP_FULL_REFRESH_MS = 24 * 60 * 60_000;
const SCENARIO_HEATMAP_RETRY_MS = 5 * 60_000;
const MAX_SCENARIO_HEATMAP_CIVIL_UNIT_CACHE_ENTRIES = 100_000;
const MAXIMUM_TREND_RETRY_DELAYS_MS = [
  60_000,
  120_000,
  240_000,
  480_000,
  900_000,
] as const;
const CURRENT_HOUR_MAXIMUM_OVERLAP_MS = 5 * 60_000;
const CURRENT_HOUR_MAXIMUM_RETRY_DELAYS_MS = [
  60_000,
  120_000,
  240_000,
  480_000,
  900_000,
] as const;
const MAX_PARALLEL_REQUESTS = 4;

export const OCCUPANCY_COMPARISON_CARD_IDS = [
  ...OCCUPANCY_COMPARISON_REPORT_CARD_IDS,
] as const;

const OCCUPANCY_HISTORICAL_SNAPSHOT_CARD_IDS = new Set([
  "occupancy_scenario_half_donut",
  "occupancy_scenario_bar_race",
  "occupancy_hex_layout",
  "occupancy_duration_transitions",
]);
const OCCUPANCY_HOURLY_AGGREGATE_CARD_IDS = new Set([
  "occupancy_scenario_max_hour",
  "occupancy_day_hour_heatmap",
]);
const OCCUPANCY_CURRENT_HOUR_MAXIMUM_CARD_IDS = new Set([
  "occupancy_scenario_max_hour",
  "occupancy_scenario_max_month",
  "occupancy_scenario_max_year",
]);
const OCCUPANCY_MAXIMUM_TREND_CARD_IDS = new Set([
  "occupancy_scenario_max_month",
  "occupancy_scenario_max_year",
]);
type ComparisonLayoutCard = LayoutCard;

export type OccupancyComparisonReportAsset = {
  cardId: string;
  chart: ReportChart;
};

export type OccupancyComparisonReportSnapshot = {
  /** Fechamento certificado pela mesma leitura que produziu os assets. */
  dataCompleteUntil: Date | null | undefined;
  reportAssets: OccupancyComparisonReportAsset[];
};

export type OccupancyComparisonHistoricalPeriod = {
  /** Primeiro instante incluído na consulta. */
  from: Date;
  /** Primeiro instante excluído da consulta. */
  to: Date;
  /** Instante do fechamento exibido pelos widgets de estado. */
  referenceAt: Date;
  contextLabel: string;
};

export type OccupancyComparisonRefreshMode = "manual" | "poll";

type SnapshotDataset = {
  loading: boolean;
  requestedAt: Date | null;
  scopeKey: string;
  snapshots: OccupancyScenarioSnapshot[];
};

type SnapshotCacheEntry = {
  completedAt: number;
  history?: OccupancyScenarioHistoryResponse;
  refreshVersion: number;
  snapshot: OccupancyScenarioSnapshot;
};

type AggregateDataset = {
  buckets: Date[];
  from: Date | null;
  loading: boolean;
  scopeKey: string;
  series: OccupancyScenarioHourlySeries[];
  to: Date | null;
};

type HourlyAggregateCacheEntry = {
  attemptedBucketKeys: Set<number>;
  completedAt: number;
  coverageRetryBucketKeys: Set<number>;
  lastFullAttemptAt: number;
  retryAt: number;
  series: OccupancyScenarioHourlySeries;
};

type ScenarioHeatmapDataset = AggregateDataset & {
  granularity: OccupancyScenarioHeatmapGranularity;
};

type ScenarioHeatmapCacheEntry = {
  attemptedBucketKeys: Set<number>;
  completedAt: number;
  coverageRetryBucketKeys: Set<number>;
  lastFullAttemptAt: number;
  refreshVersion: number;
  retryAt: number;
  series: OccupancyScenarioHourlySeries;
};

export type OccupancySharedHourlyAggregate = {
  buckets: Date[];
  from: Date;
  series: OccupancyScenarioHourlySeries | null;
  to: Date;
};

type MaximumTrendDataset = {
  loading: boolean;
  ranges: OccupancyMaximumTrendRanges | null;
  scopeKey: string;
  series: OccupancyScenarioHourlySeries[];
};

type MaximumTrendCacheEntry = {
  completedAt: number;
  rangeKey: string;
  series: OccupancyScenarioHourlySeries;
};

type CurrentHourMaximumDataset = {
  bucket: Date | null;
  loading: boolean;
  scopeKey: string;
  series: OccupancyScenarioOpenMaximumSeries[];
};

type OccupancyComparisonResourceFreshness = {
  completedAt: number;
  refreshVersion: number;
  scopeKey: string;
  windowKey: string;
};

type OccupancyComparisonFreshness = {
  aggregate: OccupancyComparisonResourceFreshness;
  currentHourMaximum: OccupancyComparisonResourceFreshness;
  maximumTrend: OccupancyComparisonResourceFreshness;
  snapshots: OccupancyComparisonResourceFreshness;
};

type OccupancyScenarioOpenMaximumSeries = {
  error?: string;
  name: string;
  peaks: Map<number, number>;
  scenarioId: string;
  source: "hour" | "observed";
  warning?: string;
};

type CurrentHourMaximumCacheEntry = {
  failures: number;
  hour: number;
  minutePeaks: Map<number, number>;
  retryAt: number;
  through: number;
  warning?: string;
};

type OccupancyMaximumLineGranularity = "hour" | "month" | "year";

type OccupancyMaximumLineSeries = {
  error?: string;
  name: string;
  partialIndexes?: number[];
  scenarioId: string;
  values: Array<number | null>;
  warning?: string;
};

type SettingsState = {
  scopeKey: string;
  value: OccupancyWidgetSettings;
};

type OccupancyScenarioRow = { scenarioId: string };
type ComparisonRetryState = { failures: number; retryAt: number };

type OccupancyHistoricalComparisonRanges = {
  hourly: OccupancyMaximumTrendRange | null;
  maximumTrend: OccupancyMaximumTrendRanges | null;
  scenarioHeatmap: OccupancyMaximumTrendRange | null;
};

type OccupancyHistoricalComparisonDataset = {
  hourlyRange: OccupancyMaximumTrendRange | null;
  hourlySeries: OccupancyScenarioHourlySeries[];
  maximumTrendRanges: OccupancyMaximumTrendRanges | null;
  maximumTrendSeries: OccupancyScenarioHourlySeries[];
  scenarioHeatmapRange: OccupancyMaximumTrendRange | null;
  scenarioHeatmapSeries: OccupancyScenarioHourlySeries[];
  snapshots: OccupancyScenarioSnapshot[];
};

type OccupancyHistoricalComparisonLoadPlan = {
  hourlyScenarioIds: readonly string[];
  maximumTrendScenarioIds: readonly string[];
  needsHourlyAggregate: boolean;
  needsMaximumTrend: boolean;
  needsScenarioHeatmap: boolean;
  needsSnapshots: boolean;
  scenarioHeatmapScenarioIds: readonly string[];
  snapshotScenarioIds: readonly string[];
};

const EMPTY_OCCUPANCY_SNAPSHOTS: OccupancyScenarioSnapshot[] = [];
const EMPTY_OCCUPANCY_BUCKETS: Date[] = [];
const EMPTY_OCCUPANCY_SCENARIO_IDS: readonly string[] = [];
const EMPTY_OCCUPANCY_HOURLY_SERIES: OccupancyScenarioHourlySeries[] = [];
const EMPTY_OCCUPANCY_OPEN_MAXIMUM_SERIES: OccupancyScenarioOpenMaximumSeries[] = [];
const SHARED_OCCUPANCY_SNAPSHOT_CACHE = new Map<string, SnapshotCacheEntry>();
const SHARED_OCCUPANCY_HOURLY_AGGREGATE_CACHE = new Map<
  string,
  HourlyAggregateCacheEntry
>();
const SHARED_OCCUPANCY_SCENARIO_HEATMAP_CACHE = new Map<
  string,
  ScenarioHeatmapCacheEntry
>();
const SHARED_OCCUPANCY_CURRENT_HOUR_MAXIMUM_CACHE = new Map<
  string,
  CurrentHourMaximumCacheEntry
>();
const SHARED_OCCUPANCY_MAXIMUM_TREND_CACHE = new Map<
  string,
  MaximumTrendCacheEntry
>();
const SHARED_OCCUPANCY_MAXIMUM_TREND_ATTEMPTS = new Map<string, number>();
const SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES = new Map<
  string,
  ComparisonRetryState
>();
const MAX_SHARED_COMPARISON_CACHE_ENTRIES = 320;

export function occupancyComparisonHistoricalPeriodKey(
  period: OccupancyComparisonHistoricalPeriod | null | undefined,
) {
  if (!period) return "";
  const normalized = requireOccupancyComparisonHistoricalPeriod(period);
  return JSON.stringify([
    normalized.from.getTime(),
    normalized.to.getTime(),
    normalized.referenceAt.getTime(),
    normalized.contextLabel,
  ]);
}

export function occupancyComparisonHistoricalPeriodFromKey(
  key: string,
): OccupancyComparisonHistoricalPeriod | null {
  if (!key) return null;
  const parsed = JSON.parse(key) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 4) {
    throw new TypeError("O período histórico de comparação é inválido.");
  }
  const [from, to, referenceAt, contextLabel] = parsed;
  return requireOccupancyComparisonHistoricalPeriod({
    contextLabel: typeof contextLabel === "string" ? contextLabel : "",
    from: new Date(requireFiniteTimestamp(from, "início")),
    referenceAt: new Date(
      requireFiniteTimestamp(referenceAt, "instante de fechamento"),
    ),
    to: new Date(requireFiniteTimestamp(to, "fim")),
  });
}

export function buildOccupancyHistoricalComparisonRanges({
  dayCount,
  needsAnnualMaximum = false,
  needsHourlyAggregate,
  needsHourlyHeatmap,
  needsMaximumTrend,
  needsScenarioHeatmap,
  period,
  scenarioHeatmapGranularity,
  timeZone,
}: {
  dayCount: 7 | 14 | 30;
  needsAnnualMaximum?: boolean;
  needsHourlyAggregate: boolean;
  needsHourlyHeatmap: boolean;
  needsMaximumTrend: boolean;
  needsScenarioHeatmap: boolean;
  period: OccupancyComparisonHistoricalPeriod;
  scenarioHeatmapGranularity: OccupancyScenarioHeatmapGranularity;
  timeZone: string;
}): OccupancyHistoricalComparisonRanges {
  const stablePeriod = requireOccupancyComparisonHistoricalPeriod(period);
  requireCompanyTimeZone(timeZone);
  const hourlyCandidate = needsHourlyAggregate
    ? buildOccupancyHourlyRange(
        stablePeriod.referenceAt,
        needsHourlyHeatmap ? dayCount : 1,
        timeZone,
      )
    : null;
  const maximumCandidate = needsMaximumTrend
    ? buildOccupancyHistoricalMaximumTrendRanges({
        includeAnnualSource: needsAnnualMaximum,
        period: stablePeriod,
        timeZone,
      })
    : null;
  const scenarioCandidate =
    needsScenarioHeatmap && scenarioHeatmapGranularity !== "hour"
      ? buildOccupancyScenarioHeatmapRange(
          stablePeriod.referenceAt,
          scenarioHeatmapGranularity,
          scenarioHeatmapGranularity === "day" ? dayCount : 7,
          timeZone,
        )
      : null;

  return {
    hourly: hourlyCandidate
      ? clipOccupancyHistoricalRange(
          hourlyCandidate,
          stablePeriod,
          "hour",
          timeZone,
        )
      : null,
    maximumTrend: maximumCandidate,
    scenarioHeatmap:
      scenarioHeatmapGranularity === "hour"
        ? hourlyCandidate
          ? clipOccupancyHistoricalRange(
              hourlyCandidate,
              stablePeriod,
              "hour",
              timeZone,
            )
          : null
        : scenarioCandidate
          ? clipOccupancyHistoricalRange(
              scenarioCandidate,
              stablePeriod,
              scenarioHeatmapGranularity,
              timeZone,
            )
          : null,
  };
}

function buildOccupancyHistoricalMaximumTrendRanges({
  includeAnnualSource,
  period,
  timeZone,
}: {
  includeAnnualSource: boolean;
  period: OccupancyComparisonHistoricalPeriod;
  timeZone: string;
}): OccupancyMaximumTrendRanges {
  const currentMonth = companyCalendarDate(
    period.referenceAt,
    timeZone,
    "month",
  );
  const lastClosedMonth =
    occupancyCalendarBoundaryInstant(
      shiftOccupancyCalendarDate(currentMonth, 0, 1),
      timeZone,
    ) <= period.to
      ? currentMonth
      : shiftOccupancyCalendarDate(currentMonth, 0, -1);
  const monthlyFrom = shiftOccupancyCalendarDate(
    lastClosedMonth,
    0,
    -11,
  );
  const monthlyTo = shiftOccupancyCalendarDate(lastClosedMonth, 0, 1);

  const currentYear = companyCalendarDate(
    period.referenceAt,
    timeZone,
    "year",
  );
  const lastClosedYear =
    occupancyCalendarBoundaryInstant(
      shiftOccupancyCalendarDate(currentYear, 0, 0, 1),
      timeZone,
    ) <= period.to
      ? currentYear
      : shiftOccupancyCalendarDate(currentYear, 0, 0, -1);
  const annualFrom = shiftOccupancyCalendarDate(lastClosedYear, 0, 0, -3);
  const annualTo = shiftOccupancyCalendarDate(lastClosedYear, 0, 0, 1);
  const hourlyCandidate = buildOccupancyMaximumTrendRanges(
    period.referenceAt,
    timeZone,
  ).hourly;

  return {
    annual: {
      buckets: listOccupancyHistoricalCivilBuckets(
        annualFrom,
        annualTo,
        "year",
      ),
      from: annualFrom,
      to: annualTo,
    },
    hourly:
      clipOccupancyHistoricalRange(
        hourlyCandidate,
        period,
        "hour",
        timeZone,
      ) ?? emptyOccupancyHistoricalRange(period.referenceAt),
    monthly: {
      buckets: listOccupancyHistoricalCivilBuckets(
        monthlyFrom,
        monthlyTo,
        "month",
      ),
      from: monthlyFrom,
      to: monthlyTo,
    },
    monthlySource: {
      buckets: listOccupancyHistoricalCivilBuckets(
        includeAnnualSource ? annualFrom : monthlyFrom,
        monthlyTo,
        "month",
      ),
      from: includeAnnualSource ? annualFrom : monthlyFrom,
      to: monthlyTo,
    },
  };
}

function listOccupancyHistoricalCivilBuckets(
  from: Date,
  to: Date,
  granularity: "month" | "year",
) {
  const buckets: Date[] = [];
  let cursor = new Date(from);
  while (cursor < to) {
    buckets.push(new Date(cursor));
    cursor = shiftOccupancyCalendarDate(
      cursor,
      0,
      granularity === "month" ? 1 : 0,
      granularity === "year" ? 1 : 0,
    );
    if (buckets.length > 60) {
      throw new RangeError("A janela histórica de máximos excedeu o limite.");
    }
  }
  return buckets;
}

function requireOccupancyComparisonHistoricalPeriod(
  period: OccupancyComparisonHistoricalPeriod,
): OccupancyComparisonHistoricalPeriod {
  const from = requireHistoricalDate(period.from, "início");
  const to = requireHistoricalDate(period.to, "fim");
  const referenceAt = requireHistoricalDate(
    period.referenceAt,
    "instante de fechamento",
  );
  if (from >= to) {
    throw new RangeError("O período histórico de comparação deve ser crescente.");
  }
  if (referenceAt < from || referenceAt >= to) {
    throw new RangeError(
      "O instante de fechamento deve pertencer ao período histórico de comparação.",
    );
  }
  return {
    contextLabel: period.contextLabel.trim() || "período selecionado",
    from,
    referenceAt,
    to,
  };
}

function requireHistoricalDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`O ${label} do período histórico é inválido.`);
  }
  return new Date(value);
}

function requireFiniteTimestamp(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`O ${label} do período histórico é inválido.`);
  }
  return value;
}

function clipOccupancyHistoricalRange(
  range: OccupancyMaximumTrendRange,
  period: OccupancyComparisonHistoricalPeriod,
  granularity: AggregateGranularity,
  timeZone: string,
): OccupancyMaximumTrendRange | null {
  const buckets = range.buckets.filter((bucket) => {
    const bounds = occupancyHistoricalBucketBounds(
      bucket,
      granularity,
      timeZone,
    );
    return bounds.from >= period.from && bounds.to <= period.to;
  });
  if (!buckets.length) return null;
  const from = new Date(buckets[0]);
  const to = occupancyHistoricalBucketQueryEnd(
    buckets.at(-1)!,
    granularity,
    timeZone,
  );
  return from < to ? { buckets, from, to } : null;
}

function occupancyHistoricalBucketBounds(
  bucket: Date,
  granularity: AggregateGranularity,
  timeZone: string,
) {
  if (granularity === "minute") {
    return {
      from: new Date(bucket),
      to: new Date(bucket.getTime() + 60_000),
    };
  }
  if (granularity === "hour") {
    return {
      from: new Date(bucket),
      to: endOfCompanyTimeZoneHour(bucket, timeZone),
    };
  }
  const end = occupancyHistoricalCivilBucketEnd(bucket, granularity);
  return {
    from: occupancyCalendarBoundaryInstant(bucket, timeZone),
    to: occupancyCalendarBoundaryInstant(end, timeZone),
  };
}

function occupancyHistoricalBucketQueryEnd(
  bucket: Date,
  granularity: AggregateGranularity,
  timeZone: string,
) {
  if (granularity === "minute") {
    return new Date(bucket.getTime() + 60_000);
  }
  if (granularity === "hour") {
    return endOfCompanyTimeZoneHour(bucket, timeZone);
  }
  return occupancyHistoricalCivilBucketEnd(bucket, granularity);
}

function occupancyHistoricalCivilBucketEnd(
  bucket: Date,
  granularity: Exclude<AggregateGranularity, "minute" | "hour">,
) {
  if (granularity === "day") {
    return shiftOccupancyCalendarDate(bucket, 1);
  }
  if (granularity === "week") {
    return shiftOccupancyCalendarDate(bucket, 7);
  }
  if (granularity === "month") {
    return shiftOccupancyCalendarDate(bucket, 0, 1);
  }
  if (granularity === "semester") {
    return shiftOccupancyCalendarDate(bucket, 0, 6);
  }
  return shiftOccupancyCalendarDate(bucket, 0, 0, 1);
}

function emptyOccupancyHistoricalRange(
  referenceAt: Date,
): OccupancyMaximumTrendRange {
  return {
    buckets: [],
    from: new Date(referenceAt),
    to: new Date(referenceAt),
  };
}

export function useOccupancyComparisonCards({
  aggregateRefreshMs = DEFAULT_AGGREGATE_REFRESH_MS,
  companyScopeId,
  enabled = true,
  focusScenarioId,
  focusHourlyAggregate,
  focusSnapshot,
  focusSnapshotPending = false,
  maximumTrendRefreshMs = DEFAULT_MAXIMUM_TREND_REFRESH_MS,
  monitorMode,
  period,
  preferenceScopeId,
  preferences,
  refreshMode = "poll",
  reportPreferences = preferences,
  requestedCardIds,
  snapshotRefreshMs = DEFAULT_SNAPSHOT_REFRESH_MS,
  scenarios,
  timeZone,
  timeZoneWarning,
  userId,
}: {
  aggregateRefreshMs?: number;
  companyScopeId: string;
  enabled?: boolean;
  focusScenarioId: string;
  focusHourlyAggregate?: OccupancySharedHourlyAggregate | null;
  focusSnapshot?: (OccupancyScenarioSnapshot & { requestedAt: Date }) | null;
  focusSnapshotPending?: boolean;
  maximumTrendRefreshMs?: number;
  monitorMode: boolean;
  period?: OccupancyComparisonHistoricalPeriod | null;
  preferenceScopeId?: string | null;
  preferences: ReadonlyArray<CardPreference>;
  refreshMode?: OccupancyComparisonRefreshMode;
  reportPreferences?: ReadonlyArray<CardPreference>;
  requestedCardIds?: ReadonlySet<string>;
  snapshotRefreshMs?: number;
  scenarios: OccupancyScenario[];
  timeZone: string;
  timeZoneWarning?: string;
  userId?: string | null;
}) {
  const manualPeriodKey = React.useMemo(
    () =>
      refreshMode === "manual"
        ? occupancyComparisonHistoricalPeriodKey(period)
        : "",
    [period, refreshMode],
  );
  const stableManualPeriod = React.useMemo(
    () => occupancyComparisonHistoricalPeriodFromKey(manualPeriodKey),
    [manualPeriodKey],
  );
  const queryEnabled =
    enabled && (refreshMode === "poll" || stableManualPeriod !== null);
  const historicalMode = refreshMode === "manual";
  const settingsScopeKey = `${companyScopeId}|${userId ?? ""}|${preferenceScopeId ?? ""}`;
  const [settingsState, setSettingsState] = React.useState<SettingsState>({
    scopeKey: "",
    value: DEFAULT_OCCUPANCY_WIDGET_SETTINGS,
  });
  const settingsReady = settingsState.scopeKey === settingsScopeKey;
  const settings =
    settingsReady
      ? settingsState.value
      : DEFAULT_OCCUPANCY_WIDGET_SETTINGS;
  const requestedPreferences = React.useMemo(
    () =>
      requestedCardIds
        ? preferences.filter((preference) =>
            requestedCardIds.has(preference.id),
          )
        : preferences,
    [preferences, requestedCardIds],
  );
  const visibleCardIdsKey = React.useMemo(
    () =>
      requestedPreferences
        .filter((preference) => preference.visible === true)
        .map((preference) => preference.id)
        .sort()
        .join(","),
    [requestedPreferences],
  );
  const visibleCardIds = React.useMemo(
    () => new Set(visibleCardIdsKey.split(",").filter(Boolean)),
    [visibleCardIdsKey],
  );
  const scenarioHeatmapVisible = visibleCardIds.has(
    "occupancy_scenario_hour_heatmap",
  );
  const needsHourlyAggregate =
    setIntersects(visibleCardIds, OCCUPANCY_HOURLY_AGGREGATE_CARD_IDS) ||
    (scenarioHeatmapVisible && settings.scenarioHeatmapGranularity === "hour");
  const needsCurrentHourMaximum = setIntersects(
    visibleCardIds,
    OCCUPANCY_CURRENT_HOUR_MAXIMUM_CARD_IDS,
  );
  const needsMaximumTrend = setIntersects(
    visibleCardIds,
    OCCUPANCY_MAXIMUM_TREND_CARD_IDS,
  );
  const needsAnnualMaximum = visibleCardIds.has(
    "occupancy_scenario_max_year",
  );
  const scopedScenarios = React.useMemo(
    () =>
      scenarios.filter(
        (scenario) =>
          Boolean(companyScopeId) && scenario.company_id === companyScopeId,
      ),
    [companyScopeId, scenarios],
  );
  const selectedScenarios = React.useMemo(() => {
    const scenarioById = new Map(
      scopedScenarios.map((scenario) => [scenario.id, scenario]),
    );
    const effectiveIds = resolveOccupancyComparisonInheritedScenarioIds({
      configuredScenarioIds: settings.scenarioIds,
      focusScenarioId,
      scenarios: scopedScenarios,
    });
    return effectiveIds.flatMap((id) => {
      const scenario = scenarioById.get(id);
      return scenario ? [scenario] : [];
    });
  }, [focusScenarioId, scopedScenarios, settings.scenarioIds]);
  const selectedScenarioIds = React.useMemo(
    () => selectedScenarios.map((scenario) => scenario.id),
    [selectedScenarios],
  );
  const hexScenarioIds = React.useMemo(
    () =>
      settings.hexLayout
        ? Array.from(
            new Set(
              settings.hexLayout.cells.flatMap((cell) =>
                cell.scenarioId ? [cell.scenarioId] : [],
              ),
            ),
          )
        : selectedScenarioIds,
    [selectedScenarioIds, settings.hexLayout],
  );
  const inheritedHeatmapScenarioId = resolveHeatmapScenarioId(
    settings.heatmapScenarioId,
    focusScenarioId,
    selectedScenarioIds,
  );
  const selectionPlan = React.useMemo(() => buildOccupancyComparisonSelectionPlan({
    scenarios: scopedScenarios,
    preferences: requestedPreferences,
    inheritedScenarioIds: selectedScenarioIds,
    inheritedHeatmapScenarioId,
    hexScenarioIds,
    scenarioHeatmapGranularity: settings.scenarioHeatmapGranularity,
  }), [hexScenarioIds, inheritedHeatmapScenarioId, requestedPreferences, scopedScenarios, selectedScenarioIds, settings.scenarioHeatmapGranularity]);
  const snapshotScenarioIds = React.useMemo(
    () =>
      historicalMode
        ? occupancyHistoricalSnapshotScenarioIds({
            byCard: selectionPlan.byCard,
            hexScenarioIds,
            scenarios: scopedScenarios,
            visibleCardIds,
          })
        : selectionPlan.snapshots,
    [
      hexScenarioIds,
      historicalMode,
      scopedScenarios,
      selectionPlan.byCard,
      selectionPlan.snapshots,
      visibleCardIds,
    ],
  );
  const needsSnapshots = snapshotScenarioIds.length > 0;
  const comparisonSelectionKey = selectionPlan.hourly.join(",");
  const scenarioHeatmapSelectionKey = (
    selectionPlan.byCard.get("occupancy_scenario_hour_heatmap") ?? []
  ).join(",");
  const currentHourSelectionKey = selectionPlan.currentHour.join(",");
  const maximumTrendSelectionKey = selectionPlan.trends.join(",");
  const needsHourlyHeatmap =
    (visibleCardIds.has("occupancy_day_hour_heatmap") &&
      (selectionPlan.byCard.get("occupancy_day_hour_heatmap")?.length ?? 0) > 0) ||
    (scenarioHeatmapVisible &&
      settings.scenarioHeatmapGranularity === "hour" &&
      scenarioHeatmapSelectionKey.length > 0);
  const hourlyAggregateDayCount = needsHourlyHeatmap ? settings.dayCount : 1;
  const snapshotSelectionKey = snapshotScenarioIds.join(",");
  const snapshotRequestGroupCount = snapshotScenarioIds.length ? 1 : 0;
  const effectiveSnapshotRefreshMs =
    occupancyComparisonSnapshotRefreshIntervalMs({
      baseRefreshMs: snapshotRefreshMs,
      concurrency: MAX_PARALLEL_REQUESTS,
      // `/occupancy` returns all current areas in one tenant-scoped batch. The
      // scenario count below is therefore either one batch or none.
      scenarioCount: snapshotRequestGroupCount,
    });
  const comparisonWindowKey = historicalMode
    ? `historical:${manualPeriodKey}`
    : "live";
  const snapshotScopeKey = `${companyScopeId}|${timeZone}|${comparisonWindowKey}|${snapshotSelectionKey}`;
  const aggregateScopeKey = `${companyScopeId}|${timeZone}|${comparisonWindowKey}|${comparisonSelectionKey}|${hourlyAggregateDayCount}`;
  const scenarioHeatmapRangeDayCount =
    settings.scenarioHeatmapGranularity === "hour" ||
    settings.scenarioHeatmapGranularity === "day"
      ? settings.dayCount
      : 7;
  const scenarioHeatmapScopeKey = `${companyScopeId}|${timeZone}|${comparisonWindowKey}|${settings.scenarioHeatmapGranularity}|${scenarioHeatmapRangeDayCount}|${scenarioHeatmapSelectionKey}`;
  const maximumTrendScopeKey = `${companyScopeId}|${timeZone}|${comparisonWindowKey}|${maximumTrendSelectionKey}`;
  const currentHourScopeKey = `${companyScopeId}|${timeZone}|${comparisonWindowKey}|${currentHourSelectionKey}`;
  const [snapshotDataset, setSnapshotDataset] =
    React.useState<SnapshotDataset>({
      loading: false,
      requestedAt: null,
      scopeKey: "",
      snapshots: [],
    });
  const snapshotCacheRef = React.useRef(SHARED_OCCUPANCY_SNAPSHOT_CACHE);
  const [aggregateDataset, setAggregateDataset] =
    React.useState<AggregateDataset>({
      buckets: [],
      from: null,
      loading: false,
      scopeKey: "",
      series: [],
      to: null,
    });
  const aggregateDatasetRef = React.useRef(aggregateDataset);
  const aggregateAvailabilityKey = [
    aggregateDataset.scopeKey,
    aggregateDataset.loading ? "loading" : "ready",
    aggregateDataset.from?.getTime() ?? "",
    aggregateDataset.to?.getTime() ?? "",
  ].join("|");
  const hourlyAggregateCacheRef = React.useRef(
    SHARED_OCCUPANCY_HOURLY_AGGREGATE_CACHE,
  );
  const [scenarioHeatmapDataset, setScenarioHeatmapDataset] =
    React.useState<ScenarioHeatmapDataset>({
      buckets: [],
      from: null,
      granularity: "hour",
      loading: false,
      scopeKey: "",
      series: [],
      to: null,
    });
  const scenarioHeatmapCacheRef = React.useRef(
    SHARED_OCCUPANCY_SCENARIO_HEATMAP_CACHE,
  );
  const scenarioHeatmapCivilUnitCacheRef = React.useRef<
    OccupancyCivilAggregateUnitCache
  >(new Map());
  const [maximumTrendDataset, setMaximumTrendDataset] =
    React.useState<MaximumTrendDataset>({
      loading: false,
      ranges: null,
      scopeKey: "",
      series: [],
    });
  const maximumTrendDatasetRef = React.useRef(maximumTrendDataset);
  const maximumTrendSeriesCacheRef = React.useRef(
    SHARED_OCCUPANCY_MAXIMUM_TREND_CACHE,
  );
  const maximumTrendFullRefreshRef = React.useRef(
    SHARED_OCCUPANCY_MAXIMUM_TREND_ATTEMPTS,
  );
  const [currentHourMaximumDataset, setCurrentHourMaximumDataset] =
    React.useState<CurrentHourMaximumDataset>({
      bucket: null,
      loading: false,
      scopeKey: "",
      series: [],
    });
  const currentHourMaximumDatasetRef = React.useRef(
    currentHourMaximumDataset,
  );
  const [manualRefreshVersion, setManualRefreshVersion] = React.useState(0);
  const resourceFreshnessRef = React.useRef<OccupancyComparisonFreshness>(
    createEmptyOccupancyComparisonFreshness(),
  );
  const civilAggregateCapabilities = React.useMemo(
    () => sharedOccupancyCivilCapabilities(companyScopeId, timeZone),
    [companyScopeId, timeZone],
  );
  const focusSnapshotRef = React.useRef(focusSnapshot);
  const focusHourlyAggregateRef = React.useRef(focusHourlyAggregate);
  const focusHourlyAggregateKey = focusHourlyAggregate && selectionPlan.hourly.includes(focusScenarioId)
    ? [
        focusHourlyAggregate.from.getTime(),
        focusHourlyAggregate.to.getTime(),
        focusHourlyAggregate.series
          ? focusHourlyAggregate.series.error
            ? "error"
            : "ready"
          : "pending",
        focusHourlyAggregate.series?.scenarioId ?? focusScenarioId,
      ].join("|")
    : "unowned";

  React.useEffect(() => {
    focusSnapshotRef.current = focusSnapshot;
  }, [focusSnapshot]);

  React.useEffect(() => {
    focusHourlyAggregateRef.current = focusHourlyAggregate;
  }, [focusHourlyAggregate]);

  React.useEffect(() => {
    aggregateDatasetRef.current = aggregateDataset;
  }, [aggregateDataset]);

  React.useEffect(() => {
    scenarioHeatmapCivilUnitCacheRef.current.clear();
  }, [companyScopeId, timeZone, userId]);

  React.useEffect(() => {
    maximumTrendDatasetRef.current = maximumTrendDataset;
  }, [maximumTrendDataset]);

  React.useEffect(() => {
    currentHourMaximumDatasetRef.current = currentHourMaximumDataset;
  }, [currentHourMaximumDataset]);

  const refresh = React.useCallback(() => {
    setManualRefreshVersion((version) => version + 1);
  }, []);

  const updateSettings = React.useCallback(
    (patch: Partial<OccupancyWidgetSettings>) => {
      const base =
        settingsState.scopeKey === settingsScopeKey
          ? settingsState.value
          : loadOccupancyWidgetSettings(
              companyScopeId,
              userId,
              preferenceScopeId,
            );
      try {
        const value = saveOccupancyWidgetSettings(
          {
            ...base,
            ...patch,
            schemaVersion: OCCUPANCY_WIDGET_SETTINGS_SCHEMA_VERSION,
          },
          companyScopeId,
          userId,
          preferenceScopeId,
        );
        setSettingsState({ scopeKey: settingsScopeKey, value });
        return true;
      } catch {
        toast.error(
          "Não foi possível salvar a configuração de ocupação agora.",
        );
        return false;
      }
    },
    [
      companyScopeId,
      preferenceScopeId,
      settingsScopeKey,
      settingsState,
      userId,
    ],
  );

  React.useEffect(() => {
    function synchronizeSettings() {
      setSettingsState({
        scopeKey: settingsScopeKey,
        value: loadOccupancyWidgetSettings(
          companyScopeId,
          userId,
          preferenceScopeId,
        ),
      });
    }
    synchronizeSettings();
    window.addEventListener("storage", synchronizeSettings);
    window.addEventListener(
      OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
      synchronizeSettings,
    );
    window.addEventListener(USER_GRID_HYDRATED_EVENT, synchronizeSettings);
    return () => {
      window.removeEventListener("storage", synchronizeSettings);
      window.removeEventListener(
        OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
        synchronizeSettings,
      );
      window.removeEventListener(
        USER_GRID_HYDRATED_EVENT,
        synchronizeSettings,
      );
    };
  }, [
    companyScopeId,
    preferenceScopeId,
    settingsScopeKey,
    userId,
  ]);

  React.useEffect(() => {
    if (!queryEnabled || historicalMode || !needsSnapshots) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let refreshRunning = false;

    function scheduleNext(delayMs = effectiveSnapshotRefreshMs) {
      if (disposed) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        refreshSnapshots,
        Math.max(250, Math.round(delayMs)),
      );
    }

    function scheduleAfterSnapshotCycle(startedAt: Date) {
      scheduleNext(
        effectiveSnapshotRefreshMs - (Date.now() - startedAt.getTime()),
      );
    }

    async function refreshSnapshots() {
      if (disposed || refreshRunning) return;
      refreshRunning = true;
      try {
        await runSnapshotRefresh();
      } catch (error) {
        if (!disposed && !controller?.signal.aborted) throw error;
      } finally {
        refreshRunning = false;
      }
    }

    async function runSnapshotRefresh() {
      if (disposed) return;
      if (!settingsReady) return;
      const requestedIds = new Set(
        snapshotSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        setSnapshotDataset({
          loading: false,
          requestedAt: null,
          scopeKey: snapshotScopeKey,
          snapshots: [],
        });
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        scheduleNext();
        return;
      }
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.snapshots,
        {
          now: new Date(),
          refreshMs: effectiveSnapshotRefreshMs,
          refreshVersion: manualRefreshVersion,
          scopeKey: snapshotScopeKey,
          windowKey: snapshotScopeKey,
        },
      );
      if (freshnessRemainingMs > 0) {
        scheduleNext(freshnessRemainingMs);
        return;
      }

      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const scheduleQuery = createOccupancyQueryScheduler(
        requestController.signal,
        MAX_PARALLEL_REQUESTS,
        OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,
      );
      const requestedAt = new Date();
      const candidateFocusSnapshot = selectOccupancyComparisonSharedSource(
        focusSnapshotRef.current,
        focusScenarioId,
        requestedIds,
      );
      const sharedFocusSnapshot =
        candidateFocusSnapshot &&
        requestedAt.getTime() - candidateFocusSnapshot.requestedAt.getTime() <
          effectiveSnapshotRefreshMs
          ? candidateFocusSnapshot
          : null;
      const cachePrefix = `${userId ?? ""}|${companyScopeId}|${timeZone}|`;
      const snapshotCacheKey = (scenario: OccupancyScenario) =>
        `${cachePrefix}${JSON.stringify([
          scenario.id,
          scenario.object_class,
          scenario.areas
            .map((area) => [area.camera_id, area.area_id])
            .sort(([leftCamera, leftArea], [rightCamera, rightArea]) =>
              leftCamera.localeCompare(rightCamera) || leftArea.localeCompare(rightArea),
            ),
        ])}`;
      const oldestFreshSnapshot = requestedAt.getTime() - effectiveSnapshotRefreshMs;
      const snapshotsById = new Map<string, OccupancyScenarioSnapshot>();
      const scenariosToRequest: OccupancyScenario[] = [];

      for (const scenario of requestedScenarios) {
        const cacheKey = snapshotCacheKey(scenario);
        const cached = snapshotCacheRef.current.get(cacheKey);
        if (cached) {
          snapshotsById.set(scenario.id, {
            ...cached.snapshot,
            name: scenario.name,
          });
        }
        if (
          !cached ||
          cached.refreshVersion !== manualRefreshVersion ||
          cached.completedAt <= oldestFreshSnapshot
        ) {
          scenariosToRequest.push(scenario);
        }
      }

      if (sharedFocusSnapshot) {
        const focusScenario = requestedScenarios.find(
          (scenario) => scenario.id === sharedFocusSnapshot.scenarioId,
        );
        if (focusScenario) {
          const snapshot: OccupancyScenarioSnapshot = {
            asOf: sharedFocusSnapshot.asOf,
            error: sharedFocusSnapshot.error,
            name: focusScenario.name,
            occupied: sharedFocusSnapshot.occupied,
            scenarioId: focusScenario.id,
            total: sharedFocusSnapshot.total,
          };
          snapshotsById.set(focusScenario.id, snapshot);
          setBoundedComparisonCacheEntry(
            snapshotCacheRef.current,
            snapshotCacheKey(focusScenario),
            {
              completedAt: requestedAt.getTime(),
              history: snapshotCacheRef.current.get(
                snapshotCacheKey(focusScenario),
              )?.history,
              refreshVersion: manualRefreshVersion,
              snapshot,
            },
          );
          const index = scenariosToRequest.findIndex(
            (scenario) => scenario.id === focusScenario.id,
          );
          if (index >= 0) scenariosToRequest.splice(index, 1);
        }
      } else if (
        focusSnapshotPending &&
        requestedIds.has(focusScenarioId)
      ) {
        // The parent owns the focused snapshot. Load every other scenario now
        // instead of serializing the whole comparison behind that request.
        const index = scenariosToRequest.findIndex(
          (scenario) => scenario.id === focusScenarioId,
        );
        if (index >= 0) scenariosToRequest.splice(index, 1);
      }

      const orderedSnapshots = () =>
        requestedScenarios.flatMap((scenario) => {
          const snapshot = snapshotsById.get(scenario.id);
          return snapshot ? [snapshot] : [];
        });
      const publishSnapshots = (loading: boolean) => {
        if (disposed || requestController.signal.aborted) return;
        const snapshots = orderedSnapshots();
        setSnapshotDataset((current) => {
          // A warm refresh should not publish an identical intermediate state
          // before the batched response; this halves React commits per pulse.
          if (
            loading &&
            snapshots.length > 0 &&
            current.scopeKey === snapshotScopeKey &&
            current.snapshots.length > 0
          ) {
            return current;
          }
          return {
            loading: loading && snapshots.length === 0,
            requestedAt,
            scopeKey: snapshotScopeKey,
            snapshots,
          };
        });
      };

      publishSnapshots(scenariosToRequest.length > 0);
      if (!scenariosToRequest.length) {
        resourceFreshnessRef.current.snapshots =
          completeOccupancyComparisonResource(
            manualRefreshVersion,
            snapshotScopeKey,
            snapshotScopeKey,
            requestedAt.getTime(),
          );
        scheduleAfterSnapshotCycle(requestedAt);
        return;
      }

      try {
        const snapshotQuery = occupancyLiveSnapshotQuery({ now: requestedAt });
        const expectedAreas = Array.from(
          new Map(
            scenariosToRequest.flatMap((scenario) =>
              scenario.areas.map(
                (area) =>
                  [
                    JSON.stringify([
                      area.camera_id,
                      area.area_id,
                      scenario.object_class,
                    ]),
                    {
                      area_id: area.area_id,
                      camera_id: area.camera_id,
                      object_class: scenario.object_class,
                    },
                  ] as const,
              ),
            ),
          ).values(),
        );
        let rows: ReturnType<
          typeof requireOccupancyCurrentSnapshotRows
        > | null = null;
        try {
          const path = snapshotQuery.path;
          const response = await scheduleQuery(path, () =>
            fetchSharedOccupancyQuery<unknown>({
              // The path is quantized per five-second pulse. A short settled
              // cache lets the focused card and comparisons share this exact
              // tenant-wide snapshot without leaking into the next pulse.
              cacheTtlMs: OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS,
              companyScopeId,
              path,
              priority: "background",
              scenarioId: OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID,
              signal: requestController.signal,
              timeZone,
            }),
          );
          rows = requireOccupancyCurrentSnapshotRows(response, {
            expectedAreas,
          });
        } catch (error) {
          if (requestController.signal.aborted) throw error;
          scenariosToRequest.forEach((scenario) => {
            const cached = snapshotCacheRef.current.get(
              snapshotCacheKey(scenario),
            );
            if (cached) {
              commitSnapshot(scenario, {
                ...cached.snapshot,
                name: scenario.name,
              }, cached.history);
              return;
            }
            commitSnapshot(scenario, {
              error: occupancyRequestError(
                error,
                "A leitura atual não está disponível.",
              ),
              name: scenario.name,
              occupied: null,
              scenarioId: scenario.id,
              total: null,
            });
          });
          rows = null;
        }

        // `/occupancy` omits areas without an event in the requested window.
        // Seed each demanded scenario once from history and then merge the
        // five-second tenant-wide pulse into that complete per-area baseline.
        // Quiet scenarios reuse their certified baseline without recurring
        // per-scenario requests.
        if (rows !== null) {
          await Promise.all(scenariosToRequest.map(async (scenario) => {
            try {
              if (occupancyScenarioSnapshotHasCompleteCoverage(scenario, rows)) {
                const history = buildOccupancyScenarioCurrentHistory(
                  scenario,
                  rows,
                );
                commitSnapshot(
                  scenario,
                  {
                    asOf: history.as_of,
                    name: scenario.name,
                    occupied: history.total > 0,
                    scenarioId: scenario.id,
                    total: history.total,
                  },
                  history,
                );
                return;
              }

              const cached = snapshotCacheRef.current.get(
                snapshotCacheKey(scenario),
              );
              const merged = mergeOccupancyScenarioCurrentHistory(
                scenario,
                cached?.history,
                rows,
              );
              if (merged) {
                commitSnapshot(
                  scenario,
                  {
                    asOf: merged.as_of,
                    name: scenario.name,
                    occupied: merged.total > 0,
                    scenarioId: scenario.id,
                    total: merged.total,
                  },
                  merged,
                );
                return;
              }

              const historyPath = occupancyComparisonHistoryPath(
                scenario.id,
                requestedAt,
              );
              const historyResponse = await scheduleQuery(historyPath, () =>
                fetchSharedOccupancyQuery<unknown>({
                  cacheTtlMs: OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS,
                  companyScopeId,
                  path: historyPath,
                  priority: "background",
                  scenarioId: scenario.id,
                  signal: requestController.signal,
                  timeZone,
                }),
              );
              const history = requireOccupancyHistoryResponse(
                historyResponse,
                scenario.id,
                {
                  expectedAreas: scenario.areas,
                  requireAreaSnapshots: true,
                  requestedAt,
                },
              );
              commitSnapshot(
                scenario,
                {
                  asOf: history.as_of,
                  name: scenario.name,
                  occupied: history.total > 0,
                  scenarioId: scenario.id,
                  total: history.total,
                },
                history,
              );
            } catch (error) {
              const cached = snapshotCacheRef.current.get(
                snapshotCacheKey(scenario),
              );
              if (cached) {
                commitSnapshot(
                  scenario,
                  { ...cached.snapshot, name: scenario.name },
                  cached.history,
                );
                return;
              }
              commitSnapshot(scenario, {
                error: occupancyRequestError(
                  error,
                  "A leitura atual não está disponível.",
                ),
                name: scenario.name,
                occupied: null,
                scenarioId: scenario.id,
                total: null,
              });
            }
          }));
        }

        function commitSnapshot(
          scenario: OccupancyScenario,
          snapshot: OccupancyScenarioSnapshot,
          history?: OccupancyScenarioHistoryResponse,
        ) {
          const cacheKey = snapshotCacheKey(scenario);
          const cached = snapshotCacheRef.current.get(cacheKey);
          snapshotsById.set(scenario.id, snapshot);
          setBoundedComparisonCacheEntry(
            snapshotCacheRef.current,
            cacheKey,
            {
              completedAt: requestedAt.getTime(),
              history: history ?? cached?.history,
              refreshVersion: manualRefreshVersion,
              snapshot,
            },
          );
        }
      } catch {
        if (!requestController.signal.aborted && !disposed) {
          publishSnapshots(false);
          scheduleAfterSnapshotCycle(requestedAt);
        }
        return;
      }
      if (!disposed && !requestController.signal.aborted) {
        resourceFreshnessRef.current.snapshots =
          completeOccupancyComparisonResource(
            manualRefreshVersion,
            snapshotScopeKey,
            snapshotScopeKey,
            requestedAt.getTime(),
          );
        publishSnapshots(false);
      }
      if (!disposed) {
        scheduleAfterSnapshotCycle(requestedAt);
      }
    }

    function handleAvailabilityChange() {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) return;
      if (timeout) window.clearTimeout(timeout);
      void refreshSnapshots();
    }

    void refreshSnapshots();
    document.addEventListener("visibilitychange", handleAvailabilityChange);
    window.addEventListener("online", handleAvailabilityChange);
    return () => {
      disposed = true;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener(
        "visibilitychange",
        handleAvailabilityChange,
      );
      window.removeEventListener("online", handleAvailabilityChange);
    };
  }, [
    companyScopeId,
    focusScenarioId,
    focusSnapshotPending,
    manualRefreshVersion,
    scopedScenarios,
    settingsReady,
    needsSnapshots,
    snapshotScopeKey,
    snapshotSelectionKey,
    effectiveSnapshotRefreshMs,
    historicalMode,
    queryEnabled,
    timeZone,
    userId,
  ]);

  React.useEffect(() => {
    if (!queryEnabled || historicalMode || !needsHourlyAggregate) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let requestGeneration = 0;
    let refreshRunning = false;

    function scheduleNext(
      boundary?: Date,
      immediate = false,
      delayMs = aggregateRefreshMs,
    ) {
      if (disposed) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        refreshAggregates,
        immediate
          ? 0
          : temporalRefreshDelay(delayMs, boundary),
      );
    }

    async function refreshAggregates() {
      if (disposed || refreshRunning) return;
      refreshRunning = true;
      try {
        await runAggregateRefresh();
      } catch (error) {
        if (!disposed && !controller?.signal.aborted) throw error;
      } finally {
        refreshRunning = false;
      }
    }

    async function runAggregateRefresh() {
      if (disposed) return;
      if (!settingsReady) return;
      const requestedAt = new Date();
      const range = buildOccupancyHourlyRange(
        requestedAt,
        hourlyAggregateDayCount,
        timeZone,
      );
      const requestedIds = new Set(
        comparisonSelectionKey.split(",").filter(Boolean),
      );
      let requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        setAggregateDataset({
          buckets: [],
          from: null,
          loading: false,
          scopeKey: aggregateScopeKey,
          series: [],
          to: null,
        });
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        scheduleNext(range.to);
        return;
      }
      const sharedFocus = resolveSharedOccupancyHourlyAggregate(
        focusHourlyAggregateRef.current,
        focusScenarioId,
        range,
        requestedIds,
      );
      if (sharedFocus.covered && !sharedFocus.series) {
        // The parent owns this exact focused request. Do not serialize every
        // other scenario behind it: load the remaining rows in parallel and
        // merge the focused series when its readiness change reruns the hook.
        requestedScenarios = requestedScenarios.filter(
          (scenario) => scenario.id !== focusScenarioId,
        );
        if (!requestedScenarios.length) {
          scheduleNext(range.to, false, aggregateRefreshMs);
          return;
        }
      }
      const windowKey = occupancyComparisonRangeKey(range);
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.aggregate,
        {
          now: requestedAt,
          refreshMs: aggregateRefreshMs,
          // Closed hours stay in the per-scenario cache. The live cadence
          // revisits only the last (open) hour assembled below.
          refreshVersion: 0,
          scopeKey: aggregateScopeKey,
          windowKey,
        },
      );
      if (freshnessRemainingMs > 0) {
        if (sharedFocus.series) {
          setAggregateDataset((current) =>
            mergeSharedOccupancyHourlySeries(
              current,
              sharedFocus.series!,
              range,
              aggregateScopeKey,
            ),
          );
        }
        scheduleNext(range.to, false, freshnessRemainingMs);
        return;
      }

      const generation = ++requestGeneration;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const scheduleQuery = createOccupancyQueryScheduler(
        requestController.signal,
        MAX_PARALLEL_REQUESTS,
        OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,
      );
      const cachePrefix = `${userId ?? ""}|${companyScopeId}|${timeZone}|`;
      const warmSeries = requestedScenarios.flatMap((scenario) => {
        if (scenario.id === focusScenarioId && sharedFocus.series) {
          return [sharedFocus.series];
        }
        const cached = hourlyAggregateCacheRef.current.get(
          `${cachePrefix}${scenario.id}`,
        );
        return cached
          ? [{ ...cached.series, name: scenario.name }]
          : [];
      });
      setAggregateDataset((current) =>
        current.scopeKey === aggregateScopeKey &&
        current.from !== null &&
        current.to !== null &&
        sameOccupancyRange(
          { from: current.from, to: current.to },
          range,
        )
          ? current
          : {
              buckets: range.buckets,
              from: range.from,
              loading: warmSeries.length !== requestedScenarios.length,
              scopeKey: aggregateScopeKey,
              series: warmSeries,
              to: range.to,
            },
      );
      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioHourlySeries> => {
          const cacheKey = `${cachePrefix}${scenario.id}`;
          if (
            scenario.id === focusScenarioId &&
            sharedFocus.series
          ) {
            setBoundedComparisonCacheEntry(
              hourlyAggregateCacheRef.current,
              cacheKey,
              {
                attemptedBucketKeys: new Set(
                  range.buckets.slice(0, -1).map((bucket) =>
                    occupancyAggregateBucketKey(bucket, "hour"),
                  ),
                ),
                completedAt: requestedAt.getTime(),
                coverageRetryBucketKeys: new Set<number>(),
                lastFullAttemptAt: requestedAt.getTime(),
                retryAt: 0,
                series: sharedFocus.series,
              },
            );
            return sharedFocus.series;
          }
          const cached = hourlyAggregateCacheRef.current.get(cacheKey);
          if (cached && cached.retryAt > requestedAt.getTime()) {
            return { ...cached.series, name: scenario.name };
          }
          const requestedBucketKeys = new Set(
            range.buckets.map((bucket) =>
              occupancyAggregateBucketKey(bucket, "hour"),
            ),
          );
          const firstUnattemptedBucket = range.buckets.find(
            (bucket) =>
              !cached?.attemptedBucketKeys.has(
                occupancyAggregateBucketKey(bucket, "hour"),
              ),
          );
          const fullRefresh =
            !cached ||
            requestedAt.getTime() < cached.lastFullAttemptAt ||
            requestedAt.getTime() - cached.lastFullAttemptAt >=
              HOURLY_AGGREGATE_FULL_REFRESH_MS;
          const sourceFrom = fullRefresh
            ? range.from
            : (firstUnattemptedBucket ?? range.buckets.at(-1)!);
          const sourceBuckets = range.buckets.filter(
            (bucket) => bucket.getTime() >= sourceFrom.getTime(),
          );
          try {
            requireCompanyTimeZone(timeZone);
            const aggregatePath = occupancyAggregatePath(
              scenario.id,
              sourceFrom,
              range.to,
            );
            const response = await scheduleQuery(
              aggregatePath,
              () => fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
                cacheTtlMs: aggregateRefreshMs,
                companyScopeId,
                path: aggregatePath,
                priority: "background",
                scenarioId: scenario.id,
                signal: requestController.signal,
                timeZone,
              }),
            );
            const rows = requireOccupancyAggregateRows(
              response,
              "hour",
              scenario.id,
              timeZone,
              {
                allowDocumentedAggregateResponse: true,
                expectedTimezone: timeZone,
                openBucket: range.buckets.at(-1),
                requestedAt,
                requireCertification: true,
              },
            );
            const coverage = aggregateOccupancyRowsForRequestedBuckets(
              rows,
              "hour",
              sourceBuckets,
              {
                allowDocumentedAggregateResponse: true,
                expectedTimezone: timeZone,
                openBucket: range.buckets.at(-1),
                requireCertification: true,
              },
            );
            const metrics = new Map(
              fullRefresh
                ? []
                : Array.from(cached?.series.metrics ?? []).filter(([key]) =>
                    requestedBucketKeys.has(key),
                  ),
            );
            coverage.totals.forEach((metric, bucket) =>
              metrics.set(bucket, metric),
            );
            const coverageState =
              updateOccupancyScenarioHeatmapAttemptedBuckets({
                fullRefresh,
                granularity: "hour",
                missingBuckets: coverage.missingBuckets,
                previous: cached?.attemptedBucketKeys ?? new Set<number>(),
                previousRetry:
                  cached?.coverageRetryBucketKeys ?? new Set<number>(),
                refreshedBuckets: sourceBuckets.filter((bucket) =>
                  coverage.totals.has(
                    occupancyAggregateBucketKey(bucket, "hour"),
                  ),
                ),
                requestedBuckets: range.buckets,
              });
            const nextSeries: OccupancyScenarioHourlySeries = {
              metrics,
              name: scenario.name,
              scenarioId: scenario.id,
              warning: joinMessages(
                timeZoneWarning,
                occupancyAggregateMetadataWarning(response, "hour"),
                occupancyAggregateCoverageWarning(
                  coverage.missingBuckets.length,
                  sourceBuckets.length,
                ),
              ),
            };
            setBoundedComparisonCacheEntry(
              hourlyAggregateCacheRef.current,
              cacheKey,
              {
                attemptedBucketKeys: coverageState.attemptedBucketKeys,
                completedAt: Date.now(),
                coverageRetryBucketKeys:
                  coverageState.coverageRetryBucketKeys,
                lastFullAttemptAt: fullRefresh
                  ? requestedAt.getTime()
                  : (cached?.lastFullAttemptAt ?? requestedAt.getTime()),
                retryAt: 0,
                series: nextSeries,
              },
            );
            return nextSeries;
          } catch (error) {
            if (requestController.signal.aborted) {
              return (
                cached?.series ?? {
                  metrics: new Map(),
                  name: scenario.name,
                  scenarioId: scenario.id,
                }
              );
            }
            const nextSeries: OccupancyScenarioHourlySeries = {
              error: occupancyRequestError(
                error,
                "A série horária não está disponível.",
              ),
              metrics: cached?.series.metrics ?? new Map(),
              name: scenario.name,
              scenarioId: scenario.id,
            };
            setBoundedComparisonCacheEntry(
              hourlyAggregateCacheRef.current,
              cacheKey,
              {
                attemptedBucketKeys:
                  cached?.attemptedBucketKeys ?? new Set<number>(),
                completedAt: Date.now(),
                coverageRetryBucketKeys:
                  cached?.coverageRetryBucketKeys ?? new Set<number>(),
                lastFullAttemptAt: cached?.lastFullAttemptAt ?? 0,
                retryAt: requestedAt.getTime() + HOURLY_AGGREGATE_RETRY_MS,
                series: nextSeries,
              },
            );
            return nextSeries;
          }
        },
      );
      const latestRange = buildOccupancyHourlyRange(
        new Date(),
        hourlyAggregateDayCount,
        timeZone,
      );
      if (
        disposed ||
        requestController.signal.aborted ||
        generation !== requestGeneration
      ) {
        return;
      }
      const rangeChanged = !sameOccupancyRange(range, latestRange);

      setAggregateDataset({
        buckets: range.buckets,
        from: range.from,
        loading: false,
        scopeKey: aggregateScopeKey,
        series,
        to: range.to,
      });
      resourceFreshnessRef.current.aggregate =
        completeOccupancyComparisonResource(
          0,
          aggregateScopeKey,
          windowKey,
        );
      scheduleNext(range.to, rangeChanged);
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) return;
      if (timeout) window.clearTimeout(timeout);
      void refreshAggregates();
    }

    void refreshAggregates();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
    };
  }, [
    aggregateScopeKey,
    aggregateRefreshMs,
    companyScopeId,
    comparisonSelectionKey,
    focusHourlyAggregateKey,
    focusScenarioId,
    historicalMode,
    hourlyAggregateDayCount,
    needsHourlyAggregate,
    queryEnabled,
    scopedScenarios,
    settingsReady,
    timeZone,
    timeZoneWarning,
    userId,
  ]);

  React.useEffect(() => {
    const granularity = settings.scenarioHeatmapGranularity;
    if (!queryEnabled || historicalMode) return;
    if (!scenarioHeatmapVisible || granularity === "hour") return;
    const civilGranularity =
      granularity === "minute" ? null : granularity;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let requestGeneration = 0;
    let refreshRunning = false;

    function scheduleNext(delayMs = aggregateRefreshMs) {
      if (disposed) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        refreshScenarioHeatmap,
        Math.max(250, Math.round(delayMs)),
      );
    }

    async function refreshScenarioHeatmap() {
      if (disposed || refreshRunning) return;
      refreshRunning = true;
      try {
        await runScenarioHeatmapRefresh();
      } catch (error) {
        if (!disposed && !controller?.signal.aborted) throw error;
      } finally {
        refreshRunning = false;
      }
    }

    async function runScenarioHeatmapRefresh() {
      if (disposed || !settingsReady) return;
      const requestedAt = new Date();
      const range = buildOccupancyScenarioHeatmapRange(
        requestedAt,
        granularity,
        scenarioHeatmapRangeDayCount,
        timeZone,
      );
      const requestedIds = new Set(
        scenarioHeatmapSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        setScenarioHeatmapDataset({
          buckets: [],
          from: null,
          granularity,
          loading: false,
          scopeKey: scenarioHeatmapScopeKey,
          series: [],
          to: null,
        });
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        scheduleNext();
        return;
      }

      const generation = ++requestGeneration;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const cachePrefix = `${userId ?? ""}|${companyScopeId}|${timeZone}|${granularity}|${scenarioHeatmapRangeDayCount}|`;
      const requestedBucketKeys = new Set(
        range.buckets.map((bucket) =>
          occupancyAggregateBucketKey(bucket, granularity),
        ),
      );
      const warmSeries = requestedScenarios.flatMap((scenario) => {
        const cached = scenarioHeatmapCacheRef.current.get(
          `${cachePrefix}${scenario.id}`,
        );
        return cached
          ? [filterOccupancySeriesToBucketKeys(cached.series, requestedBucketKeys, scenario.name)]
          : [];
      });
      setScenarioHeatmapDataset((current) =>
        current.scopeKey === scenarioHeatmapScopeKey &&
        current.granularity === granularity &&
        current.from !== null &&
        current.to !== null &&
        sameOccupancyRange(
          { from: current.from, to: current.to },
          range,
        )
          ? current
          : {
              buckets: range.buckets,
              from: range.from,
              granularity,
              loading: warmSeries.length !== requestedScenarios.length,
              scopeKey: scenarioHeatmapScopeKey,
              series: warmSeries,
              to: range.to,
            },
      );

      const allFresh = requestedScenarios.every((scenario) => {
        const cached = scenarioHeatmapCacheRef.current.get(
          `${cachePrefix}${scenario.id}`,
        );
        return Boolean(
          cached &&
            cached.refreshVersion === manualRefreshVersion &&
            requestedAt.getTime() - cached.completedAt <
              aggregateRefreshMs &&
            range.buckets.slice(0, -1).every((bucket) =>
              cached.attemptedBucketKeys.has(
                occupancyAggregateBucketKey(bucket, granularity),
              ),
            ),
        );
      });
      if (allFresh) {
        setScenarioHeatmapDataset({
          buckets: range.buckets,
          from: range.from,
          granularity,
          loading: false,
          scopeKey: scenarioHeatmapScopeKey,
          series: warmSeries,
          to: range.to,
        });
        scheduleNext(aggregateRefreshMs);
        return;
      }

      const scheduleQuery = createOccupancyQueryScheduler(
        requestController.signal,
        MAX_PARALLEL_REQUESTS,
        OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,
      );
      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioHourlySeries> => {
          const cacheKey = `${cachePrefix}${scenario.id}`;
          const cached = scenarioHeatmapCacheRef.current.get(cacheKey);
          if (
            cached &&
            cached.refreshVersion === manualRefreshVersion &&
            cached.retryAt > requestedAt.getTime()
          ) {
            return filterOccupancySeriesToBucketKeys(
              cached.series,
              requestedBucketKeys,
              scenario.name,
            );
          }
          const firstUnattemptedBucket = range.buckets.find(
            (bucket) =>
              !cached?.attemptedBucketKeys.has(
                occupancyAggregateBucketKey(bucket, granularity),
              ),
          );
          const fullRefresh =
            !cached ||
            cached.refreshVersion !== manualRefreshVersion ||
            requestedAt.getTime() < cached.lastFullAttemptAt ||
            requestedAt.getTime() - cached.lastFullAttemptAt >=
              SCENARIO_HEATMAP_FULL_REFRESH_MS;
          const sourceFrom = fullRefresh
            ? range.from
            : (firstUnattemptedBucket ?? range.buckets.at(-1)!);
          const sourceBuckets = range.buckets.filter(
            (bucket) => bucket.getTime() >= sourceFrom.getTime(),
          );
          try {
            requireCompanyTimeZone(timeZone);
            const fetchResponse = (path: string) =>
              scheduleQuery(path, () =>
                fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
                  bypassCache: fullRefresh && Boolean(cached),
                  cacheTtlMs: aggregateRefreshMs,
                  companyScopeId,
                  path,
                  priority: granularity === "minute" ? "normal" : "background",
                  scenarioId: scenario.id,
                  signal: requestController.signal,
                  timeZone,
                }),
              );
            const response =
              granularity === "minute"
                ? await fetchResponse(
                    occupancyAggregatePath(
                      scenario.id,
                      sourceFrom,
                      range.to,
                      granularity,
                    ),
                  )
                : await fetchOccupancyCivilAggregate({
                    bypassUnitCache: fullRefresh && Boolean(cached),
                    capabilities: civilAggregateCapabilities,
                    companyScopeId,
                    fetchResponse,
                    from: sourceFrom,
                    granularity: civilGranularity!,
                    maximumFallbackRequests:
                      occupancyLiveCivilFallbackRequestLimit(
                        civilGranularity!,
                      ),
                    openBucket: sourceBuckets.at(-1),
                    requestedAt,
                    scenarioId: scenario.id,
                    signal: requestController.signal,
                    timeZone,
                    to: range.to,
                    unitCache: scenarioHeatmapCivilUnitCacheRef.current,
                  });
            const rows = requireOccupancyAggregateRows(
              response,
              granularity,
              scenario.id,
              timeZone,
              {
                allowDocumentedAggregateResponse: true,
                allowVerifiedCivilAggregateResponse:
                  granularity !== "minute",
                expectedTimezone: timeZone,
                openBucket: sourceBuckets.at(-1),
                requestedAt,
                requireCertification: true,
              },
            );
            const coverage = aggregateOccupancyRowsForRequestedBuckets(
              rows,
              granularity,
              sourceBuckets,
              {
                allowDocumentedAggregateResponse: true,
                allowVerifiedCivilAggregateResponse:
                  granularity !== "minute",
                expectedTimezone: timeZone,
                openBucket: sourceBuckets.at(-1),
                requireCertification: true,
              },
            );
            const metrics = new Map(
              fullRefresh
                ? []
                : Array.from(cached?.series.metrics ?? []).filter(([key]) =>
                    requestedBucketKeys.has(key),
                  ),
            );
            coverage.totals.forEach((metric, bucket) =>
              metrics.set(bucket, metric),
            );
            const coverageState =
              updateOccupancyScenarioHeatmapAttemptedBuckets({
                fullRefresh,
                granularity,
                missingBuckets: coverage.missingBuckets,
                previous: cached?.attemptedBucketKeys ?? new Set<number>(),
                previousRetry:
                  cached?.coverageRetryBucketKeys ?? new Set<number>(),
                refreshedBuckets: sourceBuckets.filter((bucket) =>
                  coverage.totals.has(
                    occupancyAggregateBucketKey(bucket, granularity),
                  ),
                ),
                requestedBuckets: range.buckets,
              });
            const nextSeries: OccupancyScenarioHourlySeries = {
              metrics,
              name: scenario.name,
              scenarioId: scenario.id,
              warning: joinMessages(
                timeZoneWarning,
                occupancyAggregateMetadataWarning(response, granularity),
                occupancyAggregateCoverageWarning(
                  coverage.missingBuckets.length,
                  sourceBuckets.length,
                ),
              ),
            };
            setBoundedComparisonCacheEntry(
              scenarioHeatmapCacheRef.current,
              cacheKey,
              {
                attemptedBucketKeys: coverageState.attemptedBucketKeys,
                completedAt: Date.now(),
                coverageRetryBucketKeys:
                  coverageState.coverageRetryBucketKeys,
                lastFullAttemptAt: fullRefresh
                  ? requestedAt.getTime()
                  : (cached?.lastFullAttemptAt ?? requestedAt.getTime()),
                refreshVersion: manualRefreshVersion,
                retryAt: 0,
                series: nextSeries,
              },
            );
            trimOldestMapEntries(
              scenarioHeatmapCivilUnitCacheRef.current,
              MAX_SCENARIO_HEATMAP_CIVIL_UNIT_CACHE_ENTRIES,
            );
            return nextSeries;
          } catch (error) {
            if (requestController.signal.aborted) {
              return filterOccupancySeriesToBucketKeys(
                cached?.series ?? {
                  metrics: new Map(),
                  name: scenario.name,
                  scenarioId: scenario.id,
                },
                requestedBucketKeys,
                scenario.name,
              );
            }
            const nextSeries: OccupancyScenarioHourlySeries = {
              error: occupancyRequestError(
                error,
                `A série por ${occupancyScenarioHeatmapGranularityLabel(granularity)} não está disponível.`,
              ),
              metrics: new Map(
                Array.from(cached?.series.metrics ?? []).filter(([key]) =>
                  requestedBucketKeys.has(key),
                ),
              ),
              name: scenario.name,
              scenarioId: scenario.id,
              warning: cached?.series.warning,
            };
            setBoundedComparisonCacheEntry(
              scenarioHeatmapCacheRef.current,
              cacheKey,
              {
                attemptedBucketKeys:
                  cached?.attemptedBucketKeys ?? new Set<number>(),
                completedAt: Date.now(),
                coverageRetryBucketKeys:
                  cached?.coverageRetryBucketKeys ?? new Set<number>(),
                lastFullAttemptAt: cached?.lastFullAttemptAt ?? 0,
                refreshVersion: cached?.refreshVersion ?? -1,
                retryAt: requestedAt.getTime() + SCENARIO_HEATMAP_RETRY_MS,
                series: nextSeries,
              },
            );
            return nextSeries;
          }
        },
      );
      const latestRange = buildOccupancyScenarioHeatmapRange(
        new Date(),
        granularity,
        scenarioHeatmapRangeDayCount,
        timeZone,
      );
      if (
        disposed ||
        requestController.signal.aborted ||
        generation !== requestGeneration
      ) {
        return;
      }
      if (!sameOccupancyRange(range, latestRange)) {
        scheduleNext(0);
        return;
      }
      setScenarioHeatmapDataset({
        buckets: range.buckets,
        from: range.from,
        granularity,
        loading: false,
        scopeKey: scenarioHeatmapScopeKey,
        series,
        to: range.to,
      });
      scheduleNext();
    }

    function handleAvailabilityChange() {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) return;
      if (timeout) window.clearTimeout(timeout);
      void refreshScenarioHeatmap();
    }

    void refreshScenarioHeatmap();
    document.addEventListener("visibilitychange", handleAvailabilityChange);
    window.addEventListener("online", handleAvailabilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener(
        "visibilitychange",
        handleAvailabilityChange,
      );
      window.removeEventListener("online", handleAvailabilityChange);
    };
  }, [
    aggregateRefreshMs,
    civilAggregateCapabilities,
    companyScopeId,
    historicalMode,
    manualRefreshVersion,
    queryEnabled,
    scenarioHeatmapScopeKey,
    scenarioHeatmapRangeDayCount,
    scenarioHeatmapSelectionKey,
    scenarioHeatmapVisible,
    scopedScenarios,
    settings.scenarioHeatmapGranularity,
    settingsReady,
    timeZone,
    timeZoneWarning,
    userId,
  ]);

  React.useEffect(() => {
    if (!queryEnabled || historicalMode) return;
    if (!needsCurrentHourMaximum) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let requestGeneration = 0;
    let refreshRunning = false;

    function scheduleNext(
      boundary?: Date,
      immediate = false,
      delayMs = aggregateRefreshMs,
    ) {
      if (disposed) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        refreshCurrentHourMaximum,
        immediate
          ? 0
          : temporalRefreshDelay(delayMs, boundary),
      );
    }

    async function refreshCurrentHourMaximum() {
      if (disposed || refreshRunning) return;
      refreshRunning = true;
      try {
        await runCurrentHourMaximumRefresh();
      } catch (error) {
        if (!disposed && !controller?.signal.aborted) throw error;
      } finally {
        refreshRunning = false;
      }
    }

    async function runCurrentHourMaximumRefresh() {
      if (disposed || !settingsReady) return;
      const requestedIds = new Set(
        currentHourSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        setCurrentHourMaximumDataset({
          bucket: null,
          loading: false,
          scopeKey: currentHourScopeKey,
          series: [],
        });
        return;
      }
      try {
        requireCompanyTimeZone(timeZone);
      } catch (error) {
        setCurrentHourMaximumDataset({
          bucket: null,
          loading: false,
          scopeKey: currentHourScopeKey,
          series: requestedScenarios.map((scenario) => ({
            error: occupancyRequestError(
              error,
              "Não foi possível validar o fuso horário da empresa.",
            ),
            name: scenario.name,
            peaks: new Map(),
            scenarioId: scenario.id,
            source: "observed",
          })),
        });
        scheduleNext();
        return;
      }
      const requestedAt = new Date();
      const range = buildOccupancyCurrentHourRange(requestedAt, timeZone);
      const minuteRange = buildOccupancyClosedMinuteRange(requestedAt, timeZone);
      const aggregateSource = aggregateDatasetRef.current;
      const aggregateCoversCurrentHour = Boolean(
        needsHourlyAggregate &&
          !aggregateSource.loading &&
          aggregateSource.scopeKey === aggregateScopeKey &&
          aggregateSource.from &&
          aggregateSource.to &&
          aggregateSource.from <= range.from &&
          aggregateSource.to >= range.to,
      );
      if (needsHourlyAggregate && comparisonSelectionKey && !aggregateCoversCurrentHour) {
        // The broader hourly request owns this source. Its state update reruns
        // this effect, avoiding a second request for the same open hour.
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        scheduleNext(endOfAggregateBucket(requestedAt, "minute"));
        return;
      }
      const windowKey = [
        occupancyComparisonRangeKey(range),
        occupancyComparisonRangeKey(minuteRange),
      ].join("|");
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.currentHourMaximum,
        {
          now: requestedAt,
          refreshMs: aggregateRefreshMs,
          refreshVersion: 0,
          scopeKey: currentHourScopeKey,
          windowKey,
        },
      );
      if (freshnessRemainingMs > 0) {
        scheduleNext(
          endOfAggregateBucket(requestedAt, "minute"),
          false,
          freshnessRemainingMs,
        );
        return;
      }

      const generation = ++requestGeneration;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const scheduleQuery = createOccupancyQueryScheduler(
        requestController.signal,
        MAX_PARALLEL_REQUESTS,
        OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,
      );
      setCurrentHourMaximumDataset((current) =>
        current.scopeKey === currentHourScopeKey &&
        current.bucket?.getTime() === range.from.getTime()
          ? current
          : {
              bucket: range.from,
              loading: true,
              scopeKey: currentHourScopeKey,
              series: [],
            },
      );

      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioOpenMaximumSeries> => {
          const observedCacheKey = `${userId ?? ""}|${companyScopeId}|${timeZone}|${scenario.id}`;
          const cachedObservedCandidate =
            SHARED_OCCUPANCY_CURRENT_HOUR_MAXIMUM_CACHE.get(observedCacheKey);
          const observedCache =
            cachedObservedCandidate?.hour === range.from.getTime()
              ? cachedObservedCandidate
              : undefined;
          let hourWarning: string | undefined;
          if (aggregateCoversCurrentHour && aggregateSource.series.some((item) => item.scenarioId === scenario.id)) {
            const sharedSeries = aggregateSource.series.find(
              (candidate) => candidate.scenarioId === scenario.id,
            );
            const metric = sharedSeries?.metrics.get(
              occupancyAggregateBucketKey(range.from, "hour"),
            );
            hourWarning = joinMessages(
              sharedSeries?.warning,
              sharedSeries?.error,
            );
            if (metric) {
              return {
                name: scenario.name,
                peaks: new Map([
                  [occupancyAggregateBucketKey(range.from, "hour"), metric.peak],
                ]),
                scenarioId: scenario.id,
                source: "hour",
                warning: hourWarning,
              };
            }
          } else if (!observedCache) {
            try {
              const hourPath = occupancyAggregatePath(
                scenario.id,
                range.from,
                range.to,
              );
              const response = await scheduleQuery(
                hourPath,
                () => fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
                  cacheTtlMs: aggregateRefreshMs,
                  companyScopeId,
                  path: hourPath,
                  priority: "background",
                  scenarioId: scenario.id,
                  signal: requestController.signal,
                  timeZone,
                }),
              );
              const rows = requireOccupancyAggregateRows(
                response,
                "hour",
                scenario.id,
                timeZone,
                {
                  allowDocumentedAggregateResponse: true,
                  expectedTimezone: timeZone,
                  openBucket: range.from,
                  requestedAt,
                  requireCertification: true,
                },
              );
              const coverage = aggregateOccupancyRowsForRequestedBuckets(
                rows,
                "hour",
                range.buckets,
                {
                  allowDocumentedAggregateResponse: true,
                  expectedTimezone: timeZone,
                  openBucket: range.from,
                  requireCertification: true,
                },
              );
              const metric = coverage.totals.get(
                occupancyAggregateBucketKey(range.from, "hour"),
              );
              hourWarning = joinMessages(
                timeZoneWarning,
                occupancyAggregateMetadataWarning(response, "hour"),
                occupancyAggregateCoverageWarning(
                  coverage.missingBuckets.length,
                  range.buckets.length,
                ),
              );
              if (metric) {
                return {
                  name: scenario.name,
                  peaks: new Map([
                    [
                      occupancyAggregateBucketKey(range.from, "hour"),
                      metric.peak,
                    ],
                  ]),
                  scenarioId: scenario.id,
                  source: "hour",
                  warning: hourWarning,
                };
              }
            } catch (error) {
              hourWarning = occupancyRequestError(
                error,
                "A hora em andamento ainda não está disponível.",
              );
            }
          }

          if (!hourWarning && aggregateCoversCurrentHour) {
            hourWarning = joinMessages(
              timeZoneWarning,
              "A hora em andamento será recomposta pelos minutos encerrados.",
            );
          }

          if (!minuteRange.buckets.length) {
            return {
              name: scenario.name,
              peaks: new Map(),
              scenarioId: scenario.id,
              source: "observed",
              warning: joinMessages(
                hourWarning,
                "Início da hora: o primeiro ponto usa a leitura ao vivo até o primeiro minuto encerrar.",
              ),
            };
          }

          const cachedPeak = observedCache?.minutePeaks.size
            ? Math.max(...observedCache.minutePeaks.values())
            : null;
          if (
            observedCache &&
            observedCache.retryAt > requestedAt.getTime()
          ) {
            return {
              error:
                cachedPeak === null
                  ? "A atualização da hora será tentada novamente em instantes."
                  : undefined,
              name: scenario.name,
              peaks:
                cachedPeak === null
                  ? new Map()
                  : new Map([
                      [
                        occupancyAggregateBucketKey(range.from, "hour"),
                        cachedPeak,
                      ],
                    ]),
              scenarioId: scenario.id,
              source: "observed",
              warning: joinMessages(hourWarning, observedCache.warning),
            };
          }

          const sourceFrom = observedCache
            ? new Date(
                Math.max(
                  minuteRange.from.getTime(),
                  observedCache.through - CURRENT_HOUR_MAXIMUM_OVERLAP_MS,
                ),
              )
            : minuteRange.from;
          const sourceBuckets = minuteRange.buckets.filter(
            (bucket) => bucket >= sourceFrom,
          );
          if (!sourceBuckets.length && observedCache) {
            return {
              name: scenario.name,
              peaks:
                cachedPeak === null
                  ? new Map()
                  : new Map([
                      [
                        occupancyAggregateBucketKey(range.from, "hour"),
                        cachedPeak,
                      ],
                    ]),
              scenarioId: scenario.id,
              source: "observed",
              warning: joinMessages(hourWarning, observedCache.warning),
            };
          }

          try {
            const minutePath = occupancyAggregatePath(
              scenario.id,
              sourceFrom,
              minuteRange.to,
              "minute",
            );
            const minuteResponse = await scheduleQuery(
              minutePath,
              () => fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
                cacheTtlMs: aggregateRefreshMs,
                companyScopeId,
                path: minutePath,
                priority: "background",
                scenarioId: scenario.id,
                signal: requestController.signal,
                timeZone,
              }),
            );
            const minuteRows = requireOccupancyAggregateRows(
              minuteResponse,
              "minute",
              scenario.id,
              timeZone,
              {
                allowDocumentedAggregateResponse: true,
                expectedTimezone: timeZone,
                requireCertification: true,
              },
            );
            const minuteCoverage = aggregateOccupancyRowsForRequestedBuckets(
              minuteRows,
              "minute",
              sourceBuckets,
              {
                allowDocumentedAggregateResponse: true,
                expectedTimezone: timeZone,
                requireCertification: true,
              },
            );
            const minutePeaks = new Map(observedCache?.minutePeaks);
            sourceBuckets.forEach((bucket) =>
              minutePeaks.delete(
                occupancyAggregateBucketKey(bucket, "minute"),
              ),
            );
            minuteCoverage.totals.forEach((metric, bucket) =>
              minutePeaks.set(bucket, metric.peak),
            );
            const warning = joinMessages(
              occupancyAggregateMetadataWarning(minuteResponse, "minute"),
              occupancyAggregateCoverageWarning(
                minuteCoverage.missingBuckets.length,
                sourceBuckets.length,
              ),
            );
            setBoundedComparisonCacheEntry(
              SHARED_OCCUPANCY_CURRENT_HOUR_MAXIMUM_CACHE,
              observedCacheKey,
              {
                failures: 0,
                hour: range.from.getTime(),
                minutePeaks,
                retryAt: 0,
                through: minuteRange.to.getTime(),
                warning,
              },
            );
            const peak = minutePeaks.size
              ? Math.max(...minutePeaks.values())
              : null;
            return {
              name: scenario.name,
              peaks:
                peak === null
                  ? new Map()
                  : new Map([
                      [occupancyAggregateBucketKey(range.from, "hour"), peak],
                    ]),
              scenarioId: scenario.id,
              source: "observed",
              warning: joinMessages(
                hourWarning,
                warning,
                "Hora em andamento composta pelos minutos encerrados e pela leitura ao vivo; permanece marcada como parcial.",
              ),
            };
          } catch (error) {
            if (requestController.signal.aborted) throw error;
            const failures = Math.min(
              (observedCache?.failures ?? 0) + 1,
              CURRENT_HOUR_MAXIMUM_RETRY_DELAYS_MS.length,
            );
            setBoundedComparisonCacheEntry(
              SHARED_OCCUPANCY_CURRENT_HOUR_MAXIMUM_CACHE,
              observedCacheKey,
              {
                failures,
                hour: range.from.getTime(),
                minutePeaks: new Map(observedCache?.minutePeaks),
                retryAt:
                  requestedAt.getTime() +
                  CURRENT_HOUR_MAXIMUM_RETRY_DELAYS_MS[
                    Math.max(0, failures - 1)
                  ],
                through: observedCache?.through ?? minuteRange.from.getTime(),
                warning: observedCache?.warning,
              },
            );
            return {
              error: occupancyRequestError(
                error,
                "Não foi possível recompor o máximo da hora aberta.",
              ),
              name: scenario.name,
              peaks:
                cachedPeak === null
                  ? new Map()
                  : new Map([
                      [
                        occupancyAggregateBucketKey(range.from, "hour"),
                        cachedPeak,
                      ],
                    ]),
              scenarioId: scenario.id,
              source: "observed",
              warning: hourWarning,
            };
          }
        },
      );

      const completedAt = new Date();
      const latestRange = buildOccupancyCurrentHourRange(completedAt, timeZone);
      const latestMinuteRange = buildOccupancyClosedMinuteRange(completedAt, timeZone);
      if (
        disposed ||
        requestController.signal.aborted ||
        generation !== requestGeneration
      ) {
        return;
      }
      if (
        !sameOccupancyRange(range, latestRange) ||
        !sameOccupancyRange(minuteRange, latestMinuteRange)
      ) {
        scheduleNext(undefined, true);
        return;
      }

      setCurrentHourMaximumDataset((current) => ({
        bucket: range.from,
        loading: false,
        scopeKey: currentHourScopeKey,
        series:
          current.scopeKey === currentHourScopeKey &&
          current.bucket?.getTime() === range.from.getTime()
            ? preserveCurrentHourMetricsOnFailure(current.series, series)
            : series,
      }));
      resourceFreshnessRef.current.currentHourMaximum =
        completeOccupancyComparisonResource(
          0,
          currentHourScopeKey,
          windowKey,
        );
      scheduleNext(endOfAggregateBucket(new Date(), "minute"));
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) return;
      if (timeout) window.clearTimeout(timeout);
      void refreshCurrentHourMaximum();
    }

    void refreshCurrentHourMaximum();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
    };
  }, [
    aggregateRefreshMs,
    aggregateAvailabilityKey,
    aggregateScopeKey,
    companyScopeId,
    comparisonSelectionKey,
    currentHourSelectionKey,
    currentHourScopeKey,
    historicalMode,
    needsCurrentHourMaximum,
    queryEnabled,
    needsHourlyAggregate,
    scopedScenarios,
    settingsReady,
    timeZone,
    timeZoneWarning,
    userId,
  ]);

  React.useEffect(() => {
    if (!queryEnabled || historicalMode || !needsMaximumTrend) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;

    let requestGeneration = 0;
    let refreshRunning = false;

    function scheduleNext(
      boundary?: Date,
      immediate = false,
      delayMs = maximumTrendRefreshMs,
    ) {
      if (disposed) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        refreshMaximumTrends,
        immediate
          ? 0
          : temporalRefreshDelay(delayMs, boundary),
      );
    }

    async function refreshMaximumTrends() {
      if (disposed || refreshRunning) return;
      refreshRunning = true;
      try {
        await runMaximumTrendRefresh();
      } catch (error) {
        if (!disposed && !controller?.signal.aborted) throw error;
      } finally {
        refreshRunning = false;
      }
    }

    async function runMaximumTrendRefresh() {
      if (disposed || !settingsReady) return;
      const requestedAt = new Date();
      const ranges = buildOccupancyMaximumTrendRanges(requestedAt, timeZone);
      const nextMonthlyBoundary = occupancyCalendarBoundaryInstant(ranges.monthlySource.to, timeZone);
      const requestedIds = new Set(
        maximumTrendSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        const emptyDataset: MaximumTrendDataset = {
          loading: false,
          ranges,
          scopeKey: maximumTrendScopeKey,
          series: [],
        };
        maximumTrendDatasetRef.current = emptyDataset;
        setMaximumTrendDataset(emptyDataset);
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        scheduleNext(nextMonthlyBoundary);
        return;
      }
      const windowKey = occupancyMaximumTrendRangeKey(ranges);
      const cachePrefix = `${userId ?? ""}|${companyScopeId}|${timeZone}|`;
      const retryStates = requestedScenarios.flatMap((scenario) => {
        const retry = SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES.get(
          `${cachePrefix}${scenario.id}`,
        );
        return retry ? [retry] : [];
      });
      const hasRetryReady = retryStates.some(
        (retry) => retry.retryAt <= requestedAt.getTime(),
      );
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.maximumTrend,
        {
          now: requestedAt,
          refreshMs: aggregateRefreshMs,
          // Four years of closed history remain warm; the minute cadence reads
          // only the current-month edge assembled below.
          refreshVersion: 0,
          scopeKey: maximumTrendScopeKey,
          windowKey,
        },
      );
      if (freshnessRemainingMs > 0 && !hasRetryReady) {
        scheduleNext(
          nextMonthlyBoundary,
          false,
          freshnessRemainingMs,
        );
        return;
      }

      const generation = ++requestGeneration;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setMaximumTrendDataset((current) =>
        current.scopeKey === maximumTrendScopeKey &&
        current.ranges !== null &&
        sameMaximumTrendRanges(current.ranges, ranges)
          ? current
          : {
              loading: true,
              ranges,
              scopeKey: maximumTrendScopeKey,
              series: [],
            },
      );
      const scheduleQuery = createOccupancyQueryScheduler(
        requestController.signal,
        MAX_PARALLEL_REQUESTS,
        OCCUPANCY_LIVE_QUERY_REQUEST_LIMIT,
      );
      const reusableDataset =
        maximumTrendDatasetRef.current.scopeKey === maximumTrendScopeKey &&
        maximumTrendDatasetRef.current.ranges &&
        sameMaximumTrendRanges(
          maximumTrendDatasetRef.current.ranges,
          ranges,
        )
          ? maximumTrendDatasetRef.current
          : null;
      const reusableSeriesById = new Map(
        (reusableDataset?.series ?? []).map((item) => [
          item.scenarioId,
          item,
        ]),
      );
      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioHourlySeries> => {
          const cacheKey = `${cachePrefix}${scenario.id}`;
          const retained = maximumTrendSeriesCacheRef.current.get(cacheKey);
          const previous =
            retained?.rangeKey === windowKey
              ? retained.series
              : reusableSeriesById.get(scenario.id);
          const lastFullRefreshAt =
            maximumTrendFullRefreshRef.current.get(cacheKey) ?? 0;
          const retry = SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES.get(cacheKey);
          if (retry && retry.retryAt > requestedAt.getTime()) {
            return (
              previous ?? {
                error:
                  "A atualização dos máximos mensais será tentada novamente em instantes.",
                metrics: new Map(),
                name: scenario.name,
                scenarioId: scenario.id,
              }
            );
          }
          const fullRefresh =
            !previous ||
            requestedAt.getTime() < lastFullRefreshAt ||
            requestedAt.getTime() - lastFullRefreshAt >=
              MAXIMUM_TREND_FULL_REFRESH_MS;
          const currentMonthBucket = ranges.monthlySource.buckets.at(-1)!;
          // This timestamp represents the last complete-range attempt, not
          // only perfect coverage. Legitimate empty months or a partial
          // backend response must not replay four years on the live pulse.
          if (fullRefresh) {
            setBoundedComparisonCacheEntry(
              maximumTrendFullRefreshRef.current,
              cacheKey,
              requestedAt.getTime(),
            );
          }
          let nextSeries: OccupancyScenarioHourlySeries;
          try {
            requireCompanyTimeZone(timeZone);
            let metrics: Map<number, OccupancyAggregateMetric>;
            let refreshWarning: string | undefined;
            if (fullRefresh) {
              // The API does not accept year. Audit the four-year monthly
              // source only on a cold load/day boundary; this is never the
              // five-second path.
              const response = await fetchOccupancyCivilAggregate({
                capabilities: civilAggregateCapabilities,
                scenarioId: scenario.id,
                granularity: "month",
                maximumFallbackRequests:
                  occupancyLiveCivilFallbackRequestLimit("month"),
                from: ranges.monthlySource.from,
                to: ranges.monthlySource.to,
                timeZone,
                companyScopeId,
                signal: requestController.signal,
                requestedAt,
                openBucket: currentMonthBucket,
                fetchResponse: (path) => scheduleQuery(path, () =>
                  fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
                    cacheTtlMs: aggregateRefreshMs,
                    companyScopeId,
                    path,
                    priority: "background",
                    scenarioId: scenario.id,
                    signal: requestController.signal,
                    timeZone,
                  })),
              });
              const rows = requireOccupancyAggregateRows(
                response,
                "month",
                scenario.id,
                timeZone,
                {
                  allowDocumentedAggregateResponse: true,
                  allowVerifiedCivilAggregateResponse: true,
                  expectedTimezone: timeZone,
                  openBucket: currentMonthBucket,
                  requestedAt,
                  requireCertification: true,
                },
              );
              const coverage = aggregateOccupancyRowsForRequestedBuckets(
                rows,
                "month",
                ranges.monthlySource.buckets,
                {
                  allowDocumentedAggregateResponse: true,
                  allowVerifiedCivilAggregateResponse: true,
                  expectedTimezone: timeZone,
                  openBucket: currentMonthBucket,
                  requireCertification: true,
                },
              );
              metrics = new Map(coverage.totals);
              refreshWarning = joinMessages(
                occupancyAggregateMetadataWarning(response, "month"),
                occupancyAggregateCoverageWarning(
                  coverage.missingBuckets.length,
                  ranges.monthlySource.buckets.length,
                ),
              );
            } else {
              // The maximum widgets already demand the current-hour source.
              // Reuse that certified edge and keep all closed months intact;
              // in particular, a civil-aggregate fallback never rebuilds the
              // current month (or four years) every five seconds.
              const currentHourRange = buildOccupancyCurrentHourRange(
                requestedAt,
                timeZone,
              );
              const currentHourDataset = currentHourMaximumDatasetRef.current;
              const openSeries =
                currentHourDataset.scopeKey === currentHourScopeKey &&
                currentHourDataset.bucket?.getTime() ===
                  currentHourRange.from.getTime()
                  ? currentHourDataset.series.find(
                      (candidate) => candidate.scenarioId === scenario.id,
                    )
                  : undefined;
              const openPeak = openSeries?.peaks.get(
                occupancyAggregateBucketKey(currentHourRange.from, "hour"),
              );
              metrics = mergeOccupancyMaximumTrendOpenPeak({
                currentMonth: currentMonthBucket,
                metrics: previous!.metrics,
                openPeak,
              });
              refreshWarning = joinMessages(
                previous?.warning,
                openSeries?.warning,
                openSeries?.error,
              );
            }
            const missingBuckets = ranges.monthlySource.buckets.filter(
              (bucket) =>
                !metrics.has(occupancyAggregateBucketKey(bucket, "month")),
            ).length;
            nextSeries = {
              metrics,
              name: scenario.name,
              scenarioId: scenario.id,
              warning: joinMessages(
                timeZoneWarning,
                refreshWarning,
                occupancyAggregateCoverageWarning(
                  missingBuckets,
                  ranges.monthlySource.buckets.length,
                ),
              ),
            };
            SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES.delete(cacheKey);
          } catch (error) {
            if (requestController.signal.aborted) {
              if (lastFullRefreshAt > 0) {
                setBoundedComparisonCacheEntry(
                  maximumTrendFullRefreshRef.current,
                  cacheKey,
                  lastFullRefreshAt,
                );
              } else {
                maximumTrendFullRefreshRef.current.delete(cacheKey);
              }
              return (
                previous ?? {
                  metrics: new Map(),
                  name: scenario.name,
                  scenarioId: scenario.id,
                }
              );
            }
            if (lastFullRefreshAt > 0) {
              setBoundedComparisonCacheEntry(
                maximumTrendFullRefreshRef.current,
                cacheKey,
                lastFullRefreshAt,
              );
            } else if (fullRefresh) {
              maximumTrendFullRefreshRef.current.delete(cacheKey);
            }
            const failures = Math.min(
              (SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES.get(cacheKey)?.failures ??
                0) + 1,
              MAXIMUM_TREND_RETRY_DELAYS_MS.length,
            );
            setBoundedComparisonCacheEntry(
              SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES,
              cacheKey,
              {
                failures,
                retryAt:
                  requestedAt.getTime() +
                  MAXIMUM_TREND_RETRY_DELAYS_MS[Math.max(0, failures - 1)],
              },
            );
            if (previous?.metrics.size) {
              nextSeries = {
                ...previous,
                error: undefined,
                name: scenario.name,
                warning: joinMessages(
                  previous.warning,
                  occupancyRequestError(
                    error,
                    "Não foi possível atualizar o mês em andamento.",
                  ),
                ),
              };
            } else {
              nextSeries = {
                error: occupancyRequestError(
                  error,
                  "Os máximos mensais não estão disponíveis.",
                ),
                metrics: new Map(),
                name: scenario.name,
                scenarioId: scenario.id,
              };
            }
          }
          setBoundedComparisonCacheEntry(
            maximumTrendSeriesCacheRef.current,
            cacheKey,
            {
              completedAt: requestedAt.getTime(),
              rangeKey: windowKey,
              series: nextSeries,
            },
          );
          return nextSeries;
        },
      );
      const latestRanges = buildOccupancyMaximumTrendRanges(new Date(), timeZone);
      if (
        disposed ||
        requestController.signal.aborted ||
        generation !== requestGeneration
      ) {
        return;
      }
      if (!sameMaximumTrendRanges(ranges, latestRanges)) {
        scheduleNext(undefined, true);
        return;
      }

      const nextDataset: MaximumTrendDataset = {
        loading: false,
        ranges,
        scopeKey: maximumTrendScopeKey,
        series,
      };
      maximumTrendDatasetRef.current = nextDataset;
      setMaximumTrendDataset(nextDataset);
      resourceFreshnessRef.current.maximumTrend =
        completeOccupancyComparisonResource(
          0,
          maximumTrendScopeKey,
          windowKey,
        );
      const nextRetryAt = requestedScenarios.reduce((earliest, scenario) => {
        const retryAt = SHARED_OCCUPANCY_MAXIMUM_TREND_RETRIES.get(
          `${cachePrefix}${scenario.id}`,
        )?.retryAt;
        return retryAt === undefined ? earliest : Math.min(earliest, retryAt);
      }, Number.POSITIVE_INFINITY);
      scheduleNext(
        nextMonthlyBoundary,
        false,
        Number.isFinite(nextRetryAt)
          ? Math.max(250, nextRetryAt - Date.now())
          : maximumTrendRefreshMs,
      );
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) return;
      if (timeout) window.clearTimeout(timeout);
      void refreshMaximumTrends();
    }

    void refreshMaximumTrends();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
    };
  }, [
    aggregateRefreshMs,
    civilAggregateCapabilities,
    companyScopeId,
    currentHourScopeKey,
    historicalMode,
    maximumTrendSelectionKey,
    maximumTrendRefreshMs,
    maximumTrendScopeKey,
    needsMaximumTrend,
    queryEnabled,
    scopedScenarios,
    settingsReady,
    timeZone,
    timeZoneWarning,
    userId,
  ]);

  const historicalRanges = React.useMemo(
    () =>
      historicalMode && stableManualPeriod
        ? buildOccupancyHistoricalComparisonRanges({
            dayCount: settings.dayCount,
            needsAnnualMaximum,
            needsHourlyAggregate,
            needsHourlyHeatmap,
            needsMaximumTrend,
            needsScenarioHeatmap: scenarioHeatmapVisible,
            period: stableManualPeriod,
            scenarioHeatmapGranularity:
              settings.scenarioHeatmapGranularity,
            timeZone,
          })
        : null,
    [
      historicalMode,
      needsAnnualMaximum,
      needsHourlyAggregate,
      needsHourlyHeatmap,
      needsMaximumTrend,
      scenarioHeatmapVisible,
      settings.dayCount,
      settings.scenarioHeatmapGranularity,
      stableManualPeriod,
      timeZone,
    ],
  );

  React.useEffect(() => {
    if (!historicalMode) return;
    if (
      !queryEnabled ||
      !settingsReady ||
      !stableManualPeriod ||
      !historicalRanges ||
      !companyScopeId.trim()
    ) {
      setSnapshotDataset({
        loading: false,
        requestedAt: null,
        scopeKey: "",
        snapshots: [],
      });
      setAggregateDataset({
        buckets: [],
        from: null,
        loading: false,
        scopeKey: "",
        series: [],
        to: null,
      });
      setScenarioHeatmapDataset({
        buckets: [],
        from: null,
        granularity: settings.scenarioHeatmapGranularity,
        loading: false,
        scopeKey: "",
        series: [],
        to: null,
      });
      setMaximumTrendDataset({
        loading: false,
        ranges: null,
        scopeKey: "",
        series: [],
      });
      setCurrentHourMaximumDataset({
        bucket: null,
        loading: false,
        scopeKey: "",
        series: [],
      });
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    const plan: OccupancyHistoricalComparisonLoadPlan = {
      hourlyScenarioIds: selectionPlan.hourly,
      maximumTrendScenarioIds: selectionPlan.trends,
      needsHourlyAggregate,
      needsMaximumTrend,
      needsScenarioHeatmap: scenarioHeatmapVisible,
      needsSnapshots,
      scenarioHeatmapScenarioIds:
        selectionPlan.byCard.get("occupancy_scenario_hour_heatmap") ?? [],
      snapshotScenarioIds,
    };

    setSnapshotDataset({
      loading: needsSnapshots,
      requestedAt: stableManualPeriod.referenceAt,
      scopeKey: snapshotScopeKey,
      snapshots: [],
    });
    setAggregateDataset({
      buckets: historicalRanges.hourly?.buckets ?? [],
      from: historicalRanges.hourly?.from ?? null,
      loading: needsHourlyAggregate,
      scopeKey: aggregateScopeKey,
      series: [],
      to: historicalRanges.hourly?.to ?? null,
    });
    setScenarioHeatmapDataset({
      buckets: historicalRanges.scenarioHeatmap?.buckets ?? [],
      from: historicalRanges.scenarioHeatmap?.from ?? null,
      granularity: settings.scenarioHeatmapGranularity,
      loading:
        scenarioHeatmapVisible &&
        settings.scenarioHeatmapGranularity !== "hour",
      scopeKey: scenarioHeatmapScopeKey,
      series: [],
      to: historicalRanges.scenarioHeatmap?.to ?? null,
    });
    setMaximumTrendDataset({
      loading: needsMaximumTrend,
      ranges: historicalRanges.maximumTrend,
      scopeKey: maximumTrendScopeKey,
      series: [],
    });
    setCurrentHourMaximumDataset({
      bucket: null,
      loading: false,
      scopeKey: currentHourScopeKey,
      series: [],
    });

    void loadOccupancyHistoricalComparisonDataset({
      bypassCache: manualRefreshVersion > 0,
      companyScopeId,
      period: stableManualPeriod,
      plan,
      ranges: historicalRanges,
      scenarioHeatmapGranularity: settings.scenarioHeatmapGranularity,
      scenarios: scopedScenarios,
      signal: controller.signal,
      timeZone,
      timeZoneWarning,
    }).then(
      (dataset) => {
        if (disposed || controller.signal.aborted) return;
        setSnapshotDataset({
          loading: false,
          requestedAt: stableManualPeriod.referenceAt,
          scopeKey: snapshotScopeKey,
          snapshots: dataset.snapshots,
        });
        setAggregateDataset({
          buckets: dataset.hourlyRange?.buckets ?? [],
          from: dataset.hourlyRange?.from ?? null,
          loading: false,
          scopeKey: aggregateScopeKey,
          series: dataset.hourlySeries,
          to: dataset.hourlyRange?.to ?? null,
        });
        setScenarioHeatmapDataset({
          buckets: dataset.scenarioHeatmapRange?.buckets ?? [],
          from: dataset.scenarioHeatmapRange?.from ?? null,
          granularity: settings.scenarioHeatmapGranularity,
          loading: false,
          scopeKey: scenarioHeatmapScopeKey,
          series: dataset.scenarioHeatmapSeries,
          to: dataset.scenarioHeatmapRange?.to ?? null,
        });
        setMaximumTrendDataset({
          loading: false,
          ranges: dataset.maximumTrendRanges,
          scopeKey: maximumTrendScopeKey,
          series: dataset.maximumTrendSeries,
        });
      },
      (error: unknown) => {
        if (disposed || isAbortError(error, controller.signal)) return;
        const message = occupancyRequestError(
          error,
          "A comparação histórica não está disponível.",
        );
        const failedSeries = historicalComparisonFailureSeries(
          Array.from(
            new Set([
              ...plan.hourlyScenarioIds,
              ...plan.maximumTrendScenarioIds,
              ...plan.scenarioHeatmapScenarioIds,
            ]),
          ),
          scopedScenarios,
          message,
        );
        setSnapshotDataset({
          loading: false,
          requestedAt: stableManualPeriod.referenceAt,
          scopeKey: snapshotScopeKey,
          snapshots: historicalSnapshotFailures(
            plan.snapshotScenarioIds,
            scopedScenarios,
            message,
          ),
        });
        setAggregateDataset((current) => ({
          ...current,
          loading: false,
          series: filterOccupancyComparisonRows(
            failedSeries,
            plan.hourlyScenarioIds,
          ),
        }));
        setScenarioHeatmapDataset((current) => ({
          ...current,
          loading: false,
          series: filterOccupancyComparisonRows(
            failedSeries,
            plan.scenarioHeatmapScenarioIds,
          ),
        }));
        setMaximumTrendDataset((current) => ({
          ...current,
          loading: false,
          series: filterOccupancyComparisonRows(
            failedSeries,
            plan.maximumTrendScenarioIds,
          ),
        }));
      },
    );

    return () => {
      disposed = true;
      abortRequest(
        controller,
        "A consulta histórica de comparação foi substituída.",
      );
    };
  }, [
    aggregateScopeKey,
    companyScopeId,
    currentHourScopeKey,
    historicalMode,
    historicalRanges,
    manualRefreshVersion,
    maximumTrendScopeKey,
    needsHourlyAggregate,
    needsMaximumTrend,
    needsSnapshots,
    queryEnabled,
    scenarioHeatmapScopeKey,
    scenarioHeatmapVisible,
    scopedScenarios,
    selectionPlan,
    settings.scenarioHeatmapGranularity,
    settingsReady,
    snapshotScenarioIds,
    snapshotScopeKey,
    stableManualPeriod,
    timeZone,
    timeZoneWarning,
  ]);

  const certifiedSnapshots =
    snapshotDataset.scopeKey === snapshotScopeKey || !needsSnapshots
      ? snapshotDataset.snapshots
      : EMPTY_OCCUPANCY_SNAPSHOTS;
  const certifiedAggregate = React.useMemo<AggregateDataset>(
    () =>
      aggregateDataset.scopeKey === aggregateScopeKey || !needsHourlyAggregate
        ? aggregateDataset
        : {
            buckets: EMPTY_OCCUPANCY_BUCKETS,
            from: null,
            loading: true,
            scopeKey: aggregateScopeKey,
            series: EMPTY_OCCUPANCY_HOURLY_SERIES,
            to: null,
          },
    [aggregateDataset, aggregateScopeKey, needsHourlyAggregate],
  );
  const certifiedScenarioHeatmap = React.useMemo<ScenarioHeatmapDataset>(
    () => {
      const granularity = settings.scenarioHeatmapGranularity;
      if (granularity === "hour") {
        return { ...certifiedAggregate, granularity };
      }
      return (scenarioHeatmapDataset.scopeKey === scenarioHeatmapScopeKey ||
          !scenarioHeatmapVisible) &&
        scenarioHeatmapDataset.granularity === granularity
        ? scenarioHeatmapDataset
        : {
            buckets: EMPTY_OCCUPANCY_BUCKETS,
            from: null,
            granularity,
            loading: true,
            scopeKey: scenarioHeatmapScopeKey,
            series: EMPTY_OCCUPANCY_HOURLY_SERIES,
            to: null,
          };
    },
    [
      certifiedAggregate,
      scenarioHeatmapDataset,
      scenarioHeatmapScopeKey,
      scenarioHeatmapVisible,
      settings.scenarioHeatmapGranularity,
    ],
  );
  const certifiedMaximumTrend = React.useMemo<MaximumTrendDataset>(
    () =>
      maximumTrendDataset.scopeKey === maximumTrendScopeKey ||
      !needsMaximumTrend
        ? maximumTrendDataset
        : {
            loading: true,
            ranges: null,
            scopeKey: maximumTrendScopeKey,
            series: EMPTY_OCCUPANCY_HOURLY_SERIES,
          },
    [maximumTrendDataset, maximumTrendScopeKey, needsMaximumTrend],
  );
  const certifiedCurrentHourMaximum = React.useMemo<CurrentHourMaximumDataset>(
    () =>
      currentHourMaximumDataset.scopeKey === currentHourScopeKey ||
      !needsCurrentHourMaximum
        ? currentHourMaximumDataset
        : {
            bucket: null,
            loading: true,
            scopeKey: currentHourScopeKey,
            series: EMPTY_OCCUPANCY_OPEN_MAXIMUM_SERIES,
          },
    [
      currentHourMaximumDataset,
      currentHourScopeKey,
      needsCurrentHourMaximum,
    ],
  );
  const snapshotLoading =
    queryEnabled &&
    needsSnapshots &&
    (snapshotDataset.scopeKey !== snapshotScopeKey || snapshotDataset.loading);
  const aggregateLoading =
    queryEnabled &&
    needsHourlyAggregate &&
    (aggregateDataset.scopeKey !== aggregateScopeKey ||
      aggregateDataset.loading);
  const scenarioHeatmapLoading =
    !queryEnabled
      ? false
      : settings.scenarioHeatmapGranularity === "hour"
      ? aggregateLoading
      : scenarioHeatmapVisible &&
        (scenarioHeatmapDataset.scopeKey !== scenarioHeatmapScopeKey ||
          scenarioHeatmapDataset.loading);
  const maximumTrendLoading =
    queryEnabled &&
    needsMaximumTrend &&
    (maximumTrendDataset.scopeKey !== maximumTrendScopeKey ||
      maximumTrendDataset.loading);
  const currentHourMaximumLoading =
    queryEnabled &&
    needsCurrentHourMaximum &&
    (currentHourMaximumDataset.scopeKey !== currentHourScopeKey ||
      currentHourMaximumDataset.loading);
  const loading =
    snapshotLoading ||
    aggregateLoading ||
    scenarioHeatmapLoading ||
    maximumTrendLoading ||
    currentHourMaximumLoading;
  const historicalSnapshotDemand = needsSnapshots;
  const historicalHourlyDemand =
    needsHourlyAggregate && selectionPlan.hourly.length > 0;
  const historicalMaximumTrendDemand =
    needsMaximumTrend && selectionPlan.trends.length > 0;
  const historicalScenarioHeatmapIds =
    selectionPlan.byCard.get("occupancy_scenario_hour_heatmap") ??
    EMPTY_OCCUPANCY_SCENARIO_IDS;
  const historicalScenarioHeatmapDemand =
    scenarioHeatmapVisible &&
    settings.scenarioHeatmapGranularity !== "hour" &&
    historicalScenarioHeatmapIds.length > 0;
  const historicalDataDemand =
    historicalSnapshotDemand ||
    historicalHourlyDemand ||
    historicalMaximumTrendDemand ||
    historicalScenarioHeatmapDemand;
  const dataCompleteUntil = React.useMemo<Date | null | undefined>(() => {
    if (
      !historicalMode ||
      !queryEnabled ||
      !historicalDataDemand ||
      !stableManualPeriod ||
      !historicalRanges
    ) {
      return undefined;
    }
    if (loading) return null;
    if (
      historicalSnapshotDemand &&
      !occupancyHistoricalSnapshotsAreComplete(
        certifiedSnapshots,
        snapshotScenarioIds,
      )
    ) {
      return null;
    }
    if (
      historicalHourlyDemand &&
      !occupancyHistoricalAggregateIsComplete({
        granularity: "hour",
        range: historicalRanges.hourly,
        scenarioIds: selectionPlan.hourly,
        series: certifiedAggregate.series,
      })
    ) {
      return null;
    }
    if (
      historicalMaximumTrendDemand &&
      !occupancyHistoricalAggregateIsComplete({
        coverageScenarios: scopedScenarios,
        granularity: "month",
        range: historicalRanges.maximumTrend?.monthlySource ?? null,
        scenarioIds: selectionPlan.trends,
        series: certifiedMaximumTrend.series,
        timeZone,
      })
    ) {
      return null;
    }
    if (
      historicalScenarioHeatmapDemand &&
      !occupancyHistoricalAggregateIsComplete({
        granularity: settings.scenarioHeatmapGranularity,
        range: historicalRanges.scenarioHeatmap,
        scenarioIds: historicalScenarioHeatmapIds,
        series: certifiedScenarioHeatmap.series,
      })
    ) {
      return null;
    }
    return new Date(stableManualPeriod.referenceAt);
  }, [
    certifiedAggregate.series,
    certifiedMaximumTrend.series,
    certifiedScenarioHeatmap.series,
    certifiedSnapshots,
    historicalDataDemand,
    historicalHourlyDemand,
    historicalMaximumTrendDemand,
    historicalMode,
    historicalRanges,
    historicalScenarioHeatmapDemand,
    historicalScenarioHeatmapIds,
    historicalSnapshotDemand,
    loading,
    queryEnabled,
    scopedScenarios,
    selectionPlan.hourly,
    selectionPlan.trends,
    snapshotScenarioIds,
    settings.scenarioHeatmapGranularity,
    stableManualPeriod,
    timeZone,
  ]);
  const hourlyMaximumBuckets = React.useMemo(() => {
    return occupancyLatestCompanyDayBuckets(
      certifiedAggregate.buckets,
      certifiedCurrentHourMaximum.bucket,
      timeZone,
    );
  }, [certifiedAggregate.buckets, certifiedCurrentHourMaximum.bucket, timeZone]);
  const hourlyMaximumSeries = React.useMemo(
    () =>
      certifiedAggregate.series.length
        ? certifiedAggregate.series
        : certifiedCurrentHourMaximum.series.map((scenario) => ({
            error: scenario.error,
            metrics: new Map(),
            name: scenario.name,
            scenarioId: scenario.scenarioId,
            warning: scenario.warning,
          })),
    [certifiedAggregate.series, certifiedCurrentHourMaximum.series],
  );
  const heatmapScenarioId = selectionPlan.byCard.get("occupancy_day_hour_heatmap")?.[0] ?? "";
  const scenarioHourHeatmapDateKeys = React.useMemo(
    () =>
      settings.scenarioHeatmapGranularity === "hour"
        ? Array.from(
            new Set(
              certifiedAggregate.buckets.map((bucket) =>
                localDateKey(bucket, timeZone),
              ),
            ),
          )
        : [],
    [
      certifiedAggregate.buckets,
      settings.scenarioHeatmapGranularity,
      timeZone,
    ],
  );
  const scenarioHourHeatmapDateKey =
    scenarioHourHeatmapDateKeys.includes(settings.scenarioHourHeatmapDateKey)
      ? settings.scenarioHourHeatmapDateKey
      : scenarioHourHeatmapDateKeys.at(-1) ?? "";
  const selectedColorPalette = getOccupancyColorPalette(
    settings.colorPaletteId,
  );
  const selectedHexColorPalette = getOccupancyColorPalette(
    settings.hexColorPaletteId,
  );
  const availableScenarioIds = React.useMemo(
    () => scopedScenarios.map((scenario) => scenario.id),
    [scopedScenarios],
  );
  const resolveCardScenarioIds = React.useCallback(
    (cardId: string, { scenarioSelection }: LayoutCardRenderContext) =>
      resolveOccupancyComparisonScenarioIds({
        availableScenarioIds,
        cardId,
        inheritedHeatmapScenarioId,
        inheritedScenarioIds: selectedScenarioIds,
        selection: scenarioSelection,
      }),
    [availableScenarioIds, inheritedHeatmapScenarioId, selectedScenarioIds],
  );
  const rowFilterCache = React.useMemo(
    () =>
      new WeakMap<
        readonly OccupancyScenarioRow[],
        Map<string, readonly OccupancyScenarioRow[]>
      >(),
    [],
  );
  const filterRowsForScenarios = React.useCallback(
    function filterRowsForScenarios<T extends OccupancyScenarioRow>(
      rows: readonly T[],
      scenarioIds: readonly string[],
    ): T[] {
      const selectionKey = scenarioIds.join("\u001f");
      let rowsBySelection = rowFilterCache.get(rows);
      const cached = rowsBySelection?.get(selectionKey);
      if (cached) return cached as T[];

      const filtered = filterOccupancyComparisonRows(rows, scenarioIds);
      if (!rowsBySelection) {
        rowsBySelection = new Map();
        rowFilterCache.set(rows, rowsBySelection);
      }
      rowsBySelection.set(selectionKey, filtered);
      return filtered;
    },
    [rowFilterCache],
  );
  const scenarioFilterCache = React.useMemo(
    () =>
      new WeakMap<
        readonly OccupancyScenario[],
        Map<string, OccupancyScenario[]>
      >(),
    [],
  );
  const filterScenarios = React.useCallback(
    (scenarioIds: readonly string[]) => {
      const selectionKey = scenarioIds.join("\u001f");
      let scenariosBySelection = scenarioFilterCache.get(scopedScenarios);
      const cached = scenariosBySelection?.get(selectionKey);
      if (cached) return cached;

      const scenarioById = new Map(
        scopedScenarios.map((scenario) => [scenario.id, scenario]),
      );
      const filtered = scenarioIds.flatMap((scenarioId) => {
        const scenario = scenarioById.get(scenarioId);
        return scenario ? [scenario] : [];
      });
      if (!scenariosBySelection) {
        scenariosBySelection = new Map();
        scenarioFilterCache.set(scopedScenarios, scenariosBySelection);
      }
      scenariosBySelection.set(selectionKey, filtered);
      return filtered;
    },
    [scenarioFilterCache, scopedScenarios],
  );
  const heatmapMaximumCache = React.useMemo(
    () =>
      new WeakMap<
        readonly OccupancyScenarioHourlySeries[],
        Map<OccupancyComparisonMetricKey, number>
      >(),
    [],
  );
  const heatmapMaximum = React.useCallback(
    (
      series: OccupancyScenarioHourlySeries[],
      metric: OccupancyComparisonMetricKey,
    ) => {
      let maximumByMetric = heatmapMaximumCache.get(series);
      const cached = maximumByMetric?.get(metric);
      if (cached !== undefined) return cached;

      const maximum = sharedHeatmapMaximum(series, metric);
      if (!maximumByMetric) {
        maximumByMetric = new Map();
        heatmapMaximumCache.set(series, maximumByMetric);
      }
      maximumByMetric.set(metric, maximum);
      return maximum;
    },
    [heatmapMaximumCache],
  );
  const scenarioCardDefaults = React.useMemo(
    () => ({
      inheritedScenarioIds: selectedScenarioIds,
      inheritedScenarioLabel: "Seleção salva da visão",
      scenarioConfigurable: true,
      scenarioSelectionPolicy: "compare" as const,
    }),
    [selectedScenarioIds],
  );
  const historicalContextLabel = historicalMode
    ? stableManualPeriod?.contextLabel
    : undefined;
  const snapshotDependentCards = React.useMemo<ComparisonLayoutCard[]>(() => [
    {
      colorEditable: false,
      defaultHeight: "tall",
      defaultSize: "large",
      ...scenarioCardDefaults,
      id: "occupancy_scenario_half_donut",
      configurationContent: !monitorMode ? <OccupancyComparisonOptions
        cardId="occupancy_scenario_half_donut"
        settings={settings}
        onChange={updateSettings}
        dateKey={scenarioHourHeatmapDateKey}
        dateKeys={scenarioHourHeatmapDateKeys}
        scenarios={scopedScenarios}
        snapshots={certifiedSnapshots}
        defaultScenarioIds={selectedScenarioIds}
      /> : undefined,
      label: historicalMode
        ? "Comparação no fechamento por cenário"
        : "Comparação atual por cenário",
      previewChartType: "bar",
      previewColors: selectedColorPalette.colors,
      previewKind:
        settings.comparisonChartType === "half_donut"
          ? "composition"
          : "chart",
      previewOrientation:
        settings.comparisonChartType === "bars" ? "horizontal" : "vertical",
      node: (context) => {
        const scenarioIds = resolveCardScenarioIds("occupancy_scenario_half_donut", context);
        const snapshots = filterRowsForScenarios(
          certifiedSnapshots,
          scenarioIds,
        );
        return (
        <OccupancyHalfDonutCard
          timeZone={timeZone}
          chartType={settings.comparisonChartType}
          colorPalette={selectedColorPalette.colors}
          historicalContextLabel={historicalContextLabel}
          loading={snapshotLoading}
          mode={settings.comparisonMode}
          snapshots={snapshots}
          statusColors={DEFAULT_OCCUPANCY_STATUS_COLORS}
        />
        );
      },
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      ...scenarioCardDefaults,
      id: "occupancy_scenario_bar_race",
      label: historicalMode
        ? "Ranking no fechamento por cenário"
        : "Ranking ao vivo por cenário",
      previewColors: selectedColorPalette.colors,
      previewKind: "ranking",
      scenarioOrderingDisabled: true,
      node: (context) => {
        const scenarioIds = resolveCardScenarioIds("occupancy_scenario_bar_race", context);
        const snapshots = filterRowsForScenarios(
          certifiedSnapshots,
          scenarioIds,
        );
        return (
        <OccupancyBarRaceCard
          timeZone={timeZone}
          loading={snapshotLoading}
          colorPalette={selectedColorPalette.colors}
          historicalContextLabel={historicalContextLabel}
          refreshSeconds={
            historicalMode
              ? undefined
              : Math.max(
                  1,
                  Math.round(effectiveSnapshotRefreshMs / 1_000),
                )
          }
          snapshots={snapshots}
        />
        );
      },
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      ...scenarioCardDefaults,
      id: "occupancy_scenario_max_hour",
      label: historicalMode
        ? "Máximo por hora no período"
        : "Máximo por hora por cenário",
      previewChartType: "line",
      previewColors: selectedColorPalette.colors,
      previewKind: "chart",
      node: (context) => {
        const scenarioIds = resolveCardScenarioIds("occupancy_scenario_max_hour", context);
        const snapshots = filterRowsForScenarios(
          certifiedSnapshots,
          scenarioIds,
        );
        const currentSeries = filterRowsForScenarios(
          certifiedCurrentHourMaximum.series,
          scenarioIds,
        );
        const series = filterRowsForScenarios(
          hourlyMaximumSeries,
          scenarioIds,
        );
        return (
        <OccupancyScenarioMaximumLineCard
          timeZone={timeZone}
          allScenarios={filterScenarios(scenarioIds)}
          buckets={hourlyMaximumBuckets}
          colorPalette={selectedColorPalette.colors}
          currentBucket={certifiedCurrentHourMaximum.bucket}
          currentSnapshots={snapshots}
          currentSeries={currentSeries}
          granularity="hour"
          historicalContextLabel={historicalContextLabel}
          loading={aggregateLoading || currentHourMaximumLoading}
          refreshSeconds={
            historicalMode
              ? undefined
              : Math.max(1, Math.round(aggregateRefreshMs / 1_000))
          }
          series={series}
        />
        );
      },
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      ...scenarioCardDefaults,
      id: "occupancy_scenario_max_year",
      label: historicalMode
        ? "Máximo anual · 4 anos fechados"
        : "Máximo por ano por cenário",
      previewChartType: "line",
      previewColors: selectedColorPalette.colors,
      previewKind: "chart",
      node: (context) => {
        const scenarioIds = resolveCardScenarioIds("occupancy_scenario_max_year", context);
        const snapshots = filterRowsForScenarios(
          certifiedSnapshots,
          scenarioIds,
        );
        const currentSeries = filterRowsForScenarios(
          certifiedCurrentHourMaximum.series,
          scenarioIds,
        );
        const series = filterRowsForScenarios(
          certifiedMaximumTrend.series,
          scenarioIds,
        );
        return (
        <OccupancyScenarioMaximumLineCard
          timeZone={timeZone}
          allScenarios={filterScenarios(scenarioIds)}
          buckets={
            certifiedMaximumTrend.ranges?.annual.buckets ??
            EMPTY_OCCUPANCY_BUCKETS
          }
          colorPalette={selectedColorPalette.colors}
          currentBucket={certifiedCurrentHourMaximum.bucket}
          currentSnapshots={snapshots}
          currentSeries={currentSeries}
          granularity="year"
          historicalContextLabel={historicalContextLabel}
          loading={maximumTrendLoading}
          monthlySourceBuckets={
            certifiedMaximumTrend.ranges?.monthlySource.buckets ??
            EMPTY_OCCUPANCY_BUCKETS
          }
          series={series}
        />
        );
      },
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "tall",
      defaultSize: "full",
      id: "occupancy_hex_layout",
      configurationContent: !monitorMode ? <OccupancyComparisonOptions
        cardId="occupancy_hex_layout"
        settings={settings}
        onChange={updateSettings}
        dateKey={scenarioHourHeatmapDateKey}
        dateKeys={scenarioHourHeatmapDateKeys}
        scenarios={scopedScenarios}
        snapshots={certifiedSnapshots}
        defaultScenarioIds={selectedScenarioIds}
      /> : undefined,
      label: historicalMode
        ? "Mapa operacional no fechamento"
        : "Simulador operacional hexagonal",
      previewColors: selectedHexColorPalette.colors,
      previewKind: "hex",
      node: (
        <OccupancyHexLayoutCard
          capacities={settings.capacities}
          colorPalette={selectedHexColorPalette.colors}
          columns={settings.hexColumns}
          defaultScenarioIds={selectedScenarioIds}
          displayMode={settings.hexDisplayMode}
          historicalContextLabel={historicalContextLabel}
          layout={settings.hexLayout}
          loading={snapshotLoading}
          preset={settings.hexPreset}
          scenarios={scopedScenarios}
          snapshots={certifiedSnapshots}
          statusColors={settings.hexStatusColors}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
  ], [
    aggregateLoading,
    certifiedCurrentHourMaximum,
    certifiedMaximumTrend,
    certifiedSnapshots,
    filterRowsForScenarios,
    filterScenarios,
    hourlyMaximumBuckets,
    hourlyMaximumSeries,
    maximumTrendLoading,
    monitorMode,
    resolveCardScenarioIds,
    scenarioCardDefaults,
    scenarioHourHeatmapDateKey,
    scenarioHourHeatmapDateKeys,
    scopedScenarios,
    selectedColorPalette.colors,
    selectedHexColorPalette.colors,
    selectedScenarioIds,
    settings,
    snapshotLoading,
    aggregateRefreshMs,
    effectiveSnapshotRefreshMs,
    timeZone,
    updateSettings,
    currentHourMaximumLoading,
    historicalContextLabel,
    historicalMode,
  ]);

  const snapshotIndependentCards = React.useMemo<ComparisonLayoutCard[]>(
    () => [
      {
        colorEditable: false,
        defaultHeight: "standard",
        defaultHeightLevel: 4,
        defaultSize: "wide",
        ...scenarioCardDefaults,
        id: "occupancy_scenario_max_month",
        label: historicalMode
          ? "Máximo mensal · 12 meses fechados"
          : "Máximo por mês por cenário",
        previewChartType: "line",
        previewColors: selectedColorPalette.colors,
        previewKind: "chart",
        node: (context) => {
          const scenarioIds = resolveCardScenarioIds(
            "occupancy_scenario_max_month",
            context,
          );
          const series = filterRowsForScenarios(
            certifiedMaximumTrend.series,
            scenarioIds,
          );
          return (
            <OccupancyScenarioMaximumLineCard
              timeZone={timeZone}
              allScenarios={filterScenarios(scenarioIds)}
              buckets={
                certifiedMaximumTrend.ranges?.monthly.buckets ??
                EMPTY_OCCUPANCY_BUCKETS
              }
              colorPalette={selectedColorPalette.colors}
              granularity="month"
              historicalContextLabel={historicalContextLabel}
              loading={maximumTrendLoading}
              series={series}
            />
          );
        },
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeight: "tall",
        defaultSize: "full",
        ...scenarioCardDefaults,
        id: "occupancy_day_hour_heatmap",
        configurationContent: !monitorMode ? (
          <OccupancyComparisonOptions
            cardId="occupancy_day_hour_heatmap"
            settings={settings}
            onChange={updateSettings}
            dateKey={scenarioHourHeatmapDateKey}
            dateKeys={scenarioHourHeatmapDateKeys}
            scenarios={scopedScenarios}
            snapshots={EMPTY_OCCUPANCY_SNAPSHOTS}
            defaultScenarioIds={selectedScenarioIds}
          />
        ) : undefined,
        scenarioSelectionPolicy: "single",
        inheritedScenarioIds: inheritedHeatmapScenarioId
          ? [inheritedHeatmapScenarioId]
          : [],
        inheritedScenarioLabel:
          scopedScenarios.find(
            (scenario) => scenario.id === inheritedHeatmapScenarioId,
          )?.name ?? "Cenário da visão",
        label: "Ocupação por dias x horários",
        previewColors: selectedColorPalette.colors,
        previewKind: "heatmap",
        node: (context) => {
          const scenarioIds = resolveCardScenarioIds(
            "occupancy_day_hour_heatmap",
            context,
          );
          const series = filterRowsForScenarios(
            certifiedAggregate.series,
            scenarioIds,
          );
          return (
            <OccupancyDayHourHeatmapCard
              timeZone={timeZone}
              buckets={certifiedAggregate.buckets}
              colorPalette={selectedColorPalette.colors}
              dayCount={settings.dayCount}
              historicalContextLabel={historicalContextLabel}
              loading={aggregateLoading}
              maximum={heatmapMaximum(series, settings.metric)}
              metric={settings.metric}
              scenarioId={scenarioIds[0] ?? ""}
              series={series}
            />
          );
        },
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeight: "tall",
        defaultSize: "full",
        ...scenarioCardDefaults,
        id: "occupancy_scenario_hour_heatmap",
        configurationContent: !monitorMode ? (
          <OccupancyComparisonOptions
            cardId="occupancy_scenario_hour_heatmap"
            settings={settings}
            onChange={updateSettings}
            dateKey={scenarioHourHeatmapDateKey}
            dateKeys={scenarioHourHeatmapDateKeys}
            scenarios={scopedScenarios}
            snapshots={EMPTY_OCCUPANCY_SNAPSHOTS}
            defaultScenarioIds={selectedScenarioIds}
          />
        ) : undefined,
        label: `Ocupação por cenários x ${occupancyScenarioHeatmapGranularityLabel(
          settings.scenarioHeatmapGranularity,
        )}`,
        previewColors: selectedColorPalette.colors,
        previewKind: "heatmap",
        node: (context) => {
          const scenarioIds = resolveCardScenarioIds(
            "occupancy_scenario_hour_heatmap",
            context,
          );
          const series = filterRowsForScenarios(
            certifiedScenarioHeatmap.series,
            scenarioIds,
          );
          return (
            <OccupancyScenarioHourHeatmapCard
              timeZone={timeZone}
              buckets={certifiedScenarioHeatmap.buckets}
              colorPalette={selectedColorPalette.colors}
              dayCount={settings.dayCount}
              granularity={settings.scenarioHeatmapGranularity}
              historicalContextLabel={historicalContextLabel}
              loading={scenarioHeatmapLoading}
              metric={settings.metric}
              dateKey={scenarioHourHeatmapDateKey}
              series={series}
            />
          );
        },
        titleEditable: true,
        zoomEnabled: true,
      },
    ],
    [
      aggregateLoading,
      certifiedAggregate,
      certifiedMaximumTrend,
      certifiedScenarioHeatmap,
      filterRowsForScenarios,
      filterScenarios,
      heatmapMaximum,
      inheritedHeatmapScenarioId,
      maximumTrendLoading,
      historicalContextLabel,
      historicalMode,
      monitorMode,
      resolveCardScenarioIds,
      scenarioCardDefaults,
      scenarioHourHeatmapDateKey,
      scenarioHourHeatmapDateKeys,
      scenarioHeatmapLoading,
      scopedScenarios,
      selectedColorPalette.colors,
      selectedScenarioIds,
      settings,
      timeZone,
      updateSettings,
    ],
  );
  const cards = React.useMemo(() => {
    const cardById = new Map(
      [...snapshotDependentCards, ...snapshotIndependentCards].map((card) => [
        card.id,
        card,
      ]),
    );
    return OCCUPANCY_COMPARISON_CARD_IDS.flatMap((cardId) => {
      const card = cardById.get(cardId);
      return card ? [card] : [];
    });
  }, [snapshotDependentCards, snapshotIndependentCards]);

  const getReportAssets = React.useCallback(
    () =>
      buildOccupancyComparisonReportAssets({
        timeZone,
        aggregateBuckets: certifiedAggregate.buckets,
        aggregateSeries: certifiedAggregate.series,
        currentHourBucket: certifiedCurrentHourMaximum.bucket,
        currentHourSeries: certifiedCurrentHourMaximum.series,
        heatmapScenarioId,
        hexSnapshots: certifiedSnapshots,
        historicalContextLabel,
        hourlyMaximumBuckets,
        hourlyMaximumSeries,
        maximumTrendRanges: certifiedMaximumTrend.ranges,
        maximumTrendSeries: certifiedMaximumTrend.series,
        scenarioHeatmapBuckets: certifiedScenarioHeatmap.buckets,
        scenarioHeatmapSeries: certifiedScenarioHeatmap.series,
        scenarioHourHeatmapDateKey,
        scenarios: scopedScenarios,
        selectionsByCard: selectionPlan.byCard,
        selectedScenarioIds,
        settings,
        snapshots: certifiedSnapshots,
      }),
    [
      certifiedAggregate.buckets,
      certifiedAggregate.series,
      certifiedCurrentHourMaximum.bucket,
      certifiedCurrentHourMaximum.series,
      certifiedMaximumTrend.ranges,
      certifiedMaximumTrend.series,
      certifiedScenarioHeatmap.buckets,
      certifiedScenarioHeatmap.series,
      certifiedSnapshots,
      heatmapScenarioId,
      historicalContextLabel,
      hourlyMaximumBuckets,
      hourlyMaximumSeries,
      scenarioHourHeatmapDateKey,
      scopedScenarios,
      selectedScenarioIds,
      selectionPlan.byCard,
      settings,
      timeZone,
    ],
  );

  const loadReportSnapshot = React.useCallback(
    async (
      signal?: AbortSignal,
    ): Promise<OccupancyComparisonReportSnapshot> => {
      signal?.throwIfAborted();
      const requestSignal = signal ?? new AbortController().signal;
      if (!companyScopeId.trim() || !scopedScenarios.length) {
        return { dataCompleteUntil: undefined, reportAssets: [] };
      }

      // Export is an explicit, one-shot operation. It intentionally derives
      // demand from every saved visible comparison card instead of the
      // viewport subset used by live polling, so an offscreen card cannot be
      // exported with an empty or stale data set.
      const reportSettings = settingsReady
        ? settings
        : loadOccupancyWidgetSettings(
            companyScopeId,
            userId,
            preferenceScopeId,
          );
      const reportSelectedScenarioIds =
        resolveOccupancyComparisonInheritedScenarioIds({
          configuredScenarioIds: reportSettings.scenarioIds,
          focusScenarioId,
          scenarios: scopedScenarios,
        });
      const reportHexScenarioIds = reportSettings.hexLayout
        ? Array.from(
            new Set(
              reportSettings.hexLayout.cells.flatMap((cell) =>
                cell.scenarioId ? [cell.scenarioId] : [],
              ),
            ),
          )
        : reportSelectedScenarioIds;
      const reportInheritedHeatmapScenarioId = resolveHeatmapScenarioId(
        reportSettings.heatmapScenarioId,
        focusScenarioId,
        reportSelectedScenarioIds,
      );
      const reportSelectionPlan = buildOccupancyComparisonReportSelectionPlan({
        scenarios: scopedScenarios,
        preferences: reportPreferences,
        inheritedScenarioIds: reportSelectedScenarioIds,
        inheritedHeatmapScenarioId: reportInheritedHeatmapScenarioId,
        hexScenarioIds: reportHexScenarioIds,
        scenarioHeatmapGranularity:
          reportSettings.scenarioHeatmapGranularity,
      });
      const visibleReportCardIds = new Set(
        reportSelectionPlan.visibleCardIds,
      );
      if (!visibleReportCardIds.size) {
        return { dataCompleteUntil: undefined, reportAssets: [] };
      }
      const requestedAt = new Date();
      requireCompanyTimeZone(timeZone);

      const needsHourlyHeatmap =
        visibleReportCardIds.has("occupancy_day_hour_heatmap") ||
        (visibleReportCardIds.has("occupancy_scenario_hour_heatmap") &&
          reportSettings.scenarioHeatmapGranularity === "hour");
      const needsHourlyAggregate =
        visibleReportCardIds.has("occupancy_scenario_max_hour") ||
        needsHourlyHeatmap;
      if (historicalMode && stableManualPeriod) {
        const needsHistoricalMaximumTrend =
          visibleReportCardIds.has("occupancy_scenario_max_month") ||
          visibleReportCardIds.has("occupancy_scenario_max_year");
        const needsHistoricalScenarioHeatmap = visibleReportCardIds.has(
          "occupancy_scenario_hour_heatmap",
        );
        const reportHistoricalSnapshotScenarioIds =
          occupancyHistoricalSnapshotScenarioIds({
            byCard: reportSelectionPlan.byCard,
            hexScenarioIds: reportHexScenarioIds,
            scenarios: scopedScenarios,
            visibleCardIds: visibleReportCardIds,
          });
        const needsHistoricalSnapshots =
          reportHistoricalSnapshotScenarioIds.length > 0;
        const reportRanges = buildOccupancyHistoricalComparisonRanges({
          dayCount: reportSettings.dayCount,
          needsAnnualMaximum: visibleReportCardIds.has(
            "occupancy_scenario_max_year",
          ),
          needsHourlyAggregate,
          needsHourlyHeatmap,
          needsMaximumTrend: needsHistoricalMaximumTrend,
          needsScenarioHeatmap: needsHistoricalScenarioHeatmap,
          period: stableManualPeriod,
          scenarioHeatmapGranularity:
            reportSettings.scenarioHeatmapGranularity,
          timeZone,
        });
        const reportPlan: OccupancyHistoricalComparisonLoadPlan = {
          hourlyScenarioIds: reportSelectionPlan.hourly,
          maximumTrendScenarioIds: reportSelectionPlan.trends,
          needsHourlyAggregate,
          needsMaximumTrend: needsHistoricalMaximumTrend,
          needsScenarioHeatmap: needsHistoricalScenarioHeatmap,
          needsSnapshots: needsHistoricalSnapshots,
          scenarioHeatmapScenarioIds:
            reportSelectionPlan.byCard.get(
              "occupancy_scenario_hour_heatmap",
            ) ?? [],
          snapshotScenarioIds: reportHistoricalSnapshotScenarioIds,
        };
        const dataset = await loadOccupancyHistoricalComparisonDataset({
          bypassCache: true,
          companyScopeId,
          period: stableManualPeriod,
          plan: reportPlan,
          ranges: reportRanges,
          scenarioHeatmapGranularity:
            reportSettings.scenarioHeatmapGranularity,
          scenarios: scopedScenarios,
          signal: requestSignal,
          timeZone,
          timeZoneWarning,
        });
        requestSignal.throwIfAborted();
        const reportDataCompleteUntil =
          occupancyHistoricalComparisonDataCompleteUntil({
            dataset,
            period: stableManualPeriod,
            plan: reportPlan,
            ranges: reportRanges,
            scenarioHeatmapGranularity:
              reportSettings.scenarioHeatmapGranularity,
            scenarios: scopedScenarios,
            timeZone,
          });
        if (reportDataCompleteUntil === null) {
          throw new Error(
            "Não foi possível certificar todos os dados comparativos visíveis para a exportação.",
          );
        }
        const scenarioDateKeys =
          reportSettings.scenarioHeatmapGranularity === "hour"
            ? Array.from(
                new Set(
                  dataset.scenarioHeatmapRange?.buckets.map((bucket) =>
                    localDateKey(bucket, timeZone),
                  ) ?? [],
                ),
              )
            : [];
        const scenarioDateKey = scenarioDateKeys.includes(
          reportSettings.scenarioHourHeatmapDateKey,
        )
          ? reportSettings.scenarioHourHeatmapDateKey
          : (scenarioDateKeys.at(-1) ?? "");
        const hourlyMaximumBuckets =
          dataset.hourlyRange?.buckets.filter(
            (bucket) =>
              localDateKey(bucket, timeZone) ===
              localDateKey(stableManualPeriod.referenceAt, timeZone),
          ) ?? [];

        return {
          dataCompleteUntil: reportDataCompleteUntil,
          reportAssets: buildOccupancyComparisonReportAssets({
            aggregateBuckets: dataset.hourlyRange?.buckets ?? [],
            aggregateSeries: dataset.hourlySeries,
            currentHourBucket: null,
            currentHourSeries: [],
            heatmapScenarioId:
              reportSelectionPlan.byCard.get(
                "occupancy_day_hour_heatmap",
              )?.[0] ?? "",
            hexSnapshots: dataset.snapshots,
            historicalContextLabel: stableManualPeriod.contextLabel,
            hourlyMaximumBuckets,
            hourlyMaximumSeries: dataset.hourlySeries,
            maximumTrendRanges: dataset.maximumTrendRanges,
            maximumTrendSeries: dataset.maximumTrendSeries,
            scenarioHeatmapBuckets:
              dataset.scenarioHeatmapRange?.buckets ?? [],
            scenarioHeatmapSeries: dataset.scenarioHeatmapSeries,
            scenarioHourHeatmapDateKey: scenarioDateKey,
            scenarios: scopedScenarios,
            selectionsByCard: reportSelectionPlan.byCard,
            selectedScenarioIds: reportSelectedScenarioIds,
            settings: reportSettings,
            snapshots: dataset.snapshots,
            timeZone,
          }).filter((asset) => visibleReportCardIds.has(asset.cardId)),
        };
      }
      const hourlyRange = needsHourlyAggregate
        ? buildOccupancyHourlyRange(
            requestedAt,
            needsHourlyHeatmap ? reportSettings.dayCount : 1,
            timeZone,
          )
        : null;
      const scenarioHeatmapRange =
        visibleReportCardIds.has("occupancy_scenario_hour_heatmap") &&
        reportSettings.scenarioHeatmapGranularity !== "hour"
          ? buildOccupancyScenarioHeatmapRange(
              requestedAt,
              reportSettings.scenarioHeatmapGranularity,
              reportSettings.scenarioHeatmapGranularity === "day"
                ? reportSettings.dayCount
                : 7,
              timeZone,
            )
          : null;
      const maximumTrendRanges =
        visibleReportCardIds.has("occupancy_scenario_max_month") ||
        visibleReportCardIds.has("occupancy_scenario_max_year")
          ? buildOccupancyMaximumTrendRanges(requestedAt, timeZone)
          : null;
      const currentHourRange = reportSelectionPlan.currentHour.length
        ? buildOccupancyCurrentHourRange(requestedAt, timeZone)
        : null;
      const hourlyScenarioIds = new Set(reportSelectionPlan.hourly);
      const currentHourOnlyIds = reportSelectionPlan.currentHour.filter(
        (scenarioId) => !hourlyScenarioIds.has(scenarioId),
      );

      const [
        reportSnapshots,
        hourlySeries,
        currentHourOnlySeries,
        nonHourlyHeatmapSeries,
        maximumTrendSeries,
      ] = await Promise.all([
        loadOccupancyComparisonReportSnapshots({
          companyScopeId,
          scenarioIds: reportSelectionPlan.snapshots,
          scenarios: scopedScenarios,
          signal: requestSignal,
          timeZone,
        }),
        hourlyRange
          ? loadOccupancyComparisonReportAggregate({
              companyScopeId,
              granularity: "hour",
              range: hourlyRange,
              scenarioIds: reportSelectionPlan.hourly,
              scenarios: scopedScenarios,
              signal: requestSignal,
              timeZone,
              timeZoneWarning,
            })
          : Promise.resolve([]),
        currentHourRange && currentHourOnlyIds.length
          ? loadOccupancyComparisonReportAggregate({
              companyScopeId,
              granularity: "hour",
              range: currentHourRange,
              scenarioIds: currentHourOnlyIds,
              scenarios: scopedScenarios,
              signal: requestSignal,
              timeZone,
              timeZoneWarning,
            })
          : Promise.resolve([]),
        scenarioHeatmapRange
          ? loadOccupancyComparisonReportAggregate({
              companyScopeId,
              granularity: reportSettings.scenarioHeatmapGranularity,
              range: scenarioHeatmapRange,
              scenarioIds:
                reportSelectionPlan.byCard.get(
                  "occupancy_scenario_hour_heatmap",
                ) ?? [],
              scenarios: scopedScenarios,
              signal: requestSignal,
              timeZone,
              timeZoneWarning,
            })
          : Promise.resolve([]),
        maximumTrendRanges
          ? loadOccupancyComparisonReportAggregate({
              companyScopeId,
              granularity: "month",
              range: maximumTrendRanges.monthlySource,
              scenarioIds: reportSelectionPlan.trends,
              scenarios: scopedScenarios,
              signal: requestSignal,
              timeZone,
              timeZoneWarning,
            })
          : Promise.resolve([]),
      ]);
      requestSignal.throwIfAborted();

      const hourlySeriesById = new Map(
        [...hourlySeries, ...currentHourOnlySeries].map((series) => [
          series.scenarioId,
          series,
        ]),
      );
      const currentHourSeries: OccupancyScenarioOpenMaximumSeries[] =
        currentHourRange
          ? reportSelectionPlan.currentHour.flatMap((scenarioId) => {
              const series = hourlySeriesById.get(scenarioId);
              if (!series) return [];
              const metric = series.metrics.get(
                occupancyAggregateBucketKey(currentHourRange.from, "hour"),
              );
              return [
                {
                  error: series.error,
                  name: series.name,
                  peaks: metric
                    ? new Map([
                        [
                          occupancyAggregateBucketKey(
                            currentHourRange.from,
                            "hour",
                          ),
                          metric.peak,
                        ],
                      ])
                    : new Map(),
                  scenarioId,
                  source: "hour" as const,
                  warning: series.warning,
                },
              ];
            })
          : [];
      const reportScenarioHeatmapSeries =
        reportSettings.scenarioHeatmapGranularity === "hour"
          ? hourlySeries
          : nonHourlyHeatmapSeries;
      const reportScenarioHeatmapBuckets =
        reportSettings.scenarioHeatmapGranularity === "hour"
          ? (hourlyRange?.buckets ?? EMPTY_OCCUPANCY_BUCKETS)
          : (scenarioHeatmapRange?.buckets ?? EMPTY_OCCUPANCY_BUCKETS);
      const reportScenarioHourDateKeys =
        reportSettings.scenarioHeatmapGranularity === "hour"
          ? Array.from(
              new Set(
                reportScenarioHeatmapBuckets.map((bucket) =>
                  localDateKey(bucket, timeZone),
                ),
              ),
            )
          : [];
      const reportScenarioHourDateKey = reportScenarioHourDateKeys.includes(
        reportSettings.scenarioHourHeatmapDateKey,
      )
        ? reportSettings.scenarioHourHeatmapDateKey
        : (reportScenarioHourDateKeys.at(-1) ?? "");
      const reportHourlyMaximumBuckets = currentHourRange
        ? (hourlyRange?.buckets ?? currentHourRange.buckets).filter(
            (bucket) =>
              localDateKey(bucket, timeZone) ===
              localDateKey(currentHourRange.from, timeZone),
          )
        : [];

      return {
        dataCompleteUntil: undefined,
        reportAssets: buildOccupancyComparisonReportAssets({
          timeZone,
          aggregateBuckets: hourlyRange?.buckets ?? EMPTY_OCCUPANCY_BUCKETS,
          aggregateSeries: hourlySeries,
          currentHourBucket: currentHourRange?.from ?? null,
          currentHourSeries,
          heatmapScenarioId:
            reportSelectionPlan.byCard.get(
              "occupancy_day_hour_heatmap",
            )?.[0] ?? "",
          hexSnapshots: reportSnapshots,
          hourlyMaximumBuckets: reportHourlyMaximumBuckets,
          hourlyMaximumSeries: hourlySeries.length
            ? hourlySeries
            : currentHourOnlySeries,
          maximumTrendRanges,
          maximumTrendSeries,
          scenarioHeatmapBuckets: reportScenarioHeatmapBuckets,
          scenarioHeatmapSeries: reportScenarioHeatmapSeries,
          scenarioHourHeatmapDateKey: reportScenarioHourDateKey,
          scenarios: scopedScenarios,
          selectionsByCard: reportSelectionPlan.byCard,
          selectedScenarioIds: reportSelectedScenarioIds,
          settings: reportSettings,
          snapshots: reportSnapshots,
        }).filter((asset) => visibleReportCardIds.has(asset.cardId)),
      };
    },
    [
      companyScopeId,
      focusScenarioId,
      historicalMode,
      preferenceScopeId,
      reportPreferences,
      scopedScenarios,
      settings,
      settingsReady,
      stableManualPeriod,
      timeZone,
      timeZoneWarning,
      userId,
    ],
  );

  // Compatibilidade com o painel Ao Vivo, cujo exportador já certifica o
  // restante das fontes em um snapshot próprio.
  const loadReportAssets = React.useCallback(
    async (signal?: AbortSignal) =>
      (await loadReportSnapshot(signal)).reportAssets,
    [loadReportSnapshot],
  );

  const reportAssets = React.useMemo(
    () =>
      historicalMode && queryEnabled && !loading
        ? getReportAssets().filter((asset) => visibleCardIds.has(asset.cardId))
        : [],
    [getReportAssets, historicalMode, loading, queryEnabled, visibleCardIds],
  );

  return {
    cards,
    dataCompleteUntil,
    getReportAssets,
    loadReportAssets,
    loadReportSnapshot,
    loading,
    refresh,
    reportAssets,
    settings,
    snapshots: certifiedSnapshots,
    snapshotsLoading: snapshotLoading,
    updateSettings,
  };
}

function buildOccupancyComparisonReportAssets({
  timeZone = "UTC",
  aggregateBuckets,
  aggregateSeries,
  currentHourBucket,
  currentHourSeries,
  heatmapScenarioId,
  hexSnapshots,
  historicalContextLabel,
  hourlyMaximumBuckets,
  hourlyMaximumSeries,
  maximumTrendRanges,
  maximumTrendSeries,
  scenarioHeatmapBuckets = aggregateBuckets,
  scenarioHeatmapSeries = aggregateSeries,
  scenarioHourHeatmapDateKey,
  scenarios,
  selectionsByCard,
  selectedScenarioIds,
  settings,
  snapshots,
}: {
  aggregateBuckets: Date[];
  aggregateSeries: OccupancyScenarioHourlySeries[];
  currentHourBucket: Date | null;
  currentHourSeries: OccupancyScenarioOpenMaximumSeries[];
  heatmapScenarioId: string;
  hexSnapshots: OccupancyScenarioSnapshot[];
  historicalContextLabel?: string;
  hourlyMaximumBuckets: Date[];
  hourlyMaximumSeries: OccupancyScenarioHourlySeries[];
  maximumTrendRanges: OccupancyMaximumTrendRanges | null;
  maximumTrendSeries: OccupancyScenarioHourlySeries[];
  scenarioHeatmapBuckets?: Date[];
  scenarioHeatmapSeries?: OccupancyScenarioHourlySeries[];
  scenarioHourHeatmapDateKey: string;
  scenarios: OccupancyScenario[];
  selectionsByCard?: ReadonlyMap<string, readonly string[]>;
  selectedScenarioIds: string[];
  settings: OccupancyWidgetSettings;
  snapshots: OccupancyScenarioSnapshot[];
  timeZone?: string;
}): OccupancyComparisonReportAsset[] {
  const theme = "light" as const;
  const comparisonPalette = getOccupancyColorPalette(settings.colorPaletteId);
  const hexColorPalette = getOccupancyColorPalette(settings.hexColorPaletteId);
  const widgetColor = comparisonPalette.colors[0];
  const filterForCard = <T extends { scenarioId: string }>(cardId: string, rows: readonly T[]) =>
    filterOccupancyComparisonRows(rows, selectionsByCard?.get(cardId) ?? selectedScenarioIds);
  const currentSnapshots = filterForCard("occupancy_scenario_half_donut", snapshots);
  const raceSnapshots = filterForCard("occupancy_scenario_bar_race", snapshots);
  const scenarioIndexes = new Map(
    currentSnapshots.map((snapshot, index) => [snapshot.scenarioId, index + 1]),
  );
  const comparisonEntries = buildOccupancyHalfDonutEntries(
    currentSnapshots,
    settings.comparisonMode,
  );
  const comparisonBarEntries = buildOccupancyComparisonBarEntries(
    currentSnapshots,
    settings.comparisonMode,
  );
  const comparisonStatusColors = {
    ...DEFAULT_OCCUPANCY_STATUS_COLORS,
    occupied: ensureGraphicContrast(
      DEFAULT_OCCUPANCY_STATUS_COLORS.occupied,
      "#FFFFFF",
    ),
    unoccupied: ensureGraphicContrast(
      DEFAULT_OCCUPANCY_STATUS_COLORS.unoccupied,
      "#FFFFFF",
    ),
  };
  const comparisonOption =
    settings.comparisonChartType === "bars"
      ? buildCurrentComparisonBarOption(
          comparisonBarEntries,
          settings.comparisonMode,
          widgetColor,
          comparisonPalette.colors,
          comparisonStatusColors,
          theme,
          scenarioIndexes,
          980,
        )
      : settings.comparisonChartType === "vertical_bars"
        ? buildCurrentComparisonVerticalBarOption(
            comparisonBarEntries,
            settings.comparisonMode,
            widgetColor,
            comparisonPalette.colors,
            comparisonStatusColors,
            theme,
            scenarioIndexes,
            980,
          )
        : buildHalfDonutOption(
            comparisonEntries,
            settings.comparisonMode,
            widgetColor,
            comparisonPalette.colors,
            comparisonStatusColors,
            theme,
            scenarioIndexes,
          );
  const certifiedComparisonTotal = comparisonBarEntries.reduce(
    (total, entry) =>
      entry.total === null ? total : total + entry.total,
    0,
  );
  const comparisonTitle = historicalContextLabel
    ? "Comparação no fechamento por cenário"
    : "Comparação atual por cenário";
  const comparisonDescription =
    historicalContextLabel
      ? `${historicalContextLabel}. Estado e ocupação certificados no fechamento do intervalo; ausência permanece sem dados.`
      : settings.comparisonMode === "status"
        ? "Estado atual informado pela leitura mais recente de cada cenário; ausência permanece sem dados."
        : "Ocupação atual por cenário na ordem configurada, com participação calculada apenas sobre valores disponíveis.";

  const raceEntries = buildOccupancyLiveRaceEntries(raceSnapshots);
  const raceRows = raceEntries
    .map((entry, sourceIndex) => ({ ...entry, sourceIndex }))
    .sort((left, right) => {
      if (left.value === null) {
        return right.value === null ? left.sourceIndex - right.sourceIndex : 1;
      }
      if (right.value === null) return -1;
      return right.value - left.value || left.sourceIndex - right.sourceIndex;
    });

  const hourlyMaximum = buildMaximumLineSeries({
    timeZone,
    buckets: hourlyMaximumBuckets,
    currentBucket: currentHourBucket,
    currentSnapshots: filterForCard("occupancy_scenario_max_hour", snapshots),
    currentSeries: filterForCard("occupancy_scenario_max_hour", currentHourSeries),
    granularity: "hour",
    monthlySourceBuckets: [],
    scenarios,
    series: filterForCard("occupancy_scenario_max_hour", hourlyMaximumSeries),
  });
  const monthlyBuckets = maximumTrendRanges?.monthly.buckets ?? [];
  const monthlyMaximum = buildMaximumLineSeries({
    timeZone,
    buckets: monthlyBuckets,
    currentBucket: null,
    currentSnapshots: [],
    currentSeries: [],
    granularity: "month",
    markLastBucketPartial: !historicalContextLabel,
    monthlySourceBuckets: [],
    scenarios,
    series: filterForCard("occupancy_scenario_max_month", maximumTrendSeries),
  });
  const annualBuckets = maximumTrendRanges?.annual.buckets ?? [];
  const annualMaximum = buildMaximumLineSeries({
    timeZone,
    buckets: annualBuckets,
    currentBucket: currentHourBucket,
    currentSnapshots: filterForCard("occupancy_scenario_max_year", snapshots),
    currentSeries: filterForCard("occupancy_scenario_max_year", currentHourSeries),
    granularity: "year",
    markLastBucketPartial: !historicalContextLabel,
    monthlySourceBuckets: maximumTrendRanges?.monthlySource.buckets ?? [],
    scenarios,
    series: filterForCard("occupancy_scenario_max_year", maximumTrendSeries),
  });

  const effectiveHexLayout =
    settings.hexLayout ??
    createDefaultOccupancyHexLayout({
      columns: settings.hexColumns,
      preset: settings.hexPreset,
      scenarioIds: selectedScenarioIds,
    });
  const hexPositions = buildOccupancyHexLayout({
    capacities: settings.capacities,
    columns: settings.hexColumns,
    layout: effectiveHexLayout,
    preset: settings.hexPreset,
    scenarios,
    snapshots: hexSnapshots,
  });
  const hexVisualScale = buildOccupancyHexVisualScale(
    hexPositions.map((position) => ({
      capacity: position.capacity,
      cellId: position.cellId,
      state: position.state,
      total: position.total,
    })),
  );
  const hexRows = Math.max(
    1,
    ...hexPositions.map((position) => position.row + 1),
  );
  const hexSingleRow =
    hexPositions.length > 0 &&
    new Set(hexPositions.map((position) => position.row)).size === 1;
  const hexViewport = occupancyHexViewportMetrics({
    cellCount: hexPositions.length,
    columns: hexSingleRow
      ? Math.max(1, hexPositions.length)
      : effectiveHexLayout.columns,
    rows: hexRows,
  });
  const hexSemanticLabel =
    OCCUPANCY_STATUS_COLOR_PRESETS.find(
      (candidate) => candidate.id === settings.hexStatusColors.preset,
    )?.label ?? "Personalizado";
  const hexPalette = getOccupancyHexPalette(
    theme,
    hexColorPalette.colors[0],
    settings.hexStatusColors,
  );

  const dayHourSeries = aggregateSeries.find((item) => item.scenarioId ===
    (selectionsByCard?.get("occupancy_day_hour_heatmap")?.[0] ?? (selectionsByCard?.has("occupancy_day_hour_heatmap") ? "" : heatmapScenarioId)));
  const scenarioPeriodSeries = filterForCard(
    "occupancy_scenario_hour_heatmap",
    scenarioHeatmapSeries,
  );
  const dayHourMatrix = dayHourSeries
    ? buildDaysHoursOccupancyCells({
        timeZone,
        buckets: aggregateBuckets,
        metric: settings.metric,
        scenario: dayHourSeries,
      })
    : { cells: [], dayKeys: [] };
  const dayHourLabels = dayHourMatrix.dayKeys.map(formatHeatmapDateKey);
  const scenarioHeatmapGranularity = settings.scenarioHeatmapGranularity;
  const scenarioPeriodMatrix = buildOccupancyScenarioPeriodHeatmap({
    timeZone,
    buckets: scenarioHeatmapBuckets,
    dateKey:
      scenarioHeatmapGranularity === "hour"
        ? scenarioHourHeatmapDateKey || undefined
        : undefined,
    granularity: scenarioHeatmapGranularity,
    metric: settings.metric,
    series: scenarioPeriodSeries,
  });
  const scenarioPeriodLabel = occupancyScenarioHeatmapGranularityLabel(
    scenarioHeatmapGranularity,
  );
  const scenarioPeriodTitle = `Ocupação por cenários x ${scenarioPeriodLabel}`;
  const scenarioPeriodDescription = `Período: ${
    historicalContextLabel ??
    occupancyScenarioHeatmapPeriodDescription(
      scenarioHeatmapGranularity,
      settings.dayCount,
      scenarioHourHeatmapDateKey,
    )
  }. Os cenários não são somados e as lacunas permanecem sem valor.`;
  const scenarioPeriodNotice = occupancyAggregatePresentationWarning(
    joinMessages(
      ...scenarioPeriodSeries.flatMap((scenario) => [
        scenario.error,
        scenario.warning,
      ]),
    ),
  );
  const scenarioPeriodSeriesById = new Map(
    scenarioPeriodSeries.map((scenario) => [scenario.scenarioId, scenario]),
  );

  return [
    {
      cardId: "occupancy_scenario_half_donut",
      chart: {
        description: comparisonDescription,
        option: comparisonOption,
        table: {
          columns: [
            { key: "order", label: "Ordem", numeric: true },
            { key: "scenario", label: "Cenário" },
            { key: "state", label: "Estado" },
            {
              key: "occupancy",
              label: historicalContextLabel
                ? "Ocupação no fechamento"
                : "Ocupação atual",
              numeric: true,
            },
            { key: "share", label: "Participação (%)", numeric: true },
            {
              key: "asOf",
              label: historicalContextLabel ? "Fechamento em" : "Atualizado em",
            },
          ],
          description:
            "Ordem fixa configurada; valores ausentes permanecem nulos e não participam do percentual.",
          rows: comparisonBarEntries.map((entry, index) => {
            const snapshot = currentSnapshots[index];
            return {
              asOf: snapshot?.asOf ? formatDateTime(snapshot.asOf, timeZone) : null,
              occupancy: entry.total,
              order: index + 1,
              scenario: entry.name,
              share:
                settings.comparisonMode === "actual" &&
                entry.total !== null &&
                certifiedComparisonTotal > 0
                  ? (entry.total / certifiedComparisonTotal) * 100
                  : null,
              state: comparisonStateLabel(entry.state),
            };
          }),
          title: `Dados - ${comparisonTitle}`,
        },
        title: comparisonTitle,
      },
    },
    {
      cardId: "occupancy_scenario_bar_race",
      chart: {
        description: historicalContextLabel
          ? `Ranking da ocupação no fechamento de ${historicalContextLabel}; empates preservam a ordem configurada e leituras ausentes ficam sem valor.`
          : "Ranking ao vivo da ocupação atual; empates preservam a ordem configurada e leituras ausentes ficam sem valor.",
        option: buildLiveBarRaceOption(
          raceEntries,
          widgetColor,
          comparisonPalette.colors,
          Math.min(10, Math.max(1, raceEntries.length)),
          theme,
        ),
        table: {
          columns: [
            { key: "rank", label: "Posição", numeric: true },
            { key: "scenario", label: "Cenário" },
            {
              key: "occupancy",
              label: historicalContextLabel
                ? "Ocupação no fechamento"
                : "Ocupação atual",
              numeric: true,
            },
            {
              key: "asOf",
              label: historicalContextLabel ? "Fechamento em" : "Atualizado em",
            },
          ],
          description:
            "Ranking visual dos cenários no horário da última atualização.",
          rows: raceRows.map((entry, index) => ({
            asOf: raceSnapshots[entry.sourceIndex]?.asOf
              ? formatDateTime(raceSnapshots[entry.sourceIndex].asOf!, timeZone)
              : null,
            occupancy: entry.value,
            rank: entry.value === null ? null : index + 1,
            scenario: entry.name,
          })),
          title: historicalContextLabel
            ? "Dados - Ranking no fechamento por cenário"
            : "Dados - Ranking ao vivo por cenário",
        },
        title: historicalContextLabel
          ? "Ranking no fechamento por cenário"
          : "Ranking ao vivo por cenário",
      },
    },
    buildMaximumReportAsset({
      cardId: "occupancy_scenario_max_hour",
      colorPalette: comparisonPalette.colors,
      granularity: "hour",
      labels: OCCUPANCY_FIXED_HOUR_LABELS,
      series: hourlyMaximum,
      widgetColor,
      historicalContextLabel,
    }),
    buildMaximumReportAsset({
      cardId: "occupancy_scenario_max_month",
      colorPalette: comparisonPalette.colors,
      granularity: "month",
      labels: occupancyMaximumTrendBucketLabels(monthlyBuckets, "month"),
      series: monthlyMaximum,
      widgetColor,
      historicalContextLabel,
    }),
    buildMaximumReportAsset({
      cardId: "occupancy_scenario_max_year",
      colorPalette: comparisonPalette.colors,
      granularity: "year",
      labels: occupancyMaximumTrendBucketLabels(annualBuckets, "year"),
      series: annualMaximum,
      widgetColor,
      historicalContextLabel,
    }),
    {
      cardId: "occupancy_hex_layout",
      chart: {
        description: historicalContextLabel
          ? `${historicalContextLabel}. Layout operacional certificado no fechamento do intervalo.`
          : settings.hexDisplayMode === "actual"
            ? "Layout operacional em escala gradual de ocupação real."
            : "Layout operacional por estado ocupado ou desocupado.",
        option: buildHexLayoutOption(
          hexPositions,
          hexVisualScale,
          hexPalette,
          {
            animate: false,
            displayMode: settings.hexDisplayMode,
            semanticLabel: hexSemanticLabel,
            showNames: hexViewport.showNames,
            showValues: hexViewport.showValues,
          },
        ),
        table: {
          columns: [
            { key: "row", label: "Linha", numeric: true },
            { key: "column", label: "Coluna", numeric: true },
            { key: "position", label: "Posição" },
            { key: "scenario", label: "Cenário" },
            { key: "state", label: "Estado" },
            { key: "occupancy", label: "Ocupação", numeric: true },
            { key: "capacity", label: "Capacidade", numeric: true },
            { key: "utilization", label: "Utilização (%)", numeric: true },
          ],
          description:
            "Uma linha por hexágono; células sem vínculo ou indisponíveis permanecem explicitamente identificadas.",
          rows: hexPositions.map((position) => ({
            capacity: position.capacity,
            column: position.column + 1,
            occupancy: position.total,
            position: position.name,
            row: position.row + 1,
            scenario:
              scenarios.find((scenario) => scenario.id === position.scenarioId)
                ?.name ?? null,
            state: occupancyStateLabel(position.state),
            utilization:
              position.utilization === null
                ? null
                : position.utilization * 100,
          })),
          title: historicalContextLabel
            ? "Dados - Mapa operacional no fechamento"
            : "Dados - Simulador operacional hexagonal",
        },
        title: historicalContextLabel
          ? "Mapa operacional no fechamento"
          : "Simulador operacional hexagonal",
      },
    },
    {
      cardId: "occupancy_day_hour_heatmap",
      chart: {
        description: historicalContextLabel
          ? `${historicalContextLabel}. Horários disponíveis dentro do período aplicado; zero permanece visível e ausência fica sem valor.`
          : `Últimos ${settings.dayCount} dias do cenário escolhido; o valor zero permanece visível e a ausência fica sem valor.`,
        option: buildHeatmapOption({
          cells: dayHourMatrix.cells,
          interactive: false,
          maximum: sharedHeatmapMaximum(dayHourSeries ? [dayHourSeries] : [], settings.metric),
          metric: settings.metric,
          theme,
          widgetColor,
          xLabels: OCCUPANCY_FIXED_HOUR_LABELS,
          yLabels: dayHourLabels,
        }),
        table: {
          columns: [
            { key: "date", label: "Data" },
            { key: "hour", label: "Hora" },
            { key: "scenario", label: "Cenário" },
            { key: "metric", label: "Métrica" },
            { key: "value", label: "Ocupação", numeric: true },
            { key: "certification", label: "Disponibilidade" },
          ],
          description:
            "Todos os períodos da matriz selecionada; ausência de dados não é convertida em zero.",
          rows: dayHourMatrix.cells.map((cell) => ({
            certification:
              cell.value === null ? "Sem dados" : "Disponível",
            date: localDateKey(cell.bucket, timeZone),
            hour: OCCUPANCY_FIXED_HOUR_LABELS[cell.y] ?? `${cell.y}h`,
            metric: metricLabel(settings.metric),
            scenario: dayHourSeries?.name ?? null,
            value: cell.value,
          })),
          title: "Dados - Ocupação por dias x horários",
        },
        title: "Ocupação por dias x horários",
      },
    },
    {
      cardId: "occupancy_scenario_hour_heatmap",
      chart: {
        description: joinMessages(
          scenarioPeriodDescription,
          scenarioPeriodNotice
            ? `Atualização parcial: ${scenarioPeriodNotice}`
            : undefined,
        ),
        option: buildHeatmapOption({
          cells: scenarioPeriodMatrix.cells,
          granularity: scenarioHeatmapGranularity,
          interactive: false,
          maximum: heatmapCellsMaximum(scenarioPeriodMatrix.cells),
          metric: settings.metric,
          theme,
          widgetColor,
          xLabels: scenarioPeriodMatrix.labels,
          yLabels: scenarioPeriodMatrix.scenarioNames,
        }),
        table: {
          columns: [
            ...(scenarioHeatmapGranularity === "hour"
              ? [{ key: "date", label: "Data" }]
              : []),
            {
              key: "period",
              label:
                scenarioHeatmapGranularity === "hour" ? "Hora" : "Período",
            },
            { key: "scenario", label: "Cenário" },
            { key: "metric", label: "Métrica" },
            { key: "value", label: "Ocupação", numeric: true },
            { key: "certification", label: "Disponibilidade" },
          ],
          description:
            "O período é o mesmo selecionado no widget; cenários não são somados e ausência não representa zero.",
          rows: scenarioPeriodMatrix.cells.map((cell) => ({
            certification: scenarioHeatmapCertificationLabel(
              cell.value,
              scenarioPeriodSeriesById.get(cell.scenarioId),
            ),
            date:
              scenarioHeatmapGranularity === "hour"
                ? scenarioHourHeatmapDateKey || null
                : undefined,
            metric: metricLabel(settings.metric, scenarioHeatmapGranularity),
            period: scenarioPeriodMatrix.labels[cell.y] ?? null,
            scenario: scenarioPeriodMatrix.scenarioNames[cell.x] ?? null,
            value: cell.value,
          })),
          title: `Dados - ${scenarioPeriodTitle}`,
        },
        title: scenarioPeriodTitle,
      },
    },
  ];
}

type OccupancyComparisonReportRange = {
  buckets: Date[];
  from: Date;
  to: Date;
};

async function loadOccupancyHistoricalComparisonDataset({
  bypassCache,
  companyScopeId,
  period,
  plan,
  ranges,
  scenarioHeatmapGranularity,
  scenarios,
  signal,
  timeZone,
  timeZoneWarning,
}: {
  bypassCache: boolean;
  companyScopeId: string;
  period: OccupancyComparisonHistoricalPeriod;
  plan: OccupancyHistoricalComparisonLoadPlan;
  ranges: OccupancyHistoricalComparisonRanges;
  scenarioHeatmapGranularity: OccupancyScenarioHeatmapGranularity;
  scenarios: readonly OccupancyScenario[];
  signal: AbortSignal;
  timeZone: string;
  timeZoneWarning?: string;
}): Promise<OccupancyHistoricalComparisonDataset> {
  signal.throwIfAborted();
  const snapshotsPromise = plan.needsSnapshots
    ? loadOccupancyComparisonReportSnapshots({
        bypassCache,
        companyScopeId,
        referenceAt: period.referenceAt,
        scenarioIds: plan.snapshotScenarioIds,
        scenarios,
        signal,
        timeZone,
      })
    : Promise.resolve([]);
  const hourlyPromise =
    plan.needsHourlyAggregate && ranges.hourly?.buckets.length
      ? loadOccupancyComparisonReportAggregate({
          bypassCache,
          companyScopeId,
          granularity: "hour",
          range: ranges.hourly,
          requestedAt: period.referenceAt,
          scenarioIds: plan.hourlyScenarioIds,
          scenarios,
          signal,
          timeZone,
          timeZoneWarning,
        })
      : Promise.resolve(
          emptyHistoricalComparisonSeries(plan.hourlyScenarioIds, scenarios),
        );
  const maximumTrendPromise =
    plan.needsMaximumTrend &&
    ranges.maximumTrend?.monthlySource.buckets.length
      ? loadOccupancyComparisonReportAggregate({
          bypassCache,
          companyScopeId,
          granularity: "month",
          range: ranges.maximumTrend.monthlySource,
          requestedAt: period.referenceAt,
          scenarioIds: plan.maximumTrendScenarioIds,
          scenarios,
          signal,
          timeZone,
          timeZoneWarning,
        })
      : Promise.resolve(
          emptyHistoricalComparisonSeries(
            plan.maximumTrendScenarioIds,
            scenarios,
          ),
        );
  const nonHourlyScenarioHeatmapPromise =
    plan.needsScenarioHeatmap &&
    scenarioHeatmapGranularity !== "hour" &&
    ranges.scenarioHeatmap?.buckets.length
      ? loadOccupancyComparisonReportAggregate({
          bypassCache,
          companyScopeId,
          granularity: scenarioHeatmapGranularity,
          range: ranges.scenarioHeatmap,
          requestedAt: period.referenceAt,
          scenarioIds: plan.scenarioHeatmapScenarioIds,
          scenarios,
          signal,
          timeZone,
          timeZoneWarning,
        })
      : Promise.resolve([]);

  const [snapshots, hourlySeries, maximumTrendSeries, nonHourlyHeatmapSeries] =
    await Promise.all([
      snapshotsPromise,
      hourlyPromise,
      maximumTrendPromise,
      nonHourlyScenarioHeatmapPromise,
    ]);
  signal.throwIfAborted();

  return {
    hourlyRange: ranges.hourly,
    hourlySeries,
    maximumTrendRanges: ranges.maximumTrend,
    maximumTrendSeries,
    scenarioHeatmapRange: ranges.scenarioHeatmap,
    scenarioHeatmapSeries:
      scenarioHeatmapGranularity === "hour"
        ? filterOccupancyComparisonRows(
            hourlySeries,
            plan.scenarioHeatmapScenarioIds,
          )
        : nonHourlyHeatmapSeries.length
          ? nonHourlyHeatmapSeries
          : emptyHistoricalComparisonSeries(
              plan.scenarioHeatmapScenarioIds,
              scenarios,
            ),
    snapshots,
  };
}

function emptyHistoricalComparisonSeries(
  scenarioIds: readonly string[],
  scenarios: readonly OccupancyScenario[],
): OccupancyScenarioHourlySeries[] {
  const requestedIds = new Set(scenarioIds);
  return scenarios.flatMap((scenario) =>
    requestedIds.has(scenario.id)
      ? [
          {
            metrics: new Map<number, OccupancyAggregateMetric>(),
            name: scenario.name,
            scenarioId: scenario.id,
          },
        ]
      : [],
  );
}

function historicalComparisonFailureSeries(
  scenarioIds: readonly string[],
  scenarios: readonly OccupancyScenario[],
  error: string,
) {
  return emptyHistoricalComparisonSeries(scenarioIds, scenarios).map(
    (series) => ({ ...series, error }),
  );
}

function historicalSnapshotFailures(
  scenarioIds: readonly string[],
  scenarios: readonly OccupancyScenario[],
  error: string,
): OccupancyScenarioSnapshot[] {
  const requestedIds = new Set(scenarioIds);
  return scenarios.flatMap((scenario) =>
    requestedIds.has(scenario.id)
      ? [
          {
            error,
            name: scenario.name,
            occupied: null,
            scenarioId: scenario.id,
            total: null,
          },
        ]
      : [],
  );
}

function occupancyHistoricalSnapshotsAreComplete(
  snapshots: readonly OccupancyScenarioSnapshot[],
  scenarioIds: readonly string[],
) {
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.scenarioId, snapshot]),
  );
  return Array.from(new Set(scenarioIds)).every((scenarioId) => {
    const snapshot = snapshotsById.get(scenarioId);
    return Boolean(
      snapshot &&
        !snapshot.error &&
        snapshot.total !== null &&
        Number.isFinite(snapshot.total),
    );
  });
}

function occupancyHistoricalAggregateIsComplete({
  coverageScenarios,
  granularity,
  range,
  scenarioIds,
  series,
  timeZone,
}: {
  coverageScenarios?: readonly Pick<OccupancyScenario, "created_at" | "id">[];
  granularity: AggregateGranularity;
  range: OccupancyMaximumTrendRange | null;
  scenarioIds: readonly string[];
  series: readonly OccupancyScenarioHourlySeries[];
  timeZone?: string;
}) {
  const uniqueScenarioIds = Array.from(new Set(scenarioIds));
  if (!uniqueScenarioIds.length) return true;
  if (!range?.buckets.length) return true;
  const seriesById = new Map(
    series.map((scenarioSeries) => [
      scenarioSeries.scenarioId,
      scenarioSeries,
    ]),
  );
  const coverageStartById = new Map(
    coverageScenarios?.map((scenario) => [
      scenario.id,
      occupancyScenarioCoverageStart(scenario.created_at),
    ]) ?? [],
  );
  return uniqueScenarioIds.every((scenarioId) => {
    const coverageStart = coverageStartById.get(scenarioId);
    const coverageMonth =
      granularity === "month" && coverageStart && timeZone
        ? companyCalendarDate(coverageStart, timeZone, "month")
        : null;
    const requiredBuckets = coverageMonth
      ? range.buckets.filter(
          (bucket) =>
            bucket.getFullYear() * 12 + bucket.getMonth() >=
            coverageMonth.getFullYear() * 12 + coverageMonth.getMonth(),
        )
      : range.buckets;
    if (!requiredBuckets.length) return true;
    const scenarioSeries = seriesById.get(scenarioId);
    return Boolean(
      scenarioSeries &&
        !scenarioSeries.error &&
        requiredBuckets.every((bucket) =>
          scenarioSeries.metrics.has(
            occupancyAggregateBucketKey(bucket, granularity),
          ),
        ),
    );
  });
}

function occupancyHistoricalComparisonDataCompleteUntil({
  dataset,
  period,
  plan,
  ranges,
  scenarioHeatmapGranularity,
  scenarios,
  timeZone,
}: {
  dataset: OccupancyHistoricalComparisonDataset;
  period: OccupancyComparisonHistoricalPeriod;
  plan: OccupancyHistoricalComparisonLoadPlan;
  ranges: OccupancyHistoricalComparisonRanges;
  scenarioHeatmapGranularity: AggregateGranularity;
  scenarios: readonly OccupancyScenario[];
  timeZone: string;
}): Date | null | undefined {
  const snapshotDemand =
    plan.needsSnapshots && plan.snapshotScenarioIds.length > 0;
  const hourlyDemand =
    plan.needsHourlyAggregate && plan.hourlyScenarioIds.length > 0;
  const maximumTrendDemand =
    plan.needsMaximumTrend && plan.maximumTrendScenarioIds.length > 0;
  const scenarioHeatmapDemand =
    plan.needsScenarioHeatmap &&
    scenarioHeatmapGranularity !== "hour" &&
    plan.scenarioHeatmapScenarioIds.length > 0;

  if (
    !snapshotDemand &&
    !hourlyDemand &&
    !maximumTrendDemand &&
    !scenarioHeatmapDemand
  ) {
    return undefined;
  }
  if (
    snapshotDemand &&
    !occupancyHistoricalSnapshotsAreComplete(
      dataset.snapshots,
      plan.snapshotScenarioIds,
    )
  ) {
    return null;
  }
  if (
    hourlyDemand &&
    !occupancyHistoricalAggregateIsComplete({
      granularity: "hour",
      range: ranges.hourly,
      scenarioIds: plan.hourlyScenarioIds,
      series: dataset.hourlySeries,
    })
  ) {
    return null;
  }
  if (
    maximumTrendDemand &&
    !occupancyHistoricalAggregateIsComplete({
      coverageScenarios: scenarios,
      granularity: "month",
      range: ranges.maximumTrend?.monthlySource ?? null,
      scenarioIds: plan.maximumTrendScenarioIds,
      series: dataset.maximumTrendSeries,
      timeZone,
    })
  ) {
    return null;
  }
  if (
    scenarioHeatmapDemand &&
    !occupancyHistoricalAggregateIsComplete({
      granularity: scenarioHeatmapGranularity,
      range: ranges.scenarioHeatmap,
      scenarioIds: plan.scenarioHeatmapScenarioIds,
      series: dataset.scenarioHeatmapSeries,
    })
  ) {
    return null;
  }
  return new Date(period.referenceAt);
}

function occupancyComparisonHistoryPath(scenarioId: string, at: Date) {
  const params = new URLSearchParams({ at: at.toISOString() });
  return `/occupancy/scenarios/${encodeURIComponent(scenarioId)}/history?${params.toString()}`;
}

async function loadOccupancyComparisonReportSnapshots({
  bypassCache = false,
  companyScopeId,
  referenceAt,
  scenarioIds,
  scenarios,
  signal,
  timeZone,
}: {
  bypassCache?: boolean;
  companyScopeId: string;
  referenceAt?: Date;
  scenarioIds: readonly string[];
  scenarios: readonly OccupancyScenario[];
  signal: AbortSignal;
  timeZone: string;
}): Promise<OccupancyScenarioSnapshot[]> {
  const requestedIds = new Set(scenarioIds);
  const requestedScenarios = scenarios.filter((scenario) =>
    requestedIds.has(scenario.id),
  );
  if (!requestedScenarios.length) return [];
  signal.throwIfAborted();

  if (referenceAt) {
    return mapWithConcurrency(
      requestedScenarios,
      MAX_PARALLEL_REQUESTS,
      async (scenario): Promise<OccupancyScenarioSnapshot> => {
        try {
          const response = await fetchSharedOccupancyQuery<unknown>({
            bypassCache,
            cacheTtlMs: DEFAULT_AGGREGATE_REFRESH_MS,
            companyScopeId,
            path: occupancyComparisonHistoryPath(scenario.id, referenceAt),
            priority: "normal",
            scenarioId: scenario.id,
            signal,
            timeZone,
          });
          signal.throwIfAborted();
          const history = requireOccupancyHistoryResponse(
            response,
            scenario.id,
            {
              expectedAreas: scenario.areas,
              requestedAt: referenceAt,
            },
          );
          return {
            asOf: history.as_of,
            name: scenario.name,
            occupied: history.total > 0,
            scenarioId: scenario.id,
            total: history.total,
          };
        } catch (error) {
          if (isAbortError(error, signal)) throw error;
          return {
            error: occupancyRequestError(
              error,
              "A leitura de fechamento não está disponível.",
            ),
            name: scenario.name,
            occupied: null,
            scenarioId: scenario.id,
            total: null,
          };
        }
      },
    );
  }

  const query = occupancyLiveSnapshotQuery({ now: new Date() });
  const expectedAreas = Array.from(
    new Map(
      requestedScenarios.flatMap((scenario) =>
        scenario.areas.map((area) => [
          JSON.stringify([
            area.camera_id,
            area.area_id,
            scenario.object_class,
          ]),
          {
            area_id: area.area_id,
            camera_id: area.camera_id,
            object_class: scenario.object_class,
          },
        ] as const),
      ),
    ).values(),
  );

  try {
    const response = await fetchSharedOccupancyQuery<unknown>({
      bypassCache,
      cacheTtlMs: OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS,
      companyScopeId,
      path: query.path,
      priority: "normal",
      scenarioId: OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID,
      signal,
      timeZone,
    });
    signal.throwIfAborted();
    const rows = requireOccupancyCurrentSnapshotRows(response, {
      expectedAreas,
    });
    return requestedScenarios.map((scenario) => {
      if (!occupancyScenarioSnapshotHasCompleteCoverage(scenario, rows)) {
        return {
          error: "A leitura atual não cobriu todas as áreas do cenário.",
          name: scenario.name,
          occupied: null,
          scenarioId: scenario.id,
          total: null,
        };
      }
      try {
        return buildOccupancyScenarioSnapshotValue(scenario, rows);
      } catch (error) {
        return {
          error: occupancyRequestError(
            error,
            "A leitura atual não está disponível.",
          ),
          name: scenario.name,
          occupied: null,
          scenarioId: scenario.id,
          total: null,
        };
      }
    });
  } catch (error) {
    signal.throwIfAborted();
    const message = occupancyRequestError(
      error,
      "A leitura atual não está disponível.",
    );
    return requestedScenarios.map((scenario) => ({
      error: message,
      name: scenario.name,
      occupied: null,
      scenarioId: scenario.id,
      total: null,
    }));
  }
}

async function loadOccupancyComparisonReportAggregate({
  bypassCache = false,
  companyScopeId,
  granularity,
  range,
  requestedAt = new Date(),
  scenarioIds,
  scenarios,
  signal,
  timeZone,
  timeZoneWarning,
}: {
  bypassCache?: boolean;
  companyScopeId: string;
  granularity: OccupancyScenarioHeatmapGranularity;
  range: OccupancyComparisonReportRange;
  requestedAt?: Date;
  scenarioIds: readonly string[];
  scenarios: readonly OccupancyScenario[];
  signal: AbortSignal;
  timeZone: string;
  timeZoneWarning?: string;
}): Promise<OccupancyScenarioHourlySeries[]> {
  const requestedIds = new Set(scenarioIds);
  const requestedScenarios = scenarios.filter((scenario) =>
    requestedIds.has(scenario.id),
  );
  if (!requestedScenarios.length) return [];
  signal.throwIfAborted();
  const openBucket = range.buckets.at(-1);
  const capabilities = sharedOccupancyCivilCapabilities(
    companyScopeId,
    timeZone,
  );

  return mapWithConcurrency(
    requestedScenarios,
    MAX_PARALLEL_REQUESTS,
    async (scenario): Promise<OccupancyScenarioHourlySeries> => {
      try {
        signal.throwIfAborted();
        const fetchResponse = (path: string) =>
          fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
            bypassCache,
            cacheTtlMs: DEFAULT_AGGREGATE_REFRESH_MS,
            companyScopeId,
            path,
            priority: "normal",
            scenarioId: scenario.id,
            signal,
            timeZone,
          });
        const response =
          granularity === "day" ||
          granularity === "week" ||
          granularity === "month"
            ? await fetchOccupancyCivilAggregate({
                capabilities,
                companyScopeId,
                fetchResponse,
                from: range.from,
                granularity,
                maximumFallbackRequests:
                  occupancyLiveCivilFallbackRequestLimit(granularity),
                openBucket,
                requestedAt,
                scenarioId: scenario.id,
                signal,
                timeZone,
                to: range.to,
              })
            : await fetchResponse(
                occupancyAggregatePath(
                  scenario.id,
                  range.from,
                  range.to,
                  granularity,
                ),
              );
        signal.throwIfAborted();
        const rows = requireOccupancyAggregateRows(
          response,
          granularity,
          scenario.id,
          timeZone,
          {
            allowDocumentedAggregateResponse: true,
            allowVerifiedCivilAggregateResponse:
              granularity !== "minute" && granularity !== "hour",
            expectedTimezone: timeZone,
            openBucket,
            requestedAt,
            requireCertification: true,
          },
        );
        const coverage = aggregateOccupancyRowsForRequestedBuckets(
          rows,
          granularity,
          range.buckets,
          {
            allowDocumentedAggregateResponse: true,
            allowVerifiedCivilAggregateResponse:
              granularity !== "minute" && granularity !== "hour",
            expectedTimezone: timeZone,
            openBucket,
            requireCertification: true,
          },
        );
        return {
          metrics: new Map(coverage.totals),
          name: scenario.name,
          scenarioId: scenario.id,
          warning: joinMessages(
            timeZoneWarning,
            occupancyAggregateMetadataWarning(response, granularity),
            occupancyAggregateCoverageWarning(
              coverage.missingBuckets.length,
              range.buckets.length,
            ),
          ),
        };
      } catch (error) {
        signal.throwIfAborted();
        return {
          error: occupancyRequestError(
            error,
            `A série por ${occupancyScenarioHeatmapGranularityLabel(granularity)} não está disponível.`,
          ),
          metrics: new Map(),
          name: scenario.name,
          scenarioId: scenario.id,
        };
      }
    },
  );
}

function buildMaximumReportAsset({
  cardId,
  colorPalette,
  granularity,
  historicalContextLabel,
  labels,
  series,
  widgetColor,
}: {
  cardId: string;
  colorPalette: readonly string[];
  granularity: OccupancyMaximumLineGranularity;
  historicalContextLabel?: string;
  labels: string[];
  series: OccupancyMaximumLineSeries[];
  widgetColor: string;
}): OccupancyComparisonReportAsset {
  const title = historicalContextLabel
    ? granularity === "hour"
      ? "Máximo por hora no período"
      : granularity === "month"
        ? "Máximo mensal · 12 meses fechados"
        : "Máximo anual · 4 anos fechados"
    : maximumLineTitle(granularity);
  const description = historicalContextLabel
    ? `${historicalContextLabel}. ${maximumLineDescription(granularity, true)}`
    : maximumLineDescription(granularity);
  return {
    cardId,
    chart: {
      description,
      option: buildScenarioMaximumLineOption({
        colorPalette,
        granularity,
        labels,
        series,
        theme: "light",
        widgetColor,
      }),
      table: {
        columns: [
          { key: "period", label: "Período" },
          { key: "scenario", label: "Cenário" },
          { key: "maximum", label: "Ocupação máxima", numeric: true },
          { key: "status", label: "Estado do período" },
        ],
        description:
          "Máximo por agrupamento; períodos em andamento são identificados e lacunas permanecem sem valor.",
        rows: series.flatMap((scenario) =>
          labels.map((label, index) => {
            const value = scenario.values[index] ?? null;
            return {
              maximum: value,
              period: label,
              scenario: scenario.name,
              status:
                value === null
                  ? "Sem dados"
                  : scenario.partialIndexes?.includes(index)
                    ? "Em andamento"
                    : "Fechado",
            };
          }),
        ),
        title: `Dados - ${title}`,
      },
      title,
    },
  };
}

function comparisonStateLabel(
  state: OccupancyComparisonBarEntry["state"],
) {
  if (state === "occupied") return "Ocupado";
  if (state === "unoccupied") return "Desocupado";
  return "Sem dados";
}

function OccupancyComparisonOptions({
  cardId,
  settings,
  onChange,
  dateKey,
  dateKeys,
  scenarios,
  snapshots,
  defaultScenarioIds,
}: {
  cardId: string;
  settings: OccupancyWidgetSettings;
  onChange: (patch: Partial<OccupancyWidgetSettings>) => boolean;
  dateKey: string;
  dateKeys: string[];
  scenarios: OccupancyScenario[];
  snapshots: OccupancyScenarioSnapshot[];
  defaultScenarioIds: string[];
}) {
  if (cardId === "occupancy_scenario_half_donut") {
    return <div className="grid min-w-0 gap-3">
      <Select value={settings.comparisonChartType} onValueChange={(comparisonChartType) => onChange({ comparisonChartType: comparisonChartType as OccupancyWidgetSettings["comparisonChartType"] })}>
        <SelectTrigger aria-label="Tipo do gráfico da comparação atual por cenário" className="w-full min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="half_donut">Meia rosca</SelectItem>
          <SelectItem value="bars">Barras horizontais</SelectItem>
          <SelectItem value="vertical_bars">Barras verticais</SelectItem>
        </SelectContent>
      </Select>
      <Select value={settings.comparisonMode} onValueChange={(comparisonMode) => onChange({ comparisonMode: comparisonMode as OccupancyHalfDonutMode })}>
        <SelectTrigger aria-label="Modo da comparação atual por cenário" className="w-full min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="status">Ocupado / desocupado</SelectItem>
          <SelectItem value="actual">Ocupação real</SelectItem>
        </SelectContent>
      </Select>
    </div>;
  }
  if (cardId === "occupancy_hex_layout") {
    const palette = getOccupancyColorPalette(settings.hexColorPaletteId);
    return <div className="grid min-w-0 gap-3">
      <OccupancyHexLayoutEditor
        capacities={settings.capacities}
        defaultScenarioIds={defaultScenarioIds}
        displayMode={settings.hexDisplayMode}
        fallbackColor={palette.colors[0]}
        legacyColumns={settings.hexColumns}
        legacyPreset={settings.hexPreset}
        layout={settings.hexLayout}
        onSave={onChange}
        scenarios={scenarios}
        semanticColors={settings.hexStatusColors}
        snapshots={snapshots}
      />
      <Select value={settings.hexDisplayMode} onValueChange={(hexDisplayMode) => onChange({ hexDisplayMode: hexDisplayMode as OccupancyWidgetSettings["hexDisplayMode"] })}>
        <SelectTrigger aria-label="Modo de visualização do simulador hexagonal" className="w-full min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="actual">Valor real (gradual)</SelectItem>
          <SelectItem value="status">Ocupado / desocupado</SelectItem>
        </SelectContent>
      </Select>
      {settings.hexDisplayMode === "actual" ? <OccupancyPaletteSelect
        ariaLabel="Paleta de cores do simulador hexagonal"
        className="w-full min-w-0 @sm:w-full"
        value={settings.hexColorPaletteId}
        onValueChange={(hexColorPaletteId) => onChange({ hexColorPaletteId })}
      /> : <OccupancyStatusColorsDialog
        ariaLabel="Configurar cores de estado do simulador hexagonal"
        buttonLabel="Cores do hex"
        colors={settings.hexStatusColors}
        dialogDescription="Defina as cores de ocupado e desocupado usadas pelo simulador hexagonal."
        dialogTitle="Cores de estado do simulador hexagonal"
        onChange={(hexStatusColors) => onChange({ hexStatusColors })}
        successMessage="Cores do simulador hexagonal atualizadas."
      />}
    </div>;
  }
  const scenarioPeriodCard = cardId === "occupancy_scenario_hour_heatmap";
  const showDayCount =
    cardId === "occupancy_day_hour_heatmap" ||
    (scenarioPeriodCard && settings.scenarioHeatmapGranularity === "day");
  return <div className="grid min-w-0 gap-3">
    {scenarioPeriodCard ? (
      <Select
        value={settings.scenarioHeatmapGranularity}
        onValueChange={(scenarioHeatmapGranularity) =>
          onChange({
            scenarioHeatmapGranularity:
              scenarioHeatmapGranularity as OccupancyScenarioHeatmapGranularity,
          })
        }
      >
        <SelectTrigger
          aria-label="Granularidade do mapa de calor por cenário"
          className="h-9 w-full min-w-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minute">Minuto a minuto</SelectItem>
          <SelectItem value="hour">Hora a hora</SelectItem>
          <SelectItem value="day">Dia a dia</SelectItem>
          <SelectItem value="week">Semana a semana</SelectItem>
          <SelectItem value="month">Mês a mês</SelectItem>
        </SelectContent>
      </Select>
    ) : null}
    {showDayCount ? <Select value={String(settings.dayCount)} onValueChange={(value) => onChange({ dayCount: Number(value) as 7 | 14 | 30 })}>
      <SelectTrigger aria-label="Período do mapa de calor por dias e horários" className="h-9 w-full min-w-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="7">7 dias</SelectItem>
        <SelectItem value="14">14 dias</SelectItem>
        <SelectItem value="30">30 dias</SelectItem>
      </SelectContent>
    </Select> : null}
    {scenarioPeriodCard && settings.scenarioHeatmapGranularity === "hour" ? <Input
      aria-label="Data do mapa de calor por cenário"
      className="h-9 w-full min-w-0"
      disabled={!dateKeys.length}
      min={dateKeys[0]}
      max={dateKeys.at(-1)}
      type="date"
      value={dateKey}
      onChange={(event) => {
        if (dateKeys.includes(event.target.value)) onChange({ scenarioHourHeatmapDateKey: event.target.value });
      }}
    /> : null}
    <MetricSelect
      granularity={
        scenarioPeriodCard ? settings.scenarioHeatmapGranularity : "hour"
      }
      onChange={(metric) => { onChange({ metric }); }}
      value={settings.metric}
    />
  </div>;
}

function OccupancyHalfDonutCard({
  timeZone,
  chartType,
  colorPalette,
  historicalContextLabel,
  loading,
  mode,
  snapshots,
  statusColors,
}: {
  chartType: OccupancyWidgetSettings["comparisonChartType"];
  timeZone: string;
  colorPalette: readonly string[];
  historicalContextLabel?: string;
  loading: boolean;
  mode: OccupancyHalfDonutMode;
  snapshots: OccupancyScenarioSnapshot[];
  statusColors: OccupancyStatusColors;
}) {
  const title = historicalContextLabel
    ? "Comparação no fechamento por cenário"
    : "Comparação atual por cenário";
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const [chartContainerWidth, setChartContainerWidth] = React.useState(0);
  const displayStatusColors = React.useMemo(
    () => ({
      ...statusColors,
      occupied: ensureGraphicContrast(
        statusColors.occupied,
        effectiveTheme === "dark" ? "#131316" : "#FFFFFF",
      ),
      unoccupied: ensureGraphicContrast(
        statusColors.unoccupied,
        effectiveTheme === "dark" ? "#131316" : "#FFFFFF",
      ),
    }),
    [effectiveTheme, statusColors],
  );
  const entries = React.useMemo(
    () => buildOccupancyHalfDonutEntries(snapshots, mode),
    [mode, snapshots],
  );
  const effectiveAt = React.useMemo(
    () => occupancySnapshotEffectiveAt(snapshots),
    [snapshots],
  );
  const barEntries = React.useMemo(
    () => buildOccupancyComparisonBarEntries(snapshots, mode),
    [mode, snapshots],
  );
  const axisScopeKey = React.useMemo(
    () =>
      occupancyComparisonAxisScopeKey(
        snapshots.map((snapshot) => snapshot.scenarioId),
      ),
    [snapshots],
  );
  const instantaneousAxisMemory = React.useMemo(
    () =>
      updateOccupancyComparisonAxisMemory(
        { maximum: 1, scopeKey: "" },
        axisScopeKey,
        barEntries.map((entry) => entry.total),
      ),
    [axisScopeKey, barEntries],
  );
  const [rememberedAxisMemory, setRememberedAxisMemory] = React.useState(
    instantaneousAxisMemory,
  );
  const stableAxisMaximum =
    rememberedAxisMemory.scopeKey === axisScopeKey
      ? Math.max(
          rememberedAxisMemory.maximum,
          instantaneousAxisMemory.maximum,
        )
      : instantaneousAxisMemory.maximum;
  const scenarioIndexes = React.useMemo(
    () =>
      new Map(
        snapshots.map((snapshot, index) => [snapshot.scenarioId, index + 1]),
      ),
    [snapshots],
  );
  const option = React.useMemo(
    () =>
      chartType === "bars"
        ? buildCurrentComparisonBarOption(
            barEntries,
            mode,
            widgetColor,
            colorPalette,
            displayStatusColors,
            effectiveTheme,
            scenarioIndexes,
            chartContainerWidth,
            stableAxisMaximum,
          )
        : chartType === "vertical_bars"
          ? buildCurrentComparisonVerticalBarOption(
              barEntries,
              mode,
              widgetColor,
              colorPalette,
              displayStatusColors,
              effectiveTheme,
              scenarioIndexes,
              chartContainerWidth,
              stableAxisMaximum,
            )
        : buildHalfDonutOption(
            entries,
            mode,
            widgetColor,
            colorPalette,
            displayStatusColors,
            effectiveTheme,
            scenarioIndexes,
          ),
    [
      barEntries,
      chartContainerWidth,
      chartType,
      colorPalette,
      displayStatusColors,
      effectiveTheme,
      entries,
      mode,
      scenarioIndexes,
      stableAxisMaximum,
      widgetColor,
    ],
  );
  const allCertifiedAreUnoccupied =
    chartType === "half_donut" &&
    mode === "actual" &&
    entries.length > 0 &&
    entries.every((entry) => entry.state === "unoccupied");
  const hasChartEntries =
    chartType === "half_donut" ? entries.length > 0 : barEntries.length > 0;
  const showCompactDonutFallback =
    chartType === "half_donut" && entries.length > 8;
  const statusColorPresetLabel =
    OCCUPANCY_STATUS_COLOR_PRESETS.find(
      (candidate) => candidate.id === statusColors.preset,
    )?.label ?? "Personalizado";

  React.useEffect(() => {
    setRememberedAxisMemory((currentMemory) =>
      updateOccupancyComparisonAxisMemory(currentMemory, axisScopeKey, [
        instantaneousAxisMemory.maximum,
      ]),
    );
  }, [axisScopeKey, instantaneousAxisMemory.maximum]);

  React.useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || loading || !hasChartEntries) return;

    const updateWidth = (width: number) => {
      const nextWidth = Math.max(0, Math.round(width));
      if (!nextWidth) return;
      setChartContainerWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    updateWidth(container.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((records) => {
      updateWidth(records[0]?.contentRect.width ?? container.clientWidth);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [chartType, hasChartEntries, loading]);

  return (
    <Card className="@container flex h-full min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 @2xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <CardTitle className="[overflow-wrap:anywhere]">
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {historicalContextLabel ? `${historicalContextLabel}. ` : ""}
              {chartType === "vertical_bars"
                ? mode === "status"
                  ? "Uma coluna por cenário, da esquerda para a direita na ordem configurada, distinguindo ocupado, desocupado e ausência de dados."
                  : "Uma coluna por cenário, da esquerda para a direita na ordem configurada, com valor real e participação percentual."
                : chartType === "bars"
                ? mode === "status"
                  ? "Uma barra por cenário, na ordem configurada, distinguindo ocupado, desocupado e ausência de dados."
                  : "Uma barra por cenário, na ordem configurada, com valor real e participação percentual."
                : mode === "status"
                  ? "Todos os cenários com leitura têm o mesmo peso visual; o estado informado permanece visível."
                  : "A área de cada fatia representa a ocupação real; o callout identifica cenário e participação percentual."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-echart-layout="natural"
      >
        {mode === "status" && entries.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <OccupancyStatusLegendBadge
              color={displayStatusColors.occupied}
              label="Ocupado"
            />
            <OccupancyStatusLegendBadge
              color={displayStatusColors.unoccupied}
              label="Desocupado"
              patterned
            />
            <span>
              Contexto: {statusColorPresetLabel}. As cores não alteram os valores.
            </span>
          </div>
        ) : null}
        {loading ? (
          <ChartSkeleton />
        ) : hasChartEntries ? (
          <div
            ref={chartContainerRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
              <EChart
                ariaLabel={title}
                option={option}
                themeMode="explicit"
                className="h-full min-h-0 w-full"
              />
              {allCertifiedAreUnoccupied ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs font-semibold"
                  style={{ color: displayStatusColors.unoccupied }}
                >
                  Todos desocupados
                </div>
              ) : null}
            </div>
            {showCompactDonutFallback ? (
              <OccupancyHalfDonutCompactFallback
                colorPalette={colorPalette}
                entries={entries}
                mode={mode}
                scenarioIndexes={scenarioIndexes}
                statusColors={displayStatusColors}
                theme={effectiveTheme}
                widgetColor={widgetColor}
              />
            ) : null}
          </div>
        ) : (
          <EmptyComparisonState
            text={
              historicalContextLabel
                ? "Nenhum cenário possui leitura de fechamento disponível no período."
                : "Nenhum cenário possui leitura disponível neste momento."
            }
          />
        )}
        {effectiveAt ? (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {historicalContextLabel ? "Fechamento efetivo" : "Leitura efetiva"}: {formatDateTime(effectiveAt, timeZone)}.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OccupancyHalfDonutCompactFallback({
  colorPalette,
  entries,
  mode,
  scenarioIndexes,
  statusColors,
  theme,
  widgetColor,
}: {
  colorPalette: readonly string[];
  entries: OccupancyHalfDonutEntry[];
  mode: OccupancyHalfDonutMode;
  scenarioIndexes: ReadonlyMap<string, number>;
  statusColors: OccupancyStatusColors;
  theme: "dark" | "light";
  widgetColor: string;
}) {
  const [page, setPage] = React.useState(0);
  const pageSize = 8;
  const highestIndex = Math.max(0, ...scenarioIndexes.values());
  const indexWidth = Math.max(2, String(highestIndex).length);
  const totalOccupancy = entries.reduce((sum, entry) => sum + entry.total, 0);
  const compactEntries = entries.map((entry, index) => {
    const indexLabel = String(
      scenarioIndexes.get(entry.scenarioId) ?? index + 1,
    ).padStart(indexWidth, "0");
    const percentage =
      mode === "actual" && totalOccupancy > 0
        ? (entry.total / totalOccupancy) * 100
        : null;
    const metric =
      mode === "status"
        ? entry.state === "occupied"
          ? "Ocupado"
          : "Desocupado"
        : percentage === null
          ? formatOccupancyCount(entry.total)
          : `${formatOccupancyCount(entry.total)} · ${formatChartNumber(percentage)}%`;
    const accessibleLabel =
      mode === "status"
        ? `${indexLabel} · ${entry.name}: ${
            entry.state === "occupied" ? "ocupado" : "desocupado"
          }`
        : percentage === null
          ? `${indexLabel} · ${entry.name}: ocupação ${formatOccupancyCount(
              entry.total,
            )}; total geral igual a zero`
          : `${indexLabel} · ${entry.name}: ocupação ${formatOccupancyCount(
              entry.total,
            )}, participação ${formatChartNumber(percentage)} por cento`;
    const color = halfDonutEntryColor(
      entry,
      mode,
      widgetColor,
      colorPalette,
      statusColors,
      theme,
    );

    return { accessibleLabel, color, entry, indexLabel, metric };
  });

  const pageCount = Math.max(1, Math.ceil(compactEntries.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleEntries = compactEntries.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize,
  );

  return (
    <div className="z-10 mt-2 min-w-0 rounded-lg border border-border/80 bg-background/95 p-1.5 shadow-sm backdrop-blur-sm">
      <div
        aria-label="Identificação compacta das fatias da meia rosca"
        className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-1.5"
        role="list"
      >
        {visibleEntries.map(({ accessibleLabel, color, entry, indexLabel, metric }) => (
          <div
            key={entry.scenarioId}
            aria-label={accessibleLabel}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1.5 gap-y-0.5 rounded-md border border-border/70 bg-card px-1.5 py-1 text-[10px] text-foreground shadow-sm"
            role="listitem"
            title={accessibleLabel}
          >
            <span
              aria-hidden="true"
              className="rounded px-1 py-0.5 font-mono text-[9px] font-extrabold leading-none"
              style={
                mode === "status" && entry.state === "unoccupied"
                  ? {
                      ...occupancyStatusPatternStyle(color),
                      color: readableTextColor(color),
                    }
                  : {
                      backgroundColor: color,
                      color: readableTextColor(color),
                    }
              }
            >
              {indexLabel}
            </span>
            <span
              aria-hidden="true"
              className="line-clamp-2 min-w-0 break-words font-medium leading-3 [overflow-wrap:anywhere]"
              title={entry.name}
            >
              {entry.name}
            </span>
            <span
              aria-hidden="true"
              className="col-span-full min-w-0 break-words font-semibold leading-3 text-muted-foreground [overflow-wrap:anywhere]"
            >
              {metric}
            </span>
          </div>
        ))}
      </div>
      {pageCount > 1 ? (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-1.5 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
          <span className="tabular-nums">
            {safePage + 1} de {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 min-h-6 px-2 py-0 text-[10px]"
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 min-h-6 px-2 py-0 text-[10px]"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OccupancyStatusColorsDialog({
  ariaLabel = "Configurar cores de ocupado e desocupado",
  buttonLabel = "Cores",
  colors,
  dialogDescription =
    "Escolha o significado mais adequado à operação. Os estados e os valores não mudam; somente a leitura visual é personalizada.",
  dialogTitle = "Cores por significado operacional",
  onChange,
  successMessage = "Cores dos estados atualizadas.",
}: {
  ariaLabel?: string;
  buttonLabel?: string;
  colors: OccupancyStatusColors;
  dialogDescription?: string;
  dialogTitle?: string;
  onChange: (colors: OccupancyStatusColors) => boolean | void;
  successMessage?: string;
}) {
  const occupiedInputId = React.useId();
  const unoccupiedInputId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<OccupancyStatusColors>(() => ({
    ...colors,
  }));
  const colorsAreDistinct = occupancyStatusColorsAreDistinct(draft);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setDraft({ ...colors });
    setOpen(nextOpen);
  }

  function changeColor(
    state: "occupied" | "unoccupied",
    color: string,
  ) {
    setDraft((current) => ({
      ...current,
      [state]: color.toUpperCase(),
      preset: "custom",
    }));
  }

  function saveColors() {
    if (!colorsAreDistinct) return;
    const persisted = onChange(draft);
    if (persisted === false) return;
    setOpen(false);
    toast.success(successMessage);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className="h-8 w-8 shrink-0 gap-1.5 px-0 @sm:w-auto @sm:px-3"
          size="sm"
          title={ariaLabel}
          variant="outline"
        >
          <Palette className="h-3.5 w-3.5" />
          <span className="sr-only @sm:not-sr-only">{buttonLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="grid gap-2 sm:grid-cols-3">
            {OCCUPANCY_STATUS_COLOR_PRESETS.map((preset) => {
              const selected = draft.preset === preset.id;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "focus-contained min-w-0 rounded-lg border bg-card p-3 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
                    selected &&
                      "border-primary ring-2 ring-primary/20 ring-offset-1 ring-offset-background",
                  )}
                  key={preset.id}
                  onClick={() =>
                    setDraft(occupancyStatusColorsForPreset(preset.id))
                  }
                  type="button"
                >
                  <span className="mb-2 flex h-2 overflow-hidden rounded-full">
                    <span
                      className="flex-1"
                      style={{ backgroundColor: preset.colors.occupied }}
                    />
                    <span
                      className="flex-1"
                      style={{ backgroundColor: preset.colors.unoccupied }}
                    />
                  </span>
                  <span className="block text-sm font-semibold">
                    {preset.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Cores personalizadas</div>
                <div className="text-xs text-muted-foreground">
                  Ajuste cada estado de forma independente.
                </div>
              </div>
              {draft.preset === "custom" ? (
                <Badge variant="outline">Personalizado</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <OccupancyStatusColorField
                color={draft.occupied}
                id={occupiedInputId}
                label="Ocupado"
                onChange={(color) => changeColor("occupied", color)}
              />
              <OccupancyStatusColorField
                color={draft.unoccupied}
                id={unoccupiedInputId}
                label="Desocupado"
                onChange={(color) => changeColor("unoccupied", color)}
              />
            </div>
            {!colorsAreDistinct ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Escolha cores mais distintas para que ocupado e desocupado
                sejam reconhecidos rapidamente.
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border" aria-label="Prévia das cores">
            <div className="grid grid-cols-2 text-center text-xs font-semibold">
              <div
                className="px-3 py-3"
                style={{
                  backgroundColor: draft.occupied,
                  color: readableTextColor(draft.occupied),
                }}
              >
                Ocupado
              </div>
              <div
                className="px-3 py-3"
                style={{
                  backgroundColor: draft.unoccupied,
                  color: readableTextColor(draft.unoccupied),
                }}
              >
                Desocupado
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            className="gap-1.5"
            onClick={() => setDraft({ ...DEFAULT_OCCUPANCY_STATUS_COLORS })}
            type="button"
            variant="ghost"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar neutro
          </Button>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={!colorsAreDistinct}
              onClick={saveColors}
              type="button"
            >
              Salvar cores
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OccupancyStatusColorField({
  color,
  id,
  label,
  onChange,
}: {
  color: string;
  id: string;
  label: string;
  onChange: (color: string) => void;
}) {
  return (
    <label
      className="flex min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-md border bg-background p-3"
      htmlFor={id}
    >
      <Input
        aria-label={`Escolher cor para ${label}`}
        className="h-10 w-12 shrink-0 cursor-pointer p-1"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={color}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">
          {color}
        </span>
      </span>
    </label>
  );
}

function OccupancyStatusLegendBadge({
  color,
  label,
  patterned = false,
}: {
  color: string;
  label: string;
  patterned?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-1 font-medium text-foreground">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
        style={
          patterned
            ? occupancyStatusPatternStyle(color)
            : { backgroundColor: color }
        }
      />
      {label}
    </span>
  );
}

function occupancyStatusPatternStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 2px, ${colorWithAlpha(
      readableTextColor(color),
      0.28,
    )} 2px 3px)`,
  };
}

function colorWithAlpha(color: string, alpha: number) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function readableTextColor(backgroundColor: string) {
  const backgroundLuminance = relativeColorLuminance(backgroundColor);
  const darkText = "#111827";
  const lightText = "#F8FAFC";
  const darkContrast = colorContrastRatio(
    backgroundLuminance,
    relativeColorLuminance(darkText),
  );
  const lightContrast = colorContrastRatio(
    backgroundLuminance,
    relativeColorLuminance(lightText),
  );
  return darkContrast >= lightContrast ? darkText : lightText;
}

function relativeColorLuminance(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel =
      Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return (
    (channels[0] ?? 0) * 0.2126 +
    (channels[1] ?? 0) * 0.7152 +
    (channels[2] ?? 0) * 0.0722
  );
}

function colorContrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function OccupancyBarRaceCard({
  timeZone,
  colorPalette,
  historicalContextLabel,
  loading,
  refreshSeconds,
  snapshots,
}: {
  colorPalette: readonly string[];
  historicalContextLabel?: string;
  loading: boolean;
  refreshSeconds?: number;
  timeZone: string;
  snapshots: OccupancyScenarioSnapshot[];
}) {
  const title = historicalContextLabel
    ? "Ranking no fechamento por cenário"
    : "Ranking ao vivo por cenário";
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const entries = React.useMemo(
    () => buildOccupancyLiveRaceEntries(snapshots),
    [snapshots],
  );
  const effectiveAt = React.useMemo(
    () => occupancySnapshotEffectiveAt(snapshots),
    [snapshots],
  );
  const option = React.useMemo(
    () =>
      buildLiveBarRaceOption(
        entries,
        widgetColor,
        colorPalette,
        Math.min(10, Math.max(1, entries.length)),
        effectiveTheme,
      ),
    [colorPalette, effectiveTheme, entries, widgetColor],
  );

  return (
    <Card className="@container flex h-full min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Trophy className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {historicalContextLabel
                ? `Ranking da ocupação no fechamento de ${historicalContextLabel}.`
                : `Ranking da ocupação total neste instante, verificado no Ao Vivo a cada ${refreshSeconds} segundos.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-2">
        {loading ? (
          <ChartSkeleton />
        ) : entries.length ? (
          <>
            <EChart
              ariaDescription={
                historicalContextLabel
                  ? `Ranking da ocupação no fechamento de ${historicalContextLabel}.`
                  : `Ranking da ocupação total neste instante, verificado a cada ${refreshSeconds} segundos.`
              }
              ariaLabel={title}
              option={option}
              mergeUpdates
              themeMode="explicit"
              className="h-full min-h-0 w-full flex-1"
            />
            {effectiveAt ? (
              <div className="text-[11px] text-muted-foreground">
                {historicalContextLabel ? "Fechamento efetivo" : "Leitura efetiva"}: {formatDateTime(effectiveAt, timeZone)}.
              </div>
            ) : null}
          </>
        ) : (
          <EmptyComparisonState
            text={
              historicalContextLabel
                ? "Nenhum cenário possui fechamento disponível para o ranking."
                : "Nenhum cenário foi selecionado para o ranking ao vivo."
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyScenarioMaximumLineCard({
  timeZone,
  allScenarios,
  buckets,
  colorPalette,
  currentBucket = null,
  currentSnapshots = [],
  currentSeries = [],
  granularity,
  historicalContextLabel,
  loading,
  monthlySourceBuckets = [],
  refreshSeconds,
  series,
}: {
  allScenarios: OccupancyScenario[];
  timeZone: string;
  buckets: Date[];
  colorPalette: readonly string[];
  currentBucket?: Date | null;
  currentSnapshots?: OccupancyScenarioSnapshot[];
  currentSeries?: OccupancyScenarioOpenMaximumSeries[];
  granularity: OccupancyMaximumLineGranularity;
  historicalContextLabel?: string;
  loading: boolean;
  monthlySourceBuckets?: Date[];
  refreshSeconds?: number;
  series: OccupancyScenarioHourlySeries[];
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const labels = React.useMemo(
    () =>
      granularity === "hour"
        ? OCCUPANCY_FIXED_HOUR_LABELS
        : occupancyMaximumTrendBucketLabels(buckets, granularity),
    [buckets, granularity],
  );
  const lineSeries = React.useMemo<OccupancyMaximumLineSeries[]>(
    () =>
      buildMaximumLineSeries({
        timeZone,
        buckets,
        currentBucket,
        currentSnapshots,
        currentSeries,
        granularity,
        markLastBucketPartial: !historicalContextLabel,
        monthlySourceBuckets,
        scenarios: allScenarios,
        series,
      }),
    [
      allScenarios,
      buckets,
      currentBucket,
      currentSnapshots,
      currentSeries,
      granularity,
      historicalContextLabel,
      monthlySourceBuckets,
      series,
      timeZone,
    ],
  );
  const option = React.useMemo(
    () =>
      buildScenarioMaximumLineOption({
        granularity,
        labels,
        colorPalette,
        series: lineSeries,
        theme: effectiveTheme,
        widgetColor,
      }),
    [colorPalette, effectiveTheme, granularity, labels, lineSeries, widgetColor],
  );
  const title = historicalContextLabel
    ? granularity === "hour"
      ? "Máximo por hora no período"
      : granularity === "month"
        ? "Máximo mensal · 12 meses fechados"
        : "Máximo anual · 4 anos fechados"
    : maximumLineTitle(granularity);
  const description = historicalContextLabel
    ? `${historicalContextLabel}. ${maximumLineDescription(granularity, true)}`
    : maximumLineDescription(granularity);

  return (
    <Card className="@container flex h-full min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 @xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              {granularity === "hour" ? (
                <Clock3 className="h-4 w-4 shrink-0 text-primary" />
              ) : granularity === "month" ? (
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <LineChart className="h-4 w-4 shrink-0 text-primary" />
              )}
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {description}
            </CardDescription>
          </div>
          <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="secondary">Somente máximo</Badge>
            {granularity === "hour" && refreshSeconds ? (
              <Badge variant="outline">Hora aberta: {refreshSeconds}s</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <ChartSkeleton />
        ) : lineSeries.length ? (
          <>
            <EChart
              ariaDescription={description}
              ariaLabel={title}
              option={option}
              themeMode="explicit"
              className="h-full min-h-0 w-full flex-1"
            />
            <ul className="sr-only" aria-label={`Dados de ${title}`}>
              {lineSeries.flatMap((scenario) =>
                labels.map((label, index) => (
                  <li key={`${scenario.scenarioId}-${granularity}-${index}`}>
                    {scenario.name}, {label}: {scenario.values[index] === null
                      ? "sem dados"
                      : `${formatChartNumber(scenario.values[index]!)}${
                          scenario.partialIndexes?.includes(index)
                            ? ", parcial; melhor observação disponível com cobertura ainda aberta"
                            : ""
                        }`}
                  </li>
                )),
              )}
            </ul>
          </>
        ) : (
          <EmptyComparisonState text="Selecione ao menos um cenário para comparar os máximos." />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyHexLayoutCard({
  capacities,
  colorPalette,
  columns,
  defaultScenarioIds,
  displayMode,
  historicalContextLabel,
  layout,
  loading,
  preset,
  scenarios,
  snapshots,
  statusColors,
}: {
  capacities: Record<string, number>;
  colorPalette: readonly string[];
  columns: number;
  defaultScenarioIds: string[];
  displayMode: OccupancyWidgetSettings["hexDisplayMode"];
  historicalContextLabel?: string;
  layout: OccupancyWidgetSettings["hexLayout"];
  loading: boolean;
  preset: OccupancyWidgetSettings["hexPreset"];
  scenarios: OccupancyScenario[];
  snapshots: OccupancyScenarioSnapshot[];
  statusColors: OccupancyStatusColors;
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const hexPalette = React.useMemo(
    () => getOccupancyHexPalette(effectiveTheme, widgetColor, statusColors),
    [effectiveTheme, statusColors, widgetColor],
  );
  const effectiveLayout = React.useMemo(
    () =>
      layout ??
      createDefaultOccupancyHexLayout({
        columns,
        preset,
        scenarioIds: defaultScenarioIds,
      }),
    [columns, defaultScenarioIds, layout, preset],
  );
  const positions = React.useMemo(
    () =>
      buildOccupancyHexLayout({
        capacities,
        columns,
        layout: effectiveLayout,
        preset,
        scenarios,
        snapshots,
      }),
    [capacities, columns, effectiveLayout, preset, scenarios, snapshots],
  );
  const visualScale = React.useMemo(
    () =>
      buildOccupancyHexVisualScale(
        positions.map((position) => ({
          capacity: position.capacity,
          cellId: position.cellId,
          state: position.state,
          total: position.total,
        })),
      ),
    [positions],
  );
  const stateCounts = positions.reduce(
    (counts, position) => {
      counts[position.state] += 1;
      return counts;
    },
    { occupied: 0, unavailable: 0, unlinked: 0, unoccupied: 0, unknown: 0 },
  );
  const renderedRowCount = Math.max(
    1,
    ...positions.map((position) => position.row + 1),
  );
  const singleRenderedRow =
    positions.length > 0 &&
    new Set(positions.map((position) => position.row)).size === 1;
  const viewport = occupancyHexViewportMetrics({
    cellCount: positions.length,
    columns: singleRenderedRow
      ? Math.max(1, positions.length)
      : effectiveLayout.columns,
    rows: renderedRowCount,
  });
  const animate = occupancyHexShouldAnimate(positions.length);
  const semanticPreset = OCCUPANCY_STATUS_COLOR_PRESETS.find(
    (candidate) => candidate.id === statusColors.preset,
  );
  const semanticLabel =
    semanticPreset?.label ?? "Personalizado";
  const option = React.useMemo(
    () =>
      buildHexLayoutOption(positions, visualScale, hexPalette, {
        animate,
        displayMode,
        semanticLabel,
        showNames: viewport.showNames,
        showValues: viewport.showValues,
      }),
    [
      animate,
      displayMode,
      hexPalette,
      positions,
      semanticLabel,
      viewport.showNames,
      viewport.showValues,
      visualScale,
    ],
  );

  return (
    <Card className="@container flex h-full min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 gap-3 @xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] grid-cols-[minmax(0,1fr)_auto] items-start">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <Hexagon className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText
                fallback={
                  historicalContextLabel
                    ? "Mapa operacional no fechamento"
                    : "Simulador operacional hexagonal"
                }
              />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {historicalContextLabel
                ? `${historicalContextLabel}. Estado certificado no fechamento do intervalo.`
                : displayMode === "actual"
                  ? "Valor real: o hexágono interno cresce com a ocupação e percorre uma escala contínua de cor."
                  : "Estado operacional informado pela leitura atual, com o mesmo peso visual para cada posição."}
            </CardDescription>
          </div>
          <div className="col-span-full min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2 @xl:justify-end">
              <Badge variant="outline">
                {stateCounts.occupied} ocupados
              </Badge>
              <Badge variant="outline">
                {stateCounts.unoccupied} desocupados
              </Badge>
              <Badge variant="secondary">
                {positions.length} posições · {occupancyHexDensityLabel(viewport.density)}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent
        className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-y-2 overflow-hidden"
        data-echart-layout="natural"
      >
        {loading ? (
          <ChartSkeleton />
        ) : positions.length ? (
          <>
            <div
              className="h-full min-h-0 min-w-0 max-w-full overflow-hidden rounded-lg border"
              style={{ backgroundColor: hexPalette.canvas }}
            >
              <EChart
                ariaLabel="Simulador operacional hexagonal"
                option={option}
                mergeUpdates
                themeMode="explicit"
                className={cn("h-full", singleRenderedRow && "mx-auto")}
              />
            </div>
            <ul
              className="sr-only"
              aria-label="Valores do simulador operacional"
            >
              {positions.map((position) => (
                <li key={position.cellId}>
                  {position.name}: {occupancyStateLabel(position.state)}
                  {position.total === null
                    ? ""
                    : `, ocupação ${formatNumber(position.total)}`}
                  {position.capacity === null
                    ? ", capacidade não configurada"
                    : `, capacidade ${formatNumber(position.capacity)}`}
                </li>
              ))}
            </ul>
            <div className="flex min-w-0 flex-wrap gap-3 text-[11px] text-muted-foreground">
              <LegendDot
                color={hexPalette.surfaces.unknown.fill}
                label="Sem dados"
              />
              <LegendDot
                color={hexPalette.surfaces.unavailable.fill}
                label="Indisponível"
              />
              <LegendDot
                color={hexPalette.surfaces.unlinked.fill}
                label="Sem vínculo"
                outlined
              />
              <span>
                {displayMode === "actual"
                  ? "Estados operacionais fora da escala gradual."
                  : `Cores operacionais: ${semanticLabel}.`}
              </span>
            </div>
            <HexVisualScaleLegend
              displayMode={displayMode}
              domainMaximum={visualScale.domainMaximum}
              palette={hexPalette}
            />
          </>
        ) : (
          <EmptyComparisonState text="Selecione cenários para montar o simulador." />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyDayHourHeatmapCard({
  timeZone,
  buckets,
  colorPalette,
  dayCount,
  historicalContextLabel,
  loading,
  maximum,
  metric,
  scenarioId,
  series,
}: {
  buckets: Date[];
  colorPalette: readonly string[];
  dayCount: 7 | 14 | 30;
  historicalContextLabel?: string;
  timeZone: string;
  loading: boolean;
  maximum: number;
  metric: OccupancyComparisonMetricKey;
  scenarioId: string;
  series: OccupancyScenarioHourlySeries[];
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const selectedSeries = series.find((item) => item.scenarioId === scenarioId);
  const matrix = React.useMemo(
    () =>
      selectedSeries
        ? buildDaysHoursOccupancyCells({
            timeZone,
            buckets,
            metric,
            scenario: selectedSeries,
          })
        : { cells: [], dayKeys: [] },
    [buckets, metric, selectedSeries, timeZone],
  );
  const dayLabels = React.useMemo(
    () => matrix.dayKeys.map(formatHeatmapDateKey),
    [matrix.dayKeys],
  );
  const option = React.useMemo(
    () =>
      buildHeatmapOption({
        cells: matrix.cells,
        maximum,
        metric,
        theme: effectiveTheme,
        widgetColor,
        xLabels: OCCUPANCY_FIXED_HOUR_LABELS,
        yLabels: dayLabels,
      }),
    [dayLabels, effectiveTheme, matrix.cells, maximum, metric, widgetColor],
  );

  return (
    <OccupancyHeatmapCardShell
      description={
        historicalContextLabel
          ? `${historicalContextLabel}. Horários disponíveis dentro do período aplicado; zero permanece visível e ausência fica cinza.`
          : `Últimos ${dayCount} dias do cenário escolhido; o valor zero permanece visível e a ausência fica cinza.`
      }
      fallbackColor={colorPalette[0]}
      icon={<Grid3X3 className="h-4 w-4 shrink-0 text-primary" />}
      loading={loading}
      metric={metric}
      notice={joinMessages(selectedSeries?.error, selectedSeries?.warning)}
      title="Ocupação por dias x horários"

    >
      {matrix.cells.length ? (
        <EChart
          ariaDescription={`Mapa de ${metricLabel(metric)} com horários de 00h a 23h no eixo horizontal e os últimos ${dayCount} dias nas linhas para o cenário selecionado.`}
          ariaLabel="Ocupação por dias e horários"
          option={option}
          themeMode="explicit"
          className="h-full min-h-0 w-full"
        />
      ) : (
        <EmptyComparisonState text="O cenário selecionado não possui série horária disponível." />
      )}
    </OccupancyHeatmapCardShell>
  );
}

function OccupancyScenarioHourHeatmapCard({
  timeZone,
  buckets,
  colorPalette,
  dateKey,
  dayCount,
  granularity,
  historicalContextLabel,
  loading,
  metric,
  series,
}: {
  buckets: Date[];
  colorPalette: readonly string[];
  dateKey: string;
  dayCount: 7 | 14 | 30;
  granularity: OccupancyScenarioHeatmapGranularity;
  historicalContextLabel?: string;
  loading: boolean;
  timeZone: string;
  metric: OccupancyComparisonMetricKey;
  series: OccupancyScenarioHourlySeries[];
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const matrix = React.useMemo(
    () =>
      buildOccupancyScenarioPeriodHeatmap({
        timeZone,
        buckets,
        dateKey: granularity === "hour" ? dateKey || undefined : undefined,
        granularity,
        metric,
        series,
      }),
    [buckets, dateKey, granularity, metric, series, timeZone],
  );
  const option = React.useMemo(
    () =>
      buildHeatmapOption({
        cells: matrix.cells,
        granularity,
        maximum: heatmapCellsMaximum(matrix.cells),
        metric,
        theme: effectiveTheme,
        widgetColor,
        xLabels: matrix.labels,
        yLabels: matrix.scenarioNames,
      }),
    [
      effectiveTheme,
      matrix.cells,
      matrix.labels,
      matrix.scenarioNames,
      granularity,
      metric,
      widgetColor,
    ],
  );
  const granularityLabel = occupancyScenarioHeatmapGranularityLabel(granularity);
  const periodDescription = occupancyScenarioHeatmapPeriodDescription(
    granularity,
    dayCount,
    dateKey,
  );
  const sourceNotice = React.useMemo(
    () =>
      joinMessages(
        ...series.flatMap((scenario) => [scenario.error, scenario.warning]),
      ),
    [series],
  );

  return (
    <OccupancyHeatmapCardShell
      description={`Período: ${
        historicalContextLabel ?? periodDescription
      }. Os cenários não são somados e as lacunas não são preenchidas com zero.`}
      fallbackColor={colorPalette[0]}
      granularity={granularity}
      icon={<Grid3X3 className="h-4 w-4 shrink-0 text-primary" />}
      loading={loading}
      metric={metric}
      notice={sourceNotice}
      title={`Ocupação por cenários x ${granularityLabel}`}

    >
      {matrix.cells.length ? (
        <EChart
          ariaDescription={`Mapa de ocupação com ${metricLabel(metric, granularity)}; ${granularityLabel} no eixo horizontal e um cenário por linha.`}
          ariaLabel={`Ocupação por cenários e ${granularityLabel}`}
          option={option}
          themeMode="explicit"
          className="h-full min-h-0 w-full"
        />
      ) : (
        <EmptyComparisonState text="Nenhum período está disponível para os cenários selecionados." />
      )}
    </OccupancyHeatmapCardShell>
  );
}

function OccupancyHeatmapCardShell({
  children,
  description,
  fallbackColor,
  granularity = "hour",
  icon,
  loading,
  metric,
  notice,
  title,
}: {
  children: React.ReactNode;
  description: string;
  fallbackColor: string;
  granularity?: OccupancyScenarioHeatmapGranularity;
  icon: React.ReactNode;
  loading: boolean;
  metric: OccupancyComparisonMetricKey;
  notice?: string;
  title: string;
}) {
  const visibleNotice = occupancyAggregatePresentationWarning(notice);
  const widgetColor = useWidgetColor(fallbackColor);
  const { effectiveTheme } = useTheme();
  const heatmapColors = React.useMemo(
    () => occupancyHeatmapPalette(widgetColor, effectiveTheme),
    [effectiveTheme, widgetColor],
  );
  const missingColor = occupancyHeatmapStateColors(effectiveTheme).noData;
  return (
    <Card
      aria-busy={loading}
      className="@container flex h-full min-w-0 flex-col overflow-hidden"
    >
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 @xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              {icon}
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {description}
            </CardDescription>
            {visibleNotice ? (
              <div
                className="mt-1.5 flex min-w-0 items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"
                role="status"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">
                  {visibleNotice}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          {loading ? (
            <Skeleton
              aria-label="Carregando mapa de calor de ocupação"
              className="h-full min-h-0 w-full flex-1"
              role="status"
            />
          ) : children}
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-12 rounded-full ring-1 ring-border"
              style={{
                backgroundImage: `linear-gradient(90deg, ${heatmapColors.join(", ")})`,
              }}
            />
            {metricLabel(metric, granularity)}
          </span>
          <LegendDot color={missingColor} label="Sem dados" />
          <span>
            {granularity === "minute"
              ? "Arraste horizontalmente para percorrer os 60 minutos."
              : "Escala dos cenários selecionados."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}


function MetricSelect({
  granularity = "hour",
  onChange,
  value,
}: {
  granularity?: OccupancyScenarioHeatmapGranularity;
  onChange: (metric: OccupancyComparisonMetricKey) => void;
  value: OccupancyComparisonMetricKey;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as OccupancyComparisonMetricKey)}
    >
      <SelectTrigger
        aria-label="Métrica dos mapas de calor de ocupação"
        className="h-9 w-full min-w-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="average">{metricLabel("average", granularity)}</SelectItem>
        <SelectItem value="peak">{metricLabel("peak", granularity)}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function LegendDot({
  className,
  color,
  label,
  outlined = false,
  patterned = false,
}: {
  className?: string;
  color?: string;
  label: string;
  outlined?: boolean;
  patterned?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-2.5 rounded-sm ring-1 ring-black/10 dark:ring-white/20",
          outlined && "border border-dashed border-foreground/50",
          className,
        )}
        style={{
          backgroundColor: color,
          backgroundImage: patterned
            ? "repeating-linear-gradient(135deg, transparent 0 2px, rgba(255,255,255,.5) 2px 3px)"
            : undefined,
        }}
      />
      {label}
    </span>
  );
}

function occupancyHexDensityLabel(density: OccupancyHexDensity) {
  if (density === "dense") return "alta densidade";
  if (density === "compact") return "compacto";
  return "detalhado";
}

function HexVisualScaleLegend({
  displayMode,
  domainMaximum,
  palette,
}: {
  displayMode: OccupancyWidgetSettings["hexDisplayMode"];
  domainMaximum: number;
  palette: OccupancyHexPalette;
}) {
  if (displayMode === "status") {
    return (
      <div className="mt-2 grid gap-2 rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground @sm:grid-cols-2">
        <div className="flex min-w-0 items-start gap-2">
          <LegendDot color={palette.occupied} label="Ocupado" />
          <span className="break-words [overflow-wrap:anywhere]">
            hexágono preenchido com peso visual uniforme
          </span>
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <LegendDot color={palette.zero} label="Desocupado" />
          <span className="break-words [overflow-wrap:anywhere]">
            estado livre visível e distinto
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={`Escala do simulador: ocupação de zero a ${formatChartNumber(
        domainMaximum,
      )}`}
      className="mt-2 grid gap-2 rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground @sm:grid-cols-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative block h-6 w-7 shrink-0">
          <span
            className="absolute inset-0"
            style={{
              backgroundColor: palette.surfaces.occupied.fill,
              clipPath:
                "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0 50%)",
            }}
          />
          <span
            className="absolute inset-[7px]"
            style={{
              backgroundColor: palette.valueColors[4],
              clipPath:
                "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0 50%)",
            }}
          />
        </span>
        <span className="break-words [overflow-wrap:anywhere]">
          <strong className="font-medium text-foreground">Tamanho:</strong>{" "}
          ocupação disponível, de 0 a {formatChartNumber(domainMaximum)}. O
          zero permanece visível.
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-24 shrink-0">
          <span
            className="block h-2 rounded-full"
            style={{
              backgroundImage: `linear-gradient(90deg, ${palette.valueColors.join(", ")})`,
            }}
          />
          <span className="mt-0.5 flex justify-between text-[9px]">
            <span>0</span>
            <span>{formatChartNumber(domainMaximum)}</span>
          </span>
        </span>
        <span className="break-words [overflow-wrap:anywhere]">
          <strong className="font-medium text-foreground">Cor:</strong> escala
          gradual do valor real, de 0 a {formatChartNumber(domainMaximum)}.
          Sobrecapacidade permanece indicada pelo contorno vermelho.
        </span>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-full min-h-0 w-full flex-1 self-stretch" />;
}

function EmptyComparisonState({ text }: { text: string }) {
  return (
    <div
      aria-live="polite"
      className="flex h-full min-h-0 min-w-0 flex-1 self-stretch items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 px-3 text-center text-xs text-muted-foreground @sm:px-4 @sm:text-sm"
      role="status"
    >
      <span className="line-clamp-4 break-words [overflow-wrap:anywhere]">
        {text}
      </span>
    </div>
  );
}

function buildHalfDonutOption(
  entries: OccupancyHalfDonutEntry[],
  mode: OccupancyHalfDonutMode,
  widgetColor: string,
  colorPalette: readonly string[],
  statusColors: OccupancyStatusColors,
  theme: "dark" | "light",
  scenarioIndexes: ReadonlyMap<string, number>,
): EnterpriseChartOption {
  const chartPalette = getOccupancyChartPalette(theme);
  const chartSurface = chartPalette.surface;
  const highestIndex = Math.max(0, ...scenarioIndexes.values());
  const indexWidth = Math.max(2, String(highestIndex).length);
  const totalOccupancy = entries.reduce((sum, entry) => sum + entry.total, 0);
  const compactLabels = entries.length > 8;
  const indexedEntries = entries.map((entry, index) => {
    const color = halfDonutEntryColor(
      entry,
      mode,
      widgetColor,
      colorPalette,
      statusColors,
      theme,
    );
    return {
      ...entry,
      color,
      indexLabel: String(
        scenarioIndexes.get(entry.scenarioId) ?? index + 1,
      ).padStart(indexWidth, "0"),
      labelStyleKey: `scenarioIndex${index}`,
      percentage:
        mode === "actual" && totalOccupancy > 0
          ? (entry.total / totalOccupancy) * 100
          : 0,
    };
  });
  const accessibleEntries = indexedEntries
    .map((entry) =>
      mode === "status"
        ? `${entry.indexLabel} ${entry.name}: ${
            entry.state === "occupied" ? "ocupado" : "desocupado"
          }`
        : `${entry.indexLabel} ${entry.name}: ocupação ${formatOccupancyCount(
            entry.total,
          )}, participação ${formatChartNumber(entry.percentage)} por cento`,
    )
    .join("; ");
  const richLabelStyles = Object.fromEntries([
    [
      "metric",
      {
        color: theme === "dark" ? "#CBD5E1" : "#334155",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 16,
      },
    ],
    ...indexedEntries.map((entry) => [
      entry.labelStyleKey,
      {
        backgroundColor: entry.color,
        borderColor:
          mode === "status" && entry.state === "unoccupied"
            ? readableTextColor(entry.color)
            : "transparent",
        borderRadius: 8,
        borderType: "dashed",
        borderWidth:
          mode === "status" && entry.state === "unoccupied" ? 1 : 0,
        color: readableTextColor(entry.color),
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 16,
        padding: [2, 5],
      },
    ]),
    [
      "name",
      {
        color: theme === "dark" ? "#E2E8F0" : "#1E293B",
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 16,
      },
    ],
  ]);

  return {
    animationDuration: 420,
    animationDurationUpdate: 520,
    aria: {
      enabled: true,
      label: {
        description:
          mode === "status"
            ? `Comparação atual por cenário em modo ocupado ou desocupado. Cada fatia tem o mesmo peso visual. ${accessibleEntries}.`
            : `Comparação atual por cenário em modo de ocupação real. A área de cada fatia é proporcional ao valor disponível. ${accessibleEntries}.`,
      },
    },
    series: [
      {
        avoidLabelOverlap: true,
        center: ["50%", "68%"],
        clockwise: true,
        data: indexedEntries.map((entry) => ({
          itemStyle: {
            borderColor: chartSurface,
            borderWidth: 2,
            color: colorWithAlpha(entry.color, 1),
            decal:
              mode === "status" && entry.state === "unoccupied"
                ? {
                    color: colorWithAlpha(
                      readableTextColor(statusColors.unoccupied),
                      0.22,
                    ),
                    dashArrayX: [1, 0],
                    dashArrayY: [3, 4],
                    rotation: -Math.PI / 4,
                    symbol: "rect",
                    symbolSize: 1,
                  }
                : undefined,
          },
          indexLabel: entry.indexLabel,
          labelLine: {
            lineStyle: {
              color: entry.color,
              opacity: 0.95,
              width: 1.5,
            },
          },
          labelStyleKey: entry.labelStyleKey,
          name: entry.name,
          occupancy: entry.total,
          percentage: entry.percentage,
          scenarioId: entry.scenarioId,
          state: entry.state,
          value: entry.chartValue,
        })),
        emphasis: {
          label: { fontWeight: 600, show: true },
          scale: true,
          scaleSize: 8,
        },
        endAngle: 360,
        label: {
          alignTo: "labelLine",
          bleedMargin: 6,
          color: theme === "dark" ? "#CBD5E1" : "#334155",
          distanceToLabelLine: 5,
          fontSize: 10,
          formatter: (params: {
            data?: {
              indexLabel?: string;
              labelStyleKey?: string;
              name?: string;
              occupancy?: number;
              percentage?: number;
              state?: "occupied" | "unoccupied";
            };
          }) => {
            const indexLabel = params.data?.indexLabel ?? "--";
            const labelStyleKey = params.data?.labelStyleKey ?? "metric";
            const indexedName = `{${labelStyleKey}|${indexLabel}} {name|${escapeEChartRichText(
              truncateLabel(
                params.data?.name ?? "Cenário",
                compactLabels ? 10 : 18,
              ),
            )}}`;
            if (mode === "status") {
              return `${indexedName}\n{metric|${
                params.data?.state === "occupied" ? "Ocupado" : "Desocupado"
              }}`;
            }
            return `${indexedName}\n{metric|${formatChartNumber(
              params.data?.percentage ?? 0,
            )}%}`;
          },
          lineHeight: 16,
          overflow: "truncate",
          position: "outside",
          rich: richLabelStyles,
          show: true,
          width: compactLabels ? 104 : 154,
        },
        labelLayout: {
          hideOverlap: compactLabels,
          moveOverlap: "shiftY",
        },
        labelLine: {
          length: 12,
          length2: 6,
          show: true,
          smooth: 0.12,
        },
        minAngle: occupancyHalfDonutMinimumAngle(mode),
        name: "Cenários",
        radius: ["48%", "88%"],
        startAngle: 180,
        stillShowZeroSum: false,
        type: "pie",
      },
    ],
    tooltip: {
      backgroundColor: chartPalette.tooltipBackground,
      borderColor: chartPalette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        const data =
          params && typeof params === "object"
            ? (params as {
                data?: {
                  indexLabel?: string;
                  name?: string;
                  occupancy?: number;
                  percentage?: number;
                  state?: "occupied" | "unoccupied";
                };
              }).data
            : undefined;
        return [
          `<strong>${escapeTooltip(data?.indexLabel ?? "--")} · ${escapeTooltip(
            data?.name ?? "Cenário",
          )}</strong>`,
          mode === "status"
            ? `Estado: ${data?.state === "occupied" ? "Ocupado" : "Desocupado"}`
            : "Visualização proporcional ao valor real",
          mode === "status"
            ? "Estado fornecido pela leitura atual"
            : `Ocupação atual: ${formatOccupancyCount(data?.occupancy ?? 0)}`,
          mode === "actual"
            ? `Participação: ${formatChartNumber(data?.percentage ?? 0)}%`
            : null,
          mode === "status"
            ? "Fatia com peso unitário para comparação do estado operacional"
            : "Cenários com valor zero permanecem visíveis e não geram área visual",
        ].filter(Boolean).join("<br />");
      },
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
  } as EnterpriseChartOption;
}

function buildCurrentComparisonBarOption(
  entries: OccupancyComparisonBarEntry[],
  mode: OccupancyHalfDonutMode,
  widgetColor: string,
  colorPalette: readonly string[],
  statusColors: OccupancyStatusColors,
  theme: "dark" | "light",
  scenarioIndexes: ReadonlyMap<string, number>,
  containerWidth: number,
  axisMaximum = growOccupancyComparisonAxisMaximum(
    1,
    entries.map((entry) => entry.total),
  ),
): EnterpriseChartOption {
  const chartPalette = getOccupancyChartPalette(theme);
  // Start conservatively before ResizeObserver reports the card width so the
  // first paint cannot collapse a genuinely narrow chart.
  const effectiveWidth = containerWidth > 0 ? containerWidth : 400;
  const narrowLayout = effectiveWidth < 440;
  const compactLayout = effectiveWidth < 640;
  const scenarioNameLimit = narrowLayout ? 9 : compactLayout ? 17 : 28;
  const rightCalloutSpace = narrowLayout ? 84 : compactLayout ? 112 : 144;
  const highestIndex = Math.max(0, ...scenarioIndexes.values());
  const indexWidth = Math.max(2, String(highestIndex).length);
  const totalOccupancy = entries.reduce(
    (sum, entry) => sum + (entry.total ?? 0),
    0,
  );
  const indexedEntries = entries.map((entry, index) => {
    const indexLabel = String(
      scenarioIndexes.get(entry.scenarioId) ?? index + 1,
    ).padStart(indexWidth, "0");
    const color = ensureGraphicContrast(
      entry.state === "unknown"
        ? chartPalette.axisText
        : mode === "actual"
          ? occupancyScenarioColor(entry.scenarioId, widgetColor, colorPalette)
          : entry.state === "occupied"
            ? statusColors.occupied
            : statusColors.unoccupied,
      chartPalette.surface,
    );
    return {
      ...entry,
      color,
      indexLabel,
      percentage:
        mode === "actual" && entry.total !== null && totalOccupancy > 0
          ? (entry.total / totalOccupancy) * 100
          : 0,
    };
  });
  const entryByScenarioId = new Map(
    indexedEntries.map((entry) => [entry.scenarioId, entry]),
  );
  const maximum =
    mode === "status"
      ? 1
      : growOccupancyComparisonAxisMaximum(
          axisMaximum,
          indexedEntries.map((entry) => entry.total),
        );
  const accessibleEntries = indexedEntries
    .map((entry) => {
      if (entry.state === "unknown" || entry.total === null) {
        return `${entry.indexLabel} ${entry.name}: sem dados`;
      }
      if (mode === "status") {
        return `${entry.indexLabel} ${entry.name}: ${
          entry.state === "occupied" ? "ocupado" : "desocupado"
        }`;
      }
      return `${entry.indexLabel} ${entry.name}: ocupação ${formatOccupancyCount(
        entry.total,
      )}, participação ${formatChartNumber(entry.percentage)} por cento`;
    })
    .join("; ");

  return {
    animationDuration: 360,
    animationDurationUpdate: 480,
    aria: {
      enabled: true,
      label: {
        description: `Comparação atual em barras, mantendo a ordem configurada dos cenários. ${accessibleEntries}.`,
      },
    },
    grid: {
      bottom: 24,
      containLabel: true,
      left: narrowLayout ? 8 : 12,
      right: rightCalloutSpace,
      top: 12,
    },
    series: [
      {
        barCategoryGap: "34%",
        barMaxWidth: 28,
        backgroundStyle: {
          borderRadius: [0, 6, 6, 0],
          color:
            theme === "dark"
              ? "rgba(148, 163, 184, 0.10)"
              : "rgba(15, 23, 42, 0.05)",
        },
        data: indexedEntries.map((entry) => ({
          id: entry.scenarioId,
          indexLabel: entry.indexLabel,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: entry.color,
            decal:
              mode === "status" && entry.state === "unoccupied"
                ? {
                    color: colorWithAlpha(readableTextColor(entry.color), 0.22),
                    dashArrayX: [1, 0],
                    dashArrayY: [3, 4],
                    rotation: -Math.PI / 4,
                    symbol: "rect",
                    symbolSize: 1,
                  }
                : undefined,
          },
          name: entry.scenarioId,
          percentage: entry.percentage,
          scenarioName: entry.name,
          state: entry.state,
          total: entry.total,
          value: entry.chartValue,
        })),
        id: "occupancy-current-comparison-bars",
        label: {
          color: chartPalette.legendText,
          distance: 8,
          fontSize: 10,
          fontWeight: 700,
          formatter: (params: {
            data?: {
              percentage?: number;
              state?: OccupancyComparisonBarEntry["state"];
              total?: number | null;
            };
          }) => {
            const data = params.data;
            if (
              !data ||
              data.state === "unknown" ||
              typeof data.total !== "number"
            ) {
              return "Sem dados";
            }
            if (mode === "status") {
              if (narrowLayout) {
                return data.state === "occupied" ? "Ocup." : "Desocup.";
              }
              return data.state === "occupied"
                ? compactLayout
                  ? "Ocupado"
                  : "Ocupado"
                : compactLayout
                  ? "Desocupado"
                  : "Desocupado";
            }
            return `${formatOccupancyCount(data.total)} · ${formatChartNumber(
              data.percentage ?? 0,
            )}%`;
          },
          position: "right",
          show: true,
          valueAnimation: true,
        },
        realtimeSort: false,
        showBackground: true,
        type: "bar",
      },
      {
        data: indexedEntries
          .filter((entry) => entry.chartValue === 0)
          .map((entry) => ({
            indexLabel: entry.indexLabel,
            itemStyle: {
              borderColor: entry.color,
              borderWidth: 1.5,
              color:
                entry.state === "unknown"
                  ? chartPalette.surface
                  : entry.color,
            },
            name: entry.scenarioId,
            percentage: entry.percentage,
            scenarioName: entry.name,
            state: entry.state,
            symbol: "circle",
            total: entry.total,
            value: [0, entry.scenarioId],
          })),
        silent: false,
        symbolSize: 9,
        type: "scatter",
        z: 4,
      },
    ],
    tooltip: {
      backgroundColor: chartPalette.tooltipBackground,
      borderColor: chartPalette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        const data =
          params && typeof params === "object"
            ? (params as {
                data?: {
                  indexLabel?: string;
                  percentage?: number;
                  scenarioName?: string;
                  state?: OccupancyComparisonBarEntry["state"];
                  total?: number | null;
                };
              }).data
            : undefined;
        if (!data) return "";
        return [
          `<strong>${escapeTooltip(data.indexLabel ?? "--")} · ${escapeTooltip(
            data.scenarioName ?? "Cenário",
          )}</strong>`,
          data.state === "unknown" || typeof data.total !== "number"
            ? "Sem dados"
            : `Ocupação atual: ${formatOccupancyCount(data.total)}`,
          data.state === "unknown"
            ? null
            : `Estado: ${
                data.state === "occupied" ? "Ocupado" : "Desocupado"
              }`,
          mode === "actual" && typeof data.total === "number"
            ? `Participação: ${formatChartNumber(data.percentage ?? 0)}%`
            : null,
          `Modo visual: ${
            mode === "actual" ? "valor real" : "ocupado / desocupado"
          }`,
        ]
          .filter(Boolean)
          .join("<br />");
      },
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: chartPalette.axisText,
        fontSize: 10,
        formatter: formatOccupancyIntegerAxisTick,
        show: mode === "actual",
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      max: mode === "status" ? 1 : maximum,
      minInterval: 1,
      min: 0,
      splitLine: {
        lineStyle: { color: chartPalette.gridLine, type: "dashed" },
        show: mode === "actual",
      },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: chartPalette.legendText,
        fontSize: 10,
        formatter: (scenarioId: string) => {
          const entry = entryByScenarioId.get(scenarioId);
          return entry
            ? `${entry.indexLabel}  ${truncateLabel(
                entry.name,
                scenarioNameLimit,
              )}`
            : scenarioId;
        },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: indexedEntries.map((entry) => entry.scenarioId),
      inverse: true,
      type: "category",
    },
  } as EnterpriseChartOption;
}

function buildCurrentComparisonVerticalBarOption(
  entries: OccupancyComparisonBarEntry[],
  mode: OccupancyHalfDonutMode,
  widgetColor: string,
  colorPalette: readonly string[],
  statusColors: OccupancyStatusColors,
  theme: "dark" | "light",
  scenarioIndexes: ReadonlyMap<string, number>,
  containerWidth: number,
  axisMaximum = growOccupancyComparisonAxisMaximum(
    1,
    entries.map((entry) => entry.total),
  ),
): EnterpriseChartOption {
  const chartPalette = getOccupancyChartPalette(theme);
  // Use the mobile layout until ResizeObserver supplies the real card width.
  const effectiveWidth = containerWidth > 0 ? containerWidth : 400;
  const narrowLayout = effectiveWidth < 440;
  const compactLayout = effectiveWidth < 640;
  const categoryNameLimit = narrowLayout ? 10 : compactLayout ? 14 : 20;
  const highestIndex = Math.max(0, ...scenarioIndexes.values());
  const indexWidth = Math.max(2, String(highestIndex).length);
  const totalOccupancy = entries.reduce(
    (sum, entry) => sum + (entry.total ?? 0),
    0,
  );
  const indexedEntries = entries.map((entry, index) => {
    const indexLabel = String(
      scenarioIndexes.get(entry.scenarioId) ?? index + 1,
    ).padStart(indexWidth, "0");
    const color = ensureGraphicContrast(
      entry.state === "unknown"
        ? chartPalette.axisText
        : mode === "actual"
          ? occupancyScenarioColor(entry.scenarioId, widgetColor, colorPalette)
          : entry.state === "occupied"
            ? statusColors.occupied
            : statusColors.unoccupied,
      chartPalette.surface,
    );
    return {
      ...entry,
      color,
      indexLabel,
      percentage:
        mode === "actual" && entry.total !== null && totalOccupancy > 0
          ? (entry.total / totalOccupancy) * 100
          : 0,
    };
  });
  const entryByScenarioId = new Map(
    indexedEntries.map((entry) => [entry.scenarioId, entry]),
  );
  const maximum =
    mode === "status"
      ? 1
      : growOccupancyComparisonAxisMaximum(
          axisMaximum,
          indexedEntries.map((entry) => entry.total),
        );
  const pixelsPerScenario = narrowLayout ? 68 : compactLayout ? 72 : 78;
  const maximumVisibleScenarios = Math.max(
    2,
    Math.floor(Math.max(160, effectiveWidth - 56) / pixelsPerScenario),
  );
  const visibleScenarioCount = Math.min(
    indexedEntries.length,
    maximumVisibleScenarios,
  );
  const usesDataZoom = indexedEntries.length > visibleScenarioCount;
  const accessibleEntries = indexedEntries
    .map((entry) => {
      if (entry.state === "unknown" || entry.total === null) {
        return `${entry.indexLabel} ${entry.name}: sem dados`;
      }
      if (mode === "status") {
        return `${entry.indexLabel} ${entry.name}: ${
          entry.state === "occupied" ? "ocupado" : "desocupado"
        }`;
      }
      return `${entry.indexLabel} ${entry.name}: ocupação ${formatOccupancyCount(
        entry.total,
      )}, participação ${formatChartNumber(entry.percentage)} por cento`;
    })
    .join("; ");

  return {
    animationDuration: 360,
    animationDurationUpdate: 480,
    aria: {
      enabled: true,
      label: {
        description: `Comparação atual em barras verticais, da esquerda para a direita e mantendo a ordem configurada dos cenários. ${accessibleEntries}.${
          usesDataZoom
            ? " O controle inferior permite navegar pelos demais cenários sem comprimir as barras."
            : ""
        }`,
      },
    },
    dataZoom: usesDataZoom
      ? [
          {
            endValue: visibleScenarioCount - 1,
            filterMode: "none",
            moveOnMouseMove: true,
            moveOnMouseWheel: "shift",
            preventDefaultMouseMove: false,
            startValue: 0,
            throttle: 50,
            type: "inside",
            xAxisIndex: 0,
            zoomOnMouseWheel: "ctrl",
          },
          {
            backgroundColor: colorWithAlpha(chartPalette.axisLine, 0.18),
            borderColor: chartPalette.axisLine,
            bottom: 6,
            brushSelect: false,
            endValue: visibleScenarioCount - 1,
            fillerColor: colorWithAlpha(widgetColor, theme === "dark" ? 0.26 : 0.16),
            filterMode: "none",
            handleSize: "80%",
            handleStyle: {
              borderColor: widgetColor,
              color: chartPalette.surface,
            },
            height: 16,
            showDataShadow: false,
            showDetail: false,
            startValue: 0,
            type: "slider",
            xAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom: usesDataZoom ? 64 : 18,
      containLabel: true,
      left: narrowLayout ? 8 : 12,
      right: narrowLayout ? 8 : 12,
      top: 48,
    },
    series: [
      {
        barCategoryGap: "38%",
        barMaxWidth: narrowLayout ? 34 : 42,
        backgroundStyle: {
          borderRadius: [6, 6, 0, 0],
          color:
            theme === "dark"
              ? "rgba(148, 163, 184, 0.10)"
              : "rgba(15, 23, 42, 0.05)",
        },
        data: indexedEntries.map((entry) => ({
          id: entry.scenarioId,
          indexLabel: entry.indexLabel,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: entry.color,
            decal:
              mode === "status" && entry.state === "unoccupied"
                ? {
                    color: colorWithAlpha(readableTextColor(entry.color), 0.22),
                    dashArrayX: [1, 0],
                    dashArrayY: [3, 4],
                    rotation: -Math.PI / 4,
                    symbol: "rect",
                    symbolSize: 1,
                  }
                : undefined,
          },
          name: entry.scenarioId,
          percentage: entry.percentage,
          scenarioName: entry.name,
          state: entry.state,
          total: entry.total,
          value: entry.chartValue,
        })),
        emphasis: { focus: "self" },
        id: "occupancy-current-comparison-vertical-bars",
        label: {
          color: chartPalette.legendText,
          distance: 7,
          fontSize: narrowLayout ? 9 : 10,
          fontWeight: 700,
          formatter: (params: {
            data?: {
              percentage?: number;
              state?: OccupancyComparisonBarEntry["state"];
              total?: number | null;
            };
          }) => {
            const data = params.data;
            if (
              !data ||
              data.state === "unknown" ||
              typeof data.total !== "number"
            ) {
              return narrowLayout ? "S/d" : "Sem dados";
            }
            if (mode === "status") {
              return data.state === "occupied"
                ? narrowLayout
                  ? "Ocup."
                  : "Ocupado"
                : narrowLayout
                  ? "Desoc."
                  : "Desocupado";
            }
            const total = formatOccupancyCount(data.total);
            const percentage = `${formatChartNumber(data.percentage ?? 0)}%`;
            return narrowLayout ? `${total}\n${percentage}` : `${total} · ${percentage}`;
          },
          lineHeight: 12,
          position: "top",
          show: true,
          valueAnimation: true,
        },
        realtimeSort: false,
        showBackground: true,
        type: "bar",
      },
      {
        data: indexedEntries
          .filter((entry) => entry.chartValue === 0)
          .map((entry) => ({
            indexLabel: entry.indexLabel,
            itemStyle: {
              borderColor: entry.color,
              borderWidth: 1.5,
              color:
                entry.state === "unknown"
                  ? chartPalette.surface
                  : entry.color,
            },
            name: entry.scenarioId,
            percentage: entry.percentage,
            scenarioName: entry.name,
            state: entry.state,
            symbol: "circle",
            total: entry.total,
            value: [entry.scenarioId, 0],
          })),
        id: "occupancy-current-comparison-vertical-zero-markers",
        silent: false,
        symbolSize: 9,
        type: "scatter",
        z: 4,
      },
    ],
    tooltip: {
      backgroundColor: chartPalette.tooltipBackground,
      borderColor: chartPalette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        const data =
          params && typeof params === "object"
            ? (params as {
                data?: {
                  indexLabel?: string;
                  percentage?: number;
                  scenarioName?: string;
                  state?: OccupancyComparisonBarEntry["state"];
                  total?: number | null;
                };
              }).data
            : undefined;
        if (!data) return "";
        return [
          `<strong>${escapeTooltip(data.indexLabel ?? "--")} · ${escapeTooltip(
            data.scenarioName ?? "Cenário",
          )}</strong>`,
          data.state === "unknown" || typeof data.total !== "number"
            ? "Sem dados"
            : `Ocupação atual: ${formatOccupancyCount(data.total)}`,
          data.state === "unknown"
            ? null
            : `Estado: ${
                data.state === "occupied" ? "Ocupado" : "Desocupado"
              }`,
          mode === "actual" && typeof data.total === "number"
            ? `Participação: ${formatChartNumber(data.percentage ?? 0)}%`
            : null,
          `Modo visual: ${
            mode === "actual" ? "valor real" : "ocupado / desocupado"
          }`,
        ]
          .filter(Boolean)
          .join("<br />");
      },
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: chartPalette.legendText,
        fontSize: narrowLayout ? 9 : 10,
        formatter: (scenarioId: string) => {
          const entry = entryByScenarioId.get(scenarioId);
          return entry
            ? `${entry.indexLabel}  ${truncateLabel(
                entry.name,
                categoryNameLimit,
              )}`
            : scenarioId;
        },
        interval: 0,
        margin: 10,
        rotate: indexedEntries.length > 3 ? (narrowLayout ? 42 : 32) : 0,
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      data: indexedEntries.map((entry) => entry.scenarioId),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: chartPalette.axisText,
        fontSize: 10,
        formatter: formatOccupancyIntegerAxisTick,
        show: mode === "actual",
      },
      axisLine: { show: false },
      axisTick: { show: false },
      max: mode === "status" ? 1 : maximum,
      minInterval: 1,
      min: 0,
      splitLine: {
        lineStyle: { color: chartPalette.gridLine, type: "dashed" },
        show: mode === "actual",
      },
      type: "value",
    },
  } as EnterpriseChartOption;
}

function halfDonutEntryColor(
  entry: OccupancyHalfDonutEntry,
  mode: OccupancyHalfDonutMode,
  widgetColor: string,
  colorPalette: readonly string[],
  statusColors: OccupancyStatusColors,
  theme: "dark" | "light",
) {
  const color =
    mode === "actual"
      ? occupancyScenarioColor(entry.scenarioId, widgetColor, colorPalette)
      : entry.state === "occupied"
        ? statusColors.occupied
        : statusColors.unoccupied;
  return ensureGraphicContrast(
    color,
    getOccupancyChartPalette(theme).surface,
  );
}

function buildLiveBarRaceOption(
  entries: OccupancyLiveRaceEntry[],
  widgetColor: string,
  colorPalette: readonly string[],
  topCount: number,
  theme: "dark" | "light",
): EnterpriseChartOption {
  const chartPalette = getOccupancyChartPalette(theme);
  const nameById = new Map(
    entries.map((entry) => [entry.scenarioId, entry.name]),
  );
  return {
    animationDuration: 0,
    animationDurationUpdate: 680,
    animationEasing: "linear",
    animationEasingUpdate: "linear",
    grid: { bottom: 8, containLabel: true, left: 8, right: 62, top: 8 },
    series: [
      {
        barMaxWidth: 28,
        data: entries.map((entry) => ({
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: themedScenarioColor(
              entry.scenarioId,
              widgetColor,
              colorPalette,
              theme,
            ),
          },
          name: entry.scenarioId,
          scenarioId: entry.scenarioId,
          value: entry.value,
        })),
        id: "occupancy-scenario-bar-race",
        backgroundStyle: {
          borderRadius: [0, 6, 6, 0],
          color:
            theme === "dark"
              ? "rgba(148, 163, 184, 0.08)"
              : "rgba(15, 23, 42, 0.035)",
        },
        label: {
          color: chartPalette.legendText,
          fontSize: 11,
          fontWeight: 700,
          formatter: (params: { value?: unknown }) => {
            const value = finiteChartValue(params.value);
            return value === null ? "—" : formatOccupancyCount(value);
          },
          position: "right",
          show: true,
          valueAnimation: true,
        },
        realtimeSort: true,
        showBackground: true,
        type: "bar",
      },
    ],
    tooltip: {
      backgroundColor: chartPalette.tooltipBackground,
      borderColor: chartPalette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        if (!params || typeof params !== "object") return "";
        const record = params as { name?: string; value?: unknown };
        const value = finiteChartValue(record.value);
        return `<strong>${escapeTooltip(
          nameById.get(record.name ?? "") ?? "Cenário",
        )}</strong><br />${
          value === null
            ? "Leitura atual indisponível"
            : `Ocupação atual: ${formatOccupancyCount(value)}`
        }`;
      },
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: chartPalette.axisText,
        fontSize: 10,
        formatter: formatOccupancyIntegerAxisTick,
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      max: "dataMax",
      min: 0,
      minInterval: 1,
      splitLine: {
        lineStyle: { color: chartPalette.gridLine, type: "dashed" },
      },
      type: "value",
    },
    yAxis: {
      animationDuration: 300,
      animationDurationUpdate: 300,
      axisLabel: {
        color: chartPalette.legendText,
        fontSize: 10,
        formatter: (scenarioId: string) =>
          truncateLabel(nameById.get(scenarioId) ?? "Cenário sem nome", 24),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: entries.map((entry) => entry.scenarioId),
      inverse: true,
      max: Math.max(0, topCount - 1),
      type: "category",
    },
  } as EnterpriseChartOption;
}

function buildMaximumLineSeries({
  timeZone,
  buckets,
  currentBucket,
  currentSnapshots,
  currentSeries,
  granularity,
  markLastBucketPartial = true,
  monthlySourceBuckets,
  scenarios,
  series,
}: {
  buckets: Date[];
  currentBucket: Date | null;
  currentSnapshots: OccupancyScenarioSnapshot[];
  currentSeries: OccupancyScenarioOpenMaximumSeries[];
  granularity: OccupancyMaximumLineGranularity;
  markLastBucketPartial?: boolean;
  monthlySourceBuckets: Date[];
  scenarios: OccupancyScenario[];
  series: OccupancyScenarioHourlySeries[];
  timeZone?: string;
}): OccupancyMaximumLineSeries[] {
  const currentSeriesById = new Map(
    currentSeries.map((scenario) => [scenario.scenarioId, scenario]),
  );
  const currentSnapshotsById = new Map(
    currentSnapshots.map((snapshot) => [snapshot.scenarioId, snapshot]),
  );
  const scenariosById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );

  return series.map((scenario) => {
    const currentScenario = currentSeriesById.get(scenario.scenarioId);
    const currentSnapshot = currentSnapshotsById.get(scenario.scenarioId);
    const aggregatePeak =
      currentBucket && currentScenario
        ? currentScenario.peaks.get(
            occupancyAggregateBucketKey(currentBucket, "hour"),
          )
        : undefined;
    const snapshotPeak =
      currentBucket && currentSnapshot
        ? occupancySnapshotTotalWithinHour(currentSnapshot, currentBucket, timeZone)
        : undefined;
    const observedCurrentPeaks = [aggregatePeak, snapshotPeak].filter(
      (value): value is number => value !== undefined,
    );
    const currentPeak = observedCurrentPeaks.length
      ? Math.max(...observedCurrentPeaks)
      : currentScenario
        ? currentScenario.error
          ? undefined
          : null
        : undefined;
    const annualPointsWithSourceState =
      granularity === "year"
        ? buildOccupancyAnnualMaximumPoints({
            timeZone,
            annualBuckets: buckets,
            coverageFrom: occupancyScenarioCoverageStart(
              scenariosById.get(scenario.scenarioId)?.created_at,
            ),
            liveBucket: currentBucket,
            livePeak: currentPeak,
            metrics: scenario.metrics,
            monthlyBuckets: monthlySourceBuckets,
          })
        : null;
    const annualPoints =
      annualPointsWithSourceState && !markLastBucketPartial
        ? annualPointsWithSourceState.map((point) => ({
            ...point,
            partial: false,
          }))
        : annualPointsWithSourceState;

    return {
      error: joinMessages(
        scenario.error,
        currentScenario?.error,
        currentSnapshot?.error,
      ),
      name: scenario.name,
      partialIndexes:
        granularity === "year"
          ? annualPoints?.flatMap((point, index) =>
              point.partial && point.value !== null ? [index] : [],
            )
          : granularity === "hour" &&
              currentBucket &&
              currentPeak !== undefined &&
              currentPeak !== null
            ? [timeZone ? companyTimeZoneHour(currentBucket, timeZone) : currentBucket.getHours()]
            : granularity === "month" &&
                markLastBucketPartial &&
                buckets.length
              ? [buckets.length - 1]
              : [],
      scenarioId: scenario.scenarioId,
      values:
        granularity === "year"
          ? (annualPoints?.map((point) => point.value) ?? [])
          : granularity === "hour"
            ? buildOccupancyFixedHourlyPeakValues({
                timeZone,
                buckets,
                metrics: scenario.metrics,
                openBucket: currentBucket,
                openPeak: currentPeak,
                openPeakMode:
                  currentScenario?.source === "hour" ? "replace" : "maximum",
              })
            : buildOccupancyPeakValues(
                buckets,
                scenario.metrics,
                granularity,
              ),
      warning: joinMessages(scenario.warning, currentScenario?.warning),
    };
  });
}

function buildScenarioMaximumLineOption({
  colorPalette,
  granularity,
  labels,
  series,
  theme,
  widgetColor,
}: {
  colorPalette: readonly string[];
  granularity: OccupancyMaximumLineGranularity;
  labels: string[];
  series: OccupancyMaximumLineSeries[];
  theme: "dark" | "light";
  widgetColor: string;
}): EnterpriseChartOption {
  const dense = labels.length > 18;
  const chartPalette = getOccupancyChartPalette(theme);
  const chartSurface = chartPalette.surface;
  const scenarioColors = buildThemedScenarioColorMap(
    series.map((item) => item.scenarioId),
    widgetColor,
    colorPalette,
    theme,
  );
  return {
    animationDuration: 360,
    animationDurationUpdate: 460,
    aria: {
      enabled: true,
      label: {
        description:
          granularity === "hour"
            ? "Máximos horários por cenário. Círculos vazados indicam a hora aberta, calculada com as observações disponíveis até agora."
            : granularity === "year"
              ? "Máximos anuais por cenário. Círculos vazados indicam o ano aberto e representam a melhor observação disponível, não um ano fechado."
              : "Máximos mensais por cenário. O último mês é parcial enquanto permanece aberto.",
      },
    },
    color: series.map((item) => scenarioColors.get(item.scenarioId)!),
    grid: { bottom: 8, containLabel: true, left: 8, right: 18, top: 54 },
    legend: {
      itemGap: 14,
      itemHeight: 7,
      itemWidth: 12,
      left: 0,
      pageIconColor: ensureGraphicContrast(widgetColor, chartSurface),
      pageTextStyle: { color: chartPalette.axisText, fontSize: 10 },
      textStyle: { color: chartPalette.legendText, fontSize: 11 },
      top: 0,
      type: "scroll",
    },
    series: series.map((item) => {
      const color = scenarioColors.get(item.scenarioId)!;
      const partialIndexes = new Set(item.partialIndexes ?? []);
      return {
        connectNulls: false,
        data: item.values.map((value, index) =>
          value === null || value === undefined
            ? null
            : partialIndexes.has(index)
              ? {
                  itemStyle: {
                    borderColor: color,
                    borderWidth: 2.5,
                    color: chartSurface,
                  },
                  symbol: "circle",
                  symbolSize: dense ? 9 : 11,
                  value,
                }
              : value,
        ),
        emphasis: { focus: "series" },
        id: `occupancy-maximum-${granularity}-${item.scenarioId}`,
        itemStyle: { color },
        label: { show: false },
        lineStyle: { color, opacity: 0.96, width: 2.4 },
        name: item.name,
        showAllSymbol: true,
        showSymbol: true,
        smooth: false,
        symbol: "circle",
        symbolSize: dense ? 4 : 6,
        type: "line",
      };
    }),
    tooltip: {
      axisPointer: { type: "line" },
      backgroundColor: chartPalette.tooltipBackground,
      borderColor: chartPalette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams : [rawParams];
        const dataIndex = params.find(
          (item): item is { dataIndex: number } =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as { dataIndex?: unknown }).dataIndex === "number",
        )?.dataIndex;
        if (dataIndex === undefined) return "";
        return [
          `<strong>${escapeTooltip(labels[dataIndex] ?? "Período")}</strong>`,
          ...series.map((item) => {
            const value = item.values[dataIndex];
            const color = scenarioColors.get(item.scenarioId)!;
            const partial = item.partialIndexes?.includes(dataIndex);
            return `<span style="display:inline-block;box-sizing:border-box;width:9px;height:9px;border-radius:50%;background:${
              partial ? chartSurface : color
            };border:2px solid ${color};margin-right:6px"></span>${escapeTooltip(
              item.name,
            )}: ${
              value === null || value === undefined
                ? "sem dados"
                : `${formatChartNumber(value)}${
                    partial ? " · em andamento" : ""
                  }`
            }`;
          }),
        ].join("<br />");
      },
      padding: [10, 12],
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: chartPalette.axisText,
        fontSize: 10,
        hideOverlap: true,
        interval: granularity === "hour" ? 1 : 0,
        showMaxLabel: true,
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      boundaryGap: false,
      data: labels,
      type: "category",
    },
    yAxis: {
      axisLabel: { color: chartPalette.axisText, fontSize: 10 },
      min: 0,
      minInterval: 1,
      splitLine: { lineStyle: { color: chartPalette.gridLine } },
      type: "value",
    },
  } as EnterpriseChartOption;
}

function maximumLineTitle(granularity: OccupancyMaximumLineGranularity) {
  if (granularity === "hour") return "Máximo por hora por cenário";
  if (granularity === "month") return "Máximo por mês por cenário";
  return "Máximo por ano por cenário";
}

function maximumLineDescription(
  granularity: OccupancyMaximumLineGranularity,
  historical = false,
) {
  if (granularity === "hour") {
    if (historical) {
      return "Maior ocupação registrada em cada hora do último dia do período, em eixo fixo de 00h a 24h; horários sem leitura permanecem vazios.";
    }
    return "Maior ocupação de cada hora de hoje em eixo fixo de 00h a 24h; a hora em andamento combina minutos encerrados e a leitura do Ao Vivo.";
  }
  if (granularity === "month") {
    return historical
      ? "Maior ocupação disponível em cada um dos 12 meses fechados até o fechamento selecionado."
      : "Maior ocupação disponível de cada mês nos últimos 12 meses.";
  }
  if (historical) {
    return "Maior pico observado em cada um dos 4 anos civis fechados até o fechamento selecionado; lacunas permanecem sem valor.";
  }
  return "Maior pico observado em cada um dos últimos 4 anos; anos fechados exigem cobertura completa e o ano atual aparece como parcial.";
}

function buildHexLayoutOption(
  positions: OccupancyHexPosition[],
  visualScale: OccupancyHexVisualScale,
  palette: OccupancyHexPalette,
  preferences: {
    animate: boolean;
    displayMode: OccupancyWidgetSettings["hexDisplayMode"];
    semanticLabel: string;
    showNames: boolean;
    showValues: boolean;
  },
): EnterpriseChartOption {
  const singleRenderedRow =
    positions.length > 0 &&
    new Set(positions.map((position) => position.row)).size === 1;
  const renderedX = positions.map((position) => position.x);
  const renderedY = positions.map((position) => position.y);
  const minX = Math.min(0, ...renderedX);
  const renderedMinX = renderedX.length ? Math.min(...renderedX) : 0;
  const renderedMaxX = renderedX.length ? Math.max(...renderedX) : 1;
  const renderedMinY = renderedY.length ? Math.min(...renderedY) : 0;
  const renderedMaxY = renderedY.length ? Math.max(...renderedY) : 1;
  const maxX = singleRenderedRow
    ? renderedMaxX
    : Math.max(1, ...positions.map((position) => position.x));
  const maxY = singleRenderedRow
    ? renderedMaxY
    : Math.max(1, ...positions.map((position) => position.y));
  const visualByCellId = new Map(
    visualScale.entries.map((entry) => [entry.cellId, entry]),
  );
  const renderItem = (
    params: { dataIndex: number },
    api: {
      coord: (value: [number, number]) => [number, number];
      size: (value: [number, number]) => [number, number];
    },
  ) => {
    const position = positions[params.dataIndex];
    if (!position) return null;
    const visual = visualByCellId.get(position.cellId);
    if (!visual) return null;
    const center = api.coord([position.x, position.y]);
    const unit = api.size([1, 1]);
    const outerRadius = Math.max(
      3,
      Math.min(68, Math.min(Math.abs(unit[0]), Math.abs(unit[1])) * 0.38),
    );
    const showName = preferences.showNames && outerRadius >= 14;
    const zeroNumericValue = preferences.displayMode === "actual" &&
      position.total === 0 &&
      (position.state === "occupied" || position.state === "unoccupied");
    const showValue = preferences.showValues && outerRadius >= 11 && !zeroNumericValue;
    const compactValue = outerRadius < 22;
    const outerVisual = palette.surfaces[position.state];
    const displayRadiusRatio = occupancyHexDisplayRadiusRatio(
      visual,
      preferences.displayMode,
    );
    const innerRadius =
      displayRadiusRatio === null ? null : outerRadius * displayRadiusRatio;
    const innerFill = occupancyHexValueColor(
      visual,
      palette,
      preferences.displayMode,
    );
    const children: Array<Record<string, unknown>> = [
      {
        name: "cell-boundary",
        shape: { points: hexagonPoints(center, outerRadius) },
        style: {
          fill: outerVisual.fill,
          lineDash: occupancyHexStateLineDash(position.state),
          lineWidth:
            position.state === "unavailable" || position.state === "unlinked"
              ? 1.35
              : 1,
          shadowBlur: preferences.animate ? 3 : 0,
          shadowColor: palette.outerShadow,
          shadowOffsetY: preferences.animate ? 2 : 0,
          stroke: outerVisual.border,
        },
        transition: preferences.animate ? ["shape", "style"] : undefined,
        type: "polygon",
      },
    ];

    if (innerRadius !== null && innerFill) {
      children.push({
        name: "occupancy-value",
        shape: { points: hexagonPoints(center, innerRadius) },
        style: {
          fill: innerFill,
          lineWidth: visual.overCapacity ? 1.25 : 0,
          shadowBlur: visual.overCapacity ? 7 : 0,
          shadowColor: visual.overCapacity
            ? palette.outerShadow
            : "transparent",
          stroke: visual.overCapacity
            ? palette.overCapacityBorder
            : "transparent",
        },
        transition: preferences.animate ? ["shape", "style"] : undefined,
        type: "polygon",
      });
    }

    const textStyle = {
      align: "center",
      fill: occupancyHexTextColor(visual, palette),
      lineWidth: 3,
      stroke: palette.labelHalo,
      verticalAlign: "middle",
      x: center[0],
    };
    if (showName) {
      children.push({
        name: "cell-name",
        style: {
          ...textStyle,
          font: `${outerRadius < 20 ? "600 9px" : "600 11px"} sans-serif`,
          text: truncateLabel(position.name, 18),
          y: showValue ? center[1] - 9 : center[1],
        },
        transition: preferences.animate ? ["style"] : undefined,
        type: "text",
      });
    }
    if (showValue) {
      children.push({
        name: "cell-value",
        style: {
          ...textStyle,
          font: `${outerRadius < 20 ? "700 9px" : "700 12px"} sans-serif`,
          text: hexPositionValueLabel(
            position,
            compactValue,
            preferences.displayMode,
          ),
          y: showName ? center[1] + 10 : center[1],
        },
        transition: preferences.animate ? ["style"] : undefined,
        type: "text",
      });
    }

    return {
      children,
      id: position.cellId,
      transition: preferences.animate ? ["x", "y"] : undefined,
      type: "group",
    };
  };

  return {
    animation: preferences.animate,
    animationDuration: preferences.animate ? 450 : 0,
    animationDurationUpdate: preferences.animate ? 650 : 0,
    animationEasingUpdate: "cubicOut",
    aria: {
      enabled: true,
      label: {
        description:
          preferences.displayMode === "actual"
            ? `Mapa operacional com ${positions.length} posições em escala gradual de valor real.`
            : `Mapa operacional com ${positions.length} posições. Cores no contexto ${preferences.semanticLabel}; o estado vem da leitura atual certificada.`,
      },
    },
    grid: { bottom: 12, left: 12, right: 12, top: 12 },
    series: [
      {
        animationDurationUpdate: preferences.animate ? 650 : 0,
        coordinateSystem: "cartesian2d",
        data: positions.map((position) => ({
          id: position.cellId,
          value: [position.x, position.y, position.total ?? -1],
        })),
        dimensions: ["x", "y", "occupancy"],
        encode: { x: 0, y: 1 },
        id: "occupancy-hex-layout",
        progressive: positions.length > 120 ? 400 : 0,
        progressiveThreshold: 120,
        renderItem,
        silent: false,
        type: "custom",
        universalTransition: preferences.animate,
      },
    ],
    tooltip: {
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        const index =
          params && typeof params === "object"
            ? Number((params as { dataIndex?: unknown }).dataIndex)
            : -1;
        const position = positions[index];
        if (!position) return "";
        const visual = visualByCellId.get(position.cellId);
        if (!visual) return "";
        const utilization =
          visual.colorRatio === null
            ? null
            : `${formatChartNumber(visual.colorRatio * 100)}%`;
        const scaleExplanation =
          preferences.displayMode !== "actual" || position.total === null
            ? null
            : `Escala visual: ${formatChartNumber(position.total)} de ${formatChartNumber(
                visualScale.domainMaximum,
              )}`;
        return [
          `<strong>${escapeTooltip(position.name)}</strong>`,
          `Posição: linha ${position.row + 1} · coluna ${position.column + 1}`,
          `Estado: ${occupancyStateLabel(position.state)}`,
          position.state === "unlinked"
            ? "Célula reservada sem cenário vinculado"
            : position.state === "unavailable"
              ? "O cenário salvo no layout não está disponível"
              : position.total === null
                ? "Ocupação: sem dados"
                : `Ocupação disponível: ${formatChartNumber(position.total)}`,
          ...(scaleExplanation ? [scaleExplanation] : []),
          ...(position.state === "unlinked" ||
          position.state === "unavailable" ||
          position.capacity === null
            ? []
            : [
                `Capacidade de referência: ${formatChartNumber(position.capacity)}`,
              ]),
          ...(position.state !== "unlinked" &&
          position.state !== "unavailable" &&
          position.capacity === null &&
          position.total !== null &&
          preferences.displayMode === "actual"
            ? [
                "Capacidade de referência: não configurada",
                "Cor: intensidade relativa ao valor",
              ]
            : []),
          ...(utilization ? [`Utilização da capacidade: ${utilization}`] : []),
          preferences.displayMode === "actual"
            ? `Escala gradual: 0 a ${formatChartNumber(visualScale.domainMaximum)}`
            : `Cores operacionais: ${escapeTooltip(preferences.semanticLabel)}`,
          `Modo visual: ${
            preferences.displayMode === "actual"
              ? "valor real em escala gradual"
              : "ocupado / desocupado"
          }`,
          ...(visual.overCapacity &&
          position.capacity !== null &&
          position.total !== null
            ? [
                `<strong style="color:${palette.overCapacity}">Sobrecapacidade: +${formatChartNumber(
                  position.total - position.capacity,
                )}</strong>`,
              ]
            : []),
        ].join("<br />");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      max: maxX + 0.8,
      min: (singleRenderedRow ? renderedMinX : minX) - 0.8,
      show: false,
      type: "value",
    },
    yAxis: {
      inverse: true,
      max: maxY + 0.8,
      min: (singleRenderedRow ? renderedMinY : 0) - 0.8,
      show: false,
      type: "value",
    },
  } as EnterpriseChartOption;
}

function hexagonPoints(
  center: [number, number],
  radius: number,
): [number, number][] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((index * 60 + 30) * Math.PI) / 180;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ];
  });
}

function occupancyHexStateLineDash(positionState: OccupancyHexPosition["state"]) {
  if (positionState === "unlinked") return [5, 4];
  if (positionState === "unavailable") return [7, 3];
  if (positionState === "unknown") return [2, 3];
  return undefined;
}

function hexPositionValueLabel(
  position: OccupancyHexPosition,
  compact = false,
  displayMode: OccupancyWidgetSettings["hexDisplayMode"] = "actual",
) {
  if (position.state === "unlinked") return compact ? "—" : "SEM VÍNCULO";
  if (position.state === "unavailable") return compact ? "!" : "INDISPONÍVEL";
  if (position.state === "unknown") return compact ? "?" : "SEM DADOS";
  if (position.total === null) return "SEM DADOS";
  if (displayMode === "status") {
    if (position.state === "occupied") return compact ? "●" : "OCUPADO";
    return compact ? "○" : "DESOCUPADO";
  }
  return formatChartNumber(position.total);
}

function buildHeatmapOption({
  cells,
  granularity = "hour",
  interactive = true,
  maximum,
  metric,
  theme,
  widgetColor,
  xLabels,
  yLabels,
}: {
  cells: OccupancyHeatmapCell[];
  granularity?: OccupancyScenarioHeatmapGranularity;
  interactive?: boolean;
  maximum: number;
  metric: OccupancyComparisonMetricKey;
  theme: "dark" | "light";
  widgetColor: string;
  xLabels: string[];
  yLabels: string[];
}): EnterpriseChartOption {
  const chartPalette = getOccupancyChartPalette(theme);
  const stateColors = occupancyHeatmapStateColors(theme);
  const cellBorderColor = stateColors.outline;
  const activeCellBorderColor =
    theme === "dark"
      ? "rgba(248, 250, 252, 0.24)"
      : "rgba(15, 23, 42, 0.20)";
  const activeCellShadowColor =
    theme === "dark"
      ? "rgba(248, 250, 252, 0.12)"
      : "rgba(15, 23, 42, 0.14)";
  const missingColor = stateColors.noData;
  const scrollRows = interactive && yLabels.length > 14;
  const scrollColumns = interactive && xLabels.length > 36;
  const lastXIndex = Math.max(0, xLabels.length - 1);
  const regularLabelStep = Math.max(1, Math.ceil(xLabels.length / 12));
  const compactLabelStep = Math.max(1, Math.ceil(xLabels.length / 8));
  const dataZoom = [
    ...(scrollRows
      ? [{
          type: "slider" as const,
          yAxisIndex: 0,
          orient: "vertical" as const,
          filterMode: "filter" as const,
          startValue: 0,
          endValue: 13,
          right: 2,
          top: 12,
          bottom: 84,
          width: 10,
          showDetail: false,
          showDataShadow: false,
          brushSelect: false,
          borderColor: chartPalette.axisLine,
        }]
      : []),
    ...(scrollColumns
      ? [{
          type: "inside" as const,
          xAxisIndex: 0,
          filterMode: "filter" as const,
          startValue: Math.max(0, xLabels.length - 24),
          endValue: lastXIndex,
        }]
      : []),
  ];
  // The query/model coordinates remain (day or scenario, hour). Transpose at
  // the chart boundary so tables, bucket identity and missing values stay intact.
  const missing = cells
    .filter((cell) => cell.value === null)
    .map((cell) => [cell.y, cell.x, -1]);
  const certified = cells
    .filter((cell): cell is OccupancyHeatmapCell & { value: number } =>
      cell.value !== null,
    )
    .map((cell) => [cell.y, cell.x, cell.value]);
  return {
    animation: false,
    grid: { bottom: 60, containLabel: true, left: 8, right: scrollRows ? 28 : 12, top: 12 },
    ...(dataZoom.length ? { dataZoom } : {}),
    series: [
      {
        data: missing,
        emphasis: {
          itemStyle: {
            borderColor: activeCellBorderColor,
            borderWidth: 1,
            shadowBlur: 4,
            shadowColor: activeCellShadowColor,
          },
        },
        itemStyle: {
          borderColor: cellBorderColor,
          borderRadius: 2,
          borderWidth: 1,
          color: missingColor,
        },
        name: "Sem dados",
        silent: false,
        type: "heatmap",
      },
      {
        data: certified,
        emphasis: {
          itemStyle: {
            borderColor: activeCellBorderColor,
            borderWidth: 1,
            shadowBlur: 4,
            shadowColor: activeCellShadowColor,
          },
        },
        itemStyle: {
          borderColor: cellBorderColor,
          borderRadius: 2,
          borderWidth: 1,
        },
        name: metricLabel(metric, granularity),
        progressive: 1_000,
        type: "heatmap",
      },
    ],
    tooltip: {
      backgroundColor: chartPalette.tooltipBackground,
      borderColor: chartPalette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (rawParams: unknown) => {
        const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        if (!params || typeof params !== "object") return "";
        const record = params as { seriesName?: string; value?: unknown };
        const value = Array.isArray(record.value) ? record.value : [];
        const x = Number(value[0]);
        const y = Number(value[1]);
        const amount = Number(value[2]);
        return [
          `<strong>${escapeTooltip(yLabels[y] ?? "Categoria")} · ${escapeTooltip(
            xLabels[x] ?? "Período",
          )}</strong>`,
          record.seriesName === "Sem dados" || amount < 0
            ? "Sem dados"
            : `${metricLabel(metric, granularity)}: ${formatChartNumber(amount)}`,
        ].join("<br />");
      },
      padding: [10, 12],
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    visualMap: buildOccupancyHeatmapVisualMaps(widgetColor, maximum, theme),
    xAxis: {
      axisLabel: {
        color: chartPalette.axisText,
        fontSize: 9,
        hideOverlap: true,
        interval: (index: number) =>
          index % regularLabelStep === 0 || index === lastXIndex,
        showMinLabel: true,
        showMaxLabel: true,
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      data: xLabels,
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: chartPalette.axisText,
        fontSize: 9,
        overflow: "truncate",
        width: 148,
        formatter: (label: string) => truncateLabel(label, 28),
        interval: 0,
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      data: yLabels,
      inverse: true,
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
    media: [{
      query: { maxWidth: 760 },
      option: {
        xAxis: {
          axisLabel: {
            interval: (index: number) =>
              index % compactLabelStep === 0 || index === lastXIndex,
            hideOverlap: false,
          },
        },
      },
    }, {
      query: { maxWidth: 480 },
      option: {
        xAxis: { axisLabel: { fontSize: 8 } },
        yAxis: { axisLabel: { fontSize: 8, width: 78 } },
        visualMap: [{}, { itemHeight: 110, text: ["Maior", "Menor"], textStyle: { fontSize: 9 } }],
        ...(scrollRows ? { dataZoom: [{ endValue: 7 }] } : {}),
      },
    }],
  } as EnterpriseChartOption;
}

function sharedHeatmapMaximum(
  series: OccupancyScenarioHourlySeries[],
  metric: OccupancyComparisonMetricKey,
) {
  let maximum = 0;
  series.forEach((scenario) => {
    scenario.metrics.forEach((value) => {
      maximum = Math.max(
        maximum,
        metric === "peak" ? value.peak : value.average,
      );
    });
  });
  return Math.max(1, maximum);
}

function heatmapCellsMaximum(cells: readonly OccupancyHeatmapCell[]) {
  return Math.max(
    1,
    ...cells.flatMap((cell) =>
      cell.value === null || !Number.isFinite(cell.value) ? [] : [cell.value],
    ),
  );
}

function themedScenarioColor(
  scenarioId: string,
  widgetColor: string,
  colorPalette: readonly string[],
  theme: "dark" | "light",
) {
  return ensureGraphicContrast(
    occupancyScenarioColor(scenarioId, widgetColor, colorPalette),
    getOccupancyChartPalette(theme).surface,
    3,
  );
}

function buildThemedScenarioColorMap(
  scenarioIds: readonly string[],
  widgetColor: string,
  colorPalette: readonly string[],
  theme: "dark" | "light",
) {
  const surface = getOccupancyChartPalette(theme).surface;
  const stableColors = buildOccupancyScenarioColorMap(
    scenarioIds,
    widgetColor,
    colorPalette,
  );
  return new Map(
    Array.from(stableColors, ([scenarioId, color]) => [
      scenarioId,
      ensureGraphicContrast(color, surface, 3),
    ]),
  );
}

function occupancySnapshotEffectiveAt(
  snapshots: readonly OccupancyScenarioSnapshot[],
) {
  const instants = snapshots.flatMap((snapshot) => {
    if (!snapshot.asOf) return [];
    const instant = Date.parse(snapshot.asOf);
    return Number.isFinite(instant) ? [instant] : [];
  });
  return instants.length ? new Date(Math.min(...instants)) : null;
}

function occupancyAggregatePath(
  scenarioId: string,
  from: Date,
  to: Date,
  granularity: OccupancyScenarioHeatmapGranularity = "hour",
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(from, granularity),
    granularity,
    to: aggregateQueryIso(to, granularity),
  });
  return `/occupancy/scenarios/${encodeURIComponent(scenarioId)}/aggregate?${params.toString()}`;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function resolveHeatmapScenarioId(
  storedId: string,
  focusScenarioId: string,
  selectedIds: string[],
) {
  if (selectedIds.includes(storedId)) return storedId;
  if (selectedIds.includes(focusScenarioId)) return focusScenarioId;
  return selectedIds[0] ?? "";
}

function occupancyRequestError(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}

function joinMessages(...messages: Array<string | undefined>) {
  const unique = Array.from(
    new Set(messages.filter((message): message is string => Boolean(message))),
  );
  return unique.join(" ") || undefined;
}

function sameOccupancyRange(
  left: { from: Date; to: Date },
  right: { from: Date; to: Date },
) {
  return (
    left.from.getTime() === right.from.getTime() &&
    left.to.getTime() === right.to.getTime()
  );
}

function resolveSharedOccupancyHourlyAggregate(
  source: OccupancySharedHourlyAggregate | null | undefined,
  focusScenarioId: string,
  range: { buckets: Date[]; from: Date; to: Date },
  requestedScenarioIds: ReadonlySet<string>,
): {
  covered: boolean;
  series: OccupancyScenarioHourlySeries | null;
} {
  if (
    !requestedScenarioIds.has(focusScenarioId) ||
    !source ||
    !focusScenarioId ||
    source.from.getTime() > range.from.getTime() ||
    source.to.getTime() < range.to.getTime()
  ) {
    return { covered: false, series: null };
  }
  if (!source.series) return { covered: true, series: null };
  if (source.series.scenarioId !== focusScenarioId) {
    return { covered: false, series: null };
  }
  if (sameOccupancyRange(source, range)) {
    return { covered: true, series: source.series };
  }

  const requestedKeys = new Set(
    range.buckets.map((bucket) =>
      occupancyAggregateBucketKey(bucket, "hour"),
    ),
  );
  return {
    covered: true,
    series: {
      ...source.series,
      metrics: new Map(
        Array.from(source.series.metrics).filter(([key]) =>
          requestedKeys.has(key),
        ),
      ),
    },
  };
}

function mergeSharedOccupancyHourlySeries(
  current: AggregateDataset,
  sharedSeries: OccupancyScenarioHourlySeries,
  range: { from: Date; to: Date },
  scopeKey: string,
) {
  if (
    current.scopeKey !== scopeKey ||
    !current.from ||
    !current.to ||
    !sameOccupancyRange(
      { from: current.from, to: current.to },
      range,
    )
  ) {
    return current;
  }
  const index = current.series.findIndex(
    (candidate) => candidate.scenarioId === sharedSeries.scenarioId,
  );
  if (index < 0) {
    return { ...current, series: [...current.series, sharedSeries] };
  }
  if (current.series[index] === sharedSeries) return current;
  const series = [...current.series];
  series[index] = sharedSeries;
  return { ...current, series };
}

function sameMaximumTrendRanges(
  left: OccupancyMaximumTrendRanges,
  right: OccupancyMaximumTrendRanges,
) {
  return (
    sameOccupancyRange(left.monthly, right.monthly) &&
    sameOccupancyRange(left.annual, right.annual) &&
    sameOccupancyRange(left.monthlySource, right.monthlySource)
  );
}

function createEmptyOccupancyComparisonResourceFreshness(): OccupancyComparisonResourceFreshness {
  return {
    completedAt: 0,
    refreshVersion: -1,
    scopeKey: "",
    windowKey: "",
  };
}

function createEmptyOccupancyComparisonFreshness(): OccupancyComparisonFreshness {
  return {
    aggregate: createEmptyOccupancyComparisonResourceFreshness(),
    currentHourMaximum: createEmptyOccupancyComparisonResourceFreshness(),
    maximumTrend: createEmptyOccupancyComparisonResourceFreshness(),
    snapshots: createEmptyOccupancyComparisonResourceFreshness(),
  };
}

function occupancyComparisonFreshnessRemainingMs(
  freshness: OccupancyComparisonResourceFreshness,
  {
    now,
    refreshMs,
    refreshVersion,
    scopeKey,
    windowKey,
  }: {
    now: Date;
    refreshMs: number;
    refreshVersion: number;
    scopeKey: string;
    windowKey: string;
  },
) {
  if (
    freshness.scopeKey !== scopeKey ||
    freshness.windowKey !== windowKey ||
    freshness.refreshVersion !== refreshVersion
  ) {
    return 0;
  }

  return Math.max(
    0,
    freshness.completedAt + Math.max(250, Math.round(refreshMs)) - now.getTime(),
  );
}

function occupancyComparisonRangeKey(range: { from: Date; to: Date }) {
  return `${range.from.toISOString()}|${range.to.toISOString()}`;
}

function occupancyMaximumTrendRangeKey(ranges: OccupancyMaximumTrendRanges) {
  return [
    occupancyComparisonRangeKey(ranges.monthly),
    occupancyComparisonRangeKey(ranges.annual),
    occupancyComparisonRangeKey(ranges.monthlySource),
  ].join("|");
}

function completeOccupancyComparisonResource(
  refreshVersion: number,
  scopeKey: string,
  windowKey: string,
  completedAt = Date.now(),
): OccupancyComparisonResourceFreshness {
  return { completedAt, refreshVersion, scopeKey, windowKey };
}

function temporalRefreshDelay(refreshMs: number, boundary?: Date) {
  const safeRefreshMs = Math.max(250, Math.round(refreshMs));
  if (!boundary) return safeRefreshMs;
  const untilBoundary = boundary.getTime() - Date.now() + 50;
  return Math.max(0, Math.min(safeRefreshMs, untilBoundary));
}

function setIntersects(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function occupancyHistoricalSnapshotScenarioIds({
  byCard,
  hexScenarioIds,
  scenarios,
  visibleCardIds,
}: {
  byCard: ReadonlyMap<string, readonly string[]>;
  hexScenarioIds: readonly string[];
  scenarios: readonly OccupancyScenario[];
  visibleCardIds: ReadonlySet<string>;
}) {
  const requested = new Set<string>();
  for (const cardId of OCCUPANCY_HISTORICAL_SNAPSHOT_CARD_IDS) {
    if (!visibleCardIds.has(cardId)) continue;
    const scenarioIds =
      cardId === "occupancy_hex_layout"
        ? hexScenarioIds
        : (byCard.get(cardId) ?? EMPTY_OCCUPANCY_SCENARIO_IDS);
    scenarioIds.forEach((scenarioId) => requested.add(scenarioId));
  }
  return scenarios.flatMap((scenario) =>
    requested.has(scenario.id) ? [scenario.id] : [],
  );
}

function occupancyLatestCompanyDayBuckets(
  buckets: readonly Date[],
  currentBucket: Date | null,
  timeZone: string,
) {
  const anchorBucket = currentBucket ?? buckets.at(-1);
  if (!anchorBucket) return [];
  const latestDayKey = localDateKey(anchorBucket, timeZone);
  return buckets.filter(
    (bucket) => localDateKey(bucket, timeZone) === latestDayKey,
  );
}

function setBoundedComparisonCacheEntry<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
) {
  // Refresh insertion order so active tenant/scenario entries survive the
  // bounded module cache across route remounts and quick A -> B -> A changes.
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_SHARED_COMPARISON_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function trimOldestMapEntries<Value>(
  cache: Map<string, Value>,
  maximumEntries: number,
) {
  while (cache.size > maximumEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function filterOccupancySeriesToBucketKeys(
  series: OccupancyScenarioHourlySeries,
  bucketKeys: ReadonlySet<number>,
  name = series.name,
): OccupancyScenarioHourlySeries {
  return {
    ...series,
    metrics: new Map(
      Array.from(series.metrics).filter(([bucket]) => bucketKeys.has(bucket)),
    ),
    name,
  };
}

function preserveCurrentHourMetricsOnFailure(
  previous: OccupancyScenarioOpenMaximumSeries[],
  next: OccupancyScenarioOpenMaximumSeries[],
) {
  const previousById = new Map(
    previous.map((scenario) => [scenario.scenarioId, scenario]),
  );
  return next.map((scenario) => {
    if (!scenario.error || scenario.peaks.size) return scenario;
    const earlier = previousById.get(scenario.scenarioId);
    return earlier?.peaks.size
      ? { ...scenario, peaks: earlier.peaks }
      : scenario;
  });
}

function occupancyScenarioCoverageStart(value: string | undefined) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function metricLabel(
  metric: OccupancyComparisonMetricKey,
  granularity: OccupancyScenarioHeatmapGranularity = "hour",
) {
  if (granularity === "minute") {
    return metric === "peak" ? "Pico por minuto" : "Média por minuto";
  }
  if (granularity === "day") {
    return metric === "peak" ? "Pico diário" : "Média diária";
  }
  if (granularity === "week") {
    return metric === "peak" ? "Pico semanal" : "Média semanal";
  }
  if (granularity === "month") {
    return metric === "peak" ? "Pico mensal" : "Média mensal";
  }
  return metric === "peak" ? "Pico horário" : "Média horária";
}

function scenarioHeatmapCertificationLabel(
  value: number | null,
  series?: Pick<OccupancyScenarioHourlySeries, "error" | "warning">,
) {
  if (series?.error) {
    return value === null ? "Fonte indisponível" : "Último valor disponível";
  }
  if (occupancyAggregatePresentationWarning(series?.warning)) {
    return value === null ? "Sem dados · em atualização" : "Em atualização";
  }
  return value === null ? "Sem dados" : "Disponível";
}

function occupancyStateLabel(state: OccupancyHexPosition["state"]) {
  if (state === "unlinked") return "sem cenário vinculado";
  if (state === "unavailable") return "cenário indisponível";
  if (state === "occupied") return "ocupado";
  if (state === "unoccupied") return "desocupado";
  return "sem dados";
}

function formatHeatmapDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        weekday: "short",
      }).format(date);
}

function finiteChartValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatChartNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value);
}

function truncateLabel(value: string, maximum: number) {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}

function escapeEChartRichText(value: string) {
  return value.replace(/[{}|]/g, " ");
}

function escapeTooltip(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
