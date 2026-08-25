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
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import {
  useOccupancyComparisonCards,
} from "@/components/app/occupancy-comparison-widgets";
import { OccupancyBlockingState } from "@/components/app/occupancy-blocking-state";
import { OccupancyPaletteSelect } from "@/components/app/occupancy-palette-select";
import { useAuth } from "@/components/app/auth-provider";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { WidgetCardActions } from "@/components/app/widget-card-actions";
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
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import { requireCertifiedRuntimeCompanyTimeZone } from "@/lib/company-time-zone";
import { ensureGraphicContrast } from "@/lib/occupancy-hex-palette";
import {
  DEFAULT_OCCUPANCY_TREND_SERIES,
  deleteOccupancyCustomWidget,
  loadOccupancyCustomWidgets,
  OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertOccupancyCustomWidget,
  type OccupancyCustomMetric,
  type OccupancyCustomWidget,
  type OccupancyCustomWidgetGranularity,
  type OccupancyTrendSeries,
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
  requireOccupancyAlertRows,
  requireOccupancyHistoryResponse,
  requireOccupancyScenarioRows,
} from "@/lib/occupancy-validation";
import { canManageOccupancy } from "@/lib/permissions";
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
} from "@/lib/view-preferences";
import { cn, formatDateTime, formatNumber, formatTime } from "@/lib/utils";

type LoadOptions = {
  force?: boolean;
  silent?: boolean;
};

type OccupancyChartDefinition = {
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

type OccupancyCustomWidgetForm = {
  granularity: OccupancyCustomWidgetGranularity;
  id?: string;
  kind: "metric" | "trend";
  metric: OccupancyCustomMetric;
  series: OccupancyTrendSeries;
  title: string;
};

type OccupancyDashboardSettingsState = {
  scopeKey: string;
  value: OccupancyDashboardSettings;
};

const DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM: OccupancyCustomWidgetForm = {
  granularity: "hour",
  kind: "metric",
  metric: "current",
  series: DEFAULT_OCCUPANCY_TREND_SERIES,
  title: "Ocupação atual",
};

const OCCUPANCY_CUSTOM_METRIC_OPTIONS: Array<{
  label: string;
  value: OccupancyCustomMetric;
}> = [
  { label: "Ocupação atual", value: "current" },
  { label: "Média de hoje", value: "average" },
  { label: "Mínimo de hoje", value: "minimum" },
  { label: "Máximo de hoje", value: "peak" },
  { label: "Alertas recentes", value: "alerts" },
  { label: "Áreas ocupadas", value: "active_areas" },
  { label: "Utilização da capacidade", value: "utilization" },
];

const OCCUPANCY_GRANULARITY_OPTIONS: Array<{
  label: string;
  value: OccupancyCustomWidgetGranularity;
}> = [
  { label: "Últimos 60 minutos", value: "minute" },
  { label: "Hoje por hora", value: "hour" },
  { label: "Últimos 7 dias", value: "day" },
  { label: "Últimas 8 semanas", value: "week" },
  { label: "Últimos 12 meses", value: "month" },
];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OCCUPANCY_REFRESH_SECONDS = 5;
const OCCUPANCY_REFRESH_MS = OCCUPANCY_REFRESH_SECONDS * 1_000;

export function OccupancyScenarioDashboard() {
  const { user } = useAuth();
  const userId = user?.id;
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const companyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const companyTimeZone = companyTimeZoneResolution.timeZone;
  const canManage = canManageOccupancy(user);
  const canEditVisual = hasVisualAdminAccess(user);
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, OccupancyChartState>
  >({});
  const [history, setHistory] =
    React.useState<OccupancyScenarioHistoryResponse | null>(null);
  const [alerts, setAlerts] = React.useState<OccupancyAlertRow[]>([]);
  const [alertsError, setAlertsError] = React.useState("");
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [metadataError, setMetadataError] = React.useState("");
  const [dataLoadError, setDataLoadError] = React.useState("");
  const [hasLoadedData, setHasLoadedData] = React.useState(false);
  const [loadedDataScopeKey, setLoadedDataScopeKey] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
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
  const [dashboardSettingsState, setDashboardSettingsState] =
    React.useState<OccupancyDashboardSettingsState>({
      scopeKey: "",
      value: DEFAULT_OCCUPANCY_DASHBOARD_SETTINGS,
    });

  const requestRef = React.useRef<AbortController | null>(null);
  const runningRef = React.useRef(false);
  const hasLoadedDataRef = React.useRef(false);
  const activeDataScopeKeyRef = React.useRef("");
  const loadedDataScopeKeyRef = React.useRef("");
  const metadataRequestSequenceRef = React.useRef(0);
  const focusRef = React.useRef({
    scopeMode: "scenario" as const,
    selectedId,
  });

  const visibleScenarios = React.useMemo(
    () => (canManage ? scenarios : scenarios.filter((scenario) => scenario.active)),
    [canManage, scenarios],
  );
  const selectedScenario = React.useMemo(
    () =>
      visibleScenarios.find((scenario) => scenario.id === selectedId) ??
      null,
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
  const activeDataScopeKey = occupancyDataScopeKey(
    companyScopeId,
    selectedId,
    companyTimeZone,
  );
  const hasLoadedSelectedScenario =
    Boolean(selectedScenario) &&
    hasLoadedData &&
    loadedDataScopeKey === activeDataScopeKey;
  const certifiedChartData = hasLoadedSelectedScenario ? chartData : {};
  const certifiedHistory = hasLoadedSelectedScenario ? history : null;
  const certifiedAlerts = hasLoadedSelectedScenario ? alerts : [];
  const certifiedAlertsError = hasLoadedSelectedScenario ? alertsError : "";
  const sharedFocusSnapshot = React.useMemo(
    () =>
      selectedScenario && certifiedHistory
        ? {
            asOf: certifiedHistory.as_of,
            name: selectedScenario.name,
            requestedAt: clock,
            scenarioId: selectedScenario.id,
            total: certifiedHistory.total,
          }
        : null,
    [certifiedHistory, clock, selectedScenario],
  );
  const {
    cards: occupancyComparisonCards,
    reportAssets: occupancyComparisonReportAssets,
    settings: occupancyComparisonSettings,
    updateSettings: updateOccupancyComparisonSettings,
  } = useOccupancyComparisonCards({
    aggregateRefreshMs: OCCUPANCY_REFRESH_MS,
    companyScopeId,
    focusScenarioId: selectedId,
    focusSnapshot: sharedFocusSnapshot,
    monitorMode,
    preferenceScopeId: selectedId,
    scenarios: visibleScenarios,
    snapshotRefreshMs: liveRefreshMs,
    timeZone: companyTimeZone,
    timeZoneWarning: companyTimeZoneResolution.warning,
    userId,
  });
  const chartDefinitions = React.useMemo(
    () => buildOccupancyChartDefinitions(clock),
    [clock],
  );

  const loadScenarios = React.useCallback(async (selectId?: string) => {
    const requestSequence = ++metadataRequestSequenceRef.current;
    setLoadingScenarios(true);
    setMetadataError("");
    try {
      const response = await apiFetch<unknown>("/occupancy/scenarios", {
        companyScopeId,
      });
      const nextScenarios = filterScopedApiRows(
        requireOccupancyScenarioRows(response, companyScopeId),
        companyScopeId,
      );

      if (requestSequence !== metadataRequestSequenceRef.current) return;
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
    } catch (error) {
      if (requestSequence !== metadataRequestSequenceRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cenários de ocupação.";
      setScenarios([]);
      setSelectedId("");
      setChartData({});
      setHistory(null);
      setAlerts([]);
      setAlertsError("");
      setMetadataError(message);
    } finally {
      if (requestSequence === metadataRequestSequenceRef.current) {
        setLoadingScenarios(false);
      }
    }
  }, [canManage, companyScopeId, userId]);

  const loadScenarioData = React.useCallback(
    async (
      scenario: OccupancyScenario,
      { force = false, silent = false }: LoadOptions = {},
    ) => {
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

      if (runningRef.current) {
        if (!force) return;
        requestRef.current?.abort();
      }

      const controller = new AbortController();
      requestRef.current = controller;
      runningRef.current = true;

      const sameScenarioLoaded =
        hasLoadedDataRef.current &&
        loadedDataScopeKeyRef.current === requestedScopeKey;
      const silentLoad = sameScenarioLoaded && (silent || hasLoadedDataRef.current);
      if (silentLoad) setRefreshing(true);
      else setLoadingData(true);

      const now = new Date();
      const definitions = buildOccupancyChartDefinitions(now);
      const definitionsWindowKey = occupancyChartDefinitionsWindowKey(definitions);
      const isCurrentRequest = () =>
        !controller.signal.aborted &&
        requestRef.current === controller &&
        activeDataScopeKeyRef.current === requestedScopeKey &&
        definitionsWindowKey ===
          occupancyChartDefinitionsWindowKey(
            buildOccupancyChartDefinitions(new Date()),
          );

      try {
        requireCertifiedRuntimeCompanyTimeZone(companyTimeZoneResolution);
        const [historyResult, alertResult, chartEntries] = await Promise.all([
          apiFetch<unknown>(
            occupancyScenarioHistoryPath(scenario.id, now),
            { companyScopeId, signal: controller.signal },
          ).then((response) =>
            requireOccupancyHistoryResponse(response, scenario.id, {
              expectedAreas: scenario.areas,
              requestedAt: now,
            }),
          ),
          apiFetch<unknown>(
            `/occupancy/scenarios/${scenario.id}/alerts?limit=12`,
            { companyScopeId, signal: controller.signal },
          )
            .then((response) => ({
              data: requireOccupancyAlertRows(
                response,
                scenario.id,
                scenario.object_class,
              ),
              error: "",
            }))
            .catch((error) => {
              if (isAbortError(error)) throw error;
              return {
                data: [] as OccupancyAlertRow[],
                error:
                  error instanceof Error
                    ? error.message
                    : "Não foi possível carregar os alertas recentes.",
              };
            }),
          Promise.all(
            definitions.map(async (definition) => {
              try {
                const response =
                  await apiFetch<OccupancyScenarioAggregateResponse>(
                    occupancyScenarioAggregatePath(scenario.id, definition),
                    { companyScopeId, signal: controller.signal },
                  );
                const rows = requireOccupancyAggregateRows(
                  response,
                  definition.granularity,
                  scenario.id,
                  companyTimeZone,
                  {
                    allowLegacyUncertifiedInstantBuckets: true,
                    openBucket: listBucketStarts(definition).at(-1),
                    requestedAt: now,
                    requireCertification: true,
                  },
                );
                const state: OccupancyChartState = buildOccupancyChartState(
                  definition,
                  rows,
                  joinOccupancyWarnings(
                    occupancyAggregateMetadataWarning(
                      response,
                      definition.granularity,
                    ),
                    companyTimeZoneResolution.warning,
                  ),
                );

                return [definition.id, state] as const;
              } catch (error) {
                if (isAbortError(error)) throw error;
                const state: OccupancyChartState = {
                  rows: [],
                  points: buildEmptyOccupancyPoints(definition),
                  error:
                    error instanceof Error
                      ? error.message
                      : "Não foi possível carregar este período.",
                };

                return [definition.id, state] as const;
              }
            }),
          ),
        ]);

        const nextChartData = Object.fromEntries(
          chartEntries,
        ) as Record<string, OccupancyChartState>;

        if (!isCurrentRequest()) return;
        setChartData(nextChartData);
        setHistory(historyResult);
        setAlerts(alertResult.data);
        setAlertsError(alertResult.error);
        setDataLoadError("");
        setClock(now);
        setLastUpdated(new Date());
        setHasLoadedData(true);
        hasLoadedDataRef.current = true;
        loadedDataScopeKeyRef.current = requestedScopeKey;
        setLoadedDataScopeKey(requestedScopeKey);

      } catch (error) {
        if (!isAbortError(error) && isCurrentRequest()) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a ocupação.";
          setDataLoadError(message);
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          runningRef.current = false;
          setLoadingData(false);
          setRefreshing(false);
        }
      }
    },
    [companyScopeId, companyTimeZone, companyTimeZoneResolution],
  );

  const retryOccupancyData = React.useCallback(() => {
    void loadScenarios(selectedScenario?.id);
    if (selectedScenario) {
      void loadScenarioData(selectedScenario, { force: true });
    }
  }, [loadScenarioData, loadScenarios, selectedScenario]);

  const updateDashboardSettings = React.useCallback(
    (
      patch:
        | Partial<OccupancyDashboardSettings>
        | ((current: OccupancyDashboardSettings) =>
            Partial<OccupancyDashboardSettings>),
    ) => {
      const base =
        dashboardSettingsState.scopeKey === dashboardSettingsScopeKey
          ? dashboardSettingsState.value
          : loadOccupancyDashboardSettings(
              companyScopeId,
              userId,
              selectedId,
            );
      const resolvedPatch = typeof patch === "function" ? patch(base) : patch;
      try {
        const value = saveOccupancyDashboardSettings(
          { ...base, ...resolvedPatch, schemaVersion: 2 },
          companyScopeId,
          userId,
          selectedId,
        );
        setDashboardSettingsState({
          scopeKey: dashboardSettingsScopeKey,
          value,
        });
      } catch {
        toast.error(
          "Não foi possível salvar as configurações de ocupação neste navegador.",
        );
      }
    },
    [
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
    requestRef.current?.abort();

    if (loadedDataScopeKeyRef.current !== activeDataScopeKey) {
      loadedDataScopeKeyRef.current = "";
      hasLoadedDataRef.current = false;
      setLoadedDataScopeKey("");
      setHasLoadedData(false);
      setChartData({});
      setHistory(null);
      setAlerts([]);
      setAlertsError("");
      setDataLoadError("");
      setLastUpdated(null);
    }
  }, [activeDataScopeKey]);

  React.useEffect(() => {
    requestRef.current?.abort();
    setMetadataError("");
    setDataLoadError("");
    setScenarios([]);
    focusRef.current = { scopeMode: "scenario", selectedId: "" };
    setSelectedId("");
    setChartData({});
    setHistory(null);
    setAlerts([]);
    setAlertsError("");
    setHasLoadedData(false);
    hasLoadedDataRef.current = false;
    setLoadedDataScopeKey("");
    loadedDataScopeKeyRef.current = "";
  }, [companyScopeId, companyTimeZone]);

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
    function synchronizeDashboardSettings() {
      setDashboardSettingsState({
        scopeKey: dashboardSettingsScopeKey,
        value: loadOccupancyDashboardSettings(
          companyScopeId,
          userId,
          selectedId,
        ),
      });
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
    function synchronizeCustomWidgets() {
      setCustomWidgets(
        selectedId
          ? loadOccupancyCustomWidgets(companyScopeId, preferenceScope)
          : [],
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
    if (!selectedScenario) {
      setDataLoadError("");
      setChartData({});
      setHistory(null);
      setAlerts([]);
      setAlertsError("");
      return;
    }

    loadScenarioData(selectedScenario, { force: true });
  }, [loadScenarioData, selectedScenario]);

  React.useEffect(() => {
    let disposed = false;
    let timeout: number | undefined;
    let refreshRunning = false;

    function scheduleNextRefresh() {
      if (disposed) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = undefined;
        void refreshWhenVisible();
      }, occupancyTemporalRefreshDelay(liveRefreshMs));
    }

    async function refreshWhenVisible() {
      if (disposed || refreshRunning) return;
      if (document.visibilityState !== "visible" || !selectedScenario) {
        scheduleNextRefresh();
        return;
      }

      refreshRunning = true;
      try {
        await loadScenarioData(selectedScenario, { silent: true });
      } finally {
        refreshRunning = false;
        scheduleNextRefresh();
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

    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestRef.current?.abort();
    };
  }, [liveRefreshMs, loadScenarioData, selectedScenario]);

  const initialLoading =
    Boolean(selectedScenario) && !hasLoadedSelectedScenario
      ? true
      : (loadingScenarios || loadingData) && !hasLoadedSelectedScenario;
  const currentTotal = certifiedHistory?.total ?? null;
  const activeAreas =
    certifiedHistory?.areas?.filter((area) => area.value > 0).length ?? null;
  const todayMetric = latestOccupancyMetric(
    certifiedChartData.occupancy_chart_day?.points ?? [],
  );
  // Falhas de uma série agregada ficam no próprio widget. O catálogo e o
  // snapshot ao vivo continuam válidos e não devem derrubar todo o módulo.
  const occupancyCertificationError = metadataError || dataLoadError;
  const hasIncompleteOccupancyCoverage = Object.values(
    certifiedChartData,
  ).some(
    (state) => Boolean(state.error || state.warning),
  );
  const thresholdStatus = selectedScenario && currentTotal !== null
    ? occupancyThresholdStatus(currentTotal, selectedScenario)
    : null;
  const configuredCapacity = selectedScenario
    ? occupancyComparisonSettings.capacities[selectedScenario.id] ?? null
    : null;
  const utilization =
    currentTotal !== null &&
    configuredCapacity !== null &&
    configuredCapacity > 0
      ? (currentTotal / configuredCapacity) * 100
      : null;

  function openCustomWidgetDialog() {
    setCustomWidgetForm({
      ...DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM,
      series: { ...DEFAULT_OCCUPANCY_TREND_SERIES },
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
      setCustomWidgets(next);
      setCustomWidgetDialogOpen(false);
      toast.success(
        customWidgetForm.id ? "Widget atualizado." : "Widget adicionado à Ocupação.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o widget.",
      );
    }
  }

  function removeCustomWidget(widgetId: string) {
    try {
      setCustomWidgets(
        deleteOccupancyCustomWidget(
          widgetId,
          companyScopeId,
          preferenceScope,
        ),
      );
      toast.success("Widget removido.");
    } catch {
      toast.error("Não foi possível remover o widget.");
    }
  }

  const metricCards = [
    {
      id: "occupancy_current_total",
      label: "Último snapshot",
      defaultSize: "compact" as const,
      titleEditable: true,
      node: (
        <MetricCard
          icon={UsersRound}
          label="Último snapshot"
          value={currentTotal}
          loading={initialLoading}
          tone={thresholdStatus?.tone ?? "primary"}
          description={
            certifiedHistory?.as_of
              ? `fonte em ${formatDateTime(certifiedHistory.as_of)}`
              : selectedScenario?.name ?? "Cenário obrigatório"
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
    condensed: true,
    defaultHeight: "short" as const,
    defaultHeightLevel: 1 as const,
  }));

  const chartCards = chartDefinitions.map((definition) => ({
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
        loading={initialLoading}
        metricVisibility={metricVisibility}
        scenario={selectedScenario}
        state={certifiedChartData[definition.id]}
      />
    ) : (
      <EmptyOccupancyCard title={definition.label} />
    ),
  }));

  const customWidgetCards = customWidgets.map((widget) => {
    const action =
      canEditVisual && !monitorMode ? (
        <CustomWidgetActions
          onEdit={() => openCustomWidgetEditor(widget)}
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
        defaultHeight: "short" as const,
        defaultSize: "compact" as const,
        id: `occupancy_custom_${widget.id}`,
        label: widget.title,
        titleEditable: true,
        node: (
          <MetricCard
            action={action}
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

    const sourceDefinition = chartDefinitions.find(
      (definition) => definition.granularity === widget.granularity,
    );
    const definition = sourceDefinition
      ? { ...sourceDefinition, id: `occupancy_custom_${widget.id}`, label: widget.title }
      : null;
    return {
      chartTypeEnabled: true,
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
            action={action}
            definition={definition}
            loading={initialLoading}
            metricVisibility={widget.series}
            scenario={selectedScenario}
            state={sourceDefinition ? certifiedChartData[sourceDefinition.id] : undefined}
          />
        ) : (
          <EmptyOccupancyCard action={action} title={widget.title} />
        ),
    };
  });

  const detailCards = selectedScenario
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
              history={certifiedHistory}
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
              />
            ),
        },
      ]
    : [];

  const occupancyLayoutCards = [
    ...metricCards,
    ...chartCards,
    ...occupancyComparisonCards,
    ...customWidgetCards,
    ...(monitorMode ? [] : detailCards),
  ];
  const occupancyCardIds = occupancyLayoutCards.map((card) => card.id);
  const occupancyPreferences = useCardPreferences(
    "occupancy",
    occupancyCardIds,
    companyScopeId,
    preferenceScope,
  );
  const visibleOccupancyCardIds = orderByCardPreferences(
    occupancyLayoutCards,
    occupancyPreferences,
  ).map((card) => card.id);
  const occupancyTitleByCardId = new Map(
    occupancyPreferences.flatMap((preference) =>
      preference.title
        ? ([[preference.id, preference.title]] as const)
        : [],
    ),
  );
  const occupancyColorByCardId = new Map(
    occupancyPreferences.flatMap((preference) =>
      preference.color
        ? ([[preference.id, preference.color]] as const)
        : [],
    ),
  );
  const occupancyChartTypeByCardId = new Map(
    occupancyPreferences.flatMap((preference) =>
      preference.chartType
        ? ([[preference.id, preference.chartType]] as const)
        : [],
    ),
  );
  const occupancyReportPayload = buildOccupancyDashboardReport({
    activeAreas,
    alerts: certifiedAlerts,
    alertsError: certifiedAlertsError,
    chartData: certifiedChartData,
    chartDefinitions,
    chartTypeByCardId: occupancyChartTypeByCardId,
    colorByCardId: occupancyColorByCardId,
    currentTotal,
    customWidgets,
    generatedAt: lastUpdated ?? clock,
    history: certifiedHistory,
    metricVisibility,
    occupancyComparisonReportAssets,
    // Relatórios são rasterizados sobre fundo branco, independentemente do
    // tema da tela. Uma paleta clara evita linhas escuras/brancas incoerentes
    // no PDF/PNG quando o dashboard está no modo escuro.
    palette: getOccupancyChartPalette("light"),
    scenario: selectedScenario,
    titleByCardId: occupancyTitleByCardId,
    todayMetric,
    utilization,
    visibleCardIds: visibleOccupancyCardIds,
  });

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
      {!occupancyCertificationError &&
      hasIncompleteOccupancyCoverage &&
      !initialLoading ? (
        <p
          role="status"
          className="sr-only"
        >
          Algumas séries ou períodos de ocupação permanecem indisponíveis; eles
          não representam ocupação zero.
        </p>
      ) : null}

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
                {formatTime(lastUpdated)}
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
          <div className="grid min-w-0 grid-cols-[minmax(0,96px)_minmax(0,64px)_minmax(212px,1fr)] items-center gap-1 @sm:grid-cols-[minmax(96px,112px)_64px_minmax(212px,1fr)] @md:grid-cols-[minmax(120px,160px)_64px_minmax(212px,1fr)] @md:gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <div className="col-start-3 row-start-1 flex w-full min-w-0 items-center justify-end gap-2">
              <Skeleton className="hidden h-3.5 w-3.5 shrink-0 @md:block @lg:w-10 @xl:w-24" />
              <Skeleton className="h-8 w-[212px] max-w-full shrink-0" />
            </div>
          </div>
        ) : visibleScenarios.length ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <div
                aria-label="Controles da visão de ocupação"
                className="grid min-w-0 grid-cols-[minmax(0,96px)_minmax(0,64px)_minmax(212px,1fr)] items-center gap-1 @sm:grid-cols-[minmax(96px,112px)_64px_minmax(212px,1fr)] @md:grid-cols-[minmax(120px,160px)_64px_minmax(212px,1fr)] @md:gap-2"
                role="group"
              >
              <div className="min-w-0">
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger
                    aria-label="Cenário de ocupação em foco"
                    className="h-8 w-full min-w-0 bg-card"
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

              <div
                aria-label="Aparência dos comparativos desta visão"
                className="flex min-w-0 items-center gap-2"
                role="group"
              >
                <OccupancyPaletteSelect
                  ariaLabel="Paleta dos comparativos desta visão"
                  compact
                  fluid
                  value={occupancyComparisonSettings.colorPaletteId}
                  onValueChange={(colorPaletteId) =>
                    updateOccupancyComparisonSettings({ colorPaletteId })
                  }
                />
              </div>

              <div className="col-start-3 row-start-1 flex w-full min-w-0 items-center justify-end gap-2">
                {lastUpdated ? (
                  <span
                    aria-label={`Última atualização às ${formatTime(lastUpdated)}`}
                    className="hidden min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] tabular-nums text-muted-foreground @md:inline-flex"
                    title={`Última atualização às ${formatTime(lastUpdated)}`}
                  >
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden @lg:inline @xl:hidden">
                      {formatTime(lastUpdated)}
                    </span>
                    <span className="hidden @xl:inline">
                      Atualizado às {formatTime(lastUpdated)}
                    </span>
                  </span>
                ) : null}
                <div
                  aria-label="Ações da visão de ocupação"
                  className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1 [&_[data-monitor-mode-trigger]]:shrink-0 [&_[data-premium-control]]:shrink-0"
                  role="group"
                >
                  <ReportExportActions
                    compact
                    disabled={
                      initialLoading ||
                      !selectedScenario ||
                      Boolean(occupancyCertificationError) ||
                      hasIncompleteOccupancyCoverage
                    }
                    payload={occupancyReportPayload}
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
                  <Button
                    type="button"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    variant={operationalSettingsOpen ? "default" : "outline"}
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
                  <Button
                    type="button"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    variant="outline"
                    onClick={() => {
                      if (selectedScenario) {
                        loadScenarioData(selectedScenario, {
                          force: true,
                          silent: true,
                        });
                      }
                      loadScenarios();
                    }}
                    disabled={refreshing || loadingData}
                    aria-label="Atualizar dados de ocupação"
                    title="Atualizar dados de ocupação"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        (refreshing || loadingData) && "animate-spin",
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

            {operationalSettingsOpen ? (
              <div
                id="occupancy-operational-settings"
                aria-label="Configurações operacionais da ocupação"
                className="rounded-xl border bg-muted/15 p-3 shadow-sm"
                role="group"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-[180px] shrink-0">
                    <div className="text-sm font-semibold">Séries históricas</div>
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
                    className="h-9 w-full shrink-0 lg:w-auto lg:min-w-[112px]"
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
              cenários de áreas, inclusive quando o cenário possui apenas uma área.
            </div>
            {canManage ? (
              <Button
                className="mt-4"
                asChild
              >
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
          menuKey="occupancy"
          monitorMode={monitorMode}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          preferenceScopeId={selectedScenario?.id}
          reorderMode={layoutReorderMode}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
          viewScopeName={selectedScenario?.name}
          viewScopes={visibleScenarios.map((scenario) => ({
            id: scenario.id,
            name: scenario.name,
          }))}
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
  const resolvedTitle = useWidgetTitle(label);
  const toneClass = {
    average:
      "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
    maximum:
      "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
    minimum:
      "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300",
    primary: "bg-primary/10 text-primary ring-primary/20",
    sky: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    indigo:
      "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
    slate: "bg-muted text-muted-foreground ring-border",
    warning:
      "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300",
  }[tone];
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
  const widgetColor = useWidgetColor(toneColor);

  return (
    <Card className="@container h-full min-w-0 overflow-hidden">
      <CardContent className="grid h-full min-h-[116px] grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 p-4">
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <div
            className="line-clamp-2 break-words text-xs font-medium uppercase text-muted-foreground [overflow-wrap:anywhere]"
            title={resolvedTitle}
          >
            {resolvedTitle}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-2 max-w-full break-all text-[clamp(1.25rem,12cqi,1.5rem)] font-semibold leading-tight tabular-nums">
              {typeof value === "string" ? value : formatOccupancyValue(value)}
            </div>
          )}
          <div
            className="mt-2 line-clamp-2 break-words pt-1 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]"
            title={description}
          >
            {description}
          </div>
        </div>
        <div
          className={cn(
            "flex h-full min-h-0 shrink-0 flex-col items-end gap-2",
            action ? "justify-between" : "justify-center",
          )}
        >
          {action}
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1",
              toneClass,
            )}
            style={{
              backgroundColor: `color-mix(in srgb, ${widgetColor} 12%, transparent)`,
              color: widgetColor,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${widgetColor} 24%, transparent)`,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
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
  const palette = React.useMemo(
    () => {
      const basePalette = getOccupancyChartPalette(effectiveTheme);
      return {
        ...basePalette,
        current: ensureGraphicContrast(widgetColor, basePalette.surface),
      };
    },
    [effectiveTheme, widgetColor],
  );
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
  const hasData = points.some(
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
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {!loading && !state?.error && state?.warning ? (
          <p className="sr-only">
            Este gráfico contém períodos ainda sem dados; eles permanecem
            vazios e não representam ocupação zero.
          </p>
        ) : null}
        {loading ? (
          <Skeleton className="min-h-[190px] flex-1 @sm:min-h-[260px]" />
        ) : state?.error ? (
          <EmptyChartState text="Dados temporariamente indisponíveis para este gráfico." />
        ) : hasData ? (
          <div className="min-h-[190px] flex-1 @sm:min-h-[260px]">
            <EChart
              option={option}
              themeMode="explicit"
              className="h-full min-h-[190px] @sm:min-h-[260px]"
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
              "h-8 rounded px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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

function OccupancyCustomWidgetDialog({
  form,
  onChange,
  onOpenChange,
  onSave,
  open,
}: {
  form: OccupancyCustomWidgetForm;
  onChange: React.Dispatch<React.SetStateAction<OccupancyCustomWidgetForm>>;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
}) {
  const granularitySelectId = React.useId();
  const kindSelectId = React.useId();
  const metricSelectId = React.useId();
  const seriesLabelId = React.useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Editar widget de ocupação" : "Novo widget de ocupação"}
          </DialogTitle>
          <DialogDescription>
            Monte KPIs e tendências usando os mesmos dados certificados do cenário
            selecionado. Cada cenário mantém seu próprio conjunto de widgets.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={kindSelectId}>Tipo de widget</Label>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  onChange((current) => {
                    const kind = value as OccupancyCustomWidgetForm["kind"];
                    return {
                      ...current,
                      kind,
                      title: current.id
                        ? current.title
                        : kind === "metric"
                          ? occupancyCustomMetricLabel(current.metric)
                          : `Tendência ${occupancyGranularityLabel(current.granularity)}`,
                    };
                  })
                }
              >
                <SelectTrigger id={kindSelectId}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">Indicador operacional</SelectItem>
                  <SelectItem value="trend">Tendência histórica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupancy-custom-widget-title">Título</Label>
              <Input
                id="occupancy-custom-widget-title"
                value={form.title}
                maxLength={120}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Nome do widget"
              />
            </div>
          </div>

          {form.kind === "metric" ? (
            <div className="space-y-2 rounded-md border bg-muted/15 p-3">
              <Label htmlFor={metricSelectId}>Indicador</Label>
              <Select
                value={form.metric}
                onValueChange={(value) =>
                  onChange((current) => ({
                    ...current,
                    metric: value as OccupancyCustomMetric,
                    title: current.id
                      ? current.title
                      : occupancyCustomMetricLabel(
                          value as OccupancyCustomMetric,
                        ),
                  }))
                }
              >
                <SelectTrigger id={metricSelectId}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OCCUPANCY_CUSTOM_METRIC_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Utilização usa a capacidade configurada no simulador hexagonal;
                sem capacidade o valor permanece não certificado.
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-md border bg-muted/15 p-3">
              <div className="space-y-2">
                <Label htmlFor={granularitySelectId}>Período e granularidade</Label>
                <Select
                  value={form.granularity}
                  onValueChange={(value) =>
                    onChange((current) => ({
                      ...current,
                      granularity: value as OccupancyCustomWidgetGranularity,
                      title: current.id
                        ? current.title
                        : `Tendência ${occupancyGranularityLabel(
                            value as OccupancyCustomWidgetGranularity,
                          )}`,
                    }))
                  }
                >
                  <SelectTrigger id={granularitySelectId}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OCCUPANCY_GRANULARITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p id={seriesLabelId} className="text-sm font-medium leading-none">
                  Séries exibidas
                </p>
                <div
                  aria-labelledby={seriesLabelId}
                  className="flex flex-wrap gap-2"
                  role="group"
                >
                  <Badge variant="outline" className="h-8 bg-primary/10 text-primary">
                    Atual sempre visível
                  </Badge>
                  {([
                    ["average", "Média"],
                    ["minimum", "Mínimo"],
                    ["peak", "Máximo"],
                  ] as const).map(([key, label]) => (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={form.series[key] ? "default" : "outline"}
                      onClick={() =>
                        onChange((current) => ({
                          ...current,
                          series: {
                            ...current.series,
                            [key]: !current.series[key],
                          },
                        }))
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={!form.title.trim()}>
            {form.id ? "Salvar alterações" : "Adicionar widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomWidgetActions({
  onEdit,
  onRemove,
  title,
}: {
  onEdit: () => void;
  onRemove: () => void;
  title: string;
}) {
  return (
    <WidgetCardActions label={`Ações do widget ${title}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        aria-label={`Editar widget ${title}`}
        title="Editar widget"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remover widget ${title}`}
        title="Remover widget"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </WidgetCardActions>
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
          Classe {scenario.object_class || "person"} com limites de alerta do
          cenário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 @sm:grid-cols-3">
          <SmallInfo label="Áreas" value={formatNumber(scenario.areas?.length ?? 0)} />
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
                  item.area_id === area.area_id && item.camera_id === area.camera_id,
              );

              return (
                <div
                  key={`${area.camera_id}-${area.area_id}-${page * pageSize + index}`}
                  className="grid min-w-0 gap-3 rounded-md border bg-muted/20 p-3 @sm:grid-cols-[minmax(0,1fr)_90px]"
                >
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {area.label || area.area_id}
                    </div>
                    <div className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {area.camera_id} / {area.area_id}
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
}: {
  alerts: OccupancyAlertRow[];
  error: string;
  loading: boolean;
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
                      variant={alert.threshold_kind === "min" ? "warning" : "destructive"}
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
                    {formatDateTime(alert.triggered_at)}
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
    <div className="flex h-[190px] min-w-0 items-center justify-center break-words rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground [overflow-wrap:anywhere] @sm:h-[330px]">
      {text}
    </div>
  );
}

function buildOccupancyChartDefinitions(now: Date): OccupancyChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = endOfAggregateBucket(startOfHour(now), "hour");
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);

  return [
    {
      id: "occupancy_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos do cenário.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "occupancy_chart_hour",
      label: "Hora a hora",
      description: "Hoje por hora com mínimo, média, máximo e atual.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "occupancy_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias do cenário.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "occupancy_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas do cenário.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "occupancy_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses do cenário.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
  ];
}

function occupancyChartDefinitionsWindowKey(
  definitions: OccupancyChartDefinition[],
) {
  return JSON.stringify(
    definitions.map((definition) => [
      definition.id,
      definition.granularity,
      definition.from.getTime(),
      definition.to.getTime(),
    ]),
  );
}

function occupancyTemporalRefreshDelay(refreshMs: number) {
  const now = new Date();
  const nextMinute = endOfAggregateBucket(startOfMinute(now), "minute");
  return Math.max(
    0,
    Math.min(Math.max(250, refreshMs), nextMinute.getTime() - now.getTime() + 50),
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

  return `/occupancy/scenarios/${scenarioId}/aggregate?${params.toString()}`;
}

function occupancyScenarioHistoryPath(scenarioId: string, at: Date) {
  const params = new URLSearchParams({ at: at.toISOString() });
  return `/occupancy/scenarios/${scenarioId}/history?${params.toString()}`;
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
  return warnings.filter((warning): warning is string => Boolean(warning)).join(" ") || undefined;
}

function buildOccupancyPoints(
  definition: OccupancyChartDefinition,
  rows: OccupancyScenarioBucketRow[],
) {
  const requestedBuckets = listBucketStarts(definition);
  const { missingBuckets, totals } =
    aggregateOccupancyRowsForRequestedBuckets(
      rows,
      definition.granularity,
      requestedBuckets,
      {
        allowLegacyUncertifiedInstantBuckets: true,
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
        label: bucketLabel(bucketStart, definition.granularity),
        average: null,
        current: null,
        minimum: null,
        peak: null,
      };
    }

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
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
    label: bucketLabel(bucketStart, definition.granularity),
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
    ? buildFixedOccupancyHourlyPoints(definition.from, points)
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
      effect: true,
      fill: palette.current,
      kind: "current",
      name: "Final do bucket",
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
      name: "Final do bucket",
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
      icon: "roundRect",
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
      : `Final do bucket: ${formatOccupancyValue(point.current)}`,
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
      "O intervalo do gráfico excedeu o limite de buckets e não pode ser truncado.",
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
  palette,
  scenario,
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
  >["reportAssets"];
  palette: OccupancyChartPalette;
  scenario: OccupancyScenario | null;
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
          ? `Fonte em ${formatDateTime(history.as_of)}`
          : "Snapshot ainda não certificado",
        label: resolveTitle("occupancy_current_total", "Último snapshot"),
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
          : "Janela dos últimos alertas retornados pela API (até 12).",
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
      const state = sourceDefinition ? chartData[sourceDefinition.id] : undefined;
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

  const tables: ReportTable[] = [];
  if (scenario && visible.has("occupancy_scenario_detail")) {
    tables.push({
      columns: [
        { key: "label", label: "Área" },
        { key: "camera", label: "Câmera" },
        { key: "area", label: "ID da área" },
        { key: "value", label: "Ocupação", numeric: true },
      ],
      description: "Último valor certificado por área do cenário.",
      rows: scenario.areas.map((area) => ({
        area: area.area_id,
        camera: area.camera_id,
        label: area.label || area.area_id,
        value:
          history?.areas?.find(
            (item) =>
              item.area_id === area.area_id && item.camera_id === area.camera_id,
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
      description: "Alertas recentes certificados para o cenário.",
      rows: alerts.map((alert) => ({
        kind: alert.threshold_kind === "min" ? "Mínimo" : "Máximo",
        threshold: alert.threshold_value ?? null,
        time: alert.triggered_at ? formatDateTime(alert.triggered_at) : "—",
        value: alert.total_value ?? null,
      })),
      title: resolveTitle("occupancy_alert_list", "Histórico de alertas"),
    });
  }

  return {
    charts: visibleCardIds.flatMap((cardId) => {
      const chart = chartByCardId.get(cardId);
      return chart ? [chart] : [];
    }),
    context: [
      scenario ? `Cenário: ${scenario.name}` : "Nenhum cenário selecionado",
      "Buckets ausentes permanecem sem valor e nunca são convertidos em ocupação zero.",
      "Ordem, visibilidade, títulos, cores e tipo dos gráficos seguem a tela configurada.",
    ],
    dataCompleteUntil: history?.as_of ? new Date(history.as_of) : null,
    filename: `ipxdata-ocupacao-${reportDateSlug(generatedAt)}`,
    generatedAt,
    metrics: visibleCardIds.flatMap((cardId) => {
      const metric = metricByCardId.get(cardId);
      return metric ? [metric] : [];
    }),
    subtitle: "Ocupação certificada do cenário e suas séries históricas.",
    tables,
    title: scenario ? `Ocupação - ${scenario.name}` : "Ocupação",
  };
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
        { key: "current", label: "Final do bucket", numeric: true },
        { key: "average", label: "Média", numeric: true },
        { key: "minimum", label: "Mínimo", numeric: true },
        { key: "peak", label: "Máximo", numeric: true },
      ],
      description: "Série certificada; lacunas são mantidas sem valor.",
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

function reportDateSlug(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function occupancyCustomMetricLabel(metric: OccupancyCustomMetric) {
  return (
    OCCUPANCY_CUSTOM_METRIC_OPTIONS.find((option) => option.value === metric)
      ?.label ?? "Indicador de ocupação"
  );
}

function occupancyGranularityLabel(
  granularity: OccupancyCustomWidgetGranularity,
) {
  return (
    OCCUPANCY_GRANULARITY_OPTIONS.find(
      (option) => option.value === granularity,
    )?.label.toLowerCase() ?? "histórica"
  );
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
      description: "média certificada do dia",
      icon: Gauge,
      tone: "average" as const,
      value: values.average,
    };
  }
  if (metric === "minimum") {
    return {
      description: "menor ocupação certificada do dia",
      icon: Activity,
      tone: "minimum" as const,
      value: values.minimum,
    };
  }
  if (metric === "peak") {
    return {
      description: "maior ocupação certificada do dia",
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
    description: "último snapshot certificado",
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
  return value === null || value === undefined ? "Sem limite" : formatOccupancyValue(value);
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
) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function alignEndToGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
) {
  const aligned = alignToGranularity(date, granularity);
  if (aligned.getTime() === date.getTime()) return aligned;
  return addGranularity(aligned, granularity);
}

function addGranularity(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") return endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  return addMonths(date, 1);
}

function bucketLabel(
  date: Date,
  granularity: OccupancyChartDefinition["granularity"],
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
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
