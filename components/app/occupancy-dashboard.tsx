"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  MapPinned,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { CardLayout } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { useAuth } from "@/components/app/auth-provider";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { normalizeOccupancyRows } from "@/lib/occupancy-areas";
import { canManageOccupancy, canManageScenarios } from "@/lib/permissions";
import type {
  AggregateGranularity,
  OccupancyRow,
  OccupancySnapshotsResponse,
  Scenario,
  ScenarioLine,
} from "@/lib/types";
import { cn, formatNumber, formatTime } from "@/lib/utils";

type LoadOptions = {
  force?: boolean;
  silent?: boolean;
};

type OccupancyChartDefinition = {
  id: string;
  label: string;
  description: string;
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
};

type OccupancyChartState = {
  buckets: OccupancyBucket[];
  rows: OccupancyRow[];
  error?: string;
};

type OccupancyBucket = {
  id: string;
  label: string;
  from: Date;
  to: Date;
  rows: OccupancyRow[];
  error?: string;
};

type OccupancyPoint = {
  key: string;
  label: string;
  detail?: string;
  current: number;
  average: number;
  peak: number;
  minimum: number;
  updatedAt?: string;
};

type OccupancyMetric = {
  current: number;
  average: number;
  peak: number;
  minimum: number;
  activeAreas: number;
  areaCount: number;
  updatedAt?: string;
};

type AreaOption = {
  key: string;
  label: string;
  detail?: string;
};

type ScenarioDraft = {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  lines: ScenarioLine[];
};

const ALL_AREAS_ID = "__all__";
const REFRESH_MS = 5_000;
const OCCUPANCY_BUCKET_CONCURRENCY = 8;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OCCUPANCY_SCENARIO_TYPE = "occupancy";

export function OccupancyDashboard() {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const canManageOccupancyScenarios =
    canManageOccupancy(user) || canManageScenarios(user);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] =
    React.useState(ALL_AREAS_ID);
  const [scenarioDialogOpen, setScenarioDialogOpen] = React.useState(false);
  const [chartData, setChartData] = React.useState<
    Record<string, OccupancyChartState>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [clock, setClock] = React.useState(() => new Date());

  const requestRef = React.useRef<AbortController | null>(null);
  const runningRef = React.useRef(false);
  const hasDataRef = React.useRef(false);

  const chartDefinitions = React.useMemo(
    () => buildOccupancyChartDefinitions(clock),
    [clock],
  );
  const selectedScenario = React.useMemo(
    () =>
      selectedScenarioId === ALL_AREAS_ID
        ? null
        : scenarios.find((scenario) => scenario.id === selectedScenarioId) ??
          null,
    [scenarios, selectedScenarioId],
  );
  const selectableScenarios = React.useMemo(
    () =>
      scenarios.filter(
        (scenario) => scenario.active || scenario.id === selectedScenarioId,
      ),
    [scenarios, selectedScenarioId],
  );
  const allRows = React.useMemo(
    () => Object.values(chartData).flatMap((state) => state.rows),
    [chartData],
  );
  const areaOptions = React.useMemo(() => buildAreaOptions(allRows), [allRows]);
  const currentRows = React.useMemo(
    () => getLatestBucketRows(chartData.occupancy_chart_minute?.buckets ?? []),
    [chartData],
  );
  const currentMetric = React.useMemo(
    () =>
      buildCurrentBucketMetric(
        chartData.occupancy_chart_minute?.buckets ?? [],
        selectedScenario,
      ),
    [chartData, selectedScenario],
  );
  const todayMetric = React.useMemo(
    () =>
      buildPeriodBucketMetric(
        chartData.occupancy_chart_hour?.buckets ?? [],
        selectedScenario,
      ),
    [chartData, selectedScenario],
  );
  const hasRenderableData = allRows.length > 0;
  const initialLoading = loading && !hasRenderableData;
  const selectedScenarioLabel = selectedScenario?.name ?? "Todas as áreas";

  const loadScenarios = React.useCallback(async (signal?: AbortSignal) => {
    const data = await apiFetch<Scenario[]>("/scenarios", signal ? { signal } : {});
    const occupancyScenarios = filterScopedApiRows(data, companyScopeId).filter(
      isOccupancyScenario,
    );
    setScenarios(occupancyScenarios);

    return occupancyScenarios;
  }, [companyScopeId]);

  const load = React.useCallback(
    async ({ force = false, silent = false }: LoadOptions = {}) => {
      if (runningRef.current) {
        if (!force) return;
        requestRef.current?.abort();
      }

      const controller = new AbortController();
      requestRef.current = controller;
      runningRef.current = true;

      const silentLoad = silent || hasDataRef.current;
      if (silentLoad) setRefreshing(true);
      else setLoading(true);

      const now = new Date();
      const definitions = buildOccupancyChartDefinitions(now);

      try {
        const [scenarioResult, chartEntries] = await Promise.all([
          loadScenarios(controller.signal).catch(() => []),
          Promise.all(
            definitions.map(async (definition) => {
              try {
                const state = await loadOccupancyChartState(
                  definition,
                  controller.signal,
                );

                return [definition.id, state] as const;
              } catch (error) {
                if (isAbortError(error)) throw error;

                const state: OccupancyChartState = {
                  buckets: buildEmptyOccupancyBuckets(definition),
                  rows: [],
                  error: occupancyErrorMessage(error),
                };

                return [definition.id, state] as const;
              }
            }),
          ),
        ]);

        const refreshedAt = new Date();
        setChartData(Object.fromEntries(chartEntries));
        setClock(now);
        setLastUpdated(refreshedAt);
        setSelectedScenarioId((current) => {
          if (current === ALL_AREAS_ID) return current;
          return scenarioResult.some((scenario) => scenario.id === current)
            ? current
            : ALL_AREAS_ID;
        });

        const hasChartError = chartEntries.some(([, state]) => state.error);
        if (hasChartError && !silentLoad) {
          toast.error("Alguns gráficos de ocupação não puderam ser carregados.");
        }
      } catch (error) {
        if (isAbortError(error)) return;

        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a ocupação.",
        );
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          runningRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loadScenarios],
  );

  React.useEffect(() => {
    hasDataRef.current = hasRenderableData;
  }, [hasRenderableData]);

  React.useEffect(() => {
    let disposed = false;
    let timeout: number | undefined;

    function scheduleRefresh() {
      timeout = window.setTimeout(async () => {
        if (disposed) return;

        if (document.visibilityState === "visible") {
          await load({ silent: true });
        }

        scheduleRefresh();
      }, REFRESH_MS);
    }

    load({ force: true }).finally(scheduleRefresh);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        load({ force: true, silent: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestRef.current?.abort();
    };
  }, [load]);

  async function reloadScenarios(selectId?: string) {
    try {
      const nextScenarios = await loadScenarios();
      if (selectId === ALL_AREAS_ID) {
        setSelectedScenarioId(ALL_AREAS_ID);
        return;
      }

      if (selectId && nextScenarios.some((scenario) => scenario.id === selectId)) {
        setSelectedScenarioId(selectId);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar os cenários.",
      );
    }
  }

  const metricCards = [
    {
      id: "occupancy_current_total",
      label: "Ocupação agora",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={UsersRound}
          label="Ocupação agora"
          value={currentMetric.current}
          loading={initialLoading}
          tone="primary"
          description={selectedScenarioLabel}
        />
      ),
    },
    {
      id: "occupancy_peak",
      label: "Pico hoje",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Activity}
          label="Pico hoje"
          value={todayMetric.peak}
          loading={initialLoading}
          tone="sky"
          description="00:00 até agora"
        />
      ),
    },
    {
      id: "occupancy_average",
      label: "Média hoje",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={Gauge}
          label="Média hoje"
          value={todayMetric.average}
          loading={initialLoading}
          tone="indigo"
          description="Média das áreas"
        />
      ),
    },
    {
      id: "occupancy_active_areas",
      label: "Áreas ocupadas",
      defaultSize: "compact" as const,
      node: (
        <MetricCard
          icon={MapPinned}
          label="Áreas ocupadas"
          value={currentMetric.activeAreas}
          loading={initialLoading}
          tone="slate"
          description={`${formatNumber(currentMetric.areaCount)} monitoradas`}
        />
      ),
    },
  ];

  const chartCards = chartDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    defaultSize: "wide" as const,
    className: "sm:col-span-2 xl:col-span-2",
    node: (
      <OccupancyChartCard
        definition={definition}
        loading={initialLoading}
        scenario={selectedScenario}
        state={chartData[definition.id]}
      />
    ),
  }));

  const scenarioCards = [
    {
      id: "occupancy_scenarios",
      label: "Cenários de ocupação",
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: (
        <OccupancyScenariosCard
          canManage={canManageOccupancyScenarios}
          loading={initialLoading}
          onManage={() => setScenarioDialogOpen(true)}
          onSelect={setSelectedScenarioId}
          rows={currentRows}
          scenarios={scenarios}
          selectedId={selectedScenarioId}
        />
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card/70 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-primary/30 bg-primary/10 text-primary"
          >
            <Activity className="h-3.5 w-3.5" />
            Ocupação
          </Badge>
          <Badge variant="outline" className="gap-1 bg-card">
            <Clock3 className="h-3.5 w-3.5" />
            Atualiza 30s
          </Badge>
          {lastUpdated ? (
            <Badge variant="outline" className="gap-1 bg-card">
              <RefreshCw className="h-3.5 w-3.5" />
              {formatTime(lastUpdated)}
            </Badge>
          ) : null}
          {currentMetric.updatedAt ? (
            <Badge variant="outline" className="gap-1 bg-card">
              Dados até {formatTime(currentMetric.updatedAt)}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Select
            value={selectedScenarioId}
            onValueChange={setSelectedScenarioId}
          >
            <SelectTrigger className="h-9 w-full bg-background sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AREAS_ID}>Todas as áreas</SelectItem>
              {selectableScenarios.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canManageOccupancyScenarios ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setScenarioDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              Cenários
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={() => load({ force: true, silent: true })}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      <CardLayout
        menuKey="occupancy"
        cards={[...metricCards, ...chartCards, ...scenarioCards]}
      />

      {canManageOccupancyScenarios ? (
        <OccupancyScenarioDialog
          areaOptions={areaOptions}
          onOpenChange={setScenarioDialogOpen}
          onSaved={reloadScenarios}
          open={scenarioDialogOpen}
          scenarios={scenarios}
        />
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
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading: boolean;
  tone: "primary" | "sky" | "indigo" | "slate";
  value: number;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary ring-primary/20",
    sky: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    indigo:
      "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
    slate: "bg-muted text-muted-foreground ring-border",
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
          {description ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {description}
            </div>
          ) : null}
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

function OccupancyChartCard({
  definition,
  loading,
  scenario,
  state,
}: {
  definition: OccupancyChartDefinition;
  loading: boolean;
  scenario: Scenario | null;
  state: OccupancyChartState | undefined;
}) {
  const points = React.useMemo(
    () => buildOccupancyTimelinePoints(state?.buckets ?? [], scenario),
    [scenario, state?.buckets],
  );
  const option = React.useMemo(
    () => buildOccupancyChartOption(definition, points),
    [definition, points],
  );
  const hasData = points.some(
    (point) =>
      point.current !== 0 ||
      point.average !== 0 ||
      point.peak !== 0 ||
      point.minimum !== 0,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {definition.label}
            </CardTitle>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </div>
          {scenario ? (
            <Badge variant="outline" className="w-fit bg-primary/10 text-primary">
              {scenario.name}
            </Badge>
          ) : null}
        </div>
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
          <EmptyChartState text="Sem dados de ocupação para este período." />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyScenariosCard({
  canManage,
  loading,
  onManage,
  onSelect,
  rows,
  scenarios,
  selectedId,
}: {
  canManage: boolean;
  loading: boolean;
  onManage: () => void;
  onSelect: (id: string) => void;
  rows: OccupancyRow[];
  scenarios: Scenario[];
  selectedId: string;
}) {
  const activeScenarios = scenarios.filter((scenario) => scenario.active);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Cenários de ocupação</CardTitle>
          <CardDescription>
            Componha áreas com soma ou subtração para leitura consolidada.
          </CardDescription>
        </div>
        {canManage ? (
          <Button type="button" variant="outline" size="sm" onClick={onManage}>
            <Settings2 className="h-3.5 w-3.5" />
            Configurar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : activeScenarios.length ? (
          <div className="space-y-2">
            <ScenarioSummaryRow
              active={selectedId === ALL_AREAS_ID}
              label="Todas as áreas"
              linesLabel="Visão completa"
              value={buildOccupancyMetric(rows, null).current}
              onClick={() => onSelect(ALL_AREAS_ID)}
            />
            {activeScenarios.map((scenario) => {
              const metric = buildOccupancyMetric(rows, scenario);

              return (
                <ScenarioSummaryRow
                  key={scenario.id}
                  active={selectedId === scenario.id}
                  label={scenario.name}
                  linesLabel={`${formatNumber(scenario.lines?.length ?? 0)} áreas`}
                  value={metric.current}
                  onClick={() => onSelect(scenario.id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum cenário de ocupação configurado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioSummaryRow({
  active,
  label,
  linesLabel,
  onClick,
  value,
}: {
  active: boolean;
  label: string;
  linesLabel: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-md border bg-card p-3 text-left transition hover:border-primary/35 hover:bg-primary/5",
        active && "border-primary/35 bg-primary/10",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{linesLabel}</div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold text-foreground">
          {formatOccupancyValue(value)}
        </div>
        <div className="text-xs text-muted-foreground">agora</div>
      </div>
    </button>
  );
}

function OccupancyScenarioDialog({
  areaOptions,
  onOpenChange,
  onSaved,
  open,
  scenarios,
}: {
  areaOptions: AreaOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: (selectId?: string) => Promise<void>;
  open: boolean;
  scenarios: Scenario[];
}) {
  const [draft, setDraft] = React.useState<ScenarioDraft>(() =>
    createEmptyScenarioDraft(),
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    setDraft(
      scenarios[0] ? scenarioToDraft(scenarios[0]) : createEmptyScenarioDraft(),
    );
  }, [open, scenarios]);

  function updateLine(index: number, patch: Partial<ScenarioLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addLine() {
    const used = new Set(draft.lines.map((line) => line.line_count_id));
    const option =
      areaOptions.find((area) => !used.has(area.key)) ?? areaOptions[0];

    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          action_multiplier: 1,
          label: option?.label ?? "",
          line_count_id: option?.key ?? "",
        },
      ],
    }));
  }

  function removeLine(index: number) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function saveScenario() {
    const payload = buildScenarioPayload(draft);

    if (!payload.name) {
      toast.error("Informe o nome do cenário.");
      return;
    }

    if (!payload.lines.length) {
      toast.error("Inclua pelo menos uma área no cenário.");
      return;
    }

    setSaving(true);
    try {
      const saved = draft.id
        ? await apiFetch<Scenario>(`/scenarios/${draft.id}`, {
            method: "PUT",
            body: payload,
          })
        : await apiFetch<Scenario>("/scenarios", {
            method: "POST",
            body: payload,
          });

      toast.success("Cenário de ocupação salvo.");
      await onSaved(saved.id);
      setDraft(scenarioToDraft(saved));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cenário.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteScenario() {
    if (!draft.id) return;

    setSaving(true);
    try {
      await apiFetch(`/scenarios/${draft.id}`, { method: "DELETE" });
      toast.success("Cenário removido.");
      await onSaved(ALL_AREAS_ID);
      setDraft(createEmptyScenarioDraft());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível remover o cenário.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Cenários de ocupação</DialogTitle>
          <DialogDescription>
            Use as chaves das áreas retornadas pela ocupação para somar ou
            subtrair leituras.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto rounded-md border bg-muted/20 p-2">
            <Button
              type="button"
              variant="outline"
              className="mb-2 w-full justify-start"
              onClick={() => setDraft(createEmptyScenarioDraft())}
            >
              <Plus className="h-4 w-4" />
              Novo cenário
            </Button>

            <div className="space-y-2">
              {scenarios.length ? (
                scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setDraft(scenarioToDraft(scenario))}
                    className={cn(
                      "w-full rounded-md border bg-card p-3 text-left transition hover:border-primary/35",
                      draft.id === scenario.id &&
                        "border-primary/35 bg-primary/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {scenario.name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatNumber(scenario.lines?.length ?? 0)} áreas
                        </div>
                      </div>
                      <Badge variant={scenario.active ? "success" : "secondary"}>
                        {scenario.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-md border border-dashed bg-background px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhum cenário cadastrado.
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
              <div className="space-y-2">
                <Label htmlFor="occupancy-scenario-name">Nome</Label>
                <Input
                  id="occupancy-scenario-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Ocupação salão principal"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.active}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      active: !current.active,
                    }))
                  }
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition",
                    draft.active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {draft.active ? "Ativo" : "Inativo"}
                  <span
                    className={cn(
                      "flex h-4 w-7 items-center rounded-full p-0.5 transition",
                      draft.active ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "h-3 w-3 rounded-full bg-background shadow-sm transition",
                        draft.active && "translate-x-3",
                      )}
                    />
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="occupancy-scenario-description">Descrição</Label>
              <Textarea
                id="occupancy-scenario-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Ex.: soma do salão menos área de circulação"
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Áreas do cenário</div>
                  <div className="text-xs text-muted-foreground">
                    Digite a chave da área ou escolha uma das áreas já carregadas.
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar área
                </Button>
              </div>

              <datalist id="occupancy-area-options">
                {areaOptions.map((area) => (
                  <option key={area.key} value={area.key}>
                    {area.label}
                  </option>
                ))}
              </datalist>

              {draft.lines.length ? (
                <div className="space-y-2">
                  {draft.lines.map((line, index) => (
                    <div
                      key={`${line.line_count_id}-${index}`}
                      className="grid gap-3 rounded-md border bg-card p-3 md:grid-cols-[minmax(0,1.2fr)_150px_minmax(0,1fr)_auto]"
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`occupancy-area-${index}`}>Área</Label>
                        <Input
                          id={`occupancy-area-${index}`}
                          list="occupancy-area-options"
                          value={line.line_count_id}
                          onChange={(event) =>
                            updateLine(index, {
                              line_count_id: event.target.value,
                            })
                          }
                          placeholder="area-1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Operação</Label>
                        <Select
                          value={String(line.action_multiplier ?? 1)}
                          onValueChange={(value) =>
                            updateLine(index, {
                              action_multiplier: normalizeMultiplier(value),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">
                              <span className="inline-flex items-center gap-2">
                                <Plus className="h-3.5 w-3.5" />
                                Somar
                              </span>
                            </SelectItem>
                            <SelectItem value="-1">
                              <span className="inline-flex items-center gap-2">
                                <Minus className="h-3.5 w-3.5" />
                                Subtrair
                              </span>
                            </SelectItem>
                            <SelectItem value="0">Ignorar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`occupancy-label-${index}`}>Rótulo</Label>
                        <Input
                          id={`occupancy-label-${index}`}
                          value={line.label ?? ""}
                          onChange={(event) =>
                            updateLine(index, {
                              label: event.target.value,
                            })
                          }
                          placeholder="Nome amigável"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => removeLine(index)}
                          aria-label="Remover área"
                          title="Remover área"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Inclua áreas para montar o cenário.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {draft.id ? (
            <Button
              type="button"
              variant="outline"
              onClick={deleteScenario}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              Remover
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={saveScenario} disabled={saving}>
            <Save className="h-4 w-4" />
            Salvar cenário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function buildOccupancyChartDefinitions(now: Date): OccupancyChartDefinition[] {
  const minuteEnd = addMinutes(startOfMinute(now), 1);
  const hourEnd = addHours(startOfHour(now), 1);
  const todayStart = startOfDay(now);
  const currentWeekStart = startOfWeek(now);
  const currentMonthStart = startOfMonth(now);
  const currentSemesterStart = startOfSemester(now);
  const currentYearStart = startOfYear(now);

  return [
    {
      id: "occupancy_chart_minute",
      label: "Minuto a minuto",
      description: "Últimos 60 minutos.",
      granularity: "minute",
      from: addMinutes(minuteEnd, -60),
      to: minuteEnd,
    },
    {
      id: "occupancy_chart_hour",
      label: "Hora a hora",
      description: "Hoje por hora.",
      granularity: "hour",
      from: todayStart,
      to: hourEnd,
    },
    {
      id: "occupancy_chart_day",
      label: "Dia a dia",
      description: "Últimos 7 dias.",
      granularity: "day",
      from: addDays(todayStart, -6),
      to: addDays(todayStart, 1),
    },
    {
      id: "occupancy_chart_week",
      label: "Semana a semana",
      description: "Últimas 8 semanas.",
      granularity: "week",
      from: addDays(currentWeekStart, -7 * 7),
      to: addDays(currentWeekStart, 7),
    },
    {
      id: "occupancy_chart_month",
      label: "Mês a mês",
      description: "Últimos 12 meses.",
      granularity: "month",
      from: addMonths(currentMonthStart, -11),
      to: addMonths(currentMonthStart, 1),
    },
    {
      id: "occupancy_chart_semester",
      label: "Semestre a semestre",
      description: "Últimos 6 semestres.",
      granularity: "semester",
      from: addMonths(currentSemesterStart, -5 * 6),
      to: addMonths(currentSemesterStart, 6),
    },
    {
      id: "occupancy_chart_year",
      label: "Ano a ano",
      description: "Últimos 5 anos.",
      granularity: "year",
      from: addYears(currentYearStart, -4),
      to: addYears(currentYearStart, 1),
    },
  ];
}

async function loadOccupancyChartState(
  definition: OccupancyChartDefinition,
  signal: AbortSignal,
): Promise<OccupancyChartState> {
  const emptyBuckets = buildEmptyOccupancyBuckets(definition);
  const buckets = await mapWithConcurrency(
    emptyBuckets,
    OCCUPANCY_BUCKET_CONCURRENCY,
    async (bucket) => {
      try {
        const response = await apiFetch<OccupancySnapshotsResponse>(
          occupancyPath(bucket.from, bucket.to),
          { signal },
        );

        return {
          ...bucket,
          rows: normalizeOccupancyRows(response),
        };
      } catch (error) {
        if (isAbortError(error)) throw error;

        return {
          ...bucket,
          error: occupancyErrorMessage(error),
          rows: [],
        };
      }
    },
  );
  const rows = buckets.flatMap((bucket) => bucket.rows);
  const error = buckets.every((bucket) => bucket.error)
    ? buckets.find((bucket) => bucket.error)?.error
    : undefined;

  return {
    buckets,
    rows,
    error,
  };
}

function buildEmptyOccupancyBuckets(definition: OccupancyChartDefinition) {
  const buckets: OccupancyBucket[] = [];
  let cursor = new Date(definition.from);
  let guard = 0;

  while (cursor < definition.to && guard < 500) {
    const next = addGranularity(cursor, definition.granularity);

    buckets.push({
      id: `${definition.id}-${cursor.toISOString()}`,
      label: bucketLabel(cursor, definition.granularity),
      from: cursor,
      to: next > definition.to ? definition.to : next,
      rows: [],
    });

    cursor = next;
    guard += 1;
  }

  return buckets;
}

function occupancyPath(from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    object_class: "person",
    to: to.toISOString(),
  });

  return `/occupancy?${params.toString()}`;
}

function buildOccupancyMetric(
  rows: OccupancyRow[],
  scenario: Scenario | null,
): OccupancyMetric {
  const points = buildOccupancyPoints(rows, scenario);

  return {
    activeAreas: points.filter((point) => point.current > 0).length,
    areaCount: scenario
      ? scenario.lines?.filter((line) => line.action_multiplier !== 0).length ?? 0
      : points.length,
    average: sumPointValue(points, "average"),
    current: sumPointValue(points, "current"),
    minimum: sumPointValue(points, "minimum"),
    peak: sumPointValue(points, "peak"),
    updatedAt: latestPointDate(points),
  };
}

function buildCurrentBucketMetric(
  buckets: OccupancyBucket[],
  scenario: Scenario | null,
) {
  return buildOccupancyMetric(getLatestBucketRows(buckets), scenario);
}

function buildPeriodBucketMetric(
  buckets: OccupancyBucket[],
  scenario: Scenario | null,
): OccupancyMetric {
  const metrics = buckets
    .filter((bucket) => bucket.rows.length > 0)
    .map((bucket) => buildOccupancyMetric(bucket.rows, scenario));
  const currentMetric = metrics.at(-1) ?? emptyOccupancyMetric();

  if (!metrics.length) return currentMetric;

  return {
    activeAreas: currentMetric.activeAreas,
    areaCount: currentMetric.areaCount,
    average: roundChartValue(
      metrics.reduce((sum, metric) => sum + metric.average, 0) / metrics.length,
    ),
    current: currentMetric.current,
    minimum: Math.min(...metrics.map((metric) => metric.minimum)),
    peak: Math.max(...metrics.map((metric) => metric.peak)),
    updatedAt: currentMetric.updatedAt,
  };
}

function buildOccupancyTimelinePoints(
  buckets: OccupancyBucket[],
  scenario: Scenario | null,
): OccupancyPoint[] {
  return buckets.map((bucket) => {
    const metric = buildOccupancyMetric(bucket.rows, scenario);

    return {
      key: bucket.id,
      label: bucket.label,
      detail: `${formatTime(bucket.from)} - ${formatTime(bucket.to)}`,
      average: metric.average,
      current: metric.current,
      minimum: metric.minimum,
      peak: metric.peak,
      updatedAt: metric.updatedAt,
    };
  });
}

function getLatestBucketRows(buckets: OccupancyBucket[]) {
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    if (buckets[index]?.rows.length) return buckets[index].rows;
  }

  return [];
}

function emptyOccupancyMetric(): OccupancyMetric {
  return {
    activeAreas: 0,
    areaCount: 0,
    average: 0,
    current: 0,
    minimum: 0,
    peak: 0,
  };
}

function buildOccupancyPoints(
  rows: OccupancyRow[],
  scenario: Scenario | null,
): OccupancyPoint[] {
  const grouped = groupOccupancyRows(rows);

  if (scenario) {
    const lines = scenario.lines?.filter((line) => line.action_multiplier !== 0) ?? [];
    const parts = lines
      .map((line) => {
        const point = grouped.get(line.line_count_id);
        if (!point) return null;

        const multiplier = line.action_multiplier ?? 1;

        return {
          ...point,
          average: point.average * multiplier,
          current: point.current * multiplier,
          minimum: point.minimum * multiplier,
          peak: point.peak * multiplier,
        };
      })
      .filter(Boolean) as OccupancyPoint[];

    if (!parts.length) return [];

    return [
      {
        key: scenario.id,
        label: scenario.name,
        detail: `${formatNumber(lines.length)} áreas`,
        average: sumPointValue(parts, "average"),
        current: sumPointValue(parts, "current"),
        minimum: sumPointValue(parts, "minimum"),
        peak: sumPointValue(parts, "peak"),
        updatedAt: latestPointDate(parts),
      },
    ];
  }

  return Array.from(grouped.values()).sort((first, second) =>
    first.label.localeCompare(second.label, "pt-BR"),
  );
}

function groupOccupancyRows(rows: OccupancyRow[]) {
  const grouped = new Map<string, OccupancyPoint>();

  rows.forEach((row, index) => {
    const key = rowAreaKey(row) || `area-${index}`;
    const label = rowAreaLabel(row, key);
    const current = safeNumber(row.current_value);
    const average = safeNumber(row.avg);
    const peak = safeNumber(row.peak);
    const minimum = safeNumber(row.min);
    const existing = grouped.get(key);

    if (existing) {
      existing.current += current;
      existing.average += average;
      existing.peak += peak;
      existing.minimum += minimum;
      existing.updatedAt = latestDateString(existing.updatedAt, row.current_at);
      return;
    }

    grouped.set(key, {
      key,
      label,
      detail:
        row.camera_name?.trim() ||
        (row.camera_id ? `Câmera ${compactId(row.camera_id)}` : undefined),
      average,
      current,
      minimum,
      peak,
      updatedAt: row.current_at,
    });
  });

  return grouped;
}

function buildAreaOptions(rows: OccupancyRow[]) {
  const grouped = groupOccupancyRows(rows);

  return Array.from(grouped.values()).map((point) => ({
    key: point.key,
    label: point.label,
    detail: point.detail,
  }));
}

function buildOccupancyChartOption(
  definition: OccupancyChartDefinition,
  points: OccupancyPoint[],
): EnterpriseChartOption {
  return {
    color: ["#1267C4", "#5AA8F5", "#0B4EA2", "#B7C7DA"],
    grid: {
      bottom: 2,
      containLabel: true,
      left: 4,
      right: 10,
      top: 56,
    },
    legend: {
      itemGap: 14,
      itemHeight: 10,
      itemWidth: 10,
      left: 0,
      right: 0,
      textStyle: {
        color: "#526477",
        fontSize: 12,
      },
      top: 0,
    },
    tooltip: {
      axisPointer: {
        shadowStyle: {
          color: "rgba(18, 103, 196, 0.06)",
        },
        type: "shadow",
      },
      backgroundColor: "#ffffff",
      borderColor: "#D8E3F2",
      borderWidth: 1,
      confine: true,
      padding: [10, 12],
      textStyle: {
        color: "#13233A",
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
        color: "#66758A",
        fontSize: 11,
        formatter: (value: string) => truncateLabel(value),
        hideOverlap: true,
      },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
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
        color: "#66758A",
        fontSize: 11,
      },
      minInterval:
        definition.granularity === "minute" || definition.granularity === "hour"
          ? 1
          : undefined,
      splitLine: {
        lineStyle: {
          color: "#E8EEF6",
        },
      },
      type: "value",
    },
    series: [
      {
        barCategoryGap: "42%",
        barGap: "18%",
        barMaxWidth: 28,
        data: points.map((point) => roundChartValue(point.current)),
        emphasis: {
          itemStyle: {
            color: "#0B4EA2",
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: {
            colorStops: [
              { color: "#1267C4", offset: 0 },
              { color: "#5AA8F5", offset: 1 },
            ],
            type: "linear",
            x: 0,
            x2: 0,
            y: 0,
            y2: 1,
          },
        },
        name: "Atual",
        type: "bar",
      },
      {
        barMaxWidth: 28,
        data: points.map((point) => roundChartValue(point.average)),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#5AA8F5",
        },
        name: "Média",
        type: "bar",
      },
      {
        barMaxWidth: 28,
        data: points.map((point) => roundChartValue(point.peak)),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#0B4EA2",
        },
        name: "Pico",
        type: "bar",
      },
      {
        barMaxWidth: 28,
        data: points.map((point) => roundChartValue(point.minimum)),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#B7C7DA",
        },
        name: "Mínimo",
        type: "bar",
      },
    ],
  };
}

function buildScenarioPayload(draft: ScenarioDraft) {
  return {
    active: draft.active,
    description: draft.description.trim() || undefined,
    lines: draft.lines
      .map((line) => ({
        action_multiplier: line.action_multiplier ?? 1,
        label: line.label?.trim() || undefined,
        line_count_id: line.line_count_id.trim(),
      }))
      .filter((line) => line.line_count_id),
    name: draft.name.trim(),
    scenario_type: OCCUPANCY_SCENARIO_TYPE,
  };
}

function scenarioToDraft(scenario: Scenario): ScenarioDraft {
  return {
    active: scenario.active,
    description: scenario.description ?? "",
    id: scenario.id,
    lines: (scenario.lines ?? []).map((line) => ({
      action_multiplier: line.action_multiplier ?? 1,
      label: line.label ?? "",
      line_count_id: line.line_count_id,
    })),
    name: scenario.name,
  };
}

function createEmptyScenarioDraft(): ScenarioDraft {
  return {
    active: true,
    description: "",
    lines: [],
    name: "",
  };
}

function isOccupancyScenario(scenario: Scenario) {
  return normalizeScenarioType(scenario.scenario_type) === OCCUPANCY_SCENARIO_TYPE;
}

function normalizeScenarioType(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace("ocupacao", "occupancy")
    .replace("ocupação", "occupancy");
}

function normalizeMultiplier(value: string): -1 | 0 | 1 {
  if (value === "-1") return -1;
  if (value === "0") return 0;
  return 1;
}

function occupancyErrorMessage(error: unknown) {
  if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
    return "Endpoint de ocupação ainda não disponível.";
  }

  return error instanceof Error
    ? error.message
    : "Não foi possível carregar este gráfico.";
}

function rowAreaKey(row: OccupancyRow) {
  return row.area?.trim() || row.camera_id?.trim() || "";
}

function rowAreaLabel(row: OccupancyRow, fallback: string) {
  return (
    row.area_label?.trim() ||
    row.area?.trim() ||
    row.camera_name?.trim() ||
    (row.camera_id ? compactId(row.camera_id) : fallback)
  );
}

function compactId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function latestPointDate(points: OccupancyPoint[]) {
  return points.reduce<string | undefined>(
    (latest, point) => latestDateString(latest, point.updatedAt),
    undefined,
  );
}

function latestDateString(first: string | undefined, second: string | undefined) {
  if (!first) return second;
  if (!second) return first;

  const firstTime = new Date(first).getTime();
  const secondTime = new Date(second).getTime();

  if (Number.isNaN(firstTime)) return second;
  if (Number.isNaN(secondTime)) return first;

  return secondTime > firstTime ? second : first;
}

function sumPointValue(
  points: OccupancyPoint[],
  key: "average" | "current" | "minimum" | "peak",
) {
  return points.reduce((sum, point) => sum + point[key], 0);
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

function addGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return addMinutes(date, 1);
  if (granularity === "hour") return addHours(date, 1);
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "month") return addMonths(date, 1);
  if (granularity === "semester") return addMonths(date, 6);
  return addYears(date, 1);
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

function weekdayShortName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
}

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function roundChartValue(value: number) {
  return Math.round(value * 10) / 10;
}

function formatOccupancyValue(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function truncateLabel(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 16)}...`;
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
