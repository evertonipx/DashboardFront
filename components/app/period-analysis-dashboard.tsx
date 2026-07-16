"use client";

import * as React from "react";
import {
  BarChart3,
  CalendarRange,
  Clock3,
  Grid3X3,
  Plus,
  Settings2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import {
  CardLayout,
  ReorderModeButton,
} from "@/components/app/card-layout";
import { EChart } from "@/components/app/echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { ReportExportActions } from "@/components/app/report-export-actions";
import { ScenarioPicker } from "@/components/app/scenario-picker";
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
import { hasVisualAdminAccess } from "@/lib/access";
import { aggregateQueryIso } from "@/lib/aggregate-time";
import { apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  buildPeriodAnalysisWidgetModel,
  formatPeriodAnalysisRange,
  periodAnalysisBaselineLabel,
  periodAnalysisBaselineRange,
  resolvePeriodAnalysisRange,
  type PeriodAnalysisData,
  type PeriodAnalysisDataset,
  type PeriodAnalysisRange,
  type PeriodAnalysisWidgetModel,
} from "@/lib/period-analysis-model";
import {
  PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT,
  createDefaultPeriodAnalysisSettings,
  deletePeriodAnalysisWidget,
  loadPeriodAnalysisSettings,
  loadPeriodAnalysisWidgets,
  savePeriodAnalysisSettings,
  upsertPeriodAnalysisWidget,
  widgetKindLabel,
  type PeriodAnalysisBaseline,
  type PeriodAnalysisSettings,
  type PeriodAnalysisWidget,
  type PeriodAnalysisWidgetInput,
  type PeriodAnalysisWidgetKind,
} from "@/lib/period-analysis-widgets";
import type { ReportPayload } from "@/lib/report-export";
import {
  scenarioSelectionSummary,
  type ScenarioAnalyticsGranularity,
} from "@/lib/scenario-analytics";
import type {
  AggregateEventsResponse,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import { cn, formatNumber, formatTime } from "@/lib/utils";

type PeriodAnalysisDashboardProps = {
  manager?: boolean;
};

const widgetKindOptions: Array<{
  label: string;
  value: PeriodAnalysisWidgetKind;
}> = [
  { label: "Resumo do período", value: "summary" },
  { label: "Fluxo por período", value: "timeline" },
  { label: "Comparativo de cenários", value: "comparison" },
  { label: "Ranking de cenários", value: "ranking" },
  { label: "Mapa de calor dia x hora", value: "heatmap" },
  { label: "Acumulado diário x base", value: "cumulative" },
  { label: "Tendência 7 x 30 dias", value: "trend" },
  { label: "Perfil horário", value: "hour_profile" },
];

const baselineOptions: Array<{
  label: string;
  value: PeriodAnalysisBaseline;
}> = [
  { label: "Período anterior equivalente", value: "previous_period" },
  { label: "Mês anterior", value: "previous_month" },
  { label: "Mesmo período do ano anterior", value: "last_year" },
];

const widgetIcons: Record<
  PeriodAnalysisWidgetKind,
  React.ComponentType<{ className?: string }>
> = {
  comparison: BarChart3,
  cumulative: TrendingUp,
  heatmap: Grid3X3,
  hour_profile: BarChart3,
  ranking: BarChart3,
  summary: CalendarRange,
  timeline: BarChart3,
  trend: TrendingUp,
};

export function PeriodAnalysisDashboard({
  manager = false,
}: PeriodAnalysisDashboardProps) {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const canEditVisual = hasVisualAdminAccess(user);
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [widgets, setWidgets] = React.useState<PeriodAnalysisWidget[]>([]);
  const [draftSettings, setDraftSettings] = React.useState<PeriodAnalysisSettings>(
    () => createDefaultPeriodAnalysisSettings(),
  );
  const [appliedSettings, setAppliedSettings] =
    React.useState<PeriodAnalysisSettings>(() =>
      createDefaultPeriodAnalysisSettings(),
    );
  const [data, setData] = React.useState<PeriodAnalysisData>(() => emptyData());
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [queryVersion, setQueryVersion] = React.useState(0);
  const [layoutOrganizerOpen, setLayoutOrganizerOpen] = React.useState(false);
  const [layoutReorderMode, setLayoutReorderMode] = React.useState(false);
  const [widgetDialogOpen, setWidgetDialogOpen] = React.useState(false);
  const [widgetForm, setWidgetForm] =
    React.useState<PeriodAnalysisWidgetInput>(() => emptyWidgetForm());
  const requestRef = React.useRef<AbortController | null>(null);
  const period = React.useMemo(
    () =>
      resolvePeriodAnalysisRange(appliedSettings.from, appliedSettings.to) ??
      resolvePeriodAnalysisRange(
        createDefaultPeriodAnalysisSettings().from,
        createDefaultPeriodAnalysisSettings().to,
      )!,
    [appliedSettings],
  );
  const widgetIds = React.useMemo(
    () => widgets.map((widget) => widget.id),
    [widgets],
  );
  const preferences = useCardPreferences(
    "analysis",
    widgetIds,
    companyScopeId,
    { syncServer: false, userId: user?.id },
  );
  const widgetColorById = React.useMemo(
    () =>
      new Map(
        preferences.flatMap((preference) =>
          preference.color ? [[preference.id, preference.color] as const] : [],
        ),
      ),
    [preferences],
  );
  const dataRequirementsKey = React.useMemo(
    () =>
      JSON.stringify({
        baseline: Array.from(
          new Set(
            widgets
              .filter((widget) => widget.kind === "cumulative")
              .map((widget) => widget.baseline),
          ),
        ).sort(),
        hour: widgets.some(
          (widget) =>
            widget.kind === "heatmap" ||
            widget.kind === "hour_profile" ||
            ((widget.kind === "timeline" || widget.kind === "comparison") &&
              widget.granularity === "hour"),
        ),
      }),
    [widgets],
  );

  React.useEffect(() => {
    const settings = loadPeriodAnalysisSettings(companyScopeId, user?.id);
    setDraftSettings(settings);
    setAppliedSettings(settings);
    setWidgets(loadPeriodAnalysisWidgets(companyScopeId, user?.id));
  }, [companyScopeId, user?.id]);

  React.useEffect(() => {
    function syncWidgets() {
      setWidgets(loadPeriodAnalysisWidgets(companyScopeId, user?.id));
    }

    window.addEventListener(PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT, syncWidgets);
    window.addEventListener("storage", syncWidgets);
    return () => {
      window.removeEventListener(
        PERIOD_ANALYSIS_WIDGETS_UPDATED_EVENT,
        syncWidgets,
      );
      window.removeEventListener("storage", syncWidgets);
    };
  }, [companyScopeId, user?.id]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingScenarios(true);
    apiFetch<Scenario[]>("/scenarios")
      .then((rows) => {
        if (cancelled) return;
        const scoped = filterScopedApiRows(rows, companyScopeId);
        setScenarios(manager ? scoped : scoped.filter((scenario) => scenario.active));
      })
      .catch((error) => {
        if (cancelled) return;
        setScenarios([]);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os cenários.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingScenarios(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyScopeId, manager]);

  React.useEffect(() => {
    const requirements = JSON.parse(dataRequirementsKey) as {
      baseline: PeriodAnalysisBaseline[];
      hour: boolean;
    };
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setLoadingData(true);

    const dayRange = { from: addDays(period.from, -29), to: period.to };
    Promise.all([
      fetchAnalysisDataset("day", dayRange, companyScopeId, controller.signal),
      requirements.hour
        ? fetchAnalysisDataset("hour", period, companyScopeId, controller.signal)
        : Promise.resolve(emptyDataset("hour")),
      Promise.all(
        requirements.baseline.map(async (baseline) => {
          const baselineRange = periodAnalysisBaselineRange(period, baseline);
          const dataset = await fetchAnalysisDataset(
            "day",
            baselineRange,
            companyScopeId,
            controller.signal,
          );
          return [baseline, dataset] as const;
        }),
      ),
    ])
      .then(([day, hour, baselineEntries]) => {
        if (controller.signal.aborted) return;
        setData({ baseline: Object.fromEntries(baselineEntries), day, hour });
        setLastUpdated(new Date());
        if (
          day.error ||
          hour.error ||
          baselineEntries.some(([, dataset]) => dataset.error)
        ) {
          toast.error("Alguns dados da análise não puderam ser carregados.");
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a análise.",
        );
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoadingData(false);
        }
      });

    return () => controller.abort();
  }, [companyScopeId, dataRequirementsKey, period, queryVersion]);

  const modelByWidgetId = React.useMemo(
    () =>
      new Map(
        widgets.map((widget) => [
          widget.id,
          buildPeriodAnalysisWidgetModel({
            color: widgetColorById.get(widget.id),
            data,
            period,
            scenarios,
            widget,
          }),
        ]),
      ),
    [data, period, scenarios, widgetColorById, widgets],
  );
  const layoutCards = widgets.map((widget) => ({
    className:
      widget.kind === "summary" || widget.kind === "heatmap"
        ? "sm:col-span-2 xl:col-span-4"
        : "sm:col-span-2 xl:col-span-2",
    defaultSize:
      widget.kind === "summary" || widget.kind === "heatmap"
        ? ("full" as const)
        : ("wide" as const),
    id: widget.id,
    label: widget.title,
    node: (
      <PeriodAnalysisCard
        canConfigure={canEditVisual}
        loading={loadingData || loadingScenarios}
        model={modelByWidgetId.get(widget.id)!}
        monitorMode={monitorMode}
        onEdit={() => openEditWidget(widget)}
        onRemove={() => removeWidget(widget.id)}
        scenarioSummary={scenarioSelectionSummary(
          scenarios,
          widget.selectionMode,
          widget.scenarioIds,
        )}
        widget={widget}
      />
    ),
  }));
  const visibleWidgetIds = new Set(
    preferences
      .filter((preference) => preference.visible !== false)
      .map((preference) => preference.id),
  );
  const reportPayload = composePeriodAnalysisReport({
    models: widgets
      .filter(
        (widget) => !preferences.length || visibleWidgetIds.has(widget.id),
      )
      .map((widget) => ({
        model: modelByWidgetId.get(widget.id)!,
        title: widget.title,
      })),
    period,
  });

  function applyPeriod() {
    const nextPeriod = resolvePeriodAnalysisRange(
      draftSettings.from,
      draftSettings.to,
    );
    if (!nextPeriod) {
      toast.error("Informe um período válido, com a data inicial antes da final.");
      return;
    }

    savePeriodAnalysisSettings(draftSettings, companyScopeId, user?.id);
    setAppliedSettings(draftSettings);
    setQueryVersion((value) => value + 1);
  }

  function openAddWidget() {
    setWidgetForm(emptyWidgetForm());
    setWidgetDialogOpen(true);
  }

  function openEditWidget(widget: PeriodAnalysisWidget) {
    setWidgetForm({
      baseline: widget.baseline,
      granularity: widget.granularity,
      id: widget.id,
      kind: widget.kind,
      scenarioIds: widget.scenarioIds,
      selectionMode: widget.selectionMode,
      title: widget.title,
    });
    setWidgetDialogOpen(true);
  }

  function updateWidgetKind(kind: PeriodAnalysisWidgetKind) {
    setWidgetForm((current) => {
      const currentDefaultTitle = widgetKindLabel(current.kind);
      return {
        ...current,
        granularity:
          kind === "heatmap" || kind === "hour_profile"
            ? "hour"
            : kind === "timeline" || kind === "comparison"
              ? current.granularity
              : "day",
        kind,
        title:
          !current.title.trim() || current.title === currentDefaultTitle
            ? widgetKindLabel(kind)
            : current.title,
      };
    });
  }

  function saveWidget() {
    if (
      widgetForm.selectionMode === "custom" &&
      !widgetForm.scenarioIds.length
    ) {
      toast.error("Selecione ao menos um cenário para o widget.");
      return;
    }

    const next = upsertPeriodAnalysisWidget(
      widgetForm,
      companyScopeId,
      user?.id,
    );
    setWidgets(next);
    setWidgetDialogOpen(false);
    toast.success(widgetForm.id ? "Widget atualizado." : "Widget adicionado.");
  }

  function removeWidget(widgetId: string) {
    setWidgets(
      deletePeriodAnalysisWidget(widgetId, companyScopeId, user?.id),
    );
    toast.success("Widget removido.");
  }

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
              Análises por período
            </div>
            <div className="truncate text-lg font-semibold">
              {formatPeriodAnalysisRange(period)}
            </div>
          </div>
          {lastUpdated ? (
            <Badge variant="outline" className="gap-1 bg-card">
              <Clock3 className="h-3.5 w-3.5" />
              {formatTime(lastUpdated)}
            </Badge>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border bg-card p-4 shadow-soft">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-end">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">Período da análise</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(150px,220px)_minmax(150px,220px)_auto] sm:items-end">
                <Field label="De">
                  <Input
                    type="date"
                    value={draftSettings.from}
                    onChange={(event) =>
                      setDraftSettings((current) => ({
                        ...current,
                        from: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Até">
                  <Input
                    type="date"
                    value={draftSettings.to}
                    onChange={(event) =>
                      setDraftSettings((current) => ({
                        ...current,
                        to: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Button
                  type="button"
                  onClick={applyPeriod}
                  disabled={loadingData}
                  className="sm:w-[150px] sm:justify-self-start"
                >
                  <CalendarRange className="h-4 w-4" />
                  Consultar
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
              <Badge variant="outline" className="gap-1 bg-background">
                <Clock3 className="h-3.5 w-3.5" />
                {formatPeriodAnalysisRange(period)}
              </Badge>
              {lastUpdated ? (
                <Badge variant="outline" className="gap-1 bg-background">
                  {formatTime(lastUpdated)}
                </Badge>
              ) : null}
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
                disabled={loadingData || loadingScenarios || !widgets.length}
                payload={reportPayload}
              />
              <MonitorModeButton
                disabled={!widgets.length}
                onClick={enterMonitorMode}
              />
            </div>
          </div>
        </div>
      )}

      {loadingScenarios && !scenarios.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[320px] w-full" />
          <Skeleton className="h-[320px] w-full" />
        </div>
      ) : scenarios.length ? (
        <CardLayout
          cards={layoutCards}
          editActions={
            <Button type="button" size="sm" onClick={openAddWidget}>
              <Plus className="h-4 w-4" />
              Adicionar widget
            </Button>
          }
          menuKey="analysis"
          monitorMode={monitorMode}
          onOrganizerOpenChange={setLayoutOrganizerOpen}
          onReorderModeChange={setLayoutReorderMode}
          organizerOpen={layoutOrganizerOpen}
          reorderMode={layoutReorderMode}
          showOrganizerTrigger={false}
          showReorderTrigger={false}
        />
      ) : (
        <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum cenário disponível para gerar análises.
        </div>
      )}

      <WidgetDialog
        form={widgetForm}
        onFormChange={setWidgetForm}
        onKindChange={updateWidgetKind}
        onOpenChange={setWidgetDialogOpen}
        onSave={saveWidget}
        open={widgetDialogOpen}
        scenarios={scenarios}
      />
    </section>
  );
}

function PeriodAnalysisCard({
  canConfigure,
  loading,
  model,
  monitorMode,
  onEdit,
  onRemove,
  scenarioSummary,
  widget,
}: {
  canConfigure: boolean;
  loading: boolean;
  model: PeriodAnalysisWidgetModel;
  monitorMode: boolean;
  onEdit: () => void;
  onRemove: () => void;
  scenarioSummary: string;
  widget: PeriodAnalysisWidget;
}) {
  const Icon = widgetIcons[widget.kind];

  return (
    <Card className={cn("min-w-0 overflow-hidden", monitorMode && "h-full")}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{widget.title}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {model.description}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant="outline"
              className="max-w-[220px] truncate"
              title={scenarioSummary}
            >
              {scenarioSummary}
            </Badge>
            {(widget.kind === "timeline" || widget.kind === "comparison") && (
              <Badge variant="outline">
                {widget.granularity === "hour" ? "Hora a hora" : "Dia a dia"}
              </Badge>
            )}
            {widget.kind === "cumulative" ? (
              <Badge variant="outline">
                {periodAnalysisBaselineLabel(widget.baseline)}
              </Badge>
            ) : null}
            {canConfigure && !monitorMode ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onEdit}
                  aria-label={`Configurar ${widget.title}`}
                  title="Configurar widget"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={onRemove}
                  aria-label={`Remover ${widget.title}`}
                  title="Remover widget"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton style={{ height: model.height }} className="w-full" />
        ) : model.error ? (
          <EmptyState text={model.error} height={model.height} />
        ) : model.metrics ? (
          <MetricGrid metrics={model.metrics} />
        ) : model.hasData && model.option ? (
          <div className="overflow-x-auto">
            <div
              style={{
                height: model.height,
                minWidth: model.minWidth,
              }}
            >
              <EChart option={model.option} />
            </div>
          </div>
        ) : (
          <EmptyState text={model.emptyText} height={Math.min(260, model.height)} />
        )}
      </CardContent>
    </Card>
  );
}

function MetricGrid({ metrics }: { metrics: NonNullable<PeriodAnalysisWidgetModel["metrics"]> }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 bg-card p-4">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {metric.label}
          </div>
          <div className="mt-2 truncate text-2xl font-semibold tabular-nums">
            {typeof metric.value === "number"
              ? formatNumber(metric.value)
              : metric.value}
          </div>
          {metric.description ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {metric.description}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WidgetDialog({
  form,
  onFormChange,
  onKindChange,
  onOpenChange,
  onSave,
  open,
  scenarios,
}: {
  form: PeriodAnalysisWidgetInput;
  onFormChange: React.Dispatch<React.SetStateAction<PeriodAnalysisWidgetInput>>;
  onKindChange: (kind: PeriodAnalysisWidgetKind) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
  scenarios: Scenario[];
}) {
  const configurableGranularity =
    form.kind === "timeline" || form.kind === "comparison";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Configurar widget" : "Adicionar widget"}
          </DialogTitle>
          <DialogDescription>
            Configuração individual do widget.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de análise">
            <Select
              value={form.kind}
              onValueChange={(value) =>
                onKindChange(value as PeriodAnalysisWidgetKind)
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {widgetKindOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Título">
            <Input
              value={form.title}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder={widgetKindLabel(form.kind)}
            />
          </Field>

          {configurableGranularity ? (
            <Field label="Agrupamento">
              <Select
                value={form.granularity}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    granularity: value as ScenarioAnalyticsGranularity,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia a dia</SelectItem>
                  <SelectItem value="hour">Hora a hora</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {form.kind === "cumulative" ? (
            <Field label="Base de comparação">
              <Select
                value={form.baseline}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    baseline: value as PeriodAnalysisBaseline,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {baselineOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <ScenarioPicker
            className="sm:col-span-2"
            mode={form.selectionMode}
            onModeChange={(selectionMode) =>
              onFormChange((current) => ({ ...current, selectionMode }))
            }
            onSelectedIdsChange={(scenarioIds) =>
              onFormChange((current) => ({ ...current, scenarioIds }))
            }
            scenarios={scenarios}
            selectedIds={form.scenarioIds}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={
              form.selectionMode === "custom" && !form.scenarioIds.length
            }
          >
            {form.id ? "Salvar alterações" : "Adicionar widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ text, height }: { text: string; height: number }) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground"
    >
      {text}
    </div>
  );
}

function emptyWidgetForm(): PeriodAnalysisWidgetInput {
  return {
    baseline: "previous_period",
    granularity: "day",
    kind: "timeline",
    scenarioIds: [],
    selectionMode: "all",
    title: "Fluxo por período",
  };
}

function composePeriodAnalysisReport({
  models,
  period,
}: {
  models: Array<{ model: PeriodAnalysisWidgetModel; title: string }>;
  period: PeriodAnalysisRange;
}): ReportPayload {
  return {
    charts: models.flatMap(({ model, title }) =>
      model.hasData && model.option && model.table
        ? [
            {
              description: model.description,
              option: model.option,
              table: model.table,
              title,
            },
          ]
        : [],
    ),
    context: [formatPeriodAnalysisRange(period)],
    dataCompleteUntil: addDays(period.to, -1),
    filename: `ipxdata-analises-${formatFileDate(period.from)}-${formatFileDate(
      addDays(period.to, -1),
    )}`,
    generatedAt: new Date(),
    metrics: models.flatMap(({ model }) => model.metrics ?? []),
    subtitle: formatPeriodAnalysisRange(period),
    tables: models.flatMap(({ model }) =>
      model.option || !model.table ? [] : [model.table],
    ),
    title: "Análises por período",
  };
}

async function fetchAnalysisDataset(
  granularity: "hour" | "day",
  range: PeriodAnalysisRange,
  companyId?: string | null,
  signal?: AbortSignal,
): Promise<PeriodAnalysisDataset> {
  const params = new URLSearchParams({
    from: aggregateQueryIso(range.from, granularity),
    granularity,
    metric_type: "count",
    to: aggregateQueryIso(range.to, granularity),
  });
  const headers = companyId ? { "X-Company-ID": companyId } : undefined;

  try {
    const response = await apiFetch<AggregateEventsResponse>(
      `/analytics/aggregate?${params.toString()}`,
      { headers, signal },
    );
    return {
      granularity: response.granularity ?? granularity,
      rows: response.data ?? [],
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os dados.",
      granularity,
      rows: [],
    };
  }
}

function emptyData(): PeriodAnalysisData {
  return {
    baseline: {},
    day: emptyDataset("day"),
    hour: emptyDataset("hour"),
  };
}

function emptyDataset(
  granularity: AggregateGranularity,
): PeriodAnalysisDataset {
  return { granularity, rows: [] };
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatFileDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
