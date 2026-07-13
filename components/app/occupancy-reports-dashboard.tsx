"use client";

import * as React from "react";
import {
  BarChart3,
  Clock3,
  Gauge,
  MapPinned,
  RefreshCw,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
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
  getScopedStorageKey,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { normalizeOccupancyRows } from "@/lib/occupancy-areas";
import type {
  AggregateGranularity,
  Camera,
  Location,
  OccupancyRow,
  OccupancyScenario,
  OccupancyScenarioAggregateResponse,
  OccupancyScenarioBucketRow,
  OccupancyScenarioListResponse,
  OccupancySnapshotsResponse,
  SubLocation,
} from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

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
  id: string;
  label: string;
  description: string;
  granularity: Extract<
    AggregateGranularity,
    "minute" | "hour" | "day" | "week" | "month" | "semester" | "year"
  >;
  from: Date;
  to: Date;
};

type OccupancyReportPoint = {
  bucket: string;
  label: string;
  average: number;
  current: number;
  minimum: number;
  peak: number;
};

type OccupancyReportState = {
  points: OccupancyReportPoint[];
  error?: string;
};

type OccupancyReportMetric = {
  average: number;
  current: number;
  minimum: number;
  peak: number;
};

type OccupancyMetricVisibility = {
  average: boolean;
  minimum: boolean;
  peak: boolean;
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
const DEFAULT_OBJECT_CLASS = "person";
const OCCUPANCY_METRIC_VISIBILITY_KEY =
  "ipxdata.occupancy.metric-visibility.v1";
const DEFAULT_OCCUPANCY_METRIC_VISIBILITY: OccupancyMetricVisibility = {
  average: true,
  minimum: true,
  peak: true,
};

export function OccupancyReportsDashboard({ manager = false }: { manager?: boolean }) {
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const companyScopeId = useEffectiveCompanyScopeId(user);
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
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState(
    () => loadLiveDashboardSettings(companyScopeId).showPreviousPeriod,
  );
  const [intradayComparison, setIntradayComparison] =
    React.useState<IntradayComparisonMode>(
      () => loadLiveDashboardSettings(companyScopeId).intradayComparison,
    );
  const [metricVisibility, setMetricVisibility] =
    React.useState<OccupancyMetricVisibility>(() =>
      readOccupancyMetricVisibility(companyScopeId),
    );
  const [loadingScopes, setLoadingScopes] = React.useState(true);
  const [loadingCharts, setLoadingCharts] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());

  const definitions = React.useMemo(
    () => buildOccupancyReportDefinitions(clock),
    [clock],
  );
  const availableModes = React.useMemo(
    () =>
      buildAvailableScopeModes({
        cameras,
        groups: cameraGroups,
        locations,
        manager,
        scenarios,
        subLocations,
      }),
    [
      cameraGroups,
      cameras,
      locations,
      manager,
      scenarios,
      subLocations,
    ],
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
  const todayMetric = React.useMemo(
    () => buildPeriodMetric(chartData.occupancy_report_hour?.points ?? []),
    [chartData],
  );

  const loadScopes = React.useCallback(async () => {
    setLoadingScopes(true);
    try {
      const [scenarioResponse, cameraRows, locationRows] = await Promise.all([
        apiFetch<OccupancyScenarioListResponse>("/occupancy/scenarios"),
        apiFetch<Camera[]>("/cameras").catch(() => []),
        apiFetch<Location[]>("/locations").catch(() => []),
      ]);
      const scopedCameras = filterScopedApiRows(cameraRows, companyScopeId);
      const scopedLocations = filterScopedApiRows(locationRows, companyScopeId);
      const subLocationRows = await fetchSubLocations(
        scopedLocations,
        companyScopeId,
      );
      const nextScenarios = filterScopedApiRows(
        normalizeScenarioList(scenarioResponse),
        companyScopeId,
      );
      const visibleScenarios = manager
        ? nextScenarios
        : nextScenarios.filter((scenario) => scenario.active);
      setScenarios(visibleScenarios);
      setCameras(scopedCameras);
      setLocations(scopedLocations);
      setSubLocations(subLocationRows);
      const modes = buildAvailableScopeModes({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        scenarios: visibleScenarios,
        subLocations: subLocationRows,
      });
      const nextMode = modes.some((mode) => mode.value === scopeMode)
        ? scopeMode
        : modes[0]?.value ?? "scenario";
      const options = buildOccupancyReportScopes({
        cameras: scopedCameras,
        groups: cameraGroups,
        locations: scopedLocations,
        manager,
        mode: nextMode,
        scenarios: visibleScenarios,
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
          : "Não foi possível carregar as visões de ocupação.",
      );
    } finally {
      setLoadingScopes(false);
    }
  }, [cameraGroups, companyScopeId, manager, scopeMode]);

  const loadCharts = React.useCallback(
    async (scope: OccupancyReportScope, silent = false) => {
      if (silent) setRefreshing(true);
      else setLoadingCharts(true);

      const now = new Date();
      const currentDefinitions = buildOccupancyReportDefinitions(now);
      const previousDefinitions = showPreviousPeriod
        ? currentDefinitions.map((definition) =>
            buildComparisonDefinition(definition, intradayComparison),
          )
        : [];

      try {
        const entries = await Promise.all(
          [...currentDefinitions, ...previousDefinitions].map(async (definition) => {
            try {
              const state = await loadOccupancyReportState(definition, scope);
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
          }),
        );

        setChartData(Object.fromEntries(entries));
        setClock(now);
        setLastUpdated(new Date());
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os relatórios de ocupação.",
        );
      } finally {
        setLoadingCharts(false);
        setRefreshing(false);
      }
    },
    [intradayComparison, showPreviousPeriod],
  );

  React.useEffect(() => {
    loadScopes();
  }, [loadScopes]);

  React.useEffect(() => {
    const settings = loadLiveDashboardSettings(companyScopeId);
    setShowPreviousPeriod(settings.showPreviousPeriod);
    setIntradayComparison(settings.intradayComparison);
    setMetricVisibility(readOccupancyMetricVisibility(companyScopeId));
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

  React.useEffect(() => {
    saveOccupancyMetricVisibility(metricVisibility, companyScopeId);
  }, [companyScopeId, metricVisibility]);

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

  const metricCards = [
    {
      icon: UsersRound,
      label: "Atual",
      value: todayMetric.current,
      description: selectedScope?.name ?? "visão selecionada",
      tone: "primary" as const,
    },
    ...(metricVisibility.average
      ? [
          {
            icon: Gauge,
            label: "Média hoje",
            value: todayMetric.average,
            description: "período atual",
            tone: "average" as const,
          },
        ]
      : []),
    ...(metricVisibility.peak
      ? [
          {
            icon: BarChart3,
            label: "Máximo hoje",
            value: todayMetric.peak,
            description: "maior valor observado",
            tone: "maximum" as const,
          },
        ]
      : []),
    ...(metricVisibility.minimum
      ? [
          {
            icon: TrendingUp,
            label: "Mínimo hoje",
            value: todayMetric.minimum,
            description: "menor valor observado",
            tone: "minimum" as const,
          },
        ]
      : []),
  ];

  return (
    <section
      className={cn(
        monitorMode
          ? "fixed inset-0 z-[100] h-screen overflow-y-auto bg-background p-3 text-foreground lg:p-4"
          : "space-y-4",
      )}
    >
      {monitorMode ? <MonitorModeExitHint onExit={exitMonitorMode} /> : null}

      {monitorMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/80 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Relatórios de ocupação
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
        {loadingScopes ? (
          <div className="grid gap-4 md:grid-cols-[180px_1fr_auto]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
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
                    setScopeMode(value as OccupancyReportScopeMode);
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
                <MapPinned className="h-3.5 w-3.5" />
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
              <MetricVisibilityControls
                value={metricVisibility}
                onChange={setMetricVisibility}
              />
              {lastUpdated ? (
                <Badge variant="outline" className="gap-1 bg-card">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatTime(lastUpdated)}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (selectedScope) loadCharts(selectedScope, true);
                  loadScopes();
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
              <MonitorModeButton
                onClick={enterMonitorMode}
                disabled={!scopeOptions.length}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma visão de ocupação disponível para relatório.
          </div>
        )}
      </div>
      )}

      {scopeOptions.length ? (
        <>
          <div
            className={cn(
              "grid sm:grid-cols-2 xl:grid-cols-4",
              monitorMode ? "gap-3" : "gap-4",
            )}
          >
            {metricCards.map((card) => (
              <MetricCard
                key={card.label}
                description={card.description}
                icon={card.icon}
                label={card.label}
                loading={loadingCharts}
                tone={card.tone}
                value={card.value}
              />
            ))}
          </div>
          <div className={cn("grid xl:grid-cols-2", monitorMode ? "mt-3 gap-3" : "gap-4")}>
            {definitions.map((definition) => (
              <OccupancyReportChartCard
                key={definition.id}
                definition={definition}
                loading={loadingCharts}
                points={chartData[definition.id]?.points ?? buildEmptyPoints(definition)}
                previousPoints={
                  chartData[previousId(definition.id)]?.points ?? []
                }
                showPreviousPeriod={showPreviousPeriod}
                state={chartData[definition.id]}
                intradayComparison={intradayComparison}
                metricVisibility={metricVisibility}
                scope={selectedScope}
                scopeName={selectedScope?.name ?? ""}
              />
            ))}
          </div>
        </>
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
  value: number;
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
    <Card>
      <CardContent className="flex min-h-[116px] items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <div className="mt-2 text-2xl font-semibold">
              {formatOccupancyValue(value)}
            </div>
          )}
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {description}
          </div>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1",
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
    points.some((point) => point.average || point.current || point.peak) ||
    (showPreviousPeriod &&
      previousPoints.some((point) => point.average || point.current || point.peak)) ||
    hasReferenceLimit;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {definition.label}
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit bg-primary/10 text-primary">
            {scopeName}
          </Badge>
        </div>
        {showPreviousPeriod ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
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
  onChange,
  value,
}: {
  onChange: React.Dispatch<React.SetStateAction<OccupancyMetricVisibility>>;
  value: OccupancyMetricVisibility;
}) {
  const options = [
    { key: "average", label: "Média" },
    { key: "minimum", label: "Mínimo" },
    { key: "peak", label: "Máximo" },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 p-1">
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
              "h-8 rounded px-2 text-xs font-medium transition",
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

function buildOccupancyReportDefinitions(now: Date): OccupancyReportDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = addHours(startOfHour(now), 1);
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);
  const currentSemesterStart = startOfSemester(now);
  const currentYearStart = startOfYear(now);

  return [
    {
      id: "occupancy_report_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "occupancy_report_hour",
      label: "Hora a hora",
      description: "Hoje por hora.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "occupancy_report_day",
      label: "Dia a dia",
      description: "Últimos 7 dias.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "occupancy_report_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "occupancy_report_month",
      label: "Mês a mês",
      description: "Últimos 12 meses.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
    {
      id: "occupancy_report_semester",
      label: "Semestre a semestre",
      description: "Últimos 6 semestres.",
      granularity: "semester",
      from: addMonths(currentSemesterStart, -5 * 6),
      to: addMonths(currentSemesterStart, 6),
    },
    {
      id: "occupancy_report_year",
      label: "Ano a ano",
      description: "Últimos 5 anos.",
      granularity: "year",
      from: addYears(currentYearStart, -4),
      to: addYears(currentYearStart, 1),
    },
  ];
}

async function loadOccupancyReportState(
  definition: OccupancyReportDefinition,
  scope: OccupancyReportScope,
): Promise<OccupancyReportState> {
  if (scope.scenario) {
    const response = await apiFetch<OccupancyScenarioAggregateResponse>(
      occupancyScenarioAggregatePath(scope.scenario.id, definition),
    );

    return {
      points: buildScenarioPoints(definition, response.data ?? []),
    };
  }

  const buckets = listBucketStarts(definition);
  const points = await mapWithConcurrency(
    buckets,
    BUCKET_CONCURRENCY,
    async (bucketStart) => {
      const bucketEnd = addGranularity(bucketStart, definition.granularity);
      const response = await apiFetch<OccupancySnapshotsResponse>(
        occupancyPath(bucketStart, bucketEnd > definition.to ? definition.to : bucketEnd),
      );
      const rows = normalizeOccupancyRows(response).filter(
        (row) => row.camera_id && scope.cameraIds.includes(row.camera_id),
      );
      const metric = buildRowsMetric(rows);

      return {
        bucket: bucketStart.toISOString(),
        label: bucketLabel(bucketStart, definition.granularity),
        ...metric,
      };
    },
  );

  return { points };
}

function buildScenarioPoints(
  definition: OccupancyReportDefinition,
  rows: OccupancyScenarioBucketRow[],
) {
  const totals = new Map<number, OccupancyReportMetric>();
  const hasScenarioTotalByBucket = new Set<number>();

  rows.forEach((row) => {
    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;

    const key = bucketKeyForGranularity(date, definition.granularity);
    const existing = totals.get(key);
    const hasScenarioTotal =
      row.scenario_total_avg !== undefined ||
      row.scenario_total_min !== undefined ||
      row.scenario_total_max !== undefined;
    const metric = {
      average: safeNumber(row.scenario_total_avg ?? row.area_avg),
      current: safeNumber(row.scenario_total_avg ?? row.area_avg),
      minimum: safeNumber(row.scenario_total_min ?? row.area_min),
      peak: safeNumber(row.scenario_total_max ?? row.area_max),
    };

    if (hasScenarioTotal) {
      hasScenarioTotalByBucket.add(key);
      totals.set(key, metric);
      return;
    }

    if (!existing) {
      totals.set(key, metric);
      return;
    }

    if (hasScenarioTotalByBucket.has(key)) return;

    totals.set(key, {
      average: existing.average + metric.average,
      current: existing.current + metric.current,
      minimum: existing.minimum + metric.minimum,
      peak: existing.peak + metric.peak,
    });
  });

  return listBucketStarts(definition).map((bucketStart) => {
    const metric =
      totals.get(bucketKeyForGranularity(bucketStart, definition.granularity)) ??
      emptyMetric();

    return {
      bucket: bucketStart.toISOString(),
      label: bucketLabel(bucketStart, definition.granularity),
      ...metric,
    };
  });
}

function buildRowsMetric(rows: OccupancyRow[]): OccupancyReportMetric {
  if (!rows.length) return emptyMetric();

  return {
    average: roundValue(rows.reduce((sum, row) => sum + safeNumber(row.avg), 0)),
    current: roundValue(
      rows.reduce((sum, row) => sum + safeNumber(row.current_value), 0),
    ),
    minimum: roundValue(rows.reduce((sum, row) => sum + safeNumber(row.min), 0)),
    peak: roundValue(rows.reduce((sum, row) => sum + safeNumber(row.peak), 0)),
  };
}

function buildPeriodMetric(points: OccupancyReportPoint[]): OccupancyReportMetric {
  const populated = points.filter((point) => point.average || point.current || point.peak);
  if (!populated.length) return emptyMetric();

  return {
    average: roundValue(
      populated.reduce((sum, point) => sum + point.average, 0) / populated.length,
    ),
    current: populated.at(-1)?.current ?? 0,
    minimum: Math.min(...populated.map((point) => point.minimum)),
    peak: Math.max(...populated.map((point) => point.peak)),
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
  const rangeBaseValues = points.map((point) => Math.max(0, point.minimum));
  const rangeSpanValues = points.map((point) =>
    Math.max(0, point.peak - Math.max(0, point.minimum)),
  );
  const previousBaseValues = points.map((_, index) =>
    Math.max(0, previousPoints[index]?.minimum ?? 0),
  );
  const previousSpanValues = points.map((_, index) => {
    const previous = previousPoints[index];
    if (!previous) return 0;

    return Math.max(0, previous.peak - Math.max(0, previous.minimum));
  });
  const markerDefinitions: OccupancyReportMarkerDefinition[] = [
    {
      color: palette.current,
      data: points.map((point) => point.current ?? null),
      effect: true,
      fill: palette.current,
      name: "Atual",
      offset: [0, 0],
      size: denseMarkerSize(definition, "current"),
      symbol: "circle",
      z: 7,
    },
  ];

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
        name: "Média anterior",
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
    ...(showPrevious ? ["Intervalo anterior"] : []),
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
              name: "Base anterior",
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
              name: "Intervalo anterior",
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
) {
  const dataIndex = tooltipDataIndex(params);
  if (dataIndex === undefined) return "";

  const point = points[dataIndex];
  if (!point) return "";

  const previous = previousPoints[dataIndex];
  const rows = [
    `<strong>${escapeHtml(point.label)}</strong>`,
    `Atual: ${formatOccupancyValue(point.current)}`,
    metricVisibility.average
      ? `Média: ${formatOccupancyValue(point.average)}`
      : undefined,
    metricVisibility.minimum
      ? `Mínimo: ${formatOccupancyValue(point.minimum)}`
      : undefined,
    metricVisibility.peak
      ? `Máximo: ${formatOccupancyValue(point.peak)}`
      : undefined,
    previous ? "<br/><strong>Período anterior</strong>" : undefined,
    previous && metricVisibility.average
      ? `Média anterior: ${formatOccupancyValue(previous.average)} ${metricDeltaLabel(
          point.average,
          previous.average,
        )}`
      : undefined,
    previous && metricVisibility.minimum
      ? `Mínimo anterior: ${formatOccupancyValue(previous.minimum)}`
      : undefined,
    previous && metricVisibility.peak
      ? `Máximo anterior: ${formatOccupancyValue(previous.peak)}`
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

function buildAvailableScopeModes({
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
  scenarios: OccupancyScenario[];
  subLocations: SubLocation[];
}) {
  const modes: Array<{ label: string; value: OccupancyReportScopeMode }> = [];
  if (scenarios.length) modes.push({ label: "Cenário", value: "scenario" });
  if (
    buildOccupancyReportScopes({
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
    buildOccupancyReportScopes({
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
  const comparisonStarts = listBucketStarts(definition).map((date) =>
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

function comparisonBucketStart(
  bucketStart: Date,
  granularity: OccupancyReportDefinition["granularity"],
  intradayComparison: IntradayComparisonMode,
) {
  if (granularity === "minute" || granularity === "hour") {
    return addDays(bucketStart, intradayComparison === "last_week" ? -7 : -1);
  }
  if (granularity === "day") return addDays(bucketStart, -7);
  if (granularity === "week") return equivalentWeekInPreviousMonth(bucketStart);
  return addYears(bucketStart, -1);
}

function comparisonDescription(
  definition: OccupancyReportDefinition,
  intradayComparison: IntradayComparisonMode,
) {
  if (definition.granularity === "minute" || definition.granularity === "hour") {
    return intradayComparison === "last_week"
      ? "Comparando com a semana passada."
      : "Comparando com ontem.";
  }
  if (definition.granularity === "day") {
    return "Comparando com os mesmos dias da semana passada.";
  }
  if (definition.granularity === "week") {
    return "Comparando cada semana com a mesma semana do mês anterior.";
  }
  if (definition.granularity === "month") {
    return "Comparando cada mês com o mesmo mês do ano anterior.";
  }
  if (definition.granularity === "semester") {
    return "Comparando cada semestre com o mesmo semestre do ano anterior.";
  }
  return "Comparando cada ano com o ano anterior.";
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

function occupancyScenarioAggregatePath(
  scenarioId: string,
  definition: OccupancyReportDefinition,
) {
  const params = new URLSearchParams({
    from: definition.from.toISOString(),
    granularity: definition.granularity,
    to: definition.to.toISOString(),
  });

  return `/occupancy/scenarios/${scenarioId}/aggregate?${params.toString()}`;
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

function buildEmptyPoints(definition: OccupancyReportDefinition) {
  return listBucketStarts(definition).map((bucketStart) => ({
    bucket: bucketStart.toISOString(),
    label: bucketLabel(bucketStart, definition.granularity),
    ...emptyMetric(),
  }));
}

function normalizeScenarioList(response: OccupancyScenarioListResponse) {
  const scenarios = Array.isArray(response) ? response : response.data ?? [];
  return scenarios.map((scenario) => ({
    ...scenario,
    active: scenario.active ?? true,
    areas: scenario.areas ?? [],
    object_class: scenario.object_class || DEFAULT_OBJECT_CLASS,
  }));
}

function emptyMetric(): OccupancyReportMetric {
  return {
    average: 0,
    current: 0,
    minimum: 0,
    peak: 0,
  };
}

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function roundValue(value: number) {
  return Math.round(value * 10) / 10;
}

function formatOccupancyValue(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value ?? 0);
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
  if (granularity === "hour") return addHours(date, 1);
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "semester") return addMonths(date, 6);
  if (granularity === "year") return addYears(date, 1);
  return addMonths(date, 1);
}

function bucketKeyForGranularity(
  date: Date,
  granularity: OccupancyReportDefinition["granularity"],
) {
  if (granularity === "minute") return startOfMinute(date).getTime();
  if (granularity === "hour") return startOfHour(date).getTime();
  if (granularity === "day") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (granularity === "week") return startOfUtcWeek(date).getTime();
  if (granularity === "semester") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() < 6 ? 0 : 6, 1);
  }
  if (granularity === "year") return Date.UTC(date.getUTCFullYear(), 0, 1);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
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

function readOccupancyMetricVisibility(
  companyScopeId?: string | null,
): OccupancyMetricVisibility {
  if (typeof window === "undefined") {
    return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;
  }

  try {
    const raw = window.localStorage.getItem(
      occupancyMetricVisibilityKey(companyScopeId),
    );
    if (!raw) return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;
    }

    const stored = parsed as Partial<
      Record<keyof OccupancyMetricVisibility, unknown>
    >;

    return {
      average:
        typeof stored.average === "boolean"
          ? stored.average
          : DEFAULT_OCCUPANCY_METRIC_VISIBILITY.average,
      minimum:
        typeof stored.minimum === "boolean"
          ? stored.minimum
          : DEFAULT_OCCUPANCY_METRIC_VISIBILITY.minimum,
      peak:
        typeof stored.peak === "boolean"
          ? stored.peak
          : DEFAULT_OCCUPANCY_METRIC_VISIBILITY.peak,
    };
  } catch {
    return DEFAULT_OCCUPANCY_METRIC_VISIBILITY;
  }
}

function saveOccupancyMetricVisibility(
  value: OccupancyMetricVisibility,
  companyScopeId?: string | null,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      occupancyMetricVisibilityKey(companyScopeId),
      JSON.stringify(value),
    );
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function occupancyMetricVisibilityKey(companyScopeId?: string | null) {
  return getScopedStorageKey(OCCUPANCY_METRIC_VISIBILITY_KEY, companyScopeId);
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
