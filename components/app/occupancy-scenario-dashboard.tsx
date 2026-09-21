"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gauge,
  MapPinned,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { AiAnalysisAction } from "@/components/app/deferred-ai-analysis-action";
import { CardLayout, ReorderModeButton } from "@/components/app/card-layout";
import {
  COMPACT_METRIC_LAYOUT_DEFAULTS,
  CompactMetricCard,
} from "@/components/app/compact-metric-card";
import {
  EChart,
  type EnterpriseChartOption,
} from "@/components/app/deferred-echart";
import {
  OCCUPANCY_COMPARISON_CARD_IDS,
  useOccupancyComparisonCards,
  type OccupancySharedHourlyAggregate,
} from "@/components/app/occupancy-comparison-widgets";
import {
  OCCUPANCY_DURATION_CARD_IDS,
  useOccupancyDurationCards,
} from "@/components/app/occupancy-duration-widgets";
import { OCCUPANCY_DURATION_INSIGHT_CARD_IDS } from "@/components/app/occupancy-duration-insights-widgets";
import { useOccupancyDurationInsights } from "@/components/app/use-occupancy-duration-insights";
import {
  OCCUPANCY_LOITERING_AVERAGE_CARD_ID,
  OCCUPANCY_LOITERING_CARD_IDS,
} from "@/components/app/occupancy-loitering-widgets";
import { OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS } from "@/components/app/occupancy-loitering-temporal-widgets";
import { useOccupancyLoitering } from "@/components/app/use-occupancy-loitering";
import { OccupancyBlockingState } from "@/components/app/occupancy-blocking-state";
import {
  DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
  OccupancyCustomWidgetActions,
  OccupancyCustomWidgetDialog,
  occupancyCustomMetricLabel,
  occupancyGranularityLabel,
  type OccupancyCustomWidgetForm,
} from "@/components/app/occupancy-custom-widget-editor";
import { OccupancyPaletteSelect } from "@/components/app/occupancy-palette-select";
import { useAuth } from "@/components/app/auth-provider";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { useUserGridReady } from "@/components/app/use-user-grid-ready";
import {
  useWidgetChartType,
  useWidgetColor,
  useWidgetTitle,
} from "@/components/app/widget-appearance";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import {
  getOccupancyChartPalette,
  type OccupancyChartPalette,
} from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { hasVisualAdminAccess } from "@/lib/access";
import { ApiError } from "@/lib/api";
import {
  aggregateQueryIso,
  endOfAggregateBucket,
  parseAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  loadDashboardFocus,
  resolveDashboardFocus,
  saveDashboardFocus,
} from "@/lib/dashboard-focus";
import {
  filterScopedApiRows,
  usesMasterCrossCompanyScope,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import {
  companyCalendarDate,
  companyDateKey,
  companyTimeZoneHour,
  endOfCompanyTimeZoneHour,
  startOfCompanyTimeZoneDay,
  startOfCompanyTimeZoneHour,
  type CompanyTimeZoneResolution,
} from "@/lib/company-time-zone";
import { shiftOccupancyCalendarDate } from "@/lib/occupancy-calendar";
import {
  isCertifiedOccupancyCompanyTimeZone,
  requireCertifiedOccupancyCompanyTimeZone,
} from "@/lib/occupancy-company-time-zone";
import {
  fetchOccupancyCivilAggregate,
  type OccupancyCivilAggregateUnitCache,
} from "@/lib/occupancy-civil-aggregate-query";
import {
  fetchSharedOccupancyQuery,
  sharedOccupancyCivilCapabilities,
} from "@/lib/occupancy-shared-query";
import {
  buildOccupancyCardDemandKey,
  createOccupancyQueryScheduler,
  mergeOccupancyCardDemand,
  OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS,
  OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID,
  occupancyLiveHistoryRequired,
  occupancyLiveSnapshotQuery,
} from "@/lib/occupancy-dashboard-query";
import { ensureGraphicContrast } from "@/lib/occupancy-hex-palette";
import { occupancyObjectClassLabel } from "@/lib/occupancy-object-class";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  DEFAULT_OCCUPANCY_TREND_SERIES,
  deleteOccupancyCustomWidget,
  loadOccupancyCustomWidgets,
  OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertOccupancyCustomWidget,
  type OccupancyCustomMetric,
  type OccupancyCustomWidget,
} from "@/lib/occupancy-custom-widgets";
import {
  DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS,
  loadOccupancyDashboardSettings,
  OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT,
  saveOccupancyDashboardSettings,
  type OccupancyDashboardSettings,
  type OccupancyMetricVisibility,
} from "@/lib/occupancy-dashboard-settings";
import {
  aggregateOccupancyRowsForRequestedBuckets,
  occupancyAggregateBucketKey,
  occupancyAggregateCoverageWarning,
  occupancyAggregateMetadataWarning,
  requireOccupancyAggregateRows,
} from "@/lib/occupancy-aggregate-validation";
import {
  buildFixedOccupancyHourlyPoints,
  occupancyFixedHourLabelInterval,
} from "@/lib/occupancy-hour-axis";
import { latestOccupancyMetric } from "@/lib/occupancy-metrics";
import {
  nextOccupancyLiveRetry,
  occupancyLiveRetryReady,
  type OccupancyLiveRetryState,
} from "@/lib/occupancy-live-retry";
import {
  buildOccupancyScenarioCurrentHistory,
  occupancyScenarioSnapshotHasCompleteCoverage,
} from "@/lib/occupancy-scenario-snapshots";
import {
  requireOccupancyAlertRows,
  requireOccupancyCurrentSnapshotRows,
  requireOccupancyHistoryResponse,
  requireOccupancyScenarioRows,
} from "@/lib/occupancy-validation";
import { canManageOccupancy } from "@/lib/permissions";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import type {
  ReportChart,
  ReportMetric,
  ReportPayload,
  ReportTable,
} from "@/lib/report-export";
import type {
  AggregateGranularity,
  OccupancyAlertRow,
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioBucketRow,
  OccupancyScenarioHistoryResponse,
} from "@/lib/types";
import {
  orderByCardPreferences,
  type CardChartType,
  type CardPreference,
} from "@/lib/view-preferences";
import { cn, formatDateTime, formatNumber, formatTime } from "@/lib/utils";

type LoadOptions = {
  force?: boolean;
  resourceGroup?: "all" | "live-pulse" | "secondary";
  silent?: boolean;
};

type OccupancyChartDefinition = {
  timeZone?: string;
  id: string;
  label: string;
  description: string;
  granularity: Extract<
    AggregateGranularity,
    "minute" | "hour" | "day" | "week" | "month"
  >;
  from: Date;
  to: Date;
};

type OccupancyChartState = {
  rows: OccupancyScenarioBucketRow[];
  points: OccupancyPoint[];
  incomplete?: boolean;
  error?: string;
  warning?: string;
};

type OccupancyPoint = {
  bucket: string;
  label: string;
  average: number | null;
  current: number | null;
  minimum: number | null;
  peak: number | null;
};

type OccupancyMarkerKind = "average" | "current" | "limit";

type OccupancyMarkerDefinition = {
  color: string;
  data: Array<number | null>;
  effect?: boolean;
  fill: string;
  kind: OccupancyMarkerKind;
  name: string;
  offset: [number, number];
  size: number | [number, number];
  symbol: "circle" | "rect";
  z: number;
};

type OccupancyDashboardSettingsState = {
  scopeKey: string;
  value: OccupancyDashboardSettings;
};

type OccupancyLiveDataPlan = {
  alerts: boolean;
  granularities: OccupancyChartDefinition["granularity"][];
  history: boolean;
  key: string;
};

type OccupancyLiveDataFreshness = {
  retries?: Partial<
    Record<
      "history" | "alerts" | OccupancyChartDefinition["granularity"],
      OccupancyLiveRetryState
    >
  >;
  alertsAt: number;
  chartAuditAt: Partial<
    Record<OccupancyChartDefinition["granularity"], number>
  >;
  chartAt: Partial<Record<OccupancyChartDefinition["granularity"], number>>;
  chartMutableBucketStarts: Partial<
    Record<OccupancyChartDefinition["granularity"], number>
  >;
  chartWindowKeys: Partial<
    Record<OccupancyChartDefinition["granularity"], string>
  >;
  historyAt: number;
  scopeKey: string;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OCCUPANCY_REFRESH_SECONDS = 5;
const OCCUPANCY_REFRESH_MS = OCCUPANCY_REFRESH_SECONDS * 1_000;
// Only the camera proof and the minute edge need the five-second heartbeat.
// Everything else is either a closed aggregate or an operational summary;
// polling those resources at the camera cadence multiplies requests without
// producing a visibly different answer.
const OCCUPANCY_ALERTS_REFRESH_MS = 30_000;
// Keep a short hysteresis for scroll jitter, but release off-screen loaders
// before the next five-second live pulse can overlap with newly visible cards.
const OCCUPANCY_CARD_DEMAND_RELEASE_MS = 1_000;
const OCCUPANCY_COMPARISON_AGGREGATE_REFRESH_MS = MINUTE_MS;
const OCCUPANCY_CHART_FULL_AUDIT_MS = 24 * HOUR_MS;
const OCCUPANCY_CHART_REFRESH_MS: Record<
  OccupancyChartDefinition["granularity"],
  number
> = {
  minute: OCCUPANCY_REFRESH_MS,
  hour: MINUTE_MS,
  day: 5 * MINUTE_MS,
  week: 15 * MINUTE_MS,
  month: HOUR_MS,
};
const OCCUPANCY_METRIC_CARD_IDS = [
  "occupancy_current_total",
  "occupancy_average",
  "occupancy_minimum",
  "occupancy_peak",
  "occupancy_alerts",
  "occupancy_active_areas",
] as const;
const OCCUPANCY_CHART_CARD_IDS = [
  "occupancy_chart_minute",
  "occupancy_chart_hour",
  "occupancy_chart_day",
  "occupancy_chart_week",
  "occupancy_chart_month",
] as const;
const OCCUPANCY_DETAIL_CARD_IDS = [
  "occupancy_scenario_detail",
  "occupancy_alert_list",
] as const;
const OCCUPANCY_EAGER_CARD_IDS = [
  "occupancy_current_total",
] as const;
const OCCUPANCY_LOITERING_NETWORK_CARD_IDS = new Set<string>(
  [
    ...OCCUPANCY_LOITERING_CARD_IDS,
    ...OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
  ],
);
const OCCUPANCY_DURATION_LAYOUT_CARD_IDS = OCCUPANCY_DURATION_CARD_IDS.filter(
  (cardId) => cardId !== OCCUPANCY_LOITERING_AVERAGE_CARD_ID,
);
const EMPTY_OCCUPANCY_CARD_IDS: string[] = [];
const EMPTY_OCCUPANCY_ALERTS: OccupancyAlertRow[] = [];
const EMPTY_OCCUPANCY_CHART_DATA: Record<string, OccupancyChartState> = {};
const EMPTY_OCCUPANCY_PREFERENCES: CardPreference[] = [];

export function OccupancyScenarioDashboard() {
  const { user } = useAuth();
  const userId = user?.id;
  const userGridReadiness = useUserGridReady(userId);
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(
    user,
    companyScopeId,
  );
  const companyTimeZoneResolution = useEffectiveCompanyTimeZoneResolution(user);
  const companyTimeZone = companyTimeZoneResolution.timeZone;
  const certifiedCompanyTimeZoneResolution =
    React.useMemo<CompanyTimeZoneResolution>(
      () => ({
        fallback: companyTimeZoneResolution.fallback,
        source: companyTimeZoneResolution.source,
        timeZone: companyTimeZoneResolution.timeZone,
        warning: companyTimeZoneResolution.warning,
      }),
      [
        companyTimeZoneResolution.fallback,
        companyTimeZoneResolution.source,
        companyTimeZoneResolution.timeZone,
        companyTimeZoneResolution.warning,
      ],
    );
  const canManage = canManageOccupancy(user);
  const companyTimeZoneCertified =
    isCertifiedOccupancyCompanyTimeZone(certifiedCompanyTimeZoneResolution);
  const canEditVisual = hasVisualAdminAccess(user);
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, OccupancyChartState>
  >({});
  const [history, setHistory] =
    React.useState<OccupancyScenarioHistoryResponse | null>(null);
  const [historyRequestedAt, setHistoryRequestedAt] =
    React.useState<Date | null>(null);
  const [alerts, setAlerts] = React.useState<OccupancyAlertRow[]>([]);
  const [alertsLoadedScopeKey, setAlertsLoadedScopeKey] = React.useState("");
  const [alertsError, setAlertsError] = React.useState("");
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [dataLoadError, setDataLoadError] = React.useState("");
  const [historyError, setHistoryError] = React.useState("");
  const [hasLoadedData, setHasLoadedData] = React.useState(false);
  const [loadedDataScopeKey, setLoadedDataScopeKey] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [demandedOccupancyCards, setDemandedOccupancyCards] = React.useState<{
    ids: string[];
    scopeKey: string;
  }>({ ids: [], scopeKey: "" });
  const [operationalSettingsOpen, setOperationalSettingsOpen] =
    React.useState(false);
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<OccupancyCustomWidgetForm>(
      DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
    );
  const [customWidgets, setCustomWidgets] = React.useState<
    OccupancyCustomWidget[]
  >([]);
  const [occupancyPreferencesReadyKey, setOccupancyPreferencesReadyKey] =
    React.useState("");
  const [dashboardSettingsState, setDashboardSettingsState] =
    React.useState<OccupancyDashboardSettingsState>({
      scopeKey: "",
      value: DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS,
    });
  const activeDataScopeKey = occupancyDataScopeKey(
    companyScopeId,
    selectedId,
    companyTimeZone,
  );

  const liveRequestRef = React.useRef<AbortController | null>(null);
  const secondaryRequestRef = React.useRef<AbortController | null>(null);
  const liveRunningRef = React.useRef(false);
  const secondaryRunningRef = React.useRef(false);
  const secondaryPlanKeyRef = React.useRef("");
  const chartDataRef = React.useRef<Record<string, OccupancyChartState>>({});
  const civilAggregateUnitCacheRef =
    React.useRef<OccupancyCivilAggregateUnitCache>(new Map());
  const hasLoadedDataRef = React.useRef(false);
  const activeDataScopeKeyRef = React.useRef("");
  const loadedDataScopeKeyRef = React.useRef("");
  const civilAggregateCapabilities = React.useMemo(
    () => sharedOccupancyCivilCapabilities(companyScopeId, companyTimeZone),
    [companyScopeId, companyTimeZone],
  );
  const dataFreshnessRef = React.useRef<OccupancyLiveDataFreshness>({
    alertsAt: 0,
    chartAuditAt: {},
    chartAt: {},
    chartMutableBucketStarts: {},
    chartWindowKeys: {},
    historyAt: 0,
    scopeKey: "",
  });
  const metadataRequestSequenceRef = React.useRef(0);
  const metadataRequestControllerRef = React.useRef<AbortController | null>(
    null,
  );
  const metadataRequestKeyRef = React.useRef("");
  const metadataLoadedKeyRef = React.useRef("");
  const focusRef = React.useRef({
    scopeMode: "scenario" as const,
    selectedId,
  });
  const activeDemandedCardIdsRef = React.useRef(new Set<string>());
  const materializedCardIdsRef = React.useRef(new Set<string>());
  const viewportDemandByCardIdRef = React.useRef(new Map<string, boolean>());
  const pendingDemandedCardIdsRef = React.useRef(new Map<string, boolean>());
  const demandedCardsTimerRef = React.useRef<number | null>(null);
  const demandedCardReleaseTimersRef = React.useRef(
    new Map<string, number>(),
  );
  React.useEffect(
    () => () => {
      liveRequestRef.current?.abort();
      secondaryRequestRef.current?.abort();
    },
    [],
  );
  const registerDemandedOccupancyCard = React.useCallback(
    (cardId: string, demanded: boolean) => {
      viewportDemandByCardIdRef.current.set(cardId, demanded);
      const previousReleaseTimer =
        demandedCardReleaseTimersRef.current.get(cardId);
      if (previousReleaseTimer !== undefined) {
        window.clearTimeout(previousReleaseTimer);
        demandedCardReleaseTimersRef.current.delete(cardId);
      }
      // CardLayout deliberately materializes one card per frame. Collapse that
      // burst into one data-plan expansion so an in-flight foreground request
      // is not repeatedly replaced while the first viewport becomes ready.
      const flushDemand = () => {
        demandedCardsTimerRef.current = null;
        const pending = pendingDemandedCardIdsRef.current;
        pendingDemandedCardIdsRef.current = new Map();
        setDemandedOccupancyCards((current) => {
          const currentIds =
            current.scopeKey === activeDataScopeKey ? current.ids : [];
          const nextIds = mergeOccupancyCardDemand(currentIds, pending);
          activeDemandedCardIdsRef.current = new Set(nextIds);
          return current.scopeKey === activeDataScopeKey &&
            nextIds === currentIds
            ? current
            : { ids: nextIds, scopeKey: activeDataScopeKey };
        });
      };
      const scheduleFlush = (delayMs: number) => {
        if (demandedCardsTimerRef.current !== null) {
          window.clearTimeout(demandedCardsTimerRef.current);
        }
        demandedCardsTimerRef.current = window.setTimeout(
          flushDemand,
          delayMs,
        );
      };

      if (demanded) {
        // CardLayout has a wider observation margin for demand than for actual
        // content materialization. Do not open a network source for a card
        // that is still only a distant layout placeholder.
        if (!materializedCardIdsRef.current.has(cardId)) return;
        pendingDemandedCardIdsRef.current.set(cardId, true);
        scheduleFlush(120);
        return;
      }

      if (
        pendingDemandedCardIdsRef.current.get(cardId) === true &&
        !activeDemandedCardIdsRef.current.has(cardId)
      ) {
        // The card crossed the viewport before its activation debounce
        // completed. Cancel it now; the release grace is only for resources
        // that were actually started.
        pendingDemandedCardIdsRef.current.set(cardId, false);
        scheduleFlush(0);
        return;
      }

      // A short release grace prevents normal scrolling around a viewport
      // boundary from aborting and immediately replaying the same history.
      const releaseTimer = window.setTimeout(() => {
        demandedCardReleaseTimersRef.current.delete(cardId);
        pendingDemandedCardIdsRef.current.set(cardId, false);
        scheduleFlush(0);
      }, OCCUPANCY_CARD_DEMAND_RELEASE_MS);
      demandedCardReleaseTimersRef.current.set(cardId, releaseTimer);
    },
    [activeDataScopeKey],
  );
  const registerMaterializedOccupancyCard = React.useCallback(
    (cardId: string) => {
      materializedCardIdsRef.current.add(cardId);
      if (viewportDemandByCardIdRef.current.get(cardId) === true) {
        registerDemandedOccupancyCard(cardId, true);
      }
    },
    [registerDemandedOccupancyCard],
  );
  React.useEffect(() => {
    activeDemandedCardIdsRef.current.clear();
    pendingDemandedCardIdsRef.current.clear();
    viewportDemandByCardIdRef.current.clear();
    demandedCardReleaseTimersRef.current.forEach((timer) =>
      window.clearTimeout(timer),
    );
    demandedCardReleaseTimersRef.current.clear();
    if (demandedCardsTimerRef.current !== null) {
      window.clearTimeout(demandedCardsTimerRef.current);
      demandedCardsTimerRef.current = null;
    }
  }, [activeDataScopeKey]);
  React.useEffect(
    () => () => {
      if (demandedCardsTimerRef.current !== null) {
        window.clearTimeout(demandedCardsTimerRef.current);
      }
      demandedCardReleaseTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      demandedCardReleaseTimersRef.current.clear();
    },
    [],
  );

  const visibleScenarios = React.useMemo(
    () =>
      canManage ? scenarios : scenarios.filter((scenario) => scenario.active),
    [canManage, scenarios],
  );
  const selectedScenario = React.useMemo(
    () =>
      visibleScenarios.find((scenario) => scenario.id === selectedId) ?? null,
    [selectedId, visibleScenarios],
  );
  const preferenceScope = React.useMemo(
    () => ({ userId, viewId: selectedId || undefined }),
    [selectedId, userId],
  );
  const dashboardSettingsScopeKey = `${companyScopeId}|${userId ?? ""}|${selectedId}`;
  const dashboardSettings =
    dashboardSettingsState.scopeKey === dashboardSettingsScopeKey
      ? dashboardSettingsState.value
      : DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS;
  const metricVisibility = dashboardSettings.metricVisibility;
  const liveRefreshMs = OCCUPANCY_REFRESH_MS;
  const demandedOccupancyCardIds =
    demandedOccupancyCards.scopeKey === activeDataScopeKey
      ? demandedOccupancyCards.ids
      : EMPTY_OCCUPANCY_CARD_IDS;
  const hasLoadedSelectedScenario =
    Boolean(selectedScenario) &&
    hasLoadedData &&
    loadedDataScopeKey === activeDataScopeKey;
  const certifiedChartData = hasLoadedSelectedScenario
    ? chartData
    : EMPTY_OCCUPANCY_CHART_DATA;
  const certifiedHistory = hasLoadedSelectedScenario ? history : null;
  const certifiedHistoryError = hasLoadedSelectedScenario ? historyError : "";
  const certifiedAlerts = hasLoadedSelectedScenario
    ? alerts
    : EMPTY_OCCUPANCY_ALERTS;
  const certifiedAlertsError = hasLoadedSelectedScenario ? alertsError : "";
  const occupancyCardIds = React.useMemo(
    () => [
      ...OCCUPANCY_METRIC_CARD_IDS,
      ...OCCUPANCY_LOITERING_CARD_IDS,
      ...OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
      ...OCCUPANCY_CHART_CARD_IDS,
      ...OCCUPANCY_COMPARISON_CARD_IDS,
      ...OCCUPANCY_DURATION_LAYOUT_CARD_IDS,
      ...OCCUPANCY_DURATION_INSIGHT_CARD_IDS,
      ...customWidgets.map((widget) => `occupancy_custom_${widget.id}`),
      ...(monitorMode || !selectedScenario ? [] : OCCUPANCY_DETAIL_CARD_IDS),
    ],
    [customWidgets, monitorMode, selectedScenario],
  );
  const occupancyPreferences = useCardPreferences(
    "occupancy",
    occupancyCardIds,
    companyScopeId,
    preferenceScope,
  );
  const occupancyPreferencesScopeKey = [
    companyScopeId ?? "",
    userId ?? "",
    selectedId,
  ].join("|");
  const occupancyPreferencesReady =
    userGridReadiness !== "pending" &&
    occupancyPreferencesReadyKey === occupancyPreferencesScopeKey;

  // useCardPreferences loads a new company/view in its own effect. Mark the
  // scope ready one effect later so data hooks never observe preferences that
  // still belong to the previous company or scenario.
  React.useEffect(() => {
    setOccupancyPreferencesReadyKey(occupancyPreferencesScopeKey);
  }, [occupancyPreferencesScopeKey]);
  const hydratedOccupancyPreferences = occupancyPreferencesReady
    ? occupancyPreferences
    : EMPTY_OCCUPANCY_PREFERENCES;
  const occupancyCardDemandKey = buildOccupancyCardDemandKey({
    eagerCardIds: OCCUPANCY_EAGER_CARD_IDS,
    materializedCardIds: demandedOccupancyCardIds,
    preferences: hydratedOccupancyPreferences,
  });
  const requestedOccupancyCardIds = React.useMemo(
    () => new Set(occupancyCardDemandKey.split("|").filter(Boolean)),
    [occupancyCardDemandKey],
  );
  const requestedOccupancyLoiteringCardIds = React.useMemo(
    () =>
      new Set(
        [...requestedOccupancyCardIds].filter((cardId) =>
          OCCUPANCY_LOITERING_NETWORK_CARD_IDS.has(cardId),
        ),
      ),
    [requestedOccupancyCardIds],
  );
  const computedOccupancyDataPlan = buildOccupancyLiveDataPlan(
    hydratedOccupancyPreferences,
    customWidgets,
    requestedOccupancyCardIds,
  );
  const occupancyDataPlan = React.useMemo(
    () => occupancyLiveDataPlanFromKey(computedOccupancyDataPlan.key),
    [computedOccupancyDataPlan.key],
  );
  React.useEffect(() => {
    // Demand may shrink while a slow aggregate is still in flight. Abort the
    // previous plan immediately so hiding its last consumer also stops its
    // transport instead of merely preventing the next polling cycle.
    liveRequestRef.current?.abort();
    secondaryRequestRef.current?.abort();
  }, [occupancyDataPlan.key]);
  const primaryOccupancyDataRequested =
    occupancyDataPlan.history ||
    occupancyDataPlan.alerts ||
    occupancyDataPlan.granularities.length > 0;
  const secondaryOccupancyQueriesEnabled =
    companyTimeZoneCertified &&
    occupancyPreferencesReady &&
    Boolean(selectedScenario) &&
    (!primaryOccupancyDataRequested || hasLoadedSelectedScenario);
  const chartClockMinute = Math.floor(clock.getTime() / MINUTE_MS) * MINUTE_MS;
  const chartDefinitions = React.useMemo(
    () =>
      buildOccupancyChartDefinitions(
        new Date(chartClockMinute),
        companyTimeZone,
      ),
    [chartClockMinute, companyTimeZone],
  );
  const focusHourlyDefinition = chartDefinitions.find(
    (definition) => definition.id === "occupancy_chart_hour",
  );
  const focusHourlyFrom = focusHourlyDefinition?.from.getTime() ?? null;
  const focusHourlyTo = focusHourlyDefinition?.to.getTime() ?? null;
  const focusHourlyRequested = occupancyDataPlan.granularities.includes("hour");
  const focusHourlyState = certifiedChartData.occupancy_chart_hour;
  const focusHourlyAggregate =
    React.useMemo<OccupancySharedHourlyAggregate | null>(
      () =>
        buildSharedFocusHourlyAggregate({
          enabled: focusHourlyRequested,
          from: focusHourlyFrom,
          name: selectedScenario?.name ?? "",
          scenarioId: selectedScenario?.id ?? "",
          state: focusHourlyState,
          timeZone: companyTimeZone,
          to: focusHourlyTo,
        }),
      [
        focusHourlyFrom,
        focusHourlyRequested,
        focusHourlyState,
        focusHourlyTo,
        selectedScenario?.id,
        selectedScenario?.name,
        companyTimeZone,
      ],
    );
  const sharedFocusSnapshot = React.useMemo(
    () =>
      selectedScenario && occupancyDataPlan.history
        ? certifiedHistoryError
          ? {
              error: certifiedHistoryError,
              name: selectedScenario.name,
              requestedAt: historyRequestedAt ?? clock,
              scenarioId: selectedScenario.id,
              total: null,
            }
          : certifiedHistory
            ? {
              asOf: certifiedHistory.as_of,
              name: selectedScenario.name,
              requestedAt: historyRequestedAt ?? clock,
              scenarioId: selectedScenario.id,
              total: certifiedHistory.total,
            }
            : null
        : null,
    [
      certifiedHistory,
      certifiedHistoryError,
      clock,
      historyRequestedAt,
      occupancyDataPlan.history,
      selectedScenario,
    ],
  );
  const focusSnapshotPending = Boolean(
    selectedScenario &&
    occupancyDataPlan.history &&
    !certifiedHistoryError &&
    !sharedFocusSnapshot,
  );
  // Prioritize the focused live scenario. Comparison and duration hooks can
  // fan out over many scenarios, so they only start after the essential live
  // resources have settled once for the active scope. If no primary widget is
  // demanded, secondary widgets start directly instead of depending on a
  // hidden snapshot. Subsequent poll cycles preserve their caches.
  const secondaryOccupancyPreferences = secondaryOccupancyQueriesEnabled
    ? hydratedOccupancyPreferences
    : EMPTY_OCCUPANCY_PREFERENCES;
  const {
    cards: occupancyComparisonCards,
    getReportAssets: getOccupancyComparisonReportAssets,
    settings: occupancyComparisonSettings,
    updateSettings: updateOccupancyComparisonSettings,
  } = useOccupancyComparisonCards({
    aggregateRefreshMs: OCCUPANCY_COMPARISON_AGGREGATE_REFRESH_MS,
    companyScopeId,
    focusScenarioId: selectedId,
    focusHourlyAggregate,
    focusSnapshot: sharedFocusSnapshot,
    focusSnapshotPending,
    monitorMode,
    preferenceScopeId: selectedId,
    preferences: secondaryOccupancyPreferences,
    requestedCardIds: requestedOccupancyCardIds,
    scenarios: visibleScenarios,
    snapshotRefreshMs: liveRefreshMs,
    timeZone: companyTimeZone,
    timeZoneWarning: companyTimeZoneResolution.warning,
    userId,
  });
  const occupancyLoitering = useOccupancyLoitering({
    companyScopeId,
    enabled: secondaryOccupancyQueriesEnabled,
    focusScenarioId: selectedScenario?.id ?? "",
    monitorMode,
    preferences: secondaryOccupancyPreferences,
    // Session summaries are a separate backend resource. A timeline or a
    // total-duration card can be rendered entirely from its aggregate and
    // must not silently start a second five-second poll.
    requestedCardIds: requestedOccupancyLoiteringCardIds,
    scenarios: visibleScenarios,
    timeZone: companyTimeZone,
    userId,
  });
  const {
    cards: occupancyDurationCards,
    dataCompleteUntil: occupancyDurationDataCompleteUntil,
    getReportAssets: getOccupancyDurationReportAssets,
    loading: occupancyDurationLoading,
    reportContext: occupancyDurationReportContext,
    reportMetrics: occupancyDurationReportMetrics,
    reportWarnings: occupancyDurationReportWarnings,
  } = useOccupancyDurationCards({
    aggregateRefreshMs: MINUTE_MS,
    companyScopeId,
    enabled: secondaryOccupancyQueriesEnabled,
    focusScenarioId: selectedScenario?.id ?? "",
    individualDwellError: occupancyLoitering.error,
    individualDwellLoading: occupancyLoitering.loading,
    individualDwellTotalsByScenarioId:
      occupancyLoitering.scenarioTotalsById,
    monitorMode,
    preferences: secondaryOccupancyPreferences,
    requestedCardIds: requestedOccupancyCardIds,
    scenarios: visibleScenarios,
    timeZone: companyTimeZone,
    timeZoneWarning: companyTimeZoneResolution.warning,
  });
  const occupancyDurationInsights = useOccupancyDurationInsights({
    companyScopeId,
    enabled: secondaryOccupancyQueriesEnabled,
    focusScenarioId: selectedScenario?.id ?? "",
    monitorMode,
    preferences: secondaryOccupancyPreferences,
    requestedCardIds: requestedOccupancyCardIds,
    scenarios: visibleScenarios,
    timeZone: companyTimeZone,
    userId,
  });
  const refreshOccupancyLoitering = occupancyLoitering.refresh;
  const loadScenarios = React.useCallback(
    async (selectId?: string) => {
      const metadataKey = JSON.stringify([
        companyScopeId,
        canManage,
        masterCrossCompanyScope,
        userId ?? "",
      ]);
      if (
        metadataRequestKeyRef.current === metadataKey ||
        metadataLoadedKeyRef.current === metadataKey
      ) {
        return;
      }
      metadataRequestControllerRef.current?.abort();
      const controller = new AbortController();
      metadataRequestControllerRef.current = controller;
      metadataRequestKeyRef.current = metadataKey;
      const requestSequence = ++metadataRequestSequenceRef.current;
      setLoadingScenarios(true);
      setMetadataError("");
      try {
        const response = await fetchSharedOccupancyQuery<unknown>({
          companyScopeId,
          path: "/occupancy/scenarios",
          priority: "foreground",
          scenarioId: "__catalog__",
          signal: controller.signal,
          timeZone: "",
        });
        const nextScenarios = filterScopedApiRows(
          requireOccupancyScenarioRows(
            masterCrossCompanyScope
              ? selectExplicitCompanyScopedRows(response, companyScopeId, {
                  collectionKeys: ["data"],
                  label: "cenários de ocupação",
                }).rows
              : response,
            companyScopeId,
          ),
          companyScopeId,
        );

        if (
          controller.signal.aborted ||
          requestSequence !== metadataRequestSequenceRef.current ||
          metadataRequestKeyRef.current !== metadataKey
        ) {
          return;
        }
        setMetadataError("");
        setScenarios(nextScenarios);
        const selectable = canManage
          ? nextScenarios
          : nextScenarios.filter((scenario) => scenario.active);
        const resolvedFocus = resolveDashboardFocus({
          availableModes: ["scenario" as const],
          current: {
            scopeMode: "scenario" as const,
            selectedId: selectId || focusRef.current.selectedId,
          },
          getOptions: () =>
            selectable.map((scenario) => ({
              active: scenario.active,
              id: scenario.id,
              mode: "scenario" as const,
            })),
          stored: loadDashboardFocus<"scenario">(
            companyScopeId,
            userId,
            "occupancy-live",
          ),
        });
        const nextFocus = resolvedFocus ?? {
          scopeMode: "scenario" as const,
          selectedId: "",
        };
        focusRef.current = nextFocus;
        setSelectedId(nextFocus.selectedId);
        metadataLoadedKeyRef.current = metadataKey;
      } catch (error) {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          requestSequence !== metadataRequestSequenceRef.current ||
          metadataRequestKeyRef.current !== metadataKey
        ) {
          return;
        }
        metadataLoadedKeyRef.current = "";
        const message = occupancyDashboardErrorMessage(
          error,
          "Não foi possível carregar os cenários de ocupação.",
        );
        setScenarios([]);
        setSelectedId("");
        chartDataRef.current = {};
        setChartData({});
        setHistory(null);
        setHistoryRequestedAt(null);
        setHistoryError("");
        setAlerts([]);
        setAlertsError("");
        setMetadataError(message);
      } finally {
        if (
          requestSequence === metadataRequestSequenceRef.current &&
          metadataRequestKeyRef.current === metadataKey
        ) {
          metadataRequestKeyRef.current = "";
          if (metadataRequestControllerRef.current === controller) {
            metadataRequestControllerRef.current = null;
          }
          setLoadingScenarios(false);
        }
      }
    },
    [canManage, companyScopeId, masterCrossCompanyScope, userId],
  );

  const loadScenarioData = React.useCallback(
    async (
      scenario: OccupancyScenario,
      {
        force = false,
        resourceGroup = "all",
        silent = false,
      }: LoadOptions = {},
    ) => {
      if (!occupancyPreferencesReady) return;

      const requestedScopeKey = occupancyDataScopeKey(
        companyScopeId,
        scenario.id,
        companyTimeZone,
      );
      if (
        !companyScopeId ||
        scenario.company_id !== companyScopeId ||
        activeDataScopeKeyRef.current !== requestedScopeKey
      ) {
        return;
      }

      const now = new Date();
      // Freshness is measured from the start of the request. Measuring from
      // completion makes a one-second API response only four seconds old at
      // the next five-second pulse, which skips that pulse and turns the live
      // cadence into roughly ten seconds.
      const requestStartedAt = now.getTime();
      const ownsLiveLane = resourceGroup === "live-pulse";
      const activeRequestRef = ownsLiveLane
        ? liveRequestRef
        : secondaryRequestRef;
      const activeRunningRef = ownsLiveLane
        ? liveRunningRef
        : secondaryRunningRef;
      const definitions = buildOccupancyChartDefinitions(now, companyTimeZone);
      const freshness =
        dataFreshnessRef.current.scopeKey === requestedScopeKey
          ? dataFreshnessRef.current
          : emptyOccupancyLiveDataFreshness(requestedScopeKey);
      const dueHistory =
        resourceGroup !== "secondary" &&
        occupancyDataPlan.history &&
        occupancyLiveRetryReady(
          freshness.retries?.history,
          now.getTime(),
          force,
        ) &&
        occupancyLiveResourceIsDue(
          freshness.historyAt,
          OCCUPANCY_REFRESH_MS,
          now,
          force,
        );
      const dueAlerts =
        resourceGroup !== "secondary" &&
        occupancyDataPlan.alerts &&
        occupancyLiveRetryReady(
          freshness.retries?.alerts,
          now.getTime(),
          force,
        ) &&
        occupancyLiveResourceIsDue(
          freshness.alertsAt,
          OCCUPANCY_ALERTS_REFRESH_MS,
          now,
          force,
        );
      const requestedGranularities = new Set(occupancyDataPlan.granularities);
      const dueDefinitions = definitions.filter((definition) => {
        if (resourceGroup === "live-pulse") return false;
        if (!requestedGranularities.has(definition.granularity)) return false;
        const forceMutableEdge =
          force &&
          occupancyLiveManualRefreshGranularity(definition.granularity);
        const liveMutableEdge =
          definition.granularity === "minute" ||
          definition.granularity === "hour";
        if (
          !liveMutableEdge &&
          !occupancyLiveRetryReady(
            freshness.retries?.[definition.granularity],
            now.getTime(),
            forceMutableEdge,
          )
        )
          return false;
        const windowKey = occupancyChartDefinitionWindowKey(definition);
        return (
          forceMutableEdge ||
          freshness.chartWindowKeys[definition.granularity] !== windowKey ||
          occupancyLiveResourceIsDue(
            freshness.chartAt[definition.granularity] ?? 0,
            OCCUPANCY_CHART_REFRESH_MS[definition.granularity],
            now,
          )
        );
      });
      const dueChartPlans = dueDefinitions.map((definition) => {
        const previousState = chartDataRef.current[definition.id];
        const previousMutableBucketStart =
          freshness.chartMutableBucketStarts[definition.granularity];
        const coldLoad =
          !previousState || previousMutableBucketStart === undefined;
        const scheduledAudit =
          !coldLoad &&
          occupancyLiveResourceIsDue(
            freshness.chartAuditAt[definition.granularity] ?? 0,
            OCCUPANCY_CHART_FULL_AUDIT_MS,
            now,
          );
        return {
          ...buildOccupancyChartQueryPlan(
            definition,
            previousMutableBucketStart,
            coldLoad || scheduledAudit,
          ),
          bypassUnitCache: scheduledAudit,
          previousState,
        };
      });

      if (!dueHistory && !dueAlerts && dueDefinitions.length === 0) {
        if (force) activeRequestRef.current?.abort();
        if (
          resourceGroup !== "live-pulse" &&
          !hasLoadedDataRef.current
        ) {
          hasLoadedDataRef.current = true;
          loadedDataScopeKeyRef.current = requestedScopeKey;
          setHasLoadedData(true);
          setLoadedDataScopeKey(requestedScopeKey);
        }
        return;
      }

      if (activeRunningRef.current) {
        // A superseded request can still be settling its aborted promise.
        // The newly selected scenario/plan must start immediately; the old
        // finally block is already guarded by the controller identity.
        const supersededSecondaryPlan =
          !ownsLiveLane &&
          secondaryPlanKeyRef.current !== occupancyDataPlan.key;
        if (
          !force &&
          !supersededSecondaryPlan &&
          !activeRequestRef.current?.signal.aborted
        )
          return;
        activeRequestRef.current?.abort();
      }

      const controller = new AbortController();
      const scheduleQuery = createOccupancyQueryScheduler(controller.signal);
      activeRequestRef.current = controller;
      activeRunningRef.current = true;
      if (!ownsLiveLane) secondaryPlanKeyRef.current = occupancyDataPlan.key;

      const sameScenarioLoaded =
        hasLoadedDataRef.current &&
        loadedDataScopeKeyRef.current === requestedScopeKey;
      const silentLoad =
        sameScenarioLoaded && (silent || hasLoadedDataRef.current);
      // Automatic pulses keep the current UI interactive and do not toggle a
      // page-wide spinner every five seconds. Only an explicit refresh does.
      if (ownsLiveLane && silentLoad && force) setRefreshing(true);
      else if (ownsLiveLane && !sameScenarioLoaded) setLoadingData(true);

      const dueGranularities = new Set(
        dueDefinitions.map((definition) => definition.granularity),
      );
      const definitionsWindowKey =
        occupancyChartDefinitionsWindowKey(dueDefinitions);
      const isCurrentRequest = () =>
        !controller.signal.aborted &&
        activeRequestRef.current === controller &&
        activeDataScopeKeyRef.current === requestedScopeKey &&
        definitionsWindowKey ===
          occupancyChartDefinitionsWindowKey(
            buildOccupancyChartDefinitions(
              new Date(),
              companyTimeZone,
            ).filter((definition) =>
              dueGranularities.has(definition.granularity),
            ),
          );
      const publishChartState = (
        id: OccupancyChartDefinition["id"],
        state: OccupancyChartState,
      ) => {
        if (!isCurrentRequest()) return;
        const current = chartDataRef.current;
        if (current[id] === state) return;
        const next = { ...current, [id]: state };
        chartDataRef.current = next;
        setChartData(next);
      };

      try {
        requireCertifiedOccupancyCompanyTimeZone(
          certifiedCompanyTimeZoneResolution,
        );
        const [historyResult, alertResult, chartEntries] = await Promise.all([
          dueHistory
            ? loadFocusedLiveSnapshot({
                companyScopeId,
                force,
                requestedAt: now,
                scenario,
                signal: controller.signal,
                timeZone: companyTimeZone,
              })
                .then((data) => ({
                  data,
                  error: "",
                  requested: true as const,
                  succeeded: true as const,
                }))
                .catch((error) => {
                  if (isAbortError(error)) throw error;
                  return {
                    data: null,
                    error: occupancyDashboardErrorMessage(
                      error,
                      "A leitura atual não está disponível.",
                    ),
                    requested: true as const,
                    succeeded: false as const,
                  };
                })
            : Promise.resolve({
                data: null,
                error: "",
                requested: false as const,
                succeeded: false as const,
              }),
          dueAlerts
            ? fetchSharedOccupancyQuery<unknown>({
                bypassCache: force,
                companyScopeId,
                path: `/occupancy/scenarios/${encodeURIComponent(scenario.id)}/alerts?limit=12`,
                priority: "foreground",
                scenarioId: scenario.id,
                signal: controller.signal,
                timeZone: companyTimeZone,
              })
                .then((response) => ({
                  data: requireOccupancyAlertRows(
                    response,
                    scenario.id,
                    scenario.object_class,
                  ),
                  error: "",
                  requested: true as const,
                  succeeded: true as const,
                }))
                .catch((error) => {
                  if (isAbortError(error)) throw error;
                  return {
                    data: [] as OccupancyAlertRow[],
                    error: occupancyDashboardErrorMessage(
                      error,
                      "Não foi possível carregar os alertas recentes.",
                    ),
                    requested: true as const,
                    succeeded: false as const,
                  };
                })
            : Promise.resolve({
                data: [] as OccupancyAlertRow[],
                error: "",
                requested: false as const,
                succeeded: false as const,
              }),
          Promise.all(
            dueChartPlans.map(async (plan) => {
              const { definition, queryDefinition } = plan;
              try {
                const fetchResponse = (path: string) =>
                  scheduleQuery(path, () =>
                    fetchSharedOccupancyQuery<OccupancyScenarioAggregateResponse>({
                      bypassCache: force,
                      // The mutable edge must reach the backend on every live
                      // pulse. The shared broker still coalesces an identical
                      // in-flight request, while closed/civil buckets retain
                      // their longer cache.
                      cacheTtlMs:
                        definition.granularity === "minute" ||
                        definition.granularity === "hour"
                          ? 0
                          : OCCUPANCY_CHART_REFRESH_MS[
                              definition.granularity
                            ],
                      companyScopeId,
                      path,
                      priority:
                        definition.granularity === "minute" ||
                        definition.granularity === "hour"
                          ? "normal"
                          : "background",
                      scenarioId: scenario.id,
                      signal: controller.signal,
                      timeZone: companyTimeZone,
                    }),
                  );
                const response =
                  definition.granularity === "minute" ||
                  definition.granularity === "hour"
                    ? await fetchResponse(
                        occupancyScenarioAggregatePath(
                          scenario.id,
                          queryDefinition,
                        ),
                      )
                    : await fetchOccupancyCivilAggregate({
                        capabilities: civilAggregateCapabilities,
                        bypassUnitCache: plan.bypassUnitCache,
                        companyScopeId,
                        fetchResponse,
                        from: queryDefinition.from,
                        granularity: definition.granularity,
                        openBucket: listBucketStarts(queryDefinition).at(-1),
                        requestedAt: now,
                        scenarioId: scenario.id,
                        signal: controller.signal,
                        timeZone: companyTimeZone,
                        to: queryDefinition.to,
                        unitCache: civilAggregateUnitCacheRef.current,
                      });
                const rows = requireOccupancyAggregateRows(
                  response,
                  definition.granularity,
                  scenario.id,
                  companyTimeZone,
                  {
                    allowDocumentedAggregateResponse: true,
                    allowVerifiedCivilAggregateResponse:
                      definition.granularity !== "minute" &&
                      definition.granularity !== "hour",
                    openBucket: listBucketStarts(queryDefinition).at(-1),
                    requestedAt: now,
                    requireCertification: true,
                  },
                );
                const mergedRows = plan.fullAudit
                  ? rows
                  : mergeOccupancyChartRows(
                      definition,
                      queryDefinition,
                      plan.previousState?.rows ?? [],
                      rows,
                    );
                const state: OccupancyChartState = buildOccupancyChartState(
                  definition,
                  mergedRows,
                  joinOccupancyWarnings(
                    occupancyAggregateMetadataWarning(
                      response,
                      definition.granularity,
                    ),
                    certifiedCompanyTimeZoneResolution.warning,
                  ),
                );
                // Preserve progressive first paint. Warm polling is merged
                // once after all requested granularities settle.
                if (!sameScenarioLoaded) {
                  publishChartState(definition.id, state);
                }

                return {
                  definition,
                  fullAudit: plan.fullAudit,
                  id: definition.id,
                  mutableBucketStart: plan.mutableBucketStart,
                  state,
                  succeeded: true,
                } as const;
              } catch (error) {
                if (isAbortError(error)) throw error;
                const state: OccupancyChartState = {
                  rows: [],
                  points: buildEmptyOccupancyPoints(definition),
                  error: occupancyDashboardErrorMessage(
                    error,
                    "Não foi possível carregar este período.",
                  ),
                };
                if (!plan.previousState && !sameScenarioLoaded) {
                  publishChartState(definition.id, state);
                }

                return {
                  definition,
                  fullAudit: plan.fullAudit,
                  id: definition.id,
                  mutableBucketStart: plan.mutableBucketStart,
                  state,
                  succeeded: false,
                } as const;
              }
            }),
          ),
        ]);

        if (!isCurrentRequest()) return;
        if (sameScenarioLoaded && chartEntries.length > 0) {
          const current = chartDataRef.current;
          let next = current;
          chartEntries.forEach((entry) => {
            if (!entry.succeeded && current[entry.id]) return;
            if (next === current) next = { ...current };
            next[entry.id] = entry.state;
          });
          if (next !== current) {
            chartDataRef.current = next;
            setChartData(next);
          }
        }
        if (historyResult.requested) {
          if (historyResult.succeeded) {
            setHistory(historyResult.data);
            setHistoryRequestedAt(new Date(requestStartedAt));
            setHistoryError("");
          } else {
            setHistoryError(historyResult.error);
          }
        }
        if (alertResult.requested) {
          if (alertResult.succeeded) {
            setAlerts(alertResult.data);
            setAlertsLoadedScopeKey(requestedScopeKey);
          }
          setAlertsError(alertResult.error);
        }
        const completedAt = Date.now();
        const latestFreshness =
          dataFreshnessRef.current.scopeKey === requestedScopeKey
            ? dataFreshnessRef.current
            : emptyOccupancyLiveDataFreshness(requestedScopeKey);
        const nextFreshness: OccupancyLiveDataFreshness = {
          ...latestFreshness,
          retries: { ...latestFreshness.retries },
          alertsAt: alertResult.succeeded
            ? requestStartedAt
            : latestFreshness.alertsAt,
          chartAuditAt: { ...latestFreshness.chartAuditAt },
          chartAt: { ...latestFreshness.chartAt },
          chartMutableBucketStarts: {
            ...latestFreshness.chartMutableBucketStarts,
          },
          chartWindowKeys: { ...latestFreshness.chartWindowKeys },
          historyAt: historyResult.succeeded
            ? requestStartedAt
            : latestFreshness.historyAt,
          scopeKey: requestedScopeKey,
        };
        if (historyResult.requested) {
          nextFreshness.retries!.history = nextOccupancyLiveRetry(
            latestFreshness.retries?.history,
            historyResult.succeeded,
            completedAt,
          );
        }
        if (alertResult.requested) {
          nextFreshness.retries!.alerts = nextOccupancyLiveRetry(
            latestFreshness.retries?.alerts,
            alertResult.succeeded,
            completedAt,
          );
        }
        chartEntries.forEach((entry) => {
          nextFreshness.retries![entry.definition.granularity] =
            nextOccupancyLiveRetry(
              latestFreshness.retries?.[entry.definition.granularity],
              entry.succeeded,
              completedAt,
            );
          if (!entry.succeeded) return;
          if (entry.fullAudit) {
            nextFreshness.chartAuditAt[entry.definition.granularity] =
              requestStartedAt;
          }
          nextFreshness.chartAt[entry.definition.granularity] =
            requestStartedAt;
          nextFreshness.chartMutableBucketStarts[
            entry.definition.granularity
          ] = entry.mutableBucketStart;
          nextFreshness.chartWindowKeys[entry.definition.granularity] =
            occupancyChartDefinitionWindowKey(entry.definition);
        });
        dataFreshnessRef.current = nextFreshness;
        if (ownsLiveLane) {
          setDataLoadError("");
        }
        setClock((current) =>
          current.getTime() >= now.getTime() ? current : now,
        );
        if (
          (ownsLiveLane &&
            (historyResult.succeeded || alertResult.succeeded)) ||
          (resourceGroup !== "live-pulse" &&
            chartEntries.some((entry) => entry.succeeded))
        ) {
          setLastUpdated(new Date(completedAt));
        }
        setHasLoadedData(true);
        hasLoadedDataRef.current = true;
        loadedDataScopeKeyRef.current = requestedScopeKey;
        setLoadedDataScopeKey(requestedScopeKey);
      } catch (error) {
        if (!isAbortError(error) && isCurrentRequest()) {
          const failedAt = Date.now();
          const latestFreshness =
            dataFreshnessRef.current.scopeKey === requestedScopeKey
              ? dataFreshnessRef.current
              : emptyOccupancyLiveDataFreshness(requestedScopeKey);
          const retries = { ...latestFreshness.retries };
          for (const key of [
            ...(dueHistory ? ["history" as const] : []),
            ...(dueAlerts ? ["alerts" as const] : []),
            ...dueDefinitions.map((definition) => definition.granularity),
          ]) {
            retries[key] = nextOccupancyLiveRetry(
              retries[key],
              false,
              failedAt,
            );
          }
          dataFreshnessRef.current = { ...latestFreshness, retries };
          const message = occupancyDashboardErrorMessage(
            error,
            "Não foi possível carregar a ocupação.",
          );
          if (ownsLiveLane) setDataLoadError(message);
        }
      } finally {
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
          activeRunningRef.current = false;
          if (!ownsLiveLane) secondaryPlanKeyRef.current = "";
          if (ownsLiveLane) {
            setLoadingData(false);
            setRefreshing(false);
          }
        }
      }
    },
    [
      companyScopeId,
      companyTimeZone,
      certifiedCompanyTimeZoneResolution,
      civilAggregateCapabilities,
      occupancyDataPlan,
      occupancyPreferencesReady,
    ],
  );

  const loadScenarioCycle = React.useCallback(
    async (scenario: OccupancyScenario, { silent = false }: LoadOptions = {}) => {
      // The broker reserves capacity for foreground work, so historical
      // widgets can start immediately without delaying the live pulse. Await
      // only the lightweight snapshot: slow civil reconstruction stays in the
      // background and no longer adds its latency to the visible update.
      const livePulse = loadScenarioData(scenario, {
        resourceGroup: "live-pulse",
        silent,
      });
      void loadScenarioData(scenario, {
        resourceGroup: "secondary",
        silent: true,
      });
      await livePulse;
    },
    [loadScenarioData],
  );

  const refreshOccupancyDashboard = React.useCallback(async () => {
    refreshOccupancyLoitering();
    if (metadataError) {
      metadataLoadedKeyRef.current = "";
      await loadScenarios(selectedScenario?.id);
    } else if (selectedScenario) {
      await loadScenarioData(selectedScenario, {
        force: true,
        resourceGroup: "live-pulse",
      });
    }
  }, [
    loadScenarios,
    loadScenarioData,
    metadataError,
    refreshOccupancyLoitering,
    selectedScenario,
  ]);

  const retryOccupancyData = React.useCallback(() => {
    void refreshOccupancyDashboard();
  }, [refreshOccupancyDashboard]);

  const updateDashboardSettings = React.useCallback(
    (
      patch:
        | Partial<OccupancyDashboardSettings>
        | ((
            current: OccupancyDashboardSettings,
          ) => Partial<OccupancyDashboardSettings>),
    ) => {
      if (!canEditVisual) return;
      const base =
        dashboardSettingsState.scopeKey === dashboardSettingsScopeKey
          ? dashboardSettingsState.value
          : loadOccupancyDashboardSettings(companyScopeId, userId, selectedId);
      const resolvedPatch = typeof patch === "function" ? patch(base) : patch;
      try {
        const value = saveOccupancyDashboardSettings(
          { ...base, ...resolvedPatch, schemaVersion: 2 },
          companyScopeId,
          userId,
          selectedId,
        );
        setDashboardSettingsState((current) =>
          current.scopeKey === dashboardSettingsScopeKey &&
          current.value.metricVisibility.average ===
            value.metricVisibility.average &&
          current.value.metricVisibility.minimum ===
            value.metricVisibility.minimum &&
          current.value.metricVisibility.peak === value.metricVisibility.peak
            ? current
            : { scopeKey: dashboardSettingsScopeKey, value },
        );
      } catch {
        toast.error(
          "Não foi possível salvar as configurações de ocupação agora.",
        );
      }
    },
    [
      canEditVisual,
      companyScopeId,
      dashboardSettingsScopeKey,
      dashboardSettingsState,
      selectedId,
      userId,
    ],
  );

  React.useEffect(() => {
    focusRef.current = { scopeMode: "scenario", selectedId };
  }, [selectedId]);

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  React.useEffect(() => {
    activeDataScopeKeyRef.current = activeDataScopeKey;
    liveRequestRef.current?.abort();
    secondaryRequestRef.current?.abort();

    if (loadedDataScopeKeyRef.current !== activeDataScopeKey) {
      setAlertsLoadedScopeKey("");
      dataFreshnessRef.current =
        emptyOccupancyLiveDataFreshness(activeDataScopeKey);
      loadedDataScopeKeyRef.current = "";
      hasLoadedDataRef.current = false;
      setLoadedDataScopeKey("");
      setHasLoadedData(false);
      chartDataRef.current = {};
      civilAggregateUnitCacheRef.current.clear();
      setChartData({});
      setHistory(null);
      setHistoryRequestedAt(null);
      setHistoryError("");
      setAlerts([]);
      setAlertsError("");
      setDataLoadError("");
      setLastUpdated(null);
    }
  }, [activeDataScopeKey]);

  React.useEffect(() => {
    liveRequestRef.current?.abort();
    secondaryRequestRef.current?.abort();
    dataFreshnessRef.current = emptyOccupancyLiveDataFreshness("");
    setMetadataError("");
    setDataLoadError("");
    setScenarios([]);
    focusRef.current = { scopeMode: "scenario", selectedId: "" };
    setSelectedId("");
    chartDataRef.current = {};
    civilAggregateUnitCacheRef.current.clear();
    setChartData({});
    setHistory(null);
    setHistoryRequestedAt(null);
    setHistoryError("");
    setAlerts([]);
    setAlertsError("");
    setHasLoadedData(false);
    hasLoadedDataRef.current = false;
    setLoadedDataScopeKey("");
    loadedDataScopeKeyRef.current = "";
  }, [companyScopeId]);

  React.useEffect(() => {
    if (
      !selectedScenario ||
      (selectedScenario.company_id &&
        selectedScenario.company_id !== companyScopeId)
    ) {
      return;
    }
    saveDashboardFocus(
      { scopeMode: "scenario", selectedId: selectedScenario.id },
      companyScopeId,
      userId,
      "occupancy-live",
    );
  }, [companyScopeId, selectedScenario, userId]);

  React.useEffect(() => {
    function synchronizeDashboardSettings(event?: Event) {
      if (
        event instanceof CustomEvent &&
        event.type === OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT
      ) {
        const detail = event.detail as
          | {
              companyId?: string | null;
              userId?: string | null;
              viewId?: string | null;
            }
          | undefined;
        if (detail?.companyId != null && detail.companyId !== companyScopeId) {
          return;
        }
        if (detail?.userId != null && detail.userId !== userId) return;
        if (detail?.viewId != null && detail.viewId !== selectedId) return;
      }
      const value = loadOccupancyDashboardSettings(
        companyScopeId,
        userId,
        selectedId,
      );
      setDashboardSettingsState((current) =>
        current.scopeKey === dashboardSettingsScopeKey &&
        current.value.metricVisibility.average ===
          value.metricVisibility.average &&
        current.value.metricVisibility.minimum ===
          value.metricVisibility.minimum &&
        current.value.metricVisibility.peak === value.metricVisibility.peak
          ? current
          : { scopeKey: dashboardSettingsScopeKey, value },
      );
    }

    synchronizeDashboardSettings();
    window.addEventListener("storage", synchronizeDashboardSettings);
    window.addEventListener(
      OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT,
      synchronizeDashboardSettings,
    );
    return () => {
      window.removeEventListener("storage", synchronizeDashboardSettings);
      window.removeEventListener(
        OCCUPANCY_DASHBOARD_SETTINGS_UPDATED_EVENT,
        synchronizeDashboardSettings,
      );
    };
  }, [companyScopeId, dashboardSettingsScopeKey, selectedId, userId]);

  React.useEffect(() => {
    function synchronizeCustomWidgets(event?: Event) {
      if (
        event instanceof CustomEvent &&
        event.type === OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT
      ) {
        const detail = event.detail as
          | {
              companyId?: string | null;
              userId?: string | null;
              viewId?: string | null;
            }
          | undefined;
        if (detail?.companyId != null && detail.companyId !== companyScopeId) {
          return;
        }
        if (
          detail?.userId != null &&
          detail.userId !== preferenceScope.userId
        ) {
          return;
        }
        if (
          detail?.viewId != null &&
          detail.viewId !== preferenceScope.viewId
        ) {
          return;
        }
      }
      const next = selectedId
        ? loadOccupancyCustomWidgets(companyScopeId, preferenceScope)
        : [];
      setCustomWidgets((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    }

    synchronizeCustomWidgets();
    window.addEventListener("storage", synchronizeCustomWidgets);
    window.addEventListener(
      OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
      synchronizeCustomWidgets,
    );
    return () => {
      window.removeEventListener("storage", synchronizeCustomWidgets);
      window.removeEventListener(
        OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
        synchronizeCustomWidgets,
      );
    };
  }, [companyScopeId, preferenceScope, selectedId]);

  React.useEffect(() => {
    if (!occupancyPreferencesReady) return;
    if (!selectedScenario) {
      setDataLoadError("");
      chartDataRef.current = {};
      setChartData({});
      setHistory(null);
      setHistoryRequestedAt(null);
      setHistoryError("");
      setAlerts([]);
      setAlertsError("");
      return;
    }

    void loadScenarioCycle(selectedScenario);
  }, [loadScenarioCycle, occupancyPreferencesReady, selectedScenario]);

  React.useEffect(() => {
    if (
      !occupancyPreferencesReady ||
      !selectedScenario ||
      (!occupancyDataPlan.history &&
        !occupancyDataPlan.alerts &&
        occupancyDataPlan.granularities.length === 0)
    )
      return;

    let disposed = false;
    let timeout: number | undefined;
    let refreshRunning = false;

    function scheduleNextRefresh(delayMs = occupancyTemporalRefreshDelay(liveRefreshMs)) {
      if (disposed) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = undefined;
        void refreshWhenVisible();
      }, delayMs);
    }

    async function refreshWhenVisible() {
      if (disposed || refreshRunning) return;
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false ||
        !selectedScenario
      ) {
        scheduleNextRefresh();
        return;
      }

      refreshRunning = true;
      const startedAt = Date.now();
      try {
        await loadScenarioCycle(selectedScenario, { silent: true });
      } finally {
        refreshRunning = false;
        const nextDelay = Math.max(
          250,
          occupancyTemporalRefreshDelay(liveRefreshMs) -
            (Date.now() - startedAt),
        );
        scheduleNextRefresh(nextDelay);
      }
    }

    scheduleNextRefresh();

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = undefined;
      void refreshWhenVisible();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
    };
  }, [
    liveRefreshMs,
    loadScenarioCycle,
    occupancyDataPlan,
    occupancyPreferencesReady,
    selectedScenario,
  ]);

  const initialLoading =
    Boolean(selectedScenario) && !hasLoadedSelectedScenario
      ? true
      : (loadingScenarios || loadingData) && !hasLoadedSelectedScenario;
  const currentTotal = certifiedHistoryError
    ? null
    : (certifiedHistory?.total ?? null);
  const activeAreas = React.useMemo(
    () =>
      certifiedHistoryError
        ? null
        : (certifiedHistory?.areas?.filter((area) => area.value > 0).length ??
          null),
    [certifiedHistory?.areas, certifiedHistoryError],
  );
  const todayMetric = React.useMemo(
    () =>
      latestOccupancyMetric(
        certifiedChartData.occupancy_chart_day?.points ?? [],
      ),
    [certifiedChartData.occupancy_chart_day?.points],
  );
  // Falhas de uma série agregada ficam no próprio widget. O catálogo e o
  // snapshot ao vivo continuam válidos e não devem derrubar todo o módulo.
  const occupancyCertificationError = metadataError || dataLoadError;
  const hasIncompleteOccupancyCoverage =
    occupancyDataPlan.granularities.some((granularity) => {
      const state = certifiedChartData[`occupancy_chart_${granularity}`];
      return !state || Boolean(state.error || state.incomplete);
    }) ||
    Boolean(
      (occupancyDataPlan.history &&
        (!certifiedHistory || certifiedHistoryError)) ||
      (occupancyDataPlan.alerts &&
        (alertsLoadedScopeKey !== activeDataScopeKey || certifiedAlertsError)),
    );
  const thresholdStatus = React.useMemo(
    () =>
      selectedScenario && currentTotal !== null
        ? occupancyThresholdStatus(currentTotal, selectedScenario)
        : null,
    [currentTotal, selectedScenario],
  );
  const configuredCapacity = selectedScenario
    ? (occupancyComparisonSettings.capacities[selectedScenario.id] ?? null)
    : null;
  const utilization =
    currentTotal !== null &&
    configuredCapacity !== null &&
    configuredCapacity > 0
      ? (currentTotal / configuredCapacity) * 100
      : null;

  const openCustomWidgetDialog = React.useCallback(() => {
    setCustomWidgetForm({
      ...DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
      series: { ...DEFAULT_OCCUPANCY_TREND_SERIES },
    });
    setCustomWidgetDialogOpen(true);
  }, []);

  const openCustomWidgetEditor = React.useCallback(
    (widget: OccupancyCustomWidget) => {
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
    },
    [],
  );

  function saveCustomWidget() {
    if (!selectedId) {
      toast.error("Selecione um cenário antes de adicionar um widget.");
      return;
    }
    const title =
      customWidgetForm.title.trim() ||
      (customWidgetForm.kind === "metric"
        ? occupancyCustomMetricLabel(customWidgetForm.metric)
        : `Tendência ${occupancyGranularityLabel(customWidgetForm.granularity)}`);
    try {
      const next = upsertOccupancyCustomWidget(
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
        preferenceScope,
      );
      setCustomWidgets((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
      setCustomWidgetDialogOpen(false);
      toast.success(
        customWidgetForm.id
          ? "Widget atualizado."
          : "Widget adicionado à Ocupação.",
      );
    } catch (error) {
      toast.error(
        occupancyDashboardErrorMessage(
          error,
          "Não foi possível salvar o widget.",
        ),
      );
    }
  }

  const removeCustomWidget = React.useCallback(
    (widgetId: string) => {
      try {
        const next = deleteOccupancyCustomWidget(
          widgetId,
          companyScopeId,
          preferenceScope,
        );
        setCustomWidgets((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next,
        );
        toast.success("Widget removido.");
      } catch {
        toast.error("Não foi possível remover o widget.");
      }
    },
    [companyScopeId, preferenceScope],
  );

  const metricCards = React.useMemo(
    () =>
      [
        {
          id: "occupancy_current_total",
          label: "Última leitura",
          defaultSize: "compact" as const,
          titleEditable: true,
          node: (
            <MetricCard
              icon={UsersRound}
              label="Última leitura"
              value={currentTotal}
              loading={initialLoading}
              tone={thresholdStatus?.tone ?? "primary"}
              description={
                certifiedHistoryError
                  ? "dados temporariamente indisponíveis"
                  : certifiedHistory?.as_of
                    ? `Atualizado em ${formatDateTime(certifiedHistory.as_of, companyTimeZone)}`
                    : (selectedScenario?.name ?? "Cenário obrigatório")
              }
            />
          ),
        },
        {
          id: "occupancy_average",
          label: "Média hoje",
          defaultSize: "compact" as const,
          titleEditable: true,
          node: (
            <MetricCard
              icon={Gauge}
              label="Média hoje"
              value={todayMetric.average}
              loading={initialLoading}
              tone="average"
              description="cenário selecionado"
            />
          ),
        },
        {
          id: "occupancy_minimum",
          label: "Mínimo hoje",
          defaultSize: "compact" as const,
          titleEditable: true,
          node: (
            <MetricCard
              icon={Activity}
              label="Mínimo hoje"
              value={todayMetric.minimum}
              loading={initialLoading}
              tone="minimum"
              description="menor total observado"
            />
          ),
        },
        {
          id: "occupancy_peak",
          label: "Máximo hoje",
          defaultSize: "compact" as const,
          titleEditable: true,
          node: (
            <MetricCard
              icon={BarChart3}
              label="Máximo hoje"
              value={todayMetric.peak}
              loading={initialLoading}
              tone="maximum"
              description="maior total observado"
            />
          ),
        },
        {
          id: "occupancy_alerts",
          label: "Alertas recentes",
          defaultSize: "compact" as const,
          titleEditable: true,
          node: (
            <MetricCard
              icon={Bell}
              label="Alertas recentes"
              value={certifiedAlertsError ? null : certifiedAlerts.length}
              loading={initialLoading}
              tone={certifiedAlerts.length ? "warning" : "slate"}
              description={
                certifiedAlertsError
                  ? "dados temporariamente indisponíveis"
                  : thresholdStatus?.label
                    ? `${thresholdStatus.label} · até 12 registros`
                    : "até 12 registros dos limites do cenário"
              }
            />
          ),
        },
        {
          id: "occupancy_active_areas",
          label: "Áreas ocupadas",
          defaultSize: "compact" as const,
          titleEditable: true,
          node: (
            <MetricCard
              icon={MapPinned}
              label="Áreas ocupadas"
              value={activeAreas}
              loading={initialLoading}
              tone="slate"
              description={`${formatNumber(selectedScenario?.areas?.length ?? 0)} monitoradas`}
            />
          ),
        },
      ].map((card) => ({
        ...card,
        ...COMPACT_METRIC_LAYOUT_DEFAULTS,
      })),
    [
      activeAreas,
      certifiedAlerts,
      certifiedAlertsError,
      certifiedHistory,
      certifiedHistoryError,
      companyTimeZone,
      currentTotal,
      initialLoading,
      selectedScenario,
      thresholdStatus,
      todayMetric,
    ],
  );

  const chartCards = React.useMemo(
    () =>
      chartDefinitions.map((definition) => ({
        chartTypeEnabled: true,
        id: definition.id,
        label: definition.label,
        defaultHeightLevel: 4 as const,
        defaultSize: "wide" as const,
        className: "sm:col-span-2 xl:col-span-2",
        titleEditable: true,
        zoomEnabled: true,
        node: selectedScenario ? (
          <OccupancyChartCard
            definition={definition}
            loading={initialLoading || !certifiedChartData[definition.id]}
            metricVisibility={metricVisibility}
            scenario={selectedScenario}
            state={certifiedChartData[definition.id]}
          />
        ) : (
          <EmptyOccupancyCard title={definition.label} />
        ),
      })),
    [
      certifiedChartData,
      chartDefinitions,
      initialLoading,
      metricVisibility,
      selectedScenario,
    ],
  );

  const customWidgetCards = React.useMemo(() => {
    const definitionByGranularity = new Map(
      chartDefinitions.map((definition) => [
        definition.granularity,
        definition,
      ]),
    );

    return customWidgets.map((widget) => {
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

      if (widget.kind === "metric") {
        const presentation = occupancyCustomMetricPresentation(widget.metric, {
          activeAreas,
          alertCount: certifiedAlertsError ? null : certifiedAlerts.length,
          current: currentTotal,
          average: todayMetric.average,
          minimum: todayMetric.minimum,
          peak: todayMetric.peak,
          utilization,
        });
        return {
          ...COMPACT_METRIC_LAYOUT_DEFAULTS,
          configurationContent,
          id: `occupancy_custom_${widget.id}`,
          label: widget.title,
          titleEditable: true,
          node: (
            <MetricCard
              description={presentation.description}
              icon={presentation.icon}
              label={widget.title}
              loading={initialLoading}
              tone={presentation.tone}
              value={presentation.value}
            />
          ),
        };
      }

      const sourceDefinition = definitionByGranularity.get(widget.granularity);
      const sourceDefinitionId = sourceDefinition?.id;
      const definition = sourceDefinition
        ? {
            ...sourceDefinition,
            id: `occupancy_custom_${widget.id}`,
            label: widget.title,
          }
        : null;
      return {
        chartTypeEnabled: true,
        configurationContent,
        className: "sm:col-span-2 xl:col-span-2",
        defaultHeightLevel: 4 as const,
        defaultSize: "wide" as const,
        id: `occupancy_custom_${widget.id}`,
        label: widget.title,
        titleEditable: true,
        zoomEnabled: true,
        node:
          definition && selectedScenario ? (
            <OccupancyChartCard
              definition={definition}
              loading={
                initialLoading ||
                !sourceDefinitionId ||
                !certifiedChartData[sourceDefinitionId]
              }
              metricVisibility={widget.series}
              scenario={selectedScenario}
              state={
                sourceDefinitionId
                  ? certifiedChartData[sourceDefinitionId]
                  : undefined
              }
            />
          ) : (
            <EmptyOccupancyCard title={widget.title} />
          ),
      };
    });
  }, [
    activeAreas,
    canEditVisual,
    certifiedAlerts,
    certifiedAlertsError,
    certifiedChartData,
    chartDefinitions,
    currentTotal,
    customWidgets,
    initialLoading,
    monitorMode,
    openCustomWidgetEditor,
    removeCustomWidget,
    selectedScenario,
    todayMetric,
    utilization,
  ]);

  const detailCards = React.useMemo(
    () =>
      selectedScenario
        ? [
            {
              colorEditable: false,
              id: "occupancy_scenario_detail",
              label: "Cenário de ocupação",
              defaultHeightLevel: 4 as const,
              defaultSize: "wide" as const,
              className: "sm:col-span-2 xl:col-span-2",
              titleEditable: true,
              node: (
                <OccupancyScenarioDetailCard
                  history={
                    certifiedHistoryError ? null : certifiedHistory
                  }
                  scenario={selectedScenario}
                />
              ),
            },
            {
              colorEditable: false,
              id: "occupancy_alert_list",
              label: "Histórico de alertas",
              defaultHeightLevel: 4 as const,
              defaultSize: "wide" as const,
              className: "sm:col-span-2 xl:col-span-2",
              titleEditable: true,
              node: (
                <OccupancyAlertsCard
                  alerts={certifiedAlerts}
                  error={certifiedAlertsError}
                  loading={initialLoading}
                  timeZone={companyTimeZone}
                />
              ),
            },
          ]
        : [],
    [
      certifiedAlerts,
      certifiedAlertsError,
      certifiedHistory,
      certifiedHistoryError,
      companyTimeZone,
      initialLoading,
      selectedScenario,
    ],
  );

  const occupancyLayoutCards = React.useMemo(
    () => [
      ...metricCards,
      ...occupancyLoitering.cards,
      ...chartCards,
      ...occupancyComparisonCards,
      ...occupancyDurationCards.filter(
        (card) => card.id !== OCCUPANCY_LOITERING_AVERAGE_CARD_ID,
      ),
      ...occupancyDurationInsights.cards,
      ...customWidgetCards,
      ...(monitorMode ? [] : detailCards),
    ],
    [
      chartCards,
      customWidgetCards,
      detailCards,
      metricCards,
      monitorMode,
      occupancyComparisonCards,
      occupancyDurationCards,
      occupancyDurationInsights.cards,
      occupancyLoitering.cards,
    ],
  );
  const occupancyViewScopes = React.useMemo(
    () =>
      visibleScenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
      })),
    [visibleScenarios],
  );
  const occupancyScenarioOptions = React.useMemo(
    () =>
      visibleScenarios.map((scenario) => ({
        description: scenario.active ? "Ativo" : "Inativo",
        id: scenario.id,
        name: scenario.name,
      })),
    [visibleScenarios],
  );

  async function getOccupancyReportPayload(signal?: AbortSignal) {
    const visibleCardIds = orderByCardPreferences(
      occupancyLayoutCards,
      occupancyPreferences,
    ).map((card) => card.id);
    const titleByCardId = new Map(
      occupancyPreferences.flatMap((preference) =>
        preference.title ? ([[preference.id, preference.title]] as const) : [],
      ),
    );
    const colorByCardId = new Map(
      occupancyPreferences.flatMap((preference) =>
        preference.color ? ([[preference.id, preference.color]] as const) : [],
      ),
    );
    const chartTypeByCardId = new Map(
      occupancyPreferences.flatMap((preference) =>
        preference.chartType
          ? ([[preference.id, preference.chartType]] as const)
          : [],
      ),
    );

    const occupancyLoiteringReportAssets =
      await occupancyLoitering.loadReportAssets(signal);
    signal?.throwIfAborted();

    return buildOccupancyDashboardReport({
      activeAreas,
      alerts: certifiedAlerts,
      alertsError: certifiedAlertsError,
      chartData: certifiedChartData,
      chartDefinitions,
      chartTypeByCardId,
      colorByCardId,
      currentTotal,
      customWidgets,
      generatedAt: lastUpdated ?? clock,
      history: certifiedHistoryError ? null : certifiedHistory,
      metricVisibility,
      occupancyComparisonReportAssets: getOccupancyComparisonReportAssets(),
      occupancyDurationDataCompleteUntil,
      occupancyDurationReportAssets: getOccupancyDurationReportAssets(),
      occupancyDurationReportContext,
      occupancyDurationReportMetrics,
      occupancyDurationReportWarnings,
      occupancyDurationInsightReportAssets:
        occupancyDurationInsights.getReportAssets(),
      occupancyLoiteringReportAssets,
      occupancyDurationInsightDataCompleteUntil:
        occupancyDurationInsights.dataCompleteUntil,
      // Relatórios são rasterizados sobre fundo branco, independentemente do
      // tema da tela. Uma paleta clara evita linhas escuras/brancas incoerentes
      // no PDF/PNG quando o dashboard está no modo escuro.
      palette: getOccupancyChartPalette("light"),
      scenario: selectedScenario,
      timeZone: companyTimeZone,
      titleByCardId,
      todayMetric,
      utilization,
      visibleCardIds,
    });
  }

  return (
    <section
      className={cn(
        "min-w-0 [&_[data-card-description]]:[overflow-wrap:anywhere] [&_[data-card-header]_h3]:[overflow-wrap:anywhere] [&_[data-card-header]_h3_svg]:shrink-0",
        monitorMode
          ? "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Ocupação ao vivo
            </div>
            <div className="break-words text-lg font-semibold [overflow-wrap:anywhere]">
              {selectedScenario?.name ?? "Cenário selecionado"}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-primary/30 bg-primary/10 text-primary"
            >
              <Activity className="h-3.5 w-3.5" />
              {OCCUPANCY_REFRESH_SECONDS} segundos
            </Badge>
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated, companyTimeZone)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="@container rounded-md border border-border bg-card px-3 py-2 shadow-soft">
          {occupancyCertificationError && !initialLoading ? (
            <OccupancyBlockingState
              onRetry={retryOccupancyData}
              retrying={loadingScenarios || loadingData || refreshing}
            />
          ) : loadingScenarios ? (
            <div data-dashboard-toolbar>
              <div data-toolbar-filters className="basis-[24rem]">
                <Skeleton className="h-8 min-w-0 max-w-md flex-[1_1_14rem]" />
                <Skeleton className="h-8 w-[8.75rem] max-w-full" />
              </div>
              <div data-toolbar-actions>
                <Skeleton className="hidden h-3.5 w-3.5 shrink-0 @md:block @lg:w-10 @xl:w-24" />
                <Skeleton className="h-8 w-[248px] max-w-full shrink-0" />
              </div>
            </div>
          ) : visibleScenarios.length ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <div
                  aria-label="Controles da visão de ocupação"
                  data-dashboard-toolbar
                  role="group"
                >
                  <div data-toolbar-filters className="basis-[24rem]">
                    <div className="min-w-0 max-w-md flex-[1_1_14rem]">
                      <Select value={selectedId} onValueChange={setSelectedId}>
                        <SelectTrigger
                          aria-label="Cenário de ocupação em foco"
                          className="h-auto min-h-8 w-full min-w-0 bg-card py-1"
                        >
                          <SelectValue placeholder="Selecione um cenário" />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleScenarios.map((scenario) => (
                            <SelectItem key={scenario.id} value={scenario.id}>
                              {scenario.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {canEditVisual ? (
                      <div
                        aria-label="Aparência dos comparativos desta visão"
                        className="flex w-[8.75rem] min-w-0 max-w-full items-center gap-2"
                        role="group"
                      >
                        <OccupancyPaletteSelect
                          ariaLabel="Paleta dos comparativos desta visão"
                          compact
                          fluid
                          value={occupancyComparisonSettings.colorPaletteId}
                          onValueChange={(colorPaletteId) =>
                            updateOccupancyComparisonSettings({
                              colorPaletteId,
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  <div data-toolbar-actions>
                    {lastUpdated ? (
                      <span
                        data-toolbar-status
                        aria-label={`Última atualização às ${formatTime(lastUpdated, companyTimeZone)}`}
                        className="hidden min-w-0 items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground @4xl:inline-flex"
                        title={`Última atualização às ${formatTime(lastUpdated, companyTimeZone)}`}
                      >
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden @lg:inline @xl:hidden">
                          {formatTime(lastUpdated, companyTimeZone)}
                        </span>
                        <span className="hidden @xl:inline">
                          Atualizado às{" "}
                          {formatTime(lastUpdated, companyTimeZone)}
                        </span>
                      </span>
                    ) : null}
                    <div
                      aria-label="Ações da visão de ocupação"
                      className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 [&_[data-monitor-mode-trigger]]:shrink-0 [&_[data-premium-control]]:shrink-0"
                      role="group"
                    >
                      <ReportExportActions
                        compact
                        disabled={
                          initialLoading ||
                          occupancyDurationLoading ||
                          occupancyDurationInsights.loading ||
                          occupancyLoitering.loading ||
                          !selectedScenario ||
                          Boolean(occupancyCertificationError) ||
                          hasIncompleteOccupancyCoverage
                        }
                        getPayload={getOccupancyReportPayload}
                      />
                      <AiAnalysisAction
                        disabled={
                          initialLoading ||
                          occupancyDurationLoading ||
                          occupancyDurationInsights.loading ||
                          occupancyLoitering.loading ||
                          !selectedScenario ||
                          Boolean(occupancyCertificationError) ||
                          hasIncompleteOccupancyCoverage
                        }
                        getPayload={getOccupancyReportPayload}
                        source={{ module: "occupancy", surface: "live" }}
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
                            title="Configurar widgets de ocupação"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                      {canEditVisual ? (
                        <Button
                          type="button"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          variant={
                            operationalSettingsOpen ? "default" : "outline"
                          }
                          onClick={() =>
                            setOperationalSettingsOpen((current) => !current)
                          }
                          aria-controls="occupancy-operational-settings"
                          aria-expanded={operationalSettingsOpen}
                          aria-label="Configurações operacionais"
                          title="Configurações operacionais"
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        variant="outline"
                        onClick={() => void refreshOccupancyDashboard()}
                        disabled={loadingScenarios || refreshing || loadingData}
                        aria-label="Atualizar dados de ocupação"
                        title="Atualizar dados de ocupação"
                      >
                        <RefreshCw
                          className={cn(
                            "h-4 w-4",
                            (loadingScenarios || refreshing || loadingData) &&
                              "animate-spin",
                          )}
                        />
                      </Button>
                      <MonitorModeButton
                        compact
                        onClick={enterMonitorMode}
                        disabled={!visibleScenarios.length}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {canEditVisual && operationalSettingsOpen ? (
                <div
                  id="occupancy-operational-settings"
                  aria-label="Configurações operacionais da ocupação"
                  className="rounded-xl border bg-muted/15 p-3 shadow-sm"
                  role="group"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 max-w-full lg:basis-[180px] lg:shrink-0">
                      <div className="text-sm font-semibold">
                        Séries históricas
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Medidas exibidas nos gráficos temporais.
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <MetricVisibilityControls
                        onChange={(metricVisibility) =>
                          updateDashboardSettings({ metricVisibility })
                        }
                        value={metricVisibility}
                      />
                    </div>
                    <Button
                      className="h-9 min-h-9 w-full shrink-0 lg:w-auto lg:min-w-[112px]"
                      type="button"
                      variant="secondary"
                      onClick={() => setOperationalSettingsOpen(false)}
                    >
                      Concluir
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              <div>
                Nenhum cenário de ocupação configurado. A ocupação usa sempre os
                cenários de áreas, inclusive quando o cenário possui apenas uma
                área.
              </div>
              {canManage ? (
                <Button className="mt-4" asChild>
                  <Link href="/manager/scenarios">
                    <MapPinned className="h-4 w-4" />
                    Configurar cenários
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {monitorMode && occupancyCertificationError && !initialLoading ? (
        <OccupancyBlockingState
          className="mb-3"
          onRetry={retryOccupancyData}
          retrying={loadingScenarios || loadingData || refreshing}
        />
      ) : null}

      {visibleScenarios.length && !occupancyCertificationError ? (
        <CardLayout
          cardDemandRootMargin="160px 0px"
          cardDemandScopeKey={activeDataScopeKey}
          menuKey="occupancy"
          monitorMode={monitorMode}
          onCardDemand={registerDemandedOccupancyCard}
          onCardMaterialize={registerMaterializedOccupancyCard}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          preferenceScopeId={selectedScenario?.id}
          reorderMode={layoutReorderMode}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
          viewScopeName={selectedScenario?.name}
          viewScopes={occupancyViewScopes}
          scenarios={occupancyScenarioOptions}
          showCardConfigurationActions
          editActions={
            <Button
              type="button"
              size="sm"
              onClick={openCustomWidgetDialog}
              disabled={!selectedScenario}
            >
              <Plus className="h-4 w-4" />
              Adicionar widget
            </Button>
          }
          cards={occupancyLayoutCards}
        />
      ) : null}

      {monitorMode ? null : (
        <OccupancyCustomWidgetDialog
          form={customWidgetForm}
          onChange={setCustomWidgetForm}
          onOpenChange={setCustomWidgetDialogOpen}
          onSave={saveCustomWidget}
          open={customWidgetDialogOpen}
        />
      )}
    </section>
  );
}

function MetricCard({
  action,
  description,
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: {
  action?: React.ReactNode;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading: boolean;
  tone:
    | "average"
    | "maximum"
    | "minimum"
    | "primary"
    | "sky"
    | "indigo"
    | "slate"
    | "warning";
  value: number | string | null;
}) {
  const toneColor = {
    average: "#7C3AED",
    maximum: "#E11D48",
    minimum: "#D97706",
    primary: "#1267C4",
    sky: "#0369A1",
    indigo: "#4F46E5",
    slate: "#64748B",
    warning: "#D97706",
  }[tone];
  const formattedValue =
    typeof value === "string" ? value : formatOccupancyValue(value);

  return (
    <CompactMetricCard
      action={action}
      description={description}
      descriptionTitle={description}
      icon={Icon}
      label={label}
      loading={loading}
      toneColor={toneColor}
      value={formattedValue}
      valueTitle={String(formattedValue)}
    />
  );
}

function OccupancyChartCard({
  action,
  definition,
  loading,
  metricVisibility,
  scenario,
  state,
}: {
  action?: React.ReactNode;
  definition: OccupancyChartDefinition;
  loading: boolean;
  metricVisibility: OccupancyMetricVisibility;
  scenario: OccupancyScenario;
  state?: OccupancyChartState;
}) {
  const points = state?.points ?? buildEmptyOccupancyPoints(definition);
  const { effectiveTheme } = useTheme();
  const chartType = useWidgetChartType();
  const widgetColor = useWidgetColor();
  const resolvedTitle = useWidgetTitle(definition.label);
  const palette = React.useMemo(() => {
    const basePalette = getOccupancyChartPalette(effectiveTheme);
    return {
      ...basePalette,
      current: ensureGraphicContrast(widgetColor, basePalette.surface),
    };
  }, [effectiveTheme, widgetColor]);
  const option = React.useMemo(
    () =>
      buildOccupancyChartOption(
        definition,
        points,
        metricVisibility,
        {
          maximum: scenario.max_total ?? undefined,
          minimum: scenario.min_total ?? undefined,
        },
        palette,
        chartType,
      ),
    [
      definition,
      chartType,
      metricVisibility,
      palette,
      points,
      scenario.max_total,
      scenario.min_total,
    ],
  );
  const hasReferenceLimit =
    (scenario.min_total !== null && scenario.min_total !== undefined) ||
    (scenario.max_total !== null && scenario.max_total !== undefined);
  const hasData =
    points.some(
      (point) =>
        (metricVisibility.average && point.average !== null) ||
        (metricVisibility.minimum && point.minimum !== null) ||
        (metricVisibility.peak && point.peak !== null) ||
        point.current !== null,
    ) || hasReferenceLimit;

  return (
    <Card className="@container flex h-full min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {resolvedTitle}
              </span>
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {definition.description}
            </CardDescription>
          </div>
          {action}
          <div className="col-span-full flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words bg-primary/10 text-left leading-5 text-primary [overflow-wrap:anywhere]"
            >
              {scenario.name}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full flex-1" />
        ) : state?.error ? (
          <EmptyChartState text="Dados temporariamente indisponíveis para este gráfico." />
        ) : hasData ? (
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <EChart
              option={option}
              themeMode="explicit"
              className="h-full min-h-0 w-full"
              valueLabels={
                definition.granularity === "minute" ? "none" : undefined
              }
            />
          </div>
        ) : (
          <EmptyChartState text="Sem dados de ocupação para este cenário." />
        )}
      </CardContent>
    </Card>
  );
}

function MetricVisibilityControls({
  onChange,
  value,
}: {
  onChange: (value: OccupancyMetricVisibility) => void;
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
      className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 p-1"
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
              onChange({
                ...value,
                [option.key]: !value[option.key],
              })
            }
            className={cn(
              "focus-contained h-8 min-w-0 max-w-full rounded px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
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

function OccupancyScenarioDetailCard({
  history,
  scenario,
}: {
  history: OccupancyScenarioHistoryResponse | null;
  scenario: OccupancyScenario;
}) {
  const widgetColor = useWidgetColor();
  const resolvedTitle = useWidgetTitle(scenario.name);
  const areas = scenario.areas ?? [];
  const pageSize = 2;
  const pageCount = Math.max(1, Math.ceil(areas.length / pageSize));
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    setPage(0);
  }, [scenario.id]);

  React.useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const visibleAreas = areas.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <Card className="@container h-full min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
          <MapPinned
            className="h-4 w-4 shrink-0"
            style={{ color: widgetColor }}
          />
          {resolvedTitle}
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          Monitoramento de {occupancyObjectClassLabel(scenario.object_class)}
          com limites de alerta do cenário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 @sm:grid-cols-3">
          <SmallInfo
            label="Áreas"
            value={formatNumber(scenario.areas?.length ?? 0)}
          />
          <SmallInfo
            label="Mínimo"
            value={thresholdLabel(scenario.min_total)}
          />
          <SmallInfo
            label="Máximo"
            value={thresholdLabel(scenario.max_total)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          {areas.length ? (
            visibleAreas.map((area, index) => {
              const currentArea = history?.areas?.find(
                (item) =>
                  item.area_id === area.area_id &&
                  item.camera_id === area.camera_id,
              );

              return (
                <div
                  key={`${area.camera_id}-${area.area_id}-${page * pageSize + index}`}
                  className="grid min-w-0 gap-3 rounded-md border bg-muted/20 p-3 @sm:grid-cols-[minmax(0,1fr)_90px]"
                >
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {area.label || "Área sem nome"}
                    </div>
                  </div>
                  <div className="min-w-0 text-left @sm:text-right">
                    <div className="break-all text-lg font-semibold tabular-nums">
                      {formatOccupancyValue(currentArea?.value)}
                    </div>
                    <div className="text-xs text-muted-foreground">agora</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma área vinculada.
            </div>
          )}
        </div>
        {pageCount > 1 ? (
          <CardPagination
            label="Áreas do cenário"
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function OccupancyAlertsCard({
  alerts,
  error,
  loading,
  timeZone,
}: {
  alerts: OccupancyAlertRow[];
  error: string;
  loading: boolean;
  timeZone: string;
}) {
  const widgetColor = useWidgetColor();
  const resolvedTitle = useWidgetTitle("Histórico de alertas");
  const pageSize = 2;
  const pageCount = Math.max(1, Math.ceil(alerts.length / pageSize));
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const visibleAlerts = alerts.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <Card className="@container h-full min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
          <Bell className="h-4 w-4 shrink-0" style={{ color: widgetColor }} />
          {resolvedTitle}
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          Alertas gerados pelos limites mínimo e máximo do cenário.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Alertas temporariamente indisponíveis.
          </div>
        ) : alerts.length ? (
          <div className="min-w-0 space-y-2">
            {visibleAlerts.map((alert) => (
              <div
                key={alert.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        alert.threshold_kind === "min"
                          ? "warning"
                          : "destructive"
                      }
                    >
                      {alert.threshold_kind === "min" ? "Mínimo" : "Máximo"}
                    </Badge>
                    <span className="max-w-full break-all text-sm font-medium tabular-nums">
                      {formatOccupancyValue(alert.total_value)}
                    </span>
                    <span className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      limite {formatOccupancyValue(alert.threshold_value)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(alert.triggered_at, timeZone)}
                  </div>
                </div>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Sem alertas registrados para este cenário.
          </div>
        )}
        {!loading && !error && alerts.length && pageCount > 1 ? (
          <CardPagination
            label="Histórico de alertas"
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function CardPagination({
  label,
  onPageChange,
  page,
  pageCount,
}: {
  label: string;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}) {
  return (
    <nav
      aria-label={`Paginação de ${label}`}
      className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t pt-2"
    >
      <span className="text-xs tabular-nums text-muted-foreground">
        {page + 1} de {pageCount}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
          aria-label={`Página anterior de ${label}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
          aria-label={`Próxima página de ${label}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-all text-sm font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function EmptyOccupancyCard({
  action,
  title,
}: {
  action?: React.ReactNode;
  title: string;
}) {
  const resolvedTitle = useWidgetTitle(title);

  return (
    <Card className="@container min-w-0 overflow-hidden">
      <CardHeader>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
          <CardTitle className="min-w-0 break-words [overflow-wrap:anywhere]">
            {resolvedTitle}
          </CardTitle>
          {action}
          <CardDescription className="col-span-full [overflow-wrap:anywhere]">
            Selecione um cenário de ocupação.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <EmptyChartState text="Nenhum cenário selecionado." />
      </CardContent>
    </Card>
  );
}

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 px-3 text-center text-xs text-muted-foreground @sm:px-4 @sm:text-sm">
      <span className="line-clamp-4 break-words [overflow-wrap:anywhere]">
        {text}
      </span>
    </div>
  );
}

function buildOccupancyLiveDataPlan(
  preferences: readonly CardPreference[],
  customWidgets: readonly OccupancyCustomWidget[],
  requestedCardIds?: ReadonlySet<string>,
): OccupancyLiveDataPlan {
  const visible = new Set(
    preferences
      .filter(
        (preference) =>
          preference.visible === true &&
          (!requestedCardIds || requestedCardIds.has(preference.id)),
      )
      .map((preference) => preference.id),
  );
  const granularities = new Set<OccupancyChartDefinition["granularity"]>();
  const standardChartGranularities: Array<
    readonly [string, OccupancyChartDefinition["granularity"]]
  > = [
    ["occupancy_chart_minute", "minute"],
    ["occupancy_chart_hour", "hour"],
    ["occupancy_chart_day", "day"],
    ["occupancy_chart_week", "week"],
    ["occupancy_chart_month", "month"],
  ];
  standardChartGranularities.forEach(([cardId, granularity]) => {
    if (visible.has(cardId)) granularities.add(granularity);
  });

  const history = occupancyLiveHistoryRequired(visible, customWidgets);
  let alerts = ["occupancy_alerts", "occupancy_alert_list"].some((cardId) =>
    visible.has(cardId),
  );
  if (
    ["occupancy_average", "occupancy_minimum", "occupancy_peak"].some(
      (cardId) => visible.has(cardId),
    )
  ) {
    granularities.add("day");
  }
  if (
    visible.has("occupancy_scenario_max_hour") &&
    !visible.has("occupancy_day_hour_heatmap") &&
    !visible.has("occupancy_scenario_hour_heatmap")
  ) {
    // This certified focus series is shared with the comparison hook, so the
    // focused scenario never performs a second equivalent hourly request.
    granularities.add("hour");
  }

  customWidgets.forEach((widget) => {
    if (!visible.has(`occupancy_custom_${widget.id}`)) return;
    if (widget.kind === "trend") {
      granularities.add(widget.granularity);
      return;
    }
    if (widget.metric === "alerts") alerts = true;
    if (
      widget.metric === "average" ||
      widget.metric === "minimum" ||
      widget.metric === "peak"
    ) {
      granularities.add("day");
    }
  });

  const orderedGranularities = OCCUPANCY_CHART_CARD_IDS.flatMap((cardId) => {
    const granularity = cardId.replace(
      "occupancy_chart_",
      "",
    ) as OccupancyChartDefinition["granularity"];
    return granularities.has(granularity) ? [granularity] : [];
  });
  return {
    alerts,
    granularities: orderedGranularities,
    history,
    key: JSON.stringify([history, alerts, orderedGranularities]),
  };
}

function emptyOccupancyLiveDataFreshness(
  scopeKey: string,
): OccupancyLiveDataFreshness {
  return {
    alertsAt: 0,
    chartAuditAt: {},
    chartAt: {},
    chartMutableBucketStarts: {},
    chartWindowKeys: {},
    historyAt: 0,
    scopeKey,
  };
}

function occupancyLiveDataPlanFromKey(key: string): OccupancyLiveDataPlan {
  const [history, alerts, granularities] = JSON.parse(key) as [
    boolean,
    boolean,
    OccupancyChartDefinition["granularity"][],
  ];
  return { alerts, granularities, history, key };
}

function occupancyLiveResourceIsDue(
  lastLoadedAt: number,
  refreshMs: number,
  now: Date,
  force = false,
) {
  return (
    force ||
    !Number.isFinite(lastLoadedAt) ||
    lastLoadedAt <= 0 ||
    now.getTime() - lastLoadedAt >= refreshMs
  );
}

function occupancyLiveManualRefreshGranularity(
  granularity: OccupancyChartDefinition["granularity"],
) {
  return (
    granularity === "minute" ||
    granularity === "hour" ||
    granularity === "day"
  );
}

function occupancyChartDefinitionWindowKey(
  definition: OccupancyChartDefinition,
) {
  return JSON.stringify([
    definition.id,
    definition.granularity,
    definition.from.getTime(),
    definition.to.getTime(),
  ]);
}

function occupancyChartDefinitionsWindowKey(
  definitions: OccupancyChartDefinition[],
) {
  return JSON.stringify(definitions.map(occupancyChartDefinitionWindowKey));
}

function buildOccupancyChartQueryPlan(
  definition: OccupancyChartDefinition,
  previousMutableBucketStart: number | undefined,
  requireFullAudit: boolean,
) {
  const buckets = listBucketStarts(definition);
  const mutableBucket = buckets.at(-1);
  if (!mutableBucket) {
    throw new RangeError("A janela ao vivo de ocupação não possui buckets.");
  }

  let fullAudit = requireFullAudit;
  let queryFrom = definition.from;
  if (!fullAudit && previousMutableBucketStart !== undefined) {
    const previousMutableBucket = buckets.find(
      (bucket) => bucket.getTime() === previousMutableBucketStart,
    );
    if (previousMutableBucket) queryFrom = previousMutableBucket;
    else fullAudit = true;
  }

  return {
    definition,
    fullAudit,
    mutableBucketStart: mutableBucket.getTime(),
    queryDefinition: fullAudit
      ? definition
      : { ...definition, from: new Date(queryFrom) },
  };
}

function mergeOccupancyChartRows(
  definition: OccupancyChartDefinition,
  queryDefinition: OccupancyChartDefinition,
  previousRows: readonly OccupancyScenarioBucketRow[],
  nextRows: readonly OccupancyScenarioBucketRow[],
) {
  const expectedBucketKeys = new Set(
    listBucketStarts(definition).map((bucket) =>
      occupancyAggregateBucketKey(bucket, definition.granularity),
    ),
  );
  const replacedBucketKeys = new Set(
    listBucketStarts(queryDefinition).map((bucket) =>
      occupancyAggregateBucketKey(bucket, definition.granularity),
    ),
  );
  const retained = previousRows.filter((row) => {
    const key = occupancyChartRowBucketKey(row, definition.granularity);
    return expectedBucketKeys.has(key) && !replacedBucketKeys.has(key);
  });
  const replacements = nextRows.map((row) => {
    const key = occupancyChartRowBucketKey(row, definition.granularity);
    if (!replacedBucketKeys.has(key)) {
      throw new Error(
        "A API retornou um bucket fora da borda solicitada de ocupação.",
      );
    }
    return row;
  });

  return [...retained, ...replacements]
    .map((row, index) => ({
      index,
      key: occupancyChartRowBucketKey(row, definition.granularity),
      row,
    }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map(({ row }) => row);
}

function occupancyChartRowBucketKey(
  row: OccupancyScenarioBucketRow,
  granularity: OccupancyChartDefinition["granularity"],
) {
  const bucket = parseAggregateBucket(row.bucket, granularity);
  if (!bucket) {
    throw new Error("A API retornou um bucket de ocupação inválido.");
  }
  return occupancyAggregateBucketKey(bucket, granularity);
}

function buildOccupancyChartDefinitions(
  now: Date,
  timeZone?: string,
): OccupancyChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = timeZone
    ? endOfCompanyTimeZoneHour(now, timeZone)
    : endOfAggregateBucket(startOfHour(now), "hour");
  const todayStart = timeZone
    ? companyCalendarDate(now, timeZone, "day")
    : startOfDay(now);
  const currentWeekStart = startOfWeek(todayStart);
  const currentMonthStart = startOfMonth(todayStart);

  return [
    {
      id: "occupancy_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos do cenário.",
      granularity: "minute",
      timeZone,
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "occupancy_chart_hour",
      label: "Hora a hora",
      description: "Hoje por hora com mínimo, média, máximo e atual.",
      granularity: "hour",
      timeZone,
      from: timeZone ? startOfCompanyTimeZoneDay(now, timeZone) : todayStart,
      to: hourEnd,
    },
    {
      id: "occupancy_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias do cenário.",
      granularity: "day",
      timeZone,
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "occupancy_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas do cenário.",
      granularity: "week",
      timeZone,
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "occupancy_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses do cenário.",
      granularity: "month",
      timeZone,
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
  ];
}

function buildSharedFocusHourlyAggregate({
  enabled,
  from,
  name,
  scenarioId,
  state,
  timeZone,
  to,
}: {
  enabled: boolean;
  from: number | null;
  name: string;
  scenarioId: string;
  state?: OccupancyChartState;
  timeZone?: string;
  to: number | null;
}): OccupancySharedHourlyAggregate | null {
  if (!enabled || !scenarioId || from === null || to === null) return null;
  const definition: OccupancyChartDefinition = {
    description: "",
    from: new Date(from),
    granularity: "hour",
    timeZone,
    id: "occupancy_chart_hour",
    label: "",
    to: new Date(to),
  };
  const buckets = listBucketStarts(definition);
  let series: OccupancySharedHourlyAggregate["series"] = null;
  if (state?.error) {
    series = {
      error: state.error,
      metrics: new Map(),
      name,
      scenarioId,
      warning: state.warning,
    };
  } else if (state) {
    const coverage = aggregateOccupancyRowsForRequestedBuckets(
      state.rows,
      "hour",
      buckets,
      {
        allowDocumentedAggregateResponse: true,
        expectedTimezone: timeZone,
        openBucket: buckets.at(-1),
        requireCertification: true,
      },
    );
    series = {
      metrics: coverage.totals,
      name,
      scenarioId,
      warning: state.warning,
    };
  }
  return {
    buckets,
    from: definition.from,
    series,
    to: definition.to,
  };
}

function occupancyTemporalRefreshDelay(refreshMs: number) {
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

function occupancyScenarioAggregatePath(
  scenarioId: string,
  definition: OccupancyChartDefinition,
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

async function loadFocusedLiveSnapshot({
  companyScopeId,
  force,
  requestedAt,
  scenario,
  signal,
  timeZone,
}: {
  companyScopeId: string;
  force: boolean;
  requestedAt: Date;
  scenario: OccupancyScenario;
  signal: AbortSignal;
  timeZone: string;
}): Promise<OccupancyScenarioHistoryResponse> {
  const snapshotQuery = occupancyLiveSnapshotQuery({ now: requestedAt });

  const loadHistoryFallback = async () => {
    const response = await fetchSharedOccupancyQuery<unknown>({
      bypassCache: force,
      cacheTtlMs: 0,
      companyScopeId,
      path: occupancyScenarioHistoryPath(scenario.id, requestedAt),
      priority: "foreground",
      scenarioId: scenario.id,
      signal,
      timeZone,
    });
    return requireOccupancyHistoryResponse(response, scenario.id, {
      expectedAreas: scenario.areas,
      requireAreaSnapshots: true,
      requestedAt,
    });
  };

  try {
    const response = await fetchSharedOccupancyQuery<unknown>({
      bypassCache: force,
      cacheTtlMs: OCCUPANCY_LIVE_SNAPSHOT_CACHE_TTL_MS,
      companyScopeId,
      path: snapshotQuery.path,
      priority: "foreground",
      scenarioId: OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID,
      signal,
      timeZone,
    });
    const rows = requireOccupancyCurrentSnapshotRows(response, {
      expectedAreas: scenario.areas,
    });
    if (!occupancyScenarioSnapshotHasCompleteCoverage(scenario, rows)) {
      return loadHistoryFallback();
    }
    return buildOccupancyScenarioCurrentHistory(scenario, rows);
  } catch (snapshotError) {
    if (isAbortError(snapshotError) || signal.aborted) throw snapshotError;
    if (
      !(snapshotError instanceof ApiError) ||
      (snapshotError.status !== 404 && snapshotError.status !== 405)
    ) {
      throw snapshotError;
    }

    // Compatibility for installations that have not deployed the raw current
    // snapshot route yet. A valid but uncovered raw response takes the same
    // history path above; neither fallback is cached into the next five-second
    // live pulse.
    try {
      return await loadHistoryFallback();
    } catch (historyError) {
      if (isAbortError(historyError) || signal.aborted) throw historyError;
      throw snapshotError;
    }
  }
}

function buildOccupancyChartState(
  definition: OccupancyChartDefinition,
  rows: OccupancyScenarioBucketRow[],
  metadataWarning?: string,
): OccupancyChartState {
  const { missingBucketCount, points, requestedBucketCount } =
    buildOccupancyPoints(definition, rows);
  return {
    rows,
    points,
    incomplete: missingBucketCount > 0,
    warning: joinOccupancyWarnings(
      metadataWarning,
      occupancyAggregateCoverageWarning(
        missingBucketCount,
        requestedBucketCount,
      ),
    ),
  };
}

function joinOccupancyWarnings(...warnings: Array<string | undefined>) {
  return (
    warnings
      .filter((warning): warning is string => Boolean(warning))
      .join(" ") || undefined
  );
}

function buildOccupancyPoints(
  definition: OccupancyChartDefinition,
  rows: OccupancyScenarioBucketRow[],
) {
  const requestedBuckets = listBucketStarts(definition);
  const { missingBuckets, totals } = aggregateOccupancyRowsForRequestedBuckets(
    rows,
    definition.granularity,
    requestedBuckets,
    {
      allowDocumentedAggregateResponse: true,
      allowVerifiedCivilAggregateResponse:
        definition.granularity === "day" ||
        definition.granularity === "week" ||
        definition.granularity === "month",
      expectedTimezone: definition.timeZone,
      openBucket: requestedBuckets.at(-1),
      requireCertification: true,
    },
  );

  const points = requestedBuckets.map((bucketStart) => {
    const key = occupancyAggregateBucketKey(
      bucketStart,
      definition.granularity,
    );
    const total = totals.get(key);
    if (!total) {
      return {
        bucket: bucketStart.toISOString(),
        label: bucketLabel(
          bucketStart,
          definition.granularity,
          definition.timeZone,
        ),
        average: null,
        current: null,
        minimum: null,
        peak: null,
      };
    }

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(
        bucketStart,
        definition.granularity,
        definition.timeZone,
      ),
      average: total.average,
      current: total.final ?? null,
      minimum: total.minimum,
      peak: total.peak,
    };
  });

  return {
    missingBucketCount: missingBuckets.length,
    points: occupancyDisplayPoints(definition, points),
    requestedBucketCount: requestedBuckets.length,
  };
}

function buildEmptyOccupancyPoints(
  definition: OccupancyChartDefinition,
): OccupancyPoint[] {
  const points = listBucketStarts(definition).map((bucketStart) => ({
    bucket: bucketStart.toISOString(),
    label: bucketLabel(
      bucketStart,
      definition.granularity,
      definition.timeZone,
    ),
    average: null,
    current: null,
    minimum: null,
    peak: null,
  }));
  return occupancyDisplayPoints(definition, points);
}

function occupancyDisplayPoints(
  definition: OccupancyChartDefinition,
  points: OccupancyPoint[],
) {
  return definition.granularity === "hour"
    ? buildFixedOccupancyHourlyPoints(
        definition.from,
        points,
        definition.timeZone,
      )
    : points;
}

function buildOccupancyChartOption(
  definition: OccupancyChartDefinition,
  points: OccupancyPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: {
    maximum?: number;
    minimum?: number;
  },
  palette: OccupancyChartPalette,
  chartType: CardChartType = "bar",
): EnterpriseChartOption {
  if (chartType === "line") {
    return buildOccupancyLineChartOption(
      definition,
      points,
      metricVisibility,
      limits,
      palette,
    );
  }
  const markerDefinitions: OccupancyMarkerDefinition[] = [
    {
      color: palette.current,
      data: points.map((point) => point.current ?? null),
      effect: false,
      fill: palette.current,
      kind: "current",
      name: "Valor no período",
      offset: [0, 0],
      size: denseMarkerSize(definition, "current"),
      symbol: "circle",
      z: 6,
    },
  ];

  if (metricVisibility.average) {
    markerDefinitions.push({
      color: palette.average,
      data: points.map((point) => point.average),
      fill: palette.average,
      kind: "average",
      name: "Média",
      offset: [0, 0],
      size: denseMarkerSize(definition, "average"),
      symbol: "rect",
      z: 5,
    });
  }

  const showRange = metricVisibility.minimum && metricVisibility.peak;
  if (metricVisibility.minimum && !showRange) {
    markerDefinitions.push({
      color: palette.minimumLimit,
      data: points.map((point) => point.minimum),
      fill: palette.minimumLimit,
      kind: "limit",
      name: "Mínimo",
      offset: [0, 0],
      size: denseMarkerSize(definition, "limit"),
      symbol: "rect",
      z: 4,
    });
  }
  if (metricVisibility.peak && !showRange) {
    markerDefinitions.push({
      color: palette.maximumLimit,
      data: points.map((point) => point.peak),
      fill: palette.maximumLimit,
      kind: "limit",
      name: "Máximo",
      offset: [0, 0],
      size: denseMarkerSize(definition, "limit"),
      symbol: "circle",
      z: 4,
    });
  }

  const dense = definition.granularity === "minute";
  const thresholdDefinitions = [
    ...(limits.minimum !== undefined
      ? [
          {
            data: points.map(() => limits.minimum),
            name: "Limite mínimo",
            color: palette.minimumLimit,
          },
        ]
      : []),
    ...(limits.maximum !== undefined
      ? [
          {
            data: points.map(() => limits.maximum),
            name: "Limite máximo",
            color: palette.maximumLimit,
          },
        ]
      : []),
  ];
  const rangeBaseValues = points.map((point) =>
    point.minimum === null ? null : Math.max(0, point.minimum),
  );
  const rangeSpanValues = points.map((point) =>
    point.minimum === null || point.peak === null
      ? null
      : Math.max(0, point.peak - Math.max(0, point.minimum)),
  );

  return {
    color: [
      ...markerDefinitions.map((series) => series.color),
      ...thresholdDefinitions.map((series) => series.color),
    ],
    grid: {
      bottom: 2,
      containLabel: true,
      left: 4,
      right: 12,
      top: 42,
    },
    legend: {
      data: [
        ...markerDefinitions.map((series) => ({
          icon: series.symbol === "circle" ? "circle" : "roundRect",
          name: series.name,
        })),
        ...(showRange
          ? [{ icon: "roundRect", name: "Faixa mínimo–máximo" }]
          : []),
        ...thresholdDefinitions.map((series) => series.name),
      ],
      itemGap: 14,
      itemHeight: 6,
      itemWidth: 9,
      selectedMode: false,
      textStyle: {
        color: palette.legendText,
        fontSize: 11,
      },
      top: 0,
    },
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
        formatOccupancyChartTooltip(params, points, metricVisibility, limits),
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
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: palette.gridLine,
        },
      },
      type: "value",
    },
    series: [
      ...(showRange
        ? [
            {
              barCategoryGap: dense ? "56%" : "62%",
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
              name: "Faixa mínimo–máximo",
              stack: "occupancy_range",
              tooltip: {
                show: false,
              },
              type: "bar",
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
        label:
          series.kind === "current"
            ? {
                color: palette.legendText,
                distance: 7,
                fontSize: 10,
                fontWeight: 600,
                formatter: (params: { value?: number | null }) =>
                  params.value === null || params.value === undefined
                    ? ""
                    : formatOccupancyValue(Number(params.value)),
                position: "top",
                show: true,
              }
            : { show: false },
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

function buildOccupancyLineChartOption(
  definition: OccupancyChartDefinition,
  points: OccupancyPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: { maximum?: number; minimum?: number },
  palette: OccupancyChartPalette,
): EnterpriseChartOption {
  const dense = definition.granularity === "minute";
  const series: Array<Record<string, unknown>> = [
    {
      connectNulls: false,
      data: points.map((point) => point.current),
      itemStyle: { color: palette.current },
      lineStyle: { color: palette.current, width: 2.6 },
      name: "Valor no período",
      showSymbol: !dense,
      smooth: false,
      symbol: "circle",
      symbolSize: dense ? 3 : 6,
      type: "line",
      z: 7,
    },
  ];

  if (metricVisibility.average) {
    series.push({
      connectNulls: false,
      data: points.map((point) => point.average),
      itemStyle: { color: palette.average },
      lineStyle: { color: palette.average, width: 2 },
      name: "Média",
      showSymbol: !dense,
      smooth: false,
      symbolSize: 4,
      type: "line",
      z: 6,
    });
  }
  if (metricVisibility.minimum) {
    series.push({
      connectNulls: false,
      data: points.map((point) => point.minimum),
      itemStyle: { color: palette.minimumLimit },
      lineStyle: {
        color: palette.minimumLimit,
        opacity: 0.82,
        type: "dotted",
        width: 1.5,
      },
      name: "Mínimo",
      showSymbol: false,
      type: "line",
      z: 4,
    });
  }
  if (metricVisibility.peak) {
    series.push({
      connectNulls: false,
      data: points.map((point) => point.peak),
      itemStyle: { color: palette.maximumLimit },
      lineStyle: {
        color: palette.maximumLimit,
        opacity: 0.82,
        type: "dotted",
        width: 1.5,
      },
      name: "Máximo",
      showSymbol: false,
      type: "line",
      z: 4,
    });
  }
  if (limits.minimum !== undefined) {
    series.push({
      data: points.map(() => limits.minimum),
      itemStyle: { color: palette.minimumLimit },
      lineStyle: { color: palette.minimumLimit, type: "dashed", width: 1.4 },
      name: "Limite mínimo",
      showSymbol: false,
      silent: true,
      type: "line",
      z: 3,
    });
  }
  if (limits.maximum !== undefined) {
    series.push({
      data: points.map(() => limits.maximum),
      itemStyle: { color: palette.maximumLimit },
      lineStyle: { color: palette.maximumLimit, type: "dashed", width: 1.4 },
      name: "Limite máximo",
      showSymbol: false,
      silent: true,
      type: "line",
      z: 3,
    });
  }

  return {
    color: series.flatMap((item) =>
      typeof (item.itemStyle as { color?: unknown } | undefined)?.color ===
      "string"
        ? [(item.itemStyle as { color: string }).color]
        : [],
    ),
    grid: { bottom: 2, containLabel: true, left: 4, right: 12, top: 42 },
    legend: {
      itemGap: 14,
      itemHeight: 6,
      itemWidth: 9,
      selectedMode: false,
      textStyle: { color: palette.legendText, fontSize: 11 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: "line" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      confine: true,
      formatter: (params: unknown) =>
        formatOccupancyChartTooltip(params, points, metricVisibility, limits),
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
      minInterval: 1,
      splitLine: { lineStyle: { color: palette.gridLine } },
      type: "value",
    },
    series,
  };
}

function formatOccupancyChartTooltip(
  params: unknown,
  points: OccupancyPoint[],
  metricVisibility: OccupancyMetricVisibility,
  limits: {
    maximum?: number;
    minimum?: number;
  },
) {
  const dataIndex = tooltipDataIndex(params);
  const point = dataIndex === undefined ? undefined : points[dataIndex];
  if (!point) return "";

  const rows = [
    `<strong>${escapeHtml(point.label)}</strong>`,
    point.current === null
      ? undefined
      : `Valor no período: ${formatOccupancyValue(point.current)}`,
    metricVisibility.average
      ? `Média: ${formatOccupancyValue(point.average)}`
      : undefined,
    metricVisibility.minimum
      ? `Mínimo: ${formatOccupancyValue(point.minimum)}`
      : undefined,
    metricVisibility.peak
      ? `Máximo: ${formatOccupancyValue(point.peak)}`
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
  definition: OccupancyChartDefinition,
  kind: "current" | "average" | "limit",
): number | [number, number] {
  const dense = definition.granularity === "minute";

  if (kind === "current") return dense ? 6 : 7.5;
  if (kind === "average") return dense ? [13, 2] : [19, 2.2];
  return dense ? [11, 1.8] : [15, 2];
}

function listBucketStarts(definition: OccupancyChartDefinition) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(
    definition.from,
    definition.granularity,
    definition.timeZone,
  );
  const end = alignEndToGranularity(
    definition.to,
    definition.granularity,
    definition.timeZone,
  );
  let guard = 0;

  while (cursor < end && guard < 500) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(
      bucketStart,
      definition.granularity,
      definition.timeZone,
    );
    guard += 1;
  }

  if (cursor < end) {
    throw new RangeError(
      "O intervalo selecionado é extenso demais para este gráfico. Reduza o período.",
    );
  }

  return starts;
}

function buildOccupancyDashboardReport({
  activeAreas,
  alerts,
  alertsError,
  chartData,
  chartDefinitions,
  chartTypeByCardId,
  colorByCardId,
  currentTotal,
  customWidgets,
  generatedAt,
  history,
  metricVisibility,
  occupancyComparisonReportAssets,
  occupancyDurationDataCompleteUntil,
  occupancyDurationReportAssets,
  occupancyDurationReportContext,
  occupancyDurationReportMetrics,
  occupancyDurationReportWarnings,
  occupancyDurationInsightReportAssets,
  occupancyDurationInsightDataCompleteUntil,
  occupancyLoiteringReportAssets,
  palette,
  scenario,
  timeZone,
  titleByCardId,
  todayMetric,
  utilization,
  visibleCardIds,
}: {
  activeAreas: number | null;
  alerts: OccupancyAlertRow[];
  alertsError: string;
  chartData: Record<string, OccupancyChartState>;
  chartDefinitions: OccupancyChartDefinition[];
  chartTypeByCardId: Map<string, CardChartType>;
  colorByCardId: Map<string, string>;
  currentTotal: number | null;
  customWidgets: OccupancyCustomWidget[];
  generatedAt: Date;
  history: OccupancyScenarioHistoryResponse | null;
  metricVisibility: OccupancyMetricVisibility;
  occupancyComparisonReportAssets: ReturnType<
    typeof useOccupancyComparisonCards
  >["getReportAssets"] extends () => infer Assets
    ? Assets
    : never;
  occupancyDurationDataCompleteUntil: ReturnType<
    typeof useOccupancyDurationCards
  >["dataCompleteUntil"];
  occupancyDurationReportAssets: ReturnType<
    typeof useOccupancyDurationCards
  >["getReportAssets"] extends () => infer Assets
    ? Assets
    : never;
  occupancyDurationReportContext: ReturnType<
    typeof useOccupancyDurationCards
  >["reportContext"];
  occupancyDurationReportMetrics: ReturnType<
    typeof useOccupancyDurationCards
  >["reportMetrics"];
  occupancyDurationReportWarnings: ReturnType<
    typeof useOccupancyDurationCards
  >["reportWarnings"];
  occupancyDurationInsightReportAssets: ReturnType<
    typeof useOccupancyDurationInsights
  >["reportAssets"];
  occupancyDurationInsightDataCompleteUntil: ReturnType<
    typeof useOccupancyDurationInsights
  >["dataCompleteUntil"];
  occupancyLoiteringReportAssets: ReturnType<
    typeof useOccupancyLoitering
  >["reportAssets"];
  palette: OccupancyChartPalette;
  scenario: OccupancyScenario | null;
  timeZone: string;
  titleByCardId: Map<string, string>;
  todayMetric: {
    average: number | null;
    minimum: number | null;
    peak: number | null;
  };
  utilization: number | null;
  visibleCardIds: string[];
}): ReportPayload {
  const resolveTitle = (cardId: string, fallback: string) =>
    titleByCardId.get(cardId) ?? fallback;
  const visible = new Set(visibleCardIds);
  const metricByCardId = new Map<string, ReportMetric>([
    [
      "occupancy_current_total",
      {
        description: history?.as_of
          ? `Fonte em ${formatDateTime(history.as_of, timeZone)}`
          : "Leitura atual indisponível",
        label: resolveTitle("occupancy_current_total", "Última leitura"),
        value: reportOccupancyValue(currentTotal),
      },
    ],
    [
      "occupancy_average",
      {
        label: resolveTitle("occupancy_average", "Média hoje"),
        value: reportOccupancyValue(todayMetric.average),
      },
    ],
    [
      "occupancy_minimum",
      {
        label: resolveTitle("occupancy_minimum", "Mínimo hoje"),
        value: reportOccupancyValue(todayMetric.minimum),
      },
    ],
    [
      "occupancy_peak",
      {
        label: resolveTitle("occupancy_peak", "Máximo hoje"),
        value: reportOccupancyValue(todayMetric.peak),
      },
    ],
    [
      "occupancy_alerts",
      {
        description: alertsError
          ? "Dados de alertas indisponíveis nesta atualização."
          : "Até 12 alertas mais recentes do cenário.",
        label: resolveTitle("occupancy_alerts", "Alertas recentes"),
        value: alertsError ? "—" : alerts.length,
      },
    ],
    [
      "occupancy_active_areas",
      {
        label: resolveTitle("occupancy_active_areas", "Áreas ocupadas"),
        value: reportOccupancyValue(activeAreas),
      },
    ],
  ]);

  occupancyDurationReportMetrics.forEach(({ cardId, metric }) => {
    metricByCardId.set(cardId, {
      ...metric,
      label: resolveTitle(cardId, metric.label),
    });
  });

  customWidgets.forEach((widget) => {
    if (widget.kind !== "metric") return;
    const cardId = `occupancy_custom_${widget.id}`;
    const presentation = occupancyCustomMetricPresentation(widget.metric, {
      activeAreas,
      alertCount: alertsError ? null : alerts.length,
      average: todayMetric.average,
      current: currentTotal,
      minimum: todayMetric.minimum,
      peak: todayMetric.peak,
      utilization,
    });
    metricByCardId.set(cardId, {
      description: presentation.description,
      label: resolveTitle(cardId, widget.title),
      value:
        presentation.value === null
          ? "—"
          : typeof presentation.value === "number"
            ? reportOccupancyValue(presentation.value)
            : presentation.value,
    });
  });

  const chartByCardId = new Map<string, ReportChart>();
  if (scenario) {
    chartDefinitions.forEach((definition) => {
      const state = chartData[definition.id];
      if (!state || state.error) return;
      chartByCardId.set(
        definition.id,
        buildOccupancyReportChart({
          chartType: chartTypeByCardId.get(definition.id),
          color: colorByCardId.get(definition.id),
          definition,
          metricVisibility,
          palette,
          points: state.points,
          scenario,
          title: resolveTitle(definition.id, definition.label),
        }),
      );
    });

    customWidgets.forEach((widget) => {
      if (widget.kind !== "trend") return;
      const cardId = `occupancy_custom_${widget.id}`;
      const sourceDefinition = chartDefinitions.find(
        (definition) => definition.granularity === widget.granularity,
      );
      const state = sourceDefinition
        ? chartData[sourceDefinition.id]
        : undefined;
      if (!sourceDefinition || !state || state.error) return;
      chartByCardId.set(
        cardId,
        buildOccupancyReportChart({
          chartType: chartTypeByCardId.get(cardId),
          color: colorByCardId.get(cardId),
          definition: { ...sourceDefinition, id: cardId, label: widget.title },
          metricVisibility: widget.series,
          palette,
          points: state.points,
          scenario,
          title: resolveTitle(cardId, widget.title),
        }),
      );
    });
  }

  occupancyComparisonReportAssets.forEach(({ cardId, chart }) => {
    const title = resolveTitle(cardId, chart.title);
    chartByCardId.set(cardId, {
      ...chart,
      table: {
        ...chart.table,
        title: `Dados - ${title}`,
      },
      title,
    });
  });
  const durationChartsByCardId = new Map<string, ReportChart[]>();
  [
    ...occupancyDurationReportAssets.filter(
      ({ cardId }) => cardId !== OCCUPANCY_LOITERING_AVERAGE_CARD_ID,
    ),
    ...occupancyDurationInsightReportAssets,
    ...occupancyLoiteringReportAssets,
  ].forEach(({ cardId, chart, titleSuffix = "" }) => {
    const title = `${resolveTitle(cardId, chart.title)}${titleSuffix}`;
    const current = durationChartsByCardId.get(cardId) ?? [];
    current.push({
      ...chart,
      table: {
        ...chart.table,
        title: `Dados - ${title}`,
      },
      title,
    });
    durationChartsByCardId.set(cardId, current);
  });

  const tables: ReportTable[] = [];
  if (scenario && visible.has("occupancy_scenario_detail")) {
    tables.push({
      columns: [
        { key: "label", label: "Área" },
        { key: "value", label: "Ocupação", numeric: true },
      ],
      description: "Último valor disponível por área do cenário.",
      rows: scenario.areas.map((area) => ({
        label: area.label || "Área sem nome",
        value:
          history?.areas?.find(
            (item) =>
              item.area_id === area.area_id &&
              item.camera_id === area.camera_id,
          )?.value ?? null,
      })),
      title: resolveTitle("occupancy_scenario_detail", "Áreas do cenário"),
    });
  }
  if (visible.has("occupancy_alert_list") && !alertsError) {
    tables.push({
      columns: [
        { key: "time", label: "Ocorrido em" },
        { key: "kind", label: "Limite" },
        { key: "value", label: "Ocupação", numeric: true },
        { key: "threshold", label: "Valor do limite", numeric: true },
      ],
      description: "Alertas recentes do cenário.",
      rows: alerts.map((alert) => ({
        kind: alert.threshold_kind === "min" ? "Mínimo" : "Máximo",
        threshold: alert.threshold_value ?? null,
        time: alert.triggered_at
          ? formatDateTime(alert.triggered_at, timeZone)
          : "—",
        value: alert.total_value ?? null,
      })),
      title: resolveTitle("occupancy_alert_list", "Histórico de alertas"),
    });
  }

  return {
    charts: visibleCardIds.flatMap((cardId) => {
      const durationCharts = durationChartsByCardId.get(cardId);
      if (durationCharts) return durationCharts;
      const chart = chartByCardId.get(cardId);
      return chart ? [chart] : [];
    }),
    context: [
      scenario ? `Cenário: ${scenario.name}` : "Nenhum cenário selecionado",
      "Ordem, visibilidade, títulos, cores e tipo dos gráficos seguem a tela configurada.",
      ...occupancyDurationReportContext,
      ...(occupancyDurationInsightReportAssets.length
        ? [
            "Os mapas de tempo ocupado abrangem o mês atual desde o dia 1, no fuso da empresa. Mostram tempo do cenário ocupado, não permanência individual. Transições e ausência de leitura são identificadas separadamente.",
          ]
        : []),
      ...(occupancyLoiteringReportAssets.length
        ? [
            "A permanência considera sessões concluídas e estatísticas de duração por área. Sessões não equivalem necessariamente a pessoas únicas.",
          ]
        : []),
      ...occupancyDurationReportWarnings.map(
        (warning) => `Duração de ocupação: ${warning}`,
      ),
    ],
    dataCompleteUntil: occupancyReportDataCompleteUntil(
      history?.as_of ? new Date(history.as_of) : null,
      occupancyDurationDataCompleteUntil,
      occupancyDurationInsightDataCompleteUntil,
    ),
    filename: `ipxdata-ocupacao-${reportDateSlug(generatedAt, timeZone)}`,
    generatedAt,
    metrics: visibleCardIds.flatMap((cardId) => {
      const metric = metricByCardId.get(cardId);
      return metric ? [metric] : [];
    }),
    subtitle: "Ocupação do cenário e suas séries históricas.",
    tables,
    timeZone,
    title: scenario ? `Ocupação - ${scenario.name}` : "Ocupação",
  };
}

function occupancyReportDataCompleteUntil(
  historyCutoff: Date | null,
  ...durationCutoffs: (Date | null | undefined)[]
) {
  const validHistory =
    historyCutoff instanceof Date && Number.isFinite(historyCutoff.getTime())
      ? historyCutoff
      : null;
  // `undefined` means no duration widget participates in this view. `null`
  // means it does participate but one of its sources has no certified cutoff.
  const timestamps = validHistory ? [validHistory.getTime()] : [];
  for (const cutoff of durationCutoffs) {
    if (cutoff === undefined) continue;
    if (cutoff === null || !Number.isFinite(cutoff.getTime())) return null;
    timestamps.push(cutoff.getTime());
  }
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

function buildOccupancyReportChart({
  chartType = "bar",
  color,
  definition,
  metricVisibility,
  palette,
  points,
  scenario,
  title,
}: {
  chartType?: CardChartType;
  color?: string;
  definition: OccupancyChartDefinition;
  metricVisibility: OccupancyMetricVisibility;
  palette: OccupancyChartPalette;
  points: OccupancyPoint[];
  scenario: OccupancyScenario;
  title: string;
}): ReportChart {
  const reportPalette = color
    ? {
        ...palette,
        current: ensureGraphicContrast(color, "#FFFFFF"),
      }
    : palette;
  return {
    description: definition.description,
    option: buildOccupancyChartOption(
      definition,
      points,
      metricVisibility,
      {
        maximum: scenario.max_total ?? undefined,
        minimum: scenario.min_total ?? undefined,
      },
      reportPalette,
      chartType,
    ),
    table: {
      columns: [
        { key: "bucket", label: "Período" },
        { key: "current", label: "Valor no período", numeric: true },
        { key: "average", label: "Média", numeric: true },
        { key: "minimum", label: "Mínimo", numeric: true },
        { key: "peak", label: "Máximo", numeric: true },
      ],
      description: "Série histórica; períodos sem dados permanecem vazios.",
      rows: points.map((point) => ({
        average: point.average,
        bucket: point.label,
        current: point.current,
        minimum: point.minimum,
        peak: point.peak,
      })),
      title: `Dados - ${title}`,
    },
    title,
  };
}

function reportOccupancyValue(value: number | null) {
  return value === null ? "—" : formatOccupancyValue(value);
}

function reportDateSlug(date: Date, timeZone?: string) {
  if (timeZone) return companyDateKey(date, timeZone);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function occupancyCustomMetricPresentation(
  metric: OccupancyCustomMetric,
  values: {
    activeAreas: number | null;
    alertCount: number | null;
    average: number | null;
    current: number | null;
    minimum: number | null;
    peak: number | null;
    utilization: number | null;
  },
) {
  if (metric === "average") {
    return {
      description: "média disponível do dia",
      icon: Gauge,
      tone: "average" as const,
      value: values.average,
    };
  }
  if (metric === "minimum") {
    return {
      description: "menor ocupação do dia",
      icon: Activity,
      tone: "minimum" as const,
      value: values.minimum,
    };
  }
  if (metric === "peak") {
    return {
      description: "maior ocupação do dia",
      icon: BarChart3,
      tone: "maximum" as const,
      value: values.peak,
    };
  }
  if (metric === "alerts") {
    return {
      description: "alertas recentes do cenário",
      icon: Bell,
      tone: values.alertCount ? ("warning" as const) : ("slate" as const),
      value: values.alertCount,
    };
  }
  if (metric === "active_areas") {
    return {
      description: "áreas com ocupação maior que zero",
      icon: MapPinned,
      tone: "slate" as const,
      value: values.activeAreas,
    };
  }
  if (metric === "utilization") {
    return {
      description: "ocupação atual sobre a capacidade configurada",
      icon: Gauge,
      tone: "primary" as const,
      value:
        values.utilization === null
          ? null
          : `${formatOccupancyValue(values.utilization)}%`,
    };
  }
  return {
    description: "última leitura disponível",
    icon: UsersRound,
    tone: "primary" as const,
    value: values.current,
  };
}

function occupancyThresholdStatus(
  current: number,
  scenario: OccupancyScenario,
) {
  if (scenario.max_total !== null && scenario.max_total !== undefined) {
    if (current > scenario.max_total) {
      return {
        label: "acima do máximo",
        tone: "warning" as const,
      };
    }
  }

  if (scenario.min_total !== null && scenario.min_total !== undefined) {
    if (current < scenario.min_total) {
      return {
        label: "abaixo do mínimo",
        tone: "warning" as const,
      };
    }
  }

  return {
    label: "dentro dos limites",
    tone: "primary" as const,
  };
}

function thresholdLabel(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Sem limite"
    : formatOccupancyValue(value);
}

function occupancyDataScopeKey(
  companyScopeId?: string | null,
  scenarioId?: string | null,
  timeZone?: string | null,
) {
  if (!companyScopeId || !scenarioId) return "";
  return JSON.stringify([companyScopeId, scenarioId, timeZone ?? ""]);
}

function alignToGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
  timeZone?: string,
) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour")
    return timeZone
      ? startOfCompanyTimeZoneHour(date, timeZone)
      : startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function alignEndToGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
  timeZone?: string,
) {
  const aligned = alignToGranularity(date, granularity, timeZone);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity, timeZone);
}

function addGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
  timeZone?: string,
) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour")
    return timeZone
      ? endOfCompanyTimeZoneHour(date, timeZone)
      : endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  return addMonths(date, 1);
}

function bucketLabel(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
  timeZone?: string,
) {
  if (granularity === "minute") return formatTime(date, timeZone);
  if (granularity === "hour")
    return `${String(timeZone ? companyTimeZoneHour(date, timeZone) : date.getHours()).padStart(2, "0")}h`;
  if (granularity === "day") {
    const dayMonth = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);

    return `${weekdayShortName(date)} ${dayMonth}`;
  }
  if (granularity === "week") return weekOfMonthLabel(date);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatOccupancyValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value);
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
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
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
  return shiftOccupancyCalendarDate(next, diff);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function occupancyDashboardErrorMessage(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}
