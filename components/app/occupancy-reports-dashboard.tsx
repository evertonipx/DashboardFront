"use client";

import * as React from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Clock3,
  Gauge,
  MapPinned,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { AiAnalysisAction } from "@/components/app/deferred-ai-analysis-action";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import {
  COMPACT_METRIC_LAYOUT_DEFAULTS,
  CompactMetricCard,
} from "@/components/app/compact-metric-card";
import {
  useOccupancyComparisonCards,
  type OccupancyComparisonReportSnapshot,
} from "@/components/app/occupancy-comparison-widgets";
import {
  useOccupancyDurationCards,
  type OccupancyDurationReportSnapshot,
} from "@/components/app/occupancy-duration-widgets";
import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import { OccupancyBlockingState } from "@/components/app/occupancy-blocking-state";
import {
  DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
  OccupancyCustomWidgetActions,
  OccupancyCustomWidgetDialog,
  occupancyCustomMetricLabel,
  occupancyGranularityLabel,
  type OccupancyCustomWidgetForm,
} from "@/components/app/occupancy-custom-widget-editor";
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
  resolveOccupancyChartPalette,
  type OccupancyChartPalette,
} from "@/components/app/occupancy-chart-palette";
import { OccupancyPaletteSelect } from "@/components/app/occupancy-palette-select";
import { useTheme } from "@/components/app/theme-provider";
import { useOccupancyDurationInsights } from "@/components/app/use-occupancy-duration-insights";
import { useOccupancyLoitering } from "@/components/app/use-occupancy-loitering";
import { useOccupancyWidgetSettings } from "@/components/app/use-occupancy-widget-settings";
import { useUserGridReady } from "@/components/app/use-user-grid-ready";
import {
  WidgetTitleText,
  useWidgetChartType,
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
import { AI_INSIGHTS_LIMITS } from "@/lib/ai-insights-limits";
import {
  aggregateQueryIso,
  endOfAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  loadDashboardFocus,
  resolveDashboardFocus,
  saveDashboardFocus,
} from "@/lib/dashboard-focus";
import {
  loadOccupancyAnalysisDateRange,
  normalizeOccupancyAnalysisDateRangeInput,
  occupancyAnalysisDatasetKey,
  resolveOccupancyAnalysisRange,
  saveOccupancyAnalysisDateRange,
  shiftOccupancyAnalysisDateInput,
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
  type CameraGroup,
  buildLocationCameraOptions,
  buildSubLocationCameraOptions,
} from "@/lib/camera-groups";
import {
  loadLiveDashboardSettings,
  saveLiveDashboardSettings,
  type IntradayComparisonMode,
} from "@/lib/live-dashboard-settings";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
  usesMasterCrossCompanyScope,
} from "@/lib/master-company-scope";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  companyCalendarDate,
  companyDateKey,
  companyZonedDateParts,
  endOfCompanyTimeZoneHour,
  requireCompanyTimeZone,
  startOfCompanyTimeZoneDay,
  startOfCompanyTimeZoneHour,
} from "@/lib/company-time-zone";
import {
  isCertifiedOccupancyCompanyTimeZone,
  requireCertifiedOccupancyCompanyTimeZone,
} from "@/lib/occupancy-company-time-zone";
import {
  occupancyCalendarBoundaryInstant,
  occupancyCalendarDateKey,
  shiftOccupancyCalendarDate,
  shiftOccupancyCompanyDay,
} from "@/lib/occupancy-calendar";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  occupancyAggregateBucketKey,
  occupancyAggregateCoverageWarning,
  occupancyAggregateMetadataWarning,
  occupancyAggregatePresentationWarning,
  resolveCertifiedOccupancyDataCutoff,
  requireOccupancyAggregateRows,
} from "@/lib/occupancy-aggregate-validation";
import {
  DEFAULT_OCCUPANCY_TREND_SERIES,
  deleteOccupancyCustomWidget,
  loadOccupancyCustomWidgets,
  OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertOccupancyCustomWidget,
  type OccupancyCustomMetric,
  type OccupancyCustomWidget,
  type OccupancyTrendCustomWidget,
} from "@/lib/occupancy-custom-widgets";
import { getOccupancyColorPalette } from "@/lib/occupancy-color-palettes";
import {
  buildFixedOccupancyHourlyPoints,
  occupancyFixedHourLabelInterval,
} from "@/lib/occupancy-hour-axis";
import {
  emptyOccupancyMetric,
} from "@/lib/occupancy-metrics";
import { occupancyObjectClassLabel } from "@/lib/occupancy-object-class";
import {
  DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS,
  loadOccupancyDashboardSettings,
  OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT,
  saveOccupancyDashboardSettings,
  type OccupancyMetricVisibility,
} from "@/lib/occupancy-dashboard-settings";
import {
  loadOccupancyWidgetSettings,
  OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
} from "@/lib/occupancy-widget-settings";
import { buildOccupancyDurationInsightAnalysisPeriod } from "@/lib/occupancy-duration-insights";
import { occupancyComparisonBucketStarts } from "@/lib/occupancy-report-comparison";
import {
  buildOccupancyReportResourcePlan,
  createOccupancyQueryScheduler,
  occupancyLiveSnapshotQuery,
  type OccupancyQueryScheduler,
} from "@/lib/occupancy-dashboard-query";
import { fetchOccupancyCivilAggregate } from "@/lib/occupancy-civil-aggregate-query";
import { sharedOccupancyCivilCapabilities } from "@/lib/occupancy-shared-query";
import {
  buildOccupancyScenarioSnapshotValue,
  occupancyScenarioSnapshotHasCompleteCoverage,
} from "@/lib/occupancy-scenario-snapshots";
import {
  requireOccupancyCurrentSnapshotRows,
  requireOccupancyHistoryResponse,
  requireOccupancyScenarioRows,
  requireOccupancySnapshotRowsForCameras,
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
  ReportChart,
  ReportMetric,
  ReportPayload,
  ReportTable,
} from "@/lib/report-export";
import type { CardChartType, CardPreference } from "@/lib/view-preferences";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";
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
  timeZone?: string;
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
  timeZone?: string;
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
  incomplete?: boolean;
};

type OccupancyAiDailyQueryPlan = {
  bucketStarts: Date[];
  chunks: OccupancyReportDefinition[];
};

type OccupancyReportMetric = {
  average: number | null;
  current: number | null;
  minimum: number | null;
  peak: number | null;
};

type CertifiedCurrentSnapshot = {
  activeAreas: number | null;
  areas: Array<{
    areaId: string;
    cameraId: string;
    value: number;
  }>;
  asOf: string;
  total: number;
};

type OccupancyCustomMetricPresentation = {
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "average" | "maximum" | "minimum" | "primary";
  value: number | string | null;
};

type OccupancyLiveCustomizationState = {
  capacity: number | null;
  scopeKey: string;
  widgets: OccupancyCustomWidget[];
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
const AI_OCCUPANCY_DAILY_CHUNK_DAYS = 62;
const MAX_CLOSED_SEGMENT_CACHE_ENTRIES = 256;
const MAX_OCCUPANCY_REPORT_BUCKETS = 500;
const MAX_OCCUPANCY_MINUTE_REPORT_BUCKETS = 1_600;
const EMPTY_OCCUPANCY_REPORT_DATA: Record<string, OccupancyReportState> = {};
const EMPTY_OCCUPANCY_CUSTOM_WIDGETS: OccupancyCustomWidget[] = [];

export function OccupancyReportsDashboard({
  analysis = false,
  manager = false,
}: OccupancyReportsDashboardProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const userGridReadiness = useUserGridReady(userId);
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(user, companyScopeId);
  const companyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const companyTimeZone = companyTimeZoneResolution.timeZone;
  const companyTimeZoneCertified =
    isCertifiedOccupancyCompanyTimeZone(companyTimeZoneResolution);
  const civilAggregateCapabilities = React.useMemo(
    () => sharedOccupancyCivilCapabilities(companyScopeId, companyTimeZone),
    [companyScopeId, companyTimeZone],
  );
  const settingsViewId = analysis ? "analysis" : "reports";
  const liveSettingsScope = { userId, viewId: settingsViewId };
  const dashboardFocusSurface = analysis
    ? "occupancy-analysis" as const
    : "occupancy-reports" as const;
  const canEditVisual = hasVisualAdminAccess(user);
  const scopeModeSelectId = React.useId();
  const scopeSelectId = React.useId();
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [scopeMode, setScopeMode] =
    React.useState<OccupancyReportScopeMode>("scenario");
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, OccupancyReportState>
  >({});
  const [chartDataScopeKey, setChartDataScopeKey] = React.useState("");
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState(
    () =>
      loadLiveDashboardSettings(companyScopeId, liveSettingsScope)
        .showPreviousPeriod,
  );
  const [intradayComparison, setIntradayComparison] =
    React.useState<IntradayComparisonMode>(
      () =>
        loadLiveDashboardSettings(companyScopeId, liveSettingsScope)
          .intradayComparison,
    );
  const [metricVisibilityState, setMetricVisibilityState] = React.useState(
    () => ({
      scopeKey: "",
      value: DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility,
    }),
  );
  const [loadingScopes, setLoadingScopes] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [chartLoadError, setChartLoadError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [reportRequested, setReportRequested] = React.useState(false);
  const [configurationReadyKey, setConfigurationReadyKey] = React.useState("");
  const [currentSnapshot, setCurrentSnapshot] =
    React.useState<CertifiedCurrentSnapshot | null>(null);
  const [currentSnapshotError, setCurrentSnapshotError] = React.useState("");
  const [clock, setClock] = React.useState(() => new Date());
  const [durationAnalysisCutoff, setDurationAnalysisCutoff] = React.useState(
    () => new Date(),
  );
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = React.useState(false);
  const [reportSettingsOpen, setReportSettingsOpen] = React.useState(false);
  const [layoutPreferences, setLayoutPreferences] = React.useState<
    CardPreference[]
  >([]);
  const [layoutPreferencesScopeKey, setLayoutPreferencesScopeKey] =
    React.useState("");
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<OccupancyCustomWidgetForm>({
      ...DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
      series: { ...DEFAULT_OCCUPANCY_TREND_SERIES },
    });
  const [liveCustomizationState, setLiveCustomizationState] =
    React.useState<OccupancyLiveCustomizationState>({
      capacity: null,
      scopeKey: "",
      widgets: [],
    });
  const [analysisRangeInput, setAnalysisRangeInput] = React.useState(() => {
    const todayInput = companyDateKey(new Date(), companyTimeZone);
    return { endInput: todayInput, startInput: todayInput };
  });
  const metadataRequestSequenceRef = React.useRef(0);
  const metadataAbortControllerRef = React.useRef<AbortController | null>(null);
  const activeMetadataRequestKeyRef = React.useRef("");
  const completedMetadataRequestKeyRef = React.useRef("");
  const metadataConsumerAttachedRef = React.useRef(false);
  const metadataAbortTimerRef = React.useRef<number | null>(null);
  const focusRef = React.useRef({ scopeMode, selectedId });
  const chartRequestSequenceRef = React.useRef(0);
  const chartAbortControllerRef = React.useRef<AbortController | null>(null);
  const activeChartRequestKeyRef = React.useRef("");
  const completedChartRequestKeyRef = React.useRef("");
  const chartConsumerAttachedRef = React.useRef(false);
  const chartAbortTimerRef = React.useRef<number | null>(null);
  const closedSegmentCacheRef = React.useRef(
    new Map<string, OccupancyReportState>(),
  );
  const configurationScopeKey = [
    analysis ? "analysis" : "reports",
    companyScopeId ?? "",
    userId ?? "",
    companyTimeZoneResolution.timeZone,
    companyTimeZoneResolution.fallback ? "fallback" : "certified",
  ].join("|");
  const metadataRequestKey = [
    analysis ? "analysis" : "reports",
    companyScopeId ?? "",
    userId ?? "",
    manager ? "manager" : "operator",
  ].join("|");

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
        companyTimeZone,
      ),
    [analysis, analysisRangeInput, clock, companyTodayInput, companyTimeZone],
  );
  const analysisIncludesToday = !analysis || reportRange.includesToday;
  const definitions = React.useMemo(
    () =>
      buildOccupancyReportDefinitions(
        reportRange.reference,
        analysisIncludesToday ? clock : null,
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
        cameras: [],
        groups: [],
        locations: [],
        manager,
        mode: scopeMode,
        scenarios,
        subLocations: [],
      }),
    [manager, scenarios, scopeMode],
  );
  const selectedScope = React.useMemo(
    () => scopeOptions.find((scope) => scope.id === selectedId) ?? null,
    [scopeOptions, selectedId],
  );
  const liveCustomizationScenarioId =
    analysis ? selectedScope?.scenario?.id ?? "" : "";
  const liveCustomizationScopeKey = liveCustomizationScenarioId
    ? [companyScopeId, userId ?? "", liveCustomizationScenarioId].join("|")
    : "";
  const liveCustomWidgets =
    liveCustomizationState.scopeKey === liveCustomizationScopeKey
      ? liveCustomizationState.widgets
      : EMPTY_OCCUPANCY_CUSTOM_WIDGETS;
  const liveScenarioCapacity =
    liveCustomizationState.scopeKey === liveCustomizationScopeKey
      ? liveCustomizationState.capacity
      : null;
  const reportPreferenceScopeId = selectedScope
    ? `${analysis ? "analysis" : "reports"}:${selectedScope.id}`
    : undefined;
  const {
    ready: analysisWidgetSettingsReady,
    settings: analysisWidgetSettings,
    updateSettings: updateAnalysisWidgetSettings,
  } = useOccupancyWidgetSettings({
    companyScopeId,
    userId,
    viewId: reportPreferenceScopeId,
  });
  const metricVisibilityScopeKey = reportPreferenceScopeId
    ? [companyScopeId ?? "", userId ?? "", reportPreferenceScopeId].join("|")
    : "";
  const metricVisibility =
    metricVisibilityState.scopeKey === metricVisibilityScopeKey
      ? metricVisibilityState.value
      : DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility;
  const setMetricVisibility = React.useCallback(
    (value: React.SetStateAction<OccupancyMetricVisibility>) => {
      if (!reportPreferenceScopeId || !metricVisibilityScopeKey) return;
      const base =
        metricVisibilityState.scopeKey === metricVisibilityScopeKey
          ? metricVisibilityState.value
          : DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility;
      const next = typeof value === "function" ? value(base) : value;
      setMetricVisibilityState({
        scopeKey: metricVisibilityScopeKey,
        value: next,
      });
      saveOccupancyDashboardSettings(
        { metricVisibility: next, schemaVersion: 2 },
        companyScopeId,
        userId,
        reportPreferenceScopeId,
      );
    },
    [
      companyScopeId,
      metricVisibilityScopeKey,
      metricVisibilityState,
      reportPreferenceScopeId,
      userId,
    ],
  );
  const layoutPreferencesIdentityKey = reportPreferenceScopeId
    ? [companyScopeId ?? "", userId ?? "", reportPreferenceScopeId].join("|")
    : "";
  const layoutPreferencesReady = Boolean(
    userGridReadiness !== "pending" &&
      layoutPreferencesIdentityKey &&
      layoutPreferencesScopeKey === layoutPreferencesIdentityKey,
  );
  const requestedHistoricalCardIds = React.useMemo(
    () =>
      new Set(
        layoutPreferencesReady
          ? layoutPreferences
              .filter((preference) => preference.visible === true)
              .map((preference) => preference.id)
          : [],
      ),
    [layoutPreferences, layoutPreferencesReady],
  );
  const handleLayoutPreferencesChange = React.useCallback(
    (preferences: CardPreference[]) => {
      if (!layoutPreferencesIdentityKey) return;
      setLayoutPreferences(preferences);
      setLayoutPreferencesScopeKey(layoutPreferencesIdentityKey);
    },
    [layoutPreferencesIdentityKey],
  );

  React.useEffect(() => {
    if (!reportPreferenceScopeId || !metricVisibilityScopeKey) {
      setMetricVisibilityState((current) =>
        current.scopeKey
          ? {
              scopeKey: "",
              value: DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS.metricVisibility,
            }
          : current,
      );
      return;
    }

    const synchronizeMetricVisibility = () => {
      const value = loadOccupancyDashboardSettings(
        companyScopeId,
        userId,
        reportPreferenceScopeId,
      ).metricVisibility;
      setMetricVisibilityState((current) =>
        current.scopeKey === metricVisibilityScopeKey &&
        current.value.average === value.average &&
        current.value.minimum === value.minimum &&
        current.value.peak === value.peak
          ? current
          : { scopeKey: metricVisibilityScopeKey, value },
      );
    };
    const synchronizeSettingsEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          companyId?: string | null;
          userId?: string | null;
          viewId?: string | null;
        }>
      ).detail;
      if (detail?.companyId != null && detail.companyId !== companyScopeId) return;
      if (detail?.userId != null && detail.userId !== userId) return;
      if (
        detail?.viewId != null &&
        detail.viewId !== reportPreferenceScopeId
      ) {
        return;
      }
      synchronizeMetricVisibility();
    };
    const synchronizeUserGrid = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
      if (detail?.userId != null && detail.userId !== userId) return;
      synchronizeMetricVisibility();
    };

    synchronizeMetricVisibility();
    window.addEventListener("storage", synchronizeMetricVisibility);
    window.addEventListener(
      OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT,
      synchronizeSettingsEvent,
    );
    window.addEventListener(USER_GRID_HYDRATED_EVENT, synchronizeUserGrid);
    return () => {
      window.removeEventListener("storage", synchronizeMetricVisibility);
      window.removeEventListener(
        OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT,
        synchronizeSettingsEvent,
      );
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, synchronizeUserGrid);
    };
  }, [
    companyScopeId,
    metricVisibilityScopeKey,
    reportPreferenceScopeId,
    userId,
  ]);

  React.useEffect(() => {
    if (!liveCustomizationScopeKey || !liveCustomizationScenarioId) {
      setLiveCustomizationState((current) =>
        current.scopeKey || current.widgets.length || current.capacity !== null
          ? { capacity: null, scopeKey: "", widgets: [] }
          : current,
      );
      return;
    }

    const synchronizeLiveCustomizations = () => {
      const widgets = loadOccupancyCustomWidgets(companyScopeId, {
        userId,
        viewId: liveCustomizationScenarioId,
      });
      const capacity =
        loadOccupancyWidgetSettings(
          companyScopeId,
          userId,
          liveCustomizationScenarioId,
        ).capacities[liveCustomizationScenarioId] ?? null;
      setLiveCustomizationState({
        capacity,
        scopeKey: liveCustomizationScopeKey,
        widgets,
      });
    };

    synchronizeLiveCustomizations();
    window.addEventListener("storage", synchronizeLiveCustomizations);
    window.addEventListener(
      OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
      synchronizeLiveCustomizations,
    );
    window.addEventListener(
      OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
      synchronizeLiveCustomizations,
    );
    window.addEventListener(
      USER_GRID_HYDRATED_EVENT,
      synchronizeLiveCustomizations,
    );
    return () => {
      window.removeEventListener("storage", synchronizeLiveCustomizations);
      window.removeEventListener(
        OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
        synchronizeLiveCustomizations,
      );
      window.removeEventListener(
        OCCUPANCY_WIDGET_SETTINGS_UPDATED_EVENT,
        synchronizeLiveCustomizations,
      );
      window.removeEventListener(
        USER_GRID_HYDRATED_EVENT,
        synchronizeLiveCustomizations,
      );
    };
  }, [
    companyScopeId,
    liveCustomizationScenarioId,
    liveCustomizationScopeKey,
    userId,
  ]);
  const occupancyDurationAnalysisPeriod = React.useMemo(() => {
    if (!analysis) return null;
    const from =
      reportRange.instantFrom ??
      occupancyCalendarBoundaryInstant(reportRange.from, companyTimeZone);
    const to =
      reportRange.instantTo ??
      occupancyCalendarBoundaryInstant(reportRange.to, companyTimeZone);
    return buildOccupancyDurationInsightAnalysisPeriod({
      cutoff: reportRange.includesToday ? durationAnalysisCutoff : to,
      from,
      timeZone: companyTimeZone,
      to,
    });
  }, [analysis, companyTimeZone, durationAnalysisCutoff, reportRange]);
  const occupancyAnalysisComparisonPeriod = React.useMemo(() => {
    if (!analysis) return null;
    const from =
      reportRange.instantFrom ??
      occupancyCalendarBoundaryInstant(reportRange.from, companyTimeZone);
    const rangeTo =
      reportRange.instantTo ??
      occupancyCalendarBoundaryInstant(reportRange.to, companyTimeZone);
    const to =
      reportRange.includesToday && durationAnalysisCutoff < rangeTo
        ? durationAnalysisCutoff
        : rangeTo;
    if (from >= to) return null;
    return {
      contextLabel: formatOccupancyAnalysisRangeLabel(analysisRangeInput),
      from,
      referenceAt: new Date(to.getTime() - 1),
      to,
    };
  }, [
    analysis,
    analysisRangeInput,
    companyTimeZone,
    durationAnalysisCutoff,
    reportRange,
  ]);
  const occupancyDurationInsights = useOccupancyDurationInsights({
    companyScopeId,
    defaultWidgetColor: getOccupancyColorPalette(
      analysisWidgetSettings.colorPaletteId,
    ).colors[0],
    enabled: Boolean(
      companyTimeZoneCertified &&
      analysis &&
        layoutPreferencesReady &&
        reportRequested &&
        selectedScope?.scenario &&
        occupancyDurationAnalysisPeriod
    ),
    focusScenarioId: selectedScope?.scenario?.id ?? "",
    monitorMode,
    period: occupancyDurationAnalysisPeriod,
    preferences: layoutPreferencesReady ? layoutPreferences : [],
    requestedCardIds: requestedHistoricalCardIds,
    refreshMode: "manual",
    scenarios,
    timeZone: companyTimeZone,
    userId,
  });
  const refreshOccupancyDurationInsights = occupancyDurationInsights.refresh;
  const occupancyAnalysisComparison = useOccupancyComparisonCards({
    companyScopeId,
    enabled: Boolean(
      companyTimeZoneCertified &&
        analysis &&
        layoutPreferencesReady &&
        reportRequested &&
        selectedScope?.scenario &&
        occupancyAnalysisComparisonPeriod
    ),
    focusScenarioId: selectedScope?.scenario?.id ?? "",
    monitorMode,
    period: occupancyAnalysisComparisonPeriod,
    preferenceScopeId: reportPreferenceScopeId,
    preferences: layoutPreferencesReady ? layoutPreferences : [],
    refreshMode: "manual",
    reportPreferences: layoutPreferencesReady ? layoutPreferences : [],
    requestedCardIds: requestedHistoricalCardIds,
    scenarios,
    timeZone: companyTimeZone,
    timeZoneWarning: companyTimeZoneResolution.warning,
    userId,
  });
  const refreshOccupancyAnalysisComparison =
    occupancyAnalysisComparison.refresh;
  const occupancyLoiteringPeriod = React.useMemo(() => {
    if (!reportRequested) return null;
    if (analysis) {
      const from =
        reportRange.instantFrom ??
        occupancyCalendarBoundaryInstant(reportRange.from, companyTimeZone);
      const rangeTo =
        reportRange.instantTo ??
        occupancyCalendarBoundaryInstant(reportRange.to, companyTimeZone);
      const to = reportRange.includesToday && durationAnalysisCutoff < rangeTo
        ? durationAnalysisCutoff
        : rangeTo;
      return from < to
        ? {
            contextLabel: formatOccupancyAnalysisRangeLabel(analysisRangeInput),
            from,
            to,
          }
        : null;
    }
    const broadest =
      definitions.find((definition) => definition.id === "occupancy_report_month") ??
      definitions.at(-1);
    if (!broadest) return null;
    const civilGranularity = ["day", "week", "month", "semester", "year"].includes(
      broadest.granularity,
    );
    const from = civilGranularity
      ? occupancyCalendarBoundaryInstant(broadest.from, companyTimeZone)
      : broadest.from;
    const rangeTo = civilGranularity
      ? occupancyCalendarBoundaryInstant(broadest.to, companyTimeZone)
      : broadest.to;
    const to = durationAnalysisCutoff < rangeTo
      ? durationAnalysisCutoff
      : rangeTo;
    return from < to
      ? { contextLabel: "últimos 12 meses até agora", from, to }
      : null;
  }, [
    analysis,
    analysisRangeInput,
    companyTimeZone,
    definitions,
    durationAnalysisCutoff,
    reportRange,
    reportRequested,
  ]);
  const occupancyLoitering = useOccupancyLoitering({
    companyScopeId,
    enabled: Boolean(
      companyTimeZoneCertified &&
      layoutPreferencesReady &&
        reportRequested &&
        selectedScope?.scenario &&
        occupancyLoiteringPeriod
    ),
    focusScenarioId: selectedScope?.scenario?.id ?? "",
    monitorMode,
    period: occupancyLoiteringPeriod,
    preferences: layoutPreferencesReady ? layoutPreferences : [],
    refreshMode: "manual",
    requestedCardIds: requestedHistoricalCardIds,
    scenarios,
    timeZone: companyTimeZone,
    userId,
  });
  const refreshOccupancyLoitering = occupancyLoitering.refresh;
  const occupancyAnalysisDuration = useOccupancyDurationCards({
    companyScopeId,
    enabled: Boolean(
      companyTimeZoneCertified &&
        analysis &&
        layoutPreferencesReady &&
        reportRequested &&
        selectedScope?.scenario &&
        occupancyDurationAnalysisPeriod
    ),
    finalSnapshots: occupancyAnalysisComparison.snapshots,
    finalSnapshotsLoading: occupancyAnalysisComparison.snapshotsLoading,
    focusScenarioId: selectedScope?.scenario?.id ?? "",
    loadLoiteringSummaryRows: occupancyLoitering.loadReportSummaryRows,
    loiteringSummaryError: occupancyLoitering.summaryError,
    loiteringSummaryLoading: occupancyLoitering.summaryLoading,
    loiteringSummaryRows: occupancyLoitering.summaryRows,
    monitorMode,
    period: occupancyDurationAnalysisPeriod,
    preferences: layoutPreferencesReady ? layoutPreferences : [],
    refreshMode: "manual",
    requestedCardIds: requestedHistoricalCardIds,
    scenarios,
    timeZone: companyTimeZone,
    timeZoneWarning: companyTimeZoneResolution.warning,
  });
  const refreshOccupancyAnalysisDuration = occupancyAnalysisDuration.refresh;
  const reportResourcePlan = React.useMemo(() =>
    layoutPreferencesReady
      ? buildOccupancyReportResourcePlan({
          definitionIds: definitions.map((definition) => definition.id),
          hasScenario: Boolean(selectedScope?.scenario),
          metricVisibility,
          preferences: layoutPreferences,
          requestedCardIds: requestedHistoricalCardIds,
        })
      : { comparisonDefinitionIds: "", currentSnapshot: false, definitionIds: "" },
  [definitions, layoutPreferences, layoutPreferencesReady, metricVisibility, requestedHistoricalCardIds, selectedScope?.scenario]);
  const customWidgetResourcePlan = React.useMemo(
    () =>
      layoutPreferencesReady
        ? buildOccupancyCustomWidgetResourcePlan(
            liveCustomWidgets,
            layoutPreferences,
            requestedHistoricalCardIds,
          )
        : {
            comparisonDefinitionIds: "",
            currentSnapshot: false,
            definitionIds: "",
          },
    [layoutPreferences, layoutPreferencesReady, liveCustomWidgets, requestedHistoricalCardIds],
  );
  const requestedDefinitionIdsKey = mergeOccupancyResourceIds(
    reportResourcePlan.definitionIds,
    customWidgetResourcePlan.definitionIds,
  );
  const currentSnapshotRequested =
    reportResourcePlan.currentSnapshot ||
    customWidgetResourcePlan.currentSnapshot;
  const comparisonDefinitionIdsKey = mergeOccupancyResourceIds(
    reportResourcePlan.comparisonDefinitionIds,
    customWidgetResourcePlan.comparisonDefinitionIds,
  );
  const requestPlanKey = `${requestedDefinitionIdsKey}|snapshot:${
    currentSnapshotRequested ? "1" : "0"
  }|comparison:${showPreviousPeriod ? comparisonDefinitionIdsKey : ""}`;
  const requestedDefinitionIdSet = new Set(
    requestedDefinitionIdsKey.split("|").filter(Boolean),
  );
  const queriedDefinitions = definitions.filter((definition) =>
    requestedDefinitionIdSet.has(definition.id),
  );
  const comparisonDefinitionIdSet = new Set(
    comparisonDefinitionIdsKey.split("|").filter(Boolean),
  );
  const requestedChartScopeKey = React.useMemo(
    () =>
      `${occupancyAnalysisDatasetKey({
          analysis,
          companyScopeId,
          endDateInput: analysisRangeInput.endInput,
          intradayComparison,
          scopeId: selectedScope?.id,
          showPreviousPeriod,
          startDateInput: analysisRangeInput.startInput,
          timeZone: companyTimeZone,
        })}|plan:${requestPlanKey}`,
    [
      analysis,
      analysisRangeInput.endInput,
      analysisRangeInput.startInput,
      companyScopeId,
      companyTimeZone,
      intradayComparison,
      requestPlanKey,
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
    activeChartRequestKeyRef.current = "";
    completedChartRequestKeyRef.current = "";
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
    loadingCharts ||
    occupancyAnalysisComparison.loading ||
    occupancyAnalysisDuration.loading ||
    occupancyDurationInsights.loading ||
    occupancyLoitering.loading ||
    Boolean(reportRequested && selectedScope && !chartDataIsCurrent);
  const rangeMetric = React.useMemo(
    () =>
      summarizeOccupancyRangeMetrics(
        visibleChartData.occupancy_report_day?.points ?? [],
      ),
    [visibleChartData],
  );
  const rangeMetricState = visibleChartData.occupancy_report_day;
  const rangeMetricError = rangeMetricState?.error ?? "";
  const rangeMetricIncomplete = Boolean(rangeMetricState?.incomplete);
  const occupancyCertificationError =
    metadataError || (chartDataIsCurrent ? chartLoadError : "");
  const hasPartialOccupancyCoverage = Boolean(
    occupancyAnalysisComparison.dataCompleteUntil === null ||
    occupancyAnalysisDuration.dataCompleteUntil === null ||
    occupancyDurationInsights.dataCompleteUntil === null ||
    (currentSnapshotRequested && visibleCurrentSnapshotError) ||
      queriedDefinitions.some((definition) => {
        const state = visibleChartData[definition.id];
        const previous = showPreviousPeriod && comparisonDefinitionIdSet.has(definition.id)
          ? visibleChartData[previousId(definition.id)] : undefined;
        return state?.error || state?.incomplete || previous?.error || previous?.incomplete;
      }),
  );

  const loadScopes = React.useCallback(async (force = false) => {
    if (
      !force &&
      (activeMetadataRequestKeyRef.current === metadataRequestKey ||
        completedMetadataRequestKeyRef.current === metadataRequestKey)
    ) {
      return;
    }

    const requestSequence = ++metadataRequestSequenceRef.current;
    metadataAbortControllerRef.current?.abort();
    const controller = new AbortController();
    metadataAbortControllerRef.current = controller;
    activeMetadataRequestKeyRef.current = metadataRequestKey;
    if (force) completedMetadataRequestKeyRef.current = "";
    setLoadingScopes(true);
    setMetadataError("");
    try {
      const scenarioResponse = await apiFetch<unknown>(
        "/occupancy/scenarios",
        { companyScopeId, signal: controller.signal },
      );
      const scopedResponse = masterCrossCompanyScope && companyScopeId
        ? selectExplicitCompanyScopedRows(scenarioResponse, companyScopeId, {
            collectionKeys: ["data"], label: "cenários de Ocupação",
          }).rows
        : scenarioResponse;
      const nextScenarios = filterScopedApiRows(
        requireOccupancyScenarioRows(scopedResponse, companyScopeId),
        companyScopeId,
      );
      const visibleScenarios = manager
        ? nextScenarios
        : nextScenarios.filter((scenario) => scenario.active);
      if (
        controller.signal.aborted ||
        !metadataConsumerAttachedRef.current ||
        requestSequence !== metadataRequestSequenceRef.current ||
        activeMetadataRequestKeyRef.current !== metadataRequestKey
      ) {
        return;
      }
      setMetadataError("");
      setScenarios(visibleScenarios);
      const modes = buildAvailableScopeModes(visibleScenarios);
      const resolvedFocus = resolveDashboardFocus<OccupancyReportScopeMode>({
        availableModes: modes.map((mode) => mode.value),
        current: focusRef.current,
        getOptions: (mode) =>
          buildOccupancyReportScopes({
            cameras: [],
            groups: [],
            locations: [],
            manager,
            mode,
            scenarios: visibleScenarios,
            subLocations: [],
          }).map((option) => ({
            active: option.scenario?.active,
            id: option.id,
            mode: option.mode,
          })),
        stored: loadDashboardFocus<OccupancyReportScopeMode>(
          companyScopeId,
          userId,
          dashboardFocusSurface,
        ),
      });
      const nextFocus = resolvedFocus ?? {
        scopeMode: "scenario" as const,
        selectedId: "",
      };
      focusRef.current = nextFocus;
      setScopeMode(nextFocus.scopeMode);
      setSelectedId(nextFocus.selectedId);
      completedMetadataRequestKeyRef.current = metadataRequestKey;
    } catch (error) {
      if (
        controller.signal.aborted ||
        !metadataConsumerAttachedRef.current ||
        requestSequence !== metadataRequestSequenceRef.current ||
        activeMetadataRequestKeyRef.current !== metadataRequestKey
      ) {
        return;
      }
      const message = occupancyReportErrorMessage(
        error,
        "Não foi possível carregar as visões de ocupação.",
      );
      setScenarios([]);
      setSelectedId("");
      setChartData({});
      setChartDataScopeKey("");
      setCurrentSnapshot(null);
      setCurrentSnapshotError("");
      setMetadataError(message);
      toast.error(message);
    } finally {
      if (metadataAbortControllerRef.current === controller) {
        metadataAbortControllerRef.current = null;
      }
      if (activeMetadataRequestKeyRef.current === metadataRequestKey) {
        activeMetadataRequestKeyRef.current = "";
      }
      if (
        metadataConsumerAttachedRef.current &&
        requestSequence === metadataRequestSequenceRef.current
      ) {
        setLoadingScopes(false);
      }
    }
  }, [
    companyScopeId,
    dashboardFocusSurface,
    manager,
    masterCrossCompanyScope,
    metadataRequestKey,
    userId,
  ]);

  const loadCharts = React.useCallback(
    async (
      scope: OccupancyReportScope,
      silent = false,
      forceClosedRefresh = false,
    ): Promise<void> => {
      const requestScopeKey = `${occupancyAnalysisDatasetKey({
          analysis,
          companyScopeId,
          endDateInput: analysisRangeInput.endInput,
          intradayComparison,
          scopeId: scope.id,
          showPreviousPeriod,
          startDateInput: analysisRangeInput.startInput,
          timeZone: companyTimeZone,
        })}|plan:${requestPlanKey}`;
      if (requestScopeKey !== requestedChartScopeKeyRef.current) return;

      if (
        !forceClosedRefresh &&
        (activeChartRequestKeyRef.current === requestScopeKey ||
          completedChartRequestKeyRef.current === requestScopeKey)
      ) {
        return;
      }

      if (forceClosedRefresh) {
        closedSegmentCacheRef.current.clear();
        completedChartRequestKeyRef.current = "";
      }
      activeChartRequestKeyRef.current = requestScopeKey;

      if (silent) setRefreshing(true);
      else setLoadingCharts(true);

      const execute = async (windowRetry: number): Promise<void> => {
        const requestSequence = ++chartRequestSequenceRef.current;
        chartAbortControllerRef.current?.abort();
        const controller = new AbortController();
        chartAbortControllerRef.current = controller;
        const scheduleQuery = createOccupancyQueryScheduler(controller.signal);

        const now = new Date();
        const currentRange = resolveOccupancyAnalysisRange(
          now,
          analysisRangeInput.startInput,
          analysisRangeInput.endInput,
          analysis,
          companyDateKey(now, companyTimeZone),
          companyTimeZone,
        );
        const usesLiveDay = !analysis || currentRange.includesToday;
        const requiredDefinitionIds = new Set(
          requestedDefinitionIdsKey.split("|").filter(Boolean),
        );
        const currentDefinitions = buildOccupancyReportDefinitions(
          currentRange.reference,
          usesLiveDay ? now : null,
          analysis,
          analysis ? currentRange : undefined,
          companyTimeZone,
        ).filter((definition) => requiredDefinitionIds.has(definition.id));
        const requiredComparisonDefinitionIds = new Set(
          comparisonDefinitionIdsKey.split("|").filter(Boolean),
        );
        const definitionsWindowKey = occupancyReportDefinitionsWindowKey(
          currentDefinitions,
        );
        const previousDefinitions = showPreviousPeriod
          ? currentDefinitions
              .filter((definition) =>
                requiredComparisonDefinitionIds.has(definition.id),
              )
              .map((definition) =>
                buildComparisonDefinition(definition, intradayComparison),
              )
          : [];

        try {
          requireCertifiedOccupancyCompanyTimeZone(
            companyTimeZoneResolution,
          );
          const snapshotScenario = scope.scenario;
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
                      undefined,
                      controller.signal,
                      closedSegmentCacheRef.current,
                      scheduleQuery,
                      civilAggregateCapabilities,
                    );
                    return [definition.id, state] as const;
                  } catch (error) {
                    return [
                      definition.id,
                      {
                        points: buildEmptyPoints(definition),
                        error: occupancyReportErrorMessage(
                          error,
                          "Não foi possível carregar este período.",
                        ),
                      },
                    ] as const;
                  }
                },
              ),
            ),
            currentSnapshotRequested && snapshotScenario
              ? captureOccupancyLoad(
                  usesLiveDay
                    ? loadOccupancyReportCurrentSnapshot({
                        companyScopeId,
                        requestedAt: now,
                        scenario: snapshotScenario,
                        scheduleQuery,
                        signal: controller.signal,
                      })
                    : scheduleQuery(
                        `snapshot:${snapshotScenario.id}:${currentRange.reference.toISOString()}`,
                        () =>
                          apiFetch<unknown>(
                            occupancyScenarioHistoryPath(
                              snapshotScenario.id,
                              currentRange.reference,
                            ),
                            { companyScopeId, signal: controller.signal },
                          ),
                      ).then((response) => {
                        const history = requireOccupancyHistoryResponse(
                          response,
                          snapshotScenario.id,
                          {
                            expectedAreas: snapshotScenario.areas,
                            requestedAt: currentRange.reference,
                          },
                        );
                        return {
                          activeAreas: history.areas
                            ? history.areas.filter((area) => area.value > 0)
                                .length
                            : null,
                          areas: (history.areas ?? []).map((area) => ({
                            areaId: area.area_id,
                            cameraId: area.camera_id,
                            value: area.value,
                          })),
                          asOf: history.as_of!,
                          total: history.total,
                        };
                      }),
                  analysis && !usesLiveDay
                    ? "Não foi possível carregar a leitura final do intervalo."
                    : "Não foi possível carregar a leitura atual.",
                )
              : Promise.resolve({ data: null, error: "" }),
          ]);

          if (
            controller.signal.aborted ||
            !chartConsumerAttachedRef.current ||
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
            companyTimeZone,
          );
          const latestUsesLiveDay = !analysis || latestRange.includesToday;
          const latestDefinitionsWindowKey =
            occupancyReportDefinitionsWindowKey(
              buildOccupancyReportDefinitions(
                latestRange.reference,
                latestUsesLiveDay ? latestNow : null,
                analysis,
                analysis ? latestRange : undefined,
                companyTimeZone,
              ).filter((definition) =>
                requiredDefinitionIds.has(definition.id),
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
          alignMinuteComparisonPoints(nextChartData, currentDefinitions);
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
                ? "A leitura final do intervalo não pôde ser carregada."
                : "A leitura atual não pôde ser carregada.",
            );
          }
          completedChartRequestKeyRef.current = requestScopeKey;
        } catch (error) {
          if (
            controller.signal.aborted ||
            !chartConsumerAttachedRef.current ||
            chartAbortControllerRef.current !== controller ||
            requestSequence !== chartRequestSequenceRef.current ||
            requestScopeKey !== requestedChartScopeKeyRef.current
          ) {
            return;
          }
          const message = occupancyReportErrorMessage(
            error,
            "Não foi possível carregar os relatórios de ocupação.",
          );
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
          if (activeChartRequestKeyRef.current === requestScopeKey) {
            activeChartRequestKeyRef.current = "";
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
      civilAggregateCapabilities,
      comparisonDefinitionIdsKey,
      currentSnapshotRequested,
      intradayComparison,
      requestPlanKey,
      requestedDefinitionIdsKey,
      showPreviousPeriod,
    ],
  );

  const retryOccupancyData = React.useCallback(() => {
    if (metadataError || !selectedScope) {
      void loadScopes(true);
    } else {
      const refreshAt = new Date();
      setReportRequested(true);
      setDurationAnalysisCutoff(refreshAt);
      if (analysis) {
        refreshOccupancyAnalysisComparison();
        refreshOccupancyAnalysisDuration();
        refreshOccupancyDurationInsights();
      }
      refreshOccupancyLoitering();
      void loadCharts(selectedScope, true, true);
    }
  }, [
    analysis,
    loadCharts,
    loadScopes,
    metadataError,
    refreshOccupancyAnalysisComparison,
    refreshOccupancyAnalysisDuration,
    refreshOccupancyDurationInsights,
    refreshOccupancyLoitering,
    selectedScope,
  ]);

  React.useEffect(() => {
    if (configurationReadyKey !== configurationScopeKey) return;
    metadataConsumerAttachedRef.current = true;
    if (metadataAbortTimerRef.current !== null) {
      window.clearTimeout(metadataAbortTimerRef.current);
      metadataAbortTimerRef.current = null;
    }
    void loadScopes();

    return () => {
      metadataConsumerAttachedRef.current = false;
      metadataAbortTimerRef.current = window.setTimeout(() => {
        metadataAbortTimerRef.current = null;
        if (metadataConsumerAttachedRef.current) return;
        metadataRequestSequenceRef.current += 1;
        metadataAbortControllerRef.current?.abort();
        metadataAbortControllerRef.current = null;
        activeMetadataRequestKeyRef.current = "";
      }, 0);
    };
  }, [
    configurationReadyKey,
    configurationScopeKey,
    loadScopes,
    metadataRequestKey,
  ]);

  React.useEffect(() => {
    metadataRequestSequenceRef.current += 1;
    metadataAbortControllerRef.current?.abort();
    metadataAbortControllerRef.current = null;
    activeMetadataRequestKeyRef.current = "";
    completedMetadataRequestKeyRef.current = "";
    chartRequestSequenceRef.current += 1;
    chartAbortControllerRef.current?.abort();
    chartAbortControllerRef.current = null;
    activeChartRequestKeyRef.current = "";
    completedChartRequestKeyRef.current = "";
    closedSegmentCacheRef.current.clear();
    const settings = loadLiveDashboardSettings(companyScopeId, {
      userId: user?.id,
      viewId: settingsViewId,
    });
    setMetadataError("");
    setChartLoadError("");
    setScenarios([]);
    focusRef.current = { scopeMode: "scenario", selectedId: "" };
    setScopeMode("scenario");
    setSelectedId("");
    setShowPreviousPeriod(settings.showPreviousPeriod);
    setIntradayComparison(settings.intradayComparison);
    setChartData({});
    setChartDataScopeKey("");
    setCurrentSnapshot(null);
    setCurrentSnapshotError("");
    setLastUpdated(null);
    setLoadingCharts(false);
    setRefreshing(false);
    const now = new Date();
    const companyTodayInput = companyDateKey(now, companyTimeZone);
    const previousDayInput = shiftOccupancyAnalysisDateInput(
      companyTodayInput,
      -1,
    );
    const storedRange = loadOccupancyAnalysisDateRange(
      companyTodayInput,
      companyScopeId,
      user?.id,
    );
    const initialRange = analysis
      ? { endInput: previousDayInput, startInput: previousDayInput }
      : storedRange;
    setAnalysisRangeInput(initialRange);
    setReportRequested(analysis);
    setConfigurationReadyKey(configurationScopeKey);
  }, [
    analysis,
    companyScopeId,
    companyTimeZone,
    configurationScopeKey,
    settingsViewId,
    user?.id,
  ]);

  React.useEffect(() => {
    focusRef.current = { scopeMode, selectedId };
  }, [scopeMode, selectedId]);

  React.useEffect(() => {
    chartConsumerAttachedRef.current = true;
    if (chartAbortTimerRef.current !== null) {
      window.clearTimeout(chartAbortTimerRef.current);
      chartAbortTimerRef.current = null;
    }

    return () => {
      chartConsumerAttachedRef.current = false;
      chartAbortTimerRef.current = window.setTimeout(() => {
        chartAbortTimerRef.current = null;
        if (chartConsumerAttachedRef.current) return;
        chartRequestSequenceRef.current += 1;
        chartAbortControllerRef.current?.abort();
        chartAbortControllerRef.current = null;
        activeChartRequestKeyRef.current = "";
      }, 0);
    };
  }, []);

  React.useEffect(() => {
    if (!availableModes.some((mode) => mode.value === scopeMode)) {
      setScopeMode(availableModes[0]?.value ?? "scenario");
    }
  }, [availableModes, scopeMode]);

  React.useEffect(() => {
    setSelectedId((current) =>
      current && scopeOptions.some((option) => option.id === current)
        ? current
        : scopeMode === "scenario"
          ? scopeOptions.find((option) => option.scenario?.active)?.id ??
            scopeOptions[0]?.id ??
            ""
          : scopeOptions[0]?.id ?? "",
    );
  }, [scopeMode, scopeOptions]);

  React.useEffect(() => {
    if (
      !selectedScope ||
      (selectedScope.scenario &&
        selectedScope.scenario.company_id &&
        selectedScope.scenario.company_id !== companyScopeId)
    ) {
      return;
    }
    saveDashboardFocus(
      { scopeMode: selectedScope.mode, selectedId: selectedScope.id },
      companyScopeId,
      userId,
      dashboardFocusSurface,
    );
  }, [companyScopeId, dashboardFocusSurface, selectedScope, userId]);

  React.useEffect(() => {
    if (configurationReadyKey !== configurationScopeKey) return;
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

    if (!layoutPreferencesReady) return;
    // Analysis always opens with the latest fully closed day. Reports remain
    // explicitly requested, and picker edits wait for Apply.
    if (!reportRequested) return;
    loadCharts(selectedScope);
  }, [
    configurationReadyKey,
    configurationScopeKey,
    layoutPreferencesReady,
    loadCharts,
    reportRequested,
    selectedScope,
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
    setLoadingCharts(reportRequested && Boolean(selectedScope));
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
      setReportRequested(true);
      return;
    }
    invalidateChartDataset();
    setClock(now);
    setDurationAnalysisCutoff(now);
    setReportRequested(true);
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
    }, companyScopeId, { userId, viewId: settingsViewId });
  }

  function updateIntradayComparison(value: IntradayComparisonMode) {
    if (value === intradayComparison) return;
    invalidateChartDataset();
    setIntradayComparison(value);
    saveLiveDashboardSettings({
      intradayComparison: value,
      showPreviousPeriod,
    }, companyScopeId, { userId, viewId: settingsViewId });
  }

  function openCustomWidgetDialog() {
    setCustomWidgetForm({
      ...DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
      series: { ...DEFAULT_OCCUPANCY_TREND_SERIES },
      title: "Última ocupação do período",
    });
    setCustomWidgetDialogOpen(true);
  }

  function openCustomWidgetEditor(widget: OccupancyCustomWidget) {
    setCustomWidgetForm(
      widget.kind === "metric"
        ? {
            granularity: "hour",
            id: widget.id,
            kind: "metric",
            metric: widget.metric,
            series: { ...DEFAULT_OCCUPANCY_TREND_SERIES },
            title: widget.title,
          }
        : {
            granularity: widget.granularity,
            id: widget.id,
            kind: "trend",
            metric: "current",
            series: { ...widget.series },
            title: widget.title,
          },
    );
    setCustomWidgetDialogOpen(true);
  }

  function saveCustomWidget() {
    if (!liveCustomizationScenarioId) {
      toast.error("Selecione um cenário antes de adicionar um widget.");
      return;
    }

    const title =
      customWidgetForm.title.trim() ||
      (customWidgetForm.kind === "metric"
        ? occupancyCustomMetricLabel(customWidgetForm.metric)
        : `Tendência ${occupancyGranularityLabel(customWidgetForm.granularity)}`);
    const customWidgetScope = {
      userId,
      viewId: liveCustomizationScenarioId,
    };

    try {
      const widgets = upsertOccupancyCustomWidget(
        customWidgetForm.kind === "metric"
          ? {
              id: customWidgetForm.id,
              kind: "metric",
              metric: customWidgetForm.metric,
              title,
            }
          : {
              granularity: customWidgetForm.granularity,
              id: customWidgetForm.id,
              kind: "trend",
              series: customWidgetForm.series,
              title,
            },
        companyScopeId,
        customWidgetScope,
      );
      setLiveCustomizationState((current) => ({
        capacity:
          current.scopeKey === liveCustomizationScopeKey
            ? current.capacity
            : liveScenarioCapacity,
        scopeKey: liveCustomizationScopeKey,
        widgets,
      }));
      setCustomWidgetDialogOpen(false);
      toast.success(
        customWidgetForm.id
          ? "Widget atualizado."
          : "Widget adicionado à análise de Ocupação.",
      );
    } catch (error) {
      toast.error(
        occupancyReportErrorMessage(
          error,
          "Não foi possível salvar o widget.",
        ),
      );
    }
  }

  function removeCustomWidget(widgetId: string) {
    if (!liveCustomizationScenarioId) return;

    try {
      const widgets = deleteOccupancyCustomWidget(
        widgetId,
        companyScopeId,
        { userId, viewId: liveCustomizationScenarioId },
      );
      setLiveCustomizationState((current) => ({
        capacity:
          current.scopeKey === liveCustomizationScopeKey
            ? current.capacity
            : liveScenarioCapacity,
        scopeKey: liveCustomizationScopeKey,
        widgets,
      }));
      toast.success("Widget removido.");
    } catch (error) {
      toast.error(
        occupancyReportErrorMessage(
          error,
          "Não foi possível remover o widget.",
        ),
      );
    }
  }

  const metricCards = [
    {
      id: "occupancy_report_current",
      icon: UsersRound,
      label: analysis
        ? analysisIncludesToday
          ? selectedScope?.scenario
            ? "Leitura parcial do último dia"
            : "Parcial do último dia"
          : selectedScope?.scenario
            ? "Leitura final do último dia"
            : "Fechamento do último dia"
        : selectedScope?.scenario
          ? "Última leitura"
          : "Atual",
      value: selectedScope?.scenario
        ? visibleCurrentSnapshot?.total ?? null
        : rangeMetric.current,
      description:
        (visibleCurrentSnapshotError
          ? "leitura temporariamente indisponível"
          : "") ||
        (selectedScope?.scenario && visibleCurrentSnapshot
          ? `Atualizado em ${formatDateTime(visibleCurrentSnapshot.asOf, companyTimeZone)}`
          : selectedScope?.name ?? "visão selecionada"),
      tone: "primary" as const,
    },
    ...(analysis
      ? [
          {
            id: "occupancy_active_areas",
            icon: MapPinned,
            label: "Áreas ocupadas no fechamento",
            value: selectedScope?.scenario
              ? visibleCurrentSnapshot?.activeAreas ?? null
              : null,
            description: visibleCurrentSnapshotError
              ? "leitura de fechamento temporariamente indisponível"
              : "áreas com contagem positiva na última leitura do período",
            tone: "primary" as const,
          },
        ]
      : []),
    {
      id: "occupancy_report_average",
      icon: Gauge,
      label: analysis ? "Média do último dia" : "Média hoje",
      value: rangeMetric.average,
      description:
        (rangeMetricError ? "agregado temporariamente indisponível" : "") ||
        (rangeMetricIncomplete && rangeMetric.average === null
          ? "último dia sem dados completos"
          : analysis
            ? "resultado consolidado do último dia"
            : "agregado diário da visão"),
      tone: "average" as const,
    },
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
        (rangeMetricError ? "agregado temporariamente indisponível" : "") ||
        (rangeMetric.peak === null && rangeMetricIncomplete
          ? "período sem cobertura diária completa"
          : "maior pico diário disponível"),
      tone: "maximum" as const,
    },
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
        (rangeMetricError ? "agregado temporariamente indisponível" : "") ||
        (rangeMetric.minimum === null && rangeMetricIncomplete
          ? "período sem cobertura diária completa"
          : "menor valor diário disponível"),
      tone: "minimum" as const,
    },
  ];
  const customMetricCards = liveCustomWidgets.flatMap((widget) => {
    if (widget.kind !== "metric") return [];
    const presentation = occupancyAnalysisCustomMetricPresentation(
      widget.metric,
      {
        capacity: liveScenarioCapacity,
        rangeMetric,
        snapshot: visibleCurrentSnapshot,
        snapshotError: visibleCurrentSnapshotError,
      },
    );
    return [{ presentation, widget }];
  });
  const customTrendCards = liveCustomWidgets.flatMap((widget) => {
    if (widget.kind !== "trend") return [];
    const sourceId = occupancyCustomTrendSourceId(widget.granularity);
    const sourceDefinition = definitions.find(
      (definition) => definition.id === sourceId,
    );
    if (!sourceDefinition) return [];
    return [{
      definition: buildOccupancyCustomTrendDefinition(widget, sourceDefinition),
      sourceDefinition,
      widget,
    }];
  });
  const occupancyReportLayoutCards = [
    ...metricCards.map((card) => ({
      colorEditable: true,
      ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      id: card.id,
      label: card.label,
      node: () => (
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
    ...occupancyLoitering.cards,
    ...(analysis && selectedScope?.scenario
      ? [
          {
            colorEditable: false,
            defaultHeightLevel: 4 as const,
            defaultSize: "wide" as const,
            id: "occupancy_scenario_detail",
            label: "Cenário de ocupação",
            node: () => (
              <OccupancyHistoricalScenarioDetailCard
                error={visibleCurrentSnapshotError}
                loading={chartsPending}
                scenario={selectedScope.scenario!}
                snapshot={visibleCurrentSnapshot}
                timeZone={companyTimeZone}
              />
            ),
            titleEditable: true,
          },
        ]
      : []),
    ...definitions.map((definition) => ({
      chartTypeEnabled: true,
      colorEditable: true,
      defaultHeight: "standard" as const,
      defaultHeightLevel: 4 as const,
      defaultSize: "wide" as const,
      id: definition.id,
      label: definition.label,
      // CardLayout invokes function nodes only near the viewport. In
      // particular, buildEmptyPoints can span years in Análises and must not
      // run for every off-screen chart during the dashboard render.
      node: () => (
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
          colorPaletteId={analysisWidgetSettings.colorPaletteId}
          scope={selectedScope}
          scopeName={selectedScope?.name ?? ""}
        />
      ),
      titleEditable: true,
      zoomEnabled: true,
    })),
    ...(analysis ? occupancyAnalysisComparison.cards : []),
    ...(analysis ? occupancyAnalysisDuration.cards : []),
    ...(analysis ? occupancyDurationInsights.cards : []),
    ...customMetricCards.map(({ presentation, widget }) => {
      const configurationContent =
        canEditVisual && !monitorMode ? (
          <OccupancyCustomWidgetActions
            onEdit={() => {
              setLayoutOrganizerOpen(false);
              openCustomWidgetEditor(widget);
            }}
            onRemove={() => removeCustomWidget(widget.id)}
            title={widget.title}
          />
        ) : null;

      return {
        ...COMPACT_METRIC_LAYOUT_DEFAULTS,
        colorEditable: true,
        configurationContent,
        id: `occupancy_custom_${widget.id}`,
        label: widget.title,
        node: () => (
          <MetricCard
            description={presentation.description}
            icon={presentation.icon}
            label={widget.title}
            loading={chartsPending}
            tone={presentation.tone}
            value={presentation.value}
          />
        ),
        previewKind: "metric" as const,
        titleEditable: true,
      };
    }),
    ...customTrendCards.map(({ definition, sourceDefinition, widget }) => {
      const configurationContent =
        canEditVisual && !monitorMode ? (
          <OccupancyCustomWidgetActions
            onEdit={() => {
              setLayoutOrganizerOpen(false);
              openCustomWidgetEditor(widget);
            }}
            onRemove={() => removeCustomWidget(widget.id)}
            title={widget.title}
          />
        ) : null;

      return {
        chartTypeEnabled: true,
        colorEditable: true,
        configurationContent,
        defaultHeight: "standard" as const,
        defaultHeightLevel: 4 as const,
        defaultSize: "wide" as const,
        id: `occupancy_custom_${widget.id}`,
        label: widget.title,
        node: () => (
          <OccupancyReportChartCard
            definition={definition}
            loading={chartsPending}
            points={
              visibleChartData[sourceDefinition.id]?.points ??
              buildEmptyPoints(sourceDefinition)
            }
            previousPoints={
              visibleChartData[previousId(sourceDefinition.id)]?.points ?? []
            }
            previousState={
              visibleChartData[previousId(sourceDefinition.id)]
            }
            showPreviousPeriod={showPreviousPeriod}
            state={visibleChartData[sourceDefinition.id]}
            intradayComparison={intradayComparison}
            metricVisibility={widget.series}
            colorPaletteId={analysisWidgetSettings.colorPaletteId}
            scope={selectedScope}
            scopeName={selectedScope?.name ?? ""}
          />
        ),
        previewKind: "chart" as const,
        titleEditable: true,
        zoomEnabled: true,
      };
    }),
  ];
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
  const reportCertificationSources = [
    ...(currentSnapshotRequested
      ? [
          {
            asOf: visibleCurrentSnapshot?.asOf,
            error:
              visibleCurrentSnapshotError ||
              (!visibleCurrentSnapshot
                ? "Leitura atual indisponível."
                : undefined),
          },
        ]
      : []),
    ...queriedDefinitions.flatMap((definition) => {
      const currentState = visibleChartData[definition.id];
      const sources = [
        currentState ?? {
          error: "Série atual indisponível.",
        },
      ];
      if (
        showPreviousPeriod &&
        comparisonDefinitionIdSet.has(definition.id)
      ) {
        sources.push(
          visibleChartData[previousId(definition.id)] ?? {
            error: "Série comparativa indisponível.",
          },
        );
      }
      return sources;
    }),
  ];
  const coreReportDataCompleteUntil = reportCertificationSources.length
    ? resolveCertifiedOccupancyDataCutoff(reportCertificationSources)
    : undefined;
  function buildOccupancyReportPayload(
    loiteringReportAssets = occupancyLoitering.reportAssets,
    comparisonReportSnapshot: OccupancyComparisonReportSnapshot = {
      dataCompleteUntil: occupancyAnalysisComparison.dataCompleteUntil,
      reportAssets: occupancyAnalysisComparison.reportAssets,
    },
    durationReportSnapshot: OccupancyDurationReportSnapshot = {
      dataCompleteUntil: occupancyAnalysisDuration.dataCompleteUntil,
      reportAssets: occupancyAnalysisDuration.getReportAssets(),
      reportContext: occupancyAnalysisDuration.reportContext,
      reportMetrics: occupancyAnalysisDuration.reportMetrics,
      reportWarnings: occupancyAnalysisDuration.reportWarnings,
    },
  ): ReportPayload {
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
    customMetricCards.forEach(({ presentation, widget }) => {
      const cardId = `occupancy_custom_${widget.id}`;
      exportMetricByCardId.set(cardId, {
        description: presentation.description,
        label: resolveReportCardTitle(cardId, widget.title),
        value:
          typeof presentation.value === "string"
            ? presentation.value
            : formatOccupancyValue(presentation.value),
      });
    });
    durationReportSnapshot.reportMetrics.forEach(({ cardId, metric }) => {
      exportMetricByCardId.set(cardId, {
        ...metric,
        label: resolveReportCardTitle(cardId, metric.label),
      });
    });

    const buildExportChart = (
      definition: OccupancyReportDefinition,
      sourceDefinition: OccupancyReportDefinition,
      visibility: OccupancyMetricVisibility,
      title: string,
      cardId: string,
    ) => {
      const preference = reportPreferenceById.get(cardId);
      const exportPalette = resolveOccupancyChartPalette(
        "light",
        analysisWidgetSettings.colorPaletteId,
        preference?.color,
      );
      const chartType: CardChartType =
        preference?.chartType === "line" ? "line" : "bar";
      const points =
        visibleChartData[sourceDefinition.id]?.points ??
        buildEmptyPoints(sourceDefinition);
      const previousPoints =
        visibleChartData[previousId(sourceDefinition.id)]?.points ?? [];
      const tableIncludesPrevious =
        showPreviousPeriod && previousPoints.length > 0;
      const table: ReportTable = {
        columns: [
          ...(tableIncludesPrevious
            ? [{ key: "series", label: "Referência", width: 18 }]
            : []),
          { key: "period", label: "Período", width: 24 },
          { key: "current", label: "Atual", numeric: true, width: 16 },
          ...(visibility.average
            ? [{ key: "average", label: "Média", numeric: true, width: 16 }]
            : []),
          ...(visibility.minimum
            ? [{ key: "minimum", label: "Mínimo", numeric: true, width: 16 }]
            : []),
          ...(visibility.peak
            ? [{ key: "peak", label: "Máximo", numeric: true, width: 16 }]
            : []),
        ],
        description: definition.description,
        rows: [
          ...points.map((point) => ({
            average: point.average,
            current: point.current,
            minimum: point.minimum,
            peak: point.peak,
            period: point.label,
            ...(tableIncludesPrevious
              ? { series: "Período analisado" }
              : {}),
          })),
          ...(tableIncludesPrevious
            ? previousPoints.map((point) => ({
                average: point.average,
                current: null,
                minimum: point.minimum,
                peak: point.peak,
                period: point.label,
                series: "Base comparativa",
              }))
            : []),
        ],
        title: `Dados - ${title}`,
      };
      return {
        comparison: showPreviousPeriod
          ? comparisonDescription(definition, intradayComparison)
          : undefined,
        description: definition.description,
        option: buildOccupancyReportChartOption(
          definition,
          points,
          showPreviousPeriod ? previousPoints : [],
          visibility,
          {
            maximum: selectedScope?.scenario?.max_total ?? undefined,
            minimum: selectedScope?.scenario?.min_total ?? undefined,
          },
          exportPalette,
          chartType,
        ),
        table,
        title,
      };
    };
    const exportChartByCardId = new Map(
      definitions.map((definition) => [
        definition.id,
        buildExportChart(
          definition,
          definition,
          metricVisibility,
          resolveReportCardTitle(definition.id, definition.label),
          definition.id,
        ),
      ] as const),
    );
    customTrendCards.forEach(({ definition, sourceDefinition, widget }) => {
      const cardId = `occupancy_custom_${widget.id}`;
      exportChartByCardId.set(
        cardId,
        buildExportChart(
          definition,
          sourceDefinition,
          widget.series,
          resolveReportCardTitle(cardId, widget.title),
          cardId,
        ),
      );
    });
    const supplementalChartsByCardId = new Map<string, ReportChart[]>();
    const registerSupplementalChart = (
      cardId: string,
      chart: ReportChart,
      titleSuffix = "",
    ) => {
      const title = `${resolveReportCardTitle(cardId, chart.title)}${titleSuffix}`;
      const charts = supplementalChartsByCardId.get(cardId) ?? [];
      charts.push({
        ...chart,
        table: {
          ...chart.table,
          title: `Dados - ${title}`,
        },
        title,
      });
      supplementalChartsByCardId.set(cardId, charts);
    };
    comparisonReportSnapshot.reportAssets.forEach(({ cardId, chart }) => {
      registerSupplementalChart(cardId, chart);
    });
    durationReportSnapshot.reportAssets.forEach(
      ({ cardId, chart, titleSuffix = "" }) => {
        registerSupplementalChart(cardId, chart, titleSuffix);
      },
    );
    occupancyDurationInsights.reportAssets.forEach(
      ({ cardId, chart, titleSuffix = "" }) => {
        registerSupplementalChart(cardId, chart, titleSuffix);
      },
    );
    loiteringReportAssets.forEach(
      ({ cardId, chart, titleSuffix = "" }) => {
        registerSupplementalChart(cardId, chart, titleSuffix);
      },
    );
    const supplementalTables: ReportTable[] = [];
    if (
      orderedVisibleReportCardIds.includes("occupancy_scenario_detail") &&
      selectedScope?.scenario &&
      visibleCurrentSnapshot
    ) {
      const areaValueByIdentity = new Map(
        visibleCurrentSnapshot.areas.map((area) => [
          JSON.stringify([area.cameraId, area.areaId]),
          area.value,
        ]),
      );
      supplementalTables.push({
        columns: [
          { key: "area", label: "Área", width: 32 },
          { key: "occupancy", label: "Ocupação", numeric: true, width: 18 },
          { key: "status", label: "Estado", width: 20 },
        ],
        description: `Leitura final certificada em ${formatDateTime(visibleCurrentSnapshot.asOf, companyTimeZone)}.`,
        rows: selectedScope.scenario.areas.map((area, index) => {
          const value = areaValueByIdentity.get(
            JSON.stringify([area.camera_id, area.area_id]),
          );
          return {
            area: area.label || `Área ${index + 1}`,
            occupancy: value ?? null,
            status:
              value === undefined
                ? "Sem leitura"
                : value > 0
                  ? "Ocupada"
                  : "Desocupada",
          };
        }),
        title: `Dados - ${resolveReportCardTitle("occupancy_scenario_detail", "Cenário de ocupação")}`,
      });
    }

    const payloadDataCompleteUntil = mergeOccupancyDataCompleteUntil(
      coreReportDataCompleteUntil,
      mergeOccupancyDataCompleteUntil(
        comparisonReportSnapshot.dataCompleteUntil,
        mergeOccupancyDataCompleteUntil(
          durationReportSnapshot.dataCompleteUntil,
          occupancyDurationInsights.dataCompleteUntil,
        ),
      ),
    );

    return {
      charts: orderedVisibleReportCardIds.flatMap((id) => {
        const supplementalCharts = supplementalChartsByCardId.get(id);
        if (supplementalCharts) return supplementalCharts;
        const chart = exportChartByCardId.get(id);
        return chart ? [chart] : [];
      }),
      context: [
        selectedScope
          ? `${scopeModeLabel(selectedScope.mode)}: ${selectedScope.name}`
          : "",
        analysis
          ? `Período: ${formatOccupancyAnalysisRangeLabel(analysisRangeInput)}`
          : `Dia analisado: ${companyTodayInput}`,
        showPreviousPeriod
          ? `Comparativo: ${intradayComparison === "last_week" ? "semana passada" : "ontem"}`
          : "Sem período anterior",
        occupancyDurationInsights.reportAssets.length &&
        occupancyDurationAnalysisPeriod
          ? `Tempo ocupado detalhado: ${occupancyDurationAnalysisPeriod.contextLabel}.`
          : "",
        ...durationReportSnapshot.reportContext,
        ...durationReportSnapshot.reportWarnings,
        loiteringReportAssets.length && occupancyLoiteringPeriod
          ? `Permanência: ${occupancyLoiteringPeriod.contextLabel}; registros concluídos e estatísticas de duração por área.`
          : "",
      ].filter(Boolean),
      dataCompleteUntil: payloadDataCompleteUntil,
      filename: `ipxdata-ocupacao-${analysis ? "analise" : "relatorio"}-${occupancyReportDateSlug(
        payloadDataCompleteUntil ?? clock,
      )}`,
      generatedAt: clock,
      metrics: orderedVisibleReportCardIds
        .map((id) => exportMetricByCardId.get(id))
        .filter((metric): metric is ReportMetric => Boolean(metric)),
      subtitle: analysis
        ? `Intervalo ${formatOccupancyAnalysisRangeLabel(analysisRangeInput)}`
        : "Séries históricas e leitura atual da visão selecionada.",
      tables: supplementalTables,
      timeZone: companyTimeZone,
      title: selectedScope
        ? `${analysis ? "Análise" : "Relatório"} de Ocupação - ${selectedScope.name}`
        : analysis
          ? "Análise de Ocupação"
          : "Relatório de Ocupação",
    };
  }

  async function getOccupancyReportPayload(
    signal?: AbortSignal,
  ): Promise<ReportPayload> {
    // Permanência é carregada somente sob demanda nesta tela. Uma falha da
    // fonte não pode virar silenciosamente um PDF/Excel sem os cards visíveis.
    // Quando nenhum card de permanência foi solicitado, o hook retorna [] sem
    // efetuar requisição e o restante do relatório segue normalmente.
    const [
      loiteringReportAssets,
      comparisonReportSnapshot,
      durationReportSnapshot,
    ] = await Promise.all([
      occupancyLoitering.loadReportAssets(signal),
      analysis
        ? occupancyAnalysisComparison.loadReportSnapshot(signal)
        : Promise.resolve<OccupancyComparisonReportSnapshot>({
            dataCompleteUntil: undefined,
            reportAssets: [],
          }),
      analysis
        ? occupancyAnalysisDuration.loadReportSnapshot(signal)
        : Promise.resolve<OccupancyDurationReportSnapshot>({
            dataCompleteUntil: undefined,
            reportAssets: [],
            reportContext: [],
            reportMetrics: [],
            reportWarnings: [],
          }),
    ]);
    signal?.throwIfAborted();
    return buildOccupancyReportPayload(
      loiteringReportAssets,
      comparisonReportSnapshot,
      durationReportSnapshot,
    );
  }

  function buildOccupancyDailyAiTableFromVisibleData(
    occupancyDailyDefinition: OccupancyReportDefinition,
    occupancyDailyAiBucketStarts: Date[],
  ) {
    if (
      !occupancyDailyAiBucketStarts.length
    ) {
      return null;
    }
    const dailyState = visibleChartData[occupancyDailyDefinition.id];
    if (!dailyState || dailyState.error || dailyState.incomplete) return null;

    try {
      return buildOccupancyAiDailyTable({
        bucketStarts: occupancyDailyAiBucketStarts,
        companyTimeZone,
        points: dailyState.points,
      });
    } catch {
      // A construção definitiva ocorre sob demanda e apresenta um erro no
      // diálogo da IA, sem permitir que dados auxiliares quebrem o dashboard.
      return null;
    }
  }

  const getOccupancyAiPayload = async (
    signal?: AbortSignal,
  ): Promise<ReportPayload> => {
    signal?.throwIfAborted();
    const scope = selectedScope;
    const dailyDefinition = definitions.find(
      (definition) => definition.id === "occupancy_report_day",
    );
    if (!scope || !dailyDefinition || !companyScopeId) {
      throw new Error(
        "Selecione uma visão de ocupação antes de gerar a análise diária.",
      );
    }
    const occupancyReportPayload = await getOccupancyReportPayload(signal);
    // A lista diária pode conter milhares de buckets em Análises. Ela é
    // exclusiva da IA e, portanto, só deve ser materializada depois do clique.
    const dailySegments = listDefinitionQuerySegments(dailyDefinition);
    const occupancyDailyAiBucketStarts = dailySegments.every(
      (segment) => segment.granularity === "day",
    )
      ? dailySegments.flatMap((segment) => segment.bucketStarts)
      : [];
    // A exportação continua refletindo somente o layout visível. A IA recebe a
    // série diária completa que já está em memória mesmo quando o respectivo
    // widget foi ocultado; intervalos consolidados nunca são rotulados como dias.
    const occupancyDailyAiTable = buildOccupancyDailyAiTableFromVisibleData(
      dailyDefinition,
      occupancyDailyAiBucketStarts,
    );
    if (occupancyDailyAiTable) {
      return {
        ...occupancyReportPayload,
        subtitle: `Série diária completa: ${occupancyAiDailyPeriodLabel(
          occupancyDailyAiBucketStarts,
          companyTimeZone,
        )}.`,
        tables: [
          ...(occupancyReportPayload.tables ?? []),
          occupancyDailyAiTable,
        ],
      };
    }

    requireCertifiedOccupancyCompanyTimeZone(companyTimeZoneResolution);
    const requestedAt = new Date();
    const requestScopeKey = requestedChartScopeKey;
    assertOccupancyAiRequestCurrent(
      requestedChartScopeKeyRef,
      requestScopeKey,
    );
    const requestedCalendarDay = companyCalendarDate(requestedAt, companyTimeZone, "day");
    const openBucket =
      requestedCalendarDay >= dailyDefinition.from && requestedCalendarDay < dailyDefinition.to
        ? requestedCalendarDay
        : undefined;
    const dailyPlan = buildOccupancyAiDailyQueryPlan(
      dailyDefinition,
      openBucket,
    );
    const dailyStates: OccupancyReportState[] = [];
    const scheduleAiQuery = createOccupancyQueryScheduler(signal);

    for (const chunk of dailyPlan.chunks) {
      signal?.throwIfAborted();
      assertOccupancyAiRequestCurrent(
        requestedChartScopeKeyRef,
        requestScopeKey,
      );
      const state = await loadOccupancyReportState(
        chunk,
        scope,
        companyScopeId,
        companyTimeZone,
        requestedAt,
        undefined,
        signal,
        closedSegmentCacheRef.current,
        scheduleAiQuery,
        civilAggregateCapabilities,
      );
      signal?.throwIfAborted();
      assertOccupancyAiRequestCurrent(
        requestedChartScopeKeyRef,
        requestScopeKey,
      );
      if (state.error || state.incomplete) {
        const visibleWarning = occupancyAggregatePresentationWarning(
          state.warning,
        );
        throw new Error(
          `A série diária completa não pôde ser consolidada. ${
            state.error || visibleWarning || "Existem períodos sem dados."
          }`,
        );
      }
      dailyStates.push(state);
    }

    const dailyDataCompleteUntil = resolveCertifiedOccupancyDataCutoff(
      dailyStates,
    );
    const dailyTable = buildOccupancyAiDailyTable({
      bucketStarts: dailyPlan.bucketStarts,
      companyTimeZone,
      points: dailyStates.flatMap((state) => state.points),
    });
    const currentDataCompleteUntil = occupancyReportPayload.dataCompleteUntil;

    return {
      ...occupancyReportPayload,
      dataCompleteUntil:
        currentDataCompleteUntil && dailyDataCompleteUntil
          ? new Date(Math.min(currentDataCompleteUntil.getTime(), dailyDataCompleteUntil.getTime()))
          : null,
      generatedAt: requestedAt,
      subtitle: `Série diária completa: ${occupancyAiDailyPeriodLabel(
        dailyPlan.bucketStarts,
        companyTimeZone,
      )}.`,
      tables: [...(occupancyReportPayload.tables ?? []), dailyTable],
    };
  };
  const analysisDateRangeControl = analysis ? (
    <OccupancyDateRangePicker
      key={`${companyScopeId ?? ""}|${user?.id ?? ""}`}
      maximumInput={companyTodayInput}
      onApply={updateAnalysisRangeInput}
      value={analysisRangeInput}
    />
  ) : null;
  const compactViewActions = (
    <>
      <ReportExportActions
        compact
        disabled={
          chartsPending ||
          !selectedScope ||
          Boolean(occupancyCertificationError) ||
          hasPartialOccupancyCoverage || !reportRequested
        }
        getPayload={getOccupancyReportPayload}
      />
      <AiAnalysisAction
        disabled={
          chartsPending ||
          !selectedScope ||
          Boolean(occupancyCertificationError) ||
          hasPartialOccupancyCoverage || !reportRequested
        }
        getPayload={getOccupancyAiPayload}
        manager={manager}
        source={{
          module: "occupancy",
          surface: analysis ? "analysis" : "reports",
        }}
      />
      {canEditVisual ? (
        <>
          <ReorderModeButton
            className="h-8 w-8 shrink-0"
            enabled={layoutReorderMode}
            onChange={setLayoutReorderMode}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setLayoutOrganizerOpen(true)}
            aria-label="Configurar widgets de ocupação"
            aria-haspopup="dialog"
            title="Configurar widgets"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant={reportRequested ? "outline" : "default"}
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => {
          if (selectedScope) {
            const refreshAt = new Date();
            setReportRequested(true);
            setDurationAnalysisCutoff(refreshAt);
            if (analysis) {
              refreshOccupancyAnalysisComparison();
              refreshOccupancyAnalysisDuration();
              refreshOccupancyDurationInsights();
            }
            refreshOccupancyLoitering();
            void loadCharts(selectedScope, true, true);
          } else {
            void loadScopes(true);
          }
        }}
        disabled={refreshing || chartsPending}
        aria-label={
          !reportRequested
            ? analysis
              ? "Consultar análise de Ocupação"
              : "Consultar relatório de Ocupação"
            : analysis
            ? "Atualizar análise de Ocupação"
            : "Atualizar relatório de Ocupação"
        }
        title={
          !reportRequested
            ? "Consultar dados"
            : analysis
              ? "Atualizar análise"
              : "Atualizar relatório"
        }
      >
        <RefreshCw
          className={cn(
            "h-4 w-4",
            (refreshing || chartsPending) && "animate-spin",
          )}
        />
      </Button>
      <MonitorModeButton
        compact
        onClick={enterMonitorMode}
        disabled={!scopeOptions.length}
      />
    </>
  );

  return (
    <section
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {analysis ? (
        <p role="status" className="sr-only">
          {analysisIncludesToday
            ? "O intervalo inclui hoje; somente os períodos de hoje podem estar parciais."
            : "O intervalo é totalmente histórico e usa apenas períodos encerrados."}
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
                {formatTime(visibleLastUpdated, companyTimeZone)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="@container rounded-md border border-border bg-card px-3 py-2 shadow-soft">
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
              data-dashboard-toolbar
              aria-label={analysis ? "Carregando controles da análise de Ocupação" : undefined}
              role={analysis ? "region" : undefined}
            >
              <div data-toolbar-filters className={analysis ? "basis-[46rem]" : "basis-[24rem]"}>
                {analysis ? (
                  <div className="min-w-0 flex-[1_1_230px]">
                    {analysisDateRangeControl}
                  </div>
                ) : null}
                <Skeleton className="h-8 min-w-0 flex-[1_1_140px]" />
                <Skeleton className="h-8 min-w-0 flex-[2_1_200px]" />
                {analysis && canEditVisual ? (
                  <Skeleton className="h-8 w-[8.75rem] max-w-full" />
                ) : null}
              </div>
              <div data-toolbar-actions>
                <Skeleton className="h-8 w-[248px] max-w-full" />
              </div>
            </div>
          ) : scopeOptions.length ? (
            <div className="space-y-2">
              <div
                aria-label={
                  analysis
                    ? "Controles da análise de Ocupação"
                    : "Controles dos relatórios de Ocupação"
                }
                data-dashboard-toolbar
                role="group"
              >
                <div
                  data-toolbar-filters
                  className={
                    analysis
                      ? availableModes.length > 1
                        ? "basis-[46rem] @4xl:flex-nowrap"
                        : "basis-[37rem] @4xl:flex-nowrap"
                      : "basis-[24rem]"
                  }
                >
                  {analysis ? (
                    <div className="min-w-0 flex-[1_1_230px]">
                      {analysisDateRangeControl}
                    </div>
                  ) : null}
                  <div
                    className="contents"
                  >
                    {availableModes.length > 1 ? (
                      <div className="min-w-0 flex-[1_1_140px]">
                        {!analysis ? (
                          <Label className="sr-only" htmlFor={scopeModeSelectId}>
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
                            aria-label={
                              analysis
                                ? "Tipo de visão da análise de Ocupação"
                                : "Tipo de visão dos relatórios de Ocupação"
                            }
                            className="h-auto min-h-8 w-full min-w-0 bg-card py-1.5 text-xs"
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
                    ) : null}
                    <div className="min-w-0 flex-[2_1_200px]">
                      {!analysis ? (
                        <Label className="sr-only" htmlFor={scopeSelectId}>
                          {scopeModeLabel(scopeMode)}
                        </Label>
                      ) : null}
                      <Select value={selectedId} onValueChange={updateSelectedScope}>
                        <SelectTrigger
                          id={scopeSelectId}
                          aria-label={
                            analysis
                              ? `${scopeModeLabel(scopeMode)} da análise de Ocupação`
                              : `${scopeModeLabel(scopeMode)} dos relatórios em foco`
                          }
                          className="h-auto min-h-8 w-full min-w-0 bg-card py-1.5 text-xs"
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
                    {analysis && canEditVisual ? (
                      <div
                        aria-label="Aparência dos gráficos desta análise"
                        className="flex w-[8.75rem] min-w-0 max-w-full items-center gap-2"
                        role="group"
                      >
                        {analysisWidgetSettingsReady ? (
                          <OccupancyPaletteSelect
                            ariaLabel="Paleta dos gráficos desta análise"
                            compact
                            fluid
                            value={analysisWidgetSettings.colorPaletteId}
                            onValueChange={(colorPaletteId) => {
                              if (
                                !updateAnalysisWidgetSettings({ colorPaletteId })
                              ) {
                                toast.error(
                                  "Não foi possível salvar a paleta desta análise.",
                                );
                              }
                            }}
                          />
                        ) : (
                          <Skeleton className="h-8 w-full" />
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                {analysis ? (
                  <div data-toolbar-actions>
                    {visibleLastUpdated ? (
                      <span
                        data-toolbar-status
                        className="hidden min-h-8 items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground @4xl:inline-flex"
                        aria-label={`Última atualização às ${formatTime(visibleLastUpdated, companyTimeZone)}`}
                        title={`Última atualização: ${formatTime(visibleLastUpdated, companyTimeZone)}`}
                      >
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {formatTime(visibleLastUpdated, companyTimeZone)}
                        </span>
                      </span>
                    ) : null}
                    <div
                      aria-label="Ações da análise de Ocupação"
                      className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 @4xl:flex-nowrap [&_[data-premium-control]]:shrink-0"
                      role="group"
                    >
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        variant={analysisSettingsOpen ? "default" : "outline"}
                        onClick={() => setAnalysisSettingsOpen((current) => !current)}
                        aria-expanded={analysisSettingsOpen}
                        aria-controls="occupancy-analysis-settings"
                        aria-label="Configurações da análise de Ocupação"
                        title="Configurações da análise"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                      {compactViewActions}
                    </div>
                  </div>
                ) : (
                  <div data-toolbar-actions>
                    {visibleLastUpdated ? (
                      <span
                        data-toolbar-status
                        className="hidden min-h-8 items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground @4xl:inline-flex"
                        aria-label={`Última atualização às ${formatTime(visibleLastUpdated, companyTimeZone)}`}
                        title={`Última atualização: ${formatTime(visibleLastUpdated, companyTimeZone)}`}
                      >
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Atualizado às {formatTime(visibleLastUpdated, companyTimeZone)}
                        </span>
                      </span>
                    ) : null}
                    <div
                      aria-label="Ações dos relatórios de Ocupação"
                      className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 @4xl:flex-nowrap [&_[data-premium-control]]:shrink-0"
                      role="group"
                    >
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        variant={reportSettingsOpen ? "default" : "outline"}
                        onClick={() => setReportSettingsOpen((current) => !current)}
                        aria-expanded={reportSettingsOpen}
                        aria-controls="occupancy-report-settings"
                        aria-label="Configurações dos relatórios de Ocupação"
                        title="Configurações dos relatórios"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                      {compactViewActions}
                    </div>
                  </div>
                )}
              </div>
              {(analysis && analysisSettingsOpen) ||
                (!analysis && reportSettingsOpen) ? (
                <div
                  id={
                    analysis
                      ? "occupancy-analysis-settings"
                      : "occupancy-report-settings"
                  }
                  aria-label={
                    analysis
                      ? "Configurações da análise de Ocupação"
                      : "Configurações dos relatórios de Ocupação"
                  }
                  className="grid gap-3 rounded-xl border bg-muted/15 p-3 shadow-sm lg:grid-cols-2"
                  role="group"
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Comparação temporal</div>
                      <div className="text-[11px] text-muted-foreground">
                        Ative e escolha a base usada no período anterior.
                      </div>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                      <PreviousPeriodToggle
                        checked={showPreviousPeriod}
                        compact
                        onCheckedChange={updateShowPreviousPeriod}
                      />
                      {showPreviousPeriod ? (
                        <ComparisonModeSelect
                          compact
                          fit
                          value={intradayComparison}
                          onValueChange={updateIntradayComparison}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
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
          key={layoutPreferencesIdentityKey}
          cards={occupancyReportLayoutCards}
          editActions={
            analysis && canEditVisual ? (
              <Button
                type="button"
                size="sm"
                onClick={openCustomWidgetDialog}
                disabled={!liveCustomizationScenarioId}
              >
                <Plus className="h-4 w-4" />
                Adicionar widget
              </Button>
            ) : undefined
          }
          menuKey="occupancy"
          monitorMode={monitorMode}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          onPreferencesChange={handleLayoutPreferencesChange}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          presetNamespace={
            analysis ? "occupancy-analysis" : "occupancy-reports"
          }
          preferenceScopeId={reportPreferenceScopeId}
          reorderMode={layoutReorderMode}
          scenarios={
            analysis
              ? scenarios.map((scenario) => ({
                  id: scenario.id,
                  name: scenario.name,
                }))
              : []
          }
          showCardConfigurationActions={analysis}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
          viewScopeName={selectedScope?.name}
          viewScopes={
            analysis
              ? scopeOptions.map((scope) => ({
                  id: `analysis:${scope.id}`,
                  name: scope.name,
                }))
              : []
          }
        />
      ) : null}

      {analysis && canEditVisual && !monitorMode ? (
        <OccupancyCustomWidgetDialog
          form={customWidgetForm}
          onChange={setCustomWidgetForm}
          onOpenChange={setCustomWidgetDialogOpen}
          onSave={saveCustomWidget}
          open={customWidgetDialogOpen}
          surface="analysis"
        />
      ) : null}
    </section>
  );
}

function buildOccupancyCustomWidgetResourcePlan(
  widgets: readonly OccupancyCustomWidget[],
  preferences: readonly CardPreference[],
  requestedCardIds?: ReadonlySet<string>,
) {
  const preferenceById = new Map(
    preferences.map((preference) => [preference.id, preference]),
  );
  const definitionIds = new Set<string>();
  const comparisonDefinitionIds = new Set<string>();
  let currentSnapshot = false;

  widgets.forEach((widget) => {
    const cardId = `occupancy_custom_${widget.id}`;
    if (requestedCardIds && !requestedCardIds.has(cardId)) return;
    if (preferenceById.get(cardId)?.visible !== true) return;

    if (widget.kind === "metric") {
      if (
        widget.metric === "current" ||
        widget.metric === "active_areas" ||
        widget.metric === "utilization"
      ) {
        currentSnapshot = true;
      } else if (
        widget.metric === "average" ||
        widget.metric === "minimum" ||
        widget.metric === "peak"
      ) {
        definitionIds.add("occupancy_report_day");
      }
      return;
    }

    const sourceId = occupancyCustomTrendSourceId(widget.granularity);
    definitionIds.add(sourceId);
    if (
      widget.series?.average !== false ||
      widget.series?.minimum !== false ||
      widget.series?.peak !== false
    ) {
      comparisonDefinitionIds.add(sourceId);
    }
  });

  return {
    comparisonDefinitionIds: Array.from(comparisonDefinitionIds)
      .sort()
      .join("|"),
    currentSnapshot,
    definitionIds: Array.from(definitionIds).sort().join("|"),
  };
}

function mergeOccupancyResourceIds(...resourceIds: string[]) {
  return Array.from(
    new Set(
      resourceIds.flatMap((value) => value.split("|").filter(Boolean)),
    ),
  )
    .sort()
    .join("|");
}

function occupancyCustomTrendSourceId(
  granularity: OccupancyTrendCustomWidget["granularity"],
) {
  if (granularity === "minute") return "occupancy_report_minute";
  if (granularity === "hour") return "occupancy_report_hour";
  return "occupancy_report_day";
}

function buildOccupancyCustomTrendDefinition(
  widget: OccupancyTrendCustomWidget,
  source: OccupancyReportDefinition,
): OccupancyReportDefinition {
  const resolutionLabel = {
    day: "diária",
    hour: "horária",
    minute: "por minuto",
    month: "mensal",
    semester: "semestral",
    week: "semanal",
    year: "anual",
  } satisfies Record<OccupancyReportDefinition["granularity"], string>;
  const requestedResolution = resolutionLabel[widget.granularity];
  const effectiveResolution = source.resolutionLabel
    ? source.resolutionLabel.toLowerCase()
    : `resolução ${resolutionLabel[source.granularity]}`;
  const adaptation =
    widget.granularity === source.granularity
      ? `Configuração preservada em leitura ${requestedResolution}.`
      : `Configuração original ${requestedResolution}; nesta análise, ${effectiveResolution}.`;

  return {
    ...source,
    description: `${source.description} ${adaptation}`,
    id: `occupancy_custom_${widget.id}`,
    label: widget.title,
  };
}

function occupancyAnalysisCustomMetricPresentation(
  metric: OccupancyCustomMetric,
  {
    capacity,
    rangeMetric,
    snapshot,
    snapshotError,
  }: {
    capacity: number | null;
    rangeMetric: OccupancyReportMetric;
    snapshot: CertifiedCurrentSnapshot | null;
    snapshotError: string;
  },
): OccupancyCustomMetricPresentation {
  const snapshotUnavailable = snapshotError
    ? "Leitura final do período temporariamente indisponível."
    : "Sem leitura certificada no período selecionado.";

  if (metric === "average") {
    return {
      description: "Média certificada do último intervalo consolidado.",
      icon: TrendingUp,
      tone: "average",
      value: rangeMetric.average,
    };
  }
  if (metric === "minimum") {
    return {
      description: "Menor ocupação certificada no período selecionado.",
      icon: Gauge,
      tone: "minimum",
      value: rangeMetric.minimum,
    };
  }
  if (metric === "peak") {
    return {
      description: "Maior ocupação certificada no período selecionado.",
      icon: TrendingUp,
      tone: "maximum",
      value: rangeMetric.peak,
    };
  }
  if (metric === "alerts") {
    return {
      description: "Alertas não possuem consolidação histórica neste período.",
      icon: Bell,
      tone: "maximum",
      value: null,
    };
  }
  if (metric === "active_areas") {
    return {
      description: snapshot
        ? "Áreas com contagem positiva na última leitura certificada do período."
        : snapshotUnavailable,
      icon: UsersRound,
      tone: "primary",
      value: snapshot?.activeAreas ?? null,
    };
  }
  if (metric === "utilization") {
    const utilization =
      snapshot && capacity && capacity > 0
        ? `${formatOccupancyValue((snapshot.total / capacity) * 100)}%`
        : null;
    return {
      description: !snapshot
        ? snapshotUnavailable
        : capacity
          ? "Última leitura certificada em relação à capacidade configurada."
          : "Defina a capacidade no Ao Vivo para calcular a utilização.",
      icon: Gauge,
      tone: "primary",
      value: utilization,
    };
  }

  return {
    description: snapshot
      ? "Última leitura certificada do período selecionado."
      : snapshotUnavailable,
    icon: Gauge,
    tone: "primary",
    value: snapshot?.total ?? null,
  };
}

function mergeOccupancyDataCompleteUntil(
  primary: Date | null | undefined,
  supplemental: Date | null | undefined,
) {
  if (primary === undefined) return supplemental ?? null;
  if (supplemental === undefined) return primary;
  if (primary === null || supplemental === null) return null;
  return new Date(Math.min(primary.getTime(), supplemental.getTime()));
}

function OccupancyHistoricalScenarioDetailCard({
  error,
  loading,
  scenario,
  snapshot,
  timeZone,
}: {
  error: string;
  loading: boolean;
  scenario: OccupancyScenario;
  snapshot: CertifiedCurrentSnapshot | null;
  timeZone: string;
}) {
  const valueByArea = new Map(
    (snapshot?.areas ?? []).map((area) => [
      JSON.stringify([area.cameraId, area.areaId]),
      area.value,
    ]),
  );

  return (
    <Card className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="min-w-0 pb-2">
        <CardTitle className="min-w-0 [overflow-wrap:anywhere]">
          <WidgetTitleText fallback="Cenário de ocupação" />
        </CardTitle>
        <CardDescription className="line-clamp-2 [overflow-wrap:anywhere]">
          {snapshot
            ? `Fechamento em ${formatDateTime(snapshot.asOf, timeZone)} · ${occupancyObjectClassLabel(scenario.object_class)}`
            : "Composição e leitura final das áreas no período selecionado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-0">
        {loading && !snapshot ? (
          <Skeleton className="min-h-28 w-full flex-1" />
        ) : error || !snapshot ? (
          <div className="flex min-h-24 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/20 px-3 text-center text-xs text-muted-foreground">
            Leitura de fechamento indisponível para este período.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/70">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border/70 bg-muted/25 px-3 py-2 text-xs font-semibold">
              <span>Área</span>
              <span className="text-right">Ocupação</span>
            </div>
            {scenario.areas.map((area, index) => {
              const value = valueByArea.get(
                JSON.stringify([area.camera_id, area.area_id]),
              );
              return (
                <div
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border/50 px-3 py-2 text-xs last:border-b-0"
                  key={`${area.camera_id}:${area.area_id}`}
                >
                  <span
                    className="truncate"
                    title={area.label || `Área ${index + 1}`}
                  >
                    {area.label || `Área ${index + 1}`}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {value === undefined ? "—" : formatOccupancyValue(value)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
  value: number | string | null;
}) {
  const toneColor = {
    average: "#7C3AED",
    maximum: "#E11D48",
    minimum: "#D97706",
    primary: "#1267C4",
  }[tone];
  const widgetColor = useWidgetColor(toneColor);
  const formattedValue =
    typeof value === "string" ? value : formatOccupancyValue(value);

  return (
    <CompactMetricCard
      description={description}
      descriptionTitle={description}
      icon={Icon}
      label={label}
      loading={loading}
      toneColor={widgetColor}
      value={formattedValue}
      valueTitle={formattedValue}
    />
  );
}

function OccupancyReportChartCard({
  colorPaletteId,
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
  colorPaletteId: Parameters<typeof resolveOccupancyChartPalette>[1];
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
  const chartType = useWidgetChartType();
  const palettePrimary = resolveOccupancyChartPalette(
    effectiveTheme,
    colorPaletteId,
  ).current;
  const widgetColor = useWidgetColor(palettePrimary);
  const palette = React.useMemo(
    () =>
      resolveOccupancyChartPalette(
        effectiveTheme,
        colorPaletteId,
        widgetColor,
      ),
    [colorPaletteId, effectiveTheme, widgetColor],
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
        chartType,
      ),
    [
      chartType,
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
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
        {showPreviousPeriod && !previousState?.error && !previousState?.incomplete ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
            {comparisonDescription(definition, intradayComparison)}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full flex-1" />
        ) : state?.error ? (
          <EmptyChartState text="Dados temporariamente indisponíveis para este gráfico." />
        ) : hasData ? (
          <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
            <EChart
              option={option}
              themeMode="explicit"
              valueLabels={
                definition.granularity === "minute" ? "none" : undefined
              }
            />
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
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
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
        "flex min-w-0 max-w-full flex-wrap items-center rounded-md border bg-muted/20",
        compact
          ? "min-h-8 gap-0.5 p-0.5"
          : "gap-1 p-1",
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
              "focus-contained min-w-0 max-w-full rounded px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
              compact ? "h-7" : "h-8",
              active
                ? "bg-primary text-primary-foreground shadow-sm focus-visible:ring-primary-foreground"
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
        "focus-contained inline-flex min-w-0 max-w-full items-center gap-2 whitespace-normal rounded-md border px-3 py-1.5 text-left text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
        compact ? "min-h-8" : "min-h-9",
        checked
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-4 w-7 shrink-0 rounded-full p-0.5 transition",
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
  fit = false,
  value,
  onValueChange,
}: {
  compact?: boolean;
  fit?: boolean;
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
          "min-w-0 max-w-full bg-card py-1.5 text-xs",
          fit ? "w-[220px]" : "w-full sm:w-[220px]",
          compact ? "h-auto min-h-8" : "h-auto min-h-9",
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
  openAt: Date | null | undefined = reference,
  analysis = false,
  analysisRange?: ResolvedOccupancyAnalysisRange,
  companyTimeZone = "America/Sao_Paulo",
): OccupancyReportDefinition[] {
  const todayStart = startOfCompanyTimeZoneDay(reference, companyTimeZone);
  const dayEnd = shiftOccupancyCompanyDay(reference, 1, companyTimeZone);
  const calendarToday = companyCalendarDate(reference, companyTimeZone, "day");
  const minuteEnd = openAt
    ? addMinutes(startOfMinute(reference), 1)
    : dayEnd;
  const minuteFrom = analysis
    ? todayStart
    : new Date(
        Math.max(todayStart.getTime(), addMinutes(minuteEnd, -60).getTime()),
      );
  const hourEnd = openAt
    ? endOfCompanyTimeZoneHour(reference, companyTimeZone)
    : dayEnd;
  const currentWeekStart = startOfWeek(calendarToday);
  const currentMonthStart = startOfMonth(calendarToday);
  const rangeFrom = analysisRange?.from ?? calendarToday;
  const rangeTo = analysisRange?.to ?? addDays(calendarToday, 1);
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
    const candidate = openAt && (definition.granularity === "minute" || definition.granularity === "hour"
      ? openAt : companyCalendarDate(openAt, companyTimeZone, "day"));
    if (!candidate || candidate < definition.from || candidate >= definition.to) {
      return { ...definition, timeZone: companyTimeZone };
    }

    return {
      ...definition,
      timeZone: companyTimeZone,
      openBucket:
        definition.granularity === "hour"
          ? startOfCompanyTimeZoneHour(candidate, companyTimeZone)
          : alignToGranularity(candidate, definition.granularity, companyTimeZone),
    };
  };

  const analysisQuerySegments = analysisResolutionPlan
    ? analysisResolutionPlan.segments.flatMap((segment) =>
        occupancyReportQuerySegments(segment, openAt ? companyCalendarDate(openAt, companyTimeZone, "day") : undefined),
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
          ? "Último dia do intervalo desde 00h; o minuto atual é parcial."
          : "Último dia completo do intervalo, minuto a minuto."
        : "Últimos 60 minutos.",
      granularity: "minute",
      from: minuteFrom,
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
          timeZone: companyTimeZone,
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
          from: addDays(calendarToday, -6),
          to: addDays(calendarToday, 1),
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
    return "Semanas civis completas são consolidadas; os dias parciais nas extremidades permanecem detalhados.";
  }
  return "Meses civis completos são consolidados; os dias parciais nas extremidades permanecem detalhados.";
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
  queryScheduler?: OccupancyQueryScheduler,
  civilCapabilities?: Map<string, boolean>,
): Promise<OccupancyReportState> {
  const scheduleQuery = queryScheduler ?? createOccupancyQueryScheduler(signal);
  const expectedTimeZone = requireCompanyTimeZone(
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
        const path = occupancyScenarioAggregatePath(scope.scenario!.id, segmentDefinition);
        const fetchResponse = (queryPath: string) => scheduleQuery(queryPath, () =>
          apiFetch<OccupancyScenarioAggregateResponse>(queryPath,
            { companyScopeId: companyScopeId ?? undefined, signal }));
        const response = segment.granularity === "day" || segment.granularity === "week" || segment.granularity === "month"
          ? await fetchOccupancyCivilAggregate({
              scenarioId: scope.scenario!.id, granularity: segment.granularity,
              from: segment.from, to: segment.to, timeZone: expectedTimeZone,
              companyScopeId: companyScopeId ?? undefined, signal, requestedAt,
              openBucket: segment.openBucket, fetchResponse, capabilities: civilCapabilities,
            })
          : await fetchResponse(path);
        const rows = requireOccupancyAggregateRows(
          response,
          segment.granularity,
          scope.scenario!.id,
          expectedTimeZone,
          {
            allowLegacyUncertifiedInstantBuckets: true,
            allowDocumentedAggregateResponse: true,
            allowVerifiedCivilAggregateResponse:
              segment.granularity === "day" ||
              segment.granularity === "week" ||
              segment.granularity === "month",
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
          const bucketEnd = addGranularity(bucketStart, segment.granularity, definition.timeZone);
          const requestTo = bucketEnd > segment.to ? segment.to : bucketEnd;
          const isInstant = segment.granularity === "minute" || segment.granularity === "hour";
          const instantFrom = isInstant ? bucketStart : occupancyCalendarBoundaryInstant(bucketStart, expectedTimeZone);
          const instantTo = isInstant ? requestTo : occupancyCalendarBoundaryInstant(requestTo, expectedTimeZone);
          const path = occupancyPath(instantFrom, instantTo);
          const response = await scheduleQuery(path, () =>
            apiFetch<unknown>(path, { companyScopeId: companyScopeId ?? undefined, signal }),
          );
          const rows = requireOccupancySnapshotRowsForCameras(response, {
            expectedCameraIds: scope.cameraIds,
            from: instantFrom,
            to: instantTo,
          });
          const currentWindow = {
            from: instantFrom,
            open:
              segment.openBucket?.getTime() === bucketStart.getTime(),
            to: instantTo,
          };
          const metric = buildRowsMetric(rows, currentWindow);
          const sourceAsOf = rows.reduce<string | undefined>((latest, row) => {
            if (
              !currentWindow.open ||
              !occupancyCurrentReadingBelongsToWindow(
                row.current_at,
                currentWindow,
              )
            ) {
              return latest;
            }
            if (!latest) return row.current_at;
            return Date.parse(row.current_at) > Date.parse(latest)
              ? row.current_at
              : latest;
          }, undefined);

          return {
            point: {
              bucket: bucketStart.toISOString(),
              label: bucketLabel(bucketStart, segment.granularity, definition.timeZone),
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
        allowDocumentedAggregateResponse: true,
        allowVerifiedCivilAggregateResponse:
          definition.granularity === "day" ||
          definition.granularity === "week" ||
          definition.granularity === "month",
        expectedTimezone: definition.timeZone,
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
        label: bucketLabel(bucketStart, definition.granularity, definition.timeZone),
        ...emptyOccupancyMetric(),
      };
    }
    const metric: OccupancyReportMetric = {
      ...total,
      current: total.final ?? null,
    };

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity, definition.timeZone),
      ...metric,
    };
  });

  return {
    // Os segmentos fechado e aberto são unidos antes da normalização visual.
    // Normalizar cada segmento isoladamente criaria dois eixos de 24 horas e
    // faria um ponto vazio apagar o ponto real ao consolidá-los.
    points,
    incomplete: missingBuckets.length > 0,
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
    incomplete: states.length === 0 || states.some((state) => state.incomplete || state.error),
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
    occupancyAnalysisClosedSegmentRevision(
      segment.granularity === "minute" || segment.granularity === "hour"
        ? segment.to : occupancyCalendarBoundaryInstant(segment.to, companyTimeZone),
      requestedAt,
    ),
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
    state.incomplete ||
    state.points.length !== segment.bucketStarts.length ||
    !state.points.every(
      (point) =>
        isCertifiedMetricValue(point.average) &&
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

function buildRowsMetric(
  rows: CertifiedOccupancyRow[],
  currentWindow?: { from: Date; open: boolean; to: Date },
): OccupancyReportMetric {
  if (rows.length !== 1 || rows[0].area !== undefined) {
    throw new Error(
      "O total do período não está disponível para esta seleção. Uma área isolada, ou os extremos de várias áreas, não representa o total combinado.",
    );
  }
  const row = rows[0];

  return {
    average: roundValue(row.avg),
    current:
      currentWindow?.open &&
      occupancyCurrentReadingBelongsToWindow(row.current_at, currentWindow)
        ? roundValue(row.current_value)
        : null,
    minimum: roundValue(row.min),
    peak: roundValue(row.peak),
  };
}

function occupancyCurrentReadingBelongsToWindow(
  currentAt: string,
  window: { from: Date; to: Date },
) {
  const timestamp = Date.parse(currentAt);
  return (
    Number.isFinite(timestamp) &&
    timestamp >= window.from.getTime() &&
    timestamp < window.to.getTime()
  );
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
  chartType: CardChartType = "bar",
): EnterpriseChartOption {
  if (chartType === "line") {
    return buildOccupancyReportLineChartOption(
      definition,
      points,
      previousPoints,
      metricVisibility,
      limits,
      palette,
    );
  }

  const showPrevious = previousPoints.length > 0;
  const showRange = metricVisibility.minimum && metricVisibility.peak;
  const showPreviousRange = showPrevious && showRange;
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
      name: "Valor no período",
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

  if (metricVisibility.minimum && !showRange) {
    markerDefinitions.push({
      color: palette.minimumLimit,
      data: points.map((point) => point.minimum),
      fill: palette.minimumLimit,
      name: "Mínimo",
      offset: [0, 0],
      size: denseMarkerSize(definition, "average"),
      symbol: "rect",
      z: 4,
    });
    if (showPrevious) {
      markerDefinitions.push({
        color: palette.previousAverage,
        data: points.map((_, index) => previousPoints[index]?.minimum ?? null),
        fill: palette.previousAverage,
        name: "Mínimo comparativo",
        offset: [0, dense ? -4 : -6],
        size: denseMarkerSize(definition, "previous"),
        symbol: "rect",
        z: 3,
      });
    }
  }

  if (metricVisibility.peak && !showRange) {
    markerDefinitions.push({
      color: palette.maximumLimit,
      data: points.map((point) => point.peak),
      fill: palette.maximumLimit,
      name: "Máximo",
      offset: [0, 0],
      size: denseMarkerSize(definition, "average"),
      symbol: "circle",
      z: 4,
    });
    if (showPrevious) {
      markerDefinitions.push({
        color: palette.previousAverage,
        data: points.map((_, index) => previousPoints[index]?.peak ?? null),
        fill: palette.previousAverage,
        name: "Máximo comparativo",
        offset: [0, dense ? -4 : -6],
        size: denseMarkerSize(definition, "previous"),
        symbol: "circle",
        z: 3,
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
    ...(showPreviousRange ? ["Base comparativa"] : []),
    ...markerDefinitions.map((series) => ({
      icon: series.symbol === "circle" ? "circle" : "roundRect",
      name: series.name,
    })),
    ...thresholdDefinitions.map((series) => series.name),
  ];

  return {
    color: [
      ...(showPreviousRange ? [palette.previousRangeFill] : []),
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
      ...(showPreviousRange
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
      ...(showRange
        ? [
            {
              barCategoryGap: dense ? "56%" : "62%",
              barGap: showPreviousRange ? "-100%" : undefined,
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
          ]
        : []),
      ...thresholdDefinitions.map((series) => ({
        data: series.data,
        emphasis: {
          disabled: true,
        },
        itemStyle: { color: series.color },
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

function buildOccupancyReportLineChartOption(
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
  const dense =
    definition.granularity === "minute" || definition.granularity === "hour";
  const showPrevious = previousPoints.length > 0;
  const series: Array<Record<string, unknown>> = [];
  const addLine = ({
    color,
    data,
    dashed = false,
    name,
    previous = false,
    silent = false,
    width = 2,
    z = 5,
  }: {
    color: string;
    data: Array<number | null>;
    dashed?: boolean;
    name: string;
    previous?: boolean;
    silent?: boolean;
    width?: number;
    z?: number;
  }) => {
    series.push({
      connectNulls: false,
      data,
      itemStyle: { color },
      lineStyle: {
        color,
        opacity: previous ? 0.72 : 0.96,
        type: dashed || previous ? "dashed" : "solid",
        width,
      },
      name,
      showSymbol: !dense && !previous && !silent,
      silent,
      smooth: false,
      symbol: "circle",
      symbolSize: dense ? 3 : 6,
      type: "line",
      z,
    });
  };

  if (points.some((point) => point.current !== null)) {
    addLine({
      color: palette.current,
      data: points.map((point) => point.current),
      name: "Valor no período",
      width: 2.6,
      z: 8,
    });
  }
  if (metricVisibility.average) {
    addLine({
      color: palette.average,
      data: points.map((point) => point.average),
      name: "Média",
      z: 7,
    });
    if (showPrevious) {
      addLine({
        color: palette.previousAverage,
        data: points.map(
          (_, index) => previousPoints[index]?.average ?? null,
        ),
        name: "Média comparativa",
        previous: true,
        width: 1.8,
        z: 5,
      });
    }
  }
  if (metricVisibility.minimum) {
    addLine({
      color: palette.minimumLimit,
      data: points.map((point) => point.minimum),
      dashed: true,
      name: "Mínimo",
      width: 1.6,
      z: 6,
    });
    if (showPrevious) {
      addLine({
        color: palette.previousAverage,
        data: points.map(
          (_, index) => previousPoints[index]?.minimum ?? null,
        ),
        name: "Mínimo comparativo",
        previous: true,
        width: 1.3,
        z: 4,
      });
    }
  }
  if (metricVisibility.peak) {
    addLine({
      color: palette.maximumLimit,
      data: points.map((point) => point.peak),
      dashed: true,
      name: "Máximo",
      width: 1.6,
      z: 6,
    });
    if (showPrevious) {
      addLine({
        color: palette.previousAverage,
        data: points.map(
          (_, index) => previousPoints[index]?.peak ?? null,
        ),
        name: "Máximo comparativo",
        previous: true,
        width: 1.3,
        z: 4,
      });
    }
  }
  if (limits.minimum !== undefined) {
    addLine({
      color: palette.minimumLimit,
      data: points.map(() => limits.minimum ?? null),
      dashed: true,
      name: "Limite mínimo",
      silent: true,
      width: 1.4,
      z: 3,
    });
  }
  if (limits.maximum !== undefined) {
    addLine({
      color: palette.maximumLimit,
      data: points.map(() => limits.maximum ?? null),
      dashed: true,
      name: "Limite máximo",
      silent: true,
      width: 1.4,
      z: 3,
    });
  }

  return {
    color: series.flatMap((item) => {
      const color = (item.itemStyle as { color?: unknown } | undefined)?.color;
      return typeof color === "string" ? [color] : [];
    }),
    grid: {
      bottom: 2,
      containLabel: true,
      left: 4,
      right: 12,
      top: series.length ? 48 : 18,
    },
    legend: series.length
      ? {
          itemGap: 14,
          itemHeight: 6,
          itemWidth: 9,
          selectedMode: false,
          textStyle: { color: palette.legendText, fontSize: 11 },
          top: 0,
        }
      : undefined,
    tooltip: {
      axisPointer: { type: "line" },
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
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "axis",
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
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      boundaryGap: false,
      data: points.map((point) => point.label),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: palette.axisText, fontSize: 11 },
      min: 0,
      minInterval: dense ? 1 : undefined,
      splitLine: { lineStyle: { color: palette.gridLine } },
      type: "value",
    },
    series,
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
    description: `${occupancyObjectClassLabel(scenario.object_class)} no cenário de ocupação.`,
    id: scenario.id,
    mode: "scenario",
    name: scenario.name,
    scenario,
  }));
}

function scopeModeLabel(mode: OccupancyReportScopeMode) {
  if (mode === "location") return "Local";
  if (mode === "sub_location") return "Sublocal";
  return "Cenário";
}

function buildComparisonDefinition(
  definition: OccupancyReportDefinition,
  intradayComparison: IntradayComparisonMode,
): OccupancyReportDefinition {
  const comparisonSegments = listDefinitionQuerySegments(definition).flatMap(
    (segment): OccupancyReportQuerySegment[] => {
      const bucketStarts = occupancyComparisonBucketStarts({
        bucketStarts: segment.bucketStarts,
        granularity: segment.granularity,
        intradayComparison,
        timeZone: definition.timeZone,
      });
      const groups: Date[][] = [];
      for (const bucket of bucketStarts) {
        const group = groups.at(-1);
        const previous = group?.at(-1);
        if (!previous || addGranularity(previous, segment.granularity, definition.timeZone).getTime() !== bucket.getTime()) {
          groups.push([bucket]);
        } else group!.push(bucket);
      }
      // A civil minute absent during DST has no baseline. Do not query the
      // selected day by accident, or fill non-contiguous gaps with extra rows.
      return groups.map((group) => ({
        bucketStarts: group,
        from: new Date(group[0]),
        granularity: segment.granularity,
        timeZone: definition.timeZone,
        to: addGranularity(group.at(-1)!, segment.granularity, definition.timeZone),
      }));
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
    to: comparisonSegments.length
      ? new Date(Math.max(...comparisonSegments.map((segment) => segment.to.getTime())))
      : new Date(from),
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

  return `${description} O período em andamento só entra no comparativo depois de encerrado.`;
}

function alignMinuteComparisonPoints(
  data: Record<string, OccupancyReportState>,
  definitions: OccupancyReportDefinition[],
) {
  definitions.forEach((definition) => {
    if (definition.granularity !== "minute") return;
    const current = data[definition.id];
    const key = previousId(definition.id);
    const previous = data[key];
    if (!current || !previous || previous.error) return;
    const byLabel = new Map<string, OccupancyReportPoint[]>();
    previous.points.forEach((point) => {
      const values = byLabel.get(point.label) ?? [];
      values.push(point);
      byLabel.set(point.label, values);
    });
    data[key] = {
      ...previous,
      points: current.points.map((point) => {
        const matches = byLabel.get(point.label) ?? [];
        if (!matches.length) return { ...point, ...emptyOccupancyMetric() };
        if (matches.length === 1) return matches[0];
        const last = matches.at(-1)!;
        // Repeated DST minutes have no certified averaging weight. Keep
        // exact extrema and the final occurrence; never shift another minute.
        return {
          ...last,
          average: null,
          minimum: matches.every((entry) => entry.minimum !== null)
            ? Math.min(...matches.map((entry) => entry.minimum!)) : null,
          peak: matches.every((entry) => entry.peak !== null)
            ? Math.max(...matches.map((entry) => entry.peak!)) : null,
        };
      }),
    };
  });
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
        const bucketEnd = addGranularity(bucketStart, granularity, definition.timeZone);
        const certifiedEnd = bucketEnd > segmentTo ? segmentTo : bucketEnd;
        const comparisonNow = definition.timeZone && granularity !== "minute" && granularity !== "hour"
          ? companyCalendarDate(now, definition.timeZone, "day") : now;
        return bucketStart <= comparisonNow && comparisonNow < certifiedEnd;
      },
    );
    const openBucket = bucketDescriptors[openDescriptorIndex]?.bucketStart;
    const openIndex = openBucket
      ? definition.granularity === "hour"
        ? definition.timeZone ? companyZonedDateParts(openBucket, definition.timeZone).hour : openBucket.getHours()
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

  return `/occupancy/scenarios/${encodeURIComponent(scenarioId)}/aggregate?${params.toString()}`;
}

function occupancyScenarioHistoryPath(scenarioId: string, at: Date) {
  const params = new URLSearchParams({ at: at.toISOString() });
  return `/occupancy/scenarios/${encodeURIComponent(scenarioId)}/history?${params.toString()}`;
}

async function loadOccupancyReportCurrentSnapshot({
  companyScopeId,
  requestedAt,
  scenario,
  scheduleQuery,
  signal,
}: {
  companyScopeId: string;
  requestedAt: Date;
  scenario: OccupancyScenario;
  scheduleQuery: OccupancyQueryScheduler;
  signal: AbortSignal;
}): Promise<CertifiedCurrentSnapshot> {
  const query = occupancyLiveSnapshotQuery({ now: requestedAt });
  const response = await scheduleQuery(`current-snapshot:${query.path}`, () =>
    apiFetch<unknown>(query.path, { companyScopeId, signal }),
  );
  signal.throwIfAborted();
  const rows = requireOccupancyCurrentSnapshotRows(response, {
    expectedAreas: scenario.areas.map((area) => ({
      area_id: area.area_id,
      camera_id: area.camera_id,
      object_class: scenario.object_class,
    })),
  });
  if (!occupancyScenarioSnapshotHasCompleteCoverage(scenario, rows)) {
    const historyPath = occupancyScenarioHistoryPath(
      scenario.id,
      requestedAt,
    );
    const historyResponse = await scheduleQuery(
      `current-history:${historyPath}`,
      () => apiFetch<unknown>(historyPath, { companyScopeId, signal }),
    );
    signal.throwIfAborted();
    const history = requireOccupancyHistoryResponse(
      historyResponse,
      scenario.id,
      {
        expectedAreas: scenario.areas,
        requireAreaSnapshots: true,
        requestedAt,
      },
    );
    if (!history.areas || !history.as_of) {
      throw new Error("A leitura atual não possui detalhes certificados.");
    }
    return {
      activeAreas: history.areas.filter((area) => area.value > 0).length,
      areas: history.areas.map((area) => ({
        areaId: area.area_id,
        cameraId: area.camera_id,
        value: area.value,
      })),
      asOf: history.as_of,
      total: history.total,
    };
  }
  const snapshot = buildOccupancyScenarioSnapshotValue(scenario, rows);
  if (!snapshot.asOf) {
    throw new Error("A leitura atual não possui horário certificado.");
  }

  return {
    activeAreas: rows.filter((row) => row.occupied).length,
    areas: rows.map((row) => ({
      areaId: row.area,
      cameraId: row.camera_id,
      value: row.current_value,
    })),
    asOf: snapshot.asOf,
    total: snapshot.total,
  };
}

function occupancyPath(from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });

  return `/occupancy?${params.toString()}`;
}

function previousId(id: string) {
  return `${id}__previous`;
}

function buildOccupancyAiDailyQueryPlan(
  source: OccupancyReportDefinition,
  openBucket?: Date,
): OccupancyAiDailyQueryPlan {
  const bucketStarts: Date[] = [];
  let cursor = new Date(source.from);

  while (cursor < source.to) {
    if (bucketStarts.length >= AI_INSIGHTS_LIMITS.dailyDatasetRows) {
      throw new RangeError(
        `O período possui mais de ${AI_INSIGHTS_LIMITS.dailyDatasetRows} dias. Reduza o intervalo antes de gerar a análise da IA.`,
      );
    }
    bucketStarts.push(new Date(cursor));
    const next = addDays(cursor, 1);
    if (next <= cursor) {
      throw new RangeError(
        "Não foi possível avançar pela série diária de ocupação.",
      );
    }
    cursor = next;
  }

  if (
    !bucketStarts.length ||
    cursor.getTime() !== source.to.getTime()
  ) {
    throw new RangeError(
      "O intervalo de ocupação não corresponde a dias civis completos.",
    );
  }

  const chunks: OccupancyReportDefinition[] = [];
  for (
    let index = 0;
    index < bucketStarts.length;
    index += AI_OCCUPANCY_DAILY_CHUNK_DAYS
  ) {
    const chunkStarts = bucketStarts
      .slice(index, index + AI_OCCUPANCY_DAILY_CHUNK_DAYS)
      .map((bucket) => new Date(bucket));
    const from = chunkStarts[0]!;
    const to =
      bucketStarts[index + chunkStarts.length] ?? new Date(source.to);
    const chunkOpenBucket =
      openBucket && openBucket >= from && openBucket < to
        ? new Date(openBucket)
        : undefined;

    chunks.push({
      bucketStarts: chunkStarts,
      description:
        "Série diária carregada sob demanda exclusivamente para a IA Advisor.",
      from: new Date(from),
      granularity: "day",
      id: `${source.id}__ai_daily_${chunks.length + 1}`,
      timeZone: source.timeZone,
      label: "Série diária completa",
      openBucket: chunkOpenBucket,
      to: new Date(to),
    });
  }

  return { bucketStarts, chunks };
}

function buildOccupancyAiDailyTable({
  bucketStarts,
  companyTimeZone,
  points,
}: {
  bucketStarts: Date[];
  companyTimeZone: string;
  points: OccupancyReportPoint[];
}): ReportTable {
  if (bucketStarts.length > AI_INSIGHTS_LIMITS.dailyDatasetRows) {
    throw new RangeError(
      `O período possui ${bucketStarts.length} dias, acima do limite seguro de ${AI_INSIGHTS_LIMITS.dailyDatasetRows} dias por análise.`,
    );
  }
  requireCompanyTimeZone(companyTimeZone);
  const dateKeys = bucketStarts.map(occupancyCalendarDateKey);
  const expectedDateKeys = new Set(dateKeys);
  if (expectedDateKeys.size !== dateKeys.length) {
    throw new Error(
      "A série diária de ocupação possui datas civis duplicadas no fuso da empresa.",
    );
  }

  const pointByDate = new Map<string, OccupancyReportPoint>();
  for (const point of points) {
    const bucket = new Date(point.bucket);
    if (Number.isNaN(bucket.getTime())) {
      throw new Error("A série diária de ocupação contém um período inválido.");
    }
    const dateKey = occupancyCalendarDateKey(bucket);
    if (!expectedDateKeys.has(dateKey)) continue;
    // Chunks não se sobrepõem, mas a chave civil garante deduplicação caso a
    // API repita uma borda. A observação mais recente prevalece.
    pointByDate.set(dateKey, point);
  }

  const missingDates = dateKeys.filter((dateKey) => !pointByDate.has(dateKey));
  if (missingDates.length) {
    throw new Error(
      `A série diária de ocupação não retornou ${missingDates.length} ${
        missingDates.length === 1 ? "dia esperado" : "dias esperados"
      } do intervalo.`,
    );
  }

  return {
    columns: [
      { key: "date", label: "Data", width: 18 },
      { key: "current", label: "Fechamento", numeric: true, width: 16 },
      { key: "average", label: "Média", numeric: true, width: 16 },
      { key: "minimum", label: "Mínimo", numeric: true, width: 16 },
      { key: "peak", label: "Máximo", numeric: true, width: 16 },
    ],
    description:
      "Um registro por dia selecionado, em ordem cronológica e sem amostragem. Valores ausentes permanecem nulos.",
    rows: dateKeys.map((date) => {
      const point = pointByDate.get(date)!;
      return {
        average: point.average,
        current: point.current,
        date,
        minimum: point.minimum,
        peak: point.peak,
      };
    }),
    title: "Série diária completa de ocupação",
  };
}

function occupancyAiDailyPeriodLabel(
  bucketStarts: Date[],
  companyTimeZone: string,
) {
  const first = bucketStarts[0];
  const last = bucketStarts.at(-1);
  if (!first || !last) {
    throw new Error("A série diária de ocupação está vazia.");
  }
  requireCompanyTimeZone(companyTimeZone);
  return `${occupancyCalendarDateKey(first)} a ${occupancyCalendarDateKey(last)}`;
}

function assertOccupancyAiRequestCurrent(
  currentScopeKeyRef: { readonly current: string },
  requestedScopeKey: string,
) {
  if (currentScopeKeyRef.current !== requestedScopeKey) {
    throw new Error(
      "A visão ou o período de ocupação mudou durante a leitura diária. Gere o relatório novamente.",
    );
  }
}

function listBucketStarts(definition: OccupancyReportDefinition) {
  return listDefinitionQuerySegments(definition).flatMap((segment) =>
    segment.bucketStarts.map((bucketStart) => new Date(bucketStart)),
  );
}

function listDefinitionQuerySegments(
  definition: OccupancyReportDefinition,
): OccupancyReportQuerySegment[] {
  if (definition.querySegments) {
    return definition.querySegments.flatMap((segment) =>
      splitOpenQuerySegment({
        ...segment,
        timeZone: definition.timeZone,
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
          definition.timeZone,
        ),
      from: new Date(definition.from),
      granularity: definition.granularity,
      timeZone: definition.timeZone,
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
      addGranularity(openStart, segment.granularity, segment.timeZone).getTime(),
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
      timeZone: segment.timeZone,
      bucketStarts: beforeBuckets,
      from: segment.from,
      granularity: segment.granularity,
      to: new Date(openStart),
    });
  }
  if (openBuckets.length) {
    result.push({
      timeZone: segment.timeZone,
      bucketStarts: openBuckets,
      from: new Date(openStart),
      granularity: segment.granularity,
      openBucket: new Date(openStart),
      to: openEnd,
    });
  }
  if (afterBuckets.length) {
    result.push({
      timeZone: segment.timeZone,
      bucketStarts: afterBuckets,
      from: openEnd,
      granularity: segment.granularity,
      to: segment.to,
    });
  }

  if (!result.length) {
    throw new Error("O período em andamento não pertence ao intervalo selecionado.");
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
  timeZone?: string,
) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(from, granularity, timeZone);
  const end = alignEndToGranularity(to, granularity, timeZone);
  const bucketLimit =
    granularity === "minute"
      ? MAX_OCCUPANCY_MINUTE_REPORT_BUCKETS
      : MAX_OCCUPANCY_REPORT_BUCKETS;
  let guard = 0;

  while (cursor < end && guard < bucketLimit) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, granularity, timeZone);
    guard += 1;
  }

  if (cursor < end) {
    throw new RangeError(
      "O intervalo selecionado é extenso demais para este relatório. Reduza o período.",
    );
  }

  return starts;
}

function buildEmptyPoints(definition: OccupancyReportDefinition) {
  const points = listDefinitionBucketDescriptors(definition).map(
    ({ bucketStart, granularity }) => ({
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, granularity, definition.timeZone),
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
    averageValues.every(isCertifiedMetricValue);
  const completeCurrent = completeCoverage && currentValues.every(isCertifiedMetricValue);

  return {
    // A API não fornece peso/duração para compor médias de vários dias.
    // Portanto a média e o fechamento permanecem explicitamente do último
    // bucket e só são publicados quando todo o intervalo está certificado.
    average: completeCoverage ? latest.average : null,
    current: completeCurrent ? latest.current : null,
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
    ? buildFixedOccupancyHourlyPoints(definition.from, points, definition.timeZone)
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
  timeZone?: string,
) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return timeZone ? startOfCompanyTimeZoneHour(date, timeZone) : startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  if (granularity === "semester") return startOfSemester(date);
  if (granularity === "year") return startOfYear(date);
  return startOfMonth(date);
}

function alignEndToGranularity(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
  timeZone?: string,
) {
  const aligned = alignToGranularity(date, granularity, timeZone);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity, timeZone);
}

function addGranularity(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
  timeZone?: string,
) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") return timeZone ? endOfCompanyTimeZoneHour(date, timeZone) : endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "semester") return addMonths(date, 6);
  if (granularity === "year") return addYears(date, 1);
  return addMonths(date, 1);
}

function bucketLabel(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
  timeZone?: string,
) {
  if (granularity === "minute") return formatTime(date, timeZone);
  if (granularity === "hour") return `${String(timeZone ? companyZonedDateParts(date, timeZone).hour : date.getHours()).padStart(2, "0")}h`;
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
  return shiftOccupancyCalendarDate(date);
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return shiftOccupancyCalendarDate(next, diff);
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
  return shiftOccupancyCalendarDate(date, days);
}

function addMonths(date: Date, months: number) {
  return shiftOccupancyCalendarDate(date, 0, months);
}

function addYears(date: Date, years: number) {
  return shiftOccupancyCalendarDate(date, 0, 0, years);
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
      error: userFacingErrorMessage(error, fallbackMessage),
    };
  }
}

function occupancyReportErrorMessage(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
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
