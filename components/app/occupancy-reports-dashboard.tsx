"use client";

import * as React from "react";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Gauge,
  MapPinned,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { OccupancyBlockingState } from "@/components/app/occupancy-blocking-state";
import {
  OccupancyDateRangePicker,
  formatOccupancyAnalysisRangeLabel,
} from "@/components/app/occupancy-date-range-picker";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import {
  getOccupancyChartPalette,
  type OccupancyChartPalette,
} from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
import { WidgetTitleText } from "@/components/app/widget-appearance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { hasVisualAdminAccess } from "@/lib/access";
import {
  aggregateQueryIso,
  endOfAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  loadOccupancyAnalysisDateRange,
  normalizeOccupancyAnalysisDateRangeInput,
  occupancyAnalysisDatasetKey,
  resolveOccupancyAnalysisRange,
  saveOccupancyAnalysisDateRange,
  type ResolvedOccupancyAnalysisRange,
} from "@/lib/occupancy-analysis-window";
import {
  buildOccupancyAnalysisResolutionPlan,
  occupancyAnalysisClosedSegmentRevision,
  type OccupancyAnalysisResolutionGranularity,
  type OccupancyAnalysisResolutionPlan,
  type OccupancyAnalysisResolutionSegment,
} from "@/lib/occupancy-analysis-resolution";
import {
  CAMERA_GROUPS_UPDATED_EVENT,
  type CameraGroup,
  buildLocationCameraOptions,
  buildSubLocationCameraOptions,
  readCameraGroups,
  resolveCameraGroupCompanyScope,
} from "@/lib/camera-groups";
import {
  loadLiveDashboardSettings,
  saveLiveDashboardSettings,
  type IntradayComparisonMode,
} from "@/lib/live-dashboard-settings";
import {
  filterScopedApiRows,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import {
  companyDateKey,
  endOfCompanyTimeZoneHour,
  requireCertifiedRuntimeCompanyTimeZone,
  requireRuntimeCompanyTimeZone,
  startOfCompanyTimeZoneDay,
  startOfCompanyTimeZoneHour,
} from "@/lib/company-time-zone";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  occupancyAggregateBucketKey,
  occupancyAggregateCoverageWarning,
  occupancyAggregateMetadataWarning,
  resolveCertifiedOccupancyDataCutoff,
  requireOccupancyAggregateRows,
} from "@/lib/occupancy-aggregate-validation";
import {
  buildFixedOccupancyHourlyPoints,
  occupancyFixedHourLabelInterval,
} from "@/lib/occupancy-hour-axis";
import {
  emptyOccupancyMetric,
} from "@/lib/occupancy-metrics";
import {
  DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS,
  loadOccupancyDashboardSettings,
  saveOccupancyDashboardSettings,
  type OccupancyMetricVisibility,
} from "@/lib/occupancy-dashboard-settings";
import { occupancyComparisonBucketStarts } from "@/lib/occupancy-report-comparison";
import {
  requireOccupancyHistoryResponse,
  requireOccupancyScenarioRows,
  requireOccupancySnapshotRows,
  type CertifiedOccupancyRow,
} from "@/lib/occupancy-validation";
import type {
  AggregateGranularity,
  Camera,
  Location,
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioBucketRow,
  SubLocation,
} from "@/lib/types";
import type {
  ReportMetric,
  ReportPayload,
  ReportTable,
} from "@/lib/report-export";
import type { CardPreference } from "@/lib/view-preferences";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

type OccupancyReportScopeMode = "scenario" | "location" | "sub_location";

type OccupancyReportScope = {
  cameraIds: string[];
  description: string;
  id: string;
  mode: OccupancyReportScopeMode;
  name: string;
  group?: CameraGroup;
  location?: Location;
  parentName?: string;
  scenario?: OccupancyScenario;
  subLocation?: SubLocation;
};

type OccupancyReportDefinition = {
  bucketStarts?: Date[];
  id: string;
  label: string;
  description: string;
  granularity: Extract<
    AggregateGranularity,
    "minute" | "hour" | "day" | "week" | "month" | "semester" | "year"
  >;
  from: Date;
  openBucket?: Date;
  querySegments?: OccupancyReportQuerySegment[];
  resolutionLabel?: string;
  to: Date;
};

type OccupancyReportQuerySegment = {
  bucketStarts: Date[];
  from: Date;
  granularity: OccupancyReportDefinition["granularity"];
  openBucket?: Date;
  to: Date;
};

type OccupancyReportsDashboardProps = {
  analysis?: boolean;
  manager?: boolean;
};

type OccupancyReportPoint = {
  bucket: string;
  label: string;
  average: number | null;
  current: number | null;
  minimum: number | null;
  peak: number | null;
};

type OccupancyReportState = {
  points: OccupancyReportPoint[];
  asOf?: string;
  error?: string;
  warning?: string;
};

type OccupancyReportMetric = {
  average: number | null;
  current: number | null;
  minimum: number | null;
  peak: number | null;
};

type CertifiedCurrentSnapshot = {
  asOf: string;
  total: number;
};

type OccupancyLoadResult<T> = {
  data: T | null;
  error: string;
};

type OccupancyReportMarkerDefinition = {
  color: string;
  data: Array<number | null>;
  effect?: boolean;
  fill: string;
  name: string;
  offset?: [number, number];
  size: number | [number, number];
  symbol: string;
  z: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BUCKET_CONCURRENCY = 8;
const MAX_CLOSED_SEGMENT_CACHE_ENTRIES = 256;
const REPORT_REFRESH_MS = 60_000;
const DEFAULT_OBJECT_CLASS = "person";
const EMPTY_OCCUPANCY_REPORT_DATA: Record<string, OccupancyReportState> = {};

export function OccupancyReportsDashboard({
  analysis = false,
  manager = false,
}: OccupancyReportsDashboardProps) {
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const companyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const companyTimeZone = companyTimeZoneResolution.timeZone;
  const canEditVisual = hasVisualAdminAccess(user);
  const scopeModeSelectId = React.useId();
  const scopeSelectId = React.useId();
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [cameras, setCameras] = React.useState<Camera[]>([]);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [subLocations, setSubLocations] = React.useState<SubLocation[]>([]);
  const [cameraGroups, setCameraGroups] = React.useState<CameraGroup[]>([]);
  const [scopeMode, setScopeMode] =
    React.useState<OccupancyReportScopeMode>("scenario");
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, OccupancyReportState>
  >({});
  const [chartDataScopeKey, setChartDataScopeKey] = React.useState("");
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState(
    () => loadLiveDashboardSettings(companyScopeId).showPreviousPeriod,
  );
  const [intradayComparison, setIntradayComparison] =
    React.useState<IntradayComparisonMode>(
      () => loadLiveDashboardSettings(companyScopeId).intradayComparison,
    );
  const metricVisibilityScopeKey = `${companyScopeId}|${user?.id ?? ""}|${
    analysis ? "analysis" : "reports"
  }`;
  const [metricVisibilityState, setMetricVisibilityState] = React.useState(
    () => ({
      scopeKey: metricVisibilityScopeKey,
      value: loadOccupancyDashboardSettings(
        companyScopeId,
        user?.id,
        analysis ? "analysis" : "reports",
      ).metricVisibility,
    }),
  );
  const metricVisibility =
    metricVisibilityState.scopeKey === metricVisibilityScopeKey
      ? metricVisibilityState.value
      : DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility;
  const setMetricVisibility = React.useCallback(
    (value: React.SetStateAction<OccupancyMetricVisibility>) =>
      setMetricVisibilityState((current) => {
        const base =
          current.scopeKey === metricVisibilityScopeKey
            ? current.value
            : DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility;
        return {
          scopeKey: metricVisibilityScopeKey,
          value: typeof value === "function" ? value(base) : value,
        };
      }),
    [metricVisibilityScopeKey],
  );
  const [loadingScopes, setLoadingScopes] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [chartLoadError, setChartLoadError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [currentSnapshot, setCurrentSnapshot] =
    React.useState<CertifiedCurrentSnapshot | null>(null);
  const [currentSnapshotError, setCurrentSnapshotError] = React.useState("");
  const [clock, setClock] = React.useState(() => new Date());
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = React.useState(false);
  const [layoutPreferences, setLayoutPreferences] = React.useState<
    CardPreference[]
  >([]);
  const [analysisRangeInput, setAnalysisRangeInput] = React.useState(() => {
    const todayInput = companyDateKey(new Date(), companyTimeZone);
    return { endInput: todayInput, startInput: todayInput };
  });
  const metadataRequestSequenceRef = React.useRef(0);
  const chartRequestSequenceRef = React.useRef(0);
  const chartAbortControllerRef = React.useRef<AbortController | null>(null);
  const closedSegmentCacheRef = React.useRef(
    new Map<string, OccupancyReportState>(),
  );

  const companyTodayInput = React.useMemo(
    () => companyDateKey(clock, companyTimeZone),
    [clock, companyTimeZone],
  );
  const reportRange = React.useMemo(
    () =>
      resolveOccupancyAnalysisRange(
        clock,
        analysisRangeInput.startInput,
        analysisRangeInput.endInput,
        analysis,
        companyTodayInput,
      ),
    [analysis, analysisRangeInput, clock, companyTodayInput],
  );
  const analysisIncludesToday = !analysis || reportRange.includesToday;
  const definitions = React.useMemo(
    () =>
      buildOccupancyReportDefinitions(
        reportRange.reference,
        analysisIncludesToday ? clock : undefined,
        analysis,
        analysis ? reportRange : undefined,
        companyTimeZone,
      ),
    [analysis, analysisIncludesToday, clock, companyTimeZone, reportRange],
  );
  const availableModes = React.useMemo(
    () => buildAvailableScopeModes(scenarios),
    [scenarios],
  );
  const scopeOptions = React.useMemo(
    () =>
      buildOccupancyReportScopes({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        mode: scopeMode,
        scenarios,
        subLocations,
      }),
    [
      cameraGroups,
      cameras,
      locations,
      manager,
      scenarios,
      scopeMode,
      subLocations,
    ],
  );
  const selectedScope = React.useMemo(
    () => scopeOptions.find((scope) => scope.id === selectedId) ?? null,
    [scopeOptions, selectedId],
  );
  const requestedChartScopeKey = React.useMemo(
    () =>
      occupancyAnalysisDatasetKey({
        analysis,
        companyScopeId,
        endDateInput: analysisRangeInput.endInput,
        intradayComparison,
        scopeId: selectedScope?.id,
        showPreviousPeriod,
        startDateInput: analysisRangeInput.startInput,
        timeZone: companyTimeZone,
      }),
    [
      analysis,
      analysisRangeInput.endInput,
      analysisRangeInput.startInput,
      companyScopeId,
      companyTimeZone,
      intradayComparison,
      selectedScope?.id,
      showPreviousPeriod,
    ],
  );
  const requestedChartScopeKeyRef = React.useRef(requestedChartScopeKey);
  React.useLayoutEffect(() => {
    if (requestedChartScopeKeyRef.current === requestedChartScopeKey) return;
    requestedChartScopeKeyRef.current = requestedChartScopeKey;
    chartRequestSequenceRef.current += 1;
    chartAbortControllerRef.current?.abort();
    chartAbortControllerRef.current = null;
  }, [requestedChartScopeKey]);
  const chartDataIsCurrent =
    Boolean(selectedScope) && chartDataScopeKey === requestedChartScopeKey;
  const visibleChartData = chartDataIsCurrent
    ? chartData
    : EMPTY_OCCUPANCY_REPORT_DATA;
  const visibleCurrentSnapshot = chartDataIsCurrent ? currentSnapshot : null;
  const visibleCurrentSnapshotError = chartDataIsCurrent
    ? currentSnapshotError
    : "";
  const visibleLastUpdated = chartDataIsCurrent ? lastUpdated : null;
  const chartsPending =
    loadingCharts || Boolean(selectedScope && !chartDataIsCurrent);
  const rangeMetric = React.useMemo(
    () =>
      summarizeOccupancyRangeMetrics(
        visibleChartData.occupancy_report_day?.points ?? [],
      ),
    [visibleChartData],
  );
  const rangeMetricState = visibleChartData.occupancy_report_day;
  const rangeMetricError = rangeMetricState?.error ?? "";
  const rangeMetricIncomplete = Boolean(rangeMetricState?.warning);
  const occupancyCertificationError =
    metadataError || (chartDataIsCurrent ? chartLoadError : "");
  const hasPartialOccupancyCoverage = Boolean(
    visibleCurrentSnapshotError ||
      Object.values(visibleChartData).some(
        (state) => state.error || state.warning,
      ),
  );

  const loadScopes = React.useCallback(async () => {
    const requestSequence = ++metadataRequestSequenceRef.current;
    setLoadingScopes(true);
    setMetadataError("");
    try {
      const scenarioResponse = await apiFetch<unknown>(
        "/occupancy/scenarios",
        { companyScopeId },
      );
      const nextScenarios = filterScopedApiRows(
        requireOccupancyScenarioRows(scenarioResponse, companyScopeId),
        companyScopeId,
      );
      const visibleScenarios = manager
        ? nextScenarios
        : nextScenarios.filter((scenario) => scenario.active);
      if (requestSequence !== metadataRequestSequenceRef.current) return;
      setMetadataError("");
      setScenarios(visibleScenarios);
      setCameras([]);
      setLocations([]);
      setSubLocations([]);
      const modes = buildAvailableScopeModes(visibleScenarios);
      const nextMode = modes.some((mode) => mode.value === scopeMode)
        ? scopeMode
        : modes[0]?.value ?? "scenario";
      const options = buildOccupancyReportScopes({
        cameras: [],
        groups: [],
        locations: [],
        manager,
        mode: nextMode,
        scenarios: visibleScenarios,
        subLocations: [],
      });

      if (nextMode !== scopeMode) setScopeMode(nextMode);
      setSelectedId((current) => {
        return current && options.some((option) => option.id === current)
          ? current
          : options[0]?.id ?? "";
      });
    } catch (error) {
      if (requestSequence !== metadataRequestSequenceRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as visões de ocupação.";
      setScenarios([]);
      setCameras([]);
      setLocations([]);
      setSubLocations([]);
      setSelectedId("");
      setChartData({});
      setChartDataScopeKey("");
      setCurrentSnapshot(null);
      setCurrentSnapshotError("");
      setMetadataError(message);
      toast.error(message);
    } finally {
      if (requestSequence === metadataRequestSequenceRef.current) {
        setLoadingScopes(false);
      }
    }
  }, [companyScopeId, manager, scopeMode]);

  const loadCharts = React.useCallback(
    async (
      scope: OccupancyReportScope,
      silent = false,
      forceClosedRefresh = false,
    ): Promise<void> => {
      const requestScopeKey = occupancyAnalysisDatasetKey({
        analysis,
        companyScopeId,
        endDateInput: analysisRangeInput.endInput,
        intradayComparison,
        scopeId: scope.id,
        showPreviousPeriod,
        startDateInput: analysisRangeInput.startInput,
        timeZone: companyTimeZone,
      });
      if (requestScopeKey !== requestedChartScopeKeyRef.current) return;

      if (forceClosedRefresh) closedSegmentCacheRef.current.clear();

      if (silent) setRefreshing(true);
      else setLoadingCharts(true);

      const execute = async (windowRetry: number): Promise<void> => {
        const requestSequence = ++chartRequestSequenceRef.current;
        chartAbortControllerRef.current?.abort();
        const controller = new AbortController();
        chartAbortControllerRef.current = controller;

        const now = new Date();
        const currentRange = resolveOccupancyAnalysisRange(
          now,
          analysisRangeInput.startInput,
          analysisRangeInput.endInput,
          analysis,
          companyDateKey(now, companyTimeZone),
        );
        const usesLiveDay = !analysis || currentRange.includesToday;
        const currentDefinitions = buildOccupancyReportDefinitions(
          currentRange.reference,
          usesLiveDay ? now : undefined,
          analysis,
          analysis ? currentRange : undefined,
          companyTimeZone,
        );
        const definitionsWindowKey = occupancyReportDefinitionsWindowKey(
          currentDefinitions,
        );
        const previousDefinitions = showPreviousPeriod
          ? currentDefinitions.map((definition) =>
              buildComparisonDefinition(definition, intradayComparison),
            )
          : [];

        try {
          requireCertifiedRuntimeCompanyTimeZone(companyTimeZoneResolution);
          const [entries, currentSnapshotResult] = await Promise.all([
            Promise.all(
              [...currentDefinitions, ...previousDefinitions].map(
                async (definition) => {
                  try {
                    const state = await loadOccupancyReportState(
                      definition,
                      scope,
                      companyScopeId,
                      companyTimeZone,
                      now,
                      companyTimeZoneResolution.warning,
                      controller.signal,
                      closedSegmentCacheRef.current,
                    );
                    return [definition.id, state] as const;
                  } catch (error) {
                    return [
                      definition.id,
                      {
                        points: buildEmptyPoints(definition),
                        error:
                          error instanceof Error
                            ? error.message
                            : "Não foi possível carregar este período.",
                      },
                    ] as const;
                  }
                },
              ),
            ),
            scope.scenario
              ? captureOccupancyLoad(
                  apiFetch<unknown>(
                    occupancyScenarioHistoryPath(
                      scope.scenario.id,
                      currentRange.reference,
                    ),
                    { companyScopeId, signal: controller.signal },
                  ).then((response) => {
                    const history = requireOccupancyHistoryResponse(
                      response,
                      scope.scenario!.id,
                      {
                        expectedAreas: scope.scenario!.areas,
                        requestedAt: currentRange.reference,
                      },
                    );
                    return {
                      asOf: history.as_of!,
                      total: history.total,
                    };
                  }),
                  analysis && !usesLiveDay
                    ? "Não foi possível carregar o snapshot final do intervalo."
                    : "Não foi possível carregar o snapshot atual.",
                )
              : Promise.resolve({ data: null, error: "" }),
          ]);

          if (
            controller.signal.aborted ||
            chartAbortControllerRef.current !== controller ||
            requestSequence !== chartRequestSequenceRef.current ||
            requestScopeKey !== requestedChartScopeKeyRef.current
          ) {
            return;
          }

          const latestNow = new Date();
          const latestRange = resolveOccupancyAnalysisRange(
            latestNow,
            analysisRangeInput.startInput,
            analysisRangeInput.endInput,
            analysis,
            companyDateKey(latestNow, companyTimeZone),
          );
          const latestUsesLiveDay = !analysis || latestRange.includesToday;
          const latestDefinitionsWindowKey =
            occupancyReportDefinitionsWindowKey(
              buildOccupancyReportDefinitions(
                latestRange.reference,
                latestUsesLiveDay ? latestNow : undefined,
                analysis,
                analysis ? latestRange : undefined,
                companyTimeZone,
              ),
            );
          if (definitionsWindowKey !== latestDefinitionsWindowKey) {
            if (windowRetry < 1) await execute(windowRetry + 1);
            return;
          }

          const nextChartData = Object.fromEntries(entries) as Record<
            string,
            OccupancyReportState
          >;
          if (usesLiveDay) {
            maskOpenBucketComparisons(
              nextChartData,
              currentDefinitions,
              now,
            );
          }
          const hasSuccessfulSource =
            currentSnapshotResult.data !== null ||
            Object.values(nextChartData).some((state) => !state.error);
          setChartData(nextChartData);
          setChartDataScopeKey(requestScopeKey);
          setCurrentSnapshot(currentSnapshotResult.data);
          setCurrentSnapshotError(currentSnapshotResult.error);
          setChartLoadError("");
          setClock(now);
          if (hasSuccessfulSource) setLastUpdated(new Date());
          if (currentSnapshotResult.error && !silent) {
            toast.error(
              analysis && !usesLiveDay
                ? "O snapshot final do intervalo não pôde ser carregado."
                : "O snapshot atual não pôde ser carregado.",
            );
          }
        } catch (error) {
          if (
            controller.signal.aborted ||
            chartAbortControllerRef.current !== controller ||
            requestSequence !== chartRequestSequenceRef.current ||
            requestScopeKey !== requestedChartScopeKeyRef.current
          ) {
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os relatórios de ocupação.";
          setChartData({});
          setChartDataScopeKey(requestScopeKey);
          setChartLoadError(message);
          setCurrentSnapshot(null);
          setCurrentSnapshotError(message);
          toast.error(message);
        } finally {
          if (chartAbortControllerRef.current === controller) {
            chartAbortControllerRef.current = null;
          }
          if (requestSequence === chartRequestSequenceRef.current) {
            setLoadingCharts(false);
            setRefreshing(false);
          }
        }
      };

      await execute(0);
    },
    [
      analysis,
      analysisRangeInput.endInput,
      analysisRangeInput.startInput,
      companyScopeId,
      companyTimeZone,
      companyTimeZoneResolution,
      intradayComparison,
      showPreviousPeriod,
    ],
  );

  const retryOccupancyData = React.useCallback(() => {
    void loadScopes();
    if (selectedScope) {
      void loadCharts(selectedScope, true, true);
    }
  }, [loadCharts, loadScopes, selectedScope]);

  React.useEffect(() => {
    loadScopes();
  }, [loadScopes]);

  React.useEffect(() => {
    chartRequestSequenceRef.current += 1;
    chartAbortControllerRef.current?.abort();
    chartAbortControllerRef.current = null;
    closedSegmentCacheRef.current.clear();
    const settings = loadLiveDashboardSettings(companyScopeId);
    setMetadataError("");
    setChartLoadError("");
    setScenarios([]);
    setCameras([]);
    setLocations([]);
    setSubLocations([]);
    setSelectedId("");
    setShowPreviousPeriod(settings.showPreviousPeriod);
    setIntradayComparison(settings.intradayComparison);
    setMetricVisibilityState({
      scopeKey: metricVisibilityScopeKey,
      value: loadOccupancyDashboardSettings(
        companyScopeId,
        user?.id,
        analysis ? "analysis" : "reports",
      ).metricVisibility,
    });
    setChartData({});
    setChartDataScopeKey("");
    setCurrentSnapshot(null);
    setCurrentSnapshotError("");
    setLastUpdated(null);
    setLoadingCharts(false);
    setRefreshing(false);
    const now = new Date();
    setAnalysisRangeInput(
      loadOccupancyAnalysisDateRange(
        companyDateKey(now, companyTimeZone),
        companyScopeId,
        user?.id,
      ),
    );
  }, [
    analysis,
    companyScopeId,
    companyTimeZone,
    metricVisibilityScopeKey,
    user?.id,
  ]);

  React.useEffect(() => {
    return () => chartAbortControllerRef.current?.abort();
  }, []);

  React.useEffect(() => {
    function syncCameraGroups() {
      const scopeId = resolveCameraGroupCompanyScope(user);
      setCameraGroups(readCameraGroups(scopeId));
    }

    syncCameraGroups();
    window.addEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);

    return () => {
      window.removeEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);
    };
  }, [user]);

  React.useEffect(() => {
    if (!availableModes.some((mode) => mode.value === scopeMode)) {
      setScopeMode(availableModes[0]?.value ?? "scenario");
    }
  }, [availableModes, scopeMode]);

  React.useEffect(() => {
    setSelectedId((current) =>
      current && scopeOptions.some((option) => option.id === current)
        ? current
        : scopeOptions[0]?.id ?? "",
    );
  }, [scopeOptions]);

  React.useEffect(() => {
    if (!selectedScope) {
      chartRequestSequenceRef.current += 1;
      chartAbortControllerRef.current?.abort();
      chartAbortControllerRef.current = null;
      setChartLoadError("");
      setChartData({});
      setChartDataScopeKey("");
      setCurrentSnapshot(null);
      setCurrentSnapshotError("");
      setLoadingCharts(false);
      setRefreshing(false);
      return;
    }

    loadCharts(selectedScope);
  }, [loadCharts, selectedScope]);

  React.useEffect(() => {
    if (!selectedScope || (analysis && !analysisIncludesToday)) return;

    let disposed = false;
    let timeout: number | undefined;
    let refreshRunning = false;

    const scheduleNextRefresh = () => {
      if (disposed) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = undefined;
        void refreshWhenVisible();
      }, occupancyReportRefreshDelay(REPORT_REFRESH_MS));
    };

    const refreshWhenVisible = async () => {
      if (
        disposed ||
        refreshRunning ||
        chartAbortControllerRef.current !== null
      ) {
        if (!disposed && !refreshRunning) scheduleNextRefresh();
        return;
      }
      if (document.visibilityState !== "visible") {
        scheduleNextRefresh();
        return;
      }

      refreshRunning = true;
      try {
        await loadCharts(selectedScope, true);
      } finally {
        refreshRunning = false;
        scheduleNextRefresh();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = undefined;
      void refreshWhenVisible();
    };

    scheduleNextRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [analysis, analysisIncludesToday, loadCharts, selectedScope]);

  React.useEffect(() => {
    if (metricVisibilityState.scopeKey !== metricVisibilityScopeKey) return;
    saveOccupancyDashboardSettings(
      {
        metricVisibility: metricVisibilityState.value,
        schemaVersion: 2,
      },
      companyScopeId,
      user?.id,
      analysis ? "analysis" : "reports",
    );
  }, [
    analysis,
    companyScopeId,
    metricVisibilityScopeKey,
    metricVisibilityState,
    user?.id,
  ]);

  function invalidateChartDataset() {
    chartRequestSequenceRef.current += 1;
    chartAbortControllerRef.current?.abort();
    chartAbortControllerRef.current = null;
    setChartData({});
    setChartDataScopeKey("");
    setChartLoadError("");
    setCurrentSnapshot(null);
    setCurrentSnapshotError("");
    setLastUpdated(null);
    setRefreshing(false);
    setLoadingCharts(Boolean(selectedScope));
  }

  function updateAnalysisRangeInput(
    value: typeof analysisRangeInput,
  ) {
    const now = new Date();
    const nextValue = normalizeOccupancyAnalysisDateRangeInput(
      value.startInput,
      value.endInput,
      companyDateKey(now, companyTimeZone),
    );
    if (
      nextValue.startInput === analysisRangeInput.startInput &&
      nextValue.endInput === analysisRangeInput.endInput
    ) {
      return;
    }
    invalidateChartDataset();
    setClock(now);
    setAnalysisRangeInput(nextValue);
    saveOccupancyAnalysisDateRange(
      nextValue,
      companyScopeId,
      user?.id,
    );
  }

  function updateSelectedScope(value: string) {
    if (value === selectedId) return;
    invalidateChartDataset();
    setSelectedId(value);
  }

  function updateShowPreviousPeriod(value: boolean) {
    if (value === showPreviousPeriod) return;
    invalidateChartDataset();
    setShowPreviousPeriod(value);
    saveLiveDashboardSettings({
      intradayComparison,
      showPreviousPeriod: value,
    }, companyScopeId);
  }

  function updateIntradayComparison(value: IntradayComparisonMode) {
    if (value === intradayComparison) return;
    invalidateChartDataset();
    setIntradayComparison(value);
    saveLiveDashboardSettings({
      intradayComparison: value,
      showPreviousPeriod,
    }, companyScopeId);
  }

  const metricCards = [
    {
      id: "occupancy_report_current",
      icon: UsersRound,
      label: analysis
        ? analysisIncludesToday
          ? selectedScope?.scenario
            ? "Snapshot parcial do último dia"
            : "Parcial do último dia"
          : selectedScope?.scenario
            ? "Snapshot final do último dia"
            : "Fechamento do último dia"
        : selectedScope?.scenario
          ? "Último snapshot"
          : "Atual",
      value: selectedScope?.scenario
        ? visibleCurrentSnapshot?.total ?? null
        : rangeMetric.current,
      description:
        (visibleCurrentSnapshotError
          ? "snapshot temporariamente indisponível"
          : "") ||
        (selectedScope?.scenario && visibleCurrentSnapshot
          ? `fonte em ${formatDateTime(visibleCurrentSnapshot.asOf)}`
          : selectedScope?.name ?? "visão selecionada"),
      tone: "primary" as const,
    },
    ...(metricVisibility.average
      ? [
          {
            id: "occupancy_report_average",
            icon: Gauge,
            label: analysis ? "Média do último dia" : "Média hoje",
            value: rangeMetric.average,
            description:
              (rangeMetricError
                ? "agregado temporariamente indisponível"
                : "") ||
              (rangeMetricIncomplete && rangeMetric.average === null
                ? "último dia sem cobertura certificada"
                : analysis
                  ? "agregado certificado do último dia"
                  : "agregado diário da visão"),
            tone: "average" as const,
          },
        ]
      : []),
    ...(metricVisibility.peak
      ? [
          {
            id: "occupancy_report_peak",
            icon: BarChart3,
            label:
              analysis && reportRange.dayCount > 1
                ? "Máximo do período"
                : analysis
                  ? "Máximo do dia"
                  : "Máximo hoje",
            value: rangeMetric.peak,
            description:
              (rangeMetricError
                ? "agregado temporariamente indisponível"
                : "") ||
              (rangeMetric.peak === null && rangeMetricIncomplete
                ? "período sem cobertura diária completa"
                : "maior pico diário certificado"),
            tone: "maximum" as const,
          },
        ]
      : []),
    ...(metricVisibility.minimum
      ? [
          {
            id: "occupancy_report_minimum",
            icon: TrendingUp,
            label:
              analysis && reportRange.dayCount > 1
                ? "Mínimo do período"
                : analysis
                  ? "Mínimo do dia"
                  : "Mínimo hoje",
            value: rangeMetric.minimum,
            description:
              (rangeMetricError
                ? "agregado temporariamente indisponível"
                : "") ||
              (rangeMetric.minimum === null && rangeMetricIncomplete
                ? "período sem cobertura diária completa"
                : "menor valor diário certificado"),
            tone: "minimum" as const,
          },
        ]
      : []),
  ];
  const occupancyReportLayoutCards = [
    ...metricCards.map((card) => ({
      colorEditable: false,
      defaultHeight: "short" as const,
      defaultSize: "compact" as const,
      id: card.id,
      label: card.label,
      minHeight: "short" as const,
      node: (
        <MetricCard
          description={card.description}
          icon={card.icon}
          label={card.label}
          loading={chartsPending}
          tone={card.tone}
          value={card.value}
        />
      ),
      titleEditable: true,
    })),
    ...definitions.map((definition) => ({
      colorEditable: false,
      defaultHeight: "standard" as const,
      defaultSize: "wide" as const,
      id: definition.id,
      label: definition.label,
      minHeight: "standard" as const,
      node: (
        <OccupancyReportChartCard
          definition={definition}
          loading={chartsPending}
          points={
            visibleChartData[definition.id]?.points ??
            buildEmptyPoints(definition)
          }
          previousPoints={
            visibleChartData[previousId(definition.id)]?.points ?? []
          }
          previousState={visibleChartData[previousId(definition.id)]}
          showPreviousPeriod={showPreviousPeriod}
          state={visibleChartData[definition.id]}
          intradayComparison={intradayComparison}
          metricVisibility={metricVisibility}
          scope={selectedScope}
          scopeName={selectedScope?.name ?? ""}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    })),
  ];
  const reportPreferenceScopeId = selectedScope
    ? `${analysis ? "analysis" : "reports"}:${selectedScope.id}`
    : undefined;
  const reportCardIds = occupancyReportLayoutCards.map((card) => card.id);
  const reportCardIdSet = new Set(reportCardIds);
  const reportPreferenceById = new Map(
    layoutPreferences.map((preference) => [preference.id, preference]),
  );
  const orderedVisibleReportCardIds = layoutPreferences.length
    ? [
        ...layoutPreferences
          .filter(
            (preference) =>
              preference.visible !== false && reportCardIdSet.has(preference.id),
          )
          .map((preference) => preference.id),
        ...reportCardIds.filter(
          (id) => !reportPreferenceById.has(id),
        ),
      ]
    : reportCardIds;
  const resolveReportCardTitle = (cardId: string, fallback: string) =>
    reportPreferenceById.get(cardId)?.title?.trim() || fallback;
  const exportPalette = getOccupancyChartPalette("light");
  const exportMetricByCardId = new Map<string, ReportMetric>(
    metricCards.map((card) => [
      card.id,
      {
        description: card.description,
        label: resolveReportCardTitle(card.id, card.label),
        value: formatOccupancyValue(card.value),
      },
    ]),
  );
  const exportChartByCardId = new Map(
    definitions.map((definition) => {
      const points =
        visibleChartData[definition.id]?.points ?? buildEmptyPoints(definition);
      const previousPoints =
        visibleChartData[previousId(definition.id)]?.points ?? [];
      const title = resolveReportCardTitle(definition.id, definition.label);
      const table: ReportTable = {
        columns: [
          { key: "period", label: "Período", width: 24 },
          { key: "current", label: "Atual", numeric: true, width: 16 },
          ...(metricVisibility.average
            ? [{ key: "average", label: "Média", numeric: true, width: 16 }]
            : []),
          ...(metricVisibility.minimum
            ? [{ key: "minimum", label: "Mínimo", numeric: true, width: 16 }]
            : []),
          ...(metricVisibility.peak
            ? [{ key: "peak", label: "Máximo", numeric: true, width: 16 }]
            : []),
        ],
        description: definition.description,
        rows: points.map((point) => ({
          average: point.average,
          current: point.current,
          minimum: point.minimum,
          peak: point.peak,
          period: point.label,
        })),
        title: `Dados - ${title}`,
      };
      return [
        definition.id,
        {
          comparison: showPreviousPeriod
            ? comparisonDescription(definition, intradayComparison)
            : undefined,
          description: definition.description,
          option: buildOccupancyReportChartOption(
            definition,
            points,
            showPreviousPeriod ? previousPoints : [],
            metricVisibility,
            {
              maximum: selectedScope?.scenario?.max_total ?? undefined,
              minimum: selectedScope?.scenario?.min_total ?? undefined,
            },
            exportPalette,
          ),
          table,
          title,
        },
      ] as const;
    }),
  );
  const reportCertificationSources = [
    {
      asOf: visibleCurrentSnapshot?.asOf,
      error:
        visibleCurrentSnapshotError ||
        (!visibleCurrentSnapshot ? "Snapshot atual indisponível." : undefined),
    },
    ...definitions.flatMap((definition) => {
      const currentState = visibleChartData[definition.id];
      const sources = [
        currentState ?? {
          error: "Série atual indisponível.",
        },
      ];
      if (showPreviousPeriod) {
        sources.push(
          visibleChartData[previousId(definition.id)] ?? {
            error: "Série comparativa indisponível.",
          },
        );
      }
      return sources;
    }),
  ];
  const reportDataCompleteUntil = resolveCertifiedOccupancyDataCutoff(
    reportCertificationSources,
  );
  const occupancyReportPayload: ReportPayload = {
    charts: orderedVisibleReportCardIds
      .map((id) => exportChartByCardId.get(id))
      .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart)),
    context: [
      selectedScope
        ? `${scopeModeLabel(selectedScope.mode)}: ${selectedScope.name}`
        : "",
      analysis
        ? `Período: ${formatOccupancyAnalysisRangeLabel(analysisRangeInput)}`
        : `Dia civil da empresa: ${companyTodayInput}`,
      `Fuso: ${companyTimeZone}`,
      showPreviousPeriod
        ? `Comparativo: ${intradayComparison === "last_week" ? "semana passada" : "ontem"}`
        : "Sem período anterior",
      "Ausência de bucket permanece sem valor e nunca é convertida em ocupação zero.",
    ].filter(Boolean),
    dataCompleteUntil: reportDataCompleteUntil,
    filename: `ipxdata-ocupacao-${analysis ? "analise" : "relatorio"}-${occupancyReportDateSlug(
      reportDataCompleteUntil ?? clock,
    )}`,
    generatedAt: clock,
    metrics: orderedVisibleReportCardIds
      .map((id) => exportMetricByCardId.get(id))
      .filter((metric): metric is ReportMetric => Boolean(metric)),
    subtitle: analysis
      ? `Intervalo ${formatOccupancyAnalysisRangeLabel(analysisRangeInput)}`
      : "Séries históricas e leitura atual da visão selecionada.",
    tables: [],
    title: selectedScope
      ? `${analysis ? "Análise" : "Relatório"} de Ocupação - ${selectedScope.name}`
      : analysis
        ? "Análise de Ocupação"
        : "Relatório de Ocupação",
  };
  const analysisDateRangeControl = analysis ? (
    <OccupancyDateRangePicker
      key={`${companyScopeId ?? ""}|${user?.id ?? ""}`}
      maximumInput={companyTodayInput}
      onApply={updateAnalysisRangeInput}
      timeZoneLabel={companyTimeZone}
      value={analysisRangeInput}
    />
  ) : null;

  return (
    <section
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {!occupancyCertificationError &&
      hasPartialOccupancyCoverage &&
      !chartsPending ? (
        <p role="status" className="sr-only">
          Alguns períodos ainda não possuem dados; eles permanecem vazios e não
          representam ocupação zero.
        </p>
      ) : null}
      {analysis ? (
        <p role="status" className="sr-only">
          {analysisIncludesToday
            ? "O intervalo inclui hoje; somente os buckets de hoje podem estar parciais."
            : "O intervalo é totalmente histórico e usa apenas buckets fechados."}
        </p>
      ) : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              {analysis ? "Análises de ocupação" : "Relatórios de ocupação"}
            </div>
            <div className="truncate text-lg font-semibold">
              {selectedScope?.name ?? "Visão selecionada"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 bg-card">
              <MapPinned className="h-3.5 w-3.5" />
              {scopeModeLabel(scopeMode)}
            </Badge>
            {analysis ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatOccupancyAnalysisRangeLabel(analysisRangeInput)}
              </Badge>
            ) : null}
            {showPreviousPeriod ? (
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 bg-primary/10 text-primary"
              >
                Comparativo ativo
              </Badge>
            ) : null}
            {visibleLastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(visibleLastUpdated)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
      <div
        className={cn(
          "rounded-md border border-border bg-card shadow-soft",
          analysis ? "px-3 py-2" : "p-4",
        )}
      >
        {occupancyCertificationError ? (
          <>
            {analysis ? (
              <div
                aria-label="Período da análise de Ocupação"
                className="mb-2 min-w-0"
                role="region"
              >
                {analysisDateRangeControl}
              </div>
            ) : null}
            <OccupancyBlockingState
              onRetry={retryOccupancyData}
              retrying={loadingScopes || chartsPending || refreshing}
            />
          </>
        ) : loadingScopes && !scopeOptions.length ? (
          <div
            className={cn(
              analysis
                ? "grid min-w-0 gap-2 sm:grid-cols-2"
                : "grid gap-4 md:grid-cols-[180px_1fr_auto]",
            )}
            aria-label={analysis ? "Carregando controles da análise de Ocupação" : undefined}
            role={analysis ? "region" : undefined}
          >
            {analysis ? (
              <div className="min-w-0 sm:col-span-2">{analysisDateRangeControl}</div>
            ) : null}
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className={cn("h-10 w-full", analysis && "sm:col-span-2")} />
          </div>
        ) : scopeOptions.length ? (
          <div className={cn(analysis && "space-y-2")}>
            <div
              aria-label={analysis ? "Controles da análise de Ocupação" : undefined}
              className={cn(
                analysis
                  ? "grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,auto)_minmax(140px,170px)_minmax(180px,220px)_auto] lg:items-center"
                  : "flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between",
              )}
              role={analysis ? "group" : undefined}
            >
            {analysis ? (
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                {analysisDateRangeControl}
              </div>
            ) : null}
            <div
              aria-label={analysis ? "Ações da análise de Ocupação" : undefined}
              className={cn(
                analysis
                  ? "contents"
                  : "grid min-w-0 flex-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)]",
              )}
            >
              <div className={cn(analysis ? "min-w-0" : "space-y-2")}>
                {!analysis ? (
                  <Label className="block" htmlFor={scopeModeSelectId}>
                    Visão
                  </Label>
                ) : null}
                <Select
                  value={scopeMode}
                  onValueChange={(value) => {
                    invalidateChartDataset();
                    setScopeMode(value as OccupancyReportScopeMode);
                    setSelectedId("");
                  }}
                >
                  <SelectTrigger
                    id={scopeModeSelectId}
                    aria-label={analysis ? "Tipo de visão da análise de Ocupação" : undefined}
                    className={cn("bg-card", analysis && "h-8 w-full min-w-0")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModes.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                {!analysis ? (
                  <Label className="block" htmlFor={scopeSelectId}>
                    {scopeModeLabel(scopeMode)}
                  </Label>
                ) : null}
                <Select value={selectedId} onValueChange={updateSelectedScope}>
                  <SelectTrigger
                    id={scopeSelectId}
                    aria-label={analysis ? `${scopeModeLabel(scopeMode)} da análise de Ocupação` : undefined}
                    className={cn("bg-card", analysis && "h-8 w-full min-w-0")}
                  >
                    <SelectValue placeholder="Selecione uma visão" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((scope) => (
                      <SelectItem key={scope.id} value={scope.id}>
                        {scope.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div
              className={cn(
                analysis
                  ? "flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1 lg:ml-auto lg:flex-nowrap"
                  : "flex flex-wrap items-center gap-2",
              )}
            >
              {!analysis ? (
                <Badge variant="outline" className="gap-1 bg-card">
                  <MapPinned className="h-3.5 w-3.5" />
                  {scopeModeLabel(scopeMode)}
                </Badge>
              ) : null}
              {analysis ? (
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-8"
                  variant={analysisSettingsOpen ? "default" : "outline"}
                  onClick={() => setAnalysisSettingsOpen((current) => !current)}
                  aria-expanded={analysisSettingsOpen}
                  aria-controls="occupancy-analysis-settings"
                  aria-label="Configurações da análise de Ocupação"
                  title="Configurações da análise"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              ) : (
                <>
                  <PreviousPeriodToggle
                    checked={showPreviousPeriod}
                    onCheckedChange={updateShowPreviousPeriod}
                  />
                  {showPreviousPeriod ? (
                    <ComparisonModeSelect
                      value={intradayComparison}
                      onValueChange={updateIntradayComparison}
                    />
                  ) : null}
                  <MetricVisibilityControls
                    value={metricVisibility}
                    onChange={setMetricVisibility}
                  />
                </>
              )}
              <ReportExportActions
                compact
                disabled={
                  chartsPending ||
                  !selectedScope ||
                  Boolean(occupancyCertificationError) ||
                  reportDataCompleteUntil === null
                }
                payload={occupancyReportPayload}
              />
              {canEditVisual ? (
                <>
                  <ReorderModeButton
                    className={cn(analysis && "h-8 w-8")}
                    enabled={layoutReorderMode}
                    onChange={setLayoutReorderMode}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(analysis && "h-8 w-8")}
                    onClick={() => setLayoutOrganizerOpen(true)}
                    aria-label="Configurar widgets de ocupação"
                    title="Configurar widgets"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              {visibleLastUpdated ? (
                analysis ? (
                  <span
                    className="inline-flex h-8 shrink-0 items-center gap-1 px-1 text-xs tabular-nums text-muted-foreground"
                    aria-label={`Última atualização às ${formatTime(visibleLastUpdated)}`}
                    title={`Última atualização: ${formatTime(visibleLastUpdated)}`}
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatTime(visibleLastUpdated)}
                  </span>
                ) : (
                  <Badge variant="outline" className="gap-1 bg-card">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatTime(visibleLastUpdated)}
                  </Badge>
                )
              ) : null}
              <Button
                type="button"
                variant="outline"
                size={analysis ? "icon" : "default"}
                className={cn(analysis && "h-8 w-8")}
                onClick={() => {
                  if (selectedScope) loadCharts(selectedScope, true, true);
                  loadScopes();
                }}
                disabled={refreshing || chartsPending}
                aria-label={analysis ? "Atualizar análise de Ocupação" : undefined}
                title={analysis ? "Atualizar análise" : undefined}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    (refreshing || chartsPending) && "animate-spin",
                  )}
                />
                {analysis ? <span className="sr-only">Atualizar</span> : "Atualizar"}
              </Button>
              <MonitorModeButton
                compact={analysis}
                onClick={enterMonitorMode}
                disabled={!scopeOptions.length}
              />
            </div>
            </div>
            {analysis && analysisSettingsOpen ? (
              <div
                id="occupancy-analysis-settings"
                aria-label="Configurações da análise de Ocupação"
                className="grid gap-3 rounded-xl border bg-muted/15 p-3 shadow-sm lg:grid-cols-2"
                role="group"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Comparação temporal</div>
                    <div className="text-[11px] text-muted-foreground">
                      Ative e escolha a base usada no período anterior.
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <PreviousPeriodToggle
                      checked={showPreviousPeriod}
                      compact
                      onCheckedChange={updateShowPreviousPeriod}
                    />
                    {showPreviousPeriod ? (
                      <ComparisonModeSelect
                        compact
                        value={intradayComparison}
                        onValueChange={updateIntradayComparison}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Séries históricas</div>
                    <div className="text-[11px] text-muted-foreground">
                      Média, mínimo e máximo exibidos nos gráficos.
                    </div>
                  </div>
                  <MetricVisibilityControls
                    compact
                    value={metricVisibility}
                    onChange={setMetricVisibility}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {analysis ? (
              <div
                aria-label="Período da análise de Ocupação"
                className="mb-2 min-w-0"
                role="region"
              >
                {analysisDateRangeControl}
              </div>
            ) : null}
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma visão de ocupação disponível para {analysis ? "análise" : "relatório"}.
            </div>
          </>
        )}
      </div>
      )}

      {monitorMode && occupancyCertificationError ? (
        <OccupancyBlockingState
          className="mb-3"
          onRetry={retryOccupancyData}
          retrying={loadingScopes || chartsPending || refreshing}
        />
      ) : null}

      {scopeOptions.length && !occupancyCertificationError ? (
        <CardLayout
          cards={occupancyReportLayoutCards}
          menuKey="occupancy"
          monitorMode={monitorMode}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          onPreferencesChange={setLayoutPreferences}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          presetNamespace={
            analysis ? "occupancy-analysis" : "occupancy-reports"
          }
          preferenceScopeId={reportPreferenceScopeId}
          reorderMode={layoutReorderMode}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
          viewScopeName={selectedScope?.name}
        />
      ) : null}
    </section>
  );
}

function MetricCard({
  description,
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: {
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading: boolean;
  tone: "average" | "maximum" | "minimum" | "primary";
  value: number | null;
}) {
  const toneClass = {
    average:
      "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
    maximum:
      "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
    minimum:
      "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300",
    primary: "bg-primary/10 text-primary ring-primary/20",
  }[tone];

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardContent className="grid min-h-[116px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
        <div className="min-w-0">
          <div className="min-w-0 break-words text-xs font-medium uppercase leading-4 text-muted-foreground [overflow-wrap:anywhere]">
            <WidgetTitleText fallback={label} />
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-2 min-w-0 break-words text-[clamp(1.25rem,9cqi,1.5rem)] font-semibold leading-tight tabular-nums [overflow-wrap:anywhere]">
              {formatOccupancyValue(value)}
            </div>
          )}
          <div className="mt-1 line-clamp-2 min-w-0 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]" title={description}>
            {description}
          </div>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center self-start justify-self-end rounded-md ring-1",
            toneClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function OccupancyReportChartCard({
  definition,
  intradayComparison,
  loading,
  metricVisibility,
  points,
  previousPoints,
  previousState,
  scope,
  scopeName,
  showPreviousPeriod,
  state,
}: {
  definition: OccupancyReportDefinition;
  intradayComparison: IntradayComparisonMode;
  loading: boolean;
  metricVisibility: OccupancyMetricVisibility;
  points: OccupancyReportPoint[];
  previousPoints: OccupancyReportPoint[];
  previousState?: OccupancyReportState;
  scope: OccupancyReportScope | null;
  scopeName: string;
  showPreviousPeriod: boolean;
  state?: OccupancyReportState;
}) {
  const { effectiveTheme } = useTheme();
  const palette = React.useMemo(
    () => getOccupancyChartPalette(effectiveTheme),
    [effectiveTheme],
  );
  const option = React.useMemo(
    () =>
      buildOccupancyReportChartOption(
        definition,
        points,
        showPreviousPeriod ? previousPoints : [],
        metricVisibility,
        {
          maximum: scope?.scenario?.max_total ?? undefined,
          minimum: scope?.scenario?.min_total ?? undefined,
        },
        palette,
      ),
    [
      definition,
      metricVisibility,
      palette,
      points,
      previousPoints,
      scope?.scenario?.max_total,
      scope?.scenario?.min_total,
      showPreviousPeriod,
    ],
  );
  const hasReferenceLimit = Boolean(
    (scope?.scenario?.min_total !== null &&
      scope?.scenario?.min_total !== undefined) ||
      (scope?.scenario?.max_total !== null &&
        scope?.scenario?.max_total !== undefined),
  );
  const hasData =
    points.some(
      (point) =>
        point.average !== null ||
        point.current !== null ||
        point.minimum !== null ||
        point.peak !== null,
    ) ||
    (showPreviousPeriod &&
      previousPoints.some(
        (point) =>
          point.average !== null ||
          point.current !== null ||
          point.minimum !== null ||
          point.peak !== null,
      )) ||
    hasReferenceLimit;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2">
              <BarChart3 className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={definition.label} className="leading-6" />
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {definition.resolutionLabel ? (
              <Badge variant="secondary" className="w-fit max-w-full whitespace-normal break-words text-left leading-4 [overflow-wrap:anywhere]">
                {definition.resolutionLabel}
              </Badge>
            ) : null}
            <Badge variant="outline" className="w-fit max-w-full whitespace-normal break-words bg-primary/10 text-left leading-4 text-primary [overflow-wrap:anywhere]">
              {scopeName}
            </Badge>
          </div>
        </div>
        {showPreviousPeriod && !previousState?.error && !previousState?.warning ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
            {comparisonDescription(definition, intradayComparison)}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {!loading && !state?.error && state?.warning ? (
          <p className="sr-only">
            Este gráfico contém períodos ainda sem dados.
          </p>
        ) : null}
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : state?.error ? (
          <EmptyChartState text="Dados temporariamente indisponíveis para este gráfico." />
        ) : hasData ? (
          <div className="h-[300px] w-full">
            <EChart option={option} themeMode="explicit" />
          </div>
        ) : (
          <EmptyChartState text="Sem dados de ocupação nesta visão." />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function MetricVisibilityControls({
  compact = false,
  onChange,
  value,
}: {
  compact?: boolean;
  onChange: React.Dispatch<React.SetStateAction<OccupancyMetricVisibility>>;
  value: OccupancyMetricVisibility;
}) {
  const options = [
    { key: "average", label: "Média" },
    { key: "minimum", label: "Mínimo" },
    { key: "peak", label: "Máximo" },
  ] as const;

  return (
    <div
      aria-label="Séries históricas exibidas"
      className={cn(
        "flex flex-wrap items-center rounded-md border bg-muted/20",
        compact ? "h-8 gap-0.5 p-0.5" : "gap-1 p-1",
      )}
      role="group"
    >
      {options.map((option) => {
        const active = value[option.key];

        return (
          <button
            key={option.key}
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() =>
              onChange((current) => ({
                ...current,
                [option.key]: !current[option.key],
              }))
            }
            className={cn(
              "rounded px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              compact ? "h-7" : "h-8",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PreviousPeriodToggle({
  checked,
  compact = false,
  onCheckedChange,
}: {
  checked: boolean;
  compact?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        compact ? "h-8" : "h-9",
        checked
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-4 w-7 rounded-full p-0.5 transition",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "block h-3 w-3 rounded-full bg-background transition",
            checked && "translate-x-3",
          )}
        />
      </span>
      Base comparativa
    </button>
  );
}

function ComparisonModeSelect({
  compact = false,
  value,
  onValueChange,
}: {
  compact?: boolean;
  value: IntradayComparisonMode;
  onValueChange: (value: IntradayComparisonMode) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onValueChange(nextValue as IntradayComparisonMode)
      }
    >
      <SelectTrigger
        aria-label="Base temporal da comparação"
        className={cn(
          "w-full min-w-0 bg-card text-xs sm:w-[190px]",
          compact ? "h-8" : "h-9",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yesterday">Min/hora: ontem</SelectItem>
        <SelectItem value="last_week">Min/hora: semana passada</SelectItem>
      </SelectContent>
    </Select>
  );
}

function buildOccupancyReportDefinitions(
  reference: Date,
  openAt: Date | undefined = reference,
  analysis = false,
  analysisRange?: ResolvedOccupancyAnalysisRange,
  companyTimeZone = "America/Sao_Paulo",
): OccupancyReportDefinition[] {
  const todayStart = startOfCompanyTimeZoneDay(reference, companyTimeZone);
  const dayEnd = addDays(todayStart, 1);
  const minuteEnd = openAt
    ? addMinutes(startOfMinute(reference), 1)
    : dayEnd;
  const hourEnd = openAt
    ? endOfCompanyTimeZoneHour(reference, companyTimeZone)
    : dayEnd;
  const currentWeekStart = startOfWeek(reference);
  const currentMonthStart = startOfMonth(reference);
  const rangeFrom = analysisRange?.from ?? todayStart;
  const rangeTo = analysisRange?.to ?? dayEnd;
  const analysisResolutionPlan = analysisRange
    ? buildOccupancyAnalysisResolutionPlan(
        rangeFrom,
        rangeTo,
        analysisRange.dayCount,
      )
    : null;

  const withOpenBucket = (
    definition: Omit<OccupancyReportDefinition, "openBucket">,
  ): OccupancyReportDefinition => {
    if (!openAt || openAt < definition.from || openAt >= definition.to) {
      return definition;
    }

    return {
      ...definition,
      openBucket:
        definition.granularity === "hour"
          ? startOfCompanyTimeZoneHour(openAt, companyTimeZone)
          : alignToGranularity(openAt, definition.granularity),
    };
  };

  const analysisQuerySegments = analysisResolutionPlan
    ? analysisResolutionPlan.segments.flatMap((segment) =>
        occupancyReportQuerySegments(segment, openAt),
      )
    : undefined;
  const analysisResolutionLabel = analysisResolutionPlan
    ? occupancyAnalysisResolutionLabel(analysisResolutionPlan)
    : undefined;

  const definitions: Array<OccupancyReportDefinition | null> = [
    withOpenBucket({
      id: "occupancy_report_minute",
      label: "Minuto a minuto",
      description: analysis
        ? analysisRange?.includesToday
          ? "Até 60 minutos mais recentes do último dia do intervalo; o minuto atual é parcial."
          : "60 minutos finais do último dia do intervalo."
        : "Últimos 60 minutos.",
      granularity: "minute",
      from: new Date(
        Math.max(todayStart.getTime(), addMinutes(minuteEnd, -60).getTime()),
      ),
      to: minuteEnd,
    }),
    withOpenBucket({
      id: "occupancy_report_hour",
      label: "Hora a hora",
      description: analysis
        ? analysisRange?.includesToday
          ? "Último dia do intervalo por hora; a hora atual é parcial."
          : "Último dia completo do intervalo por hora."
        : "Hoje por hora.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    }),
    analysisRange && analysisResolutionPlan && analysisQuerySegments
      ? {
          id: "occupancy_report_day",
          label:
            analysisResolutionPlan.primaryGranularity === "day"
              ? "Dia a dia"
              : "Evolução consolidada",
          description: `${analysisResolutionDescription(
            analysisResolutionPlan.primaryGranularity,
          )} O intervalo contém ${analysisRange.dayCount} ${
            analysisRange.dayCount === 1 ? "dia" : "dias"
          }; somente o dia atual pode permanecer parcial.`,
          granularity: analysisResolutionPlan.primaryGranularity,
          from: analysisRange.from,
          querySegments: analysisQuerySegments,
          resolutionLabel: analysisResolutionLabel,
          to: analysisRange.to,
        }
      : withOpenBucket({
          id: "occupancy_report_day",
          label: "Dia a dia",
          description: "Últimos 7 dias.",
          granularity: "day",
          from: addDays(todayStart, -6),
          to: addDays(todayStart, 1),
        }),
    analysisRange
      ? null
      : withOpenBucket({
          id: "occupancy_report_week",
          label: "Semana a semana",
          description: "Últimas 8 semanas.",
          granularity: "week",
          from: addDays(currentWeekStart, -7 * 7),
          to: addDays(currentWeekStart, 7),
        }),
    analysisRange
      ? null
      : withOpenBucket({
          id: "occupancy_report_month",
          label: "Mês a mês",
          description: "Últimos 12 meses.",
          granularity: "month",
          from: addMonths(currentMonthStart, -11),
          to: addMonths(currentMonthStart, 1),
        }),
  ];

  // A API aceita minute/hour/day/week/month. Cards sem nenhum bucket civil
  // completo são omitidos para não gerar uma consulta espúria nem sugerir zero.
  return definitions.filter(
    (definition): definition is OccupancyReportDefinition =>
      definition !== null,
  );
}

function occupancyReportDefinitionsWindowKey(
  definitions: OccupancyReportDefinition[],
) {
  return JSON.stringify(
    definitions.map((definition) => [
      definition.id,
      definition.granularity,
      definition.from.getTime(),
      definition.openBucket?.getTime() ?? null,
      definition.querySegments?.map((segment) => [
        segment.granularity,
        segment.from.getTime(),
        segment.openBucket?.getTime() ?? null,
        segment.to.getTime(),
      ]) ?? null,
      definition.to.getTime(),
    ]),
  );
}

function occupancyReportQuerySegments(
  segment: OccupancyAnalysisResolutionSegment,
  openAt?: Date,
): OccupancyReportQuerySegment[] {
  const openBucket =
    openAt && openAt >= segment.from && openAt < segment.to
      ? alignToGranularity(openAt, segment.granularity)
      : undefined;

  return splitOpenQuerySegment({
    bucketStarts: segment.bucketStarts.map((bucket) => new Date(bucket)),
    from: new Date(segment.from),
    granularity: segment.granularity,
    openBucket,
    to: new Date(segment.to),
  });
}

function occupancyAnalysisResolutionLabel(
  plan: OccupancyAnalysisResolutionPlan,
) {
  const unit = plan.pointCount === 1 ? "ponto" : "pontos";
  if (plan.primaryGranularity === "day") {
    return `Resolução diária · ${plan.pointCount} ${unit}`;
  }
  if (plan.primaryGranularity === "week") {
    return `Semanas + bordas diárias · ${plan.pointCount} ${unit}`;
  }
  return `Meses + bordas diárias · ${plan.pointCount} ${unit}`;
}

function analysisResolutionDescription(
  granularity: OccupancyAnalysisResolutionGranularity,
) {
  if (granularity === "day") {
    return "Resolução diária automática, sem consolidação adicional.";
  }
  if (granularity === "week") {
    return "Semanas civis completas são consolidadas pela API; as bordas do filtro permanecem diárias.";
  }
  return "Meses civis completos são consolidados pela API; as bordas do filtro permanecem diárias.";
}

function occupancyReportRefreshDelay(refreshMs: number) {
  const now = new Date();
  const nextMinute = endOfAggregateBucket(startOfMinute(now), "minute");
  return Math.max(
    0,
    Math.min(
      Math.max(250, refreshMs),
      nextMinute.getTime() - now.getTime() + 50,
    ),
  );
}

async function loadOccupancyReportState(
  definition: OccupancyReportDefinition,
  scope: OccupancyReportScope,
  companyScopeId?: string | null,
  companyTimeZone?: string,
  requestedAt?: Date,
  companyTimeZoneWarning?: string,
  signal?: AbortSignal,
  closedSegmentCache?: Map<string, OccupancyReportState>,
): Promise<OccupancyReportState> {
  const expectedTimeZone = requireRuntimeCompanyTimeZone(
    companyTimeZone ?? "America/Sao_Paulo",
  );
  if (scope.scenario) {
    const segmentStates = await Promise.all(
      listDefinitionQuerySegments(definition).map(async (segment) => {
        const cacheKey = occupancyClosedSegmentCacheKey({
          companyScopeId,
          companyTimeZone: expectedTimeZone,
          requestedAt: requestedAt ?? new Date(),
          scope,
          segment,
        });
        const cached = segment.openBucket
          ? undefined
          : closedSegmentCache?.get(cacheKey);
        if (cached) return cached;

        const segmentDefinition = definitionForQuerySegment(
          definition,
          segment,
        );
        const response = await apiFetch<OccupancyScenarioAggregateResponse>(
          occupancyScenarioAggregatePath(scope.scenario!.id, segmentDefinition),
          { companyScopeId: companyScopeId ?? undefined, signal },
        );
        const rows = requireOccupancyAggregateRows(
          response,
          segment.granularity,
          scope.scenario!.id,
          expectedTimeZone,
          {
            allowLegacyUncertifiedInstantBuckets: true,
            openBucket: segment.openBucket,
            requestedAt: segment.openBucket ? requestedAt : undefined,
            requireCertification: true,
          },
        );

        const state = {
          ...buildScenarioPoints(
            segmentDefinition,
            rows,
            joinOccupancyWarnings(
              occupancyAggregateMetadataWarning(
                response,
                segment.granularity,
              ),
              companyTimeZoneWarning,
            ),
          ),
          asOf: response.as_of!,
        };
        cacheCertifiedClosedSegment(
          closedSegmentCache,
          cacheKey,
          segment,
          state,
        );
        return state;
      }),
    );

    return mergeOccupancyReportSegmentStates(definition, segmentStates);
  }

  const segmentStates = await Promise.all(
    listDefinitionQuerySegments(definition).map(async (segment) => {
      const cacheKey = occupancyClosedSegmentCacheKey({
        companyScopeId,
        companyTimeZone: expectedTimeZone,
        requestedAt: requestedAt ?? new Date(),
        scope,
        segment,
      });
      const cached = segment.openBucket
        ? undefined
        : closedSegmentCache?.get(cacheKey);
      if (cached) return cached;

      const pointsWithSource = await mapWithConcurrency(
        segment.bucketStarts,
        BUCKET_CONCURRENCY,
        async (bucketStart) => {
          const bucketEnd = addGranularity(bucketStart, segment.granularity);
          const requestTo = bucketEnd > segment.to ? segment.to : bucketEnd;
          const response = await apiFetch<unknown>(
            occupancyPath(bucketStart, requestTo),
            { companyScopeId: companyScopeId ?? undefined, signal },
          );
          const rows = requireOccupancySnapshotRows(response, {
            expectedCameraIds: scope.cameraIds,
            expectedObjectClass: DEFAULT_OBJECT_CLASS,
            from: bucketStart,
            to: requestTo,
          });
          const metric = buildRowsMetric(rows);
          const sourceAsOf = rows.reduce<string | undefined>((latest, row) => {
            if (!row.current_at) return latest;
            if (!latest) return row.current_at;
            return Date.parse(row.current_at) > Date.parse(latest)
              ? row.current_at
              : latest;
          }, undefined);

          return {
            point: {
              bucket: bucketStart.toISOString(),
              label: bucketLabel(bucketStart, segment.granularity),
              ...metric,
            },
            sourceAsOf,
          };
        },
      );
      const asOf = pointsWithSource.reduce<string | undefined>(
        (latest, point) => {
          if (!point.sourceAsOf) return latest;
          if (!latest) return point.sourceAsOf;
          return Date.parse(point.sourceAsOf) > Date.parse(latest)
            ? point.sourceAsOf
            : latest;
        },
        undefined,
      );
      const state: OccupancyReportState = {
        asOf,
        points: pointsWithSource.map(({ point }) => point),
        warning: companyTimeZoneWarning,
      };
      cacheCertifiedClosedSegment(
        closedSegmentCache,
        cacheKey,
        segment,
        state,
      );
      return state;
    }),
  );

  return mergeOccupancyReportSegmentStates(definition, segmentStates);
}

function buildScenarioPoints(
  definition: OccupancyReportDefinition,
  rows: OccupancyScenarioBucketRow[],
  metadataWarning?: string,
): OccupancyReportState {
  const requestedBuckets = listBucketStarts(definition);
  const { missingBuckets, totals } =
    aggregateOccupancyRowsForRequestedBuckets(
      rows,
      definition.granularity,
      requestedBuckets,
      {
        allowLegacyUncertifiedInstantBuckets: true,
        openBucket: definition.openBucket,
        requireCertification: true,
      },
    );

  const points = requestedBuckets.map((bucketStart) => {
    const total = totals.get(
      occupancyAggregateBucketKey(bucketStart, definition.granularity),
    );
    if (!total) {
      return {
        bucket: bucketStart.toISOString(),
        label: bucketLabel(bucketStart, definition.granularity),
        ...emptyOccupancyMetric(),
      };
    }
    const metric: OccupancyReportMetric = {
      ...total,
      current: total.final ?? null,
    };

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
      ...metric,
    };
  });

  return {
    // Os segmentos fechado e aberto são unidos antes da normalização visual.
    // Normalizar cada segmento isoladamente criaria dois eixos de 24 horas e
    // faria um ponto vazio apagar o ponto real ao consolidá-los.
    points,
    warning: joinOccupancyWarnings(
      metadataWarning,
      occupancyAggregateCoverageWarning(
        missingBuckets.length,
        requestedBuckets.length,
      ),
    ),
  };
}

function mergeOccupancyReportSegmentStates(
  definition: OccupancyReportDefinition,
  states: OccupancyReportState[],
): OccupancyReportState {
  const asOf = states.reduce<string | undefined>((latest, state) => {
    if (!state.asOf) return latest;
    if (!latest) return state.asOf;
    return Date.parse(state.asOf) > Date.parse(latest) ? state.asOf : latest;
  }, undefined);

  return {
    asOf,
    points: occupancyReportDisplayPoints(
      definition,
      states.flatMap((state) => state.points),
    ),
    warning: joinOccupancyWarnings(...states.map((state) => state.warning)),
  };
}

function occupancyClosedSegmentCacheKey({
  companyScopeId,
  companyTimeZone,
  requestedAt,
  scope,
  segment,
}: {
  companyScopeId?: string | null;
  companyTimeZone: string;
  requestedAt: Date;
  scope: OccupancyReportScope;
  segment: OccupancyReportQuerySegment;
}) {
  const source = scope.scenario
    ? ["scenario", scope.scenario.id]
    : ["cameras", ...scope.cameraIds.slice().sort()];
  return JSON.stringify([
    companyScopeId?.trim() ?? "",
    companyTimeZone,
    source,
    segment.granularity,
    segment.from.getTime(),
    segment.to.getTime(),
    occupancyAnalysisClosedSegmentRevision(segment.to, requestedAt),
    DEFAULT_OBJECT_CLASS,
  ]);
}

function cacheCertifiedClosedSegment(
  cache: Map<string, OccupancyReportState> | undefined,
  key: string,
  segment: OccupancyReportQuerySegment,
  state: OccupancyReportState,
) {
  if (
    !cache ||
    segment.openBucket ||
    state.error ||
    state.warning ||
    state.points.length !== segment.bucketStarts.length ||
    !state.points.every(
      (point) =>
        isCertifiedMetricValue(point.average) &&
        isCertifiedMetricValue(point.current) &&
        isCertifiedMetricValue(point.minimum) &&
        isCertifiedMetricValue(point.peak),
    )
  ) {
    return;
  }

  if (!cache.has(key) && cache.size >= MAX_CLOSED_SEGMENT_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.delete(key);
  cache.set(key, state);
}

function joinOccupancyWarnings(...warnings: Array<string | undefined>) {
  const unique = Array.from(
    new Set(warnings.filter((warning): warning is string => Boolean(warning))),
  );
  return unique.join(" ") || undefined;
}

function buildRowsMetric(rows: CertifiedOccupancyRow[]): OccupancyReportMetric {
  if (rows.length !== 1 || rows[0].area !== undefined) {
    throw new Error(
      "A API não retornou um total temporal certificado da câmera para este escopo; uma área isolada e mínimos ou máximos de múltiplas áreas/câmeras não podem representar o total.",
    );
  }
  const row = rows[0];

  return {
    average: roundValue(row.avg),
    current: roundValue(row.current_value),
    minimum: roundValue(row.min),
    peak: roundValue(row.peak),
  };
}

function buildOccupancyReportChartOption(
  definition: OccupancyReportDefinition,
  points: OccupancyReportPoint[],
  previousPoints: OccupancyReportPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: {
    maximum?: number;
    minimum?: number;
  },
  palette: OccupancyChartPalette,
): EnterpriseChartOption {
  const showPrevious = previousPoints.length > 0;
  const dense =
    definition.granularity === "minute" || definition.granularity === "hour";
  const rangeBaseValues = points.map((point) =>
    point.minimum === null ? null : Math.max(0, point.minimum),
  );
  const rangeSpanValues = points.map((point) =>
    point.minimum === null || point.peak === null
      ? null
      : Math.max(0, point.peak - Math.max(0, point.minimum)),
  );
  const previousBaseValues = points.map((_, index) => {
    const minimum = previousPoints[index]?.minimum;
    return minimum === null || minimum === undefined
      ? null
      : Math.max(0, minimum);
  });
  const previousSpanValues = points.map((_, index) => {
    const previous = previousPoints[index];
    if (
      !previous ||
      previous.minimum === null ||
      previous.peak === null
    ) {
      return null;
    }

    return Math.max(0, previous.peak - Math.max(0, previous.minimum));
  });
  const markerDefinitions: OccupancyReportMarkerDefinition[] = [];
  if (points.some((point) => point.current !== null)) {
    markerDefinitions.push({
      color: palette.current,
      data: points.map((point) => point.current),
      effect: true,
      fill: palette.current,
      name: "Final do bucket",
      offset: [0, 0],
      size: denseMarkerSize(definition, "current"),
      symbol: "circle",
      z: 7,
    });
  }

  if (metricVisibility.average) {
    markerDefinitions.push({
      color: palette.average,
      data: points.map((point) => point.average),
      fill: palette.average,
      name: "Média",
      offset: [0, 0],
      size: denseMarkerSize(definition, "average"),
      symbol: "rect",
      z: 6,
    });

    if (showPrevious) {
      markerDefinitions.push({
        color: palette.previousAverage,
        data: points.map((_, index) => previousPoints[index]?.average ?? null),
        fill: palette.previousAverage,
        name: "Média comparativa",
        offset: [0, dense ? -4 : -6],
        size: denseMarkerSize(definition, "previous"),
        symbol: "rect",
        z: 5,
      });
    }
  }
  const thresholdDefinitions = [
    ...(limits.minimum !== undefined
      ? [
          {
            color: palette.minimumLimit,
            data: points.map(() => limits.minimum),
            name: "Limite mínimo",
          },
        ]
      : []),
    ...(limits.maximum !== undefined
      ? [
          {
            color: palette.maximumLimit,
            data: points.map(() => limits.maximum),
            name: "Limite máximo",
          },
        ]
      : []),
  ];
  const legendData = [
    ...(showPrevious ? ["Base comparativa"] : []),
    ...markerDefinitions.map((series) => ({
      icon: series.symbol === "circle" ? "circle" : "roundRect",
      name: series.name,
    })),
    ...thresholdDefinitions.map((series) => series.name),
  ];

  return {
    color: [
      palette.rangeStart,
      ...(showPrevious ? [palette.previousAverage] : []),
      ...markerDefinitions.map((series) => series.color),
      ...thresholdDefinitions.map((series) => series.color),
    ],
    grid: {
      bottom: 2,
      containLabel: true,
      left: 4,
      right: 12,
      top: legendData.length ? 48 : 18,
    },
    legend: legendData.length
      ? {
          data: legendData,
          icon: "roundRect",
          itemGap: 14,
          itemHeight: 6,
          itemWidth: 9,
          selectedMode: false,
          textStyle: {
            color: palette.legendText,
            fontSize: 11,
          },
          top: 0,
        }
      : undefined,
    tooltip: {
      axisPointer: {
        shadowStyle: {
          color: palette.shadow,
        },
        type: "shadow",
      },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (params: unknown) =>
        formatOccupancyReportTooltip(
          params,
          points,
          previousPoints,
          metricVisibility,
          limits,
          definition.resolutionLabel,
        ),
      padding: [10, 12],
      textStyle: {
        color: palette.tooltipText,
        fontSize: 12,
      },
      trigger: "axis",
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : `${formatOccupancyValue(Number(value))} pessoas`,
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 11,
        hideOverlap: true,
        interval:
          definition.granularity === "hour"
            ? occupancyFixedHourLabelInterval
            : "auto",
      },
      axisLine: {
        lineStyle: {
          color: palette.axisLine,
        },
      },
      axisTick: {
        show: false,
      },
      boundaryGap: true,
      data: points.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 11,
      },
      min: 0,
      minInterval: dense ? 1 : undefined,
      splitLine: {
        lineStyle: {
          color: palette.gridLine,
        },
      },
      type: "value",
    },
    series: [
      ...(showPrevious
        ? [
            {
              barCategoryGap: dense ? "54%" : "60%",
              barGap: "-100%",
              barMaxWidth: dense ? 12 : 26,
              data: previousBaseValues,
              emphasis: {
                disabled: true,
              },
              itemStyle: {
                color: "transparent",
              },
              name: "Base comparativa",
              silent: true,
              stack: "previous_occupancy_range",
              tooltip: {
                show: false,
              },
              type: "bar",
            },
            {
              barCategoryGap: dense ? "54%" : "60%",
              barGap: "-100%",
              barMaxWidth: dense ? 12 : 26,
              barMinHeight: 2,
              data: previousSpanValues,
              emphasis: {
                disabled: true,
              },
              itemStyle: {
                borderColor: palette.previousRangeBorder,
                borderRadius: [2, 2, 2, 2],
                borderWidth: 1,
                color: palette.previousRangeFill,
              },
              name: "Base comparativa",
              stack: "previous_occupancy_range",
              tooltip: {
                show: false,
              },
              type: "bar",
              z: 1,
            },
          ]
        : []),
      {
        barCategoryGap: dense ? "56%" : "62%",
        barGap: showPrevious ? "-100%" : undefined,
        barMaxWidth: dense ? 10 : 22,
        data: rangeBaseValues,
        emphasis: {
          disabled: true,
        },
        itemStyle: {
          color: "transparent",
        },
        name: "Base",
        silent: true,
        stack: "occupancy_range",
        tooltip: {
          show: false,
        },
        type: "bar",
      },
      {
        barCategoryGap: dense ? "56%" : "62%",
        barMaxWidth: dense ? 10 : 22,
        barMinHeight: 2,
        data: rangeSpanValues,
        emphasis: {
          itemStyle: {
            color: palette.rangeEmphasis,
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 2, 2],
          color: {
            colorStops: [
              { color: palette.rangeStart, offset: 0 },
              { color: palette.rangeEnd, offset: 1 },
            ],
            type: "linear",
            x: 0,
            x2: 0,
            y: 0,
            y2: 1,
          },
        },
        name: "Intervalo",
        stack: "occupancy_range",
        tooltip: {
          show: false,
        },
        type: "bar",
        z: 2,
      },
      ...thresholdDefinitions.map((series) => ({
        data: series.data,
        emphasis: {
          disabled: true,
        },
        lineStyle: {
          color: series.color,
          opacity: 0.86,
          type: "dashed",
          width: 1.6,
        },
        name: series.name,
        showSymbol: false,
        smooth: false,
        symbol: "none",
        tooltip: {
          valueFormatter: (value: number | null | undefined) =>
            value === null || value === undefined
              ? "-"
              : `${formatOccupancyValue(Number(value))} pessoas`,
        },
        type: "line",
        z: 3,
      })),
      ...markerDefinitions.map((series) => ({
        data: series.data,
        itemStyle: {
          borderWidth: 0,
          color: series.fill,
        },
        name: series.name,
        rippleEffect: series.effect
          ? {
              brushType: "stroke",
              period: 2.8,
              scale: 2.8,
            }
          : undefined,
        showEffectOn: series.effect ? "render" : undefined,
        symbol: series.symbol,
        symbolOffset: series.offset,
        symbolSize: series.size,
        tooltip: {
          valueFormatter: (value: number | null | undefined) =>
            value === null || value === undefined
              ? "-"
              : `${formatOccupancyValue(Number(value))} pessoas`,
        },
        type: series.effect ? "effectScatter" : "scatter",
        z: series.z,
      })),
    ],
  };
}

function formatOccupancyReportTooltip(
  params: unknown,
  points: OccupancyReportPoint[],
  previousPoints: OccupancyReportPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: {
    maximum?: number;
    minimum?: number;
  },
  resolutionLabel?: string,
) {
  const dataIndex = tooltipDataIndex(params);
  if (dataIndex === undefined) return "";

  const point = points[dataIndex];
  if (!point) return "";

  const previous = previousPoints[dataIndex];
  const rows = [
    `<strong>${escapeHtml(point.label)}</strong>`,
    resolutionLabel
      ? `<span>Resolução: ${escapeHtml(resolutionLabel)}</span>`
      : undefined,
    point.current === null
      ? undefined
      : `Atual: ${formatOccupancyValue(point.current)}`,
    metricVisibility.average
      ? `Média: ${formatOccupancyValue(point.average)}`
      : undefined,
    metricVisibility.minimum
      ? `Mínimo: ${formatOccupancyValue(point.minimum)}`
      : undefined,
    metricVisibility.peak
      ? `Máximo: ${formatOccupancyValue(point.peak)}`
      : undefined,
    previous
      ? `<br/><strong>Base comparativa (${escapeHtml(previous.label)})</strong>`
      : undefined,
    previous &&
    metricVisibility.average &&
    point.average !== null &&
    previous.average !== null
      ? `Média comparativa: ${formatOccupancyValue(previous.average)} ${metricDeltaLabel(
          point.average,
          previous.average,
        )}`
      : undefined,
    previous && metricVisibility.minimum
      ? `Mínimo comparativo: ${formatOccupancyValue(previous.minimum)}`
      : undefined,
    previous && metricVisibility.peak
      ? `Máximo comparativo: ${formatOccupancyValue(previous.peak)}`
      : undefined,
    limits.minimum === undefined
      ? undefined
      : `Limite mínimo: ${formatOccupancyValue(limits.minimum)}`,
    limits.maximum === undefined
      ? undefined
      : `Limite máximo: ${formatOccupancyValue(limits.maximum)}`,
  ];

  return rows.filter(Boolean).join("<br/>");
}

function metricDeltaLabel(current: number, previous: number) {
  const delta = roundValue(current - previous);
  if (!delta) return "(sem variação)";

  return `(${delta > 0 ? "+" : ""}${formatOccupancyValue(delta)})`;
}

function tooltipDataIndex(params: unknown) {
  const candidates = Array.isArray(params) ? params : [params];
  const item = candidates.find(
    (candidate): candidate is { dataIndex: number } =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      typeof (candidate as { dataIndex?: unknown }).dataIndex === "number",
  );

  return item?.dataIndex;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function denseMarkerSize(
  definition: OccupancyReportDefinition,
  kind: "current" | "average" | "previous",
): number | [number, number] {
  const dense =
    definition.granularity === "minute" || definition.granularity === "hour";

  if (kind === "current") return dense ? 6 : 7.5;
  if (kind === "previous") return dense ? [11, 1.8] : [15, 2];
  return dense ? [13, 2] : [19, 2.2];
}

function buildAvailableScopeModes(scenarios: OccupancyScenario[]) {
  // Mínimo e máximo de câmeras independentes não podem ser somados com
  // segurança. Location e sub-location só devem voltar quando a API fornecer
  // um total temporal certificado para esses escopos.
  return scenarios.length
    ? [{ label: "Cenário", value: "scenario" as const }]
    : [];
}

function buildOccupancyReportScopes({
  cameras,
  groups,
  locations,
  manager,
  mode,
  scenarios,
  subLocations,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  mode: OccupancyReportScopeMode;
  scenarios: OccupancyScenario[];
  subLocations: SubLocation[];
}) {
  if (mode === "location") {
    return buildLocationCameraOptions({
      cameras,
      locations,
      manager,
    }).map<OccupancyReportScope>((option) => ({
        cameraIds: option.cameraIds,
        description: option.description,
        id: option.id,
        location: option.location,
        mode: "location",
        name: option.name,
      }));
  }

  if (mode === "sub_location") {
    return buildSubLocationCameraOptions({
      cameras,
      groups,
      locations,
      manager,
      subLocations,
    }).map<OccupancyReportScope>((option) => ({
      cameraIds: option.cameraIds,
      description: option.description,
      group: option.group,
      id: option.id,
      mode: "sub_location",
      name: option.name,
      parentName: option.parentName,
      subLocation: option.subLocation,
    }));
  }

  return scenarios.map<OccupancyReportScope>((scenario) => ({
    cameraIds: [],
    description: `${scenario.object_class || DEFAULT_OBJECT_CLASS} por cenário de ocupação.`,
    id: scenario.id,
    mode: "scenario",
    name: scenario.name,
    scenario,
  }));
}

function scopeModeLabel(mode: OccupancyReportScopeMode) {
  if (mode === "location") return "Location";
  if (mode === "sub_location") return "Sub-location";
  return "Cenário";
}

function buildComparisonDefinition(
  definition: OccupancyReportDefinition,
  intradayComparison: IntradayComparisonMode,
): OccupancyReportDefinition {
  const comparisonSegments = listDefinitionQuerySegments(definition).map(
    (segment): OccupancyReportQuerySegment => {
      const bucketStarts = occupancyComparisonBucketStarts({
        bucketStarts: segment.bucketStarts,
        granularity: segment.granularity,
        intradayComparison,
      });
      const first = bucketStarts[0];
      const last = bucketStarts.at(-1);
      if (!first || !last) {
        throw new Error(
          "O comparativo de ocupação não possui buckets certificados.",
        );
      }
      return {
        bucketStarts,
        from: new Date(first),
        granularity: segment.granularity,
        to: addGranularity(last, segment.granularity),
      };
    },
  );
  const comparisonStarts = comparisonSegments.flatMap(
    (segment) => segment.bucketStarts,
  );
  const from = comparisonStarts.length
    ? new Date(Math.min(...comparisonStarts.map((date) => date.getTime())))
    : definition.from;

  return {
    ...definition,
    bucketStarts: undefined,
    id: previousId(definition.id),
    from,
    openBucket: undefined,
    querySegments: comparisonSegments,
    to: new Date(
      Math.max(...comparisonSegments.map((segment) => segment.to.getTime())),
    ),
  };
}

function comparisonDescription(
  definition: OccupancyReportDefinition,
  intradayComparison: IntradayComparisonMode,
) {
  let description: string;
  const segmentGranularities = new Set(
    listDefinitionQuerySegments(definition).map(
      (segment) => segment.granularity,
    ),
  );
  if (
    segmentGranularities.has("month") &&
    segmentGranularities.has("day")
  ) {
    description =
      "Meses completos usam o mesmo mês do ano anterior; bordas diárias usam os mesmos dias da semana anterior.";
  } else if (
    segmentGranularities.has("week") &&
    segmentGranularities.has("day")
  ) {
    description =
      "Semanas completas usam quatro semanas antes; bordas diárias usam os mesmos dias da semana anterior.";
  } else if (definition.granularity === "minute" || definition.granularity === "hour") {
    description = intradayComparison === "last_week"
      ? "Comparando com a semana passada."
      : "Comparando com ontem.";
  } else if (definition.granularity === "day") {
    description = "Comparando com os mesmos dias da semana passada.";
  } else if (definition.granularity === "week") {
    description = "Comparando cada semana com quatro semanas antes.";
  } else if (definition.granularity === "month") {
    description = "Comparando cada mês com o mesmo mês do ano anterior.";
  } else if (definition.granularity === "semester") {
    description =
      "Comparando cada semestre com o mesmo semestre do ano anterior.";
  } else {
    description = "Comparando cada ano com o ano anterior.";
  }

  return `${description} O bucket em andamento só entra no comparativo depois de fechado.`;
}

function maskOpenBucketComparisons(
  data: Record<string, OccupancyReportState>,
  currentDefinitions: OccupancyReportDefinition[],
  now: Date,
) {
  currentDefinitions.forEach((definition) => {
    const bucketDescriptors = listDefinitionBucketDescriptors(definition);
    const openDescriptorIndex = bucketDescriptors.findIndex(
      ({ bucketStart, granularity, segmentTo }) => {
        const bucketEnd = addGranularity(bucketStart, granularity);
        const certifiedEnd = bucketEnd > segmentTo ? segmentTo : bucketEnd;
        return bucketStart <= now && now < certifiedEnd;
      },
    );
    const openBucket = bucketDescriptors[openDescriptorIndex]?.bucketStart;
    const openIndex = openBucket
      ? definition.granularity === "hour"
        ? openBucket.getHours()
        : openDescriptorIndex
      : -1;
    if (openIndex < 0) return;

    const previousKey = previousId(definition.id);
    const previous = data[previousKey];
    if (!previous?.points[openIndex]) return;

    data[previousKey] = {
      ...previous,
      points: previous.points.map((point, index) =>
        index === openIndex
          ? {
              ...point,
              ...emptyOccupancyMetric(),
            }
          : point,
      ),
    };
  });
}

function occupancyScenarioAggregatePath(
  scenarioId: string,
  definition: OccupancyReportDefinition,
) {
  const params = new URLSearchParams({
    from: aggregateQueryIso(definition.from, definition.granularity),
    granularity: definition.granularity,
    to: aggregateQueryIso(definition.to, definition.granularity),
  });

  return `/occupancy/scenarios/${scenarioId}/aggregate?${params.toString()}`;
}

function occupancyScenarioHistoryPath(scenarioId: string, at: Date) {
  const params = new URLSearchParams({ at: at.toISOString() });
  return `/occupancy/scenarios/${scenarioId}/history?${params.toString()}`;
}

function occupancyPath(from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    object_class: DEFAULT_OBJECT_CLASS,
    to: to.toISOString(),
  });

  return `/occupancy?${params.toString()}`;
}

function previousId(id: string) {
  return `${id}__previous`;
}

function listBucketStarts(definition: OccupancyReportDefinition) {
  return listDefinitionQuerySegments(definition).flatMap((segment) =>
    segment.bucketStarts.map((bucketStart) => new Date(bucketStart)),
  );
}

function listDefinitionQuerySegments(
  definition: OccupancyReportDefinition,
): OccupancyReportQuerySegment[] {
  if (definition.querySegments?.length) {
    return definition.querySegments.flatMap((segment) =>
      splitOpenQuerySegment({
        ...segment,
        bucketStarts: segment.bucketStarts.map((bucket) => new Date(bucket)),
        from: new Date(segment.from),
        openBucket: segment.openBucket
          ? new Date(segment.openBucket)
          : undefined,
        to: new Date(segment.to),
      }),
    );
  }

  return splitOpenQuerySegment({
    bucketStarts:
      definition.bucketStarts?.map((bucket) => new Date(bucket)) ??
      listWindowBucketStarts(
        definition.from,
        definition.to,
        definition.granularity,
      ),
    from: new Date(definition.from),
    granularity: definition.granularity,
    openBucket: definition.openBucket
      ? new Date(definition.openBucket)
      : undefined,
    to: new Date(definition.to),
  });
}

function splitOpenQuerySegment(
  segment: OccupancyReportQuerySegment,
): OccupancyReportQuerySegment[] {
  if (!segment.openBucket) return [segment];

  const openStart = segment.openBucket;
  const openEnd = new Date(
    Math.min(
      addGranularity(openStart, segment.granularity).getTime(),
      segment.to.getTime(),
    ),
  );
  const beforeBuckets = segment.bucketStarts.filter(
    (bucket) => bucket < openStart,
  );
  const openBuckets = segment.bucketStarts.filter(
    (bucket) => bucket >= openStart && bucket < openEnd,
  );
  const afterBuckets = segment.bucketStarts.filter(
    (bucket) => bucket >= openEnd,
  );
  const result: OccupancyReportQuerySegment[] = [];

  if (beforeBuckets.length) {
    result.push({
      bucketStarts: beforeBuckets,
      from: segment.from,
      granularity: segment.granularity,
      to: new Date(openStart),
    });
  }
  if (openBuckets.length) {
    result.push({
      bucketStarts: openBuckets,
      from: new Date(openStart),
      granularity: segment.granularity,
      openBucket: new Date(openStart),
      to: openEnd,
    });
  }
  if (afterBuckets.length) {
    result.push({
      bucketStarts: afterBuckets,
      from: openEnd,
      granularity: segment.granularity,
      to: segment.to,
    });
  }

  if (!result.length) {
    throw new Error("O bucket aberto de ocupação não pertence ao segmento.");
  }
  return result;
}

function definitionForQuerySegment(
  definition: OccupancyReportDefinition,
  segment: OccupancyReportQuerySegment,
): OccupancyReportDefinition {
  return {
    ...definition,
    bucketStarts: segment.bucketStarts,
    from: segment.from,
    granularity: segment.granularity,
    openBucket: segment.openBucket,
    querySegments: undefined,
    to: segment.to,
  };
}

function listDefinitionBucketDescriptors(
  definition: OccupancyReportDefinition,
) {
  return listDefinitionQuerySegments(definition).flatMap((segment) =>
    segment.bucketStarts.map((bucketStart) => ({
      bucketStart: new Date(bucketStart),
      granularity: segment.granularity,
      segmentTo: new Date(segment.to),
    })),
  );
}

function listWindowBucketStarts(
  from: Date,
  to: Date,
  granularity: OccupancyReportDefinition["granularity"],
) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(from, granularity);
  const end = alignEndToGranularity(to, granularity);
  let guard = 0;

  while (cursor < end && guard < 500) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, granularity);
    guard += 1;
  }

  if (cursor < end) {
    throw new RangeError(
      "O intervalo do relatório excedeu o limite de buckets e não pode ser truncado.",
    );
  }

  return starts;
}

function buildEmptyPoints(definition: OccupancyReportDefinition) {
  const points = listDefinitionBucketDescriptors(definition).map(
    ({ bucketStart, granularity }) => ({
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, granularity),
      ...emptyOccupancyMetric(),
    }),
  );
  return occupancyReportDisplayPoints(definition, points);
}

function summarizeOccupancyRangeMetrics(
  points: OccupancyReportPoint[],
): OccupancyReportMetric {
  const latest = points.at(-1);
  if (!latest) return emptyOccupancyMetric();

  const minimumValues = points.map((point) => point.minimum);
  const peakValues = points.map((point) => point.peak);
  const averageValues = points.map((point) => point.average);
  const currentValues = points.map((point) => point.current);
  const completeMinimum = minimumValues.every(isCertifiedMetricValue);
  const completePeak = peakValues.every(isCertifiedMetricValue);
  const completeCoverage =
    completeMinimum &&
    completePeak &&
    averageValues.every(isCertifiedMetricValue) &&
    currentValues.every(isCertifiedMetricValue);

  return {
    // A API não fornece peso/duração para compor médias de vários dias.
    // Portanto a média e o fechamento permanecem explicitamente do último
    // bucket e só são publicados quando todo o intervalo está certificado.
    average: completeCoverage ? latest.average : null,
    current: completeCoverage ? latest.current : null,
    minimum: completeMinimum
      ? Math.min(...minimumValues)
      : null,
    peak: completePeak ? Math.max(...peakValues) : null,
  };
}

function isCertifiedMetricValue(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function occupancyReportDisplayPoints(
  definition: OccupancyReportDefinition,
  points: OccupancyReportPoint[],
) {
  return definition.granularity === "hour"
    ? buildFixedOccupancyHourlyPoints(definition.from, points)
    : points;
}

function roundValue(value: number) {
  return Math.round(value * 10) / 10;
}

function formatOccupancyValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value);
}

function occupancyReportDateSlug(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function alignToGranularity(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  if (granularity === "semester") return startOfSemester(date);
  if (granularity === "year") return startOfYear(date);
  return startOfMonth(date);
}

function alignEndToGranularity(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
) {
  const aligned = alignToGranularity(date, granularity);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity);
}

function addGranularity(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") return endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "semester") return addMonths(date, 6);
  if (granularity === "year") return addYears(date, 1);
  return addMonths(date, 1);
}

function bucketLabel(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
) {
  if (granularity === "minute") return formatTime(date);
  if (granularity === "hour") return `${String(date.getHours()).padStart(2, "0")}h`;
  if (granularity === "day") {
    const dayMonth = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);

    return `${weekdayShortName(date)} ${dayMonth}`;
  }
  if (granularity === "week") return weekOfMonthLabel(date);
  if (granularity === "semester") {
    return `${date.getMonth() < 6 ? "1S" : "2S"} ${date.getFullYear()}`;
  }
  if (granularity === "year") return String(date.getFullYear());

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function weekOfMonthLabel(date: Date) {
  const monthGridStart = startOfWeek(startOfMonth(date));
  const index =
    Math.max(
      0,
      Math.round(
        (startOfWeek(date).getTime() - monthGridStart.getTime()) / (7 * DAY_MS),
      ),
    ) + 1;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(date)
    .replace(".", "");

  return `${index}ª sem. ${month}`;
}

function weekdayShortName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
}

function startOfMinute(date: Date) {
  return startOfAggregateBucket(date, "minute");
}

function startOfHour(date: Date) {
  return startOfAggregateBucket(date, "hour");
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfSemester(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

async function captureOccupancyLoad<T>(
  request: Promise<T>,
  fallbackMessage: string,
): Promise<OccupancyLoadResult<T>> {
  try {
    return { data: await request, error: "" };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : fallbackMessage,
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}
