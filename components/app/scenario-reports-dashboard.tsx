"use client";

import * as React from "react";
import {
  BarChart3,
  Clock3,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import { buildCountingIntelligenceWidgetCards } from "@/components/app/counting-intelligence-report";
import { CountingReportPeriodControl } from "@/components/app/counting-report-period-control";
import {
  EChart,
  applyChartTypePreference,
  type EnterpriseChartOption,
} from "@/components/app/echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import {
  ScenarioComparisonCard,
  ScenarioComparisonConfigurator,
  buildScenarioComparisonDefinition,
  buildScenarioComparisonReportChart,
  createDefaultScenarioComparisonSettings,
  deleteScenarioComparisonSettings,
  fetchScenarioComparisonRows,
  loadScenarioComparisonSettings,
  saveScenarioComparisonSettings,
  type ScenarioComparisonHourlySource,
  type ScenarioComparisonSettings,
} from "@/components/app/scenario-comparison-card";
import { useCardPreferences } from "@/components/app/use-card-preferences";
import { useWidgetColor } from "@/components/app/widget-appearance";
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
  parseAggregateBucket,
  requireAggregateGranularity,
  requireAggregateRows,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  reconcileAggregateRows,
  rollupAggregateRows,
  rollupAggregateRowsMany,
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
} from "@/lib/counting-intelligence";
import {
  loadCountingReportViewSettings,
  saveCountingReportViewSettings,
  type CountingReportViewSettings,
} from "@/lib/counting-report-view-settings";
import {
  defaultCountingReportPeriod,
  effectiveCountingReportPeriodDates,
  formatCountingReportPeriod,
  loadCountingReportPeriod,
  saveCountingReportPeriod,
  type CountingReportPeriod,
} from "@/lib/counting-report-period";
import {
  filterScopedApiRows,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
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
import type { ReportMetric, ReportPayload, ReportTable } from "@/lib/report-export";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Camera,
  Location,
  Scenario,
  SubLocation,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber, formatTime } from "@/lib/utils";

type ScenarioReportsDashboardProps = {
  manager?: boolean;
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

type ReportComparisonRollup = {
  boundaryDefinition?: ScenarioAggregateDefinition;
  definition: ScenarioAggregateDefinition;
  to: Date;
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
const DEFAULT_METRIC_TYPE = "count";
const PREVIOUS_SUFFIX = "__previous";
const CURRENT_HOUR_MINUTES_ID = "report_current_hour_minutes";
const CURRENT_MONTH_DAYS_ID = "report_current_month_days";
const COUNTING_HOUR_HISTORY_ID = "report_counting_hour_history";
const COUNTING_MONTH_HISTORY_ID = "report_counting_month_history";
const COMPARISON_BOUNDARY_MINUTES_PREFIX =
  "report_comparison_boundary_minutes_";
const REPORT_OPEN_REFRESH_MS = 5_000;
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

export function ScenarioReportsDashboard({
  manager = false,
}: ScenarioReportsDashboardProps) {
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const canEditVisual = hasVisualAdminAccess(user);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [cameras, setCameras] = React.useState<Camera[]>([]);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [subLocations, setSubLocations] = React.useState<SubLocation[]>([]);
  const [cameraGroups, setCameraGroups] = React.useState<CameraGroup[]>([]);
  const [scopeMode, setScopeMode] =
    React.useState<ReportScopeMode>("scenario");
  const [selectedId, setSelectedId] = React.useState("");
  const [chartData, setChartData] = React.useState<
    Record<string, ScenarioChartState>
  >({});
  const chartDataRef = React.useRef<Record<string, ScenarioChartState>>({});
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
  const [clock, setClock] = React.useState(() => new Date());
  const [countingPeriod, setCountingPeriod] =
    React.useState<CountingReportPeriod>(() => defaultCountingReportPeriod());
  const [appliedCountingPeriod, setAppliedCountingPeriod] =
    React.useState<CountingReportPeriod>(() => defaultCountingReportPeriod());
  const [countingViewSettings, setCountingViewSettings] =
    React.useState<CountingReportViewSettings>(() =>
      loadCountingReportViewSettings(companyScopeId, { userId: user?.id }),
    );
  const [customWidgets, setCustomWidgets] = React.useState<ReportCustomWidget[]>(
    [],
  );
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const metadataRequestSequenceRef = React.useRef(0);
  const chartRequestSequenceRef = React.useRef(0);
  const openRefreshRequestSequenceRef = React.useRef(0);
  const openRefreshRunningRef = React.useRef(false);
  const canonicalBaselineReadyRef = React.useRef(false);
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<ReportCustomWidgetForm>({
      comparisonSettings: createDefaultScenarioComparisonSettings(),
      granularity: "hour",
      kind: "scope",
      scopeId: "",
      scopeMode: "scenario",
      title: "",
    });

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
  const reportPeriodOverride = React.useMemo(
    () => ({
      ...effectivePeriodDates,
      to: reportCoverageEnd(effectivePeriodDates, clock),
      label: `${formatCountingReportPeriod(appliedCountingPeriod)} · ${
        countingViewSettings.includeOpenPeriod
          ? "inclui mês em andamento"
          : "somente meses fechados"
      }`,
    }),
    [
      appliedCountingPeriod,
      clock,
      countingViewSettings.includeOpenPeriod,
      effectivePeriodDates,
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

  const loadScenarios = React.useCallback(async () => {
    const requestSequence = ++metadataRequestSequenceRef.current;
    setLoadingScenarios(true);
    setMetadataError("");
    try {
      const [scenarioRows, cameraRows, locationRows] = await Promise.all([
        apiFetch<unknown>("/scenarios"),
        apiFetch<unknown>("/cameras"),
        apiFetch<unknown>("/locations"),
      ]);
      const data = requireScenarioRows(scenarioRows);
      const scopedScenarios = filterScopedApiRows(data, companyScopeId);
      const scopedCameras = filterScopedApiRows(
        requireCameraRows(cameraRows),
        companyScopeId,
      );
      const scopedLocations = filterScopedApiRows(
        requireLocationRows(locationRows),
        companyScopeId,
      );
      const subLocationRows = await fetchSubLocations(
        scopedLocations,
        companyScopeId,
      );
      requireInfrastructureRelations({
        cameras: scopedCameras,
        locations: scopedLocations,
        subLocations: subLocationRows,
      });
      const visible = manager
        ? scopedScenarios
        : scopedScenarios.filter((scenario) => scenario.active);

      if (requestSequence !== metadataRequestSequenceRef.current) return;
      setMetadataError("");
      setScenarios(visible);
      setCameras(scopedCameras);
      setLocations(scopedLocations);
      setSubLocations(subLocationRows);
      const modes = buildReportScopeModes({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        scenarios: visible,
        subLocations: subLocationRows,
      });
      const nextMode = modes.some((mode) => mode.value === scopeMode)
        ? scopeMode
        : modes[0]?.value ?? "scenario";
      const options = buildReportScopeOptions({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        mode: nextMode,
        scenarios: visible,
        subLocations: subLocationRows,
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
          : "Não foi possível carregar as visões de relatório.";
      setScenarios([]);
      setCameras([]);
      setLocations([]);
      setSubLocations([]);
      setSelectedId("");
      chartDataRef.current = {};
      setChartData({});
      setMetadataError(message);
      toast.error(message);
    } finally {
      if (requestSequence === metadataRequestSequenceRef.current) {
        setLoadingScenarios(false);
      }
    }
  }, [cameraGroups, companyScopeId, manager, scopeMode]);

  const loadCharts = React.useCallback(
    async (_scope: ReportScopeOption, silent = false) => {
      const requestSequence = ++chartRequestSequenceRef.current;
      openRefreshRequestSequenceRef.current += 1;
      openRefreshRunningRef.current = false;
      canonicalBaselineReadyRef.current = false;
      if (!silent) setLoadingCharts(true);

      const now = new Date();
      const coverageTo = reportCoverageEnd(effectivePeriodDates, now);
      const definitions = buildScenarioAggregateDefinitions(
        now,
        effectivePeriodDates,
      );
      const requiredChartIds = new Set(
        customWidgets.flatMap((widget) =>
          widget.kind === "scope"
            ? [reportChartIdForGranularity(widget.granularity)]
            : [],
        ),
      );
      const visibleDefinitions = definitions.filter((definition) =>
        requiredChartIds.has(definition.id),
      );
      const previousDefinitions = showPreviousPeriod
        ? visibleDefinitions.map((definition) =>
            buildComparisonDefinition(definition, intradayComparison),
          )
        : [];
      const comparisonRollups = buildComparisonRollups(
        visibleDefinitions,
        previousDefinitions,
        coverageTo,
        intradayComparison,
      );
      const supportDefinitions = [
        buildCountingHourHistoryDefinition(effectivePeriodDates, now),
        ...uniqueComparisonBoundaryDefinitions(comparisonRollups),
      ];
      if (now >= effectivePeriodDates.from && now < effectivePeriodDates.to) {
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
            if (
              definition.id.startsWith("report_chart_") &&
              definition.granularity !== "minute"
            ) {
              return [
                definition.id,
                { rows: [], granularity: definition.granularity },
              ] as const;
            }
            try {
              const response = await apiFetch<AggregateEventsResponse>(
                aggregatePath(definition),
              );
              const responseGranularity = requireAggregateGranularity(
                response.granularity,
                definition.granularity,
              );
              return [
                definition.id,
                {
                  rows: requireAggregateRows(
                    response.data,
                    responseGranularity,
                    DEFAULT_METRIC_TYPE,
                  ),
                  granularity: responseGranularity,
                },
              ] as const;
            } catch (error) {
              return [
                definition.id,
                {
                  rows: [],
                  granularity: definition.granularity,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Não foi possível carregar este período.",
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
        const canonicalHourState = loadedData[COUNTING_HOUR_HISTORY_ID];
        const canonicalDefinitions = visibleDefinitions.map((definition) => ({
          definition,
          to: new Date(
            Math.min(definition.to.getTime(), coverageTo.getTime()),
          ),
        }));
        canonicalDefinitions
          .filter(({ definition }) => definition.granularity !== "minute")
          .forEach(({ definition, to }) => {
            if (!canonicalHourState || canonicalHourState.error) {
              loadedData[definition.id] = {
                error:
                  canonicalHourState?.error ??
                  "A base horária canônica não foi carregada.",
                granularity: definition.granularity,
                rows: [],
              };
              return;
            }

            loadedData[definition.id] = {
              granularity: definition.granularity,
              rows: rollupAggregateRows(
                canonicalHourState.rows,
                canonicalHourState.granularity,
                definition.granularity,
                definition.from,
                to,
              ),
            };
          });

        if (
          Object.values(loadedData).some((state) => state.error) &&
          !silent
        ) {
          toast.error(
            "Alguns dados não puderam ser reconciliados; os valores afetados não estão certificados.",
          );
        }
        const nextData = hydrateScenarioOpenBuckets(
          loadedData,
          now,
          effectivePeriodDates,
          visibleDefinitions,
          comparisonRollups,
        );
        chartDataRef.current = nextData;
        setChartData(nextData);
        setChartLoadError("");
        setClock(now);
        setLastUpdated(new Date());
        canonicalBaselineReadyRef.current = Boolean(
          canonicalHourState && !canonicalHourState.error,
        );
      } catch (error) {
        if (requestSequence !== chartRequestSequenceRef.current) return;
        canonicalBaselineReadyRef.current = false;
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os relatórios.";
        setChartLoadError(message);
        toast.error(message);
      } finally {
        if (requestSequence === chartRequestSequenceRef.current) {
          setLoadingCharts(false);
        }
      }
    },
    [
      customWidgets,
      effectivePeriodDates,
      intradayComparison,
      showPreviousPeriod,
    ],
  );

  const refreshOpenReportData = React.useCallback(async () => {
    const now = new Date();
    if (
      openRefreshRunningRef.current ||
      loadingCharts ||
      metadataError ||
      !canonicalBaselineReadyRef.current ||
      now < effectivePeriodDates.from ||
      now >= effectivePeriodDates.to
    ) {
      return;
    }

    openRefreshRunningRef.current = true;
    const requestSequence = ++openRefreshRequestSequenceRef.current;
    const definitions = buildScenarioAggregateDefinitions(
      now,
      effectivePeriodDates,
    );
    const requiredChartIds = new Set(
      customWidgets.flatMap((widget) =>
        widget.kind === "scope"
          ? [reportChartIdForGranularity(widget.granularity)]
          : [],
      ),
    );
    const visibleDefinitions = definitions.filter((definition) =>
      requiredChartIds.has(definition.id),
    );
    const previousDefinitions = showPreviousPeriod
      ? visibleDefinitions.map((definition) =>
          buildComparisonDefinition(definition, intradayComparison),
        )
      : [];
    const comparisonRollups = buildComparisonRollups(
      visibleDefinitions,
      previousDefinitions,
      reportCoverageEnd(effectivePeriodDates, now),
      intradayComparison,
    );
    const boundaryDefinitions =
      uniqueComparisonBoundaryDefinitions(comparisonRollups);
    const boundaryDefinitionsToFetch = boundaryDefinitions.filter((definition) => {
      const existing = chartDataRef.current[definition.id];
      return !existing || Boolean(existing.error);
    });
    const openHourDefinition: ScenarioAggregateDefinition = {
      id: COUNTING_HOUR_HISTORY_ID,
      label: "Atualização horária aberta",
      description: "Horas do dia em andamento.",
      granularity: "hour",
      from: startOfDay(now),
      to: endOfAggregateBucket(startOfHour(now), "hour"),
    };
    const currentMinuteDefinition = buildCurrentHourMinutesDefinition(now);

    async function fetchState(
      definition: ScenarioAggregateDefinition,
    ): Promise<ScenarioChartState> {
      try {
        const response = await apiFetch<AggregateEventsResponse>(
          aggregatePath(definition),
        );
        const granularity = requireAggregateGranularity(
          response.granularity,
          definition.granularity,
        );
        return {
          granularity,
          rows: requireAggregateRows(
            response.data,
            granularity,
            DEFAULT_METRIC_TYPE,
          ),
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar o período aberto.",
          granularity: definition.granularity,
          rows: [],
        };
      }
    }

    try {
      const [openHourState, currentMinuteState, boundaryEntries] =
        await Promise.all([
        fetchState(openHourDefinition),
        fetchState(currentMinuteDefinition),
        Promise.all(
          boundaryDefinitionsToFetch.map(async (definition) => [
            definition.id,
            await fetchState(definition),
          ] as const),
        ),
      ]);
      if (
        requestSequence !== openRefreshRequestSequenceRef.current ||
        !canonicalBaselineReadyRef.current
      ) {
        return;
      }

      const next = cloneChartData(chartDataRef.current);
      const canonical = next[COUNTING_HOUR_HISTORY_ID];
      if (!canonical) return;

      const activeBoundaryIds = new Set(
        boundaryDefinitions.map((definition) => definition.id),
      );
      const retainCompletedMinuteBoundaries = comparisonRollups.some(
        ({ definition }) => definition.granularity === "minute",
      );
      Object.keys(next).forEach((id) => {
        if (
          id.startsWith(COMPARISON_BOUNDARY_MINUTES_PREFIX) &&
          !activeBoundaryIds.has(id) &&
          (!retainCompletedMinuteBoundaries || next[id]?.error)
        ) {
          delete next[id];
        }
      });
      boundaryEntries.forEach(([id, state]) => {
        next[id] = state;
      });

      next[CURRENT_HOUR_MINUTES_ID] = currentMinuteState;
      if (openHourState.error) {
        next[COUNTING_HOUR_HISTORY_ID] = {
          ...canonical,
          error: openHourState.error,
        };
      } else {
        next[COUNTING_HOUR_HISTORY_ID] = {
          ...canonical,
          error: undefined,
          rows: reconcileAggregateRows(
            canonical.rows,
            canonical.granularity,
            openHourState.rows,
            openHourState.granularity,
            openHourDefinition.from,
            openHourDefinition.to,
          ),
        };
      }

      const hydrated = hydrateScenarioOpenBuckets(
        next,
        now,
        effectivePeriodDates,
        visibleDefinitions,
        comparisonRollups,
      );
      chartDataRef.current = hydrated;
      setChartData(hydrated);
      setClock(now);
      setLastUpdated(new Date());
    } finally {
      if (requestSequence === openRefreshRequestSequenceRef.current) {
        openRefreshRunningRef.current = false;
      }
    }
  }, [
    customWidgets,
    effectivePeriodDates,
    intradayComparison,
    loadingCharts,
    metadataError,
    showPreviousPeriod,
  ]);

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  React.useEffect(() => {
    chartRequestSequenceRef.current += 1;
    openRefreshRequestSequenceRef.current += 1;
    openRefreshRunningRef.current = false;
    canonicalBaselineReadyRef.current = false;
    setMetadataError("");
    setChartLoadError("");
    setScenarios([]);
    setCameras([]);
    setLocations([]);
    setSubLocations([]);
    setSelectedId("");
    chartDataRef.current = {};
    setChartData({});
    setLastUpdated(null);
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
  }, [companyScopeId, preferenceScope]);

  React.useEffect(() => {
    if (!countingPeriodPending) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setAppliedCountingPeriod(countingPeriod);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [countingPeriod, countingPeriodPending]);

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
    function syncCustomWidgets() {
      setCustomWidgets(loadReportCustomWidgets(companyScopeId, preferenceScope));
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
            ? buildReportCustomWidgetDefaultTitle(nextScope, current.granularity)
            : ""),
      };
    });
  }, [customWidgetScopeOptions]);

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
      openRefreshRequestSequenceRef.current += 1;
      openRefreshRunningRef.current = false;
      canonicalBaselineReadyRef.current = false;
      setChartLoadError("");
      chartDataRef.current = {};
      setChartData({});
      return;
    }

    loadCharts(selectedScope);
  }, [loadCharts, selectedScope]);

  React.useEffect(() => {
    if (!selectedScope) return;

    void refreshOpenReportData();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshOpenReportData();
      }
    }, REPORT_OPEN_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [refreshOpenReportData, selectedScope]);

  function updateShowPreviousPeriod(value: boolean) {
    setShowPreviousPeriod(value);
    saveLiveDashboardSettings({
      intradayComparison,
      showPreviousPeriod: value,
    }, companyScopeId, preferenceScope);
  }

  function updateIntradayComparison(value: IntradayComparisonMode) {
    setIntradayComparison(value);
    saveLiveDashboardSettings({
      intradayComparison: value,
      showPreviousPeriod,
    }, companyScopeId, preferenceScope);
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

  function updateCountingViewSettings(
    patch: Partial<CountingReportViewSettings>,
  ) {
    setCountingViewSettings((current) =>
      saveCountingReportViewSettings(
        { ...current, ...patch },
        companyScopeId,
        preferenceScope,
      ),
    );
  }

  const reportHourHistoryState = chartData[COUNTING_HOUR_HISTORY_ID];
  const reportCertificationError =
    metadataError ||
    chartLoadError ||
    Object.values(chartData).find((state) => state.error)?.error;
  const countingIntelligenceModel = React.useMemo(
    () =>
      selectedScope && !reportCertificationError
        ? buildCountingIntelligenceModel({
            hourlyRows: chartData[COUNTING_HOUR_HISTORY_ID]?.rows ?? [],
            includeOpenPeriod: countingViewSettings.includeOpenPeriod,
            monthlyRows:
              chartData[COUNTING_MONTH_HISTORY_ID]?.rows.length
                ? chartData[COUNTING_MONTH_HISTORY_ID].rows
                : chartData.report_chart_month?.rows ?? [],
            now: clock,
            period: effectivePeriodDates,
            rankingScenarioIds: countingViewSettings.rankingScenarioIds,
            rankingOrder: countingViewSettings.rankingOrder,
            rankingSelectionMode:
              countingViewSettings.rankingSelectionMode,
            scenarios,
            scope: selectedScope,
          })
        : null,
    [
      chartData,
      clock,
      countingViewSettings,
      effectivePeriodDates,
      reportCertificationError,
      scenarios,
      selectedScope,
    ],
  );
  const countingIntelligenceCards = countingIntelligenceModel
    ? buildCountingIntelligenceWidgetCards({
        loading: loadingCharts,
        model: countingIntelligenceModel,
        onRankingScenarioIdsChange: (rankingScenarioIds) =>
          updateCountingViewSettings({ rankingScenarioIds }),
        onRankingOrderChange: (rankingOrder) =>
          updateCountingViewSettings({ rankingOrder }),
        onRankingSelectionModeChange: (rankingSelectionMode) =>
          updateCountingViewSettings({ rankingSelectionMode }),
        rankingOrder: countingViewSettings.rankingOrder,
        rankingScenarioIds: countingViewSettings.rankingScenarioIds,
        rankingSelectionMode: countingViewSettings.rankingSelectionMode,
        scenarios,
      })
    : [];
  const reportComparisonHourlySource =
    React.useMemo<ScenarioComparisonHourlySource | undefined>(() => {
      if (
        reportCertificationError ||
        reportHourHistoryState?.granularity !== "hour" ||
        reportHourHistoryState.error
      ) {
        return undefined;
      }

      const canonicalDefinition =
        buildCountingHourHistoryDefinition(effectivePeriodDates, clock);
      return {
        from: canonicalDefinition.from,
        rows: reportHourHistoryState.rows,
        to: canonicalDefinition.to,
      };
    }, [
      clock,
      effectivePeriodDates,
      reportCertificationError,
      reportHourHistoryState,
    ]);
  const reportComparisonDisabledReason =
    loadingCharts || loadingScenarios
      ? "A base horária canônica do relatório está sendo carregada."
      : reportCertificationError ||
        (!reportComparisonHourlySource
          ? "A base horária canônica do relatório não está disponível."
          : undefined);

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
      selectedScope?.mode === preferredMode ? selectedScope : options[0] ?? null;
    const granularity: ReportCustomWidgetGranularity = "hour";

    setCustomWidgetForm({
      comparisonSettings: createDefaultScenarioComparisonSettings(),
      granularity,
      kind: "scope",
      scopeId: scope?.id ?? "",
      scopeMode: (scope?.mode ?? preferredMode) as ReportCustomWidgetScopeMode,
      title: scope ? buildReportCustomWidgetDefaultTitle(scope, granularity) : "",
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
          defaultSize: "full" as const,
          className: "sm:col-span-2 xl:col-span-4",
          node: (
            <ScenarioComparisonCard
              companyId={companyScopeId}
              description="Compare todos os cenários ou apenas os escolhidos para análise de relatório."
              disabledReason={reportComparisonDisabledReason}
              hourlySource={reportComparisonHourlySource}
              monitorMode={monitorMode}
              periodOverride={reportPeriodOverride}
              preferenceScopeId={selectedScope?.id}
              scenarios={scenarios}
              storageKey="reports"
            />
          ),
        },
      ]
    : [];

  const customWidgetCards = customWidgets.map((widget) => {
    if (widget.kind === "scenario_comparison") {
      return {
        id: `report_custom_${widget.id}`,
        chartTypeEnabled: true,
        label: widget.title,
        defaultSize: "full" as const,
        className: "sm:col-span-2 xl:col-span-4",
        node: (
          <ScenarioComparisonCard
            action={
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
            }
            companyId={companyScopeId}
            disabledReason={reportComparisonDisabledReason}
            hourlySource={reportComparisonHourlySource}
            monitorMode={monitorMode}
            periodOverride={reportPeriodOverride}
            preferenceScopeId={selectedScope?.id}
            scenarios={scenarios}
            storageKey={reportScenarioComparisonStorageKey(widget.id)}
            title={widget.title}
          />
        ),
      };
    }

    const scope = getScopeOptionsForMode(widget.scopeMode).find(
      (option) => option.id === widget.scopeId,
    );
    const definition = buildReportCustomWidgetDefinition(
      widget,
      chartDefinitions,
      scope,
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
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: scope ? (
        <ScenarioAggregateChartCard
          action={
            monitorMode ? null : (
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
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )
          }
          definition={definition}
          loading={loadingCharts}
          previousRows={previousState?.rows ?? []}
          error={
            reportCertificationError ||
            state?.error ||
            (showPreviousPeriod ? previousState?.error : undefined)
          }
          intradayComparison={intradayComparison}
          rows={state?.rows ?? []}
          scope={scope}
          showPreviousPeriod={showPreviousPeriod}
          state={state}
        />
      ) : (
        <MissingReportCustomWidgetCard
          title={widget.title}
          onRemove={monitorMode ? undefined : () => removeCustomWidget(widget.id)}
        />
      ),
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
                ? selectedScope.scenario.lines?.length ?? 0
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
            ? scope.scenario.lines?.length ?? 0
            : scope.cameraIds.length,
        })),
      }
    : null;
  const reportLayoutCards = [
    ...countingIntelligenceCards,
    ...scenarioComparisonCards,
    ...customWidgetCards,
  ];
  const reportCardIds = reportLayoutCards.map((card) => card.id);
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
  const applyReportChartType = React.useCallback(
    (cardId: string, chart: ReportPayload["charts"][number]) => ({
      ...chart,
      option: applyChartTypePreference(
        chart.option,
        reportChartTypeByCardId.get(cardId),
      ),
    }),
    [reportChartTypeByCardId],
  );
  const countingIntelligenceAssets = React.useMemo(
    () =>
      countingIntelligenceModel
        ? buildCountingIntelligenceReportAssets(
            countingIntelligenceModel,
            Object.fromEntries(reportColorByCardId),
          )
        : { charts: [], metrics: [], tables: [] },
    [countingIntelligenceModel, reportColorByCardId],
  );
  const visibleReportCardIds = React.useMemo(() => {
    const cardIdSet = new Set(reportCardIdsKey ? reportCardIdsKey.split("|") : []);
    const preferenceIds = new Set(reportPreferences.map((preference) => preference.id));
    const ordered = reportPreferences
      .filter((preference) => preference.visible && cardIdSet.has(preference.id))
      .map((preference) => preference.id);
    const missing = Array.from(cardIdSet).filter((id) => !preferenceIds.has(id));

    return [...ordered, ...missing];
  }, [reportCardIdsKey, reportPreferences]);
  const customReportChartEntries = customWidgets
    .filter(
      (widget): widget is ReportScopeCustomWidget => widget.kind === "scope",
    )
    .map((widget): readonly [string, ReportPayload["charts"][number]] | null => {
      const scope = getScopeOptionsForMode(widget.scopeMode).find(
        (option) => option.id === widget.scopeId,
      );
      if (!scope) return null;

      const definition = buildReportCustomWidgetDefinition(
        widget,
        chartDefinitions,
        scope,
      );
      const state = chartStateForReportGranularity(chartData, widget.granularity);
      const previousState = chartStateForReportGranularity(
        chartData,
        widget.granularity,
        true,
      );

      const cardId = `report_custom_${widget.id}`;
      return [
        cardId,
        applyReportChartType(
          cardId,
          buildScenarioReportChart(
            definition,
            state?.rows ?? [],
            previousState?.rows ?? [],
            scope,
            showPreviousPeriod,
            intradayComparison,
            reportColorByCardId.get(cardId),
          ),
        ),
      ] as const;
    })
    .filter(
      (entry): entry is readonly [string, ReportPayload["charts"][number]] =>
        Boolean(entry),
    );
  const countingIntelligenceChartEntries: Array<
    readonly [string, ReportPayload["charts"][number]]
  > = countingIntelligenceAssets.charts.map(({ cardId, value }) => [
    cardId,
    applyReportChartType(cardId, value),
  ] as const);
  const visibleMetricByCardId = new Map<string, ReportMetric>(
    countingIntelligenceAssets.metrics.map(
      ({ cardId, value }) => [cardId, value] as const,
    ),
  );
  const visibleTableEntries: Array<readonly [string, ReportTable]> =
    countingIntelligenceAssets.tables.map(
      ({ cardId, value }) => [cardId, value] as const,
    );
  if (scenarioDetailTable) {
    visibleTableEntries.push(["report_scenario_detail", scenarioDetailTable]);
  }
  if (scopeListTable) {
    visibleTableEntries.push(["report_scenario_table", scopeListTable]);
  }
  const visibleTablesByCardId = new Map<string, ReportTable[]>();
  visibleTableEntries.forEach(([cardId, table]) => {
    const current = visibleTablesByCardId.get(cardId) ?? [];
    current.push(table);
    visibleTablesByCardId.set(cardId, current);
  });

  function composeScenarioReportPayload({
    charts,
    metrics,
    tables,
  }: {
    charts: ReportPayload["charts"];
    metrics: ReportMetric[];
    tables: ReportTable[];
  }): ReportPayload {
    return {
      title: selectedScope
        ? `Relatório de Contagem - ${selectedScope.name}`
        : "Relatório de Contagem",
      subtitle: "Resultados de contagem por visão e períodos agregados.",
      filename: `ipxdata-relatorio-contagem-${reportDateSlug(lastUpdated ?? clock)}`,
      generatedAt: lastUpdated ?? clock,
      dataCompleteUntil: clock,
      context: [
        selectedScope
          ? `${scopeModeLabel(selectedScope.mode)}: ${selectedScope.name}`
          : "",
        showPreviousPeriod
          ? `Comparativo: ${intradayComparison === "last_week" ? "semana passada" : "ontem"}`
          : "Sem período anterior",
        `Período aplicado a todo o relatório: ${reportPeriodOverride.label}`,
        "Impressão preservando ordem, visibilidade e cores dos widgets; dimensões adaptadas ao papel.",
      ].filter(Boolean),
      metrics,
      charts,
      tables,
    };
  }

  async function buildConfiguredScenarioReportPayload() {
    const chartByCardId = new Map<string, ReportPayload["charts"][number]>([
      ...countingIntelligenceChartEntries,
      ...customReportChartEntries,
    ]);

    if (
      visibleReportCardIds.includes("report_scenario_period_comparison") &&
      scenarios.length
    ) {
      const settings = loadScenarioComparisonSettings(
        "reports",
        companyScopeId,
        preferenceScope,
      );
      const definition = buildScenarioComparisonDefinition(
        settings,
        new Date(),
        reportPeriodOverride,
      );
      const rows = await fetchScenarioComparisonRows(
        definition,
        reportComparisonHourlySource,
      );
      const reportChart = buildScenarioComparisonReportChart({
        definition,
        rows,
        scenarios,
        settings,
        periodLabelOverride: reportPeriodOverride.label,
        widgetColor: reportColorByCardId.get(
          "report_scenario_period_comparison",
        ),
      });
      chartByCardId.set(
        "report_scenario_period_comparison",
        applyReportChartType(
          "report_scenario_period_comparison",
          reportChart,
        ),
      );
    }

    await Promise.all(
      customWidgets
        .filter(
          (widget) =>
            widget.kind === "scenario_comparison" &&
            visibleReportCardIds.includes(`report_custom_${widget.id}`),
        )
        .map(async (widget) => {
          const storageKey = reportScenarioComparisonStorageKey(widget.id);
          const settings = loadScenarioComparisonSettings(
            storageKey,
            companyScopeId,
            preferenceScope,
          );
          const definition = buildScenarioComparisonDefinition(
            settings,
            new Date(),
            reportPeriodOverride,
          );
          const rows = await fetchScenarioComparisonRows(
            definition,
            reportComparisonHourlySource,
          );
          const cardId = `report_custom_${widget.id}`;
          const reportChart = buildScenarioComparisonReportChart({
            definition,
            rows,
            scenarios,
            settings,
            periodLabelOverride: reportPeriodOverride.label,
            title: widget.title,
            widgetColor: reportColorByCardId.get(cardId),
          });
          chartByCardId.set(
            cardId,
            applyReportChartType(cardId, reportChart),
          );
        }),
    );

    return composeScenarioReportPayload({
      charts: visibleReportCardIds
        .map((id) => chartByCardId.get(id))
        .filter((chart): chart is ReportPayload["charts"][number] => Boolean(chart)),
      metrics: visibleReportCardIds
        .map((id) => visibleMetricByCardId.get(id))
        .filter((metric): metric is ReportMetric => Boolean(metric)),
      tables: visibleReportCardIds
        .flatMap((id) => visibleTablesByCardId.get(id) ?? []),
    });
  }

  const reportChartByCardId = new Map<string, ReportPayload["charts"][number]>([
    ...countingIntelligenceChartEntries,
    ...customReportChartEntries,
  ]);
  const scenarioReportPayload = composeScenarioReportPayload({
    charts: reportCardIds
      .map((id) => reportChartByCardId.get(id))
      .filter((chart): chart is ReportPayload["charts"][number] => Boolean(chart)),
    metrics: reportCardIds
      .map((id) => visibleMetricByCardId.get(id))
      .filter((metric): metric is ReportMetric => Boolean(metric)),
    tables: reportCardIds.flatMap(
      (id) => visibleTablesByCardId.get(id) ?? [],
    ),
  });

  return (
    <section
      id="relatorios"
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-screen overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "scroll-mt-6 space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}
      {reportCertificationError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Dados não certificados: {reportCertificationError} Os valores
          afetados e as exportações não devem ser considerados conclusivos.
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
      <div className="rounded-md border border-border bg-card p-4 shadow-soft">
        {loadingScenarios ? (
          <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        ) : scopeOptions.length ? (
          <div className="space-y-4">
            <CountingReportPeriodControl
              disabled={loadingCharts}
              includeOpenPeriod={countingViewSettings.includeOpenPeriod}
              value={countingPeriod}
              onChange={updateCountingPeriod}
              onIncludeOpenPeriodChange={(includeOpenPeriod) =>
                updateCountingViewSettings({ includeOpenPeriod })
              }
            />
            <div className="grid gap-4 border-t pt-4 2xl:grid-cols-[minmax(340px,1.25fr)_minmax(420px,1fr)]">
              <div className="grid min-w-0 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Visão</div>
                  <Select
                    value={scopeMode}
                    onValueChange={(value) => {
                      setScopeMode(value as ReportScopeMode);
                      setSelectedId("");
                    }}
                  >
                    <SelectTrigger className="bg-card">
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
                  <div className="text-sm font-medium">
                    {scopeModeLabel(scopeMode)}
                  </div>
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger className="bg-card">
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

              <div className="space-y-3 2xl:border-l 2xl:pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1 bg-card">
                    <BarChart3 className="h-3.5 w-3.5" />
                    {scopeModeLabel(scopeMode)}
                  </Badge>
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
                  {lastUpdated ? (
                    <Badge variant="outline" className="gap-1 bg-card">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatTime(lastUpdated)}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={loadingCharts || !selectedScope}
                    onClick={() => {
                      if (selectedScope) void loadCharts(selectedScope);
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
                        enabled={layoutReorderMode}
                        onChange={setLayoutReorderMode}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setLayoutOrganizerOpen(true)}
                        aria-label="Configurar widgets"
                        title="Configurar widgets"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                  <ReportExportActions
                    payload={scenarioReportPayload}
                    getPayload={buildConfiguredScenarioReportPayload}
                    disabled={
                      countingPeriodPending ||
                      loadingCharts ||
                      loadingScenarios ||
                      !selectedScope ||
                      Boolean(reportComparisonDisabledReason)
                    }
                  />
                  <MonitorModeButton
                    onClick={enterMonitorMode}
                    disabled={!scopeOptions.length}
                  />
                </div>
              </div>
            </div>
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
              <Label>Tipo de widget</Label>
              <Select
                value={customWidgetForm.kind}
                onValueChange={handleCustomWidgetKindChange}
              >
                <SelectTrigger>
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
                    <Label>Tipo de visão</Label>
                    <Select
                      value={customWidgetForm.scopeMode}
                      onValueChange={handleCustomWidgetModeChange}
                    >
                      <SelectTrigger>
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
                    <Label>{scopeModeLabel(customWidgetForm.scopeMode)}</Label>
                    <Select
                      value={customWidgetForm.scopeId}
                      onValueChange={handleCustomWidgetScopeChange}
                      disabled={!customWidgetScopeOptions.length}
                    >
                      <SelectTrigger>
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
                  <Label>Gráfico</Label>
                  <Select
                    value={customWidgetForm.granularity}
                    onValueChange={handleCustomWidgetGranularityChange}
                  >
                    <SelectTrigger>
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {definition.label}
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          {action}
        </div>
        {showPreviousPeriod ? (
          <div className="max-w-full break-words rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-5 text-primary">
            {comparisonDescription(definition, intradayComparison)}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : error || state?.error ? (
          <EmptyChartState text={error || state?.error || "Dados não certificados."} />
        ) : hasData ? (
          <div className="h-[300px] w-full">
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {title || "Widget personalizado"}
            </CardTitle>
            <CardDescription>
              A visão vinculada a este widget não está mais disponível.
            </CardDescription>
          </div>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label="Remover widget"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <EmptyChartState text="Selecione outro widget ou remova este card." />
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
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition",
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
      <SelectTrigger className="h-9 w-full min-w-[190px] bg-card text-xs sm:w-[190px]">
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
      { id: "report_chart_minute", label: "Minuto a minuto", granularity: "minute" },
      { id: "report_chart_hour", label: "Hora a hora", granularity: "hour" },
      { id: "report_chart_day", label: "Dia a dia", granularity: "day" },
      { id: "report_chart_week", label: "Semana a semana", granularity: "week" },
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
          ? `Todo o período selecionado, com granularidade ajustada para ${aggregateGranularityLabel(
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

  return [
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
      description: "Últimos 5 anos.",
      granularity: "year",
      from: addYears(currentYearStart, -4),
      to: addYears(currentYearStart, 1),
    },
  ];
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

function buildCountingHourHistoryDefinition(period: {
  from: Date;
  to: Date;
}, now: Date): ScenarioAggregateDefinition {
  return {
    id: COUNTING_HOUR_HISTORY_ID,
    label: "Histórico horário de contagem",
    description:
      "Base horária do período selecionado e do comparativo anual.",
    granularity: "hour",
    from: startOfYear(addYears(period.from, -1)),
    to: alignEndToGranularity(reportCoverageEnd(period, now), "hour"),
  };
}

function reportCoverageEnd(
  period: { from: Date; to: Date },
  now: Date,
) {
  return now >= period.from && now < period.to
    ? addMinutes(startOfMinute(now), 1)
    : period.to;
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
      buildReportCustomWidgetDefaultTitleFromName(scopeName, widget.granularity),
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
): ScenarioAggregateDefinition {
  const comparisonStarts = listScenarioBucketStarts(definition).map((date) =>
    comparisonBucketStart(date, definition.granularity, intradayComparison),
  );
  const from = comparisonStarts.length
    ? new Date(Math.min(...comparisonStarts.map((date) => date.getTime())))
    : definition.from;
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

function comparisonRangeEnd(
  definition: ScenarioAggregateDefinition,
  periodTo: Date,
  intradayComparison: IntradayComparisonMode,
) {
  const currentTo = new Date(
    Math.min(definition.to.getTime(), periodTo.getTime()),
  );
  if (
    definition.granularity === "minute" ||
    definition.granularity === "hour"
  ) {
    return addDays(
      currentTo,
      intradayComparison === "last_week" ? -7 : -1,
    );
  }
  if (definition.granularity === "day") {
    return addDays(currentTo, -7);
  }
  if (definition.granularity === "week") {
    const currentBucketStart = startOfWeek(
      new Date(currentTo.getTime() - 1),
    );
    const comparisonStart =
      equivalentWeekInPreviousMonth(currentBucketStart);
    const calendarDays = Math.round(
      (Date.UTC(
        currentTo.getFullYear(),
        currentTo.getMonth(),
        currentTo.getDate(),
      ) -
        Date.UTC(
          currentBucketStart.getFullYear(),
          currentBucketStart.getMonth(),
          currentBucketStart.getDate(),
        )) /
        DAY_MS,
    );
    const comparisonTo = addDays(comparisonStart, calendarDays);
    comparisonTo.setHours(
      currentTo.getHours(),
      currentTo.getMinutes(),
      currentTo.getSeconds(),
      currentTo.getMilliseconds(),
    );
    return comparisonTo;
  }

  return addYears(currentTo, -1);
}

function buildComparisonRollups(
  currentDefinitions: ScenarioAggregateDefinition[],
  previousDefinitions: ScenarioAggregateDefinition[],
  coverageTo: Date,
  intradayComparison: IntradayComparisonMode,
): ReportComparisonRollup[] {
  return previousDefinitions.map((definition, index) => {
    const currentDefinition = currentDefinitions[index];
    const to = new Date(
      Math.min(
        definition.to.getTime(),
        comparisonRangeEnd(
          currentDefinition,
          coverageTo,
          intradayComparison,
        ).getTime(),
      ),
    );

    return {
      boundaryDefinition: buildComparisonBoundaryMinutesDefinition(
        definition,
        to,
      ),
      definition,
      to,
    };
  });
}

function buildComparisonBoundaryMinutesDefinition(
  definition: ScenarioAggregateDefinition,
  to: Date,
): ScenarioAggregateDefinition | undefined {
  if (to <= definition.from) return undefined;

  const alignedHour = startOfHour(to);
  const boundaryStart =
    alignedHour.getTime() === to.getTime()
      ? definition.granularity === "minute"
        ? startOfHour(new Date(to.getTime() - 1))
        : undefined
      : alignedHour;
  if (!boundaryStart) return undefined;

  return {
    id: `${COMPARISON_BOUNDARY_MINUTES_PREFIX}${boundaryStart.getTime()}`,
    label: "Minutos da fronteira comparativa",
    description:
      "Base fechada para aplicar ao comparativo o mesmo minuto decorrido.",
    granularity: "minute",
    from: boundaryStart,
    to: endOfAggregateBucket(boundaryStart, "hour"),
  };
}

function uniqueComparisonBoundaryDefinitions(
  rollups: ReportComparisonRollup[],
) {
  return Array.from(
    new Map(
      rollups.flatMap(({ boundaryDefinition }) =>
        boundaryDefinition
          ? [[boundaryDefinition.id, boundaryDefinition] as const]
          : [],
      ),
    ).values(),
  );
}

function previousId(id: string) {
  return `${id}${PREVIOUS_SUFFIX}`;
}

function aggregatePath(definition: ScenarioAggregateDefinition) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: aggregateQueryIso(definition.from, definition.granularity),
    to: aggregateQueryIso(definition.to, definition.granularity),
    metric_type: DEFAULT_METRIC_TYPE,
  });

  return `/analytics/aggregate?${params.toString()}`;
}

function hydrateScenarioOpenBuckets(
  data: Record<string, ScenarioChartState>,
  now: Date,
  period: { from: Date; to: Date },
  currentDefinitions: ScenarioAggregateDefinition[] = [],
  comparisonRollups: ReportComparisonRollup[] = [],
) {
  const next = cloneChartData(data);
  const includesNow = now >= period.from && now < period.to;

  const currentHourStart = startOfHour(now);
  const currentMinuteState = next[CURRENT_HOUR_MINUTES_ID];
  const currentMinuteRows = currentMinuteState?.rows ?? [];
  const currentMinuteGranularity =
    currentMinuteState?.granularity ?? "minute";
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

  const periodHourState = next[COUNTING_HOUR_HISTORY_ID];
  if (!periodHourState || periodHourState.error) return next;

  const periodHourRows = periodHourState?.rows ?? [];
  const periodSourceGranularity = periodHourState?.granularity ?? "hour";
  const canonicalDefinition = buildCountingHourHistoryDefinition(period, now);
  const comparisonFrom = canonicalDefinition.from;
  const comparisonTo = canonicalDefinition.to;

  Object.entries(next).forEach(([chartId, state]) => {
    if (
      chartId.startsWith("report_chart_") &&
      !chartId.endsWith(PREVIOUS_SUFFIX) &&
      state.granularity === "hour"
    ) {
      next[chartId] = {
        ...state,
        rows: reconcileAggregateRows(
          state.rows,
          "hour",
          periodHourRows,
          periodSourceGranularity,
          period.from,
          comparisonTo,
        ),
      };
    }
  });

  const rollups = rollupAggregateRowsMany(
    periodHourRows,
    periodSourceGranularity,
    ["day", "week", "month", "semester", "year"],
    comparisonFrom,
    comparisonTo,
  );

  const dailyState = next[CURRENT_MONTH_DAYS_ID] ?? {
    granularity: "day" as const,
    rows: [],
  };
  next[CURRENT_MONTH_DAYS_ID] = {
    ...dailyState,
    rows: reconcileAggregateRows(
      dailyState.rows,
      "day",
      rollups.get("day") ?? [],
      "day",
      period.from,
      period.to,
    ),
  };

  const monthHistory = next[COUNTING_MONTH_HISTORY_ID] ?? {
    granularity: "month" as const,
    rows: [],
  };
  next[COUNTING_MONTH_HISTORY_ID] = {
    ...monthHistory,
    rows: reconcileAggregateRows(
      monthHistory.rows,
      "month",
      rollups.get("month") ?? [],
      "month",
      startOfMonth(comparisonFrom),
      alignEndToGranularity(comparisonTo, "month"),
    ),
  };

  Object.entries(next).forEach(([chartId, state]) => {
    if (
      !chartId.startsWith("report_chart_") ||
      chartId.endsWith(PREVIOUS_SUFFIX) ||
      state.granularity === "minute" ||
      state.granularity === "hour"
    ) {
      return;
    }

    const sourceRows = rollups.get(state.granularity) ?? [];
    next[chartId] = {
      ...state,
      rows: reconcileAggregateRows(
        state.rows,
        state.granularity,
        sourceRows,
        state.granularity,
        alignToGranularity(period.from, state.granularity),
        alignEndToGranularity(period.to, state.granularity),
      ),
    };
  });

  reconcileCurrentReportDefinitions(
    next,
    periodHourState,
    currentDefinitions,
    reportCoverageEnd(period, now),
  );
  reconcileComparisonRollups(next, periodHourState, comparisonRollups);

  return next;
}

function reconcileCurrentReportDefinitions(
  data: Record<string, ScenarioChartState>,
  canonicalHourState: ScenarioChartState,
  definitions: ScenarioAggregateDefinition[],
  coverageTo: Date,
) {
  definitions.forEach((definition) => {
    const target = data[definition.id];
    if (!target) return;

    if (definition.granularity === "minute") {
      if (target.granularity !== "minute") {
        data[definition.id] = {
          ...target,
          error:
            "A granularidade minuto a minuto exige uma nova carga certificada.",
          granularity: "minute",
          rows: [],
        };
      }
      return;
    }

    const to = new Date(
      Math.min(definition.to.getTime(), coverageTo.getTime()),
    );
    data[definition.id] = {
      ...target,
      error: undefined,
      granularity: definition.granularity,
      rows: rollupAggregateRows(
        canonicalHourState.rows,
        canonicalHourState.granularity,
        definition.granularity,
        definition.from,
        to,
      ),
    };
  });
}

function reconcileComparisonRollups(
  data: Record<string, ScenarioChartState>,
  canonicalHourState: ScenarioChartState,
  rollups: ReportComparisonRollup[],
) {
  rollups.forEach(({ boundaryDefinition, definition, to }) => {
    const target = data[definition.id];
    if (!target) return;

    if (to <= definition.from) {
      data[definition.id] = {
        ...target,
        comparisonBaseError: undefined,
        error: undefined,
        granularity: definition.granularity,
        rows: [],
      };
      return;
    }

    const boundaryState = boundaryDefinition
      ? data[boundaryDefinition.id]
      : undefined;
    if (boundaryDefinition && (!boundaryState || boundaryState.error)) {
      data[definition.id] = {
        ...target,
        comparisonBaseError:
          target.comparisonBaseError ?? target.error ?? null,
        error:
          boundaryState?.error ??
          "A base minuto a minuto da fronteira comparativa não foi carregada.",
        granularity: definition.granularity,
        rows: target.rows,
      };
      return;
    }

    if (definition.granularity === "minute") {
      if (target.error && target.comparisonBaseError === undefined) return;

      let rows = target.rows;
      Object.entries(data).forEach(([id, state]) => {
        if (
          !id.startsWith(COMPARISON_BOUNDARY_MINUTES_PREFIX) ||
          state.error
        ) {
          return;
        }

        const boundaryTimestamp = Number(
          id.slice(COMPARISON_BOUNDARY_MINUTES_PREFIX.length),
        );
        if (!Number.isFinite(boundaryTimestamp)) return;
        const boundaryFrom = new Date(boundaryTimestamp);
        const boundaryTo = endOfAggregateBucket(boundaryFrom, "hour");
        const from = new Date(
          Math.max(boundaryFrom.getTime(), definition.from.getTime()),
        );
        const rangeTo = new Date(
          Math.min(boundaryTo.getTime(), to.getTime()),
        );
        if (from >= rangeTo) return;

        rows = reconcileAggregateRows(
          rows,
          "minute",
          state.rows,
          state.granularity,
          from,
          rangeTo,
        );
      });

      data[definition.id] = {
        ...target,
        comparisonBaseError: undefined,
        error: target.comparisonBaseError ?? undefined,
        granularity: definition.granularity,
        rows,
      };
      return;
    }

    let sourceRows = canonicalHourState.rows;
    if (boundaryDefinition && boundaryState) {
      sourceRows = reconcileAggregateRows(
        sourceRows,
        canonicalHourState.granularity,
        boundaryState.rows,
        boundaryState.granularity,
        boundaryDefinition.from,
        to,
      );
    }

    data[definition.id] = {
      ...target,
      comparisonBaseError: undefined,
      error: undefined,
      granularity: definition.granularity,
      rows: rollupAggregateRows(
        sourceRows,
        canonicalHourState.granularity,
        definition.granularity,
        definition.from,
        to,
      ),
    };
  });
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
) {
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<unknown>(`/locations/${location.id}/sub-locations`).then(
        requireSubLocationRows,
      ),
    ),
  );

  return filterScopedApiRows(
    requireSubLocationRows(rows.flat()),
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
    modes.push({ label: "Location", value: "location" });
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
    modes.push({ label: "Sub-location", value: "sub_location" });
  }

  return modes;
}

function scopeModeLabel(mode: ReportScopeMode) {
  if (mode === "location") return "Location";
  if (mode === "sub_location") return "Sub-location";
  return "Cenário";
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
    const key = bucketKeyForGranularity(comparisonStart, definition.granularity);

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
  if (scope.scenario) {
    return aggregateScenarioRowsByBucket(rows, scope.scenario, granularity);
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

  return starts;
}

function aggregateScenarioRowsByBucket(
  rows: AggregateEventRow[],
  scenario: Scenario,
  granularity: AggregateGranularity,
) {
  const multipliers = new Map(
    scenario.lines
      ?.filter((line) => line.action_multiplier !== 0)
      .map((line) => [line.line_count_id, line.action_multiplier]) ?? [],
  );
  const totals = new Map<number, number>();

  rows.forEach((row) => {
    if (!row.line_count_id) return;

    const multiplier = multipliers.get(row.line_count_id);
    if (multiplier === undefined) return;

    const date = parseAggregateBucket(row.bucket, granularity);
    if (!date) return;

    const key = bucketKeyForGranularity(date, granularity);
    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0) * multiplier);
  });

  return totals;
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
  if (definition.granularity === "minute" || definition.granularity === "hour") {
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
  if (definition.granularity === "semester") return "Mesmo semestre do ano anterior";
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
    color: showPreviousSeries ? [widgetColor, "#B7C7DA"] : [widgetColor],
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
                definition.granularity === "minute" || definition.granularity === "hour"
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
          definition.granularity === "minute" || definition.granularity === "hour"
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
  const previousColumnLabel = comparisonSeriesName(definition, intradayComparison);
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
        period_start: formatDateTime(point.bucket),
        weekday: showWeekday ? weekdayName(new Date(point.bucket)) : undefined,
        previous: showPreviousPeriod ? previousPoints[index]?.total ?? 0 : undefined,
        previous_reference:
          showPreviousPeriod && previousPoints[index]
            ? comparisonReferenceLabel(
                definition.granularity,
                new Date(point.bucket),
                new Date(previousPoints[index].bucket),
                intradayComparison,
              )
            : undefined,
        week_of_month: showWeekOfMonth
          ? weekOfMonthLabel(new Date(point.bucket), false)
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
  if (definition.granularity === "minute" || definition.granularity === "hour") {
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
) {
  if (granularity === "minute" || granularity === "hour") {
    return intradayComparison === "last_week"
      ? `${weekdayName(previousDate)} da semana passada (${formatShortDate(previousDate)})`
      : `Ontem, ${weekdayName(previousDate)} (${formatShortDate(previousDate)})`;
  }
  if (granularity === "day") {
    return `${weekdayName(previousDate)} anterior (${formatShortDate(previousDate)})`;
  }
  if (granularity === "week") {
    return `${weekOfMonthLabel(previousDate, false)} de ${monthYearLabel(previousDate)}`;
  }
  if (granularity === "month") {
    return `Mesmo mês em ${previousDate.getFullYear()}`;
  }
  if (granularity === "semester") {
    return `Mesmo semestre em ${previousDate.getFullYear()}`;
  }

  return `${currentDate.getFullYear() - 1}`;
}

function weekOfMonthLabel(date: Date, compact: boolean) {
  const index = weekOfMonthIndex(date) + 1;
  const suffix = compact ? "sem." : "semana";
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: compact ? "short" : "long",
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

function weekdayName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
}

function weekdayShortName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
}

function monthYearLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
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

function bucketKeyForGranularity(date: Date, granularity: AggregateGranularity) {
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
  if (granularity === "hour") return `${String(date.getHours()).padStart(2, "0")}h`;
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

function reportDateSlug(date: Date) {
  return date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
}
