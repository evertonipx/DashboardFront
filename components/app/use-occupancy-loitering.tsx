"use client";

import * as React from "react";

import type { LayoutCard } from "@/components/app/card-layout";
import {
  OCCUPANCY_LOITERING_CARD_ID,
  OCCUPANCY_LOITERING_CARD_IDS,
  OCCUPANCY_DURATION_AVERAGE_CARD_ID,
  OCCUPANCY_LOITERING_MAXIMUM_CARD_ID,
  OCCUPANCY_LOITERING_MINIMUM_CARD_ID,
  OCCUPANCY_LOITERING_RANGE_CARD_ID,
  OCCUPANCY_LOITERING_SUMMARY_CARD_IDS,
  OCCUPANCY_LOITERING_SUMMARY_CONSUMER_CARD_IDS,
  OccupancyLoiteringRangeCard,
  OccupancyLoiteringSummaryCard,
  OccupancyLoiteringSummaryMetricCard,
  buildOccupancyLoiteringReport,
  buildOccupancyLoiteringRangeReport,
  buildOccupancyLoiteringSummaryMetricReport,
  type OccupancyLoiteringPeriod,
  type OccupancyLoiteringSummaryMetric,
} from "@/components/app/occupancy-loitering-widgets";
import {
  OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID,
  OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
  OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
  OCCUPANCY_LOITERING_TEMPORAL_LABELS,
  OccupancyLoiteringTemporalCard,
  buildOccupancyLoiteringTemporalReportChart,
  buildSharedOccupancyLoiteringTemporalModel,
  type OccupancyLoiteringTemporalCardId,
} from "@/components/app/occupancy-loitering-temporal-widgets";
import { startOfCompanyTimeZoneDay } from "@/lib/company-time-zone";
import {
  buildOccupancyLoiteringSummaryModel,
  selectOccupancyLoiteringSessions,
  summarizeOccupancyLoiteringSessions,
  type OccupancyLoiteringExpectedArea,
  type OccupancyLoiteringSessionRow,
  type OccupancyLoiteringSummaryModel,
  type OccupancyLoiteringSummaryRow,
} from "@/lib/occupancy-loitering";
import {
  fetchOccupancyLoiteringSessions,
  fetchOccupancyLoiteringSummary,
  initialOccupancyLoiteringSessionDay,
  occupancyLoiteringSessionsQueryRange,
} from "@/lib/occupancy-loitering-query";
import { ApiError } from "@/lib/api";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import type { ReportChart } from "@/lib/report-export";
import type { OccupancyScenario } from "@/lib/types";
import type {
  CardPreference,
  CardScenarioSelection,
} from "@/lib/view-preferences";
import { resolveWidgetScenarios } from "@/lib/widget-scenario-selection";

const LIVE_REFRESH_MS = 5_000;
const LIVE_SESSION_TAIL_MS = 5 * 60_000;
const LIVE_SESSION_FULL_RECONCILIATION_MS = 6 * 60 * 60_000;
const EMPTY_OCCUPANCY_SCENARIOS: OccupancyScenario[] = [];
const LOITERING_SESSION_CARD_IDS = [
  OCCUPANCY_LOITERING_CARD_ID,
  ...OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
] as const;
const LOITERING_DATA_CONSUMER_CARD_IDS = [
  ...OCCUPANCY_LOITERING_CARD_IDS,
  ...OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
  OCCUPANCY_DURATION_AVERAGE_CARD_ID,
] as const;
const LOITERING_SUMMARY_METRIC_CARDS = [
  {
    color: "#15803D",
    id: OCCUPANCY_LOITERING_MINIMUM_CARD_ID,
    label: "Menor permanência por área",
    metric: "minimum",
  },
  {
    color: "#C2410C",
    id: OCCUPANCY_LOITERING_MAXIMUM_CARD_ID,
    label: "Maior permanência por área",
    metric: "maximum",
  },
] as const satisfies readonly {
  color: string;
  id: (typeof OCCUPANCY_LOITERING_SUMMARY_CARD_IDS)[number];
  label: string;
  metric: OccupancyLoiteringSummaryMetric;
}[];

type OccupancyLoiteringRefreshMode = "manual" | "poll";

type OccupancyLoiteringDataset = {
  error?: string;
  loading: boolean;
  period: OccupancyLoiteringPeriod | null;
  rows: OccupancyLoiteringSummaryRow[];
  scopeKey: string;
};

type OccupancyLoiteringSessionDataset = {
  error?: string;
  loading: boolean;
  period: OccupancyLoiteringPeriod | null;
  previewPeriod: Pick<OccupancyLoiteringPeriod, "from" | "to"> | null;
  rows: OccupancyLoiteringSessionRow[];
  scopeKey: string;
  slicedByDay: boolean;
};

type OccupancyLoiteringLiveSessionCache = {
  from: number;
  lastSuccessfulTo: number;
  reconciledAt: number;
  rows: OccupancyLoiteringSessionRow[];
  scopeKey: string;
};

export type OccupancyLoiteringReportAsset = {
  cardId:
    | (typeof OCCUPANCY_LOITERING_CARD_IDS)[number]
    | OccupancyLoiteringTemporalCardId;
  chart: ReportChart;
  titleSuffix?: string;
};

type OccupancyLoiteringReportDataset = {
  period: OccupancyLoiteringPeriod;
  rows: OccupancyLoiteringSummaryRow[];
  slicedByDay: boolean;
};

type OccupancyLoiteringSessionReportDataset = {
  period: OccupancyLoiteringPeriod;
  rows: OccupancyLoiteringSessionRow[];
  slicedByDay: boolean;
};

type OccupancyLoiteringReportSummaryRequest = {
  key: string;
  promise: Promise<OccupancyLoiteringSummaryRow[]>;
  signal?: AbortSignal;
};

type OccupancyLoiteringReportPeriodRequest = {
  key: string;
  period: OccupancyLoiteringPeriod | null;
  signal: AbortSignal;
};

export function useOccupancyLoitering({
  companyScopeId,
  enabled,
  focusScenarioId,
  monitorMode,
  period,
  preferences,
  refreshMode = "poll",
  requestedCardIds,
  scenarios,
  timeZone,
  userId,
}: {
  companyScopeId: string;
  enabled: boolean;
  focusScenarioId: string;
  monitorMode: boolean;
  period?: OccupancyLoiteringPeriod | null;
  preferences: CardPreference[];
  refreshMode?: OccupancyLoiteringRefreshMode;
  requestedCardIds?: ReadonlySet<string>;
  scenarios: OccupancyScenario[];
  timeZone: string;
  userId?: string | null;
}) {
  const scopedScenarios = React.useMemo(
    () => scenarios.filter((scenario) => scenario.company_id === companyScopeId),
    [companyScopeId, scenarios],
  );
  const inheritedScenarios = React.useMemo(
    () => scopedScenarios.filter((scenario) => scenario.id === focusScenarioId),
    [focusScenarioId, scopedScenarios],
  );
  const preferenceById = React.useMemo(
    () => new Map(preferences.map((candidate) => [candidate.id, candidate])),
    [preferences],
  );
  const individualPreference = preferenceById.get(
    OCCUPANCY_LOITERING_CARD_ID,
  );
  const requestedScenariosByCard = React.useMemo(
    () =>
      new Map(
        LOITERING_DATA_CONSUMER_CARD_IDS.map((cardId) => {
          const consumerPreference = preferenceById.get(cardId);
          const requested =
            (!requestedCardIds || requestedCardIds.has(cardId)) &&
            consumerPreference?.visible === true;
          return [
            cardId,
            requested
              ? resolveWidgetScenarios(
                  scopedScenarios,
                  selectionFromPreference(consumerPreference),
                  inheritedScenarios,
                )
              : [],
          ] as const;
        }),
      ),
    [
      inheritedScenarios,
      preferenceById,
      requestedCardIds,
      scopedScenarios,
    ],
  );
  const sessionRequestedScenarios = React.useMemo(() => {
    const unique = new Map<string, OccupancyScenario>();
    LOITERING_SESSION_CARD_IDS.forEach((cardId) => {
      (requestedScenariosByCard.get(cardId) ?? EMPTY_OCCUPANCY_SCENARIOS)
        .forEach((scenario) => unique.set(scenario.id, scenario));
    });
    return Array.from(unique.values());
  }, [requestedScenariosByCard]);
  const summaryRequestedScenarios = React.useMemo(() => {
    const unique = new Map<string, OccupancyScenario>();
    OCCUPANCY_LOITERING_SUMMARY_CONSUMER_CARD_IDS.forEach((cardId) => {
      (requestedScenariosByCard.get(cardId) ?? EMPTY_OCCUPANCY_SCENARIOS)
        .forEach((scenario) => unique.set(scenario.id, scenario));
    });
    return Array.from(unique.values());
  }, [requestedScenariosByCard]);
  const reportNeedsSessions = React.useMemo(
    () =>
      LOITERING_SESSION_CARD_IDS.some((cardId) => {
        const cardPreference = preferenceById.get(cardId);
        if (cardPreference?.visible !== true) return false;
        return resolveWidgetScenarios(
          scopedScenarios,
          selectionFromPreference(cardPreference),
          inheritedScenarios,
        ).some((scenario) => scenario.areas.length > 0);
      }),
    [inheritedScenarios, preferenceById, scopedScenarios],
  );
  const reportNeedsSummary = React.useMemo(
    () =>
      OCCUPANCY_LOITERING_SUMMARY_CONSUMER_CARD_IDS.some((cardId) => {
        const cardPreference = preferenceById.get(cardId);
        if (cardPreference?.visible !== true) return false;
        return resolveWidgetScenarios(
          scopedScenarios,
          selectionFromPreference(cardPreference),
          inheritedScenarios,
        ).some((scenario) => scenario.areas.length > 0);
      }),
    [inheritedScenarios, preferenceById, scopedScenarios],
  );
  const expectedAreasKey = React.useMemo(
    () => occupancyLoiteringExpectedAreasKey(scopedScenarios),
    [scopedScenarios],
  );
  const expectedAreas = React.useMemo(
    () => occupancyLoiteringExpectedAreasFromKey(expectedAreasKey),
    [expectedAreasKey],
  );
  const manualPeriodKey = React.useMemo(
    () =>
      refreshMode === "manual" && period
        ? JSON.stringify([
            period.from.getTime(),
            period.to.getTime(),
            period.contextLabel,
          ])
        : "",
    [period, refreshMode],
  );
  const stableManualPeriod = React.useMemo(
    () => periodFromKey(manualPeriodKey),
    [manualPeriodKey],
  );
  const presentationTimeZone = React.useMemo(
    () => supportedPresentationTimeZone(timeZone),
    [timeZone],
  );
  const periodAvailable =
    refreshMode === "poll" || Boolean(stableManualPeriod);
  const summaryQueryEnabled =
    enabled &&
    Boolean(companyScopeId) &&
    summaryRequestedScenarios.some((scenario) => scenario.areas.length > 0) &&
    periodAvailable;
  const sessionQueryEnabled =
    enabled &&
    Boolean(companyScopeId) &&
    sessionRequestedScenarios.some((scenario) => scenario.areas.length > 0) &&
    periodAvailable;
  const scopeKey = React.useMemo(
    () =>
      JSON.stringify([
        userId ?? "",
        companyScopeId,
        timeZone,
        refreshMode,
        refreshMode === "manual" ? manualPeriodKey : "live",
        expectedAreasKey,
      ]),
    [
      companyScopeId,
      expectedAreasKey,
      manualPeriodKey,
      refreshMode,
      timeZone,
      userId,
    ],
  );
  const sessionScopeKey = React.useMemo(
    () =>
      JSON.stringify([
        userId ?? "",
        companyScopeId,
        timeZone,
        refreshMode,
        refreshMode === "manual" ? manualPeriodKey : "live",
      ]),
    [companyScopeId, manualPeriodKey, refreshMode, timeZone, userId],
  );
  const [dataset, setDataset] = React.useState<OccupancyLoiteringDataset>({
    loading: false,
    period: null,
    rows: [],
    scopeKey: "",
  });
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const handledRefreshVersionRef = React.useRef(0);
  const handledSessionRefreshVersionRef = React.useRef(0);
  const liveSessionCacheRef =
    React.useRef<OccupancyLoiteringLiveSessionCache | null>(null);
  const reportSummaryRequestRef =
    React.useRef<OccupancyLoiteringReportSummaryRequest | null>(null);
  const reportPeriodRequestRef =
    React.useRef<OccupancyLoiteringReportPeriodRequest | null>(null);
  const [sessionDataset, setSessionDataset] =
    React.useState<OccupancyLoiteringSessionDataset>({
      loading: false,
      period: null,
      previewPeriod: null,
      rows: [],
      scopeKey: "",
      slicedByDay: false,
    });
  const refresh = React.useCallback(
    () => setRefreshVersion((value) => value + 1),
    [],
  );

  React.useEffect(() => {
    if (!summaryQueryEnabled) return;
    const controller = new AbortController();
    let disposed = false;
    let completed = false;
    let running = false;
    let authorizationBlocked = false;
    let lastSuccessfulLivePeriod: { from: number; to: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearScheduledLoad() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    }

    function schedule(delayMs = LIVE_REFRESH_MS) {
      if (
        refreshMode === "poll" &&
        !authorizationBlocked &&
        !disposed &&
        !controller.signal.aborted &&
        navigator.onLine !== false &&
        document.visibilityState === "visible"
      ) {
        clearScheduledLoad();
        timer = setTimeout(() => {
          timer = undefined;
          void load();
        }, Math.max(250, Math.round(delayMs)));
      }
    }

    function scheduleAfterCycle(startedAt: number) {
      schedule(LIVE_REFRESH_MS - (Date.now() - startedAt));
    }

    async function load() {
      if (
        disposed ||
        controller.signal.aborted ||
        authorizationBlocked ||
        running ||
        (refreshMode === "manual" && completed)
      ) {
        return;
      }
      if (
        navigator.onLine === false ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      const cycleStartedAt = Date.now();
      let queryPeriod: OccupancyLoiteringPeriod | null;
      try {
        requireSupportedTimeZone(timeZone);
        queryPeriod =
          refreshMode === "manual"
            ? stableManualPeriod
            : liveLoiteringPeriod(new Date(), timeZone);
      } catch {
        if (disposed || controller.signal.aborted) return;
        setDataset({
          error: "Não foi possível determinar o período civil da empresa.",
          loading: false,
          period: null,
          rows: [],
          scopeKey,
        });
        return;
      }
      if (!queryPeriod) return;
      const refreshRequested =
        refreshVersion > handledRefreshVersionRef.current;
      if (
        refreshMode === "poll" &&
        !refreshRequested &&
        lastSuccessfulLivePeriod?.from === queryPeriod.from.getTime() &&
        queryPeriod.to.getTime() <= lastSuccessfulLivePeriod.to
      ) {
        scheduleAfterCycle(cycleStartedAt);
        return;
      }
      if (
        refreshMode === "poll" &&
        queryPeriod.to.getTime() <= queryPeriod.from.getTime()
      ) {
        setDataset({
          loading: false,
          period: queryPeriod,
          rows: [],
          scopeKey,
        });
        lastSuccessfulLivePeriod = {
          from: queryPeriod.from.getTime(),
          to: queryPeriod.to.getTime(),
        };
        scheduleAfterCycle(cycleStartedAt);
        return;
      }
      if (refreshRequested) {
        // Uma intenção de atualização é consumida somente quando uma consulta
        // realmente começa. Recriações futuras do efeito não transformam o
        // restante da sessão em reconciliações completas permanentes.
        handledRefreshVersionRef.current = refreshVersion;
      }
      running = true;
      const requestController = new AbortController();
      const abortCurrentRequest = () => abortRequest(requestController);
      controller.signal.addEventListener("abort", abortCurrentRequest, {
        once: true,
      });
      setDataset((current) => {
        const keepRows =
          current.scopeKey === scopeKey &&
          current.period?.from.getTime() === queryPeriod.from.getTime();
        return {
          // `loading: false` also certifies a successful empty response. Keep
          // that state during later reconciliation instead of flashing a
          // skeleton every five seconds when no session has ended yet.
          loading: keepRows ? current.loading : true,
          period: queryPeriod,
          rows: keepRows ? current.rows : [],
          scopeKey,
        };
      });
      try {
        const rows = await fetchOccupancyLoiteringSummary({
          bypassCache: refreshRequested,
          companyScopeId,
          expectedAreas,
          from: queryPeriod.from,
          live: refreshMode === "poll",
          signal: requestController.signal,
          timeZone,
          to: queryPeriod.to,
        });
        if (disposed || controller.signal.aborted) return;
        if (refreshMode === "poll") {
          lastSuccessfulLivePeriod = {
            from: queryPeriod.from.getTime(),
            to: queryPeriod.to.getTime(),
          };
        }
        setDataset({
          loading: false,
          period: queryPeriod,
          rows,
          scopeKey,
        });
        completed = true;
      } catch (error: unknown) {
        if (disposed || isAbortError(error, controller.signal)) return;
        const authorizationFailed =
          isAuthorizationFailure(error);
        authorizationBlocked = authorizationFailed;
        setDataset((current) => ({
          error: "Não foi possível carregar o resumo de permanência neste período.",
          loading: false,
          period: queryPeriod,
          rows:
            !authorizationFailed && current.scopeKey === scopeKey
              ? current.rows
              : [],
          scopeKey,
        }));
        completed = true;
      } finally {
        controller.signal.removeEventListener("abort", abortCurrentRequest);
        running = false;
        scheduleAfterCycle(cycleStartedAt);
      }
    }

    function handleAvailabilityChange() {
      if (disposed) return;
      if (authorizationBlocked) return;
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        clearScheduledLoad();
        return;
      }
      if (running) return;
      clearScheduledLoad();
      void load();
    }

    void load();
    document.addEventListener("visibilitychange", handleAvailabilityChange);
    window.addEventListener("offline", handleAvailabilityChange);
    window.addEventListener("online", handleAvailabilityChange);
    return () => {
      disposed = true;
      clearScheduledLoad();
      document.removeEventListener("visibilitychange", handleAvailabilityChange);
      window.removeEventListener("offline", handleAvailabilityChange);
      window.removeEventListener("online", handleAvailabilityChange);
      abortRequest(controller);
    };
  }, [
    companyScopeId,
    expectedAreas,
    summaryQueryEnabled,
    refreshMode,
    refreshVersion,
    scopeKey,
    stableManualPeriod,
    timeZone,
  ]);

  React.useEffect(() => {
    if (!sessionQueryEnabled) return;
    const controller = new AbortController();
    let disposed = false;
    let completed = false;
    let running = false;
    let authorizationBlocked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearScheduledLoad() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    }

    function schedule(delayMs = LIVE_REFRESH_MS) {
      if (
        refreshMode === "poll" &&
        !authorizationBlocked &&
        !disposed &&
        !controller.signal.aborted &&
        navigator.onLine !== false &&
        document.visibilityState === "visible"
      ) {
        clearScheduledLoad();
        timer = setTimeout(() => {
          timer = undefined;
          void load();
        }, Math.max(250, Math.round(delayMs)));
      }
    }

    function scheduleAfterCycle(startedAt: number) {
      schedule(LIVE_REFRESH_MS - (Date.now() - startedAt));
    }

    async function load() {
      if (
        disposed ||
        controller.signal.aborted ||
        authorizationBlocked ||
        running ||
        (refreshMode === "manual" && completed)
      ) {
        return;
      }
      if (
        navigator.onLine === false ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const cycleStartedAt = Date.now();
      let queryPeriod: OccupancyLoiteringPeriod | null;
      try {
        requireSupportedTimeZone(timeZone);
        queryPeriod =
          refreshMode === "manual"
            ? stableManualPeriod
            : liveLoiteringPeriod(new Date(), timeZone);
      } catch {
        if (disposed || controller.signal.aborted) return;
        setSessionDataset({
          error: "Não foi possível determinar o período civil da empresa.",
          loading: false,
          period: null,
          previewPeriod: null,
          rows: [],
          scopeKey: sessionScopeKey,
          slicedByDay: false,
        });
        return;
      }
      if (!queryPeriod) return;
      const sessionRequestRange =
        refreshMode === "manual"
          ? occupancyLoiteringSessionsQueryRange({
              dayStart: initialOccupancyLoiteringSessionDay({
                from: queryPeriod.from,
                timeZone,
                to: queryPeriod.to,
              }),
              from: queryPeriod.from,
              timeZone,
              to: queryPeriod.to,
            })
          : {
              from: queryPeriod.from,
              slicedByDay: false,
              to: queryPeriod.to,
            };
      if (!sessionRequestRange) return;

      const refreshRequested =
        refreshVersion > handledSessionRefreshVersionRef.current;
      const liveCache =
        liveSessionCacheRef.current?.scopeKey === sessionScopeKey &&
        liveSessionCacheRef.current.from === queryPeriod.from.getTime()
          ? liveSessionCacheRef.current
          : null;
      if (
        refreshMode === "poll" &&
        !refreshRequested &&
        queryPeriod.to.getTime() <=
          (liveCache?.lastSuccessfulTo ?? Number.NEGATIVE_INFINITY)
      ) {
        setSessionDataset({
          loading: false,
          period: queryPeriod,
          previewPeriod: sessionRequestRange,
          rows: liveCache?.rows ?? [],
          scopeKey: sessionScopeKey,
          slicedByDay: sessionRequestRange.slicedByDay,
        });
        scheduleAfterCycle(cycleStartedAt);
        return;
      }
      if (queryPeriod.to.getTime() <= queryPeriod.from.getTime()) {
        setSessionDataset({
          loading: false,
          period: queryPeriod,
          previewPeriod: sessionRequestRange,
          rows: [],
          scopeKey: sessionScopeKey,
          slicedByDay: sessionRequestRange.slicedByDay,
        });
        scheduleAfterCycle(cycleStartedAt);
        return;
      }
      if (refreshRequested) {
        handledSessionRefreshVersionRef.current = refreshVersion;
      }

      running = true;
      const requestController = new AbortController();
      const abortCurrentRequest = () => abortRequest(requestController);
      controller.signal.addEventListener("abort", abortCurrentRequest, {
        once: true,
      });
      setSessionDataset((current) => {
        const keepRows =
          current.scopeKey === sessionScopeKey &&
          current.previewPeriod?.from.getTime() ===
            sessionRequestRange.from.getTime() &&
          (refreshMode === "poll" ||
            current.previewPeriod?.to.getTime() ===
              sessionRequestRange.to.getTime());
        return {
          loading: keepRows ? current.loading : true,
          period: queryPeriod,
          previewPeriod: sessionRequestRange,
          rows: keepRows ? current.rows : [],
          scopeKey: sessionScopeKey,
          slicedByDay: sessionRequestRange.slicedByDay,
        };
      });

      try {
        const fullReconciliation =
          refreshMode === "manual" ||
          !liveCache ||
          refreshRequested ||
          queryPeriod.to.getTime() - liveCache.reconciledAt >=
            LIVE_SESSION_FULL_RECONCILIATION_MS;
        const requestFrom = fullReconciliation
          ? sessionRequestRange.from
          : new Date(
              Math.max(
                sessionRequestRange.from.getTime(),
                sessionRequestRange.to.getTime() - LIVE_SESSION_TAIL_MS,
              ),
            );
        const fetchedRows = await fetchOccupancyLoiteringSessions({
          bypassCache: refreshRequested,
          companyScopeId,
          expectedAreas,
          from: requestFrom,
          signal: requestController.signal,
          timeZone,
          to: sessionRequestRange.to,
        });
        const rows = fullReconciliation
          ? fetchedRows
          : [
              ...liveCache.rows.filter(
                (row) => Date.parse(row.ended_at) < requestFrom.getTime(),
              ),
              ...fetchedRows,
            ];
        if (disposed || controller.signal.aborted) return;
        if (refreshMode === "poll") {
          liveSessionCacheRef.current = {
            from: queryPeriod.from.getTime(),
            lastSuccessfulTo: queryPeriod.to.getTime(),
            reconciledAt: fullReconciliation
              ? queryPeriod.to.getTime()
              : liveCache.reconciledAt,
            rows,
            scopeKey: sessionScopeKey,
          };
        }
        setSessionDataset({
          loading: false,
          period: queryPeriod,
          previewPeriod: sessionRequestRange,
          rows,
          scopeKey: sessionScopeKey,
          slicedByDay: sessionRequestRange.slicedByDay,
        });
        completed = true;
      } catch (error: unknown) {
        if (disposed || isAbortError(error, controller.signal)) return;
        const authorizationFailed = isAuthorizationFailure(error);
        authorizationBlocked = authorizationFailed;
        if (
          authorizationFailed &&
          liveSessionCacheRef.current?.scopeKey === sessionScopeKey
        ) {
          liveSessionCacheRef.current = null;
        }
        setSessionDataset((current) => ({
          error: "Não foi possível carregar as permanências neste período.",
          loading: false,
          period: queryPeriod,
          previewPeriod: sessionRequestRange,
          rows:
            !authorizationFailed && current.scopeKey === sessionScopeKey
              ? current.rows
              : [],
          scopeKey: sessionScopeKey,
          slicedByDay: sessionRequestRange.slicedByDay,
        }));
        completed = true;
      } finally {
        controller.signal.removeEventListener("abort", abortCurrentRequest);
        running = false;
        scheduleAfterCycle(cycleStartedAt);
      }
    }

    function handleAvailabilityChange() {
      if (disposed || authorizationBlocked) return;
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false
      ) {
        clearScheduledLoad();
        return;
      }
      if (running) return;
      clearScheduledLoad();
      void load();
    }

    void load();
    document.addEventListener("visibilitychange", handleAvailabilityChange);
    window.addEventListener("offline", handleAvailabilityChange);
    window.addEventListener("online", handleAvailabilityChange);
    return () => {
      disposed = true;
      clearScheduledLoad();
      document.removeEventListener("visibilitychange", handleAvailabilityChange);
      window.removeEventListener("offline", handleAvailabilityChange);
      window.removeEventListener("online", handleAvailabilityChange);
      abortRequest(controller);
    };
  }, [
    companyScopeId,
    expectedAreas,
    refreshMode,
    refreshVersion,
    sessionQueryEnabled,
    sessionScopeKey,
    stableManualPeriod,
    timeZone,
  ]);

  const current = React.useMemo<OccupancyLoiteringDataset>(
    () =>
      dataset.scopeKey === scopeKey
        ? dataset
        : {
            loading: summaryQueryEnabled,
            period: stableManualPeriod,
            rows: [],
            scopeKey,
          },
    [dataset, scopeKey, stableManualPeriod, summaryQueryEnabled],
  );
  const currentSessions = React.useMemo<OccupancyLoiteringSessionDataset>(
    () =>
      sessionDataset.scopeKey === sessionScopeKey
        ? sessionDataset
        : {
            loading: sessionQueryEnabled,
            period: stableManualPeriod,
            previewPeriod: stableManualPeriod,
            rows: [],
            scopeKey: sessionScopeKey,
            slicedByDay: false,
          },
    [
      sessionDataset,
      sessionQueryEnabled,
      sessionScopeKey,
      stableManualPeriod,
    ],
  );
  const emptyModel = React.useMemo(
    () => buildOccupancyLoiteringSummaryModel([], []),
    [],
  );
  const sessionSummaryRows = React.useMemo(
    () => summarizeOccupancyLoiteringSessions(currentSessions.rows),
    [currentSessions.rows],
  );
  const resolveSummaryModel = React.useCallback(
    (selection: CardScenarioSelection): OccupancyLoiteringSummaryModel => {
      const selected = resolveWidgetScenarios(
        scopedScenarios,
        selection,
        inheritedScenarios,
      );
      return selected.length
        ? buildOccupancyLoiteringSummaryModel(selected, current.rows)
        : emptyModel;
    },
    [current.rows, emptyModel, inheritedScenarios, scopedScenarios],
  );
  const resolveIndividualModel = React.useCallback(
    (selection: CardScenarioSelection): OccupancyLoiteringSummaryModel => {
      const selected = resolveWidgetScenarios(
        scopedScenarios,
        selection,
        inheritedScenarios,
      );
      return selected.length
        ? buildOccupancyLoiteringSummaryModel(selected, sessionSummaryRows)
        : emptyModel;
    },
    [
      emptyModel,
      inheritedScenarios,
      scopedScenarios,
      sessionSummaryRows,
    ],
  );
  const resolveIndividualSessions = React.useCallback(
    (selection: CardScenarioSelection): OccupancyLoiteringSessionRow[] => {
      const selected = resolveWidgetScenarios(
        scopedScenarios,
        selection,
        inheritedScenarios,
      );
      return selected.length
        ? selectOccupancyLoiteringSessions(selected, currentSessions.rows)
        : [];
    },
    [
      currentSessions.rows,
      inheritedScenarios,
      scopedScenarios,
    ],
  );
  const individualError = currentSessions.error;
  const individualLoading = currentSessions.loading;
  const fallbackPeriod = React.useMemo(
    () =>
      currentSessions.period ??
      current.period ??
      stableManualPeriod ??
      liveLoiteringPeriod(new Date(), presentationTimeZone),
    [
      current.period,
      currentSessions.period,
      presentationTimeZone,
      stableManualPeriod,
    ],
  );
  const cards = React.useMemo<LayoutCard[]>(
    () => {
      const inheritedScenarioIds = inheritedScenarios.map(
        (scenario) => scenario.id,
      );
      const inheritedScenarioLabel =
        inheritedScenarios[0]?.name ?? "Cenário da tela";
      const individualCard: LayoutCard = {
        colorEditable: true,
        colorPreview: "solid",
        defaultHeightLevel: 4,
        defaultSize: "wide",
        defaultWidthLevel: 3,
        id: OCCUPANCY_LOITERING_CARD_ID,
        inheritedScenarioIds,
        inheritedScenarioLabel,
        label: "Permanências registradas",
        previewKind: "chart",
        scenarioConfigurable: true,
        scenarioOrderingDisabled: true,
        scenarioSelectionPolicy: "compare",
        titleEditable: true,
        zoomEnabled: true,
        node: ({ scenarioSelection }) => (
          <OccupancyLoiteringSummaryCard
            companyScopeId={companyScopeId}
            error={individualError}
            loading={individualLoading}
            model={resolveIndividualModel(scenarioSelection)}
            monitorMode={monitorMode}
            period={fallbackPeriod}
            previewPeriod={currentSessions.previewPeriod}
            sessions={resolveIndividualSessions(scenarioSelection)}
            sessionsSlicedByDay={currentSessions.slicedByDay}
            timeZone={presentationTimeZone}
          />
        ),
      };
      const metricCards = LOITERING_SUMMARY_METRIC_CARDS.map<LayoutCard>(
        ({ color, id, label, metric }) => ({
          colorEditable: true,
          colorPreview: "solid",
          defaultHeightLevel: 4,
          defaultSize: "wide",
          defaultWidthLevel: 3,
          id,
          inheritedScenarioIds,
          inheritedScenarioLabel,
          label,
          previewColors: [color],
          previewKind: "ranking",
          previewOrientation: "horizontal",
          scenarioConfigurable: true,
          scenarioOrderingDisabled: true,
          scenarioSelectionPolicy: "compare",
          titleEditable: true,
          zoomEnabled: true,
          node: ({ scenarioSelection }) => (
            <OccupancyLoiteringSummaryMetricCard
              error={current.error}
              loading={current.loading}
              metric={metric}
              model={resolveSummaryModel(scenarioSelection)}
              monitorMode={monitorMode}
            />
          ),
        }),
      );
      const rangeCard: LayoutCard = {
        colorEditable: true,
        colorPreview: "solid",
        defaultHeightLevel: 4,
        defaultSize: "wide",
        defaultWidthLevel: 3,
        id: OCCUPANCY_LOITERING_RANGE_CARD_ID,
        inheritedScenarioIds,
        inheritedScenarioLabel,
        label: "Faixa de permanência por área",
        previewColors: ["#1267C4"],
        previewKind: "chart",
        scenarioConfigurable: true,
        scenarioOrderingDisabled: true,
        scenarioSelectionPolicy: "compare",
        titleEditable: true,
        zoomEnabled: true,
        node: ({ scenarioSelection }) => (
          <OccupancyLoiteringRangeCard
            error={current.error}
            loading={current.loading}
            model={resolveSummaryModel(scenarioSelection)}
            monitorMode={monitorMode}
          />
        ),
      };
      const temporalCards = OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS.map<LayoutCard>(
        (cardId) => ({
          colorEditable: true,
          colorPreview: "solid",
          defaultHeightLevel: 4,
          defaultSize: "wide",
          defaultWidthLevel: 3,
          id: cardId,
          inheritedScenarioIds,
          inheritedScenarioLabel,
          label: OCCUPANCY_LOITERING_TEMPORAL_LABELS[cardId],
          previewKind:
            cardId === OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID
              ? "heatmap"
              : cardId === OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID
                ? "ranking"
                : "chart",
          scenarioConfigurable: true,
          scenarioOrderingDisabled: true,
          scenarioSelectionPolicy: "compare",
          titleEditable: true,
          zoomEnabled: true,
          node: ({ scenarioSelection }) => (
            <OccupancyLoiteringTemporalCard
              dataPeriod={currentSessions.previewPeriod ?? undefined}
              error={individualError}
              kind={cardId}
              loading={individualLoading}
              model={resolveIndividualModel(scenarioSelection)}
              monitorMode={monitorMode}
              period={fallbackPeriod}
              sessions={currentSessions.rows}
              sessionsSlicedByDay={currentSessions.slicedByDay}
              timeZone={presentationTimeZone}
            />
          ),
        }),
      );
      return [
        individualCard,
        ...metricCards,
        rangeCard,
        ...temporalCards,
      ];
    },
    [
      companyScopeId,
      current.error,
      current.loading,
      currentSessions.previewPeriod,
      currentSessions.rows,
      currentSessions.slicedByDay,
      fallbackPeriod,
      inheritedScenarios,
      individualError,
      individualLoading,
      monitorMode,
      presentationTimeZone,
      resolveIndividualModel,
      resolveIndividualSessions,
      resolveSummaryModel,
    ],
  );

  const buildReportAssets = React.useCallback(
    ({
      reportPeriod,
      sessions: sessionReportDataset,
      summary: summaryReportDataset,
    }: {
      reportPeriod: OccupancyLoiteringPeriod;
      sessions: OccupancyLoiteringSessionReportDataset;
      summary: OccupancyLoiteringReportDataset;
    }): OccupancyLoiteringReportAsset[] => {
      const assets: OccupancyLoiteringReportAsset[] = [];
      const sessionSummaryRows = summarizeOccupancyLoiteringSessions(
        sessionReportDataset.rows,
      );
      const resolveReportModel = (
        selection: CardScenarioSelection,
        rows: readonly OccupancyLoiteringSummaryRow[],
      ) => {
        const selected = resolveWidgetScenarios(
          scopedScenarios,
          selection,
          inheritedScenarios,
        );
        return selected.length
          ? buildOccupancyLoiteringSummaryModel(selected, rows)
          : emptyModel;
      };
      const sessionDataContextLabel = loiteringReportDataContextLabel(
        reportPeriod,
        sessionReportDataset.period,
        sessionReportDataset.slicedByDay,
        presentationTimeZone,
      );
      const summaryDataContextLabel = loiteringReportDataContextLabel(
        reportPeriod,
        summaryReportDataset.period,
        summaryReportDataset.slicedByDay,
        presentationTimeZone,
      );
      const sessionTitleSuffix = sessionReportDataset.slicedByDay
        ? ` · prévia de ${sessionDataContextLabel}`
        : undefined;
      const summaryTitleSuffix = summaryReportDataset.slicedByDay
        ? ` · prévia de ${summaryDataContextLabel}`
        : undefined;
      if (individualPreference?.visible !== false) {
        const selection = selectionFromPreference(individualPreference);
        const selected = resolveWidgetScenarios(
          scopedScenarios,
          selection,
          inheritedScenarios,
        );
        const model = resolveReportModel(selection, sessionSummaryRows);
        const sessions = selected.length
          ? selectOccupancyLoiteringSessions(
              selected,
              sessionReportDataset.rows,
            )
          : [];
        const chart = buildOccupancyLoiteringReport(
          model,
          sessions,
          sessionDataContextLabel,
          presentationTimeZone,
          individualPreference?.color,
        );
        if (chart) {
          assets.push({
            cardId: OCCUPANCY_LOITERING_CARD_ID,
            chart,
            titleSuffix: sessionTitleSuffix,
          });
        }
      }
      LOITERING_SUMMARY_METRIC_CARDS.forEach(({ id, metric }) => {
        const cardPreference = preferenceById.get(id);
        if (cardPreference?.visible === false) return;
        const model = resolveReportModel(
          selectionFromPreference(cardPreference),
          summaryReportDataset.rows,
        );
        const chart = buildOccupancyLoiteringSummaryMetricReport(
          model,
          summaryDataContextLabel,
          metric,
          cardPreference?.color,
        );
        if (chart) {
          assets.push({ cardId: id, chart, titleSuffix: summaryTitleSuffix });
        }
      });
      const rangePreference = preferenceById.get(
        OCCUPANCY_LOITERING_RANGE_CARD_ID,
      );
      if (rangePreference?.visible !== false) {
        const model = resolveReportModel(
          selectionFromPreference(rangePreference),
          summaryReportDataset.rows,
        );
        const chart = buildOccupancyLoiteringRangeReport(
          model,
          summaryDataContextLabel,
          rangePreference?.color,
        );
        if (chart) {
          assets.push({
            cardId: OCCUPANCY_LOITERING_RANGE_CARD_ID,
            chart,
            titleSuffix: summaryTitleSuffix,
          });
        }
      }
      OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS.forEach((cardId) => {
        const cardPreference = preferenceById.get(cardId);
        if (cardPreference?.visible === false) return;
        const summaryModel = resolveReportModel(
          selectionFromPreference(cardPreference),
          sessionSummaryRows,
        );
        const temporalModel = buildSharedOccupancyLoiteringTemporalModel({
          dataPeriod: sessionReportDataset.period,
          model: summaryModel,
          period: reportPeriod,
          sessions: sessionReportDataset.rows,
          timeZone: presentationTimeZone,
        });
        const chart = buildOccupancyLoiteringTemporalReportChart({
          contextLabel: reportPeriod.contextLabel,
          dataContextLabel: sessionDataContextLabel,
          kind: cardId,
          model: temporalModel,
          sessionsSlicedByDay: sessionReportDataset.slicedByDay,
          timeZone: presentationTimeZone,
          widgetColor: cardPreference?.color,
        });
        if (chart) {
          assets.push({
            cardId,
            chart,
            titleSuffix: sessionTitleSuffix,
          });
        }
      });
      return assets;
    },
    [
      emptyModel,
      inheritedScenarios,
      individualPreference,
      preferenceById,
      presentationTimeZone,
      scopedScenarios,
    ],
  );
  const getReportAssets = React.useCallback(
    (): OccupancyLoiteringReportAsset[] => {
      const reportPeriod = currentSessions.period ?? current.period;
      if (!reportPeriod) return [];
      return buildReportAssets({
        reportPeriod,
        sessions: {
          period: currentSessions.previewPeriod
            ? {
                contextLabel: reportPeriod.contextLabel,
                from: currentSessions.previewPeriod.from,
                to: currentSessions.previewPeriod.to,
              }
            : reportPeriod,
          rows: currentSessions.rows,
          slicedByDay: currentSessions.slicedByDay,
        },
        summary: {
          period: reportPeriod,
          rows: current.rows,
          slicedByDay: false,
        },
      });
    },
    [
      buildReportAssets,
      current.period,
      current.rows,
      currentSessions.period,
      currentSessions.previewPeriod,
      currentSessions.rows,
      currentSessions.slicedByDay,
    ],
  );
  const resolveReportPeriod = React.useCallback(
    (signal?: AbortSignal) => {
      const key = JSON.stringify([
        companyScopeId,
        timeZone,
        refreshMode,
        refreshMode === "manual" ? manualPeriodKey : "live",
      ]);
      const shared = reportPeriodRequestRef.current;
      if (signal && shared?.signal === signal && shared.key === key) {
        return shared.period;
      }
      const period =
        refreshMode === "manual"
          ? stableManualPeriod
          : liveLoiteringPeriod(new Date(), timeZone);
      if (signal) {
        reportPeriodRequestRef.current = { key, period, signal };
      }
      return period;
    },
    [
      companyScopeId,
      manualPeriodKey,
      refreshMode,
      stableManualPeriod,
      timeZone,
    ],
  );
  const loadReportSummaryRows = React.useCallback(
    (signal?: AbortSignal): Promise<OccupancyLoiteringSummaryRow[]> => {
      signal?.throwIfAborted();
      if (!reportNeedsSummary) return Promise.resolve([]);
      requireSupportedTimeZone(timeZone);
      if (!companyScopeId) {
        return Promise.reject(
          new Error(
            "A empresa do relatório de permanência não está disponível.",
          ),
        );
      }
      const reportPeriod = resolveReportPeriod(signal);
      if (!reportPeriod) {
        return Promise.reject(
          new Error(
            "O período do relatório de permanência não está disponível.",
          ),
        );
      }
      const key = JSON.stringify([
        companyScopeId,
        timeZone,
        reportPeriod.from.getTime(),
        reportPeriod.to.getTime(),
        expectedAreasKey,
      ]);
      const pending = reportSummaryRequestRef.current;
      if (pending && pending.signal === signal && pending.key === key) {
        return pending.promise;
      }

      const promise = (async () => {
        return fetchOccupancyLoiteringSummary({
          bypassCache: true,
          companyScopeId,
          expectedAreas,
          from: reportPeriod.from,
          signal,
          timeZone,
          to: reportPeriod.to,
        });
      })();
      reportSummaryRequestRef.current = { key, promise, signal };
      void promise.then(
        () => {
          if (reportSummaryRequestRef.current?.promise === promise) {
            reportSummaryRequestRef.current = null;
          }
        },
        () => {
          if (reportSummaryRequestRef.current?.promise === promise) {
            reportSummaryRequestRef.current = null;
          }
        },
      );
      return promise;
    },
    [
      companyScopeId,
      expectedAreas,
      expectedAreasKey,
      reportNeedsSummary,
      resolveReportPeriod,
      timeZone,
    ],
  );
  const loadReportAssets = React.useCallback(
    async (signal?: AbortSignal): Promise<OccupancyLoiteringReportAsset[]> => {
      signal?.throwIfAborted();
      if (!reportNeedsSessions && !reportNeedsSummary) return [];
      requireSupportedTimeZone(timeZone);
      if (!companyScopeId) {
        throw new Error("A empresa do relatório de permanência não está disponível.");
      }
      const reportPeriod = resolveReportPeriod(signal);
      if (!reportPeriod) {
        throw new Error("O período do relatório de permanência não está disponível.");
      }
      const queryRange = occupancyLoiteringSessionsQueryRange({
        dayStart: initialOccupancyLoiteringSessionDay({
          from: reportPeriod.from,
          timeZone,
          to: reportPeriod.to,
        }),
        from: reportPeriod.from,
        timeZone,
        to: reportPeriod.to,
      });
      if (!queryRange) {
        throw new Error("O período do relatório de permanência é inválido.");
      }

      const [sessionRows, summaryRows] = await Promise.all([
        reportNeedsSessions
          ? fetchOccupancyLoiteringSessions({
              bypassCache: true,
              companyScopeId,
              expectedAreas,
              from: queryRange.from,
              signal,
              timeZone,
              to: queryRange.to,
            })
          : Promise.resolve([] as OccupancyLoiteringSessionRow[]),
        reportNeedsSummary
          ? loadReportSummaryRows(signal)
          : Promise.resolve([] as OccupancyLoiteringSummaryRow[]),
      ]);
      signal?.throwIfAborted();

      const dataPeriod: OccupancyLoiteringPeriod = {
        contextLabel: reportPeriod.contextLabel,
        from: queryRange.from,
        to: queryRange.to,
      };
      return buildReportAssets({
        reportPeriod,
        sessions: {
          period: dataPeriod,
          rows: sessionRows,
          slicedByDay: queryRange.slicedByDay,
        },
        summary: {
          period: reportPeriod,
          rows: summaryRows,
          slicedByDay: false,
        },
      });
    },
    [
      buildReportAssets,
      companyScopeId,
      expectedAreas,
      loadReportSummaryRows,
      reportNeedsSessions,
      reportNeedsSummary,
      resolveReportPeriod,
      timeZone,
    ],
  );
  const reportAssets = React.useMemo(
    () => (refreshMode === "manual" ? getReportAssets() : []),
    [getReportAssets, refreshMode],
  );

  return {
    cards,
    error: current.error ?? currentSessions.error,
    getReportAssets,
    loadReportAssets,
    loadReportSummaryRows,
    loading:
      (summaryQueryEnabled && current.loading) ||
      (sessionQueryEnabled && currentSessions.loading),
    refresh,
    reportAssets,
    summaryError: current.error,
    summaryLoading: summaryQueryEnabled && current.loading,
    summaryRows: current.rows,
  };
}

function liveLoiteringPeriod(now: Date, timeZone: string): OccupancyLoiteringPeriod {
  const refreshCutoff = new Date(
    Math.floor(now.getTime() / LIVE_REFRESH_MS) * LIVE_REFRESH_MS,
  );
  return {
    contextLabel: "hoje até agora",
    from: startOfCompanyTimeZoneDay(now, timeZone),
    to: refreshCutoff,
  };
}

function loiteringReportDataContextLabel(
  reportPeriod: OccupancyLoiteringPeriod,
  dataPeriod: OccupancyLoiteringPeriod,
  slicedByDay: boolean,
  timeZone: string,
) {
  return slicedByDay
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeZone,
      }).format(dataPeriod.from)
    : reportPeriod.contextLabel;
}

function periodFromKey(key: string): OccupancyLoiteringPeriod | null {
  if (!key) return null;
  const [from, to, contextLabel] = JSON.parse(key) as [number, number, string];
  return { contextLabel, from: new Date(from), to: new Date(to) };
}

function supportedPresentationTimeZone(timeZone: string) {
  try {
    requireSupportedTimeZone(timeZone);
    return timeZone;
  } catch {
    // Consultas nunca usam este fallback. Ele serve apenas para que o estado
    // de erro permaneça renderizável enquanto o fuso configurado é corrigido.
    return "UTC";
  }
}

function requireSupportedTimeZone(timeZone: string) {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
}

function selectionFromPreference(
  preference?: CardPreference,
): CardScenarioSelection {
  return {
    mode: preference?.scenarioSelectionMode ?? "inherit",
    scenarioOrder: preference?.scenarioOrder ?? [],
    scenarioIds: preference?.scenarioIds ?? [],
  };
}

function occupancyLoiteringExpectedAreasKey(
  scenarios: readonly OccupancyScenario[],
) {
  const areas = new Map<string, [string, string, string]>();
  scenarios.forEach((scenario) => {
    scenario.areas.forEach((area) => {
      const identity: [string, string, string] = [
        area.camera_id,
        area.area_id,
        scenario.object_class,
      ];
      areas.set(JSON.stringify(identity), identity);
    });
  });
  return JSON.stringify(
    Array.from(areas.values()).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  );
}

function occupancyLoiteringExpectedAreasFromKey(
  key: string,
): OccupancyLoiteringExpectedArea[] {
  return (JSON.parse(key) as [string, string, string][]).map(
    ([cameraId, area, objectClass]) => ({ area, cameraId, objectClass }),
  );
}

function isAuthorizationFailure(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  );
}
