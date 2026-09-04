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
import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import { AnalysisDateRangePicker } from "@/components/app/occupancy-date-range-picker";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { useTheme } from "@/components/app/theme-provider";
import {
  WidgetTitleText,
  useWidgetColor,
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
] as const;

const DEMOGRAPHICS_MENU_KEY = "demographics" as CardMenuKey;
const LIVE_TAIL_MINUTES = 5;
// Reconciliamos continuamente os cinco minutos finais. Uma releitura integral
// fica rara e o botão Atualizar continua disponível para reconciliação manual.
const LIVE_FULL_REFRESH_MS = 6 * 60 * 60 * 1_000;
const MINUTE_MS = 60_000;
const MAX_DEMOGRAPHIC_PARTITION_CACHE_ENTRIES = 96;
const GENDER_COLORS: Record<DemographicGender, string> = {
  Woman: "#E85D9E",
  Man: "#2D7FF9",
  unknown: "#94A3B8",
};
const HEATMAP_COLORS = ["#EFF6FF", "#BFDBFE", "#60A5FA", "#2563EB", "#172554"];

type DashboardDataState = {
  key: string;
  summary: DemographicAggregation;
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
  const [clock, setClock] = React.useState(() => new Date());
  const todayInput = companyDateKey(clock, timeZone);
  const rangeScopeKey = `${companyScopeId}|${user?.id ?? ""}|${surface}|${todayInput}`;
  const historicalQueryIdentityKey = `${companyScopeId}|${user?.id ?? ""}|${surface}`;
  const fallbackRange = React.useMemo(
    () => defaultRangeForSurface(surface, todayInput),
    [surface, todayInput],
  );
  const [rangeState, setRangeState] = React.useState<{
    key: string;
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
        value: nextRange,
      });
    };
    if (surface === "analysis") {
      publishRange(fallbackRange);
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
    let disposed = false;
    const isCurrent = () =>
      !disposed &&
      !controller.signal.aborted &&
      sequence === requestSequenceRef.current;

    async function load() {
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
                window: requestWindow,
              })
            : await loadPartitionedDemographicAggregation({
                cache: partitionCacheRef.current,
                companyScopeId,
                onProgress: publishProgress,
                partitions: requestWindow.partitions,
                signal: controller.signal,
              });
        if (!isCurrent()) return;
        const nextDataState = { key: dataScopeKey, summary };
        dataStateRef.current = nextDataState;
        setDataState(nextDataState);
        setLastUpdated(new Date());
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
  ]);

  const emptySummary = React.useMemo(() => aggregateDemographicBuckets([]), []);
  const summary =
    dataState?.key === dataScopeKey ? dataState.summary : emptySummary;
  const genderLeader = leadingDistributionItem(summary.gender);
  const ageLeader = leadingDistributionItem(summary.age);
  const emotionLeader = leadingDistributionItem(summary.emotion);
  const rangeLabel = formatRangeLabel(
    surface === "live" ? todayInput : appliedRange.startInput,
    surface === "live" ? todayInput : appliedRange.endInput,
  );
  function buildDemographicsReportPayload() {
    return buildDemographicsReport({
      audience: manager ? "Visão gerencial" : "Visão operacional",
      rangeLabel,
      summary,
      surface,
      timeZone,
    });
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
            description="Total de classificações recebidas no período; não representa visitantes únicos."
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
            description="Participação sobre todas as detecções classificadas."
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
            description="Faixa com maior participação no intervalo selecionado."
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
            description="Expressão classificada com maior participação no período."
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
        defaultHeightLevel: 2,
        defaultWidthLevel: 6,
        id: "demographics_gender_mix",
        label: "Composição por gênero",
        node: <GenderCompositionCard loading={loading} summary={summary} />,
        previewColors: Object.values(GENDER_COLORS),
        previewKind: "composition",
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: true,
        defaultHeightLevel: 3,
        defaultWidthLevel: 3,
        id: "demographics_age_distribution",
        label: "Distribuição por faixa etária",
        node: <AgeDistributionCard loading={loading} summary={summary} />,
        previewChartType: "bar",
        previewKind: "chart",
        previewOrientation: "horizontal",
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: true,
        defaultHeightLevel: 3,
        defaultWidthLevel: 3,
        id: "demographics_emotion_distribution",
        label: "Ranking de emoções",
        node: <EmotionDistributionCard loading={loading} summary={summary} />,
        previewChartType: "bar",
        previewKind: "ranking",
        previewOrientation: "horizontal",
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 4,
        defaultWidthLevel: 3,
        id: "demographics_age_gender_pyramid",
        label: "Pirâmide etária por gênero",
        node: <AgeGenderPyramidCard loading={loading} summary={summary} />,
        previewColors: Object.values(GENDER_COLORS),
        previewKind: "chart",
        previewOrientation: "horizontal",
        titleEditable: true,
        zoomEnabled: true,
      },
      {
        colorEditable: false,
        defaultHeightLevel: 4,
        defaultWidthLevel: 3,
        id: "demographics_age_emotion_heatmap",
        label: "Faixa etária × emoção",
        node: <AgeEmotionHeatmapCard loading={loading} summary={summary} />,
        previewColors: HEATMAP_COLORS,
        previewKind: "heatmap",
        titleEditable: true,
        zoomEnabled: true,
      },
    ],
    [ageLeader, emotionLeader, genderLeader, loading, summary],
  );

  function applyRange(value: OccupancyAnalysisDateRangeInput) {
    if (surface === "live") return;
    if (
      countDemographicsDateRangeDays(value) > MAX_DEMOGRAPHICS_DATE_RANGE_DAYS
    ) {
      return;
    }
    const persisted = saveDemographicsDateRange(value, {
      companyId: companyScopeId,
      fallback: fallbackRange,
      surface,
      todayInput,
      userId: user?.id,
    });
    setRangeState({ key: rangeScopeKey, value: persisted });
    setHistoricalQueryScopeKey(historicalQueryIdentityKey);
  }

  function forceRefresh() {
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
    setClock(new Date());
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
          className="grid min-w-0 grid-cols-[32px_minmax(32px,1fr)_144px] items-center gap-2 @sm:grid-cols-[minmax(180px,300px)_minmax(32px,1fr)_144px]"
          role="group"
        >
          <div className="col-start-1 row-start-1 min-w-0">
            {surface === "live" ? (
              <div
                className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-medium"
                title={`${rangeLabel} · horário da empresa`}
              >
                <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
                <span className="hidden truncate @sm:inline">
                  Hoje · {rangeLabel}
                </span>
                <span className="sr-only @sm:hidden">Hoje · {rangeLabel}</span>
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

          <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end overflow-hidden">
            {(loading || refreshing) &&
            loadProgress &&
            loadProgress.total > 4 ? (
              <span
                aria-live="polite"
                className="inline-flex h-8 min-w-0 items-center gap-1 truncate px-1 text-[11px] tabular-nums text-muted-foreground"
                role="status"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span className="hidden truncate @md:inline">
                  Consultando {progressPercentage(loadProgress)}
                </span>
              </span>
            ) : lastUpdated ? (
              <span
                aria-label={`Dados recebidos em ${formatCompanyDateTime(lastUpdated, timeZone)}`}
                className="inline-flex h-8 min-w-0 items-center gap-1 truncate px-1 text-[11px] tabular-nums text-muted-foreground"
                title={`Dados recebidos em ${formatCompanyDateTime(lastUpdated, timeZone)}`}
              >
                <Clock3 className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden truncate @md:inline">
                  Recebido às {formatCompanyClock(lastUpdated, timeZone)}
                </span>
              </span>
            ) : null}
          </div>

          <div
            aria-label="Ações do módulo Demographics"
            className="col-start-3 row-start-1 flex w-[144px] flex-nowrap items-center justify-end gap-1 justify-self-end"
            role="group"
          >
            <ReportExportActions
              compact
              disabled={loading || !summary.hasData}
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
        </div>
      ) : null}

      <CardLayout
        cards={cards}
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
}: {
  loading: boolean;
  summary: DemographicAggregation;
}) {
  const option = React.useMemo(() => buildGenderOption(summary), [summary]);
  return (
    <DemographicChartCard
      description="Percentual de Mulher, Homem e Não identificado sobre o total classificado."
      hasData={summary.hasData}
      kind="gender"
      loading={loading}
      option={option}
      title="Composição por gênero"
      footer={
        <div className="grid min-w-0 grid-cols-3 gap-1.5">
          {summary.gender.map((item) => (
            <div
              key={item.key}
              className="min-w-0 rounded-md border bg-background/70 px-1.5 py-1 text-center"
            >
              <div
                className="flex min-h-6 items-center justify-center break-words text-[9px] leading-3 text-muted-foreground [overflow-wrap:anywhere]"
                title={item.label}
              >
                {item.label}
              </div>
              <div className="text-xs font-semibold tabular-nums">
                {formatPercentage(item.percentage)}
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
}

function AgeDistributionCard({
  loading,
  summary,
}: {
  loading: boolean;
  summary: DemographicAggregation;
}) {
  const color = useWidgetColor("#1267C4");
  const option = React.useMemo(
    () => buildAgeOption(summary, color),
    [color, summary],
  );
  return (
    <DemographicChartCard
      description="As nove faixas aparecem sempre na mesma ordem, com percentual e volume."
      hasData={summary.hasData}
      kind="distribution"
      loading={loading}
      option={option}
      title="Distribuição por faixa etária"
    />
  );
}

function EmotionDistributionCard({
  loading,
  summary,
}: {
  loading: boolean;
  summary: DemographicAggregation;
}) {
  const color = useWidgetColor("#7C3AED");
  const option = React.useMemo(
    () => buildEmotionOption(summary, color),
    [color, summary],
  );
  return (
    <DemographicChartCard
      description="Ranking das oito expressões classificadas, ordenado por participação."
      hasData={summary.hasData}
      kind="distribution"
      loading={loading}
      option={option}
      title="Ranking de emoções"
    />
  );
}

function AgeGenderPyramidCard({
  loading,
  summary,
}: {
  loading: boolean;
  summary: DemographicAggregation;
}) {
  const option = React.useMemo(
    () => buildAgeGenderPyramidOption(summary),
    [summary],
  );
  return (
    <DemographicChartCard
      description="Participação de cada combinação no total classificado; os dois lados usam a mesma escala."
      hasData={summary.hasData}
      kind="pyramid"
      loading={loading}
      option={option}
      title="Pirâmide etária por gênero"
    />
  );
}

function AgeEmotionHeatmapCard({
  loading,
  summary,
}: {
  loading: boolean;
  summary: DemographicAggregation;
}) {
  const { effectiveTheme } = useTheme();
  const option = React.useMemo(
    () => buildAgeEmotionHeatmapOption(summary, effectiveTheme),
    [effectiveTheme, summary],
  );
  return (
    <DemographicChartCard
      description="Participação de cada combinação de faixa etária e emoção no total classificado."
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
  kind: "distribution" | "gender" | "heatmap" | "pyramid";
  loading: boolean;
  option: EnterpriseChartOption;
  title: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const synchronizeDensity = () => {
      const nextCompact = root.getBoundingClientRect().height < 220;
      setCompact((current) =>
        current === nextCompact ? current : nextCompact,
      );
    };
    synchronizeDensity();
    const observer = new ResizeObserver(synchronizeDensity);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const responsiveOption = React.useMemo(
    () => (compact ? compactDemographicChartOption(option, kind) : option),
    [compact, kind, option],
  );

  return (
    <Card
      ref={rootRef}
      className="@container flex h-full min-w-0 flex-col overflow-hidden"
      data-demographics-density={compact ? "compact" : "regular"}
    >
      <CardHeader
        className={cn("min-w-0 gap-0.5", compact ? "p-2 pb-0.5" : "p-3 pb-1")}
      >
        <CardTitle className={cn("leading-5", compact ? "text-xs" : "text-sm")}>
          <WidgetTitleText fallback={title} />
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
        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="min-h-0 flex-1 w-full" />
          </div>
        ) : !hasData ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed px-3 text-center text-xs text-muted-foreground">
            Sem dados demográficos no intervalo.
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1">
            <EChart
              ariaDescription={description}
              ariaLabel={title}
              className="h-full min-h-0 w-full"
              option={responsiveOption}
              valueLabels="always"
            />
          </div>
        )}
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
  kind: "distribution" | "gender" | "heatmap" | "pyramid",
): EnterpriseChartOption {
  const source = option as Record<string, unknown>;
  const grid = mapChartOptionCollection(source.grid, (candidate) => ({
    ...candidate,
    bottom: kind === "gender" ? 2 : kind === "heatmap" ? 4 : 8,
    left: kind === "pyramid" ? 8 : 4,
    right: kind === "distribution" ? 42 : 8,
    top: kind === "pyramid" ? 22 : kind === "gender" ? 2 : 4,
  }));
  const xAxis = mapChartOptionCollection(source.xAxis, (candidate) => ({
    ...candidate,
    ...(kind === "gender" ? { show: false } : {}),
    axisLabel: {
      ...(isRecord(candidate.axisLabel) ? candidate.axisLabel : {}),
      fontSize: kind === "heatmap" ? 7 : 8,
      ...(kind === "heatmap" ? { rotate: 42 } : {}),
    },
  }));
  const yAxis = mapChartOptionCollection(source.yAxis, (candidate) => ({
    ...candidate,
    ...(kind === "gender" ? { show: false } : {}),
    axisLabel: {
      ...(isRecord(candidate.axisLabel) ? candidate.axisLabel : {}),
      fontSize: kind === "heatmap" ? 7 : 8,
      ...(kind === "distribution" ? { width: 66 } : {}),
    },
  }));
  const series = mapChartOptionCollection(source.series, (candidate) => ({
    ...candidate,
    ...(kind === "distribution" || kind === "pyramid"
      ? { barMaxWidth: 12 }
      : {}),
    label: {
      ...(isRecord(candidate.label) ? candidate.label : {}),
      fontSize: kind === "heatmap" ? 7 : 8,
    },
  }));
  const legend = mapChartOptionCollection(source.legend, (candidate) => ({
    ...candidate,
    itemHeight: 6,
    itemWidth: 8,
    textStyle: {
      ...(isRecord(candidate.textStyle) ? candidate.textStyle : {}),
      fontSize: 8,
    },
  }));
  const visualMap =
    kind === "heatmap"
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
    visualMap,
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

async function loadPartitionedDemographicAggregation({
  cache,
  companyScopeId,
  onProgress,
  partitions,
  signal,
}: {
  cache: Map<string, DemographicAggregation>;
  companyScopeId: string;
  onProgress?: (completed: number, total: number) => void;
  partitions: DemographicRequestPartition[];
  signal: AbortSignal;
}) {
  if (!partitions.length) return aggregateDemographicBuckets([]);
  let combined = aggregateDemographicBuckets([]);
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
        );
        const cached = cache.get(cacheKey);
        const summary =
          cached ??
          (await fetchDemographicSummary(
            partition,
            companyScopeId,
            signal,
          ));
        signal.throwIfAborted();
        if (!cached) {
          cacheDemographicPartition(cache, cacheKey, summary);
        }
        // Cada dia é descartado logo após entrar no acumulador. Assim um
        // intervalo de 31 dias nunca mantém todas as linhas brutas
        // simultaneamente no navegador.
        combined = combineDemographicAggregations([combined, summary]);
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
  return combined;
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
  window,
}: {
  cacheRef: React.MutableRefObject<LiveAggregationCache | null>;
  companyScopeId: string;
  onProgress?: (completed: number, total: number) => void;
  partitionCache: Map<string, DemographicAggregation>;
  pendingRef: React.MutableRefObject<PendingLiveAggregation | null>;
  refreshVersion: number;
  scopeKey: string;
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
  window,
}: {
  cacheRef: React.MutableRefObject<LiveAggregationCache | null>;
  companyScopeId: string;
  onProgress?: (completed: number, total: number) => void;
  partitionCache: Map<string, DemographicAggregation>;
  scopeKey: string;
  signal: AbortSignal;
  window: DemographicRequestWindow;
}) {
  const now = Date.now();
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();
  if (toMs <= fromMs) return aggregateDemographicBuckets([]);
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
      signal,
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
      aggregateDemographicBuckets(tailRows),
    ]);
  }

  if (cached.to === toMs) {
    return combineDemographicAggregations([
      cached.stableSummary,
      aggregateDemographicBuckets(cached.tailRows),
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
  });
  const nextTailRows = await fetchDemographicRows(
    { from: new Date(nextTailFrom), to: new Date(toMs) },
    companyScopeId,
    signal,
  );
  signal.throwIfAborted();
  const stableSummary = combineDemographicAggregations([
    cached.stableSummary,
    aggregateDemographicBuckets(promotedRows),
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
    aggregateDemographicBuckets(nextTailRows),
  ]);
}

async function fetchDemographicSummary(
  partition: DemographicRequestPartition,
  companyScopeId: string,
  signal: AbortSignal,
) {
  if (partition.to <= partition.from) return aggregateDemographicBuckets([]);
  const response = await fetchDemographicResponse(
    partition,
    companyScopeId,
    signal,
  );
  return summarizeDemographicBuckets(response, {
    from: partition.from,
    to: partition.to,
  });
}

function demographicPartitionCacheKey(
  partition: DemographicRequestPartition,
  companyScopeId: string,
) {
  return JSON.stringify([
    companyScopeId,
    partition.from.toISOString(),
    partition.to.toISOString(),
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
  for (let day = 0; day < MAX_DEMOGRAPHICS_DATE_RANGE_DAYS; day += 1) {
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
): EnterpriseChartOption {
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: true },
      description:
        "Barra de cem por cento com a participação das classificações Mulher, Homem e Não identificado.",
    },
    grid: { bottom: 8, containLabel: true, left: 8, right: 8, top: 12 },
    legend: { show: false },
    tooltip: { formatter: genderTooltip, trigger: "item" },
    xAxis: {
      axisLabel: { formatter: "{value}%" },
      max: 100,
      min: 0,
      splitLine: { lineStyle: { opacity: 0.15 } },
      type: "value",
    },
    yAxis: { data: ["Detecções"], type: "category" },
    series: summary.gender.map((item, index) => ({
      barMaxWidth: 46,
      data: [
        {
          count: item.count,
          label: item.label,
          value: item.percentage ?? 0,
        },
      ],
      emphasis: { focus: "series" },
      itemStyle: {
        borderRadius:
          index === 0
            ? [7, 0, 0, 7]
            : index === summary.gender.length - 1
              ? [0, 7, 7, 0]
              : 0,
        color: GENDER_COLORS[item.key],
      },
      label: {
        color: item.key === "unknown" ? "#101828" : "#F9FAFB",
        formatter: percentageChartLabel,
        fontSize: 11,
        fontWeight: 700,
        position: "inside",
        show: (item.percentage ?? 0) >= 7,
      },
      name: `${item.label} · ${formatPercentage(item.percentage)} · ${formatNumber(item.count)}`,
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
  return {
    animationDuration: 350,
    aria: { enabled: true, description: ariaDescription },
    grid: { bottom: 24, containLabel: true, left: 8, right: 54, top: 8 },
    tooltip: { formatter: distributionTooltip, trigger: "axis" },
    xAxis: {
      axisLabel: { formatter: "{value}%" },
      max: 100,
      min: 0,
      splitLine: { lineStyle: { opacity: 0.15 } },
      type: "value",
    },
    yAxis: {
      axisLabel: { overflow: "truncate", width: 92 },
      axisTick: { show: false },
      data: items.map((item) => item.label),
      inverse: true,
      type: "category",
    },
    series: [
      {
        barMaxWidth: 22,
        data: items.map((item) => ({
          count: item.count,
          value: item.percentage ?? 0,
        })),
        itemStyle: { borderRadius: [0, 5, 5, 0], color },
        label: {
          color: "#526477",
          formatter: percentageChartLabel,
          fontSize: 10,
          fontWeight: 700,
          position: "right",
          show: true,
        },
        name: "Participação",
        type: "bar",
      },
    ],
  } as EnterpriseChartOption;
}

function buildAgeGenderPyramidOption(
  summary: DemographicAggregation,
): EnterpriseChartOption {
  const crossing = summary.crossings.ageByGender;
  const women = crossing.rows.map((row) => {
    const cell = row.cells.find((candidate) => candidate.columnKey === "Woman");
    return { count: cell?.count ?? 0, value: -(cell?.percentage ?? 0) };
  });
  const men = crossing.rows.map((row) => {
    const cell = row.cells.find((candidate) => candidate.columnKey === "Man");
    return { count: cell?.count ?? 0, value: cell?.percentage ?? 0 };
  });
  const unknown = crossing.rows.map((row) => {
    const cell = row.cells.find(
      (candidate) => candidate.columnKey === "unknown",
    );
    return { count: cell?.count ?? 0, value: cell?.percentage ?? 0 };
  });
  const maximum = Math.max(
    1,
    ...women.map((item) => Math.abs(item.value)),
    ...men.map((item) => item.value),
    ...unknown.map((item, index) => item.value + men[index].value),
  );
  return {
    animationDuration: 350,
    aria: {
      enabled: true,
      decal: { show: true },
      description:
        "Pirâmide etária com a participação de cada combinação no total: Mulher à esquerda e Homem e Não identificado à direita.",
    },
    grid: { bottom: 30, containLabel: true, left: 20, right: 20, top: 32 },
    legend: { data: ["Mulher", "Homem", "Não identificado"], top: 0 },
    tooltip: { formatter: pyramidTooltip, trigger: "axis" },
    xAxis: {
      axisLabel: { formatter: absoluteAxisPercentage },
      max: Math.ceil(maximum * 1.2),
      min: -Math.ceil(maximum * 1.2),
      splitLine: { lineStyle: { opacity: 0.15 } },
      type: "value",
    },
    yAxis: {
      axisTick: { show: false },
      data: crossing.rows.map((row) => row.label),
      type: "category",
    },
    series: [
      pyramidSeries("Mulher", women, GENDER_COLORS.Woman, "left"),
      pyramidSeries("Homem", men, GENDER_COLORS.Man, "right", "right-gender"),
      pyramidSeries(
        "Não identificado",
        unknown,
        GENDER_COLORS.unknown,
        "right",
        "right-gender",
      ),
    ],
  } as EnterpriseChartOption;
}

function pyramidSeries(
  name: string,
  data: Array<{ count: number; value: number }>,
  color: string,
  labelPosition: "left" | "right",
  stack?: string,
) {
  return {
    barMaxWidth: 18,
    data,
    itemStyle: {
      borderRadius: labelPosition === "left" ? [4, 0, 0, 4] : [0, 4, 4, 0],
      color,
    },
    label: {
      color: "#526477",
      formatter: absolutePercentageLabel,
      fontSize: 9,
      position: labelPosition,
      show: true,
    },
    name,
    stack,
    type: "bar",
  };
}

function buildAgeEmotionHeatmapOption(
  summary: DemographicAggregation,
  theme: "light" | "dark" = "light",
): EnterpriseChartOption {
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
      decal: { show: true },
      description:
        "Mapa de calor com faixas etárias nas linhas, emoções nas colunas e percentual do total em cada célula.",
    },
    grid: { bottom: 62, containLabel: true, left: 8, right: 58, top: 10 },
    tooltip: {
      formatter: (parameters: unknown) =>
        heatmapTooltip(parameters, crossing.rows, crossing.columns),
      position: "top",
    },
    visualMap: {
      calculable: false,
      inRange: { color: HEATMAP_COLORS },
      max: maximum,
      min: 0,
      orient: "vertical",
      right: 0,
      text: ["%", ""],
      top: "middle",
    },
    xAxis: {
      axisLabel: { interval: 0, rotate: 38 },
      axisTick: { show: false },
      data: crossing.columns.map((column) => column.label),
      splitArea: { show: true },
      type: "category",
    },
    yAxis: {
      axisTick: { show: false },
      data: crossing.rows.map((row) => row.label),
      inverse: true,
      splitArea: { show: true },
      type: "category",
    },
    series: [
      {
        data,
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
          borderWidth: 1,
        },
        label: {
          formatter: (parameters: unknown) =>
            heatmapPercentageLabel(parameters, maximum),
          fontSize: 9,
          fontWeight: 700,
          rich: {
            dark: { color: "#101828", fontWeight: 700 },
            light: { color: "#F9FAFB", fontWeight: 700 },
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
}: {
  audience: string;
  rangeLabel: string;
  summary: DemographicAggregation;
  surface: DemographicsDashboardProps["surface"];
  timeZone: string;
}): ReportPayload {
  const genderLeader = leadingDistributionItem(summary.gender);
  const ageLeader = leadingDistributionItem(summary.age);
  const emotionLeader = leadingDistributionItem(summary.emotion);
  const charts: ReportChart[] = [
    {
      description: "Participação por gênero no total classificado.",
      option: buildGenderOption(summary),
      table: distributionReportTable("Gênero", summary.gender),
      title: "Composição por gênero",
    },
    {
      description: "Participação por faixa etária em ordem crescente.",
      option: buildAgeOption(summary, "#1267C4"),
      table: distributionReportTable("Faixas etárias", summary.age),
      title: "Distribuição por faixa etária",
    },
    {
      description: "Ranking das emoções classificadas.",
      option: buildEmotionOption(summary, "#7C3AED"),
      table: distributionReportTable("Emoções", summary.emotion),
      title: "Ranking de emoções",
    },
    {
      description: "Cruzamento entre faixa etária e gênero.",
      option: buildAgeGenderPyramidOption(summary),
      table: ageGenderReportTable(summary),
      title: "Pirâmide etária por gênero",
    },
    {
      description: "Cruzamento entre faixa etária e emoção.",
      option: buildAgeEmotionHeatmapOption(summary),
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

function pyramidTooltip(parameters: unknown) {
  const entries = Array.isArray(parameters) ? parameters : [parameters];
  const validEntries = entries.filter(isRecord);
  const age =
    validEntries.find((entry) => typeof entry.axisValueLabel === "string")
      ?.axisValueLabel ?? "Faixa etária";
  const lines = validEntries.map((entry) => {
    const data = isRecord(entry.data) ? entry.data : null;
    const name =
      typeof entry.seriesName === "string" ? entry.seriesName : "Categoria";
    const percentage = chartDataNumber(data, "value");
    const count = chartDataNumber(data, "count");
    return `${escapeTooltipHtml(name)}: ${
      percentage === null ? "—" : `${formatDecimal(Math.abs(percentage))}%`
    } · ${count === null ? "—" : formatNumber(count)} detecções`;
  });
  return `<strong>${escapeTooltipHtml(String(age))}</strong><br/>${lines.join("<br/>")}`;
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

function absoluteAxisPercentage(value: number) {
  return `${formatDecimal(Math.abs(value))}%`;
}

function percentageChartLabel(parameters: unknown) {
  const value = chartParameterNumber(parameters);
  return value === null ? "—" : `${formatDecimal(value)}%`;
}

function absolutePercentageLabel(parameters: unknown) {
  const value = chartParameterNumber(parameters);
  return value === null ? "—" : `${formatDecimal(Math.abs(value))}%`;
}

function heatmapPercentageLabel(parameters: unknown, maximum: number) {
  if (!isRecord(parameters) || !Array.isArray(parameters.value)) return "—";
  const value = Number(parameters.value[2]);
  if (!Number.isFinite(value) || value <= 0) return "";
  const contrastStyle = value / maximum >= 0.45 ? "light" : "dark";
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
