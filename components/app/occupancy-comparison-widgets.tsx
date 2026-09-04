"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  Grid3X3,
  Hexagon,
  LineChart,
  Palette,
  RotateCcw,
  Settings2,
  Trophy,
} from "lucide-react";

import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
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
import { apiFetch } from "@/lib/api";
import {
  aggregateQueryIso,
  endOfAggregateBucket,
} from "@/lib/aggregate-time";
import { requireRuntimeCompanyTimeZone } from "@/lib/company-time-zone";
import { getOccupancyColorPalette } from "@/lib/occupancy-color-palettes";
import {
  buildOccupancyHeatmapVisualMaps,
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
  requireOccupancyAggregateRows,
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
  buildScenariosHoursOccupancyCells,
  localDateKey,
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
  type OccupancyMaximumTrendRanges,
  type OccupancyScenarioHourlySeries,
  type OccupancyScenarioSnapshot,
} from "@/lib/occupancy-comparison";
import {
  buildOccupancyScenarioColorMap,
  occupancyScenarioColor,
} from "@/lib/occupancy-scenario-color";
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
import { requireOccupancyHistoryResponse } from "@/lib/occupancy-validation";
import type {
  WidgetBentoPreviewChartType,
  WidgetBentoPreviewKind,
} from "@/lib/widget-bento-preview-content";
import type {
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
} from "@/lib/types";
import type { ReportChart } from "@/lib/report-export";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { CardPreference } from "@/lib/view-preferences";

const DEFAULT_SNAPSHOT_REFRESH_MS = 5_000;
const DEFAULT_AGGREGATE_REFRESH_MS = 60_000;
const DEFAULT_MAXIMUM_TREND_REFRESH_MS = 60 * 60_000;
const MAX_PARALLEL_REQUESTS = 4;

export const OCCUPANCY_COMPARISON_CARD_IDS = [
  "occupancy_scenario_half_donut",
  "occupancy_scenario_bar_race",
  "occupancy_scenario_max_hour",
  "occupancy_scenario_max_month",
  "occupancy_scenario_max_year",
  "occupancy_hex_layout",
  "occupancy_day_hour_heatmap",
  "occupancy_scenario_hour_heatmap",
] as const;

const OCCUPANCY_SNAPSHOT_CARD_IDS = new Set([
  "occupancy_scenario_half_donut",
  "occupancy_scenario_bar_race",
  "occupancy_scenario_max_hour",
  "occupancy_scenario_max_year",
  "occupancy_hex_layout",
]);
const OCCUPANCY_HOURLY_AGGREGATE_CARD_IDS = new Set([
  "occupancy_scenario_max_hour",
  "occupancy_day_hour_heatmap",
  "occupancy_scenario_hour_heatmap",
]);
const OCCUPANCY_CURRENT_HOUR_MAXIMUM_CARD_IDS = new Set([
  "occupancy_scenario_max_hour",
  "occupancy_scenario_max_year",
]);
const OCCUPANCY_MAXIMUM_TREND_CARD_IDS = new Set([
  "occupancy_scenario_max_month",
  "occupancy_scenario_max_year",
]);
type ComparisonLayoutCard = {
  chartTypeEnabled?: boolean;
  colorEditable?: boolean;
  className?: string;
  defaultHeight?: "short" | "standard" | "tall";
  defaultHeightLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  defaultSize?: "compact" | "wide" | "large" | "full";
  id: string;
  label: string;
  node: React.ReactNode;
  previewChartType?: WidgetBentoPreviewChartType;
  previewColors?: readonly string[];
  previewKind?: WidgetBentoPreviewKind;
  previewOrientation?: "horizontal" | "vertical";
  titleEditable?: boolean;
  zoomEnabled?: boolean;
};

export type OccupancyComparisonReportAsset = {
  cardId: string;
  chart: ReportChart;
};

type SnapshotDataset = {
  loading: boolean;
  requestedAt: Date | null;
  scopeKey: string;
  snapshots: OccupancyScenarioSnapshot[];
};

type AggregateDataset = {
  buckets: Date[];
  from: Date | null;
  loading: boolean;
  scopeKey: string;
  series: OccupancyScenarioHourlySeries[];
  to: Date | null;
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

export function useOccupancyComparisonCards({
  aggregateRefreshMs = DEFAULT_AGGREGATE_REFRESH_MS,
  companyScopeId,
  focusScenarioId,
  focusHourlyAggregate,
  focusSnapshot,
  focusSnapshotPending = false,
  maximumTrendRefreshMs = DEFAULT_MAXIMUM_TREND_REFRESH_MS,
  monitorMode,
  preferenceScopeId,
  preferences,
  snapshotRefreshMs = DEFAULT_SNAPSHOT_REFRESH_MS,
  scenarios,
  timeZone,
  timeZoneWarning,
  userId,
}: {
  aggregateRefreshMs?: number;
  companyScopeId: string;
  focusScenarioId: string;
  focusHourlyAggregate?: OccupancySharedHourlyAggregate | null;
  focusSnapshot?: (OccupancyScenarioSnapshot & { requestedAt: Date }) | null;
  focusSnapshotPending?: boolean;
  maximumTrendRefreshMs?: number;
  monitorMode: boolean;
  preferenceScopeId?: string | null;
  preferences: ReadonlyArray<Pick<CardPreference, "id" | "visible">>;
  snapshotRefreshMs?: number;
  scenarios: OccupancyScenario[];
  timeZone: string;
  timeZoneWarning?: string;
  userId?: string | null;
}) {
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
  const visibleCardIdsKey = React.useMemo(
    () =>
      preferences
        .filter((preference) => preference.visible)
        .map((preference) => preference.id)
        .sort()
        .join(","),
    [preferences],
  );
  const visibleCardIds = React.useMemo(
    () => new Set(visibleCardIdsKey.split(",").filter(Boolean)),
    [visibleCardIdsKey],
  );
  const needsSnapshots = setIntersects(
    visibleCardIds,
    OCCUPANCY_SNAPSHOT_CARD_IDS,
  );
  const needsHourlyAggregate = setIntersects(
    visibleCardIds,
    OCCUPANCY_HOURLY_AGGREGATE_CARD_IDS,
  );
  const needsHourlyHeatmap =
    visibleCardIds.has("occupancy_day_hour_heatmap") ||
    visibleCardIds.has("occupancy_scenario_hour_heatmap");
  const needsCurrentHourMaximum = setIntersects(
    visibleCardIds,
    OCCUPANCY_CURRENT_HOUR_MAXIMUM_CARD_IDS,
  );
  const needsMaximumTrend = setIntersects(
    visibleCardIds,
    OCCUPANCY_MAXIMUM_TREND_CARD_IDS,
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
    const availableIds = new Set(scenarioById.keys());
    const storedSelection = settings.scenarioIds.filter((id) =>
      availableIds.has(id),
    );
    const defaultSelection = scopedScenarios
      .filter((scenario) => scenario.active)
      .map((scenario) => scenario.id);
    const effectiveIds = storedSelection.length
      ? storedSelection
      : defaultSelection.length
        ? defaultSelection
        : scopedScenarios.map((scenario) => scenario.id);
    return effectiveIds.flatMap((id) => {
      const scenario = scenarioById.get(id);
      return scenario ? [scenario] : [];
    });
  }, [scopedScenarios, settings.scenarioIds]);
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
  const snapshotScenarios = React.useMemo(() => {
    const requested = new Set<string>();
    if (
      visibleCardIds.has("occupancy_scenario_half_donut") ||
      visibleCardIds.has("occupancy_scenario_bar_race") ||
      visibleCardIds.has("occupancy_scenario_max_hour") ||
      visibleCardIds.has("occupancy_scenario_max_year")
    ) {
      selectedScenarioIds.forEach((scenarioId) => requested.add(scenarioId));
    }
    if (visibleCardIds.has("occupancy_hex_layout")) {
      hexScenarioIds.forEach((scenarioId) => requested.add(scenarioId));
    }
    return scopedScenarios.filter((scenario) => requested.has(scenario.id));
  }, [hexScenarioIds, scopedScenarios, selectedScenarioIds, visibleCardIds]);
  const comparisonSelectionKey = selectedScenarioIds.join(",");
  const hourlyAggregateDayCount = needsHourlyHeatmap ? settings.dayCount : 1;
  const snapshotSelectionKey = snapshotScenarios
    .map((scenario) => scenario.id)
    .join(",");
  const snapshotScopeKey = `${companyScopeId}|${timeZone}|${snapshotSelectionKey}`;
  const aggregateScopeKey = `${companyScopeId}|${timeZone}|${comparisonSelectionKey}|${hourlyAggregateDayCount}`;
  const maximumTrendScopeKey = `${companyScopeId}|${timeZone}|${comparisonSelectionKey}`;
  const [snapshotDataset, setSnapshotDataset] =
    React.useState<SnapshotDataset>({
      loading: false,
      requestedAt: null,
      scopeKey: "",
      snapshots: [],
    });
  const [aggregateDataset, setAggregateDataset] =
    React.useState<AggregateDataset>({
      buckets: [],
      from: null,
      loading: false,
      scopeKey: "",
      series: [],
      to: null,
    });
  const [maximumTrendDataset, setMaximumTrendDataset] =
    React.useState<MaximumTrendDataset>({
      loading: false,
      ranges: null,
      scopeKey: "",
      series: [],
    });
  const [currentHourMaximumDataset, setCurrentHourMaximumDataset] =
    React.useState<CurrentHourMaximumDataset>({
      bucket: null,
      loading: false,
      scopeKey: "",
      series: [],
    });
  const [manualRefreshVersion, setManualRefreshVersion] = React.useState(0);
  const resourceFreshnessRef = React.useRef<OccupancyComparisonFreshness>(
    createEmptyOccupancyComparisonFreshness(),
  );
  const focusSnapshotRef = React.useRef(focusSnapshot);
  const focusHourlyAggregateRef = React.useRef(focusHourlyAggregate);
  const focusHourlyAggregateKey = focusHourlyAggregate
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
    return () => {
      window.removeEventListener("storage", synchronizeSettings);
      window.removeEventListener(
        OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
        synchronizeSettings,
      );
    };
  }, [companyScopeId, preferenceScopeId, settingsScopeKey, userId]);

  React.useEffect(() => {
    if (!needsSnapshots) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;

    function scheduleNext(delayMs = snapshotRefreshMs) {
      if (disposed) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        refreshSnapshots,
        Math.max(250, Math.round(delayMs)),
      );
    }

    async function refreshSnapshots() {
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
        focusSnapshotPending &&
        requestedIds.has(focusScenarioId)
      ) {
        // The parent is already loading the same focused history snapshot.
        // Its readiness transition reruns this effect without a duplicate GET.
        return;
      }
      if (document.visibilityState !== "visible") {
        scheduleNext();
        return;
      }
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.snapshots,
        {
          now: new Date(),
          refreshMs: snapshotRefreshMs,
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
      controller = new AbortController();
      const sharedFocusSnapshot = focusSnapshotRef.current;
      const requestedAt = sharedFocusSnapshot?.requestedAt ?? new Date();
      setSnapshotDataset((current) =>
        current.scopeKey === snapshotScopeKey
          ? current
          : {
              loading: true,
              requestedAt: null,
              scopeKey: snapshotScopeKey,
              snapshots: [],
            },
      );
      const snapshots = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioSnapshot> => {
          if (
            sharedFocusSnapshot &&
            scenario.id === sharedFocusSnapshot.scenarioId
          ) {
            return {
              asOf: sharedFocusSnapshot.asOf,
              error: sharedFocusSnapshot.error,
              name: scenario.name,
              scenarioId: scenario.id,
              total: sharedFocusSnapshot.total,
            };
          }
          try {
            const response = await apiFetch<unknown>(
              occupancyHistoryPath(scenario.id, requestedAt),
              { companyScopeId, signal: controller?.signal },
            );
            const history = requireOccupancyHistoryResponse(
              response,
              scenario.id,
              { expectedAreas: scenario.areas, requestedAt },
            );
            return {
              asOf: history.as_of,
              name: scenario.name,
              scenarioId: scenario.id,
              total: history.total,
            };
          } catch (error) {
            return {
              error: occupancyRequestError(
                error,
                "A leitura atual não está disponível.",
              ),
              name: scenario.name,
              scenarioId: scenario.id,
              total: null,
            };
          }
        },
      );
      if (!disposed && !controller.signal.aborted) {
        resourceFreshnessRef.current.snapshots =
          completeOccupancyComparisonResource(
            manualRefreshVersion,
            snapshotScopeKey,
            snapshotScopeKey,
          );
        setSnapshotDataset({
          loading: false,
          requestedAt,
          scopeKey: snapshotScopeKey,
          snapshots,
        });
      }
      if (!disposed) {
        scheduleNext();
      }
    }

    void refreshSnapshots();
    return () => {
      disposed = true;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
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
    snapshotRefreshMs,
  ]);

  React.useEffect(() => {
    if (!needsHourlyAggregate) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let requestGeneration = 0;

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
      if (disposed) return;
      if (!settingsReady) return;
      const requestedAt = new Date();
      const range = buildOccupancyHourlyRange(
        requestedAt,
        hourlyAggregateDayCount,
      );
      const requestedIds = new Set(
        comparisonSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
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
      if (document.visibilityState !== "visible") {
        scheduleNext(range.to);
        return;
      }
      const sharedFocus = resolveSharedOccupancyHourlyAggregate(
        focusHourlyAggregateRef.current,
        focusScenarioId,
        range,
      );
      if (sharedFocus.covered && !sharedFocus.series) {
        // The focused dashboard owns this exact request. Wait for its
        // certified result instead of racing it with an equivalent GET.
        return;
      }
      const windowKey = occupancyComparisonRangeKey(range);
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.aggregate,
        {
          now: requestedAt,
          refreshMs: aggregateRefreshMs,
          refreshVersion: manualRefreshVersion,
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
              loading: true,
              scopeKey: aggregateScopeKey,
              series: [],
              to: range.to,
            },
      );
      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioHourlySeries> => {
          if (
            scenario.id === focusScenarioId &&
            sharedFocus.series
          ) {
            return sharedFocus.series;
          }
          try {
            requireRuntimeCompanyTimeZone(timeZone);
            const response =
              await apiFetch<OccupancyScenarioAggregateResponse>(
                occupancyAggregatePath(scenario.id, range.from, range.to),
                { companyScopeId, signal: requestController.signal },
              );
            const rows = requireOccupancyAggregateRows(
              response,
              "hour",
              scenario.id,
              timeZone,
              {
                allowLegacyUncertifiedInstantBuckets: true,
                openBucket: range.buckets.at(-1),
                requestedAt,
                requireCertification: true,
              },
            );
            const coverage = aggregateOccupancyRowsForRequestedBuckets(
              rows,
              "hour",
              range.buckets,
              {
                allowLegacyUncertifiedInstantBuckets: true,
                openBucket: range.buckets.at(-1),
                requireCertification: true,
              },
            );
            return {
              metrics: coverage.totals,
              name: scenario.name,
              scenarioId: scenario.id,
              warning: joinMessages(
                timeZoneWarning,
                occupancyAggregateMetadataWarning(response, "hour"),
                occupancyAggregateCoverageWarning(
                  coverage.missingBuckets.length,
                  range.buckets.length,
                ),
              ),
            };
          } catch (error) {
            return {
              error: occupancyRequestError(
                error,
                "A série horária não está disponível.",
              ),
              metrics: new Map(),
              name: scenario.name,
              scenarioId: scenario.id,
            };
          }
        },
      );
      const latestRange = buildOccupancyHourlyRange(
        new Date(),
        hourlyAggregateDayCount,
      );
      if (
        disposed ||
        requestController.signal.aborted ||
        generation !== requestGeneration
      ) {
        return;
      }
      if (!sameOccupancyRange(range, latestRange)) {
        scheduleNext(undefined, true);
        return;
      }

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
          manualRefreshVersion,
          aggregateScopeKey,
          windowKey,
        );
      scheduleNext(range.to);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (timeout) window.clearTimeout(timeout);
      void refreshAggregates();
    }

    void refreshAggregates();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    aggregateScopeKey,
    aggregateRefreshMs,
    companyScopeId,
    comparisonSelectionKey,
    focusHourlyAggregateKey,
    focusScenarioId,
    hourlyAggregateDayCount,
    manualRefreshVersion,
    needsHourlyAggregate,
    scopedScenarios,
    settingsReady,
    timeZone,
    timeZoneWarning,
  ]);

  React.useEffect(() => {
    if (!needsCurrentHourMaximum) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let requestGeneration = 0;

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
      if (disposed || !settingsReady) return;
      const requestedIds = new Set(
        comparisonSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        setCurrentHourMaximumDataset({
          bucket: null,
          loading: false,
          scopeKey: maximumTrendScopeKey,
          series: [],
        });
        return;
      }
      try {
        requireRuntimeCompanyTimeZone(timeZone);
      } catch (error) {
        setCurrentHourMaximumDataset({
          bucket: null,
          loading: false,
          scopeKey: maximumTrendScopeKey,
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
      const range = buildOccupancyCurrentHourRange(requestedAt);
      const minuteRange = buildOccupancyClosedMinuteRange(requestedAt);
      const aggregateCoversCurrentHour = Boolean(
        needsHourlyAggregate &&
          !aggregateDataset.loading &&
          aggregateDataset.scopeKey === aggregateScopeKey &&
          aggregateDataset.from &&
          aggregateDataset.to &&
          aggregateDataset.from <= range.from &&
          aggregateDataset.to >= range.to,
      );
      if (needsHourlyAggregate && !aggregateCoversCurrentHour) {
        // The broader hourly request owns this source. Its state update reruns
        // this effect, avoiding a second request for the same open hour.
        return;
      }
      if (document.visibilityState !== "visible") {
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
          refreshVersion: manualRefreshVersion,
          scopeKey: maximumTrendScopeKey,
          windowKey,
        },
      );
      if (freshnessRemainingMs > 0) {
        if (!needsHourlyAggregate) {
          scheduleNext(
            endOfAggregateBucket(requestedAt, "minute"),
            false,
            freshnessRemainingMs,
          );
        }
        return;
      }

      const generation = ++requestGeneration;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setCurrentHourMaximumDataset((current) =>
        current.scopeKey === maximumTrendScopeKey &&
        current.bucket?.getTime() === range.from.getTime()
          ? current
          : {
              bucket: range.from,
              loading: true,
              scopeKey: maximumTrendScopeKey,
              series: [],
            },
      );

      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioOpenMaximumSeries> => {
          let hourWarning: string | undefined;
          if (aggregateCoversCurrentHour) {
            const sharedSeries = aggregateDataset.series.find(
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
          } else {
            try {
              const response =
                await apiFetch<OccupancyScenarioAggregateResponse>(
                  occupancyAggregatePath(
                    scenario.id,
                    range.from,
                    range.to,
                  ),
                  {
                    companyScopeId,
                    signal: requestController.signal,
                  },
                );
              const rows = requireOccupancyAggregateRows(
                response,
                "hour",
                scenario.id,
                timeZone,
                {
                  allowLegacyUncertifiedInstantBuckets: true,
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
                  allowLegacyUncertifiedInstantBuckets: true,
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

          try {
            const minuteResponse =
              await apiFetch<OccupancyScenarioAggregateResponse>(
                occupancyAggregatePath(
                  scenario.id,
                  minuteRange.from,
                  minuteRange.to,
                  "minute",
                ),
                {
                  companyScopeId,
                  signal: requestController.signal,
                },
              );
            const minuteRows = requireOccupancyAggregateRows(
              minuteResponse,
              "minute",
              scenario.id,
              timeZone,
              {
                allowLegacyUncertifiedInstantBuckets: true,
                requireCertification: true,
              },
            );
            const minuteCoverage = aggregateOccupancyRowsForRequestedBuckets(
              minuteRows,
              "minute",
              minuteRange.buckets,
              {
                allowLegacyUncertifiedInstantBuckets: true,
                requireCertification: true,
              },
            );
            const minuteMetrics = Array.from(minuteCoverage.totals.values());
            const peak = minuteMetrics.length
              ? Math.max(...minuteMetrics.map((metric) => metric.peak))
              : null;
            return {
              name: scenario.name,
              peaks:
                peak === null || minuteCoverage.missingBuckets.length
                  ? new Map()
                  : new Map([
                      [occupancyAggregateBucketKey(range.from, "hour"), peak],
                    ]),
              scenarioId: scenario.id,
              source: "observed",
              warning: joinMessages(
                hourWarning,
                occupancyAggregateMetadataWarning(minuteResponse, "minute"),
                occupancyAggregateCoverageWarning(
                  minuteCoverage.missingBuckets.length,
                  minuteRange.buckets.length,
                ),
                "Hora em andamento composta pelos minutos encerrados e pela leitura ao vivo; permanece marcada como parcial.",
              ),
            };
          } catch (error) {
            return {
              error: occupancyRequestError(
                error,
                "Não foi possível recompor o máximo da hora aberta.",
              ),
              name: scenario.name,
              peaks: new Map(),
              scenarioId: scenario.id,
              source: "observed",
              warning: hourWarning,
            };
          }
        },
      );

      const completedAt = new Date();
      const latestRange = buildOccupancyCurrentHourRange(completedAt);
      const latestMinuteRange = buildOccupancyClosedMinuteRange(completedAt);
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
        scopeKey: maximumTrendScopeKey,
        series:
          current.scopeKey === maximumTrendScopeKey &&
          current.bucket?.getTime() === range.from.getTime()
            ? preserveCurrentHourMetricsOnFailure(current.series, series)
            : series,
      }));
      resourceFreshnessRef.current.currentHourMaximum =
        completeOccupancyComparisonResource(
          manualRefreshVersion,
          maximumTrendScopeKey,
          windowKey,
        );
      if (!needsHourlyAggregate) {
        scheduleNext(endOfAggregateBucket(new Date(), "minute"));
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (timeout) window.clearTimeout(timeout);
      void refreshCurrentHourMaximum();
    }

    void refreshCurrentHourMaximum();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    aggregateRefreshMs,
    aggregateDataset,
    aggregateScopeKey,
    companyScopeId,
    comparisonSelectionKey,
    maximumTrendScopeKey,
    manualRefreshVersion,
    needsCurrentHourMaximum,
    needsHourlyAggregate,
    scopedScenarios,
    settingsReady,
    timeZone,
    timeZoneWarning,
  ]);

  React.useEffect(() => {
    if (!needsMaximumTrend) return;

    let disposed = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;

    let requestGeneration = 0;

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
      if (disposed || !settingsReady) return;
      const requestedAt = new Date();
      const ranges = buildOccupancyMaximumTrendRanges(requestedAt);
      const requestedIds = new Set(
        comparisonSelectionKey.split(",").filter(Boolean),
      );
      const requestedScenarios = scopedScenarios.filter((scenario) =>
        requestedIds.has(scenario.id),
      );
      if (!companyScopeId || !requestedScenarios.length) {
        setMaximumTrendDataset({
          loading: false,
          ranges,
          scopeKey: maximumTrendScopeKey,
          series: [],
        });
        return;
      }
      if (document.visibilityState !== "visible") {
        scheduleNext(ranges.monthlySource.to);
        return;
      }
      const windowKey = occupancyMaximumTrendRangeKey(ranges);
      const freshnessRemainingMs = occupancyComparisonFreshnessRemainingMs(
        resourceFreshnessRef.current.maximumTrend,
        {
          now: requestedAt,
          refreshMs: maximumTrendRefreshMs,
          refreshVersion: manualRefreshVersion,
          scopeKey: maximumTrendScopeKey,
          windowKey,
        },
      );
      if (freshnessRemainingMs > 0) {
        scheduleNext(
          ranges.monthlySource.to,
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
      const series = await mapWithConcurrency(
        requestedScenarios,
        MAX_PARALLEL_REQUESTS,
        async (scenario): Promise<OccupancyScenarioHourlySeries> => {
          try {
            requireRuntimeCompanyTimeZone(timeZone);
            // The occupancy API does not accept year. One certified monthly
            // source feeds both the 12-month chart and the exact annual max.
            const response =
              await apiFetch<OccupancyScenarioAggregateResponse>(
                occupancyAggregatePath(
                  scenario.id,
                  ranges.monthlySource.from,
                  ranges.monthlySource.to,
                  "month",
                ),
                { companyScopeId, signal: requestController.signal },
              );
            const rows = requireOccupancyAggregateRows(
              response,
              "month",
              scenario.id,
              timeZone,
              {
                allowLegacyUncertifiedInstantBuckets: true,
                openBucket: ranges.monthlySource.buckets.at(-1),
                requestedAt,
                requireCertification: true,
              },
            );
            const coverage = aggregateOccupancyRowsForRequestedBuckets(
              rows,
              "month",
              ranges.monthlySource.buckets,
              {
                allowLegacyUncertifiedInstantBuckets: true,
                openBucket: ranges.monthlySource.buckets.at(-1),
                requireCertification: true,
              },
            );
            return {
              metrics: coverage.totals,
              name: scenario.name,
              scenarioId: scenario.id,
              warning: joinMessages(
                timeZoneWarning,
                occupancyAggregateMetadataWarning(response, "month"),
                occupancyAggregateCoverageWarning(
                  coverage.missingBuckets.length,
                  ranges.monthlySource.buckets.length,
                ),
              ),
            };
          } catch (error) {
            return {
              error: occupancyRequestError(
                error,
                "Os máximos mensais não estão disponíveis.",
              ),
              metrics: new Map(),
              name: scenario.name,
              scenarioId: scenario.id,
            };
          }
        },
      );
      const latestRanges = buildOccupancyMaximumTrendRanges(new Date());
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

      setMaximumTrendDataset({
        loading: false,
        ranges,
        scopeKey: maximumTrendScopeKey,
        series,
      });
      resourceFreshnessRef.current.maximumTrend =
        completeOccupancyComparisonResource(
          manualRefreshVersion,
          maximumTrendScopeKey,
          windowKey,
        );
      scheduleNext(ranges.monthlySource.to);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (timeout) window.clearTimeout(timeout);
      void refreshMaximumTrends();
    }

    void refreshMaximumTrends();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      requestGeneration += 1;
      controller?.abort();
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    companyScopeId,
    comparisonSelectionKey,
    maximumTrendRefreshMs,
    maximumTrendScopeKey,
    manualRefreshVersion,
    needsMaximumTrend,
    scopedScenarios,
    settingsReady,
    timeZone,
    timeZoneWarning,
  ]);

  const certifiedSnapshots =
    snapshotDataset.scopeKey === snapshotScopeKey
      ? snapshotDataset.snapshots
      : [];
  const snapshotByScenarioId = new Map(
    certifiedSnapshots.map((snapshot) => [snapshot.scenarioId, snapshot]),
  );
  const comparisonSnapshots = selectedScenarioIds.flatMap((scenarioId) => {
    const snapshot = snapshotByScenarioId.get(scenarioId);
    return snapshot ? [snapshot] : [];
  });
  const certifiedAggregate =
    aggregateDataset.scopeKey === aggregateScopeKey
      ? aggregateDataset
      : {
          buckets: [],
          from: null,
          loading: true,
          scopeKey: aggregateScopeKey,
          series: [],
          to: null,
        };
  const certifiedMaximumTrend =
    maximumTrendDataset.scopeKey === maximumTrendScopeKey
      ? maximumTrendDataset
      : {
          loading: true,
          ranges: null,
          scopeKey: maximumTrendScopeKey,
          series: [],
        };
  const certifiedCurrentHourMaximum =
    currentHourMaximumDataset.scopeKey === maximumTrendScopeKey
      ? currentHourMaximumDataset
      : {
          bucket: null,
          loading: true,
          scopeKey: maximumTrendScopeKey,
          series: [],
        };
  const snapshotLoading =
    snapshotDataset.scopeKey !== snapshotScopeKey || snapshotDataset.loading;
  const aggregateLoading =
    aggregateDataset.scopeKey !== aggregateScopeKey || aggregateDataset.loading;
  const maximumTrendLoading =
    maximumTrendDataset.scopeKey !== maximumTrendScopeKey ||
    maximumTrendDataset.loading;
  const currentHourMaximumLoading =
    currentHourMaximumDataset.scopeKey !== maximumTrendScopeKey ||
    currentHourMaximumDataset.loading;
  const hourlyMaximumBuckets = React.useMemo(() => {
    const anchorBucket =
      certifiedCurrentHourMaximum.bucket ?? certifiedAggregate.buckets.at(-1);
    if (!anchorBucket) return [];
    const latestDayKey = localDateKey(anchorBucket);
    return certifiedAggregate.buckets.filter(
      (bucket) => localDateKey(bucket) === latestDayKey,
    );
  }, [certifiedAggregate.buckets, certifiedCurrentHourMaximum.bucket]);
  const hourlyMaximumSeries = certifiedAggregate.series.length
    ? certifiedAggregate.series
    : certifiedCurrentHourMaximum.series.map((scenario) => ({
        error: scenario.error,
        metrics: new Map(),
        name: scenario.name,
        scenarioId: scenario.scenarioId,
        warning: scenario.warning,
      }));
  const heatmapScenarioId = resolveHeatmapScenarioId(
    settings.heatmapScenarioId,
    focusScenarioId,
    selectedScenarioIds,
  );
  const scenarioHourHeatmapDateKeys = React.useMemo(
    () => Array.from(new Set(certifiedAggregate.buckets.map(localDateKey))),
    [certifiedAggregate.buckets],
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
  const updateScenarioIds = React.useCallback(
    (scenarioIds: string[]) => updateSettings({ scenarioIds }),
    [updateSettings],
  );

  const commonScopeProps = {
    allScenarios: scopedScenarios,
    monitorMode,
    onScenarioIdsChange: updateScenarioIds,
    selectedScenarioIds,
  };
  const cards: ComparisonLayoutCard[] = [
    {
      colorEditable: false,
      defaultHeight: "tall",
      defaultSize: "large",
      id: "occupancy_scenario_half_donut",
      label: "Comparação atual por cenário",
      previewChartType: "bar",
      previewColors: selectedColorPalette.colors,
      previewKind:
        settings.comparisonChartType === "half_donut"
          ? "composition"
          : "chart",
      previewOrientation:
        settings.comparisonChartType === "bars" ? "horizontal" : "vertical",
      node: (
        <OccupancyHalfDonutCard
          {...commonScopeProps}
          chartType={settings.comparisonChartType}
          colorPalette={selectedColorPalette.colors}
          loading={snapshotLoading}
          mode={settings.comparisonMode}
          onChartTypeChange={(comparisonChartType) =>
            updateSettings({ comparisonChartType })
          }
          onModeChange={(comparisonMode) =>
            updateSettings({ comparisonMode })
          }
          requestedAt={snapshotDataset.requestedAt}
          snapshots={comparisonSnapshots}
          statusColors={DEFAULT_OCCUPANCY_STATUS_COLORS}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      id: "occupancy_scenario_bar_race",
      label: "Ranking ao vivo por cenário",
      previewColors: selectedColorPalette.colors,
      previewKind: "ranking",
      node: (
        <OccupancyBarRaceCard
          {...commonScopeProps}
          loading={snapshotLoading}
          colorPalette={selectedColorPalette.colors}
          requestedAt={snapshotDataset.requestedAt}
          refreshSeconds={Math.max(1, Math.round(snapshotRefreshMs / 1_000))}
          snapshots={comparisonSnapshots}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      id: "occupancy_scenario_max_hour",
      label: "Máximo por hora por cenário",
      previewChartType: "line",
      previewColors: selectedColorPalette.colors,
      previewKind: "chart",
      node: (
        <OccupancyScenarioMaximumLineCard
          {...commonScopeProps}
          buckets={hourlyMaximumBuckets}
          colorPalette={selectedColorPalette.colors}
          currentBucket={certifiedCurrentHourMaximum.bucket}
          currentSnapshots={comparisonSnapshots}
          currentSeries={certifiedCurrentHourMaximum.series}
          granularity="hour"
          loading={aggregateLoading && currentHourMaximumLoading}
          refreshSeconds={Math.max(1, Math.round(snapshotRefreshMs / 1_000))}
          series={hourlyMaximumSeries}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      id: "occupancy_scenario_max_month",
      label: "Máximo por mês por cenário",
      previewChartType: "line",
      previewColors: selectedColorPalette.colors,
      previewKind: "chart",
      node: (
        <OccupancyScenarioMaximumLineCard
          {...commonScopeProps}
          buckets={certifiedMaximumTrend.ranges?.monthly.buckets ?? []}
          colorPalette={selectedColorPalette.colors}
          granularity="month"
          loading={maximumTrendLoading}
          series={certifiedMaximumTrend.series}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "standard",
      defaultHeightLevel: 4,
      defaultSize: "wide",
      id: "occupancy_scenario_max_year",
      label: "Máximo por ano por cenário",
      previewChartType: "line",
      previewColors: selectedColorPalette.colors,
      previewKind: "chart",
      node: (
        <OccupancyScenarioMaximumLineCard
          {...commonScopeProps}
          buckets={certifiedMaximumTrend.ranges?.annual.buckets ?? []}
          colorPalette={selectedColorPalette.colors}
          currentBucket={certifiedCurrentHourMaximum.bucket}
          currentSnapshots={comparisonSnapshots}
          currentSeries={certifiedCurrentHourMaximum.series}
          granularity="year"
          loading={maximumTrendLoading}
          monthlySourceBuckets={
            certifiedMaximumTrend.ranges?.monthlySource.buckets ?? []
          }
          series={certifiedMaximumTrend.series}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "tall",
      defaultSize: "full",
      id: "occupancy_hex_layout",
      label: "Simulador operacional hexagonal",
      previewColors: selectedHexColorPalette.colors,
      previewKind: "hex",
      node: (
        <OccupancyHexLayoutCard
          allScenarios={scopedScenarios}
          capacities={settings.capacities}
          colorPalette={selectedHexColorPalette.colors}
          columns={settings.hexColumns}
          defaultScenarioIds={selectedScenarioIds}
          displayMode={settings.hexDisplayMode}
          layout={settings.hexLayout}
          loading={snapshotLoading}
          monitorMode={monitorMode}
          onSettingsChange={updateSettings}
          paletteId={settings.hexColorPaletteId}
          preset={settings.hexPreset}
          scenarios={scopedScenarios}
          snapshots={certifiedSnapshots}
          statusColors={settings.hexStatusColors}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "tall",
      defaultSize: "full",
      id: "occupancy_day_hour_heatmap",
      label: "Ocupação por dias x horários",
      previewColors: selectedColorPalette.colors,
      previewKind: "heatmap",
      node: (
        <OccupancyDayHourHeatmapCard
          {...commonScopeProps}
          buckets={certifiedAggregate.buckets}
          colorPalette={selectedColorPalette.colors}
          dayCount={settings.dayCount}
          loading={aggregateLoading}
          maximum={sharedHeatmapMaximum(
            certifiedAggregate.series,
            settings.metric,
          )}
          metric={settings.metric}
          onDayCountChange={(dayCount) => updateSettings({ dayCount })}
          onMetricChange={(metric) => updateSettings({ metric })}
          onScenarioChange={(heatmapScenarioId) =>
            updateSettings({ heatmapScenarioId })
          }
          scenarioId={heatmapScenarioId}
          series={certifiedAggregate.series}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
    {
      colorEditable: false,
      defaultHeight: "tall",
      defaultSize: "full",
      id: "occupancy_scenario_hour_heatmap",
      label: "Ocupação por cenários x horários",
      previewColors: selectedColorPalette.colors,
      previewKind: "heatmap",
      node: (
        <OccupancyScenarioHourHeatmapCard
          {...commonScopeProps}
          buckets={certifiedAggregate.buckets}
          colorPalette={selectedColorPalette.colors}
          loading={aggregateLoading}
          maximum={sharedHeatmapMaximum(
            certifiedAggregate.series,
            settings.metric,
          )}
          metric={settings.metric}
          dateKey={scenarioHourHeatmapDateKey}
          dateKeys={scenarioHourHeatmapDateKeys}
          onDateKeyChange={(scenarioHourHeatmapDateKey) =>
            updateSettings({ scenarioHourHeatmapDateKey })
          }
          onMetricChange={(metric) => updateSettings({ metric })}
          series={certifiedAggregate.series}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    },
  ];

  const reportAssets = buildOccupancyComparisonReportAssets({
    aggregateBuckets: certifiedAggregate.buckets,
    aggregateSeries: certifiedAggregate.series,
    currentHourBucket: certifiedCurrentHourMaximum.bucket,
    currentHourSeries: certifiedCurrentHourMaximum.series,
    heatmapScenarioId,
    hexSnapshots: certifiedSnapshots,
    hourlyMaximumBuckets,
    hourlyMaximumSeries,
    maximumTrendRanges: certifiedMaximumTrend.ranges,
    maximumTrendSeries: certifiedMaximumTrend.series,
    scenarioHourHeatmapDateKey,
    scenarios: scopedScenarios,
    selectedScenarioIds,
    settings,
    snapshots: comparisonSnapshots,
  });

  return { cards, refresh, reportAssets, settings, updateSettings };
}

function buildOccupancyComparisonReportAssets({
  aggregateBuckets,
  aggregateSeries,
  currentHourBucket,
  currentHourSeries,
  heatmapScenarioId,
  hexSnapshots,
  hourlyMaximumBuckets,
  hourlyMaximumSeries,
  maximumTrendRanges,
  maximumTrendSeries,
  scenarioHourHeatmapDateKey,
  scenarios,
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
  hourlyMaximumBuckets: Date[];
  hourlyMaximumSeries: OccupancyScenarioHourlySeries[];
  maximumTrendRanges: OccupancyMaximumTrendRanges | null;
  maximumTrendSeries: OccupancyScenarioHourlySeries[];
  scenarioHourHeatmapDateKey: string;
  scenarios: OccupancyScenario[];
  selectedScenarioIds: string[];
  settings: OccupancyWidgetSettings;
  snapshots: OccupancyScenarioSnapshot[];
}): OccupancyComparisonReportAsset[] {
  const theme = "light" as const;
  const comparisonPalette = getOccupancyColorPalette(settings.colorPaletteId);
  const hexColorPalette = getOccupancyColorPalette(settings.hexColorPaletteId);
  const widgetColor = comparisonPalette.colors[0];
  const scenarioIndexes = new Map(
    snapshots.map((snapshot, index) => [snapshot.scenarioId, index + 1]),
  );
  const comparisonEntries = buildOccupancyHalfDonutEntries(
    snapshots,
    settings.comparisonMode,
  );
  const comparisonBarEntries = buildOccupancyComparisonBarEntries(
    snapshots,
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
  const comparisonTitle = "Comparação atual por cenário";
  const comparisonDescription =
    settings.comparisonMode === "status"
      ? "Estado atual por cenário na ordem configurada; zero representa desocupado e ausência permanece sem dados."
      : "Ocupação atual por cenário na ordem configurada, com participação calculada apenas sobre valores disponíveis.";

  const raceEntries = buildOccupancyLiveRaceEntries(snapshots);
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
    buckets: hourlyMaximumBuckets,
    currentBucket: currentHourBucket,
    currentSnapshots: snapshots,
    currentSeries: currentHourSeries,
    granularity: "hour",
    monthlySourceBuckets: [],
    scenarios,
    series: hourlyMaximumSeries,
  });
  const monthlyBuckets = maximumTrendRanges?.monthly.buckets ?? [];
  const monthlyMaximum = buildMaximumLineSeries({
    buckets: monthlyBuckets,
    currentBucket: null,
    currentSnapshots: [],
    currentSeries: [],
    granularity: "month",
    monthlySourceBuckets: [],
    scenarios,
    series: maximumTrendSeries,
  });
  const annualBuckets = maximumTrendRanges?.annual.buckets ?? [];
  const annualMaximum = buildMaximumLineSeries({
    buckets: annualBuckets,
    currentBucket: currentHourBucket,
    currentSnapshots: snapshots,
    currentSeries: currentHourSeries,
    granularity: "year",
    monthlySourceBuckets: maximumTrendRanges?.monthlySource.buckets ?? [],
    scenarios,
    series: maximumTrendSeries,
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

  const heatmapMaximum = sharedHeatmapMaximum(
    aggregateSeries,
    settings.metric,
  );
  const dayHourSeries = aggregateSeries.find(
    (item) => item.scenarioId === heatmapScenarioId,
  );
  const dayHourMatrix = dayHourSeries
    ? buildDaysHoursOccupancyCells({
        buckets: aggregateBuckets,
        metric: settings.metric,
        scenario: dayHourSeries,
      })
    : { cells: [], dayKeys: [] };
  const dayHourLabels = dayHourMatrix.dayKeys.map(formatHeatmapDateKey);
  const scenarioHourMatrix = scenarioHourHeatmapDateKey
    ? buildScenariosHoursOccupancyCells({
        buckets: aggregateBuckets,
        dateKey: scenarioHourHeatmapDateKey,
        metric: settings.metric,
        series: aggregateSeries,
      })
    : { cells: [], scenarioNames: [] };

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
            { key: "occupancy", label: "Ocupação atual", numeric: true },
            { key: "share", label: "Participação (%)", numeric: true },
            { key: "asOf", label: "Atualizado em" },
          ],
          description:
            "Ordem fixa configurada; valores ausentes permanecem nulos e não participam do percentual.",
          rows: comparisonBarEntries.map((entry, index) => {
            const snapshot = snapshots[index];
            return {
              asOf: snapshot?.asOf ? formatDateTime(snapshot.asOf) : null,
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
        description:
          "Ranking ao vivo da ocupação atual; empates preservam a ordem configurada e leituras ausentes ficam sem valor.",
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
            { key: "occupancy", label: "Ocupação atual", numeric: true },
            { key: "asOf", label: "Atualizado em" },
          ],
          description:
            "Ranking visual dos cenários no horário da última atualização.",
          rows: raceRows.map((entry, index) => ({
            asOf: snapshots[entry.sourceIndex]?.asOf
              ? formatDateTime(snapshots[entry.sourceIndex].asOf!)
              : null,
            occupancy: entry.value,
            rank: entry.value === null ? null : index + 1,
            scenario: entry.name,
          })),
          title: "Dados - Ranking ao vivo por cenário",
        },
        title: "Ranking ao vivo por cenário",
      },
    },
    buildMaximumReportAsset({
      cardId: "occupancy_scenario_max_hour",
      colorPalette: comparisonPalette.colors,
      granularity: "hour",
      labels: OCCUPANCY_FIXED_HOUR_LABELS,
      series: hourlyMaximum,
      widgetColor,
    }),
    buildMaximumReportAsset({
      cardId: "occupancy_scenario_max_month",
      colorPalette: comparisonPalette.colors,
      granularity: "month",
      labels: occupancyMaximumTrendBucketLabels(monthlyBuckets, "month"),
      series: monthlyMaximum,
      widgetColor,
    }),
    buildMaximumReportAsset({
      cardId: "occupancy_scenario_max_year",
      colorPalette: comparisonPalette.colors,
      granularity: "year",
      labels: occupancyMaximumTrendBucketLabels(annualBuckets, "year"),
      series: annualMaximum,
      widgetColor,
    }),
    {
      cardId: "occupancy_hex_layout",
      chart: {
        description:
          settings.hexDisplayMode === "actual"
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
          title: "Dados - Simulador operacional hexagonal",
        },
        title: "Simulador operacional hexagonal",
      },
    },
    {
      cardId: "occupancy_day_hour_heatmap",
      chart: {
        description: `Últimos ${settings.dayCount} dias do cenário escolhido; o valor zero permanece visível e a ausência fica sem valor.`,
        option: buildHeatmapOption({
          cells: dayHourMatrix.cells,
          maximum: heatmapMaximum,
          metric: settings.metric,
          theme,
          widgetColor,
          xLabels: dayHourLabels,
          yLabels: OCCUPANCY_FIXED_HOUR_LABELS,
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
            date: localDateKey(cell.bucket),
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
        description: `Comparação dos cenários nas 24 horas de ${
          scenarioHourHeatmapDateKey || "data ainda indisponível"
        }; lacunas permanecem sem valor.`,
        option: buildHeatmapOption({
          cells: scenarioHourMatrix.cells,
          maximum: heatmapMaximum,
          metric: settings.metric,
          theme,
          widgetColor,
          xLabels: scenarioHourMatrix.scenarioNames,
          yLabels: OCCUPANCY_FIXED_HOUR_LABELS,
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
            "A data é a mesma selecionada no widget; cenários não são somados e ausência não representa zero.",
          rows: scenarioHourMatrix.cells.map((cell) => ({
            certification:
              cell.value === null ? "Sem dados" : "Disponível",
            date: scenarioHourHeatmapDateKey || null,
            hour: OCCUPANCY_FIXED_HOUR_LABELS[cell.y] ?? `${cell.y}h`,
            metric: metricLabel(settings.metric),
            scenario: scenarioHourMatrix.scenarioNames[cell.x] ?? null,
            value: cell.value,
          })),
          title: "Dados - Ocupação por cenários x horários",
        },
        title: "Ocupação por cenários x horários",
      },
    },
  ];
}

function buildMaximumReportAsset({
  cardId,
  colorPalette,
  granularity,
  labels,
  series,
  widgetColor,
}: {
  cardId: string;
  colorPalette: readonly string[];
  granularity: OccupancyMaximumLineGranularity;
  labels: string[];
  series: OccupancyMaximumLineSeries[];
  widgetColor: string;
}): OccupancyComparisonReportAsset {
  const title = maximumLineTitle(granularity);
  return {
    cardId,
    chart: {
      description: maximumLineDescription(granularity),
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
  if (state === "occupied") return "Ocupado (> 0)";
  if (state === "unoccupied") return "Desocupado (= 0)";
  return "Sem dados";
}

function OccupancyHalfDonutCard({
  allScenarios,
  chartType,
  colorPalette,
  loading,
  mode,
  monitorMode,
  onChartTypeChange,
  onModeChange,
  onScenarioIdsChange,
  requestedAt,
  selectedScenarioIds,
  snapshots,
  statusColors,
}: {
  allScenarios: OccupancyScenario[];
  chartType: OccupancyWidgetSettings["comparisonChartType"];
  colorPalette: readonly string[];
  loading: boolean;
  mode: OccupancyHalfDonutMode;
  monitorMode: boolean;
  onChartTypeChange: (
    chartType: OccupancyWidgetSettings["comparisonChartType"],
  ) => void;
  onModeChange: (mode: OccupancyHalfDonutMode) => void;
  onScenarioIdsChange: (ids: string[]) => void;
  requestedAt: Date | null;
  selectedScenarioIds: string[];
  snapshots: OccupancyScenarioSnapshot[];
  statusColors: OccupancyStatusColors;
}) {
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
  const barEntries = React.useMemo(
    () => buildOccupancyComparisonBarEntries(snapshots, mode),
    [mode, snapshots],
  );
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
      widgetColor,
    ],
  );
  const allCertifiedAreZero =
    chartType === "half_donut" &&
    mode === "actual" &&
    entries.length > 0 &&
    entries.every((entry) => entry.total === 0);
  const hasChartEntries =
    chartType === "half_donut" ? entries.length > 0 : barEntries.length > 0;
  const showCompactDonutFallback =
    chartType === "half_donut" && entries.length > 8;
  const statusColorPresetLabel =
    OCCUPANCY_STATUS_COLOR_PRESETS.find(
      (candidate) => candidate.id === statusColors.preset,
    )?.label ?? "Personalizado";

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
              <WidgetTitleText fallback="Comparação atual por cenário" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {chartType === "vertical_bars"
                ? mode === "status"
                  ? "Uma coluna por cenário, da esquerda para a direita na ordem configurada, distinguindo ocupado, desocupado e ausência de dados."
                  : "Uma coluna por cenário, da esquerda para a direita na ordem configurada, com valor real e participação percentual."
                : chartType === "bars"
                ? mode === "status"
                  ? "Uma barra por cenário, na ordem configurada, distinguindo ocupado, desocupado e ausência de dados."
                  : "Uma barra por cenário, na ordem configurada, com valor real e participação percentual."
                : mode === "status"
                  ? "Todos os cenários com dados têm o mesmo peso visual; zero permanece desocupado e visível."
                  : "A área de cada fatia representa a ocupação real; o callout identifica cenário e participação percentual."}
            </CardDescription>
          </div>
          {!monitorMode ? (
            <div className="flex shrink-0 items-start justify-end">
              <ScenarioScopeDialog
                allScenarios={allScenarios}
                onChange={onScenarioIdsChange}
                selectedIds={selectedScenarioIds}
              />
            </div>
          ) : null}
          {!monitorMode ? (
            <div className="col-span-full grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11.25rem),1fr))] items-center gap-2">
                <Select
                  value={chartType}
                  onValueChange={(value) =>
                    onChartTypeChange(
                      value as OccupancyWidgetSettings["comparisonChartType"],
                    )
                  }
                >
                  <SelectTrigger
                    aria-label="Tipo do gráfico da comparação atual por cenário"
                    className="h-8 w-full min-w-0 @sm:w-[180px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="half_donut">Meia rosca</SelectItem>
                    <SelectItem value="bars">Barras horizontais</SelectItem>
                    <SelectItem value="vertical_bars">Barras verticais</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    onModeChange(value as OccupancyHalfDonutMode)
                  }
                >
                  <SelectTrigger
                    aria-label="Modo da comparação atual por cenário"
                    className="h-8 w-full min-w-0 @sm:w-[190px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Ocupado / desocupado</SelectItem>
                    <SelectItem value="actual">Ocupação real</SelectItem>
                  </SelectContent>
                </Select>
            </div>
          ) : null}
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
              label="Ocupado > 0"
            />
            <OccupancyStatusLegendBadge
              color={displayStatusColors.unoccupied}
              label="Desocupado = 0"
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
                ariaLabel="Comparação atual por cenário"
                option={option}
                themeMode="explicit"
                className="h-full min-h-0 w-full"
              />
              {allCertifiedAreZero ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs font-semibold"
                  style={{ color: displayStatusColors.unoccupied }}
                >
                  Todos desocupados · 0
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
          <EmptyComparisonState text="Nenhum cenário possui leitura disponível neste momento." />
        )}
        {requestedAt ? (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Mesmo instante consultado: {formatDateTime(requestedAt)}.
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
          ? formatChartNumber(entry.total)
          : `${formatChartNumber(entry.total)} · ${formatChartNumber(percentage)}%`;
    const accessibleLabel =
      mode === "status"
        ? `${indexLabel} · ${entry.name}: ${
            entry.state === "occupied" ? "ocupado" : "desocupado"
          }`
        : percentage === null
          ? `${indexLabel} · ${entry.name}: ocupação ${formatChartNumber(
              entry.total,
            )}; total geral igual a zero`
          : `${indexLabel} · ${entry.name}: ocupação ${formatChartNumber(
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
              className="h-6 px-2 text-[10px]"
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
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
                    "rounded-lg border bg-card p-3 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
            <div className="mb-3 flex items-center justify-between gap-2">
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
                label="Ocupado > 0"
                onChange={(color) => changeColor("occupied", color)}
              />
              <OccupancyStatusColorField
                color={draft.unoccupied}
                id={unoccupiedInputId}
                label="Desocupado = 0"
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
                Ocupado &gt; 0
              </div>
              <div
                className="px-3 py-3"
                style={{
                  backgroundColor: draft.unoccupied,
                  color: readableTextColor(draft.unoccupied),
                }}
              >
                Desocupado = 0
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
      className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3"
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
  allScenarios,
  colorPalette,
  loading,
  monitorMode,
  onScenarioIdsChange,
  requestedAt,
  refreshSeconds,
  selectedScenarioIds,
  snapshots,
}: {
  allScenarios: OccupancyScenario[];
  colorPalette: readonly string[];
  loading: boolean;
  monitorMode: boolean;
  onScenarioIdsChange: (ids: string[]) => void;
  requestedAt: Date | null;
  refreshSeconds: number;
  selectedScenarioIds: string[];
  snapshots: OccupancyScenarioSnapshot[];
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const entries = React.useMemo(
    () => buildOccupancyLiveRaceEntries(snapshots),
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
              <WidgetTitleText fallback="Ranking ao vivo por cenário" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              Ranking da ocupação total neste instante, atualizado no Ao Vivo a
              cada {refreshSeconds} segundos.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-start justify-end">
            {!monitorMode ? (
              <ScenarioScopeDialog
                allScenarios={allScenarios}
                onChange={onScenarioIdsChange}
                selectedIds={selectedScenarioIds}
              />
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-2">
        {loading ? (
          <ChartSkeleton />
        ) : entries.length ? (
          <>
            <EChart
              ariaDescription={`Ranking da ocupação total neste instante, atualizado a cada ${refreshSeconds} segundos.`}
              ariaLabel="Ranking ao vivo por cenário"
              option={option}
              mergeUpdates
              themeMode="explicit"
              className="h-full min-h-0 w-full flex-1"
            />
            {requestedAt ? (
              <div className="text-[11px] text-muted-foreground">
                Mesmo instante consultado: {formatDateTime(requestedAt)}.
              </div>
            ) : null}
          </>
        ) : (
          <EmptyComparisonState text="Nenhum cenário foi selecionado para o ranking ao vivo." />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyScenarioMaximumLineCard({
  allScenarios,
  buckets,
  colorPalette,
  currentBucket = null,
  currentSnapshots = [],
  currentSeries = [],
  granularity,
  loading,
  monitorMode,
  monthlySourceBuckets = [],
  onScenarioIdsChange,
  refreshSeconds,
  selectedScenarioIds,
  series,
}: {
  allScenarios: OccupancyScenario[];
  buckets: Date[];
  colorPalette: readonly string[];
  currentBucket?: Date | null;
  currentSnapshots?: OccupancyScenarioSnapshot[];
  currentSeries?: OccupancyScenarioOpenMaximumSeries[];
  granularity: OccupancyMaximumLineGranularity;
  loading: boolean;
  monitorMode: boolean;
  monthlySourceBuckets?: Date[];
  onScenarioIdsChange: (ids: string[]) => void;
  refreshSeconds?: number;
  selectedScenarioIds: string[];
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
        buckets,
        currentBucket,
        currentSnapshots,
        currentSeries,
        granularity,
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
      monthlySourceBuckets,
      series,
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
  const title = maximumLineTitle(granularity);

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
              {maximumLineDescription(granularity)}
            </CardDescription>
          </div>
          {!monitorMode ? (
            <div className="flex shrink-0 items-start justify-end">
              <ScenarioScopeDialog
                allScenarios={allScenarios}
                onChange={onScenarioIdsChange}
                selectedIds={selectedScenarioIds}
              />
            </div>
          ) : null}
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
              ariaDescription={maximumLineDescription(granularity)}
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
  allScenarios,
  capacities,
  colorPalette,
  columns,
  defaultScenarioIds,
  displayMode,
  layout,
  loading,
  monitorMode,
  onSettingsChange,
  paletteId,
  preset,
  scenarios,
  snapshots,
  statusColors,
}: {
  allScenarios: OccupancyScenario[];
  capacities: Record<string, number>;
  colorPalette: readonly string[];
  columns: number;
  defaultScenarioIds: string[];
  displayMode: OccupancyWidgetSettings["hexDisplayMode"];
  layout: OccupancyWidgetSettings["hexLayout"];
  loading: boolean;
  monitorMode: boolean;
  onSettingsChange: (patch: Partial<OccupancyWidgetSettings>) => boolean;
  paletteId: OccupancyWidgetSettings["hexColorPaletteId"];
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
              <WidgetTitleText fallback="Simulador operacional hexagonal" />
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {displayMode === "actual"
                ? "Valor real: o hexágono interno cresce com a ocupação e percorre uma escala contínua de cor."
                : "Estado operacional: cada posição mostra ocupado (> 0) ou desocupado (= 0) com o mesmo peso visual."}
            </CardDescription>
          </div>
          {!monitorMode ? (
            <div className="flex shrink-0 items-start justify-end">
              <OccupancyHexLayoutEditor
                capacities={capacities}
                defaultScenarioIds={defaultScenarioIds}
                displayMode={displayMode}
                fallbackColor={colorPalette[0]}
                legacyColumns={columns}
                legacyPreset={preset}
                layout={layout}
                onSave={onSettingsChange}
                scenarios={allScenarios}
                semanticColors={statusColors}
                snapshots={snapshots}
              />
            </div>
          ) : null}
          <div className="col-span-full min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2 @xl:justify-end">
              <Badge variant="outline">
                {stateCounts.occupied} ocupados (&gt; 0)
              </Badge>
              <Badge variant="outline">
                {stateCounts.unoccupied} desocupados (= 0)
              </Badge>
              <Badge variant="secondary">
                {positions.length} posições · {occupancyHexDensityLabel(viewport.density)}
              </Badge>
            </div>
          </div>
          {!monitorMode ? (
            <div className="col-span-full grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11.875rem),1fr))] items-center gap-2">
                <Select
                  value={displayMode}
                  onValueChange={(hexDisplayMode) =>
                    onSettingsChange({
                      hexDisplayMode:
                        hexDisplayMode as OccupancyWidgetSettings["hexDisplayMode"],
                    })
                  }
                >
                  <SelectTrigger
                    aria-label="Modo de visualização do simulador hexagonal"
                    className="h-8 w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actual">Valor real (gradual)</SelectItem>
                    <SelectItem value="status">Ocupado / desocupado</SelectItem>
                  </SelectContent>
                </Select>
                {displayMode === "actual" ? (
                  <OccupancyPaletteSelect
                    ariaLabel="Paleta de cores do simulador hexagonal"
                    className="w-full min-w-0 @sm:w-full"
                    value={paletteId}
                    onValueChange={(hexColorPaletteId) => {
                      onSettingsChange({ hexColorPaletteId });
                    }}
                  />
                ) : (
                  <OccupancyStatusColorsDialog
                    ariaLabel="Configurar cores de estado do simulador hexagonal"
                    buttonLabel="Cores do hex"
                    colors={statusColors}
                    dialogDescription="Defina exclusivamente as cores de ocupado e desocupado usadas pelo simulador hexagonal. Esta escolha não altera a comparação atual por cenário."
                    dialogTitle="Cores de estado do simulador hexagonal"
                    onChange={(hexStatusColors) => {
                      onSettingsChange({ hexStatusColors });
                    }}
                    successMessage="Cores do simulador hexagonal atualizadas."
                  />
                )}
            </div>
          ) : null}
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
  allScenarios,
  buckets,
  colorPalette,
  dayCount,
  loading,
  maximum,
  metric,
  monitorMode,
  onDayCountChange,
  onMetricChange,
  onScenarioChange,
  onScenarioIdsChange,
  scenarioId,
  selectedScenarioIds,
  series,
}: {
  allScenarios: OccupancyScenario[];
  buckets: Date[];
  colorPalette: readonly string[];
  dayCount: 7 | 14 | 30;
  loading: boolean;
  maximum: number;
  metric: OccupancyComparisonMetricKey;
  monitorMode: boolean;
  onDayCountChange: (days: 7 | 14 | 30) => void;
  onMetricChange: (metric: OccupancyComparisonMetricKey) => void;
  onScenarioChange: (id: string) => void;
  onScenarioIdsChange: (ids: string[]) => void;
  scenarioId: string;
  selectedScenarioIds: string[];
  series: OccupancyScenarioHourlySeries[];
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const selectedSeries = series.find((item) => item.scenarioId === scenarioId);
  const matrix = React.useMemo(
    () =>
      selectedSeries
        ? buildDaysHoursOccupancyCells({
            buckets,
            metric,
            scenario: selectedSeries,
          })
        : { cells: [], dayKeys: [] },
    [buckets, metric, selectedSeries],
  );
  const dayLabels = matrix.dayKeys.map(formatHeatmapDateKey);
  const option = React.useMemo(
    () =>
      buildHeatmapOption({
        cells: matrix.cells,
        maximum,
        metric,
        theme: effectiveTheme,
        widgetColor,
        xLabels: dayLabels,
        yLabels: OCCUPANCY_FIXED_HOUR_LABELS,
      }),
    [dayLabels, effectiveTheme, matrix.cells, maximum, metric, widgetColor],
  );

  return (
    <OccupancyHeatmapCardShell
      allScenarios={allScenarios}
      description={`Últimos ${dayCount} dias do cenário escolhido; o valor zero permanece visível e a ausência fica cinza.`}
      fallbackColor={colorPalette[0]}
      icon={<Grid3X3 className="h-4 w-4 shrink-0 text-primary" />}
      loading={loading}
      metric={metric}
      monitorMode={monitorMode}
      onMetricChange={onMetricChange}
      onScenarioIdsChange={onScenarioIdsChange}
      selectedScenarioIds={selectedScenarioIds}
      title="Ocupação por dias x horários"
      controls={
        !monitorMode ? (
          <>
            <Select value={scenarioId} onValueChange={onScenarioChange}>
              <SelectTrigger
                aria-label="Cenário do mapa de calor por dias e horários"
                className="h-8 w-full min-w-0"
              >
                <SelectValue placeholder="Cenário" />
              </SelectTrigger>
              <SelectContent>
                {series.map((item) => (
                  <SelectItem key={item.scenarioId} value={item.scenarioId}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(dayCount)}
              onValueChange={(value) => onDayCountChange(Number(value) as 7 | 14 | 30)}
            >
              <SelectTrigger
                aria-label="Período do mapa de calor por dias e horários"
                className="h-8 w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : null
      }
    >
      {matrix.cells.length ? (
        <EChart
          ariaDescription={`Mapa de ${metricLabel(metric)} nas 24 horas dos últimos ${dayCount} dias para o cenário selecionado.`}
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
  allScenarios,
  buckets,
  colorPalette,
  dateKey,
  dateKeys,
  loading,
  maximum,
  metric,
  monitorMode,
  onDateKeyChange,
  onMetricChange,
  onScenarioIdsChange,
  selectedScenarioIds,
  series,
}: {
  allScenarios: OccupancyScenario[];
  buckets: Date[];
  colorPalette: readonly string[];
  dateKey: string;
  dateKeys: string[];
  loading: boolean;
  maximum: number;
  metric: OccupancyComparisonMetricKey;
  monitorMode: boolean;
  onDateKeyChange: (dateKey: string) => void;
  onMetricChange: (metric: OccupancyComparisonMetricKey) => void;
  onScenarioIdsChange: (ids: string[]) => void;
  selectedScenarioIds: string[];
  series: OccupancyScenarioHourlySeries[];
}) {
  const widgetColor = useWidgetColor(colorPalette[0]);
  const { effectiveTheme } = useTheme();
  const matrix = React.useMemo(
    () =>
      dateKey
        ? buildScenariosHoursOccupancyCells({
            buckets,
            dateKey,
            metric,
            series,
          })
        : { cells: [], scenarioNames: [] },
    [buckets, dateKey, metric, series],
  );
  const option = React.useMemo(
    () =>
      buildHeatmapOption({
        cells: matrix.cells,
        maximum,
        metric,
        theme: effectiveTheme,
        widgetColor,
        xLabels: matrix.scenarioNames,
        yLabels: OCCUPANCY_FIXED_HOUR_LABELS,
      }),
    [
      effectiveTheme,
      matrix.cells,
      matrix.scenarioNames,
      maximum,
      metric,
      widgetColor,
    ],
  );

  return (
    <OccupancyHeatmapCardShell
      allScenarios={allScenarios}
      description="Compara cada cenário nas 24 horas da data escolhida, sem somar cenários nem preencher lacunas com zero."
      fallbackColor={colorPalette[0]}
      icon={<Grid3X3 className="h-4 w-4 shrink-0 text-primary" />}
      loading={loading}
      metric={metric}
      monitorMode={monitorMode}
      onMetricChange={onMetricChange}
      onScenarioIdsChange={onScenarioIdsChange}
      selectedScenarioIds={selectedScenarioIds}
      title="Ocupação por cenários x horários"
      controls={
        !monitorMode && dateKey ? (
          <Input
            aria-label="Data do mapa de calor por cenário"
            className="h-8 w-full min-w-0"
            min={dateKeys[0]}
            max={dateKeys[dateKeys.length - 1]}
            type="date"
            value={dateKey}
            onChange={(event) => {
              if (dateKeys.includes(event.target.value)) {
                onDateKeyChange(event.target.value);
              }
            }}
          />
        ) : null
      }
    >
      {matrix.cells.length ? (
        <EChart
          ariaDescription={`Mapa de ${metricLabel(metric)} por cenário e por hora na data selecionada.`}
          ariaLabel="Ocupação por cenários e horários"
          option={option}
          themeMode="explicit"
          className="h-full min-h-0 w-full"
        />
      ) : (
        <EmptyComparisonState text="Nenhuma célula horária está disponível para a data." />
      )}
    </OccupancyHeatmapCardShell>
  );
}

function OccupancyHeatmapCardShell({
  allScenarios,
  children,
  controls,
  description,
  fallbackColor,
  icon,
  loading,
  metric,
  monitorMode,
  onMetricChange,
  onScenarioIdsChange,
  selectedScenarioIds,
  title,
}: {
  allScenarios: OccupancyScenario[];
  children: React.ReactNode;
  controls: React.ReactNode;
  description: string;
  fallbackColor: string;
  icon: React.ReactNode;
  loading: boolean;
  metric: OccupancyComparisonMetricKey;
  monitorMode: boolean;
  onMetricChange: (metric: OccupancyComparisonMetricKey) => void;
  onScenarioIdsChange: (ids: string[]) => void;
  selectedScenarioIds: string[];
  title: string;
}) {
  const widgetColor = useWidgetColor(fallbackColor);
  const { effectiveTheme } = useTheme();
  const heatmapColors = React.useMemo(
    () => occupancyHeatmapPalette(widgetColor, effectiveTheme),
    [effectiveTheme, widgetColor],
  );
  const missingColor = effectiveTheme === "dark" ? "#273244" : "#E2E8F0";
  return (
    <Card className="@container flex h-full min-w-0 flex-col overflow-hidden">
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
          </div>
          {!monitorMode ? (
            <div className="flex shrink-0 items-start justify-end">
              <ScenarioScopeDialog
                allScenarios={allScenarios}
                onChange={onScenarioIdsChange}
                selectedIds={selectedScenarioIds}
              />
            </div>
          ) : null}
          {!monitorMode ? (
            <div className="col-span-full grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-center gap-2">
              {controls}
              <MetricSelect onChange={onMetricChange} value={metric} />
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          {loading ? <Skeleton className="h-full min-h-0 w-full flex-1" /> : children}
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
            {metricLabel(metric)}
          </span>
          <LegendDot color={missingColor} label="Sem dados" />
          <span>Escala comum aos dois mapas.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioScopeDialog({
  allScenarios,
  onChange,
  selectedIds,
}: {
  allScenarios: OccupancyScenario[];
  onChange: (ids: string[]) => void;
  selectedIds: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const selected = new Set(selectedIds);
  const activeIds = allScenarios
    .filter((scenario) => scenario.active)
    .map((scenario) => scenario.id);

  function toggleScenario(id: string) {
    if (selected.has(id)) {
      if (selected.size === 1) return;
      onChange(selectedIds.filter((candidate) => candidate !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 gap-1.5 px-0 @sm:w-auto @sm:px-3"
          aria-label={`Selecionar cenários compartilhados da visão: ${selectedIds.length} selecionados`}
          title={`${selectedIds.length} cenários compartilhados da visão`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="sr-only @sm:not-sr-only">
            {selectedIds.length} cenários da visão
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cenários compartilhados da visão</DialogTitle>
          <DialogDescription>
            A seleção é compartilhada pelos widgets comparativos desta visão e salva por
            cenário, empresa e usuário.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!activeIds.length}
            onClick={() => onChange(activeIds)}
          >
            Todos ativos
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!allScenarios.length}
            onClick={() => onChange(allScenarios.map((scenario) => scenario.id))}
          >
            Todos
          </Button>
        </div>
        <div className="min-h-0 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {allScenarios.map((scenario) => {
            const checked = selected.has(scenario.id);
            return (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={checked}
                onClick={() => toggleScenario(scenario.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  checked
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {scenario.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {!scenario.active ? (
                    <Badge variant="outline">inativo</Badge>
                  ) : null}
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {checked ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricSelect({
  onChange,
  value,
}: {
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
        className="h-8 w-full min-w-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="average">Média horária</SelectItem>
        <SelectItem value="peak">Pico horário</SelectItem>
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
          <LegendDot color={palette.occupied} label="Ocupado > 0" />
          <span className="break-words [overflow-wrap:anywhere]">
            hexágono preenchido com peso visual uniforme
          </span>
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <LegendDot color={palette.zero} label="Desocupado = 0" />
          <span className="break-words [overflow-wrap:anywhere]">
            o valor zero continua visível e distinto
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
    <div className="flex h-full min-h-0 min-w-0 flex-1 self-stretch items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 px-3 text-center text-xs text-muted-foreground @sm:px-4 @sm:text-sm">
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
        : `${entry.indexLabel} ${entry.name}: ocupação ${formatChartNumber(
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
            ? data?.state === "occupied"
              ? "Critério: ocupação maior que zero"
              : "Critério: ocupação igual a zero"
            : `Ocupação atual: ${formatChartNumber(data?.occupancy ?? 0)}`,
          mode === "actual"
            ? `Participação: ${formatChartNumber(data?.percentage ?? 0)}%`
            : null,
          mode === "status"
            ? "Fatia com peso unitário; o zero não foi convertido em ocupação"
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
  const maximum = Math.max(
    1,
    ...indexedEntries.map((entry) => entry.chartValue),
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
      return `${entry.indexLabel} ${entry.name}: ocupação ${formatChartNumber(
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
                  : "Ocupado > 0"
                : compactLayout
                  ? "Desocupado"
                  : "Desocupado = 0";
            }
            return `${formatChartNumber(data.total)} · ${formatChartNumber(
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
            ? "Sem dados; ausência não é ocupação zero"
            : `Ocupação atual: ${formatChartNumber(data.total)}`,
          data.state === "unknown"
            ? null
            : `Estado: ${
                data.state === "occupied" ? "Ocupado > 0" : "Desocupado = 0"
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
        show: mode === "actual",
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      max: mode === "status" ? 1 : maximum,
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
  const maximum = Math.max(
    1,
    ...indexedEntries.map((entry) => entry.chartValue),
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
      return `${entry.indexLabel} ${entry.name}: ocupação ${formatChartNumber(
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
            const total = formatChartNumber(data.total);
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
            ? "Sem dados; ausência não é ocupação zero"
            : `Ocupação atual: ${formatChartNumber(data.total)}`,
          data.state === "unknown"
            ? null
            : `Estado: ${
                data.state === "occupied" ? "Ocupado > 0" : "Desocupado = 0"
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
        show: mode === "actual",
      },
      axisLine: { show: false },
      axisTick: { show: false },
      max: mode === "status" ? 1 : maximum,
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
            return value === null ? "—" : formatChartNumber(value);
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
            : `Ocupação atual: ${formatChartNumber(value)}`
        }`;
      },
      textStyle: { color: chartPalette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: { color: chartPalette.axisText, fontSize: 10 },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      max: "dataMax",
      min: 0,
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
  buckets,
  currentBucket,
  currentSnapshots,
  currentSeries,
  granularity,
  monthlySourceBuckets,
  scenarios,
  series,
}: {
  buckets: Date[];
  currentBucket: Date | null;
  currentSnapshots: OccupancyScenarioSnapshot[];
  currentSeries: OccupancyScenarioOpenMaximumSeries[];
  granularity: OccupancyMaximumLineGranularity;
  monthlySourceBuckets: Date[];
  scenarios: OccupancyScenario[];
  series: OccupancyScenarioHourlySeries[];
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
        ? occupancySnapshotTotalWithinHour(currentSnapshot, currentBucket)
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
    const annualPoints =
      granularity === "year"
        ? buildOccupancyAnnualMaximumPoints({
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
            ? [currentBucket.getHours()]
            : granularity === "month" && buckets.length
              ? [buckets.length - 1]
              : [],
      scenarioId: scenario.scenarioId,
      values:
        granularity === "year"
          ? (annualPoints?.map((point) => point.value) ?? [])
          : granularity === "hour"
            ? buildOccupancyFixedHourlyPeakValues({
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
) {
  if (granularity === "hour") {
    return "Maior ocupação de cada hora de hoje em eixo fixo de 00h a 24h; a hora em andamento combina minutos encerrados e a leitura do Ao Vivo.";
  }
  if (granularity === "month") {
    return "Maior ocupação disponível de cada mês nos últimos 12 meses.";
  }
  return "Maior pico observado em cada um dos últimos 5 anos; anos fechados exigem cobertura completa e o ano atual aparece como parcial.";
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
    const showValue = preferences.showValues && outerRadius >= 11;
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
            : `Mapa operacional com ${positions.length} posições. Cores no contexto ${preferences.semanticLabel}. Ocupado significa valor maior que zero; desocupado significa valor zero.`,
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
  maximum,
  metric,
  theme,
  widgetColor,
  xLabels,
  yLabels,
}: {
  cells: OccupancyHeatmapCell[];
  maximum: number;
  metric: OccupancyComparisonMetricKey;
  theme: "dark" | "light";
  widgetColor: string;
  xLabels: string[];
  yLabels: string[];
}): EnterpriseChartOption {
  const chartPalette = getOccupancyChartPalette(theme);
  const cellBorderColor =
    theme === "dark"
      ? "rgba(226, 232, 240, 0.12)"
      : "rgba(15, 23, 42, 0.09)";
  const activeCellBorderColor =
    theme === "dark"
      ? "rgba(248, 250, 252, 0.24)"
      : "rgba(15, 23, 42, 0.20)";
  const activeCellShadowColor =
    theme === "dark"
      ? "rgba(248, 250, 252, 0.12)"
      : "rgba(15, 23, 42, 0.14)";
  const missingColor = theme === "dark" ? "#273244" : "#E2E8F0";
  const missing = cells
    .filter((cell) => cell.value === null)
    .map((cell) => [cell.x, cell.y, -1]);
  const certified = cells
    .filter((cell): cell is OccupancyHeatmapCell & { value: number } =>
      cell.value !== null,
    )
    .map((cell) => [cell.x, cell.y, cell.value]);
  return {
    animation: false,
    grid: { bottom: 72, containLabel: true, left: 18, right: 18, top: 18 },
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
        name: metricLabel(metric),
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
          `<strong>${escapeTooltip(xLabels[x] ?? "Categoria")} · ${escapeTooltip(
            yLabels[y] ?? "Hora",
          )}</strong>`,
          record.seriesName === "Sem dados" || amount < 0
            ? "Sem dados"
            : `${metricLabel(metric)}: ${formatChartNumber(amount)}`,
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
        formatter: (label: string) =>
          truncateLabel(label, xLabels.length > 14 ? 10 : 18),
        hideOverlap: true,
        interval: xLabels.length > 18 ? 1 : 0,
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
        formatter: (label: string) => truncateLabel(label, 24),
        interval: 0,
      },
      axisLine: { lineStyle: { color: chartPalette.axisLine } },
      axisTick: { show: false },
      data: yLabels,
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
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

function occupancyHistoryPath(scenarioId: string, at: Date) {
  const params = new URLSearchParams({ at: at.toISOString() });
  return `/occupancy/scenarios/${scenarioId}/history?${params.toString()}`;
}

function occupancyAggregatePath(
  scenarioId: string,
  from: Date,
  to: Date,
  granularity: "minute" | "hour" | "month" = "hour",
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(from, granularity),
    granularity,
    to: aggregateQueryIso(to, granularity),
  });
  return `/occupancy/scenarios/${scenarioId}/aggregate?${params.toString()}`;
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
): {
  covered: boolean;
  series: OccupancyScenarioHourlySeries | null;
} {
  if (
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

function metricLabel(metric: OccupancyComparisonMetricKey) {
  return metric === "peak" ? "Pico horário" : "Média horária";
}

function occupancyStateLabel(state: OccupancyHexPosition["state"]) {
  if (state === "unlinked") return "sem cenário vinculado";
  if (state === "unavailable") return "cenário indisponível";
  if (state === "occupied") return "ocupado (> 0)";
  if (state === "unoccupied") return "desocupado (= 0)";
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
