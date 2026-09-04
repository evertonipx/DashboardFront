"use client";

import * as React from "react";
import {
  BarChart3,
  Clock3,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { AiAnalysisAction } from "@/components/app/deferred-ai-analysis-action";
import {
  CardLayout,
  ReorderModeButton,
  type LayoutCardRenderContext,
} from "@/components/app/card-layout";
import { buildCountingIntelligenceWidgetCards } from "@/components/app/counting-intelligence-report";
import { CountingReportPeriodControl } from "@/components/app/counting-report-period-control";
import {
  EChart,
  type EnterpriseChartOption,
} from "@/components/app/deferred-echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import {
  ScenarioComparisonCard,
  ScenarioComparisonConfigurator,
  createDefaultScenarioComparisonSettings,
  deleteScenarioComparisonSettings,
  saveScenarioComparisonSettings,
  type ScenarioComparisonAggregateSource,
  type ScenarioComparisonSettings,
} from "@/components/app/scenario-comparison-card";
import { applyChartTypePreference } from "@/lib/chart-type-preference";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import {
  WidgetTitleText,
  useWidgetColor,
} from "@/components/app/widget-appearance";
import { WidgetCardActions } from "@/components/app/widget-card-actions";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { hasVisualAdminAccess } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { canReadInfrastructureCatalogs } from "@/lib/permissions";
import {
  aggregateBucketInRange,
  endOfAggregateBucket,
  parseAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  clearHourlyAggregateCache,
  fetchBoundedHourlyAggregateRanges,
  type HourlyAggregateCache,
} from "@/lib/aggregate-hour-query";
import {
  fetchCompleteAggregateRange,
  type CompleteAggregateRequest,
} from "@/lib/aggregate-range-query";
import {
  reconcileAggregateRows,
} from "@/lib/aggregate-reconciliation";
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
  buildCountingIntelligenceModel,
  buildCountingIntelligenceReportAssets,
  COUNTING_INTELLIGENCE_CARD_IDS,
  type CountingIntelligenceModel,
} from "@/lib/counting-intelligence";
import {
  loadCountingReportViewSettings,
  saveCountingReportViewSettings,
  type CountingReportViewSettings,
} from "@/lib/counting-report-view-settings";
import {
  COUNTING_REPORT_HISTORY_YEARS,
  countingReportHistoryFrom,
  defaultCountingReportPeriod,
  effectiveCountingReportPeriodDates,
  formatCountingReportPeriod,
  loadCountingReportPeriod,
  saveCountingReportPeriod,
  type CountingReportPeriod,
} from "@/lib/counting-report-period";
import {
  loadDashboardFocus,
  resolveDashboardFocus,
  saveDashboardFocus,
} from "@/lib/dashboard-focus";
import {
  filterScopedApiRows,
  getEntityCompanyId,
  MASTER_COMPANY_SCOPE_EVENT,
  usesMasterCrossCompanyScope,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import { requireCertifiedCountingRuntimeTimeZone } from "@/lib/counting-time-zone";
import { companyCalendarDate } from "@/lib/company-time-zone";
import {
  requireCameraRows,
  requireInfrastructureRelations,
  requireLocationRows,
  requireSubLocationRows,
} from "@/lib/metadata-validation";
import {
  deleteReportCustomWidget,
  loadReportCustomWidgets,
  REPORT_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertReportCustomWidget,
  type ReportCustomWidget,
  type ReportCustomWidgetGranularity,
  type ReportCustomWidgetKind,
  type ReportCustomWidgetScopeMode,
  type ReportScopeCustomWidget,
} from "@/lib/report-custom-widgets";
import { requireScenarioRows } from "@/lib/scenario-validation";
import { abortRequest } from "@/lib/request-cancellation";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import { buildCombinedScenarioMultiplierMap } from "@/lib/scenario-analytics";
import type {
  ReportMetric,
  ReportPayload,
  ReportTable,
} from "@/lib/report-export";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Camera,
  Location,
  Scenario,
  SubLocation,
} from "@/lib/types";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { cn, formatDateTime, formatNumber, formatTime } from "@/lib/utils";
import type { CardScenarioSelection } from "@/lib/view-preferences";
import {
  resolveWidgetScenarios,
  widgetScenarioSelectionLabel,
} from "@/lib/widget-scenario-selection";

type ScenarioReportsDashboardProps = {
  manager?: boolean;
};

type MetadataLoadOptions = {
  force?: boolean;
  silent?: boolean;
};

type ScenarioAggregateDefinition = {
  id: string;
  label: string;
  description: string;
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
};

type ScenarioChartState = {
  rows: AggregateEventRow[];
  granularity: AggregateGranularity;
  error?: string;
  comparisonBaseError?: string | null;
};

type ChartPoint = {
  bucket: string;
  label: string;
  total: number;
};

type ReportScopeMode = "scenario" | "location" | "sub_location";

type ReportScopeOption = {
  cameraIds: string[];
  description: string;
  id: string;
  mode: ReportScopeMode;
  name: string;
  group?: CameraGroup;
  location?: Location;
  parentName?: string;
  scenario?: Scenario;
  scenarios?: Scenario[];
  subLocation?: SubLocation;
};

type ReportCustomWidgetForm = {
  comparisonSettings: ScenarioComparisonSettings;
  granularity: ReportCustomWidgetGranularity;
  kind: ReportCustomWidgetKind;
  scopeId: string;
  scopeMode: ReportCustomWidgetScopeMode;
  title: string;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_AI_DAILY_ROWS = 2_000;
const COUNTING_DIRECTIONAL_PROFILE_DAYS = 7;
const PREVIOUS_SUFFIX = "__previous";
const CURRENT_HOUR_MINUTES_ID = "report_current_hour_minutes";
const CURRENT_MONTH_DAYS_ID = "report_current_month_days";
const COUNTING_HOUR_HISTORY_ID = "report_counting_hour_history";
const COUNTING_MONTH_HISTORY_ID = "report_counting_month_history";
const COUNTING_DAY_HEATMAP_ID = "report_counting_day_heatmap_source";
const COUNTING_INTELLIGENCE_MONTH_CARD_ID_SET = new Set<string>([
  COUNTING_INTELLIGENCE_CARD_IDS.periodTotal,
  COUNTING_INTELLIGENCE_CARD_IDS.endMonth,
  COUNTING_INTELLIGENCE_CARD_IDS.monthlyAverage,
  COUNTING_INTELLIGENCE_CARD_IDS.accessLeader,
  COUNTING_INTELLIGENCE_CARD_IDS.annualComparison,
  COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison,
  COUNTING_INTELLIGENCE_CARD_IDS.yearOverYearMonth,
  COUNTING_INTELLIGENCE_CARD_IDS.accessRanking,
  COUNTING_INTELLIGENCE_CARD_IDS.monthYearHeatmap,
]);
const COUNTING_INTELLIGENCE_HOUR_CARD_ID_SET = new Set<string>([
  COUNTING_INTELLIGENCE_CARD_IDS.directionalFlow,
]);
const COUNTING_INTELLIGENCE_OPEN_COMPARISON_CARD_ID_SET = new Set<string>([
  COUNTING_INTELLIGENCE_CARD_IDS.periodTotal,
  COUNTING_INTELLIGENCE_CARD_IDS.endMonth,
  COUNTING_INTELLIGENCE_CARD_IDS.monthlyAverage,
  COUNTING_INTELLIGENCE_CARD_IDS.annualComparison,
  COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison,
  COUNTING_INTELLIGENCE_CARD_IDS.yearOverYearMonth,
]);
const COUNTING_OPEN_CURRENT_DAYS_ID =
  "report_counting_open_current_days";
const COUNTING_OPEN_PREVIOUS_DAYS_ID =
  "report_counting_open_previous_days";
const COUNTING_OPEN_CURRENT_HOURS_ID =
  "report_counting_open_current_hours";
const COUNTING_OPEN_PREVIOUS_HOURS_ID =
  "report_counting_open_previous_hours";
const REPORT_CUSTOM_WIDGET_GRANULARITY_OPTIONS: {
  label: string;
  value: ReportCustomWidgetGranularity;
}[] = [
  { label: "Minuto a minuto", value: "minute" },
  { label: "Hora a hora", value: "hour" },
  { label: "Dia a dia", value: "day" },
  { label: "Semana a semana", value: "week" },
  { label: "Mês a mês", value: "month" },
  { label: "Semestre a semestre", value: "semester" },
  { label: "Ano a ano", value: "year" },
];

function createPendingCountingIntelligenceModel({
  companyTimeZone,
  directionalPeriod,
  now,
  period,
  scopeName,
}: {
  companyTimeZone: string;
  directionalPeriod: { from: Date; to: Date };
  now: Date;
  period: { from: Date; to: Date };
  scopeName: string;
}): CountingIntelligenceModel {
  const periodFrom = new Date(period.from);
  const periodTo = new Date(period.to);
  const periodEnd = new Date(
    periodTo > periodFrom ? periodTo.getTime() - 1 : periodFrom.getTime(),
  );
  const periodMonthCount = Math.max(
    0,
    (periodTo.getFullYear() - periodFrom.getFullYear()) * 12 +
      periodTo.getMonth() -
      periodFrom.getMonth(),
  );
  const dayHeatmapDefinition = buildCountingDayHeatmapDefinition(
    period,
    now,
    companyTimeZone,
  );
  const dayMonthHeatmapYear = countingDayHeatmapYear(period);

  return {
    accesses: [],
    accessHours: [],
    currentMonth: periodEnd.getMonth(),
    currentMonthDelta: null,
    currentMonthValue: 0,
    currentYear: periodEnd.getFullYear(),
    dayMonthHeatmapCells: Array.from({ length: 12 * 31 }, (_, index) => {
      const month = Math.floor(index / 31);
      const day = (index % 31) + 1;
      const date = new Date(dayMonthHeatmapYear, month, day);
      return {
        date:
          date.getFullYear() === dayMonthHeatmapYear &&
          date.getMonth() === month &&
          date.getDate() === day
            ? date
            : null,
        day,
        month,
        total: null,
      };
    }),
    dayMonthHeatmapFrom: new Date(dayHeatmapDefinition.from),
    dayMonthHeatmapTo: new Date(dayHeatmapDefinition.to),
    dayMonthHeatmapYear,
    directionalPeriodFrom: new Date(directionalPeriod.from),
    directionalPeriodTo: new Date(directionalPeriod.to),
    directionalHours: Array.from({ length: 24 }, (_, hour) => ({
      entry: 0,
      exit: 0,
      hour,
      total: 0,
    })),
    periodAverage: 0,
    periodComparisonLimited: false,
    periodComparisonMonthCount: periodMonthCount,
    periodDelta: null,
    periodFrom,
    periodMonthCount,
    periodTo,
    periodValue: 0,
    previousPeriodAverage: 0,
    previousYearAverage: 0,
    scopeName,
    yearOverYearMonths: [],
    yearRows: [],
    ytdDelta: null,
    ytdValue: 0,
  };
}

export function ScenarioReportsDashboard({
  manager = false,
}: ScenarioReportsDashboardProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(
    user,
    companyScopeId,
  );
  const rawCompanyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const companyTimeZoneResolution = React.useMemo(
    () => ({
      fallback: rawCompanyTimeZoneResolution.fallback,
      source: rawCompanyTimeZoneResolution.fallback
        ? ("fallback" as const)
        : ("deployment-default" as const),
      timeZone: rawCompanyTimeZoneResolution.timeZone,
    }),
    [
      rawCompanyTimeZoneResolution.fallback,
      rawCompanyTimeZoneResolution.timeZone,
    ],
  );
  const companyTimeZone = companyTimeZoneResolution.timeZone;
  const customGranularitySelectId = React.useId();
  const customKindSelectId = React.useId();
  const customScopeModeSelectId = React.useId();
  const customScopeSelectId = React.useId();
  const reportScopeModeSelectId = React.useId();
  const reportScopeSelectId = React.useId();
  const reportSettingsPanelId = React.useId();
  const canEditVisual = hasVisualAdminAccess(user);
  const infrastructureCatalogsAllowed = canReadInfrastructureCatalogs(user);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [cameras, setCameras] = React.useState<Camera[]>([]);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [subLocations, setSubLocations] = React.useState<SubLocation[]>([]);
  const [cameraGroups, setCameraGroups] = React.useState<CameraGroup[]>([]);
  const cameraGroupsRef = React.useRef<CameraGroup[]>([]);
  const [scopeMode, setScopeMode] = React.useState<ReportScopeMode>("scenario");
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, ScenarioChartState>
  >({});
  const [comparisonReportCharts, setComparisonReportCharts] = React.useState<
    Record<string, ReportPayload["charts"][number]>
  >({});
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState(
    () => loadLiveDashboardSettings(companyScopeId).showPreviousPeriod,
  );
  const [intradayComparison, setIntradayComparison] =
    React.useState<IntradayComparisonMode>(
      () => loadLiveDashboardSettings(companyScopeId).intradayComparison,
    );
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [chartLoadError, setChartLoadError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [reportRequested, setReportRequested] = React.useState(false);
  const [comparisonRefreshRevision, setComparisonRefreshRevision] =
    React.useState(0);
  const [clock, setClock] = React.useState(() => new Date());
  const [countingPeriod, setCountingPeriod] =
    React.useState<CountingReportPeriod>(() => defaultCountingReportPeriod());
  const [appliedCountingPeriod, setAppliedCountingPeriod] =
    React.useState<CountingReportPeriod>(() => defaultCountingReportPeriod());
  const [countingViewSettings, setCountingViewSettings] =
    React.useState<CountingReportViewSettings>(() =>
      loadCountingReportViewSettings(companyScopeId, { userId: user?.id }),
    );
  const [settingsReadyScopeKey, setSettingsReadyScopeKey] =
    React.useState("");
  const [customWidgets, setCustomWidgets] = React.useState<
    ReportCustomWidget[]
  >([]);
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [reportSettingsOpen, setReportSettingsOpen] = React.useState(false);
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const metadataRequestSequenceRef = React.useRef(0);
  const metadataRequestControllerRef = React.useRef<AbortController | null>(
    null,
  );
  const activeMetadataRequestKeyRef = React.useRef("");
  const completedMetadataRequestKeyRef = React.useRef("");
  const metadataConsumerAttachedRef = React.useRef(false);
  const metadataAbortTimerRef = React.useRef<number | null>(null);
  const focusRef = React.useRef({ scopeMode, selectedId });
  const chartRequestSequenceRef = React.useRef(0);
  const chartRequestControllerRef = React.useRef<AbortController | null>(null);
  const activeChartQueryKeyRef = React.useRef("");
  const completedChartQueryKeyRef = React.useRef("");
  const hourlyAggregateCacheRef = React.useRef<HourlyAggregateCache>(new Map());
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<ReportCustomWidgetForm>({
      comparisonSettings: createDefaultScenarioComparisonSettings(),
      granularity: "hour",
      kind: "scope",
      scopeId: "",
      scopeMode: "scenario",
      title: "",
    });
  const updateComparisonReportChart = React.useCallback(
    (
      key: string,
      chart: ReportPayload["charts"][number] | null,
    ) => {
      setComparisonReportCharts((current) => {
        if (chart) {
          if (current[key] === chart) return current;
          return { ...current, [key]: chart };
        }
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const availableModes = React.useMemo(
    () =>
      buildReportScopeModes({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        scenarios,
        subLocations,
      }),
    [cameraGroups, cameras, locations, manager, scenarios, subLocations],
  );
  const scopeOptions = React.useMemo(
    () =>
      buildReportScopeOptions({
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
  const customWidgetScopeOptions = React.useMemo(
    () =>
      buildReportScopeOptions({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        mode: customWidgetForm.scopeMode,
        scenarios,
        subLocations,
      }),
    [
      cameraGroups,
      cameras,
      customWidgetForm.scopeMode,
      locations,
      manager,
      scenarios,
      subLocations,
    ],
  );
  const selectedScope = React.useMemo(
    () => scopeOptions.find((option) => option.id === selectedId) ?? null,
    [scopeOptions, selectedId],
  );
  const reportContextKey = `${companyScopeId}|${selectedScope?.id ?? ""}`;
  const latestReportContextKeyRef = React.useRef(reportContextKey);
  React.useEffect(() => {
    if (latestReportContextKeyRef.current !== reportContextKey) {
      setComparisonReportCharts({});
    }
    latestReportContextKeyRef.current = reportContextKey;
  }, [reportContextKey]);
  const clockYear = clock.getFullYear();
  const clockMonth = clock.getMonth();
  const reportReferenceDate = React.useMemo(
    () => new Date(clockYear, clockMonth, 1),
    [clockMonth, clockYear],
  );
  const effectivePeriodDates = React.useMemo(
    () =>
      effectiveCountingReportPeriodDates(
        appliedCountingPeriod,
        countingViewSettings.includeOpenPeriod,
        reportReferenceDate,
      ),
    [
      appliedCountingPeriod,
      countingViewSettings.includeOpenPeriod,
      reportReferenceDate,
    ],
  );
  const effectivePeriodFromTime = effectivePeriodDates.from.getTime();
  const effectivePeriodToTime = effectivePeriodDates.to.getTime();
  const reportCoverageToTime = reportCoverageEnd(
    effectivePeriodDates,
    clock,
  ).getTime();
  const reportPeriodLabel = `${formatCountingReportPeriod(
    appliedCountingPeriod,
  )} · ${
    countingViewSettings.includeOpenPeriod
      ? "inclui mês em andamento"
      : "somente meses fechados"
  }`;
  const reportPeriodOverride = React.useMemo(
    () => ({
      from: new Date(effectivePeriodFromTime),
      to: new Date(reportCoverageToTime),
      label: reportPeriodLabel,
    }),
    [effectivePeriodFromTime, reportCoverageToTime, reportPeriodLabel],
  );
  const countingDirectionalDefinition = React.useMemo(
    () =>
      buildCountingHourHistoryDefinition(
        {
          from: new Date(effectivePeriodFromTime),
          to: new Date(effectivePeriodToTime),
        },
        new Date(Math.max(effectivePeriodFromTime, reportCoverageToTime - 1)),
      ),
    [
      effectivePeriodFromTime,
      effectivePeriodToTime,
      reportCoverageToTime,
    ],
  );
  const chartDefinitions = React.useMemo(
    () => buildScenarioAggregateDefinitions(clock, effectivePeriodDates),
    [clock, effectivePeriodDates],
  );
  const countingPeriodPending =
    countingPeriod.from !== appliedCountingPeriod.from ||
    countingPeriod.to !== appliedCountingPeriod.to;
  const preferenceScope = React.useMemo(
    () => ({ userId: user?.id, viewId: selectedScope?.id }),
    [selectedScope?.id, user?.id],
  );
  const reportSettingsScopeKey = `${companyScopeId ?? ""}|${
    selectedScope?.id ?? ""
  }|${user?.id ?? ""}`;
  const metadataRequestKey = [
    companyScopeId ?? "",
    userId ?? "",
    manager ? "manager" : "operator",
    infrastructureCatalogsAllowed ? "infrastructure" : "scenarios-only",
  ].join("|");
  const reportCardIds = React.useMemo(
    () => [
      ...Object.values(COUNTING_INTELLIGENCE_CARD_IDS),
      ...(scenarios.length ? ["report_scenario_period_comparison"] : []),
      ...customWidgets.map((widget) => `report_custom_${widget.id}`),
    ],
    [customWidgets, scenarios.length],
  );
  const reportCardIdsKey = reportCardIds.join("|");
  const reportPreferences = useCardPreferences(
    "reports",
    reportCardIds,
    companyScopeId,
    {
      userId: user?.id,
      viewId: selectedScope?.id,
    },
  );
  const visibleReportCardIds = React.useMemo(() => {
    const cardIdSet = new Set(
      reportCardIdsKey ? reportCardIdsKey.split("|") : [],
    );
    const preferenceIds = new Set(
      reportPreferences.map((preference) => preference.id),
    );
    const ordered = reportPreferences
      .filter(
        (preference) => preference.visible && cardIdSet.has(preference.id),
      )
      .map((preference) => preference.id);
    const missing = Array.from(cardIdSet).filter(
      (id) => !preferenceIds.has(id),
    );

    return [...ordered, ...missing];
  }, [reportCardIdsKey, reportPreferences]);
  const visibleReportCardIdsKey = React.useMemo(
    () => [...visibleReportCardIds].sort().join("|"),
    [visibleReportCardIds],
  );
  const visibleReportCardIdSet = React.useMemo(
    () => new Set(visibleReportCardIds),
    [visibleReportCardIds],
  );
  const requiredCustomGranularitiesKey = React.useMemo(
    () =>
      Array.from(
        new Set(
          customWidgets.flatMap((widget) =>
            widget.kind === "scope" &&
            visibleReportCardIdSet.has(`report_custom_${widget.id}`)
              ? [widget.granularity]
              : [],
          ),
        ),
      )
        .sort()
        .join("|"),
    [customWidgets, visibleReportCardIdSet],
  );
  const countingIntelligenceMonthRequired = React.useMemo(
    () =>
      visibleReportCardIds.some((cardId) =>
        COUNTING_INTELLIGENCE_MONTH_CARD_ID_SET.has(cardId),
      ),
    [visibleReportCardIds],
  );
  const countingIntelligenceDayRequired = React.useMemo(
    () =>
      visibleReportCardIds.includes(
        COUNTING_INTELLIGENCE_CARD_IDS.dayMonthHeatmap,
      ),
    [visibleReportCardIds],
  );
  const countingDayHeatmapPeriod = React.useMemo(
    () =>
      countingIntelligenceDayRequired
        ? buildCountingDayHeatmapDefinition(
            {
              from: new Date(effectivePeriodFromTime),
              to: new Date(effectivePeriodToTime),
            },
            clock,
            companyTimeZone,
          )
        : undefined,
    [
      clock,
      companyTimeZone,
      countingIntelligenceDayRequired,
      effectivePeriodFromTime,
      effectivePeriodToTime,
    ],
  );
  const countingIntelligenceHourRequired = React.useMemo(
    () =>
      visibleReportCardIds.some((cardId) =>
        COUNTING_INTELLIGENCE_HOUR_CARD_ID_SET.has(cardId),
      ),
    [visibleReportCardIds],
  );
  const countingIntelligenceOpenComparisonRequired = React.useMemo(
    () =>
      visibleReportCardIds.some((cardId) =>
        COUNTING_INTELLIGENCE_OPEN_COMPARISON_CARD_ID_SET.has(cardId),
      ),
    [visibleReportCardIds],
  );
  const visibleCustomHourRequired = requiredCustomGranularitiesKey
    .split("|")
    .includes("hour");
  const canonicalHistoryRequired = countingIntelligenceHourRequired;
  const currentHourReconciliationRequired =
    canonicalHistoryRequired || visibleCustomHourRequired;
  const customComparisonRequired = Boolean(requiredCustomGranularitiesKey);
  const chartQueryKey = React.useMemo(
    () =>
      JSON.stringify([
        companyScopeId ?? "",
        companyTimeZone,
        effectivePeriodDates.from.toISOString(),
        effectivePeriodDates.to.toISOString(),
        countingViewSettings.includeOpenPeriod,
        customComparisonRequired && showPreviousPeriod,
        customComparisonRequired && showPreviousPeriod
          ? intradayComparison
          : "none",
        requiredCustomGranularitiesKey,
        canonicalHistoryRequired,
        countingIntelligenceDayRequired,
        countingIntelligenceMonthRequired,
        countingIntelligenceOpenComparisonRequired,
        currentHourReconciliationRequired,
      ]),
    [
      canonicalHistoryRequired,
      companyScopeId,
      companyTimeZone,
      countingIntelligenceDayRequired,
      countingViewSettings.includeOpenPeriod,
      customComparisonRequired,
      effectivePeriodDates,
      intradayComparison,
      countingIntelligenceMonthRequired,
      countingIntelligenceOpenComparisonRequired,
      currentHourReconciliationRequired,
      requiredCustomGranularitiesKey,
      showPreviousPeriod,
    ],
  );

  const loadScenarios = React.useCallback(async (
    { force = false, silent = false }: MetadataLoadOptions = {},
  ) => {
    if (
      !force &&
      (activeMetadataRequestKeyRef.current === metadataRequestKey ||
        completedMetadataRequestKeyRef.current === metadataRequestKey)
    ) {
      return;
    }

    const requestSequence = ++metadataRequestSequenceRef.current;
    if (metadataRequestControllerRef.current) {
      abortRequest(
        metadataRequestControllerRef.current,
        "A consulta anterior de cenários foi substituída.",
      );
    }
    const controller = new AbortController();
    metadataRequestControllerRef.current = controller;
    activeMetadataRequestKeyRef.current = metadataRequestKey;
    if (force) completedMetadataRequestKeyRef.current = "";
    if (!silent) {
      setLoadingScenarios(true);
      setMetadataError("");
    }
    try {
      const [scenarioRows, cameraRows, locationRows] = await Promise.all([
        apiFetch<unknown>("/scenarios", {
          companyScopeId,
          signal: controller.signal,
        }),
        infrastructureCatalogsAllowed
          ? apiFetch<unknown>("/cameras", {
              companyScopeId,
              signal: controller.signal,
            })
          : Promise.resolve([]),
        infrastructureCatalogsAllowed
          ? apiFetch<unknown>("/locations", {
              companyScopeId,
              signal: controller.signal,
            })
          : Promise.resolve([]),
      ]);
      const scenarioPayload = masterCrossCompanyScope
        ? selectExplicitCompanyScopedRows(scenarioRows, companyScopeId, {
            label: "cenários de Contagem",
          }).rows
        : scenarioRows;
      const cameraPayload = masterCrossCompanyScope
        ? selectExplicitCompanyScopedRows(cameraRows, companyScopeId, {
            label: "câmeras",
          }).rows
        : cameraRows;
      const locationPayload = masterCrossCompanyScope
        ? selectExplicitCompanyScopedRows(locationRows, companyScopeId, {
            label: "locais",
          }).rows
        : locationRows;
      const data = requireScenarioRows(scenarioPayload, companyScopeId);
      const scopedScenarios = filterScopedApiRows(data, companyScopeId);
      const scopedCameras = filterScopedApiRows(
        requireCameraRows(cameraPayload, companyScopeId),
        companyScopeId,
      );
      const scopedLocations = filterScopedApiRows(
        requireLocationRows(locationPayload, companyScopeId),
        companyScopeId,
      );
      const subLocationRows = await fetchSubLocations(
        scopedLocations,
        companyScopeId,
        controller.signal,
        masterCrossCompanyScope,
      );
      requireInfrastructureRelations({
        cameras: scopedCameras,
        locations: scopedLocations,
        subLocations: subLocationRows,
      });
      const visible = manager
        ? scopedScenarios
        : scopedScenarios.filter((scenario) => scenario.active);

      if (
        controller.signal.aborted ||
        !metadataConsumerAttachedRef.current ||
        requestSequence !== metadataRequestSequenceRef.current ||
        activeMetadataRequestKeyRef.current !== metadataRequestKey
      ) {
        return;
      }
      setMetadataError("");
      setScenarios(visible);
      setCameras(scopedCameras);
      setLocations(scopedLocations);
      setSubLocations(subLocationRows);
      const modes = buildReportScopeModes({
        cameras: scopedCameras,
        groups: cameraGroupsRef.current,
        locations: scopedLocations,
        manager,
        scenarios: visible,
        subLocations: subLocationRows,
      });
      const resolvedFocus = resolveDashboardFocus<ReportScopeMode>({
        availableModes: modes.map((mode) => mode.value),
        current: focusRef.current,
        getOptions: (mode) =>
          buildReportScopeOptions({
            cameras: scopedCameras,
            groups: cameraGroupsRef.current,
            locations: scopedLocations,
            manager,
            mode,
            scenarios: visible,
            subLocations: subLocationRows,
          }).map((option) => ({
            active: option.scenario?.active,
            id: option.id,
            mode: option.mode,
          })),
        stored: loadDashboardFocus<ReportScopeMode>(
          companyScopeId,
          userId,
          "reports",
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
      if (controller.signal.aborted) return;
      if (!metadataConsumerAttachedRef.current) return;
      if (requestSequence !== metadataRequestSequenceRef.current) return;
      if (activeMetadataRequestKeyRef.current !== metadataRequestKey) return;
      if (silent) return;
      const message = reportErrorMessage(
        error,
        "Não foi possível carregar as visões de relatório.",
      );
      setScenarios([]);
      setCameras([]);
      setLocations([]);
      setSubLocations([]);
      setSelectedId("");
      setChartData({});
      setMetadataError(message);
      toast.error(message);
    } finally {
      if (metadataRequestControllerRef.current === controller) {
        metadataRequestControllerRef.current = null;
      }
      if (activeMetadataRequestKeyRef.current === metadataRequestKey) {
        activeMetadataRequestKeyRef.current = "";
      }
      if (!silent && requestSequence === metadataRequestSequenceRef.current) {
        if (metadataConsumerAttachedRef.current) setLoadingScenarios(false);
      }
    }
  }, [
    companyScopeId,
    infrastructureCatalogsAllowed,
    manager,
    masterCrossCompanyScope,
    metadataRequestKey,
    userId,
  ]);

  const loadCharts = React.useCallback(
    async (
      _scope: ReportScopeOption,
      silent = false,
      force = false,
    ) => {
      if (
        !force &&
        (completedChartQueryKeyRef.current === chartQueryKey ||
          activeChartQueryKeyRef.current === chartQueryKey)
      ) {
        return;
      }

      if (force) {
        clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
      }
      const requestSequence = ++chartRequestSequenceRef.current;
      if (chartRequestControllerRef.current) {
        abortRequest(
          chartRequestControllerRef.current,
          "A consulta anterior do relatório foi substituída.",
        );
      }
      const controller = new AbortController();
      chartRequestControllerRef.current = controller;
      activeChartQueryKeyRef.current = chartQueryKey;
      if (!silent) setLoadingCharts(true);

      try {
        requireCertifiedCountingRuntimeTimeZone(companyTimeZoneResolution);
      } catch (error) {
        abortRequest(controller, "O fuso do relatório não foi certificado.");
        if (chartRequestControllerRef.current === controller) {
          chartRequestControllerRef.current = null;
        }
        if (activeChartQueryKeyRef.current === chartQueryKey) {
          activeChartQueryKeyRef.current = "";
        }
        const message = reportErrorMessage(
          error,
          "Fuso da empresa não disponível.",
        );
        setChartData({});
        setChartLoadError(message);
        setLastUpdated(null);
        setLoadingCharts(false);
        if (!silent) toast.error(message);
        return;
      }

      const now = new Date();
      const aggregateRequests = new Map<
        string,
        Promise<AggregateEventsResponse>
      >();
      const requestAggregate: CompleteAggregateRequest = (path) => {
        const pending = aggregateRequests.get(path);
        if (pending) return pending;
        const request = apiFetch<AggregateEventsResponse>(path, {
          companyScopeId,
          signal: controller.signal,
        });
        aggregateRequests.set(path, request);
        return request;
      };
      const definitions = buildScenarioAggregateDefinitions(
        now,
        effectivePeriodDates,
      );
      const visibleCardIds = new Set(
        visibleReportCardIdsKey ? visibleReportCardIdsKey.split("|") : [],
      );
      const requiredChartIds = new Set(
        customWidgets.flatMap((widget) =>
          widget.kind === "scope" &&
          visibleCardIds.has(`report_custom_${widget.id}`)
            ? [reportChartIdForGranularity(widget.granularity)]
            : [],
        ),
      );
      const visibleDefinitions = definitions.filter((definition) =>
        requiredChartIds.has(definition.id),
      );
      const countingDirectionalDefinition = canonicalHistoryRequired
        ? buildCountingHourHistoryDefinition(effectivePeriodDates, now)
        : null;
      const visibleDirectionalSource = countingDirectionalDefinition
        ? visibleDefinitions.find(
            (definition) =>
              definition.granularity === "hour" &&
              definition.from <= countingDirectionalDefinition.from &&
              definition.to >= countingDirectionalDefinition.to,
          )
        : undefined;
      const countingDayHeatmapDefinition = countingIntelligenceDayRequired
        ? buildCountingDayHeatmapDefinition(
            effectivePeriodDates,
            now,
            companyTimeZone,
          )
        : null;
      const visibleDayHeatmapSource = countingDayHeatmapDefinition
        ? visibleDefinitions.find(
            (definition) =>
              definition.granularity === "day" &&
              definition.from <= countingDayHeatmapDefinition.from &&
              definition.to >= countingDayHeatmapDefinition.to,
          )
        : undefined;
      const previousDefinitions = showPreviousPeriod
        ? visibleDefinitions.map((definition) =>
            buildComparisonDefinition(
              definition,
              intradayComparison,
              countingReportHistoryFrom(now),
            ),
          )
        : [];
      const supportDefinitions = [
        ...(canonicalHistoryRequired
          && !visibleDirectionalSource
          ? [
              countingDirectionalDefinition!,
            ]
          : []),
        ...(countingDayHeatmapDefinition && !visibleDayHeatmapSource
          ? [countingDayHeatmapDefinition]
          : []),
        ...(countingIntelligenceMonthRequired
          ? [
              buildCountingMonthHistoryDefinition(
                effectivePeriodDates,
                now,
                countingIntelligenceOpenComparisonRequired,
              ),
            ]
          : []),
        ...(countingIntelligenceOpenComparisonRequired
          ? buildCountingOpenComparisonDefinitions(
              effectivePeriodDates,
              now,
            )
          : []),
      ];
      if (
        currentHourReconciliationRequired &&
        now >= effectivePeriodDates.from &&
        now < effectivePeriodDates.to
      ) {
        supportDefinitions.push(buildCurrentHourMinutesDefinition(now));
      }

      try {
      const entries = await Promise.all(
          [...visibleDefinitions, ...previousDefinitions, ...supportDefinitions].map(async (definition) => {
            if (definition.to <= definition.from) {
              return [
                definition.id,
                { rows: [], granularity: definition.granularity },
              ] as const;
            }
            try {
              if (definition.granularity === "hour") {
                return [
                  definition.id,
                  {
                    granularity: "hour",
                    rows: await fetchBoundedHourlyAggregateRanges({
                      cache: hourlyAggregateCacheRef.current,
                      cacheScope: `reports:${companyScopeId ?? "jwt-company"}:${companyTimeZone}`,
                      companyScopeId: companyScopeId?.trim() || undefined,
                      now,
                      ranges: [definition],
                      signal: controller.signal,
                    }),
                  },
                ] as const;
              }

              return [
                definition.id,
                {
                  rows: await fetchCompleteAggregateRange({
                    companyScopeId: companyScopeId?.trim() || undefined,
                    from: definition.from,
                    granularity: definition.granularity,
                    request: requestAggregate,
                    signal: controller.signal,
                    to: definition.to,
                  }),
                  granularity: definition.granularity,
                },
              ] as const;
            } catch (error) {
              if (controller.signal.aborted) throw error;
              return [
                definition.id,
                {
                  rows: [],
                  granularity: definition.granularity,
                  error: reportErrorMessage(
                    error,
                    "Não foi possível carregar este período.",
                  ),
                },
              ] as const;
            }
          }),
        );
        if (requestSequence !== chartRequestSequenceRef.current) return;

        const loadedData = Object.fromEntries(entries) as Record<
          string,
          ScenarioChartState
        >;
        if (
          countingDirectionalDefinition &&
          visibleDirectionalSource &&
          !loadedData[COUNTING_HOUR_HISTORY_ID]
        ) {
          const sourceState = loadedData[visibleDirectionalSource.id];
          loadedData[COUNTING_HOUR_HISTORY_ID] = sourceState?.error
            ? { ...sourceState, rows: [] }
            : {
                granularity: "hour",
                rows: (sourceState?.rows ?? []).filter((row) =>
                  aggregateBucketInRange(
                    row.bucket,
                    "hour",
                    countingDirectionalDefinition.from,
                    countingDirectionalDefinition.to,
                  ),
                ),
              };
        }
        if (
          countingDayHeatmapDefinition &&
          visibleDayHeatmapSource &&
          !loadedData[COUNTING_DAY_HEATMAP_ID]
        ) {
          const sourceState = loadedData[visibleDayHeatmapSource.id];
          loadedData[COUNTING_DAY_HEATMAP_ID] = sourceState?.error
            ? { ...sourceState, rows: [] }
            : {
                granularity: "day",
                rows: (sourceState?.rows ?? []).filter((row) =>
                  aggregateBucketInRange(
                    row.bucket,
                    "day",
                    countingDayHeatmapDefinition.from,
                    countingDayHeatmapDefinition.to,
                  ),
                ),
              };
        }

        if (Object.values(loadedData).some((state) => state.error) && !silent) {
          toast.error(
            "Alguns dados ainda não puderam ser consolidados; os valores afetados foram mantidos como indisponíveis.",
          );
        }
        const nextData = hydrateScenarioOpenBuckets(
          loadedData,
          now,
          effectivePeriodDates,
        );
        setChartData(nextData);
        setChartLoadError("");
        setClock(now);
        setLastUpdated(new Date());
        completedChartQueryKeyRef.current = chartQueryKey;
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestSequence !== chartRequestSequenceRef.current) return;
        const message = reportErrorMessage(
          error,
          "Não foi possível carregar os relatórios.",
        );
        setChartLoadError(message);
        toast.error(message);
      } finally {
        if (chartRequestControllerRef.current === controller) {
          chartRequestControllerRef.current = null;
        }
        if (activeChartQueryKeyRef.current === chartQueryKey) {
          activeChartQueryKeyRef.current = "";
        }
        if (requestSequence === chartRequestSequenceRef.current) {
          setLoadingCharts(false);
        }
      }
    },
    [
      canonicalHistoryRequired,
      countingIntelligenceDayRequired,
      countingIntelligenceMonthRequired,
      countingIntelligenceOpenComparisonRequired,
      companyScopeId,
      chartQueryKey,
      companyTimeZone,
      companyTimeZoneResolution,
      customWidgets,
      effectivePeriodDates,
      intradayComparison,
      showPreviousPeriod,
      currentHourReconciliationRequired,
      visibleReportCardIdsKey,
    ],
  );

  React.useEffect(() => {
    if (settingsReadyScopeKey !== reportSettingsScopeKey) return;
    metadataConsumerAttachedRef.current = true;
    if (metadataAbortTimerRef.current !== null) {
      window.clearTimeout(metadataAbortTimerRef.current);
      metadataAbortTimerRef.current = null;
    }
    void loadScenarios();

    return () => {
      metadataConsumerAttachedRef.current = false;
      metadataAbortTimerRef.current = window.setTimeout(() => {
        metadataAbortTimerRef.current = null;
        if (metadataConsumerAttachedRef.current) return;
        metadataRequestSequenceRef.current += 1;
        if (metadataRequestControllerRef.current) {
          abortRequest(
            metadataRequestControllerRef.current,
            "A tela de relatórios foi fechada.",
          );
        }
        metadataRequestControllerRef.current = null;
        activeMetadataRequestKeyRef.current = "";
      }, 0);
    };
  }, [
    loadScenarios,
    metadataRequestKey,
    reportSettingsScopeKey,
    settingsReadyScopeKey,
  ]);

  React.useEffect(
    () => () => {
      chartRequestSequenceRef.current += 1;
      if (chartRequestControllerRef.current) {
        abortRequest(
          chartRequestControllerRef.current,
          "A tela de relatórios foi fechada.",
        );
      }
      chartRequestControllerRef.current = null;
    },
    [],
  );

  React.useEffect(() => {
    if (metadataRequestControllerRef.current) {
      abortRequest(
        metadataRequestControllerRef.current,
        "A empresa do relatório mudou.",
      );
    }
    metadataRequestControllerRef.current = null;
    activeMetadataRequestKeyRef.current = "";
    completedMetadataRequestKeyRef.current = "";
    chartRequestSequenceRef.current += 1;
    if (chartRequestControllerRef.current) {
      abortRequest(
        chartRequestControllerRef.current,
        "A empresa do relatório mudou.",
      );
    }
    chartRequestControllerRef.current = null;
    activeChartQueryKeyRef.current = "";
    completedChartQueryKeyRef.current = "";
    clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
    setMetadataError("");
    setChartLoadError("");
    setScenarios([]);
    setCameras([]);
    setLocations([]);
    setSubLocations([]);
    focusRef.current = { scopeMode: "scenario", selectedId: "" };
    setScopeMode("scenario");
    setSelectedId("");
    setChartData({});
    setLastUpdated(null);
    setReportRequested(false);
    setSettingsReadyScopeKey("");
  }, [companyScopeId]);

  React.useEffect(() => {
    const settings = loadLiveDashboardSettings(companyScopeId, preferenceScope);
    const storedCountingPeriod = loadCountingReportPeriod(
      companyScopeId,
      new Date(),
      preferenceScope,
    );
    setShowPreviousPeriod(settings.showPreviousPeriod);
    setIntradayComparison(settings.intradayComparison);
    setCountingPeriod(storedCountingPeriod);
    setAppliedCountingPeriod(storedCountingPeriod);
    setCountingViewSettings(
      loadCountingReportViewSettings(companyScopeId, preferenceScope),
    );
    setSettingsReadyScopeKey(reportSettingsScopeKey);
    // Reports are an intentional ready-to-read surface: restore the user's
    // saved range (four years for a first visit) and issue exactly one
    // deduplicated query as soon as its scope is ready.
    setReportRequested(true);
  }, [companyScopeId, preferenceScope, reportSettingsScopeKey]);

  React.useEffect(() => {
    function syncCameraGroups() {
      const scopeId = resolveCameraGroupCompanyScope(user);
      const nextGroups = readCameraGroups(scopeId);
      cameraGroupsRef.current = nextGroups;
      setCameraGroups(nextGroups);
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
    function syncCustomWidgets() {
      setCustomWidgets(
        loadReportCustomWidgets(companyScopeId, preferenceScope),
      );
    }

    syncCustomWidgets();
    window.addEventListener(
      REPORT_CUSTOM_WIDGETS_UPDATED_EVENT,
      syncCustomWidgets,
    );
    window.addEventListener("storage", syncCustomWidgets);
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCustomWidgets);

    return () => {
      window.removeEventListener(
        REPORT_CUSTOM_WIDGETS_UPDATED_EVENT,
        syncCustomWidgets,
      );
      window.removeEventListener("storage", syncCustomWidgets);
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCustomWidgets);
    };
  }, [companyScopeId, preferenceScope]);

  React.useEffect(() => {
    setCustomWidgetForm((current) => {
      if (
        current.scopeId &&
        customWidgetScopeOptions.some((option) => option.id === current.scopeId)
      ) {
        return current;
      }

      const nextScope = customWidgetScopeOptions[0];
      return {
        ...current,
        scopeId: nextScope?.id ?? "",
        title:
          current.title ||
          (nextScope
            ? buildReportCustomWidgetDefaultTitle(
                nextScope,
                current.granularity,
              )
            : ""),
      };
    });
  }, [customWidgetScopeOptions]);

  React.useEffect(() => {
    focusRef.current = { scopeMode, selectedId };
  }, [scopeMode, selectedId]);

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
    if (!selectedScope) return;
    const entityCompanyId = getEntityCompanyId(
      selectedScope.scenario ??
        selectedScope.location ??
        selectedScope.subLocation,
    );
    if (entityCompanyId && entityCompanyId !== companyScopeId) return;
    saveDashboardFocus(
      { scopeMode: selectedScope.mode, selectedId: selectedScope.id },
      companyScopeId,
      userId,
      "reports",
    );
  }, [companyScopeId, selectedScope, userId]);

  React.useEffect(() => {
    if (!selectedScope) {
      chartRequestSequenceRef.current += 1;
      if (chartRequestControllerRef.current) {
        abortRequest(
          chartRequestControllerRef.current,
          "Nenhuma visão de relatório está selecionada.",
        );
      }
      chartRequestControllerRef.current = null;
      setChartLoadError("");
      setChartData({});
      return;
    }

    if (settingsReadyScopeKey !== reportSettingsScopeKey) return;
    // Loading the catalog and restoring the saved period must not start the
    // historical aggregate. The first query belongs to Apply/Refresh.
    if (!reportRequested) return;

    void loadCharts(selectedScope);
  }, [
    loadCharts,
    reportRequested,
    reportSettingsScopeKey,
    selectedScope,
    settingsReadyScopeKey,
  ]);

  function updateShowPreviousPeriod(value: boolean) {
    setShowPreviousPeriod(value);
    saveLiveDashboardSettings(
      {
        intradayComparison,
        showPreviousPeriod: value,
      },
      companyScopeId,
      preferenceScope,
    );
  }

  function updateIntradayComparison(value: IntradayComparisonMode) {
    setIntradayComparison(value);
    saveLiveDashboardSettings(
      {
        intradayComparison: value,
        showPreviousPeriod,
      },
      companyScopeId,
      preferenceScope,
    );
  }

  function updateCountingPeriod(value: CountingReportPeriod) {
    setCountingPeriod(
      saveCountingReportPeriod(
        value,
        companyScopeId,
        new Date(),
        preferenceScope,
      ),
    );
  }

  function applyCountingPeriod(period = countingPeriod) {
    setChartData({});
    setClock(new Date());
    setReportRequested(true);
    setAppliedCountingPeriod(period);
  }

  function updateCountingViewSettings(
    patch: Partial<CountingReportViewSettings>,
  ) {
    if (
      patch.includeOpenPeriod !== undefined &&
      patch.includeOpenPeriod !== countingViewSettings.includeOpenPeriod
    ) {
      setChartData({});
    }
    setCountingViewSettings((current) =>
      saveCountingReportViewSettings(
        { ...current, ...patch },
        companyScopeId,
        preferenceScope,
      ),
    );
  }

  const reportCertificationError =
    metadataError ||
    chartLoadError ||
    Object.values(chartData).find((state) => state.error)?.error;
  const reportComparisonMonthDefinition = React.useMemo(
    () =>
      buildCountingMonthHistoryDefinition(
        {
          from: new Date(effectivePeriodFromTime),
          to: new Date(effectivePeriodToTime),
        },
        clock,
        countingIntelligenceOpenComparisonRequired,
      ),
    [
      clock,
      countingIntelligenceOpenComparisonRequired,
      effectivePeriodFromTime,
      effectivePeriodToTime,
    ],
  );
  const reportComparisonMonthState = chartData[COUNTING_MONTH_HISTORY_ID];
  const reportComparisonAggregateSource = React.useMemo<
    ScenarioComparisonAggregateSource | undefined
  >(() => {
    if (
      !companyScopeId ||
      reportComparisonMonthState?.granularity !== "month" ||
      reportComparisonMonthState.error
    ) {
      return undefined;
    }
    return {
      companyScopeId,
      companyTimeZone,
      from: reportComparisonMonthDefinition.from,
      granularity: "month",
      rows: reportComparisonMonthState.rows,
      to: reportComparisonMonthDefinition.to,
    };
  }, [
    companyScopeId,
    companyTimeZone,
    reportComparisonMonthDefinition,
    reportComparisonMonthState,
  ]);
  const reportComparisonAggregateSourcePending = Boolean(
    !reportRequested ||
      (countingIntelligenceMonthRequired && !reportComparisonMonthState),
  );
  const reportDataPending =
    !reportRequested || countingPeriodPending || loadingCharts;
  const countingComparableDailyRows = React.useMemo(
    () =>
      countingIntelligenceOpenComparisonRequired
        ? [
            ...(chartData[COUNTING_OPEN_CURRENT_DAYS_ID]?.rows ?? []),
            ...(chartData[COUNTING_OPEN_PREVIOUS_DAYS_ID]?.rows ?? []),
          ]
        : undefined,
    [chartData, countingIntelligenceOpenComparisonRequired],
  );
  const countingComparableHourlyRows = React.useMemo(
    () =>
      countingIntelligenceOpenComparisonRequired
        ? [
            ...(chartData[COUNTING_OPEN_CURRENT_HOURS_ID]?.rows ?? []),
            ...(chartData[COUNTING_OPEN_PREVIOUS_HOURS_ID]?.rows ?? []),
          ]
        : undefined,
    [chartData, countingIntelligenceOpenComparisonRequired],
  );
  const pendingCountingIntelligenceModel = React.useMemo(
    () =>
      !reportRequested && selectedScope && !reportCertificationError
        ? createPendingCountingIntelligenceModel({
            companyTimeZone,
            directionalPeriod: countingDirectionalDefinition,
            now: clock,
            period: effectivePeriodDates,
            scopeName: selectedScope.name,
          })
        : null,
    [
      clock,
      companyTimeZone,
      countingDirectionalDefinition,
      effectivePeriodDates,
      reportCertificationError,
      reportRequested,
      selectedScope,
    ],
  );
  const countingIntelligenceModel = React.useMemo(
    () =>
      reportRequested && selectedScope && !reportCertificationError
        ? buildCountingIntelligenceModel({
            comparisonDataFrom: reportComparisonMonthDefinition.from,
            comparableDailyRows: countingComparableDailyRows,
            comparableHourlyRows: countingComparableHourlyRows,
            dailyRows: chartData[COUNTING_DAY_HEATMAP_ID]?.rows ?? [],
            dayMonthHeatmapPeriod: countingDayHeatmapPeriod,
            hourlyRows: chartData[COUNTING_HOUR_HISTORY_ID]?.rows ?? [],
            hourlyPeriod: countingDirectionalDefinition,
            includeOpenPeriod: countingViewSettings.includeOpenPeriod,
            monthlyRows: chartData[COUNTING_MONTH_HISTORY_ID]?.rows.length
              ? chartData[COUNTING_MONTH_HISTORY_ID].rows
              : (chartData.report_chart_month?.rows ?? []),
            now: clock,
            period: effectivePeriodDates,
            rankingScenarioIds: countingViewSettings.rankingScenarioIds,
            rankingOrder: countingViewSettings.rankingOrder,
            rankingSelectionMode: countingViewSettings.rankingSelectionMode,
            scenarios,
            scope: selectedScope,
          })
        : null,
    [
      chartData,
      clock,
      countingComparableDailyRows,
      countingComparableHourlyRows,
      countingDayHeatmapPeriod,
      countingDirectionalDefinition,
      countingViewSettings,
      effectivePeriodDates,
      reportRequested,
      reportCertificationError,
      reportComparisonMonthDefinition.from,
      scenarios,
      selectedScope,
    ],
  );
  const reportScenarioSelectionByCardId = React.useMemo(
    () =>
      new Map<string, CardScenarioSelection>(
        reportPreferences.map((preference) => [
          preference.id,
          {
            mode: preference.scenarioSelectionMode ?? "inherit",
            scenarioIds: preference.scenarioIds ?? [],
          },
        ]),
      ),
    [reportPreferences],
  );
  const buildSelectedCountingIntelligenceModel = React.useCallback(
    (selection: CardScenarioSelection): CountingIntelligenceModel => {
      if (!countingIntelligenceModel) {
        if (pendingCountingIntelligenceModel) {
          return pendingCountingIntelligenceModel;
        }
        throw new Error(
          "O modelo da tela não está disponível para este widget.",
        );
      }

      if (selection.mode === "inherit") {
        return countingIntelligenceModel;
      }

      const selectedScenarios = resolveWidgetScenarios(scenarios, selection);
      return buildCountingIntelligenceModel({
        comparisonDataFrom: reportComparisonMonthDefinition.from,
        comparableDailyRows: countingComparableDailyRows,
        comparableHourlyRows: countingComparableHourlyRows,
        dailyRows: chartData[COUNTING_DAY_HEATMAP_ID]?.rows ?? [],
        dayMonthHeatmapPeriod: countingDayHeatmapPeriod,
        hourlyRows: chartData[COUNTING_HOUR_HISTORY_ID]?.rows ?? [],
        hourlyPeriod: countingDirectionalDefinition,
        includeOpenPeriod: countingViewSettings.includeOpenPeriod,
        monthlyRows: chartData[COUNTING_MONTH_HISTORY_ID]?.rows.length
          ? chartData[COUNTING_MONTH_HISTORY_ID].rows
          : (chartData.report_chart_month?.rows ?? []),
        now: clock,
        period: effectivePeriodDates,
        rankingOrder: countingViewSettings.rankingOrder,
        rankingSelectionMode: "all",
        scenarios: selectedScenarios,
        scope: {
          cameraIds: [],
          name: widgetScenarioSelectionLabel(selectedScenarios, selection),
          scenarios: selectedScenarios,
        },
      });
    },
    [
      chartData,
      clock,
      countingComparableDailyRows,
      countingComparableHourlyRows,
      countingDayHeatmapPeriod,
      countingIntelligenceModel,
      countingDirectionalDefinition,
      countingViewSettings.includeOpenPeriod,
      countingViewSettings.rankingOrder,
      effectivePeriodDates,
      pendingCountingIntelligenceModel,
      reportComparisonMonthDefinition.from,
      scenarios,
    ],
  );
  const resolveCountingIntelligenceModel = React.useMemo(() => {
    // Function nodes are invoked by CardLayout only near the viewport. Keep a
    // cache local to this data revision so customized scenario compositions
    // are built once, and never for off-screen/hidden cards.
    const models = new Map<string, CountingIntelligenceModel>();
    return (selection: CardScenarioSelection) => {
      if (selection.mode === "inherit") {
        return buildSelectedCountingIntelligenceModel(selection);
      }
      const selectedScenarios = resolveWidgetScenarios(scenarios, selection);
      const key = `${selection.mode}:${selectedScenarios
        .map((scenario) => scenario.id)
        .sort()
        .join("|")}`;
      const cached = models.get(key);
      if (cached) return cached;
      const model = buildSelectedCountingIntelligenceModel(selection);
      models.set(key, model);
      return model;
    };
  }, [buildSelectedCountingIntelligenceModel, scenarios]);
  const displayedCountingIntelligenceModel =
    reportRequested
      ? countingIntelligenceModel
      : pendingCountingIntelligenceModel;
  const countingIntelligenceCards = displayedCountingIntelligenceModel
    ? buildCountingIntelligenceWidgetCards({
        inheritedScenarioIds: selectedScope?.scenario
          ? [selectedScope.scenario.id]
          : [],
        loading: reportDataPending,
        model: displayedCountingIntelligenceModel,
        onRankingScenarioIdsChange: (rankingScenarioIds) =>
          updateCountingViewSettings({ rankingScenarioIds }),
        onRankingOrderChange: (rankingOrder) =>
          updateCountingViewSettings({ rankingOrder }),
        onRankingSelectionModeChange: (rankingSelectionMode) =>
          updateCountingViewSettings({ rankingSelectionMode }),
        rankingOrder: countingViewSettings.rankingOrder,
        rankingScenarioIds: countingViewSettings.rankingScenarioIds,
        rankingSelectionMode: countingViewSettings.rankingSelectionMode,
        resolveModel: resolveCountingIntelligenceModel,
        scenarios,
      })
    : [];
  const reportComparisonDisabledReason =
    loadingScenarios
      ? "Os cenários do relatório estão sendo carregados."
      : metadataError;

  function getScopeOptionsForMode(mode: ReportCustomWidgetScopeMode) {
    return buildReportScopeOptions({
      cameras,
      groups: cameraGroups,
      locations,
      manager,
      mode,
      scenarios,
      subLocations,
    });
  }

  function openCustomWidgetDialog() {
    const preferredMode = (selectedScope?.mode ??
      availableModes[0]?.value ??
      "scenario") as ReportCustomWidgetScopeMode;
    const options = getScopeOptionsForMode(preferredMode);
    const scope =
      selectedScope?.mode === preferredMode
        ? selectedScope
        : (options[0] ?? null);
    const granularity: ReportCustomWidgetGranularity = "hour";

    setCustomWidgetForm({
      comparisonSettings: createDefaultScenarioComparisonSettings(),
      granularity,
      kind: "scope",
      scopeId: scope?.id ?? "",
      scopeMode: (scope?.mode ?? preferredMode) as ReportCustomWidgetScopeMode,
      title: scope
        ? buildReportCustomWidgetDefaultTitle(scope, granularity)
        : "",
    });
    setCustomWidgetDialogOpen(true);
  }

  function handleCustomWidgetKindChange(value: string) {
    const kind = value as ReportCustomWidgetKind;
    const scope = customWidgetScopeOptions.find(
      (option) => option.id === customWidgetForm.scopeId,
    );

    setCustomWidgetForm((current) => ({
      ...current,
      kind,
      title:
        kind === "scenario_comparison"
          ? "Cenários por período"
          : scope
            ? buildReportCustomWidgetDefaultTitle(scope, current.granularity)
            : "",
    }));
  }

  function handleCustomWidgetModeChange(value: string) {
    const scopeMode = value as ReportCustomWidgetScopeMode;
    const nextScope = getScopeOptionsForMode(scopeMode)[0];

    setCustomWidgetForm((current) => ({
      ...current,
      scopeId: nextScope?.id ?? "",
      scopeMode,
      title:
        current.title ||
        (nextScope
          ? buildReportCustomWidgetDefaultTitle(nextScope, current.granularity)
          : ""),
    }));
  }

  function handleCustomWidgetScopeChange(value: string) {
    const nextScope = customWidgetScopeOptions.find(
      (option) => option.id === value,
    );

    setCustomWidgetForm((current) => ({
      ...current,
      scopeId: value,
      title:
        current.title ||
        (nextScope
          ? buildReportCustomWidgetDefaultTitle(nextScope, current.granularity)
          : ""),
    }));
  }

  function handleCustomWidgetGranularityChange(value: string) {
    const granularity = value as ReportCustomWidgetGranularity;
    const currentScope = customWidgetScopeOptions.find(
      (option) => option.id === customWidgetForm.scopeId,
    );

    setCustomWidgetForm((current) => ({
      ...current,
      granularity,
      title:
        current.title ||
        (currentScope
          ? buildReportCustomWidgetDefaultTitle(currentScope, granularity)
          : ""),
    }));
  }

  function saveCustomWidget() {
    if (customWidgetForm.kind === "scenario_comparison") {
      const nextWidgets = upsertReportCustomWidget(
        {
          kind: "scenario_comparison",
          title: customWidgetForm.title.trim() || "Cenários por período",
        },
        companyScopeId,
        preferenceScope,
      );
      const addedWidget =
        nextWidgets.find(
          (widget) =>
            widget.kind === "scenario_comparison" &&
            !customWidgets.some((current) => current.id === widget.id),
        ) ?? nextWidgets.at(-1);

      if (addedWidget?.kind === "scenario_comparison") {
        saveScenarioComparisonSettings(
          reportScenarioComparisonStorageKey(addedWidget.id),
          customWidgetForm.comparisonSettings,
          companyScopeId,
          preferenceScope,
        );
      }

      setCustomWidgets(nextWidgets);
      setCustomWidgetDialogOpen(false);
      toast.success("Widget de cenários por período adicionado.");
      return;
    }

    const scope = getScopeOptionsForMode(customWidgetForm.scopeMode).find(
      (option) => option.id === customWidgetForm.scopeId,
    );

    if (!scope) {
      toast.error("Selecione uma visão válida para criar o widget.");
      return;
    }

    const title =
      customWidgetForm.title.trim() ||
      buildReportCustomWidgetDefaultTitle(scope, customWidgetForm.granularity);
    const nextWidgets = upsertReportCustomWidget(
      {
        granularity: customWidgetForm.granularity,
        kind: "scope",
        scopeId: scope.id,
        scopeMode: scope.mode as ReportCustomWidgetScopeMode,
        scopeName: scope.name,
        title,
      },
      companyScopeId,
      preferenceScope,
    );

    setCustomWidgets(nextWidgets);
    setCustomWidgetDialogOpen(false);
    toast.success("Widget adicionado aos relatórios.");
  }

  function removeCustomWidget(widgetId: string) {
    if (!canEditVisual) {
      toast.error("Seu usuário não pode remover widgets de relatório.");
      return;
    }
    const widget = customWidgets.find((item) => item.id === widgetId);
    if (widget?.kind === "scenario_comparison") {
      deleteScenarioComparisonSettings(
        reportScenarioComparisonStorageKey(widget.id),
        companyScopeId,
        preferenceScope,
      );
    }
    const nextWidgets = deleteReportCustomWidget(
      widgetId,
      companyScopeId,
      preferenceScope,
    );
    setCustomWidgets(nextWidgets);
    toast.success("Widget removido.");
  }

  const scenarioComparisonCards = scenarios.length
    ? [
        {
          id: "report_scenario_period_comparison",
          chartTypeEnabled: true,
          label: "Cenários por período",
          defaultHeight: "tall" as const,
          defaultSize: "full" as const,
          className: "sm:col-span-2 xl:col-span-4",
          node: (
            <ScenarioComparisonCard
              aggregateSource={reportComparisonAggregateSource}
              aggregateSourcePending={reportComparisonAggregateSourcePending}
              aggregateRevision={comparisonRefreshRevision}
              companyId={companyScopeId}
              companyTimeZone={companyTimeZone}
              deferSettingsApply
              description="Compare todos os cenários ou apenas os escolhidos para análise de relatório."
              disabledReason={reportComparisonDisabledReason}
              monitorMode={monitorMode}
              onReportChartChange={updateComparisonReportChart}
              periodOverride={reportPeriodOverride}
              preferenceScopeId={selectedScope?.id}
              reportChartKey="report_scenario_period_comparison"
              scenarios={scenarios}
              storageKey="reports"
            />
          ),
          titleEditable: true,
        },
      ]
    : [];

  const customWidgetCards = customWidgets.map((widget) => {
    if (widget.kind === "scenario_comparison") {
      return {
        id: `report_custom_${widget.id}`,
        chartTypeEnabled: true,
        label: widget.title,
        defaultHeight: "tall" as const,
        defaultSize: "full" as const,
        className: "sm:col-span-2 xl:col-span-4",
        node: (
          <ScenarioComparisonCard
            aggregateSource={reportComparisonAggregateSource}
            aggregateSourcePending={reportComparisonAggregateSourcePending}
            aggregateRevision={comparisonRefreshRevision}
            action={canEditVisual && !monitorMode ? (
              <WidgetCardActions label={`Ações do widget ${widget.title}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeCustomWidget(widget.id);
                  }}
                  aria-label={`Remover widget ${widget.title}`}
                  title="Remover widget"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </WidgetCardActions>
            ) : null}
            companyId={companyScopeId}
            companyTimeZone={companyTimeZone}
            deferSettingsApply
            disabledReason={reportComparisonDisabledReason}
            monitorMode={monitorMode}
            onReportChartChange={updateComparisonReportChart}
            periodOverride={reportPeriodOverride}
            preferenceScopeId={selectedScope?.id}
            reportChartKey={`report_custom_${widget.id}`}
            scenarios={scenarios}
            storageKey={reportScenarioComparisonStorageKey(widget.id)}
            title={widget.title}
          />
        ),
        titleEditable: true,
      };
    }

    const scope = getScopeOptionsForMode(widget.scopeMode).find(
      (option) => option.id === widget.scopeId,
    );
    const state = chartStateForReportGranularity(chartData, widget.granularity);
    const previousState = chartStateForReportGranularity(
      chartData,
      widget.granularity,
      true,
    );

    return {
      id: `report_custom_${widget.id}`,
      chartTypeEnabled: true,
      label: widget.title,
      defaultHeightLevel: 4 as const,
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      inheritedScenarioIds: scope?.scenario ? [scope.scenario.id] : [],
      inheritedScenarioLabel: scope?.scenario
        ? scope.scenario.name
        : scope
          ? `dados completos de ${scope.name}`
          : "visão salva",
      scenarioConfigurable: Boolean(scope),
      scenarioSelectionPolicy: "aggregate" as const,
      node: ({ scenarioSelection }: LayoutCardRenderContext) => {
        if (!scope) {
          return (
            <MissingReportCustomWidgetCard
              title={widget.title}
              onRemove={
                canEditVisual && !monitorMode
                  ? () => removeCustomWidget(widget.id)
                  : undefined
              }
            />
          );
        }

        const resolvedScope = resolveReportWidgetScope(
          scope,
          scenarios,
          scenarioSelection,
        );
        const definition = buildReportCustomWidgetDefinition(
          widget,
          chartDefinitions,
          resolvedScope,
        );
        return (
          <ScenarioAggregateChartCard
            action={
              canEditVisual && !monitorMode ? (
                <WidgetCardActions label={`Ações do widget ${widget.title}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeCustomWidget(widget.id);
                    }}
                    aria-label={`Remover widget ${widget.title}`}
                    title="Remover widget"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </WidgetCardActions>
              ) : null
            }
            definition={definition}
            loading={reportDataPending}
            previousRows={previousState?.rows ?? []}
            error={
              reportCertificationError ||
              state?.error ||
              (showPreviousPeriod ? previousState?.error : undefined)
            }
            intradayComparison={intradayComparison}
            rows={state?.rows ?? []}
            scope={resolvedScope}
            showPreviousPeriod={showPreviousPeriod}
            state={state}
          />
        );
      },
      titleEditable: true,
    };
  });

  const scenarioDetailTable: ReportTable | null = selectedScope
    ? {
        title: "Visão selecionada",
        columns: [
          { key: "label", label: "Item", width: 22 },
          { key: "value", label: "Valor", width: 36 },
        ],
        rows: [
          { label: "Nome", value: selectedScope.name },
          {
            label: "Descrição",
            value: selectedScope.description || "Sem descrição",
          },
          {
            label: "Tipo",
            value: scopeModeLabel(selectedScope.mode),
          },
          {
            label: selectedScope.scenario ? "Linhas" : "Câmeras",
            value: formatNumber(
              selectedScope.scenario
                ? (selectedScope.scenario.lines?.length ?? 0)
                : selectedScope.cameraIds.length,
            ),
          },
        ],
      }
    : null;
  const scopeListTable: ReportTable | null = selectedScope
    ? {
        title: "Visões disponíveis",
        columns: [
          { key: "name", label: "Visão", width: 34 },
          { key: "type", label: "Tipo", width: 16 },
          { key: "items", label: "Itens", width: 12, numeric: true },
        ],
        rows: scopeOptions.map((scope) => ({
          name: scope.name,
          type: scopeModeLabel(scope.mode),
          items: scope.scenario
            ? (scope.scenario.lines?.length ?? 0)
            : scope.cameraIds.length,
        })),
      }
    : null;
  const reportLayoutCards = [
    ...countingIntelligenceCards,
    ...scenarioComparisonCards,
    ...customWidgetCards,
  ];
  const reportColorByCardId = React.useMemo(
    () =>
      new Map(
        reportPreferences.flatMap((preference) =>
          preference.color ? [[preference.id, preference.color] as const] : [],
        ),
      ),
    [reportPreferences],
  );
  const reportChartTypeByCardId = React.useMemo(
    () =>
      new Map(
        reportPreferences.flatMap((preference) =>
          preference.chartType
            ? [[preference.id, preference.chartType] as const]
            : [],
        ),
      ),
    [reportPreferences],
  );
  const reportTitleByCardId = React.useMemo(
    () =>
      new Map(
        reportPreferences.flatMap((preference) =>
          preference.title
            ? [[preference.id, preference.title] as const]
            : [],
        ),
      ),
    [reportPreferences],
  );
  const resolveReportTitle = React.useCallback(
    (cardId: string, fallback: string) =>
      reportTitleByCardId.get(cardId) ?? fallback,
    [reportTitleByCardId],
  );
  const applyReportChartType = React.useCallback(
    (cardId: string, chart: ReportPayload["charts"][number]) => {
      const title = resolveReportTitle(cardId, chart.title);
      return {
        ...chart,
        title,
        option: applyChartTypePreference(
          chart.option,
          reportChartTypeByCardId.get(cardId),
        ),
        table: {
          ...chart.table,
          title:
            title === chart.title ? chart.table.title : `Dados - ${title}`,
        },
      };
    },
    [reportChartTypeByCardId, resolveReportTitle],
  );
  function buildConfiguredCountingIntelligenceAssets(): ReturnType<
    typeof buildCountingIntelligenceReportAssets
  > {
    if (!countingIntelligenceModel) {
      return { charts: [], metrics: [], tables: [] };
    }

    const colors = Object.fromEntries(reportColorByCardId);
    const assetsByModel = new Map<
      CountingIntelligenceModel,
      ReturnType<typeof buildCountingIntelligenceReportAssets>
    >();
    const merged: ReturnType<typeof buildCountingIntelligenceReportAssets> = {
      charts: [],
      metrics: [],
      tables: [],
    };

    Object.values(COUNTING_INTELLIGENCE_CARD_IDS).forEach((cardId) => {
      const selection = reportScenarioSelectionByCardId.get(cardId) ?? {
        mode: "inherit",
        scenarioIds: [],
      };
      const model = resolveCountingIntelligenceModel(selection);
      let assets = assetsByModel.get(model);
      if (!assets) {
        assets = buildCountingIntelligenceReportAssets(model, colors);
        assetsByModel.set(model, assets);
      }

      merged.charts.push(
        ...assets.charts.filter((asset) => asset.cardId === cardId),
      );
      merged.metrics.push(
        ...assets.metrics.filter((asset) => asset.cardId === cardId),
      );
      merged.tables.push(
        ...assets.tables.filter((asset) => asset.cardId === cardId),
      );
    });

    return merged;
  }
  const visibleComparisonCardIds = React.useMemo(
    () =>
      visibleReportCardIds.filter(
        (cardId) =>
          cardId === "report_scenario_period_comparison" ||
          customWidgets.some(
            (widget) =>
              widget.kind === "scenario_comparison" &&
              `report_custom_${widget.id}` === cardId,
          ),
      ),
    [customWidgets, visibleReportCardIds],
  );
  const comparisonChartsReady = visibleComparisonCardIds.every(
    (cardId) => Boolean(comparisonReportCharts[cardId]),
  );
  function buildScenarioReportAssets() {
  const countingIntelligenceAssets =
    buildConfiguredCountingIntelligenceAssets();
  const reportWidgetScenarioContexts = visibleReportCardIds.flatMap(
    (cardId) => {
      const selection = reportScenarioSelectionByCardId.get(cardId);
      if (!selection || selection.mode === "inherit") return [];
      const selectedScenarios = resolveWidgetScenarios(scenarios, selection);
      const fallbackTitle =
        reportLayoutCards.find((card) => card.id === cardId)?.label ?? "Widget";
      return [
        `Composição de “${resolveReportTitle(cardId, fallbackTitle)}”: ${widgetScenarioSelectionLabel(
          selectedScenarios,
          selection,
        )}`,
      ];
    },
  );
  const customReportChartEntries = customWidgets
    .filter(
      (widget): widget is ReportScopeCustomWidget => widget.kind === "scope",
    )
    .map(
      (widget): readonly [string, ReportPayload["charts"][number]] | null => {
        const scope = getScopeOptionsForMode(widget.scopeMode).find(
          (option) => option.id === widget.scopeId,
        );
        if (!scope) return null;

        const cardId = `report_custom_${widget.id}`;
        const resolvedScope = resolveReportWidgetScope(
          scope,
          scenarios,
          reportScenarioSelectionByCardId.get(cardId) ?? {
            mode: "inherit",
            scenarioIds: [],
          },
        );
        const definition = buildReportCustomWidgetDefinition(
          widget,
          chartDefinitions,
          resolvedScope,
        );
        const state = chartStateForReportGranularity(
          chartData,
          widget.granularity,
        );
        const previousState = chartStateForReportGranularity(
          chartData,
          widget.granularity,
          true,
        );

        return [
          cardId,
          applyReportChartType(
            cardId,
            buildScenarioReportChart(
              definition,
              state?.rows ?? [],
              previousState?.rows ?? [],
              resolvedScope,
              showPreviousPeriod,
              intradayComparison,
              companyTimeZone,
              reportColorByCardId.get(cardId),
            ),
          ),
        ] as const;
      },
    )
    .filter(
      (entry): entry is readonly [string, ReportPayload["charts"][number]] =>
        Boolean(entry),
    );
  const countingIntelligenceChartEntries: Array<
    readonly [string, ReportPayload["charts"][number]]
  > = countingIntelligenceAssets.charts.map(
    ({ cardId, value }) =>
      [cardId, applyReportChartType(cardId, value)] as const,
  );
  const visibleMetricByCardId = new Map<string, ReportMetric>(
    countingIntelligenceAssets.metrics.map(
      ({ cardId, value }) => [
        cardId,
        { ...value, label: resolveReportTitle(cardId, value.label) },
      ] as const,
    ),
  );
  const visibleTableEntries: Array<readonly [string, ReportTable]> =
    countingIntelligenceAssets.tables.map(
      ({ cardId, value }) => [
        cardId,
        { ...value, title: resolveReportTitle(cardId, value.title) },
      ] as const,
    );
  if (scenarioDetailTable) {
    visibleTableEntries.push([
      "report_scenario_detail",
      {
        ...scenarioDetailTable,
        title: resolveReportTitle(
          "report_scenario_detail",
          scenarioDetailTable.title,
        ),
      },
    ]);
  }
  if (scopeListTable) {
    visibleTableEntries.push([
      "report_scenario_table",
      {
        ...scopeListTable,
        title: resolveReportTitle("report_scenario_table", scopeListTable.title),
      },
    ]);
  }
  const reportContextTableIds = [
    ...(scenarioDetailTable ? ["report_scenario_detail"] : []),
    ...(scopeListTable ? ["report_scenario_table"] : []),
  ];
  const visibleTablesByCardId = new Map<string, ReportTable[]>();
  visibleTableEntries.forEach(([cardId, table]) => {
    const current = visibleTablesByCardId.get(cardId) ?? [];
    current.push(table);
    visibleTablesByCardId.set(cardId, current);
  });

  return {
    countingIntelligenceChartEntries,
    customReportChartEntries,
    reportContextTableIds,
    reportWidgetScenarioContexts,
    visibleMetricByCardId,
    visibleTablesByCardId,
  };
  }

  function composeScenarioReportPayload({
    charts,
    metrics,
    scenarioContexts,
    tables,
  }: {
    charts: ReportPayload["charts"];
    metrics: ReportMetric[];
    scenarioContexts: string[];
    tables: ReportTable[];
  }): ReportPayload {
    const generatedAt = new Date();
    return {
      title: selectedScope
        ? `Relatório de Contagem - ${selectedScope.name}`
        : "Relatório de Contagem",
      subtitle: "Resultados de contagem por visão e períodos agregados.",
      filename: `ipxdata-relatorio-contagem-${reportDateSlug(generatedAt)}`,
      generatedAt,
      timeZone: companyTimeZone,
      dataCompleteUntil: scenarioReportDataCompleteUntil(
        effectivePeriodDates,
        generatedAt,
      ),
      context: [
        selectedScope
          ? `${scopeModeLabel(selectedScope.mode)}: ${selectedScope.name}`
          : "",
        showPreviousPeriod
          ? `Comparativo: ${intradayComparison === "last_week" ? "semana passada" : "ontem"}`
          : "Sem período anterior",
        `Período aplicado a todo o relatório: ${reportPeriodOverride.label}`,
        ...scenarioContexts,
        "Impressão preservando ordem, visibilidade e cores dos widgets; dimensões adaptadas ao papel.",
      ].filter(Boolean),
      metrics,
      charts,
      tables,
    };
  }

  async function buildAiScenarioReportPayload(signal?: AbortSignal) {
    const requestSignal = signal ?? new AbortController().signal;
    requestSignal.throwIfAborted();
    const payload = await resolveScenarioReportPayloadForContext(
      requestSignal,
      "análise da IA",
    );
    requestSignal.throwIfAborted();
    if (!selectedScope) {
      throw new Error(
        "Selecione uma visão para montar a série diária completa da IA.",
      );
    }
    const dailyFrom = startOfDay(effectivePeriodDates.from);
    const dataCompleteUntil = payload.dataCompleteUntil ?? clock;
    const dailyTo = new Date(
      Math.min(
        effectivePeriodDates.to.getTime(),
        addDays(startOfDay(dataCompleteUntil), 1).getTime(),
      ),
    );
    const dailyState = chartData[CURRENT_MONTH_DAYS_ID];
    const dailyRows =
      dailyState?.granularity === "day" && !dailyState.error
        ? dailyState.rows
        : await fetchCompleteAggregateRange({
            companyScopeId: companyScopeId?.trim() || undefined,
            from: dailyFrom,
            granularity: "day",
            signal: requestSignal,
            to: dailyTo,
          });
    requestSignal.throwIfAborted();
    const totals = aggregateReportScopeRowsByBucket(
      dailyRows,
      selectedScope,
      "day",
    );
    const rows: ReportTable["rows"] = [];
    let cursor = dailyFrom;
    while (cursor < dailyTo) {
      if (rows.length >= MAX_AI_DAILY_ROWS) {
        throw new RangeError(
          `O período possui mais de ${formatNumber(MAX_AI_DAILY_ROWS)} dias. Reduza a consulta para gerar uma análise diária completa, sem amostragem.`,
        );
      }
      rows.push({
        date: formatReportCivilDate(cursor),
        total: totals.get(bucketKeyForGranularity(cursor, "day")) ?? 0,
      });
      cursor = addDays(cursor, 1);
    }
    if (!rows.length) {
      throw new RangeError("O período diário da análise está vazio.");
    }

    const periodLabel = `${formatReportCivilDate(dailyFrom)} a ${formatReportCivilDate(addDays(dailyTo, -1))}`;
    return {
      ...payload,
      context: [
        `Período analisado: ${periodLabel}`,
        ...(payload.context ?? []),
      ],
      tables: [
        ...(payload.tables ?? []),
        {
          columns: [
            { key: "date", label: "Data", width: 24 },
            {
              key: "total",
              label: "Fluxo total atual",
              numeric: true,
              width: 22,
            },
          ],
          description: `Detalhamento diário da visão ${selectedScope.name} em ${periodLabel}; dias sem registros permanecem com total zero. Os gráficos, indicadores e tabelas acima preservam a composição individual de cada widget.`,
          rows,
          title: "Detalhamento diário da Contagem",
        },
      ],
    } satisfies ReportPayload;
  }

  async function resolveScenarioReportPayloadForContext(
    signal: AbortSignal,
    activityLabel: string,
  ) {
    const requestContextKey = reportContextKey;
    const payload = await resolveConfiguredScenarioReportPayload(signal);
    signal.throwIfAborted();
    if (latestReportContextKeyRef.current !== requestContextKey) {
      throw new Error(
        `A empresa ou visão mudou durante a ${activityLabel}. Gere o relatório novamente.`,
      );
    }
    return payload;
  }

  async function resolveConfiguredScenarioReportPayload(signal: AbortSignal) {
    signal.throwIfAborted();
    const reportAssets = buildScenarioReportAssets();
    const chartByCardId = new Map<string, ReportPayload["charts"][number]>([
      ...reportAssets.countingIntelligenceChartEntries,
      ...reportAssets.customReportChartEntries,
      ...Object.entries(comparisonReportCharts).map(
        ([cardId, chart]) =>
          [cardId, applyReportChartType(cardId, chart)] as const,
      ),
    ]);
    signal.throwIfAborted();

    return composeScenarioReportPayload({
      charts: visibleReportCardIds
        .map((id) => chartByCardId.get(id))
        .filter((chart): chart is ReportPayload["charts"][number] =>
          Boolean(chart),
        ),
      metrics: visibleReportCardIds
        .map((id) => reportAssets.visibleMetricByCardId.get(id))
        .filter((metric): metric is ReportMetric => Boolean(metric)),
      scenarioContexts: reportAssets.reportWidgetScenarioContexts,
      tables: [
        ...new Set([
          ...visibleReportCardIds,
          ...reportAssets.reportContextTableIds,
        ]),
      ].flatMap((id) => reportAssets.visibleTablesByCardId.get(id) ?? []),
    });
  }

  return (
    <section
      id="relatorios"
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "scroll-mt-6 space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {reportCertificationError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Não foi possível carregar o relatório: {reportCertificationError}
        </div>
      ) : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Relatórios
            </div>
            <div className="truncate text-lg font-semibold">
              {selectedScope?.name ?? "Visão selecionada"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 bg-card">
              <BarChart3 className="h-3.5 w-3.5" />
              {scopeModeLabel(scopeMode)}
            </Badge>
            <Badge
              variant="outline"
              className="max-w-[260px] gap-1 bg-card"
              title={formatCountingReportPeriod(countingPeriod)}
            >
              <Clock3 className="h-3.5 w-3.5" />
              <span className="truncate">
                {formatCountingReportPeriod(countingPeriod)}
              </span>
            </Badge>
            {showPreviousPeriod ? (
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 bg-primary/10 text-primary"
              >
                Comparativo ativo
              </Badge>
            ) : null}
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="@container rounded-md border border-border bg-card px-3 py-2 shadow-soft">
          {loadingScenarios ? (
            <div className="grid min-w-0 grid-cols-[32px_minmax(64px,80px)_minmax(72px,104px)_minmax(0,1fr)_248px] items-center gap-1.5 @sm:grid-cols-[minmax(140px,180px)_80px_104px_minmax(0,1fr)_248px] @lg:grid-cols-[minmax(180px,220px)_88px_120px_minmax(0,1fr)_248px] @xl:grid-cols-[minmax(220px,260px)_104px_144px_minmax(0,1fr)_248px] @2xl:grid-cols-[300px_120px_180px_minmax(0,1fr)_248px]">
              <CountingReportPeriodControl
                disabled
                includeOpenPeriod={countingViewSettings.includeOpenPeriod}
                value={countingPeriod}
                onChange={updateCountingPeriod}
                onIncludeOpenPeriodChange={(includeOpenPeriod) =>
                  updateCountingViewSettings({ includeOpenPeriod })
                }
              />
              <Skeleton className="col-start-2 row-start-1 h-8 w-full" />
              <Skeleton className="col-start-3 row-start-1 h-8 w-full" />
              <Skeleton className="col-start-4 row-start-1 h-8 w-8 shrink-0 justify-self-end @lg:w-[54px]" />
              <Skeleton className="col-start-5 row-start-1 h-8 w-[248px] shrink-0" />
            </div>
          ) : scopeOptions.length ? (
            <div className="space-y-2">
              <div
                aria-label="Controles dos relatórios de Contagem"
                className="grid min-w-0 grid-cols-[32px_minmax(64px,80px)_minmax(72px,104px)_minmax(0,1fr)_248px] items-center gap-1.5 @sm:grid-cols-[minmax(140px,180px)_80px_104px_minmax(0,1fr)_248px] @lg:grid-cols-[minmax(180px,220px)_88px_120px_minmax(0,1fr)_248px] @xl:grid-cols-[minmax(220px,260px)_104px_144px_minmax(0,1fr)_248px] @2xl:grid-cols-[300px_120px_180px_minmax(0,1fr)_248px]"
                role="group"
              >
                <CountingReportPeriodControl
                  disabled={loadingCharts}
                  includeOpenPeriod={countingViewSettings.includeOpenPeriod}
                  value={countingPeriod}
                  onChange={updateCountingPeriod}
                  onApply={applyCountingPeriod}
                  pending={!reportRequested || countingPeriodPending}
                  onIncludeOpenPeriodChange={(includeOpenPeriod) =>
                    updateCountingViewSettings({ includeOpenPeriod })
                  }
                />

                <div className="col-start-2 row-start-1 min-w-0">
                  <Label className="sr-only" htmlFor={reportScopeModeSelectId}>
                    Visão
                  </Label>
                  <Select
                    value={scopeMode}
                    onValueChange={(value) => {
                      setScopeMode(value as ReportScopeMode);
                      setSelectedId("");
                    }}
                  >
                    <SelectTrigger
                      id={reportScopeModeSelectId}
                      aria-label="Tipo da visão dos relatórios de Contagem"
                      className="h-8 w-full min-w-0 bg-card"
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

                <div className="col-start-3 row-start-1 min-w-0">
                  <Label className="sr-only" htmlFor={reportScopeSelectId}>
                    {scopeModeLabel(scopeMode)}
                  </Label>
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger
                      id={reportScopeSelectId}
                      aria-label={`${scopeModeLabel(scopeMode)} dos relatórios em foco`}
                      className="h-8 w-full min-w-0 bg-card"
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

                <div className="contents">
                  <div className="col-start-4 row-start-1 flex h-8 min-w-0 items-center justify-end">
                    {lastUpdated ? (
                      <span
                        aria-label={`Última atualização às ${formatTime(lastUpdated)}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-0 text-xs tabular-nums text-muted-foreground @lg:w-auto @lg:justify-start @lg:px-1.5"
                        title={`Última atualização às ${formatTime(lastUpdated)}`}
                      >
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        <span className="sr-only @lg:not-sr-only">
                          {formatTime(lastUpdated)}
                        </span>
                      </span>
                    ) : null}
                  </div>

                  <div
                    aria-label="Ações dos relatórios de Contagem"
                    className="col-start-5 row-start-1 flex w-[248px] min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1"
                    role="group"
                  >
                    <Button
                      type="button"
                      variant={reportSettingsOpen ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setReportSettingsOpen((current) => !current)}
                      aria-controls={reportSettingsPanelId}
                      aria-expanded={reportSettingsOpen}
                      aria-label="Configurações do relatório"
                      title="Configurações do relatório"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                    <ReportExportActions
                      compact
                      getPayload={(signal) =>
                        resolveScenarioReportPayloadForContext(
                          signal ?? new AbortController().signal,
                          "exportação",
                        )
                      }
                      disabled={
                        !reportRequested ||
                        countingPeriodPending ||
                        loadingCharts ||
                        loadingScenarios ||
                        !selectedScope ||
                        !comparisonChartsReady ||
                        Boolean(reportComparisonDisabledReason)
                      }
                    />
                    <AiAnalysisAction
                      disabled={
                        !reportRequested ||
                        countingPeriodPending ||
                        loadingCharts ||
                        loadingScenarios ||
                        !selectedScope ||
                        !comparisonChartsReady ||
                        Boolean(reportComparisonDisabledReason)
                      }
                      getPayload={buildAiScenarioReportPayload}
                      manager={manager}
                      source={{ module: "counting", surface: "reports" }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={loadingCharts || !selectedScope}
                      onClick={() => {
                        if (!selectedScope) return;
                        setReportRequested(true);
                        setComparisonRefreshRevision((current) => current + 1);
                        void loadCharts(selectedScope, false, true);
                      }}
                      aria-label="Atualizar dados do relatório"
                      title="Atualizar dados do relatório"
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          loadingCharts && "animate-spin",
                        )}
                      />
                    </Button>
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
                          aria-label="Configurar widgets"
                          title="Configurar widgets"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                    <MonitorModeButton
                      compact
                      onClick={enterMonitorMode}
                      disabled={!scopeOptions.length}
                    />
                  </div>
                </div>
              </div>

              {reportSettingsOpen ? (
                <div
                  id={reportSettingsPanelId}
                  aria-label="Configurações dos relatórios de Contagem"
                  className="grid min-w-0 gap-2 rounded-md border bg-muted/15 p-3 @lg:grid-cols-[minmax(180px,1fr)_auto] @lg:items-center"
                  role="region"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">
                      Comparação do relatório
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Configure o período anterior sem ocupar a régua principal.
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 @lg:justify-end">
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
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma visão disponível para este usuário.
            </div>
          )}
        </div>
      )}

      {scopeOptions.length ? (
        <CardLayout
          menuKey="reports"
          monitorMode={monitorMode}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          preferenceScopeId={selectedScope?.id}
          reorderMode={layoutReorderMode}
          scenarios={scenarios}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
          viewScopeName={selectedScope?.name}
          viewScopes={scopeOptions.map((scope) => ({
            id: scope.id,
            name: scope.name,
          }))}
          editActions={
            <Button
              type="button"
              size="sm"
              onClick={openCustomWidgetDialog}
              disabled={!availableModes.length}
            >
              <Plus className="h-4 w-4" />
              Adicionar widget
            </Button>
          }
          cards={
            monitorMode
              ? reportLayoutCards.filter(
                  (card) =>
                    card.id !== "report_scenario_detail" &&
                    card.id !== "report_scenario_table",
                )
              : reportLayoutCards
          }
        />
      ) : null}

      {monitorMode ? null : (
        <Dialog
          open={customWidgetDialogOpen}
          onOpenChange={setCustomWidgetDialogOpen}
        >
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Novo widget de relatório</DialogTitle>
              <DialogDescription>
                Adicione uma visão individual ou uma comparação de cenários.
              </DialogDescription>
            </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor={customKindSelectId}>Tipo de widget</Label>
              <Select
                value={customWidgetForm.kind}
                onValueChange={handleCustomWidgetKindChange}
              >
                <SelectTrigger id={customKindSelectId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scope">Visão individual</SelectItem>
                  <SelectItem value="scenario_comparison">
                    Cenários por período
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

              <div className="space-y-2">
                <Label htmlFor="report-custom-widget-title">Título</Label>
                <Input
                  id="report-custom-widget-title"
                  value={customWidgetForm.title}
                  onChange={(event) =>
                    setCustomWidgetForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder={
                    customWidgetForm.kind === "scenario_comparison"
                      ? "Comparativo de entradas e saídas"
                      : "Entradas hora a hora"
                  }
                />
              </div>

              {customWidgetForm.kind === "scope" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={customScopeModeSelectId}>
                        Tipo de visão
                      </Label>
                      <Select
                        value={customWidgetForm.scopeMode}
                        onValueChange={handleCustomWidgetModeChange}
                      >
                        <SelectTrigger id={customScopeModeSelectId}>
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

                    <div className="space-y-2">
                      <Label htmlFor={customScopeSelectId}>
                        {scopeModeLabel(customWidgetForm.scopeMode)}
                      </Label>
                      <Select
                        value={customWidgetForm.scopeId}
                        onValueChange={handleCustomWidgetScopeChange}
                        disabled={!customWidgetScopeOptions.length}
                      >
                        <SelectTrigger id={customScopeSelectId}>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {customWidgetScopeOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                <div className="space-y-2">
                  <Label htmlFor={customGranularitySelectId}>Gráfico</Label>
                  <Select
                    value={customWidgetForm.granularity}
                    onValueChange={handleCustomWidgetGranularityChange}
                  >
                    <SelectTrigger id={customGranularitySelectId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_CUSTOM_WIDGET_GRANULARITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="rounded-md border bg-muted/20 p-3">
                <ScenarioComparisonConfigurator
                  fixedPeriodLabel={reportPeriodOverride.label}
                  onChange={(patch) =>
                    setCustomWidgetForm((current) => ({
                      ...current,
                      comparisonSettings: {
                        ...current.comparisonSettings,
                        ...patch,
                      },
                    }))
                  }
                  scenarios={scenarios}
                  settings={customWidgetForm.comparisonSettings}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomWidgetDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={saveCustomWidget}
              disabled={
                (customWidgetForm.kind === "scope" && !customWidgetForm.scopeId) ||
                (customWidgetForm.kind === "scenario_comparison" &&
                  customWidgetForm.comparisonSettings.selectionMode === "custom" &&
                  !customWidgetForm.comparisonSettings.selectedScenarioIds.length)
              }
            >
              Adicionar widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </section>
  );
}

function ScenarioAggregateChartCard({
  action,
  definition,
  error,
  intradayComparison,
  loading,
  rows,
  previousRows,
  scope,
  showPreviousPeriod,
  state,
}: {
  action?: React.ReactNode;
  definition: ScenarioAggregateDefinition;
  error?: string;
  intradayComparison: IntradayComparisonMode;
  loading: boolean;
  rows: AggregateEventRow[];
  previousRows: AggregateEventRow[];
  scope: ReportScopeOption;
  showPreviousPeriod: boolean;
  state?: ScenarioChartState;
}) {
  const widgetColor = useWidgetColor();
  const points = React.useMemo(
    () => buildReportScopeAggregatePoints(definition, rows, scope),
    [definition, rows, scope],
  );
  const previousPoints = React.useMemo(
    () =>
      showPreviousPeriod
        ? buildReportScopeAggregateComparisonPoints(
            definition,
            previousRows,
            scope,
            intradayComparison,
          )
        : [],
    [definition, intradayComparison, previousRows, scope, showPreviousPeriod],
  );
  const option = React.useMemo(
    () =>
      buildChartOption(
        definition,
        points,
        previousPoints,
        intradayComparison,
        widgetColor,
      ),
    [definition, intradayComparison, points, previousPoints, widgetColor],
  );
  const hasData =
    points.some((point) => point.total !== 0) ||
    previousPoints.some((point) => point.total !== 0);

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2">
              <BarChart3 className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={definition.label} className="leading-6" />
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          {action}
          {showPreviousPeriod ? (
            <div className="col-span-full max-w-full break-words rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-5 text-primary">
              {comparisonDescription(definition, intradayComparison)}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full flex-1" />
        ) : error || state?.error ? (
          <EmptyChartState
            text={error || state?.error || "Dados indisponíveis."}
          />
        ) : hasData ? (
          <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
            <EChart option={option} />
          </div>
        ) : (
          <EmptyChartState text="Sem eventos desta visão no período." />
        )}
      </CardContent>
    </Card>
  );
}

function MissingReportCustomWidgetCard({
  onRemove,
  title,
}: {
  onRemove?: () => void;
  title: string;
}) {
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2">
              <BarChart3 className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText
                fallback={title || "Widget personalizado"}
                className="leading-6"
              />
            </CardTitle>
            <CardDescription>
              A visão vinculada a este widget não está mais disponível.
            </CardDescription>
          </div>
          {onRemove ? (
            <WidgetCardActions label={`Ações do widget ${title}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onRemove}
                aria-label={`Remover widget ${title}`}
                title="Remover widget"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </WidgetCardActions>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EmptyChartState text="Selecione outro widget ou remova este card." />
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

function PreviousPeriodToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
      Período anterior
    </button>
  );
}

function ComparisonModeSelect({
  value,
  onValueChange,
}: {
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
        aria-label="Base de comparação do período anterior"
        className="h-8 w-[190px] min-w-0 max-w-full bg-card text-xs"
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

function buildScenarioAggregateDefinitions(
  now: Date,
  period?: { from: Date; to: Date },
): ScenarioAggregateDefinition[] {
  if (period) {
    const coverageTo = reportCoverageEnd(period, now);
    const templates: Array<{
      granularity: ReportCustomWidgetGranularity;
      id: string;
      label: string;
    }> = [
      {
        id: "report_chart_minute",
        label: "Minuto a minuto",
        granularity: "minute",
      },
      { id: "report_chart_hour", label: "Hora a hora", granularity: "hour" },
      { id: "report_chart_day", label: "Dia a dia", granularity: "day" },
      {
        id: "report_chart_week",
        label: "Semana a semana",
        granularity: "week",
      },
      { id: "report_chart_month", label: "Mês a mês", granularity: "month" },
      {
        id: "report_chart_semester",
        label: "Semestre a semestre",
        granularity: "semester",
      },
      { id: "report_chart_year", label: "Ano a ano", granularity: "year" },
    ];

    return templates.map((template) => {
      const granularity = fitReportGranularityToRange(
        template.granularity,
        period.from,
        coverageTo,
      );
      const adjusted = granularity !== template.granularity;

      return {
        id: template.id,
        label: template.label,
        description: adjusted
          ? `Todo o período selecionado, com agrupamento ajustado para ${aggregateGranularityLabel(
              granularity,
            ).toLowerCase()}.`
          : `Todo o período selecionado, ${aggregateGranularityLabel(
              granularity,
            ).toLowerCase()}.`,
        granularity,
        from: alignToGranularity(period.from, granularity),
        to: alignEndToGranularity(coverageTo, granularity),
      };
    });
  }

  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = endOfAggregateBucket(startOfHour(now), "hour");
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);
  const currentSemesterStart = startOfSemester(now);
  const currentYearStart = startOfYear(now);

  const definitions: ScenarioAggregateDefinition[] = [
    {
      id: "report_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "report_chart_hour",
      label: "Hora a hora",
      description: "Hoje por hora.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "report_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "report_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "report_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
    {
      id: "report_chart_semester",
      label: "Semestre a semestre",
      description: "Últimos 6 semestres.",
      granularity: "semester",
      from: addMonths(currentSemesterStart, -5 * 6),
      to: addMonths(currentSemesterStart, 6),
    },
    {
      id: "report_chart_year",
      label: "Ano a ano",
      description: `Últimos ${COUNTING_REPORT_HISTORY_YEARS} anos.`,
      granularity: "year",
      from: addYears(currentYearStart, -(COUNTING_REPORT_HISTORY_YEARS - 1)),
      to: addYears(currentYearStart, 1),
    },
  ];

  return definitions;
}

function fitReportGranularityToRange(
  preferred: ReportCustomWidgetGranularity,
  from: Date,
  to: Date,
): AggregateGranularity {
  const order: ReportCustomWidgetGranularity[] = [
    "minute",
    "hour",
    "day",
    "week",
    "month",
    "semester",
    "year",
  ];
  let index = Math.max(0, order.indexOf(preferred));

  while (
    index < order.length - 1 &&
    estimatedReportBucketCount(from, to, order[index]) > 240
  ) {
    index += 1;
  }

  return order[index];
}

function estimatedReportBucketCount(
  from: Date,
  to: Date,
  granularity: ReportCustomWidgetGranularity,
) {
  const duration = Math.max(0, to.getTime() - from.getTime());
  if (granularity === "minute") return Math.ceil(duration / MINUTE_MS);
  if (granularity === "hour") return Math.ceil(duration / HOUR_MS);
  if (granularity === "day") return Math.ceil(duration / DAY_MS);
  if (granularity === "week") return Math.ceil(duration / (7 * DAY_MS));
  const months = Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 +
      to.getMonth() -
      from.getMonth(),
  );
  if (granularity === "month") return months;
  if (granularity === "semester") return Math.ceil(months / 6);
  return Math.ceil(months / 12);
}

function aggregateGranularityLabel(granularity: AggregateGranularity) {
  const labels: Record<AggregateGranularity, string> = {
    day: "Dia a dia",
    hour: "Hora a hora",
    minute: "Minuto a minuto",
    month: "Mês a mês",
    semester: "Semestre a semestre",
    week: "Semana a semana",
    year: "Ano a ano",
  };

  return labels[granularity];
}

function buildCurrentHourMinutesDefinition(
  now: Date,
): ScenarioAggregateDefinition {
  return {
    id: CURRENT_HOUR_MINUTES_ID,
    label: "Minutos da hora atual",
    description: "Base auxiliar do período aberto.",
    granularity: "minute",
    from: startOfHour(now),
    to: addMinutes(startOfMinute(now), 1),
  };
}

function buildCountingHourHistoryDefinition(
  period: {
    from: Date;
    to: Date;
  },
  now: Date,
): ScenarioAggregateDefinition {
  const to = alignEndToGranularity(reportCoverageEnd(period, now), "hour");
  const lastIncludedInstant = new Date(
    Math.max(period.from.getTime(), to.getTime() - 1),
  );
  const rollingFrom = startOfDay(
    addDays(lastIncludedInstant, -(COUNTING_DIRECTIONAL_PROFILE_DAYS - 1)),
  );

  return {
    id: COUNTING_HOUR_HISTORY_ID,
    label: "Perfil horário recente",
    description: `Base horária limitada aos ${COUNTING_DIRECTIONAL_PROFILE_DAYS} dias mais recentes do período.`,
    granularity: "hour",
    from: new Date(Math.max(period.from.getTime(), rollingFrom.getTime())),
    to,
  };
}

function countingDayHeatmapYear(period: { from: Date; to: Date }) {
  const lastIncludedInstant = new Date(
    period.to > period.from
      ? period.to.getTime() - 1
      : period.from.getTime(),
  );
  return lastIncludedInstant.getFullYear();
}

function buildCountingDayHeatmapDefinition(
  period: { from: Date; to: Date },
  now: Date,
  timeZone?: string,
): ScenarioAggregateDefinition {
  const year = countingDayHeatmapYear(period);
  const yearFrom = new Date(year, 0, 1);
  const yearTo = new Date(year + 1, 0, 1);
  const companyToday = timeZone
    ? companyCalendarDate(now, timeZone, "day")
    : startOfDay(now);
  const includesToday = companyToday >= period.from && companyToday < period.to;
  const closedTo = includesToday ? companyToday : period.to;
  const from = new Date(Math.max(period.from.getTime(), yearFrom.getTime()));
  const boundedTo = Math.min(
    period.to.getTime(),
    closedTo.getTime(),
    yearTo.getTime(),
  );

  return {
    id: COUNTING_DAY_HEATMAP_ID,
    label: "Dias fechados do ano final",
    description: `Base diária dos dias fechados de ${year}, limitada ao período do relatório.`,
    granularity: "day",
    from,
    to: new Date(Math.max(from.getTime(), boundedTo)),
  };
}

function buildCountingMonthHistoryDefinition(
  period: { from: Date; to: Date },
  now: Date,
  includePreviousYear: boolean,
): ScenarioAggregateDefinition {
  const requestedFrom = includePreviousYear
    ? addYears(period.from, -1)
    : period.from;
  return {
    id: COUNTING_MONTH_HISTORY_ID,
    label: "Histórico mensal de contagem",
    description: "Base mensal consolidada dos indicadores do relatório.",
    granularity: "month",
    from: new Date(
      Math.max(
        countingReportHistoryFrom(now).getTime(),
        requestedFrom.getTime(),
      ),
    ),
    to: alignEndToGranularity(reportCoverageEnd(period, now), "month"),
  };
}

function buildCountingOpenComparisonDefinitions(
  period: { from: Date; to: Date },
  now: Date,
): ScenarioAggregateDefinition[] {
  if (now < period.from || now >= period.to) return [];

  const currentMonthFrom = startOfMonth(now);
  const currentDayFrom = startOfDay(now);
  const currentHourTo = startOfHour(now);
  const previousMonthFrom = shiftCalendarYearsClamped(currentMonthFrom, -1);
  const previousDayFrom = shiftCalendarYearsClamped(currentDayFrom, -1);
  const previousHourTo = shiftCalendarYearsClamped(currentHourTo, -1);

  const definitions: ScenarioAggregateDefinition[] = [
    {
      id: COUNTING_OPEN_CURRENT_DAYS_ID,
      label: "Dias fechados do mês aberto",
      description: "Base diária do mês em andamento.",
      granularity: "day",
      from: currentMonthFrom,
      to: currentDayFrom,
    },
    {
      id: COUNTING_OPEN_PREVIOUS_DAYS_ID,
      label: "Dias comparáveis do ano anterior",
      description: "Base diária equivalente do ano anterior.",
      granularity: "day",
      from: previousMonthFrom,
      to: previousDayFrom,
    },
    {
      id: COUNTING_OPEN_CURRENT_HOURS_ID,
      label: "Horas fechadas do dia atual",
      description: "Fronteira horária do mês em andamento.",
      granularity: "hour",
      from: currentDayFrom,
      to: currentHourTo,
    },
    {
      id: COUNTING_OPEN_PREVIOUS_HOURS_ID,
      label: "Horas comparáveis do ano anterior",
      description: "Fronteira horária equivalente do ano anterior.",
      granularity: "hour",
      from: previousDayFrom,
      to: previousHourTo,
    },
  ];

  return definitions.filter((definition) => definition.from < definition.to);
}

function reportCoverageEnd(period: { from: Date; to: Date }, now: Date) {
  return now >= period.from && now < period.to
    ? addMinutes(startOfMinute(now), 1)
    : period.to;
}

function scenarioReportDataCompleteUntil(
  period: { from: Date; to: Date },
  now: Date,
) {
  const inclusiveEnd = new Date(period.to.getTime() - 1);
  return now >= period.from && now < period.to
    ? new Date(Math.min(now.getTime(), inclusiveEnd.getTime()))
    : inclusiveEnd;
}

function buildReportCustomWidgetDefinition(
  widget: ReportScopeCustomWidget,
  definitions: ScenarioAggregateDefinition[],
  scope?: ReportScopeOption,
): ScenarioAggregateDefinition {
  const chartId = reportChartIdForGranularity(widget.granularity);
  const base =
    definitions.find((definition) => definition.id === chartId) ??
    definitions.find((definition) => definition.id === "report_chart_hour") ??
    buildScenarioAggregateDefinitions(new Date())[1];
  const scopeName = scope?.name ?? widget.scopeName;

  return {
    ...base,
    description: `${scopeModeLabel(
      widget.scopeMode,
    )}: ${scopeName}. ${base.description}`,
    id: `report_custom_${widget.id}`,
    label:
      widget.title ||
      buildReportCustomWidgetDefaultTitleFromName(
        scopeName,
        widget.granularity,
      ),
  };
}

function reportScenarioComparisonStorageKey(widgetId: string) {
  return `reports-custom-${widgetId}`;
}

function chartStateForReportGranularity(
  data: Record<string, ScenarioChartState>,
  granularity: ReportCustomWidgetGranularity,
  previous = false,
) {
  const id = reportChartIdForGranularity(granularity);

  return data[previous ? previousId(id) : id];
}

function reportChartIdForGranularity(
  granularity: ReportCustomWidgetGranularity,
) {
  const idByGranularity: Record<ReportCustomWidgetGranularity, string> = {
    day: "report_chart_day",
    hour: "report_chart_hour",
    minute: "report_chart_minute",
    month: "report_chart_month",
    semester: "report_chart_semester",
    week: "report_chart_week",
    year: "report_chart_year",
  };
  return idByGranularity[granularity];
}

function buildReportCustomWidgetDefaultTitle(
  scope: ReportScopeOption,
  granularity: ReportCustomWidgetGranularity,
) {
  return buildReportCustomWidgetDefaultTitleFromName(scope.name, granularity);
}

function buildReportCustomWidgetDefaultTitleFromName(
  scopeName: string,
  granularity: ReportCustomWidgetGranularity,
) {
  return `${scopeName} - ${reportGranularityLabel(granularity)}`;
}

function reportGranularityLabel(granularity: ReportCustomWidgetGranularity) {
  return (
    REPORT_CUSTOM_WIDGET_GRANULARITY_OPTIONS.find(
      (option) => option.value === granularity,
    )?.label ?? "Hora a hora"
  );
}

function buildComparisonDefinition(
  definition: ScenarioAggregateDefinition,
  intradayComparison: IntradayComparisonMode,
  minimumFrom: Date,
): ScenarioAggregateDefinition {
  const comparisonStarts = listScenarioBucketStarts(definition).map((date) =>
    comparisonBucketStart(date, definition.granularity, intradayComparison),
  );
  const comparisonFrom = comparisonStarts.length
    ? new Date(Math.min(...comparisonStarts.map((date) => date.getTime())))
    : definition.from;
  const from = new Date(
    Math.max(comparisonFrom.getTime(), minimumFrom.getTime()),
  );
  const lastStart = comparisonStarts.length
    ? new Date(Math.max(...comparisonStarts.map((date) => date.getTime())))
    : definition.from;

  return {
    ...definition,
    id: previousId(definition.id),
    from,
    to: addGranularity(lastStart, definition.granularity),
  };
}

function previousId(id: string) {
  return `${id}${PREVIOUS_SUFFIX}`;
}

function hydrateScenarioOpenBuckets(
  data: Record<string, ScenarioChartState>,
  now: Date,
  period: { from: Date; to: Date },
) {
  const next = cloneChartData(data);
  const includesNow = now >= period.from && now < period.to;

  const currentHourStart = startOfHour(now);
  const currentMinuteState = next[CURRENT_HOUR_MINUTES_ID];
  const currentMinuteRows = currentMinuteState?.rows ?? [];
  const currentMinuteGranularity = currentMinuteState?.granularity ?? "minute";
  const currentMinuteEnd = addMinutes(startOfMinute(now), 1);

  if (includesNow && currentMinuteState && !currentMinuteState.error) {
    replaceBucketRowsFromSource(
      next,
      COUNTING_HOUR_HISTORY_ID,
      "hour",
      currentHourStart,
      endOfAggregateBucket(currentHourStart, "hour"),
      currentMinuteRows,
      currentMinuteGranularity,
    );
    Object.entries(next).forEach(([chartId, state]) => {
      if (
        !chartId.startsWith("report_chart_") ||
        chartId.endsWith(PREVIOUS_SUFFIX)
      ) {
        return;
      }

      if (state.granularity === "hour") {
        next[chartId] = {
          ...state,
          rows: reconcileAggregateRows(
            state.rows,
            "hour",
            currentMinuteRows,
            currentMinuteGranularity,
            currentHourStart,
            endOfAggregateBucket(currentHourStart, "hour"),
          ),
        };
      } else if (state.granularity === "minute") {
        next[chartId] = {
          ...state,
          rows: reconcileAggregateRows(
            state.rows,
            "minute",
            currentMinuteRows,
            currentMinuteGranularity,
            currentHourStart,
            currentMinuteEnd,
          ),
        };
      }
    });
  }

  return next;
}

function cloneChartData(data: Record<string, ScenarioChartState>) {
  return Object.fromEntries(
    Object.entries(data).map(([id, state]) => [
      id,
      { ...state, rows: [...state.rows] },
    ]),
  ) as Record<string, ScenarioChartState>;
}

function replaceBucketRowsFromSource(
  data: Record<string, ScenarioChartState>,
  chartId: string,
  targetGranularity: AggregateGranularity,
  bucketStart: Date,
  bucketEnd: Date,
  sourceRows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
) {
  const state = data[chartId];
  if (!state) return;

  data[chartId] = {
    ...state,
    rows: reconcileAggregateRows(
      state.rows,
      targetGranularity,
      sourceRows,
      sourceGranularity,
      bucketStart,
      bucketEnd,
    ),
  };
}

async function fetchSubLocations(
  locations: Location[],
  companyScopeId?: string | null,
  signal?: AbortSignal,
  requireExplicitCompanyId = false,
) {
  const expectedCompanyId = companyScopeId?.trim() || undefined;
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<unknown>(`/locations/${location.id}/sub-locations`, {
        companyScopeId: expectedCompanyId,
        signal,
      }).then((value) =>
        requireSubLocationRows(
          requireExplicitCompanyId
            ? selectExplicitCompanyScopedRows(value, expectedCompanyId!, {
                label: "sublocais",
              }).rows
            : value,
          expectedCompanyId,
        ),
      ),
    ),
  );

  return filterScopedApiRows(
    requireSubLocationRows(rows.flat(), expectedCompanyId),
    companyScopeId,
  );
}

function buildReportScopeOptions({
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
  mode: ReportScopeMode;
  scenarios: Scenario[];
  subLocations: SubLocation[];
}) {
  if (mode === "location") {
    return buildLocationCameraOptions({
      cameras,
      locations,
      manager,
    }).map<ReportScopeOption>((option) => ({
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
    }).map<ReportScopeOption>((option) => ({
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

  return scenarios.map<ReportScopeOption>((scenario) => ({
    cameraIds: [],
    description: scenario.description || "Cenário personalizado de contagem.",
    id: scenario.id,
    mode: "scenario",
    name: scenario.name,
    scenario,
  }));
}

function buildReportScopeModes({
  cameras,
  groups,
  locations,
  manager,
  scenarios,
  subLocations,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  scenarios: Scenario[];
  subLocations: SubLocation[];
}) {
  const modes: Array<{ label: string; value: ReportScopeMode }> = [];
  if (scenarios.length) modes.push({ label: "Cenário", value: "scenario" });
  if (
    buildReportScopeOptions({
      cameras,
      groups,
      locations,
      manager,
      mode: "location",
      scenarios,
      subLocations,
    }).length
  ) {
    modes.push({ label: "Local", value: "location" });
  }
  if (
    buildReportScopeOptions({
      cameras,
      groups,
      locations,
      manager,
      mode: "sub_location",
      scenarios,
      subLocations,
    }).length
  ) {
    modes.push({ label: "Sublocal", value: "sub_location" });
  }

  return modes;
}

function scopeModeLabel(mode: ReportScopeMode) {
  if (mode === "location") return "Local";
  if (mode === "sub_location") return "Sublocal";
  return "Cenário";
}

function resolveReportWidgetScope(
  scope: ReportScopeOption,
  scenarios: Scenario[],
  selection: CardScenarioSelection,
): ReportScopeOption {
  if (selection.mode === "inherit") return scope;

  const selectedScenarios = resolveWidgetScenarios(scenarios, selection);
  const selectionLabel = widgetScenarioSelectionLabel(
    selectedScenarios,
    selection,
  );
  return {
    ...scope,
    description: `${scope.description} Composição do widget: ${selectionLabel}.`,
    name:
      scope.mode === "scenario"
        ? selectionLabel
        : `${scope.name} · ${selectionLabel}`,
    scenario: undefined,
    scenarios: selectedScenarios,
  };
}

function buildReportScopeAggregatePoints(
  definition: ScenarioAggregateDefinition,
  rows: AggregateEventRow[],
  scope: ReportScopeOption,
) {
  const totals = aggregateReportScopeRowsByBucket(
    rows,
    scope,
    definition.granularity,
  );
  const points: ChartPoint[] = [];
  listScenarioBucketStarts(definition).forEach((bucketStart) => {
    const key = bucketKeyForGranularity(bucketStart, definition.granularity);
    points.push({
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
      total: totals.get(key) ?? 0,
    });
  });

  return points;
}

function buildReportScopeAggregateComparisonPoints(
  definition: ScenarioAggregateDefinition,
  rows: AggregateEventRow[],
  scope: ReportScopeOption,
  intradayComparison: IntradayComparisonMode,
) {
  const totals = aggregateReportScopeRowsByBucket(
    rows,
    scope,
    definition.granularity,
  );

  return listScenarioBucketStarts(definition).map((bucketStart) => {
    const comparisonStart = comparisonBucketStart(
      bucketStart,
      definition.granularity,
      intradayComparison,
    );
    const key = bucketKeyForGranularity(
      comparisonStart,
      definition.granularity,
    );

    return {
      bucket: comparisonStart.toISOString(),
      label: bucketLabel(comparisonStart, definition.granularity),
      total: totals.get(key) ?? 0,
    };
  });
}

function aggregateReportScopeRowsByBucket(
  rows: AggregateEventRow[],
  scope: ReportScopeOption,
  granularity: AggregateGranularity,
) {
  const selectedScenarios =
    scope.scenarios ?? (scope.scenario ? [scope.scenario] : null);
  if (selectedScenarios) {
    const multipliers = buildCombinedScenarioMultiplierMap(selectedScenarios);
    const cameraIds = new Set(scope.cameraIds);
    const filterByCamera = scope.mode !== "scenario";
    const totals = new Map<number, number>();

    rows.forEach((row) => {
      if (
        filterByCamera &&
        (!row.camera_id || !cameraIds.has(row.camera_id))
      ) {
        return;
      }
      const multiplier = row.line_count_id
        ? multipliers.get(row.line_count_id)
        : undefined;
      if (multiplier === undefined) return;

      const date = parseAggregateBucket(row.bucket, granularity);
      if (!date) return;

      const key = bucketKeyForGranularity(date, granularity);
      totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0) * multiplier);
    });

    return totals;
  }

  const cameraIds = new Set(scope.cameraIds);
  const totals = new Map<number, number>();

  rows.forEach((row) => {
    if (!row.camera_id || !cameraIds.has(row.camera_id)) return;

    const date = parseAggregateBucket(row.bucket, granularity);
    if (!date) return;

    const key = bucketKeyForGranularity(date, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0));
  });

  return totals;
}

function listScenarioBucketStarts(definition: ScenarioAggregateDefinition) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(definition.from, definition.granularity);
  const end = alignEndToGranularity(definition.to, definition.granularity);
  let guard = 0;

  while (cursor < end && guard < 500) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, definition.granularity);
    guard += 1;
  }

  if (cursor < end) {
    throw new RangeError(
      "O período excede 500 intervalos no gráfico. Reduza a janela para evitar dados truncados.",
    );
  }

  return starts;
}

function comparisonBucketStart(
  bucketStart: Date,
  granularity: AggregateGranularity,
  intradayComparison: IntradayComparisonMode,
) {
  if (granularity === "minute" || granularity === "hour") {
    return addDays(bucketStart, intradayComparison === "last_week" ? -7 : -1);
  }
  if (granularity === "day") return addDays(bucketStart, -7);
  if (granularity === "week") return equivalentWeekInPreviousMonth(bucketStart);
  return addYears(bucketStart, -1);
}

function equivalentWeekInPreviousMonth(bucketStart: Date) {
  const currentMonthGridStart = startOfWeek(startOfMonth(bucketStart));
  const weekIndex = Math.max(
    0,
    Math.round(
      (startOfWeek(bucketStart).getTime() - currentMonthGridStart.getTime()) /
        (7 * DAY_MS),
    ),
  );
  const previousMonthGridStart = startOfWeek(
    addMonths(startOfMonth(bucketStart), -1),
  );

  return addDays(previousMonthGridStart, weekIndex * 7);
}

function comparisonSeriesName(
  definition: ScenarioAggregateDefinition,
  intradayComparison: IntradayComparisonMode,
) {
  if (
    definition.granularity === "minute" ||
    definition.granularity === "hour"
  ) {
    const currentReference = addMinutes(definition.to, -1);
    const comparisonReference = comparisonBucketStart(
      currentReference,
      definition.granularity,
      intradayComparison,
    );

    return intradayComparison === "last_week"
      ? `Semana passada (${weekdayName(comparisonReference)})`
      : `Ontem (${weekdayName(comparisonReference)})`;
  }
  if (definition.granularity === "day") return "Mesmo dia da semana passada";
  if (definition.granularity === "week") return "Mesma semana do mês anterior";
  if (definition.granularity === "month") return "Mesmo mês do ano anterior";
  if (definition.granularity === "semester")
    return "Mesmo semestre do ano anterior";
  return "Ano anterior";
}

function buildChartOption(
  definition: ScenarioAggregateDefinition,
  points: ChartPoint[],
  previousPoints: ChartPoint[],
  intradayComparison: IntradayComparisonMode,
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  const showPreviousSeries = previousPoints.length > 0;
  const previousName = comparisonSeriesName(definition, intradayComparison);

  return {
    color: showPreviousSeries ? ["#B7C7DA", widgetColor] : [widgetColor],
    grid: {
      left: 4,
      right: 10,
      top: showPreviousSeries ? 58 : 18,
      bottom: 2,
      containLabel: true,
    },
    legend: showPreviousSeries
      ? {
          top: 0,
          left: 0,
          right: 0,
          itemGap: 14,
          itemWidth: 10,
          itemHeight: 10,
          textStyle: {
            color: "#526477",
            fontSize: 12,
          },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: "rgba(18, 103, 196, 0.06)",
        },
      },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      padding: [10, 12],
      textStyle: {
        color: "#13233A",
        fontSize: 12,
      },
      valueFormatter: (value) =>
        value === null || value === undefined
          ? "-"
          : `${formatNumber(Number(value))} no cenário`,
    },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: points.map((point) => point.label),
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: "#E8EEF6",
        },
      },
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
      },
    },
    series: [
      ...(showPreviousSeries
        ? [
            {
              name: previousName,
              type: "bar",
              data: points.map((_, index) => previousPoints[index]?.total ?? 0),
              barMaxWidth: barMaxWidth(definition.granularity),
              barCategoryGap:
                definition.granularity === "minute" ||
                definition.granularity === "hour"
                  ? "42%"
                  : "50%",
              itemStyle: {
                borderRadius: [2, 2, 0, 0],
                color: "#B7C7DA",
              },
            },
          ]
        : []),
      {
        name: "Período atual",
        type: "bar",
        data: points.map((point) => point.total),
        barMaxWidth: barMaxWidth(definition.granularity),
        barGap: "18%",
        barCategoryGap:
          definition.granularity === "minute" ||
          definition.granularity === "hour"
            ? "42%"
            : "50%",
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: widgetColor,
        },
      },
    ],
  };
}

function buildScenarioReportChart(
  definition: ScenarioAggregateDefinition,
  rows: AggregateEventRow[],
  previousRows: AggregateEventRow[],
  scope: ReportScopeOption,
  showPreviousPeriod: boolean,
  intradayComparison: IntradayComparisonMode,
  timeZone: string,
  widgetColor?: string,
): ReportPayload["charts"][number] {
  const points = buildReportScopeAggregatePoints(definition, rows, scope);
  const previousPoints = showPreviousPeriod
    ? buildReportScopeAggregateComparisonPoints(
        definition,
        previousRows,
        scope,
        intradayComparison,
      )
    : [];
  const previousColumnLabel = comparisonSeriesName(
    definition,
    intradayComparison,
  );
  const showWeekday = definition.granularity === "day";
  const showWeekOfMonth = definition.granularity === "week";

  return {
    comparison: showPreviousPeriod
      ? comparisonDescription(definition, intradayComparison)
      : undefined,
    description: definition.description,
    option: buildChartOption(
      definition,
      points,
      previousPoints,
      intradayComparison,
      widgetColor,
    ),
    table: {
      title: `Dados - ${definition.label}`,
      columns: [
        { key: "period", label: "Período", width: 20 },
        { key: "period_start", label: "Início do período", width: 22 },
        ...(showWeekday
          ? [{ key: "weekday", label: "Dia da semana", width: 20 }]
          : []),
        ...(showWeekOfMonth
          ? [{ key: "week_of_month", label: "Semana do mês", width: 20 }]
          : []),
        { key: "current", label: "Período atual", width: 18, numeric: true },
        ...(showPreviousPeriod
          ? [
              {
                key: "previous",
                label: previousColumnLabel,
                width: 28,
                numeric: true,
              },
              {
                key: "previous_reference",
                label: "Referência anterior",
                width: 32,
              },
            ]
          : []),
      ],
      rows: points.map((point, index) => ({
        current: point.total,
        period: point.label,
        period_start: formatDateTime(point.bucket, timeZone),
        weekday: showWeekday
          ? weekdayName(new Date(point.bucket), timeZone)
          : undefined,
        previous: showPreviousPeriod
          ? (previousPoints[index]?.total ?? 0)
          : undefined,
        previous_reference:
          showPreviousPeriod && previousPoints[index]
            ? comparisonReferenceLabel(
                definition.granularity,
                new Date(point.bucket),
                new Date(previousPoints[index].bucket),
                intradayComparison,
                timeZone,
              )
            : undefined,
        week_of_month: showWeekOfMonth
          ? weekOfMonthLabel(new Date(point.bucket), false, timeZone)
          : undefined,
      })),
    },
    title: definition.label,
  };
}

function comparisonDescription(
  definition: ScenarioAggregateDefinition,
  intradayComparison: IntradayComparisonMode,
) {
  if (
    definition.granularity === "minute" ||
    definition.granularity === "hour"
  ) {
    const currentReference = addMinutes(definition.to, -1);
    const comparisonReference = comparisonBucketStart(
      currentReference,
      definition.granularity,
      intradayComparison,
    );

    return intradayComparison === "last_week"
      ? `Comparando com ${weekdayName(comparisonReference)} da semana passada.`
      : `Comparando com ontem, ${weekdayName(comparisonReference)}.`;
  }
  if (definition.granularity === "day") {
    return "Comparando com os mesmos dias da semana passada.";
  }
  if (definition.granularity === "week") {
    return "Comparando cada semana com a mesma semana do mês anterior: 1ª com 1ª, 2ª com 2ª, e assim por diante.";
  }
  if (definition.granularity === "month") {
    return "Comparando cada mês com o mesmo mês do ano anterior.";
  }
  if (definition.granularity === "semester") {
    return "Comparando cada semestre com o mesmo semestre do ano anterior.";
  }
  return "Comparando cada ano com o ano anterior.";
}

function comparisonReferenceLabel(
  granularity: AggregateGranularity,
  currentDate: Date,
  previousDate: Date,
  intradayComparison: IntradayComparisonMode,
  timeZone?: string,
) {
  if (granularity === "minute" || granularity === "hour") {
    return intradayComparison === "last_week"
      ? `${weekdayName(previousDate, timeZone)} da semana passada (${formatShortDate(previousDate, timeZone)})`
      : `Ontem, ${weekdayName(previousDate, timeZone)} (${formatShortDate(previousDate, timeZone)})`;
  }
  if (granularity === "day") {
    return `${weekdayName(previousDate, timeZone)} anterior (${formatShortDate(previousDate, timeZone)})`;
  }
  if (granularity === "week") {
    return `${weekOfMonthLabel(previousDate, false, timeZone)} de ${monthYearLabel(previousDate, timeZone)}`;
  }
  const previousYear = reportCalendarYear(previousDate, timeZone);
  if (granularity === "month") {
    return `Mesmo mês em ${previousYear}`;
  }
  if (granularity === "semester") {
    return `Mesmo semestre em ${previousYear}`;
  }

  return `${reportCalendarYear(currentDate, timeZone) - 1}`;
}

function weekOfMonthLabel(date: Date, compact: boolean, timeZone?: string) {
  const civilDate = timeZone
    ? companyCalendarDate(date, timeZone, "day")
    : date;
  const index = weekOfMonthIndex(civilDate) + 1;
  const suffix = compact ? "sem." : "semana";
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: compact ? "short" : "long",
    ...(timeZone ? { timeZone } : {}),
  })
    .format(date)
    .replace(".", "");

  return `${index}ª ${suffix} ${month}`;
}

function weekOfMonthIndex(date: Date) {
  const monthGridStart = startOfWeek(startOfMonth(date));

  return Math.max(
    0,
    Math.round(
      (startOfWeek(date).getTime() - monthGridStart.getTime()) / (7 * DAY_MS),
    ),
  );
}

function weekdayName(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function weekdayShortName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
}

function monthYearLabel(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(timeZone ? { timeZone } : {}),
    year: "2-digit",
  }).format(date);
}

function reportCalendarYear(date: Date, timeZone?: string) {
  return (timeZone
    ? companyCalendarDate(date, timeZone, "year")
    : date
  ).getFullYear();
}

function barMaxWidth(granularity: AggregateGranularity) {
  if (granularity === "minute" || granularity === "hour") return 18;
  if (granularity === "day" || granularity === "week") return 26;
  return 34;
}

function alignToGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  if (granularity === "month") return startOfMonth(date);
  if (granularity === "semester") return startOfSemester(date);
  return startOfYear(date);
}

function alignEndToGranularity(date: Date, granularity: AggregateGranularity) {
  const aligned = alignToGranularity(date, granularity);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity);
}

function addGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") return endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "month") return addMonths(date, 1);
  if (granularity === "semester") return addMonths(date, 6);
  return addYears(date, 1);
}

function bucketKeyForGranularity(
  date: Date,
  granularity: AggregateGranularity,
) {
  if (granularity === "minute") return startOfMinute(date).getTime();
  if (granularity === "hour") return startOfHour(date).getTime();
  if (granularity === "day") {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (granularity === "week") {
    const weekStart = startOfWeek(date);
    return Date.UTC(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate(),
    );
  }
  if (granularity === "month") {
    return Date.UTC(date.getFullYear(), date.getMonth(), 1);
  }
  if (granularity === "semester") {
    return Date.UTC(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
  }

  return Date.UTC(date.getFullYear(), 0, 1);
}

function bucketLabel(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return formatTime(date);
  if (granularity === "hour")
    return `${String(date.getHours()).padStart(2, "0")}h`;
  if (granularity === "day") {
    const dayMonth = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);

    return `${weekdayShortName(date)} ${dayMonth}`;
  }
  if (granularity === "week") return weekOfMonthLabel(date, true);
  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
    }).format(date);
  }
  if (granularity === "semester") {
    return `${date.getMonth() < 6 ? "1S" : "2S"} ${date.getFullYear()}`;
  }
  return String(date.getFullYear());
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

function shiftCalendarYearsClamped(date: Date, years: number) {
  const targetYear = date.getFullYear() + years;
  const targetMonth = date.getMonth();
  const targetDay = Math.min(
    date.getDate(),
    new Date(targetYear, targetMonth + 1, 0).getDate(),
  );

  return new Date(
    targetYear,
    targetMonth,
    targetDay,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

function reportDateSlug(date: Date) {
  return date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function formatReportCivilDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function reportErrorMessage(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}
