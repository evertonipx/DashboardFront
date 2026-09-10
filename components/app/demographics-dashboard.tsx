"use client";

import * as React from "react";
import {
  Activity,
  CalendarRange,
  Clock3,
  HeartPulse,
  RefreshCw,
  Settings2,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { useAuth } from "@/components/app/auth-provider";
import {
  CardLayout,
  ReorderModeButton,
  type LayoutCard,
} from "@/components/app/card-layout";
import { CompactMetricCard } from "@/components/app/compact-metric-card";
import { DemographicsWidgetControls } from "@/components/app/demographics-widget-controls";
import { DemographicsTemporalControls } from "@/components/app/demographics-temporal-controls";
import { DemographicsTemporalWidget } from "@/components/app/demographics-temporal-widget";
import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import { AnalysisDateRangePicker } from "@/components/app/occupancy-date-range-picker";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { useTheme } from "@/components/app/theme-provider";
import {
  WidgetTitleText,
} from "@/components/app/widget-appearance";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { hasVisualAdminAccess } from "@/lib/access";
import { ApiError, apiFetch } from "@/lib/api";
import { heatmapLabelColor, monochromeHeatmapPalette } from "@/lib/chart-palette";
import {
  companyDateKey,
  formatCompanyDateTime,
  startOfCompanyTimeZoneCivilDay,
} from "@/lib/company-time-zone";
import {
  aggregateDemographicBuckets,
  combineDemographicAggregations,
  requireDemographicBucketsResponse,
  summarizeDemographicBuckets,
  type DemographicAggregation,
  type DemographicDistributionItem,
} from "@/lib/demographics";
import {
  countDemographicsDateRangeDays,
  demographicsDateRangeStorageKey,
  loadDemographicsDateRange,
  MAX_DEMOGRAPHICS_DATE_RANGE_DAYS,
  saveDemographicsDateRange,
} from "@/lib/demographics-date-range";
import { buildDemographicDistributionOption, fitDemographicCompositionOption } from "@/lib/demographics-chart-options";
import { buildDemographicCrossingOption, demographicHeatmapColors } from "@/lib/demographics-crossing-options";
import { buildDemographicComparisonWindow } from "@/lib/demographics-comparison-window";
import { buildDemographicTemporalModel } from "@/lib/demographics-temporal-chart-options";
import {
  DEMOGRAPHICS_TEMPORAL_WIDGET_IDS,
  isDemographicTemporalWidgetId,
  normalizeDemographicTemporalSettings,
  type DemographicTemporalSettings,
  type DemographicTemporalWidgetId,
} from "@/lib/demographics-temporal-preferences";
import {
  demographicCategoryColor,
  demographicCategoryLabel,
  demographicDimensionForCard,
  demographicPalettePreviewColors,
  getDemographicPalette,
  normalizeDemographicPresentation,
  type DemographicPresentation,
} from "@/lib/demographics-presentation";
import {
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import type { OccupancyAnalysisDateRangeInput } from "@/lib/occupancy-analysis-window";
import {
  type ReportChart,
  type ReportPayload,
  type ReportTable,
} from "@/lib/report-export";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import type { DemographicBucketRow, DemographicGender } from "@/lib/types";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { cn, formatNumber } from "@/lib/utils";
import {
  loadScopedCardPreferences,
  saveCardPreferences,
  type CardMenuKey,
  type CardPreference,
} from "@/lib/view-preferences";

export type DemographicsDashboardProps = {
  manager?: boolean;
  surface: "live" | "analysis" | "reports";
};

export const DEMOGRAPHICS_CARD_IDS = [
  "demographics_total",
  "demographics_gender_leader",
  "demographics_age_leader",
  "demographics_emotion_leader",
  "demographics_gender_mix",
  "demographics_age_distribution",
  "demographics_emotion_distribution",
  "demographics_age_gender_pyramid",
  "demographics_age_emotion_heatmap",
  ...DEMOGRAPHICS_TEMPORAL_WIDGET_IDS,
] as const;

const DEMOGRAPHICS_MENU_KEY = "demographics" as CardMenuKey;
const LIVE_TAIL_MINUTES = 5;
// Reconciliamos continuamente os cinco minutos finais. Uma releitura integral
// fica rara e o botão Atualizar continua disponível para reconciliação manual.
const LIVE_FULL_REFRESH_MS = 6 * 60 * 60 * 1_000;
const MINUTE_MS = 60_000;
const MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES = 400;
const GENDER_COLORS: Record<DemographicGender, string> = {
  Woman: "#DB2777",
  Man: "#2563EB",
  unknown: "#8A99AF",
};
const HEATMAP_BASE_COLOR = "#2563EB";
const HEATMAP_COLORS = monochromeHeatmapPalette(HEATMAP_BASE_COLOR);

type DashboardDataState = {
  key: string;
  refreshVersion: number;
  summary: DemographicAggregation;
  through: number;
};

type DemographicRequestWindow = {
  from: Date;
  partitions: DemographicRequestPartition[];
  to: Date;
};

type DemographicRequestPartition = {
  from: Date;
  to: Date;
};

type LiveAggregationCache = {
  lastFullRefreshAt: number;
  scopeKey: string;
  stableSummary: DemographicAggregation;
  stableTo: number;
  tailRows: DemographicBucketRow[];
  to: number;
};

type PendingLiveAggregation = {
  controller: AbortController;
  key: string;
  promise: Promise<DemographicAggregation>;
};

export function DemographicsDashboard({
  manager = false,
  surface,
}: DemographicsDashboardProps) {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const timeZoneResolution = useEffectiveCompanyTimeZoneResolution(user);
  const timeZone = timeZoneResolution.timeZone;
  const canEditVisual = hasVisualAdminAccess(user);
  const preferenceScopeId = `demographics-${surface}`;
  const preferenceIdentityKey = `${companyScopeId}|${user?.id ?? ""}|${preferenceScopeId}`;
  const scopedPreferences = React.useMemo(
    () =>
      loadScopedCardPreferences(
        DEMOGRAPHICS_MENU_KEY,
        [...DEMOGRAPHICS_CARD_IDS],
        companyScopeId,
        user?.id,
        preferenceScopeId,
      ),
    [companyScopeId, preferenceScopeId, user?.id],
  );
  const [preferenceState, setPreferenceState] = React.useState<{
    key: string;
    value: CardPreference[];
  } | null>(null);
  const preferences =
    preferenceState?.key === preferenceIdentityKey
      ? preferenceState.value
      : scopedPreferences;
  const hasVisibleWidgets = preferences.some(
    (preference) => preference.visible !== false,
  );
  const synchronizePreferences = React.useCallback(() => {
    setPreferenceState({
      key: preferenceIdentityKey,
      value: loadScopedCardPreferences(
        DEMOGRAPHICS_MENU_KEY,
        [...DEMOGRAPHICS_CARD_IDS],
        companyScopeId,
        user?.id,
        preferenceScopeId,
      ),
    });
  }, [companyScopeId, preferenceIdentityKey, preferenceScopeId, user?.id]);
  const widgetPresentations = React.useMemo(() => {
    const result: Partial<Record<string, DemographicPresentation>> = {};
    for (const id of DEMOGRAPHICS_CARD_IDS) {
      const dimension = demographicDimensionForCard(id);
      if (dimension) {
        result[id] = normalizeDemographicPresentation(
          preferences.find((preference) => preference.id === id)?.demographics,
          dimension,
        );
      }
    }
    return result;
  }, [preferences]);
  const updateWidgetPresentation = React.useCallback((id: string, value: DemographicPresentation) => {
    const dimension = demographicDimensionForCard(id);
    if (!dimension || !canEditVisual || !companyScopeId || !user?.id) return;
    // Read the latest layout before merging: changing a chart must not revert
    // a concurrent resize, title edit, saved view or another widget's settings.
    const latest = loadScopedCardPreferences(
      DEMOGRAPHICS_MENU_KEY, [...DEMOGRAPHICS_CARD_IDS], companyScopeId, user.id, preferenceScopeId,
    );
    const updated = latest.map((preference) => preference.id === id
      ? { ...preference, demographics: normalizeDemographicPresentation(value, dimension) }
      : preference);
    saveCardPreferences(
      DEMOGRAPHICS_MENU_KEY, updated, [...DEMOGRAPHICS_CARD_IDS], companyScopeId, user.id, preferenceScopeId,
    );
    setPreferenceState({ key: preferenceIdentityKey, value: updated });
  }, [canEditVisual, companyScopeId, preferenceIdentityKey, preferenceScopeId, user]);
  const temporalSettings = React.useMemo(() => Object.fromEntries(
    DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.map((id) => [id, normalizeDemographicTemporalSettings(
      preferences.find((preference) => preference.id === id)?.demographicsTemporal, id,
    )]),
  ) as Record<DemographicTemporalWidgetId, DemographicTemporalSettings>, [preferences]);
  const updateTemporalSettings = React.useCallback((id: DemographicTemporalWidgetId, value: DemographicTemporalSettings) => {
    if (!isDemographicTemporalWidgetId(id) || !canEditVisual || !companyScopeId || !user?.id) return;
    const latest = loadScopedCardPreferences(DEMOGRAPHICS_MENU_KEY, [...DEMOGRAPHICS_CARD_IDS], companyScopeId, user.id, preferenceScopeId);
    const updated = latest.map((preference) => preference.id === id
      ? { ...preference, demographicsTemporal: normalizeDemographicTemporalSettings(value, id) } : preference);
    saveCardPreferences(DEMOGRAPHICS_MENU_KEY, updated, [...DEMOGRAPHICS_CARD_IDS], companyScopeId, user.id, preferenceScopeId);
    setPreferenceState({ key: preferenceIdentityKey, value: updated });
  }, [canEditVisual, companyScopeId, preferenceIdentityKey, preferenceScopeId, user]);
  const [clock, setClock] = React.useState(() => new Date());
  const todayInput = companyDateKey(clock, timeZone);
  const rangeScopeKey = `${companyScopeId}|${user?.id ?? ""}|${surface}`;
  const historicalQueryIdentityKey = `${companyScopeId}|${user?.id ?? ""}|${surface}`;
  const fallbackRange = React.useMemo(
    () => defaultRangeForSurface(surface, todayInput),
    [surface, todayInput],
  );
  const [rangeState, setRangeState] = React.useState<{
    key: string;
    source: "default" | "applied" | "saved";
    timeZone: string;
    value: OccupancyAnalysisDateRangeInput;
  } | null>(null);
  const appliedRange =
    rangeState?.key === rangeScopeKey ? rangeState.value : fallbackRange;
  const rangeReady = surface === "live" || rangeState?.key === rangeScopeKey;
  const [historicalQueryScopeKey, setHistoricalQueryScopeKey] =
    React.useState("");
  const queryRequested =
    surface === "live" ||
    historicalQueryScopeKey === historicalQueryIdentityKey;
  const [dataState, setDataState] = React.useState<DashboardDataState | null>(
    null,
  );
  const [loading, setLoading] = React.useState(surface === "live");
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadProgress, setLoadProgress] = React.useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [error, setError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [organizerOpen, setOrganizerOpen] = React.useState(false);
  const [reorderMode, setReorderMode] = React.useState(false);
  const requestSequenceRef = React.useRef(0);
  const activeRequestRef = React.useRef<AbortController | null>(null);
  const comparisonRequestRef = React.useRef<AbortController | null>(null);
  const dashboardAttachedRef = React.useRef(false);
  const dashboardDetachTimerRef = React.useRef<number | null>(null);
  const liveCacheRef = React.useRef<LiveAggregationCache | null>(null);
  const pendingLiveAggregationRef =
    React.useRef<PendingLiveAggregation | null>(null);
  const partitionCacheRef = React.useRef(
    new Map<string, DemographicAggregation>(),
  );
  const dataStateRef = React.useRef<DashboardDataState | null>(null);

  React.useEffect(() => {
    dashboardAttachedRef.current = true;
    if (dashboardDetachTimerRef.current !== null) {
      window.clearTimeout(dashboardDetachTimerRef.current);
      dashboardDetachTimerRef.current = null;
    }

    return () => {
      dashboardAttachedRef.current = false;
      dashboardDetachTimerRef.current = window.setTimeout(() => {
        dashboardDetachTimerRef.current = null;
        if (dashboardAttachedRef.current) return;
        const pending = pendingLiveAggregationRef.current;
        if (pending) {
          abortRequest(
            pending.controller,
            "A consulta demográfica foi encerrada com a tela.",
          );
          pendingLiveAggregationRef.current = null;
        }
      }, 0);
    };
  }, []);

  React.useEffect(() => {
    if (surface !== "live" || !hasVisibleWidgets) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setClock(new Date());
    }, 30_000);
    const synchronizeVisibility = () => {
      if (document.visibilityState === "visible") setClock(new Date());
    };
    document.addEventListener("visibilitychange", synchronizeVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", synchronizeVisibility);
    };
  }, [hasVisibleWidgets, surface]);

  React.useEffect(() => {
    if (surface === "live") return;
    const storageKey = demographicsDateRangeStorageKey({
      companyId: companyScopeId,
      surface,
      userId: user?.id,
    });
    const loadSavedRange = () =>
      loadDemographicsDateRange({
        companyId: companyScopeId,
        fallback: fallbackRange,
        surface,
        todayInput,
        userId: user?.id,
      });
    const publishRange = (nextRange: OccupancyAnalysisDateRangeInput) => {
      setRangeState({
        key: rangeScopeKey,
        source: "saved",
        timeZone,
        value: nextRange,
      });
    };
    if (surface === "analysis") {
      // Re-anchor the initial default if company timezone metadata hydrates.
      // A later clock tick or an explicitly applied selection must not reset it.
      setRangeState((current) =>
        current?.key === rangeScopeKey &&
        (current.source !== "default" || current.timeZone === timeZone)
          ? current
          : { key: rangeScopeKey, source: "default", timeZone, value: fallbackRange },
      );
      setHistoricalQueryScopeKey(historicalQueryIdentityKey);
      return;
    }
    const synchronizeRange = () => publishRange(loadSavedRange());
    const synchronizeStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === storageKey) synchronizeRange();
    };

    synchronizeRange();
    window.addEventListener("storage", synchronizeStorage);
    window.addEventListener(USER_GRID_HYDRATED_EVENT, synchronizeRange);
    return () => {
      window.removeEventListener("storage", synchronizeStorage);
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, synchronizeRange);
    };
  }, [
    companyScopeId,
    fallbackRange,
    historicalQueryIdentityKey,
    rangeScopeKey,
    surface,
    timeZone,
    todayInput,
    user?.id,
  ]);

  const closedMinuteInstantMs =
    Math.floor(clock.getTime() / MINUTE_MS) * MINUTE_MS;
  const requestWindow = React.useMemo(
    () =>
      buildDemographicRequestWindow({
        clock: new Date(closedMinuteInstantMs),
        endInput: surface === "live" ? todayInput : appliedRange.endInput,
        startInput: surface === "live" ? todayInput : appliedRange.startInput,
        timeZone,
      }),
    [
      appliedRange.endInput,
      appliedRange.startInput,
      closedMinuteInstantMs,
      surface,
      timeZone,
      todayInput,
    ],
  );
  const dataScopeKey = React.useMemo(
    () =>
      [
        companyScopeId,
        timeZone,
        surface,
        surface === "live" ? todayInput : appliedRange.startInput,
        surface === "live" ? todayInput : appliedRange.endInput,
      ].join("|"),
    [
      appliedRange.endInput,
      appliedRange.startInput,
      companyScopeId,
      surface,
      timeZone,
      todayInput,
    ],
  );
  const liveCacheScopeKey = `${companyScopeId}|${timeZone}|${todayInput}`;

  React.useEffect(() => {
    const sequence = ++requestSequenceRef.current;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    let disposed = false;
    const isCurrent = () =>
      !disposed &&
      !controller.signal.aborted &&
      sequence === requestSequenceRef.current;

    async function load() {
      if (!isCurrent()) return;
      // Analysis opens automatically with the latest fully closed day.
      // Reports and later picker edits still wait for Apply/Refresh.
      if (!queryRequested) {
        if (!isCurrent()) return;
        setLoading(false);
        setRefreshing(false);
        setLoadProgress(null);
        setError("");
        return;
      }
      if (!hasVisibleWidgets) {
        cancelPendingLiveDemographicAggregation(
          pendingLiveAggregationRef,
          "A consulta demográfica foi cancelada porque todos os widgets estão ocultos.",
        );
        if (!isCurrent()) return;
        setLoading(false);
        setRefreshing(false);
        setLoadProgress(null);
        setError("");
        return;
      }
      if (!companyScopeId) {
        if (!isCurrent()) return;
        setLoading(false);
        setRefreshing(false);
        setLoadProgress(null);
        setError("Selecione uma empresa para consultar os dados demográficos.");
        return;
      }
      if (!rangeReady) {
        setLoading(true);
        setRefreshing(false);
        setLoadProgress(null);
        setError("");
        return;
      }

      const blockingLoad = dataStateRef.current?.key !== dataScopeKey;
      setLoading(blockingLoad);
      setRefreshing(!blockingLoad);
      setLoadProgress(null);
      setError("");
      try {
        const cachedHistoricalResult =
          surface !== "live" &&
          requestWindow.partitions.every((partition) =>
            partitionCacheRef.current.has(
              demographicPartitionCacheKey(partition, companyScopeId, timeZone),
            ),
          );
        const publishProgress = (completed: number, total: number) => {
          if (isCurrent()) setLoadProgress({ completed, total });
        };
        const summary =
          surface === "live"
            ? await loadSharedLiveDemographicAggregation({
                cacheRef: liveCacheRef,
                companyScopeId,
                onProgress: publishProgress,
                pendingRef: pendingLiveAggregationRef,
                partitionCache: partitionCacheRef.current,
                refreshVersion,
                scopeKey: liveCacheScopeKey,
                timeZone,
                window: requestWindow,
              })
            : await loadPartitionedDemographicAggregation({
                cache: partitionCacheRef.current,
                companyScopeId,
                onProgress: publishProgress,
                partitions: requestWindow.partitions,
                signal: controller.signal,
                timeZone,
              });
        if (!isCurrent()) return;
        const nextDataState = { key: dataScopeKey, refreshVersion, summary, through: requestWindow.to.getTime() };
        dataStateRef.current = nextDataState;
        setDataState(nextDataState);
        if (!cachedHistoricalResult) setLastUpdated(new Date());
        else if (blockingLoad) setLastUpdated(null);
      } catch (requestError) {
        if (isAbortError(requestError, controller.signal) || !isCurrent())
          return;
        setError(demographicRequestErrorMessage(requestError));
      } finally {
        if (isCurrent()) {
          setLoading(false);
          setRefreshing(false);
          setLoadProgress(null);
        }
      }
    }

    // React Strict Mode replays effects synchronously in development. Starting
    // on the next task prevents an immediately disposed consumer from issuing
    // a duplicate request while preserving prompt cancellation on real changes.
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => {
      disposed = true;
      window.clearTimeout(loadTimer);
      abortRequest(
        controller,
        "A consulta demográfica anterior ficou obsoleta.",
      );
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
    };
  }, [
    companyScopeId,
    dataScopeKey,
    hasVisibleWidgets,
    liveCacheScopeKey,
    queryRequested,
    rangeReady,
    refreshVersion,
    requestWindow,
    surface,
    timeZone,
  ]);

  const emptySummary = React.useMemo(() => aggregateDemographicBuckets([]), []);
  const summary =
    dataState?.key === dataScopeKey ? dataState.summary : emptySummary;
  const displayStartInput = surface === "live" ? todayInput : appliedRange.startInput;
  const displayEndInput = surface === "live" ? todayInput : appliedRange.endInput;
  const temporalBounds = React.useMemo(() => ({
    from: civilDayStart(displayStartInput, timeZone),
    to: civilDayStart(shiftCivilDateKey(displayEndInput, 1), timeZone),
  }), [displayEndInput, displayStartInput, timeZone]);
  const comparisonVisible = preferences.some((preference) => preference.id === "demographics_period_comparison" && preference.visible !== false);
  const comparisonMode = temporalSettings.demographics_period_comparison.comparison ?? "previous-period";
  const comparisonWindow = React.useMemo(() => buildDemographicComparisonWindow({
    startInput: displayStartInput, endInput: displayEndInput, mode: comparisonMode, timeZone, cutoff: requestWindow.to,
  }), [comparisonMode, displayEndInput, displayStartInput, requestWindow.to, timeZone]);
  const comparisonKey = `${dataScopeKey}|${comparisonMode}|${comparisonWindow.from.toISOString()}|${comparisonWindow.to.toISOString()}|${refreshVersion}`;
  const [comparisonState, setComparisonState] = React.useState<{
    key: string; summary?: DemographicAggregation; error?: string;
  } | null>(null);
  const comparisonReady = dataState?.key === dataScopeKey && dataState.refreshVersion === refreshVersion &&
    dataState.through === requestWindow.to.getTime() && summary.hasData && !loading && !refreshing && !error;
  React.useEffect(() => {
    if (!comparisonVisible || !queryRequested || !rangeReady || !comparisonReady || !companyScopeId || comparisonState?.key === comparisonKey) return;
    const controller = new AbortController();
    comparisonRequestRef.current = controller;
    let disposed = false;
    const timer = window.setTimeout(() => {
      // Wait for the primary period so overlapping civil-day partitions are
      // already cached; all five temporal widgets share that same dataset.
      void loadPartitionedDemographicAggregation({
        cache: partitionCacheRef.current,
        companyScopeId,
        partitions: buildCivilDayPartitions(comparisonWindow.startInput, comparisonWindow.endInput, timeZone, comparisonWindow.to),
        signal: controller.signal,
        timeZone,
      }).then((baseline) => {
        if (!disposed && !controller.signal.aborted) setComparisonState({ key: comparisonKey, summary: baseline });
      }).catch((requestError: unknown) => {
        if (!disposed && !isAbortError(requestError, controller.signal)) setComparisonState({
          key: comparisonKey,
          error: userFacingErrorMessage(requestError, "Não foi possível carregar o período de comparação. Atualize para tentar novamente."),
        });
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      abortRequest(controller, "A comparação demográfica anterior ficou obsoleta.");
      if (comparisonRequestRef.current === controller) comparisonRequestRef.current = null;
    };
  }, [companyScopeId, comparisonKey, comparisonReady, comparisonState?.key, comparisonVisible, comparisonWindow, queryRequested, rangeReady, timeZone]);
  const comparisonSummary = comparisonState?.key === comparisonKey ? comparisonState.summary : undefined;
  const comparisonError = error || (comparisonState?.key === comparisonKey ? comparisonState.error : undefined);
  const comparisonLoading = queryRequested && comparisonVisible && summary.hasData && !error && comparisonState?.key !== comparisonKey;
  const temporalModels = React.useMemo(() => Object.fromEntries(DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.map((id) => [id,
    buildDemographicTemporalModel({ id, summary, comparisonSummary, comparisonLabel: comparisonWindow.label,
      settings: temporalSettings[id], ...temporalBounds, timeZone, now: requestWindow.to, theme: effectiveTheme,
      enabled: preferences.some((preference) => preference.id === id && preference.visible !== false) }),
  ])) as Record<DemographicTemporalWidgetId, ReturnType<typeof buildDemographicTemporalModel>>,
  [comparisonSummary, comparisonWindow.label, effectiveTheme, preferences, requestWindow.to, summary, temporalBounds, temporalSettings, timeZone]);
  const genderLeader = leadingDistributionItem(summary.gender);
  const ageLeader = leadingDistributionItem(summary.age);
  const emotionLeader = leadingDistributionItem(summary.emotion);
  const rangeLabel = formatRangeLabel(
    surface === "live" ? todayInput : appliedRange.startInput,
    surface === "live" ? todayInput : appliedRange.endInput,
  );
  function buildDemographicsReportPayload() {
    const report = buildDemographicsReport({
      audience: manager ? "Visão gerencial" : "Visão operacional",
      rangeLabel,
      summary,
      surface,
      timeZone,
      presentations: widgetPresentations,
    });
    const temporalCharts = DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.filter((id) => preferences.some((preference) => preference.id === id && preference.visible !== false))
      .map((id) => buildDemographicTemporalModel({ id, summary, comparisonSummary, comparisonLabel: comparisonWindow.label,
        settings: temporalSettings[id], ...temporalBounds, timeZone, now: requestWindow.to, theme: "light" }))
      .filter((model) => model.hasData)
      .map((model) => ({ title: model.title, description: model.description, option: model.option, table: model.table }));
    return { ...report, charts: [...(report.charts ?? []), ...temporalCharts] };
  }
  const cards = React.useMemo<LayoutCard[]>(
    () => [
      {
        colorEditable: true,
        condensed: true,
        defaultHeightLevel: 1,
        defaultWidthLevel: 1,
        id: "demographics_total",
        label: "Detecções classificadas",
        node: (
          <DemographicMetricCard
            description="Classificações no período, não visitantes únicos."
            icon={UsersRound}
            label="Detecções classificadas"
            loading={loading}
            meta={`${formatNumber(summary.cameraIds.length)} câmera(s) analisada(s)`}
            value={summary.hasData ? formatNumber(summary.total) : "—"}
          />
        ),
        previewKind: "metric",
        titleEditable: true,
      },
      {
        colorEditable: true,
        condensed: true,
        defaultHeightLevel: 1,
        defaultWidthLevel: 1,
        id: "demographics_gender_leader",
        label: "Gênero predominante",
        node: (
          <DemographicMetricCard
            description="Participação no total de classificações."
            icon={Activity}
            label="Gênero predominante"
            loading={loading}
            meta={
              genderLeader && summary.hasData
                ? `${formatNumber(genderLeader.count)} detecções`
                : summary.hasData
                  ? "Nenhuma detecção classificada"
                  : "Sem dados no intervalo"
            }
            value={
              summary.hasData
                ? (genderLeader?.label ?? "Sem predominância")
                : "—"
            }
            comparison={
              summary.hasData
                ? formatPercentage(genderLeader?.percentage)
                : undefined
            }
          />
        ),
        previewKind: "metric",
        titleEditable: true,
      },
      {
        colorEditable: true,
        condensed: true,
        defaultHeightLevel: 1,
        defaultWidthLevel: 1,
        id: "demographics_age_leader",
        label: "Faixa etária predominante",
        node: (
          <DemographicMetricCard
            description="Faixa com maior participação no período."
            icon={CalendarRange}
            label="Faixa etária predominante"
            loading={loading}
            meta={
              ageLeader && summary.hasData
                ? `${formatNumber(ageLeader.count)} detecções`
                : summary.hasData
                  ? "Nenhuma detecção classificada"
                  : "Sem dados no intervalo"
            }
            value={
              summary.hasData ? (ageLeader?.label ?? "Sem predominância") : "—"
            }
            comparison={
              summary.hasData
                ? formatPercentage(ageLeader?.percentage)
                : undefined
            }
          />
        ),
        previewKind: "metric",
        titleEditable: true,
      },
      {
        colorEditable: true,
        condensed: true,
        defaultHeightLevel: 1,
        defaultWidthLevel: 1,
        id: "demographics_emotion_leader",
        label: "Emoção predominante",
        node: (
          <DemographicMetricCard
            description="Expressão mais frequente nas classificações."
            icon={HeartPulse}
            label="Emoção predominante"
            loading={loading}
            meta={
              emotionLeader && summary.hasData
                ? `${formatNumber(emotionLeader.count)} detecções`
                : summary.hasData
                  ? "Nenhuma detecção classificada"
                  : "Sem dados no intervalo"
            }
            value={
              summary.hasData
                ? (emotionLeader?.label ?? "Sem predominância")
                : "—"
            }
            comparison={
              summary.hasData
                ? formatPercentage(emotionLeader?.percentage)
                : undefined
            }
          />
        ),
        previewKind: "metric",
        titleEditable: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 1,
        defaultWidthLevel: 6,
        id: "demographics_gender_mix",
        label: "Composição por gênero",
        configurationContent: <DemographicsWidgetControls dimension="gender" value={widgetPresentations.demographics_gender_mix} onChange={(value) => updateWidgetPresentation("demographics_gender_mix", value)} />,
        node: <GenderCompositionCard loading={loading} summary={summary} presentation={widgetPresentations.demographics_gender_mix} />,
        previewColors: [...demographicPalettePreviewColors(getDemographicPalette(widgetPresentations.demographics_gender_mix?.palette).id, "gender")],
        ...demographicDistributionPreview(widgetPresentations.demographics_gender_mix, "gender"),
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 3,
        defaultWidthLevel: 3,
        id: "demographics_age_distribution",
        label: "Distribuição por faixa etária",
        configurationContent: <DemographicsWidgetControls dimension="age" value={widgetPresentations.demographics_age_distribution} onChange={(value) => updateWidgetPresentation("demographics_age_distribution", value)} />,
        node: <AgeDistributionCard loading={loading} summary={summary} presentation={widgetPresentations.demographics_age_distribution} />,
        previewColors: [...getDemographicPalette(widgetPresentations.demographics_age_distribution?.palette).colors],
        ...demographicDistributionPreview(widgetPresentations.demographics_age_distribution, "age"),
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 3,
        defaultWidthLevel: 3,
        id: "demographics_emotion_distribution",
        label: "Ranking de emoções",
        configurationContent: <DemographicsWidgetControls dimension="emotion" value={widgetPresentations.demographics_emotion_distribution} onChange={(value) => updateWidgetPresentation("demographics_emotion_distribution", value)} />,
        node: <EmotionDistributionCard loading={loading} summary={summary} presentation={widgetPresentations.demographics_emotion_distribution} />,
        previewColors: [...getDemographicPalette(widgetPresentations.demographics_emotion_distribution?.palette).colors],
        ...demographicDistributionPreview(widgetPresentations.demographics_emotion_distribution, "emotion"),
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 3,
        defaultWidthLevel: 3,
        id: "demographics_age_gender_pyramid",
        label: "Faixa etária por gênero",
        configurationContent: <DemographicsWidgetControls dimension="age-gender" value={widgetPresentations.demographics_age_gender_pyramid} onChange={(value) => updateWidgetPresentation("demographics_age_gender_pyramid", value)} />,
        node: <AgeGenderPyramidCard loading={loading} summary={summary} presentation={widgetPresentations.demographics_age_gender_pyramid} />,
        previewColors: [...demographicPalettePreviewColors(getDemographicPalette(widgetPresentations.demographics_age_gender_pyramid?.palette).id, "age-gender")],
        previewKind: "heatmap",
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 3,
        defaultWidthLevel: 3,
        id: "demographics_age_emotion_heatmap",
        label: "Faixa etária × emoção",
        configurationContent: <DemographicsWidgetControls dimension="age-emotion" value={widgetPresentations.demographics_age_emotion_heatmap} onChange={(value) => updateWidgetPresentation("demographics_age_emotion_heatmap", value)} />,
        node: <AgeEmotionHeatmapCard loading={loading} summary={summary} presentation={widgetPresentations.demographics_age_emotion_heatmap} />,
        previewColors: demographicHeatmapColors(getDemographicPalette(widgetPresentations.demographics_age_emotion_heatmap?.palette).id, effectiveTheme),
        previewKind: "heatmap",
        titleEditable: true,
        zoomEnabled: true,
      },
    ],
    [ageLeader, effectiveTheme, emotionLeader, genderLeader, loading, summary, widgetPresentations, updateWidgetPresentation],
  );
  const allCards = React.useMemo<LayoutCard[]>(() => [...cards, ...DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.map((id): LayoutCard => ({
    id,
    label: temporalModels[id].title,
    titleEditable: true,
    colorEditable: false,
    chartTypeEnabled: false,
    zoomEnabled: true,
    defaultWidthLevel: 6,
    defaultHeightLevel: 3,
    previewKind: temporalSettings[id].chartType === "heatmap" ? "heatmap" : "chart",
    previewChartType: temporalSettings[id].chartType === "bar" ? "bar" : "line",
    previewColors: temporalSettings[id].chartType === "heatmap"
      ? demographicHeatmapColors(temporalSettings[id].palette, effectiveTheme)
      : id === "demographics_period_comparison" && temporalSettings[id].dimension === "gender"
        ? ["#475569", "#CBD5E1"]
        : [...demographicPalettePreviewColors(temporalSettings[id].palette, temporalSettings[id].dimension)],
    configurationContent: <DemographicsTemporalControls widgetId={id} value={temporalSettings[id]} onChange={(value) => updateTemporalSettings(id, value)} />,
    node: <DemographicsTemporalWidget model={temporalModels[id]} loading={loading || (id === "demographics_period_comparison" && comparisonLoading)} error={id === "demographics_period_comparison" ? comparisonError : undefined} />,
  }))], [cards, comparisonError, comparisonLoading, effectiveTheme, loading, temporalModels, temporalSettings, updateTemporalSettings]);

  function applyRange(value: OccupancyAnalysisDateRangeInput) {
    if (surface === "live") return;
    if (
      countDemographicsDateRangeDays(value) > MAX_DEMOGRAPHICS_DATE_RANGE_DAYS
    ) {
      return;
    }
    const requestedAt = new Date();
    const persisted = saveDemographicsDateRange(value, {
      companyId: companyScopeId,
      fallback: fallbackRange,
      surface,
      todayInput: companyDateKey(requestedAt, timeZone),
      userId: user?.id,
    });
    setRangeState({ key: rangeScopeKey, source: "applied", timeZone, value: persisted });
    requestFreshData(requestedAt);
  }

  function forceRefresh() {
    requestFreshData(new Date());
  }

  function requestFreshData(requestedAt: Date) {
    // Invalidate synchronously, before React commits the next effect, so an
    // older response cannot repopulate this explicitly refreshed cache.
    requestSequenceRef.current += 1;
    if (activeRequestRef.current) {
      abortRequest(
        activeRequestRef.current,
        "A atualização demográfica foi reiniciada.",
      );
      activeRequestRef.current = null;
    }
    if (comparisonRequestRef.current) {
      abortRequest(comparisonRequestRef.current, "A comparação demográfica foi reiniciada.");
      comparisonRequestRef.current = null;
    }
    if (surface !== "live") {
      setHistoricalQueryScopeKey(historicalQueryIdentityKey);
    }
    if (pendingLiveAggregationRef.current) {
      abortRequest(
        pendingLiveAggregationRef.current.controller,
        "A atualização demográfica foi reiniciada.",
      );
      pendingLiveAggregationRef.current = null;
    }
    liveCacheRef.current = null;
    partitionCacheRef.current.clear();
    setClock(requestedAt);
    setRefreshVersion((value) => value + 1);
  }

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="demographics-title">
      <div className="sr-only">
        <h2 id="demographics-title">Demographics</h2>
        <p>
          Distribuições de detecções classificadas por gênero, faixa etária e
          emoção. Os totais não representam pessoas únicas.
        </p>
      </div>

      <div className="@container rounded-md border bg-card px-3 py-2 shadow-soft">
        <div
          aria-label="Controles do módulo Demographics"
          data-dashboard-toolbar
          role="group"
        >
          <div data-toolbar-filters>
            <div className="w-full min-w-0 max-w-[300px]">
              {surface === "live" ? (
                <div
                  className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium"
                  title={`${rangeLabel} · horário da empresa`}
                >
                  <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 break-words">
                    Hoje · {rangeLabel}
                  </span>
                </div>
              ) : (
                <AnalysisDateRangePicker
                  key={`${companyScopeId}|${surface}|${user?.id ?? ""}`}
                  contextLabel="análise do módulo Demographics"
                  maximumDays={MAX_DEMOGRAPHICS_DATE_RANGE_DAYS}
                  maximumInput={todayInput}
                  onApply={applyRange}
                  value={appliedRange}
                />
              )}
            </div>
          </div>

          <div data-toolbar-status className="flex min-w-0 items-center justify-end">
            {(loading || refreshing) &&
              loadProgress &&
              loadProgress.total > 4 ? (
              <span
                aria-live="polite"
                className="inline-flex min-h-8 min-w-0 items-center gap-1 px-1 text-[11px] tabular-nums text-muted-foreground"
                role="status"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span className="break-words">
                  Consultando {progressPercentage(loadProgress)}
                </span>
              </span>
            ) : lastUpdated ? (
              <span
                aria-label={`Dados recebidos em ${formatCompanyDateTime(lastUpdated, timeZone)}`}
                className="inline-flex min-h-8 min-w-0 items-center gap-1 px-1 text-[11px] tabular-nums text-muted-foreground"
                title={`Dados recebidos em ${formatCompanyDateTime(lastUpdated, timeZone)}`}
              >
                <Clock3 className="h-3.5 w-3.5 shrink-0" />
                <span className="break-words">
                  Recebido às {formatCompanyClock(lastUpdated, timeZone)}
                </span>
              </span>
            ) : null}
          </div>

          <div
            aria-label="Ações do módulo Demographics"
            data-toolbar-actions
            role="group"
          >
            <ReportExportActions
              compact
              disabled={loading || comparisonLoading || !summary.hasData}
              getPayload={buildDemographicsReportPayload}
            />
            {/* AiAnalysisAction será incluído quando AiInsightModule aceitar
                explicitamente `demographics`; não mascaramos o módulo como counting. */}
            {canEditVisual ? (
              <>
                <ReorderModeButton
                  className="h-8 w-8 shrink-0"
                  enabled={reorderMode}
                  onChange={setReorderMode}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setOrganizerOpen(true)}
                  aria-label="Configurar widgets de Demographics"
                  title="Configurar widgets"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant={queryRequested ? "outline" : "default"}
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={forceRefresh}
              disabled={loading || refreshing}
              aria-label={
                queryRequested
                  ? "Atualizar dados demográficos"
                  : "Consultar dados demográficos"
              }
              title={queryRequested ? "Atualizar dados" : "Consultar dados"}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (loading || refreshing) && "animate-spin",
                )}
              />
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {queryRequested && !loading && !error && !summary.hasData ? (
        <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma detecção classificada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Não há dados demográficos disponíveis para {rangeLabel}. Ausência
            de informação não é exibida como zero.
          </p>
          {surface === "analysis" && (
            appliedRange.startInput !== todayInput ||
            appliedRange.endInput !== todayInput
          ) ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Se o envio começou hoje, consulte o dia atual.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || refreshing}
                onClick={() => {
                  const currentDay = companyDateKey(new Date(), timeZone);
                  applyRange({ startInput: currentDay, endInput: currentDay });
                }}
              >
                <CalendarRange className="h-4 w-4 shrink-0" />
                Consultar hoje
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <CardLayout
        cards={allCards}
        menuKey={DEMOGRAPHICS_MENU_KEY}
        onOrganizerOpenChange={setOrganizerOpen}
        onPreferencesChange={synchronizePreferences}
        onReorderModeChange={setReorderMode}
        organizerOpen={organizerOpen}
        preferenceScopeId={preferenceScopeId}
        reorderMode={reorderMode}
        showOrganizerTrigger={false}
        showReorderTrigger={false}
        viewScopeName={surfaceLabel(surface)}
      />
    </section>
  );
}

function DemographicMetricCard({
  comparison,
  description,
  icon,
  label,
  loading,
  meta,
  value,
}: {
  comparison?: React.ReactNode;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading: boolean;
  meta: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <CompactMetricCard
      comparison={comparison}
      comparisonClassName="rounded bg-muted/60 px-1.5 py-0.5 text-foreground"
      description={description}
      icon={icon}
      label={label}
      loading={loading}
      meta={meta}
      value={value}
    />
  );
}

function GenderCompositionCard({
  loading,
  summary,
  presentation,
}: {
  loading: boolean;
  summary: DemographicAggregation;
  presentation?: DemographicPresentation;
}) {
  const { effectiveTheme } = useTheme();
  const settings = React.useMemo(() => normalizeDemographicPresentation(presentation, "gender"), [presentation]);
  const radial = isRadialDemographicPresentation(settings);
  const option = React.useMemo(() => buildDemographicDistributionOption(summary.gender, settings, {
    dimension: "gender", theme: effectiveTheme, showLegend: radial,
  }), [effectiveTheme, radial, settings, summary]);
  const legendItems = React.useMemo(() => orderedDemographicItems(summary.gender, settings.order), [settings.order, summary]);
  return (
    <DemographicChartCard
      description="Participação de cada gênero no total de classificações."
      hasData={summary.hasData}
      kind={radial ? "radial" : settings.type === "stacked" ? "gender" : "distribution"}
      loading={loading}
      option={option}
      title="Composição por gênero"
      footer={settings.type !== "stacked" ? undefined :
        <dl className="grid min-w-0 shrink-0 grid-cols-3 gap-2 @md:gap-4" data-demographics-legend>
          {legendItems.map((item) => (
            <div
              key={item.key}
              className="min-w-0"
            >
              <dt
                className="flex min-w-0 items-start gap-1.5 text-[11px] leading-4 text-muted-foreground"
                title={item.label}
              >
                <span
                  aria-hidden="true"
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: demographicCategoryColor(item.key, 0, settings.palette, "gender") }}
                />
                <span className="min-w-0 break-words">{demographicCategoryLabel(item.label, item.key, "gender", settings.emojis)}</span>
              </dt>
              <dd className="mt-0.5 text-lg font-semibold leading-6 tabular-nums tracking-tight" data-demographics-legend-value>
                {formatPercentage(item.percentage)}
              </dd>
              <dd className="hidden text-[11px] leading-4 text-muted-foreground @md:block" data-demographics-legend-count>
                {formatNumber(item.count)} detecções
              </dd>
            </div>
          ))}
        </dl>
      }
    />
  );
}

function AgeDistributionCard({
  loading,
  summary,
  presentation,
}: {
  loading: boolean;
  summary: DemographicAggregation;
  presentation?: DemographicPresentation;
}) {
  const { effectiveTheme } = useTheme();
  const settings = React.useMemo(() => normalizeDemographicPresentation(presentation, "age"), [presentation]);
  const option = React.useMemo(
    () => buildDemographicDistributionOption(summary.age, settings, { dimension: "age", theme: effectiveTheme }),
    [effectiveTheme, settings, summary],
  );
  return (
    <DemographicChartCard
      description="Participação de cada faixa etária no total de classificações."
      hasData={summary.hasData}
      kind={isRadialDemographicPresentation(settings) ? "radial" : settings.type === "stacked" ? "composition" : "distribution"}
      loading={loading}
      option={option}
      title="Distribuição por faixa etária"
    />
  );
}

function EmotionDistributionCard({
  loading,
  summary,
  presentation,
}: {
  loading: boolean;
  summary: DemographicAggregation;
  presentation?: DemographicPresentation;
}) {
  const { effectiveTheme } = useTheme();
  const settings = React.useMemo(() => normalizeDemographicPresentation(presentation, "emotion"), [presentation]);
  const option = React.useMemo(
    () => buildDemographicDistributionOption(summary.emotion, settings, { dimension: "emotion", theme: effectiveTheme }),
    [effectiveTheme, settings, summary],
  );
  return (
    <DemographicChartCard
      description="Participação de cada expressão no total de classificações."
      hasData={summary.hasData}
      kind={isRadialDemographicPresentation(settings) ? "radial" : settings.type === "stacked" ? "composition" : "distribution"}
      loading={loading}
      option={option}
      title="Ranking de emoções"
    />
  );
}

function AgeGenderPyramidCard({
  loading,
  summary,
  presentation,
}: {
  loading: boolean;
  summary: DemographicAggregation;
  presentation?: DemographicPresentation;
}) {
  const { effectiveTheme } = useTheme();
  const option = React.useMemo(
    () => buildDemographicCrossingOption(summary, normalizeDemographicPresentation(presentation, "age-gender"), "age-gender", effectiveTheme),
    [effectiveTheme, presentation, summary],
  );
  return (
    <DemographicChartCard
      description="Participação de cada idade e gênero no total de classificações."
      hasData={summary.hasData}
      kind="matrix"
      loading={loading}
      option={option}
      title="Faixa etária por gênero"
    />
  );
}

function AgeEmotionHeatmapCard({
  loading,
  summary,
  presentation,
}: {
  loading: boolean;
  summary: DemographicAggregation;
  presentation?: DemographicPresentation;
}) {
  const { effectiveTheme } = useTheme();
  const option = React.useMemo(
    () => buildDemographicCrossingOption(summary, normalizeDemographicPresentation(presentation, "age-emotion"), "age-emotion", effectiveTheme),
    [effectiveTheme, presentation, summary],
  );
  return (
    <DemographicChartCard
      description="Idades nas linhas, emoções nas colunas. Cor mais intensa indica maior participação."
      hasData={summary.hasData}
      kind="heatmap"
      loading={loading}
      option={option}
      title="Faixa etária × emoção"
    />
  );
}

function DemographicChartCard({
  description,
  footer,
  hasData,
  kind,
  loading,
  option,
  title,
}: {
  description: string;
  footer?: React.ReactNode;
  hasData: boolean;
  kind: "distribution" | "gender" | "heatmap" | "matrix" | "radial" | "composition";
  loading: boolean;
  option: EnterpriseChartOption;
  title: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const [{ compact, narrow, width, height }, setDensity] = React.useState({
    compact: false,
    narrow: false,
    width: 640,
    height: 280,
  });
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const plot = plotRef.current;
    if (!root || !plot) return;
    const synchronizeDensity = () => {
      const card = root.getBoundingClientRect();
      const bounds = plot.getBoundingClientRect();
      const next = {
        compact: card.height < 220,
        narrow: card.width < 400,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
      setDensity((current) =>
        current.compact === next.compact && current.narrow === next.narrow &&
          ((kind !== "radial" && kind !== "composition") ||
            (current.width === next.width && current.height === next.height))
          ? current
          : next,
      );
    };
    synchronizeDensity();
    const observer = new ResizeObserver(synchronizeDensity);
    observer.observe(root);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [kind]);
  const responsiveOption = React.useMemo(
    () => kind === "radial" || kind === "composition"
      ? fitDemographicCompositionOption(option, { width, height })
      : compact || narrow
        ? compactDemographicChartOption(option, kind, { compact, narrow })
        : option,
    [compact, height, kind, narrow, option, width],
  );

  return (
    <Card
      ref={rootRef}
      className={cn(
        "@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        compact && "[&_[data-demographics-legend-count]]:hidden [&_[data-demographics-legend-value]]:text-sm [&_[data-demographics-legend-value]]:leading-5",
      )}
      data-demographics-density={compact ? "compact" : "regular"}
      data-demographics-width={narrow ? "narrow" : "regular"}
    >
      <CardHeader
        className={cn("min-w-0 gap-0.5", compact ? "p-2 pb-0.5" : "p-3 pb-1")}
      >
        <CardTitle className={cn(
          "leading-5",
          kind === "heatmap" ? "flex items-baseline gap-1" : "line-clamp-2",
          compact ? "text-xs" : "text-sm",
        )}>
          <WidgetTitleText fallback={title} />
          {kind === "heatmap" ? <span className="shrink-0 font-normal text-muted-foreground">(%)</span> : null}
        </CardTitle>
        <CardDescription
          className={cn("line-clamp-2 text-xs leading-4", compact && "sr-only")}
        >
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          compact ? "gap-1 p-2 pt-0" : "gap-1.5 p-3 pt-0",
        )}
      >
        <div ref={plotRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {loading ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="min-h-0 flex-1 w-full" />
            </div>
          ) : !hasData ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground">
              Sem dados demográficos no intervalo.
            </div>
          ) : (
            <div className="min-h-0 min-w-0 flex-1">
              <EChart
                ariaDescription={description}
                ariaLabel={title}
                className="h-full min-h-0 w-full"
                option={responsiveOption}
                themeMode="explicit"
                valueLabels="always"
              />
            </div>
          )}
        </div>
        {!loading && hasData && footer ? footer : null}
        {!loading && hasData ? (
          <p className="sr-only">{demographicTextAlternative(title)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function compactDemographicChartOption(
  option: EnterpriseChartOption,
  kind: "distribution" | "gender" | "heatmap" | "matrix" | "radial" | "composition",
  { compact = true, narrow = false } = {},
): EnterpriseChartOption {
  const source = option as Record<string, unknown>;
  // Circular charts own their radius, label layout and legend viewport.
  // Cartesian density rules must not collapse those viewports into a grid.
  if (kind === "radial" || kind === "composition") return option;
  const verticalDistribution = kind === "distribution" &&
    isRecord(source.xAxis) && source.xAxis.type === "category";
  const compactHeatmap = kind === "heatmap" && (compact || narrow);
  const emotionAxisLabels: Record<string, string> = {
    Neutro: "Neu.", Feliz: "Fel.", Surpresa: "Sur.", Triste: "Tri.",
    Raiva: "Rai.", Nojo: "Noj.", Medo: "Med.", Desprezo: "Des.",
  };
  const grid = mapChartOptionCollection(source.grid, (candidate) => ({
    ...candidate,
    ...(compact ? {
      bottom: kind === "gender" ? 0 : 6,
      top: verticalDistribution ? 32 : 4,
    } : {}),
    left: 4,
    right: kind === "distribution" ? verticalDistribution ? 16 : 48 : 4,
  }));
  const xAxis = mapChartOptionCollection(source.xAxis, (candidate) => ({
    ...candidate,
    ...(kind === "gender" ? { show: false } : {}),
    axisLabel: {
      ...(isRecord(candidate.axisLabel) ? candidate.axisLabel : {}),
      fontSize: kind === "heatmap" || (verticalDistribution && narrow) ? 9 : 10,
      ...(verticalDistribution && narrow ? { rotate: 45, interval: 0, margin: 8 } : {}),
      ...(compactHeatmap ? {
        formatter: (label: string) => {
          const words = label.split(" ");
          const name = words[0];
          const short = emotionAxisLabels[name];
          if (!short) return label;
          // Keep the trailing emoji after the name; a shorter word leaves its
          // own space even in the smallest heatmap's eight columns.
          return words.length > 1
            ? [`${short.slice(0, 2)}.`, ...words.slice(1)].join(" ")
            : short;
        },
        interval: 0,
        rotate: 0,
        margin: 8,
      } : {}),
      ...(kind === "matrix" ? {
        formatter: (label: string) => label.replace("Não identificado", "Não ident."),
        interval: 0,
        rotate: 0,
        margin: 8,
      } : {}),
    },
  }));
  const yAxis = mapChartOptionCollection(source.yAxis, (candidate) => ({
    ...candidate,
    ...(kind === "gender" ? { show: false } : {}),
    axisLabel: {
      ...(isRecord(candidate.axisLabel) ? candidate.axisLabel : {}),
      fontSize: kind === "heatmap" ? 9 : 10,
      interval: 0,
      ...(kind === "distribution" && !verticalDistribution ? { width: narrow ? 72 : 86 } : {}),
    },
  }));
  const series = mapChartOptionCollection(source.series, (candidate) => ({
    ...candidate,
    ...(compact && kind === "distribution"
      ? { barMaxWidth: 10 }
      : {}),
    label: {
      ...(isRecord(candidate.label) ? candidate.label : {}),
      fontSize: kind === "heatmap" || (verticalDistribution && narrow) ? 9 : 10,
      ...(verticalDistribution && narrow ? { rotate: 45, align: "left", verticalAlign: "middle", distance: 4 } : {}),
      ...(compactHeatmap && isRecord(candidate.label) && typeof candidate.label.formatter === "function"
        ? {
            // The card title supplies the percent unit; keep exact values and
            // contrast styles without repeating a symbol in every narrow cell.
            formatter: (parameters: unknown) => String(
              (candidate.label as { formatter: (parameters: unknown) => unknown }).formatter(parameters),
            ).replace(/%/g, ""),
          }
        : {}),
    },
  }));
  const legend = mapChartOptionCollection(source.legend, (candidate) => ({
    ...candidate,
    itemHeight: 8,
    itemWidth: 8,
    itemGap: narrow ? 8 : 12,
    textStyle: {
      ...(isRecord(candidate.textStyle) ? candidate.textStyle : {}),
      fontSize: 10,
    },
  }));
  const visualMap =
    kind === "heatmap" && compact
      ? mapChartOptionCollection(source.visualMap, (candidate) => ({
          ...candidate,
          show: false,
        }))
      : source.visualMap;

  return {
    ...option,
    grid,
    legend,
    series,
    ...(visualMap === undefined ? {} : { visualMap }),
    xAxis,
    yAxis,
  } as EnterpriseChartOption;
}

function mapChartOptionCollection(
  value: unknown,
  transform: (candidate: Record<string, unknown>) => Record<string, unknown>,
) {
  if (Array.isArray(value)) {
    return value.map((candidate) =>
      isRecord(candidate) ? transform(candidate) : candidate,
    );
  }
  return isRecord(value) ? transform(value) : value;
}

function isRadialDemographicPresentation(presentation: DemographicPresentation) {
  return presentation.type === "pie" || presentation.type === "donut" ||
    presentation.type === "half-donut" || presentation.type === "rose";
}

function demographicDistributionPreview(
  presentation: DemographicPresentation | undefined,
  dimension: "gender" | "age" | "emotion",
): Pick<LayoutCard, "previewKind" | "previewChartType" | "previewOrientation" | "previewOrder"> {
  const settings = normalizeDemographicPresentation(presentation, dimension);
  return {
    previewKind: settings.type === "bar" ? "chart" : "composition",
    previewChartType: settings.type === "rose" ? "rose" : settings.type === "bar" ? "bar" : undefined,
    previewOrientation: settings.orientation,
    previewOrder: settings.order === "default" ? undefined : settings.order === "ascending" ? "asc" : "desc",
  };
}

function orderedDemographicItems<T extends { count: number }>(
  items: readonly T[],
  order: DemographicPresentation["order"],
): T[] {
  const result = [...items];
  if (order !== "default") result.sort((left, right) =>
    (order === "ascending" ? 1 : -1) * (left.count - right.count));
  return result;
}

async function loadPartitionedDemographicAggregation({
  cache,
  companyScopeId,
  onProgress,
  partitions,
  revalidate = false,
  signal,
  timeZone,
}: {
  cache: Map<string, DemographicAggregation>;
  companyScopeId: string;
  onProgress?: (completed: number, total: number) => void;
  partitions: DemographicRequestPartition[];
  revalidate?: boolean;
  signal: AbortSignal;
  timeZone?: string;
}) {
  signal.throwIfAborted();
  if (!partitions.length) return aggregateDemographicBuckets([], { timeZone });
  const summaries: DemographicAggregation[] = [];
  let failed = false;
  let failure: unknown;
  let cursor = 0;
  let completed = 0;
  const progressStep = Math.max(1, Math.ceil(partitions.length / 40));
  async function worker() {
    while (cursor < partitions.length && !failed) {
      try {
        signal.throwIfAborted();
        const index = cursor;
        cursor += 1;
        const partition = partitions[index];
        const cacheKey = demographicPartitionCacheKey(
          partition,
          companyScopeId,
          timeZone,
        );
        // A full refresh must observe corrections to closed partitions too.
        // Bypass only these exact tenant/range entries; unrelated cached
        // periods remain available to their consumers.
        const cached = revalidate ? undefined : cache.get(cacheKey);
        const summary =
          cached ??
          (await fetchDemographicSummary(
            partition,
            companyScopeId,
            signal,
            timeZone,
          ));
        signal.throwIfAborted();
        if (!cached) {
          cacheDemographicPartition(cache, cacheKey, summary);
        }
        // Keep only compact distributions/hourly marginals. Combine once at
        // the end instead of repeatedly copying a growing annual timeline.
        summaries.push(summary);
        completed += 1;
        if (completed === partitions.length || completed % progressStep === 0) {
          onProgress?.(completed, partitions.length);
        }
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(2, partitions.length) }, () => worker()),
  );
  if (failed) throw failure;
  signal.throwIfAborted();
  return combineDemographicAggregations(summaries);
}

function liveDemographicRequestKey({
  companyScopeId,
  refreshVersion,
  scopeKey,
  window,
}: {
  companyScopeId: string;
  refreshVersion: number;
  scopeKey: string;
  window: DemographicRequestWindow;
}) {
  return JSON.stringify([
    companyScopeId,
    scopeKey,
    window.from.toISOString(),
    window.to.toISOString(),
    refreshVersion,
  ]);
}

function cancelPendingLiveDemographicAggregation(
  pendingRef: React.MutableRefObject<PendingLiveAggregation | null>,
  reason: string,
) {
  const pending = pendingRef.current;
  if (!pending) return;

  abortRequest(pending.controller, reason);
  if (pendingRef.current === pending) pendingRef.current = null;
}

async function loadSharedLiveDemographicAggregation({
  cacheRef,
  companyScopeId,
  onProgress,
  partitionCache,
  pendingRef,
  refreshVersion,
  scopeKey,
  timeZone,
  window,
}: {
  cacheRef: React.MutableRefObject<LiveAggregationCache | null>;
  companyScopeId: string;
  onProgress?: (completed: number, total: number) => void;
  partitionCache: Map<string, DemographicAggregation>;
  pendingRef: React.MutableRefObject<PendingLiveAggregation | null>;
  refreshVersion: number;
  scopeKey: string;
  timeZone?: string;
  window: DemographicRequestWindow;
}) {
  const key = liveDemographicRequestKey({
    companyScopeId,
    refreshVersion,
    scopeKey,
    window,
  });
  const current = pendingRef.current;
  if (current?.key === key) return current.promise;
  if (current) {
    abortRequest(
      current.controller,
      "A janela demográfica compartilhada ficou obsoleta.",
    );
  }

  // This controller belongs to the semantic request, not to either React
  // effect consumer. Strict Mode may dispose/replay a consumer while the
  // same tenant and closed-minute window are still in flight.
  const controller = new AbortController();
  const promise = loadLiveDemographicAggregation({
    cacheRef,
    companyScopeId,
    onProgress,
    partitionCache,
    scopeKey,
    signal: controller.signal,
    timeZone,
    window,
  }).finally(() => {
    if (pendingRef.current?.controller === controller) {
      pendingRef.current = null;
    }
  });
  pendingRef.current = { controller, key, promise };
  return promise;
}

async function loadLiveDemographicAggregation({
  cacheRef,
  companyScopeId,
  onProgress,
  partitionCache,
  scopeKey,
  signal,
  timeZone,
  window,
}: {
  cacheRef: React.MutableRefObject<LiveAggregationCache | null>;
  companyScopeId: string;
  onProgress?: (completed: number, total: number) => void;
  partitionCache: Map<string, DemographicAggregation>;
  scopeKey: string;
  signal: AbortSignal;
  timeZone?: string;
  window: DemographicRequestWindow;
}) {
  signal.throwIfAborted();
  const now = Date.now();
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();
  if (toMs <= fromMs) return aggregateDemographicBuckets([], { timeZone });
  const cached = cacheRef.current;
  const needsFullRefresh =
    !cached ||
    cached.scopeKey !== scopeKey ||
    now - cached.lastFullRefreshAt >= LIVE_FULL_REFRESH_MS ||
    cached.to > toMs;

  if (needsFullRefresh) {
    const tailFrom = Math.max(fromMs, toMs - LIVE_TAIL_MINUTES * MINUTE_MS);
    const stablePartitions = buildInstantPartitions(
      new Date(fromMs),
      new Date(tailFrom),
    );
    const stableSummary = await loadPartitionedDemographicAggregation({
      cache: partitionCache,
      companyScopeId,
      onProgress: (completed) =>
        onProgress?.(completed, stablePartitions.length + 1),
      partitions: stablePartitions,
      revalidate: true,
      signal,
      timeZone,
    });
    const tailRows = await fetchDemographicRows(
      { from: new Date(tailFrom), to: new Date(toMs) },
      companyScopeId,
      signal,
    );
    onProgress?.(stablePartitions.length + 1, stablePartitions.length + 1);
    signal.throwIfAborted();
    cacheRef.current = {
      lastFullRefreshAt: now,
      scopeKey,
      stableSummary,
      stableTo: tailFrom,
      tailRows,
      to: toMs,
    };
    return combineDemographicAggregations([
      stableSummary,
      aggregateDemographicBuckets(tailRows, { timeZone }),
    ]);
  }

  if (cached.to === toMs) {
    return combineDemographicAggregations([
      cached.stableSummary,
      aggregateDemographicBuckets(cached.tailRows, { timeZone }),
    ]);
  }

  const nextTailFrom = Math.max(fromMs, toMs - LIVE_TAIL_MINUTES * MINUTE_MS);
  const promotedRows = cached.tailRows.filter(
    (row) => Date.parse(row.bucket) < nextTailFrom,
  );
  const gapFrom = Math.max(cached.to, cached.stableTo);
  const gapTo = Math.max(gapFrom, nextTailFrom);
  const gapSummary = await loadPartitionedDemographicAggregation({
    cache: partitionCache,
    companyScopeId,
    onProgress,
    partitions: buildInstantPartitions(new Date(gapFrom), new Date(gapTo)),
    signal,
    timeZone,
  });
  const nextTailRows = await fetchDemographicRows(
    { from: new Date(nextTailFrom), to: new Date(toMs) },
    companyScopeId,
    signal,
  );
  signal.throwIfAborted();
  const stableSummary = combineDemographicAggregations([
    cached.stableSummary,
    aggregateDemographicBuckets(promotedRows, { timeZone }),
    gapSummary,
  ]);
  cacheRef.current = {
    ...cached,
    stableSummary,
    stableTo: nextTailFrom,
    tailRows: nextTailRows,
    to: toMs,
  };
  return combineDemographicAggregations([
    stableSummary,
    aggregateDemographicBuckets(nextTailRows, { timeZone }),
  ]);
}

async function fetchDemographicSummary(
  partition: DemographicRequestPartition,
  companyScopeId: string,
  signal: AbortSignal,
  timeZone?: string,
) {
  if (partition.to <= partition.from) return aggregateDemographicBuckets([], { timeZone });
  const response = await fetchDemographicResponse(
    partition,
    companyScopeId,
    signal,
  );
  return summarizeDemographicBuckets(response, {
    from: partition.from,
    to: partition.to,
  }, { timeZone });
}

function demographicPartitionCacheKey(
  partition: DemographicRequestPartition,
  companyScopeId: string,
  timeZone?: string,
) {
  return JSON.stringify([
    companyScopeId,
    partition.from.toISOString(),
    partition.to.toISOString(),
    ...(timeZone ? [timeZone] : []),
  ]);
}

function cacheDemographicPartition(
  cache: Map<string, DemographicAggregation>,
  key: string,
  summary: DemographicAggregation,
) {
  cache.delete(key);
  cache.set(key, summary);
  while (cache.size > MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    cache.delete(oldestKey);
  }
}

async function fetchDemographicRows(
  partition: DemographicRequestPartition,
  companyScopeId: string,
  signal: AbortSignal,
) {
  if (partition.to <= partition.from) return [];
  const response = await fetchDemographicResponse(
    partition,
    companyScopeId,
    signal,
  );
  return requireDemographicBucketsResponse(response, {
    from: partition.from,
    to: partition.to,
  });
}

async function fetchDemographicResponse(
  partition: DemographicRequestPartition,
  companyScopeId: string,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    from: partition.from.toISOString(),
    to: partition.to.toISOString(),
  });
  const response = await apiFetch<unknown>(`/demographics/buckets?${query}`, {
    companyScopeId,
    signal,
  });
  signal.throwIfAborted();
  return response;
}

function buildDemographicRequestWindow({
  clock,
  endInput,
  startInput,
  timeZone,
}: {
  clock: Date;
  endInput: string;
  startInput: string;
  timeZone: string;
}): DemographicRequestWindow {
  const from = civilDayStart(startInput, timeZone);
  const exclusiveEnd = civilDayStart(shiftCivilDateKey(endInput, 1), timeZone);
  const closedMinute = new Date(
    Math.floor(clock.getTime() / MINUTE_MS) * MINUTE_MS,
  );
  const to = exclusiveEnd > closedMinute ? closedMinute : exclusiveEnd;
  return {
    from,
    partitions: buildCivilDayPartitions(startInput, endInput, timeZone, to),
    to: to > from ? to : from,
  };
}

function buildCivilDayPartitions(
  startInput: string,
  endInput: string,
  timeZone: string,
  maximumTo: Date,
) {
  const partitions: DemographicRequestPartition[] = [];
  let cursor = startInput;
  // Shifting an annual selection by a calendar month may change its length.
  // Keep that complete baseline while the selectable main range stays bounded.
  for (let day = 0; day < MAX_DEMOGRAPHICS_DATE_RANGE_DAYS + 31; day += 1) {
    const from = civilDayStart(cursor, timeZone);
    const dayTo = civilDayStart(shiftCivilDateKey(cursor, 1), timeZone);
    const to = dayTo > maximumTo ? maximumTo : dayTo;
    if (to > from) partitions.push({ from, to });
    if (cursor === endInput || to >= maximumTo) break;
    cursor = shiftCivilDateKey(cursor, 1);
  }
  return partitions;
}

function buildInstantPartitions(from: Date, to: Date) {
  const partitions: DemographicRequestPartition[] = [];
  let cursor = from.getTime();
  while (cursor < to.getTime()) {
    const next = Math.min(cursor + 60 * MINUTE_MS, to.getTime());
    partitions.push({ from: new Date(cursor), to: new Date(next) });
    cursor = next;
  }
  return partitions;
}

function civilDayStart(dateKey: string, timeZone: string) {
  const parts = parseCivilDateKey(dateKey);
  return startOfCompanyTimeZoneCivilDay(parts, timeZone);
}

function parseCivilDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("A data demográfica selecionada é inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validation = new Date(Date.UTC(year, month - 1, day));
  if (
    validation.getUTCFullYear() !== year ||
    validation.getUTCMonth() !== month - 1 ||
    validation.getUTCDate() !== day
  ) {
    throw new Error("A data demográfica selecionada é inválida.");
  }
  return { day, month, year };
}

function shiftCivilDateKey(value: string, amount: number) {
  const { day, month, year } = parseCivilDateKey(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function defaultRangeForSurface(
  surface: DemographicsDashboardProps["surface"],
  todayInput: string,
) {
  if (surface === "analysis") {
    const previousDayInput = shiftCivilDateKey(todayInput, -1);
    return {
      endInput: previousDayInput,
      startInput: previousDayInput,
    };
  }
  const days = surface === "reports" ? 31 : 1;
  return {
    endInput: todayInput,
    startInput: shiftCivilDateKey(todayInput, -(days - 1)),
  };
}

function leadingDistributionItem<Key extends string>(
  items: readonly DemographicDistributionItem<Key>[],
) {
  return items.reduce<DemographicDistributionItem<Key> | null>(
    (leader, item) =>
      item.count > 0 && (!leader || item.count > leader.count) ? item : leader,
    null,
  );
}

function buildGenderOption(
  summary: DemographicAggregation,
  showLegend = false,
): EnterpriseChartOption {
  const visibleIndexes = summary.gender.flatMap((item, index) =>
    (item.percentage ?? 0) > 0 ? [index] : [],
  );
  const firstVisibleIndex = visibleIndexes[0];
  const lastVisibleIndex = visibleIndexes[visibleIndexes.length - 1];
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: false },
      description:
        "Barra de cem por cento com a participação das classificações Mulher, Homem e Não identificado.",
    },
    grid: {
      bottom: 4,
      containLabel: false,
      left: 0,
      right: 0,
      top: showLegend ? 36 : 4,
    },
    legend: {
      data: summary.gender.map((item) => item.label),
      formatter: (name: string) => {
        const item = summary.gender.find((candidate) => candidate.label === name);
        return item ? `${name} · ${formatPercentage(item.percentage)}` : name;
      },
      icon: "roundRect",
      itemGap: 18,
      itemHeight: 10,
      itemWidth: 10,
      show: showLegend,
      textStyle: { color: "#526477", fontSize: 12 },
      top: 0,
    },
    tooltip: { formatter: genderTooltip, trigger: "item" },
    xAxis: {
      max: 100,
      min: 0,
      show: false,
      splitLine: { show: false },
      type: "value",
    },
    yAxis: { data: ["Detecções"], show: false, type: "category" },
    series: summary.gender.map((item, index) => ({
      barMaxWidth: 32,
      data: [
        {
          count: item.count,
          label: item.label,
          value: item.percentage ?? 0,
        },
      ],
      emphasis: { focus: "series" },
      itemStyle: {
        borderRadius: [
          index === firstVisibleIndex ? 6 : 0,
          index === lastVisibleIndex ? 6 : 0,
          index === lastVisibleIndex ? 6 : 0,
          index === firstVisibleIndex ? 6 : 0,
        ],
        color: GENDER_COLORS[item.key],
      },
      label: {
        align: "center",
        color: item.key === "unknown" ? "#101828" : "#F9FAFB",
        formatter: (parameters: unknown) =>
          (chartParameterNumber(parameters) ?? 0) > 0
            ? percentageChartLabel(parameters)
            : "",
        fontSize: 11,
        fontWeight: 600,
        position: "inside",
        show: (item.percentage ?? 0) >= 7,
      },
      name: item.label,
      stack: "gender",
      type: "bar",
    })),
  } as EnterpriseChartOption;
}

function buildAgeOption(
  summary: DemographicAggregation,
  color: string,
): EnterpriseChartOption {
  return horizontalDistributionOption({
    ariaDescription:
      "Barras horizontais com a participação das nove faixas etárias em ordem crescente.",
    color,
    items: summary.age,
  });
}

function buildEmotionOption(
  summary: DemographicAggregation,
  color: string,
): EnterpriseChartOption {
  return horizontalDistributionOption({
    ariaDescription:
      "Ranking horizontal das oito emoções classificadas, da maior para a menor participação.",
    color,
    items: [...summary.emotion].sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    ),
  });
}

function horizontalDistributionOption<Key extends string>({
  ariaDescription,
  color,
  items,
}: {
  ariaDescription: string;
  color: string;
  items: readonly DemographicDistributionItem<Key>[];
}): EnterpriseChartOption {
  const largestPercentage = Math.max(
    0,
    ...items.map((item) => item.percentage ?? 0),
  );
  const maximum = Math.min(
    100,
    Math.max(10, Math.ceil((largestPercentage * 1.15) / 10) * 10),
  );
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: false },
      description: ariaDescription,
    },
    grid: { bottom: 12, containLabel: true, left: 0, right: 48, top: 8 },
    tooltip: {
      axisPointer: { type: "none" },
      formatter: distributionTooltip,
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: "#526477",
        fontSize: 10,
        formatter: "{value}%",
        hideOverlap: true,
        showMaxLabel: true,
        showMinLabel: true,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      max: maximum,
      min: 0,
      splitLine: { lineStyle: { opacity: 0.1, type: "dashed" } },
      splitNumber: 4,
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: "#526477",
        fontSize: 11,
        interval: 0,
        margin: 10,
        overflow: "truncate",
        width: 100,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: items.map((item) => item.label),
      inverse: true,
      type: "category",
    },
    series: [
      {
        barMaxWidth: 20,
        data: items.map((item) => ({
          count: item.count,
          value: item.percentage ?? 0,
        })),
        itemStyle: { borderRadius: [0, 4, 4, 0], color },
        label: {
          distance: 8,
          formatter: (parameters: unknown) =>
            (chartParameterNumber(parameters) ?? 0) > 0
              ? percentageChartLabel(parameters)
              : "",
          fontSize: 11,
          fontWeight: 600,
          position: "right",
          show: true,
        },
        name: "Participação",
        type: "bar",
      },
    ],
  } as EnterpriseChartOption;
}

// Keep the historical identifier so existing widget layouts remain compatible.
// The presentation is now a directly readable age-by-gender matrix.
function buildAgeGenderPyramidOption(
  summary: DemographicAggregation,
  theme: "light" | "dark" = "light",
): EnterpriseChartOption {
  const crossing = summary.crossings.ageByGender;
  const dark = theme === "dark";
  const axisTextColor = dark ? "#CBD5E1" : "#526477";
  const labelColor = dark ? "#E2E8F0" : "#334155";
  const cellBorderColor = dark ? "#3F3F46" : "#E2E8F0";
  // Column colors identify gender only. Percentages are read from the cells,
  // so a small positive value never disappears into an imperceptible bar.
  const columnColors: Record<DemographicGender, string> = dark
    ? { Woman: "#302344", Man: "#1D304F", unknown: "#2B3039" }
    : { Woman: "#F0EAFE", Man: "#E9F1FE", unknown: "#EDF0F5" };
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: false },
      description:
        "Matriz com faixas etárias nas linhas e Mulher, Homem e Não identificado nas colunas. Cada célula mostra a participação dessa combinação no total de detecções.",
    },
    grid: { bottom: 4, containLabel: true, left: 0, right: 8, top: 8 },
    legend: { show: false },
    tooltip: {
      formatter: (parameters: unknown) =>
        ageGenderMatrixTooltip(parameters, crossing.rows, crossing.columns),
      position: "top",
      trigger: "item",
    },
    visualMap: {
      dimension: 0,
      pieces: crossing.columns.map((column, columnIndex) => ({
        color: columnColors[column.key],
        label: column.label,
        value: columnIndex,
      })),
      seriesIndex: crossing.columns.map((_, columnIndex) => columnIndex),
      show: false,
      type: "piecewise",
    },
    xAxis: {
      axisLabel: {
        color: axisTextColor,
        fontSize: 11,
        formatter: (label: string) =>
          label === "Não identificado" ? "Não\nidentificado" : label,
        interval: 0,
        lineHeight: 14,
        margin: 10,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: crossing.columns.map((column) => column.label),
      position: "top",
      splitArea: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: axisTextColor, fontSize: 11, interval: 0, margin: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      data: crossing.rows.map((row) => row.label),
      inverse: true,
      splitArea: { show: false },
      type: "category",
    },
    series: crossing.columns.map((column, columnIndex) => ({
      data: crossing.rows.map((row, rowIndex) => {
        const cell = row.cells.find(
          (candidate) => candidate.columnKey === column.key,
        );
        return [columnIndex, rowIndex, cell?.percentage ?? 0, cell?.count ?? 0];
      }),
      emphasis: {
        focus: "none",
        itemStyle: { borderColor: GENDER_COLORS[column.key], borderWidth: 1.5 },
      },
      itemStyle: {
        borderColor: cellBorderColor,
        borderWidth: 1,
        color: columnColors[column.key],
      },
      label: {
        color: labelColor,
        formatter: (parameters: unknown) => {
          if (!isRecord(parameters) || !Array.isArray(parameters.value)) return "";
          const percentage = Number(parameters.value[2]);
          return Number.isFinite(percentage) && percentage > 0
            ? `${formatDecimal(percentage)}%`
            : "";
        },
        fontSize: 11,
        fontWeight: 600,
        show: true,
      },
      name: column.label,
      type: "heatmap",
    })),
  } as EnterpriseChartOption;
}

function buildAgeEmotionHeatmapOption(
  summary: DemographicAggregation,
  theme: "light" | "dark" = "light",
): EnterpriseChartOption {
  const axisTextColor = theme === "dark" ? "#CBD5E1" : "#526477";
  const cellBorderColor =
    theme === "dark"
      ? "rgba(226, 232, 240, 0.08)"
      : "rgba(15, 23, 42, 0.06)";
  const activeCellBorderColor =
    theme === "dark"
      ? "rgba(248, 250, 252, 0.24)"
      : "rgba(15, 23, 42, 0.20)";
  const crossing = summary.crossings.ageByEmotion;
  const data = crossing.rows.flatMap((row, rowIndex) =>
    row.cells.map((cell, columnIndex) => [
      columnIndex,
      rowIndex,
      cell.percentage ?? 0,
      cell.count,
    ]),
  );
  const maximum = Math.max(1, ...data.map((cell) => Number(cell[2])));
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: false },
      description:
        "Mapa de calor com faixas etárias nas linhas, emoções nas colunas e percentual do total em cada célula.",
    },
    grid: { bottom: 44, containLabel: true, left: 0, right: 8, top: 8 },
    tooltip: {
      formatter: (parameters: unknown) =>
        heatmapTooltip(parameters, crossing.rows, crossing.columns),
      position: "top",
    },
    visualMap: {
      calculable: false,
      bottom: 0,
      dimension: 2,
      inRange: { color: HEATMAP_COLORS },
      itemHeight: 120,
      itemWidth: 8,
      left: "center",
      max: maximum,
      min: 0,
      orient: "horizontal",
      seriesIndex: 0,
      text: [`${formatDecimal(maximum)}%`, "0%"],
      textGap: 8,
      textStyle: { color: axisTextColor, fontSize: 10 },
    },
    xAxis: {
      axisLabel: { color: axisTextColor, fontSize: 11, interval: 0, rotate: 38 },
      axisLine: { show: false },
      axisTick: { show: false },
      data: crossing.columns.map((column) => column.label),
      splitArea: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: axisTextColor, fontSize: 11, interval: 0, margin: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      data: crossing.rows.map((row) => row.label),
      inverse: true,
      splitArea: { show: false },
      type: "category",
    },
    series: [
      {
        data,
        emphasis: {
          itemStyle: {
            borderColor: activeCellBorderColor,
            borderWidth: 1,
          },
        },
        itemStyle: {
          borderColor: cellBorderColor,
          borderWidth: 1,
        },
        label: {
          formatter: (parameters: unknown) =>
            heatmapPercentageLabel(parameters, maximum),
          fontSize: 10,
          fontWeight: 600,
          rich: {
            dark: { color: "#0F172A", fontWeight: 600 },
            light: { color: "#FFFFFF", fontWeight: 600 },
          },
          show: true,
        },
        name: "Participação",
        type: "heatmap",
      },
    ],
  } as EnterpriseChartOption;
}

function buildDemographicsReport({
  audience,
  rangeLabel,
  summary,
  surface,
  timeZone,
  presentations,
}: {
  audience: string;
  rangeLabel: string;
  summary: DemographicAggregation;
  surface: DemographicsDashboardProps["surface"];
  timeZone: string;
  presentations?: Partial<Record<string, DemographicPresentation>>;
}): ReportPayload {
  const genderLeader = leadingDistributionItem(summary.gender);
  const ageLeader = leadingDistributionItem(summary.age);
  const emotionLeader = leadingDistributionItem(summary.emotion);
  // Use the same saved visual options in exports. Text labels stay explicit;
  // PDF fonts do not reliably support the optional emoji glyphs.
  const presentationFor = (id: string) => {
    const dimension = demographicDimensionForCard(id);
    return dimension ? { ...normalizeDemographicPresentation(presentations?.[id], dimension), emojis: false } : undefined;
  };
  const gender = presentations ? presentationFor("demographics_gender_mix") : undefined;
  const age = presentations ? presentationFor("demographics_age_distribution") : undefined;
  const emotion = presentations ? presentationFor("demographics_emotion_distribution") : undefined;
  const ageGender = presentations ? presentationFor("demographics_age_gender_pyramid") : undefined;
  const ageEmotion = presentations ? presentationFor("demographics_age_emotion_heatmap") : undefined;
  const charts: ReportChart[] = [
    {
      description: "Participação por gênero no total classificado.",
      option: gender ? buildDemographicDistributionOption(summary.gender, gender, { dimension: "gender", showLegend: true }) : buildGenderOption(summary, true),
      table: distributionReportTable("Gênero", summary.gender),
      title: "Composição por gênero",
    },
    {
      description: "Participação por faixa etária no total classificado.",
      option: age ? buildDemographicDistributionOption(summary.age, age, { dimension: "age", showLegend: true }) : buildAgeOption(summary, "#1267C4"),
      table: distributionReportTable("Faixas etárias", summary.age),
      title: "Distribuição por faixa etária",
    },
    {
      description: "Ranking das emoções classificadas.",
      option: emotion ? buildDemographicDistributionOption(summary.emotion, emotion, { dimension: "emotion", showLegend: true }) : buildEmotionOption(summary, "#7C3AED"),
      table: distributionReportTable("Emoções", summary.emotion),
      title: "Ranking de emoções",
    },
    {
      description: "Cruzamento entre faixa etária e gênero.",
      option: ageGender ? buildDemographicCrossingOption(summary, ageGender, "age-gender", "light") : buildAgeGenderPyramidOption(summary),
      table: ageGenderReportTable(summary),
      title: "Faixa etária por gênero",
    },
    {
      description: "Cruzamento entre faixa etária e emoção.",
      option: ageEmotion ? buildDemographicCrossingOption(summary, ageEmotion, "age-emotion", "light") : buildAgeEmotionHeatmapOption(summary),
      table: ageEmotionReportTable(summary),
      title: "Faixa etária × emoção",
    },
  ];
  return {
    charts,
    context: [
      `Período analisado: ${rangeLabel}`,
      audience,
      `${formatNumber(summary.cameraIds.length)} câmera(s) analisada(s)`,
      "Resultados recentes podem continuar em processamento.",
      "Detecções classificadas não equivalem a visitantes únicos.",
    ],
    dataCompleteUntil: null,
    filename: `ipxdata-demographics-${surface}-${fileDateKey(new Date())}`,
    generatedAt: new Date(),
    metrics: [
      {
        description:
          "Total de classificações recebidas no período; não representa pessoas únicas.",
        label: "Detecções classificadas",
        value: summary.hasData ? summary.total : "Sem dados",
      },
      leaderReportMetric("Gênero predominante", genderLeader),
      leaderReportMetric("Faixa etária predominante", ageLeader),
      leaderReportMetric("Emoção predominante", emotionLeader),
    ],
    subtitle: `${rangeLabel} · percentuais sobre detecções classificadas`,
    timeZone,
    title: `Demographics · ${surfaceLabel(surface)}`,
  };
}

function distributionReportTable<Key extends string>(
  title: string,
  items: readonly DemographicDistributionItem<Key>[],
): ReportTable {
  return {
    columns: [
      { key: "category", label: "Categoria", width: 24 },
      { key: "count", label: "Detecções", numeric: true, width: 18 },
      { key: "percentage", label: "Participação", width: 18 },
    ],
    rows: items.map((item) => ({
      category: item.label,
      count: item.count,
      percentage: formatPercentage(item.percentage),
    })),
    title,
  };
}

function ageGenderReportTable(summary: DemographicAggregation): ReportTable {
  return {
    columns: [
      { key: "age", label: "Faixa etária", width: 18 },
      { key: "Woman", label: "Mulher", numeric: true, width: 16 },
      { key: "Man", label: "Homem", numeric: true, width: 16 },
      { key: "unknown", label: "Não identificado", numeric: true, width: 20 },
      { key: "total", label: "Total", numeric: true, width: 16 },
    ],
    rows: summary.crossings.ageByGender.rows.map((row) => ({
      age: row.label,
      Man: row.cells.find((cell) => cell.columnKey === "Man")?.count ?? 0,
      Woman: row.cells.find((cell) => cell.columnKey === "Woman")?.count ?? 0,
      unknown:
        row.cells.find((cell) => cell.columnKey === "unknown")?.count ?? 0,
      total: row.count,
    })),
    title: "Faixa etária por gênero",
  };
}

function ageEmotionReportTable(summary: DemographicAggregation): ReportTable {
  return {
    columns: [
      { key: "age", label: "Faixa etária", width: 18 },
      { key: "emotion", label: "Emoção", width: 20 },
      { key: "count", label: "Detecções", numeric: true, width: 16 },
      { key: "percentage", label: "% do total", width: 16 },
    ],
    rows: summary.crossings.ageByEmotion.rows.flatMap((row) =>
      row.cells.map((cell) => ({
        age: row.label,
        count: cell.count,
        emotion:
          summary.crossings.ageByEmotion.columns.find(
            (column) => column.key === cell.columnKey,
          )?.label ?? cell.columnKey,
        percentage: formatPercentage(cell.percentage),
      })),
    ),
    title: "Faixa etária por emoção",
  };
}

function leaderReportMetric(
  label: string,
  item: DemographicDistributionItem | null,
) {
  return {
    description: item
      ? `${formatNumber(item.count)} detecções`
      : "Nenhuma categoria com volume positivo",
    label,
    value: item
      ? `${item.label} · ${formatPercentage(item.percentage)}`
      : "Sem predominância",
  };
}

function genderTooltip(parameters: unknown) {
  const parameter = firstTooltipParameter(parameters);
  const data = parameter && isRecord(parameter.data) ? parameter.data : null;
  const label = typeof data?.label === "string" ? data.label : "Gênero";
  return tooltipBlock(
    label,
    chartDataNumber(data, "value"),
    chartDataNumber(data, "count"),
  );
}

function distributionTooltip(parameters: unknown) {
  const parameter = firstTooltipParameter(parameters);
  const data = parameter && isRecord(parameter.data) ? parameter.data : null;
  const label =
    parameter && typeof parameter.axisValueLabel === "string"
      ? parameter.axisValueLabel
      : "Categoria";
  return tooltipBlock(
    label,
    chartDataNumber(data, "value"),
    chartDataNumber(data, "count"),
  );
}

function ageGenderMatrixTooltip(
  parameters: unknown,
  rows: DemographicAggregation["crossings"]["ageByGender"]["rows"],
  columns: DemographicAggregation["crossings"]["ageByGender"]["columns"],
) {
  const parameter = firstTooltipParameter(parameters);
  if (!parameter || !Array.isArray(parameter.value)) return "Sem valor";
  const columnIndex = Number(parameter.value[0]);
  const rowIndex = Number(parameter.value[1]);
  const percentage = Number(parameter.value[2]);
  const count = Number(parameter.value[3]);
  const age = rows[rowIndex]?.label ?? "Faixa etária";
  const gender = columns[columnIndex]?.label ?? "Gênero";
  return tooltipBlock(
    `${age} · ${gender}`,
    Number.isFinite(percentage) ? percentage : null,
    Number.isFinite(count) ? count : null,
  );
}

function heatmapTooltip(
  parameters: unknown,
  rows: DemographicAggregation["crossings"]["ageByEmotion"]["rows"],
  columns: DemographicAggregation["crossings"]["ageByEmotion"]["columns"],
) {
  const parameter = firstTooltipParameter(parameters);
  if (!parameter || !Array.isArray(parameter.value)) return "Sem valor";
  const columnIndex = Number(parameter.value[0]);
  const rowIndex = Number(parameter.value[1]);
  const percentage = Number(parameter.value[2]);
  const count = Number(parameter.value[3]);
  const age = rows[rowIndex]?.label ?? "Faixa etária";
  const emotion = columns[columnIndex]?.label ?? "Emoção";
  return tooltipBlock(
    `${age} · ${emotion}`,
    Number.isFinite(percentage) ? percentage : null,
    Number.isFinite(count) ? count : null,
  );
}

function tooltipBlock(
  label: string,
  percentage: number | null,
  count: number | null,
) {
  return [
    `<strong>${escapeTooltipHtml(label)}</strong>`,
    `Participação: ${percentage === null ? "—" : `${formatDecimal(Math.abs(percentage))}%`}`,
    `Detecções: ${count === null ? "—" : formatNumber(count)}`,
  ].join("<br/>");
}

function firstTooltipParameter(parameters: unknown) {
  const candidate = Array.isArray(parameters) ? parameters[0] : parameters;
  return isRecord(candidate) ? candidate : null;
}

function chartDataNumber(data: Record<string, unknown> | null, key: string) {
  const value = Number(data?.[key]);
  return Number.isFinite(value) ? value : null;
}

function escapeTooltipHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percentageChartLabel(parameters: unknown) {
  const value = chartParameterNumber(parameters);
  return value === null ? "—" : `${formatDecimal(value)}%`;
}

function heatmapPercentageLabel(parameters: unknown, maximum: number) {
  if (!isRecord(parameters) || !Array.isArray(parameters.value)) return "—";
  const value = Number(parameters.value[2]);
  if (!Number.isFinite(value) || value <= 0) return "";
  const contrastStyle =
    heatmapLabelColor(HEATMAP_COLORS, value / maximum) === "#FFFFFF"
      ? "light"
      : "dark";
  return `{${contrastStyle}|${formatDecimal(value)}%}`;
}

function chartParameterNumber(parameters: unknown) {
  if (!isRecord(parameters)) return null;
  const raw = isRecord(parameters.value)
    ? parameters.value.value
    : parameters.value;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function demographicTextAlternative(title: string) {
  return `${title}. Percentuais positivos aparecem diretamente no gráfico; combinações de zero por cento permanecem disponíveis no tooltip e na exportação tabular.`;
}

function demographicRequestErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Seu perfil não possui permissão para consultar o módulo Demographics nesta empresa.";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "A consulta demográfica ainda não está disponível neste ambiente.";
  }
  return userFacingErrorMessage(
    error,
    "Não foi possível carregar os dados demográficos.",
  );
}

function formatPercentage(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : `${formatDecimal(value)}%`;
}

function formatDecimal(value: number) {
  const absolute = Math.abs(value);
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits:
      absolute > 0 && absolute < 0.1 ? 2 : absolute < 1 && absolute > 0 ? 1 : 0,
  }).format(value);
}

function formatRangeLabel(startInput: string, endInput: string) {
  const format = (value: string) => {
    const { day, month, year } = parseCivilDateKey(value);
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  };
  return startInput === endInput
    ? format(startInput)
    : `${format(startInput)} a ${format(endInput)}`;
}

function formatCompanyClock(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(value);
}

function progressPercentage(progress: { completed: number; total: number }) {
  if (progress.total <= 0) return "0%";
  return `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%`;
}

function surfaceLabel(surface: DemographicsDashboardProps["surface"]) {
  if (surface === "live") return "Ao Vivo";
  if (surface === "analysis") return "Análises";
  return "Relatórios";
}

function fileDateKey(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
