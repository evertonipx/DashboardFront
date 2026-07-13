"use client";

import * as React from "react";
import {
  BarChart3,
  Clock3,
  FileText,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { CardLayout } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import {
  ScenarioComparisonCard,
  buildScenarioComparisonDefinition,
  buildScenarioComparisonReportChart,
  fetchScenarioComparisonRows,
  loadScenarioComparisonSettings,
} from "@/components/app/scenario-comparison-card";
import { useCardPreferences } from "@/components/app/use-card-preferences";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
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
} from "@/lib/master-company-scope";
import {
  deleteReportCustomWidget,
  loadReportCustomWidgets,
  REPORT_CUSTOM_WIDGETS_UPDATED_EVENT,
  upsertReportCustomWidget,
  type ReportCustomWidget,
  type ReportCustomWidgetGranularity,
  type ReportCustomWidgetScopeMode,
} from "@/lib/report-custom-widgets";
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
  granularity: ReportCustomWidgetGranularity;
  scopeId: string;
  scopeMode: ReportCustomWidgetScopeMode;
  title: string;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_METRIC_TYPE = "count";
const PREVIOUS_SUFFIX = "__previous";
const CURRENT_MONTH_DAYS_ID = "report_current_month_days";
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
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState(
    () => loadLiveDashboardSettings(companyScopeId).showPreviousPeriod,
  );
  const [intradayComparison, setIntradayComparison] =
    React.useState<IntradayComparisonMode>(
      () => loadLiveDashboardSettings(companyScopeId).intradayComparison,
    );
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());
  const [customWidgets, setCustomWidgets] = React.useState<ReportCustomWidget[]>(
    [],
  );
  const [customWidgetDialogOpen, setCustomWidgetDialogOpen] =
    React.useState(false);
  const [customWidgetForm, setCustomWidgetForm] =
    React.useState<ReportCustomWidgetForm>({
      granularity: "hour",
      scopeId: "",
      scopeMode: "scenario",
      title: "",
    });

  const chartDefinitions = React.useMemo(
    () => buildScenarioAggregateDefinitions(clock),
    [clock],
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

  const loadScenarios = React.useCallback(async () => {
    setLoadingScenarios(true);
    try {
      const [data, cameraRows, locationRows] = await Promise.all([
        apiFetch<Scenario[]>("/scenarios"),
        apiFetch<Camera[]>("/cameras").catch(() => []),
        apiFetch<Location[]>("/locations").catch(() => []),
      ]);
      const scopedScenarios = filterScopedApiRows(data, companyScopeId);
      const scopedCameras = filterScopedApiRows(cameraRows, companyScopeId);
      const scopedLocations = filterScopedApiRows(locationRows, companyScopeId);
      const subLocationRows = await fetchSubLocations(
        scopedLocations,
        companyScopeId,
      );
      const visible = manager
        ? scopedScenarios
        : scopedScenarios.filter((scenario) => scenario.active);

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
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as visões de relatório.",
      );
    } finally {
      setLoadingScenarios(false);
    }
  }, [cameraGroups, companyScopeId, manager, scopeMode]);

  const loadCharts = React.useCallback(
    async (_scope: ReportScopeOption, silent = false) => {
      if (!silent) setLoadingCharts(true);
      else setRefreshing(true);

      const now = new Date();
      const definitions = buildScenarioAggregateDefinitions(now);
      const previousDefinitions = showPreviousPeriod
        ? definitions.map((definition) =>
            buildComparisonDefinition(definition, intradayComparison),
          )
        : [];
      const supportDefinitions = [buildCurrentMonthDaysDefinition(now)];

      try {
        const entries = await Promise.all(
          [...definitions, ...previousDefinitions, ...supportDefinitions].map(async (definition) => {
            try {
              const response = await apiFetch<AggregateEventsResponse>(
                aggregatePath(definition),
              );
              return [
                definition.id,
                {
                  rows: response.data ?? [],
                  granularity: response.granularity ?? definition.granularity,
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

        setChartData(hydrateScenarioOpenBuckets(Object.fromEntries(entries), now));
        setClock(now);
        setLastUpdated(new Date());
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os relatórios.",
        );
      } finally {
        setLoadingCharts(false);
        setRefreshing(false);
      }
    },
    [intradayComparison, showPreviousPeriod],
  );

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  React.useEffect(() => {
    const settings = loadLiveDashboardSettings(companyScopeId);
    setShowPreviousPeriod(settings.showPreviousPeriod);
    setIntradayComparison(settings.intradayComparison);
    setChartData({});
  }, [companyScopeId]);

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
      setCustomWidgets(loadReportCustomWidgets(companyScopeId));
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
  }, [companyScopeId]);

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
      setChartData({});
      return;
    }

    loadCharts(selectedScope);
  }, [loadCharts, selectedScope]);

  function updateShowPreviousPeriod(value: boolean) {
    setShowPreviousPeriod(value);
    saveLiveDashboardSettings({
      intradayComparison,
      showPreviousPeriod: value,
    }, companyScopeId);
  }

  function updateIntradayComparison(value: IntradayComparisonMode) {
    setIntradayComparison(value);
    saveLiveDashboardSettings({
      intradayComparison: value,
      showPreviousPeriod,
    }, companyScopeId);
  }

  const pointsByDefinition = React.useMemo(
    () =>
      Object.fromEntries(
        chartDefinitions.map((definition) => [
          definition.id,
          selectedScope
            ? buildReportScopeAggregatePoints(
                definition,
                chartData[definition.id]?.rows ?? [],
                selectedScope,
              )
            : [],
        ]),
      ) as Record<string, ChartPoint[]>,
    [chartData, chartDefinitions, selectedScope],
  );
  const todayTotal = sumPoints(pointsByDefinition.report_chart_hour ?? []);
  const lastHourTotal = sumPoints(pointsByDefinition.report_chart_minute ?? []);
  const lastSevenDaysTotal = sumPoints(pointsByDefinition.report_chart_day ?? []);
  const activeScopeCount = scopeOptions.length;

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
      granularity,
      scopeId: scope?.id ?? "",
      scopeMode: (scope?.mode ?? preferredMode) as ReportCustomWidgetScopeMode,
      title: scope ? buildReportCustomWidgetDefaultTitle(scope, granularity) : "",
    });
    setCustomWidgetDialogOpen(true);
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
        scopeId: scope.id,
        scopeMode: scope.mode as ReportCustomWidgetScopeMode,
        scopeName: scope.name,
        title,
      },
      companyScopeId,
    );

    setCustomWidgets(nextWidgets);
    setCustomWidgetDialogOpen(false);
    toast.success("Widget adicionado aos relatórios.");
  }

  function removeCustomWidget(widgetId: string) {
    const nextWidgets = deleteReportCustomWidget(widgetId, companyScopeId);
    setCustomWidgets(nextWidgets);
    toast.success("Widget removido.");
  }

  const metricCards = [
    {
      id: "report_today_total",
      label: "Resultado hoje",
      defaultSize: "compact" as const,
      reportMetric: {
        label: "Resultado hoje",
        value: formatNumber(todayTotal),
        description: "00:00 até agora",
      } satisfies ReportMetric,
      node: (
        <ReportMetricCard
          icon={TrendingUp}
          label="Resultado hoje"
          value={todayTotal}
          loading={loadingCharts}
          description="00:00 até agora"
        />
      ),
    },
    {
      id: "report_last_hour",
      label: "Última hora",
      defaultSize: "compact" as const,
      reportMetric: {
        label: "Última hora",
        value: formatNumber(lastHourTotal),
        description: "Últimos 60 minutos",
      } satisfies ReportMetric,
      node: (
        <ReportMetricCard
          icon={Clock3}
          label="Última hora"
          value={lastHourTotal}
          loading={loadingCharts}
          description="últimos 60 minutos"
        />
      ),
    },
    {
      id: "report_last_7d",
      label: "Últimos 7 dias",
      defaultSize: "compact" as const,
      reportMetric: {
        label: "Últimos 7 dias",
        value: formatNumber(lastSevenDaysTotal),
        description: "Inclui hoje",
      } satisfies ReportMetric,
      node: (
        <ReportMetricCard
          icon={BarChart3}
          label="Últimos 7 dias"
          value={lastSevenDaysTotal}
          loading={loadingCharts}
          description="inclui hoje"
        />
      ),
    },
    {
      id: "report_scenario_count",
      label: "Visões disponíveis",
      defaultSize: "compact" as const,
      reportMetric: {
        label: "Visões disponíveis",
        value: formatNumber(activeScopeCount),
        description: scopeModeLabel(scopeMode),
      } satisfies ReportMetric,
      node: (
        <ReportMetricCard
          icon={Route}
          label="Visões disponíveis"
          value={activeScopeCount}
          loading={loadingScenarios}
          description={scopeModeLabel(scopeMode)}
        />
      ),
    },
  ];

  const scenarioComparisonCards = scenarios.length
    ? [
        {
          id: "report_scenario_period_comparison",
          label: "Cenários por período",
          defaultSize: "full" as const,
          className: "sm:col-span-2 xl:col-span-4",
          node: (
            <ScenarioComparisonCard
              companyId={companyScopeId}
              description="Compare todos os cenários ou apenas os escolhidos para análise de relatório."
              monitorMode={monitorMode}
              scenarios={scenarios}
              storageKey="reports"
            />
          ),
        },
      ]
    : [];

  const chartCards = chartDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    defaultSize: "wide" as const,
    className: "sm:col-span-2 xl:col-span-2",
    node: selectedScope ? (
      <ScenarioAggregateChartCard
        definition={definition}
        loading={loadingCharts}
        previousRows={chartData[previousId(definition.id)]?.rows ?? []}
        intradayComparison={intradayComparison}
        rows={chartData[definition.id]?.rows ?? []}
        scope={selectedScope}
        showPreviousPeriod={showPreviousPeriod}
        state={chartData[definition.id]}
      />
    ) : (
      <EmptyReportCard title={definition.label} />
    ),
  }));

  const customWidgetCards = customWidgets.map((widget) => {
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

  const detailCards = selectedScope
    ? [
        {
          id: "report_scenario_detail",
          label: "Visão selecionada",
          defaultSize: "wide" as const,
          className: "sm:col-span-2 xl:col-span-2",
          node: <ReportScopeDetailCard cameras={cameras} scope={selectedScope} />,
        },
        {
          id: "report_scenario_table",
          label: "Visões disponíveis",
          defaultSize: "full" as const,
          className: "sm:col-span-2 xl:col-span-4",
          node: (
            <ReportScopeTable
              scopes={scopeOptions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ),
        },
      ]
    : [];

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
    ...metricCards,
    ...scenarioComparisonCards,
    ...customWidgetCards,
    ...chartCards,
    ...detailCards,
  ];
  const reportCardIds = reportLayoutCards.map((card) => card.id);
  const reportCardIdsKey = reportCardIds.join("|");
  const reportPreferences = useCardPreferences(
    "reports",
    reportCardIds,
    companyScopeId,
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
  const defaultReportChartEntries: Array<
    readonly [string, ReportPayload["charts"][number]]
  > = selectedScope
    ? chartDefinitions.map((definition) => [
        definition.id,
        buildScenarioReportChart(
          definition,
          chartData[definition.id]?.rows ?? [],
          chartData[previousId(definition.id)]?.rows ?? [],
          selectedScope,
          showPreviousPeriod,
          intradayComparison,
        ),
      ] as const)
    : [];
  const customReportChartEntries = customWidgets
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

      return [
        `report_custom_${widget.id}`,
        buildScenarioReportChart(
          definition,
          state?.rows ?? [],
          previousState?.rows ?? [],
          scope,
          showPreviousPeriod,
          intradayComparison,
        ),
      ] as const;
    })
    .filter(
      (entry): entry is readonly [string, ReportPayload["charts"][number]] =>
        Boolean(entry),
    );
  const customReportCharts = customReportChartEntries.map(([, chart]) => chart);
  const visibleMetricByCardId = new Map<string, ReportMetric>(
    metricCards.map((card) => [card.id, card.reportMetric] as const),
  );
  const visibleTableEntries: Array<readonly [string, ReportTable]> = [];
  if (scenarioDetailTable) {
    visibleTableEntries.push(["report_scenario_detail", scenarioDetailTable]);
  }
  if (scopeListTable) {
    visibleTableEntries.push(["report_scenario_table", scopeListTable]);
  }
  const visibleTableByCardId = new Map<string, ReportTable>(
    visibleTableEntries,
  );

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
        "Exportação seguindo os widgets visíveis e ordenados em Relatórios.",
      ].filter(Boolean),
      metrics,
      charts,
      tables,
    };
  }

  async function buildConfiguredScenarioReportPayload() {
    const chartByCardId = new Map<string, ReportPayload["charts"][number]>([
      ...defaultReportChartEntries,
      ...customReportChartEntries,
    ]);

    if (
      visibleReportCardIds.includes("report_scenario_period_comparison") &&
      scenarios.length
    ) {
      try {
        const settings = loadScenarioComparisonSettings("reports", companyScopeId);
        const definition = buildScenarioComparisonDefinition(settings, new Date());
        const rows = await fetchScenarioComparisonRows(definition, companyScopeId);
        chartByCardId.set(
          "report_scenario_period_comparison",
          buildScenarioComparisonReportChart({
            definition,
            rows,
            scenarios,
            settings,
          }),
        );
      } catch {
        // Mantem a exportação dos demais widgets mesmo se este gráfico falhar.
      }
    }

    return composeScenarioReportPayload({
      charts: visibleReportCardIds
        .map((id) => chartByCardId.get(id))
        .filter((chart): chart is ReportPayload["charts"][number] => Boolean(chart)),
      metrics: visibleReportCardIds
        .map((id) => visibleMetricByCardId.get(id))
        .filter((metric): metric is ReportMetric => Boolean(metric)),
      tables: visibleReportCardIds
        .map((id) => visibleTableByCardId.get(id))
        .filter((table): table is ReportTable => Boolean(table)),
    });
  }

  const scenarioReportPayload = composeScenarioReportPayload({
    charts: selectedScope
      ? [...defaultReportChartEntries.map(([, chart]) => chart), ...customReportCharts]
      : customReportCharts,
    metrics: metricCards.map((card) => card.reportMetric),
    tables: [scenarioDetailTable, scopeListTable].filter(
      (table): table is ReportTable => Boolean(table),
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
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
                <div className="text-sm font-medium">{scopeModeLabel(scopeMode)}</div>
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
              <Button
                type="button"
                variant="outline"
                onClick={openCustomWidgetDialog}
                disabled={!availableModes.length}
              >
                <Plus className="h-4 w-4" />
                Widget
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (selectedScope) loadCharts(selectedScope, true);
                  loadScenarios();
                }}
                disabled={refreshing || loadingCharts}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    (refreshing || loadingCharts) && "animate-spin",
                  )}
                />
                Atualizar
              </Button>
              <ReportExportActions
                payload={scenarioReportPayload}
                getPayload={buildConfiguredScenarioReportPayload}
                disabled={loadingCharts || loadingScenarios || !selectedScope}
              />
              <MonitorModeButton
                onClick={enterMonitorMode}
                disabled={!scopeOptions.length}
              />
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
          editActions={
            <Button type="button" variant="outline" size="sm" onClick={openCustomWidgetDialog}>
              <Settings2 className="h-3.5 w-3.5" />
              Novo widget
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo widget de relatório</DialogTitle>
            <DialogDescription>
              Escolha a visão, o período do gráfico e o título exibido no card.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
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
                placeholder="Entradas hora a hora"
              />
            </div>

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

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Se o comparativo de período anterior estiver ativo, ele será aplicado
              também aos widgets personalizados.
            </div>
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
              disabled={!customWidgetForm.scopeId}
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

function ReportMetricCard({
  icon: Icon,
  label,
  value,
  loading,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  loading: boolean;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[116px] items-center justify-between gap-4 p-4">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-2 text-2xl font-semibold">
              {formatNumber(value)}
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioAggregateChartCard({
  action,
  definition,
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
  intradayComparison: IntradayComparisonMode;
  loading: boolean;
  rows: AggregateEventRow[];
  previousRows: AggregateEventRow[];
  scope: ReportScopeOption;
  showPreviousPeriod: boolean;
  state?: ScenarioChartState;
}) {
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
    () => buildChartOption(definition, points, previousPoints, intradayComparison),
    [definition, intradayComparison, points, previousPoints],
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
        ) : state?.error ? (
          <EmptyChartState text={state.error} />
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

function ReportScopeDetailCard({
  cameras,
  scope,
}: {
  cameras: Camera[];
  scope: ReportScopeOption;
}) {
  const scopeCameras = cameras.filter((camera) => scope.cameraIds.includes(camera.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          {scope.name}
        </CardTitle>
        <CardDescription>{scope.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <SmallInfo
            label="Tipo"
            value={scopeModeLabel(scope.mode)}
          />
          <SmallInfo
            label={scope.scenario ? "Linhas" : "Câmeras"}
            value={formatNumber(
              scope.scenario
                ? scope.scenario.lines?.length ?? 0
                : scope.cameraIds.length,
            )}
          />
          <SmallInfo
            label="Origem"
            value={
              scope.scenario
                ? "Personalizada"
                : scope.subLocation || scope.group
                  ? "Sub-location"
                  : "Location"
            }
          />
        </div>
        <div className="max-h-[210px] space-y-2 overflow-y-auto pr-1">
          {scope.scenario?.lines?.length ? (
            scope.scenario.lines.map((line, index) => (
              <div
                key={`${line.line_count_id}-${index}`}
                className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {line.label || `Linha ${index + 1}`}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {line.line_count_id}
                  </div>
                </div>
                <Badge variant={line.action_multiplier === -1 ? "warning" : "success"}>
                  {line.action_multiplier === -1 ? "Subtrai" : "Soma"}
                </Badge>
              </div>
            ))
          ) : scopeCameras.length ? (
            scopeCameras.map((camera) => (
              <div
                key={camera.id}
                className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{camera.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {camera.code || camera.id}
                  </div>
                </div>
                <Badge variant={camera.active ? "success" : "secondary"}>
                  {camera.active ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum item vinculado.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportScopeTable({
  scopes,
  selectedId,
  onSelect,
}: {
  scopes: ReportScopeOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Visões disponíveis
        </CardTitle>
        <CardDescription>Selecione uma visão para atualizar os períodos.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visão</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopes.map((scope) => (
                <TableRow
                  key={scope.id}
                  className={cn(
                    "cursor-pointer",
                    scope.id === selectedId && "bg-primary/10",
                  )}
                  onClick={() => onSelect(scope.id)}
                >
                  <TableCell>
                    <div className="font-medium">{scope.name}</div>
                    <div className="mt-1 max-w-[520px] truncate text-xs text-muted-foreground">
                      {scope.description || scope.id}
                    </div>
                  </TableCell>
                  <TableCell>{scopeModeLabel(scope.mode)}</TableCell>
                  <TableCell>
                    {formatNumber(
                      scope.scenario
                        ? scope.scenario.lines?.length ?? 0
                        : scope.cameraIds.length,
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {scope.scenario ? "Personalizada" : "Automática"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function EmptyReportCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Selecione uma visão.</CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyChartState text="Nenhuma visão selecionada." />
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
): ScenarioAggregateDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = addHours(startOfHour(now), 1);
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

function buildCurrentMonthDaysDefinition(now: Date): ScenarioAggregateDefinition {
  const todayStart = startOfDay(now);

  return {
    id: CURRENT_MONTH_DAYS_ID,
    label: "Dias do mês atual",
    description: "Base auxiliar para completar períodos em andamento.",
    granularity: "day",
    from: startOfMonth(now),
    to: addDays(todayStart, 1),
  };
}

function buildReportCustomWidgetDefinition(
  widget: ReportCustomWidget,
  definitions: ScenarioAggregateDefinition[],
  scope?: ReportScopeOption,
): ScenarioAggregateDefinition {
  const base =
    definitions.find((definition) => definition.granularity === widget.granularity) ??
    definitions.find((definition) => definition.id === "report_chart_hour") ??
    buildScenarioAggregateDefinitions(new Date())[1];
  const scopeName = scope?.name ?? widget.scopeName;

  return {
    ...base,
    description: `${reportGranularityLabel(widget.granularity)} em ${scopeModeLabel(
      widget.scopeMode,
    ).toLowerCase()}: ${scopeName}.`,
    id: `report_custom_${widget.id}`,
    label:
      widget.title ||
      buildReportCustomWidgetDefaultTitleFromName(scopeName, widget.granularity),
  };
}

function chartStateForReportGranularity(
  data: Record<string, ScenarioChartState>,
  granularity: ReportCustomWidgetGranularity,
  previous = false,
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
  const id = idByGranularity[granularity];

  return data[previous ? previousId(id) : id];
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

function previousId(id: string) {
  return `${id}${PREVIOUS_SUFFIX}`;
}

function aggregatePath(definition: ScenarioAggregateDefinition) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: definition.from.toISOString(),
    to: definition.to.toISOString(),
    metric_type: DEFAULT_METRIC_TYPE,
  });

  return `/analytics/aggregate?${params.toString()}`;
}

function hydrateScenarioOpenBuckets(
  data: Record<string, ScenarioChartState>,
  now: Date,
) {
  const next = cloneChartData(data);

  const currentHourStart = startOfHour(now);
  replaceBucketRowsFromSource(
    next,
    "report_chart_hour",
    "hour",
    currentHourStart,
    addHours(currentHourStart, 1),
    next.report_chart_minute?.rows ?? [],
    "minute",
  );

  const todayStart = startOfDay(now);
  replaceBucketRowsFromSource(
    next,
    "report_chart_day",
    "day",
    todayStart,
    addDays(todayStart, 1),
    next.report_chart_hour?.rows ?? [],
    "hour",
  );
  replaceBucketRowsFromSource(
    next,
    CURRENT_MONTH_DAYS_ID,
    "day",
    todayStart,
    addDays(todayStart, 1),
    next.report_chart_hour?.rows ?? [],
    "hour",
  );

  const currentWeekStart = startOfWeek(now);
  replaceBucketRowsFromSource(
    next,
    "report_chart_week",
    "week",
    currentWeekStart,
    addDays(currentWeekStart, 7),
    next.report_chart_day?.rows ?? [],
    "day",
  );

  const currentMonthStart = startOfMonth(now);
  replaceBucketRowsFromSource(
    next,
    "report_chart_month",
    "month",
    currentMonthStart,
    addMonths(currentMonthStart, 1),
    next[CURRENT_MONTH_DAYS_ID]?.rows ?? [],
    "day",
  );

  const currentSemesterStart = startOfSemester(now);
  replaceBucketRowsFromSource(
    next,
    "report_chart_semester",
    "semester",
    currentSemesterStart,
    addMonths(currentSemesterStart, 6),
    next.report_chart_month?.rows ?? [],
    "month",
  );

  const currentYearStart = startOfYear(now);
  replaceBucketRowsFromSource(
    next,
    "report_chart_year",
    "year",
    currentYearStart,
    addYears(currentYearStart, 1),
    next.report_chart_month?.rows ?? [],
    "month",
  );

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

  const existingTotals = sumRowsByLine(
    state.rows,
    targetGranularity,
    bucketStart,
    bucketEnd,
  );
  const sourceTotals = sumRowsByLine(
    sourceRows,
    sourceGranularity,
    bucketStart,
    bucketEnd,
  );
  const mergedTotals = mergeLineTotals(existingTotals, sourceTotals);
  if (!mergedTotals.size) return;

  const bucketKey = bucketKeyForGranularity(bucketStart, targetGranularity);
  data[chartId] = {
    ...state,
    rows: [
      ...state.rows.filter((row) => {
        const rowDate = new Date(row.bucket);
        if (Number.isNaN(rowDate.getTime())) return true;
        return bucketKeyForGranularity(rowDate, targetGranularity) !== bucketKey;
      }),
      ...Array.from(mergedTotals, ([lineCountId, total]) =>
        createAggregateRow(bucketStart, lineCountId, total),
      ),
    ],
  };
}

function sumRowsByLine(
  rows: AggregateEventRow[],
  granularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const totals = new Map<string, number>();
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const fromKey = bucketKeyForGranularity(from, granularity);
  const toKey = bucketKeyForGranularity(to, granularity);

  rows.forEach((row) => {
    if (!row.line_count_id) return;

    const rowDate = new Date(row.bucket);
    if (Number.isNaN(rowDate.getTime())) return;

    const inRange =
      granularity === "minute" || granularity === "hour"
        ? rowDate.getTime() >= fromTime && rowDate.getTime() < toTime
        : bucketKeyForGranularity(rowDate, granularity) >= fromKey &&
          bucketKeyForGranularity(rowDate, granularity) < toKey;
    if (!inRange) return;

    totals.set(row.line_count_id, (totals.get(row.line_count_id) ?? 0) + row.total);
  });

  return totals;
}

function mergeLineTotals(
  existingTotals: Map<string, number>,
  sourceTotals: Map<string, number>,
) {
  const merged = new Map<string, number>();
  const lineIds = new Set([...existingTotals.keys(), ...sourceTotals.keys()]);

  lineIds.forEach((lineId) => {
    merged.set(
      lineId,
      Math.max(existingTotals.get(lineId) ?? 0, sourceTotals.get(lineId) ?? 0),
    );
  });

  return merged;
}

function createAggregateRow(
  bucket: Date,
  lineCountId: string,
  total: number,
): AggregateEventRow {
  return {
    bucket: bucket.toISOString(),
    camera_id: "",
    line_count_id: lineCountId,
    metric_type: DEFAULT_METRIC_TYPE,
    total,
  };
}

async function fetchSubLocations(
  locations: Location[],
  companyScopeId?: string | null,
) {
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<SubLocation[]>(`/locations/${location.id}/sub-locations`).catch(
        () => [],
      ),
    ),
  );

  return filterScopedApiRows(rows.flat(), companyScopeId);
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

    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;

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

    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;

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
): EnterpriseChartOption {
  const showPreviousSeries = previousPoints.length > 0;
  const previousName = comparisonSeriesName(definition, intradayComparison);

  return {
    color: showPreviousSeries ? ["#1267C4", "#B7C7DA"] : ["#1267C4"],
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
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#1267C4" },
              { offset: 1, color: "#5AA8F5" },
            ],
          },
        },
      },
      ...(showPreviousSeries
        ? [
            {
              name: previousName,
              type: "bar",
              data: points.map((_, index) => previousPoints[index]?.total ?? 0),
              barMaxWidth: barMaxWidth(definition.granularity),
              itemStyle: {
                borderRadius: [2, 2, 0, 0],
                color: "#B7C7DA",
              },
            },
          ]
        : []),
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

function sumPoints(points: ChartPoint[]) {
  return points.reduce((sum, point) => sum + point.total, 0);
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
  if (granularity === "hour") return addHours(date, 1);
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
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (granularity === "week") return startOfUtcWeek(date).getTime();
  if (granularity === "month") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  if (granularity === "semester") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() < 6 ? 0 : 6, 1);
  }

  return Date.UTC(date.getUTCFullYear(), 0, 1);
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
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
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

function startOfUtcWeek(date: Date) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = next.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + diff);
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

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * HOUR_MS);
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
