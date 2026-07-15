"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  Link2,
  MonitorUp,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  filterScopedApiRows,
  getStoredMasterCompanyScope,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { apiFetch } from "@/lib/api";
import { canManageViews } from "@/lib/permissions";
import type { Scenario } from "@/lib/types";
import { toDateTimeLocalValue } from "@/lib/utils";

const viewOptions = [
  {
    description: "Comparativo do acumulado do dia entre cenários cadastrados.",
    label: "Hoje por cenário",
    value: "today-scenario",
  },
  {
    description: "Comparativo do acumulado do dia entre locais cadastrados.",
    label: "Hoje por local",
    value: "today-location",
  },
  {
    description: "Comparativo do acumulado do dia entre sublocais cadastrados.",
    label: "Hoje por sublocal",
    value: "today-sub-location",
  },
  {
    description: "Comparativo flexível entre cenários por hora, dia, semana ou mês.",
    label: "Cenários por período",
    value: "scenario-hour",
  },
] as const;

type ViewChart = (typeof viewOptions)[number]["value"];
type ScenarioCompareGranularity = "hour" | "day" | "week" | "month";
type ScenarioComparePeriod =
  | "today"
  | "yesterday"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "custom";
type ScenarioSelectionMode = "all" | "custom";

type ViewWidget = {
  chart: ViewChart;
  from?: string;
  granularity?: ScenarioCompareGranularity;
  id: string;
  period?: ScenarioComparePeriod;
  scenarioIds: string[];
  selectionMode: ScenarioSelectionMode;
  title: string;
  to?: string;
};

const scenarioCompareGranularityOptions: Array<{
  label: string;
  value: ScenarioCompareGranularity;
}> = [
  { label: "Hora a hora", value: "hour" },
  { label: "Dia a dia", value: "day" },
  { label: "Semana a semana", value: "week" },
  { label: "Mês a mês", value: "month" },
];

const scenarioComparePeriodOptions: Array<{
  label: string;
  value: ScenarioComparePeriod;
}> = [
  { label: "Hoje", value: "today" },
  { label: "Ontem", value: "yesterday" },
  { label: "Últimas 24h", value: "last_24h" },
  { label: "Últimos 7 dias", value: "last_7d" },
  { label: "Últimos 30 dias", value: "last_30d" },
  { label: "Personalizado", value: "custom" },
];

export function ViewsManager() {
  const { user } = useAuth();
  const canAccessViews = canManageViews(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const [origin, setOrigin] = React.useState("");
  const [chart, setChart] = React.useState<ViewChart>("today-scenario");
  const [title, setTitle] = React.useState("Hoje por cenário");
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [scenarioCompareGranularity, setScenarioCompareGranularity] =
    React.useState<ScenarioCompareGranularity>("hour");
  const [scenarioComparePeriod, setScenarioComparePeriod] =
    React.useState<ScenarioComparePeriod>("today");
  const [scenarioSelectionMode, setScenarioSelectionMode] =
    React.useState<ScenarioSelectionMode>("all");
  const [scenarioSettingsOpen, setScenarioSettingsOpen] =
    React.useState(false);
  const [selectedScenarioIds, setSelectedScenarioIds] = React.useState<string[]>(
    [],
  );
  const [scenarioCompareFrom, setScenarioCompareFrom] = React.useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return toDateTimeLocalValue(start);
  });
  const [scenarioCompareTo, setScenarioCompareTo] = React.useState(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [widgetChart, setWidgetChart] =
    React.useState<ViewChart>("scenario-hour");
  const [widgetTitle, setWidgetTitle] = React.useState("");
  const [widgetScenarioCompareGranularity, setWidgetScenarioCompareGranularity] =
    React.useState<ScenarioCompareGranularity>("hour");
  const [widgetScenarioComparePeriod, setWidgetScenarioComparePeriod] =
    React.useState<ScenarioComparePeriod>("today");
  const [widgetScenarioSelectionMode, setWidgetScenarioSelectionMode] =
    React.useState<ScenarioSelectionMode>("all");
  const [widgetSelectedScenarioIds, setWidgetSelectedScenarioIds] = React.useState<
    string[]
  >([]);
  const [widgetScenarioSettingsOpen, setWidgetScenarioSettingsOpen] =
    React.useState(false);
  const [widgetScenarioCompareFrom, setWidgetScenarioCompareFrom] = React.useState(
    () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return toDateTimeLocalValue(start);
    },
  );
  const [widgetScenarioCompareTo, setWidgetScenarioCompareTo] = React.useState(
    () => toDateTimeLocalValue(new Date()),
  );
  const [viewWidgets, setViewWidgets] = React.useState<ViewWidget[]>([]);
  const [loadingScenarios, setLoadingScenarios] = React.useState(false);
  const selectedView = viewOptions.find((option) => option.value === chart);
  const selectedScenarioNames = selectedScenarioIds
    .map((id) => scenarios.find((scenario) => scenario.id === id)?.name)
    .filter(Boolean);
  const scenarioSelectionSummary =
    scenarioSelectionMode === "all"
      ? "Todos os cenários"
      : selectedScenarioNames.length
        ? `${selectedScenarioNames.length} cenário(s)`
        : "Nenhum cenário";
  const scenarioCompareSummary = `${scenarioCompareGranularityLabel(
    scenarioCompareGranularity,
  )} · ${scenarioComparePeriodLabel(scenarioComparePeriod)} · ${scenarioSelectionSummary}`;
  const selectedWidgetView = viewOptions.find(
    (option) => option.value === widgetChart,
  );
  const widgetSelectedScenarioNames = widgetSelectedScenarioIds
    .map((id) => scenarios.find((scenario) => scenario.id === id)?.name)
    .filter(Boolean);
  const widgetScenarioSelectionSummary =
    widgetScenarioSelectionMode === "all"
      ? "Todos os cenários"
      : widgetSelectedScenarioNames.length
        ? `${widgetSelectedScenarioNames.length} cenário(s)`
        : "Nenhum cenário";
  const widgetScenarioCompareSummary = `${scenarioCompareGranularityLabel(
    widgetScenarioCompareGranularity,
  )} · ${scenarioComparePeriodLabel(
    widgetScenarioComparePeriod,
  )} · ${widgetScenarioSelectionSummary}`;
  const masterScope = getStoredMasterCompanyScope();
  const generatedUrl = React.useMemo(() => {
    if (!origin) return "";

    const params = new URLSearchParams({
      chart,
      refresh: "5",
    });
    if (title.trim()) params.set("title", title.trim());
    if (companyScopeId) {
      params.set("company_id", companyScopeId);
    }

    if (viewWidgets.length) {
      params.set(
        "widgets",
        JSON.stringify(
          viewWidgets.map((widget) => ({
            chart: widget.chart,
            from:
              widget.chart === "scenario-hour" &&
              widget.period === "custom" &&
              widget.from
                ? widget.from
                : undefined,
            granularity:
              widget.chart === "scenario-hour" ? widget.granularity : undefined,
            period: widget.chart === "scenario-hour" ? widget.period : undefined,
            scenario_ids:
              widget.chart === "scenario-hour" &&
              widget.selectionMode === "custom"
                ? widget.scenarioIds.length
                  ? widget.scenarioIds
                  : ["__none"]
                : undefined,
            title: widget.title,
            to:
              widget.chart === "scenario-hour" &&
              widget.period === "custom" &&
              widget.to
                ? widget.to
                : undefined,
          })),
        ),
      );
    } else if (chart === "scenario-hour") {
      params.set("granularity", scenarioCompareGranularity);
      params.set("period", scenarioComparePeriod);
      if (scenarioSelectionMode === "custom") {
        params.set("scenario_ids", selectedScenarioIds.join(",") || "__none");
      }
      if (scenarioComparePeriod === "custom") {
        const from = parseLocalDateTimeInput(scenarioCompareFrom);
        const to = parseLocalDateTimeInput(scenarioCompareTo);
        if (from) params.set("from", from.toISOString());
        if (to) params.set("to", to.toISOString());
      }
    }

    return `${origin}/views/live?${params.toString()}`;
  }, [
    chart,
    companyScopeId,
    origin,
    scenarioCompareFrom,
    scenarioCompareGranularity,
    scenarioComparePeriod,
    scenarioCompareTo,
    scenarioSelectionMode,
    selectedScenarioIds,
    title,
    viewWidgets,
  ]);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    if (chart !== "scenario-hour") setScenarioSettingsOpen(false);
  }, [chart]);

  React.useEffect(() => {
    if (widgetChart !== "scenario-hour") setWidgetScenarioSettingsOpen(false);
  }, [widgetChart]);

  React.useEffect(() => {
    async function loadScenarios() {
      setLoadingScenarios(true);
      try {
        const rows = await apiFetch<Scenario[]>("/scenarios", {
          headers: companyScopeId
            ? ({ "X-Company-ID": companyScopeId } satisfies HeadersInit)
            : undefined,
        });
        const scopedRows = filterScopedApiRows(rows, companyScopeId);
        setScenarios(scopedRows);
        setSelectedScenarioIds((current) =>
          current.filter((id) => scopedRows.some((scenario) => scenario.id === id)),
        );
        setWidgetSelectedScenarioIds((current) =>
          current.filter((id) =>
            scopedRows.some((scenario) => scenario.id === id),
          ),
        );
      } catch {
        setScenarios([]);
        setWidgetSelectedScenarioIds([]);
      } finally {
        setLoadingScenarios(false);
      }
    }

    loadScenarios();
  }, [companyScopeId]);

  function updateChart(value: ViewChart) {
    setChart(value);
    const nextView = viewOptions.find((option) => option.value === value);
    if (nextView) setTitle(nextView.label);
  }

  function addWidget() {
    if (
      widgetChart === "scenario-hour" &&
      widgetScenarioSelectionMode === "custom" &&
      !widgetSelectedScenarioIds.length
    ) {
      toast.error("Selecione ao menos um cenário para adicionar este widget.");
      return;
    }

    const customFrom = parseLocalDateTimeInput(widgetScenarioCompareFrom);
    const customTo = parseLocalDateTimeInput(widgetScenarioCompareTo);
    if (
      widgetChart === "scenario-hour" &&
      widgetScenarioComparePeriod === "custom" &&
      (!customFrom || !customTo || customFrom >= customTo)
    ) {
      toast.error("Informe um intervalo personalizado válido.");
      return;
    }

    const titleFallback =
      widgetChart === "scenario-hour"
        ? widgetScenarioSelectionMode === "custom" &&
          widgetSelectedScenarioNames.length === 1
          ? `${widgetSelectedScenarioNames[0]} - ${scenarioCompareGranularityLabel(
              widgetScenarioCompareGranularity,
            )}`
          : "Cenários por período"
        : selectedWidgetView?.label ?? "Widget";
    setViewWidgets((current) => [
      ...current,
      {
        chart: widgetChart,
        from:
          widgetChart === "scenario-hour" &&
          widgetScenarioComparePeriod === "custom"
            ? customFrom?.toISOString()
            : undefined,
        granularity:
          widgetChart === "scenario-hour"
            ? widgetScenarioCompareGranularity
            : undefined,
        id: createWidgetId(),
        period:
          widgetChart === "scenario-hour"
            ? widgetScenarioComparePeriod
            : undefined,
        scenarioIds:
          widgetChart === "scenario-hour" ? widgetSelectedScenarioIds : [],
        selectionMode:
          widgetChart === "scenario-hour"
            ? widgetScenarioSelectionMode
            : "all",
        title: widgetTitle.trim() || titleFallback,
        to:
          widgetChart === "scenario-hour" &&
          widgetScenarioComparePeriod === "custom"
            ? customTo?.toISOString()
            : undefined,
      },
    ]);
    setWidgetTitle("");
  }

  function removeWidget(widgetId: string) {
    setViewWidgets((current) =>
      current.filter((widget) => widget.id !== widgetId),
    );
  }

  async function copyUrl() {
    if (!generatedUrl) return;

    try {
      await navigator.clipboard.writeText(generatedUrl);
      toast.success("URL copiada.");
    } catch {
      toast.error("Não foi possível copiar a URL.");
    }
  }

  function openUrl() {
    if (!generatedUrl) return;
    window.open(generatedUrl, "_blank", "noopener,noreferrer");
  }

  if (!canAccessViews) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sem acesso a Visões</CardTitle>
          <CardDescription>
            Seu usuário não possui permissão para configurar URLs de visões.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorUp className="h-4 w-4 text-primary" />
              Gerador de visão
            </CardTitle>
            <CardDescription>
              Configure uma URL autenticada para exibir somente o gráfico em tela
              inteira do conteúdo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Visão">
                <Select
                  value={chart}
                  onValueChange={(value) =>
                    updateChart(value as ViewChart)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {viewOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Título da visão">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={selectedView?.label}
                />
              </FormField>
            </div>

            {chart === "scenario-hour" ? (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      Comparação de cenários
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {scenarioCompareSummary}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={scenarioSettingsOpen ? "default" : "outline"}
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setScenarioSettingsOpen((current) => !current)
                    }
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {scenarioSettingsOpen ? "Ocultar" : "Configurar"}
                  </Button>
                </div>

                {scenarioSettingsOpen ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <FormField label="Granularidade">
                      <Select
                        value={scenarioCompareGranularity}
                        onValueChange={(value) =>
                          setScenarioCompareGranularity(
                            value as ScenarioCompareGranularity,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {scenarioCompareGranularityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>

                    <FormField label="Período">
                      <Select
                        value={scenarioComparePeriod}
                        onValueChange={(value) =>
                          setScenarioComparePeriod(
                            value as ScenarioComparePeriod,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {scenarioComparePeriodOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>

                    <div className="md:col-span-3">
                      <ScenarioPicker
                        loading={loadingScenarios}
                        mode={scenarioSelectionMode}
                        onModeChange={setScenarioSelectionMode}
                        onSelectedIdsChange={setSelectedScenarioIds}
                        scenarios={scenarios}
                        selectedIds={selectedScenarioIds}
                      />
                    </div>

                    {scenarioComparePeriod === "custom" ? (
                      <>
                        <FormField label="De">
                          <Input
                            type="datetime-local"
                            value={scenarioCompareFrom}
                            onChange={(event) =>
                              setScenarioCompareFrom(event.target.value)
                            }
                          />
                        </FormField>
                        <FormField label="Até">
                          <Input
                            type="datetime-local"
                            value={scenarioCompareTo}
                            onChange={(event) =>
                              setScenarioCompareTo(event.target.value)
                            }
                          />
                        </FormField>
                      </>
                    ) : null}

                    <div className="flex justify-end md:col-span-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setScenarioSettingsOpen(false)}
                      >
                        Concluir
                      </Button>
                    </div>
                  </div>
                ) : null}

              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {chart === "scenario-hour" ? null : (
                <FormField label="Cenário">
                  <Input readOnly value="Não se aplica a este gráfico" />
                </FormField>
              )}

              <FormField label="Atualização automática">
                <Select value="5" onValueChange={() => undefined}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 segundos</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Widgets da visão</div>
                  <div className="text-xs text-muted-foreground">
                    Combine gráficos de cenários diferentes na mesma URL.
                  </div>
                </div>
                {viewWidgets.length ? (
                  <Badge variant="outline">{viewWidgets.length} widgets</Badge>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Gráfico do widget">
                  <Select
                    value={widgetChart}
                    onValueChange={(value) => setWidgetChart(value as ViewChart)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {viewOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Título do widget">
                  <Input
                    value={widgetTitle}
                    onChange={(event) => setWidgetTitle(event.target.value)}
                    placeholder={
                      widgetChart === "scenario-hour"
                        ? "Cenários por período"
                        : selectedWidgetView?.label
                    }
                  />
                </FormField>
              </div>

              {widgetChart === "scenario-hour" ? (
                <div className="mt-3 rounded-md border bg-background p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        Comparação do widget
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {widgetScenarioCompareSummary}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={
                        widgetScenarioSettingsOpen ? "default" : "outline"
                      }
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        setWidgetScenarioSettingsOpen((current) => !current)
                      }
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      {widgetScenarioSettingsOpen ? "Ocultar" : "Configurar"}
                    </Button>
                  </div>

                  {widgetScenarioSettingsOpen ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormField label="Granularidade">
                        <Select
                          value={widgetScenarioCompareGranularity}
                          onValueChange={(value) =>
                            setWidgetScenarioCompareGranularity(
                              value as ScenarioCompareGranularity,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {scenarioCompareGranularityOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Período">
                        <Select
                          value={widgetScenarioComparePeriod}
                          onValueChange={(value) =>
                            setWidgetScenarioComparePeriod(
                              value as ScenarioComparePeriod,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {scenarioComparePeriodOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>

                      <div className="md:col-span-2">
                        <ScenarioPicker
                          loading={loadingScenarios}
                          mode={widgetScenarioSelectionMode}
                          onModeChange={setWidgetScenarioSelectionMode}
                          onSelectedIdsChange={setWidgetSelectedScenarioIds}
                          scenarios={scenarios}
                          selectedIds={widgetSelectedScenarioIds}
                        />
                      </div>

                      {widgetScenarioComparePeriod === "custom" ? (
                        <>
                          <FormField label="De">
                            <Input
                              type="datetime-local"
                              value={widgetScenarioCompareFrom}
                              onChange={(event) =>
                                setWidgetScenarioCompareFrom(event.target.value)
                              }
                            />
                          </FormField>
                          <FormField label="Até">
                            <Input
                              type="datetime-local"
                              value={widgetScenarioCompareTo}
                              onChange={(event) =>
                                setWidgetScenarioCompareTo(event.target.value)
                              }
                            />
                          </FormField>
                        </>
                      ) : null}

                      <div className="flex justify-end md:col-span-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setWidgetScenarioSettingsOpen(false)}
                        >
                          Concluir
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addWidget}
                    disabled={
                      widgetChart === "scenario-hour" &&
                      widgetScenarioSelectionMode === "custom" &&
                      !widgetSelectedScenarioIds.length
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar widget
                  </Button>
              </div>

              {viewWidgets.length ? (
                <div className="mt-3 space-y-2">
                  {viewWidgets.map((widget) => {
                    const widgetView = viewOptions.find(
                      (option) => option.value === widget.chart,
                    );

                    return (
                      <div
                        key={widget.id}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {widget.title}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {widget.chart === "scenario-hour"
                              ? viewWidgetComparisonSummary(widget, scenarios)
                              : widgetView?.label ?? widget.chart}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeWidget(widget.id)}
                          aria-label={`Remover widget ${widget.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Empresa usada">
                <Input
                  readOnly
                  value={
                    masterScope?.name ||
                    user?.company_name ||
                    user?.company?.name ||
                    companyScopeId ||
                    "Empresa do login"
                  }
                />
              </FormField>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Autenticada</Badge>
                <Badge variant="outline">Sem sidebar</Badge>
                <Badge variant="outline">100vw x 100vh</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Essa URL usa a sessão do navegador. Se abrir sem login ativo, o
                sistema redireciona para o login antes de mostrar o gráfico.
              </p>
            </div>

            <FormField label="URL gerada">
              <Textarea
                readOnly
                className="min-h-[110px] font-mono text-xs"
                value={generatedUrl}
              />
            </FormField>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={copyUrl} disabled={!generatedUrl}>
                <Copy className="h-4 w-4" />
                Copiar URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openUrl}
                disabled={!generatedUrl}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir visão
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Resumo
            </CardTitle>
            <CardDescription>Parâmetros enviados na URL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow
              label="Gráfico"
              value={
                viewWidgets.length
                  ? "Composição de widgets"
                  : selectedView?.label ?? chart
              }
            />
            <SummaryRow
              label="Descrição"
              value={
                viewWidgets.length
                  ? "URL com múltiplos gráficos configurados."
                  : selectedView?.description ?? "Visão configurada."
              }
            />
            <SummaryRow
              label="Atualização"
              value="A cada 5 segundos"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            />
            {viewWidgets.length ? (
              <SummaryRow
                label="Widgets"
                value={String(viewWidgets.length)}
              />
            ) : chart === "scenario-hour" ? (
              <SummaryRow
                label="Cenários"
                value={
                  scenarioSelectionMode === "all"
                    ? "Todos"
                    : selectedScenarioNames.length
                      ? `${selectedScenarioNames.length} cenário(s) selecionado(s)`
                      : "Nenhum cenário selecionado"
                }
              />
            ) : null}
            {chart === "scenario-hour" && !viewWidgets.length ? (
              <SummaryRow
                label="Período"
                value={`${scenarioCompareGranularityLabel(
                  scenarioCompareGranularity,
                )} · ${scenarioComparePeriodLabel(scenarioComparePeriod)}`}
              />
            ) : null}
            <SummaryRow
              label="company_id"
              value={companyScopeId || "Empresa do usuário logado"}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

function createWidgetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `view-widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseLocalDateTimeInput(value: string) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scenarioCompareGranularityLabel(value: ScenarioCompareGranularity) {
  return (
    scenarioCompareGranularityOptions.find((option) => option.value === value)
      ?.label ?? "Hora a hora"
  );
}

function scenarioComparePeriodLabel(value: ScenarioComparePeriod) {
  return (
    scenarioComparePeriodOptions.find((option) => option.value === value)?.label ??
    "Hoje"
  );
}

function viewWidgetComparisonSummary(
  widget: ViewWidget,
  scenarios: Scenario[],
) {
  const selection =
    widget.selectionMode === "all"
      ? "Todos os cenários"
      : widget.scenarioIds
          .map((id) => scenarios.find((scenario) => scenario.id === id)?.name)
          .filter(Boolean).length === 1
        ? scenarios.find((scenario) => scenario.id === widget.scenarioIds[0])
            ?.name ?? "1 cenário"
        : `${widget.scenarioIds.length} cenários`;

  return `${scenarioCompareGranularityLabel(
    widget.granularity ?? "hour",
  )} · ${scenarioComparePeriodLabel(widget.period ?? "today")} · ${selection}`;
}
